(function () {
  var KEY = 'sxv_adult_consent_v1';
  var DAYS = 30;
  var BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebot|twitterbot|telegrambot|whatsapp|discordbot|slackbot|linkedinbot|embedly|pinterest|googlebot|bingbot|yandex|baidu|duckduck/i;
  if (BOT.test(navigator.userAgent || '')) return;

  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.ok && saved.ts && (Date.now() - saved.ts) < DAYS * 864e5) return;
  } catch (e) {}

  var style = document.createElement('style');
  style.textContent =
    '#sxv-age-gate{position:fixed;inset:0;z-index:2147483000;background:#07070a;color:#f4f4f5;font-family:Inter,system-ui,sans-serif;overflow:auto;}' +
    '#sxv-age-gate .sxv-box{max-width:640px;margin:4vh auto;padding:28px 22px 36px;}' +
    '#sxv-age-gate h1{font-size:1.7rem;margin:12px 0 8px;letter-spacing:.02em}' +
    '#sxv-age-gate .sxv-badge{display:inline-block;background:#e50914;color:#fff;font-weight:800;font-size:.75rem;padding:4px 10px;border-radius:4px;letter-spacing:.08em}' +
    '#sxv-age-gate p,#sxv-age-gate li{color:#c4c4cc;line-height:1.55;font-size:.92rem}' +
    '#sxv-age-gate .sxv-scroll{max-height:42vh;overflow:auto;border:1px solid #2a2a33;border-radius:10px;padding:14px 16px;background:#101014;margin:16px 0}' +
    '#sxv-age-gate label{display:flex;gap:10px;align-items:flex-start;margin:14px 0;font-size:.9rem;color:#ddd}' +
    '#sxv-age-gate input{margin-top:4px}' +
    '#sxv-age-gate .sxv-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}' +
    '#sxv-age-gate button{border:0;border-radius:8px;padding:12px 18px;font-weight:700;cursor:pointer;font-size:.95rem}' +
    '#sxv-age-gate .sxv-enter{background:#e50914;color:#fff}' +
    '#sxv-age-gate .sxv-enter:disabled{opacity:.4;cursor:not-allowed}' +
    '#sxv-age-gate .sxv-leave{background:#2a2a33;color:#eee}' +
    '#sxv-age-gate .sxv-err{color:#ff6b6b;font-size:.85rem;display:none;margin-top:8px}' +
    '#sxv-age-gate .sxv-fine{font-size:.75rem;color:#8b8b96;margin-top:18px}';
  document.head.appendChild(style);

  var gate = document.createElement('div');
  gate.id = 'sxv-age-gate';
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'sxv-age-title');
  gate.innerHTML =
    '<div class="sxv-box">' +
    '<span class="sxv-badge">18+ ADULT ONLY</span>' +
    '<h1 id="sxv-age-title">Age verification and legal warning</h1>' +
    '<p>StreamXvault contains explicit adult sexual content. You must be at least 18 years old (or the age of majority where you live, if higher) to continue.</p>' +
    '<div class="sxv-scroll">' +
    '<p><strong>By entering you confirm and agree:</strong></p>' +
    '<ul>' +
    '<li>You are 18 or older, and the age of majority in your place of residence.</li>' +
    '<li>You are not accessing this site from a country, state, or territory where viewing, possessing, or distributing adult or pornographic material is prohibited.</li>' +
    '<li>You understand that laws differ by country. It is <strong>your</strong> duty to know and follow the law where you are.</li>' +
    '<li>If adult content is restricted or illegal where you live or where you are right now, you must leave immediately and not use StreamXvault.</li>' +
    '<li>StreamXvault, its operators, hosts, advertisers, and affiliates are <strong>not responsible</strong> for your decision to access this site, for any breach of local law, or for any penalty, claim, or loss that follows from your access.</li>' +
    '<li>You will not allow a minor to view this site or its materials.</li>' +
    '<li>Content is provided as-is for adults who chose to view it. We do not offer legal advice.</li>' +
    '</ul>' +
    '<p>If you do not accept every point above, do not enter.</p>' +
    '</div>' +
    '<label><input id="sxv-age-check" type="checkbox"> I am 18 or older, adult content is legal for me where I am, and I accept the warning. StreamXvault is not responsible for my access.</label>' +
    '<div class="sxv-err" id="sxv-age-err">Tick the box to confirm before you enter.</div>' +
    '<div class="sxv-actions">' +
    '<button type="button" class="sxv-enter" id="sxv-age-enter" disabled>I am 18+ — Enter</button>' +
    '<button type="button" class="sxv-leave" id="sxv-age-leave">I am under 18 — Leave</button>' +
    '</div>' +
    '<p class="sxv-fine">This notice is a warning and consent record stored only in your browser. It is not a substitute for legal advice. Restricted-jurisdiction users must not enter.</p>' +
    '</div>';

  function mount() {
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(gate);
    var box = document.getElementById('sxv-age-check');
    var enter = document.getElementById('sxv-age-enter');
    var err = document.getElementById('sxv-age-err');
    box.addEventListener('change', function () {
      enter.disabled = !box.checked;
      err.style.display = 'none';
    });
    enter.addEventListener('click', function () {
      if (!box.checked) { err.style.display = 'block'; return; }
      try { localStorage.setItem(KEY, JSON.stringify({ ok: true, ts: Date.now() })); } catch (e) {}
      gate.remove();
      document.documentElement.style.overflow = '';
    });
    document.getElementById('sxv-age-leave').addEventListener('click', function () {
      window.location.replace('https://www.google.com/');
    });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
