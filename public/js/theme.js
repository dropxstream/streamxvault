(function () {
  var KEY = 'sxv_theme';
  function current() {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      btn.textContent = theme === 'dark' ? 'Dark' : 'Light';
      btn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    }
  }
  function ensureButton() {
    if (document.getElementById('theme-toggle')) return;
    var host = document.querySelector('.nav-right') || document.querySelector('.navbar');
    if (!host) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'theme-toggle';
    btn.className = 'theme-toggle';
    btn.addEventListener('click', function () {
      apply(current() === 'dark' ? 'light' : 'dark');
    });
    host.insertBefore(btn, host.firstChild);
    apply(current());
  }
  function ensureNavToggle() {
    var nav = document.getElementById('navbar');
    if (!nav || document.getElementById('nav-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'nav-toggle';
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-label', 'Open menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span><span></span><span></span>';
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('nav-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    nav.appendChild(btn);
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('nav-open')) return;
      if (nav.contains(e.target)) return;
      nav.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
    });
  }
  function idle(fn) {
    if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 3500 });
    else setTimeout(fn, 1800);
  }
  function loadDeferred() {
    if (!document.getElementById('aclib')) {
      var ads = document.createElement('script');
      ads.id = 'aclib';
      ads.async = true;
      ads.src = 'https://acscdn.com/script/aclib.js';
      ads.onload = function () {
        try { if (window.aclib && aclib.runVideoSlider) aclib.runVideoSlider({ zoneId: '11262190' }); } catch (e) {}
      };
      document.head.appendChild(ads);
    }
    if (typeof window.clarity !== 'function') {
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0]; if (y && y.parentNode) y.parentNode.insertBefore(t, y);
      })(window, document, 'clarity', 'script', 'yf6u7k9337');
    }
  }
  apply(current());
  function boot() {
    ensureButton();
    ensureNavToggle();
    idle(loadDeferred);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
