/**
 * ima-ads.js - Non-blocking fallback helper
 */
window.playVastAd = function(containerElement, adTagUrl, onComplete) {
  if (typeof onComplete === 'function') {
    onComplete();
  }
};
