/**
 * Kairos Content Script Entry Point
 * Orchestrates the video overlay functionality
 */

(function () {
  'use strict';

  const { CONFIG, log, OverlayManager, VideoTracker } = window.Kairos;

  /**
   * Main application initialization
   */
  async function init() {
    log('Initializing Kairos...');

    // Create overlay manager
    const overlayManager = new OverlayManager();
    await overlayManager.init();

    // Create video tracker
    const videoTracker = new VideoTracker(CONFIG.VIDEO_SELECTOR);

    // Start tracking and update overlay position
    videoTracker.start((rect, video) => {
      overlayManager.updatePosition(rect, video);
    });

    // Monitor URL changes (for SPA like YouTube)
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        log('URL changed, reloading notes...');
        overlayManager.loadNotesForCurrentVideo();
      }
    }, 2000);

    // Initial load
    overlayManager.loadNotesForCurrentVideo();

    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      log('Fullscreen state changed');
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      videoTracker.stop();
      overlayManager.destroy();
    });

    log('Kairos initialized successfully');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
