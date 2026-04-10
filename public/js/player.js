/**
 * StreamXvault — Video Player Logic
 */

// ==================== Toast Notifications ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==================== Utility Functions ====================
function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function formatViews(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
  return count.toString();
}

function getTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 2592000) return Math.floor(seconds / 86400) + 'd ago';
  if (seconds < 31536000) return Math.floor(seconds / 2592000) + 'mo ago';
  return Math.floor(seconds / 31536000) + 'y ago';
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// ==================== Create Video Card ====================
function createVideoCard(video) {
  const card = document.createElement('div');
  card.className = 'video-card';
  card.onclick = () => window.location.href = `/watch?v=${video.id}`;

  const thumbnailContent = video.thumbnailUrl
    ? `<img src="${video.thumbnailUrl}" alt="${video.title}" loading="lazy">`
    : `<div class="thumb-placeholder">🎬</div>`;

  const timeAgo = getTimeAgo(video.uploadedAt);
  const views = formatViews(video.views || 0);

  card.innerHTML = `
    <div class="thumbnail">
      ${thumbnailContent}
      <div class="play-overlay">
        <div class="play-btn">▶</div>
      </div>
    </div>
    <div class="card-info">
      <div class="card-title">${escapeHtml(video.title)}</div>
      <div class="card-meta">
        <span>👁️ ${views}</span>
        <span>🕐 ${timeAgo}</span>
      </div>
    </div>
  `;

  return card;
}

// ==================== Load Video ====================
async function loadVideo() {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get('v');

  if (!videoId) {
    showToast('No video specified', 'error');
    setTimeout(() => window.location.href = '/', 2000);
    return;
  }

  try {
    // Load current video
    const res = await fetch(`/api/videos/${videoId}`);
    if (!res.ok) throw new Error('Video not found');
    const video = await res.json();

    // Update page
    document.title = `${video.title} — StreamXvault`;

    const player = document.getElementById('video-player');
    player.src = video.videoUrl;

    document.getElementById('video-title').textContent = video.title;
    document.getElementById('video-views').textContent = `👁️ ${formatViews(video.views || 0)} views`;
    document.getElementById('video-date').textContent = `📅 ${formatDate(video.uploadedAt)}`;
    document.getElementById('video-description').textContent = video.description || 'No description provided.';

    // Load related videos
    const allRes = await fetch('/api/videos');
    const allVideos = await allRes.json();
    const relatedGrid = document.getElementById('related-grid');
    relatedGrid.innerHTML = '';

    const related = allVideos.filter(v => v.id !== videoId).slice(0, 6);
    if (related.length > 0) {
      related.forEach(v => {
        relatedGrid.appendChild(createVideoCard(v));
      });
    }

  } catch (err) {
    console.error('Failed to load video:', err);
    showToast('Video not found', 'error');
    setTimeout(() => window.location.href = '/', 2000);
  }
}

// ==================== Search (Redirect to Home) ====================
document.getElementById('search-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const query = e.target.value.trim();
    if (query) {
      window.location.href = `/?search=${encodeURIComponent(query)}`;
    }
  }
});

// ==================== Navbar Scroll ====================
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ==================== Initialize ====================
document.addEventListener('DOMContentLoaded', () => {
  loadVideo();
});
