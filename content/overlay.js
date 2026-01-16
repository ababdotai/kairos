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

      rail.appendChild(progressBar);
      timeline.appendChild(rail);

      timeline.addEventListener('click', (e) => this.handleTimelineClick(e));
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
      noteInput.placeholder = '✨ Capture thought...';
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
      island.appendChild(noteWrapper);
      overlay.appendChild(island);

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
        const progress = (video.currentTime / video.duration) * 100;
        this.progressBar.style.width = `${progress}%`;
        this.updateSpatialMarkers(video.currentTime);
      }

      this.enforceIslandBounds(rect.width, rect.height);
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
      tooltip.textContent = pin.note || 'Snapshot';

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

        this.updateNoteAlignment(newLeft, containerWidth, noteWrapper);
      }
    }

    /**
     * Updates note wrapper alignment based on orb position
     * @param {number} orbLeft - Orb left position in container
     * @param {number} containerWidth - Container width
     * @param {HTMLElement} noteWrapper - Note wrapper element
     */
    updateNoteAlignment(orbLeft, containerWidth, noteWrapper) {
      if (!noteWrapper) return;

      const orb = this.shadowRoot?.querySelector('.kairos-orb');
      const orbWidth = orb ? orb.offsetWidth : 48;
      const noteWidth = 320;

      // Calculate where note would be if centered on orb
      const orbCenter = orbLeft + orbWidth / 2;
      const noteLeftIfCentered = orbCenter - noteWidth / 2;
      const noteRightIfCentered = noteLeftIfCentered + noteWidth;

      let noteLeft;

      if (noteLeftIfCentered < 0) {
        // Left edge would go out of bounds - align left edges
        noteLeft = 0;
      } else if (noteRightIfCentered > containerWidth) {
        // Right edge would go out of bounds - align right edges
        noteLeft = orbLeft + orbWidth - noteWidth;
      } else {
        // Center note on orb
        noteLeft = noteLeftIfCentered;
      }

      // Convert to position relative to island container (which starts at orbLeft)
      const relativeLeft = noteLeft - orbLeft;
      noteWrapper.style.left = `${relativeLeft}px`;
      noteWrapper.style.right = 'auto';
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

      // Pause video on capture to maintain focus (Granola style)
      if (!this.videoElement.paused) {
        this.videoElement.pause();
        this.wasPlaying = true;
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
        pinData.isAnalyzing = true;
        this.openNoteInput(pinData, true);

        // Request AI Analysis with spatial context
        this.requestAIAnalysis(pinData, screenshot);
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
      e.stopImmediatePropagation();

      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.saveNote();
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
        this.noteInput.placeholder = '✨ Capture thought...';
        this.noteInput.classList.remove('ai-loading');

        if (!isEdit && pinData.note) {
          this.switchToViewMode(pinData.note);
        } else {
          this.switchToEditMode();
        }
      }

      this.noteWrapper.classList.add('active');

      // Update note alignment based on current orb position
      if (this.overlayElement) {
        const island = this.shadowRoot?.querySelector('.kairos-island-container');
        const orb = this.shadowRoot?.querySelector('.kairos-orb');
        if (island && orb) {
          const overlayRect = this.overlayElement.getBoundingClientRect();
          const orbRect = orb.getBoundingClientRect();
          const orbLeft = orbRect.left - overlayRect.left;
          this.updateNoteAlignment(orbLeft, overlayRect.width, this.noteWrapper);
        }
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
     * Handles clicks on the timeline area
     * @param {MouseEvent} e - Mouse event
     */
    handleTimelineClick(e) {
      e.stopPropagation();
      log('Timeline click ignored (Use Orb to capture)');
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
