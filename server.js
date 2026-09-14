const path = require('path');
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const SITE = 'https://streamxvault.online';
const DEFAULT_IMAGE = SITE + '/images/logo.png';

app.disable('x-powered-by');
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

function loadVideos() {
  try {
    const videos = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'videos.json'), 'utf8'));
    return Array.isArray(videos) ? videos : [];
  } catch (err) {
    return [];
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

function safeImage(url) {
  if (typeof url !== 'string') return DEFAULT_IMAGE;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return DEFAULT_IMAGE;
  if (/[<>"']/.test(trimmed)) return DEFAULT_IMAGE;
  return trimmed;
}

function clip(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, '') + '\u2026';
}

function previewTags({ title, description, url, image }) {
  const t = escapeHtml(clip(title, 70));
  const d = escapeHtml(clip(description, 160));
  const u = escapeHtml(url);
  const img = escapeHtml(safeImage(image));
  return [
    '<meta name="rating" content="adult">',
    '<link rel="canonical" href="' + u + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="StreamXvault">',
    '<meta property="og:title" content="' + t + '">',
    '<meta property="og:description" content="' + d + '">',
    '<meta property="og:url" content="' + u + '">',
    '<meta property="og:image" content="' + img + '">',
    '<meta property="og:image:secure_url" content="' + img + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + t + '">',
    '<meta name="twitter:description" content="' + d + '">',
    '<meta name="twitter:image" content="' + img + '">'
  ].join('\n  ');
}

function injectHead(html, { title, description, tags }) {
  html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + escapeHtml(title) + '</title>');
  html = html.replace(
    /<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/i,
    '<meta name="description" content="' + escapeHtml(clip(description, 160)) + '">'
  );
  if (!/property=["']og:title["']/.test(html)) {
    html = html.replace(/<head[^>]*>/i, function (open) { return open + '\n  ' + tags; });
  }
  return html;
}

app.get('/api/videos', (req, res) => {
  const videos = loadVideos().filter((video) => video && video.published !== false);
  res.json(videos);
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
  const file = path.join(__dirname, 'public', 'watch.html');
  let html = fs.readFileSync(file, 'utf8');
  const video = loadVideos().find((item) => item && item.id === req.query.v);
  if (video) {
    const title = (video.title || 'Watch') + ' - StreamXvault';
    const description = video.shortDescription || video.description || ('Watch ' + (video.title || 'this video') + ' on StreamXvault.');
    const url = SITE + '/watch?v=' + encodeURIComponent(video.id);
    html = injectHead(html, {
      title: title,
      description: description,
      tags: previewTags({ title: title, description: description, url: url, image: video.thumbnailUrl })
    });
  } else if (req.query.v) {
    res.status(404);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.get('/', (req, res) => {
  const file = path.join(__dirname, 'public', 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const latest = loadVideos().find((item) => item && item.published !== false);
  const title = 'StreamXvault \u2014 Official Premium Streaming Platform';
  const description = latest
    ? clip((latest.title || '') + ' and more videos on StreamXvault.', 160)
    : 'StreamXvault \u2014 Watch curated premium video content.';
  const image = latest ? latest.thumbnailUrl : DEFAULT_IMAGE;
  html = injectHead(html, {
    title: title,
    description: description,
    tags: previewTags({ title: title, description: description, url: SITE + '/', image: image })
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('StreamXvault listening on ' + PORT);
});
