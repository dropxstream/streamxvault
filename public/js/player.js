/**
 * player.js - Handles global video playback, likes, and downloads.
 * Restored to Official Bunny Stream Integration.
 */

function getAuthHeaders() {
  const token = localStorage.getItem('streamxvault_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function toggleDownloadMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('download-menu');
  if (menu) {
    menu.classList.toggle('active');
  }
}

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
    const res = await fetch(`/api/videos/${videoId}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Video not found');
    const video = await res.json();

    // Set page title
    document.title = `${video.title} - StreamXvault`;
    
    // Fill video details
    document.getElementById('video-title').textContent = video.title;
    document.getElementById('video-description').textContent = video.description || 'No description available.';
    document.getElementById('like-count').textContent = video.likes || 0;

    const wrapper = document.getElementById('player-wrapper');
    
    // ==========================================
    // 🚀 MASTER INTEGRATION: BUNNY STREAM DETECTION
    // ==========================================
    let bId = video.bunnyId;
    // Auto-detect Bunny ID if it's hidden in the URL
    if (!bId && video.videoUrl && video.videoUrl.includes('mediadelivery.net')) {
      const parts = video.videoUrl.split('/');
      bId = parts[parts.length - 1].split('?')[0];
    }

    if (bId) {
      // Professional Bunny Stream Player (Prioritized)
      wrapper.innerHTML = `
        <div style="position:relative; padding-top:56.25%; background: #000; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <iframe src="https://iframe.mediadelivery.net/embed/636087/${bId}?autoplay=true" 
                    loading="lazy" 
                    style="border:0;position:absolute;top:0;height:100%;width:100%;" 
                    allow="accelerometer;gyroscope;autoplay;clipboard-write;encrypted-media;picture-in-picture;" 
                    allowfullscreen="true"></iframe>
        </div>`;
    } else if (video.videoUrl && (video.videoUrl.includes('<iframe') || video.videoUrl.includes('embed'))) {
      // Fallback for External Embeds
      const embedSrc = video.videoUrl.includes('<iframe') 
        ? video.videoUrl.match(/src="([^"]+)"/)?.[1] || video.videoUrl 
        : video.videoUrl;

      wrapper.innerHTML = `
        <div style="position:relative; padding-top:56.25%; background: #000; border-radius: 12px; overflow: hidden;">
            <iframe src="${embedSrc}" 
                    style="border:0;position:absolute;top:0;height:100%;width:100%;" 
                    allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;" 
                    allowfullscreen="true"></iframe>
        </div>`;
    } else {
      // Standard Video.js for Direct Files
      wrapper.innerHTML = `<video id="video-js-player" class="video-js vjs-big-play-centered vjs-16-9" controls preload="auto"></video>`;
      const vPlayer = videojs('video-js-player', {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: true,
        sources: [{ src: video.videoUrl }]
      });
    }

    // ====== DOWNLOADS LOGIC ======
    const dlMenu = document.getElementById('download-menu');
    if (dlMenu) {
      dlMenu.innerHTML = '';
      const hasDownloads = video.downloads && (video.downloads.p720 || video.downloads.p1080);
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

    // Load related videos
    const allRes = await fetch('/api/videos');
    const allVideos = await allRes.json();
    const relatedGrid = document.getElementById('related-grid');
    if (relatedGrid) {
      relatedGrid.innerHTML = '';
      allVideos
        .filter(v => v.id !== video.id)
        .slice(0, 8)
        .forEach(v => {
          relatedGrid.appendChild(createVideoCard(v));
        });
    }

  } catch (err) {
    console.error('Player error:', err);
    document.getElementById('player-wrapper').innerHTML = `<div class="error-msg">❌ Error: ${err.message}</div>`;
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
      </div>
    </div>
  `;
  return card;
}

async function likeVideo() {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  const btn = document.getElementById('like-btn');
  if (btn.classList.contains('liked')) return;
  try {
    const res = await fetch(`/api/videos/${videoId}/like`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('like-count').textContent = data.likes;
      btn.classList.add('liked');
      btn.style.color = 'var(--accent-pink)';
    }
  } catch (err) {}
}

document.addEventListener('DOMContentLoaded', initPlayer);
