/**
 * StreamXvault — Admin Panel Logic
 * Uses JWT tokens for persistent auth & direct R2 uploads
 */

// ==================== Token Management ====================
function getToken() {
  return localStorage.getItem('streamxvault_token');
}

function setToken(token) {
  localStorage.setItem('streamxvault_token', token);
}

function clearToken() {
  localStorage.removeItem('streamxvault_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
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
  return text.replace(/[&<>"']/g, m => map[m]);
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
  const token = getToken();
  if (!token) return;

  try {
    const res = await fetch('/api/auth/status', {
      headers: authHeaders()
    });
    const data = await res.json();
    if (data.isAdmin) {
      showDashboard();
      loadDashboard();
    } else {
      clearToken();
    }
  } catch {
    clearToken();
  }
}

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('login-error');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();

    if (res.ok && data.token) {
      setToken(data.token);
      showToast('Welcome, Admin! 🎉', 'success');
      showDashboard();
      loadDashboard();
    } else {
      errorEl.classList.add('visible');
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
  } catch {}
  clearToken();
  showToast('Logged out', 'info');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-dashboard').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
  document.getElementById('admin-password').value = '';
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
  if (tabName === 'manage') loadAdminVideos();
}

// ==================== Dashboard ====================
async function loadDashboard() {
  await loadStats();
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats', { headers: authHeaders() });
    if (res.status === 401) { clearToken(); location.reload(); return; }
    const stats = await res.json();

    document.getElementById('stat-total').textContent = stats.totalVideos;
    document.getElementById('stat-published').textContent = stats.publishedVideos;
    document.getElementById('stat-views').textContent = formatViews(stats.totalViews);
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
          reject(new Error('Cloudflare CORS Error: ETag header is missing. Please add "ETag" to your R2 bucket CORS ExposeHeaders configuration!'));
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
};

// Upload form submission
document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('video-title').value.trim();
  if (!title) {
    showToast('Please enter a video title', 'error');
    return;
  }

  const genre = document.getElementById('video-genre').value;
  if (!genre) {
    showToast('Please select a video genre', 'error');
    return;
  }

  const description = document.getElementById('video-desc').value.trim();

  // Handle External Link Submission
  if (currentUploadSource === 'external') {
    const extVideoUrl = document.getElementById('ext-video-url').value.trim();
    const extThumbUrl = document.getElementById('ext-thumb-url').value.trim();

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
        body: JSON.stringify({ title, genre, description, videoUrl: extVideoUrl, thumbnailUrl: extThumbUrl })
      });

      if (!res.ok) throw new Error('Failed to link external video');
      
      showToast(`"${title}" linked successfully! 🎬`, 'success');
      document.getElementById('upload-form').reset();
      updateFileLabel('video');
      updateFileLabel('thumb');
      loadVideosAdmin(); // Refresh list
    } catch (err) {
      showToast('Error linking external video', 'error');
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
          description,
          videoUrl: videoResult.publicUrl,
          videoFilename: videoResult.key,
          thumbnailUrl: thumbResult ? thumbResult.publicUrl : null,
          thumbnailFilename: thumbResult ? thumbResult.key : null
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

// ==================== Manage Videos ====================
let adminVideos = [];

async function loadAdminVideos() {
  const listEl = document.getElementById('admin-video-list');
  const emptyEl = document.getElementById('admin-empty');

  try {
    const res = await fetch('/api/admin/videos', { headers: authHeaders() });
    if (res.status === 401) { clearToken(); location.reload(); return; }
    adminVideos = await res.json();
    
    // Automatically render all videos initially
    if (typeof filterAdminVideos === 'function') {
      filterAdminVideos('');
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
      ? `<img src="${video.thumbnailUrl}" alt="${video.title}">`
      : `<div class="thumb-placeholder" style="font-size: 1.5rem;">🎬</div>`;

    const statusBadge = video.published !== false
      ? '<span class="badge badge-success">Published</span>'
      : '<span class="badge badge-warning">Draft</span>';

    const genreBadge = video.genre 
      ? `<span class="badge" style="background:var(--accent-purple);color:white;">🏷️ ${escapeHtml(video.genre)}</span>`
      : '';

    item.innerHTML = `
      <div class="item-thumb">${thumbnailContent}</div>
      <div class="item-info">
        <div class="item-title">${escapeHtml(video.title)}</div>
        <div class="item-meta">
          ${statusBadge}
          ${genreBadge}
          <span>👁️ ${formatViews(video.views || 0)} views</span>
          <span>🕐 ${getTimeAgo(video.uploadedAt)}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${video.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${video.id}')">🗑️</button>
      </div>
    `;

    listEl.appendChild(item);
  });
}

function filterAdminVideos(genre) {
  // Update button active states
  const buttons = document.querySelectorAll('#admin-genre-filters .btn');
  buttons.forEach(btn => btn.className = 'btn btn-secondary');
  const activeBtn = document.getElementById('admin-filter-' + (genre || 'All'));
  if (activeBtn) activeBtn.className = 'btn btn-primary';

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

  document.getElementById('edit-id').value = video.id;
  document.getElementById('edit-title').value = video.title;
  document.getElementById('edit-genre').value = video.genre || '';
  document.getElementById('edit-desc').value = video.description || '';
  document.getElementById('edit-published').checked = video.published !== false;

  document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
}

async function saveEdit() {
  const videoId = document.getElementById('edit-id').value;
  const formData = new FormData();
  formData.append('title', document.getElementById('edit-title').value.trim());
  formData.append('genre', document.getElementById('edit-genre').value);
  formData.append('description', document.getElementById('edit-desc').value.trim());
  formData.append('published', document.getElementById('edit-published').checked);

  try {
    const res = await fetch(`/api/videos/${videoId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: formData
    });

    if (res.status === 401) { clearToken(); location.reload(); return; }

    if (res.ok) {
      showToast('Video updated successfully!', 'success');
      closeEditModal();
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

// ==================== Initialize ====================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});
