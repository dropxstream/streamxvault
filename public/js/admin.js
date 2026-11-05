/**
 * StreamXvault — Admin Panel Logic
 * Uses JWT tokens for persistent auth & direct R2 uploads
 */

// ==================== Token & Session Management ====================
// Dual-transport auth: HMAC signed HTTP-only cookies + Authorization headers for maximum cross-origin / iframe reliability
function authHeaders() {
  try {
    const token = localStorage.getItem('sxv_admin_token') || '';
    if (token) {
      return {
        'X-Admin-Token': token,
        'Authorization': 'Bearer ' + token
      };
    }
  } catch (e) {}
  return {};
}

function clearToken() {
  try {
    localStorage.removeItem('sxv_admin_token');
  } catch (e) {}
}

function saveEditModalState() {
  try {
    const data = {
      id: document.getElementById('edit-id')?.value,
      title: document.getElementById('edit-title')?.value,
      genre: document.getElementById('edit-genre')?.value,
      model: document.getElementById('edit-model')?.value,
      tags: document.getElementById('edit-tags')?.value,
      views: document.getElementById('edit-display-views')?.value,
      desc: document.getElementById('edit-desc')?.value,
      videoUrl: document.getElementById('edit-video-url')?.value,
      thumbUrl: document.getElementById('edit-thumb-url')?.value,
      dl480: document.getElementById('edit-dl-480')?.value,
      dl720: document.getElementById('edit-dl-720')?.value,
      dl1080: document.getElementById('edit-dl-1080')?.value,
      dl4k: document.getElementById('edit-dl-4k')?.value,
      published: document.getElementById('edit-published')?.checked
    };
    sessionStorage.setItem('sxv_pending_edit', JSON.stringify(data));
  } catch (e) {}
}

function restoreEditModalState() {
  try {
    const raw = sessionStorage.getItem('sxv_pending_edit');
    if (!raw) return;
    sessionStorage.removeItem('sxv_pending_edit');
    const data = JSON.parse(raw);
    if (!data || !data.id) return;
    openEditModal(data.id);
    if (data.title) document.getElementById('edit-title').value = data.title;
    if (data.genre) document.getElementById('edit-genre').value = data.genre;
    if (data.model) document.getElementById('edit-model').value = data.model;
    if (data.tags) document.getElementById('edit-tags').value = data.tags;
    if (data.views) document.getElementById('edit-display-views').value = data.views;
    if (data.desc) document.getElementById('edit-desc').value = data.desc;
    if (data.videoUrl) document.getElementById('edit-video-url').value = data.videoUrl;
    if (data.thumbUrl) document.getElementById('edit-thumb-url').value = data.thumbUrl;
    if (data.dl480) document.getElementById('edit-dl-480').value = data.dl480;
    if (data.dl720) document.getElementById('edit-dl-720').value = data.dl720;
    if (data.dl1080) document.getElementById('edit-dl-1080').value = data.dl1080;
    if (data.dl4k) document.getElementById('edit-dl-4k').value = data.dl4k;
    showToast('Restored unsaved video edits! ✨', 'info');
  } catch (e) {}
}

// ==================== Toast Notifications ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==================== Utility Functions ====================
function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text == null ? '' : text).replace(/[&<>"']/g, m => map[m]);
}

function formatViews(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
  return count.toString();
}

function getTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 2592000) return Math.floor(seconds / 86400) + 'd ago';
  if (seconds < 31536000) return Math.floor(seconds / 2592000) + 'mo ago';
  return Math.floor(seconds / 31536000) + 'y ago';
}

// ==================== Auth ====================
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/status', {
      headers: authHeaders()
    });
    const data = await res.json();
    if (data.isAdmin) {
      showDashboard();
      loadDashboard();
      setTimeout(restoreEditModalState, 400);
    }
  } catch {
    // ignore
  }
}

// ==================== Auth & 2FA State ====================
let currentPreAuthToken = null;
let isUsingBackupCode = false;

// Step 1: Login with Username & Password
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-username').value.trim();
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Verifying...';
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🔓 Login';
      }

      if (res.ok) {
        if (data.requires2FA) {
          // 2FA is required! Transition to Step 2
          currentPreAuthToken = data.tempToken;
          document.getElementById('login-step-credentials').style.display = 'none';
          document.getElementById('login-step-2fa').style.display = 'block';
          const codeInput = document.getElementById('two-factor-code');
          codeInput.value = '';
          codeInput.focus();
          showToast('Credentials accepted. Please enter your 2FA code.', 'info');
        } else {
          // Standard login without 2FA
          if (data.token) {
            try { localStorage.setItem('sxv_admin_token', data.token); } catch (e) {}
          }
          showToast('Welcome, Admin! 🎉', 'success');
          showDashboard();
          loadDashboard();
          setTimeout(restoreEditModalState, 400);
        }
      } else {
        errorEl.classList.add('visible');
        errorEl.textContent = data.error || 'Invalid credentials. Try again.';
        document.getElementById('admin-password').value = '';
        setTimeout(() => errorEl.classList.remove('visible'), 4000);
      }
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🔓 Login';
      }
      showToast('Login request failed. Please try again.', 'error');
    }
  });
}

// Step 2: Verify Two-Factor Authentication Code
const twoFactorForm = document.getElementById('two-factor-form');
if (twoFactorForm) {
  twoFactorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('two-factor-code').value.trim();
    const errorEl = document.getElementById('two-factor-error');
    const submitBtn = document.getElementById('two-factor-submit-btn');

    if (!code) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Verifying code...';
    }

    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken: currentPreAuthToken, code })
      });

      const data = await res.json();

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🛡️ Verify & Access Dashboard';
      }

      if (res.ok) {
        currentPreAuthToken = null;
        if (data.token) {
          try { localStorage.setItem('sxv_admin_token', data.token); } catch (e) {}
        }
        showToast('Two-Factor Authentication Verified! 🎉', 'success');
        showDashboard();
        loadDashboard();
        setTimeout(restoreEditModalState, 400);
      } else {
        errorEl.classList.add('visible');
        errorEl.textContent = data.error || 'Invalid 2FA code. Please check your app.';
        document.getElementById('two-factor-code').value = '';
        document.getElementById('two-factor-code').focus();
        setTimeout(() => errorEl.classList.remove('visible'), 4000);
      }
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🛡️ Verify & Access Dashboard';
      }
      showToast('Verification failed. Please try again.', 'error');
    }
  });
}

// Toggle between 6-digit TOTP code and 8-character Backup Code
const toggleBackupBtn = document.getElementById('toggle-backup-code-btn');
if (toggleBackupBtn) {
  toggleBackupBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isUsingBackupCode = !isUsingBackupCode;
    const label = document.getElementById('two-factor-code-label');
    const input = document.getElementById('two-factor-code');
    const prompt = document.getElementById('two-factor-prompt-text');

    if (isUsingBackupCode) {
      label.textContent = 'Backup Recovery Code';
      input.placeholder = 'XXXX-XXXX';
      input.maxLength = 9;
      input.inputMode = 'text';
      prompt.textContent = 'Enter one of your saved 8-character recovery backup codes.';
      toggleBackupBtn.textContent = '📱 Use 6-digit Authenticator code';
    } else {
      label.textContent = 'Authentication Code';
      input.placeholder = '000 000';
      input.maxLength = 6;
      input.inputMode = 'numeric';
      prompt.textContent = 'Open Google Authenticator or Authy on your phone and enter the 6-digit code.';
      toggleBackupBtn.textContent = '🔑 Use a backup recovery code';
    }
    input.value = '';
    input.focus();
  });
}

// Back to credentials step
const backToCredsBtn = document.getElementById('back-to-credentials-btn');
if (backToCredsBtn) {
  backToCredsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    currentPreAuthToken = null;
    document.getElementById('login-step-2fa').style.display = 'none';
    document.getElementById('login-step-credentials').style.display = 'block';
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-password').focus();
  });
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders()
    });
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-dashboard').style.display = 'grid';
  document.getElementById('logout-btn').style.display = 'inline-flex';
}

// ==================== Tab Navigation ====================
function switchTab(tabName, element) {
  // Hide all tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.style.display = 'none';
  });

  // Remove active from all sidebar links
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.remove('active');
  });

  // Show selected tab
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) targetTab.style.display = 'block';
  if (element) element.classList.add('active');

  // Load tab data
  if (tabName === 'dashboard') { loadStats(); load2FAStatus(); }
  if (tabName === 'upload') loadGenres();
  if (tabName === 'manage') { loadGenres(); loadAdminVideos(); }
  if (tabName === 'vod') loadVodData();
  if (tabName === 'contact') loadContactAdminData();
  if (tabName === 'security') load2FASecurityTab();
}

// ==================== Dashboard ====================
async function loadDashboard() {
  await Promise.all([loadStats(), loadGenres(), load2FAStatus()]);
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats', { headers: authHeaders() });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    const stats = await res.json();

    document.getElementById('stat-total').textContent = stats.totalVideos;
    document.getElementById('stat-published').textContent = stats.publishedVideos;
    document.getElementById('stat-views').textContent = formatViews(stats.totalViews);
    document.getElementById('stat-likes').textContent = formatViews(stats.totalLikes || 0);
    document.getElementById('stat-visitors').textContent = formatViews(stats.totalVisitors || 0);
    

    // Live Traffic Stats
    try {
      const liveRes = await fetch('/api/admin/live-traffic', { headers: authHeaders() });
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        document.getElementById('stat-live-visitors').textContent = liveData.liveVisitors || 0;
        document.getElementById('stat-pageviews-today').textContent = liveData.pageviewsToday || 0;
        document.getElementById('stat-watches-today').textContent = liveData.watchesToday || 0;
        document.getElementById('stat-countries-live').textContent = liveData.countriesLive || 0;
      }
    } catch(err) {
      console.error('Failed to load live traffic:', err);
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// ==================== Upload ====================
const videoDropArea = document.getElementById('video-drop-area');
const thumbDropArea = document.getElementById('thumb-drop-area');
const videoFileInput = document.getElementById('video-file');
const thumbFileInput = document.getElementById('thumb-file');

// Drag and drop for video
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  videoDropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

videoDropArea.addEventListener('dragenter', () => videoDropArea.classList.add('dragover'));
videoDropArea.addEventListener('dragover', () => videoDropArea.classList.add('dragover'));
videoDropArea.addEventListener('dragleave', () => videoDropArea.classList.remove('dragover'));
videoDropArea.addEventListener('drop', (e) => {
  videoDropArea.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    videoFileInput.files = files;
    updateFileLabel('video');
    extractThumbnailsFromVideo(files[0]);
  }
});

// Drag and drop for thumbnail
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  thumbDropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

thumbDropArea.addEventListener('dragenter', () => thumbDropArea.classList.add('dragover'));
thumbDropArea.addEventListener('dragover', () => thumbDropArea.classList.add('dragover'));
thumbDropArea.addEventListener('dragleave', () => thumbDropArea.classList.remove('dragover'));
thumbDropArea.addEventListener('drop', (e) => {
  thumbDropArea.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    thumbFileInput.files = files;
    updateFileLabel('thumb');
  }
});

// File selection change
videoFileInput.addEventListener('change', () => {
  updateFileLabel('video');
  const file = videoFileInput.files[0];
  if (file) {
    extractThumbnailsFromVideo(file);
  } else {
    resetAutoThumbUI();
  }
});
thumbFileInput.addEventListener('change', () => {
  updateFileLabel('thumb');
  const file = thumbFileInput.files[0];
  if (file) {
    isCustomThumbSelected = true;
    const previewImg = document.getElementById('auto-thumb-preview');
    if (previewImg) previewImg.src = URL.createObjectURL(file);
    const badge = document.getElementById('auto-thumb-badge');
    if (badge) {
      badge.textContent = '📁 Custom File';
      badge.style.background = '#0284c7';
    }
    const revertBtn = document.getElementById('btn-revert-auto-thumb');
    if (revertBtn) revertBtn.style.display = 'inline-block';
    const timeDisplay = document.getElementById('auto-thumb-time-display');
    if (timeDisplay) timeDisplay.textContent = 'Custom Uploaded Image';
  }
});

function updateFileLabel(type) {
  if (type === 'video') {
    const label = document.getElementById('video-file-label');
    const file = videoFileInput.files[0];
    if (file) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      label.innerHTML = `<span class="file-selected">📎 ${file.name} (${sizeMB} MB)</span>`;
    } else {
      label.textContent = 'Drag & drop your video or click to browse';
    }
  } else {
    const label = document.getElementById('thumb-file-label');
    const file = thumbFileInput.files[0];
    if (file) {
      label.innerHTML = `<span class="file-selected">🖼️ ${file.name}</span>`;
    } else {
      label.textContent = 'Click to upload thumbnail image';
    }
  }
}

