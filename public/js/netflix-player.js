
window.initNetflixPlayer = function(videoSrc) {
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
  const previewCanvas = document.getElementById('preview-canvas');
  const hiddenVideo = document.getElementById('preview-hidden-video');
  const previewTooltip = document.getElementById('preview-tooltip');
  const previewTimeDisplay = document.getElementById('preview-time');

  if (!document.getElementById('preview-hover-style')) {
    const style = document.createElement('style');
    style.id = 'preview-hover-style';
    style.textContent = `
      .progress-bar-container { position: relative; }
      .preview-tooltip {
        position: absolute;
        bottom: 18px;
        left: 0;
        transform: translateX(-50%);
        display: none;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        z-index: 40;
        will-change: left;
      }
      .preview-tooltip.is-visible { display: flex; }
      .preview-tooltip .preview-video,
      .preview-tooltip #preview-hidden-video,
      .preview-tooltip .preview-image {
        width: 168px;
        height: 94px;
        object-fit: cover;
        background: #111;
        border-radius: 6px;
        border: 2px solid #fff;
        box-shadow: 0 8px 24px rgba(0,0,0,.45);
        display: block;
      }
      .preview-tooltip .preview-time {
        margin-top: 4px;
        padding: 2px 8px;
        background: rgba(0,0,0,.85);
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        border-radius: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  if (hiddenVideo) {
    hiddenVideo.classList.add('preview-video');
    hiddenVideo.removeAttribute('style');
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.preload = 'auto';
    if (previewTooltip && hiddenVideo.parentElement !== previewTooltip) {
      previewTooltip.insertBefore(hiddenVideo, previewTooltip.firstChild);
    }
  }
  if (previewCanvas && previewCanvas.parentElement) {
    previewCanvas.style.display = 'none';
  }

  if (videoSrc.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 90, maxBufferLength: 60, maxMaxBufferLength: 600 });
    hls.loadSource(videoSrc);
    hls.attachMedia(video);

    hls.on(Hls.Events.ERROR, function (event, data) {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            break;
        }
      }
    });

    if (hiddenVideo) {
      const hlsPreview = new Hls({
        autoStartLoad: true,
        startLevel: 0,
        capLevelToPlayerSize: true,
        maxBufferLength: 8,
        maxMaxBufferLength: 12,
        maxBufferSize: 2 * 1000 * 1000,
        enableWorker: true
      });
      hlsPreview.loadSource(videoSrc);
      hlsPreview.attachMedia(hiddenVideo);
      hlsPreview.on(Hls.Events.MANIFEST_PARSED, () => {
        try { hlsPreview.currentLevel = 0; } catch (e) {}
      });
    }
  } else if (video.canPlayType('application/vnd.apple.mpegurl') || videoSrc.includes('.mp4') || true) {
    video.src = videoSrc;
    if (hiddenVideo) hiddenVideo.src = videoSrc;
  } else {
    console.error("Video format not supported.");
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  let adPlayed = false;
  const vastAdTag = "https://youradexchange.com/video/select.php?r=11262018";

  function togglePlay() {
    if (video.paused) {
      if (!adPlayed && typeof window.playVastAd === 'function') {
        adPlayed = true;
        window.playVastAd(container, vastAdTag, () => {
          video.play().catch(e => console.error("Playback failed after ad:", e));
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
    const spinner = document.getElementById('spinner');
    if (spinner) spinner.style.display = 'none';
  });

  video.addEventListener('timeupdate', () => {
    if (typeof isScrubbing !== 'undefined' && !isScrubbing) {
      currentTimeDisplay.textContent = formatTime(video.currentTime);
      const progressPercent = (video.currentTime / video.duration) * 100;
      progressFilled.style.width = `${progressPercent}%`;
    }
  });

  let isScrubbing = false;
  let previewSeeking = false;
  let pendingPreviewTime = null;
  let lastPreviewTime = -1;

  function seekPreview(time) {
    if (!hiddenVideo || !isFinite(time)) return;
    if (Math.abs(time - lastPreviewTime) < 0.35) return;
    if (previewSeeking) {
      pendingPreviewTime = time;
      return;
    }
    previewSeeking = true;
    lastPreviewTime = time;
    try {
      hiddenVideo.currentTime = time;
    } catch (e) {
      previewSeeking = false;
    }
  }

  if (hiddenVideo) {
    hiddenVideo.addEventListener('seeked', () => {
      previewSeeking = false;
      if (pendingPreviewTime !== null) {
        const next = pendingPreviewTime;
        pendingPreviewTime = null;
        seekPreview(next);
      }
    });
    hiddenVideo.addEventListener('error', () => {
      previewSeeking = false;
    });
  }

  function hoverPos(e) {
    const rect = progressContainer.getBoundingClientRect();
    let pos = (e.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, pos));
  }

  progressContainer.addEventListener('mousemove', (e) => {
    const pos = hoverPos(e);
    const rect = progressContainer.getBoundingClientRect();
    if (previewTooltip) {
      previewTooltip.style.left = `${pos * rect.width}px`;
      previewTooltip.classList.add('is-visible');
    }
    const hoverTime = (video.duration || 0) * pos;
    if (previewTimeDisplay) previewTimeDisplay.textContent = formatTime(hoverTime);
    seekPreview(hoverTime);
  });

  progressContainer.addEventListener('mouseenter', () => {
    if (previewTooltip) previewTooltip.classList.add('is-visible');
  });

  progressContainer.addEventListener('mouseleave', () => {
    if (previewTooltip) previewTooltip.classList.remove('is-visible');
  });

  function scrub(e, updateVideo = false) {
    const pos = hoverPos(e);
    if (isScrubbing) {
      progressFilled.style.width = `${pos * 100}%`;
      currentTimeDisplay.textContent = formatTime(pos * video.duration);
    }
    if (video.duration && updateVideo) {
      video.currentTime = pos * video.duration;
    }
  }

  progressContainer.addEventListener('mousedown', (e) => {
    isScrubbing = true;
    scrub(e, true);
  });

  document.addEventListener('mousemove', (e) => {
    if (isScrubbing) scrub(e, false);
  });

  document.addEventListener('mouseup', (e) => {
    if (isScrubbing) {
      scrub(e, true);
      isScrubbing = false;
    }
  });

  rewindBtn.addEventListener('click', () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });

  forwardBtn.addEventListener('click', () => {
    video.currentTime = Math.min(video.duration, video.currentTime + 10);
  });

  function toggleMute() {
    video.muted = !video.muted;
    if (video.muted) {
      volumeSlider.value = 0;
    } else {
      volumeSlider.value = video.volume;
    }
    updateVolumeIcon();
  }

  function updateVolumeIcon() {
    if (video.muted || video.volume === 0) {
      volumeIcon.classList.add('hidden');
      muteIcon.classList.remove('hidden');
    } else {
      volumeIcon.classList.remove('hidden');
      muteIcon.classList.add('hidden');
    }
  }

  muteBtn.addEventListener('click', toggleMute);

  volumeSlider.addEventListener('input', (e) => {
    video.volume = e.target.value;
    video.muted = e.target.value === '0';
    updateVolumeIcon();
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      fullscreenIcon.classList.add('hidden');
      exitFullscreenIcon.classList.remove('hidden');
    } else {
      fullscreenIcon.classList.remove('hidden');
      exitFullscreenIcon.classList.add('hidden');
    }
  });

  fullscreenBtn.addEventListener('click', toggleFullscreen);
  video.addEventListener('dblclick', toggleFullscreen);
  video.addEventListener('loadeddata', () => {
    updatePlayBtn();
    const spinner = document.getElementById('spinner');
    if (spinner) spinner.style.display = 'none';
  });
  video.addEventListener('canplay', () => {
    updatePlayBtn();
    const spinner = document.getElementById('spinner');
    if (spinner) spinner.style.display = 'none';
  });
  updatePlayBtn();

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
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 'arrowleft':
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      case 'arrowright':
        e.preventDefault();
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
        break;
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
      if (!video.paused) {
        container.classList.remove('active');
      }
    }, 3000);
  }

  container.addEventListener('mousemove', resetHideTimer);
  container.addEventListener('mouseleave', () => {
    if (!video.paused) {
      container.classList.remove('active');
    }
  });

  updatePlayBtn();
  updateVolumeIcon();
};
