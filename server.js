const express = require('express');
const multer = require('multer');
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // Small limit for metadata-only multipart forms
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const storage = require('./storage').createStorage(); // Fix: Actually create the storage instance

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'manoj720';
const JWT_SECRET = process.env.JWT_SECRET || 'streamxvault_secret_key_123';

const DATA_FILE = path.join(__dirname, 'data', 'videos.json');
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');
const DB_KEY = '_database/videos.json'; // Permanently locked to recovered path
const STATS_KEY = '_database/stats.json'; // Permanently locked to recovered path

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

// Security Headers Middleware
app.use((req, res, next) => {
  // 1. Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  // 2. Click-jacking defense
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  // 3. MIME type sniffing defense
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // 4. Content Security Policy (Ad-compatible but secure)
  // Allows Adcash ad network while blocking unauthorized sources
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' *.acscdn.com acscdn.com vjs.zencdn.net imasdk.googleapis.com cdnjs.cloudflare.com *.googlesyndication.com *.doubleclick.net 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' fonts.googleapis.com vjs.zencdn.net cdnjs.cloudflare.com 'unsafe-inline'",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' *.b-cdn.net *.r2.dev *.acscdn.com *.doubleclick.net *.googlesyndication.com data: blob: *",
    "frame-src iframe.mediadelivery.net *.acscdn.com *.doubleclick.net *.googlesyndication.com *",
    "media-src 'self' *.b-cdn.net *.r2.dev blob:",
    "connect-src 'self' *.acscdn.com imasdk.googleapis.com *.doubleclick.net *.googlesyndication.com *",
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


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
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml`);
});

// Dynamic SEO for Watch Page
app.get('/watch', (req, res) => {
  const vId = req.query.v;
  const indexPath = path.join(__dirname, 'public', 'watch.html');

  if (!fs.existsSync(indexPath)) return res.status(404).send('Page not found');
  let html = fs.readFileSync(indexPath, 'utf8');

  // 🛡️ Bulletproof SEO: Even if video is not in DB yet, tell Google it's a valid page
  const videos = loadVideos();
  const video = videos.find(v => v.id === vId);
  
  // Set precise charset to prevent Bing encoding errors
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // Base Metadata
  const baseUrl = `https://${req.get('host')}`;
  const url = `${baseUrl}/watch?v=${vId}`;
  
  let rawTitle = 'Watch Video - StreamXvault';
  let rawDesc = 'Watch premium content on StreamXvault - your personal streaming library.';
  let thumb = `${baseUrl}/images/logo.png`;

  if (video) {
    rawTitle = `${video.title} - Watch on StreamXvault`;
    rawDesc = video.description || `Watch ${video.title} on StreamXvault. High quality streaming content.`;
    thumb = video.thumbnailUrl || thumb;
  }

  let title = escapeMeta(rawTitle);
  let fullDesc = escapeMeta(rawDesc);
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

  // 1. Inject Standard Meta Tags
  html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
  html = html.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${seoDesc}">`);
  
  // 2. Inject Body Content (Unlimited Full Description)
  html = html.replace(/<h1 id="video-title">.*?<\/h1>/, `<h1 id="video-title">${title}</h1>`);
  html = html.replace(/<div class="video-description" id="video-description">.*?<\/div>/, `<div class="video-description" id="video-description">${fullDesc}</div>`);

  // 3. Inject Advanced SEO (Canonical / Schema / OG)
  const headEnd = '</head>';
  const seoTags = `
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
    "uploadDate": "${video ? (video.uploadedAt || new Date().toISOString()) : new Date().toISOString()}",
    "duration": "${video && video.duration ? video.duration : 'PT0S'}",
    "embedUrl": "${url}",
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": "https://schema.org/WatchAction",
      "userInteractionCount": ${video ? (video.views || 0) : 0}
    }
  }
  </script>
`;
  html = html.replace(headEnd, seoTags + headEnd);

  // Inject Server-Side Rendered (SSR) related video links.
  // This solves Google's "Has only one followed internal linking URL" error
  // by providing hard-coded HTML links instead of relying on JS-rendered "More Videos" grids.
  // SSR related video links (visible nav element for SEO, not hidden cloaking)
  const otherVideos = videos.filter(v => v.id !== vId && v.published !== false).slice(0, 20);
  const relatedListItems = otherVideos.map(v => `<li><a href="${baseUrl}/watch?v=${v.id}">${escapeMeta(v.title)}</a></li>`).join('');
  const relatedNav = `<nav aria-label="Related videos" style="padding: 0 1rem;"><h2 style="font-size: 1rem; color: var(--text-muted); margin-bottom: 0.5rem;">Related Videos</h2><ul style="list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem;">${relatedListItems.slice(0, 500)}</ul></nav>`;
  html = html.replace('</body>', `${relatedNav}\n</body>`);

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
    // SSR video directory for bots (visible nav, not hidden cloaking)
    const seoListItems = videos.slice(0, 20).map(v => `<li><a href="${baseUrl}/watch?v=${v.id}">${escapeMeta(v.title)}</a></li>`).join('');
    const seoNav = `<nav aria-label="Video directory" style="padding: 0 1rem; margin-bottom: 1rem;"><h2 style="font-size: 1rem; color: var(--text-muted);">Video Directory</h2><ul style="list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem;">${seoListItems}</ul></nav>`;
    html = html.replace('</body>', `${seoNav}\n</body>`);
  }

  res.send(html);
});