// ==================== Smart Upload (auto-detects small vs large) ====================

const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB per chunk

async function uploadFileDirectly(file, fileType, progressCallback) {
  const contentType = file.type || 'application/octet-stream';

  // Use multipart for files > 100MB
  if (file.size > CHUNK_SIZE) {
    return await multipartUpload(file, fileType, contentType, progressCallback);
  }

  // Small file: use simple presigned URL
  return await simplePresignedUpload(file, fileType, contentType, progressCallback);
}

// ==================== Simple Upload (files < 100MB) ====================

async function simplePresignedUpload(file, fileType, contentType, progressCallback) {
  const presignRes = await fetch('/api/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ filename: file.name, contentType, fileType })
  });

  if (presignRes.status === 401) { clearToken(); location.reload(); throw new Error('Session expired.'); }

  const presignData = await presignRes.json();
  if (!presignData.direct) return null;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && progressCallback) progressCallback(Math.round((e.loaded / e.total) * 100));
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ publicUrl: presignData.publicUrl, key: presignData.key, id: presignData.id });
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.open('PUT', presignData.uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send(file);
  });
}

// ==================== Multipart Upload (files > 100MB) ====================

async function multipartUpload(file, fileType, contentType, progressCallback) {
  // Step 1: Create multipart upload
  const createRes = await fetch('/api/upload/multipart/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ filename: file.name, contentType, fileType })
  });

  if (createRes.status === 401) { clearToken(); location.reload(); throw new Error('Session expired.'); }
  const createData = await createRes.json();
  if (!createData.direct) return null;

  const { uploadId, key, id, publicUrl } = createData;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const completedParts = [];
  let totalUploaded = 0;

  console.log(`📦 Multipart upload: ${totalChunks} chunks of ${(CHUNK_SIZE / 1024 / 1024)}MB`);

  try {
    // Step 2: Upload each chunk
    for (let i = 0; i < totalChunks; i++) {
      const partNumber = i + 1;
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      // Get presigned URL for this part
      const partRes = await fetch('/api/upload/multipart/presign-part', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ key, uploadId, partNumber })
      });
      const partData = await partRes.json();

      // Upload the chunk directly to R2
      const etag = await uploadChunk(partData.url, chunk, (chunkProgress) => {
        const chunkBytes = (chunkProgress / 100) * (end - start);
        const overall = Math.round(((totalUploaded + chunkBytes) / file.size) * 100);
        if (progressCallback) progressCallback(overall);
      });

      totalUploaded += (end - start);
      completedParts.push({ partNumber, etag });

      console.log(`✅ Part ${partNumber}/${totalChunks} uploaded`);
    }

    // Step 3: Complete the multipart upload
    const completeRes = await fetch('/api/upload/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ key, uploadId, parts: completedParts })
    });

    if (!completeRes.ok) {
      throw new Error('Failed to complete multipart upload');
    }

    if (progressCallback) progressCallback(100);
    return { publicUrl, key, id };

  } catch (err) {
    // Abort the multipart upload on failure
    console.error('❌ Multipart upload failed, aborting...', err);
    try {
      await fetch('/api/upload/multipart/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ key, uploadId })
      });
    } catch {}
    throw err;
  }
}

function uploadChunk(url, chunk, progressCallback) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && progressCallback) progressCallback(Math.round((e.loaded / e.total) * 100));
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag');
        if (!etag) {
          reject(new Error('Upload failed. Please check server CORS configuration.'));
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`Chunk upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.open('PUT', url);
    xhr.send(chunk);
  });
}

async function legacyUpload(formData, progressCallback) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && progressCallback) {
        progressCallback(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          reject(new Error(JSON.parse(xhr.responseText).error));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));

    xhr.open('POST', '/api/videos/upload');
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}

let currentUploadSource = 'file';

window.toggleUploadSource = function() {
  const source = document.querySelector('input[name="upload-source"]:checked').value;
  currentUploadSource = source;
  document.getElementById('file-upload-mode').style.display = source === 'file' ? 'block' : 'none';
  document.getElementById('external-link-mode').style.display = source === 'external' ? 'block' : 'none';
  document.getElementById('r2-link-mode').style.display = source === 'r2hls' ? 'block' : 'none';
};

// Upload form submission
document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('video-title').value.trim();
  if (!title) {
    showToast('Please enter a video title', 'error');
    return;
  }

  const uploadNewGenreInput = document.getElementById('upload-new-genre-input');
  let genre = document.getElementById('video-genre').value;
  if (uploadNewGenreInput && uploadNewGenreInput.value.trim()) {
    genre = uploadNewGenreInput.value.trim();
  }
  if (!genre) {
    showToast('Please select or create a video genre', 'error');
    return;
  }

  const modelName = document.getElementById('video-model').value.trim();
  const tags = document.getElementById('video-tags') ? document.getElementById('video-tags').value.trim() : '';
  const description = document.getElementById('video-desc').value.trim();
  const displayViews = document.getElementById('video-display-views').value.trim();

  // Handle External Link Submission
  if (currentUploadSource === 'external') {
    const extVideoUrl = document.getElementById('ext-video-url').value.trim();
    const extThumbUrl = document.getElementById('ext-thumb-url').value.trim();
    const dl480 = document.getElementById('dl-480').value.trim(); const dl720 = document.getElementById('dl-720').value.trim(); const dl1080 = document.getElementById('dl-1080').value.trim(); const dl4k = document.getElementById('dl-4k').value.trim();

    if (!extVideoUrl) {
      showToast('Please enter an External Video URL', 'error');
      return;
    }

    const submitBtn = document.getElementById('upload-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Linking...';

    try {
      const res = await fetch('/api/admin/videos/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ 
          title, genre, modelName, tags, description, 
          videoUrl: extVideoUrl, 
          thumbnailUrl: extThumbUrl,
          dl480, dl720, dl1080, dl4k, displayViews
        })
      });

      if (!res.ok) throw new Error('Failed to link external video');
      
      showToast(`"${title}" linked successfully! 🎬`, 'success');
      document.getElementById('upload-form').reset();
      updateFileLabel('video');
      updateFileLabel('thumb');
      loadAdminVideos(); // Refresh list
    } catch (err) {
      showToast('Error linking external video', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '⬆️ Upload Video';
    }
    return;
  }

  // Handle Cloudflare R2 HLS Submission
  if (currentUploadSource === 'r2hls') {
    const inputVal = document.getElementById('r2-video-url').value.trim();
    let r2ThumbUrl = document.getElementById('r2-thumb-url').value.trim();
    const dl480 = document.getElementById('dl-480').value.trim(); const dl720 = document.getElementById('dl-720').value.trim(); const dl1080 = document.getElementById('dl-1080').value.trim(); const dl4k = document.getElementById('dl-4k').value.trim();

    if (!inputVal) {
      showToast('Please enter an HLS Stream URL', 'error');
      return;
    }

    const isHls = inputVal.startsWith('http') || inputVal.includes('.m3u8');
    const submitBtn = document.getElementById('upload-submit-btn');
    submitBtn.disabled = true;

    try {
      // If user did not provide a thumbnail, automatically extract best frame from HLS!
      if (!r2ThumbUrl && isHls) {
        submitBtn.textContent = '📸 Auto-fetching HLS thumbnail...';
        showToast('Extracting best thumbnail from HLS stream... ⏳', 'info');
        try {
          r2ThumbUrl = await autoExtractAndUploadHlsThumbnail(inputVal);
          if (r2ThumbUrl) {
            document.getElementById('r2-thumb-url').value = r2ThumbUrl;
            showToast('HLS thumbnail automatically captured & saved! ✨', 'success');
          }
        } catch (e) {
          console.warn('Auto HLS thumb error during submit:', e);
        }
      }

      submitBtn.textContent = '⏳ Linking HLS Stream...';
      const res = await fetch('/api/admin/videos/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ 
          title, genre, modelName, tags, description, 
          videoUrl: isHls ? inputVal : '',
          thumbnailUrl: r2ThumbUrl || '',
          dl480, dl720, dl1080, dl4k, displayViews
        })
      });

      if (!res.ok) { const data = await res.json().catch(()=>({})); throw new Error(data.error || 'Failed to link stream'); }
      
      showToast(`"${title}" linked successfully with auto-thumbnail! 🎬`, 'success');
      document.getElementById('upload-form').reset();
      updateFileLabel('video');
      updateFileLabel('thumb');
      resetAutoThumbUI();
      loadDashboard();
      switchTab('manage', document.querySelector('[data-tab=manage]'));
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '⬆️ Upload Video';
    }
    return;
  }

  // Handle Standard File Upload
  const videoFile = videoFileInput.files[0];
  if (!videoFile) {
    showToast('Please select a video file', 'error');
    return;
  }

  let thumbFile = thumbFileInput.files[0];
  // If user did not upload a custom image file, automatically use the extracted video frame!
  if (!thumbFile && autoExtractedThumbBlob) {
    const rawName = (videoFile.name || 'video').replace(/\.[^/.]+$/, '');
    const cleanName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_');
    thumbFile = new File([autoExtractedThumbBlob], `${cleanName}_thumb.jpg`, { type: 'image/jpeg' });
    console.log('✨ Automatically uploading video-extracted thumbnail:', thumbFile.name, thumbFile.size, 'bytes');
  }
  // Show progress
  const progressEl = document.getElementById('upload-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const submitBtn = document.getElementById('upload-submit-btn');

  progressEl.classList.add('active');
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Uploading...';

  try {
    // Try direct R2 upload first
    const videoResult = await uploadFileDirectly(videoFile, 'video', (pct) => {
      progressBar.style.width = pct + '%';
      progressText.textContent = `Uploading video... ${pct}%`;
    });

    if (videoResult) {
      // Direct upload succeeded! Now upload thumbnail if provided
      let thumbResult = null;
      if (thumbFile) {
        progressText.textContent = 'Uploading thumbnail...';
        thumbResult = await uploadFileDirectly(thumbFile, 'thumbnail', (pct) => {
          progressText.textContent = `Uploading thumbnail... ${pct}%`;
        });
      }

      // Register the video in our database
      progressText.textContent = 'Finalizing...';
      const completeRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({
          videoId: videoResult.id,
          title,
          genre,
          modelName,
          tags,
          description,
          videoUrl: videoResult.publicUrl,
          videoFilename: videoResult.key,
          thumbnailUrl: thumbResult ? thumbResult.publicUrl : null,
          thumbnailFilename: thumbResult ? thumbResult.key : null,
          dl480: document.getElementById('dl-480').value.trim(), dl720: document.getElementById('dl-720').value.trim(), dl1080: document.getElementById('dl-1080').value.trim(), dl4k: document.getElementById('dl-4k').value.trim()
        })
      });

      if (!completeRes.ok) {
        throw new Error('Failed to register video');
      }
      showToast(`"${title}" uploaded successfully! 🎬`, 'success');
    } else {
      // Fallback to legacy upload (local storage)
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('title', title);
      formData.append('genre', genre);
      formData.append('modelName', modelName);
      formData.append('tags', tags);
      formData.append('description', description);
      if (thumbFile) formData.append('thumbnail', thumbFile);

      await legacyUpload(formData, (pct) => {
        progressBar.style.width = pct + '%';
        progressText.textContent = `Uploading... ${pct}%`;
      });
      showToast(`"${title}" uploaded successfully! 🎬`, 'success');
    }

    // Reset form
    document.getElementById('upload-form').reset();
    updateFileLabel('video');
    updateFileLabel('thumb');
    resetAutoThumbUI();
    progressBar.style.width = '0%';
    progressEl.classList.remove('active');

    // Refresh stats
    loadStats();

  } catch (err) {
    showToast(err.message || 'Upload failed', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '⬆️ Upload Video';
    progressEl.classList.remove('active');
  }
});

// ==================== Manage Videos & Genre Categories ====================
let adminVideos = [];
let adminGenres = ['Trueanal', 'Analonly', 'Nympho', 'Analvids', 'Tushy Raw'];
let currentAdminGenreFilter = '';

async function loadGenres() {
  try {
    const res = await fetch('/api/genres');
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        adminGenres = list;
      }
    }
  } catch (err) {
    console.error('Failed to load genres:', err);
  }
  renderGenreUI();
}

function renderGenreUI() {
  // 1. Update Upload Genre Select (#video-genre)
  const uploadSelect = document.getElementById('video-genre');
  if (uploadSelect) {
    const prevVal = uploadSelect.value;
    uploadSelect.innerHTML = '<option value="" disabled ' + (!prevVal ? 'selected' : '') + '>Select a genre</option>';
    adminGenres.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      if (prevVal && prevVal.toLowerCase() === g.toLowerCase()) opt.selected = true;
      uploadSelect.appendChild(opt);
    });
  }

  // 2. Update Edit Modal Genre Select (#edit-genre)
  const editSelect = document.getElementById('edit-genre');
  if (editSelect) {
    const prevVal = editSelect.value;
    editSelect.innerHTML = '<option value="" disabled ' + (!prevVal ? 'selected' : '') + '>Select a genre</option>';
    adminGenres.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      if (prevVal && prevVal.toLowerCase() === g.toLowerCase()) opt.selected = true;
      editSelect.appendChild(opt);
    });
  }

  // 3. Update Manage Tab Genre Filter Buttons (#admin-genre-filters)
  const filterWrap = document.getElementById('admin-genre-filters');
  if (filterWrap) {
    filterWrap.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.id = 'admin-filter-All';
    allBtn.className = !currentAdminGenreFilter ? 'btn btn-primary' : 'btn btn-secondary';
    allBtn.textContent = 'All Genres';
    allBtn.onclick = () => filterAdminVideos('');
    filterWrap.appendChild(allBtn);

    adminGenres.forEach(g => {
      const isSelected = currentAdminGenreFilter && currentAdminGenreFilter.toLowerCase() === g.toLowerCase();
      const pill = document.createElement('div');
      pill.style.cssText = 'display: inline-flex; align-items: center; border-radius: var(--radius-sm); overflow: hidden;';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'admin-filter-' + g.replace(/\s+/g, '-');
      btn.className = isSelected ? 'btn btn-primary' : 'btn btn-secondary';
      btn.style.cssText = 'border-top-right-radius: 0; border-bottom-right-radius: 0; padding-right: 0.65rem;';
      btn.textContent = g;
      btn.onclick = () => filterAdminVideos(g);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = isSelected ? 'btn btn-primary' : 'btn btn-secondary';
      delBtn.style.cssText = 'border-top-left-radius: 0; border-bottom-left-radius: 0; border-left: 1px solid rgba(255,255,255,0.15); padding: 0.5rem 0.5rem; font-size: 0.75rem; opacity: 0.85;';
      delBtn.title = `Delete "${g}" genre category`;
      delBtn.textContent = '✕';
      delBtn.onclick = (e) => deleteGenreCategory(g, e);

      pill.appendChild(btn);
      pill.appendChild(delBtn);
      filterWrap.appendChild(pill);
    });
  }
}

window.createGenreCategory = async function(source) {
  let inputId = 'manage-new-genre-input';
  if (source === 'upload') inputId = 'upload-new-genre-input';
  else if (source === 'edit') inputId = 'edit-new-genre-input';

  const inputEl = document.getElementById(inputId);
  if (!inputEl) return;
  const newGenre = inputEl.value.trim();
  if (!newGenre) {
    showToast('Please enter a genre category name', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/genres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ genre: newGenre })
    });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    const data = await res.json();

    if (!res.ok) {
      // Even if it already exists, select it if in upload/edit mode
      const existing = adminGenres.find(g => g.toLowerCase() === newGenre.toLowerCase());
      if (existing && (source === 'upload' || source === 'edit')) {
        const targetSelect = document.getElementById(source === 'upload' ? 'video-genre' : 'edit-genre');
        if (targetSelect) targetSelect.value = existing;
        inputEl.value = '';
        showToast(`Selected "${existing}"`, 'success');
        return;
      }
      showToast(data.error || 'Could not create genre', 'error');
      return;
    }

    if (Array.isArray(data.genres)) {
      adminGenres = data.genres;
    } else if (!adminGenres.includes(newGenre)) {
      adminGenres.push(newGenre);
    }

    inputEl.value = '';
    renderGenreUI();

    if (source === 'upload') {
      const uploadSelect = document.getElementById('video-genre');
      if (uploadSelect) uploadSelect.value = newGenre;
    } else if (source === 'edit') {
      const editSelect = document.getElementById('edit-genre');
      if (editSelect) editSelect.value = newGenre;
    } else {
      filterAdminVideos(currentAdminGenreFilter);
    }

    showToast(`Genre category "${newGenre}" created! 🏷️`, 'success');
  } catch (err) {
    showToast('Failed to create genre category', 'error');
  }
};

window.deleteGenreCategory = async function(genreName, event) {
  if (event) event.stopPropagation();
  const countInGenre = adminVideos.filter(v => v.genre && v.genre.toLowerCase() === genreName.toLowerCase()).length;
  if (countInGenre > 0) {
    showToast(`Cannot delete "${genreName}" while ${countInGenre} video(s) still use it. Move those videos to another genre first.`, 'error');
    return;
  }
  if (!confirm(`Delete genre category "${genreName}"?`)) return;

  try {
    const res = await fetch(`/api/admin/genres/${encodeURIComponent(genreName)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    const data = await res.json();
    if (res.ok) {
      if (Array.isArray(data.genres)) adminGenres = data.genres;
      if (currentAdminGenreFilter.toLowerCase() === genreName.toLowerCase()) {
        currentAdminGenreFilter = '';
      }
      renderGenreUI();
      filterAdminVideos(currentAdminGenreFilter);
      showToast(`Genre "${genreName}" removed`, 'success');
    } else {
      showToast(data.error || 'Failed to delete genre', 'error');
    }
  } catch (err) {
    showToast('Failed to delete genre', 'error');
  }
};

