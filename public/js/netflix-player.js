
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

  // Background pre-fetch of VAST pre-roll ad
  let prerollAdPromise = null;
  try {
    prerollAdPromise = fetch('/api/vast/preroll', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : { hasAd: false })
      .catch(() => ({ hasAd: false }));
  } catch (err) {
    prerollAdPromise = Promise.resolve({ hasAd: false });
  }
  let prerollHandled = false;
  let isPrerollActive = false;

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
    container.classList.remove('loading');
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

  function pickStartLevel(levels) {
    if (!levels || !levels.length) return 0;
    // Start at lowest bitrate level for instant 0-second playback without buffering stalls.
    // HLS ABR will automatically ramp up to 720p/1080p once buffer is established.
    let minBitrate = Infinity;
    let best = 0;
    for (let i = 0; i < levels.length; i++) {
      const b = levels[i].bitrate || (levels[i].height ? levels[i].height * 1000 : 99999999);
      if (b < minBitrate) {
        minBitrate = b;
        best = i;
      }
    }
    return best;
  }

  function loadHls(src) {
    const hls = new Hls({
      enableWorker: true,
      startLevel: -1,
      capLevelToPlayerSize: true,
      autoStartLoad: true,
      backBufferLength: 30,
      maxBufferLength: 20,
      maxMaxBufferLength: 40,
      abrEwmaDefaultEstimate: 500000
    });
    window.__sxvHls = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      debugLog('Manifest parsed: ' + data.levels.length + ' quality levels');
      data.levels.forEach((level, i) => {
        debugLog('  Level ' + i + ': ' + (level.height || '?') + 'p @ ' + Math.round(level.bitrate / 1000) + 'kbps');
      });
      const start = pickStartLevel(hls.levels);
      hls.startLevel = start;
      setQualityLabel(levelLabel(hls.levels[start]));
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      debugLog('Quality switched to level ' + data.level);
      setQualityLabel(levelLabel(hls.levels[data.level]));
    });

    hls.on(Hls.Events.FRAG_LOADED, () => {
      networkRetries = 0;
      if (!video.paused) {
        container.classList.remove('loading');
      }
    });

    hls.on(Hls.Events.ERROR, function (event, data) {
      debugLog('HLS Error: ' + data.type + ' / ' + data.details + ' (fatal: ' + data.fatal + ')');
      if (data.details === 'manifestLoadError' || data.details === 'manifestLoadTimeOut') {
        const fixed = repairClientHlsUrl(src);
        if (fixed && fixed !== src) {
          debugLog('Retrying HLS at ' + fixed);
          hls.destroy();
          loadHls(fixed);
          return;
        }
      }
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            networkRetries++;
            if (networkRetries <= 3) {
              const levels = hls.levels || [];
              const safer = levels.findIndex((l) => l.height && l.height <= 1080);
              if (safer >= 0) hls.currentLevel = safer;
              hls.startLoad();
            } else {
              showError('Video stream unavailable');
              hls.destroy();
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            debugLog('Media error — drop to 1080p and recover');
            {
              const levels = hls.levels || [];
              const safer = levels.findIndex((l) => l.height && l.height <= 1080 && l.height >= 720);
              if (safer >= 0) {
                hls.currentLevel = safer;
                hls.autoLevelCapping = safer;
              }
            }
            hls.recoverMediaError();
            break;
          default:
            showError('HLS fatal error: ' + data.details);
            hls.destroy();
            break;
        }
      }
    });

    hls.loadSource(src);
    hls.attachMedia(video);
    setQualityLabel('Auto');
  }

  function repairClientHlsUrl(src) {
    try {
      const u = new URL(src);
      const poster = (video && video.getAttribute('poster')) || '';
      if (!poster) return '';
      const t = new URL(poster);
      const vSegs = decodeURIComponent(u.pathname).split('/').filter(Boolean);
      const tSegs = decodeURIComponent(t.pathname).split('/').filter(Boolean);
      if (vSegs.length && tSegs.includes(vSegs[0]) && tSegs[0] !== vSegs[0]) {
        const idx = tSegs.indexOf(vSegs[0]);
        const prefix = tSegs.slice(0, idx).map(encodeURIComponent).join('/');
        u.pathname = '/' + prefix + u.pathname;
        return u.toString();
      }
    } catch (err) {}
    return '';
  }

  let networkRetries = 0;

  if (videoSrc && videoSrc.includes('.m3u8')) {
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      debugLog('Using hls.js for HLS playback');
      loadHls(videoSrc);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
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

  async function togglePlay() {
    if (isPrerollActive) {
      const adVid = document.getElementById('sxv-preroll-video');
      if (adVid) {
        if (adVid.paused) adVid.play();
        else adVid.pause();
      }
      return;
    }

    if (!prerollHandled) {
      prerollHandled = true;
      container.classList.add('loading');

      let adData = { hasAd: false };
      try {
        adData = await Promise.race([
          prerollAdPromise,
          new Promise(r => setTimeout(() => r({ hasAd: false }), 900))
        ]);
      } catch (e) {
        adData = { hasAd: false };
      }

      if (adData && adData.hasAd && adData.mediaUrl) {
        debugLog('Playing VAST Pre-roll ad: ' + adData.mediaUrl);
        playPrerollAd(adData, () => {
          isPrerollActive = false;
          startActualPlayback();
        });
        return;
      } else {
        debugLog('No VAST ad available, playing video directly');
      }
    }

    if (video.paused) {
      startActualPlayback();
    } else {
      video.pause();
      container.classList.remove('loading');
      updatePlayBtn();
    }
  }

  function playPrerollAd(adData, onComplete) {
    isPrerollActive = true;
    container.classList.remove('loading');
    container.classList.remove('paused');

    const existing = document.getElementById('sxv-preroll');
    if (existing) existing.remove();

    const prerollOverlay = document.createElement('div');
    prerollOverlay.id = 'sxv-preroll';
    prerollOverlay.className = 'sxv-preroll-overlay';

    prerollOverlay.innerHTML = `
      <video id="sxv-preroll-video" class="sxv-preroll-video" playsinline webkit-playsinline preload="auto"></video>
      <div class="sxv-preroll-topbar">
        <span class="sxv-preroll-badge" id="sxv-preroll-badge">Ad · ${adData.duration || 30}s</span>
        ${adData.clickUrl ? `<a href="${encodeURI(adData.clickUrl)}" target="_blank" rel="noopener noreferrer" class="sxv-preroll-cta" id="sxv-preroll-cta">Visit Sponsor ↗</a>` : ''}
      </div>
      <div class="sxv-preroll-bottombar">
        <button type="button" class="sxv-preroll-sound-btn" id="sxv-preroll-sound-btn" title="Toggle Sound">
          <svg id="sxv-ad-vol-on" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
          <svg id="sxv-ad-vol-off" style="display:none;" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm4.5 9l-1.27 1.27L3 5.27 4.27 4 19 18.73 21 21zM12 4L9.91 6.09 12 8.18V4z"/></svg>
        </button>
        <div class="sxv-preroll-skip-container" id="sxv-preroll-skip-container"></div>
      </div>
    `;

    container.appendChild(prerollOverlay);

    const adVideo = prerollOverlay.querySelector('#sxv-preroll-video');
    const badge = prerollOverlay.querySelector('#sxv-preroll-badge');
    const ctaBtn = prerollOverlay.querySelector('#sxv-preroll-cta');
    const soundBtn = prerollOverlay.querySelector('#sxv-preroll-sound-btn');
    const volOnIcon = prerollOverlay.querySelector('#sxv-ad-vol-on');
    const volOffIcon = prerollOverlay.querySelector('#sxv-ad-vol-off');
    const skipContainer = prerollOverlay.querySelector('#sxv-preroll-skip-container');

    function pingBeacons(urls) {
      if (!Array.isArray(urls)) return;
      urls.forEach(url => {
        if (!url) return;
        try {
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url);
          } else {
            (new Image()).src = url;
          }
        } catch (e) {
          try { (new Image()).src = url; } catch (err) {}
        }
      });
    }

    let finished = false;
    function finishPreroll() {
      if (finished) return;
      finished = true;
      clearInterval(skipInterval);
      clearTimeout(stallTimer);
      try {
        adVideo.pause();
        adVideo.src = '';
        adVideo.load();
      } catch (e) {}
      if (prerollOverlay && prerollOverlay.parentNode) {
        prerollOverlay.parentNode.removeChild(prerollOverlay);
      }
      isPrerollActive = false;
      onComplete();
    }

    function updateSoundIcons() {
      if (adVideo.muted || adVideo.volume === 0) {
        volOnIcon.style.display = 'none';
        volOffIcon.style.display = 'block';
      } else {
        volOnIcon.style.display = 'block';
        volOffIcon.style.display = 'none';
      }
    }

    soundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      adVideo.muted = !adVideo.muted;
      updateSoundIcons();
    });

    function onAdClick(e) {
      e.stopPropagation();
      pingBeacons(adData.clickTracking);
      if (adData.clickUrl) {
        window.open(adData.clickUrl, '_blank', 'noopener,noreferrer');
      }
      if (!adVideo.paused) adVideo.pause();
    }

    adVideo.addEventListener('click', onAdClick);
    if (ctaBtn) {
      ctaBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pingBeacons(adData.clickTracking);
      });
    }

    let skipRemaining = Math.max(1, parseInt(adData.skipSeconds, 10) || 5);
    function updateSkipUI() {
      if (skipRemaining > 0) {
        skipContainer.innerHTML = `<span class="sxv-skip-badge">Skip Ad in ${skipRemaining}s</span>`;
      } else {
        skipContainer.innerHTML = `<button type="button" class="sxv-skip-btn" id="sxv-skip-btn">Skip Ad ⏭</button>`;
        const skipBtn = skipContainer.querySelector('#sxv-skip-btn');
        if (skipBtn) {
          skipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            finishPreroll();
          });
        }
      }
    }
    updateSkipUI();

    const skipInterval = setInterval(() => {
      if (!adVideo.paused) {
        skipRemaining--;
        updateSkipUI();
        if (skipRemaining <= 0) {
          clearInterval(skipInterval);
        }
      }
    }, 1000);

    let impFired = false;
    adVideo.addEventListener('playing', () => {
      if (!impFired) {
        impFired = true;
        pingBeacons(adData.impressions);
      }
    });

    adVideo.addEventListener('timeupdate', () => {
      if (badge && adVideo.duration) {
        const rem = Math.max(0, Math.ceil(adVideo.duration - adVideo.currentTime));
        badge.textContent = `Ad · ${rem}s`;
      }
    });

    adVideo.addEventListener('ended', finishPreroll);
    adVideo.addEventListener('error', (e) => {
      console.warn('[StreamX VAST] Ad video playback error, bypassing to content', e);
      finishPreroll();
    });

    const stallTimer = setTimeout(() => {
      if (adVideo.currentTime === 0 && adVideo.paused) {
        console.warn('[StreamX VAST] Ad video stalled, bypassing to content');
        finishPreroll();
      }
    }, 4000);

    adVideo.src = adData.mediaUrl;
    adVideo.volume = video.volume || 1;
    adVideo.muted = video.muted;
    updateSoundIcons();

    const playPromise = adVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        debugLog('Ad play muted fallback: ' + err.name);
        adVideo.muted = true;
        updateSoundIcons();
        adVideo.play().catch(finishPreroll);
      });
    }
  }


  function startActualPlayback() {
    debugLog('Play requested, readyState: ' + video.readyState);
    container.classList.add('loading');
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        container.classList.remove('loading');
        updatePlayBtn();
      }).catch(e => {
        container.classList.remove('loading');
        debugLog('Play failed: ' + e.name + ' - ' + e.message);
        if (e.name === 'NotAllowedError') {
          video.muted = true;
          updateVolumeIcon();
          video.play().then(() => {
            container.classList.remove('loading');
            updatePlayBtn();
          }).catch(() => {
            container.classList.remove('loading');
            showError("Tap to play");
          });
        }
      });
    }
  }

  video.addEventListener('waiting', () => {
    debugLog('Video buffering...');
    if (!video.paused && video.readyState < 3) {
      container.classList.add('loading');
    }
  });

  video.addEventListener('playing', () => {
    debugLog('Video playing');
    container.classList.remove('loading');
    updatePlayBtn();
  });

  video.addEventListener('canplay', () => {
    debugLog('canplay fired, readyState: ' + video.readyState);
    if (!video.paused) {
      container.classList.remove('loading');
    }
    updatePlayBtn();
  });

  video.addEventListener('canplaythrough', () => {
    if (!video.paused) {
      container.classList.remove('loading');
    }
    updatePlayBtn();
  });

  video.addEventListener('timeupdate', () => {
    if (!video.paused && container.classList.contains('loading')) {
      container.classList.remove('loading');
    }
    if (!isScrubbing && video.duration) {
      currentTimeDisplay.textContent = formatTime(video.currentTime);
      progressFilled.style.width = `${(video.currentTime / video.duration) * 100}%`;
    }
  });

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

  // Ensure play button is visible on load
  container.classList.add('paused');

  let isTouchDevice = false;
  container.addEventListener('touchstart', () => {
    isTouchDevice = true;
  }, { passive: true });

  playPauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
    resetHideTimer();
  });
  bigPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
    resetHideTimer();
  });
  video.addEventListener('click', () => {
    if (isTouchDevice && !video.paused && !container.classList.contains('active')) {
      resetHideTimer();
      return;
    }
    togglePlay();
    resetHideTimer();
  });
  video.addEventListener('play', () => {
    updatePlayBtn();
    resetHideTimer();
  });
  video.addEventListener('pause', updatePlayBtn);

  video.addEventListener('loadedmetadata', () => {
    durationDisplay.textContent = formatTime(video.duration);
  });

  let isScrubbing = false;

  function hoverPos(e) {
    const rect = progressContainer.getBoundingClientRect();
    if (!rect.width) return 0;
    const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX
      : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX
      : e.clientX;
    if (typeof clientX !== 'number' || isNaN(clientX)) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
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
      if (video.duration) currentTimeDisplay.textContent = formatTime(pos * video.duration);
    }
    if (video.duration && updateVideo && isFinite(pos)) {
      video.currentTime = pos * video.duration;
    }
  }

  progressContainer.addEventListener('mousedown', (e) => { isScrubbing = true; scrub(e, true); });
  document.addEventListener('mousemove', (e) => { if (isScrubbing) scrub(e, false); });
  document.addEventListener('mouseup', (e) => { if (isScrubbing) { scrub(e, true); isScrubbing = false; } });

  progressContainer.addEventListener('touchstart', (e) => {
    isScrubbing = true;
    resetHideTimer();
    scrub(e, false);
  }, { passive: true });
  progressContainer.addEventListener('touchmove', (e) => {
    if (!isScrubbing) return;
    resetHideTimer();
    scrub(e, false);
  }, { passive: true });
  progressContainer.addEventListener('touchend', (e) => {
    if (isScrubbing) {
      scrub(e, true);
      isScrubbing = false;
      if (previewTooltip) previewTooltip.classList.remove('is-visible');
    }
  });

  rewindBtn.addEventListener('click', () => {
    video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
    resetHideTimer();
  });
  forwardBtn.addEventListener('click', () => {
    if (video.duration) video.currentTime = Math.min(video.duration, (video.currentTime || 0) + 10);
    resetHideTimer();
  });

  function toggleMute() {
    video.muted = !video.muted;
    volumeSlider.value = video.muted ? 0 : video.volume;
    updateVolumeIcon();
    resetHideTimer();
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
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || video.webkitDisplayingFullscreen);
    if (!isFs) {
      if (container.requestFullscreen) container.requestFullscreen();
      else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (video.webkitExitFullscreen) video.webkitExitFullscreen();
    }
  }
  function onFullscreenChange() {
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement || video.webkitDisplayingFullscreen);
    fullscreenIcon.classList.toggle('hidden', fs);
    exitFullscreenIcon.classList.toggle('hidden', !fs);
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  video.addEventListener('webkitbeginfullscreen', onFullscreenChange);
  video.addEventListener('webkitendfullscreen', onFullscreenChange);
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
    resetHideTimer();
  });

  document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement && document.activeElement.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
    if (isPrerollActive) {
      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      }
      return;
    }
    switch (e.key.toLowerCase()) {
      case ' ': case 'k': e.preventDefault(); togglePlay(); break;
      case 'f': e.preventDefault(); toggleFullscreen(); break;
      case 'm': e.preventDefault(); toggleMute(); break;
      case 'arrowleft': e.preventDefault(); video.currentTime = Math.max(0, (video.currentTime || 0) - 10); break;
      case 'arrowright': e.preventDefault(); if (video.duration) video.currentTime = Math.min(video.duration, (video.currentTime || 0) + 10); break;
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
