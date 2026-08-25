const express = require('express');
const multer = require('multer');
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // Small limit for metadata-only multipart forms
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const storage = require('./storage').createStorage(); // Fix: Actually create the storage instance
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'manoj720';
const JWT_SECRET = process.env.JWT_SECRET || 'streamxvault_secret_key_123';

// ==================== EMAIL RESEND API CONFIGURATION ====================
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

if (RESEND_API_KEY) {
  console.log('📧 Resend Email API client configured successfully');
} else {
  console.log('⚠️ RESEND_API_KEY not set. Emails will be logged locally in simulation mode.');
}

async function sendMail({ to, subject, text, html }) {
  if (!RESEND_API_KEY) {
    console.log(`\n✉️  [SIMULATED EMAIL - NO API KEY]\nTo: ${to}\nSubject: ${subject}\nText:\n${text}\n--------------------\n`);
    return true;
  }
  try {
    const from = process.env.SMTP_FROM || 'StreamXvault <onboarding@resend.dev>';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html
      })
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log(`✉️  [EMAIL SENT VIA RESEND] Sent successfully to ${to} (ID: ${data.id})`);
      return true;
    } else {
      const errData = await res.json().catch(() => ({}));
      console.error(`❌ [RESEND API ERROR] Failed to send email to ${to}:`, errData.message || res.statusText || JSON.stringify(errData));
      return false;
    }
  } catch (err) {
    console.error(`❌ [RESEND SYSTEM ERROR] Failed to send email to ${to}:`, err.message);
    return false;
  }
}

const DATA_FILE = path.join(__dirname, 'data', 'videos.json');
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');
const DB_KEY = '_database/videos.json'; // Permanently locked to recovered path
const STATS_KEY = '_database/stats.json'; // Permanently locked to recovered path
const VOD_RULES_FILE = path.join(__dirname, 'data', 'vod_rules.json');
const VOD_REQUESTS_FILE = path.join(__dirname, 'data', 'vod_requests.json');
const VOD_RULES_KEY = '_database/vod_rules.json';
const VOD_REQUESTS_KEY = '_database/vod_requests.json';

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Global Bot Filtering Regex (Hardened)
const BOT_REGEX = /bot|crawler|spider|google|bing|yandex|baidu|slurp|duckduck|postman|headless|axios|python|curl|wget|lighthouse|semrush|ahrefs|dotbot|mj12bot|ia_archiver|monet|adsbot|pingdom/i;

function isRequestBot(req) {
  const ua = req.headers['user-agent'] || '';
  return BOT_REGEX.test(ua);
}

function loadVideos() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    return [];
  }
}

async function saveVideos(videos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(videos, null, 2));
  if (storage.mode === 'r2') {
    try {
      const jsonData = JSON.stringify(videos, null, 2);
      await storage.upload(DB_KEY, Buffer.from(jsonData), 'application/json');
    } catch (err) {
      console.error('❌ R2 DB backup failed:', err.message);
    }
  }
}

// ==================== SEO: IndexNow (Bing/DuckDuckGo) ====================
const INDEXNOW_KEY = '503e50ed1a9444b9a1a3abe5f872635f';
async function submitToIndexNow(vId) {
  if (!vId) return;
  const videoUrl = `https://streamxvault.online/watch?v=${vId}`;
  try {
    const response = await fetch('https://www.bing.com/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'streamxvault.online',
        key: INDEXNOW_KEY,
        keyLocation: `https://streamxvault.online/${INDEXNOW_KEY}.txt`,
        urlList: [videoUrl]
      })
    });
    if (response.ok) console.log(`🚀 IndexNow: ${videoUrl} pinged successfully.`);
  } catch (err) {
    console.error(`⚠️ IndexNow failed:`, err.message);
  }
}

function loadStats() {
  try { 
    if (!fs.existsSync(STATS_FILE)) return { totalVisitors: 0, uniqueIps: [] };
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); 
  }
  catch { return { totalVisitors: 0, uniqueIps: [] }; }
}

async function saveStats(stats) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  if (storage.mode === 'r2') {
    try {
      await storage.upload(STATS_KEY, Buffer.from(JSON.stringify(stats)), 'application/json');
    } catch (err) {
      console.error('❌ R2 Stats backup failed:', err.message);
    }
  }
}

function loadVodRules() {
  try { 
    if (!fs.existsSync(VOD_RULES_FILE)) return [];
    return JSON.parse(fs.readFileSync(VOD_RULES_FILE, 'utf-8')); 
  }
  catch { return []; }
}

async function saveVodRules(rules) {
  fs.writeFileSync(VOD_RULES_FILE, JSON.stringify(rules, null, 2));
  if (storage.mode === 'r2') {
    try { await storage.upload(VOD_RULES_KEY, Buffer.from(JSON.stringify(rules)), 'application/json'); } catch (err) {}
  }
}

function loadVodRequests() {
  try { 
    if (!fs.existsSync(VOD_REQUESTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(VOD_REQUESTS_FILE, 'utf-8')); 
  }
  catch { return []; }
}

async function saveVodRequests(requests) {
  fs.writeFileSync(VOD_REQUESTS_FILE, JSON.stringify(requests, null, 2));
  if (storage.mode === 'r2') {
    try { await storage.upload(VOD_REQUESTS_KEY, Buffer.from(JSON.stringify(requests)), 'application/json'); } catch (err) {}
  }
}

// Security Headers Middleware
// www → non-www redirect (fixes GSC "Page with redirect" for www variant)
app.use((req, res, next) => {
  if (req.hostname && req.hostname.startsWith('www.')) {
    return res.redirect(301, `https://streamxvault.online${req.originalUrl}`);
  }
  next();
});

app.use((req, res, next) => {
  // 1. Strict Transport Security (HSTS) with preload
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // 2. Click-jacking defense
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  // 3. MIME type sniffing defense
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // 4. Content Security Policy (Ad-compatible but secure — no wildcards)
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' cdn.plyr.io cdn.jsdelivr.net *.acscdn.com acscdn.com vjs.zencdn.net imasdk.googleapis.com cdnjs.cloudflare.com *.googlesyndication.com *.doubleclick.net 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' cdn.plyr.io fonts.googleapis.com vjs.zencdn.net cdnjs.cloudflare.com 'unsafe-inline'",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' https: data: blob:",
    "frame-src 'self' https:",
    "media-src 'self' https: blob:",
    "connect-src 'self' https:",
  ].join('; '));
  
  // 5. XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // 6. Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  
  // 7. Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
});

