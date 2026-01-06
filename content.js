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
   * Utils - Helper functions for video identification
   */
  const Utils = {
    getVideoId() {
      const url = new URL(window.location.href);
      if (url.hostname.includes('youtube.com')) {
        if (url.pathname.startsWith('/shorts/')) {
          return `yt-${url.pathname.split('/shorts/')[1]}`;
        }
        return `yt-${url.searchParams.get('v')}`;
      } else if (url.hostname.includes('bilibili.com')) {
        const bvid = url.pathname.split('/').find(p => p.startsWith('BV'));
        return bvid ? `bili-${bvid}` : `bili-${url.pathname}`;
      }
      return `generic-${url.hostname}${url.pathname}`;
    },

    getVideoInfo() {
      return {
        videoId: this.getVideoId(),
        url: window.location.href,
        title: document.title.replace(/\(\d+\)\s*/, '').split(' - YouTube')[0].trim() // Clean title
      };
    },

    formatTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return [h, m, s]
        .filter((v, i) => v > 0 || i > 0)
        .map(v => v.toString().padStart(2, '0'))
        .join(':');
    },

    generateId() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
  };

  /**
   * StorageManager - Proxy to Background Service Worker
   */
  class StorageManager {
    constructor() { }

    // No init needed for proxy, but keeping empty for compatibility
    async init() {
      log('StorageManager initialized (Proxy Mode -> Background Worker)');
      return Promise.resolve();
    }

    async saveNote(note) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'SAVE_NOTE', payload: note }, (response) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (response && response.success) resolve(response.data);
          else reject(response ? response.error : 'Unknown error');
        });
      });
    }

    async getNotesForVideo(videoId) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_NOTES', payload: { videoId } }, (response) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (response && response.success) resolve(response.data);
          else reject(response ? response.error : 'Unknown error');
        });
      });
    }

    async deleteNote(id) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'DELETE_NOTE', payload: { id } }, (response) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (response && response.success) resolve(response.data);
          else reject(response ? response.error : 'Unknown error');
        });
      });
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
      this.escListener = null; // Store global esc listener
      this.storage = new StorageManager();
      this.currentVideoId = null;

      // Interaction States
      this.activePin = null;
      this.isEditing = false; // Locked via click
      this.wasPlaying = false;
    }

    /**
     * Initializes the overlay with Shadow DOM for style isolation
     */
    async init() {
      // Init Storage first
      await this.storage.init();

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

        /* The Intelligent Island Container: Free Floating inside Overlay */
        .kairos-island-container {
          position: absolute;
          /* Default Start Position (Top Center) */
          top: 12px;
          left: 50%;
          transform: translateX(-50%); 
          display: flex;
          align-items: center;
          gap: 0; /* Gap handled by positioning now */
          pointer-events: none; /* Container passes clicks */
          z-index: 50; /* Ensure above timeline */
          will-change: top, left, transform; 
        }

        /* Note Wrapper: Absolute positioning to pop out without affecting layout flow */
        .kairos-note-wrapper {
          position: absolute;
          top: 0;
          width: 0;
          height: 48px;
          background: rgba(25, 25, 25, 0.7);
          backdrop-filter: blur(32px) saturate(180%);
          border: 0.5px solid rgba(255, 255, 255, 0.15);
          border-radius: 24px;
          opacity: 0;
          pointer-events: none;
          transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
          display: flex;
          align-items: center;
        }

        /* Orientation Logic: Pop direction based on screen side */
        
        /* Left Side: Pop to Right */
        .kairos-island-container.orient-left .kairos-note-wrapper {
          left: 100%;
          margin-left: 12px;
          right: auto;
          margin-right: 0;
        }

        /* Right Side: Pop to Left */
        .kairos-island-container.orient-right .kairos-note-wrapper {
          right: 100%;
          margin-right: 12px;
          left: auto;
          margin-left: 0;
        }

        .kairos-note-wrapper.active {
          width: 320px;
          opacity: 1;
          pointer-events: auto;
        }
        .kairos-drag-handle {
          width: 0;
          opacity: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          color: rgba(255, 255, 255, 0.4);
          margin-right: 0;
          overflow: hidden;
        }
        
        .kairos-drag-handle:hover {
          color: rgba(255, 255, 255, 0.9);
        }

        .kairos-drag-handle:active {
          cursor: grabbing;
        }

        /* Show handle when hovering Orb or Dragging */
        .kairos-orb:hover .kairos-drag-handle,
        .kairos-island-container.dragging .kairos-drag-handle {
          width: 24px;
          opacity: 1;
          margin-right: auto; /* Push icons and labels to the far right */
        }

        /* Orb: The Anchor */
        .kairos-orb {
          position: relative;
          height: 48px;
          width: 48px; 
          background: rgba(10, 10, 10, 0.4);
          backdrop-filter: blur(32px) saturate(210%);
          border: 0.5px solid rgba(255, 255, 255, 0.18);
          border-radius: 24px;
          pointer-events: auto; /* Catch events */
          cursor: pointer; 
          display: flex;
          align-items: center;
          justify-content: center; /* Center icon initially */
          transition: width 0.4s cubic-bezier(0.3, 1.2, 0.3, 1), background 0.3s ease;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          flex-shrink: 0; 
          padding: 0 12px; 
          user-select: none; 
        }
        
        /* Orb Hover Expansion */
        .kairos-island-container:not(.dragging) .kairos-orb:hover,
        .kairos-island-container.dragging .kairos-orb {
          width: 145px; /* Reduced for a more harmonious look */
          background: rgba(20, 20, 20, 0.55);
          justify-content: flex-start; 
          padding-left: 10px;
          padding-right: 14px;
        }
        
        /* Ensure label shows when dragging too */
        .kairos-island-container.dragging .kairos-orb .kairos-orb-label {
          opacity: 1;
          transform: scale(1);
          max-width: 150px; 
          margin-left: 12px;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        /* Note Wrapper: Now sits next to Orb inside the island */
        .kairos-note-wrapper {
          position: relative;
          width: 0;
          height: 48px;
          background: rgba(25, 25, 25, 0.7);
          backdrop-filter: blur(32px) saturate(180%);
          border: 0.5px solid rgba(255, 255, 255, 0.15);
          border-radius: 24px;
          opacity: 0;
          pointer-events: none;
          transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
          display: flex;
          align-items: center;
          /* Removed overflow: hidden so hint can live outside */
          margin-left: -8px; 
        }

        .kairos-note-wrapper.active {
          width: 320px;
          opacity: 1;
          pointer-events: auto;
          margin-left: 0; 
        }
        
        .kairos-orb.active {
          border-color: rgba(0, 242, 255, 0.5);
          box-shadow: 0 0 30px rgba(0, 242, 255, 0.2);
        }

        /* Rest of UI elements... */
        .kairos-orb-icon {
          width: 24px;
          height: 24px;
          min-width: 24px;
          object-fit: contain;
          transition: all 0.4s ease;
        }

        .kairos-orb.active .kairos-orb-icon {
          filter: drop-shadow(0 0 2px #00f2ff);
        }

        .kairos-orb-label {
          margin-left: 0;
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          opacity: 0;
          transform: scale(0.9);
          transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
          max-width: 0; 
        }

        .kairos-orb:hover .kairos-orb-label {
          opacity: 1;
          transform: scale(1);
          max-width: 150px; 
          margin-left: 12px;
          display: flex;
          align-items: center;
          gap: 16px; /* Increased gap between Shutter and Off button */
        }

        /* Power Off Button (Icon Style) */
        .kairos-deactivate-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(255, 50, 50, 0.2);
          color: #ff6b6b;
          border: 1px solid rgba(255, 50, 50, 0.3);
          transition: all 0.2s;
          cursor: pointer;
          pointer-events: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px; /* For emoji/icon */
        }

        .kairos-deactivate-btn:hover {
          background: rgba(255, 50, 50, 0.4);
          color: white;
          border-color: rgba(255, 50, 50, 0.6);
          transform: scale(1.1);
        }

        .kairos-note-icon { display: none; }
        
        .kairos-note-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: white;
          font-size: 16px; /* Slightly larger for clarity */
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          font-weight: 400;
          padding: 0 20px; 
          height: 100%;
          min-width: 100px;
        }

        .kairos-note-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
          font-style: italic;
        }
        
        /* Input Hint: Symbolic */
        .kairos-note-hint {
          position: absolute;
          bottom: -24px; 
          left: 24px; 
          color: rgba(255, 255, 255, 0.4);
          font-size: 10px;
          font-weight: 500;
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace; /* Tech feel for keys */
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transform: translateY(-5px);
          transition: all 0.3s ease 0.1s; 
          letter-spacing: 0.5px;
        }
        
        /* Show hint when active */
        .kairos-note-wrapper.active .kairos-note-hint {
          opacity: 1;
          transform: translateY(0);
        }

        /* Footer Hints (Optional, can add later) */

        /* Ceiling Timeline: Now only a viewer */
        .kairos-timeline-container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 24px; 
          background: transparent;
          pointer-events: none; /* Disable global clicks */
          z-index: 30;
          opacity: 0;
          transition: opacity 0.3s ease;
          overflow: visible;
        }

        /* Show when active */
        .kairos-overlay.active .kairos-timeline-container {
          opacity: 1;
        }

        /* Pins remain interactive */
        .kairos-pin {
          pointer-events: auto;
        }

        /* The Visual Rail: Frosted Glass Fiber */
        .kairos-timeline-rail {
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 4px; 
          transform: translateY(-50%);
          background: rgba(255, 255, 255, 0.15); 
          border-radius: 2px;
          backdrop-filter: blur(4px);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          /* overflow: visible; default */
        }

        /* Hover Effect: Rail "Energizes" */
        .kairos-timeline-container:hover .kairos-timeline-rail {
          height: 6px; 
          background: rgba(255, 255, 255, 0.25);
          box-shadow: 0 0 15px rgba(0, 242, 255, 0.3); /* Subtle glow on hover */
        }

        /* The Progress Beam */
        .kairos-progress-bar {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, transparent 0%, #00f2ff 100%);
          border-radius: 2px;
          position: relative;
        }

        /* The Playhead: Glowing Bead */
        .kairos-progress-bar::after {
          content: '';
          position: absolute;
          right: -4px; /* Center on tip */
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          background: #ffffff;
          border-radius: 50%;
          box-shadow: 
            0 0 10px rgba(255, 255, 255, 1),
            0 0 20px rgba(0, 242, 255, 0.8);
          transition: transform 0.3s ease;
        }

        /* Playhead expands on hover */
        .kairos-timeline-container:hover .kairos-progress-bar::after {
          transform: translateY(-50%) scale(1.5);
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

      // The Visual Rail
      const rail = document.createElement('div');
      rail.className = 'kairos-timeline-rail';

      const progressBar = document.createElement('div');
      progressBar.className = 'kairos-progress-bar';

      rail.appendChild(progressBar); // Bar goes into rail
      timeline.appendChild(rail);    // Rail goes into container

      timeline.addEventListener('click', (e) => this.handleTimelineClick(e));
      overlay.appendChild(timeline);

      // The Intelligent Island Container (Orb + Note)
      const island = document.createElement('div');
      island.className = 'kairos-island-container orient-right'; 
      
      // Initialize Drag Offsets (0 means default CSS position)
      this.xOffset = 0; 
      this.yOffset = 0;
      
      // 1. Drag Handle
      const dragHandle = document.createElement('div');
      dragHandle.className = 'kairos-drag-handle';
      // Vertical dots grip icon
      dragHandle.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M9 3H11V5H9V3ZM13 3H15V5H13V3ZM9 7H11V9H9V7ZM13 7H15V9H13V7ZM9 11H11V13H9V11ZM13 11H15V13H13V11ZM9 15H11V17H9V15ZM13 15H15V17H13V15ZM9 19H11V21H9V19ZM13 19H15V21H13V19Z" />
        </svg>
      `;
      dragHandle.title = 'Drag to move';

      // Attach Drag Logic to Handle
      dragHandle.addEventListener('mousedown', (e) => this.dragStart(e));
      // CRITICAL: Prevent handle clicks from bubbling to Orb and triggering activation/pin
      dragHandle.addEventListener('click', (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
      });

      document.addEventListener('mousemove', (e) => this.drag(e));
      document.addEventListener('mouseup', (e) => this.dragEnd(e));
      
      // Floating orb
      const orb = document.createElement('div');
      orb.className = 'kairos-orb';
      orb.title = 'Activate Kairos'; 

      // Icon Image
      const iconUrl = chrome.runtime.getURL('icons/icon.png');
      const iconImg = document.createElement('img');
      iconImg.src = iconUrl;
      iconImg.className = 'kairos-orb-icon';
      iconImg.draggable = false;


      const labelSpan = document.createElement('span');
      labelSpan.className = 'kairos-orb-label';
      
      const labelText = document.createElement('span');
      labelText.textContent = '⚡'; 
      labelText.title = 'Capture Moment'; 
      this.orbLabelText = labelText; 

      const deactivateBtn = document.createElement('div');
      deactivateBtn.className = 'kairos-deactivate-btn';
      deactivateBtn.textContent = '✕';
      deactivateBtn.title = 'Deactivate Kairos'; 
      deactivateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleDeactivate();
      });

      labelSpan.appendChild(labelText);
      labelSpan.appendChild(deactivateBtn);

      // Construct Orb Content: [Handle, Icon, Label]
      orb.appendChild(dragHandle); // 1. Handle (Left)
      
      // 2. Icon (Middle)
      orb.appendChild(iconImg);

      // 3. Label (Right)
      orb.appendChild(labelSpan);
      
      // Click Logic (No drag on Orb anymore)
      orb.addEventListener('click', (e) => {
          // If a drag just finished, ignore click (handled in dragEnd logic usually, but here separated)
          if (!this.isDragging) this.handleOrbClick();
      });

      // Spotlight Note Input

      const noteWrapper = document.createElement('div');

      noteWrapper.className = 'kairos-note-wrapper';



      const noteInput = document.createElement('input');

      noteInput.className = 'kairos-note-input';

      noteInput.placeholder = '✨ Capture thought...';

      noteInput.type = 'text';



      // Prevent keydown propagation to video player (e.g. 'k' for pause)

      // Block ALL key phases to be safe

      const blockEvent = (e) => {

        e.stopPropagation();

        e.stopImmediatePropagation();

        if (e.type === 'keydown') this.handleNoteKeydown(e);

      };



      noteInput.addEventListener('keydown', blockEvent);

      noteInput.addEventListener('keypress', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });

      noteInput.addEventListener('keyup', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });



      // Stop clicks from bubbling to overlay

      noteWrapper.addEventListener('click', (e) => e.stopPropagation());



      noteWrapper.appendChild(noteInput);



      // Hint Text

      const noteHint = document.createElement('div');

      noteHint.className = 'kairos-note-hint';

      noteHint.textContent = '↵ Save  ⎋ Cancel';

      noteWrapper.appendChild(noteHint);

      // Add members to island
      // dragHandle is now inside orb
      island.appendChild(orb);
      island.appendChild(noteWrapper);
      overlay.appendChild(island);

      // Animation Effect Container (Keep outside island)
      const effectContainer = document.createElement('div');
      effectContainer.className = 'kairos-effect-container';

      const flash = document.createElement('div');
      flash.className = 'kairos-flash';
      effectContainer.appendChild(flash);

      const ripple = document.createElement('div');
      ripple.className = 'kairos-ripple';
      effectContainer.appendChild(ripple);

      overlay.appendChild(effectContainer);

      this.overlayElement = overlay;
      this.dragHandle = dragHandle;
      this.orbElement = orb;
      this.orbLabel = labelSpan;
      this.timeline = timeline;
      this.progressBar = progressBar;
      this.noteWrapper = noteWrapper;
      this.noteInput = noteInput;
      this.pins = [];

      this.shadowRoot.appendChild(overlay);

      // Store references for animation
      this.effectElements = { flash, ripple, glowBorder };
    }

    /* --- Dragging Logic (Robust Delta Approach) --- */

    dragStart(e) {
      if (!this.overlayElement) return;
      // Only allow dragging from the handle
      if (!e.target.closest('.kairos-drag-handle')) return;

      const island = this.shadowRoot.querySelector('.kairos-island-container');
      if (!island) return;

      const overlayRect = this.overlayElement.getBoundingClientRect();
      const islandRect = island.getBoundingClientRect();

      // 1. Calculate current position relative to Overlay
      const currentLeft = islandRect.left - overlayRect.left;
      const currentTop = islandRect.top - overlayRect.top;

      // 2. Freeze position in pixels
      island.style.transition = 'none'; 
      island.style.transform = 'none';  
      island.style.left = `${currentLeft}px`;
      island.style.top = `${currentTop}px`;

      // 3. Store start state
      this.startLeft = currentLeft;
      this.startTop = currentTop;
      this.startX = e.clientX;
      this.startY = e.clientY;
      
      this.isDragging = false; 
      this.activeDrag = true; // Flag to track active drag session

      if (this.dragHandle) this.dragHandle.classList.add('grabbing');
      // Add dragging class immediately to keep menu expanded
      island.classList.add('dragging');
    }

    drag(e) {
      if (!this.activeDrag) return;
      if (!this.overlayElement) return;

      const island = this.shadowRoot.querySelector('.kairos-island-container');
      if (!island) return;

      e.preventDefault();

      // 1. Calculate Delta
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;

      // 2. Threshold Check (for click distinction, though less relevant on handle)
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this.isDragging = true;
      }

      // 3. Apply new position
      let newLeft = this.startLeft + dx;
      let newTop = this.startTop + dy;

      // Boundary Check
      const overlayRect = this.overlayElement.getBoundingClientRect();
      // Width includes handle + orb + expanded label potentially
      // Dynamic width check to prevent overflow
      const islandWidth = island.offsetWidth || 180; 
      newLeft = Math.max(0, Math.min(newLeft, overlayRect.width - islandWidth));
      newTop = Math.max(0, Math.min(newTop, overlayRect.height - 48));

      island.style.left = `${newLeft}px`;
      island.style.top = `${newTop}px`;
      
      this.updateOrientation(newLeft, overlayRect.width);
    }

    dragEnd(e) {
      if (!this.activeDrag) return;
      
      this.activeDrag = false;
      if (this.dragHandle) this.dragHandle.classList.remove('grabbing');
      
      const island = this.shadowRoot.querySelector('.kairos-island-container');
      if (island) {
          island.classList.remove('dragging');
          // Restore physics/transitions
          island.style.transition = ''; 
      }
      
      // Delay reset to prevent 'click' event from firing immediately after drag release
      setTimeout(() => {
        this.isDragging = false;
      }, 50);
    }

    updateOrientation(currentLeft, containerWidth) {
        if (!this.shadowRoot) return;
        const island = this.shadowRoot.querySelector('.kairos-island-container');
        if (!island) return;
        
        const middle = containerWidth / 2;
        
        if (currentLeft > middle) {
            island.classList.remove('orient-left');
            island.classList.add('orient-right');
        } else {
            island.classList.remove('orient-right');
            island.classList.add('orient-left');
        }
    }

    updateOrientation(currentLeft, containerWidth) {
        if (!this.shadowRoot) return;
        const island = this.shadowRoot.querySelector('.kairos-island-container');
        if (!island) return;
        
        const middle = containerWidth / 2;
        
        if (currentLeft > middle) {
            island.classList.remove('orient-left');
            island.classList.add('orient-right');
        } else {
            island.classList.remove('orient-right');
            island.classList.add('orient-left');
        }
    }

    /**
     * Updates the overlay position based on video rectangle
     */
    updatePosition(rect, video) {
      if (!this.overlayElement) return;

      // Check if video element changed, if so, attach listeners
      if (video && video !== this.videoElement) {
        this.videoElement = video;
        // Remove old listener if exists (not tracking here, but safe to add new)
        // Ideally we track to remove, but for MVP just adding is okay as long as we don't leak too many.
        // Better: just add 'play' listener that calls a bound function.
        video.addEventListener('play', () => {
          if (this.noteWrapper && this.noteWrapper.classList.contains('active')) {
            this.closeNoteInput();
          }
        });
      }
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
     * Handles click on the Orb. 
     * If inactive: Activates Kairos.
     * If active: Captures the current moment (Shutter Mode).
     */
    handleOrbClick() {
      if (!this.effectElements) {
        log('Animation elements missing.');
        return;
      }

      const { flash, ripple, glowBorder } = this.effectElements;

      if (!this.isActive) {
        // --- ACTIVATE ---
        log('Activating Kairos (Apple Intelligence style)...');
        this.isActive = true;

        // 1. Reset all animations
        flash.classList.remove('animating');
        ripple.classList.remove('animating');
        ripple.classList.remove('reversing');
        glowBorder.classList.remove('active');

        // 2. Update Orb State
        if (this.orbElement) {
          this.orbElement.classList.add('active');
          this.orbElement.title = 'Capture Moment';
        }
        if (this.orbLabelText) this.orbLabelText.textContent = '📌';

        // Show Timeline
        if (this.overlayElement) this.overlayElement.classList.add('active');

        // Force reflow
        void flash.offsetWidth;

        // 3. Start Activation Animations
        flash.classList.add('animating');
        ripple.classList.add('animating');

        // Activate the border
        glowBorder.classList.add('active');
      } else {
        // --- CAPTURE (SHUTTER MODE) ---
        log('Capturing current moment...');

        if (!this.videoElement) return;

        const duration = this.videoElement.duration;
        if (!duration) return;

        const percentage = (this.videoElement.currentTime / duration) * 100;

        // Trigger a subtle flash to indicate capture
        flash.classList.remove('animating');
        void flash.offsetWidth;
        flash.classList.add('animating');

        // Create Pin and Open Input
        const pinData = this.createPin(percentage);
        this.openNoteInput(pinData);
      }
    }

    /**
     * Handles Deactivation (Power Off)
     */
    handleDeactivate() {
      if (!this.isActive) return;

      log('Deactivating Kairos...');
      const { ripple, glowBorder } = this.effectElements;

      this.isActive = false;

      // 1. Fade out the border and Hide Timeline
      glowBorder.classList.remove('active');
      if (this.overlayElement) this.overlayElement.classList.remove('active');

      // Ensure note input is closed
      this.closeNoteInput(true); // Force close on deactivation

      // 2. Update Orb State
      if (this.orbElement) {
        this.orbElement.classList.remove('active');
        this.orbElement.title = 'Activate Kairos';
      }
      if (this.orbLabelText) this.orbLabelText.textContent = '⚡';

      // 3. Trigger "Reverse" Ripple (Contract)
      ripple.classList.remove('animating');
      ripple.classList.remove('reversing');
      void ripple.offsetWidth;
      ripple.classList.add('reversing');
    }

    /**
     * Handles keydown events in the note input
     */
    handleNoteKeydown(e) {
      // Aggressively prevent YouTube/Bilibili shortcuts
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.key === 'Enter') {
        this.saveNote();
      } else if (e.key === 'Escape') {
        this.closeNoteInput();
      }
    }

        /**
         * Opens the note input/preview
         * @param {Object} pinData The pin data
         * @param {Boolean} isEdit Whether to enter edit mode (pause + focus)
         */
        openNoteInput(pinData, isEdit = false) {
          if (!this.noteWrapper || !this.noteInput) return;
    
          this.activePin = pinData;
          this.noteInput.value = pinData.note || '';
          this.isEditing = isEdit;
    
          this.noteWrapper.classList.add('active');
    
      // Global ESC for Edit mode only
      if (isEdit) {
        // ... (existing ESC logic) ...
        
        // Add Click Outside Listener to Save & Close
        if (!this.clickOutsideListener) {
            this.clickOutsideListener = (e) => {
                // If click target is NOT inside note wrapper and NOT the pin that opened it
                if (!this.noteWrapper.contains(e.target) && !e.target.classList.contains('kairos-pin')) {
                    this.saveNote(); // Auto-save on click away
                }
            };
            // Use capture to ensure we catch clicks on video/other elements
            document.addEventListener('click', this.clickOutsideListener, true);
        }
      }
    
          log(isEdit ? 'Editing note' : 'Previewing note', 'at', pinData.timestamp);
        }    /**
     * Loads notes for the current video and renders pins
     */
    async loadNotesForCurrentVideo() {
      const info = Utils.getVideoInfo();
      this.currentVideoId = info.videoId;

      log('Loading notes for:', this.currentVideoId);

      // Clear existing pins from DOM and memory
      if (this.pins) {
        this.pins.forEach(p => p.element.remove());
      }
      this.pins = [];

      try {
        const savedNotes = await this.storage.getNotesForVideo(this.currentVideoId);
        savedNotes.forEach(noteData => {
          this.renderPin(noteData);
        });
        log(`Loaded ${savedNotes.length} notes.`);
      } catch (err) {
        log('Failed to load notes:', err);
      }
    }

    /**
     * Renders a pin from saved data
     */
    renderPin(noteData) {
      const pin = document.createElement('div');
      pin.className = 'kairos-pin';
      pin.style.left = `${noteData.percentage}%`;

      this.timeline.appendChild(pin);

      const pinData = {
        ...noteData,
        note: noteData.content, // Fix: Map DB 'content' field to internal 'note' field
        element: pin
      };

      this.pins.push(pinData);

      // --- Interaction Listeners ---
      
      // 1. Hover to Preview
      pin.addEventListener('mouseenter', () => {
        if (!this.isEditing) this.openNoteInput(pinData, false);
      });

      // 2. Leave to Hide
      pin.addEventListener('mouseleave', () => {
        this.closeNoteInput(false); // Don't force, so it stays if editing
      });

      // 3. Click to Jump & Edit
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Seek video to this moment
        if (this.videoElement) {
          this.videoElement.currentTime = pinData.timestamp;
        }

        this.openNoteInput(pinData, true);
      });
    }

    /**
     * Saves the current note and persists to Storage
     */
    async saveNote() {
      const content = this.noteInput.value.trim();

      if (this.activePin) {
        // Update memory
        this.activePin.note = content;

        // Prepare Data for Storage
        const info = Utils.getVideoInfo();
        const noteRecord = {
          id: this.activePin.id || Utils.generateId(),
          videoId: info.videoId,
          videoUrl: info.url,
          videoTitle: info.title,
          content: content,
          timestamp: this.activePin.timestamp,
          timeLabel: Utils.formatTime(this.activePin.timestamp),
          percentage: this.activePin.percentage,
          createdAt: this.activePin.createdAt || Date.now()
        };

        // Persist
        try {
          await this.storage.saveNote(noteRecord);
          this.activePin.id = noteRecord.id; // Ensure memory has ID for future updates
          log('Note persisted');
        } catch (err) {
          log('Failed to persist note:', err);
        }
      }

      this.isEditing = false;
      this.closeNoteInput(true); // Force close
    }

    /**
     * Closes the note input
     * @param {Boolean} force If true, ignores isEditing state
     */
    closeNoteInput(force = false) {
      if (!this.noteWrapper || (!force && this.isEditing)) return;

      this.noteWrapper.classList.remove('active');
      this.noteInput.blur();
      
      // Resume video if it was playing and we are leaving edit mode
      if (this.isEditing && this.wasPlaying && this.videoElement) {
        this.videoElement.play();
      }
      
      this.activePin = null;
      this.isEditing = false;

      // Remove Global ESC Listener
      if (this.escListener) {
        document.removeEventListener('keydown', this.escListener, true);
        this.escListener = null;
      }

      // Remove Click Outside Listener
      if (this.clickOutsideListener) {
        document.removeEventListener('click', this.clickOutsideListener, true);
        this.clickOutsideListener = null;
      }
    }

    /**
     * Handles clicks on the timeline area
     */
    handleTimelineClick(e) {
      // Disabled in Shutter Mode to prevent accidental jumps
      e.stopPropagation();
      log('Timeline click ignored (Use Orb to capture)');
    }

    /**
     * Creates a visual pin on the timeline
     */
    createPin(percentage) {
      const id = Utils.generateId();
      const pin = document.createElement('div');
      pin.className = 'kairos-pin';
      pin.style.left = `${percentage}%`;

      this.timeline.appendChild(pin);

      const pinData = {
        id: id,
        element: pin,
        percentage: percentage,
        timestamp: this.videoElement ? this.videoElement.currentTime : 0,
        note: '',
        createdAt: Date.now()
      };

      this.pins.push(pinData);

      // --- Interaction Listeners ---
      
      pin.addEventListener('mouseenter', () => {
        if (!this.isEditing) this.openNoteInput(pinData, false);
      });
      
      pin.addEventListener('mouseleave', () => {
        this.closeNoteInput(false);
      });

      pin.addEventListener('click', (e) => {
        e.stopPropagation();

        // Seek video to this moment
        if (this.videoElement) {
          this.videoElement.currentTime = pinData.timestamp;
        }

        this.openNoteInput(pinData, true);
      });

      return pinData;
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
