const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const storage = require('./storage'); // R2 storage helper

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'manoj720';
const JWT_SECRET = process.env.JWT_SECRET || 'streamxvault_secret_key_123';

const DATA_FILE = path.join(__dirname, 'data', 'videos.json');
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');
const DB_KEY = 'db/videos.json';
const STATS_KEY = 'db/stats.json';

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

// Track visitors middleware
app.use((req, res, next) => {
  // Ignore API calls, static files
  if (req.path.startsWith('/api') || req.path.includes('.')) return next();
  
  // Ignore Bots & Crawlers
  if (isRequestBot(req)) return next();

  // Ignore Admin visits (via token or query)
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
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
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
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

// Get Videos
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
  res.json(filtered.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)));
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

  res.json(video);
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

app.post('/api/upload/complete', requireAdmin, async (req, res) => {
  try {
    const videos = loadVideos();
    const videoData = {
      ...req.body,
      views: 0,
      likes: 0,
      published: true,
      uploadedAt: new Date().toISOString()
    };
    videos.push(videoData);
    await saveVideos(videos);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Like Video (Bot Filtered)
app.post('/api/videos/:id/like', async (req, res) => {
  if (isRequestBot(req)) return res.json({ success: false });
  const videos = loadVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (video) {
    video.likes = (video.likes || 0) + 1;
    await saveVideos(videos);
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

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 StreamXvault Server running on port ${PORT}`);
  // Initial R2 Sync
  if (storage.mode === 'r2') {
     storage.download(DB_KEY).then(data => {
        if (data) fs.writeFileSync(DATA_FILE, data);
        console.log('📦 Database synced from R2');
     }).catch(() => {});
     storage.download(STATS_KEY).then(data => {
        if (data) fs.writeFileSync(STATS_FILE, data);
        console.log('📈 Stats synced from R2');
     }).catch(() => {});
  }
});
