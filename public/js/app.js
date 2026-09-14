/**
 * StreamXvault — Home Page Logic
 */

window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  if (window.scrollY > 50) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
});

function createVideoCard(video) {
  const card = document.createElement('a');
  card.className = 'video-card';
  card.href = '/watch?v=' + video.id;

  const thumbnailContent = video.thumbnailUrl
    ? '<img src="' + video.thumbnailUrl + '" alt="' + escapeHtml(video.title) + '" loading="lazy" decoding="async">'
    : '<div class="thumb-placeholder"><span aria-hidden="true">🎥</span></div>';

  const timeAgo = getTimeAgo(video.uploadedAt);
  const views = formatViews(video.displayViews || video.views || 0);

  card.innerHTML =
    '<div class="thumbnail" style="position:relative; overflow:hidden;">' + thumbnailContent + '</div>' +
    '<div class="card-info">' +
      '<div class="card-title">' + escapeHtml(video.title) + '</div>' +
      (video.genre ? '<div style="display:inline-block; font-size: 0.7rem; background: var(--accent-gradient-pink); color: white; padding: 2px 8px; border-radius: 4px; margin-top: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700;">' + escapeHtml(video.genre) + '</div>' : '') +
      '<div class="card-meta">' +
        '<span><span aria-hidden="true">👁️</span> ' + views + '</span>' +
        '<span><span aria-hidden="true">🕒</span> ' + timeAgo + '</span>' +
      '</div></div>';
  return card;
}

function renderSkeletons(container, count) {
  container.innerHTML = '';
  for (let i = 0; i < (count || 8); i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-card';
    skeleton.innerHTML = '<div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-meta"></div>';
    container.appendChild(skeleton);
  }
}

let allVideos = [];
let currentSearch = '';
let currentGenre = '';
let currentSort = 'latest';

function videoTime(video) {
  const t = Date.parse(video && video.uploadedAt);
  return Number.isFinite(t) ? t : 0;
}

function videoViews(video) {
  return Number(video && (video.displayViews || video.views) || 0);
}

function sortVideos(list, sort) {
  const copy = list.slice();
  if (sort === 'ascending') {
    copy.sort(function (a, b) { return videoTime(a) - videoTime(b); });
  } else if (sort === 'popular') {
    copy.sort(function (a, b) { return videoViews(b) - videoViews(a) || videoTime(b) - videoTime(a); });
  } else {
    copy.sort(function (a, b) { return videoTime(b) - videoTime(a); });
  }
  return copy;
}

