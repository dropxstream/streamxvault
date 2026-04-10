/**
 * StreamXvault — Admin Panel Logic
 */

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
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    if (data.isAdmin) {
      showDashboard();
      loadDashboard();
    }
  } catch {}
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

    if (res.ok) {
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
    await fetch('/api/auth/logout', { method: 'POST' });
    showToast('Logged out', 'info');
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-dashboard').style.display = 'none';
    document.getElementById('logout-btn').style.display = 'none';
    document.getElementById('admin-password').value = '';
  } catch {}
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
    const res = await fetch('/api/stats');
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

// Upload form submission
document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const videoFile = videoFileInput.files[0];
  if (!videoFile) {
    showToast('Please select a video file', 'error');
    return;
  }

  const title = document.getElementById('video-title').value.trim();
  if (!title) {
    showToast('Please enter a video title', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('video', videoFile);
  formData.append('title', title);
  formData.append('description', document.getElementById('video-desc').value.trim());

  const thumbFile = thumbFileInput.files[0];
  if (thumbFile) {
    formData.append('thumbnail', thumbFile);
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
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = pct + '%';
        progressText.textContent = `Uploading... ${pct}%`;
      }
    });

    const response = await new Promise((resolve, reject) => {
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
      xhr.send(formData);
    });

    showToast(`"${title}" uploaded successfully! 🎬`, 'success');

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
    const res = await fetch('/api/admin/videos');
    adminVideos = await res.json();

    if (adminVideos.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.innerHTML = '';

    adminVideos.forEach(video => {
      const item = document.createElement('div');
      item.className = 'admin-video-item';

      const thumbnailContent = video.thumbnailUrl
        ? `<img src="${video.thumbnailUrl}" alt="${video.title}">`
        : `<div class="thumb-placeholder" style="font-size: 1.5rem;">🎬</div>`;

      const statusBadge = video.published !== false
        ? '<span class="badge badge-success">Published</span>'
        : '<span class="badge badge-warning">Draft</span>';

      item.innerHTML = `
        <div class="item-thumb">${thumbnailContent}</div>
        <div class="item-info">
          <div class="item-title">${escapeHtml(video.title)}</div>
          <div class="item-meta">
            ${statusBadge}
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

  } catch (err) {
    console.error('Failed to load videos:', err);
    showToast('Failed to load videos', 'error');
  }
}

// ==================== Edit Modal ====================
function openEditModal(videoId) {
  const video = adminVideos.find(v => v.id === videoId);
  if (!video) return;

  document.getElementById('edit-id').value = video.id;
  document.getElementById('edit-title').value = video.title;
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
  formData.append('description', document.getElementById('edit-desc').value.trim());
  formData.append('published', document.getElementById('edit-published').checked);

  try {
    const res = await fetch(`/api/videos/${videoId}`, {
      method: 'PUT',
      body: formData
    });

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
      method: 'DELETE'
    });

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