// CORS Middleware for API routes
app.use('/api', (req, res, next) => {
  const allowedOrigin = 'https://streamxvault.online';
  const origin = req.headers.origin;
  if (origin === allowedOrigin || !origin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Track visitors middleware
app.use((req, res, next) => {
  // Ignore API calls, static files
  if (req.path.startsWith('/api') || req.path.includes('.')) return next();
  
  // Ignore Bots & Crawlers
  if (isRequestBot(req)) return next();

  // Ignore Admin visits (via token, query, or cookie)
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token || req.headers.cookie?.match(/sxv_token=([^;]+)/)?.[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.isAdmin) return next();
    } catch (e) {}
  }
  
  const stats = loadStats();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  if (!stats.uniqueIps.includes(ip)) {
    stats.uniqueIps.push(ip);
    stats.totalVisitors = stats.uniqueIps.length;
    saveStats(stats);
  }
  next();
});

// API: Dashboard Stats
app.get('/api/stats', requireAdmin, (req, res) => {
  const videos = loadVideos();
  const stats = loadStats();
  
  const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
  const totalLikes = videos.reduce((sum, v) => sum + (v.likes || 0), 0);
  const publishedVideos = videos.filter(v => v.published !== false).length;

  res.json({
    totalVideos: videos.length,
    publishedVideos,
    totalViews,
    totalLikes,
    totalVisitors: stats.totalVisitors || 0
  });
});

app.get('/api/admin/r2-test', requireAdmin, async (req, res) => {
  if (storage.mode !== 'r2') {
    return res.json({ status: 'error', message: 'Storage mode is not R2. Current mode: ' + storage.mode + '. ENV STORAGE_MODE: ' + process.env.STORAGE_MODE });
  }
  try {
    const { ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
    const listCmd = new ListObjectsV2Command({ Bucket: storage.bucketName });
    const response = await storage.client.send(listCmd);
    const keys = (response.Contents || []).map(o => o.Key);
    
    let downloadTest = 'Skipped';
    if (keys.length > 0) {
      const getCmd = new GetObjectCommand({ Bucket: storage.bucketName, Key: keys[0] });
      const getResp = await storage.client.send(getCmd);
      downloadTest = 'Success! Body type: ' + (typeof getResp.Body) + ', stream: ' + (typeof getResp.Body?.on);
    }
    
    res.json({ 
      status: 'success', 
      bucket: storage.bucketName,
      keysFound: keys.length,
      sampleKeys: keys.slice(0, 5),
      downloadTest
    });
  } catch (err) {
    res.json({ 
      status: 'error', 
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack
    });
  }
});


// Server-side protected admin route
app.get(['/admin', '/admin.html'], (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token || req.headers.cookie?.match(/sxv_token=([^;]+)/)?.[1];
  let isAdmin = false;
  if (token) {
    try { isAdmin = !!jwt.verify(token, JWT_SECRET).isAdmin; } catch (e) {}
  }
  if (isAdmin) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }
  // Serve minimal login page to unauthenticated users
  res.send(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Login — StreamXvault</title>
    <link rel="stylesheet" href="/css/style.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap">
    <link rel="icon" type="image/png" href="/favicon.png">
  </head><body>
    <nav class="navbar"><a href="/" class="nav-brand"><img src="/images/logo.png" alt="StreamXvault Logo" class="brand-logo" width="40" height="40">StreamXvault</a></nav>
    <main class="main-content"><div class="admin-login" id="login-screen">
      <div class="login-card animate-slide-up">
        <div class="login-icon">🔐</div><h2>Admin Access</h2>
        <p class="login-subtitle">Enter your password to manage content</p>
        <form id="login-form">
          <div class="form-group"><label for="admin-password">Password</label>
            <input type="password" id="admin-password" placeholder="Enter admin password" required autocomplete="current-password">
            <div class="form-error" id="login-error">Invalid password. Try again.</div>
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">🔓 Login</button>
        </form>
      </div>
    </div></main>
    <div class="toast-container" id="toast-container"></div>
    <script>
      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('admin-password').value;
        try {
          const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:pw}) });
          const data = await res.json();
          if (res.ok && data.token) { localStorage.setItem('streamxvault_token', data.token); window.location.href = '/admin'; }
          else { document.getElementById('login-error').classList.add('visible'); document.getElementById('admin-password').value=''; setTimeout(()=>document.getElementById('login-error').classList.remove('visible'),3000); }
        } catch(err) { alert('Login failed'); }
      });
    </script>
  </body></html>`);
});

// ==================== SEO & SITEMAP ====================

// Helper: Normalize and Escape HTML for meta tags
function escapeMeta(text) {
  if (!text) return '';
  // Normalize smart quotes and dashes to prevent UTF-8 mojibake in scrapers
  let normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-');
  return normalized.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// Helper: Escape for JSON-LD scripts
function escapeJsonStr(text) {
  if (!text) return '';
  let normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-');
  return normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
}



// Robots.txt
app.get('/robots.txt', (req, res) => {
  const baseUrl = `https://${req.get('host')}`;
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nAllow: /api/videos/\nAllow: /api/embed/\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml`);
});

// Dynamic SEO for Watch Page
app.get('/watch', (req, res) => {
  const vId = req.query.v;
  const indexPath = path.join(__dirname, 'public', 'watch.html');

  if (!fs.existsSync(indexPath)) return res.status(404).send('Page not found');

  const videos = loadVideos();
  const video = videos.find(v => v.id === vId);

  // If video not found, return a real 404 (prevents Google Soft 404)
  if (!video) {
    const notFoundPath = path.join(__dirname, 'public', '404.html');
    if (fs.existsSync(notFoundPath)) {
      return res.status(404).sendFile(notFoundPath);
    }
    return res.status(404).send('<h1>Video not found</h1><p><a href="/">Back to home</a></p>');
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  // Set precise charset to prevent Bing encoding errors
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // Base Metadata
  const baseUrl = `https://${req.get('host')}`;
  const url = `${baseUrl}/watch?v=${vId}`;

  const rawTitle = `${video.title} - Watch on StreamXvault`;
  const rawDesc = video.shortDescription || video.description || `Watch ${video.title} on StreamXvault. High quality streaming content.`;
  const thumb = video.thumbnailUrl || `${baseUrl}/images/logo.png`;

  const title = escapeMeta(rawTitle);
  const fullDesc = escapeMeta(rawDesc);
  let seoDesc = fullDesc;

  if (seoDesc.length > 155) {
    let cutoff = seoDesc.substring(0, 152);
    let lastSpace = cutoff.lastIndexOf(' ');
    if (lastSpace > 100) cutoff = cutoff.substring(0, lastSpace);
    seoDesc = cutoff + '...';
  }

  // Pure JSON strings (no HTML entities)
  const jsonTitle = escapeJsonStr(rawTitle);
  const jsonDesc = escapeJsonStr(rawDesc);

  // Helper: format view count
  function formatViewCount(n) {
    if (!n) return '0 views';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M views';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K views';
    return n + ' views';
  }

  // Helper: format date for display
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // 1. Inject Standard Meta Tags
  html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
  html = html.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${seoDesc}">`);

  // 2. SSR Body Content — inject REAL data instead of JS placeholders
  // This is the key fix for Soft 404: Google must see substantive content in the initial HTML
  html = html.replace(/<h1 id="video-title">.*?<\/h1>/, `<h1 id="video-title">${title}</h1>`);

  // SSR inject views and date (replacing placeholder dashes)
  const ssrViews = formatViewCount(video.views || 0);
  const ssrDate = formatDate(video.uploadedAt);
  html = html.replace(/<span id="video-views">.*?<\/span>/, `<span id="video-views">${ssrViews}</span>`);
  html = html.replace(/<span id="video-date">.*?<\/span>/, `<span id="video-date">${ssrDate}</span>`);

  // SSR inject like count
  html = html.replace(/<span id="like-count">.*?<\/span>/, `<span id="like-count">${video.likes || 0}</span>`);

  // SSR inject description with genre badge
  const genreBadge = video.genre ? `<span style="display:inline-block; font-size: 0.7rem; background: var(--accent-gradient-pink); color: white; padding: 2px 8px; border-radius: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">${escapeMeta(video.genre)}</span><br>` : '';
  html = html.replace(/<div class="video-description" id="video-description">.*?<\/div>/, `<div class="video-description" id="video-description">${genreBadge}${fullDesc}</div>`);

  // SSR inject thumbnail as background on the player placeholder so Google sees an image
  if (thumb) {
    html = html.replace('Loading player...</div>', `Loading player...</div><img src="${thumb}" alt="${escapeMeta(video.title)}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0.4;" loading="eager">`);
  }

  // 3. Inject Advanced SEO (Canonical / Schema / OG / Rating)
  const headEnd = '</head>';
  const seoTags = `
  <meta name="rating" content="adult">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="video.other">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${seoDesc}">
  <meta property="og:image" content="${thumb}">
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:title" content="${title}">
  <meta property="twitter:description" content="${seoDesc}">
  <meta property="twitter:image" content="${thumb}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": "${jsonTitle}",
    "description": "${jsonDesc}",
    "thumbnailUrl": ["${thumb}"],
    "uploadDate": "${video.uploadedAt || new Date().toISOString()}",
    ${video.duration ? `"duration": "${video.duration}",` : ''}
    "embedUrl": "${baseUrl}/api/embed/${video.id}",
    "contentUrl": "${url}",
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": "https://schema.org/WatchAction",
      "userInteractionCount": ${video.views || 0}
    }
  }
  </script>
`;
  html = html.replace(headEnd, seoTags + headEnd);

  // 4. SSR-populate the "More Videos" grid (replaces empty div to prevent Soft 404)
  const otherVideos = videos.filter(v => v.id !== vId && v.published !== false).slice(0, 12);
  const ssrCards = otherVideos.map(v => {
    const vThumb = v.thumbnailUrl || `${baseUrl}/images/logo.png`;
    const vViews = v.views || 0;
    const vDate = v.uploadedAt ? new Date(v.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    return `<a href="/watch?v=${v.id}" class="video-card" aria-label="${escapeMeta(v.title)}"><div class="thumbnail"><img src="${vThumb}" alt="${escapeMeta(v.title)}" loading="lazy" width="320" height="180" style="width:100%;height:auto;object-fit:cover;border-radius:8px;aspect-ratio:16/9;"></div><div class="card-info"><div class="card-title">${escapeMeta(v.title)}</div>${v.genre ? `<span style="display:inline-block;font-size:0.65rem;background:var(--accent-gradient-pink);color:white;padding:1px 6px;border-radius:3px;margin-top:4px;text-transform:uppercase;font-weight:700;">${escapeMeta(v.genre)}</span>` : ''}<div class="card-meta"><span>${vViews} views</span><span>${vDate}</span></div></div></a>`;
  }).join('');
  html = html.replace('<div class="video-grid" id="related-grid"></div>', `<div class="video-grid" id="related-grid">${ssrCards}</div>`);

  res.send(html);
});

