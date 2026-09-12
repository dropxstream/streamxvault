
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

  if (videoSrc.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      startLevel: -1,
      capLevelToPlayerSize: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 60
    });
    hls.loadSource(videoSrc);
    hls.attachMedia(video);
    setQualityLabel('Auto');
    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      setQualityLabel(levelLabel(hls.levels[data.level]));
    });
    hls.on(Hls.Events.ERROR, function (event, data) {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else hls.destroy();
      }
    });
  } else {
    video.src = videoSrc;
    setQualityLabel('Auto');
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  let adPlayed = false;
  const vastAdTag = "https://youradexchange.com/video/select.php?r=11262018";

  function togglePlay() {
    if (video.paused) {
      if (!adPlayed && typeof window.playVastAd === 'function') {
        adPlayed = true;
        window.playVastAd(container, vastAdTag, () => {
          video.play().catch(() => {});
        });
      } else {
        video.play();
      }
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
