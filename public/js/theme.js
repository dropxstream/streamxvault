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
    var navRight = nav.querySelector('.nav-right');
    if (navRight) {
      navRight.addEventListener('click', function (e) {
        var target = e.target.closest('a, .btn-support');
        if (target && nav.classList.contains('nav-open')) {
          nav.classList.remove('nav-open');
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    }
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

    if (typeof window.clarity !== 'function') {
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0]; if (y && y.parentNode) y.parentNode.insertBefore(t, y);
      })(window, document, 'clarity', 'script', 'yf6u7k9337');
    }
  }
  function initSmartNavbar() {
    var nav = document.getElementById('navbar');
    if (!nav || nav.dataset.smartScroll) return;
    nav.dataset.smartScroll = '1';
    var lastY = window.scrollY || window.pageYOffset || 0;
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var y = window.scrollY || window.pageYOffset || 0;
        if (y > 50) nav.classList.add('scrolled');
        else nav.classList.remove('scrolled');

        if (y <= 60) {
          nav.classList.remove('nav-hidden');
        } else if (y > lastY + 8) {
          nav.classList.add('nav-hidden');
          if (nav.classList.contains('nav-open')) {
            nav.classList.remove('nav-open');
            var toggleBtn = document.getElementById('nav-toggle');
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
          }
        } else if (y < lastY - 6) {
          nav.classList.remove('nav-hidden');
        }
        lastY = y > 0 ? y : 0;
        ticking = false;
      });
    }, { passive: true });
  }
  apply(current());
  function boot() {
    ensureButton();
    ensureNavToggle();
    initSmartNavbar();
    idle(loadDeferred);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
