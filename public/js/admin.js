/**
 * StreamXvault — Admin Panel Logic
 * Uses JWT tokens for persistent auth & direct R2 uploads
 */

// ==================== Token Management ====================
// Tokens are now managed securely via HTTP-only cookies
function authHeaders() {
  return {};
}
function clearToken() {}

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
    }
  } catch {
    // ignore
  }
}

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('admin-username').value;
  const password = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('login-error');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Welcome, Admin! 🎉', 'success');
      showDashboard();
      loadDashboard();
    } else {
      errorEl.classList.add('visible');
      errorEl.textContent = data.error || 'Invalid credentials. Try again.';
      document.getElementById('admin-password').value = '';
      setTimeout(() => errorEl.classList.remove('visible'), 3000);
    }
  } catch (err) {
    showToast('Login failed. Please try again.', 'error');
  }
});

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
  document.getElementById(`tab-${tabName}`).style.display = 'block';
  if (element) element.classList.add('active');

  // Load tab data
  if (tabName === 'dashboard') loadStats();
  if (tabName === 'upload') loadGenres();
  if (tabName === 'manage') { loadGenres(); loadAdminVideos(); }
  if (tabName === 'vod') loadVodData();
}

// ==================== Dashboard ====================
async function loadDashboard() {
  await Promise.all([loadStats(), loadGenres()]);
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats', { headers: authHeaders() });
    if (res.status === 401) { clearToken(); location.reload(); return; }
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
videoFileInput.addEventListener('change', () => updateFileLabel('video'));
thumbFileInput.addEventListener('change', () => updateFileLabel('thumb'));

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
    const r2ThumbUrl = document.getElementById('r2-thumb-url').value.trim();
    const dl480 = document.getElementById('dl-480').value.trim(); const dl720 = document.getElementById('dl-720').value.trim(); const dl1080 = document.getElementById('dl-1080').value.trim(); const dl4k = document.getElementById('dl-4k').value.trim();

    if (!inputVal) {
      showToast('Please enter an HLS Stream URL', 'error');
      return;
    }

    const isHls = inputVal.startsWith('http') || inputVal.includes('.m3u8');

    const submitBtn = document.getElementById('upload-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Linking HLS Stream...';

    try {
      const res = await fetch('/api/admin/videos/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ 
          title, genre, modelName, tags, description, 
          videoUrl: isHls ? inputVal : '',
          thumbnailUrl: r2ThumbUrl,
          dl480, dl720, dl1080, dl4k, displayViews
        })
      });

      if (!res.ok) { const data = await res.json().catch(()=>({})); throw new Error(data.error || 'Failed to link stream'); }
      
      showToast(`"${title}" linked successfully! ☁️`, 'success');
      document.getElementById('upload-form').reset();
      updateFileLabel('video');
      updateFileLabel('thumb');
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

  const thumbFile = thumbFileInput.files[0];
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
    if (res.status === 401) { clearToken(); location.reload(); return; }
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
    if (res.status === 401) { clearToken(); location.reload(); return; }
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
    if (res.status === 401) { clearToken(); location.reload(); return; }
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
    if (res.status === 401) { clearToken(); location.reload(); return; }
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

  document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
}

async function saveEdit() {
  const videoId = document.getElementById('edit-id').value;
  const editVideoUrl = document.getElementById('edit-video-url').value.trim();

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
    thumbnailUrl: document.getElementById('edit-thumb-url').value.trim(),
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

    if (res.status === 401) { clearToken(); location.reload(); return; }

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

    if (res.status === 401) { clearToken(); location.reload(); return; }

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
    if (res.status === 401) { clearToken(); location.reload(); return; }
    
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

    if (res.status === 401) { clearToken(); location.reload(); return; }

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


