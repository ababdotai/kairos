/**
 * Kairos Content Script
 * Main entry point for the video overlay functionality
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    OVERLAY_ID: 'kairos-overlay-root',
    VIDEO_SELECTOR: 'video',
    Z_INDEX: 2147483647,
    DEBUG: true
  };

  /**
   * Logs debug messages if debug mode is enabled
   */
  function log(...args) {
    if (CONFIG.DEBUG) {
      console.log('[Kairos]', ...args);
    }
  }

  /**
   * VideoTracker class - Tracks video element position and dimensions
   */
  class VideoTracker {
    constructor(videoSelector) {
      this.videoSelector = videoSelector;
      this.videoElement = null;
      this.animationFrameId = null;
      this.callbacks = [];
    }

    /**
     * Finds the video element in the DOM
     */
    findVideoElement() {
      const video = document.querySelector(this.videoSelector);
      if (video && video !== this.videoElement) {
        this.videoElement = video;
        log('Video element found:', video);
        return true;
      }
      return video !== null;
    }

    /**
     * Gets the current bounding rectangle of the video element
     */
    getVideoRect() {
      if (!this.videoElement) {
        return null;
      }
      return this.videoElement.getBoundingClientRect();
    }

    /**
     * Starts tracking the video element
     */
    start(callback) {
      this.callbacks.push(callback);

      if (!this.animationFrameId) {
        this.update();
      }
    }

    /**
     * Updates the video position and triggers callbacks
     */
    update() {
      if (!this.findVideoElement()) {
        // Retry if video not found yet
        this.animationFrameId = requestAnimationFrame(() => this.update());
        return;
      }

      const rect = this.getVideoRect();
      if (rect) {
        this.callbacks.forEach(callback => callback(rect));
      }

      this.animationFrameId = requestAnimationFrame(() => this.update());
    }

    /**
     * Stops tracking the video element
     */
    stop() {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }
  }

  /**
   * OverlayManager class - Manages the floating overlay UI
   */
  class OverlayManager {
    constructor() {
      this.container = null;
      this.shadowRoot = null;
      this.overlayElement = null;
    }

    /**
     * Initializes the overlay with Shadow DOM for style isolation
     */
    init() {
      // Create container element
      this.container = document.createElement('div');
      this.container.id = CONFIG.OVERLAY_ID;

      // Attach Shadow DOM
      this.shadowRoot = this.container.attachShadow({ mode: 'open' });

      // Inject styles
      this.injectStyles();

      // Create overlay element
      this.createOverlay();

      // Append to body
      document.body.appendChild(this.container);

      log('Overlay initialized');
    }

    /**
     * Injects CSS styles into Shadow DOM
     */
    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .kairos-overlay {
          position: fixed;
          pointer-events: none;
          z-index: ${CONFIG.Z_INDEX};
          transition: all 0.1s ease-out;
        }

        .kairos-debug-border {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border: 3px solid #39FF14;
          box-shadow: 0 0 20px rgba(57, 255, 20, 0.5);
          pointer-events: none;
        }

        .kairos-orb {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 48px;
          height: 48px;
          background: rgba(26, 26, 26, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          pointer-events: auto;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .kairos-orb:hover {
          transform: scale(1.1);
          border-color: rgba(57, 255, 20, 0.5);
          box-shadow: 0 0 20px rgba(57, 255, 20, 0.3);
        }

        .kairos-orb-icon {
          width: 24px;
          height: 24px;
          fill: #D4D4D4;
        }

        .kairos-info {
          position: absolute;
          top: 16px;
          left: 16px;
          padding: 8px 12px;
          background: rgba(26, 26, 26, 0.9);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #D4D4D4;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 12px;
          pointer-events: none;
        }
      `;
      this.shadowRoot.appendChild(style);
    }

    /**
     * Creates the overlay HTML structure
     */
    createOverlay() {
      const overlay = document.createElement('div');
      overlay.className = 'kairos-overlay';

      // Debug border (to verify overlay is working)
      const debugBorder = document.createElement('div');
      debugBorder.className = 'kairos-debug-border';
      overlay.appendChild(debugBorder);

      // Info display
      const info = document.createElement('div');
      info.className = 'kairos-info';
      info.textContent = 'Kairos Active';
      overlay.appendChild(info);

      // Floating orb
      const orb = document.createElement('div');
      orb.className = 'kairos-orb';
      orb.innerHTML = `
        <svg class="kairos-orb-icon" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      `;
      orb.addEventListener('click', () => this.handleOrbClick());
      overlay.appendChild(orb);

      this.overlayElement = overlay;
      this.shadowRoot.appendChild(overlay);
    }

    /**
     * Updates the overlay position based on video rectangle
     */
    updatePosition(rect) {
      if (!this.overlayElement) return;

      this.overlayElement.style.top = `${rect.top}px`;
      this.overlayElement.style.left = `${rect.left}px`;
      this.overlayElement.style.width = `${rect.width}px`;
      this.overlayElement.style.height = `${rect.height}px`;
    }

    /**
     * Handles click event on the floating orb
     */
    handleOrbClick() {
      log('Orb clicked!');
      // TODO: Implement note-taking UI in Phase 1
      alert('Kairos v0.1 - Click detected!\nNote-taking UI coming in Phase 1');
    }

    /**
     * Destroys the overlay
     */
    destroy() {
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      log('Overlay destroyed');
    }
  }

  /**
   * Main application initialization
   */
  function init() {
    log('Initializing Kairos...');

    // Create overlay manager
    const overlayManager = new OverlayManager();
    overlayManager.init();

    // Create video tracker
    const videoTracker = new VideoTracker(CONFIG.VIDEO_SELECTOR);

    // Start tracking and update overlay position
    videoTracker.start((rect) => {
      overlayManager.updatePosition(rect);
    });

    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      log('Fullscreen state changed');
      // The overlay will automatically adjust due to continuous tracking
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