window.quickChangeVideoGenre = async function(videoId, newGenre) {
  const video = adminVideos.find(v => v.id === videoId);
  if (!video) return;

  try {
    const res = await fetch(`/api/videos/${videoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ genre: newGenre })
    });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    if (res.ok) {
      video.genre = newGenre;
      if (newGenre && !adminGenres.some(g => g.toLowerCase() === newGenre.toLowerCase())) {
        adminGenres.push(newGenre);
        renderGenreUI();
      }
      filterAdminVideos(currentAdminGenreFilter);
      showToast(`Updated "${video.title}" to genre "${newGenre}"! 🏷️`, 'success');
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to update genre', 'error');
    }
  } catch (err) {
    showToast('Failed to update genre', 'error');
  }
};

async function loadAdminVideos() {
  try {
    const res = await fetch('/api/admin/videos', { headers: authHeaders() });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    adminVideos = await res.json();

    // Ensure any custom genres on existing videos appear in adminGenres
    let addedAny = false;
    adminVideos.forEach(v => {
      const g = v && v.genre ? String(v.genre).trim() : '';
      if (g && !adminGenres.some(item => item.toLowerCase() === g.toLowerCase())) {
        adminGenres.push(g);
        addedAny = true;
      }
    });
    if (addedAny) renderGenreUI();

    if (typeof filterAdminVideos === 'function') {
      filterAdminVideos(currentAdminGenreFilter || '');
    }
  } catch (err) {
    console.error('Failed to load videos:', err);
    showToast('Failed to load videos', 'error');
  }
}

function renderAdminVideoList(videosToRender) {
  const listEl = document.getElementById('admin-video-list');
  const emptyEl = document.getElementById('admin-empty');

  if (videosToRender.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';
  listEl.innerHTML = '';

  videosToRender.forEach(video => {
    const item = document.createElement('div');
    item.className = 'admin-video-item';

    const thumbnailContent = video.thumbnailUrl
      ? `<img src="${video.thumbnailUrl}" alt="${escapeHtml(video.title)}">`
      : `<div class="thumb-placeholder" style="font-size: 1.5rem;">🎬</div>`;

    const statusBadge = video.published !== false
      ? '<span class="badge badge-success">Published</span>'
      : '<span class="badge badge-warning">Draft</span>';

    const genreBadge = video.genre 
      ? `<span class="badge" style="background:var(--accent-purple);color:white;">🏷️ ${escapeHtml(video.genre)}</span>`
      : '<span class="badge" style="background:rgba(255,255,255,0.1);color:var(--text-muted);">No Genre</span>';

    const tagsBadges = Array.isArray(video.tags) && video.tags.length
      ? video.tags.map(t => `<span class="badge" style="background:rgba(6, 182, 212, 0.15);color:#22d3ee;border:1px solid rgba(6, 182, 212, 0.3);">#${escapeHtml(t)}</span>`).join('')
      : '';

    // Build quick genre options for inline category switching
    const allGenreChoices = adminGenres.slice();
    if (video.genre && !allGenreChoices.some(g => g.toLowerCase() === video.genre.toLowerCase())) {
      allGenreChoices.push(video.genre);
    }
    const genreOptionsHtml = `<option value="" disabled ${!video.genre ? 'selected' : ''}>Move to Genre...</option>` +
      allGenreChoices.map(g => {
        const selected = video.genre && video.genre.toLowerCase() === g.toLowerCase() ? 'selected' : '';
        return `<option value="${escapeHtml(g)}" ${selected}>🏷️ ${escapeHtml(g)}</option>`;
      }).join('');

    const isHlsVideo = video.videoUrl && video.videoUrl.includes('.m3u8');
    item.innerHTML = `
      <div class="item-thumb">${thumbnailContent}</div>
      <div class="item-info">
        <div class="item-title">${escapeHtml(video.title)}</div>
        <div class="item-meta">
          ${statusBadge}
          ${genreBadge}
          ${tagsBadges}
          ${isHlsVideo ? '<span class="badge" style="background: rgba(34, 211, 238, 0.1); color: #22d3ee;">☁️ Cloudflare HLS</span>' : ''}
          ${(video.downloads && (video.downloads.p720 || video.downloads.p1080)) ? '<span class="badge" style="background: rgba(46, 204, 113, 0.1); color: #2ecc71;" title="Download links set">📥 Simple DL</span>' : ''}
          <span>👁️ Real: ${formatViews(video.views || 0)} ${video.displayViews ? `(Fake: ${video.displayViews})` : ''}</span>
          <span>❤️ ${formatViews(video.likes || 0)} likes</span>
          <span>🕐 ${getTimeAgo(video.uploadedAt)}</span>
        </div>
      </div>
      <div class="item-actions" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <select aria-label="Change Genre Category" onchange="quickChangeVideoGenre('${video.id}', this.value)" style="padding: 0.35rem 0.6rem; background: var(--bg-body); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm); font-size: 0.8rem; cursor: pointer; outline: none;" title="Quickly move video to another genre category">
          ${genreOptionsHtml}
        </select>
        ${!video.thumbnailUrl && video.videoUrl ? `<button class="btn btn-primary btn-sm" onclick="quickAutoThumbnail('${video.id}')" title="Auto-fetch thumbnail from video stream" style="background: linear-gradient(135deg, #0ea5e9, #38bdf8); color: white; border: none; font-weight: 600;">📸 Auto-Thumb</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${video.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${video.id}')">🗑️</button>
      </div>
    `;

    listEl.appendChild(item);
  });
}

function filterAdminVideos(genre) {
  currentAdminGenreFilter = genre || '';
  renderGenreUI();

  if (!genre) {
    renderAdminVideoList(adminVideos);
  } else {
    const g = genre.toLowerCase();
    const filtered = adminVideos.filter(v => v.genre && v.genre.toLowerCase() === g);
    renderAdminVideoList(filtered);
  }
}

// ==================== Edit Modal ====================
function openEditModal(videoId) {
  const video = adminVideos.find(v => v.id === videoId);
  if (!video) return;

  if (video.genre && !adminGenres.some(g => g.toLowerCase() === video.genre.toLowerCase())) {
    adminGenres.push(video.genre);
  }
  renderGenreUI();

  document.getElementById('edit-id').value = video.id;
  document.getElementById('edit-title').value = video.title;

  const editGenreEl = document.getElementById('edit-genre');
  if (editGenreEl) {
    const matchingGenre = adminGenres.find(g => video.genre && g.toLowerCase() === video.genre.toLowerCase());
    editGenreEl.value = matchingGenre || video.genre || '';
  }

  const editNewGenreInput = document.getElementById('edit-new-genre-input');
  if (editNewGenreInput) editNewGenreInput.value = '';

  document.getElementById('edit-model').value = video.modelName || '';
  const editTagsEl = document.getElementById('edit-tags');
  if (editTagsEl) {
    editTagsEl.value = Array.isArray(video.tags) && video.tags.length
      ? video.tags.map(t => '#' + String(t).replace(/^#+/, '')).join(', ')
      : '';
  }
  document.getElementById('edit-desc').value = video.description || '';
  document.getElementById('edit-display-views').value = video.displayViews || '';
  document.getElementById('edit-thumb-url').value = video.thumbnailUrl || '';
  document.getElementById('edit-video-url').value = video.videoUrl || '';
  document.getElementById('edit-dl-480').value = (video.downloads && video.downloads.p480) || ''; document.getElementById('edit-dl-720').value = (video.downloads && video.downloads.p720) || ''; document.getElementById('edit-dl-1080').value = (video.downloads && video.downloads.p1080) || ''; document.getElementById('edit-dl-4k').value = (video.downloads && video.downloads.p4k) || '';
  document.getElementById('edit-published').checked = video.published !== false;

  // Manage Thumbnail Preview in Edit Modal
  const previewCard = document.getElementById('edit-thumb-preview-card');
  const previewImg = document.getElementById('edit-thumb-preview-img');
  const badge = document.getElementById('edit-thumb-badge');

  if (video.thumbnailUrl) {
    if (previewCard) previewCard.style.display = 'block';
    if (previewImg) previewImg.src = video.thumbnailUrl;
    if (badge) {
      badge.textContent = '✨ Active Poster';
      badge.style.background = 'rgba(16, 185, 129, 0.95)';
    }
  } else if (video.videoUrl) {
    // Missing thumbnail: display preview card and auto-fetch right away!
    if (previewCard) previewCard.style.display = 'block';
    if (badge) {
      badge.textContent = '⚠️ Missing Thumbnail';
      badge.style.background = '#f59e0b';
    }
    // Auto-fetch in background
    setTimeout(() => { triggerEditModalAutoThumb(15); }, 200);
  } else {
    if (previewCard) previewCard.style.display = 'none';
  }

  document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
}

async function saveEdit() {
  const videoId = document.getElementById('edit-id').value;
  const editVideoUrl = document.getElementById('edit-video-url').value.trim();
  let thumbUrl = document.getElementById('edit-thumb-url').value.trim();

  // If thumbnail is empty and video URL exists, auto-fetch and upload to R2 before saving!
  if (!thumbUrl && editVideoUrl) {
    const saveBtn = document.querySelector('#edit-modal .modal-footer .btn-primary');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ Auto-fetching thumbnail...';
    }
    showToast('Auto-fetching thumbnail from video stream... ⏳', 'info');
    try {
      const autoRes = await fetch('/api/admin/extract-video-thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ videoUrl: editVideoUrl, time: 15 })
      });
      if (autoRes.status === 401) {
        showToast('Admin session expired. Please log in again.', 'error');
        saveEditModalState();
        setTimeout(() => { clearToken(); location.reload(); }, 1500);
        return;
      }
      if (autoRes.ok) {
        const autoData = await autoRes.json();
        if (autoData && autoData.thumbnailUrl) {
          thumbUrl = autoData.thumbnailUrl;
          document.getElementById('edit-thumb-url').value = thumbUrl;
          showToast('Thumbnail automatically captured & saved to R2! 🎬', 'success');
        }
      }
    } catch (e) {
      console.warn('Auto-thumbnail in saveEdit failed:', e);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Changes';
      }
    }
  }

  // If the admin typed a new genre in the edit modal's quick input without clicking "+ Create & Select", use it automatically!
  const pendingNewGenreEl = document.getElementById('edit-new-genre-input');
  let selectedGenre = document.getElementById('edit-genre').value;
  if (pendingNewGenreEl && pendingNewGenreEl.value.trim()) {
    selectedGenre = pendingNewGenreEl.value.trim();
    pendingNewGenreEl.value = '';
  }

  const payload = {
    title: document.getElementById('edit-title').value.trim(),
    genre: selectedGenre,
    modelName: document.getElementById('edit-model').value.trim(),
    tags: document.getElementById('edit-tags') ? document.getElementById('edit-tags').value.trim() : '',
    description: document.getElementById('edit-desc').value.trim(),
    displayViews: document.getElementById('edit-display-views').value.trim(),
    thumbnailUrl: thumbUrl,
    videoUrl: editVideoUrl,
    dl480: document.getElementById('edit-dl-480').value.trim(), dl720: document.getElementById('edit-dl-720').value.trim(), dl1080: document.getElementById('edit-dl-1080').value.trim(), dl4k: document.getElementById('edit-dl-4k').value.trim(),
    published: document.getElementById('edit-published').checked
  };

  try {
    const res = await fetch(`/api/videos/${videoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });

    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    if (res.ok) {
      showToast('Video updated successfully!', 'success');
      closeEditModal();
      await loadGenres();
      loadAdminVideos();
      loadStats();
    } else {
      const data = await res.json();
      showToast(data.error || 'Update failed', 'error');
    }
  } catch (err) {
    showToast('Update failed', 'error');
  }
}

// ==================== Delete Modal ====================
let deleteVideoId = null;

function openDeleteModal(videoId) {
  const video = adminVideos.find(v => v.id === videoId);
  if (!video) return;

  deleteVideoId = videoId;
  document.getElementById('delete-video-name').textContent = video.title;
  document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('active');
  deleteVideoId = null;
}

async function confirmDelete() {
  if (!deleteVideoId) return;

  try {
    const res = await fetch(`/api/videos/${deleteVideoId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    if (res.ok) {
      showToast('Video deleted', 'success');
      closeDeleteModal();
      loadAdminVideos();
      loadStats();
    } else {
      const data = await res.json();
      showToast(data.error || 'Delete failed', 'error');
    }
  } catch (err) {
    showToast('Delete failed', 'error');
  }
}

// Close modals on overlay click
document.getElementById('edit-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('edit-modal')) closeEditModal();
});
document.getElementById('delete-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
});

// ==================== Navbar Scroll ====================
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ==================== VOD Management ====================
let vodRules = [];
let vodRequests = [];

async function checkEmailStatus() {
  const badgeEl = document.getElementById('email-status-badge');
  const descEl = document.getElementById('email-status-desc');
  if (!badgeEl || !descEl) return;

  try {
    const res = await fetch('/api/admin/email/status', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.hasResend) {
      badgeEl.className = 'badge badge-success';
      badgeEl.style.background = '#22c55e';
      badgeEl.style.color = '#ffffff';
      badgeEl.textContent = `✅ Resend API (${data.maskedKey})`;
      descEl.textContent = 'Resend HTTPS API is active on production. You can send live notification emails or run a test below.';
    } else if (data.hasSmtp) {
      badgeEl.className = 'badge badge-success';
      badgeEl.style.background = '#06b6d4';
      badgeEl.style.color = '#ffffff';
      badgeEl.textContent = `📧 SMTP (${data.smtpUser || 'configured'})`;
      descEl.textContent = 'SMTP mail transporter is active. You can send live notification emails or run a test below.';
    } else {
      badgeEl.className = 'badge badge-warning';
      badgeEl.style.background = '#f59e0b';
      badgeEl.style.color = '#000000';
      badgeEl.textContent = '⚠️ Simulated (No Key in Northflank)';
      descEl.textContent = 'RESEND_API_KEY is missing in Northflank environment variables. Add RESEND_API_KEY to Northflank to enable live emails.';
    }
  } catch (err) {
    badgeEl.textContent = 'Unknown';
  }
}

window.sendTestEmail = async function() {
  const input = document.getElementById('test-email-input');
  const btn = document.getElementById('test-email-btn');
  const email = (input ? input.value : '').trim();

  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email address to test', 'error');
    return;
  }

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '⏳ Sending test...';

  try {
    const res = await fetch('/api/admin/email/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(data.message || 'Test email sent successfully! Check your inbox/spam.', 'success');
    } else {
      showToast(data.error || 'Test email failed. Check Resend configuration.', 'error');
    }
  } catch (err) {
    showToast('Network error while testing email delivery', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};

async function loadVodData() {
  checkEmailStatus();
  try {
    const rulesRes = await fetch('/api/admin/vod/rules', { headers: authHeaders() });
    if (rulesRes.ok) {
      vodRules = await rulesRes.json();
      renderVodRules();
    }
    
    const reqRes = await fetch('/api/admin/vod/requests', { headers: authHeaders() });
    if (reqRes.ok) {
      vodRequests = await reqRes.json();
      renderVodRequests();
    }
  } catch (err) {
    console.error('Failed to load VOD data:', err);
    showToast('Failed to load VOD data', 'error');
  }
}

function renderVodRules() {
  const listEl = document.getElementById('vod-company-list');
  listEl.innerHTML = '';
  if (vodRules.length === 0) {
    listEl.innerHTML = '<li style="color: var(--text-muted); font-size: 0.9rem;">No companies allowed yet.</li>';
    return;
  }
  
  vodRules.forEach((company, index) => {
    const li = document.createElement('li');
    li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--bg-body); border-radius: var(--radius-sm); border: 1px solid var(--border-color);';
    li.innerHTML = `
      <span>${escapeHtml(company)}</span>
      <button class="btn btn-danger btn-sm" onclick="removeVodCompany(${index})" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">✕</button>
    `;
    listEl.appendChild(li);
  });
}

window.addVodCompany = async function() {
  const input = document.getElementById('vod-new-company');
  const company = input.value.trim();
  if (!company) return;
  
  if (vodRules.includes(company)) {
    showToast('Company already exists', 'error');
    return;
  }
  
  const newRules = [...vodRules, company];
  try {
    const res = await fetch('/api/admin/vod/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ rules: newRules })
    });
    if (res.ok) {
      vodRules = newRules;
      input.value = '';
      renderVodRules();
      showToast('Company added', 'success');
    }
  } catch (err) {
    showToast('Failed to add company', 'error');
  }
};

window.removeVodCompany = async function(index) {
  const newRules = [...vodRules];
  newRules.splice(index, 1);
  try {
    const res = await fetch('/api/admin/vod/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ rules: newRules })
    });
    if (res.ok) {
      vodRules = newRules;
      renderVodRules();
      showToast('Company removed', 'success');
    }
  } catch (err) {
    showToast('Failed to remove company', 'error');
  }
};

function renderVodRequests() {
  const tableEl = document.getElementById('vod-requests-table');
  tableEl.innerHTML = '';
  
  if (vodRequests.length === 0) {
    tableEl.innerHTML = '<tr><td colspan="4" style="padding: 1rem; text-align: center; color: var(--text-muted);">No requests found.</td></tr>';
    return;
  }
  
  vodRequests.forEach(req => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    
    let statusColor = 'var(--text-muted)';
    if (req.status === 'Approved') statusColor = 'var(--accent-cyan)';
    if (req.status === 'Rejected') statusColor = 'var(--accent-pink)';
    
    tr.innerHTML = `
      <td style="padding: 0.75rem;">
        <div style="font-weight: 600; font-size: 0.9rem; word-break: break-all;">${escapeHtml(req.email || 'N/A')}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(req.genre)}</div>
      </td>
      <td style="padding: 0.75rem;">
        <div style="font-weight: 600;">${escapeHtml(req.title)}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(req.actor || 'N/A')}</div>
      </td>
      <td style="padding: 0.75rem;">
        <span style="color: ${statusColor}; font-weight: 600; font-size: 0.85rem;">${escapeHtml(req.status || 'Pending')}</span>
      </td>
      <td style="padding: 0.75rem; text-align: right; display: flex; gap: 0.25rem; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-sm" onclick="updateVodStatus('${req.id}', 'Approved')" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Approve</button>
        <button class="btn btn-secondary btn-sm" onclick="updateVodStatus('${req.id}', 'Rejected')" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Reject</button>
        <button class="btn btn-secondary btn-sm" onclick="openNotifyModal('${req.id}')" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 2px;">✉️ Notify</button>
        <button class="btn btn-danger btn-sm" onclick="deleteVodRequest('${req.id}')" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">🗑️</button>
      </td>
    `;
    tableEl.appendChild(tr);
  });
}

window.updateVodStatus = async function(id, status) {
  try {
    const res = await fetch(`/api/admin/vod/requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data.emailSent) {
        showToast(`Request marked as ${status} & email sent!`, 'success');
      } else if (data.warning) {
        showToast(`Marked as ${status}, but email failed: ${data.warning}`, 'info');
      } else {
        showToast(`Request marked as ${status}`, 'success');
      }
      loadVodData();
    } else {
      showToast(data.error || 'Failed to update status', 'error');
    }
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
};