// Fix 'Accessible index page' SEO Duplicate Content Error
app.get(['/index.html', '/index.php'], (req, res) => {
  res.redirect(301, '/');
});

// Dynamic SEO for Home Page
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (!fs.existsSync(indexPath)) return res.status(404).send('Page not found');
  
  let html = fs.readFileSync(indexPath, 'utf8');
  const videos = loadVideos().filter(v => v.published !== false);
  
  if (videos.length > 0) {
    const latest = videos[0];
    const rawTitle = 'StreamXvault';
    const rawDesc = `StreamXvault - Watch ${latest.title} and ${videos.length - 1} other premium videos. Your ultimate streaming library.`;
    const seoDesc = escapeMeta(rawDesc);
    const jsonTitle = escapeJsonStr(rawTitle);
    const jsonDesc = escapeJsonStr(rawDesc);

    html = html.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${seoDesc}">`);
    
    // Inject Canonical and WebSite Schema
    const baseUrl = `https://${req.get('host')}`;
    const title = escapeMeta(rawTitle);
    const headEnd = '</head>';
    const homeSeo = `
  <link rel="canonical" href="${baseUrl}/">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${seoDesc}">
  <meta property="og:image" content="${baseUrl}/images/logo.png">
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:title" content="${title}">
  <meta property="twitter:description" content="${seoDesc}">
  <meta property="twitter:image" content="${baseUrl}/images/logo.png">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "${jsonTitle}",
    "url": "${baseUrl}/",
    "description": "${jsonDesc}",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "${baseUrl}/?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  }
  </script>
`;
    html = html.replace(headEnd, homeSeo + headEnd);

  }

  res.send(html);
});

