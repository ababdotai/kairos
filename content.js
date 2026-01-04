/**
 * Kairos Content Script
 * Main entry point for the video overlay functionality
 */

(function () {
  'use strict';

  // Configuration
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
     * Finds the best candidate video element in the DOM
     */
    findVideoElement() {
      // 1. Get all potential video candidates
      const allVideos = Array.from(document.querySelectorAll(this.videoSelector));

      // 2. Filter candidates based on size, visibility, and ignore list
      const validCandidates = allVideos.filter(video => {
        // Check 1: Is it visible? (offsetParent is null if display:none)
        if (video.offsetParent === null) return false;

        const rect = video.getBoundingClientRect();

        // Check 2: Minimum Dimensions
        if (rect.width < CONFIG.MIN_WIDTH || rect.height < CONFIG.MIN_HEIGHT) {
          return false;
        }

        // Check 3: Ignore Selectors (Banners, etc.)
        const isIgnored = CONFIG.IGNORE_SELECTORS.some(selector => {
          try {
            return video.matches(selector);
          } catch (e) {
            return false;
          }
        });

        if (isIgnored) return false;

        // Check 4: Explicit Structure Check (Safety for known headers)
        if (video.closest('header') || video.closest('.bili-header') || video.closest('.animated-banner')) {
          return false;
        }

        return true;
      });

      // 3. Select the best candidate (Largest Visible Area)
      if (validCandidates.length === 0) {
        // If currently tracked video is still valid (in DOM), keep it until a better one appears
        // This prevents flickering if the main video temporarily dips in score
        return this.videoElement && document.body.contains(this.videoElement);
      }

      // Sort by area descending
      validCandidates.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        const areaA = rectA.width * rectA.height;
        const areaB = rectB.width * rectB.height;
        return areaB - areaA;
      });

      const bestVideo = validCandidates[0];

      if (bestVideo && bestVideo !== this.videoElement) {
        this.videoElement = bestVideo;
        log('Video element found (Best Candidate):', bestVideo);
        return true;
      }

      return this.videoElement !== null;
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
        this.callbacks.forEach(callback => callback(rect, this.videoElement));
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

        /* Orb: The Dynamic Island (Top Center) */
        .kairos-orb {
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          height: 48px; /* Slightly more compact like a notch */
          width: 48px; 
          /* iOS 26 Glassmorphism: Ultra-thin border, deep blur, vibrant saturation */
          background: rgba(10, 10, 10, 0.4);
          backdrop-filter: blur(32px) saturate(210%);
          border: 0.5px solid rgba(255, 255, 255, 0.18);
          border-radius: 24px;
          pointer-events: auto;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          /* Smooth elastic transition */
          transition: all 0.5s cubic-bezier(0.3, 1.2, 0.3, 1);
          box-shadow: 
            0 10px 40px rgba(0, 0, 0, 0.4),
            inset 0 0 0 0.5px rgba(255, 255, 255, 0.1); /* Specular highlight */
          z-index: 20;
          overflow: hidden;
          padding: 0 16px; /* Horizontal padding for expansion */
        }

        /* Hover State: Symmetrical Expansion */
        .kairos-orb:hover {
          width: 180px; 
          background: rgba(20, 20, 20, 0.55);
          border-color: rgba(255, 255, 255, 0.3);
          transform: translateX(-50%) scale(1.02);
          box-shadow: 
            0 15px 50px rgba(0, 0, 0, 0.5),
            inset 0 0 12px rgba(255, 255, 255, 0.05);
        }

        /* Active State for Orb */
        .kairos-orb.active {
          background: rgba(10, 10, 10, 0.5);
          border-color: rgba(0, 242, 255, 0.5);
          box-shadow: 
            0 0 30px rgba(0, 242, 255, 0.25),
            inset 0 0 0 0.5px rgba(0, 242, 255, 0.3);
        }
        
        .kairos-orb-icon {
          width: 24px;
          height: 24px;
          min-width: 24px;
          fill: rgba(255, 255, 255, 0.95);
          filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.1));
          transition: all 0.4s ease;
        }

        .kairos-orb.active .kairos-orb-icon {
          fill: #00f2ff; 
          filter: drop-shadow(0 0 12px rgba(0, 242, 255, 0.5));
        }

        /* Label Text */
        .kairos-orb-label {
          margin-left: 0; /* Managed by justify-content */
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.2px;
          white-space: nowrap;
          opacity: 0;
          transform: scale(0.9);
          transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
          max-width: 0; 
        }

        /* Show label on hover with a slight delay */
        .kairos-orb:hover .kairos-orb-label {
          opacity: 1;
          transform: scale(1);
          max-width: 120px;
          margin-left: 12px;
        }


        .kairos-orb.active .kairos-orb-icon {
          fill: #00f2ff; /* Cyan active color */
          filter: drop-shadow(0 0 8px rgba(0, 242, 255, 0.6));
        }

        .kairos-info {
          display: none; /* Hidden as requested */
        }

        /* Ceiling Timeline: The Invisible Touch Area */
        .kairos-timeline-container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 16px; 
          background: transparent;
          pointer-events: none; /* Disabled by default */
          z-index: 30;
          opacity: 0; 
          transition: opacity 0.3s ease;
          overflow: visible; 
        }

        /* Show and Enable when Overlay is Active (Activated via Orb) */
        .kairos-overlay.active .kairos-timeline-container {
          opacity: 1; 
          pointer-events: auto; /* Enable interaction only when active */
          /* Custom Pin Cursor: 180deg rotated + Horizontally Flipped */
          cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text y="28" x="4" font-size="24" style="transform-origin: 16px 16px; transform: rotate(180deg) scaleX(-1);">📌</text></svg>') 12 12, crosshair;
        }

        /* The Progress Glow: Aurora Style */
        .kairos-progress-bar {
          height: 3px; /* Thicker line */
          width: 0%; 
          /* Stronger Gradient */
          background: linear-gradient(90deg, 
            rgba(0, 242, 255, 0) 0%, 
            rgba(0, 242, 255, 0.8) 50%,
            rgba(160, 60, 255, 1) 100%
          );
          /* Intense glow */
          box-shadow: 
            0 0 15px rgba(160, 60, 255, 0.6),
            2px 0 20px rgba(0, 242, 255, 0.5);
          transition: width 0.1s linear;
          position: absolute;
          top: 0;
          border-radius: 0 3px 3px 0;
        }

        /* The Pin: Visual Emoji Marker */
        .kairos-pin {
          position: absolute;
          top: 2px; /* Adjust slightly to align point with line */
          width: 24px; 
          height: 24px;
          transform: translateX(-50%);
          cursor: pointer;
          z-index: 31;
          pointer-events: none; /* Hit test via pseudo if needed, or container */
          display: flex;
          justify-content: center;
          align-items: center;
          /* Remove thread styles */
          background: transparent;
        }

        /* The Emoji Head */
        .kairos-pin::after {
          content: '📌';
          font-size: 20px;
          /* Match the cursor: Rotate 180 + Flip X */
          transform: rotate(180deg) scaleX(-1);
          filter: drop-shadow(0 0 8px rgba(0, 242, 255, 0.6));
          transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          pointer-events: auto; 
        }

        /* Hover Effect: Scale up */
        .kairos-pin:hover::after {
          transform: rotate(180deg) scaleX(-1) scale(1.3);
          filter: drop-shadow(0 0 12px rgba(0, 242, 255, 0.9));
          cursor: pointer;
        }
        
        /* Remove old hover height change */
        .kairos-pin:hover {
          height: 24px; 
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
          /* Center of Orb: Top 12px + Half Height 24px = 36px */
          top: 36px; 
          left: 50%;
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
          transform: translate(-50%, -50%) scale(0);
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
            transform: translate(-50%, -50%) scale(0);
            opacity: 0.8;
          }
          30% {
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(100);
            opacity: 0;
          }
        }

        @keyframes kairos-ripple-contract {
          0% {
            transform: translate(-50%, -50%) scale(100);
            opacity: 0;
          }
          30% {
            opacity: 0.6; /* Light gathers */
          }
          100% {
            transform: translate(-50%, -50%) scale(0);
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

      // Ceiling Timeline
      const timeline = document.createElement('div');
      timeline.className = 'kairos-timeline-container';
      
      const progressBar = document.createElement('div');
      progressBar.className = 'kairos-progress-bar';
      timeline.appendChild(progressBar);

      timeline.addEventListener('click', (e) => this.handleTimelineClick(e));
      overlay.appendChild(timeline);

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

      // Info display (Hidden via CSS)
      const info = document.createElement('div');
      info.className = 'kairos-info';
      info.textContent = 'Kairos Active';
      overlay.appendChild(info);

      // Floating orb
      const orb = document.createElement('div');
      orb.className = 'kairos-orb';
      
      const iconSvg = `
        <svg class="kairos-orb-icon" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      `;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'kairos-orb-label';
      labelSpan.textContent = 'Activate Kairos'; // Default text

      orb.innerHTML = iconSvg;
      orb.appendChild(labelSpan);

      orb.addEventListener('click', (e) => {
          this.handleOrbClick();
      });

      overlay.appendChild(orb);

      this.overlayElement = overlay;
      this.orbElement = orb; 
      this.orbLabel = labelSpan; 
      this.timeline = timeline;
      this.progressBar = progressBar;
      this.pins = []; // Track created pins
      
      this.shadowRoot.appendChild(overlay);

      // Store references for animation
      this.effectElements = { flash, ripple, glowBorder };
    }

    /**
     * Updates the overlay position based on video rectangle
     */
    updatePosition(rect, video) {
      if (!this.overlayElement) return;
      this.videoElement = video; // Store reference

      this.overlayElement.style.top = `${rect.top}px`;
      this.overlayElement.style.left = `${rect.left}px`;
      this.overlayElement.style.width = `${rect.width}px`;
      this.overlayElement.style.height = `${rect.height}px`;

      // Update progress bar
      if (this.isActive && this.progressBar && video && video.duration) {
        const progress = (video.currentTime / video.duration) * 100;
        this.progressBar.style.width = `${progress}%`;
      }
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

            

                    // 1. Fade out the border and Hide Timeline (via overlay active class)

                    glowBorder.classList.remove('active');

                    if (this.overlayElement) this.overlayElement.classList.remove('active');

                    

                    // 2. Update Orb State

                    if (this.orbElement) this.orbElement.classList.remove('active');

                    if (this.orbLabel) this.orbLabel.textContent = 'Activate Kairos';

            

                    // 3. Trigger "Reverse" Ripple (Contract)        // Clean up previous animations first
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

        // 2. Update Orb State
        if (this.orbElement) this.orbElement.classList.add('active');
        if (this.orbLabel) this.orbLabel.textContent = 'Deactivate Kairos';

        // Show Timeline
        if (this.overlayElement) this.overlayElement.classList.add('active');

        // Force reflow
        void flash.offsetWidth;

        // 3. Start Activation Animations
        flash.classList.add('animating');
        ripple.classList.add('animating');

        // Activate the border - it will fade in as the ripple expands
        glowBorder.classList.add('active');
      }
    }

    /**
     * Handles clicks on the timeline to seek and add pins
     */
    handleTimelineClick(e) {
      if (!this.isActive || !this.videoElement || !this.timeline) return;

      e.stopPropagation(); // Don't trigger underlying elements

      const rect = this.timeline.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, clickX / width)); // Clamp 0-1

      // 1. Seek video
      if (Number.isFinite(this.videoElement.duration)) {
          this.videoElement.currentTime = percentage * this.videoElement.duration;
      }

      // 2. Create Pin visual
      this.createPin(percentage * 100);
      
      log(`Timeline clicked at ${Math.round(percentage * 100)}%`);
    }

    /**
     * Creates a visual pin on the timeline
     */
    createPin(percentage) {
        const pin = document.createElement('div');
        pin.className = 'kairos-pin';
        pin.style.left = `${percentage}%`;
        
        // Add hover/click interactions for the pin here later
        
        this.timeline.appendChild(pin);
        this.pins.push({
            element: pin,
            percentage: percentage,
            timestamp: this.videoElement ? this.videoElement.currentTime : 0
        });
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
    videoTracker.start((rect, video) => {
      overlayManager.updatePosition(rect, video);
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