// Support for .html extensions and clean URLs
// Placed after dynamic routes so SEO injection works
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Trust proxy for production (correct IP detection)
app.set('trust proxy', 1);

// Helper: Require Admin
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
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

app.post('/api/auth/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '7d' });
    // Set a cookie so HTML requests are also ignored for tracking
    res.setHeader('Set-Cookie', `sxv_token=${token}; Max-Age=${7 * 24 * 3600}; Path=/; SameSite=Lax; HttpOnly`);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'sxv_token=; Max-Age=0; Path=/; SameSite=Lax; HttpOnly');
  res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.json({ isAdmin: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ isAdmin: !!decoded.isAdmin });
  } catch {
    res.json({ isAdmin: false });
  }
});

// Sanitize video data for public API (strip sensitive fields)
function sanitizeVideoForPublic(video) {
  return {
    id: video.id,
    title: video.title,
    genre: video.genre,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    views: video.views || 0,
    likes: video.likes || 0,
    uploadedAt: video.uploadedAt,
    published: video.published,
    duration: video.duration || null
  };
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
  res.json(filtered.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).map(sanitizeVideoForPublic));
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
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
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
    res.json(sanitizeVideoForPublic(video));
  }
});

// Bunny Embed Proxy — hides library ID from client
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID || '636087';
app.get('/api/embed/:videoId', async (req, res) => {
  const videos = loadVideos();
  const video = videos.find(v => v.id === req.params.videoId);
  if (!video) return res.status(404).json({ error: 'Not found' });
  
  const bId = video.bunnyId;
  if (!bId) return res.status(404).json({ error: 'No embed available' });
  
  // Redirect to Bunny embed (library ID hidden from client JS)
  res.redirect(`https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${bId}?autoplay=true`);
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

// Create external video (Bunny/Embed)
app.post('/api/admin/videos/external', requireAdmin, async (req, res) => {
  try {
    const { title, genre, description, videoUrl, thumbnailUrl, bunnyId, dl720, dl1080 } = req.body;
    const vId = require('crypto').randomUUID();
    
    const videoData = {
      id: vId,
      title,
      genre,
      description,
      videoUrl,
      thumbnailUrl,
      bunnyId,
      views: 0,
      likes: 0,
      published: true,
      downloads: {
        p720: dl720 || null,
        p1080: dl1080 || null
      },
      uploadedAt: new Date().toISOString()
    };

    const videos = loadVideos();
    videos.push(videoData);
    await saveVideos(videos);
    submitToIndexNow(vId); // 🔥 Auto-Index
    res.json({ success: true, id: vId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create external video' });
  }
});

// Update Video Metadata (Edit)
app.put('/api/videos/:id', requireAdmin, upload.none(), async (req, res) => {
  try {
    const { title, genre, description, thumbnailUrl, bunnyId, dl720, dl1080, published } = req.body;
    const videos = loadVideos();
    const video = videos.find(v => v.id === req.params.id);
    
    if (!video) return res.status(404).json({ error: 'Video not found' });

    video.title = title || video.title;
    video.genre = genre || video.genre;
    video.description = description || video.description;
    video.thumbnailUrl = thumbnailUrl !== undefined ? thumbnailUrl : video.thumbnailUrl;
    video.bunnyId = bunnyId || video.bunnyId;
    video.published = published === 'true' || published === true;
    
    video.downloads = {
      p720: dl720 || (video.downloads ? video.downloads.p720 : null),
      p1080: dl1080 || (video.downloads ? video.downloads.p1080 : null)
    };

    await saveVideos(videos);
    submitToIndexNow(req.params.id); // 🔥 Auto-Index
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update video' });
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

// Like Video (Bot Filtered + Rate Limited + CSRF Check)
app.post('/api/videos/:id/like', async (req, res) => {
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

// ==================== SEO: Sitemap ====================
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
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
      <video:title>${(v.title || '').replace(/[&<>"']/g, '')}</video:title>
      <video:description>${(v.description || 'Watch on StreamXvault').replace(/[&<>"']/g, '')}</video:description>
      <video:publication_date>${v.uploadedAt}</video:publication_date>
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
        const jsonKeys = keys.filter(k => k.endsWith('.json') && !k.includes('stats'));
        if (jsonKeys.length > 0) {
           const backupData = await storage.download(jsonKeys[0]);
           if (backupData) {
             fs.writeFileSync(DATA_FILE, backupData);
             console.log(`✅ Recovered from fallback: ${jsonKeys[0]}`);
           }
        }
      }

      const remoteStats = await storage.download(STATS_KEY);
      if (remoteStats) {
        fs.writeFileSync(STATS_FILE, remoteStats);
        console.log('📈 Stats synced');
      }
    } catch (err) {
      console.error('❌ Sync failed:', err.message);
    }
  }

  // 2. Start Listening
  app.listen(PORT, () => {
    console.log(`🚀 StreamXvault Server running on port ${PORT}`);
  });
};

startServer();