// Protection removed for /js/admin.js as it contains login logic. API endpoints remain secured.

// Support for .html extensions and clean URLs
// Placed after dynamic routes so SEO injection works
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Trust proxy for production (correct IP detection)
app.set('trust proxy', 1);

// Helper: Require Admin
function requireAdmin(req, res, next) {
  const token = req.cookies?.sxv_token || req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'Admin login required.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.isAdmin) return next();
    res.status(401).json({ error: 'Permission denied.' });
  } catch {
    res.status(401).json({ error: 'Session expired.' });
  }
}

// ==================== API ROUTES ====================

// --- VOD API Routes ---
app.get('/api/vod/rules', (req, res) => {
  res.json(loadVodRules());
});

app.post('/api/vod/request', async (req, res) => {
  if (isRequestBot(req)) return res.json({ success: false });
  const { genre, company, actor, title, description, email } = req.body;
  if (!genre || !title || !actor || !email) return res.status(400).json({ error: 'Missing required fields' });
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email address' });

  const requests = loadVodRequests();
  const newRequest = {
    id: require('crypto').randomUUID(),
    genre,
    company: company || 'N/A',
    actor,
    title,
    description,
    email,
    status: 'Pending',
    createdAt: new Date().toISOString()
  };
  requests.push(newRequest);
  await saveVodRequests(requests);
  
  // Send Confirmation Email to User
  const emailHtml = `
    <div style="background-color: #0b0b14; color: #ffffff; font-family: 'Inter', Arial, sans-serif; padding: 2rem; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #1f1f2e;">
      <div style="text-align: center; margin-bottom: 2rem;">
        <h1 style="color: #a855f7; margin: 0; font-size: 1.8rem; letter-spacing: 1px;">StreamXvault</h1>
        <p style="color: #64748b; margin: 0.25rem 0 0; font-size: 0.9rem;">Video on Demand Request</p>
      </div>
      <div style="background-color: #131322; padding: 1.5rem; border-radius: 8px; border: 1px solid #232338; margin-bottom: 1.5rem;">
        <h2 style="color: #22d3ee; margin-top: 0; font-size: 1.2rem; border-bottom: 1px solid #232338; padding-bottom: 0.5rem;">Request Received 🚀</h2>
        <p style="font-size: 0.95rem; line-height: 1.5; color: #cbd5e1;">We have successfully received your video request! Here are the details:</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; color: #94a3b8; margin-top: 1rem;">
          <tr>
            <td style="padding: 0.5rem 0; font-weight: bold; width: 35%;">Category / Genre:</td>
            <td style="padding: 0.5rem 0; color: #f1f5f9;">${genre}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem 0; font-weight: bold;">Video Title:</td>
            <td style="padding: 0.5rem 0; color: #f1f5f9; font-weight: 600;">${title}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem 0; font-weight: bold;">Actor / Actress Name:</td>
            <td style="padding: 0.5rem 0; color: #f1f5f9;">${actor}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem 0; font-weight: bold; vertical-align: top;">Additional Details:</td>
            <td style="padding: 0.5rem 0; color: #f1f5f9; line-height: 1.4;">${description || '<em>None</em>'}</td>
          </tr>
        </table>
      </div>
      <p style="font-size: 0.85rem; color: #64748b; line-height: 1.5; text-align: center; margin-top: 2rem; border-top: 1px solid #1f1f2e; padding-top: 1rem;">
        Our admin team will review your request shortly. Once approved, you will receive another confirmation email.<br>
        © 2026 StreamXvault. All rights reserved.
      </p>
    </div>
  `;
  
  await sendMail({
    from: 'StreamXvault <onboarding@resend.dev>',
    to: email,
    subject: 'VOD Request Received — StreamXvault',
    text: `Hello,\n\nWe have successfully received your video request! Here is what you requested:\n\n- Genre: ${genre}\n- Video Title: ${title}\n- Model / Actor / Actress Name: ${actor}\n- Additional Details: ${description || 'None'}\n\nOur admin team will review it shortly. Once approved, you will receive another confirmation email.\n\nBest regards,\nThe StreamXvault Team`,
    html: emailHtml
  });

  res.json({ success: true, request: newRequest });
});

app.get('/api/admin/vod/rules', requireAdmin, (req, res) => {
  res.json(loadVodRules());
});

app.post('/api/admin/vod/rules', requireAdmin, async (req, res) => {
  const { rules } = req.body; // Expecting an array of strings
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'Rules must be an array' });
  await saveVodRules(rules);
  res.json({ success: true });
});

