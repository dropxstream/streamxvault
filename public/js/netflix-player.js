
window.initNetflixPlayer = function(videoSrc, thumbUrl) {
  const container = document.getElementById('video-container');
  const video = document.getElementById('video-player');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const bigPlayBtn = document.getElementById('big-play-btn');
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  const progressContainer = document.getElementById('progress-container');
  const progressFilled = document.getElementById('progress-filled');
  const currentTimeDisplay = document.getElementById('current-time');
  const durationDisplay = document.getElementById('duration');
  const muteBtn = document.getElementById('mute-btn');
  const volumeIcon = document.getElementById('volume-icon');
  const muteIcon = document.getElementById('mute-icon');
  const volumeSlider = document.getElementById('volume-slider');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const fullscreenIcon = document.getElementById('fullscreen-icon');
  const exitFullscreenIcon = document.getElementById('exit-fullscreen-icon');
  const rewindBtn = document.getElementById('rewind-btn');
  const forwardBtn = document.getElementById('forward-btn');
  const speedBtn = document.getElementById('speed-btn');
  let previewEl = document.getElementById('preview-canvas');
  const hiddenVideo = document.getElementById('preview-hidden-video');
  const previewTooltip = document.getElementById('preview-tooltip');
  const previewTimeDisplay = document.getElementById('preview-time');
  const qualityIndicator = document.getElementById('quality-indicator');
  const poster = thumbUrl || (video && video.getAttribute('poster')) || '';

  if (hiddenVideo) hiddenVideo.remove();

  if (previewEl && previewEl.tagName === 'CANVAS') {
    const img = document.createElement('img');
    img.id = 'preview-canvas';
    img.className = 'preview-image';
    img.alt = '';
    previewEl.replaceWith(img);
    previewEl = img;
  }
  if (previewEl && poster) {
    if (previewEl.tagName === 'IMG') previewEl.src = poster;
    previewEl.style.backgroundImage = 'url("' + String(poster).replace(/"/g, '') + '")';
  }

  function setQualityLabel(label) {
    if (qualityIndicator) qualityIndicator.textContent = 'Auto · ' + label;
  }

  function levelLabel(level) {
    if (!level) return 'Auto';
    const height = level.height || (level.attrs && parseInt(String(level.attrs.RESOLUTION || '').split('x')[1], 10));
    if (height >= 2160) return '4K';
    if (height) return height + 'p';
    if (level.bitrate) return Math.round(level.bitrate / 1000) + ' kbps';
    return 'Auto';
  }

  function showError(msg) {
    console.error('Video Error:', msg);
    const errDiv = document.createElement('div');
    errDiv.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;background:rgba(220,38,38,0.9);padding:1rem 1.5rem;border-radius:8px;z-index:9999;font-weight:600;text-align:center;max-width:80%;";
    errDiv.textContent = '⚠️ ' + msg;
    container.appendChild(errDiv);
  }

  function debugLog(msg) {
    console.log('[StreamX Player]', msg);
  }

  video.addEventListener('error', (e) => {
    let msg = "Unknown error";
    if (video.error) {
      switch (video.error.code) {
        case 1: msg = "Aborted"; break;
        case 2: msg = "Network error"; break;
        case 3: msg = "Decode error"; break;
        case 4: msg = "Source not supported"; break;
      }
      if (video.error.message) msg += ": " + video.error.message;
    }
    showError(msg);
  });

  debugLog('Source: ' + videoSrc);
  debugLog('HLS supported: ' + (typeof Hls !== 'undefined' && Hls.isSupported()));

  if (videoSrc && videoSrc.includes('.m3u8')) {
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      debugLog('Using hls.js for HLS playback');
      const hls = new Hls({
        enableWorker: true,
        startLevel: -1,
        capLevelToPlayerSize: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        xhrSetup: function(xhr, url) {
          debugLog('Loading: ' + url.substring(url.lastIndexOf('/') + 1));
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        debugLog('Manifest parsed: ' + data.levels.length + ' quality levels');
        data.levels.forEach((level, i) => {
          debugLog('  Level ' + i + ': ' + (level.height || '?') + 'p @ ' + Math.round(level.bitrate/1000) + 'kbps');
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        debugLog('Quality switched to level ' + data.level);
        setQualityLabel(levelLabel(hls.levels[data.level]));
      });

      hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
        debugLog('Fragment loaded: ' + data.frag.sn + ' (level ' + data.frag.level + ')');
      });

      hls.on(Hls.Events.ERROR, function (event, data) {
        debugLog('HLS Error: ' + data.type + ' / ' + data.details + ' (fatal: ' + data.fatal + ')');
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              debugLog('Attempting recovery from network error...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              debugLog('Attempting recovery from media error...');
              hls.recoverMediaError();
              break;
            default:
              showError("HLS fatal error: " + data.details);
              hls.destroy();
              break;
          }
        }
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        debugLog('Media attached to video element');
      });

      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        debugLog('Buffer appended, readyState: ' + video.readyState);
      });

      hls.loadSource(videoSrc);
      hls.attachMedia(video);
      setQualityLabel('Auto');

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      debugLog('Using Safari native HLS');
      video.src = videoSrc;
      setQualityLabel('Auto');
    } else {
      showError("Your browser does not support HLS video");
    }
  } else if (videoSrc) {
    debugLog('Using direct MP4 playback');
    video.src = videoSrc;
    setQualityLabel('Auto');
  } else {
    showError("No video URL provided");
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function togglePlay() {
    if (video.paused) {
      video.play().catch(e => {
        showError("Autoplay blocked or playback failed");
      });
    } else {
      video.pause();
    }
  }

  function updatePlayBtn() {
    if (video.paused) {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
      container.classList.add('paused');
    } else {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
      container.classList.remove('paused');
    }
  }

  playPauseBtn.addEventListener('click', togglePlay);
  bigPlayBtn.addEventListener('click', togglePlay);
  video.addEventListener('click', togglePlay);
  video.addEventListener('play', updatePlayBtn);
  video.addEventListener('pause', updatePlayBtn);

  video.addEventListener('loadedmetadata', () => {
    durationDisplay.textContent = formatTime(video.duration);
  });

  let isScrubbing = false;

  video.addEventListener('timeupdate', () => {
    if (!isScrubbing && video.duration) {
      currentTimeDisplay.textContent = formatTime(video.currentTime);
      progressFilled.style.width = `${(video.currentTime / video.duration) * 100}%`;
    }
  });

  function hoverPos(e) {
    const rect = progressContainer.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  progressContainer.addEventListener('mousemove', (e) => {
    const pos = hoverPos(e);
    const rect = progressContainer.getBoundingClientRect();
    if (previewTooltip) {
      previewTooltip.style.left = `${pos * rect.width}px`;
      previewTooltip.classList.add('is-visible');
    }
    if (previewTimeDisplay) previewTimeDisplay.textContent = formatTime((video.duration || 0) * pos);
  });
  progressContainer.addEventListener('mouseenter', () => {
    if (previewTooltip) previewTooltip.classList.add('is-visible');
  });
  progressContainer.addEventListener('mouseleave', () => {
    if (previewTooltip) previewTooltip.classList.remove('is-visible');
  });

  function scrub(e, updateVideo) {
    const pos = hoverPos(e);
    if (isScrubbing) {
      progressFilled.style.width = `${pos * 100}%`;
      currentTimeDisplay.textContent = formatTime(pos * video.duration);
    }
    if (video.duration && updateVideo) video.currentTime = pos * video.duration;
  }

  progressContainer.addEventListener('mousedown', (e) => { isScrubbing = true; scrub(e, true); });
  document.addEventListener('mousemove', (e) => { if (isScrubbing) scrub(e, false); });
  document.addEventListener('mouseup', (e) => { if (isScrubbing) { scrub(e, true); isScrubbing = false; } });

  rewindBtn.addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
  forwardBtn.addEventListener('click', () => { video.currentTime = Math.min(video.duration, video.currentTime + 10); });

  function toggleMute() {
    video.muted = !video.muted;
    volumeSlider.value = video.muted ? 0 : video.volume;
    updateVolumeIcon();
  }
  function updateVolumeIcon() {
    const muted = video.muted || video.volume === 0;
    volumeIcon.classList.toggle('hidden', muted);
    muteIcon.classList.toggle('hidden', !muted);
  }
  muteBtn.addEventListener('click', toggleMute);
  volumeSlider.addEventListener('input', (e) => {
    video.volume = e.target.value;
    video.muted = e.target.value === '0';
    updateVolumeIcon();
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (container.requestFullscreen) container.requestFullscreen();
      else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
    } else if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  document.addEventListener('fullscreenchange', () => {
    const fs = !!document.fullscreenElement;
    fullscreenIcon.classList.toggle('hidden', fs);
    exitFullscreenIcon.classList.toggle('hidden', !fs);
  });
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  video.addEventListener('dblclick', toggleFullscreen);
  video.addEventListener('loadeddata', updatePlayBtn);
  video.addEventListener('canplay', updatePlayBtn);

  const speeds = [1, 1.25, 1.5, 2, 0.5];
  let speedIndex = 0;
  speedBtn.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % speeds.length;
    video.playbackRate = speeds[speedIndex];
    speedBtn.textContent = `${speeds[speedIndex]}x`;
  });

  document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    switch (e.key.toLowerCase()) {
      case ' ': case 'k': e.preventDefault(); togglePlay(); break;
      case 'f': e.preventDefault(); toggleFullscreen(); break;
      case 'm': e.preventDefault(); toggleMute(); break;
      case 'arrowleft': e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); break;
      case 'arrowright': e.preventDefault(); video.currentTime = Math.min(video.duration, video.currentTime + 10); break;
      case 'arrowup':
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.1);
        video.muted = false;
        volumeSlider.value = video.volume;
        updateVolumeIcon();
        break;
      case 'arrowdown':
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
        if (video.volume === 0) video.muted = true;
        volumeSlider.value = video.volume;
        updateVolumeIcon();
        break;
    }
  });

  let hideTimeout;
  function resetHideTimer() {
    container.classList.add('active');
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!video.paused) container.classList.remove('active');
    }, 3000);
  }
  container.addEventListener('mousemove', resetHideTimer);
  container.addEventListener('mouseleave', () => {
    if (!video.paused) container.classList.remove('active');
  });

  updatePlayBtn();
  updateVolumeIcon();
};
