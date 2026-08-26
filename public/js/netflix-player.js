

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
  const previewCtx = previewCanvas ? previewCanvas.getContext('2d') : null;
  const hiddenVideo = document.getElementById('preview-hidden-video');

  // Stream URL: Replace this with any HLS (.m3u8) or MP4 URL
  

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
    
    // Setup hidden video for preview extraction
    if (hiddenVideo) {
      const hlsPreview = new Hls({
        autoStartLoad: true,
        startPosition: -1,
        capLevelToPlayerSize: true, // save bandwidth
      });
      hlsPreview.loadSource(videoSrc);
      hlsPreview.attachMedia(hiddenVideo);
    }
  } else if (video.canPlayType('application/vnd.apple.mpegurl') || videoSrc.includes('.mp4') || true) {
    // Native support (Safari) or standard MP4 fallback
    video.src = videoSrc;
    if (hiddenVideo) hiddenVideo.src = videoSrc;
  } else {
    console.error("Video format not supported.");
  }

  // Utility to format time (e.g., 1:23)
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

  // Play / Pause Logic
  function togglePlay() {
    if (video.paused) {
      video.play();
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

  // Time and Progress Updates
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

  const previewTooltip = document.getElementById('preview-tooltip');
  const previewTimeDisplay = document.getElementById('preview-time');

  let hoverTimeout;

  if (hiddenVideo && previewCtx) {
    hiddenVideo.addEventListener('seeked', () => {
      previewCtx.drawImage(hiddenVideo, 0, 0, previewCanvas.width, previewCanvas.height);
    });
  }

  progressContainer.addEventListener('mousemove', (e) => {
    const rect = progressContainer.getBoundingClientRect();
    let pos = (e.clientX - rect.left) / rect.width;
    
    // Clamp pos between 0 and 1
    pos = Math.max(0, Math.min(1, pos));
    
    // Update tooltip position (prevent overflowing the player bounds)
    const tooltipWidth = 170; // approximate width of tooltip with padding
    const containerWidth = rect.width;
    let pixelPos = pos * containerWidth;
    
    // Clamp pixel pos so tooltip doesn't go off-screen
    pixelPos = Math.max(tooltipWidth / 2, Math.min(containerWidth - tooltipWidth / 2, pixelPos));
    
    previewTooltip.style.left = `${pixelPos}px`;
    
    // Calculate and update time
    const hoverTime = pos * video.duration;
    previewTimeDisplay.textContent = formatTime(hoverTime);
    
    // Dynamically fetch frame using hidden video (debounced to avoid network spam)
    if (hiddenVideo) {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        hiddenVideo.currentTime = hoverTime;
      }, 150); // wait 150ms before seeking to extract frame
    }
  });

  let isScrubbing = false;

  function scrub(e, updateVideo = false) {
    const rect = progressContainer.getBoundingClientRect();
    let pos = (e.clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos));
    
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

  // Rewind and Forward (10s)
  rewindBtn.addEventListener('click', () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });
  
  forwardBtn.addEventListener('click', () => {
    video.currentTime = Math.min(video.duration, video.currentTime + 10);
  });

  // Volume Logic
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

  // Fullscreen Logic
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

  // Playback Speed
  const speeds = [1, 1.25, 1.5, 2, 0.5];
  let speedIndex = 0;
  speedBtn.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % speeds.length;
    video.playbackRate = speeds[speedIndex];
    speedBtn.textContent = `${speeds[speedIndex]}x`;
  });

  // Keyboard Shortcuts
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

  // Auto-hide controls on inactivity
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

  // Initial State Setup
  updatePlayBtn();
  updateVolumeIcon();
};