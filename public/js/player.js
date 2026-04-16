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
    const isEmbed = video.videoUrl && (video.videoUrl.includes('iframe') || video.videoUrl.includes('embed') || !video.videoUrl.match(/\.(mp4|m3u8|webm)$|bunny/i));

    // 1. BUNNY PLAYER (High Authority)
    if (video.bunnyId) {
      wrapper.innerHTML = `
        <div style="position:relative; padding-top:56.25%; background: #000; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
            <iframe src="https://iframe.mediadelivery.net/embed/636087/${video.bunnyId}?autoplay=true" 
                    loading="lazy" style="border:0;position:absolute;top:0;height:100%;width:100%;" 
                    allow="accelerometer;gyroscope;autoplay;clipboard-write;encrypted-media;picture-in-picture;" 
                    allowfullscreen="true"></iframe>
        </div>`;
      return;
    }

    // 2. IFRAME EMBED (External Players)
    if (isEmbed) {
      const embedSrc = video.videoUrl.includes('<iframe') 
        ? video.videoUrl.match(/src="([^"]+)"/)?.[1] || video.videoUrl 
        : video.videoUrl;

      wrapper.innerHTML = `
        <div style="position:relative; padding-top:56.25%; background: #000; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
            <iframe src="${embedSrc}" 
                    style="border:0;position:absolute;top:0;height:100%;width:100%;" 
                    allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;" 
                    allowfullscreen="true"></iframe>
        </div>`;
      return;
    }

    // 3. VIDEO.JS (Direct Files)
    wrapper.innerHTML = `<video id="video-js-player" class="video-js vjs-big-play-centered vjs-16-9 vjs-custom-professional" preload="auto"></video>`;
    
    // Use a small timeout to ensure the DOM is ready for Video.js
    setTimeout(() => {
      if (typeof videojs !== 'undefined') {
        const vPlayer = videojs('video-js-player', {
          autoplay: true,
          controls: true,
          responsive: true,
          fluid: true,
          playbackRates: [0.5, 1, 1.5, 2],
          userActions: { hotkeys: true },
          sources: [{ src: video.videoUrl }]
        });
        
        vPlayer.ready(() => {
          console.log('✅ Video.js Professional Player Initialized');
        });
      } else {
        console.error('❌ Video.js library not loaded');
        // Fallback to basic HTML5 if VJS is missing
        const v = document.getElementById('video-js-player');
        v.controls = true;
        v.src = video.videoUrl;
      }
    }, 50);

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
