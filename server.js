const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const express = require('express');
const fetch = global.fetch || require('node-fetch');
const { createStorage } = require('./storage');


const BOT_REGEX = /bot|crawler|spider|google|bing|yandex|baidu|slurp|duckduck|postman|headless|axios|python|curl|wget|lighthouse|semrush|ahrefs|dotbot|mj12bot|ia_archiver|monet|adsbot|pingdom/i;
function isRequestBot(req) {
  const ua = req.headers['user-agent'] || '';
  return BOT_REGEX.test(ua);
}

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const SITE = 'https://streamxvault.online';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'videos.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const DB_KEY = '_database/videos.json';
const VOD_RULES_FILE = path.join(DATA_DIR, 'vod_rules.json');
const VOD_REQUESTS_FILE = path.join(DATA_DIR, 'vod_requests.json');
const VOD_RULES_KEY = '_database/vod_rules.json';
const VOD_REQUESTS_KEY = '_database/vod_requests.json';
const GENRES_FILE = path.join(DATA_DIR, 'genres.json');
const GENRES_KEY = '_database/genres.json';
const DEFAULT_GENRES = ['Trueanal', 'Analonly', 'Nympho', 'Analvids', 'Tushy Raw'];

const ALLOWED_THUMB_HOSTS = new Set([
  'pub-35e5e185c71b4d2292a6cae626c19d3d.r2.dev',
  'streamxvault.online',
  'www.streamxvault.online'
]);

let Jimp = null;
try { Jimp = require('jimp'); } catch (err) { Jimp = null; }

let storage;
try { storage = createStorage(); } catch (err) {
  console.error('storage init failed', err.message);
  storage = { mode: 'local', download: async () => null };
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(function gzipMaybe(req, res, next) {
  const ae = req.headers['accept-encoding'] || '';
  if (!/gzip/i.test(ae)) return next();
  const origSend = res.send.bind(res);
  res.send = function (body) {
    if (body == null || res.getHeader('Content-Encoding')) return origSend(body);
    const type = String(res.getHeader('Content-Type') || '');
    if (!/html|json|javascript|css|xml|svg|text/i.test(type)) return origSend(body);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    if (buf.length < 800) return origSend(body);
    try {
      const gz = zlib.gzipSync(buf, { level: 5 });
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.removeHeader('Content-Length');
      return origSend(gz);
    } catch (err) {
      return origSend(body);
    }
  };
  next();
});

function decorateHtml(html, extraScripts) {
  if (html.indexOf('sxv_theme') === -1) {
    html = html.replace(/<head[^>]*>/i, function (open) {
      return open + '\n  <script>try{var t=localStorage.getItem(\x27sxv_theme\x27)||\x27light\x27;document.documentElement.setAttribute(\x27data-theme\x27,t===\x27dark\x27?\x27dark\x27:\x27light\x27);}catch(e){}</script>';
    });
  }
  if (html.indexOf('/css/nav-fx.css') === -1) html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="/css/nav-fx.css?v=2">\n</head>');
  if (html.indexOf('/css/theme-dark.css') === -1) html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="/css/theme-dark.css?v=2">\n</head>');
  var scripts = ['/js/theme.js?v=3', '/js/tracker.js?v=1', '/js/age-gate.js?v=1'].concat(extraScripts || []);
  scripts.forEach(function (src) {
    if (html.indexOf(src.split('?')[0]) === -1) html = html.replace(/<\/body>/i, '<script src="' + src + '" defer></script>\n</body>');
  });
  return html;
}

app.get(['/demand.html', '/demand-form.html'], (req, res) => {
  const name = req.path === '/demand-form.html' ? 'demand-form.html' : 'demand.html';
  const file = path.join(__dirname, 'public', name);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  res.type('html').send(decorateHtml(fs.readFileSync(file, 'utf8')));
});

app.get('/watch.html', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/watch' + qs);
});
app.get('/index.html', (req, res) => {
  res.redirect(301, '/');
});

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  maxAge: '0',
  setHeaders: function (res, filePath) {
    if (/\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    } else if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let videosCache = { mtime: 0, data: null };

function repairVideoUrl(video) {
  if (!video || !video.videoUrl) return false;
  const before = video.videoUrl;
  let url = String(video.videoUrl);
  try {
    const vu = new URL(url);
    const vSegs = decodeURIComponent(vu.pathname).split('/').filter(Boolean);
    const thumb = video.thumbnailUrl ? new URL(video.thumbnailUrl) : null;
    const tSegs = thumb ? decodeURIComponent(thumb.pathname).split('/').filter(Boolean) : [];
    if (vSegs.length && tSegs.length && tSegs.includes(vSegs[0]) && tSegs[0] !== vSegs[0]) {
      const idx = tSegs.indexOf(vSegs[0]);
      const prefix = tSegs.slice(0, idx).map(encodeURIComponent).join('/');
      vu.pathname = '/' + prefix + vu.pathname;
      url = vu.toString();
    }
  } catch (err) {}
  if (url !== before) {
    video.videoUrl = url;
    return true;
  }
  return false;
}

function loadVideos() {
  try {
    const st = fs.statSync(DATA_FILE);
    if (videosCache.data && videosCache.mtime === st.mtimeMs) return videosCache.data;
    const videos = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(videos)) return [];
    let changed = false;
    for (let i = 0; i < videos.length; i++) {
      if (repairVideoUrl(videos[i])) changed = true;
    }
    if (changed) {
      try { saveVideos(videos); } catch (err) {}
    } else {
      videosCache = { mtime: st.mtimeMs, data: videos };
    }
    return videos;
  } catch (err) {
    return videosCache.data || [];
  }
}
function saveVideos(videos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(videos, null, 2));
  try { videosCache = { mtime: fs.statSync(DATA_FILE).mtimeMs, data: videos }; } catch (err) {
    videosCache = { mtime: Date.now(), data: videos };
  }
  if (storage && storage.mode === 'r2' && typeof storage.upload === 'function') {
    storage.upload(DB_KEY, Buffer.from(JSON.stringify(videos, null, 2)), 'application/json').catch(function () {});
  }
}

