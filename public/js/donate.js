/**
 * StreamXvault — Anonymous Crypto Donation Modal
 * Easily extensible for multiple cryptocurrencies.
 */

const CRYPTO_DONATIONS = [
  {
    id: 'usdc-polygon',
    coin: 'USDC',
    network: 'Polygon (PoS)',
    badgeColor: '#8247e5',
    address: '0x2D665f4A44Ba82A40d06e27599785730EC329016',
    icon: '🟣',
    note: 'Send only USDC via the Polygon Network. Fast, near-zero gas fees.'
  }
  // To add more cryptos later, just add another object here!
  // Example:
  // {
  //   id: 'btc',
  //   coin: 'Bitcoin',
  //   network: 'BTC Network',
  //   badgeColor: '#f7931a',
  //   address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  //   icon: '₿',
  //   note: 'Send only Bitcoin (BTC) to this address.'
  // }
];

function openDonateModal() {
  let modal = document.getElementById('crypto-donate-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'crypto-donate-modal';
    modal.className = 'donate-modal-overlay';
    document.body.appendChild(modal);
  }

  const walletCards = CRYPTO_DONATIONS.map(w => {
    const isConfigured = w.address && !w.address.includes('YOUR_');
    const qrUrl = isConfigured 
      ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(w.address)}&margin=6`
      : '';
    return `
      <div class="donate-card" data-coin="${w.id}">
        <div class="donate-card-header">
          <div class="donate-coin-info">
            <span class="donate-coin-icon">${w.icon}</span>
            <div>
              <span class="donate-coin-name">${w.coin}</span>
              <span class="donate-network-badge" style="background: ${w.badgeColor}22; color: ${w.badgeColor}; border: 1px solid ${w.badgeColor}44;">${w.network}</span>
            </div>
          </div>
        </div>
        
        ${isConfigured ? `
        <div class="donate-qr-wrapper">
          <img src="${qrUrl}" alt="${w.coin} QR Code" class="donate-qr-img" width="140" height="140" loading="lazy">
        </div>
        ` : ''}

        <div class="donate-address-box">
          <code class="donate-address" id="addr-${w.id}">${w.address}</code>
          <button type="button" class="donate-copy-btn" onclick="copyCryptoAddress('${w.id}', this)" aria-label="Copy ${w.coin} Address">
            <span class="btn-text">📋 Copy</span>
          </button>
        </div>

        <p class="donate-note">⚠️ ${w.note}</p>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="donate-modal-dialog animate-fade-in" onclick="event.stopPropagation()">
      <div class="donate-modal-header">
        <div>
          <h3 class="donate-modal-title">❤️ Support StreamXvault</h3>
          <p class="donate-modal-subtitle">100% anonymous crypto tips. Helps keep our servers fast & content fresh!</p>
        </div>
        <button type="button" class="donate-modal-close" onclick="closeDonateModal()" aria-label="Close modal">✕</button>
      </div>
      <div class="donate-modal-body">
        ${walletCards}
      </div>
      <div class="donate-modal-footer">
        <span>🔒 Zero personal details collected. Completely private.</span>
      </div>
    </div>
  `;

  modal.onclick = closeDonateModal;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeDonateModal() {
  const modal = document.getElementById('crypto-donate-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function copyCryptoAddress(coinId, btn) {
  const item = CRYPTO_DONATIONS.find(w => w.id === coinId);
  if (!item || !item.address || item.address.includes('YOUR_')) {
    if (typeof showToast === 'function') showToast('Please configure a valid crypto address first', 'info');
    return;
  }

  navigator.clipboard.writeText(item.address).then(() => {
    const textSpan = btn.querySelector('.btn-text');
    if (textSpan) textSpan.textContent = '✓ Copied!';
    btn.classList.add('copied');
    if (typeof showToast === 'function') {
      showToast(`${item.coin} address copied to clipboard!`, 'success');
    }
    setTimeout(() => {
      if (textSpan) textSpan.textContent = '📋 Copy';
      btn.classList.remove('copied');
    }, 2500);
  }).catch(() => {
    if (typeof showToast === 'function') showToast('Failed to copy. Please copy manually.', 'error');
  });
}

// Close on Escape key
window.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeDonateModal();
});
