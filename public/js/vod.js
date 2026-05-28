const urlParams = new URLSearchParams(window.location.search);
const genre = urlParams.get('genre');

if (!genre) {
  window.location.href = '/demand.html';
}

document.getElementById('display-genre').textContent = genre;

async function loadCompanies() {
  try {
    const res = await fetch('/api/vod/rules');
    if (res.ok) {
      const companies = await res.json();
      const select = document.getElementById('vod-company');
      select.innerHTML = '<option value="" disabled selected>Select a production company</option>';
      companies.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
      });
      if (companies.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No companies currently allowed.</option>';
        document.getElementById('submit-btn').disabled = true;
      }
    }
  } catch (err) {
    console.error('Failed to load companies');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCompanies();
});

document.getElementById('vod-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const company = document.getElementById('vod-company').value;
  const title = document.getElementById('vod-title').value.trim();
  const actor = document.getElementById('vod-actor').value.trim();
  const description = document.getElementById('vod-desc').value.trim();
  
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  
  try {
    const res = await fetch('/api/vod/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genre, company, title, actor, description })
    });
    
    if (res.ok) {
      document.getElementById('vod-form').style.display = 'none';
      document.getElementById('success-msg').style.display = 'block';
    } else {
      alert('Failed to submit request.');
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  } catch (err) {
    alert('An error occurred.');
    btn.disabled = false;
    btn.textContent = 'Submit Request';
  }
});
