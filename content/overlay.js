/**
 * Kairos Overlay Manager Module
 * Manages the floating overlay UI including orb, timeline, and note input
 */

(function () {
  'use strict';

  const { CONFIG, log, Utils, StorageManager, getStyles } = window.Kairos;

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
      this.currentVideoId = null;

      // Interaction States
      this.activePin = null;
      this.isEditing = false;
      this.wasPlaying = false;
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
      island.className = 'kairos-island-container orient-bottom';

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
      orb.title = 'Activate Kairos';

      const iconUrl = chrome.runtime.getURL('icons/icon.png');
      const iconImg = document.createElement('img');
      iconImg.src = iconUrl;
      iconImg.className = 'kairos-orb-icon';
      iconImg.draggable = false;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'kairos-orb-label';

      const labelText = document.createElement('span');
      labelText.textContent = '📌';
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

      orb.appendChild(dragHandle);
      orb.appendChild(iconImg);
      orb.appendChild(labelSpan);

      orb.addEventListener('click', (e) => {
        if (!this.isDragging) this.handleOrbClick();
      });

      // Spotlight Note Input
      const noteWrapper = document.createElement('div');
      noteWrapper.className = 'kairos-note-wrapper';

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
      noteInput.addEventListener('keypress', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });
      noteInput.addEventListener('keyup', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });

      noteWrapper.addEventListener('click', (e) => e.stopPropagation());

      noteWrapper.appendChild(noteInput);

      const noteHint = document.createElement('div');
      noteHint.className = 'kairos-note-hint';
      noteHint.textContent = '⌘↵ Save  ⎋ Cancel';
      noteWrapper.appendChild(noteHint);

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

      this.effectElements = { flash, ripple, glowBorder };
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

      this.updateOrientation(newTop, overlayRect.height);
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
        this.updateOrientation(currentTop, overlayRect.height);
      }

      setTimeout(() => {
        this.isDragging = false;
      }, 50);
    }

    /**
     * Updates note orientation based on Y position
     * @param {number} currentTop - Current top position
     * @param {number} containerHeight - Container height
     */
    updateOrientation(currentTop, containerHeight) {
      if (!this.shadowRoot) return;
      const island = this.shadowRoot.querySelector('.kairos-island-container');
      if (!island) return;

      const positionRatio = currentTop / containerHeight;

      if (positionRatio > 0.6) {
        island.classList.remove('orient-bottom');
        island.classList.add('orient-top');
      } else {
        island.classList.remove('orient-top');
        island.classList.add('orient-bottom');
      }
    }

    /**
     * Updates the overlay position based on video rectangle
     * @param {DOMRect} rect - Video bounding rectangle
     * @param {HTMLVideoElement} video - Video element
     */
    updatePosition(rect, video) {
      if (!this.overlayElement) return;

      if (video && video !== this.videoElement) {
        this.videoElement = video;
        video.addEventListener('play', () => {
          if (this.noteWrapper && this.noteWrapper.classList.contains('active')) {
            this.closeNoteInput();
          }
        });
      }
      this.videoElement = video;

      this.overlayElement.style.top = `${rect.top}px`;
      this.overlayElement.style.left = `${rect.left}px`;
      this.overlayElement.style.width = `${rect.width}px`;
      this.overlayElement.style.height = `${rect.height}px`;

      if (this.isActive && this.progressBar && video && video.duration) {
        const progress = (video.currentTime / video.duration) * 100;
        this.progressBar.style.width = `${progress}%`;
      }

      this.enforceIslandBounds(rect.width, rect.height);
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
     * @param {number} orbLeft - Orb left position
     * @param {number} containerWidth - Container width
     * @param {HTMLElement} noteWrapper - Note wrapper element
     */
    updateNoteAlignment(orbLeft, containerWidth, noteWrapper) {
      if (!noteWrapper) return;

      const orbWidth = 48;
      const noteWidth = 320;
      const centerOffset = (noteWidth - orbWidth) / 2;

      const noteLeftIfCentered = orbLeft - centerOffset;
      const noteRightIfCentered = orbLeft + orbWidth + centerOffset;

      noteWrapper.classList.remove('align-left', 'align-center', 'align-right');

      if (noteLeftIfCentered < 0) {
        noteWrapper.classList.add('align-left');
      } else if (noteRightIfCentered > containerWidth) {
        noteWrapper.classList.add('align-right');
      } else {
        noteWrapper.classList.add('align-center');
      }
    }

    /**
     * Handles click on the Orb
     */
    handleOrbClick() {
      if (!this.effectElements) {
        log('Animation elements missing.');
        return;
      }

      const { flash, ripple, glowBorder } = this.effectElements;

      if (!this.isActive) {
        log('Activating Kairos (Apple Intelligence style)...');
        this.isActive = true;

        flash.classList.remove('animating');
        ripple.classList.remove('animating');
        ripple.classList.remove('reversing');
        glowBorder.classList.remove('active');

        if (this.orbElement) {
          this.orbElement.classList.add('active');
          this.orbElement.title = 'Capture Moment';
        }
        if (this.orbLabelText) this.orbLabelText.textContent = '📌';

        if (this.overlayElement) this.overlayElement.classList.add('active');

        void flash.offsetWidth;

        flash.classList.add('animating');
        ripple.classList.add('animating');
        glowBorder.classList.add('active');
      } else {
        log('Capturing current moment...');

        if (!this.videoElement) return;

        const duration = this.videoElement.duration;
        if (!duration) return;

        const percentage = (this.videoElement.currentTime / duration) * 100;

        flash.classList.remove('animating');
        void flash.offsetWidth;
        flash.classList.add('animating');

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

      glowBorder.classList.remove('active');
      if (this.overlayElement) this.overlayElement.classList.remove('active');

      this.closeNoteInput(true);

      if (this.orbElement) {
        this.orbElement.classList.remove('active');
        this.orbElement.title = 'Activate Kairos';
      }
      if (this.orbLabelText) this.orbLabelText.textContent = '📌';

      ripple.classList.remove('animating');
      ripple.classList.remove('reversing');
      void ripple.offsetWidth;
      ripple.classList.add('reversing');
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
        this.closeNoteInput();
      }
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

      this.noteWrapper.classList.add('active');
      this.noteInput.focus();

      if (isEdit) {
        if (!this.clickOutsideListener) {
          this.clickOutsideListener = (e) => {
            if (!this.noteWrapper.contains(e.target) && !e.target.classList.contains('kairos-pin')) {
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
        element: pin
      };

      this.pins.push(pinData);

      pin.addEventListener('mouseenter', () => {
        if (!this.isEditing) this.openNoteInput(pinData, false);
      });

      pin.addEventListener('mouseleave', () => {
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
          createdAt: this.activePin.createdAt || Date.now()
        };

        try {
          await this.storage.saveNote(noteRecord);
          this.activePin.id = noteRecord.id;
          log('Note persisted');
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
        if (!this.isEditing) this.openNoteInput(pinData, false);
      });

      pin.addEventListener('mouseleave', () => {
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
     * Destroys the overlay
     */
    destroy() {
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      log('Overlay destroyed');
    }
  }

  // Export to global namespace
  window.Kairos.OverlayManager = OverlayManager;

})();