function loadVodRules() {
  try { return JSON.parse(fs.readFileSync(VOD_RULES_FILE, 'utf-8')); } catch (e) { return []; }
}
async function saveVodRules(rules) {
  fs.writeFileSync(VOD_RULES_FILE, JSON.stringify(rules, null, 2));
  if (storage && storage.mode === 'r2' && typeof storage.upload === 'function') {
    try { await storage.upload(VOD_RULES_KEY, Buffer.from(JSON.stringify(rules)), 'application/json'); } catch(e){}
  }
}
function loadVodRequests() {
  try { return JSON.parse(fs.readFileSync(VOD_REQUESTS_FILE, 'utf-8')); } catch (e) { return []; }
}
async function saveVodRequests(reqs) {
  fs.writeFileSync(VOD_REQUESTS_FILE, JSON.stringify(reqs, null, 2));
  if (storage && storage.mode === 'r2' && typeof storage.upload === 'function') {
    try { await storage.upload(VOD_REQUESTS_KEY, Buffer.from(JSON.stringify(reqs)), 'application/json'); } catch(e){}
  }
}

function loadGenres() {
  let list = [];
  try {
    const raw = JSON.parse(fs.readFileSync(GENRES_FILE, 'utf-8'));
    if (Array.isArray(raw)) list = raw.map(g => String(g || '').trim()).filter(Boolean);
  } catch (e) {}
  if (list.length === 0) {
    list = DEFAULT_GENRES.slice();
  }
  const seen = new Set(list.map(g => g.toLowerCase()));
  const videos = loadVideos();
  videos.forEach(v => {
    const g = v && v.genre ? String(v.genre).trim() : '';
    if (g && !seen.has(g.toLowerCase())) {
      seen.add(g.toLowerCase());
      list.push(g);
    }
  });
  return list;
}
async function saveGenres(genres) {
  const seen = new Set();
  const clean = [];
  (Array.isArray(genres) ? genres : []).forEach(g => {
    const t = String(g || '').trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      clean.push(t);
    }
  });
  fs.writeFileSync(GENRES_FILE, JSON.stringify(clean, null, 2));
  if (storage && storage.mode === 'r2' && typeof storage.upload === 'function') {
    try { await storage.upload(GENRES_KEY, Buffer.from(JSON.stringify(clean, null, 2)), 'application/json'); } catch(e){}
  }
  return clean;
}
function ensureGenreExists(genreName) {
  const g = String(genreName || '').trim();
  if (!g) return;
  const current = loadGenres();
  if (!current.some(item => item.toLowerCase() === g.toLowerCase())) {
    current.push(g);
    saveGenres(current).catch(() => {});
  }
}


async function syncVideosFromR2() {
  if (!storage || storage.mode !== 'r2') {
    if (!fs.existsSync(DATA_FILE)) {
      console.log('⚠️ No videos.json found.');
    } else {
      console.log(`📦 Loaded ${loadVideos().length} videos from local storage`);
    }
    return;
  }
  try {
    console.log('🔄 Syncing Database from R2...');
    const remoteData = await storage.download(DB_KEY);
    if (remoteData && remoteData.length > 5) {
      const localVideos = loadVideos();
      let remoteVideos = [];
      try { remoteVideos = JSON.parse(remoteData.toString()); } catch(e) {}
      if (remoteVideos.length >= localVideos.length) {
        fs.writeFileSync(DATA_FILE, remoteData);
        console.log('📦 Database synced from R2');
      } else {
        await saveVideos(localVideos);
      }
    } else {
      const localVideos = loadVideos();
      if (localVideos.length > 0) {
        await saveVideos(localVideos);
      } else {
        const fallback = await storage.download('videos.json');
        if (fallback && fallback.length > 5) {
          fs.writeFileSync(DATA_FILE, fallback);
          if (typeof storage.upload === 'function') await storage.upload(DB_KEY, fallback, 'application/json');
        }
      }
    }
    const remoteVodRules = await storage.download(VOD_RULES_KEY);
    if (remoteVodRules && remoteVodRules.length > 2) fs.writeFileSync(VOD_RULES_FILE, remoteVodRules);
    
    const remoteVodRequests = await storage.download(VOD_REQUESTS_KEY);
    if (remoteVodRequests && remoteVodRequests.length > 2) fs.writeFileSync(VOD_REQUESTS_FILE, remoteVodRequests);

    const remoteGenres = await storage.download(GENRES_KEY);
    if (remoteGenres && remoteGenres.length > 2) fs.writeFileSync(GENRES_FILE, remoteGenres);
  } catch (err) {
    console.error('❌ R2 Sync failed:', err.message);
  }
}

function emptyAnalytics() {
  return { visitors: 0, pageviewsToday: 0, watchesToday: 0, day: '', countries: {}, referrers: {}, videoViews: {}, videoRecent: [], seenUids: {} };
}
function loadAnalytics() {
  try {
    const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
    return Object.assign(emptyAnalytics(), data);
  } catch (err) {
    return emptyAnalytics();
  }
}
let analytics = loadAnalytics();
const live = new Map();
const adminTokens = new Set();
const rate = new Map();

