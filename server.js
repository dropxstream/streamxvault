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
// Support for .html extensions and clean URLs
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Redirect /admin to /admin.html
app.get('/admin', (req, res) => res.redirect('/admin.html'));

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
    res.json({ success: true, id: vId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create external video' });
  }
});

// Update Video Metadata (Edit)
app.put('/api/videos/:id', requireAdmin, upload.none(), async (req, res) => {
  try {
    const { title, genre, description, bunnyId, dl720, dl1080, published } = req.body;
    const videos = loadVideos();
    const video = videos.find(v => v.id === req.params.id);
    
    if (!video) return res.status(404).json({ error: 'Video not found' });

    video.title = title || video.title;
    video.genre = genre || video.genre;
    video.description = description || video.description;
    video.bunnyId = bunnyId || video.bunnyId;
    video.published = published === 'true' || published === true;
    
    video.downloads = {
      p720: dl720 || (video.downloads ? video.downloads.p720 : null),
      p1080: dl1080 || (video.downloads ? video.downloads.p1080 : null)
    };

    await saveVideos(videos);
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
