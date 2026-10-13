/**
 * StreamXvault — Home catalog: search, sort, pagination, recommendations
 */
var PAGE_SIZE = (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ? 8 : 12;
var allVideos = [];
var currentSearch = '';
var currentGenre = '';
var currentSort = 'latest';
var currentPage = 1;

window.addEventListener('scroll', function () {
  var navbar = document.getElementById('navbar');
  if (!navbar) return;
  if (window.scrollY > 50) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
});

function createVideoCard(video, opts) {
  var card = document.createElement('a');
  card.className = 'video-card';
  card.href = '/watch?v=' + video.id;
  var eager = opts && opts.eager;
  var imgAttrs = eager
    ? 'loading="eager" fetchpriority="high" decoding="async"'
    : 'loading="lazy" decoding="async"';
  var thumb = video.thumbnailUrl
    ? '<img src="' + video.thumbnailUrl + '" alt="' + escapeHtml(video.title) + '" width="640" height="360" ' + imgAttrs + '>'
    : '<div class="thumb-placeholder">🎥</div>';
  var views = formatViews(video.displayViews || video.views || 0);
  card.innerHTML =
    '<div class="thumbnail" style="position:relative;overflow:hidden;">' + thumb + '</div>' +
    '<div class="card-info"><div class="card-title">' + escapeHtml(video.title) + '</div>' +
    (video.genre ? '<div style="display:inline-block;font-size:0.7rem;background:var(--accent-gradient-pink);color:#fff;padding:2px 8px;border-radius:4px;margin:4px 4px 8px 0;text-transform:uppercase;font-weight:700;">' + escapeHtml(video.genre) + '</div>' : '') +
    (video.modelName ? '<div style="display:inline-block;font-size:0.7rem;background:rgba(130, 71, 229, 0.2);color:#a77dfa;border:1px solid rgba(130, 71, 229, 0.4);padding:2px 8px;border-radius:4px;margin:4px 4px 8px 0;font-weight:700;">👤 ' + escapeHtml(video.modelName) + '</div>' : '') +
    (Array.isArray(video.tags) && video.tags.length ? video.tags.slice(0, 4).map(function (t) { return '<div style="display:inline-block;font-size:0.68rem;background:rgba(56, 189, 248, 0.12);color:#38bdf8;border:1px solid rgba(56, 189, 248, 0.3);padding:2px 7px;border-radius:4px;margin:4px 4px 8px 0;font-weight:600;">#' + escapeHtml(t) + '</div>'; }).join('') : '') +
    '<div class="card-meta"><span>🕒 ' + getTimeAgo(video.uploadedAt) + '</span></div></div>';
  return card;
}

function videoTime(video) {
  var t = Date.parse(video && video.uploadedAt);
  return Number.isFinite(t) ? t : 0;
}
function videoViews(video) {
  return Number((video && (video.displayViews || video.views)) || 0);
}
function sortVideos(list, sort) {
  var copy = list.slice();
  if (sort === 'ascending') copy.sort(function (a, b) { return videoTime(a) - videoTime(b); });
  else if (sort === 'popular') copy.sort(function (a, b) { return videoViews(b) - videoViews(a) || videoTime(b) - videoTime(a); });
  else copy.sort(function (a, b) { return videoTime(b) - videoTime(a); });
  return copy;
}
function matchesSearch(video, q) {
  if (!q) return true;
  var tagsStr = Array.isArray(video.tags) ? video.tags.map(function (t) { return '#' + t + ' ' + t; }).join(' ') : '';
  var hay = [(video.title || ''), (video.genre || ''), (video.modelName || ''), tagsStr, (video.description || ''), (video.shortDescription || '')].join(' ').toLowerCase();
  var cleanQ = q.replace(/^#+/, '').trim();
  return hay.indexOf(q) !== -1 || (cleanQ && hay.indexOf(cleanQ) !== -1);
}
function filteredList() {
  var list = allVideos.slice();
  var q = currentSearch.toLowerCase();
  if (q) list = list.filter(function (v) { return matchesSearch(v, q); });
  if (currentGenre) {
    var g = currentGenre.toLowerCase();
    list = list.filter(function (v) { return v.genre && v.genre.toLowerCase() === g; });
  }
  return sortVideos(list, currentSort);
}
function setSort(sort) {
  currentSort = sort || 'latest';
  currentPage = 1;
  try { localStorage.setItem('sxv_sort', currentSort); } catch (e) {}
  document.querySelectorAll('[data-sort]').forEach(function (btn) {
    var on = btn.getAttribute('data-sort') === currentSort;
    btn.className = on ? 'btn btn-primary' : 'btn btn-secondary';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  renderVideoList();
}
function setPage(page) {
  currentPage = Math.max(1, page);
  renderVideoList();
  var grid = document.getElementById('all-videos');
  if (grid && grid.scrollIntoView) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function ensureToolbar() {
  var genres = document.getElementById('genre-filters');
  if (!genres) return;
  if (!document.getElementById('catalog-search')) {
    var searchWrap = document.createElement('div');
    searchWrap.id = 'catalog-search-wrap';
    searchWrap.style.cssText = 'width:100%;max-width:420px;';
    searchWrap.innerHTML = '<label for="catalog-search" style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">Search catalog</label>' +
      '<input id="catalog-search" type="search" placeholder="Search title, genre, #tag, or model..." autocomplete="off" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;">';
    genres.parentNode.insertBefore(searchWrap, genres);
    var extra = document.getElementById('catalog-search');
    var nav = document.getElementById('search-input');
    extra.addEventListener('input', function (e) {
      currentSearch = e.target.value.trim();
      currentPage = 1;
      if (nav && nav.value !== extra.value) nav.value = extra.value;
      renderVideoList();
    });
  }
  if (!document.getElementById('sort-filters')) {
    var bar = document.createElement('div');
    bar.id = 'sort-filters';
    bar.style.cssText = 'display:flex;gap:0.5rem;flex-wrap:wrap;width:100%;align-items:center;';
    bar.innerHTML =
      '<span style="color:var(--text-muted);font-size:0.8rem;">Sort</span>' +
      '<button type="button" class="btn btn-primary" data-sort="latest" title="Newest upload first (default)" onclick="setSort(\x27latest\x27)">Latest</button>' +
      '<button type="button" class="btn btn-secondary" data-sort="ascending" title="Oldest upload first" onclick="setSort(\x27ascending\x27)">Oldest</button>' +
      '<button type="button" class="btn btn-secondary" data-sort="descending" title="Newest upload first" onclick="setSort(\x27descending\x27)">Newest</button>' +
      '<button type="button" class="btn btn-secondary" data-sort="popular" title="Most views first" onclick="setSort(\x27popular\x27)">Popular</button>' +
      '<span id="sort-hint" style="color:var(--text-muted);font-size:0.75rem;">Default: Latest = newest first</span>';
    genres.parentNode.insertBefore(bar, genres);
  }
  if (!document.getElementById('video-pagination')) {
    var pager = document.createElement('div');
    pager.id = 'video-pagination';
    pager.style.cssText = 'display:none;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;margin:24px 0 8px;width:100%;';
    var grid = document.getElementById('videos-grid');
    if (grid && grid.parentNode) grid.parentNode.insertBefore(pager, grid.nextSibling);
  }
}
function renderPager(total, page, pages) {
  var pager = document.getElementById('video-pagination');
  if (!pager) return;
  if (pages <= 1) { pager.style.display = 'none'; pager.innerHTML = ''; return; }
  pager.style.display = 'flex';
  var html = '<button type="button" class="btn btn-secondary" ' + (page <= 1 ? 'disabled' : '') + ' onclick="setPage(' + (page - 1) + ')">Prev</button>';
  var start = Math.max(1, page - 2);
  var end = Math.min(pages, start + 4);
  start = Math.max(1, end - 4);
  for (var i = start; i <= end; i++) html += '<button type="button" class="btn ' + (i === page ? 'btn-primary' : 'btn-secondary') + '" onclick="setPage(' + i + ')">' + i + '</button>';
  html += '<button type="button" class="btn btn-secondary" ' + (page >= pages ? 'disabled' : '') + ' onclick="setPage(' + (page + 1) + ')">Next</button>';
  html += '<span style="color:var(--text-muted);font-size:0.8rem;">Page ' + page + ' of ' + pages + ' · ' + total + ' videos</span>';
  pager.innerHTML = html;
}
function localRecommend(list) {
  var hist = (window.sxvWatchHistory && window.sxvWatchHistory()) || [];
  var seen = {};
  var genres = {};
  hist.forEach(function (item) {
    seen[item.id] = true;
    if (item.genre) genres[item.genre] = (genres[item.genre] || 0) + 2;
  });
  return list.slice().map(function (video) {
    var score = 0;
    if (seen[video.id]) score -= 50;
    if (video.genre && genres[video.genre]) score += genres[video.genre] * 8;
    score += Math.log(1 + (Number(video.views) || 0)) * 2;
    var ageH = (Date.now() - videoTime(video)) / 3600000;
    if (ageH < 72) score += 6;
    return { video: video, score: score };
  }).sort(function (a, b) { return b.score - a.score; }).map(function (row) { return row.video; });
}
function renderRecommended() {
  var section = document.getElementById('recommended-section');
  var carousel = document.getElementById('recommended-carousel');
  if (!section || !carousel || !allVideos.length) return;
  if (currentSearch || currentGenre) {
    section.style.display = 'none';
    return;
  }
  var picks = localRecommend(allVideos).slice(0, 8);
  if (!picks.length) { section.style.display = 'none'; return; }
  carousel.innerHTML = '';
  picks.forEach(function (v) { carousel.appendChild(createVideoCard(v)); });
  section.style.display = 'block';
}
function renderVideoList() {
  var gridEl = document.getElementById('videos-grid');
  var emptyEl = document.getElementById('empty-state');
  var noResultsEl = document.getElementById('no-results');
  var recentSection = document.getElementById('recent-section');
  var countEl = document.getElementById('video-count');
  if (!gridEl) return;
  var newest = sortVideos(allVideos, 'latest');
  var heroSection = document.getElementById('hero-section');
  var mainTitle = document.getElementById('catalog-main-title');
  if (currentSearch || currentGenre) {
    if (heroSection) heroSection.style.display = 'none';
    if (mainTitle) mainTitle.textContent = currentSearch ? 'Search Results: ' + currentSearch : 'Genre: ' + currentGenre;
  } else {
    if (heroSection) heroSection.style.display = 'flex';
    if (mainTitle) mainTitle.textContent = 'All Videos';
    if (newest[0]) updateHero(newest[0]); else updateHeroDefault();
  }
  if (recentSection) {
    if (!currentSearch && !currentGenre && newest.length > 1) {
      recentSection.style.display = 'block';
      var carousel = document.getElementById('recent-carousel');
      if (carousel) {
        carousel.innerHTML = '';
        newest.slice(0, 8).forEach(function (v) { carousel.appendChild(createVideoCard(v)); });
      }
    } else recentSection.style.display = 'none';
  }
  renderRecommended();
  var list = filteredList();
  if (list.length === 0) {
    gridEl.style.display = 'none'; gridEl.innerHTML = ''; renderPager(0, 1, 1);
    if ((currentSearch || currentGenre) && noResultsEl) noResultsEl.style.display = 'block';
    else if (emptyEl) emptyEl.style.display = 'block';
    if (countEl) countEl.textContent = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (noResultsEl) noResultsEl.style.display = 'none';
  var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (currentPage > pages) currentPage = pages;
  var start = (currentPage - 1) * PAGE_SIZE;
  gridEl.innerHTML = '';
  gridEl.style.display = 'grid';
  list.slice(start, start + PAGE_SIZE).forEach(function (v, i) {
    gridEl.appendChild(createVideoCard(v, { eager: currentPage === 1 && i < 4 }));
  });
  if (countEl) countEl.textContent = list.length + ' video' + (list.length !== 1 ? 's' : '') + ' · page ' + currentPage + '/' + pages;
  renderPager(list.length, currentPage, pages);
}
var publicGenres = ['Trueanal', 'Analonly', 'Nympho', 'Analvids', 'Tushy Raw'];
function renderGenreFilters() {
  var wrap = document.getElementById('genre-filters');
  if (!wrap) return;
  var seen = {};
  var merged = [];
  publicGenres.forEach(function (g) {
    var t = String(g || '').trim();
    if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = true; merged.push(t); }
  });
  allVideos.forEach(function (v) {
    var t = v && v.genre ? String(v.genre).trim() : '';
    if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = true; merged.push(t); }
  });
  wrap.innerHTML = '';
  var allBtn = document.createElement('button');
  allBtn.className = !currentGenre ? 'btn btn-primary' : 'btn btn-secondary';
  allBtn.id = 'filter-All';
  allBtn.setAttribute('aria-pressed', !currentGenre ? 'true' : 'false');
  allBtn.textContent = 'All Genres';
  allBtn.onclick = function () { filterByGenre(''); };
  wrap.appendChild(allBtn);

  merged.forEach(function (g) {
    var active = currentGenre && currentGenre.toLowerCase() === g.toLowerCase();
    var btn = document.createElement('button');
    btn.className = active ? 'btn btn-primary' : 'btn btn-secondary';
    btn.id = 'filter-' + g.replace(/\s+/g, '-');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.textContent = g;
    btn.onclick = function () { filterByGenre(g); };
    wrap.appendChild(btn);
  });
}
async function loadVideos() {
  var loadingEl = document.getElementById('videos-loading');
  var gridEl = document.getElementById('videos-grid');
  if (!gridEl) return;
  if (loadingEl) {
    gridEl.style.display = 'none'; loadingEl.style.display = 'grid'; loadingEl.innerHTML = '';
    for (var i = 0; i < 8; i++) {
      var s = document.createElement('div');
      s.className = 'skeleton-card';
      s.innerHTML = '<div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-meta"></div>';
      loadingEl.appendChild(s);
    }
  }
  try {
    fetch('/api/genres').then(function (r) { return r.ok ? r.json() : null; }).then(function (gList) {
      if (Array.isArray(gList) && gList.length) {
        publicGenres = gList;
        renderGenreFilters();
      }
    }).catch(function () {});
    var res = await fetch('/api/videos');
    var videos = await res.json();
    allVideos = Array.isArray(videos) ? videos : [];
    if (loadingEl) loadingEl.style.display = 'none';
    renderGenreFilters();
    renderVideoList();
    function loadRecs() {
      fetch('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history: ((window.sxvWatchHistory && window.sxvWatchHistory()) || []).map(function (i) { return i.id; }) }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.videos || !data.videos.length) return;
          var section = document.getElementById('recommended-section');
          var carousel = document.getElementById('recommended-carousel');
          if (!section || !carousel) return;
          carousel.innerHTML = '';
          data.videos.forEach(function (v) { carousel.appendChild(createVideoCard(v)); });
          section.style.display = 'block';
        }).catch(function () {});
    }
    if ('requestIdleCallback' in window) requestIdleCallback(loadRecs, { timeout: 4000 });
    else setTimeout(loadRecs, 1200);
  } catch (err) {
    console.error('Failed to load videos:', err);
    if (loadingEl) loadingEl.style.display = 'none';
  }
}
function updateHero(video) {
  var heroTitle = document.getElementById('hero-title');
  var heroDesc = document.getElementById('hero-desc');
  var heroBg = document.getElementById('hero-bg');
  var heroThumb = document.getElementById('hero-thumb');
  var heroPlayBtn = document.getElementById('hero-play-btn');
  var heroBadge = document.getElementById('hero-badge');
  var heroGenreBadge = document.getElementById('hero-genre-badge');
  if (!video || !heroTitle) return;
  heroTitle.textContent = video.title;
  if (heroDesc) heroDesc.textContent = video.description || 'Watch the latest content on StreamXvault.';
  if (heroGenreBadge) {
    if (video.genre) { heroGenreBadge.textContent = video.genre; heroGenreBadge.style.display = 'inline-flex'; }
    else heroGenreBadge.style.display = 'none';
  }
  var watchUrl = '/watch?v=' + video.id;
  if (heroBg) heroBg.href = watchUrl;
  if (heroThumb && video.thumbnailUrl) {
    heroThumb.src = video.thumbnailUrl;
    heroThumb.alt = video.title;
    heroThumb.width = 1280;
    heroThumb.height = 720;
    heroThumb.style.display = 'block';
  }
  if (heroPlayBtn) { heroPlayBtn.style.display = 'inline-flex'; heroPlayBtn.href = watchUrl; }
  if (heroBadge) heroBadge.textContent = 'Latest Upload';
}
function updateHeroDefault() {
  var heroTitle = document.getElementById('hero-title');
  var heroDesc = document.getElementById('hero-desc');
  var heroPlayBtn = document.getElementById('hero-play-btn');
  if (heroTitle) heroTitle.textContent = 'Welcome to StreamXvault';
  if (heroDesc) heroDesc.textContent = 'Your premium streaming platform.';
  if (heroPlayBtn) heroPlayBtn.style.display = 'none';
}
function filterByGenre(genre) {
  currentGenre = genre; currentPage = 1;
  renderGenreFilters();
  renderVideoList();
}
function clearSearch() {
  currentSearch = ''; currentPage = 1;
  var nav = document.getElementById('search-input');
  var extra = document.getElementById('catalog-search');
  if (nav) nav.value = '';
  if (extra) extra.value = '';
  renderVideoList();
}
window.setSort = setSort;
window.setPage = setPage;
window.filterByGenre = filterByGenre;
window.clearSearch = clearSearch;
document.addEventListener('DOMContentLoaded', function () {
  ensureToolbar();
  try {
    var saved = localStorage.getItem('sxv_sort');
    if (saved === 'latest' || saved === 'ascending' || saved === 'descending' || saved === 'popular') currentSort = saved;
  } catch (e) {}

  var nav = document.getElementById('search-input');
  var extra = document.getElementById('catalog-search');

  // Read search query from URL
  var urlParams = new URLSearchParams(window.location.search);
  var urlSearch = urlParams.get('search');
  if (urlSearch) {
    currentSearch = urlSearch.trim();
    if (nav) nav.value = currentSearch;
    if (extra) extra.value = currentSearch;
  }

  function onSearch(val) {
    currentSearch = (val || '').trim(); currentPage = 1;
    if (nav && nav.value !== currentSearch) nav.value = currentSearch;
    if (extra && extra.value !== currentSearch) extra.value = currentSearch;
    renderVideoList();
  }
  if (nav) {
    var t;
    nav.addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { onSearch(e.target.value); }, 250); });
    nav.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
  }
  setSort(currentSort);
  loadVideos();
});
