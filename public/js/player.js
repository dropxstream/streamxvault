/**
 * player.js - Handles global video playback, likes, and downloads.
 * Powered by Video.js for pro-level streaming.
 */

// Global toggle for download menu
function toggleDownloadMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('download-menu');
  if (menu) {
    menu.classList.toggle('active');
  }
}

// Close menu when clicking outside
document.addEventListener('click', () => {
  const menu = document.getElementById('download-menu');
  if (menu) menu.classList.remove('active');
});

async function initPlayer() {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');

  if (!videoId) {
    window.location.href = '/';
    return;
  }

  try {
    const res = await fetch(`/api/videos/${videoId}`);
    if (!res.ok) throw new Error('Video not found');
    const video = await res.json();

    // Set page title
    document.title = `${video.title} - StreamXvault`;
    
    // Fill video details
    document.getElementById('video-title').textContent = video.title;
    document.getElementById('like-count').textContent = video.likes || 0;
    document.getElementById('video-description').textContent = video.description || 'No description available.';

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

      // Simulation of Preroll Ad (User can put actual VAST tag here)
      console.log('Video.js initialized for local file. Pre-roll ready.');
    }

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
    
    // Dynamic Meta Tags (OG / Twitter)
    const updateMeta = (name, content, isProperty = false) => {
      let el = document.querySelector(isProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        if (isProperty) el.setAttribute('property', name); else el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.content = content;
    };
    
    updateMeta('og:title', `${video.title} — Official StreamXvault`, true);
    updateMeta('og:description', video.description || 'Watch premium video on StreamXvault.', true);
    updateMeta('og:image', video.thumbnailUrl || 'https://streamxvault.online/images/logo.png', true);
    updateMeta('twitter:card', 'summary_large_image');
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

    allVideos
      .filter(v => v.id !== video.id)
      .slice(0, 8)
      .forEach(v => {
        relatedGrid.appendChild(createVideoCard(v));
      });

  } catch (err) {
    console.error('Player error:', err);
    document.getElementById('player-wrapper').innerHTML = `<div class="error-msg">❌ Error loading video: ${err.message}</div>`;
  }
}

function createVideoCard(video) {
  const card = document.createElement('a');
  card.href = `/watch?v=${video.id}`;
  card.className = 'video-card';
  
  const thumbUrl = video.thumbnailUrl || '/images/placeholder.jpg';
  
  card.innerHTML = `
    <div class="video-thumb">
      <img src="${thumbUrl}" alt="${video.title}" loading="lazy">
    </div>
    <div class="video-info">
      <h3>${video.title}</h3>
      <div class="video-meta">
        <span>👁️ ${video.views || 0}</span>
        <span>${formatDate(video.uploadedAt)}</span>
      </div>
    </div>
  `;
  return card;
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function likeVideo() {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  const btn = document.getElementById('like-btn');
  
  // Basic rate limiting/spam protection
  if (btn.classList.contains('liked')) return;

  try {
    const res = await fetch(`/api/videos/${videoId}/like`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('like-count').textContent = data.likes;
      btn.classList.add('liked');
      btn.style.color = 'var(--accent-pink)';
    }
  } catch (err) {
    console.error('Like error:', err);
  }
}

// Kickoff
document.addEventListener('DOMContentLoaded', initPlayer);
