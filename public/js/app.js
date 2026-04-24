/**
 * StreamXvault — Home Page Logic
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

// ==================== Navbar Scroll Effect ====================
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ==================== Video Card Builder ====================
function createVideoCard(video) {
  const card = document.createElement('div');
  card.className = 'video-card';
  card.onclick = () => window.location.href = `/watch?v=${video.id}`;

  const thumbnailContent = video.thumbnailUrl
    ? `<img src="${video.thumbnailUrl}" alt="${video.title}" loading="lazy" decoding="async">`
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
      ${video.genre ? `<div style="display:inline-block; font-size: 0.7rem; background: var(--accent-gradient-pink); color: white; padding: 2px 8px; border-radius: 4px; margin-top: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(236,72,153,0.3);">${escapeHtml(video.genre)}</div>` : ''}
      <div class="card-meta" style="color: #cbd5e1 !important;">
        <span>👁️ ${views}</span>
        <span>🕐 ${timeAgo}</span>
      </div>
    </div>
  `;

  return card;
}

// ==================== Skeleton Loader ====================
function renderSkeletons(container, count = 8) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-card';
    skeleton.innerHTML = `
      <div class="skeleton skeleton-thumb"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-meta"></div>
    `;
    container.appendChild(skeleton);
  }
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

// ==================== Load Videos ====================
let allVideos = [];
let currentSearch = '';
let currentGenre = '';

function getAuthHeaders() {
  const token = localStorage.getItem('streamxvault_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function loadVideos() {
  const loadingEl = document.getElementById('videos-loading');
  const gridEl = document.getElementById('videos-grid');
  const emptyEl = document.getElementById('empty-state');
  const noResultsEl = document.getElementById('no-results');
  const recentSection = document.getElementById('recent-section');
  const countEl = document.getElementById('video-count');

  // Show loading skeletons
  gridEl.style.display = 'none';
  emptyEl.style.display = 'none';
  noResultsEl.style.display = 'none';
  loadingEl.style.display = 'grid';
  renderSkeletons(loadingEl);

  try {
    const params = new URLSearchParams();
    if (currentSearch) params.append('search', currentSearch);
    if (currentGenre) params.append('genre', currentGenre);
    
    const url = '/api/videos' + (params.toString() ? '?' + params.toString() : '');

    const res = await fetch(url, { headers: getAuthHeaders() });
    const videos = await res.json();
    allVideos = videos;

    // Hide loading
    loadingEl.style.display = 'none';

    if (videos.length === 0) {
      if (currentSearch || currentGenre) {
        noResultsEl.style.display = 'block';
      } else {
        emptyEl.style.display = 'block';
      }
      recentSection.style.display = 'none';
      countEl.textContent = '';
      updateHeroDefault();
      return;
    }

    // Update hero with latest video
    updateHero(videos[0]);

    // Render recent carousel (first 8 videos)
    if (!currentSearch && !currentGenre && videos.length > 1) {
      recentSection.style.display = 'block';
      const carousel = document.getElementById('recent-carousel');
      carousel.innerHTML = '';
      videos.slice(0, 8).forEach(v => {
        carousel.appendChild(createVideoCard(v));
      });
    } else {
      recentSection.style.display = 'none';
    }

    // Render Recommended Carousel (Local Algorithm)
    const recommendedSection = document.getElementById('recommended-section');
    if (recommendedSection) {
      let profile = null;
      try {
        const saved = localStorage.getItem('sxv_profile');
        if (saved) profile = JSON.parse(saved);
      } catch (e) {}

      if (!currentSearch && !currentGenre && profile && profile.genres && Object.keys(profile.genres).length > 0) {
        // Find top genre by identifying the one with the highest count
        const topGenre = Object.keys(profile.genres).reduce((a, b) => profile.genres[a] > profile.genres[b] ? a : b);
        
        // Find videos matching top genre (excluding the latest one shown in hero to avoid duplication)
        const recommendedVideos = videos.filter(v => v.genre === topGenre && v.id !== videos[0].id);
        
        if (recommendedVideos.length > 0) {
          recommendedSection.style.display = 'block';
          const recCarousel = document.getElementById('recommended-carousel');
          recCarousel.innerHTML = '';
          recommendedVideos.slice(0, 8).forEach(v => {
            recCarousel.appendChild(createVideoCard(v));
          });
        } else {
          recommendedSection.style.display = 'none';
        }
      } else {
        recommendedSection.style.display = 'none';
      }
    }

    // Render all videos grid
    gridEl.innerHTML = '';
    gridEl.style.display = 'grid';
    videos.forEach(v => {
      gridEl.appendChild(createVideoCard(v));
    });

    countEl.textContent = `${videos.length} video${videos.length !== 1 ? 's' : ''}`;

  } catch (err) {
    console.error('Failed to load videos:', err);
    loadingEl.style.display = 'none';
    showToast('Failed to load videos', 'error');
  }
}

// ==================== Hero Section ====================
function updateHero(video) {
  const heroTitle = document.getElementById('hero-title');
  const heroDesc = document.getElementById('hero-desc');
  const heroBg = document.getElementById('hero-bg');
  const heroPlayBtn = document.getElementById('hero-play-btn');
  const heroBadge = document.getElementById('hero-badge');
  const heroGenreBadge = document.getElementById('hero-genre-badge');

  heroTitle.textContent = video.title;
  heroDesc.textContent = video.description || 'Watch the latest content on StreamXvault.';

  if (video.genre) {
    heroGenreBadge.textContent = '🏷️ ' + video.genre;
    heroGenreBadge.style.display = 'inline-flex';
  } else {
    heroGenreBadge.style.display = 'none';
  }

  if (video.thumbnailUrl) {
    heroBg.style.backgroundImage = `url(${video.thumbnailUrl})`;
  }

  heroPlayBtn.style.display = 'inline-flex';
  heroPlayBtn.onclick = () => window.location.href = `/watch?v=${video.id}`;
  heroBadge.innerHTML = '🔴 Latest Upload';
}

function updateHeroDefault() {
  const heroTitle = document.getElementById('hero-title');
  const heroDesc = document.getElementById('hero-desc');
  const heroPlayBtn = document.getElementById('hero-play-btn');
  const heroGenreBadge = document.getElementById('hero-genre-badge');

  heroTitle.textContent = 'Welcome to StreamXvault';
  heroDesc.textContent = 'Your premium streaming platform. Watch curated video content shared by the admin — always fresh, always exciting.';
  heroPlayBtn.style.display = 'none';
  if(heroGenreBadge) heroGenreBadge.style.display = 'none';
}

// ==================== Search & Filter ====================
let searchTimeout;

document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  currentSearch = e.target.value.trim();
  searchTimeout = setTimeout(() => {
    loadVideos();
  }, 400);
});

// Prevent form submission if input is inside a form accidentally
document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
  }
});

function filterByGenre(genre) {
  currentGenre = genre;
  
  // Update button active states
  const buttons = document.querySelectorAll('.genre-filters .btn');
  buttons.forEach(btn => btn.className = 'btn btn-secondary');
  document.getElementById('filter-' + (genre || 'All')).className = 'btn btn-primary';
  
  loadVideos();
}

function clearSearch() {
  currentSearch = '';
  document.getElementById('search-input').value = '';
  loadVideos();
}

// ==================== Initialize ====================
document.addEventListener('DOMContentLoaded', () => {
  loadVideos();
});
