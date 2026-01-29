/**
 * Kairos Overlay Manager Module
 * Manages the floating overlay UI including orb, timeline, and note input
 */

(function () {
  'use strict';

  const { CONFIG, log, Utils, StorageManager, getStyles, CaptureEngine, SimpleMarkdown } = window.Kairos;

  /**
   * OverlayManager class - Manages the floating overlay UI
   */
  class OverlayManager {
    constructor() {
      this.container = null;
      this.shadowRoot = null;
      this.overlayElement = null;
      this.isActive = false;
      this.escListener = null;
      this.storage = new StorageManager();
      this.captureEngine = new CaptureEngine();
      this.currentVideoId = null;
      this.sidePanel = null; // Reference to SidePanelManager
      this.agent = null; // Reference to ProactiveAgent

      // Interaction States
      this.activePin = null;
      this.isEditing = false;
      this.wasPlaying = false;
      this.positionLoaded = false;
      this.scanAnimationTimer = null; // Timer for AI scanning animation
      this.timelineScaleRendered = false; // Flag for timeline scale rendering
      this.isDraggingTimeline = false; // Flag for timeline dragging
      this.capturingState = false; // Flag for capture-phase state (debouncing play events)
    }

    /**
     * Initializes the overlay with Shadow DOM for style isolation
     */
    async init() {
      await this.storage.init();

      this.container = document.createElement('div');
      this.container.id = CONFIG.OVERLAY_ID;

      this.shadowRoot = this.container.attachShadow({ mode: 'open' });

      this.injectStyles();
      this.createOverlay();

      document.body.appendChild(this.container);

      // Listen for note deletion events from sidepanel
      window.addEventListener('kairos-note-deleted', (e) => {
        const { noteId } = e.detail;
        this.removePinByNoteId(noteId);
      });

      log('Overlay initialized');
    }

    /**
     * Injects CSS styles into Shadow DOM
     */
    injectStyles() {
      const style = document.createElement('style');
      style.textContent = getStyles();
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

      const rail = document.createElement('div');
      rail.className = 'kairos-timeline-rail';

      const progressBar = document.createElement('div');
      progressBar.className = 'kairos-progress-bar';

      // Ticks Container for time scale
      const ticksContainer = document.createElement('div');
      ticksContainer.className = 'kairos-ticks-container';

      rail.appendChild(progressBar);
      timeline.appendChild(rail);
      timeline.appendChild(ticksContainer);

      timeline.addEventListener('click', (e) => this.handleTimelineClick(e));
      timeline.addEventListener('mousedown', (e) => this.handleTimelineMouseDown(e));
      overlay.appendChild(timeline);

      // The Intelligent Island Container (Orb + Note)
      const island = document.createElement('div');
      island.className = 'kairos-island-container orient-top';

      // Initialize Drag Offsets
      this.xOffset = 0;
      this.yOffset = 0;

      // Drag Handle
      const dragHandle = document.createElement('div');
      dragHandle.className = 'kairos-drag-handle';
      dragHandle.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M9 3H11V5H9V3ZM13 3H15V5H13V3ZM9 7H11V9H9V7ZM13 7H15V9H13V7ZM9 11H11V13H9V11ZM13 11H15V13H13V11ZM9 15H11V17H9V15ZM13 15H15V17H13V15ZM9 19H11V21H9V19ZM13 19H15V21H13V19Z" />
        </svg>
      `;
      dragHandle.title = 'Drag to move';

      dragHandle.addEventListener('mousedown', (e) => this.dragStart(e));
      dragHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      });

      document.addEventListener('mousemove', (e) => this.drag(e));
      document.addEventListener('mouseup', (e) => this.dragEnd(e));

      // Floating orb
      const orb = document.createElement('div');
      orb.className = 'kairos-orb';
      orb.title = 'Click to expand menu';

      const iconUrl = chrome.runtime.getURL('icons/icon.png');
      const iconImg = document.createElement('img');
      iconImg.src = iconUrl;
      iconImg.className = 'kairos-orb-icon';
      iconImg.draggable = false;

      // Expanded Menu Container (Move - Orb - Pin)
      const orbMenu = document.createElement('div');
      orbMenu.className = 'kairos-orb-menu';

      // Move Button (drag handle styled as button)
      orb.appendChild(dragHandle);

      // Center Orb Icon Button (click to collapse)
      const orbIconBtn = document.createElement('button');
      orbIconBtn.className = 'kairos-orb-btn orb-icon-btn';
      orbIconBtn.title = 'Click to collapse';
      const orbIconImg = document.createElement('img');
      orbIconImg.src = iconUrl;
      orbIconImg.draggable = false;
      orbIconBtn.appendChild(orbIconImg);
      orbIconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapseOrb();
      });

      // Pin Button
      const pinBtn = document.createElement('button');
      pinBtn.className = 'kairos-orb-btn pin-btn';
      pinBtn.innerHTML = '📌';
      pinBtn.title = 'Capture Moment';
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handlePinCapture();
      });

      orbMenu.appendChild(orbIconBtn);
      orbMenu.appendChild(pinBtn);

      orb.appendChild(iconImg);
      orb.appendChild(orbMenu);

      orb.addEventListener('click', (e) => {
        if (!this.isDragging && !orb.classList.contains('expanded')) {
          this.expandOrb();
        }
      });

      // Spotlight Note Input
      const noteWrapper = document.createElement('div');
      noteWrapper.className = 'kairos-note-wrapper';

      // Markdown Preview Div
      const notePreview = document.createElement('div');
      notePreview.className = 'kairos-note-preview hidden';
      notePreview.title = 'Click to edit';

      notePreview.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchToEditMode();
      });

      const noteInput = document.createElement('textarea');
      noteInput.className = 'kairos-note-input';
      noteInput.placeholder = 'Type note, or Enter for AI ✨';
      noteInput.rows = 1;

      const blockEvent = (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.type === 'keydown') this.handleNoteKeydown(e);
      };

      noteInput.addEventListener('keydown', blockEvent);
      noteInput.addEventListener('input', () => this.adjustInputHeight());
      noteInput.addEventListener('keypress', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });
      noteInput.addEventListener('keyup', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });

      // When blurring (and not clicking something else in the UI), switch to view
      // We don't do this on simple blur because it might be annoying if user clicks away to copy text
      // but let's try it for "read mode" feel.
      // noteInput.addEventListener('blur', () => {
      //   if (this.noteInput.value.trim()) this.switchToViewMode();
      // });

      noteWrapper.addEventListener('click', (e) => e.stopPropagation());

      noteWrapper.appendChild(notePreview);
      noteWrapper.appendChild(noteInput);

      // Action buttons container (Save & Cancel)
      const noteActions = document.createElement('div');
      noteActions.className = 'kairos-note-actions';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'kairos-note-action-btn save-btn';
      saveBtn.innerHTML = '✓';
      saveBtn.title = 'Save (⌘↵)';
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.saveNote();
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'kairos-note-action-btn cancel-btn';
      cancelBtn.innerHTML = '✕';
      cancelBtn.title = 'Cancel (⎋)';
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelNote();
      });

      noteActions.appendChild(saveBtn);
      noteActions.appendChild(cancelBtn);
      noteWrapper.appendChild(noteActions);

      island.appendChild(orb);
      // noteWrapper moved to overlay for spatial positioning
      overlay.appendChild(island);
      overlay.appendChild(noteWrapper);

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

      // Spatial Marker Container
      const spatialLayer = document.createElement('div');
      spatialLayer.className = 'kairos-spatial-layer';
      spatialLayer.style.cssText = 'position: absolute; inset: 0; pointer-events: none; overflow: hidden;';
      overlay.appendChild(spatialLayer);

      this.overlayElement = overlay;
      this.spatialLayer = spatialLayer;
      this.dragHandle = dragHandle;
      this.orbElement = orb;
      this.orbMenu = orbMenu;
      this.timeline = timeline;
      this.progressBar = progressBar;
      this.ticksContainer = ticksContainer;
      this.noteWrapper = noteWrapper;
      this.noteInput = noteInput;
      this.notePreview = notePreview;
      this.pins = [];
      this.spatialMarkers = [];

      this.shadowRoot.appendChild(overlay);

      this.effectElements = { flash, ripple, glowBorder };

      // Global capture-phase double click listener to intercept video fullscreen toggle
      // We bind this once and checking bounds inside
      this.boundGlobalDblClick = (e) => this.handleGlobalDoubleClick(e);
      document.addEventListener('dblclick', this.boundGlobalDblClick, true);

      // Global double-click K listener
      this.lastKPress = 0;
      this.kPressTimeout = null;
      window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'k' && !this.isEditing) {
          const now = Date.now();
          if (now - this.lastKPress < 400) {
            // Double click K detected
            e.preventDefault();
            e.stopPropagation();
            clearTimeout(this.kPressTimeout);
            this.handlePinCapture();
            this.lastKPress = 0;
          } else {
            this.lastKPress = now;
            // Optional: single K behavior could be different or ignored for a moment
            this.kPressTimeout = setTimeout(() => {
              this.lastKPress = 0;
            }, 400);
          }
        }
      }, true);
    }

    /* --- Dragging Logic --- */

    /**
     * Handles drag start event
     * @param {MouseEvent} e - Mouse event
     */
    dragStart(e) {
      if (!this.overlayElement) return;
      if (!e.target.closest('.kairos-drag-handle')) return;

      const island = this.shadowRoot.querySelector('.kairos-island-container');
      const orb = this.shadowRoot.querySelector('.kairos-orb');
      if (!island || !orb) return;

      const overlayRect = this.overlayElement.getBoundingClientRect();
      const orbRect = orb.getBoundingClientRect();

      const orbLeft = orbRect.left - overlayRect.left;
      const orbTop = orbRect.top - overlayRect.top;

      island.style.transition = 'none';
      island.style.transform = 'none';
      island.style.right = 'auto';
      island.style.left = `${orbLeft}px`;
      island.style.top = `${orbTop}px`;

      this.startLeft = orbLeft;
      this.startTop = orbTop;
      this.startX = e.clientX;
      this.startY = e.clientY;

      this.isDragging = false;
      this.activeDrag = true;

      if (this.dragHandle) this.dragHandle.classList.add('grabbing');
      island.classList.add('dragging');
      island.classList.add('positioned');
    }

    /**
     * Handles drag movement
     * @param {MouseEvent} e - Mouse event
     */
    drag(e) {
      if (!this.activeDrag) return;
      if (!this.overlayElement) return;

      const island = this.shadowRoot.querySelector('.kairos-island-container');
      const orb = this.shadowRoot.querySelector('.kairos-orb');
      if (!island || !orb) return;

      e.preventDefault();

      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.isDragging = true;
      }

      let newLeft = this.startLeft + dx;
      let newTop = this.startTop + dy;

      const overlayRect = this.overlayElement.getBoundingClientRect();
      const orbWidth = orb.offsetWidth;
      const orbHeight = orb.offsetHeight;
      const BOTTOM_SAFE_MARGIN = 80;
      newLeft = Math.max(0, Math.min(newLeft, overlayRect.width - orbWidth));
      newTop = Math.max(0, Math.min(newTop, overlayRect.height - orbHeight - BOTTOM_SAFE_MARGIN));

      island.style.left = `${newLeft}px`;
      island.style.top = `${newTop}px`;

      if (this.noteWrapper.classList.contains('active')) {
        this.updateNoteAlignment(this.activePin, overlayRect.width, overlayRect.height);
      }

      this.updateOrientation(newTop, overlayRect.height, newLeft, overlayRect.width);
    }

    /**
     * Handles drag end event
     * @param {MouseEvent} e - Mouse event
     */
    dragEnd(e) {
      if (!this.activeDrag) return;

      this.activeDrag = false;
      if (this.dragHandle) this.dragHandle.classList.remove('grabbing');

      const island = this.shadowRoot.querySelector('.kairos-island-container');
      const orb = this.shadowRoot.querySelector('.kairos-orb');
      if (island && orb && this.overlayElement) {
        island.classList.remove('dragging');

        const overlayRect = this.overlayElement.getBoundingClientRect();
        const orbRect = orb.getBoundingClientRect();

        let currentLeft = orbRect.left - overlayRect.left;
        let currentTop = orbRect.top - overlayRect.top;

        const collapsedSize = 48;
        const maxLeft = overlayRect.width - collapsedSize;
        const maxTop = overlayRect.height - collapsedSize;

        if (currentLeft > maxLeft || currentTop > maxTop) {
          currentLeft = Math.min(currentLeft, maxLeft);
          currentTop = Math.min(currentTop, maxTop);
          island.style.left = `${currentLeft}px`;
          island.style.top = `${currentTop}px`;
        }

        island.style.transition = '';
        this.updateOrientation(currentTop, overlayRect.height, currentLeft, overlayRect.width);

        // Save relative position if actually dragged
        if (this.isDragging) {
          this.saveOrbPosition(currentLeft, currentTop, overlayRect.width, overlayRect.height);
        }
      }

      setTimeout(() => {
        this.isDragging = false;
      }, 50);
    }

    /**
     * Saves the Orb position as relative coordinates (0-1)
     * @param {number} left - Left position in pixels
     * @param {number} top - Top position in pixels
     * @param {number} containerWidth - Container width
     * @param {number} containerHeight - Container height
     */
    saveOrbPosition(left, top, containerWidth, containerHeight) {
      const relativeX = left / containerWidth;
      const relativeY = top / containerHeight;

      const position = { x: relativeX, y: relativeY };

      // Cache in memory for resize handling
      this.savedOrbPosition = position;

      chrome.storage.local.set({ orbPosition: position }, () => {
        // log('Orb position saved:', position);
      });
    }

    /**
     * Loads and applies saved Orb position
     */
    async loadOrbPosition() {
      return new Promise((resolve) => {
        chrome.storage.local.get(['orbPosition'], (result) => {
          if (result.orbPosition) {
            // Cache in memory for resize handling
            this.savedOrbPosition = result.orbPosition;
            this.applySavedPosition(result.orbPosition);
            resolve(result.orbPosition);
          } else {
            resolve(null);
          }
        });
      });
    }

    /**
     * Applies saved relative position to current video dimensions
     * @param {Object} position - Saved position {x, y} as ratios (0-1)
     */
    applySavedPosition(position) {
      if (!this.overlayElement || !this.shadowRoot) return;

      const island = this.shadowRoot.querySelector('.kairos-island-container');
      const orb = this.shadowRoot.querySelector('.kairos-orb');
      if (!island || !orb) return;

      const overlayRect = this.overlayElement.getBoundingClientRect();
      const orbWidth = orb.offsetWidth || 48;
      const orbHeight = orb.offsetHeight || 48;
      const BOTTOM_SAFE_MARGIN = 80;

      // Calculate pixel position from relative coordinates
      let newLeft = position.x * overlayRect.width;
      let newTop = position.y * overlayRect.height;

      // Clamp to valid bounds
      newLeft = Math.max(0, Math.min(newLeft, overlayRect.width - orbWidth));
      newTop = Math.max(0, Math.min(newTop, overlayRect.height - orbHeight - BOTTOM_SAFE_MARGIN));

      // Apply position
      island.style.left = `${newLeft}px`;
      island.style.top = `${newTop}px`;
      island.classList.add('positioned');

      this.updateOrientation(newTop, overlayRect.height, newLeft, overlayRect.width);
      log('Orb position restored:', { left: newLeft, top: newTop });
    }

    /**
     * Updates note orientation based on Y position and icon flip based on X position
     * @param {number} currentTop - Current top position
     * @param {number} containerHeight - Container height
     * @param {number} currentLeft - Current left position (optional)
     * @param {number} containerWidth - Container width (optional)
     */
    updateOrientation(currentTop, containerHeight, currentLeft, containerWidth) {
      if (!this.shadowRoot) return;
      const island = this.shadowRoot.querySelector('.kairos-island-container');
      const orb = this.shadowRoot.querySelector('.kairos-orb');
      if (!island) return;

      // Update vertical orientation (top/bottom)
      const positionRatio = currentTop / containerHeight;

      if (positionRatio > 0.6) {
        island.classList.remove('orient-bottom');
        island.classList.add('orient-top');
      } else {
        island.classList.remove('orient-top');
        island.classList.add('orient-bottom');
      }

      // Update horizontal orientation (flip icon based on left/right position)
      if (orb && currentLeft !== undefined && containerWidth !== undefined) {
        const orbWidth = orb.offsetWidth || 48;
        const orbCenterX = currentLeft + orbWidth / 2;
        const horizontalRatio = orbCenterX / containerWidth;

        if (horizontalRatio > 0.5) {
          // Right half - normal icon
          orb.classList.remove('flip-icon');
        } else {
          // Left half - flip icon
          orb.classList.add('flip-icon');
        }
      }
    }

    /**
     * Updates the overlay position based on video rectangle
     * @param {DOMRect} rect - Video bounding rectangle
     * @param {HTMLVideoElement} video - Video element
     */
    updatePosition(rect, video) {
      if (!this.overlayElement) return;

      const isNewVideo = video && video !== this.videoElement;
      if (isNewVideo) {
        this.videoElement = video;
        video.addEventListener('play', () => {
          // If we are in the middle of a capture (dblclick), ignore the play event
          // and enforce pause. This fixes issues where previous clicks (before dblclick)
          // toggle the video state (e.g. Bilibili).
          if (this.capturingState) {
            log('Play event intercepted during capture. Enforcing pause.');
            video.pause();
            this.wasPlaying = true; // Confirm we should resume later
            return;
          }

          if (this.noteWrapper && this.noteWrapper.classList.contains('active')) {
            this.closeNoteInput();
          }
        });
      }
      this.videoElement = video;

      // Detect size change
      const prevWidth = this.lastOverlayWidth || 0;
      const prevHeight = this.lastOverlayHeight || 0;
      const sizeChanged = Math.abs(rect.width - prevWidth) > 5 || Math.abs(rect.height - prevHeight) > 5;

      this.overlayElement.style.top = `${rect.top}px`;
      this.overlayElement.style.left = `${rect.left}px`;
      this.overlayElement.style.width = `${rect.width}px`;
      this.overlayElement.style.height = `${rect.height}px`;

      // Load saved position on first update
      if (!this.positionLoaded) {
        this.positionLoaded = true;
        this.loadOrbPosition();
      } else if (sizeChanged && this.savedOrbPosition) {
        // Re-apply saved position when size changes (e.g., fullscreen toggle)
        this.applySavedPosition(this.savedOrbPosition);
      }

      // Store current size for comparison
      this.lastOverlayWidth = rect.width;
      this.lastOverlayHeight = rect.height;

      if (this.isActive && this.progressBar && video && video.duration) {
        // Render timeline scale once when duration is available
        if (!this.timelineScaleRendered) {
          this.renderTimelineScale(video.duration);
          this.timelineScaleRendered = true;
        }

        const progress = (video.currentTime / video.duration) * 100;
        this.progressBar.style.width = `${progress}%`;

        // Update bubble timestamp
        const currentTime = Math.floor(video.currentTime);
        const minutes = Math.floor(currentTime / 60);
        const seconds = currentTime % 60;
        this.progressBar.setAttribute('data-time', `${minutes}:${seconds.toString().padStart(2, '0')}`);

        this.updateSpatialMarkers(video.currentTime);
      }

      this.enforceIslandBounds(rect.width, rect.height);
    }

    /**
     * Renders smart time ticks on the timeline based on video duration
     * @param {number} duration - Video duration in seconds
     */
    renderTimelineScale(duration) {
      if (!this.ticksContainer) return;

      this.ticksContainer.innerHTML = '';
      
      // Determine interval based on duration
      // Target around 8-12 major ticks
      let interval = 60; // Default 1 min
      let chompSpeed = 0.25; // Default speed

      if (duration < 300) {
        interval = 30;        // < 5m: 30s
        chompSpeed = 0.15;    // Fast chomp
      }
      else if (duration < 600) interval = 60;    // < 10m: 1m
      else if (duration < 1800) interval = 120;  // < 30m: 2m
      else if (duration < 3600) {
        interval = 300;       // < 1h: 5m
        chompSpeed = 0.4;     // Slow chomp
      }
      else if (duration < 7200) {
        interval = 600;       // < 2h: 10m
        chompSpeed = 0.5;     // Very slow chomp
      }
      else {
        interval = 900;       // > 2h: 15m
        chompSpeed = 0.6;     // Lazy chomp
      }

      // Apply dynamic chomp speed
      if (this.progressBar) {
        this.progressBar.style.setProperty('--chomp-speed', `${chompSpeed}s`);
      }

      const totalTicks = Math.floor(duration / interval);

      for (let i = 0; i <= totalTicks; i++) {
        const time = i * interval;
        const percent = (time / duration) * 100;

        // Don't render if too close to the end
        if (percent > 98) continue;

        // Major tick with label
        const tick = document.createElement('div');
        tick.className = 'kairos-tick kairos-tick-major';
        tick.style.left = `${percent}%`;

        // Create label for every tick
        const label = document.createElement('span');
        label.className = 'kairos-tick-label';

        // Format time: "5m", "10m" or "1:30"
        if (interval >= 60) {
            label.textContent = Math.floor(time / 60) + 'm';
        } else {
            label.textContent = time + 's';
        }

        tick.appendChild(label);
        this.ticksContainer.appendChild(tick);

        // Add minor ticks between major ticks
        if (i < totalTicks) {
          const minorTickCount = interval >= 300 ? 5 : (interval >= 60 ? 4 : 3);
          const minorInterval = interval / minorTickCount;

          for (let j = 1; j < minorTickCount; j++) {
            const minorTime = time + (j * minorInterval);
            const minorPercent = (minorTime / duration) * 100;

            if (minorPercent > 98) continue;

            const minorTick = document.createElement('div');
            minorTick.className = 'kairos-tick kairos-tick-minor';
            minorTick.style.left = `${minorPercent}%`;
            this.ticksContainer.appendChild(minorTick);
          }
        }
      }
      
      log(`Rendered timeline scale: ${totalTicks} ticks with ${interval}s interval`);
    }

    /**
     * Updates the visibility of spatial markers based on current video time
     * @param {number} currentTime - Current video time in seconds
     */
    updateSpatialMarkers(currentTime) {
      if (!this.isActive || !this.spatialLayer || !this.pins) {
        if (!this.isActive) this.clearAllSpatialMarkers();
        return;
      }

      const WINDOW = 2; // Visibility window in seconds

      this.pins.forEach(pin => {
        if (pin.spatialX === null || pin.spatialX === undefined) return;

        const timeDiff = Math.abs(currentTime - pin.timestamp);
        const shouldBeVisible = timeDiff < WINDOW || pin.isHovered;

        if (shouldBeVisible && !pin.spatialMarker) {
          this.renderSpatialMarker(pin);
        } else if (!shouldBeVisible && pin.spatialMarker) {
          this.removeSpatialMarker(pin);
        }

        // Update opacity for fade effect
        if (pin.spatialMarker) {
          const opacity = pin.isHovered ? 1 : Math.max(0, 1 - (timeDiff / WINDOW));
          pin.spatialMarker.style.opacity = opacity;
          if (pin.spatialTooltip) pin.spatialTooltip.style.opacity = opacity;
          
          if (opacity > 0) {
            pin.spatialMarker.classList.add('active');
            if (pin.spatialTooltip) pin.spatialTooltip.classList.add('active');
          } else {
            pin.spatialMarker.classList.remove('active');
            if (pin.spatialTooltip) pin.spatialTooltip.classList.remove('active');
          }
        }
      });
    }

    /**
     * Removes all spatial markers from the screen
     */
    clearAllSpatialMarkers() {
      if (!this.pins) return;
      this.pins.forEach(pin => this.removeSpatialMarker(pin));
    }

    /**
     * Removes a pin by note ID
     * @param {string} noteId - Note ID to remove
     */
    removePinByNoteId(noteId) {
      const pinIndex = this.pins.findIndex(p => p.id === noteId);
      if (pinIndex === -1) {
        log(`Pin not found for note ID: ${noteId}`);
        return;
      }

      const pin = this.pins[pinIndex];

      // Remove pin element from DOM
      if (pin.element && pin.element.parentNode) {
        pin.element.parentNode.removeChild(pin.element);
      }

      // Remove spatial marker
      this.removeSpatialMarker(pin);

      // Remove from pins array
      this.pins.splice(pinIndex, 1);

      log(`Pin removed for note ID: ${noteId}`);
    }

    /**
     * Renders a spatial marker (ripple/dot) at the captured coordinates
     * @param {Object} pin - Pin data
     */
    renderSpatialMarker(pin) {
      const marker = document.createElement('div');
      marker.className = 'kairos-spatial-marker';
      marker.style.left = `${pin.spatialX}%`;
      marker.style.top = `${pin.spatialY}%`;

      const tooltip = document.createElement('div');
      tooltip.className = 'kairos-spatial-tooltip';
      tooltip.style.left = `${pin.spatialX}%`;
      tooltip.style.top = `${pin.spatialY}%`;
      tooltip.textContent = pin.note || '';

      this.spatialLayer.appendChild(marker);
      this.spatialLayer.appendChild(tooltip);

      pin.spatialMarker = marker;
      pin.spatialTooltip = tooltip;
    }

    /**
     * Removes a spatial marker from the DOM
     * @param {Object} pin - Pin data
     */
    removeSpatialMarker(pin) {
      if (pin.spatialMarker) {
        pin.spatialMarker.remove();
        pin.spatialMarker = null;
      }
      if (pin.spatialTooltip) {
        pin.spatialTooltip.remove();
        pin.spatialTooltip = null;
      }
    }

    /**
     * Enforces that the island stays within video boundaries
     * @param {number} containerWidth - Container width
     * @param {number} containerHeight - Container height
     */
    enforceIslandBounds(containerWidth, containerHeight) {
      if (this.activeDrag) return;

      const island = this.shadowRoot?.querySelector('.kairos-island-container');
      const orb = this.shadowRoot?.querySelector('.kairos-orb');
      const noteWrapper = this.shadowRoot?.querySelector('.kairos-note-wrapper');
      if (!island || !orb) return;

      const BOTTOM_SAFE_MARGIN = 80;

      if (island.classList.contains('positioned')) {
        const orbRect = orb.getBoundingClientRect();
        const overlayRect = this.overlayElement.getBoundingClientRect();

        const orbLeft = orbRect.left - overlayRect.left;
        const orbTop = orbRect.top - overlayRect.top;
        const orbWidth = orb.offsetWidth;
        const orbHeight = orb.offsetHeight;

        const maxLeft = containerWidth - orbWidth;
        const maxTop = containerHeight - orbHeight - BOTTOM_SAFE_MARGIN;

        let newLeft = orbLeft;
        let newTop = orbTop;
        let needsAdjust = false;

        if (orbLeft < 0) { newLeft = 0; needsAdjust = true; }
        if (orbLeft > maxLeft) { newLeft = maxLeft; needsAdjust = true; }
        if (orbTop < 0) { newTop = 0; needsAdjust = true; }
        if (orbTop > maxTop) { newTop = maxTop; needsAdjust = true; }

        if (needsAdjust) {
          island.style.left = `${newLeft}px`;
          island.style.top = `${newTop}px`;
        }

        if (this.noteWrapper.classList.contains('active')) {
          this.updateNoteAlignment(this.activePin, containerWidth, containerHeight);
        }
      }
    }

    /**
     * Updates note wrapper alignment based on reference point (Orb or Spatial)
     * @param {Object} pinData - The pin data containing spatial info
     * @param {number} containerWidth - Container width
     * @param {number} containerHeight - Container height
     */
    updateNoteAlignment(pinData, containerWidth, containerHeight) {
      if (!this.noteWrapper) return;

      const noteWidth = 320;
      const PADDING = 12;
      const MARGIN = 16;

      let refX, refY, refWidth, refHeight;

      // Determine reference point and dimensions
      if (pinData && pinData.spatialX !== undefined && pinData.spatialX !== null) {
        // Case: Spatial (Double Click)
        refX = (pinData.spatialX / 100) * containerWidth;
        refY = (pinData.spatialY / 100) * containerHeight;
        refWidth = 0;
        refHeight = 0;
      } else {
        // Case: Orb (KK or Pin Button)
        const orb = this.shadowRoot?.querySelector('.kairos-orb');
        const island = this.shadowRoot?.querySelector('.kairos-island-container');
        if (!orb || !island) return;

        const orbRect = orb.getBoundingClientRect();
        const overlayRect = this.overlayElement.getBoundingClientRect();

        refX = orbRect.left - overlayRect.left;
        refY = orbRect.top - overlayRect.top;
        refWidth = orb.offsetWidth;
        refHeight = orb.offsetHeight;
      }

      // Calculate Horizontal Position (Center on refX, but clamp to bounds)
      const centerX = refX + refWidth / 2;
      let left = centerX - noteWidth / 2;

      // Clamp to screen edges
      left = Math.max(MARGIN, Math.min(left, containerWidth - noteWidth - MARGIN));

      // Calculate Vertical Position (Prefer TOP, fallback to BOTTOM)
      const spaceAbove = refY - MARGIN;
      const noteHeightEstimate = this.noteWrapper.offsetHeight || 100;

      let top;
      if (spaceAbove > noteHeightEstimate + PADDING) {
        // Place Above
        top = refY - noteHeightEstimate - PADDING;
        this.noteWrapper.style.transformOrigin = 'center bottom';
      } else {
        // Place Below
        top = refY + refHeight + PADDING;
        this.noteWrapper.style.transformOrigin = 'center top';
      }

      // Clamp vertical to bounds
      top = Math.max(MARGIN, Math.min(top, containerHeight - noteHeightEstimate - MARGIN - 60));

      this.noteWrapper.style.left = `${left}px`;
      this.noteWrapper.style.top = `${top}px`;
      this.noteWrapper.style.right = 'auto';
      this.noteWrapper.style.bottom = 'auto';
    }

    /**
     * Expands the Orb to show menu (activates Kairos)
     */
    expandOrb() {
      if (!this.orbElement || !this.effectElements) return;

      log('Expanding Orb (Activating Kairos)...');
      const { flash, ripple, glowBorder } = this.effectElements;

      this.isActive = true;
      this.orbElement.classList.add('expanded');
      this.orbElement.classList.add('active');
      this.orbElement.title = 'Kairos Active';

      if (this.overlayElement) this.overlayElement.classList.add('active');

      // Notify agent about activation
      if (this.agent && this.agent.onActivate) {
        this.agent.onActivate();
      }

      // Animation effects
      flash.classList.remove('animating');
      ripple.classList.remove('animating');
      ripple.classList.remove('reversing');
      glowBorder.classList.remove('active');

      void flash.offsetWidth;

      flash.classList.add('animating');
      ripple.classList.add('animating');
      glowBorder.classList.add('active');
    }

    /**
     * Collapses the Orb to single icon (deactivates Kairos)
     */
    collapseOrb() {
      if (!this.orbElement || !this.effectElements) return;

      log('Collapsing Orb (Deactivating Kairos)...');
      const { ripple, glowBorder } = this.effectElements;

      this.isActive = false;
      this.orbElement.classList.remove('expanded');
      this.orbElement.classList.remove('active');
      this.orbElement.title = 'Click to expand menu';

      glowBorder.classList.remove('active');
      if (this.overlayElement) this.overlayElement.classList.remove('active');

      this.closeNoteInput(true);
      this.clearAllSpatialMarkers();

      // Reverse ripple animation
      ripple.classList.remove('animating');
      ripple.classList.remove('reversing');
      void ripple.offsetWidth;
      ripple.classList.add('reversing');
    }

    /**
     * Handles global double click to intercept video player events
     * @param {MouseEvent} e - Mouse event
     */
    handleGlobalDoubleClick(e) {
      // Only intercept if Kairos is active
      if (!this.isActive || !this.overlayElement || !this.videoElement) return;

      const rect = this.overlayElement.getBoundingClientRect();
      
      // Check if click is inside the overlay bounds
      const isInsideOverlay = 
        e.clientX >= rect.left && 
        e.clientX <= rect.right && 
        e.clientY >= rect.top && 
        e.clientY <= rect.bottom;

      if (isInsideOverlay) {
        // STOP propagation to prevent native fullscreen toggle
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Calculate relative coordinates
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        log('Spatial capture triggered at:', { x: x.toFixed(1) + '%', y: y.toFixed(1) + '%' });

        // Visual Feedback: Spatial Ripple
        this.createSpatialRipple(e.clientX - rect.left, e.clientY - rect.top);

        // Trigger Pin Capture with spatial context
        this.handlePinCapture({ spatialX: x, spatialY: y });
      }
    }

    /**
     * Creates a ripple effect at specific coordinates
     * @param {number} x - Left in pixels
     * @param {number} y - Top in pixels
     */
    createSpatialRipple(x, y) {
      const ripple = document.createElement('div');
      ripple.className = 'kairos-spatial-ripple';
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      this.overlayElement.appendChild(ripple);
      setTimeout(() => ripple.remove(), 800);
    }

    /**
     * Handles Pin capture button click
     * @param {Object} spatialContext - Optional spatial coordinates {spatialX, spatialY}
     */
    async handlePinCapture(spatialContext = null) {
      if (!this.videoElement) return;

      log('Capturing current moment...');
      const { flash } = this.effectElements;

      const duration = this.videoElement.duration;
      if (!duration) return;

      const percentage = (this.videoElement.currentTime / duration) * 100;

      // Visual Feedback
      flash.classList.remove('animating');
      void flash.offsetWidth;
      flash.classList.add('animating');

      // Set capturing state to intercept potential 'play' events from race conditions
      // (e.g. Bilibili double-click vs single-click toggle conflict)
      this.capturingState = true;
      setTimeout(() => { this.capturingState = false; }, 600);

      // Pause video on capture to maintain focus (Granola style)
      if (!this.videoElement.paused) {
        this.videoElement.pause();
        this.wasPlaying = true;
      } else {
        // Reset wasPlaying if paused (fix for bug where it auto-played after being paused)
        this.wasPlaying = false;
      }

      const pinData = this.createPin(percentage);

      // Add spatial coordinates if provided
      if (spatialContext) {
        pinData.spatialX = spatialContext.spatialX;
        pinData.spatialY = spatialContext.spatialY;
      }

      // Capture Frame
      try {
        const screenshot = await this.captureEngine.captureFrame(this.videoElement);
        pinData.imageUrl = screenshot;
        pinData.isAnalyzing = false; // Don't trigger AI yet
        this.openNoteInput(pinData, true);
      } catch (err) {
        log('Capture failed:', err);
        this.openNoteInput(pinData, true);
      }
    }

    /**
     * Handles keydown events in the note input
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleNoteKeydown(e) {
      e.stopPropagation();
      // e.stopImmediatePropagation(); // Allow Enter key processing

      if (e.key === 'Enter') {
        const content = this.noteInput.value.trim();
        
        // If empty and Enter (without modifiers) -> Trigger AI
        if (!content && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          if (this.activePin && this.activePin.imageUrl) {
            log('Empty input + Enter: Triggering AI...');
            this.activePin.isAnalyzing = true;
            this.noteInput.placeholder = '✨ AI is thinking...';
            this.noteInput.classList.add('ai-loading');
            this.requestAIAnalysis(this.activePin, this.activePin.imageUrl);
          }
        } 
        // If meta/ctrl + Enter OR just Enter on non-empty (standard behavior for simple input)
        else if (content && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
          e.preventDefault();
          this.saveNote();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelNote();
      }
    }

    /**
     * Switches the note input to edit mode (textarea)
     */
    switchToEditMode() {
      if (!this.noteInput || !this.notePreview) return;

      this.isEditing = true;
      this.notePreview.classList.add('hidden');
      this.noteInput.classList.remove('hidden');
      this.noteInput.focus();
      this.adjustInputHeight();
    }

    /**
     * Switches the note input to view mode (markdown preview)
     * @param {string} content - Content to render (defaults to input value)
     */
    switchToViewMode(content) {
      if (!this.noteInput || !this.notePreview) return;

      const text = content !== undefined ? content : this.noteInput.value;
      if (!text.trim()) {
        this.switchToEditMode();
        return;
      }

      this.isEditing = false;
      this.noteInput.classList.add('hidden');
      this.notePreview.classList.remove('hidden');
      this.notePreview.innerHTML = SimpleMarkdown.parse(text);

      // Adjust wrapper height to fit preview
      // We can reuse adjustInputHeight logic but for preview
      this.noteWrapper.style.maxHeight = `${Math.min(this.notePreview.scrollHeight, 250) + 40}px`;
    }

    /**
     * Requests AI analysis for a captured frame
     * @param {Object} pinData - The pin data
     * @param {string} screenshot - Base64 screenshot
     */
    async requestAIAnalysis(pinData, screenshot) {
      const videoInfo = Utils.getVideoInfo();

      let context = '';
      if (this.subtitleManager) {
        context = this.subtitleManager.getContext();
        log('Including subtitle context length:', context.length);
      }

      // Store context for persistence
      pinData.context = context;

      // Request AI Analysis
      chrome.runtime.sendMessage({
        type: 'ANALYZE_FRAME',
        payload: {
          image: screenshot,
          videoTitle: videoInfo.title,
          context: context,
          promptType: pinData.spatialX !== undefined ? 'spatial' : 'manual',
          spatialPoint: pinData.spatialX !== undefined ? { x: pinData.spatialX, y: pinData.spatialY } : null
        }
      }, (response) => {
        pinData.isAnalyzing = false;

        if (response && response.success) {
          const aiText = response.data.text;
          pinData.note = aiText;

          // Update UI if this pin is still active in the input
          if (this.activePin === pinData && this.noteInput) {
            this.noteInput.value = aiText;
            this.noteInput.classList.remove('ai-loading');
            this.switchToViewMode(aiText);
          }
        } else {
          log('AI Analysis failed:', response ? response.error : 'Unknown error');
          if (this.activePin === pinData && this.noteInput) {
            this.noteInput.classList.remove('ai-loading');
            this.noteInput.placeholder = 'AI Analysis failed. Type note...';
          }
        }
      });
    }

    /**
     * Adjusts the height of the note input based on content
     */
    adjustInputHeight() {
      if (!this.noteInput || !this.noteWrapper) return;

      // If in preview mode, do nothing (handled by switchToViewMode)
      if (this.noteInput.classList.contains('hidden')) return;

      // Reset height to calculate scrollHeight correctly
      this.noteInput.style.height = 'auto';

      const newHeight = Math.min(this.noteInput.scrollHeight, 180);
      this.noteInput.style.height = `${newHeight}px`;

      // Also update wrapper max-height to avoid clipping during animation
      this.noteWrapper.style.maxHeight = `${newHeight + 40}px`;
    }

    /**
     * Opens the note input/preview
     * @param {Object} pinData - The pin data
     * @param {boolean} isEdit - Whether to enter edit mode
     */
    openNoteInput(pinData, isEdit = false) {
      if (!this.noteWrapper || !this.noteInput) return;

      this.activePin = pinData;
      this.noteInput.value = pinData.note || '';
      this.isEditing = isEdit;

      if (pinData.isAnalyzing) {
        this.noteInput.placeholder = '✨ AI is thinking...';
        this.noteInput.classList.add('ai-loading');
        this.switchToEditMode(); // Show loading input
      } else {
        this.noteInput.placeholder = 'Type note, or Enter for AI ✨';
        this.noteInput.classList.remove('ai-loading');

        if (!isEdit && pinData.note) {
          this.switchToViewMode(pinData.note);
        } else {
          this.switchToEditMode();
        }
      }

      this.noteWrapper.classList.add('active');

      // Update note alignment based on reference (Orb or Spatial)
      if (this.overlayElement) {
        const rect = this.overlayElement.getBoundingClientRect();
        // Delay alignment slightly to allow max-height transition/content rendering for height calc
        setTimeout(() => {
          this.updateNoteAlignment(pinData, rect.width, rect.height);
        }, 10);
      }

      if (this.isEditing) {
        this.noteInput.focus();
      }

      // Register global Esc listener to handle platforms that capture Escape early (e.g., Bilibili)
      if (!this.escListener) {
        this.escListener = (e) => {
          if (e.key === 'Escape' && this.noteWrapper.classList.contains('active')) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.cancelNote();
          }
        };
        document.addEventListener('keydown', this.escListener, true);
      }

      if (isEdit) {
        if (!this.clickOutsideListener) {
          this.clickOutsideListener = (e) => {
            // Use composedPath to correctly detect clicks inside Shadow DOM
            const path = e.composedPath();
            const clickedInsideNote = path.some(el =>
              el === this.noteWrapper ||
              (el.classList && el.classList.contains('kairos-pin'))
            );
            if (!clickedInsideNote) {
              this.saveNote();
            }
          };
          document.addEventListener('click', this.clickOutsideListener, true);
        }
      }

      log(isEdit ? 'Editing note' : 'Previewing note', 'at', pinData.timestamp);
    }

    /**
     * Loads notes for the current video and renders pins
     */
    async loadNotesForCurrentVideo() {
      const info = Utils.getVideoInfo();
      this.currentVideoId = info.videoId;

      log('Loading notes for:', this.currentVideoId);

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
     * @param {Object} noteData - Note data from storage
     */
    renderPin(noteData) {
      const pin = document.createElement('div');
      pin.className = 'kairos-pin';
      pin.style.left = `${noteData.percentage}%`;

      this.timeline.appendChild(pin);

      const pinData = {
        ...noteData,
        note: noteData.content,
        element: pin,
        spatialX: noteData.spatialX,
        spatialY: noteData.spatialY,
        savedToStorage: true
      };

      this.pins.push(pinData);

      pin.addEventListener('mouseenter', () => {
        pinData.isHovered = true;
        if (!this.isEditing) this.openNoteInput(pinData, false);
      });

      pin.addEventListener('mouseleave', () => {
        pinData.isHovered = false;
        this.closeNoteInput(false);
      });

      pin.addEventListener('click', (e) => {
        e.stopPropagation();

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
        this.activePin.note = content;

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
          imageUrl: this.activePin.imageUrl || null,
          context: this.activePin.context || null,
          spatialX: this.activePin.spatialX || null,
          spatialY: this.activePin.spatialY || null,
          createdAt: this.activePin.createdAt || Date.now()
        };

        try {
          await this.storage.saveNote(noteRecord);
          this.activePin.id = noteRecord.id;
          this.activePin.savedToStorage = true;
          
          // Force spatial marker refresh to update tooltip content
          if (this.activePin.spatialMarker) {
            this.removeSpatialMarker(this.activePin);
          }
          
          log('Note persisted');

          // Notify SidePanel to add the new note
          if (this.sidePanel) {
            this.sidePanel.addNote(noteRecord);
          }
        } catch (err) {
          log('Failed to persist note:', err);
        }
      }

      this.isEditing = false;
      this.closeNoteInput(true);
    }

    /**
     * Closes the note input
     * @param {boolean} force - If true, ignores isEditing state
     */
    closeNoteInput(force = false) {
      if (!this.noteWrapper || (!force && this.isEditing)) return;

      this.noteWrapper.classList.remove('active');
      this.noteInput.blur();

      if (this.isEditing && this.wasPlaying && this.videoElement) {
        this.videoElement.play();
      }

      this.activePin = null;
      this.isEditing = false;

      if (this.escListener) {
        document.removeEventListener('keydown', this.escListener, true);
        this.escListener = null;
      }

      if (this.clickOutsideListener) {
        document.removeEventListener('click', this.clickOutsideListener, true);
        this.clickOutsideListener = null;
      }
    }

    /**
     * Cancels the current note without saving, removes unsaved pin
     */
    cancelNote() {
      if (this.activePin) {
        // If this is a new unsaved pin (no id saved to storage yet), remove it
        if (!this.activePin.savedToStorage) {
          // Remove spatial marker if it exists
          if (this.activePin.spatialMarker) {
            this.removeSpatialMarker(this.activePin);
          }

          // Remove pin element from timeline
          if (this.activePin.element && this.activePin.element.parentNode) {
            this.activePin.element.parentNode.removeChild(this.activePin.element);
          }
          // Remove from pins array
          const index = this.pins.indexOf(this.activePin);
          if (index > -1) {
            this.pins.splice(index, 1);
          }
          log('Cancelled: Pin removed');
        } else {
          log('Cancelled: Existing pin unchanged');
        }
      }

      this.noteInput.value = '';
      this.closeNoteInput(true);
    }

    /**
     * Handles clicks on the timeline area to seek video
     * @param {MouseEvent} e - Mouse event
     */
    handleTimelineClick(e) {
      // Don't trigger click if we were dragging
      if (this.isDraggingTimeline) {
        this.isDraggingTimeline = false;
        return;
      }

      e.stopPropagation();

      const video = document.querySelector('video');
      if (!video || !video.duration) return;

      const rect = this.timeline.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
      const newTime = (percentage / 100) * video.duration;

      video.currentTime = newTime;
      log(`Timeline seek to ${percentage.toFixed(1)}% (${newTime.toFixed(1)}s)`);
    }

    /**
     * Handles mousedown on timeline to start dragging
     * @param {MouseEvent} e - Mouse event
     */
    handleTimelineMouseDown(e) {
      e.preventDefault();
      e.stopPropagation();

      const video = document.querySelector('video');
      if (!video || !video.duration) return;

      this.isDraggingTimeline = true;
      this.timeline.classList.add('dragging');

      // Pause video while dragging
      this.wasPlayingBeforeDrag = !video.paused;
      if (this.wasPlayingBeforeDrag) {
        video.pause();
      }

      // Seek to initial position
      this.seekTimelineToPosition(e.clientX);

      // Add global listeners
      this.timelineMouseMoveHandler = (e) => this.handleTimelineMouseMove(e);
      this.timelineMouseUpHandler = (e) => this.handleTimelineMouseUp(e);

      document.addEventListener('mousemove', this.timelineMouseMoveHandler);
      document.addEventListener('mouseup', this.timelineMouseUpHandler);
    }

    /**
     * Handles mousemove while dragging timeline
     * @param {MouseEvent} e - Mouse event
     */
    handleTimelineMouseMove(e) {
      if (!this.isDraggingTimeline) return;

      e.preventDefault();
      this.seekTimelineToPosition(e.clientX);
    }

    /**
     * Handles mouseup to end timeline dragging
     * @param {MouseEvent} e - Mouse event
     */
    handleTimelineMouseUp(e) {
      if (!this.isDraggingTimeline) return;

      e.preventDefault();
      this.timeline.classList.remove('dragging');

      // Resume video if it was playing before drag
      const video = document.querySelector('video');
      if (video && this.wasPlayingBeforeDrag) {
        video.play();
      }

      // Remove global listeners
      document.removeEventListener('mousemove', this.timelineMouseMoveHandler);
      document.removeEventListener('mouseup', this.timelineMouseUpHandler);

      // Keep isDraggingTimeline true briefly to prevent click event
      setTimeout(() => {
        this.isDraggingTimeline = false;
      }, 10);
    }

    /**
     * Seeks video to position based on mouse X coordinate
     * @param {number} clientX - Mouse X coordinate
     */
    seekTimelineToPosition(clientX) {
      const video = document.querySelector('video');
      if (!video || !video.duration) return;

      const rect = this.timeline.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
      const newTime = (percentage / 100) * video.duration;

      video.currentTime = newTime;
    }

    /**
     * Creates a visual pin on the timeline
     * @param {number} percentage - Position percentage on timeline
     * @returns {Object} Pin data object
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

      pin.addEventListener('mouseenter', () => {
        pinData.isHovered = true;
        if (!this.isEditing) this.openNoteInput(pinData, false);
      });

      pin.addEventListener('mouseleave', () => {
        pinData.isHovered = false;
        this.closeNoteInput(false);
      });

      pin.addEventListener('click', (e) => {
        e.stopPropagation();

        if (this.videoElement) {
          this.videoElement.currentTime = pinData.timestamp;
        }

        this.openNoteInput(pinData, true);
      });

      return pinData;
    }

    /**
     * Creates a proactive insight marker (💡) on the timeline
     * @param {number} percentage - Position percentage
     * @param {Object} data - Insight data {keyword, context, timestamp}
     */
    createInsightMarker(percentage, data) {
      const marker = document.createElement('div');
      marker.className = 'kairos-pin kairos-marker-insight';
      marker.style.left = `${percentage}%`;
      marker.innerHTML = data.icon || '💡';
      marker.title = `${data.label || 'Insight'}: "${data.keyword}"`;
      
      // Style adjustments for the emoji marker
      marker.style.background = 'none';
      marker.style.border = 'none';
      marker.style.fontSize = '14px';
      marker.style.top = '-6px'; // Lift it up a bit
      marker.style.cursor = 'help';
      marker.style.filter = 'drop-shadow(0 0 4px rgba(255, 255, 0, 0.5))';

      this.timeline.appendChild(marker);
      
      // Animation
      marker.animate([
        { transform: 'scale(0)', opacity: 0 },
        { transform: 'scale(1.2)', opacity: 1 },
        { transform: 'scale(1)', opacity: 1 }
      ], {
        duration: 400,
        easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      });

      // Optional: Add click handler to jump to time?
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.videoElement) {
          this.videoElement.currentTime = data.timestamp;
        }
      });
      
      log('Insight marker created at', percentage.toFixed(1) + '%');
    }

    /**
     * Starts the AI loading/scanning animation on the Orb
     * Toggles flip-icon to create "looking left and right" effect
     */
    startLoading() {
      if (!this.orbElement) return;

      this.orbElement.classList.add('ai-scanning');
      this.orbElement.title = 'Kairos is thinking...';

      // Stop any existing animation
      if (this.scanAnimationTimer) {
        clearInterval(this.scanAnimationTimer);
      }

      // Toggle flip-icon every 600ms to simulate looking left/right
      let isFlipped = this.orbElement.classList.contains('flip-icon');
      this.scanAnimationTimer = setInterval(() => {
        isFlipped = !isFlipped;
        if (isFlipped) {
          this.orbElement.classList.add('flip-icon');
        } else {
          this.orbElement.classList.remove('flip-icon');
        }
      }, 600);
    }

    /**
     * Stops the AI loading/scanning animation
     */
    stopLoading() {
      if (!this.orbElement) return;

      this.orbElement.classList.remove('ai-scanning');
      this.orbElement.title = this.isActive ? 'Kairos Active' : 'Click to expand menu';

      // Stop flip animation
      if (this.scanAnimationTimer) {
        clearInterval(this.scanAnimationTimer);
        this.scanAnimationTimer = null;
      }

      // Restore flip-icon based on actual position (will be updated by drag handler)
      // Leave it as-is for now, drag handler will correct it
    }

    /**
     * Destroys the overlay
     */
    destroy() {
      if (this.boundGlobalDblClick) {
        document.removeEventListener('dblclick', this.boundGlobalDblClick, true);
      }
      
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      log('Overlay destroyed');
    }
  }

  // Export to global namespace
  window.Kairos.OverlayManager = OverlayManager;

})();
