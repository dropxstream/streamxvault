window.playVastAd = function(containerElement, adTagUrl, onComplete) {
  let isFinished = false;
  
  function finish() {
    if (isFinished) return;
    isFinished = true;
    if (adContainer && adContainer.parentElement) {
      adContainer.parentElement.removeChild(adContainer);
    }
    if (adsLoader) adsLoader.destroy();
    if (adsManager) adsManager.destroy();
    onComplete();
  }

  if (typeof google === 'undefined' || typeof google.ima === 'undefined') {
    console.warn('Google IMA SDK not loaded.');
    return finish();
  }

  const adContainer = document.createElement('div');
  adContainer.style.position = 'absolute';
  adContainer.style.top = '0';
  adContainer.style.left = '0';
  adContainer.style.width = '100%';
  adContainer.style.height = '100%';
  adContainer.style.zIndex = '99999';
  adContainer.style.backgroundColor = '#000';
  containerElement.appendChild(adContainer);

  const adVideoElement = document.createElement('video');
  adVideoElement.style.width = '100%';
  adVideoElement.style.height = '100%';
  adVideoElement.playsInline = true;
  adContainer.appendChild(adVideoElement);

  const adDisplayContainer = new google.ima.AdDisplayContainer(adContainer, adVideoElement);
  adDisplayContainer.initialize();

  const adsLoader = new google.ima.AdsLoader(adDisplayContainer);
  let adsManager;

  adsLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => {
    adsManager = e.getAdsManager(adVideoElement);
    
    adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, finish);
    adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, finish);
    adsManager.addEventListener(google.ima.AdEvent.Type.USER_CLOSE, finish);
    adsManager.addEventListener(google.ima.AdEvent.Type.SKIPPED, finish);
    adsManager.addEventListener(google.ima.AdEvent.Type.COMPLETE, finish);
    
    try {
      adsManager.init(containerElement.clientWidth, containerElement.clientHeight, google.ima.ViewMode.NORMAL);
      adsManager.start();
    } catch (adError) {
      finish();
    }
  });

  adsLoader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, finish);

  const adsRequest = new google.ima.AdsRequest();
  adsRequest.adTagUrl = adTagUrl;
  adsRequest.linearAdSlotWidth = containerElement.clientWidth;
  adsRequest.linearAdSlotHeight = containerElement.clientHeight;
  adsRequest.nonLinearAdSlotWidth = containerElement.clientWidth;
  adsRequest.nonLinearAdSlotHeight = containerElement.clientHeight;
  
  adsLoader.requestAds(adsRequest);
  
  // Fallback timeout in case ad hangs
  setTimeout(finish, 45000); // 45 seconds max for ad
};
