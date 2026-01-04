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
      this.isActive = false;
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

        /* Apple Intelligence-style Border */
        .kairos-glow-border {
          position: absolute;
          inset: -1.5px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 0 0 rgba(0,0,0,0); 
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Active State: Narrower and subtler colorful inner border */
        .kairos-glow-border.active {
          opacity: 1;
          border-color: rgba(255, 255, 255, 0.6);
          /* Narrower inset shadows (4px-20px instead of 10px-60px) */
          box-shadow: 
            inset 4px 0 25px rgba(0, 200, 255, 0.7),    /* Cyan Left */
            inset -4px 0 25px rgba(180, 0, 255, 0.7),   /* Purple Right */
            inset 0 4px 25px rgba(255, 0, 150, 0.7),    /* Pink Top */
            inset 0 -4px 25px rgba(255, 100, 0, 0.7),   /* Orange Bottom */
            0 0 15px rgba(255, 255, 255, 0.2);          /* Outer Edge Glow */
          
          animation: kairos-border-pulse 3s infinite alternate ease-in-out;
        }

        .kairos-orb {
          position: absolute;
          top: 24px;
          right: 24px;
          width: 56px;
          height: 56px;
          background: rgba(15, 15, 15, 0.3);
          backdrop-filter: blur(24px) saturate(200%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          pointer-events: auto;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          z-index: 20;
        }

        .kairos-orb:hover {
          transform: scale(1.08);
          background: rgba(30, 30, 30, 0.5);
          border-color: rgba(255, 255, 255, 0.4);
          box-shadow: 
            0 12px 48px rgba(0, 0, 0, 0.4),
            0 0 15px rgba(0, 195, 255, 0.3);
        }

        .kairos-orb-icon {
          width: 28px;
          height: 28px;
          fill: white;
          filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.2));
        }

        .kairos-info {
          position: absolute;
          top: 24px;
          left: 24px;
          padding: 8px 16px;
          background: rgba(10, 10, 10, 0.4);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          font-weight: 500;
          font-size: 13px;
          pointer-events: none;
          z-index: 20;
          opacity: 0.7;
        }

        /* Animation Layers */
        .kairos-effect-container {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 10;
          overflow: hidden;
          border-radius: 12px;
        }

        .kairos-flash {
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.03);
          opacity: 0;
        }

        .kairos-flash.animating {
          animation: kairos-flash-anim 1.2s ease-in-out forwards;
        }

        .kairos-ripple {
          position: absolute;
          top: 52px;
          right: 52px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: radial-gradient(circle, 
            #ffffff 0%,
            #00f2ff 25%, 
            #7000ff 50%, 
            #ff0095 75%, 
            transparent 100%
          );
          filter: blur(12px);
          transform: translate(50%, -50%) scale(0);
          opacity: 0;
          mix-blend-mode: screen;
        }

        .kairos-ripple.animating {
          /* Slower expansion (1.6s) with more natural "floating" curve */
          animation: kairos-ripple-expand 1.6s cubic-bezier(0.33, 1, 0.68, 1) forwards;
        }

        .kairos-ripple.reversing {
          /* Reverse animation: contract back to source */
          animation: kairos-ripple-contract 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }

        @keyframes kairos-border-pulse {
          0% {
            box-shadow: 
              inset 4px 0 25px rgba(0, 200, 255, 0.7),
              inset -4px 0 25px rgba(180, 0, 255, 0.7),
              inset 0 4px 25px rgba(255, 0, 150, 0.7),
              inset 0 -4px 25px rgba(255, 100, 0, 0.7),
              0 0 15px rgba(255, 255, 255, 0.2);
          }
          100% {
            box-shadow: 
              inset 6px 0 35px rgba(0, 200, 255, 0.8),
              inset -6px 0 35px rgba(180, 0, 255, 0.8),
              inset 0 6px 35px rgba(255, 0, 150, 0.8),
              inset 0 -6px 35px rgba(255, 100, 0, 0.8),
              0 0 25px rgba(255, 255, 255, 0.3);
          }
        }

        @keyframes kairos-flash-anim {
          0% { opacity: 0; }
          40% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes kairos-ripple-expand {
          0% {
            transform: translate(50%, -50%) scale(0);
            opacity: 0.8;
          }
          30% {
            opacity: 1;
          }
          100% {
            transform: translate(50%, -50%) scale(100);
            opacity: 0;
          }
        }

        @keyframes kairos-ripple-contract {
          0% {
            transform: translate(50%, -50%) scale(100);
            opacity: 0;
          }
          30% {
            opacity: 0.6; /* Light gathers */
          }
          100% {
            transform: translate(50%, -50%) scale(0);
            opacity: 0;
          }
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

      // Apple Intelligence-style Glow Border
      const glowBorder = document.createElement('div');
      glowBorder.className = 'kairos-glow-border';
      overlay.appendChild(glowBorder);

      // Animation Effect Container
      const effectContainer = document.createElement('div');
      effectContainer.className = 'kairos-effect-container';

      const flash = document.createElement('div');
      flash.className = 'kairos-flash';
      effectContainer.appendChild(flash);

      const ripple = document.createElement('div');
      ripple.className = 'kairos-ripple';
      effectContainer.appendChild(ripple);

      overlay.appendChild(effectContainer);

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

      // Store references for animation
      this.effectElements = { flash, ripple, glowBorder };
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
      if (!this.effectElements) {
        log('Animation elements missing.');
        return;
      }

      const { flash, ripple, glowBorder } = this.effectElements;

      if (this.isActive) {
        // --- DEACTIVATE ---
        log('Deactivating Kairos...');
        this.isActive = false;

        // 1. Fade out the border
        glowBorder.classList.remove('active');

        // 2. Trigger "Reverse" Ripple (Contract)
        // Clean up previous animations first
        ripple.classList.remove('animating');
        ripple.classList.remove('reversing');
        
        // Force reflow
        void ripple.offsetWidth;
        
        // Start reverse animation
        ripple.classList.add('reversing');

        // Note: We don't flash on deactivation, just smooth exit

      } else {
        // --- ACTIVATE ---
        log('Activating Kairos (Apple Intelligence style)...');
        this.isActive = true;
        
        // 1. Reset all animations
        flash.classList.remove('animating');
        ripple.classList.remove('animating');
        ripple.classList.remove('reversing');
        glowBorder.classList.remove('active'); // Temporarily remove to ensure transition

        // Force reflow
        void flash.offsetWidth;
        
        // 2. Start Activation Animations
        flash.classList.add('animating');
        ripple.classList.add('animating');
        
        // Activate the border - it will fade in as the ripple expands
        glowBorder.classList.add('active');
      }
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