app.get('/api/admin/vod/requests', requireAdmin, (req, res) => {
  res.json(loadVodRequests().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.put('/api/admin/vod/requests/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const requests = loadVodRequests();
  const reqItem = requests.find(r => r.id === req.params.id);
  if (!reqItem) return res.status(404).json({ error: 'Not found' });
  
  const oldStatus = reqItem.status;
  reqItem.status = status;
  await saveVodRequests(requests);
  
  // Trigger automated approval email
  if (status === 'Approved' && oldStatus !== 'Approved' && reqItem.email) {
    const emailHtml = `
      <div style="background-color: #0b0b14; color: #ffffff; font-family: 'Inter', Arial, sans-serif; padding: 2rem; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #1f1f2e;">
        <div style="text-align: center; margin-bottom: 2rem;">
          <h1 style="color: #a855f7; margin: 0; font-size: 1.8rem; letter-spacing: 1px;">StreamXvault</h1>
          <p style="color: #64748b; margin: 0.25rem 0 0; font-size: 0.9rem;">Video on Demand Request</p>
        </div>
        <div style="background-color: #131322; padding: 1.5rem; border-radius: 8px; border: 1px solid #232338; margin-bottom: 1.5rem;">
          <h2 style="color: #4ade80; margin-top: 0; font-size: 1.2rem; border-bottom: 1px solid #232338; padding-bottom: 0.5rem;">Request Approved! 🎉</h2>
          <p style="font-size: 0.95rem; line-height: 1.5; color: #cbd5e1;">Great news! Your video request has been approved by the admin team:</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; color: #94a3b8; margin-top: 1rem;">
            <tr>
              <td style="padding: 0.5rem 0; font-weight: bold; width: 35%;">Category / Genre:</td>
              <td style="padding: 0.5rem 0; color: #f1f5f9;">${reqItem.genre}</td>
            </tr>
            <tr>
              <td style="padding: 0.5rem 0; font-weight: bold;">Video Title:</td>
               <td style="padding: 0.5rem 0; color: #f1f5f9; font-weight: 600;">${reqItem.title}</td>
            </tr>
            <tr>
              <td style="padding: 0.5rem 0; font-weight: bold;">Actor / Actress Name:</td>
              <td style="padding: 0.5rem 0; color: #f1f5f9;">${reqItem.actor}</td>
            </tr>
          </table>
          <p style="font-size: 0.95rem; line-height: 1.5; color: #cbd5e1; margin-top: 1.25rem;">We are preparing the video for upload now. You will receive a final confirmation email containing the watch link as soon as it is delivered and ready!</p>
        </div>
        <p style="font-size: 0.85rem; color: #64748b; line-height: 1.5; text-align: center; margin-top: 2rem; border-top: 1px solid #1f1f2e; padding-top: 1rem;">
          You'll receive an email as soon as the video is ready to watch.<br>
          © 2026 StreamXvault. All rights reserved.
        </p>
      </div>
    `;
    await sendMail({
      to: reqItem.email,
      subject: 'Your VOD Request has been Approved! — StreamXvault',
      text: `Hello,\n\nGreat news! Your video request has been approved by the admin team:\n\n- Video Title: ${reqItem.title}\n- Genre: ${reqItem.genre}\n- Model / Actor / Actress Name: ${reqItem.actor}\n\nWe are preparing the video for upload. We will notify you as soon as it is delivered and ready to watch!\n\nBest regards,\nThe StreamXvault Team`,
      html: emailHtml
    });
  }

  // Trigger automated rejection email
  if (status === 'Rejected' && oldStatus !== 'Rejected' && reqItem.email) {
    const rejectionHtml = `
      <div style="background-color: #0b0b14; color: #ffffff; font-family: 'Inter', Arial, sans-serif; padding: 2rem; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #1f1f2e;">
        <div style="text-align: center; margin-bottom: 2rem;">
          <h1 style="color: #a855f7; margin: 0; font-size: 1.8rem; letter-spacing: 1px;">StreamXvault</h1>
          <p style="color: #64748b; margin: 0.25rem 0 0; font-size: 0.9rem;">Video on Demand Request</p>
        </div>
        <div style="background-color: #131322; padding: 1.5rem; border-radius: 8px; border: 1px solid #232338; margin-bottom: 1.5rem;">
          <h2 style="color: #ef4444; margin-top: 0; font-size: 1.2rem; border-bottom: 1px solid #232338; padding-bottom: 0.5rem;">Request Not Approved ⚠️</h2>
          <p style="font-size: 0.95rem; line-height: 1.5; color: #cbd5e1;">Thank you for your video request. We regret to inform you that your request could not be approved at this time:</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; color: #94a3b8; margin-top: 1rem;">
            <tr>
              <td style="padding: 0.5rem 0; font-weight: bold; width: 35%;">Category / Genre:</td>
              <td style="padding: 0.5rem 0; color: #f1f5f9;">${reqItem.genre}</td>
            </tr>
            <tr>
              <td style="padding: 0.5rem 0; font-weight: bold;">Video Title:</td>
               <td style="padding: 0.5rem 0; color: #f1f5f9; font-weight: 600;">${reqItem.title}</td>
            </tr>
            <tr>
              <td style="padding: 0.5rem 0; font-weight: bold;">Actor / Actress Name:</td>
              <td style="padding: 0.5rem 0; color: #f1f5f9;">${reqItem.actor}</td>
            </tr>
          </table>
          <p style="font-size: 0.95rem; line-height: 1.5; color: #cbd5e1; margin-top: 1.25rem;">This can occur due to content licensing restrictions, lack of quality sources, or availability. You are welcome to submit another request in the future.</p>
        </div>
        <p style="font-size: 0.85rem; color: #64748b; line-height: 1.5; text-align: center; margin-top: 2rem; border-top: 1px solid #1f1f2e; padding-top: 1rem;">
          Thank you for your understanding.<br>
          © 2026 StreamXvault. All rights reserved.
        </p>
      </div>
    `;
    await sendMail({
      to: reqItem.email,
      subject: 'VOD Request Status Update — StreamXvault',
      text: `Hello,\n\nThank you for your video request. We regret to inform you that your request could not be approved at this time:\n\n- Video Title: ${reqItem.title}\n- Genre: ${reqItem.genre}\n- Model / Actor / Actress Name: ${reqItem.actor}\n\nThis can occur due to licensing or source availability restrictions. You are welcome to submit another request in the future.\n\nBest regards,\nThe StreamXvault Team`,
      html: rejectionHtml
    });
  }

  res.json({ success: true });
});

app.post('/api/admin/vod/requests/:id/notify', requireAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
  
  const requests = loadVodRequests();
  const reqItem = requests.find(r => r.id === req.params.id);
  if (!reqItem) return res.status(404).json({ error: 'Request not found' });
  if (!reqItem.email) return res.status(400).json({ error: 'Request has no associated email' });
  
  const emailHtml = `
    <div style="background-color: #0b0b14; color: #ffffff; font-family: 'Inter', Arial, sans-serif; padding: 2rem; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #1f1f2e;">
      <div style="text-align: center; margin-bottom: 2rem;">
        <h1 style="color: #a855f7; margin: 0; font-size: 1.8rem; letter-spacing: 1px;">StreamXvault</h1>
        <p style="color: #64748b; margin: 0.25rem 0 0; font-size: 0.9rem;">Update Regarding Your Request</p>
      </div>
      <div style="background-color: #131322; padding: 1.5rem; border-radius: 8px; border: 1px solid #232338; margin-bottom: 1.5rem;">
        <h2 style="color: #22d3ee; margin-top: 0; font-size: 1.2rem; border-bottom: 1px solid #232338; padding-bottom: 0.5rem;">Video Request Status Update 🔔</h2>
        <p style="font-size: 0.95rem; line-height: 1.6; color: #f1f5f9; white-space: pre-wrap; font-weight: 500;">${message.trim()}</p>
        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #232338; font-size: 0.85rem; color: #94a3b8;">
          <strong>Request Reference:</strong><br>
          Title: ${reqItem.title}<br>
          Genre: ${reqItem.genre}
        </div>
      </div>
      <p style="font-size: 0.85rem; color: #64748b; line-height: 1.5; text-align: center; margin-top: 2rem; border-top: 1px solid #1f1f2e; padding-top: 1rem;">
        This email was sent by the administrator regarding your request.<br>
        © 2026 StreamXvault. All rights reserved.
      </p>
    </div>
  `;
  
  const success = await sendMail({
    to: reqItem.email,
    subject: `Update regarding your VOD Request "${reqItem.title}" — StreamXvault`,
    text: `Hello,\n\nHere is an update from the StreamXvault administrator regarding your video request "${reqItem.title}":\n\n${message.trim()}\n\nBest regards,\nThe StreamXvault Team`,
    html: emailHtml
  });
  
  if (success) {
    res.json({ success: true });
  } else {
    // Return success true anyway but with a warning, since it's likely a Resend limitation
    res.json({ success: true, warning: 'Email provider rejected the email. Ensure you are using a verified domain or sending to a verified email address.' });
  }
});

app.delete('/api/admin/vod/requests/:id', requireAdmin, async (req, res) => {
  let requests = loadVodRequests();
  requests = requests.filter(r => r.id !== req.params.id);
  await saveVodRequests(requests);
  res.json({ success: true });
});
// --- End VOD API Routes ---

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again later.' }
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username = 'admin', password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('sxv_token', token, { maxAge: 7 * 24 * 3600 * 1000, httpOnly: true, secure: true, sameSite: 'strict' });
    res.json({ success: true, token }); // token in JSON for cached frontend compatibility
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('sxv_token');
  res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
  const token = req.cookies?.sxv_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.json({ isAdmin: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ isAdmin: !!decoded.isAdmin });
  } catch {
    res.json({ isAdmin: false });
  }
});