function todayStamp() { return new Date().toISOString().slice(0, 10); }
function rollDay() {
  const day = todayStamp();
  if (analytics.day !== day) {
    analytics.day = day;
    analytics.pageviewsToday = 0;
    analytics.watchesToday = 0;
  }
}
function saveAnalytics() {
  try { fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics)); } catch (err) {}
}
setInterval(saveAnalytics, 30000);

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function isAdmin(req) {
  return adminTokens.has(parseCookies(req).sxv_admin || '');
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function countryOf(req) {
  const raw = String(req.headers['cf-ipcountry'] || req.headers['x-country'] || req.headers['x-vercel-ip-country'] || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(raw) && raw !== 'XX' && raw !== 'T1') return raw;
  return 'Unknown';
}
function safeRef(value) {
  const raw = String(value || 'direct').toLowerCase().replace(/^www\./, '').slice(0, 80);
  if (!raw || raw === 'direct') return 'direct';
  if (raw.indexOf('streamxvault') !== -1) return 'direct';
  if (!/^[a-z0-9.-]+$/.test(raw)) return 'other';
  return raw;
}
function bump(map, key, by) {
  map[key] = (map[key] || 0) + (by || 1);
}

app.post('/api/auth/login', (req, res) => {
  const user = String((req.body && req.body.username) || '');
  const pass = String((req.body && req.body.password) || '');
  const expectUser = process.env.ADMIN_USERNAME || 'admin';
  const expectPass = process.env.ADMIN_PASSWORD || '';
  if (!expectPass || user !== expectUser || pass !== expectPass) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.add(token);
  res.setHeader('Set-Cookie', 'sxv_admin=' + token + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400');
  res.json({ ok: true });
});
app.post('/api/auth/logout', (req, res) => {
  adminTokens.delete(parseCookies(req).sxv_admin || '');
  res.setHeader('Set-Cookie', 'sxv_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/auth/status', (req, res) => {
  res.json({ isAdmin: isAdmin(req) });
});

app.get('/api/admin/videos', requireAdmin, (req, res) => {
  res.json(loadVideos().sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)));
});
async function triggerTelegramWebhook(videoData) {
  const webhookUrl = process.env.MAKE_WEBHOOK_URL || 'https://hook.eu1.make.com/vbt4url5zn4rduygj66pkyvz2m5hq98u';
  
  if (!webhookUrl) return;

  const id = videoData.id || videoData.videoId || '';
  const title = videoData.title || '';

  // Ensure the full HTTPS domain is prepended to the image path
  const thumbFile = videoData.thumbnailFile || videoData.thumbnailFilename || '';
  let image = '';
  if (thumbFile) {
    image = thumbFile.startsWith('http://') || thumbFile.startsWith('https://')
      ? thumbFile
      : `https://streamxvault.online/${thumbFile.replace(/^\/+/, '')}`;
  } else if (videoData.thumbnailUrl) {
    const rawThumb = String(videoData.thumbnailUrl).trim();
    image = rawThumb.startsWith('http://') || rawThumb.startsWith('https://')
      ? rawThumb
      : `https://streamxvault.online/${rawThumb.replace(/^\/+/, '')}`;
  }
  
  // Guarantee a valid fallback image so Telegram 'Send a photo' never receives an empty URL
  if (!image) {
    image = id
      ? `https://streamxvault.online/og-image/${encodeURIComponent(id)}.jpg`
      : 'https://streamxvault.online/images/logo.png';
  }

  const payload = {
    title: title || 'New Video Upload',
    url: `https://streamxvault.online/watch?v=${id}`,
    watchUrl: `https://streamxvault.online/watch?v=${id}`,
    id: id,
    videoId: id,
    // Ensure the full HTTPS domain is prepended to the image path
    image: image,
    photo: image,
    photoUrl: image,
    imageUrl: image,
    thumbnailUrl: image,
    thumbnailFile: image,
    httpUrl: image
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      console.log('Success: Make.com webhook triggered for Telegram.');
    } else {
      console.error('Make.com webhook rejected the payload. Status:', response.status);
    }
  } catch (error) {
    console.error('Network error reaching Make.com:', error.message);
  }
}

app.get('/api/genres', (req, res) => {
  res.json(loadGenres());
});

app.post('/api/admin/genres', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const current = loadGenres();
  if (Array.isArray(body.genres)) {
    const saved = await saveGenres(body.genres);
    return res.json({ ok: true, genres: saved });
  }
  const newGenre = String(body.genre || body.name || '').trim();
  if (!newGenre) return res.status(400).json({ error: 'Genre name is required' });
  if (current.some(g => g.toLowerCase() === newGenre.toLowerCase())) {
    return res.status(400).json({ error: 'Genre category already exists' });
  }
  current.push(newGenre);
  const saved = await saveGenres(current);
  res.json({ ok: true, genres: saved, added: newGenre });
});

app.put('/api/admin/genres', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const oldName = String(body.oldName || '').trim();
  const newName = String(body.newName || '').trim();
  if (!oldName || !newName) return res.status(400).json({ error: 'Both oldName and newName are required' });
  let current = loadGenres();
  current = current.map(g => g.toLowerCase() === oldName.toLowerCase() ? newName : g);
  const saved = await saveGenres(current);
  const videos = loadVideos();
  let updatedCount = 0;
  videos.forEach(v => {
    if (v && v.genre && v.genre.toLowerCase() === oldName.toLowerCase()) {
      v.genre = newName;
      updatedCount++;
    }
  });
  if (updatedCount > 0) saveVideos(videos);
  res.json({ ok: true, genres: saved, updatedCount });
});

app.delete('/api/admin/genres/:name', requireAdmin, async (req, res) => {
  const target = decodeURIComponent(req.params.name || '').trim();
  if (!target) return res.status(400).json({ error: 'Genre name required' });
  let list = [];
  try {
    const raw = JSON.parse(fs.readFileSync(GENRES_FILE, 'utf-8'));
    if (Array.isArray(raw)) list = raw.map(g => String(g || '').trim()).filter(Boolean);
  } catch (e) {}
  if (list.length === 0) list = loadGenres();
  const filtered = list.filter(g => g.toLowerCase() !== target.toLowerCase());
  const saved = await saveGenres(filtered);
  res.json({ ok: true, genres: loadGenres(), savedGenres: saved });
});

