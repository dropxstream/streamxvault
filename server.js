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
  if (html.indexOf('/css/nav-fx.css') === -1) html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="/css/nav-fx.css?v=1">\n</head>');
  if (html.indexOf('/css/theme-dark.css') === -1) html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="/css/theme-dark.css?v=1">\n</head>');
  var scripts = ['/js/theme.js?v=2', '/js/tracker.js?v=1', '/js/age-gate.js?v=1'].concat(extraScripts || []);
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

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  maxAge: '7d',
  setHeaders: function (res, filePath) {
    if (/\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
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
    description: String(body.description || '').trim(),
    displayViews: String(body.displayViews || '').trim(),
    videoUrl: videoUrl,
    thumbnailUrl: String(body.thumbnailUrl || '').trim(),
    views: 0,
    likes: 0,
    published: true,
    downloads: { p480: String(body.dl480 || ''), p720: String(body.dl720 || ''), p1080: String(body.dl1080 || ''), p4k: String(body.dl4k || '') },
    uploadedAt: new Date().toISOString()
  };
  videos.unshift(video);
  saveVideos(videos);
  res.json(video);
});
app.put('/api/videos/:id', requireAdmin, (req, res) => {
  const videos = loadVideos();
  const video = videos.find((item) => item && item.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  const body = req.body || {};
  ['title', 'genre', 'description', 'displayViews', 'videoUrl', 'thumbnailUrl', 'published'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(body, key)) video[key] = body[key];
  });
  
  if (body.dl480 !== undefined || body.dl720 !== undefined || body.dl1080 !== undefined || body.dl4k !== undefined) {
    video.downloads = video.downloads || {};
    if (body.dl480 !== undefined) video.downloads.p480 = body.dl480;
    if (body.dl720 !== undefined) video.downloads.p720 = body.dl720;
    if (body.dl1080 !== undefined) video.downloads.p1080 = body.dl1080;
    if (body.dl4k !== undefined) video.downloads.p4k = body.dl4k;
  }
  saveVideos(videos);
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
  const description = video
    ? (video.shortDescription || video.description || ('Watch ' + (video.title || 'this video') + ' on StreamXvault.'))
    : 'Watch videos on StreamXvault.';
  const url = video ? SITE + '/watch?v=' + encodeURIComponent(video.id) : SITE + '/watch';
  html = injectHead(html, {
    title: title,
    description: description,
    tags: previewTags({ title: title, description: description, url: url, id: video ? video.id : 'home' })
  });
  if (video) {
    html = html.replace(/<\/body>/i, '<script>document.addEventListener("DOMContentLoaded",function(){if(window.sxvTrackWatch)window.sxvTrackWatch(' + JSON.stringify(video.id) + ',' + JSON.stringify(video.genre || '') + ');});</script>\n</body>');
  }
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.type('html').send(html);
});
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const latest = loadVideos().find((item) => item && item.published !== false);
  const title = 'StreamXvault - Official Premium Streaming Platform';
  const description = latest
    ? clip((latest.title || '') + ' and more videos on StreamXvault.', 160)
    : 'StreamXvault - Watch curated premium video content.';
  html = injectHead(html, {
    title: title,
    description: description,
    tags: previewTags({ title: title, description: description, url: SITE + '/', id: latest ? latest.id : 'home' })
  });
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.type('html').send(html);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('StreamXvault listening on ' + PORT);
  syncVideosFromR2();
});