window.deleteVodRequest = async function(id) {
  if (!confirm('Are you sure you want to delete this request?')) return;
  try {
    const res = await fetch(`/api/admin/vod/requests/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (res.ok) {
      showToast('Request deleted', 'success');
      loadVodData();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to delete request', 'error');
    }
  } catch (err) {
    showToast('Failed to delete request', 'error');
  }
};

// ==================== VOD Notifications ====================
let activeNotifyId = null;

window.openNotifyModal = function(id, fallbackEmail, fallbackTitle) {
  activeNotifyId = id;
  const reqItem = vodRequests.find(r => r.id === id) || {};
  const email = reqItem.email || fallbackEmail || 'N/A';
  const title = reqItem.title || fallbackTitle || 'Video Request';
  document.getElementById('notify-user-email').textContent = email;
  document.getElementById('notify-video-title').textContent = `"${title}"`;
  document.getElementById('notify-message').value = '';
  document.getElementById('notify-modal').classList.add('active');
};

window.closeNotifyModal = function() {
  activeNotifyId = null;
  document.getElementById('notify-modal').classList.remove('active');
};

const notifyModalEl = document.getElementById('notify-modal');
if (notifyModalEl) {
  notifyModalEl.addEventListener('click', (e) => {
    if (e.target === notifyModalEl) closeNotifyModal();
  });
}

window.sendNotification = async function() {
  if (!activeNotifyId) return;
  const message = document.getElementById('notify-message').value.trim();
  if (!message) {
    showToast('Please type a message first', 'error');
    return;
  }
  
  const sendBtn = document.getElementById('send-notify-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = '⏳ Sending...';
  
  try {
    const res = await fetch(`/api/admin/vod/requests/${activeNotifyId}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message })
    });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data.warning) {
        showToast(data.warning, 'info');
      } else {
        showToast('Notification email sent successfully! ✉️', 'success');
      }
      closeNotifyModal();
      loadVodData();
    } else {
      showToast(data.error || 'Failed to send email', 'error');
    }
  } catch (err) {
    showToast('Network error sending email', 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '✉️ Send Email';
  }
};