function parseTags(input) {
  if (!input) return [];
  const raw = Array.isArray(input) ? input.join(',') : String(input);
  const seen = new Set();
  const out = [];
  raw.split(/[,#]+/).forEach(part => {
    const clean = part.trim().replace(/^#+/, '').trim();
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      out.push(clean);
    }
  });
  return out;
}

app.post('/api/admin/videos/external', requireAdmin, (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const videoUrl = String(body.videoUrl || '').trim();
  if (!title || !videoUrl) return res.status(400).json({ error: 'Title and video URL required' });
  const videos = loadVideos();
  const video = {
    id: crypto.randomUUID(),
    title: title,
    genre: String(body.genre || '').trim(),
    modelName: String(body.modelName || '').trim(),
    tags: parseTags(body.tags),
    description: String(body.description || '').trim(),
    displayViews: String(body.displayViews || '').trim(),
    videoUrl: videoUrl,
    thumbnailUrl: String(body.thumbnailUrl || '').trim(),
    thumbnailFile: String(body.thumbnailFile || body.thumbnailFilename || '').trim(),
    views: 0,
    likes: 0,
    published: true,
    downloads: { p480: String(body.dl480 || ''), p720: String(body.dl720 || ''), p1080: String(body.dl1080 || ''), p4k: String(body.dl4k || '') },
    uploadedAt: new Date().toISOString()
  };
  videos.unshift(video);
  saveVideos(videos);
  if (video.genre) ensureGenreExists(video.genre);

  triggerTelegramWebhook(video);

  res.json(video);
});

app.post('/api/upload', (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id || body.videoId || crypto.randomUUID();
    const title = String(body.title || 'Untitled Video').trim();
    const thumbnailFile = String(body.thumbnailFile || body.thumbnailFilename || '').trim();
    let thumbnailUrl = String(body.thumbnailUrl || '').trim();
    if (!thumbnailUrl && thumbnailFile) {
      thumbnailUrl = thumbnailFile.startsWith('http') ? thumbnailFile : `https://streamxvault.online/${thumbnailFile.replace(/^\/+/, '')}`;
    }

    const newVideo = {
      id: id,
      title: title,
      genre: String(body.genre || '').trim(),
      modelName: String(body.modelName || '').trim(),
      tags: parseTags(body.tags),
      description: String(body.description || '').trim(),
      displayViews: String(body.displayViews || '').trim(),
      videoUrl: String(body.videoUrl || '').trim(),
      thumbnailUrl: thumbnailUrl,
      thumbnailFile: thumbnailFile,
      views: 0,
      likes: 0,
      published: true,
      downloads: { p480: String(body.dl480 || ''), p720: String(body.dl720 || ''), p1080: String(body.dl1080 || ''), p4k: String(body.dl4k || '') },
      uploadedAt: new Date().toISOString()
    };

    const videos = loadVideos();
    videos.unshift(newVideo);
    saveVideos(videos);
    if (newVideo.genre) ensureGenreExists(newVideo.genre);

    triggerTelegramWebhook({
      title: req.body.title || newVideo.title,
      id: req.body.id || newVideo.id,
      thumbnailFile: req.body.thumbnailFile || thumbnailFile,
      thumbnailUrl: newVideo.thumbnailUrl
    });

    return res.status(200).json({ success: true, message: 'Video uploaded successfully', video: newVideo });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Failed to process upload' });
  }
});

app.post('/api/upload/complete', (req, res) => {
  try {
    const body = req.body || {};
    const id = body.videoId || body.id || crypto.randomUUID();
    const title = String(body.title || 'Untitled Video').trim();
    const thumbnailFile = String(body.thumbnailFilename || body.thumbnailFile || '').trim();
    let thumbnailUrl = String(body.thumbnailUrl || '').trim();
    if (!thumbnailUrl && thumbnailFile) {
      thumbnailUrl = thumbnailFile.startsWith('http') ? thumbnailFile : `https://streamxvault.online/${thumbnailFile.replace(/^\/+/, '')}`;
    }

    const videoData = {
      id: id,
      title: title,
      genre: String(body.genre || '').trim(),
      modelName: String(body.modelName || '').trim(),
      tags: parseTags(body.tags),
      description: String(body.description || '').trim(),
      displayViews: String(body.displayViews || '').trim(),
      videoUrl: String(body.videoUrl || '').trim(),
      videoFilename: body.videoFilename || null,
      thumbnailUrl: thumbnailUrl,
      thumbnailFile: thumbnailFile,
      thumbnailFilename: thumbnailFile || null,
      views: 0,
      likes: 0,
      published: true,
      downloads: { p480: String(body.dl480 || ''), p720: String(body.dl720 || ''), p1080: String(body.dl1080 || ''), p4k: String(body.dl4k || '') },
      uploadedAt: new Date().toISOString()
    };

    const videos = loadVideos();
    videos.unshift(videoData);
    saveVideos(videos);
    if (videoData.genre) ensureGenreExists(videoData.genre);

    triggerTelegramWebhook({
      title: videoData.title,
      id: videoData.id,
      thumbnailFile: thumbnailFile,
      thumbnailUrl: videoData.thumbnailUrl
    });

    res.json({ success: true, video: videoData });
  } catch (err) {
    console.error('Complete upload error:', err);
    res.status(500).json({ error: 'Failed to register video' });
  }
});
app.put('/api/videos/:id', requireAdmin, (req, res) => {
  const videos = loadVideos();
  const video = videos.find((item) => item && item.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  const body = req.body || {};
  ['title', 'genre', 'modelName', 'description', 'displayViews', 'videoUrl', 'thumbnailUrl', 'published'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(body, key)) video[key] = body[key];
  });
  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    video.tags = parseTags(body.tags);
  }
  
  if (body.dl480 !== undefined || body.dl720 !== undefined || body.dl1080 !== undefined || body.dl4k !== undefined) {
    video.downloads = video.downloads || {};
    if (body.dl480 !== undefined) video.downloads.p480 = body.dl480;
    if (body.dl720 !== undefined) video.downloads.p720 = body.dl720;
    if (body.dl1080 !== undefined) video.downloads.p1080 = body.dl1080;
    if (body.dl4k !== undefined) video.downloads.p4k = body.dl4k;
  }
  saveVideos(videos);
  if (video.genre) ensureGenreExists(video.genre);
  res.json(video);
});
app.delete('/api/videos/:id', requireAdmin, (req, res) => {
  const videos = loadVideos().filter((item) => item && item.id !== req.params.id);
  saveVideos(videos);
  res.json({ ok: true });
});


