(function () {
  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild;
  }
  function ensurePanel() {
    var dash = document.getElementById('tab-dashboard');
    if (!dash || document.getElementById('live-stats-board')) return;
    var panel = el(
      '<div id="live-stats-board" style="margin-top:2rem;">' +
      '<h3 style="margin-bottom:1rem;font-weight:700;">Live traffic</h3>' +
      '<div class="stats-grid" id="live-kpis"></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-top:1rem;">' +
      '<div class="stat-card" style="text-align:left;"><h4>Growing now</h4><div id="live-growing">Waiting for data…</div></div>' +
      '<div class="stat-card" style="text-align:left;"><h4>Live visitors by country</h4><div id="live-countries">Waiting for data…</div></div>' +
      '<div class="stat-card" style="text-align:left;"><h4>Where they came from</h4><div id="live-refs">Waiting for data…</div></div>' +
      '</div></div>'
    );
    var stats = document.getElementById('stats-grid');
    if (stats && stats.parentNode) stats.parentNode.insertBefore(panel, stats.nextSibling);
    else dash.appendChild(panel);
  }
  function row(left, right) {
    return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-color);font-size:0.85rem;"><span>' + left + '</span><strong>' + right + '</strong></div>';
  }
  async function refresh() {
    ensurePanel();
    if (!document.getElementById('live-stats-board')) return;
    try {
      var res = await fetch('/api/admin/live', { credentials: 'same-origin' });
      if (!res.ok) return;
      var data = await res.json();
      var kpis = document.getElementById('live-kpis');
      if (kpis) {
        kpis.innerHTML =
          '<div class="stat-card"><div class="stat-value">' + (data.liveVisitors || 0) + '</div><div class="stat-label">Live visitors</div></div>' +
          '<div class="stat-card"><div class="stat-value">' + (data.pageviewsToday || 0) + '</div><div class="stat-label">Pageviews today</div></div>' +
          '<div class="stat-card"><div class="stat-value">' + (data.watchesToday || 0) + '</div><div class="stat-label">Watches today</div></div>' +
          '<div class="stat-card"><div class="stat-value">' + (data.countriesLive || 0) + '</div><div class="stat-label">Countries live</div></div>';
      }
      var g = document.getElementById('live-growing');
      if (g) {
        g.innerHTML = (data.growing || []).length
          ? data.growing.map(function (item) {
              return row(escapeHtml(item.title || item.id), '+' + item.recent + ' / ' + (item.total || 0) + ' views');
            }).join('')
          : '<p style="color:var(--text-muted);font-size:0.85rem;">No surge yet. Open watch pages to seed live views.</p>';
      }
      var c = document.getElementById('live-countries');
      if (c) {
        c.innerHTML = (data.countries || []).length
          ? data.countries.map(function (item) { return row(escapeHtml(item.country), item.live + ' live · ' + item.total + ' all-time'); }).join('')
          : '<p style="color:var(--text-muted);font-size:0.85rem;">Country comes from Cloudflare CF-IPCountry.</p>';
      }
      var r = document.getElementById('live-refs');
      if (r) {
        r.innerHTML = (data.referrers || []).length
          ? data.referrers.map(function (item) { return row(escapeHtml(item.source), item.count); }).join('')
          : '<p style="color:var(--text-muted);font-size:0.85rem;">Direct, Telegram, X, Google, etc. appear here.</p>';
      }
    } catch (e) {}
  }
  var orig = window.loadStats;
  window.loadStats = async function () {
    if (typeof orig === 'function') await orig();
    await refresh();
  };
  document.addEventListener('DOMContentLoaded', function () {
    ensurePanel();
    setInterval(refresh, 8000);
  });
})();