// ==================== Contact & Telegram Management ====================
let contactMessages = [];
let currentContactMessageId = null;

async function loadContactAdminData() {
  await Promise.all([loadContactConfigAdmin(), loadContactMessagesAdmin()]);
}

async function loadContactConfigAdmin() {
  try {
    const res = await fetch('/api/admin/contact/config', { headers: authHeaders() });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    if (res.ok) {
      const cfg = await res.json();
      if (document.getElementById('admin-tg-url')) document.getElementById('admin-tg-url').value = cfg.telegramChannelUrl || '';
      if (document.getElementById('admin-tg-name')) document.getElementById('admin-tg-name').value = cfg.telegramChannelName || '';
      if (document.getElementById('admin-tg-desc')) document.getElementById('admin-tg-desc').value = cfg.telegramChannelDescription || '';
      if (document.getElementById('admin-tg-support-url')) document.getElementById('admin-tg-support-url').value = cfg.telegramSupportUrl || '';
      if (document.getElementById('admin-tg-support-user')) document.getElementById('admin-tg-support-user').value = cfg.telegramSupportUsername || '';
      if (document.getElementById('admin-support-email')) document.getElementById('admin-support-email').value = cfg.supportEmail || '';
      if (document.getElementById('admin-business-email')) document.getElementById('admin-business-email').value = cfg.businessEmail || '';
      if (document.getElementById('admin-dmca-notice')) document.getElementById('admin-dmca-notice').value = cfg.dmcaNotice || '';
    }
  } catch (err) {
    console.error('Error loading contact config:', err);
  }
}

