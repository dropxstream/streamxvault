/**
 * StreamXvault — Express Server
 * Main application server with API routes
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createStorage } = require('./storage');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Initialize storage
const storage = createStorage();

// Data file path
const DATA_FILE = path.join(__dirname, 'data', 'videos.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'streamxvault-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer config for file uploads (memory storage for flexibility)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      const videoTypes = /mp4|webm|ogg|mov|avi|mkv/;
      const ext = path.extname(file.originalname).toLowerCase().slice(1);
      if (videoTypes.test(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed'));
      }
    } else if (file.fieldname === 'thumbnail') {
      const imgTypes = /jpeg|jpg|png|webp|gif/;
      const ext = path.extname(file.originalname).toLowerCase().slice(1);
      if (imgTypes.test(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for thumbnails'));
      }
    } else {
      cb(null, true);
    }
  }
});

// ==================== Helper Functions ====================

function loadVideos() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveVideos(videos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(videos, null, 2));
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Admin login required.' });
  }
}

// ==================== Auth Routes ====================

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ success: true, message: 'Logged in as admin' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logged out' });
});

app.get('/api/auth/status', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ==================== Video Routes ====================

// Get all videos
app.get('/api/videos', (req, res) => {
  const videos = loadVideos();
  const { search } = req.query;

  let filtered = videos.filter(v => v.published !== false);

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(v =>
      v.title.toLowerCase().includes(q) ||
      (v.description && v.description.toLowerCase().includes(q))
    );
  }

  // Sort by upload date, newest first
  filtered.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json(filtered);
});

// Get all videos (admin - includes unpublished)
app.get('/api/admin/videos', requireAdmin, (req, res) => {
  const videos = loadVideos();
  videos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json(videos);
});

// Get single video
app.get('/api/videos/:id', (req, res) => {
  const videos = loadVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  // Increment view count
  video.views = (video.views || 0) + 1;
  saveVideos(videos);

  res.json(video);
});

// Upload video
app.post('/api/videos/upload', requireAdmin, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files.video) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const videoFile = req.files.video[0];
    const videoId = uuidv4();
    const videoExt = path.extname(videoFile.originalname);
    const videoFilename = `${videoId}${videoExt}`;

    // Upload video to storage
    const videoUrl = await storage.upload(videoFilename, videoFile.buffer, videoFile.mimetype);

    // Handle thumbnail
    let thumbnailUrl = null;
    if (req.files.thumbnail) {
      const thumbFile = req.files.thumbnail[0];
      const thumbExt = path.extname(thumbFile.originalname);
      const thumbFilename = `thumb_${videoId}${thumbExt}`;
      thumbnailUrl = await storage.upload(thumbFilename, thumbFile.buffer, thumbFile.mimetype);
    }

    const videoData = {
      id: videoId,
      title: req.body.title || 'Untitled Video',
      description: req.body.description || '',
      videoUrl,
      thumbnailUrl,
      duration: req.body.duration || null,
      views: 0,
      published: true,
      uploadedAt: new Date().toISOString(),
      videoFilename,
      thumbnailFilename: req.files.thumbnail ? `thumb_${videoId}${path.extname(req.files.thumbnail[0].originalname)}` : null
    };

    const videos = loadVideos();
    videos.push(videoData);
    saveVideos(videos);

    res.json({ success: true, video: videoData });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// Update video
app.put('/api/videos/:id', requireAdmin, upload.fields([
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    const videos = loadVideos();
    const index = videos.findIndex(v => v.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Video not found' });
    }

    if (req.body.title) videos[index].title = req.body.title;
    if (req.body.description !== undefined) videos[index].description = req.body.description;
    if (req.body.published !== undefined) videos[index].published = req.body.published === 'true' || req.body.published === true;

    // Handle new thumbnail upload
    if (req.files && req.files.thumbnail) {
      // Delete old thumbnail if exists
      if (videos[index].thumbnailFilename) {
        try { await storage.delete(videos[index].thumbnailFilename); } catch {}
      }
      const thumbFile = req.files.thumbnail[0];
      const thumbExt = path.extname(thumbFile.originalname);
      const thumbFilename = `thumb_${req.params.id}${thumbExt}`;
      videos[index].thumbnailUrl = await storage.upload(thumbFilename, thumbFile.buffer, thumbFile.mimetype);
      videos[index].thumbnailFilename = thumbFilename;
    }

    saveVideos(videos);
    res.json({ success: true, video: videos[index] });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

// Delete video
app.delete('/api/videos/:id', requireAdmin, async (req, res) => {
  try {
    const videos = loadVideos();
    const index = videos.findIndex(v => v.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = videos[index];

    // Delete files from storage
    try { await storage.delete(video.videoFilename); } catch {}
    if (video.thumbnailFilename) {
      try { await storage.delete(video.thumbnailFilename); } catch {}
    }

    videos.splice(index, 1);
    saveVideos(videos);
    res.json({ success: true, message: 'Video deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
});

// Get stats
app.get('/api/stats', requireAdmin, (req, res) => {
  const videos = loadVideos();
  const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
  const totalVideos = videos.length;
  const publishedVideos = videos.filter(v => v.published !== false).length;

  res.json({ totalVideos, publishedVideos, totalViews });
});

// Trust proxy (for production behind Nginx)
app.set('trust proxy', 1);

// Dynamic Sitemap for SEO
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const videos = loadVideos().filter(v => v.published !== false);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

  videos.forEach(video => {
    xml += `
  <url>
    <loc>${baseUrl}/watch?v=${video.id}</loc>
    <lastmod>${video.uploadedAt ? new Date(video.uploadedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  });

  xml += `\n</urlset>`;

  res.set('Content-Type', 'application/xml');
  res.send(xml);
});

// SPA fallback — serve pages
app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║     🎬 StreamXvault is running!           ║
  ║                                           ║
  ║     🌐 http://localhost:${PORT}              ║
  ║     🔐 Admin: http://localhost:${PORT}/admin  ║
  ║                                           ║
  ║     Storage: ${(process.env.STORAGE_MODE || 'local').toUpperCase().padEnd(28)}║
  ╚═══════════════════════════════════════════╝
  `);
});
