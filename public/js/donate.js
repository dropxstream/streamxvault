/**
 * StreamXvault — Anonymous Crypto Support Modal
 * Immune to adblockers, CSS caching, and missing dependencies.
 */

const CRYPTO_CONFIG = [
  {
    id: 'sxv-usdc-polygon',
    coin: 'USDC',
    network: 'Polygon (PoS)',
    badgeColor: '#8247e5',
    address: '0x2D665f4A44Ba82A40d06e27599785730EC329016',
    icon: '🟣',
    note: 'Send only USDC via Polygon Network. Fast, near-zero gas fees.'
  }
];

function openSupportModal() {
  let modal = document.getElementById('sxv-support-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sxv-support-modal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:999999; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); align-items:center; justify-content:center; padding:1rem;';
    modal.onclick = function(e) {
      if (e.target === modal) closeSupportModal();
    };

    const cardsHtml = CRYPTO_CONFIG.map(c => {
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(c.address) + '&margin=6';
      return `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:1.25rem; text-align:center;">
          <div style="display:flex; align-items:center; justify-content:center; gap:0.6rem; margin-bottom:0.85rem;">
            <span style="font-size:1.5rem;">${c.icon}</span>
            <span style="font-weight:800; font-size:1.15rem; color:#fff;">${c.coin}</span>
            <span style="font-size:0.72rem; font-weight:700; padding:0.2rem 0.55rem; border-radius:6px; background:rgba(130,71,229,0.2); color:#a77dfa; border:1px solid rgba(130,71,229,0.4);">${c.network}</span>
          </div>

          <div style="margin:0.25rem auto 1rem; background:#ffffff; padding:8px; border-radius:10px; display:inline-block; box-shadow:0 4px 15px rgba(0,0,0,0.3);">
            <img src="${qrUrl}" alt="${c.coin} QR Code" width="140" height="140" style="display:block; border-radius:6px;" loading="lazy">
          </div>

          <div style="display:flex; align-items:center; gap:0.5rem; background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:0.5rem 0.75rem; margin-bottom:0.75rem;">
            <code id="addr-${c.id}" style="flex:1; font-family:monospace; font-size:0.78rem; color:#e2e8f0; word-break:break-all; text-align:left; user-select:all;">${c.address}</code>
            <button type="button" onclick="copyCryptoAddress('addr-${c.id}', this)" style="background:#8247e5; color:#fff; border:none; border-radius:6px; padding:0.45rem 0.75rem; font-size:0.8rem; font-weight:700; cursor:pointer; white-space:nowrap; transition:background 0.2s;">📋 Copy</button>
          </div>

          <p style="margin:0; font-size:0.75rem; color:#f59e0b; line-height:1.35;">⚠️ ${c.note}</p>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div style="background:#111118; border:1px solid rgba(255,255,255,0.14); border-radius:16px; max-width:460px; width:100%; box-shadow:0 25px 60px rgba(0,0,0,0.9), 0 0 30px rgba(130,71,229,0.2); overflow:hidden; color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" onclick="event.stopPropagation()">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:1.25rem 1.5rem 1rem; border-bottom:1px solid rgba(255,255,255,0.08);">
          <div>
            <h3 style="margin:0 0 0.35rem 0; font-size:1.25rem; font-weight:800; color:#fff; display:flex; align-items:center; gap:0.5rem;">❤️ Support StreamXvault</h3>
            <p style="margin:0; font-size:0.82rem; color:#9ca3af; line-height:1.4;">100% anonymous crypto tips. Helps keep our servers fast &amp; content fresh!</p>
          </div>
          <button type="button" onclick="closeSupportModal()" style="background:rgba(255,255,255,0.08); border:none; color:#9ca3af; width:32px; height:32px; border-radius:50%; font-size:1.1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; margin-left:0.5rem;" aria-label="Close">✕</button>
        </div>
        <div style="padding:1.25rem 1.5rem;">
          ${cardsHtml}
        </div>
        <div style="padding:0.75rem 1.5rem; background:rgba(0,0,0,0.25); border-top:1px solid rgba(255,255,255,0.05); font-size:0.75rem; color:#9ca3af; text-align:center;">
          🔒 Zero personal details collected. Completely private &amp; peer-to-peer.
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  modal.style.setProperty('display', 'flex', 'important');
  document.body.style.overflow = 'hidden';
}

function closeSupportModal() {
  const modal = document.getElementById('sxv-support-modal');
  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
    document.body.style.overflow = '';
  }
}

function copyCryptoAddress(targetId, btn) {
  const addrEl = document.getElementById(targetId);
  if (!addrEl) return;
  const addr = addrEl.innerText.trim();

  function markCopied() {
    if (btn) {
      btn.dataset.copied = '1';
      const originalText = btn.innerHTML;
      btn.innerHTML = '✓ Copied!';
      btn.style.background = '#10b981';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '#8247e5';
        delete btn.dataset.copied;
      }, 2500);
    }
    if (typeof showToast === 'function') {
      showToast('Address copied to clipboard!', 'success');
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(addr).then(markCopied).catch(fallback);
  } else {
    fallback();
  }

  function fallback() {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = addr;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      markCopied();
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Failed to copy. Please copy manually.', 'error');
      }
    }
  }
}

// Global aliases for maximum compatibility
window.openSupportModal = openSupportModal;
window.closeSupportModal = closeSupportModal;
window.openDonateModal = openSupportModal;
window.closeDonateModal = closeSupportModal;
window.copyCryptoAddress = copyCryptoAddress;

window.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeSupportModal();
});
