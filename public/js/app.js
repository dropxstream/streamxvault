/**
 * StreamXvault — Home Page Logic
 */

// Shared utilities loaded from /js/utils.js

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
  const card = document.createElement('a');
  card.className = 'video-card';
  card.href = `/watch?v=${video.id}`;

  const thumbnailContent = video.thumbnailUrl
    ? `<img src="${video.thumbnailUrl}" alt="${escapeHtml(video.title)}" loading="lazy" decoding="async">`
    : `<div class="thumb-placeholder"><span aria-hidden="true">🎥</span></div>`;

  const timeAgo = getTimeAgo(video.uploadedAt);
  const views = formatViews(video.views || 0);

  card.innerHTML = `
    <div class="thumbnail" style="position:relative; overflow:hidden;">
      ${thumbnailContent}
      <div class="preview-container" style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; transition: opacity 0.3s ease; z-index: 1; pointer-events: none;"></div>
      <div class="play-overlay" style="z-index: 2;">
        <div class="play-btn">▶</div>
      </div>
    </div>
    <div class="card-info">
      <div class="card-title">${escapeHtml(video.title)}</div>
      ${video.genre ? `<div style="display:inline-block; font-size: 0.7rem; background: var(--accent-gradient-pink); color: white; padding: 2px 8px; border-radius: 4px; margin-top: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(236,72,153,0.3);">${escapeHtml(video.genre)}</div>` : ''}
      <div class="card-meta">
        <span><span aria-hidden="true">👁️</span> ${views}</span>
        <span><span aria-hidden="true">🕒</span> ${timeAgo}</span>
      </div>
    </div>
  `;

  let hoverTimeout;
  let hlsInstance = null;
  let previewVideo = null;

  const startPreview = () => {
    if (!video.videoUrl) return;
    const container = card.querySelector('.preview-container');
    
    // Add loading state instantly
    container.innerHTML = '<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:white; z-index:10;"><span aria-hidden="true">⏳</span></div>';
    container.style.opacity = '1';
    container.style.backgroundColor = 'rgba(0,0,0,0.5)';
    
    previewVideo = document.createElement('video');
    previewVideo.muted = true;
    previewVideo.loop = true;
    previewVideo.playsInline = true;
    previewVideo.style.width = '100%';
    previewVideo.style.height = '100%';
    previewVideo.style.objectFit = 'cover';
    previewVideo.style.position = 'absolute';
    previewVideo.style.top = '0';
    previewVideo.style.left = '0';
    previewVideo.style.opacity = '0';
    previewVideo.style.transition = 'opacity 0.3s ease';
    
    container.appendChild(previewVideo);

    previewVideo.addEventListener('playing', () => {
      previewVideo.style.opacity = '1';
      container.style.backgroundColor = 'transparent';
      const spinner = container.querySelector('div');
      if (spinner) spinner.remove();
    });

    if (video.videoUrl.includes('.m3u8')) {
      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        hlsInstance = new Hls({ startLevel: -1, capLevelToPlayerSize: true, autoStartLoad: true });
        hlsInstance.loadSource(video.videoUrl);
        hlsInstance.attachMedia(previewVideo);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          previewVideo.play().catch(e => console.error('Play failed:', e));
        });
      } else if (previewVideo.canPlayType('application/vnd.apple.mpegurl')) {
        previewVideo.src = video.videoUrl;
        previewVideo.play().catch(e => console.error('Play failed:', e));
      }
    } else {
      previewVideo.src = video.videoUrl;
      previewVideo.play().catch(e => console.error('Play failed:', e));
    }
  };

  const stopPreview = () => {
    const container = card.querySelector('.preview-container');
    container.style.opacity = '0';
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    if (previewVideo) {
      previewVideo.pause();
      previewVideo.src = '';
      previewVideo.load();
      previewVideo.remove();
      previewVideo = null;
    }
    container.innerHTML = '';
  };

  card.addEventListener('mouseenter', () => {
    hoverTimeout = setTimeout(startPreview, 400); // 400ms delay before preview starts
  });

  card.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimeout);
    stopPreview();
  });

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

// ==================== Load Videos ====================
let allVideos = [];
let currentSearch = '';
let currentGenre = '';

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
  heroPlayBtn.href = `/watch?v=${video.id}`;
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
  buttons.forEach(btn => {
    btn.className = 'btn btn-secondary';
    btn.setAttribute('aria-pressed', 'false');
  });
  
  // Fix: Handle spaces in genre names for ID lookup
  const buttonId = 'filter-' + (genre ? genre.replace(/\s+/g, '-') : 'All');
  const activeBtn = document.getElementById(buttonId);
  if (activeBtn) {
    activeBtn.className = 'btn btn-primary';
    activeBtn.setAttribute('aria-pressed', 'true');
  }
  
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