// Sanitize video data for public API (strip ALL sensitive fields)
function sanitizeVideoForPublic(video, includePlaybackInfo = false) {
  const safe = {
    id: video.id,
    title: video.title,
    genre: video.genre,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    views: (video.displayViews && video.displayViews.trim() !== '') ? video.displayViews.trim() : (video.views || 0),
    likes: video.likes || 0,
    uploadedAt: video.uploadedAt,
    published: video.published,
    duration: video.duration || null
  };

  // Only include playback info for the single-video endpoint (player needs it)
  if (includePlaybackInfo && video.videoUrl) {
    safe.videoUrl = video.videoUrl;
  }

  return safe;
  // NEVER expose: downloads, videoFilename, thumbnailFilename
}

// Get Videos (public — sensitive fields stripped)
app.get('/api/videos', (req, res) => {
  const videos = loadVideos();
  const { search, genre } = req.query;
  let filtered = videos.filter(v => v.published !== false);

  if (genre) {
    filtered = filtered.filter(v => v.genre?.toLowerCase() === genre.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(v => v.title.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q));
  }
  res.json(filtered.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).map(v => sanitizeVideoForPublic(v, true)));
});

app.get('/api/admin/videos', requireAdmin, (req, res) => {
  res.json(loadVideos().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)));
});

// GET Single Video (Crucial: View Counting)
app.get('/api/videos/:id', async (req, res) => {
  const videos = loadVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Not found' });

  // Admin Check
  const token = req.cookies?.sxv_token || req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  let isAdmin = false;
  if (token) {
    try { isAdmin = !!jwt.verify(token, JWT_SECRET).isAdmin; } catch (e) {}
  }

  // BOT & UNIQUE human check
  const isBot = isRequestBot(req);
  const sessionKey = `view_${video.id}`;
  const hasViewed = new RegExp(`(?:^|; )${sessionKey}=`).test(req.headers.cookie || '');

  if (!isAdmin && !isBot && !hasViewed) {
    video.views = (video.views || 0) + 1;
    res.setHeader('Set-Cookie', `${sessionKey}=1; Max-Age=3600; Path=/; SameSite=Lax; HttpOnly`);
    await saveVideos(videos);
  }

  // Return full data for admin, sanitized for public
  if (isAdmin) {
    res.json(video);
  } else {
    res.json(sanitizeVideoForPublic(video, true));
  }
});



// Download links endpoint (authenticated or with rate limiting)
app.get('/api/videos/:id/downloads', async (req, res) => {
  const videos = loadVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Not found' });
  
  res.json({
    downloads: video.downloads || { p720: null, p1080: null }
  });
});

