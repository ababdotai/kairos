/**
 * Kairos Overlay Manager Module
 * Manages the floating overlay UI including orb, timeline, and note input
 */

(function () {
  'use strict';
  const { t } = window.Kairos.I18n;

  const { CONFIG, log, Utils, StorageManager, getStyles, CaptureEngine, SimpleMarkdown } = window.Kairos;

  const iconPaths = {
    switch: 'M8 5.5h8a6.5 6.5 0 0 1 0 13H8a6.5 6.5 0 0 1 0-13z',
    write: 'M5 2.5h10l4.5 4.5v14H5z M14.5 3v5h5 M9 14h6m-3-3v6',
    expand: 'm6 6 6 5 6-5m-12 7 6 5 6-5',
    collapse: 'm6 11 6-5 6 5m-12 7 6-5 6 5',
    library: 'M4 5h4v14H4z M10 5h3v14h-3z M15 6l3-1 4 13-3 1z',
    sparkle: 'M10 3c0 5-2 7-7 8 5 1 7 3 7 8 1-5 3-7 8-8-5-1-7-3-8-8z M19 2v5m-2.5-2.5h5'
  };

  function islandIcon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('kairos-action-icon');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', iconPaths[name]);
    svg.append(path);
    if (name === 'switch') {
      const thumb = document.createElementNS(svg.namespaceURI, 'circle');
      thumb.setAttribute('cx', '8');
      thumb.setAttribute('cy', '12');
      thumb.setAttribute('r', '3.5');
      thumb.setAttribute('fill', 'currentColor');
      thumb.setAttribute('stroke', 'none');
      svg.append(thumb);
    }
    return svg;
  }

  function setIslandAction(button, icon, label) {
    button.type = 'button';
    button.title = ''; // Suppress the native tooltip inherited from the orb.
    button.dataset.kairosTip = '';
    button.setAttribute('aria-label', label);
    if (button.dataset.icon === icon) return;
    button.dataset.icon = icon;
    button.replaceChildren(islandIcon(icon));
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
      this.boundNoteUpdated = ({ detail }) => this.applyNoteUpdate(detail);
      window.addEventListener('kairos-note-updated', this.boundNoteUpdated);
      this.scanAnimationTimer = null; // Timer for AI scanning animation
      this.timelineScaleRendered = false; // Flag for timeline scale rendering
      this.isDraggingTimeline = false; // Flag for timeline dragging
      this.capturingState = false; // Flag for capture-phase state (debouncing play events)
      this.isKeyboardLocked = false; // Flag for keyboard lock state
    }

    /**
     * Initializes the overlay with Shadow DOM for style isolation
     */
    async init() {
      await this.storage.init();

      this.container = document.createElement('div');
      this.container.id = CONFIG.OVERLAY_ID;
      // Keep the UI invisible until the tracker supplies a real playback video.
      this.container.style.display = 'none';

      this.shadowRoot = this.container.attachShadow({ mode: 'open' });

      this.injectStyles();
      this.createOverlay();

      document.body.appendChild(this.container);
      this.updatePresentationMode();
      this.setupIslandDrag();
      this.setupNoteDrag();

      // Listen for note deletion events from sidepanel
      window.addEventListener('kairos-note-deleted', (e) => {
        const { noteId } = e.detail;
        this.removePinByNoteId(noteId);
      });

      // Handle fullscreen changes to ensure overlay is visible
      this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
      document.addEventListener('fullscreenchange', this.handleFullscreenChange);

      log('Overlay initialized');
    }

    /**
     * Handles fullscreen changes to ensure overlay remains visible (Top Layer)
     */
    handleFullscreenChange() {
      const fsElement = document.fullscreenElement;
      if (fsElement) {
        // Move container into the fullscreen element
        // This ensures it sits on top of the video in native fullscreen mode
        log('Entering fullscreen: moving overlay to fullscreen element');
        fsElement.appendChild(this.container);
      } else {
        // Move back to body
        log('Exiting fullscreen: moving overlay back to body');
        document.body.appendChild(this.container);
      }
      this.updatePresentationMode();
    }

    /** Keep island notes available in both modes; hide the page sidebar in fullscreen. */
    updatePresentationMode() {
      const fullscreen = !!document.fullscreenElement;
      this.overlayElement.classList.toggle('is-fullscreen', fullscreen);
      this.sidePanel?.setFullscreen(fullscreen);
      this.renderIslandNotes();
      this.positionIsland();
    }

    /** Registers pointer-based dragging and restores the last video-relative anchor. */
    setupIslandDrag() {
      this.islandDragController = new AbortController();
      const options = { signal: this.islandDragController.signal };
      this.islandAnchor = { x: .5, y: 0 };
      for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        const handle = document.createElement('div');
        handle.className = `kairos-island-resize edge-${edge}`;
        handle.dataset.edge = edge;
        handle.title = t("Drag to resize");
        this.islandContainer.appendChild(handle);
      }
      this.islandContainer.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button, a, input, textarea, select, .kairos-timeline-container, .kairos-island-notes, .kairos-island-moments')) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = this.islandContainer.getBoundingClientRect();
        this.islandGeometryChanged = true;
        if (event.target.dataset.edge) {
          this.dockResize = { id: event.pointerId, edge: event.target.dataset.edge, rect, x: event.clientX, y: event.clientY };
          this.islandContainer.classList.add('dock-dragging', 'is-resizing');
          this.islandContainer.setPointerCapture(event.pointerId);
          return;
        }
        this.dockDrag = { id: event.pointerId, dx: event.clientX - rect.left - rect.width / 2, dy: event.clientY - rect.top };
        this.islandContainer.classList.add('dock-dragging');
        this.islandContainer.setPointerCapture(event.pointerId);
      }, options);
      this.islandContainer.addEventListener('pointermove', event => {
        if (this.dockResize?.id === event.pointerId) {
          event.preventDefault();
          const start = this.dockResize;
          const bounds = this.overlayElement.getBoundingClientRect();
          const dx = event.clientX - start.x, dy = event.clientY - start.y;
          let left = start.rect.left, right = start.rect.right, top = start.rect.top, bottom = start.rect.bottom;
          const maxHeight = Math.min(this.getIslandContentHeight(), bounds.height - 24);
          const minWidth = Math.min(300, bounds.width - 24), minHeight = Math.min(190, maxHeight);
          if (start.edge.includes('e')) right = Math.max(left + minWidth, Math.min(bounds.right - 12, right + dx));
          if (start.edge.includes('w')) left = Math.min(right - minWidth, Math.max(bounds.left + 12, left + dx));
          if (start.edge.includes('s')) bottom = Math.max(top + minHeight, Math.min(top + maxHeight, bounds.bottom - 12, bottom + dy));
          if (start.edge.includes('n')) top = Math.min(bottom - minHeight, Math.max(bottom - maxHeight, bounds.top + 12, top + dy));
          this.islandSize = { width: right - left, height: bottom - top };
          this.islandAnchor = { x: ((left + right) / 2 - bounds.left) / bounds.width, y: (top - bounds.top) / bounds.height };
          this.positionIsland();
          return;
        }
        if (this.dockDrag?.id !== event.pointerId) return;
        event.preventDefault();
        const rect = this.overlayElement.getBoundingClientRect();
        this.islandAnchor = {
          x: Math.max(0, Math.min(1, (event.clientX - rect.left - this.dockDrag.dx) / rect.width)),
          y: Math.max(0, Math.min(1, (event.clientY - rect.top - this.dockDrag.dy) / rect.height))
        };
        this.positionIsland();
      }, options);
      const finish = event => {
        const gesture = this.dockResize || this.dockDrag;
        if (!gesture || (event.pointerId !== undefined && event.pointerId !== gesture.id)) return;
        const id = gesture.id;
        this.dockDrag = null;
        this.dockResize = null;
        this.islandContainer.classList.remove('dock-dragging', 'is-resizing');
        if (this.islandContainer.hasPointerCapture(id)) this.islandContainer.releasePointerCapture(id);
        const preferences = { islandAnchor: this.islandAnchor };
        if (this.islandSize) preferences.islandSize = this.islandSize;
        chrome.storage.local.set(preferences).catch(error => log('Island position save failed', error));
      };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.islandContainer.addEventListener(type, finish, options);
      window.addEventListener('blur', finish, options);
      this.islandResizeObserver = new ResizeObserver(() => this.positionIsland());
      this.islandResizeObserver.observe(this.islandContainer);
      chrome.storage.local.get(['islandAnchor', 'islandPinned', 'islandSize']).then(({ islandAnchor, islandPinned, islandSize }) => {
        if (this.islandDragController.signal.aborted || this.dockDrag || this.dockResize) return;
        if (!this.islandPinChanged) this.setIslandPinned(islandPinned === true);
        if (this.islandGeometryChanged) return;
        if (Number.isFinite(islandSize?.width) && Number.isFinite(islandSize?.height)) {
          this.islandSize = { width: Math.max(300, islandSize.width), height: Math.max(190, islandSize.height) };
        }
        if (Number.isFinite(islandAnchor?.x) && Number.isFinite(islandAnchor?.y)) {
          this.islandAnchor = { x: Math.max(0, Math.min(1, islandAnchor.x)), y: Math.max(0, Math.min(1, islandAnchor.y)) };
        }
        this.positionIsland();
      }).catch(error => log('Island position load failed', error));
    }

    /** Measure content rather than reserving blank space for the saved height. */
    getIslandContentHeight() {
      const panel = this.islandList?.parentElement;
      if (!panel || !panel.getClientRects().length) return this.islandContentHeight || Infinity;
      const style = getComputedStyle(panel);
      let chromeHeight = 54 + ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
        .reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0);
      let listHeight = 0;
      const outerHeight = element => {
        const css = getComputedStyle(element);
        return element.getBoundingClientRect().height + (parseFloat(css.marginTop) || 0) + (parseFloat(css.marginBottom) || 0);
      };
      for (const child of panel.children) {
        if (child !== this.islandList) chromeHeight += outerHeight(child);
      }
      for (const child of this.islandList.children) listHeight += outerHeight(child);
      this.islandContainer.style.setProperty('--island-chrome-height', `${Math.ceil(chromeHeight)}px`);
      this.islandContentHeight = Math.ceil(chromeHeight + listHeight);
      return this.islandContentHeight;
    }

    /** Clamps the expanded island to content and video, preserving the preference. */
    positionIsland() {
      if (!this.islandContainer || !this.overlayElement) return;
      const rect = this.overlayElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (this.islandSize) {
        this.islandContainer.classList.add('has-custom-size');
        this.islandContainer.style.setProperty('--island-expanded-width', `${Math.min(this.islandSize.width, Math.max(0, rect.width - 24))}px`);
        this.islandContainer.style.setProperty('--island-expanded-height', `${Math.min(this.islandSize.height, this.getIslandContentHeight(), Math.max(0, rect.height - 24))}px`);
      }
      const width = this.islandContainer.offsetWidth;
      const height = this.islandContainer.offsetHeight;
      const anchor = this.islandAnchor || { x: .5, y: 0 };
      const x = Math.max(width / 2 + 12, Math.min(rect.width - width / 2 - 12, anchor.x * rect.width));
      const y = Math.max(12, Math.min(rect.height - height - 12, anchor.y * rect.height));
      this.islandContainer.style.setProperty('--island-x', `${x}px`);
      this.islandContainer.style.setProperty('--island-y', `${y}px`);
    }

    /** Keeps the island open independently of hover and recording state. */
    setIslandPinned(pinned, persist = false) {
      this.islandContainer.classList.toggle('is-pinned', pinned);
      this.islandPinButton.setAttribute('aria-pressed', String(pinned));
      setIslandAction(this.islandPinButton, pinned ? 'collapse' : 'expand',
        pinned ? t('Unpin to expand only on hover') : t('Keep expanded when the pointer leaves'));
      this.positionIsland();
      if (persist) {
        this.islandPinChanged = true;
        chrome.storage.local.set({ islandPinned: pinned }).catch(error => log('Island preference save failed', error));
      }
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
      this.islandTimelineMarks = document.createElement('div');
      this.islandTimelineMarks.className = 'kairos-timeline-note-marks';
      timeline.appendChild(this.islandTimelineMarks);

      timeline.addEventListener('click', (e) => this.handleTimelineClick(e));
      timeline.addEventListener('mousedown', (e) => this.handleTimelineMouseDown(e));
      overlay.appendChild(timeline);

      // The Intelligent Island Container (Orb + Note)
      const island = document.createElement('div');
      island.className = 'kairos-island-container orient-top docked';

      // Initialize Drag Offsets
      this.xOffset = 0;
      this.yOffset = 0;


      // Floating orb
      const orb = document.createElement('div');
      orb.className = 'kairos-orb';
      orb.title = t("Hover to expand · Drag to move");
      orb.tabIndex = 0;
      orb.setAttribute('role', 'group');
      orb.setAttribute('aria-label', t("Kairos controls"));

      const iconUrl = chrome.runtime.getURL('icons/icon.png');
      const iconImg = document.createElement('img');
      iconImg.src = iconUrl;
      iconImg.className = 'kairos-orb-icon';
      iconImg.draggable = false;
      const brand = document.createElement('span');
      brand.className = 'kairos-island-brand';
      brand.textContent = 'Kairos';
      const statusDot = document.createElement('span');
      statusDot.className = 'kairos-island-status';
      statusDot.setAttribute('aria-hidden', 'true');

      // Expanded Menu Container (Move - Orb - Pin)
      const orbMenu = document.createElement('div');
      orbMenu.className = 'kairos-orb-menu';

      // Center Orb Icon Button (click to collapse)
      const orbIconBtn = document.createElement('button');
      orbIconBtn.className = 'kairos-orb-btn orb-icon-btn';
      setIslandAction(orbIconBtn, 'switch', t('Enable Kairos'));
      this.islandToggle = orbIconBtn;
      orbIconBtn.setAttribute('aria-pressed', 'false');
      orbIconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isActive) this.collapseOrb();
        else this.expandOrb();
      });

      // Pin Button
      const pinBtn = document.createElement('button');
      pinBtn.className = 'kairos-orb-btn pin-btn';
      setIslandAction(pinBtn, 'write', t('Capture this frame and take a note'));
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.isActive) this.expandOrb();
        this.handlePinCapture();
      });

      orbMenu.appendChild(orbIconBtn);
      orbMenu.appendChild(pinBtn);

      orb.appendChild(iconImg);
      orb.appendChild(brand);
      orb.appendChild(statusDot);
      orb.appendChild(orbMenu);
      this.islandFeedback = document.createElement('span');
      this.islandFeedback.className = 'kairos-island-feedback';
      this.islandFeedback.setAttribute('role', 'status');
      this.islandFeedback.setAttribute('aria-live', 'polite');
      this.islandFeedback.setAttribute('aria-atomic', 'true');
      orb.appendChild(this.islandFeedback);

      // Spotlight Note Input
      const noteWrapper = document.createElement('div');
      noteWrapper.className = 'kairos-note-wrapper';

      // Markdown Preview Div
      const notePreview = document.createElement('div');
      notePreview.className = 'kairos-note-preview hidden';
      notePreview.title = t("Click to edit");

      notePreview.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchToEditMode();
      });

      const noteInput = document.createElement('textarea');
      noteInput.className = 'kairos-note-input';
      noteInput.placeholder = t("Type note, or Enter for AI ✨");
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
      saveBtn.textContent = '✓';
      saveBtn.title = t("Save (⌘↵)");
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.saveNote();
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'kairos-note-action-btn cancel-btn';
      cancelBtn.innerHTML = '✕';
      cancelBtn.title = t("Cancel (⎋)");
      cancelBtn.setAttribute('aria-label', t("Close note"));
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelNote();
      });

      noteActions.appendChild(saveBtn);
      noteActions.appendChild(cancelBtn);
      noteWrapper.appendChild(noteActions);
      const noteHandle = document.createElement('button');
      noteHandle.type = 'button';
      noteHandle.className = 'kairos-note-drag-handle';
      noteHandle.title = t("Drag to move · Position remembered");
      noteHandle.setAttribute('aria-label', noteHandle.title);
      noteWrapper.appendChild(noteHandle);
      this.noteHandle = noteHandle;

      island.appendChild(orb);
      const islandPanel = document.createElement('div');
      islandPanel.className = 'kairos-island-panel';
      const timeLabel = document.createElement('div');
      timeLabel.className = 'kairos-island-time';
      const toolbar = document.createElement('div');
      toolbar.className = 'kairos-island-toolbar';
      this.islandPinButton = document.createElement('button');
      this.islandPinButton.className = 'kairos-island-pin-toggle';
      setIslandAction(this.islandPinButton, 'expand', t('Keep expanded when the pointer leaves'));
      this.islandPinButton.setAttribute('aria-pressed', 'false');
      this.islandPinButton.addEventListener('click', event => {
        event.stopPropagation();
        this.setIslandPinned(!this.islandContainer.classList.contains('is-pinned'), true);
        this.islandPinButton.blur();
      });
      orbMenu.appendChild(this.islandPinButton);
      if (window.Kairos.Availability) {
        const control = window.Kairos.Availability.createControl();
        const close = control.querySelector('.kairos-disable-trigger');
        close.dataset.kairosTip = '';
        close.title = '';
        orbMenu.append(control);
      }
      toolbar.append(timeLabel);
      if (window.Kairos.Refinement) {
        const ai = window.Kairos.Refinement.createToggle();
        ai.prepend(islandIcon('sparkle'));
        toolbar.append(ai);
      }
      islandPanel.appendChild(toolbar);
      islandPanel.appendChild(timeline);
      this.islandTime = timeLabel;
      this.islandMoments = document.createElement('div');
      this.islandMoments.className = 'kairos-island-moments';
      this.islandMoments.setAttribute('aria-label', t("Note timestamps"));
      islandPanel.appendChild(this.islandMoments);
      this.islandList = document.createElement('div');
      this.islandList.className = 'kairos-island-notes';
      this.islandList.setAttribute('aria-label', t("Notes for this video"));
      for (const scroller of [this.islandList, this.islandMoments]) {
        scroller.tabIndex = 0;
        const pauseFollow = () => {
          if (!document.fullscreenElement || !this.islandContainer.classList.contains('is-pinned')) return;
          this.islandFollowPaused = true;
        };
        scroller.addEventListener('wheel', pauseFollow, { passive: true });
        scroller.addEventListener('touchstart', pauseFollow, { passive: true });
        scroller.addEventListener('pointerdown', pauseFollow);
        scroller.addEventListener('keydown', event => {
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) pauseFollow();
        });
      }
      islandPanel.appendChild(this.islandList);
      const libraryButton = document.createElement('button');
      libraryButton.className = 'kairos-island-library';
      setIslandAction(libraryButton, 'library', t('Manage all notes'));
      libraryButton.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }));
      islandPanel.appendChild(libraryButton);
      island.appendChild(islandPanel);
      this.hideIslandTip = window.Kairos.ActionTips.install(island);
      const resumeFollow = () => {
        this.islandFollowPaused = false;
      };
      islandPanel.addEventListener('pointerleave', resumeFollow);
      islandPanel.addEventListener('focusout', event => {
        if (!islandPanel.contains(event.relatedTarget)) resumeFollow();
      });
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
      this.islandContainer = island;
      this.spatialLayer = spatialLayer;
      this.dragHandle = null;
      this.orbElement = orb;
      this.orbMenu = orbMenu;
      this.timeline = timeline;
      this.progressBar = progressBar;
      this.ticksContainer = ticksContainer;
      this.noteWrapper = noteWrapper;
      this.noteInput = noteInput;
      this.notePreview = notePreview;
      this.pins = [];
      this.renderIslandNotes();
      this.spatialMarkers = [];

      this.shadowRoot.appendChild(overlay);

      this.effectElements = { flash, ripple, glowBorder };

      // Global capture-phase double click listener to intercept video fullscreen toggle
      // We bind this once and checking bounds inside
      this.boundGlobalDblClick = (e) => this.handleGlobalDoubleClick(e);
      document.addEventListener('dblclick', this.boundGlobalDblClick, true);

      this.companionInput = new window.Kairos.CompanionInput(this);
    }

    /* --- Dragging Logic --- */

    /** Renders the current video's saved notes inside the island in both modes. */
    renderIslandNotes() {
      if (!this.islandList) return;
      const scrollTop = this.islandList.scrollTop;
      const scrollLeft = this.islandMoments.scrollLeft;
      this.islandEntries = [];
      this.timelineMarksKey = null;
      this.islandList.replaceChildren();
      this.islandMoments.replaceChildren();
      const notes = (this.pins || []).filter(pin => pin.savedToStorage).sort((a, b) => a.timestamp - b.timestamp);
      if (!notes.length) {
        const empty = document.createElement('p');
        empty.className = 'kairos-island-empty';
        empty.textContent = t("No notes yet · Enable, then type or draw with the left mouse button");
        this.islandList.appendChild(empty);
        const hint = document.createElement('span');
        hint.textContent = t("No note markers yet");
        hint.className = 'kairos-island-empty';
        this.islandMoments.appendChild(hint);
        this.islandTimelineMarks.replaceChildren();
        this.timelineMarkGroups = [];
        return;
      }
      for (const pin of notes) {
        const row = document.createElement('div');
        row.className = 'kairos-island-note-row';
        const open = document.createElement('button');
        open.className = 'kairos-island-note';
        const time = document.createElement('span');
        time.textContent = Utils.formatTime(pin.timestamp);
        const content = document.createElement('span');
        content.className = 'kairos-island-note-copy';
        content.textContent = pin.note || (pin.imageUrl ? t("Screenshot") : t("Empty note"));
        open.title = content.textContent;
        open.append(time, content);
        open.addEventListener('click', async (event) => {
          event.stopPropagation();
          if (this.isEditing) {
            await this.saveNote();
            if (this.isEditing) return;
          }
          if (!this.isActive) this.expandOrb();
          if (this.videoElement) {
            this.wasPlaying = !this.videoElement.paused;
            this.videoElement.pause();
            this.videoElement.currentTime = pin.timestamp;
          }
          this.openNoteInput(pin, true);
        });
        const moment = document.createElement('button');
        moment.className = 'kairos-island-moment';
        moment.textContent = `${this.islandMoments.childElementCount + 1} · ${time.textContent}`;
        moment.title = content.textContent;
        moment.setAttribute('aria-label', `${time.textContent}：${content.textContent}`);
        moment.addEventListener('click', event => {
          event.stopPropagation();
          open.click();
        });
        this.islandMoments.appendChild(moment);
        const remove = document.createElement('button');
        remove.className = 'kairos-island-delete';
        remove.dataset.kairosTip = '';
        window.Kairos.bindDeleteButton(remove, async () => {
          try {
            await this.storage.deleteNote(pin.id);
          } catch (error) {
            log('Note deletion failed', error);
            this.showError(t("Delete failed"), window.Kairos.deletionError(error));
            return;
          }
          try {
            if (this.activePin === pin) this.closeNoteInput(true);
            this.removePinByNoteId(pin.id);
            this.sidePanel?.refresh();
          } catch (error) {
            log('Note deleted but view refresh failed', error);
            this.loadNotesForCurrentVideo();
          }
        }, t("Delete {time} note", { time: time.textContent }));
        row.append(open);
        if (window.Kairos.Refinement) row.appendChild(window.Kairos.Refinement.status(pin));
        row.appendChild(remove);
        this.islandList.appendChild(row);
        this.islandEntries.push({ pin, row, open, moment });
      }
      this.islandList.scrollTop = scrollTop;
      this.islandMoments.scrollLeft = scrollLeft;
      this.updateIslandPlayback(this.videoElement?.currentTime || 0);
    }

    /** Apply background results without rebuilding the list or stealing editor focus. */
    applyNoteUpdate({ id, note }) {
      if (!note) {
        if (this.activePin?.id === id) { delete this.activePin.deferredRefinement; this.closeNoteInput(true); }
        this.removePinByNoteId(id);
        return;
      }
      if (note.videoId !== this.currentVideoId) return;
      const pin = this.pins?.find(pin => pin.id === id);
      if (!pin) { this.renderPin(note); this.renderIslandNotes(); return; }
      if ((pin.updatedAt || 0) >= (note.updatedAt || 0)) return;
      if (this.activePin === pin && this.isEditing) {
        if ((pin.deferredRefinement?.updatedAt || 0) < note.updatedAt) pin.deferredRefinement = note;
        return;
      }
      const changed = pin.note !== note.content;
      Object.assign(pin, note, { note: note.content, savedToStorage: true });
      const entry = this.islandEntries?.find(entry => entry.pin === pin);
      if (entry) {
        const body = entry.open.children[1];
        if (changed) window.Kairos.Refinement.replaceText(body, () => { body.textContent = note.content; }, note.refinement?.status === 'complete');
        entry.open.title = note.content; entry.moment.title = note.content;
        entry.moment.setAttribute('aria-label', `${Utils.formatTime(note.timestamp)}：${note.content}`);
        entry.row.querySelector('.kairos-refinement-status')?.replaceWith(window.Kairos.Refinement.status(note));
      } else this.renderIslandNotes();
      if (this.activePin === pin && !this.isEditing && changed) this.switchToViewMode(note.content);
    }

    /** Playback highlighting stays live even while the user browses elsewhere. */
    updateIslandPlayback(currentTime) {
      const entries = this.islandEntries || [];
      const current = entries.findLast(entry => entry.pin.timestamp <= currentTime);
      this.updateTimelineNoteMarks(current);
      for (const entry of entries) {
        const selected = entry === current;
        entry.row.classList.toggle('is-current', selected);
        entry.moment.classList.toggle('is-current', selected);
        for (const element of [entry.open, entry.moment]) {
          if (selected) element.setAttribute('aria-current', 'true');
          else element.removeAttribute('aria-current');
        }
      }
      const following = !!document.fullscreenElement && this.islandContainer.classList.contains('is-pinned');
      if (!following || this.islandFollowPaused || !current || this.dockDrag || this.dockResize) return;
      // Scroll only our two containers, never the page or the video underneath.
      for (const [container, item, horizontal] of [[this.islandList, current.row, false], [this.islandMoments, current.moment, true]]) {
        if (!container.clientHeight || !container.clientWidth) continue;
        const viewport = container.getBoundingClientRect();
        const target = item.getBoundingClientRect();
        const delta = horizontal
          ? (target.left < viewport.left ? target.left - viewport.left : Math.max(0, target.right - viewport.right))
          : (target.top < viewport.top ? target.top - viewport.top : Math.max(0, target.bottom - viewport.bottom));
        if (Math.abs(delta) > 1) container[horizontal ? 'scrollLeft' : 'scrollTop'] += delta;
      }
    }

    /** Spread dense notes gently around their timestamps along a static wave. */
    updateTimelineNoteMarks(current) {
      if (!this.islandTimelineMarks || !this.timeline) return;
      const duration = this.videoElement?.duration;
      const width = Math.round(this.timeline.clientWidth);
      if (!Number.isFinite(duration) || duration <= 0 || !width) return;
      const key = `${duration}:${width}`;
      if (this.timelineMarksKey !== key) {
        this.timelineMarksKey = key;
        this.islandTimelineMarks.replaceChildren();
        const groups = [];
        for (const entry of this.islandEntries || []) {
          if (!Number.isFinite(entry.pin.timestamp) || entry.pin.timestamp < 0 || entry.pin.timestamp > duration) continue;
          const x = entry.pin.timestamp / duration * width;
          groups.push({ x, displayX: x, y: 12, entries: [entry] });
        }
        // Give dense clusters room to trace a wave instead of a vertical stack.
        // Visual displacement is at most 12px; click targets retain real times.
        for (let start = 0; start < groups.length;) {
          let end = start + 1;
          while (end < groups.length && groups[end].x - groups[end - 1].x < 10) end++;
          if (end - start > 1) {
            const count = end - start;
            const center = (groups[start].x + groups[end - 1].x) / 2;
            const naturalSpan = groups[end - 1].x - groups[start].x;
            const span = Math.max(naturalSpan, Math.min((count - 1) * 6, naturalSpan + 24));
            const left = start ? (groups[start - 1].x + groups[start].x) / 2 : 3;
            const right = end < groups.length ? (groups[end - 1].x + groups[end].x) / 2 : width - 3;
            for (let index = start; index < end; index++) {
              const point = groups[index];
              const target = center - span / 2 + (index - start) * span / (count - 1);
              point.displayX = Math.max(left, Math.min(right, Math.max(point.x - 12, Math.min(point.x + 12, target))));
              point.y = 12 + 5.5 * Math.sin((point.displayX - center) * Math.PI / 16);
            }
          }
          start = end;
        }
        for (const group of groups) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'kairos-timeline-note-mark';
          button.style.left = `${group.displayX / width * 100}%`;
          button.style.setProperty('--note-y', `${group.y.toFixed(2)}px`);
          button.dataset.timestamp = String(group.entries[0].pin.timestamp);
          button.title = group.entries.map(entry => `${Utils.formatTime(entry.pin.timestamp)} · ${entry.open.title}`).join('\n');
          button.setAttribute('aria-label', button.title);
          for (const type of ['mousedown', 'pointerdown']) button.addEventListener(type, event => event.stopPropagation());
          button.addEventListener('click', event => {
            event.stopPropagation();
            group.entries[0].open.click();
          });
          group.button = button;
          this.islandTimelineMarks.appendChild(button);
        }
        this.timelineMarkGroups = groups;
      }
      for (const group of this.timelineMarkGroups || []) {
        const selected = group.entries.includes(current);
        group.button.classList.toggle('is-current', selected);
        if (selected) group.button.setAttribute('aria-current', 'true');
        else group.button.removeAttribute('aria-current');
      }
    }

    /**
     * Handles drag start event
     * @param {MouseEvent} e - Mouse event
     */
    dragStart(e) {
      if (this.islandContainer?.classList.contains('docked')) return;
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
      if (!rect || !video) {
        this.hideIslandTip?.();
        this.shadowRoot.querySelector('.kairos-disable-options:popover-open')?.hidePopover();
        this.videoPlaybackController?.abort();
        this.wasPlaying = false;
        this.collapseOrb();
        this.videoElement = null;
        this.container.style.display = 'none';
        this.genUiManager?.clearAll();
        return;
      }
      this.islandContainer.classList.toggle('is-playing', !video.paused && !video.ended);
      this.container.style.display = '';

      const isNewVideo = video && video !== this.videoElement;
      if (isNewVideo) {
        this.videoPlaybackController?.abort();
        this.videoPlaybackController = new AbortController();
        this.videoElement = video;
        video.addEventListener('play', () => {
          if (this.videoElement !== video || !this.isActive) return;
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
        }, { signal: this.videoPlaybackController.signal });
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
      this.companionInput?.updateSafeArea(rect);
      this.islandContainer.style.setProperty('--island-max-height', `${Math.max(90, rect.height - 28)}px`);
      this.positionIsland();
      if (this.islandTime && video) {
        this.islandTime.textContent = `${Utils.formatTime(video.currentTime)} / ${Number.isFinite(video.duration) ? Utils.formatTime(video.duration) : '--:--'}`;
        this.updateIslandPlayback(video.currentTime);
      }

      // Legacy floating positions do not apply to the viewport-docked island.
      if (!this.islandContainer.classList.contains('docked') && !this.positionLoaded) {
        this.positionLoaded = true;
        this.loadOrbPosition();
      } else if (!this.islandContainer.classList.contains('docked') && sizeChanged && this.savedOrbPosition) {
        // Re-apply saved position when size changes (e.g., fullscreen toggle)
        this.applySavedPosition(this.savedOrbPosition);
      }

      // Store current size for comparison
      this.lastOverlayWidth = rect.width;
      this.lastOverlayHeight = rect.height;

      if (this.progressBar && video && video.duration) {
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
        
        // Update GenUI HUD Script
        if (this.genUiManager) {
          this.genUiManager.update(video.currentTime);
        }
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
      this.spatialPlaybackTime = currentTime;
      if (!this.isActive || !this.spatialLayer || !this.pins) {
        if (!this.isActive) this.clearAllSpatialMarkers();
        return;
      }

      const WINDOW = 2; // Visibility window in seconds

      this.pins.forEach(pin => {
        const timeDiff = Math.abs(currentTime - pin.timestamp);
        if (timeDiff >= WINDOW) pin.spatialDismissed = false;
        const held = pin.isHovered || pin.spatialHovered;
        const shouldBeVisible = (timeDiff < WINDOW && !pin.spatialDismissed) || held;
        if (shouldBeVisible && pin.spatialFadeTimer) {
          clearTimeout(pin.spatialFadeTimer);
          pin.spatialFadeTimer = null;
        }

        if (shouldBeVisible && !pin.spatialMarker) {
          this.renderSpatialMarker(pin);
        } else if (!shouldBeVisible && pin.spatialMarker) {
          this.fadeSpatialMarker(pin);
        }
        if (pin.spatialFadeTimer) return;

        // Update opacity for fade effect
        if (pin.spatialMarker) {
          this.alignSpatialMarker(pin);
          const opacity = held ? 1 : Math.max(0, 1 - (timeDiff / WINDOW));
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
      this.pins.forEach(pin => {
        this.removeSpatialMarker(pin);
        pin.spatialDismissed = false;
      });
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
      this.renderIslandNotes();

      log(`Pin removed for note ID: ${noteId}`);
    }

    /**
     * Renders a playback preview using the shared note placement preference.
     * @param {Object} pin - Pin data
     */
    renderSpatialMarker(pin) {
      const marker = document.createElement('div');
      marker.className = 'kairos-spatial-marker';

      const tooltip = document.createElement('div');
      tooltip.className = 'kairos-spatial-tooltip';
      tooltip.textContent = pin.note || '';
      tooltip.addEventListener('pointerenter', () => {
        clearTimeout(pin.spatialFadeTimer);
        pin.spatialFadeTimer = null;
        pin.spatialHovered = true;
        pin.spatialDismissed = false;
        this.updateSpatialMarkers(this.spatialPlaybackTime ?? this.videoElement.currentTime);
      });
      tooltip.addEventListener('pointerleave', () => {
        pin.spatialHovered = false;
        pin.spatialDismissed = Math.abs((this.spatialPlaybackTime ?? this.videoElement.currentTime) - pin.timestamp) < 2;
        this.fadeSpatialMarker(pin);
      });
      if (pin.region && pin.imageUrl) {
        const image = document.createElement('img');
        image.src = pin.imageUrl;
        image.alt = 'Captured video region';
        tooltip.prepend(image);
      }
      this.spatialLayer.appendChild(marker);
      this.spatialLayer.appendChild(tooltip);
      pin.spatialMarker = marker;
      pin.spatialTooltip = tooltip;
      this.alignSpatialMarker(pin);
      this.noteResizeObserver?.observe(tooltip);
    }

    alignSpatialMarker(pin) {
      const tooltip = pin.spatialTooltip;
      if (!tooltip || !pin.spatialMarker) return;
      const rect = this.overlayElement.getBoundingClientRect();
      const safeBottom = this.companionInput?.captureBottom ?? 80;
      tooltip.style.maxHeight = `${Math.max(36, rect.height - safeBottom - 44)}px`;
      const { left, top } = this.notePlacement(tooltip, rect.width, rect.height);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      pin.spatialMarker.style.left = `${left + tooltip.offsetWidth / 2}px`;
      pin.spatialMarker.style.top = `${top + tooltip.offsetHeight + 16}px`;
    }

    /** Fade only after the reader leaves; keep the node available for re-entry. */
    fadeSpatialMarker(pin) {
      if (pin.spatialFadeTimer) return;
      if (pin.spatialMarker) pin.spatialMarker.style.opacity = '0';
      if (pin.spatialTooltip) pin.spatialTooltip.style.opacity = '0';
      pin.spatialFadeTimer = setTimeout(() => this.removeSpatialMarker(pin), 300);
    }

    /**
     * Removes a spatial marker from the DOM
     * @param {Object} pin - Pin data
     */
    removeSpatialMarker(pin) {
      clearTimeout(pin.spatialFadeTimer);
      pin.spatialFadeTimer = null;
      pin.spatialHovered = false;
      if (pin.spatialMarker) {
        pin.spatialMarker.remove();
        pin.spatialMarker = null;
      }
      if (pin.spatialTooltip) {
        this.noteResizeObserver?.unobserve(pin.spatialTooltip);
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
      if (this.islandContainer?.classList.contains('docked')) {
        if (this.noteWrapper.classList.contains('active')) {
          this.updateNoteAlignment(this.activePin, containerWidth, containerHeight);
        }
        return;
      }
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

    /** Editor placement is independent of the captured region's spatial coordinates. */
    setupNoteDrag() {
      this.noteDragController = new AbortController();
      const options = { signal: this.noteDragController.signal };
      this.noteAnchor = { x: .5, y: 1 };
      chrome.storage.local.get('noteEditorAnchor').then(({ noteEditorAnchor: anchor }) => {
        if (this.noteDragController.signal.aborted || this.notePositionChanged) return;
        if (Number.isFinite(anchor?.x) && Number.isFinite(anchor?.y)) {
          this.noteAnchor = { x: Math.max(0, Math.min(1, anchor.x)), y: Math.max(0, Math.min(1, anchor.y)) };
          this.alignNote();
        }
      }).catch(error => log('Note position load failed', error));
      this.noteHandle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = this.noteWrapper.getBoundingClientRect();
        this.noteDrag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        this.noteWrapper.classList.add('is-dragging');
        this.noteHandle.setPointerCapture(event.pointerId);
      }, options);
      this.noteHandle.addEventListener('pointermove', event => {
        if (this.noteDrag?.id !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = this.overlayElement.getBoundingClientRect();
        const limits = this.notePlacementBounds(rect.width, rect.height);
        const x = event.clientX - rect.left - this.noteDrag.dx;
        const y = event.clientY - rect.top - this.noteDrag.dy;
        this.noteAnchor = {
          x: limits.width ? Math.max(0, Math.min(1, (x - limits.left) / limits.width)) : .5,
          y: limits.height ? Math.max(0, Math.min(1, (y - limits.top) / limits.height)) : 1
        };
        this.notePositionChanged = true;
        this.noteDrag.moved = true;
        this.alignNote();
      }, options);
      const finish = event => {
        if (!this.noteDrag || (event.pointerId !== undefined && this.noteDrag.id !== event.pointerId)) return;
        event.stopPropagation();
        this.finishNoteDrag();
        if (this.isEditing && document.hasFocus()) this.noteInput.focus({ preventScroll: true });
      };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.noteHandle.addEventListener(type, finish, options);
      window.addEventListener('blur', finish, options);
      for (const type of ['click', 'dblclick', 'mousedown', 'mouseup']) this.noteHandle.addEventListener(type, event => {
        event.preventDefault();
        event.stopPropagation();
      }, options);
      this.noteResizeObserver = new ResizeObserver(() => this.alignNote());
      this.noteResizeObserver.observe(this.noteWrapper);
      this.noteResizeObserver.observe(this.overlayElement);
    }

    finishNoteDrag() {
      const drag = this.noteDrag;
      if (!drag) return;
      this.noteDrag = null;
      this.noteWrapper.classList.remove('is-dragging');
      if (this.noteHandle.hasPointerCapture(drag.id)) this.noteHandle.releasePointerCapture(drag.id);
      if (drag.moved) chrome.storage.local.set({ noteEditorAnchor: this.noteAnchor })
        .catch(error => log('Note position save failed', error));
    }

    alignNote() {
      if (this.noteWrapper?.classList.contains('active')) {
        const rect = this.overlayElement.getBoundingClientRect();
        this.updateNoteAlignment(this.activePin, rect.width, rect.height);
      }
      for (const pin of this.pins || []) this.alignSpatialMarker(pin);
    }

    notePlacementBounds(width, height, element = this.noteWrapper) {
      const margin = 12;
      const safeBottom = this.companionInput?.captureBottom ?? Math.max(80, Math.min(144, height * .16));
      return {
        left: margin, top: margin,
        width: Math.max(0, width - element.offsetWidth - margin * 2),
        height: Math.max(0, height - safeBottom - 32 - element.offsetHeight - margin)
      };
    }

    notePlacement(element, width, height) {
      const bounds = this.notePlacementBounds(width, height, element);
      const anchor = this.noteAnchor || { x: .5, y: 1 };
      return { left: bounds.left + bounds.width * anchor.x, top: bounds.top + bounds.height * anchor.y };
    }

    updateNoteAlignment(pinData, containerWidth, containerHeight) {
      if (!this.noteWrapper) return;
      const safeBottom = this.companionInput?.captureBottom ?? 80;
      const availableHeight = Math.max(80, containerHeight - safeBottom - 44);
      const imageHeight = this.capturePreview && !this.capturePreview.hidden ? Math.min(76, Math.max(0, availableHeight - 96)) : 0;
      this.noteWrapper.style.setProperty('--note-image-height', `${imageHeight}px`);
      this.noteWrapper.style.setProperty('--note-text-height', `${Math.max(36, availableHeight - imageHeight - 36)}px`);
      const { left, top } = this.notePlacement(this.noteWrapper, containerWidth, containerHeight);
      this.noteWrapper.style.transformOrigin = 'center bottom';

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
      setIslandAction(this.islandToggle, 'switch', t('Turn off Kairos'));
      this.islandToggle.setAttribute('aria-pressed', 'true');
      this.shadowRoot.activeElement?.blur();
      this.orbElement.classList.add('expanded');
      this.orbElement.classList.add('active');
      this.orbElement.title = t("Companion enabled · Drag to move");
      if (!this.companionHint) {
        this.companionHint = document.createElement('div');
        this.companionHint.className = 'kairos-companion-hint';
        this.companionHint.textContent = t("Type to take notes · Left-drag to capture · Esc to exit");
        this.overlayElement.appendChild(this.companionHint);
      }
      this.companionHint.hidden = false;
      clearTimeout(this.companionHintTimer);
      this.companionHintTimer = setTimeout(() => { this.companionHint.hidden = true; }, 6000);

      if (this.overlayElement) this.overlayElement.classList.add('active');
      this.companionInput?.prepareTyping(true);

      // Notify agent about activation (ProactiveAgent)
      if (this.agent && this.agent.onActivate) {
        this.agent.onActivate();
      }

      // Notify HUD Agent about activation
      if (this.hudAgent && this.hudAgent.onActivate) {
        this.hudAgent.onActivate();
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
      this.shadowRoot.activeElement?.blur();
      setIslandAction(this.islandToggle, 'switch', t('Enable Kairos'));
      this.islandToggle.setAttribute('aria-pressed', 'false');
      this.companionInput?.cancel();
      if (this.companionHint) this.companionHint.hidden = true;
      this.orbElement.classList.remove('expanded');
      this.orbElement.classList.remove('active');
      this.orbElement.title = t("Hover to expand · Drag to move");

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
      if (this.companionInput?.isControl(e, true) || e.composedPath().includes(this.container)) return;
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
     * @param {Object} options - Options { silent: boolean, spatialX: number, spatialY: number }
     */
    async handlePinCapture(options = {}) {
      if (!this.videoElement || this.isEditing) return;

      const silent = options.silent || false;
      const spatialX = options.spatialX;
      const spatialY = options.spatialY;

      log(silent ? 'AI Note (Background AI)...' : 'Capturing current moment...');
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
      // BUT only if NOT in silent mode. Silent mode should not interrupt flow.
      if (!silent) {
        if (!this.videoElement.paused) {
          this.videoElement.pause();
          this.wasPlaying = true;
        } else {
          this.wasPlaying = false;
        }
      }

      const pinData = this.createPin(percentage);
      pinData.region = options.region || null;
      if (options.wasPlaying !== undefined) this.wasPlaying = options.wasPlaying;

      // Add spatial coordinates if provided
      if (spatialX !== undefined) {
        pinData.spatialX = spatialX;
        pinData.spatialY = spatialY;
      }

      // Focus immediately: screenshot completion must never reset typed text.
      if (!silent) this.openNoteInput(pinData, true);
      const videoId = this.currentVideoId;
      const captureUrl = location.href;
      try {
        const screenshot = options.region
          ? await this.captureEngine.captureRegion(this.videoElement, options.region)
          : await this.captureEngine.captureFrame(this.videoElement);
        if (captureUrl !== location.href || videoId !== this.currentVideoId || !this.pins.includes(pinData)) return;
        pinData.imageUrl = screenshot;
        if (this.activePin === pinData) this.updateCapturePreview(pinData);
        // Captures remain drafts. Only attach a late image to an already saved note.
        if (pinData.savedToStorage) await this.attachNoteImage(pinData, screenshot);
        
        if (silent) {
           pinData.isAnalyzing = true;
           this.startLoading();
           this.requestAIAnalysis(pinData, screenshot);
        } else {
           pinData.isAnalyzing = false; // Don't trigger AI yet
        }
      } catch (err) {
        log('Capture failed:', err);
        this.showError(t("Capture failed"), t("You can still type a note. Retry or check whether the video is protected."));
      }
    }

    /**
     * Handles keydown events in the note input
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleNoteKeydown(e) {
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return;
      // e.stopImmediatePropagation(); // Allow Enter key processing

      if (e.key === 'Enter') {
        const content = this.noteInput.value.trim();
        
        // If empty and Enter (without modifiers) -> Trigger AI
        if (!content && this.activePin?.region && !e.shiftKey) {
          e.preventDefault();
          this.saveNote();
        } else if (!content && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          if (this.activePin && this.activePin.imageUrl) {
            log('Empty input + Enter: Triggering background AI...');
            
            const pinToAnalyze = this.activePin;
            const imageToAnalyze = this.activePin.imageUrl;
            
            // Start AI
            pinToAnalyze.isAnalyzing = true;
            this.startLoading();
            this.requestAIAnalysis(pinToAnalyze, imageToAnalyze);

            // Close input immediately
            this.closeNoteInput(true);
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
          pinData.source = 'ai'; // Mark as AI-generated

          // Check if this was a background/silent request or the UI is closed
          const isBackground = this.activePin !== pinData;

          // Update UI if this pin is still active in the input
          if (!isBackground && this.noteInput) {
            this.noteInput.value = aiText;
            this.noteInput.classList.remove('ai-loading');
            this.switchToViewMode(aiText);
          } else {
             // Background completion
             this.stopLoading();
             this.savePinToStorage(pinData);
          }
        } else {
          let errorMsg = response ? response.error : t("Unknown error");
          let errorTitle = t("AI Error");
          let actionText = null;
          let actionCallback = null;

          // Try to parse JSON error message if it looks like one
          try {
            if (typeof errorMsg === 'string' && (errorMsg.startsWith('{') || errorMsg.includes('{"error":'))) {
              // Extract JSON part if mixed with text
              const jsonStart = errorMsg.indexOf('{');
              const jsonEnd = errorMsg.lastIndexOf('}');
              if (jsonStart !== -1 && jsonEnd !== -1) {
                 const jsonStr = errorMsg.substring(jsonStart, jsonEnd + 1);
                 const errorObj = JSON.parse(jsonStr);
                 
                 // Handle Google API Error Structure
                 if (errorObj.error) {
                    const { code, status, message } = errorObj.error;
                    if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
                       errorTitle = t("Quota Exceeded");
                       errorMsg = t("You have exceeded the free tier rate limit. Please wait a minute or check your plan.");
                    } else if (message) {
                       errorMsg = message;
                    }
                 }
              }
            }
          } catch (e) {
            // parsing failed, use original string
          }

          log('AI Analysis failed:', errorMsg);
          
          this.stopLoading(); // Stop orb animation
          
          if (this.activePin === pinData && this.noteInput) {
            this.noteInput.classList.remove('ai-loading');
            this.noteInput.placeholder = t("AI Analysis failed. Type note...");
          }

          // Show user-facing error toast
          if (typeof errorMsg === 'string') {
             if (errorMsg.includes('API Key') || errorMsg.includes('401') || errorMsg.includes('PERMISSION_DENIED')) {
                errorTitle = t("Authentication Failed");
                errorMsg = t("Gemini API Key is missing or invalid.");
                actionText = t("Configure");
                actionCallback = () => { chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' }); };
             } else if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota')) {
                errorTitle = t("Quota Exceeded");
                errorMsg = t("Free tier limit reached. Please wait a moment.");
             }
          }

          // Truncate long messages for toast
          const displayMsg = errorMsg.length > 80 ? errorMsg.substring(0, 80) + '...' : errorMsg;
          
          this.showError(errorTitle, displayMsg, actionText, actionCallback);
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
      this.noteWrapper.style.maxHeight = `${newHeight + 220}px`;
    }

    /**
     * Opens the note input/preview
     * @param {Object} pinData - The pin data
     * @param {boolean} isEdit - Whether to enter edit mode
     */
    openNoteInput(pinData, isEdit = false) {
      if (!this.noteWrapper || !this.noteInput) return;

      this.activePin = pinData;
      this.updateCapturePreview(pinData);
      this.noteInput.value = pinData.note || '';
      this.isEditing = isEdit;

      if (pinData.isAnalyzing) {
        this.noteInput.placeholder = t("✨ AI is thinking...");
        this.noteInput.classList.add('ai-loading');
        this.switchToEditMode(); // Show loading input
      } else {
        this.noteInput.placeholder = t("Type note, or Enter for AI ✨");
        this.noteInput.classList.remove('ai-loading');

        if (!isEdit && pinData.note) {
          this.switchToViewMode(pinData.note);
        } else {
          this.switchToEditMode();
        }
      }

      this.noteWrapper.classList.add('active');

      this.alignNote();

      if (this.isEditing) {
        this.noteInput.focus();

        // Try to lock keyboard (Escape) if in fullscreen to prevent exit
        if (document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock) {
          navigator.keyboard.lock(['Escape']).then(() => {
            this.isKeyboardLocked = true;
            log('Keyboard locked (Escape captured)');
          }).catch((e) => {
            log('Failed to lock keyboard:', e);
          });
        }
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
              el === this.islandContainer ||
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

    /** Shows a photo print above the caption for a captured region. */
    updateCapturePreview(pinData) {
      if (!this.capturePreview) {
        this.capturePreview = document.createElement('img');
        this.capturePreview.className = 'kairos-capture-preview';
        this.capturePreview.alt = t("Selected video region");
        this.noteWrapper.prepend(this.capturePreview);
      }
      this.capturePreview.hidden = !(pinData.region && pinData.imageUrl);
      if (!this.capturePreview.hidden) this.capturePreview.src = pinData.imageUrl;
      else this.capturePreview.removeAttribute('src');
    }

    /**
     * Loads notes for the current video and renders pins
     */
    async loadNotesForCurrentVideo() {
      this.companionInput?.cancel();
      this.closeNoteInput(true);
      const info = Utils.getVideoInfo();
      this.currentVideoId = info.videoId;
      this.islandFollowPaused = false;

      log('Loading notes for:', this.currentVideoId);

      this.clearAllSpatialMarkers();
      if (this.pins) {
        this.pins.forEach(p => p.element.remove());
      }
      this.pins = [];
      this.renderIslandNotes();

      if (!info.videoId) return;

      try {
        const savedNotes = await this.storage.getNotesForVideo(this.currentVideoId);
        if (this.currentVideoId !== info.videoId) return;
        savedNotes.forEach(noteData => {
          this.renderPin(noteData);
        });
        this.renderIslandNotes();
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
      const pin = this.activePin;
      if (!pin) return;
      const content = this.noteInput.value.trim();
      if (this.activePin && !this.activePin.savedToStorage && !content) {
        this.cancelNote();
        return;
      }
      if (pin.savedToStorage && content === (pin.note || '').trim()) {
        // Browsing an existing note is not a write and must not announce a save.
        this.closeNoteInput(true);
        return;
      }

      const previousContent = pin.note;
      const previousSource = pin.source;
      pin.note = content;
      pin.source = 'user';
      delete pin.deferredRefinement;
      const saved = await this.savePinToStorage(pin);
      if (!saved) { pin.note = previousContent; pin.source = previousSource; return; }
      if (this.activePin !== pin) return;
      // Successful saving finishes the note-taking pause, even if playback
      // was already paused when the user opened this note.
      this.wasPlaying = true;
      this.closeNoteInput(true);
    }

    /**
     * Persists a pin data object to storage
     * @param {Object} pinData - The pin object to save
     */
    async attachNoteImage(pinData, imageUrl) {
      try {
        const note = await window.Kairos.Refinement.request('ATTACH_NOTE_IMAGE', { id: pinData.id, videoId: pinData.videoId || this.currentVideoId, imageUrl });
        if (note) this.applyNoteUpdate({ id: pinData.id, note });
      } catch (error) { log('Could not attach captured image', error); }
    }

    async savePinToStorage(pinData, notify = true) {
        if (!pinData) return;
        if (!pinData.savedToStorage && !pinData.note?.trim()) return false;

        const info = Utils.getVideoInfo();
        const noteRecord = {
          id: pinData.id || Utils.generateId(),
          videoId: pinData.videoId || info.videoId,
          videoUrl: pinData.videoUrl || info.url,
          videoTitle: pinData.videoTitle || info.title,
          content: pinData.note || '',
          timestamp: pinData.timestamp,
          timeLabel: Utils.formatTime(pinData.timestamp),
          percentage: pinData.percentage,
          imageUrl: pinData.imageUrl || null,
          context: pinData.context || null,
          spatialX: pinData.spatialX ?? null,
          spatialY: pinData.spatialY ?? null,
          region: pinData.region || null,
          source: pinData.source || 'user',
          createdAt: pinData.createdAt || Date.now()
        };

        try {
          const response = await this.storage.saveNote(noteRecord);
          Object.assign(noteRecord, response?.note || {});
          const lateImage = pinData.imageUrl && !noteRecord.imageUrl ? pinData.imageUrl : null;
          if (lateImage) { noteRecord.imageUrl = lateImage; void this.attachNoteImage(pinData, lateImage); }
          Object.assign(pinData, noteRecord, { note: noteRecord.content, savedToStorage: true });
          delete pinData.deferredRefinement;
          if (window.Kairos.Refinement && noteRecord.refinement?.status === 'pending') {
            void window.Kairos.Refinement.request('GET_NOTE', { id: noteRecord.id }).then(note => this.applyNoteUpdate({ id: noteRecord.id, note })).catch(() => {});
          }
          if (this.currentVideoId && noteRecord.videoId !== this.currentVideoId) return true;
          this.renderIslandNotes();
          
          // Force spatial marker refresh to update tooltip content
          if (pinData.spatialMarker) {
            this.removeSpatialMarker(pinData);
          }
          
          log('Note persisted:', noteRecord.id);

          // Notify SidePanel to add the new note
          if (this.sidePanel) {
            this.sidePanel.addNote(noteRecord);
          }
          if (notify) this.showIslandFeedback('saved');
          return true;
        } catch (err) {
          log('Failed to persist note:', err);
          this.showIslandFeedback('error');
          this.showError(t("Note not saved"), t("Storage failed. Your text is preserved; click Save to retry."));
          return false;
        }
    }

    /**
     * Closes the note input
     * @param {boolean} force - If true, ignores isEditing state
     */
    closeNoteInput(force = false) {
      if (!this.noteWrapper || (!force && this.isEditing)) return;
      this.finishNoteDrag();
      if (this.activePin?.region && !this.activePin.savedToStorage &&
          !this.activePin.isAnalyzing && !this.noteInput.value.trim()) {
        if (this.pins.includes(this.activePin)) this.showIslandFeedback('discarded');
        this.removeSpatialMarker(this.activePin);
        this.activePin.element?.remove();
        this.pins = this.pins.filter(pin => pin !== this.activePin);
      }

      const deferredRefinement = this.activePin?.deferredRefinement;
      if (this.activePin) delete this.activePin.deferredRefinement;
      this.noteWrapper.classList.remove('active');
      this.noteInput.blur();

      if (this.isEditing && this.wasPlaying && this.videoElement) {
        // An intentional resume must not be rejected by the capture debounce.
        this.capturingState = false;
        this.videoElement.play().catch(() => {});
      }

      if (this.isKeyboardLocked && navigator.keyboard && navigator.keyboard.unlock) {
        // Delay unlock to prevent browser from interpreting the current Escape press as a fullscreen exit trigger
        setTimeout(() => {
          // Only unlock if we are still closed (user didn't reopen immediately)
          if (!this.noteWrapper.classList.contains('active')) {
             navigator.keyboard.unlock();
             this.isKeyboardLocked = false;
             log('Keyboard unlocked');
          }
        }, 500);
      }

      this.activePin = null;
      this.isEditing = false;
      if (deferredRefinement) this.applyNoteUpdate({ id: deferredRefinement.id, note: deferredRefinement });

      if (this.escListener) {
        document.removeEventListener('keydown', this.escListener, true);
        this.escListener = null;
      }

      if (this.clickOutsideListener) {
        document.removeEventListener('click', this.clickOutsideListener, true);
        this.clickOutsideListener = null;
      }
      // The next keystroke must already have a native editable target, even
      // when the mouse has not moved since saving/cancelling this note.
      this.companionInput?.scheduleTyping();
    }

    /**
     * Cancels the current note without saving, removes unsaved pin
     */
    cancelNote() {
      const discarded = this.activePin && (!this.activePin.savedToStorage ||
        (this.isEditing && this.noteInput.value.trim() !== (this.activePin.note || '').trim()));
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
      if (discarded) this.showIslandFeedback('discarded');
    }

    /** A transient in-place status; never changes pinning, focus or island position. */
    showIslandFeedback(state) {
      if (!this.islandFeedback) return;
      clearTimeout(this.islandFeedbackTimer);
      this.islandFeedback.getAnimations().forEach(animation => animation.cancel());
      const labels = { saved: t('Saved'), discarded: t('Not saved'), error: t('Save failed') };
      const mark = document.createElement('span');
      mark.className = 'kairos-feedback-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = state === 'saved' ? '✓' : state === 'error' ? '!' : '−';
      this.islandFeedback.replaceChildren(mark, document.createTextNode(labels[state]));
      this.orbElement.dataset.feedback = state;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.islandFeedback.animate([
          { opacity: 0, transform: 'translateY(5px) scale(.95)' },
          { opacity: 1, transform: 'translateY(-1px) scale(1.02)', offset: .7 },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
      this.islandFeedbackTimer = setTimeout(() => {
        delete this.orbElement.dataset.feedback;
        this.islandFeedback.textContent = '';
      }, state === 'error' ? 3200 : 1800);
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

      const video = this.videoElement;
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
      if (e.button !== 0 || e.target.closest('.kairos-pin')) return;
      e.preventDefault();
      e.stopPropagation();

      const video = this.videoElement;
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
      const video = this.videoElement;
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
      const video = this.videoElement;
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
        context: this.subtitleManager?.getContext() || '',
        videoId: Utils.getVideoInfo().videoId,
        videoTitle: Utils.getVideoInfo().title,
        videoUrl: Utils.getVideoInfo().url,
        source: 'user', // Default to user
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
      this.orbElement.title = t("Kairos is thinking...");

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
      this.orbElement.title = this.isActive ? t("Kairos Active") : t("Click to expand menu");

      // Stop flip animation
      if (this.scanAnimationTimer) {
        clearInterval(this.scanAnimationTimer);
        this.scanAnimationTimer = null;
      }

      // Restore flip-icon based on actual position (will be updated by drag handler)
      // Leave it as-is for now, drag handler will correct it
    }

    /**
     * Shows a success animation on the Orb (Checkmark)
     */
    showSuccess() {
      if (!this.orbElement) return;

      this.stopLoading(); // Stop scanning animation

      this.orbElement.classList.add('success');
      
      const originalIcon = this.orbElement.querySelector('.kairos-orb-icon');
      if (originalIcon) originalIcon.style.opacity = '0';
      
      const checkmark = document.createElement('div');
      checkmark.className = 'kairos-success-mark';
      checkmark.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#00ff9d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      checkmark.style.position = 'absolute';
      checkmark.style.inset = '0';
      checkmark.style.display = 'flex';
      checkmark.style.alignItems = 'center';
      checkmark.style.justifyContent = 'center';
      checkmark.style.animation = 'kairos-fade-in 0.3s ease';
      
      // Inject keyframes if needed (doing it inline via style tag might be safer but verbose, 
      // relying on simple opacity transition via CSS class is better if I could edit CSS.
      // I'll assume simple appearance is fine or add a style tag)
      
      this.orbElement.appendChild(checkmark);

      setTimeout(() => {
        checkmark.remove();
        if (originalIcon) originalIcon.style.opacity = '1';
        this.orbElement.classList.remove('success');
      }, 2000);
    }

    /**
     * Shows an error toast near the Orb
     * @param {string} title - Error title
     * @param {string} message - Error details
     * @param {string} [actionText] - Optional button text
     * @param {Function} [actionCallback] - Optional button callback
     */
    showError(title, message, actionText, actionCallback) {
      if (!this.islandContainer) return;

      // Remove existing toast
      const existingToast = this.shadowRoot.querySelector('.kairos-error-toast');
      if (existingToast) existingToast.remove();

      const toast = document.createElement('div');
      toast.className = 'kairos-error-toast';
      
      const header = document.createElement('div');
      header.className = 'kairos-error-title';
      header.innerHTML = `
        <svg class="kairos-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <circle cx="12" cy="12" r="10"></circle>
           <line x1="12" y1="8" x2="12" y2="12"></line>
           <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        ${title}
      `;
      
      const body = document.createElement('div');
      body.textContent = message;
      body.style.opacity = '0.8';
      
      toast.appendChild(header);
      toast.appendChild(body);

      if (actionText && actionCallback) {
        const btn = document.createElement('button');
        btn.className = 'kairos-error-btn';
        btn.textContent = actionText;
        btn.onclick = (e) => {
          e.stopPropagation();
          actionCallback();
          toast.classList.remove('active');
          setTimeout(() => toast.remove(), 300);
        };
        toast.appendChild(btn);
      }

      this.islandContainer.appendChild(toast);

      // Animate in
      requestAnimationFrame(() => {
        toast.classList.add('active');
      });

      // Auto dismiss after 6s
      setTimeout(() => {
        if (toast.parentNode) {
          toast.classList.remove('active');
          setTimeout(() => toast.remove(), 300);
        }
      }, 6000);
    }

    /**
     * Destroys the overlay
     */
    destroy() {
      this.hideIslandTip?.();
      this.videoPlaybackController?.abort();
      this.finishNoteDrag();
      this.noteDragController?.abort();
      this.noteResizeObserver?.disconnect();
      window.removeEventListener('kairos-note-updated', this.boundNoteUpdated);
      clearTimeout(this.islandFeedbackTimer);
      this.islandDragController?.abort();
      this.islandResizeObserver?.disconnect();
      this.companionInput?.destroy();
      clearTimeout(this.companionHintTimer);
      if (this.boundGlobalDblClick) {
        document.removeEventListener('dblclick', this.boundGlobalDblClick, true);
      }
      
      if (this.handleFullscreenChange) {
        document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
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
