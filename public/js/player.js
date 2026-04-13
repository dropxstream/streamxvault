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
      ${video.genre ? `<div style="display:inline-block; font-size: 0.7rem; background: var(--accent-gradient-pink); color: white; padding: 2px 8px; border-radius: 4px; margin-top: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(236,72,153,0.3);">${escapeHtml(video.genre)}</div>` : ''}
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
    document.getElementById('video-title').textContent = video.title;
    document.getElementById('video-views').textContent = `👁️ ${formatViews(video.views || 0)} views`;
    document.getElementById('video-date').textContent = `📅 ${formatDate(video.uploadedAt)}`;
    document.getElementById('video-description').textContent = video.description || 'No description provided.';
    document.getElementById('like-count').textContent = video.likes || 0;

    // ====== PLAYER LOGIC: Hybrid Switch ======
    const wrapper = document.getElementById('player-wrapper');
    
    if (video.bunnyId) {
      // PRO: Bunny Stream Player (Adaptive Quality + Skip Transcoding)
      // Custom Library ID: 636087
      wrapper.innerHTML = `
        <div style="position:relative; padding-top:56.25%;">
            <iframe src="https://iframe.mediadelivery.net/embed/636087/${video.bunnyId}?autoplay=true" 
                    loading="lazy" style="border:0;position:absolute;top:0;height:100%;width:100%; border-radius:12px; overflow:hidden;" 
                    allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;" 
                    allowfullscreen="true"></iframe>
        </div>`;
    } else {
      // POWER: Video.js (Supports VAST Ads + Custom Skinning)
      wrapper.innerHTML = `<video id="video-js-player" class="video-js vjs-big-play-centered vjs-16-9" controls preload="auto"></video>`;
      const vPlayer = videojs('video-js-player', {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: true,
        sources: [{ src: video.videoUrl, type: 'video/mp4' }]
      });

      // ====== DOWNLOADS LOGIC ======
    const dlMenu = document.getElementById('download-menu');
    if (dlMenu) {
      dlMenu.innerHTML = '';
      const hasDownloads = video.downloads && (video.downloads.p720 || video.downloads.p1080);
      
      // Sanitize filename for download attribute
      const safeTitle = (video.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase();

      if (hasDownloads) {
        if (video.downloads.p720) {
          dlMenu.innerHTML += `<a href="${video.downloads.p720}" class="download-item" target="_blank" download="${safeTitle}_720p.mp4">
            <span>720p HD</span> <span class="quality">MP4</span>
          </a>`;
        }
        if (video.downloads.p1080) {
          dlMenu.innerHTML += `<a href="${video.downloads.p1080}" class="download-item" target="_blank" download="${safeTitle}_1080p.mp4">
            <span>1080p FHD</span> <span class="quality">MP4</span>
          </a>`;
        }
      } else {
        dlMenu.innerHTML = '<div class="download-item" style="color: var(--text-muted); font-size: 0.8rem;">No links provided</div>';
      }
    }
  }


    // ====== SEO: Inject JSON-LD ======
    const ldJson = document.createElement('script');
    ldJson.type = 'application/ld+json';
    ldJson.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "name": video.title,
      "description": video.description || "Video on StreamXvault",
      "thumbnailUrl": [video.thumbnailUrl || "https://streamxvault.online/images/logo.png"],
      "uploadDate": new Date(video.uploadedAt).toISOString(),
      "contentUrl": video.videoUrl
    });
    document.head.appendChild(ldJson);
    // =================================
    
    // ====== RECOMMENDATION ENGINE: Update Profile ======
    if (video.genre) {
      let profile = { genres: {} };
      try {
        const saved = localStorage.getItem('sxv_profile');
        if (saved) profile = JSON.parse(saved);
      } catch (e) {}
      
      profile.genres[video.genre] = (profile.genres[video.genre] || 0) + 1;
      localStorage.setItem('sxv_profile', JSON.stringify(profile));
    }
    // ===================================================

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

// ==================== Social: Likes ====================
async function likeVideo() {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get('v');
  if (!videoId) return;

  const btn = document.getElementById('like-btn');
  if (btn.classList.contains('liked')) {
    showToast('Already liked!', 'info');
    return;
  }

  try {
    const res = await fetch(`/api/videos/${videoId}/like`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      document.getElementById('like-count').textContent = data.likes || 0;
      btn.classList.add('liked');
      showToast('Video liked! ❤️', 'success');
    }
  } catch (e) {
    console.error('Like failed');
  }
}

function toggleDownloadMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('download-menu');
  menu.classList.toggle('active');
}

// Close dropdown on outside click
window.addEventListener('click', () => {
  const menu = document.getElementById('download-menu');
  if (menu) menu.classList.remove('active');
});

// Global scope exports for UI hooks
window.likeVideo = likeVideo;
window.toggleDownloadMenu = toggleDownloadMenu;
window.switchTab = (tab, el) => {}; 
window.toggleUploadSource = () => {};

// ==================== Initialize ====================
document.addEventListener('DOMContentLoaded', loadVideo);
