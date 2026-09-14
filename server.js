const path = require('path');
const fs = require('fs');
const express = require('express');
const fetch = global.fetch || require('node-fetch');
const { createStorage } = require('./storage');

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const SITE = 'https://streamxvault.online';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'videos.json');
const DB_KEY = '_database/videos.json';
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
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

function withAgeGate(html) {
  if (html.indexOf('/js/age-gate.js') !== -1) return html;
  return html.replace(/<\/body>/i, '<script src="/js/age-gate.js?v=1"></script>\n</body>');
}

app.get(['/demand.html', '/demand-form.html'], (req, res) => {
  const name = req.path === '/demand-form.html' ? 'demand-form.html' : 'demand.html';
  const file = path.join(__dirname, 'public', name);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.type('html').send(withAgeGate(fs.readFileSync(file, 'utf8')));
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadVideos() {
  try {
    const videos = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(videos) ? videos : [];
  } catch (err) {
    return [];
  }
}

async function syncVideosFromR2() {
  if (!storage || storage.mode !== 'r2') {
    console.log('Skip R2 catalog sync, mode=' + (storage && storage.mode));
    return;
  }
  try {
    const remote = await storage.download(DB_KEY);
    if (remote && remote.length > 5) {
      fs.writeFileSync(DATA_FILE, remote);
      console.log('Catalog synced bytes=' + remote.length);
      return;
    }
    const fallback = await storage.download('videos.json');
    if (fallback && fallback.length > 5) fs.writeFileSync(DATA_FILE, fallback);
  } catch (err) {
    console.error('Catalog sync failed:', err.message);
  }
}

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
  return withAgeGate(html);
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

app.get('/og-image/:id', handleOgImage);

app.get('/api/videos', (req, res) => {
  res.json(loadVideos().filter((video) => video && video.published !== false));
});

app.get('/api/videos/:id', (req, res) => {
  const video = loadVideos().find((item) => item && item.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  res.json(video);
});

app.get(['/admin', '/admin.html'], (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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
  res.type('html').send(html);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('StreamXvault listening on ' + PORT);
  syncVideosFromR2();
});
