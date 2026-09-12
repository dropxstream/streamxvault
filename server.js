const path = require('path');
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadVideos() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'data', 'videos.json'), 'utf8');
    const videos = JSON.parse(raw);
    return Array.isArray(videos) ? videos : [];
  } catch (err) {
    return [];
  }
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
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('StreamXvault listening on ' + PORT);
});