window.saveContactSettings = async function() {
  const payload = {
    telegramChannelUrl: document.getElementById('admin-tg-url').value.trim(),
    telegramChannelName: document.getElementById('admin-tg-name').value.trim(),
    telegramChannelDescription: document.getElementById('admin-tg-desc').value.trim(),
    telegramSupportUrl: document.getElementById('admin-tg-support-url').value.trim(),
    telegramSupportUsername: document.getElementById('admin-tg-support-user').value.trim(),
    supportEmail: document.getElementById('admin-support-email').value.trim(),
    businessEmail: document.getElementById('admin-business-email').value.trim(),
    dmcaNotice: document.getElementById('admin-dmca-notice').value.trim()
  };

  const btn = document.getElementById('save-contact-settings-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Saving...';

  try {
    const res = await fetch('/api/admin/contact/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    const data = await res.json();
    if (res.ok) {
      showToast('Contact & Telegram settings saved successfully! 🚀', 'success');
    } else {
      showToast(data.error || 'Failed to save contact settings', 'error');
    }
  } catch (err) {
    showToast('Failed to save contact settings', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
};

window.loadContactMessagesAdmin = async function() {
  const tbody = document.getElementById('contact-messages-table');
  const countEl = document.getElementById('contact-inbox-count');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading inquiries...</td></tr>';

  try {
    const res = await fetch('/api/admin/contact/messages', { headers: authHeaders() });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    if (!res.ok) throw new Error('Failed to fetch messages');

    contactMessages = await res.json();
    if (countEl) countEl.textContent = `${contactMessages.length} inquiry(s)`;
    renderContactMessages();
  } catch (err) {
    console.error('Failed to load contact messages:', err);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #ef4444;">Failed to load messages.</td></tr>';
  }
};

function renderContactMessages() {
  const tbody = document.getElementById('contact-messages-table');
  if (!tbody) return;

  if (contactMessages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">No inquiries yet.</td></tr>';
    return;
  }

  tbody.innerHTML = contactMessages.map(msg => {
    const statusStyle = msg.status === 'New' 
      ? 'background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);' 
      : (msg.status === 'Replied' 
        ? 'background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3);' 
        : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3);');

    const tgBadge = msg.telegram ? `<span style="display: inline-block; font-size: 0.75rem; color: #38bdf8; background: rgba(56,189,248,0.1); padding: 0.1rem 0.4rem; border-radius: 4px; margin-top: 0.2rem;">✈️ ${escapeHtml(msg.telegram)}</span>` : '';
    const dateFormatted = getTimeAgo(msg.createdAt || Date.now());

    return `
      <tr style="border-bottom: 1px solid var(--border-color); ${msg.status === 'New' ? 'background: rgba(56, 189, 248, 0.03);' : ''}">
        <td style="padding: 0.75rem;">
          <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(msg.name)}</div>
          <a href="mailto:${escapeHtml(msg.email)}" style="font-size: 0.8rem; color: var(--accent-cyan); text-decoration: none;">${escapeHtml(msg.email)}</a>
          <div>${tgBadge}</div>
        </td>
        <td style="padding: 0.75rem; max-width: 250px;">
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(msg.subject || 'General Inquiry')}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(msg.message)}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem;">${dateFormatted}</div>
        </td>
        <td style="padding: 0.75rem;">
          <span style="font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 12px; font-weight: 600; ${statusStyle}">${escapeHtml(msg.status || 'New')}</span>
        </td>
        <td style="padding: 0.75rem; text-align: right;">
          <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="openMessageModal('${msg.id}')" title="View Details">👁️ View</button>
            <button class="btn btn-danger btn-sm" onclick="deleteContactMessage('${msg.id}')" title="Delete Inquiry">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.openMessageModal = function(id) {
  const msg = contactMessages.find(m => m.id === id);
  if (!msg) return;

  currentContactMessageId = id;
  document.getElementById('msg-detail-name').textContent = msg.name || 'Anonymous';
  const emailEl = document.getElementById('msg-detail-email');
  emailEl.textContent = msg.email;
  emailEl.href = `mailto:${msg.email}?subject=${encodeURIComponent('Re: ' + (msg.subject || 'Inquiry'))}`;
  document.getElementById('msg-detail-subject').textContent = msg.subject || 'General Inquiry';
  document.getElementById('msg-detail-telegram').textContent = msg.telegram || 'Not provided';
  document.getElementById('msg-detail-date').textContent = new Date(msg.createdAt).toLocaleString();
  document.getElementById('msg-detail-body').textContent = msg.message;

  const mailtoLink = document.getElementById('msg-mailto-link');
  mailtoLink.href = `mailto:${msg.email}?subject=${encodeURIComponent('Re: ' + (msg.subject || 'StreamXvault Inquiry'))}&body=${encodeURIComponent('\n\n--- Original Message ---\nFrom: ' + msg.name + '\n' + msg.message)}`;

  document.getElementById('message-modal').classList.add('active');

  // If status was New, automatically mark as Read in backend
  if (msg.status === 'New') {
    toggleMessageStatus('Read', false);
  }
};

window.closeMessageModal = function() {
  currentContactMessageId = null;
  const modal = document.getElementById('message-modal');
  if (modal) modal.classList.remove('active');
};

const messageModalEl = document.getElementById('message-modal');
if (messageModalEl) {
  messageModalEl.addEventListener('click', (e) => {
    if (e.target === messageModalEl) closeMessageModal();
  });
}

window.toggleMessageStatus = async function(newStatus, showFeedback = true) {
  if (!currentContactMessageId) return;

  try {
    const res = await fetch(`/api/admin/contact/messages/${currentContactMessageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    if (res.ok) {
      const msg = contactMessages.find(m => m.id === currentContactMessageId);
      if (msg) msg.status = newStatus;
      renderContactMessages();
      if (showFeedback) showToast(`Marked as ${newStatus}`, 'success');
    }
  } catch (err) {
    if (showFeedback) showToast('Failed to update status', 'error');
  }
};

window.deleteContactMessage = async function(id) {
  if (!confirm('Are you sure you want to delete this inquiry?')) return;

  try {
    const res = await fetch(`/api/admin/contact/messages/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    if (res.ok) {
      showToast('Inquiry deleted', 'success');
      contactMessages = contactMessages.filter(m => m.id !== id);
      const countEl = document.getElementById('contact-inbox-count');
      if (countEl) countEl.textContent = `${contactMessages.length} inquiry(s)`;
      renderContactMessages();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to delete inquiry', 'error');
    }
  } catch (err) {
    showToast('Failed to delete inquiry', 'error');
  }
};

// ==================== Initialize ====================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

// ==================== Migration ====================
window.migrateBunnyVideos = async function() {
  const domain = document.getElementById('migrate-r2-domain').value.trim();
  if (!domain || !domain.startsWith('http')) {
    showToast('Please enter a valid R2 domain starting with http/https', 'error');
    return;
  }

  if (!confirm('Are you sure you want to migrate all Bunny IDs to R2 links?')) return;

  const btn = document.getElementById('migrate-bunny-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Migrating...';

  try {
    const res = await fetch('/api/admin/migrate-bunny', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ r2Domain: domain })
    });

    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    const data = await res.json();
    if (res.ok) {
      if (data.migratedCount > 0) {
        showToast(`Successfully migrated ${data.migratedCount} video(s)! 🎉`, 'success');
        loadAdminVideos();
      } else {
        showToast('No legacy Bunny videos found to migrate.', 'info');
      }
    } else {
      showToast(data.error || 'Migration failed', 'error');
    }
  } catch (err) {
    showToast('Migration failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
};




// ==================== Two-Factor Authentication (2FA) ====================
let currentGeneratedBackupCodes = [];
let currentRaw2FASecret = '';
let activeSecretKey = '';
let activeFormattedSecret = '';
let isSecretRevealed = false;

async function load2FAStatus() {
  try {
    const res = await fetch('/api/admin/2fa/status', { headers: authHeaders() });
    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    if (!res.ok) return;

    const data = await res.json();
    render2FAUI(data);
  } catch (err) {
    console.error('Failed to load 2FA status:', err);
  }
}

function render2FAUI(data) {
  const isEnabled = !!data.enabled;

  // 1. Dashboard Security Banner
  const banner = document.getElementById('security-banner-2fa');
  if (banner) {
    banner.style.display = isEnabled ? 'none' : 'flex';
  }

  // 2. Status Badge in Security Tab
  const badge = document.getElementById('security-status-badge');
  const badgeText = document.getElementById('security-status-text');
  if (badge && badgeText) {
    if (isEnabled) {
      badge.style.background = 'rgba(16, 185, 129, 0.15)';
      badge.style.color = '#10b981';
      badge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      badgeText.textContent = '2FA Active & Protected';
    } else {
      badge.style.background = 'rgba(239, 68, 68, 0.15)';
      badge.style.color = '#ef4444';
      badge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      badgeText.textContent = '2FA Inactive';
    }
  }

  // 3. Toggle Active vs Inactive Containers
  const activeContainer = document.getElementById('twofa-active-container');
  const inactiveContainer = document.getElementById('twofa-inactive-container');

  if (activeContainer && inactiveContainer) {
    if (isEnabled) {
      activeContainer.style.display = 'block';
      inactiveContainer.style.display = 'none';

      // Update details
      const dateEl = document.getElementById('twofa-configured-date');
      if (dateEl) {
        const dateStr = data.configuredAt ? new Date(data.configuredAt).toLocaleString() : 'Active';
        dateEl.textContent = `Configured on: ${dateStr}`;
      }

      const backupCountEl = document.getElementById('twofa-backup-codes-count');
      if (backupCountEl) {
        backupCountEl.textContent = `${data.backupCodesRemaining} of ${data.backupCodesTotal} available`;
      }

      // Update Active Secret Key display
      activeSecretKey = data.secret || '';
      activeFormattedSecret = data.formattedSecret || data.secret || '';
      isSecretRevealed = false;
      const secretDisp = document.getElementById('twofa-active-secret-display');
      if (secretDisp) {
        secretDisp.textContent = '•••• •••• •••• •••• •••• •••• •••• ••••';
      }
      const toggleBtn = document.getElementById('btn-toggle-active-secret');
      if (toggleBtn) toggleBtn.innerHTML = '👁️ Reveal Key';

      // Storage badge
      const storageBadge = document.getElementById('twofa-storage-badge');
      if (storageBadge) {
        if (data.storagePersistent) {
          storageBadge.textContent = '☁️ Backed up to Cloudflare R2 Storage (Persistent across restarts)';
          storageBadge.style.display = 'inline-block';
        } else {
          storageBadge.textContent = '💾 Stored locally on container disk';
        }
      }
    } else {
      activeContainer.style.display = 'none';
      inactiveContainer.style.display = 'block';

      // Reset wizard to start step
      const startStep = document.getElementById('twofa-start-step');
      const wizardStep = document.getElementById('twofa-wizard-step');
      if (startStep) startStep.style.display = 'block';
      if (wizardStep) wizardStep.style.display = 'none';
    }
  }
}

function load2FASecurityTab() {
  load2FAStatus();
}

async function start2FASetupWizard(isCustom = false) {
  try {
    let body = {};
    if (isCustom) {
      const customInput = document.getElementById('twofa-custom-secret-input');
      const errorEl = document.getElementById('twofa-custom-secret-error');
      const rawVal = (customInput ? customInput.value : '').trim();
      const val = rawVal.replace(/[\s-]+/g, '').replace(/=+$/, '').toUpperCase();

      if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
      }

      if (!val) {
        const msg = 'Please enter your 16–32 character Secret Key.';
        showToast(msg, 'error');
        if (errorEl) {
          errorEl.textContent = msg;
          errorEl.style.display = 'block';
        }
        return;
      }

      if (/^\d{6}$/.test(val)) {
        const msg = 'That is a 6-digit rolling code, not a Secret Key! Authenticator apps hide the raw secret key for security. To connect your phone, please click "🛡️ Generate New 2FA Key" above and scan the new QR code.';
        showToast(msg, 'warning');
        if (errorEl) {
          errorEl.innerHTML = '⚠️ <strong>That is a 6-digit rolling code, not a Secret Key!</strong><br>Google Authenticator hides the raw 32-letter secret key for safety.<br>👉 <strong>Solution:</strong> Click <strong>"🛡️ Generate New 2FA Key"</strong> above, scan the new QR code in your Authenticator app, and enter the code to activate!';
          errorEl.style.display = 'block';
        }
        return;
      }

      if (val.length < 16) {
        const msg = 'Secret key is too short. Minimum 16 characters required (A-Z, 2-7). If you do not have the 32-letter secret, click "Generate New 2FA Key" to scan a fresh QR code.';
        showToast(msg, 'error');
        if (errorEl) {
          errorEl.textContent = msg;
          errorEl.style.display = 'block';
        }
        return;
      }
      body.customSecret = val;
    }

    const res = await fetch('/api/admin/2fa/setup/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body)
    });

    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to start 2FA setup', 'error');
      return;
    }

    currentRaw2FASecret = data.secret;
    currentGeneratedBackupCodes = Array.isArray(data.backupCodes) ? data.backupCodes : [];

    // Render QR Code
    const qrContainer = document.getElementById('twofa-qr-code');
    if (qrContainer) {
      qrContainer.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
          text: data.otpauthUri,
          width: 180,
          height: 180,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } else {
        qrContainer.innerHTML = `<p style="color:#000;font-size:0.8rem;text-align:center;padding:1rem;">QR library loading...<br><a href="${data.otpauthUri}" target="_blank" style="color:#0284c7;font-weight:700;">Open Authenticator App</a></p>`;
      }
    }

    // Display Secret Key
    const secretDisplay = document.getElementById('twofa-secret-display');
    if (secretDisplay) {
      secretDisplay.textContent = data.formattedSecret || data.secret;
    }

    // Display Backup Codes
    const backupDisplay = document.getElementById('twofa-backup-codes-display');
    if (backupDisplay) {
      backupDisplay.innerHTML = currentGeneratedBackupCodes
        .map(code => `<div style="padding: 0.4rem; background: rgba(255,255,255,0.06); border-radius: 4px; font-weight: 600; letter-spacing: 1px;">${code}</div>`)
        .join('');
    }

    // Clear confirmation input & error
    const confirmInput = document.getElementById('twofa-confirm-code');
    if (confirmInput) confirmInput.value = '';
    const errorEl = document.getElementById('twofa-setup-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
    }

    // Switch step
    const startStep = document.getElementById('twofa-start-step');
    const wizardStep = document.getElementById('twofa-wizard-step');
    if (startStep) startStep.style.display = 'none';
    if (wizardStep) wizardStep.style.display = 'block';
    if (confirmInput) confirmInput.focus();

  } catch (err) {
    showToast('Failed to begin 2FA setup', 'error');
  }
}

async function confirm2FASetup() {
  const codeInput = document.getElementById('twofa-confirm-code');
  const errorEl = document.getElementById('twofa-setup-error');
  const btn = document.getElementById('twofa-activate-btn');
  const code = (codeInput ? codeInput.value : '').trim();

  if (!code || code.length < 6) {
    if (errorEl) {
      errorEl.textContent = 'Please enter the 6-digit code shown in your authenticator app.';
      errorEl.classList.add('visible');
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Activating...';
  }

  try {
    const res = await fetch('/api/admin/2fa/setup/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ code })
    });

    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    const data = await res.json();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '✅ Activate 2FA';
    }

    if (res.ok) {
      showToast(data.message || 'Two-Factor Authentication is now active! 🎉', 'success');
      await load2FAStatus();
    } else {
      if (errorEl) {
        errorEl.textContent = data.error || 'Verification code incorrect. Try again.';
        errorEl.classList.add('visible');
      }
    }
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '✅ Activate 2FA';
    }
    showToast('Failed to confirm 2FA setup', 'error');
  }
}

function copy2FASecret(btn) {
  const secret = currentRaw2FASecret || (document.getElementById('twofa-secret-display')?.textContent || '').replace(/\s+/g, '');
  if (!secret) return;
  navigator.clipboard.writeText(secret).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
  }).catch(() => {
    showToast('Could not copy to clipboard', 'error');
  });
}

function copyBackupCodes(btn) {
  if (!currentGeneratedBackupCodes.length) {
    showToast('No backup codes to copy', 'info');
    return;
  }
  const text = currentGeneratedBackupCodes.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Copied All!';
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
  }).catch(() => {
    showToast('Could not copy to clipboard', 'error');
  });
}

function downloadBackupCodes() {
  if (!currentGeneratedBackupCodes.length) {
    showToast('No backup codes to download', 'info');
    return;
  }
  const dateStr = new Date().toISOString().split('T')[0];
  const fileContent = `=====================================================
 StreamXvault Admin - Two-Factor Authentication Backup Codes
 Generated: ${new Date().toLocaleString()}
=====================================================

Store these one-time recovery codes in a secure, confidential place.
If you ever lose access to your phone or authenticator app, each code
can be used ONCE in place of your 6-digit TOTP code.

Recovery Codes:
${currentGeneratedBackupCodes.map((code, idx) => `  [${idx + 1}] ${code}`).join('\n')}

Note: Keep these codes secret! Anyone with your password and a recovery
code can access your admin account.
=====================================================`;

  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `streamxvault-2fa-backup-codes-${dateStr}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Backup codes downloaded! 💾', 'success');
}

function toggleActiveSecretVisibility() {
  const secretDisp = document.getElementById('twofa-active-secret-display');
  const toggleBtn = document.getElementById('btn-toggle-active-secret');
  if (!secretDisp || !toggleBtn) return;
  isSecretRevealed = !isSecretRevealed;
  if (isSecretRevealed) {
    secretDisp.textContent = activeFormattedSecret || activeSecretKey || 'Not available';
    toggleBtn.innerHTML = '🙈 Hide Key';
  } else {
    secretDisp.textContent = '•••• •••• •••• •••• •••• •••• •••• ••••';
    toggleBtn.innerHTML = '👁️ Reveal Key';
  }
}

function copyActive2FASecret(btn) {
  if (!activeSecretKey) return;
  navigator.clipboard.writeText(activeSecretKey).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
  }).catch(() => {
    showToast('Could not copy to clipboard', 'error');
  });
}

function showLinkExistingKeyForm() {
  const box = document.getElementById('twofa-link-existing-box');
  if (box) {
    const isHidden = box.style.display === 'none' || !box.style.display;
    box.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      const inp = document.getElementById('twofa-custom-secret-input');
      if (inp) inp.focus();
    }
  }
}

// Disable 2FA Modal
function showDisable2FAModal() {
  const modal = document.getElementById('disable-2fa-modal');
  if (!modal) return;
  document.getElementById('disable-2fa-password').value = '';
  document.getElementById('disable-2fa-code').value = '';
  const errorEl = document.getElementById('disable-2fa-error');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }
  modal.classList.add('active');
}

function closeDisable2FAModal() {
  const modal = document.getElementById('disable-2fa-modal');
  if (modal) modal.classList.remove('active');
}

async function confirmDisable2FA() {
  const password = document.getElementById('disable-2fa-password').value;
  const code = document.getElementById('disable-2fa-code').value.trim();
  const errorEl = document.getElementById('disable-2fa-error');

  if (!password) {
    if (errorEl) {
      errorEl.textContent = 'Please enter your admin password.';
      errorEl.classList.add('visible');
    }
    return;
  }

  try {
    const res = await fetch('/api/admin/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ password, code })
    });

    if (res.status === 401) {
      const data = await res.json();
      if (errorEl) {
        errorEl.textContent = data.error || 'Password or code incorrect.';
        errorEl.classList.add('visible');
      }
      return;
    }

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Two-Factor Authentication disabled.', 'info');
      closeDisable2FAModal();
      await load2FAStatus();
    } else {
      if (errorEl) {
        errorEl.textContent = data.error || 'Failed to disable 2FA.';
        errorEl.classList.add('visible');
      }
    }
  } catch (err) {
    showToast('Failed to disable 2FA', 'error');
  }
}

// Regenerate Backup Codes Modal
function showRegenerateBackupCodesModal() {
  const modal = document.getElementById('regenerate-codes-modal');
  if (!modal) return;
  document.getElementById('regen-codes-code').value = '';
  const errorEl = document.getElementById('regen-codes-error');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }
  modal.classList.add('active');
}

function closeRegenerateCodesModal() {
  const modal = document.getElementById('regenerate-codes-modal');
  if (modal) modal.classList.remove('active');
}

async function confirmRegenerateBackupCodes() {
  const code = document.getElementById('regen-codes-code').value.trim();
  const errorEl = document.getElementById('regen-codes-error');

  if (!code || code.length < 6) {
    if (errorEl) {
      errorEl.textContent = 'Please enter your current 6-digit authenticator code.';
      errorEl.classList.add('visible');
    }
    return;
  }

  try {
    const res = await fetch('/api/admin/2fa/backup-codes/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ code })
    });

    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }
    const data = await res.json();

    if (res.ok) {
      currentGeneratedBackupCodes = Array.isArray(data.backupCodes) ? data.backupCodes : [];
      closeRegenerateCodesModal();
      showToast('New backup codes generated successfully!', 'success');
      await load2FAStatus();

      // Offer immediate download of new codes
      setTimeout(() => {
        downloadBackupCodes();
      }, 500);
    } else {
      if (errorEl) {
        errorEl.textContent = data.error || 'Invalid code.';
        errorEl.classList.add('visible');
      }
    }
  } catch (err) {
    showToast('Failed to regenerate backup codes', 'error');
  }
}

// Modal overlay click handlers
const disable2FAModalEl = document.getElementById('disable-2fa-modal');
if (disable2FAModalEl) {
  disable2FAModalEl.addEventListener('click', (e) => {
    if (e.target === disable2FAModalEl) closeDisable2FAModal();
  });
}