app.post('/api/track', (req, res) => {
  if (isAdmin(req)) return res.json({ ok: true });
  rollDay();
  const body = req.body || {};
  const uid = String(body.uid || '').slice(0, 40) || 'anon';
  const now = Date.now();
  const hits = (rate.get(uid) || []).filter((t) => now - t < 60000);
  if (hits.length > 40) return res.json({ ok: true });
  hits.push(now);
  rate.set(uid, hits);
  const country = countryOf(req);
  const referrer = safeRef(body.referrer);
  const event = String(body.event || 'page');
  const videoId = String(body.videoId || '').slice(0, 80);
  const pathName = String(body.path || '/').slice(0, 180);
  live.set(uid, { ts: now, country: country, referrer: referrer, path: pathName, videoId: videoId });
  if (!analytics.seenUids[uid]) {
    analytics.seenUids[uid] = now;
    analytics.visitors += 1;
  }
  bump(analytics.countries, country);
  bump(analytics.referrers, referrer);
  if (event === 'page') analytics.pageviewsToday += 1;
  if (event === 'watch' && videoId) {
    analytics.watchesToday += 1;
    bump(analytics.videoViews, videoId);
    analytics.videoRecent.push({ id: videoId, t: now });
    if (analytics.videoRecent.length > 4000) analytics.videoRecent = analytics.videoRecent.slice(-3000);
    const videos = loadVideos();
    const video = videos.find((item) => item && item.id === videoId);
    if (video) {
      video.views = Number(video.views || 0) + 1;
      try { saveVideos(videos); } catch (err) {}
    }
  }
  res.json({ ok: true });
});

app.post('/api/recommend', (req, res) => {
  const history = Array.isArray(req.body && req.body.history) ? req.body.history.slice(0, 20) : [];
  const videos = loadVideos().filter((video) => video && video.published !== false);
  const seen = new Set(history);
  const watched = videos.filter((video) => seen.has(video.id));
  const genreScore = {};
  watched.forEach(function (video) {
    if (video.genre) genreScore[video.genre] = (genreScore[video.genre] || 0) + 3;
  });
  const ranked = videos.map(function (video) {
    let score = Math.log(1 + Number(video.views || 0)) + (Number(analytics.videoViews[video.id] || 0) * 0.4);
    if (seen.has(video.id)) score -= 40;
    if (video.genre && genreScore[video.genre]) score += genreScore[video.genre] * 6;
    const ageH = (Date.now() - Date.parse(video.uploadedAt || 0)) / 3600000;
    if (ageH > 0 && ageH < 72) score += 5;
    return { video: video, score: score };
  }).sort(function (a, b) { return b.score - a.score; });
  res.json({ videos: ranked.slice(0, 8).map((row) => row.video) });
});

app.get('/api/stats', requireAdmin, (req, res) => {
  const videos = loadVideos();
  res.json({
    totalVideos: videos.length,
    publishedVideos: videos.filter((video) => video && video.published !== false).length,
    totalViews: videos.reduce((sum, video) => sum + Number(video.views || 0), 0),
    totalLikes: videos.reduce((sum, video) => sum + Number(video.likes || 0), 0),
    totalVisitors: analytics.visitors || 0
  });
});

