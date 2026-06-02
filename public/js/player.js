/**
 * player.js - Handles global video playback, likes, and downloads.
 * Restored to Official Bunny Stream Integration.
 */

// Shared utilities loaded from /js/utils.js

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
    if (video.videoUrl && (video.videoUrl.includes('<iframe') || video.videoUrl.includes('embed'))) {
      // Fallback for External Embeds
      const embedSrc = video.videoUrl.includes('<iframe') 
        ? video.videoUrl.match(/src="([^"]+)"/)?.[1] || video.videoUrl 
        : video.videoUrl;

      if (embedSrc && embedSrc.startsWith('https://')) {
        wrapper.innerHTML = `
          <div style="position:relative; padding-top:56.25%; background: #000; border-radius: 12px; overflow: hidden;">
              <iframe src="${embedSrc}" 
                      style="border:0;position:absolute;top:0;height:100%;width:100%;" 
                      allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;" 
                      allowfullscreen="true"></iframe>
          </div>`;
      } else {
        wrapper.textContent = 'Invalid video source';
      }
    } else {
      // Standard/HLS Player using Plyr
      const isHls = video.videoUrl && video.videoUrl.includes('.m3u8');
      const vastAdTag = "https://youradexchange.com/video/select.php?r=11262018";
      
      if (isHls) {
        wrapper.innerHTML = `<video id="plyr-player" controls playsinline style="width: 100%; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"></video>`;
        const videoElement = document.getElementById('plyr-player');
        
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(video.videoUrl);
          hls.attachMedia(videoElement);
          window.hls = hls;

          // Hls.js robust error recovery
          let hlsRetryCount = 0;
          hls.on(Hls.Events.ERROR, function (event, data) {
            console.warn('HLS Warning/Error:', data);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  if (data.response && data.response.code === 404) {
                    console.error('HLS 404 Not Found.');
                    hls.destroy();
                    showPlayerError('Error 404: Video file not found.');
                  } else if (hlsRetryCount < 3) {
                    hlsRetryCount++;
                    console.error('Fatal network error, attempting recovery...');
                    hls.startLoad();
                  } else {
                    console.error('Too many network errors. Destroying HLS.');
                    hls.destroy();
                    showPlayerError('Network Error: Unable to load video stream.');
                  }
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.error('Fatal media error, attempting recovery...');
                  hls.recoverMediaError();
                  break;
                default:
                  console.error('Fatal HLS error, unable to recover.');
                  hls.destroy();
                  showPlayerError('Error: Video stream is unplayable.');
                  break;
              }
            }
          });

          function showPlayerError(msg) {
             const wrapper = document.getElementById('player-wrapper');
             if (wrapper) {
               wrapper.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; aspect-ratio: 16/9; background: #111; color: #fff; border-radius: 12px; font-family: sans-serif; text-align: center; padding: 2rem;">
                 <h3 style="color: #ef4444; margin-bottom: 0.5rem;">${msg}</h3>
                 <p style="color: #9ca3af; font-size: 0.9rem;">Please check if the R2 URL is correct and public.</p>
               </div>`;
             }
          }

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            const availableQualities = hls.levels.map(l => l.height);
            const uniqueQualities = [...new Set(availableQualities)].sort((a, b) => b - a);

            const plyrOptions = {
              autoplay: true,
              quality: {
                default: 0, // Auto
                options: [0, ...uniqueQualities],
                forced: true,
                onChange: (q) => {
                  if (q === 0) {
                    window.hls.currentLevel = -1; // Auto
                  } else {
                    window.hls.levels.forEach((level, idx) => {
                      if (level.height === q) {
                        window.hls.currentLevel = idx;
                      }
                    });
                  }
                }
              },
              controls: [
                'play-large', 'play', 'fast-forward', 'progress', 'current-time', 
                'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
              ],
              ads: {
                enabled: true,
                tagUrl: vastAdTag
              }
            };

            if (typeof Plyr !== 'undefined') {
              const player = new Plyr(videoElement, plyrOptions);
              window.player = player;

              // Ad Fail-Safe: bypass ad blocker or CSP load issues and force video playback
              player.on('adserror', () => {
                console.warn('Ad error occurred. Bypassing and playing video directly.');
                player.play().catch(() => {});
              });

              player.on('adsadblocked', () => {
                console.warn('Ad blocked. Bypassing and playing video directly.');
                player.play().catch(() => {});
              });
            }
          });
        } else {
          // Native HLS support fallback (e.g. Safari)
          videoElement.innerHTML = `<source src="${video.videoUrl}" type="application/x-mpegURL">`;
          if (typeof Plyr !== 'undefined') {
            const player = new Plyr(videoElement, {
              autoplay: true,
              ads: {
                enabled: true,
                tagUrl: vastAdTag
              }
            });
            window.player = player;
          }
        }
      } else {
        // Direct MP4 / other formats file playback with Plyr
        wrapper.innerHTML = `<video id="plyr-player" controls playsinline style="width: 100%; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"><source src="${video.videoUrl}" type="video/mp4"></video>`;
        if (typeof Plyr !== 'undefined') {
          const player = new Plyr(document.getElementById('plyr-player'), {
            autoplay: true,
            ads: {
              enabled: true,
              tagUrl: vastAdTag
            }
          });
          window.player = player;
        }
      }
    }

    // ====== DOWNLOADS LOGIC ======
    const dlMenu = document.getElementById('download-menu');
    if (dlMenu) {
      dlMenu.innerHTML = '';
      try {
        const dlRes = await fetch(`/api/videos/${videoId}/downloads`);
        const dlData = await dlRes.json();
        const downloads = dlData.downloads;
        const hasDownloads = downloads && (downloads.p720 || downloads.p1080);
        const safeTitle = (video.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase();

        if (hasDownloads) {
          if (downloads.p720) {
            dlMenu.innerHTML += `<a href="${escapeHtml(downloads.p720)}" class="download-item" target="_blank" download="${safeTitle}_720p.mp4">
              <span>720p HD</span> <span class="quality">MP4</span>
            </a>`;
          }
          if (downloads.p1080) {
            dlMenu.innerHTML += `<a href="${escapeHtml(downloads.p1080)}" class="download-item" target="_blank" download="${safeTitle}_1080p.mp4">
              <span>1080p FHD</span> <span class="quality">MP4</span>
            </a>`;
          }
        } else {
          dlMenu.innerHTML = '<div class="download-item" style="color: var(--text-muted); font-size: 0.8rem;">No links provided</div>';
        }
      } catch (err) {
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
    const errDiv = document.createElement('div');
    errDiv.className = 'error-msg';
    errDiv.textContent = '❌ Error: ' + err.message;
    const wrapper = document.getElementById('player-wrapper');
    wrapper.innerHTML = '';
    wrapper.appendChild(errDiv);
  }
}

function createVideoCard(video) {
  const card = document.createElement('a');
  card.href = `/watch?v=${video.id}`;
  card.className = 'video-card';
  card.setAttribute('aria-label', escapeHtml(video.title));
  
  const thumbUrl = video.thumbnailUrl || '/images/placeholder.jpg';
  const views = formatViews(video.views || 0);
  const timeAgo = getTimeAgo(video.uploadedAt);
  
  card.innerHTML = `
    <div class="thumbnail">
      <img src="${thumbUrl}" alt="${escapeHtml(video.title)}" loading="lazy">
      <div class="play-overlay">
        <div class="play-btn">▶</div>
      </div>
    </div>
    <div class="card-info">
      <div class="card-title">${escapeHtml(video.title)}</div>
      ${video.genre ? `<div style="display:inline-block; font-size: 0.7rem; background: var(--accent-gradient-pink); color: white; padding: 2px 8px; border-radius: 4px; margin-top: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(236,72,153,0.3);">${escapeHtml(video.genre)}</div>` : ''}
      <div class="card-meta">
        <span><span aria-hidden="true">👁️</span> ${views}</span>
        <span><span aria-hidden="true">🕐</span> ${timeAgo}</span>
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