const regenCodesModalEl = document.getElementById('regenerate-codes-modal');
if (regenCodesModalEl) {
  regenCodesModalEl.addEventListener('click', (e) => {
    if (e.target === regenCodesModalEl) closeRegenerateCodesModal();
  });
}

// Attach all to window so inline onclick handlers in HTML always find them
window.load2FAStatus = load2FAStatus;
window.load2FASecurityTab = load2FASecurityTab;
window.start2FASetupWizard = start2FASetupWizard;
window.confirm2FASetup = confirm2FASetup;
window.copy2FASecret = copy2FASecret;
window.copyBackupCodes = copyBackupCodes;
window.downloadBackupCodes = downloadBackupCodes;
window.showDisable2FAModal = showDisable2FAModal;
window.closeDisable2FAModal = closeDisable2FAModal;

// ==================== Auto-Thumbnail Generation from Video ====================
let autoExtractedThumbBlob = null;
let autoExtractedVideoElement = null;
let autoExtractedThumbUrl = null;
let candidateFrames = [];
let isCustomThumbSelected = false;

async function extractThumbnailsFromVideo(file) {
  if (!file || !file.type.startsWith('video/')) return;

  const container = document.getElementById('auto-thumb-container');
  const previewImg = document.getElementById('auto-thumb-preview');
  const timeDisplay = document.getElementById('auto-thumb-time-display');
  const slider = document.getElementById('auto-thumb-slider');
  const sliderVal = document.getElementById('auto-thumb-slider-val');
  const badge = document.getElementById('auto-thumb-badge');
  const loadingEl = document.getElementById('auto-thumb-loading');
  const thumbLabel = document.getElementById('thumb-file-label');

  if (container) container.style.display = 'block';
  if (loadingEl) loadingEl.style.display = 'flex';
  if (badge) {
    badge.textContent = '⏳ Extracting...';
    badge.style.background = '#64748b';
  }

  // Release old object URL if any
  if (autoExtractedThumbUrl) {
    try { URL.revokeObjectURL(autoExtractedThumbUrl); } catch (e) {}
  }

  const videoUrl = URL.createObjectURL(file);
  autoExtractedThumbUrl = videoUrl;

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = videoUrl;
  autoExtractedVideoElement = video;

  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => resolve();
    setTimeout(resolve, 3500); // fallback timeout
  });

  const duration = (video.duration && !isNaN(video.duration) && video.duration > 0) ? video.duration : 10;

  // 4 candidate moments: 10%, 25% (Best), 50%, 75%
  const targets = [
    { label: '10%', pct: 10, time: Math.max(0.5, duration * 0.10) },
    { label: '25% ⭐', pct: 25, time: Math.max(1, duration * 0.25), isBest: true },
    { label: '50%', pct: 50, time: Math.max(2, duration * 0.50) },
    { label: '75%', pct: 75, time: Math.max(3, duration * 0.75) }
  ];

  candidateFrames = [];
  let bestCandidate = null;

  for (const t of targets) {
    try {
      const snap = await captureFrameAt(video, t.time);
      if (snap) {
        const item = { ...t, ...snap };
        candidateFrames.push(item);
        if (t.isBest || !bestCandidate) {
          bestCandidate = item;
        }
      }
    } catch (e) {
      console.warn('Frame capture error at', t.time, e);
    }
  }

  if (loadingEl) loadingEl.style.display = 'none';

  if (candidateFrames.length === 0) {
    if (container) container.style.display = 'none';
    if (thumbLabel) thumbLabel.textContent = 'Could not auto-extract frame. Click to upload thumbnail image.';
    return;
  }

  // Select 25% best frame
  const chosen = candidateFrames.find(c => c.isBest) || candidateFrames[0];
  selectCandidateThumbnail(chosen);
  renderCandidateButtons();

  // Setup slider listener once
  if (slider && !slider.dataset.listening) {
    slider.dataset.listening = 'true';
    slider.addEventListener('input', (e) => {
      if (sliderVal) sliderVal.textContent = e.target.value + '%';
    });
    slider.addEventListener('change', async (e) => {
      if (!autoExtractedVideoElement) return;
      if (loadingEl) loadingEl.style.display = 'flex';
      const pct = Number(e.target.value) / 100;
      const dur = autoExtractedVideoElement.duration || 10;
      const seekTime = Math.max(0.5, dur * pct);
      const snap = await captureFrameAt(autoExtractedVideoElement, seekTime);
      if (loadingEl) loadingEl.style.display = 'none';
      if (snap) {
        selectCandidateThumbnail({
          label: `${e.target.value}%`,
          pct: Number(e.target.value),
          time: seekTime,
          ...snap
        });
      }
    });
  }
}

function captureFrameAt(video, targetTime) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (res) => {
      if (!finished) {
        finished = true;
        resolve(res);
      }
    };

    const timeout = setTimeout(() => finish(null), 4000);

    const onSeeked = () => {
      clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      try {
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;

        let w = 1280;
        let h = Math.round((vh / vw) * w);
        if (h % 2 !== 0) h++;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);

        let brightness = 50;
        try {
          const sampleW = Math.min(w, 160);
          const sampleH = Math.min(h, 90);
          const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
          let sum = 0, count = 0;
          for (let i = 0; i < imgData.data.length; i += 16) {
            sum += (imgData.data[i] * 0.299 + imgData.data[i + 1] * 0.587 + imgData.data[i + 2] * 0.114);
            count++;
          }
          brightness = count > 0 ? (sum / count) : 50;
        } catch (e) {}

        canvas.toBlob((blob) => {
          if (!blob) { finish(null); return; }
          const url = URL.createObjectURL(blob);
          finish({ blob, url, brightness, width: w, height: h });
        }, 'image/jpeg', 0.88);
      } catch (err) {
        finish(null);
      }
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = Math.min(targetTime, Math.max(0, (video.duration || targetTime) - 0.2));
  });
}

function selectCandidateThumbnail(cand) {
  if (!cand || !cand.blob) return;
  autoExtractedThumbBlob = cand.blob;
  isCustomThumbSelected = false;

  const previewImg = document.getElementById('auto-thumb-preview');
  if (previewImg) previewImg.src = cand.url;

  const timeDisplay = document.getElementById('auto-thumb-time-display');
  if (timeDisplay) {
    const mins = Math.floor(cand.time / 60);
    const secs = Math.floor(cand.time % 60);
    timeDisplay.textContent = `${cand.label || ''} (${mins}:${secs < 10 ? '0' : ''}${secs})`;
  }

  const badge = document.getElementById('auto-thumb-badge');
  if (badge) {
    badge.textContent = '✨ Auto Selected';
    badge.style.background = 'rgba(16, 185, 129, 0.95)';
  }

  const slider = document.getElementById('auto-thumb-slider');
  const sliderVal = document.getElementById('auto-thumb-slider-val');
  if (slider && cand.pct !== undefined) {
    slider.value = cand.pct;
    if (sliderVal) sliderVal.textContent = cand.pct + '%';
  }

  const thumbLabel = document.getElementById('thumb-file-label');
  if (thumbLabel) {
    thumbLabel.innerHTML = `✅ Auto-thumbnail ready: <strong>${cand.label || Math.round(cand.time) + 's frame'}</strong> (Leave as-is or click here to upload a custom image file)`;
  }

  const revertBtn = document.getElementById('btn-revert-auto-thumb');
  if (revertBtn) revertBtn.style.display = 'none';

  // Highlight active candidate button
  document.querySelectorAll('.auto-thumb-cand-btn').forEach(btn => {
    const isCurrent = Math.abs(Number(btn.dataset.time) - cand.time) < 0.1;
    btn.style.borderColor = isCurrent ? '#38bdf8' : 'rgba(255,255,255,0.15)';
    btn.style.background = isCurrent ? 'rgba(56, 189, 248, 0.25)' : 'rgba(0,0,0,0.4)';
  });
}

function renderCandidateButtons() {
  const box = document.getElementById('auto-thumb-candidates');
  if (!box) return;
  box.innerHTML = '';
  candidateFrames.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn-sm auto-thumb-cand-btn';
    btn.dataset.time = c.time;
    btn.style.padding = '0.3rem 0.6rem';
    btn.style.fontSize = '0.78rem';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '0.4rem';
    btn.style.borderRadius = '4px';
    btn.innerHTML = `<img src="${c.url}" style="width:28px;height:16px;object-fit:cover;border-radius:2px;"> <span>${c.label}</span>`;
    btn.onclick = () => selectCandidateThumbnail(c);
    box.appendChild(btn);
  });
}

function triggerCustomThumbUpload() {
  const input = document.getElementById('thumb-file');
  if (input) input.click();
}

function revertToAutoThumb() {
  const input = document.getElementById('thumb-file');
  if (input) input.value = '';
  isCustomThumbSelected = false;
  updateFileLabel('thumb');
  const revertBtn = document.getElementById('btn-revert-auto-thumb');
  if (revertBtn) revertBtn.style.display = 'none';
  if (candidateFrames.length > 0) {
    selectCandidateThumbnail(candidateFrames.find(c => c.isBest) || candidateFrames[0]);
  }
}

function resetAutoThumbUI() {
  autoExtractedThumbBlob = null;
  candidateFrames = [];
  isCustomThumbSelected = false;
  const container = document.getElementById('auto-thumb-container');
  if (container) container.style.display = 'none';
  const previewImg = document.getElementById('auto-thumb-preview');
  if (previewImg) previewImg.src = '';
  const revertBtn = document.getElementById('btn-revert-auto-thumb');
  if (revertBtn) revertBtn.style.display = 'none';
}