// Upload Handlers (R2 Direct)
app.post('/api/upload/presign', requireAdmin, async (req, res) => {
  try {
    const { key, contentType } = req.body;
    const url = await storage.getPresignedUrl(key, contentType);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload/multipart/start', requireAdmin, async (req, res) => {
  try {
    const { key, contentType } = req.body;
    const uploadId = await storage.startMultipartUpload(key, contentType);
    res.json({ uploadId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload/multipart/presign', requireAdmin, async (req, res) => {
  try {
    const { key, uploadId, partNumber } = req.body;
    const url = await storage.getPresignedPartUrl(key, uploadId, partNumber);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload/multipart/complete', requireAdmin, async (req, res) => {
  try {
    const { key, uploadId, parts } = req.body;
    const publicUrl = await storage.completeMultipartUpload(key, uploadId, parts);
    res.json({ success: true, publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register video after direct upload completes
app.post('/api/upload/complete', requireAdmin, async (req, res) => {
  try {
    const videos = loadVideos();
    const videoData = {
      ...req.body,
      displayViews: req.body.displayViews ? req.body.displayViews.trim() : '',
      views: 0,
      likes: 0,
      published: req.body.published !== false,
      uploadedAt: new Date().toISOString()
    };
    videos.push(videoData);
    await saveVideos(videos);
    submitToIndexNow(videoData.id); // 🔥 Auto-Index
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create external video (R2 HLS / Embed)
app.post('/api/admin/videos/external', requireAdmin, async (req, res) => {
  try {
    const { title, genre, description, videoUrl, thumbnailUrl, dl720, dl1080, displayViews } = req.body;
    const vId = require('crypto').randomUUID();
    
    const videoData = {
      id: vId,
      title: title ? title.trim() : '',
      genre: genre ? genre.trim() : '',
      description: description ? description.trim() : '',
      displayViews: displayViews ? displayViews.trim() : '',
      videoUrl: videoUrl ? videoUrl.trim() : '',
      thumbnailUrl: thumbnailUrl ? thumbnailUrl.trim() : '',
      views: 0,
      likes: 0,
      published: true,
      downloads: {
        p720: dl720 ? dl720.trim() : '',
        p1080: dl1080 ? dl1080.trim() : ''
      },
      uploadedAt: new Date().toISOString()
    };

    const videos = loadVideos();
    videos.push(videoData);
    await saveVideos(videos);
    submitToIndexNow(vId); // 🔥 Auto-Index
    res.json({ success: true, id: vId });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Update Video Metadata (Edit)
app.put('/api/videos/:id', requireAdmin, async (req, res) => {
  try {
    const { title, genre, description, thumbnailUrl, videoUrl, dl720, dl1080, published, displayViews } = req.body;
    const videos = loadVideos();
    const video = videos.find(v => v.id === req.params.id);
    
    if (!video) return res.status(404).json({ error: 'Video not found' });

    video.title = title || video.title;
    video.genre = genre || video.genre;
    video.description = description || video.description;
    if (displayViews !== undefined) video.displayViews = displayViews.trim();
    video.thumbnailUrl = thumbnailUrl !== undefined ? thumbnailUrl : video.thumbnailUrl;
    video.videoUrl = videoUrl !== undefined ? videoUrl : video.videoUrl;
    video.published = published === 'true' || published === true;
    
    video.downloads = {
      p720: dl720 !== undefined ? dl720 : (video.downloads ? video.downloads.p720 : null),
      p1080: dl1080 !== undefined ? dl1080 : (video.downloads ? video.downloads.p1080 : null)
    };

    // Clean up legacy bunny fields on edit if they exist
    delete video.bunnyId;
    delete video.bunnyLibraryId;

    await saveVideos(videos);
    submitToIndexNow(req.params.id); // 🔥 Auto-Index
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update video metadata' });
  }
});

// Bulk Migrate Bunny IDs to R2 HLS
app.post('/api/admin/migrate-bunny', requireAdmin, async (req, res) => {
  try {
    const { r2Domain } = req.body;
    if (!r2Domain) return res.status(400).json({ error: 'R2 domain is required' });
    
    // Ensure domain doesn't end with slash
    const baseDomain = r2Domain.replace(/\/$/, '');

    const videos = loadVideos();
    let migratedCount = 0;

    for (let video of videos) {
      if (video.bunnyId) {
        if (!video.videoUrl || !video.videoUrl.includes('.m3u8')) {
           video.videoUrl = `${baseDomain}/${video.bunnyId}/master.m3u8`;
        }
        delete video.bunnyId;
        delete video.bunnyLibraryId;
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      await saveVideos(videos);
    }

    res.json({ success: true, migratedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Video
app.delete('/api/videos/:id', requireAdmin, async (req, res) => {
  try {
    let videos = loadVideos();
    const video = videos.find(v => v.id === req.params.id);
    if (!video) return res.status(404).json({ error: 'Not found' });

    // Cleanup R2 files if they exist
    if (storage.mode === 'r2') {
      try {
        if (video.videoFilename) await storage.delete('videos/' + video.videoFilename);
        if (video.thumbnailFilename) await storage.delete('thumbnails/' + video.thumbnailFilename);
      } catch (e) {}
    }

    videos = videos.filter(v => v.id !== req.params.id);
    await saveVideos(videos);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

const likeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP' }
});

// Like Video (Bot Filtered + Rate Limited + CSRF Check)
app.post('/api/videos/:id/like', likeLimiter, async (req, res) => {
  if (isRequestBot(req)) return res.json({ success: false });
  
  // Basic CSRF check via Origin/Referer
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !origin.includes('streamxvault.online') && !origin.includes('localhost')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Cookie-based rate limiting (1 like per video per hour)
  const likeKey = `liked_${req.params.id}`;
  const hasLiked = new RegExp(`(?:^|; )${likeKey}=`).test(req.headers.cookie || '');
  if (hasLiked) {
    return res.json({ success: false, message: 'Already liked' });
  }
  
  const videos = loadVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (video) {
    video.likes = (video.likes || 0) + 1;
    await saveVideos(videos);
    res.setHeader('Set-Cookie', `${likeKey}=1; Max-Age=3600; Path=/; SameSite=Lax; HttpOnly`);
    res.json({ success: true, likes: video.likes });
  } else {
    res.status(404).json({ error: 'Video not found' });
  }
});

// Admin: Delete Video
app.delete('/api/admin/videos/:id', requireAdmin, async (req, res) => {
  let videos = loadVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Not found' });

  // Delete from R2
  if (storage.mode === 'r2') {
    try {
      if (video.videoFilename) await storage.deleteFile('videos/' + video.videoFilename);
      if (video.thumbnailFilename) await storage.deleteFile('thumbnails/' + video.thumbnailFilename);
    } catch (e) {}
  }

  videos = videos.filter(v => v.id !== req.params.id);
  await saveVideos(videos);
  res.json({ success: true });
});

// Helper: Escape XML entities
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  }).replace(/\r?\n/g, ' ');
}

// ==================== SEO: Sitemap ====================
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = `https://streamxvault.online`;
  const videos = loadVideos().filter(v => v.published !== false);
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>`;

  videos.forEach(v => {
    xml += `
  <url>
    <loc>${baseUrl}/watch?v=${v.id}</loc>
    <video:video>
      <video:thumbnail_loc>${v.thumbnailUrl || baseUrl + '/images/logo.png'}</video:thumbnail_loc>
      <video:title>${escapeXml(v.title)}</video:title>
      <video:description>${escapeXml(v.description || 'Watch on StreamXvault')}</video:description>
      <video:publication_date>${v.uploadedAt}</video:publication_date>
      <video:player_loc>${baseUrl}/api/embed/${v.id}</video:player_loc>
    </video:video>
  </url>`;
  });
  xml += '\n</urlset>';
  res.type('application/xml').send(xml);
});

// 404 catch-all route
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Start Server Routine
const startServer = async () => {
  // 1. Initial R2 Sync
  if (storage.mode === 'r2') {
    try {
      console.log('🔄 Syncing Database from R2...');
      const remoteData = await storage.download(DB_KEY);
      if (remoteData && remoteData.length > 5) {
        fs.writeFileSync(DATA_FILE, remoteData);
        console.log('📦 Database synced (Size: ' + remoteData.length + ' bytes)');
      } else {
        console.log('⚠️ Primary database empty, checking for any available .json...');
        const keys = await storage.listObjects();
        // Look for any videos.json in the bucket first (root or nested)
        const videoKeys = keys.filter(k => k.endsWith('videos.json'));
        let bestKey = null;
        let bestData = null;
        
        for (const k of videoKeys) {
           const d = await storage.download(k);
           if (d && (!bestData || d.length > bestData.length)) {
             bestData = d;
             bestKey = k;
           }
        }
        
        if (bestData && bestData.length > 5) {
          fs.writeFileSync(DATA_FILE, bestData);
          console.log(`✅ Recovered videos from fallback: ${bestKey} (Size: ${bestData.length} bytes)`);
        }
      }

      let remoteStats = await storage.download(STATS_KEY);
      if (!remoteStats || remoteStats.length < 5) {
        // Fallback to root stats.json
        const rootStats = await storage.download('stats.json');
        if (rootStats && rootStats.length > 5) {
          remoteStats = rootStats;
          console.log('📈 Recovered stats from root stats.json');
        }
      }
      if (remoteStats && remoteStats.length > 5) {
        fs.writeFileSync(STATS_FILE, remoteStats);
        console.log('📈 Stats synced');
      }

      // Sync VOD Rules from R2
      const remoteVodRules = await storage.download(VOD_RULES_KEY);
      if (remoteVodRules) {
        fs.writeFileSync(VOD_RULES_FILE, remoteVodRules);
        console.log('📺 VOD Rules synced from R2');
      }

      // Sync VOD Requests from R2
      const remoteVodRequests = await storage.download(VOD_REQUESTS_KEY);
      if (remoteVodRequests) {
        fs.writeFileSync(VOD_REQUESTS_FILE, remoteVodRequests);
        console.log('📺 VOD Requests synced from R2');
      }
    } catch (err) {
      console.error('❌ Sync failed:', err.message);
    }
  }

  // 2. Start Listening
  // --- Adcash Integration ---
const ADCASH_API_TOKEN = process.env.ADCASH_API_TOKEN || 'mXwVmvs95GnOPIR85DA3tsnH6QqlHXo57wgKjG+RINXX246rltQmlfAGg/FYuPB755ydq5x572DXuOtc2H/opNpKxk+WjcDT9G7YiWjRMeiBXrhHRuPGUuLzxo2nkdN8QXtn8Ea1Injy2g205sBuXw==';
let adcashAccessToken = null;
let adcashTokenExpiresAt = 0;

async function getAdcashAccessToken() {
  if (adcashAccessToken && Date.now() < adcashTokenExpiresAt) {
    return adcashAccessToken;
  }
  
  const res = await fetch('https://adcash.myadcash.com/api/v2/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_token: ADCASH_API_TOKEN })
  });
  
  if (!res.ok) throw new Error('Failed to fetch Adcash token');
  const data = await res.json();
  
  adcashAccessToken = data.data.access_token;
  // Expire 1 minute before actual expiration to be safe
  adcashTokenExpiresAt = Date.now() + ((data.data.expires_in - 60) * 1000);
  
  return adcashAccessToken;
}

app.get('/api/admin/adcash', requireAdmin, async (req, res) => {
  try {
    const token = await getAdcashAccessToken();
    
    // Fetch Balance
    const balRes = await fetch('https://adcash.myadcash.com/api/v2/publishers/balance', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const balData = await balRes.json();
    
    // Fetch Reports (Today)
    const today = new Date().toISOString().split('T')[0];
    const repRes = await fetch(`https://adcash.myadcash.com/api/v2/publishers/reports?start_date=${today}&end_date=${today}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const repData = await repRes.json();
    
    // Summarize Today's Report
    let todayEarnings = 0;
    let todayImpressions = 0;
    
    if (repData.data && repData.data.rows) {
      for (const row of repData.data.rows) {
        todayEarnings += parseFloat(row.earnings || 0);
        todayImpressions += parseInt(row.impressions || row.unique_users || 0);
      }
    }
    
    res.json({
      success: true,
      balance: balData.data ? balData.data.balance : 0,
      currency: balData.data ? balData.data.currency : 'USD',
      todayEarnings: todayEarnings.toFixed(2),
      todayImpressions: todayImpressions
    });
    
  } catch (err) {
    console.error('Adcash API Error:', err);
    res.status(500).json({ error: 'Failed to fetch Adcash data' });
  }
});
// --------------------------

app.listen(PORT, () => {
    console.log(`🚀 StreamXvault Server running on port ${PORT}`);
  });
};

startServer();
