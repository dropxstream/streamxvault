(function () {
  var UID_KEY = 'sxv_uid';
  var HIST_KEY = 'sxv_watch_history';
  function uid() {
    try {
      var id = localStorage.getItem(UID_KEY);
      if (id && id.length > 8) return id;
      id = 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(UID_KEY, id);
      return id;
    } catch (e) { return 'anon'; }
  }
  function history() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; }
  }
  function pushHistory(videoId, genre) {
    if (!videoId) return;
    var list = history().filter(function (item) { return item.id !== videoId; });
    list.unshift({ id: videoId, genre: genre || '', t: Date.now() });
    list = list.slice(0, 40);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function refHost() {
    try {
      var r = document.referrer;
      if (!r) return 'direct';
      var host = new URL(r).hostname.replace(/^www\./, '');
      if (!host || host.indexOf('streamxvault.online') !== -1) return 'direct';
      return host.slice(0, 80);
    } catch (e) { return 'direct'; }
  }
  function videoIdFromUrl() {
    try { return new URLSearchParams(location.search).get('v') || ''; } catch (e) { return ''; }
  }
  function send(extra) {
    var body = {
      uid: uid(),
      path: (location.pathname + location.search).slice(0, 180),
      referrer: refHost(),
      videoId: extra && extra.videoId || videoIdFromUrl(),
      event: (extra && extra.event) || 'page',
      history: history().slice(0, 12).map(function (item) { return item.id; })
    };
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }
  window.sxvTrackWatch = function (videoId, genre) {
    pushHistory(videoId, genre);
    send({ event: 'watch', videoId: videoId });
  };
  window.sxvWatchHistory = history;
  if (/bot|crawl|spider|facebookexternalhit|twitterbot|telegrambot/i.test(navigator.userAgent || '')) return;
  send({ event: 'page' });
  setInterval(function () { send({ event: 'ping' }); }, 20000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) send({ event: 'ping' });
  });
})();
