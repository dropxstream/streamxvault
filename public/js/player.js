/**
 * player.js - Handles global video playback, likes, and downloads.
 */

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

    document.title = `${video.title} - StreamXvault`;

    document.getElementById('video-title').textContent = video.title;
    document.getElementById('video-description').textContent = video.description || 'No description available.';

    const viewsElem = document.getElementById('video-views');
    if (viewsElem) viewsElem.textContent = formatViews(video.displayViews || video.views || 0) + ' views';

    const dateElem = document.getElementById('video-date');
    if (dateElem && video.uploadedAt) dateElem.textContent = new Date(video.uploadedAt).toLocaleDateString();

    document.getElementById('like-count').textContent = video.likes || 0;

    const wrapper = document.getElementById('player-wrapper');
    if (video.videoUrl && (video.videoUrl.includes('<iframe') || video.videoUrl.includes('embed'))) {
      const embedSrc = video.videoUrl.includes('<iframe')
        ? video.videoUrl.match(/src="([^"]+)"/)?.[1] || video.videoUrl
        : video.videoUrl;

      if (embedSrc && embedSrc.startsWith('https://')) {
        wrapper.innerHTML = `
          <div style="position:relative; padding-top:56.25%; background: #000; overflow: hidden;">
              <iframe src="${embedSrc}"
                      style="border:0;position:absolute;top:0;height:100%;width:100%;"
                      allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
                      allowfullscreen="true"></iframe>
          </div>`;
      } else {
        wrapper.textContent = 'Invalid video source';
      }
    } else {
      const safeThumbnail = video.thumbnailUrl ? video.thumbnailUrl.replace(/'/g, "'") : "";
      wrapper.innerHTML =
        "<div class='video-container' id='video-container'>" +
        "<video id='video-player' class='video-player' poster='" + safeThumbnail + "'></video>" +
        "<div class='video-overlay' id='video-overlay'>" +
          "<div class='big-play-btn' id='big-play-btn'><svg viewBox='0 0 24 24' fill='currentColor'><path d='M8 5v14l11-7z'/></svg></div>" +
        "</div>" +
        "<div class='video-controls' id='video-controls'>" +
          "<div class='progress-bar-container' id='progress-container'>" +
            "<div class='preview-tooltip' id='preview-tooltip'>" +
              "<img class='preview-image' id='preview-canvas' alt='' src='" + safeThumbnail + "'>" +
              "<span class='preview-time' id='preview-time'>0:00</span>" +
            "</div>" +
            "<div class='progress-bar' id='progress-bar'><div class='progress-filled' id='progress-filled'></div><div class='progress-thumb'></div></div>" +
          "</div>" +
          "<div class='controls-main'>" +
            "<div class='controls-left'>" +
              "<button class='control-btn' id='play-pause-btn' title='Play (k)'><svg id='play-icon' viewBox='0 0 24 24' fill='currentColor'><path d='M8 5v14l11-7z'/></svg><svg id='pause-icon' class='hidden' viewBox='0 0 24 24' fill='currentColor'><path d='M6 19h4V5H6v14zm8-14v14h4V5h-4z'/></svg></button>" +
              "<button class='control-btn' id='rewind-btn' title='Rewind 10s'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M11 17l-5-5 5-5M18 17l-5-5 5-5'/></svg></button>" +
              "<button class='control-btn' id='forward-btn' title='Forward 10s'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M13 17l5-5-5-5M6 17l5-5-5-5'/></svg></button>" +
              "<div class='volume-container'><button class='control-btn' id='mute-btn' title='Mute (m)'><svg id='volume-icon' viewBox='0 0 24 24' fill='currentColor'><path d='M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'/></svg><svg id='mute-icon' class='hidden' viewBox='0 0 24 24' fill='currentColor'><path d='M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'/></svg></button><input type='range' class='volume-slider' id='volume-slider' min='0' max='1' step='0.05' value='1'></div>" +
              "<div class='time-display'><span id='current-time'>0:00</span> / <span id='duration'>0:00</span></div>" +
            "</div>" +
            "<div class='controls-right'>" +
              "<span class='quality-indicator' id='quality-indicator' title='Quality is chosen automatically from your connection'>Auto</span>" +
              "<button class='control-btn text-btn' id='speed-btn'>1x</button>" +
              "<button class='control-btn' id='fullscreen-btn' title='Fullscreen (f)'><svg id='fullscreen-icon' viewBox='0 0 24 24' fill='currentColor'><path d='M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z'/></svg><svg id='exit-fullscreen-icon' class='hidden' viewBox='0 0 24 24' fill='currentColor'><path d='M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z'/></svg></button>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";

      if (typeof window.initNetflixPlayer === 'function') {
        window.initNetflixPlayer(video.videoUrl, video.thumbnailUrl);
      }
    }

    if (!document.querySelector('.quality-notice')) {
      const qualityNotice = document.createElement('p');
      qualityNotice.className = 'quality-notice';
      qualityNotice.setAttribute('role', 'note');
      qualityNotice.textContent = 'Quality is automatic from your internet speed. 4K needs a strong, fast connection.';
      wrapper.insertAdjacentElement('afterend', qualityNotice);
    }

    const dlMenu = document.getElementById('download-menu');
    if (dlMenu) {
      dlMenu.innerHTML = '';
      try {
        const dlRes = await fetch(`/api/videos/${videoId}/downloads`);
        const dlData = await dlRes.json();
        const downloads = dlData.downloads;
        const hasDownloads = downloads && (downloads.p480 || downloads.p720 || downloads.p1080 || downloads.p4k);
        const safeTitle = (video.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase();

        if (hasDownloads) {
          if (downloads.p480) {
            dlMenu.innerHTML += `<a href="${escapeHtml(downloads.p480)}" class="download-item" target="_blank" download="${safeTitle}_480p.mp4"><span>480p SD</span> <span class="quality">MP4</span></a>`;
          }
          if (downloads.p720) {
            dlMenu.innerHTML += `<a href="${escapeHtml(downloads.p720)}" class="download-item" target="_blank" download="${safeTitle}_720p.mp4"><span>720p HD</span> <span class="quality">MP4</span></a>`;
          }
          if (downloads.p1080) {
            dlMenu.innerHTML += `<a href="${escapeHtml(downloads.p1080)}" class="download-item" target="_blank" download="${safeTitle}_1080p.mp4"><span>1080p FHD</span> <span class="quality">MP4</span></a>`;
          }
          if (downloads.p4k) {
            dlMenu.innerHTML += `<a href="${escapeHtml(downloads.p4k)}" class="download-item" target="_blank" download="${safeTitle}_4k.mp4"><span>4K UHD</span> <span class="quality">MP4</span></a>`;
          }
          
          dlMenu.innerHTML += `<a href="https://www.internetdownloadmanager.com/getlatestversion.html?ai=4478" target="_blank" class="download-item" style="border-top: 1px solid var(--border-color); padding: 0.5rem; justify-content: center; background: #000;">
            <img src="/images/idm_banner_v.png" alt="Get IDM" style="max-width: 100%; height: auto; border-radius: 4px;">
          </a>`;
        } else {
          dlMenu.innerHTML = `<div class="download-item" style="color: var(--text-muted); font-size: 0.8rem; justify-content: center;">No links provided</div>
          <a href="https://www.internetdownloadmanager.com/getlatestversion.html?ai=4478" target="_blank" class="download-item" style="border-top: 1px solid var(--border-color); padding: 0.5rem; justify-content: center; background: #000;">
            <img src="/images/idm_banner_v.png" alt="Get IDM" style="max-width: 100%; height: auto; border-radius: 4px;">
          </a>`;
        }
      } catch (err) {
        dlMenu.innerHTML = '<div class="download-item" style="color: var(--text-muted); font-size: 0.8rem;">No links provided</div>';
      }
    }

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
  const views = formatViews(video.displayViews || video.views || 0);
  const timeAgo = getTimeAgo(video.uploadedAt);

  card.innerHTML = `
    <div class="thumbnail">
      <img src="${thumbUrl}" alt="${escapeHtml(video.title)}" loading="lazy">
    </div>
    <div class="card-info">
      <div class="card-title">${escapeHtml(video.title)}</div>
      ${video.genre ? `<div style="display:inline-block; font-size: 0.7rem; background: var(--accent-gradient-pink); color: white; padding: 2px 8px; border-radius: 4px; margin-top: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">${escapeHtml(video.genre)}</div>` : ''}
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