async function fetchThumbFromExternalUrl(videoInputId, thumbInputId) {
  const videoUrlInput = document.getElementById(videoInputId);
  const thumbUrlInput = document.getElementById(thumbInputId);
  const videoUrl = (videoUrlInput ? videoUrlInput.value : '').trim();
  if (!videoUrl) {
    showToast('Please enter a video URL first', 'error');
    return;
  }

  showToast('Fetching thumbnail from video stream... ⏳', 'info');

  // Step 1: Server-side extraction (bypasses all CORS!)
  try {
    const serverRes = await fetch('/api/admin/extract-video-thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ videoUrl, time: 15 })
    });
    if (serverRes.ok) {
      const data = await serverRes.json();
      if (data && data.thumbnailUrl) {
        if (thumbUrlInput) thumbUrlInput.value = data.thumbnailUrl;
        showToast('Thumbnail extracted & uploaded to R2 successfully! ✨', 'success');
        return;
      }
    }
  } catch (e) {
    console.warn('Server-side extraction failed, falling back to client:', e);
  }

  // Step 2: Client-side fallback
  try {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not load video'));
      setTimeout(() => reject(new Error('Timeout loading video')), 8000);
    });

    const targetTime = Math.max(1, (video.duration || 10) * 0.25);
    const snap = await captureFrameAt(video, targetTime);
    if (!snap || !snap.blob) throw new Error('Could not extract frame from video stream');

    // Upload directly to Cloudflare R2
    const thumbFile = new File([snap.blob], `external_thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
    const thumbResult = await uploadFileDirectly(thumbFile, 'thumbnail');
    if (thumbResult && thumbResult.publicUrl) {
      if (thumbUrlInput) thumbUrlInput.value = thumbResult.publicUrl;
      showToast('Thumbnail extracted & uploaded to R2 successfully! ✨', 'success');
    } else {
      showToast('Frame extracted, but upload to storage failed', 'error');
    }
  } catch (err) {
    console.warn('Auto-fetch external thumb error:', err);
    showToast('Could not auto-fetch from external host (CORS restriction). Please paste thumbnail URL directly.', 'warning');
  }
}

window.confirmDisable2FA = confirmDisable2FA;
window.triggerCustomThumbUpload = triggerCustomThumbUpload;
window.revertToAutoThumb = revertToAutoThumb;

// ==================== HLS Stream Auto-Thumbnail Extraction ====================
let hlsAutoThumbBlob = null;
let lastHlsUrlFetched = '';
let hlsDebounceTimer = null;

function onHlsInputDebounced(val) {
  clearTimeout(hlsDebounceTimer);
  const cleanVal = String(val || '').trim();
  if (!cleanVal || !cleanVal.includes('.m3u8') || cleanVal === lastHlsUrlFetched) return;
  hlsDebounceTimer = setTimeout(() => {
    triggerHlsThumbnailFetch(cleanVal);
  }, 600);
}

async function triggerHlsThumbnailFetch(hlsUrl, force = false) {
  const cleanUrl = String(hlsUrl || '').trim();
  if (!cleanUrl) {
    showToast('Please enter an HLS .m3u8 URL first', 'error');
    return;
  }
  if (!force && cleanUrl === lastHlsUrlFetched && hlsAutoThumbBlob) return;
  lastHlsUrlFetched = cleanUrl;

  const box = document.getElementById('r2-hls-thumb-preview-box');
  const img = document.getElementById('r2-hls-thumb-img');
  const loading = document.getElementById('r2-hls-thumb-loading');
  const badge = document.getElementById('r2-hls-thumb-badge');
  const timeEl = document.getElementById('r2-hls-thumb-time');
  const candidatesBox = document.getElementById('r2-hls-thumb-candidates');
  const thumbInput = document.getElementById('r2-thumb-url');

  if (box) box.style.display = 'block';
  if (loading) loading.style.display = 'flex';
  if (badge) { badge.textContent = '⏳ Fetching HLS...'; badge.style.background = '#64748b'; }

  showToast('Fetching best thumbnail from HLS stream... ⏳', 'info');

  // Step 1: Call server-side extraction first (Bypasses all browser CORS restrictions!)
  try {
    const serverRes = await fetch('/api/admin/extract-video-thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ videoUrl: cleanUrl, time: 15 })
    });

    if (serverRes.status === 401) {
      if (loading) loading.style.display = 'none';
      if (badge) { badge.textContent = '🔒 Session Expired'; badge.style.background = '#ef4444'; }
      showToast('Admin session expired. Please log in again.', 'error');
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    if (serverRes.ok) {
      const data = await serverRes.json();
      if (data && data.thumbnailUrl) {
        hlsAutoThumbBlob = true;
        if (img) img.src = data.thumbnailUrl;
        if (loading) loading.style.display = 'none';
        if (badge) { badge.textContent = '✨ Best Frame Auto-Fetched'; badge.style.background = 'rgba(16, 185, 129, 0.95)'; }
        if (timeEl) timeEl.textContent = 'Best Moment Captured (15s)';
        if (thumbInput) thumbInput.value = data.thumbnailUrl;
        showToast('HLS thumbnail automatically captured and saved to R2! 🎬', 'success');

        // Render candidate timestamps (10s, 30s, 60s, 120s)
        if (candidatesBox) {
          const moments = [
            { label: '5s', time: 5 },
            { label: '15s ⭐', time: 15 },
            { label: '45s', time: 45 },
            { label: '90s', time: 90 }
          ];
          candidatesBox.innerHTML = '';
          moments.forEach(m => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary btn-sm';
            btn.style.padding = '0.25rem 0.55rem';
            btn.style.fontSize = '0.75rem';
            btn.textContent = m.label;
            btn.onclick = async () => {
              if (loading) loading.style.display = 'flex';
              try {
                const subRes = await fetch('/api/admin/extract-video-thumbnail', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...authHeaders() },
                  body: JSON.stringify({ videoUrl: cleanUrl, time: m.time })
                });
                if (subRes.ok) {
                  const subData = await subRes.json();
                  if (subData && subData.thumbnailUrl) {
                    if (img) img.src = subData.thumbnailUrl;
                    if (thumbInput) thumbInput.value = subData.thumbnailUrl;
                    if (timeEl) timeEl.textContent = m.label + ' Moment';
                  }
                }
              } catch (e) {}
              if (loading) loading.style.display = 'none';
            };
            candidatesBox.appendChild(btn);
          });
        }
        return;
      }
    }
  } catch (serverErr) {
    console.warn('Server-side extraction failed, trying client-side fallback:', serverErr);
  }

  // Step 2: Client-side HLS fallback
  try {
    const frameResult = await extractFrameFromHlsUrl(cleanUrl, 0.25);
    if (!frameResult || !frameResult.blob) {
      throw new Error('Could not extract frame from HLS stream');
    }

    hlsAutoThumbBlob = frameResult.blob;
    if (img) img.src = frameResult.url;
    if (loading) loading.style.display = 'none';
    if (badge) { badge.textContent = '✨ Best Frame Auto-Fetched'; badge.style.background = 'rgba(16, 185, 129, 0.95)'; }
    if (timeEl) timeEl.textContent = '25% Best Moment';

    const safeBase = 'hls_' + Date.now();
    const thumbFile = new File([frameResult.blob], `${safeBase}.jpg`, { type: 'image/jpeg' });
    const uploadRes = await uploadFileDirectly(thumbFile, 'thumbnail');
    if (uploadRes && uploadRes.publicUrl) {
      if (thumbInput) thumbInput.value = uploadRes.publicUrl;
      showToast('HLS thumbnail automatically uploaded to R2! 🎬', 'success');
    }

  } catch (err) {
    console.warn('HLS auto-fetch failed:', err);
    if (loading) loading.style.display = 'none';
    if (badge) { badge.textContent = '⚠️ Auto-fetch CORS restricted'; badge.style.background = '#f59e0b'; }
    showToast('HLS stream host requires direct thumbnail URL, or upload video file for 100% automatic extraction.', 'warning');
  }
}

async function autoExtractAndUploadHlsThumbnail(hlsUrl) {
  // Try server extraction first
  try {
    const res = await fetch('/api/admin/extract-video-thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ videoUrl: hlsUrl, time: 15 })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.thumbnailUrl) return data.thumbnailUrl;
    }
  } catch (e) {}

  // Fallback to client extraction
  try {
    const frameResult = await extractFrameFromHlsUrl(hlsUrl, 0.25);
    if (!frameResult || !frameResult.blob) return null;
    const thumbFile = new File([frameResult.blob], `hls_thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
    const uploadRes = await uploadFileDirectly(thumbFile, 'thumbnail');
    return (uploadRes && uploadRes.publicUrl) ? uploadRes.publicUrl : null;
  } catch (err) {
    console.warn('autoExtractAndUploadHlsThumbnail error:', err);
    return null;
  }
}

function extractFrameFromHlsUrl(hlsUrl, targetPct = 0.25) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (res) => {
      if (!finished) {
        finished = true;
        try {
          if (hlsInstance) hlsInstance.destroy();
          video.remove();
        } catch (e) {}
        resolve(res);
      }
    };

    const timeout = setTimeout(() => finish(null), 12000);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.style.display = 'none';
    document.body.appendChild(video);

    let hlsInstance = null;

    const onSeeked = () => {
      clearTimeout(timeout);
      try {
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        let w = 1280;
        let h = Math.round((vh / vw) * w);
        if (h % 2 !== 0) h++;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);

        canvas.toBlob((blob) => {
          if (!blob) { finish(null); return; }
          const url = URL.createObjectURL(blob);
          finish({ blob, url, width: w, height: h, time: video.currentTime, duration: video.duration });
        }, 'image/jpeg', 0.88);
      } catch (err) {
        console.warn('HLS Canvas capture error:', err);
        finish(null);
      }
    };

    const startSeeking = () => {
      const dur = (video.duration && !isNaN(video.duration) && video.duration > 0) ? video.duration : 60;
      const seekTime = Math.max(1, dur * targetPct);
      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = seekTime;
    };

    if (typeof Hls !== 'undefined' && Hls.isSupported() && hlsUrl.includes('.m3u8')) {
      hlsInstance = new Hls({ enableWorker: false, autoStartLoad: true });
      hlsInstance.loadSource(hlsUrl);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().then(() => {
          setTimeout(startSeeking, 350);
        }).catch(() => {
          startSeeking();
        });
      });
      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.warn('Hls fatal error:', data);
          finish(null);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || !hlsUrl.includes('.m3u8')) {
      video.src = hlsUrl;
      video.onloadedmetadata = () => startSeeking();
      video.onerror = () => finish(null);
    } else {
      finish(null);
    }
  });
}

window.fetchThumbFromExternalUrl = fetchThumbFromExternalUrl;
window.onHlsInputDebounced = onHlsInputDebounced;
window.triggerHlsThumbnailFetch = triggerHlsThumbnailFetch;
window.autoExtractAndUploadHlsThumbnail = autoExtractAndUploadHlsThumbnail;

// ==================== Edit Modal & Quick Auto-Thumbnail ====================
async function triggerEditModalAutoThumb(seekTime = 15) {
  const videoUrl = (document.getElementById('edit-video-url')?.value || '').trim();
  const thumbInput = document.getElementById('edit-thumb-url');
  const previewCard = document.getElementById('edit-thumb-preview-card');
  const previewImg = document.getElementById('edit-thumb-preview-img');
  const loading = document.getElementById('edit-thumb-loading');
  const badge = document.getElementById('edit-thumb-badge');

  if (!videoUrl) {
    showToast('Please enter or verify the Video URL first', 'error');
    return;
  }

  if (previewCard) previewCard.style.display = 'block';
  if (loading) loading.style.display = 'flex';
  if (badge) {
    badge.textContent = '⏳ Extracting...';
    badge.style.background = '#64748b';
  }

  showToast(`Auto-fetching thumbnail from video stream (${seekTime}s)... ⏳`, 'info');

  try {
    const res = await fetch('/api/admin/extract-video-thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ videoUrl, time: seekTime })
    });

    if (res.status === 401) {
      if (loading) loading.style.display = 'none';
      if (badge) {
        badge.textContent = '🔒 Session Expired';
        badge.style.background = '#ef4444';
      }
      showToast('Admin session expired. Please log in again.', 'error');
      saveEditModalState();
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Extraction failed');
    }

    const data = await res.json();
    if (data && data.thumbnailUrl) {
      if (thumbInput) thumbInput.value = data.thumbnailUrl;
      if (previewImg) previewImg.src = data.thumbnailUrl;
      if (badge) {
        badge.textContent = `✨ Best Frame (${seekTime}s)`;
        badge.style.background = 'rgba(16, 185, 129, 0.95)';
      }
      showToast('Thumbnail captured and uploaded to Cloudflare R2! 🎬', 'success');
    }
  } catch (err) {
    console.warn('triggerEditModalAutoThumb error:', err);
    showToast('Could not auto-extract thumbnail: ' + err.message, 'warning');
    if (badge) {
      badge.textContent = '⚠️ Extraction error';
      badge.style.background = '#ef4444';
    }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function onEditThumbUrlChanged() {
  const val = (document.getElementById('edit-thumb-url')?.value || '').trim();
  const previewCard = document.getElementById('edit-thumb-preview-card');
  const previewImg = document.getElementById('edit-thumb-preview-img');
  const badge = document.getElementById('edit-thumb-badge');

  if (val) {
    if (previewCard) previewCard.style.display = 'block';
    if (previewImg) previewImg.src = val;
    if (badge) {
      badge.textContent = 'Custom URL';
      badge.style.background = '#0284c7';
    }
  }
}

async function quickAutoThumbnail(videoId) {
  const video = adminVideos.find(v => v.id === videoId);
  if (!video || !video.videoUrl) {
    showToast('Video not found or has no video URL', 'error');
    return;
  }

  showToast(`Auto-fetching thumbnail for "${video.title}"... ⏳`, 'info');

  try {
    const res = await fetch('/api/admin/extract-video-thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ videoUrl: video.videoUrl, time: 15 })
    });

    if (res.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    if (!res.ok) throw new Error('Extraction failed');
    const data = await res.json();
    if (!data.thumbnailUrl) throw new Error('No thumbnail returned');

    // Save update to video
    const updateRes = await fetch(`/api/videos/${videoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        ...video,
        thumbnailUrl: data.thumbnailUrl
      })
    });

    if (updateRes.status === 401) {
      showToast('Admin session expired. Please log in again.', 'error');
      setTimeout(() => { clearToken(); location.reload(); }, 1500);
      return;
    }

    if (!updateRes.ok) throw new Error('Failed to update video record');

    video.thumbnailUrl = data.thumbnailUrl;
    showToast(`Thumbnail added to "${video.title}"! 🎉`, 'success');
    loadAdminVideos();
  } catch (err) {
    showToast('Failed to auto-fetch thumbnail: ' + err.message, 'error');
  }
}

window.autoExtractAndUploadHlsThumbnail = autoExtractAndUploadHlsThumbnail;
window.triggerEditModalAutoThumb = triggerEditModalAutoThumb;
window.onEditThumbUrlChanged = onEditThumbUrlChanged;
window.quickAutoThumbnail = quickAutoThumbnail;
window.toggleActiveSecretVisibility = toggleActiveSecretVisibility;
window.copyActive2FASecret = copyActive2FASecret;
window.showLinkExistingKeyForm = showLinkExistingKeyForm;
window.showRegenerateBackupCodesModal = showRegenerateBackupCodesModal;
window.closeRegenerateCodesModal = closeRegenerateCodesModal;
window.confirmRegenerateBackupCodes = confirmRegenerateBackupCodes;
