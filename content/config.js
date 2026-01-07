/**
 * Kairos Configuration Module
 * Global configuration constants and logging utility
 */

(function () {
  'use strict';

  // Initialize global namespace
  window.Kairos = window.Kairos || {};

  /**
   * Application configuration constants
   */
  const CONFIG = {
    OVERLAY_ID: 'kairos-overlay-root',
    VIDEO_SELECTOR: 'video',
    Z_INDEX: 2147483647,
    DEBUG: true,
    // Minimum dimensions to consider a "main" video
    MIN_WIDTH: 300,
    MIN_HEIGHT: 200,
    // CSS selectors to explicitly ignore (e.g., banners, previews)
    IGNORE_SELECTORS: [
      '.bili-header .layer video',   // Bilibili Home Banner
      '.bili-header__banner video',  // Bilibili Banner variant
      '.animated-banner video',      // Generic banner class
      'header video',                // Videos in headers
      '.banner-video',               // Common banner class
      // YouTube specific ignores
      'ytd-video-preview video',     // Home feed hover previews
      '#inline-player video',        // Inline player container
      'ytd-miniplayer video',        // Miniplayer (corner)
      '.ytd-moving-thumbnail-renderer video' // Legacy moving thumbnails
    ]
  };

  /**
   * Logs debug messages if debug mode is enabled
   * @param {...any} args - Arguments to log
   */
  function log(...args) {
    if (CONFIG.DEBUG) {
      console.log('[Kairos]', ...args);
    }
  }

  // Export to global namespace
  window.Kairos.CONFIG = CONFIG;
  window.Kairos.log = log;

})();
