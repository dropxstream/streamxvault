/**
 * auth-2fa.js - Two-Factor Authentication (RFC 6238 TOTP) Engine
 * Protects admin login when repository / source code is public.
 * Zero external npm dependencies (uses native Node.js crypto).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// RFC 4648 Base32 alphabet for TOTP
const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const CONFIG_FILE = path.join(__dirname, 'data', 'auth_2fa.json');

// In-memory sessions awaiting 2FA code verification (valid for 5 mins)
const preAuthSessions = new Map();

// Rate limiting for login & 2FA attempts: IP -> { attempts, lockedUntil }
const loginRateLimits = new Map();

/**
 * Decode Base32 string to Buffer
 */
function base32Decode(str) {
  str = String(str || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let val = 0;
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const idx = B32_CHARS.indexOf(str[i]);
    if (idx === -1) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Encode Buffer to Base32 string
 */
function base32Encode(buffer) {
  let bits = 0;
  let val = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    val = (val << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += B32_CHARS[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += B32_CHARS[(val << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Generate a cryptographically secure Base32 secret for TOTP
 */
function generateSecret(bytesLength = 20) {
  return base32Encode(crypto.randomBytes(bytesLength));
}

/**
 * Format secret into user-friendly 4-character chunks
 */
function formatSecret(secret) {
  const clean = String(secret || '').replace(/\s+/g, '').toUpperCase();
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

/**
 * Generate one-time recovery backup codes (e.g. 8 codes formatted as XXXX-XXXX)
 */
function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(raw.slice(0, 4) + '-' + raw.slice(4));
  }
  return codes;
}

/**
 * Generate RFC 6238 TOTP 6-digit code for a given timestamp
 */
function generateTOTP(secret, timeStep = 30, forTime = Date.now()) {
  const key = base32Decode(secret);
  const epoch = Math.floor(forTime / 1000);
  const counter = Math.floor(epoch / timeStep);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return { code: code.toString().padStart(6, '0'), step: counter };
}

/**
 * Verify a 6-digit TOTP code with time-window drift and replay protection
 */
function verifyTOTP(secret, inputCode, lastUsedStep = 0, window = 1, timeStep = 30) {
  const cleanCode = String(inputCode || '').replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return { valid: false };

  const now = Date.now();
  for (let w = -window; w <= window; w++) {
    const t = now + (w * timeStep * 1000);
    const { code, step } = generateTOTP(secret, timeStep, t);
    if (code === cleanCode) {
      if (lastUsedStep && step <= lastUsedStep) {
        return { valid: false, replayed: true };
      }
      return { valid: true, step };
    }
  }
  return { valid: false };
}

/**
 * Build standard otpauth URI for Google Authenticator / Authy QR code scanning
 */
function getOtpauthUri(secret, username = 'admin', issuer = 'StreamXvault') {
  const cleanSecret = String(secret || '').replace(/\s+/g, '').toUpperCase();
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${cleanSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Load 2FA Configuration from disk or environment variables
 */
function load2FAConfig() {
  const defaults = {
    enabled: false,
    secret: '',
    backupCodes: [],
    configuredAt: null,
    lastUsedStep: 0
  };

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return Object.assign(defaults, data);
    }
  } catch (err) {
    console.error('[2FA] Error reading 2FA config:', err.message);
  }

  // If env variable is present, default to enabled using env secret
  if (process.env.ADMIN_2FA_SECRET) {
    defaults.enabled = true;
    defaults.secret = process.env.ADMIN_2FA_SECRET.trim().toUpperCase();
    defaults.configuredAt = 'env';
  }

  return defaults;
}

/**
 * Save 2FA Configuration securely to data/auth_2fa.json
 */
function save2FAConfig(config) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[2FA] Error writing 2FA config:', err.message);
    return false;
  }
}

/**
 * Verify either 6-digit TOTP code OR one-time backup recovery code
 */
function verifyCodeOrBackup(config, inputCode) {
  const clean = String(inputCode || '').trim().toUpperCase();

  // Try TOTP code first
  const totpRes = verifyTOTP(config.secret, clean, config.lastUsedStep);
  if (totpRes.valid) {
    config.lastUsedStep = totpRes.step;
    save2FAConfig(config);
    return { valid: true, type: 'totp' };
  }
  if (totpRes.replayed) {
    return { valid: false, replayed: true };
  }

  // Try Backup Recovery Codes (e.g. XXXX-XXXX or XXXXXXXX)
  const normInput = clean.replace(/[^A-Z0-9]/g, '');
  if (Array.isArray(config.backupCodes)) {
    for (let i = 0; i < config.backupCodes.length; i++) {
      const item = config.backupCodes[i];
      const codeStr = (typeof item === 'string' ? item : item.code || '').replace(/[^A-Z0-9]/g, '');
      const isUsed = typeof item === 'object' ? item.used : false;
      if (!isUsed && codeStr === normInput) {
        if (typeof item === 'object') {
          item.used = true;
          item.usedAt = new Date().toISOString();
        } else {
          config.backupCodes[i] = { code: item, used: true, usedAt: new Date().toISOString() };
        }
        save2FAConfig(config);
        return { valid: true, type: 'backup' };
      }
    }
  }

  return { valid: false };
}

/**
 * Pre-Auth Session Management (bridge between password check and 2FA verify)
 */
function createPreAuthSession(username) {
  // Purge expired sessions
  const now = Date.now();
  for (const [token, sess] of preAuthSessions.entries()) {
    if (sess.expiresAt < now) preAuthSessions.delete(token);
  }

  const token = crypto.randomBytes(32).toString('hex');
  preAuthSessions.set(token, {
    username,
    createdAt: now,
    expiresAt: now + (5 * 60 * 1000), // 5 minutes
    attempts: 0
  });
  return token;
}

function getPreAuthSession(token) {
  if (!token) return null;
  const sess = preAuthSessions.get(token);
  if (!sess) return null;
  if (sess.expiresAt < Date.now()) {
    preAuthSessions.delete(token);
    return null;
  }
  return sess;
}

function consumePreAuthSession(token) {
  preAuthSessions.delete(token);
}

/**
 * Rate Limiting to prevent brute-force attacks on login & 2FA
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginRateLimits.get(ip);
  if (!entry) return { allowed: true };

  if (entry.lockedUntil && entry.lockedUntil > now) {
    const waitMins = Math.ceil((entry.lockedUntil - now) / 60000);
    return { allowed: false, waitMins };
  }

  if (entry.lockedUntil && entry.lockedUntil <= now) {
    loginRateLimits.delete(ip);
  }
  return { allowed: true };
}

function recordFailedLogin(ip) {
  const now = Date.now();
  let entry = loginRateLimits.get(ip) || { attempts: 0, lockedUntil: 0 };
  entry.attempts++;
  if (entry.attempts >= 5) {
    entry.lockedUntil = now + (15 * 60 * 1000); // 15-minute lockout after 5 fails
  }
  loginRateLimits.set(ip, entry);
}

function resetLoginRateLimit(ip) {
  loginRateLimits.delete(ip);
}

module.exports = {
  base32Encode,
  base32Decode,
  generateSecret,
  formatSecret,
  generateBackupCodes,
  generateTOTP,
  verifyTOTP,
  getOtpauthUri,
  load2FAConfig,
  save2FAConfig,
  verifyCodeOrBackup,
  createPreAuthSession,
  getPreAuthSession,
  consumePreAuthSession,
  checkRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  CONFIG_FILE
};