function setSort(sort) {
  currentSort = sort || 'latest';
  try { localStorage.setItem('sxv_sort', currentSort); } catch (e) {}
  document.querySelectorAll('[data-sort]').forEach(function (btn) {
    const on = btn.getAttribute('data-sort') === currentSort;
    btn.className = on ? 'btn btn-primary' : 'btn btn-secondary';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  renderVideoList();
}

function renderVideoList() {
  const gridEl = document.getElementById('videos-grid');
  const emptyEl = document.getElementById('empty-state');
  const noResultsEl = document.getElementById('no-results');
  const recentSection = document.getElementById('recent-section');
  const countEl = document.getElementById('video-count');
  if (!gridEl) return;

  let list = allVideos.slice();
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter(function (v) {
      return (v.title || '').toLowerCase().indexOf(q) !== -1 || (v.genre || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  if (currentGenre) list = list.filter(function (v) { return v.genre === currentGenre; });

  const newest = sortVideos(allVideos, 'latest');
  if (newest[0]) updateHero(newest[0]);
  else updateHeroDefault();

  if (recentSection) {
    if (!currentSearch && !currentGenre && newest.length > 1) {
      recentSection.style.display = 'block';
      const carousel = document.getElementById('recent-carousel');
      if (carousel) {
        carousel.innerHTML = '';
        newest.slice(0, 8).forEach(function (v) { carousel.appendChild(createVideoCard(v)); });
      }
    } else {
      recentSection.style.display = 'none';
    }
  }

  if (list.length === 0) {
    gridEl.style.display = 'none';
    gridEl.innerHTML = '';
    if ((currentSearch || currentGenre) && noResultsEl) noResultsEl.style.display = 'block';
    else if (emptyEl) emptyEl.style.display = 'block';
    if (countEl) countEl.textContent = '';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (noResultsEl) noResultsEl.style.display = 'none';
  const ordered = sortVideos(list, currentSort);
  gridEl.innerHTML = '';
  gridEl.style.display = 'grid';
  ordered.forEach(function (v) { gridEl.appendChild(createVideoCard(v)); });
  if (countEl) countEl.textContent = ordered.length + ' video' + (ordered.length !== 1 ? 's' : '');
}

async function loadVideos() {
  const loadingEl = document.getElementById('videos-loading');
  const gridEl = document.getElementById('videos-grid');
  if (!gridEl) return;

  if (loadingEl) {
    gridEl.style.display = 'none';
    loadingEl.style.display = 'grid';
    renderSkeletons(loadingEl);
  }

  try {
    const res = await fetch('/api/videos', { headers: typeof getAuthHeaders === 'function' ? getAuthHeaders() : {} });
    const videos = await res.json();
    allVideos = Array.isArray(videos) ? videos : [];
    if (loadingEl) loadingEl.style.display = 'none';
    renderVideoList();
  } catch (err) {
    console.error('Failed to load videos:', err);
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function updateHero(video) {
  const heroTitle = document.getElementById('hero-title');
  const heroDesc = document.getElementById('hero-desc');
  const heroBg = document.getElementById('hero-bg');
  const heroThumb = document.getElementById('hero-thumb');
  const heroPlayBtn = document.getElementById('hero-play-btn');
  const heroBadge = document.getElementById('hero-badge');
  const heroGenreBadge = document.getElementById('hero-genre-badge');
  if (!video || !heroTitle) return;

  heroTitle.textContent = video.title;
  if (heroDesc) heroDesc.textContent = video.description || 'Watch the latest content on StreamXvault.';
  if (heroGenreBadge) {
    if (video.genre) {
      heroGenreBadge.textContent = video.genre;
      heroGenreBadge.style.display = 'inline-flex';
    } else heroGenreBadge.style.display = 'none';
  }
  const watchUrl = '/watch?v=' + video.id;
  if (heroBg) heroBg.href = watchUrl;
  if (heroThumb && video.thumbnailUrl) {
    heroThumb.src = video.thumbnailUrl;
    heroThumb.alt = video.title;
    heroThumb.style.display = 'block';
  }
  if (heroPlayBtn) {
    heroPlayBtn.style.display = 'inline-flex';
    heroPlayBtn.href = watchUrl;
  }
  if (heroBadge) heroBadge.textContent = 'Latest Upload';
}

function updateHeroDefault() {
  const heroTitle = document.getElementById('hero-title');
  const heroDesc = document.getElementById('hero-desc');
  const heroPlayBtn = document.getElementById('hero-play-btn');
  if (heroTitle) heroTitle.textContent = 'Welcome to StreamXvault';
  if (heroDesc) heroDesc.textContent = 'Your premium streaming platform.';
  if (heroPlayBtn) heroPlayBtn.style.display = 'none';
}

function filterByGenre(genre) {
  currentGenre = genre;
  document.querySelectorAll('.genre-filters .btn').forEach(function (btn) {
    btn.className = 'btn btn-secondary';
    btn.setAttribute('aria-pressed', 'false');
  });
  const buttonId = 'filter-' + (genre ? genre.replace(/\s+/g, '-') : 'All');
  const activeBtn = document.getElementById(buttonId);
  if (activeBtn) {
    activeBtn.className = 'btn btn-primary';
    activeBtn.setAttribute('aria-pressed', 'true');
  }
  renderVideoList();
}

function clearSearch() {
  currentSearch = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  renderVideoList();
}

document.addEventListener('DOMContentLoaded', function () {
  try {
    const saved = localStorage.getItem('sxv_sort');
    if (saved === 'latest' || saved === 'ascending' || saved === 'descending' || saved === 'popular') {
      currentSort = saved;
    }
  } catch (e) {}
  setSort(currentSort);

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', function (e) {
      clearTimeout(searchTimeout);
      currentSearch = e.target.value.trim();
      searchTimeout = setTimeout(renderVideoList, 400);
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') e.preventDefault();
    });
  }
  loadVideos();
});