app.get('/api/admin/live', requireAdmin, (req, res) => {
  rollDay();
  const now = Date.now();
  const active = [];
  live.forEach(function (session, uid) {
    if (now - session.ts <= 45000) active.push(Object.assign({ uid: uid }, session));
    else live.delete(uid);
  });
  const liveCountries = {};
  active.forEach(function (session) { bump(liveCountries, session.country); });
  const recentCut = now - 15 * 60 * 1000;
  const recentCounts = {};
  (analytics.videoRecent || []).forEach(function (item) {
    if (item.t >= recentCut) bump(recentCounts, item.id);
  });
  const catalog = loadVideos();
  const growing = Object.keys(recentCounts).map(function (id) {
    const video = catalog.find((item) => item && item.id === id) || {};
    return { id: id, title: video.title || id, recent: recentCounts[id], total: Number(video.views || analytics.videoViews[id] || 0) };
  }).sort(function (a, b) { return b.recent - a.recent; }).slice(0, 8);
  const countries = Object.keys(Object.assign({}, analytics.countries, liveCountries)).map(function (code) {
    return { country: code, live: liveCountries[code] || 0, total: analytics.countries[code] || 0 };
  }).sort(function (a, b) { return (b.live - a.live) || (b.total - a.total); }).slice(0, 12);
  const referrers = Object.keys(analytics.referrers || {}).map(function (source) {
    return { source: source, count: analytics.referrers[source] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 12);
  res.json({
    liveVisitors: active.length,
    countriesLive: Object.keys(liveCountries).length,
    pageviewsToday: analytics.pageviewsToday || 0,
    watchesToday: analytics.watchesToday || 0,
    growing: growing,
    countries: countries,
    referrers: referrers
  });
});

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}
function clip(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, '') + '...';
}
function previewImageUrl(id) {
  return SITE + '/og-image/' + encodeURIComponent(id || 'home') + '.jpg';
}
function previewTags({ title, description, url, id }) {
  const t = escapeHtml(clip(title, 70));
  const d = escapeHtml(clip(description, 160));
  const u = escapeHtml(url);
  const img = escapeHtml(previewImageUrl(id || 'home'));
  return [
    '<link rel="canonical" href="' + u + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="StreamXvault">',
    '<meta property="og:title" content="' + t + '">',
    '<meta property="og:description" content="' + d + '">',
    '<meta property="og:url" content="' + u + '">',
    '<meta property="og:image" content="' + img + '">',
    '<meta property="og:image:secure_url" content="' + img + '">',
    '<meta property="og:image:type" content="image/jpeg">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + t + '">',
    '<meta name="twitter:description" content="' + d + '">',
    '<meta name="twitter:image" content="' + img + '">',
    '<meta name="twitter:image:src" content="' + img + '">'
  ].join('\n  ');
}
function injectHead(html, { title, description, tags }) {
  html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + escapeHtml(title) + '</title>');
  if (/<meta\s+name=["']description["']/i.test(html)) {
    html = html.replace(/<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/i, '<meta name="description" content="' + escapeHtml(clip(description, 160)) + '">');
  }
  html = html.replace(/\n\s*<link rel=["']canonical["'][^>]*>/gi, '');
  html = html.replace(/\n\s*<meta property=["']og:[^>]*>/gi, '');
  html = html.replace(/\n\s*<meta name=["']twitter:[^>]*>/gi, '');
  html = html.replace(/<head[^>]*>/i, function (open) { return open + '\n  ' + tags; });
  return decorateHtml(html);
}
function sendLogo(res) {
  const logo = path.join(__dirname, 'public', 'images', 'logo.png');
  if (fs.existsSync(logo)) return res.type('png').sendFile(logo);
  res.status(404).end();
}
async function handleOgImage(req, res) {
  try {
    const id = String(req.params.id || '').replace(/\.jpe?g$/i, '');
    const videos = loadVideos();
    const video = id === 'home'
      ? videos.find((item) => item && item.published !== false)
      : videos.find((item) => item && item.id === id);
    const thumb = video && typeof video.thumbnailUrl === 'string' ? video.thumbnailUrl.trim() : '';
    if (!thumb.startsWith('https://')) return sendLogo(res);
    let parsed;
    try { parsed = new URL(thumb); } catch (err) { return sendLogo(res); }
    if (parsed.protocol !== 'https:' || !ALLOWED_THUMB_HOSTS.has(parsed.hostname)) return sendLogo(res);
    const upstream = await fetch(parsed.toString(), { redirect: 'error' });
    if (!upstream.ok) return sendLogo(res);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (Jimp && buf.length) {
      try {
        const image = await Jimp.read(buf);
        image.cover(1200, 630).quality(72);
        const jpg = await image.getBufferAsync(Jimp.MIME_JPEG);
        return res.type('jpeg').send(jpg);
      } catch (err) {}
    }
    const type = upstream.headers.get('content-type') || 'image/jpeg';
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(type)) return sendLogo(res);
    res.type(type).send(buf);
  } catch (err) {
    sendLogo(res);
  }
}

app.get(['/rss.xml', '/feed.xml', '/feed'], (req, res) => {
  const videos = loadVideos().filter((video) => video && video.published !== false);
  const siteUrl = SITE || 'https://streamxvault.online';

  const escapeXml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const items = videos.map((v) => {
    const title = escapeXml(v.title || 'Video');
    const link = `${siteUrl}/watch?v=${encodeURIComponent(v.id)}`;
    const desc = escapeXml(v.description || v.title || '');
    const pubDate = v.uploadedAt ? new Date(v.uploadedAt).toUTCString() : new Date().toUTCString();
    const thumb = v.thumbnailUrl ? escapeXml(v.thumbnailUrl) : `${siteUrl}/og-image/${encodeURIComponent(v.id)}.jpg`;
    const genreTag = v.genre ? `\n      <category>${escapeXml(v.genre)}</category>` : '';

    return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>${genreTag}
      <description><![CDATA[<p>${desc}</p><img src="${thumb}" alt="${title}" />]]></description>
      <enclosure url="${thumb}" type="image/jpeg" length="0" />
      <media:thumbnail url="${thumb}" />
      <media:content url="${link}" medium="video" />
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>StreamXvault</title>
    <link>${siteUrl}</link>
    <description>StreamXvault — Your premium streaming vault. Watch exclusive curated video content.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.send(xml);
});

app.get('/og-image/:id', handleOgImage);
// Dynamic Sitemap - auto-generates from the videos database
app.get('/sitemap.xml', (req, res) => {
  const escapeXml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const videos = loadVideos().filter((v) => v && v.published !== false);
  const now = new Date().toISOString();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n';

  // Homepage
  xml += '  <url>\n';
  xml += '    <loc>' + SITE + '/</loc>\n';
  xml += '    <lastmod>' + now + '</lastmod>\n';
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n';

  // Demand page
  xml += '  <url>\n';
  xml += '    <loc>' + SITE + '/demand.html</loc>\n';
  xml += '    <lastmod>' + now + '</lastmod>\n';
  xml += '    <changefreq>weekly</changefreq>\n';
  xml += '    <priority>0.6</priority>\n';
  xml += '  </url>\n';

  // Video pages
  videos.forEach(function (v) {
    xml += '  <url>\n';
    xml += '    <loc>' + SITE + '/watch?v=' + escapeXml(v.id) + '</loc>\n';
    xml += '    <lastmod>' + (v.uploadedAt || now) + '</lastmod>\n';
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';
    xml += '    <video:video>\n';
    xml += '      <video:thumbnail_loc>' + escapeXml(v.thumbnailUrl || (SITE + '/og-image/' + v.id + '.jpg')) + '</video:thumbnail_loc>\n';
    xml += '      <video:title>' + escapeXml(v.title || 'Video') + '</video:title>\n';
    xml += '      <video:description>' + escapeXml(clip(v.description || v.title || '', 300)) + '</video:description>\n';
    xml += '      <video:player_loc>' + SITE + '/api/embed/' + escapeXml(v.id) + '</video:player_loc>\n';
    xml += '      <video:publication_date>' + (v.uploadedAt || now) + '</video:publication_date>\n';
    xml += '      <video:family_friendly>no</video:family_friendly>\n';
    if (v.genre) xml += '      <video:tag>' + escapeXml(v.genre) + '</video:tag>\n';
    xml += '    </video:video>\n';
    xml += '  </url>\n';
  });

  xml += '</urlset>';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});

app.get('/api/videos', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  res.json(loadVideos().filter((video) => video && video.published !== false));
});

app.get('/api/videos/:id/downloads', (req, res) => {
  const video = loadVideos().find((item) => item && item.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  res.json({ downloads: video.downloads || {} });
});

app.get('/api/videos/:id', (req, res) => {
  const video = loadVideos().find((item) => item && item.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  res.json(video);
});
app.get(['/admin', '/admin.html'], (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  let html = fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8');
  html = decorateHtml(html, ['/js/admin-live.js?v=1']);
  res.type('html').send(html);
});

app.get('/api/admin/vod/rules', requireAdmin, (req, res) => { res.json(loadVodRules()); });
app.post('/api/admin/vod/rules', requireAdmin, async (req, res) => {
  const { rules } = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'Rules must be an array' });
  await saveVodRules(rules);
  res.json({ success: true });
});

app.get('/api/admin/vod/requests', requireAdmin, (req, res) => {
  res.json(loadVodRequests().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
});

app.put('/api/admin/vod/requests/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const requests = loadVodRequests();
  const reqItem = requests.find(r => r.id === req.params.id);
  if (!reqItem) return res.status(404).json({ error: 'Not found' });
  reqItem.status = status;
  await saveVodRequests(requests);
  res.json({ success: true });
});
app.post('/api/admin/vod/requests/:id/notify', requireAdmin, async (req, res) => {
  res.json({ success: true });
});
app.delete('/api/admin/vod/requests/:id', requireAdmin, async (req, res) => {
  let requests = loadVodRequests();
  requests = requests.filter(r => r.id !== req.params.id);
  await saveVodRequests(requests);
  res.json({ success: true });
});

app.get('/api/embed/:id', (req, res) => {
  const videos = loadVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video || video.published === false) return res.status(404).send('Video not found');
  const title = (video.title || 'Video').replace(/"/g, '&quot;');
  const thumb = video.thumbnailUrl || '';
  const videoUrl = video.videoUrl || '';
  const isHls = videoUrl.includes('.m3u8');
  res.send(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <style>*{margin:0;padding:0}body{background:#000}video{width:100%;height:100vh;object-fit:contain}</style>
    ${isHls ? '<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>' : ''}
  </head><body>
    <video id="player" controls playsinline ${thumb ? `poster="${thumb}"` : ''} ${!isHls ? `src="${videoUrl}"` : ''}></video>
    ${isHls ? `<script>
      if(Hls.isSupported()){var h=new Hls();h.loadSource("${videoUrl}");h.attachMedia(document.getElementById("player"));}
      else if(document.getElementById("player").canPlayType("application/vnd.apple.mpegurl")){document.getElementById("player").src="${videoUrl}";}
    </script>` : ''}
  </body></html>`);
});


// Live Traffic API (real-time stats for admin dashboard)
const liveTraffic = { visitors: new Map(), pageviews: 0, watches: 0, countries: new Set(), lastReset: new Date().toDateString() };

function resetLiveTrafficIfNewDay() {
  const today = new Date().toDateString();
  if (liveTraffic.lastReset !== today) {
    liveTraffic.visitors.clear();
    liveTraffic.pageviews = 0;
    liveTraffic.watches = 0;
    liveTraffic.countries.clear();
    liveTraffic.lastReset = today;
  }
}

// Track live traffic middleware (after existing visitor middleware)
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.includes('.')) return next();
  if (isRequestBot(req) || isAdmin(req)) return next();
  
  resetLiveTrafficIfNewDay();
  
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const now = Date.now();
  
  // Track active visitor (active in last 5 minutes)
  liveTraffic.visitors.set(ip, now);
  liveTraffic.pageviews++;
  
  // Track country from CF header if available
  const country = req.headers['cf-ipcountry'];
  if (country && country !== 'XX') liveTraffic.countries.add(country);
  
  // Track watches
  if (req.path === '/watch' && req.query.v) {
    liveTraffic.watches++;
  }
  
  // Clean expired visitors (older than 5 minutes)
  for (const [visitorIp, timestamp] of liveTraffic.visitors) {
    if (now - timestamp > 5 * 60 * 1000) liveTraffic.visitors.delete(visitorIp);
  }
  
  next();
});

app.get('/api/admin/live-traffic', requireAdmin, (req, res) => {
  resetLiveTrafficIfNewDay();
  const now = Date.now();
  
  // Count visitors active in last 5 minutes
  let liveCount = 0;
  for (const [, timestamp] of liveTraffic.visitors) {
    if (now - timestamp <= 5 * 60 * 1000) liveCount++;
  }
  
  res.json({
    liveVisitors: liveCount,
    pageviewsToday: liveTraffic.pageviews,
    watchesToday: liveTraffic.watches,
    countriesLive: liveTraffic.countries.size || (liveCount > 0 ? 1 : 0)
  });
});

app.get('/watch', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'watch.html'), 'utf8');
  const video = loadVideos().find((item) => item && item.id === req.query.v);
  const title = video ? (video.title || 'Watch') + ' - StreamXvault' : 'Watch - StreamXvault';
  let descRaw = (video && (video.description || video.shortDescription)) || '';
  if (descRaw.length < 90) {
    const videoTitle = (video && video.title) || 'video';
    descRaw = descRaw ? (descRaw + '. Watch ' + videoTitle + ' in full HD streaming with fast download options on StreamXvault.')
                      : ('Watch ' + videoTitle + ' on StreamXvault. Stream exclusive full HD scenes, multiple download resolutions, and fresh daily video updates.');
  }
  const description = clip(descRaw, 160);
  const url = video ? SITE + '/watch?v=' + encodeURIComponent(video.id) : SITE + '/watch';
  html = injectHead(html, {
    title: title,
    description: description,
    tags: previewTags({ title: title, description: description, url: url, id: video ? video.id : 'home' })
  });

  // --- SSR: Inject real content into HTML body for SEO ---
  if (video) {
    // Build JSON-LD VideoObject structured data
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: video.title || 'Video',
      description: clip(video.description || video.title || '', 300),
      thumbnailUrl: video.thumbnailUrl || (SITE + '/og-image/' + encodeURIComponent(video.id) + '.jpg'),
      uploadDate: video.uploadedAt || new Date().toISOString(),
      contentUrl: url,
      embedUrl: SITE + '/api/embed/' + encodeURIComponent(video.id),
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: { '@type': 'WatchAction' },
        userInteractionCount: Number(video.views || 0)
      },
      publisher: {
        '@type': 'Organization',
        name: 'StreamXvault',
        url: SITE,
        logo: { '@type': 'ImageObject', url: SITE + '/images/logo.png' }
      }
    };
    if (video.genre) jsonLd.genre = video.genre;

    // JSON-LD script tag in <head>
    const jsonLdTag = '<script type="application/ld+json">' + JSON.stringify(jsonLd) + '</script>';
    html = html.replace(/<\/head>/i, jsonLdTag + '\n</head>');

    // SSR: Populate existing elements directly in the HTML template (avoids duplicate h1 tags)
    const ssrTitle = escapeHtml(video.title || 'Video');
    const ssrDesc = escapeHtml(video.description || video.shortDescription || '');
    const ssrDate = video.uploadedAt ? escapeHtml(new Date(video.uploadedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })) : '';

    // Directly replace placeholders in watch.html so there is exactly ONE <h1> tag on the page
    html = html.replace(/<h1 id="video-title">[^<]*<\/h1>/i, '<h1 id="video-title">' + ssrTitle + '</h1>');
    html = html.replace(/<div class="video-description" id="video-description">[\s\S]*?<\/div>/i, '<div class="video-description" id="video-description">' + ssrDesc + '</div>');
    if (ssrDate) {
      html = html.replace(/<span id="video-date">[^<]*<\/span>/i, '<span id="video-date">' + ssrDate + '</span>');
    }

    // Attach watch tracking script
    html = html.replace(/<\/body>/i, '<script>document.addEventListener("DOMContentLoaded",function(){if(window.sxvTrackWatch)window.sxvTrackWatch(' + JSON.stringify(video.id) + ',' + JSON.stringify(video.genre || '') + ');});</script>\n</body>');
  }

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.type('html').send(html);
});
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const videos = loadVideos().filter((item) => item && item.published !== false);
  const latest = videos[0];
  const title = 'StreamXvault - Official Premium Streaming Platform';
  const description = latest
    ? clip('Watch ' + (latest.title || 'trending videos') + ' and exclusive streaming content on StreamXvault. Explore full HD scenes, multiple genres, and daily releases.', 160)
    : 'StreamXvault is your premium streaming platform. Watch exclusive curated video releases, browse multiple categories, and stream in full HD without buffering.';
  html = injectHead(html, {
    title: title,
    description: description,
    tags: previewTags({ title: title, description: description, url: SITE + '/', id: latest ? latest.id : 'home' })
  });

  // --- SSR: Inject JSON-LD WebSite + ItemList and video listing for SEO ---
  if (videos.length > 0) {
    const webSiteLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'StreamXvault',
      url: SITE,
      description: 'StreamXvault — Your premium streaming vault. Watch exclusive curated video content.'
    };
    const itemListLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: videos.slice(0, 20).map(function (v, i) {
        return {
          '@type': 'ListItem',
          position: i + 1,
          url: SITE + '/watch?v=' + encodeURIComponent(v.id),
          name: v.title || 'Video'
        };
      })
    };
    const ldTags = '<script type="application/ld+json">' + JSON.stringify(webSiteLd) + '</script>\n' +
                   '<script type="application/ld+json">' + JSON.stringify(itemListLd) + '</script>';
    html = html.replace(/<\/head>/i, ldTags + '\n</head>');

    // SSR video listing block — visible to Googlebot, hidden by JS for real users
    let ssrCards = '';
    videos.slice(0, 20).forEach(function (v) {
      ssrCards += '  <div><a href="/watch?v=' + escapeHtml(encodeURIComponent(v.id)) + '">' +
        '<h3>' + escapeHtml(v.title || 'Video') + '</h3>' +
        (v.thumbnailUrl ? '<img src="' + escapeHtml(v.thumbnailUrl) + '" alt="' + escapeHtml(v.title || '') + '" width="320" height="180" loading="lazy">' : '') +
        (v.genre ? '<span>' + escapeHtml(v.genre) + '</span>' : '') +
        '</a></div>\n';
    });
    const ssrBlock = '\n<!-- SSR Content for SEO -->\n' +
      '<div id="ssr-content" class="ssr-seo-content">\n' +
      '<h2>' + escapeHtml(videos.length + ' Videos on StreamXvault') + '</h2>\n' +
      ssrCards +
      '</div>\n' +
      '<script>document.addEventListener("DOMContentLoaded",function(){var s=document.getElementById("ssr-content");if(s)s.style.display="none";});</script>\n';
    html = html.replace(/<body[^>]*>/i, function (match) { return match + ssrBlock; });
  }

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.type('html').send(html);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('StreamXvault listening on ' + PORT);
  syncVideosFromR2();
});



