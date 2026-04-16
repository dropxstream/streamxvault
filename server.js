/**
 * StreamXvault — Express Server
 * Main application server with API routes
 * Database persisted to R2 — survives all redeployments
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer'); // file upload handling
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { createStorage } = require('./storage');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.SESSION_SECRET || 'streamxvault-secret';

// Initialize storage
const storage = createStorage();

// Data file path (local cache)
const DATA_FILE = path.join(__dirname, 'data', 'videos.json');
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');
const DB_KEY = '_database/videos.json'; 
const STATS_KEY = '_database/stats.json'; 

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]');
}
if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(STATS_FILE, JSON.stringify({ totalVisitors: 0, uniqueIps: [] }));
}

// ==================== Helper Functions ====================

// Load database from R2 on startup (if available)
async function initDatabase() {
  if (storage.mode === 'r2') {
    try {
      console.log('📂 Loading video database from R2...');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const command = new GetObjectCommand({
        Bucket: storage.bucketName,
        Key: DB_KEY,
      });
      const response = await storage.client.send(command);
      const body = await response.Body.transformToString();
      const videos = JSON.parse(body);
      fs.writeFileSync(DATA_FILE, JSON.stringify(videos, null, 2));
      console.log('✅ SUCCESS: Loaded ' + videos.length + ' videos from R2 database');
      
      // Also load stats from R2
      try {
        const statsCmd = new GetObjectCommand({ Bucket: storage.bucketName, Key: STATS_KEY });
        const statsRes = await storage.client.send(statsCmd);
        const statsBody = await statsRes.Body.transformToString();
        fs.writeFileSync(STATS_FILE, statsBody);
        console.log('✅ SUCCESS: Loaded site stats from R2');
      } catch (e) {
        console.log('📝 No existing stats in R2, starting fresh');
      }
    } catch (err) {
      const code = err.name || err.Code || '';
      const httpCode = err.$metadata ? err.$metadata.httpStatusCode : 0;
      if (code === 'NoSuchKey' || httpCode === 404) {
        console.log('📝 No existing database in R2, starting fresh');
      } else {
        console.error('⚠️ Failed to load from R2:', code, err.message);
      }
    }
  } else {
    console.log('📁 Local storage mode - using local database');
  }
}

function loadVideos() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveVideos(videos) {
  // Save locally first
  fs.writeFileSync(DATA_FILE, JSON.stringify(videos, null, 2));

  // Also save to R2 using storage.upload method
  if (storage.mode === 'r2') {
    try {
      const jsonData = JSON.stringify(videos, null, 2);
      await storage.upload(DB_KEY, Buffer.from(jsonData), 'application/json');
      console.log('💾 Database backed up to R2 (' + videos.length + ' videos)');
    } catch (err) {
      console.error('❌ R2 DB backup failed:', err.message);
    }
  }
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

function loadStats() {
  try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); }
  catch { return { totalVisitors: 0, uniqueIps: [] }; }
}

// Track visitors middleware
app.use((req, res, next) => {
  // Ignore API calls, static files
  if (req.path.startsWith('/api') || req.path.includes('.')) return next();
  
  // Ignore Bots & Crawlers (Hardened)
  const ua = req.headers['user-agent'] || '';
  const botRegex = /bot|crawler|spider|google|bing|yandex|baidu|slurp|duckduck|postman|headless|axios|python|curl|wget|lighthouse|semrush|ahrefs|dotbot/i;
  if (botRegex.test(ua)) return next();

  // Ignore Admin visits
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// JWT-based auth middleware (survives server restarts)
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.isAdmin) {
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized. Admin login required.' });
    }
  } catch {
    res.status(401).json({ error: 'Session expired. Please login again.' });
  }
}

// ==================== SEO Routes ====================

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Sitemap: https://streamxvault.online/sitemap.xml`);
});

app.get('/sitemap.xml', (req, res) => {
  const videos = loadVideos();
  const publishedVideos = videos.filter(v => v.published !== false);
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://streamxvault.online/</loc>
    <priority>1.0</priority>
    <changefreq>daily</changefreq>
  </url>`;
  
  for (const video of publishedVideos) {
    xml += `
  <url>
    <loc>https://streamxvault.online/watch?v=${video.id}</loc>
    <lastmod>${new Date(video.uploadedAt).toISOString()}</lastmod>
    <priority>0.8</priority>
  </url>`;
  }
  
  xml += '\n</urlset>';
  
  res.type('application/xml');
  res.send(xml);
});

// ==================== Auth Routes ====================

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    // Create a JWT token that lasts 7 days
    const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, message: 'Logged in as admin', token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  // Client-side will delete the token
  res.json({ success: true, message: 'Logged out' });
});

app.get('/api/auth/status', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.json({ isAdmin: false });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ isAdmin: !!decoded.isAdmin });
  } catch {
    res.json({ isAdmin: false });
  }
});

// ==================== Video Routes ====================

// Get all videos
app.get('/api/videos', (req, res) => {
  const videos = loadVideos();
  const { search, genre } = req.query;

  let filtered = videos.filter(v => v.published !== false);

  // Apply genre filter first
  if (genre) {
    const g = genre.toLowerCase();
    filtered = filtered.filter(v => v.genre && v.genre.toLowerCase() === g);
  }

  // Then apply search filter
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
app.get('/api/videos/:id', async (req, res) => {
  const videos = loadVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  // View counting logic
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  let isAdmin = false;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      isAdmin = !!decoded.isAdmin;
    } catch (e) {}
  }

  // Bot Filter for views too
  const ua = req.headers['user-agent'] || '';
  const botRegex = /bot|crawler|spider|google|bing|yandex|baidu|slurp|duckduck|postman|headless|axios|python|curl|wget|lighthouse|semrush|ahrefs|dotbot/i;
  const isBot = botRegex.test(ua);

  // 1. Don't count Admin views (to keep stats clean)
  // 2. Don't count Bots
  // 3. Only count once per session for normal users
  const sessionKey = `view_${video.id}`;
  const cookies = req.headers.cookie || '';
  // Precise cookie check using regex to avoid substring matches
  const hasViewed = new RegExp(`(?:^|; )${sessionKey}=`).test(cookies);
  
  if (!isAdmin && !isBot && !hasViewed) {
    video.views = (video.views || 0) + 1;
    // Set a cross-browser compatible cookie (Lax for maximum visibility)
    res.setHeader('Set-Cookie', `${sessionKey}=1; Max-Age=3600; Path=/; SameSite=Lax; HttpOnly`);
    await saveVideos(videos);
  }

  res.json(video);
});

// ==================== Presigned Upload (Direct to R2) ====================

// Get presigned URL for direct browser -> R2 upload
app.post('/api/upload/presign', requireAdmin, async (req, res) => {
  try {
    const { filename, contentType, fileType } = req.body;
    console.log(`📤 Presign request: filename=${filename}, type=${contentType}, fileType=${fileType}`);

    const id = uuidv4();
    const ext = path.extname(filename);

    let key;
    if (fileType === 'thumbnail') {
      key = `thumb_${id}${ext}`;
    } else {
      key = `${id}${ext}`;
    }

    // Check if storage supports presigned URLs
    if (storage.mode !== 'r2') {
      console.log('📁 Local storage mode - falling back to server upload');
      return res.json({ direct: false, message: 'Using server upload for local storage' });
    }

    console.log(`🔑 Generating presigned URL for key: ${key}`);
    const presignedUrl = await storage.getPresignedUploadUrl(key, contentType);
    const publicUrl = storage.getUrl(key);
    console.log(`✅ Presigned URL generated successfully for ${key}`);

    res.json({
      direct: true,
      uploadUrl: presignedUrl,
      publicUrl,
      key,
      id
    });
  } catch (err) {
    console.error('❌ Presign error:', err.message);
    console.error('❌ Full error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL: ' + err.message });
  }
});

// ==================== Multipart Upload (for large files) ====================

// Step 1: Create multipart upload
app.post('/api/upload/multipart/create', requireAdmin, async (req, res) => {
  try {
    const { filename, contentType, fileType } = req.body;
    const id = uuidv4();
    const ext = path.extname(filename);

    let key;
    if (fileType === 'thumbnail') {
      key = `thumb_${id}${ext}`;
    } else {
      key = `${id}${ext}`;
    }

    if (storage.mode !== 'r2') {
      return res.json({ direct: false });
    }

    console.log(`📦 Creating multipart upload for: ${key}`);
    const uploadId = await storage.createMultipartUpload(key, contentType);
    console.log(`✅ Multipart upload created: ${uploadId}`);

    res.json({
      direct: true,
      uploadId,
      key,
      id,
      publicUrl: storage.getUrl(key)
    });
  } catch (err) {
    console.error('❌ Multipart create error:', err.message);
    res.status(500).json({ error: 'Failed to create multipart upload: ' + err.message });
  }
});

// Step 2: Get presigned URL for each part
app.post('/api/upload/multipart/presign-part', requireAdmin, async (req, res) => {
  try {
    const { key, uploadId, partNumber } = req.body;

    const url = await storage.getPresignedPartUrl(key, uploadId, partNumber);
    res.json({ url, partNumber });
  } catch (err) {
    console.error('❌ Part presign error:', err.message);
    res.status(500).json({ error: 'Failed to presign part: ' + err.message });
  }
});

// Step 3: Complete multipart upload
app.post('/api/upload/multipart/complete', requireAdmin, async (req, res) => {
  try {
    const { key, uploadId, parts } = req.body;

    console.log(`✅ Completing multipart upload: ${key} (${parts.length} parts)`);
    const publicUrl = await storage.completeMultipartUpload(key, uploadId, parts);
    console.log(`🎉 Multipart upload complete: ${key}`);

    res.json({ success: true, publicUrl });
  } catch (err) {
    console.error('❌ Multipart complete error:', err.message);
    res.status(500).json({ error: 'Failed to complete multipart upload: ' + err.message });
  }
});

// Abort multipart upload (cleanup on failure)
app.post('/api/upload/multipart/abort', requireAdmin, async (req, res) => {
  try {
    const { key, uploadId } = req.body;
    await storage.abortMultipartUpload(key, uploadId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to abort upload' });
  }
});

// Register video after direct upload completes
app.post('/api/upload/complete', requireAdmin, async (req, res) => {
  try {
    const { videoId, title, genre, description, videoUrl, videoFilename, thumbnailUrl, thumbnailFilename } = req.body;

    const videoData = {
      id: videoId,
      title: title || 'Untitled Video',
      genre: genre || '',
      description: description || '',
      videoUrl,
      thumbnailUrl: thumbnailUrl || null,
      duration: null,
      views: 0,
      likes: 0,
      published: true,
      uploadedAt: new Date().toISOString(),
      videoFilename,
      thumbnailFilename: thumbnailFilename || null,
      bunnyId: req.body.bunnyId || null,
      downloads: {
        p720: req.body.dl720 || null,
        p1080: req.body.dl1080 || null
      }
    };

    const videos = loadVideos();
    videos.push(videoData);
    await saveVideos(videos);

    res.json({ success: true, video: videoData });
  } catch (err) {
    console.error('Complete error:', err);
    res.status(500).json({ error: 'Failed to register video' });
  }
});

// Register video with external links
app.post('/api/admin/videos/external', requireAdmin, async (req, res) => {
  try {
    const { title, genre, description, videoUrl, thumbnailUrl } = req.body;

    const videoData = {
      id: uuidv4(),
      title: title || 'Untitled Video',
      genre: genre || '',
      description: description || '',
      videoUrl,
      thumbnailUrl: thumbnailUrl || null,
      duration: null,
      views: 0,
      likes: 0,
      published: true,
      uploadedAt: new Date().toISOString(),
      videoFilename: null,
      thumbnailFilename: null,
      bunnyId: req.body.bunnyId || null,
      downloads: {
        p720: req.body.dl720 || null,
        p1080: req.body.dl1080 || null
      }
    };

    const videos = loadVideos();
    videos.push(videoData);
    await saveVideos(videos);

    res.json({ success: true, video: videoData });
  } catch (err) {
    console.error('External link error:', err);
    res.status(500).json({ error: 'Failed to register external video' });
  }
});

// Legacy upload (fallback for local storage)
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
      genre: req.body.genre || '',
      description: req.body.description || '',
      videoUrl,
      thumbnailUrl,
      duration: req.body.duration || null,
      views: 0,
      likes: 0,
      published: true,
      uploadedAt: new Date().toISOString(),
      videoFilename,
      thumbnailFilename: req.files.thumbnail ? `thumb_${videoId}${path.extname(req.files.thumbnail[0].originalname)}` : null,
      bunnyId: req.body.bunnyId || null,
      downloads: {
        p720: req.body.dl720 || null,
        p1080: req.body.dl1080 || null
      }
    };

    const videos = loadVideos();
    videos.push(videoData);
    await saveVideos(videos);

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
    if (req.body.genre !== undefined) videos[index].genre = req.body.genre;
    if (req.body.description !== undefined) videos[index].description = req.body.description;
    if (req.body.published !== undefined) videos[index].published = req.body.published === 'true' || req.body.published === true;
    if (req.body.bunnyId !== undefined) videos[index].bunnyId = req.body.bunnyId || null;
    
    // Handle downloads
    if (req.body.dl720 !== undefined || req.body.dl1080 !== undefined) {
      if (!videos[index].downloads) videos[index].downloads = {};
      if (req.body.dl720 !== undefined) videos[index].downloads.p720 = req.body.dl720 || null;
      if (req.body.dl1080 !== undefined) videos[index].downloads.p1080 = req.body.dl1080 || null;
    }
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

    await saveVideos(videos);
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
    await saveVideos(videos);
    res.json({ success: true, message: 'Video deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
});

// Get stats
app.get('/api/stats', requireAdmin, (req, res) => {
  const videos = loadVideos();
  const stats = loadStats();
  const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
  const totalLikes = videos.reduce((sum, v) => sum + (v.likes || 0), 0);
  const totalVideos = videos.length;
  const publishedVideos = videos.filter(v => v.published !== false).length;

  res.json({ 
    totalVideos, 
    publishedVideos, 
    totalViews, 
    totalLikes,
    totalVisitors: stats.totalVisitors || 0 
  });
});

// Like a video
app.post('/api/videos/:id/like', async (req, res) => {
  try {
    const videos = loadVideos();
    const video = videos.find(v => v.id === req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    
    video.likes = (video.likes || 0) + 1;
    await saveVideos(videos);
    res.json({ success: true, likes: video.likes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to like video' });
  }
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
    // Determine player/content location
    let playerUrl = `${baseUrl}/watch?v=${video.id}`;
    let thumbUrl = video.thumbnailUrl || `${baseUrl}/images/logo.png`;
    let contentUrl = video.videoUrl || '';
    
    // If Bunny Stream, use the specialized iframe URL for indexing
    if (video.bunnyId) {
       playerUrl = `https://iframe.mediadelivery.net/embed/400619/${video.bunnyId}`;
    }

    xml += `
  <url>
    <loc>${baseUrl}/watch?v=${video.id}</loc>
    <lastmod>${video.uploadedAt ? new Date(video.uploadedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <video:video>
      <video:thumbnail_loc>${thumbUrl}</video:thumbnail_loc>
      <video:title>${video.title.replace(/[&<>"']/g, '')}</video:title>
      <video:description>${(video.description || 'Watch ' + video.title + ' on StreamXvault').replace(/[&<>"']/g, '')}</video:description>
      ${contentUrl ? `<video:content_loc>${contentUrl}</video:content_loc>` : ''}
      <video:player_loc>${playerUrl}</video:player_loc>
      <video:publication_date>${video.uploadedAt ? new Date(video.uploadedAt).toISOString() : new Date().toISOString()}</video:publication_date>
    </video:video>
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

// Start server (load database from R2 first)
async function startServer() {
  await initDatabase();

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
}

startServer();
