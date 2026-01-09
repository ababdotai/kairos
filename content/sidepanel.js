/**
 * Kairos Side Panel Module
 * Injects a panel into the video page sidebar to display notes
 * Uses pure DOM API to comply with YouTube's CSP (no innerHTML)
 */

(function () {
  'use strict';

  const { CONFIG, log, Utils, StorageManager, SimpleMarkdown } = window.Kairos;

  /**
   * Helper to create SVG elements
   * @param {string} path - SVG path data
   * @param {number} size - Icon size
   * @returns {SVGElement} SVG element
   */
  function createSvgIcon(path, size = 16) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'currentColor');

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', path);
    svg.appendChild(pathEl);

    return svg;
  }

  /**
   * Helper to create element with classes and attributes
   * @param {string} tag - HTML tag
   * @param {Object} options - Options object
   * @returns {HTMLElement} Created element
   */
  function createElement(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.id) el.id = options.id;
    if (options.text) el.textContent = options.text;
    if (options.title) el.title = options.title;
    if (options.attrs) {
      Object.entries(options.attrs).forEach(([k, v]) => el.setAttribute(k, v));
    }
    return el;
  }

  /**
   * SidePanelManager class - Manages the side panel UI
   */
  class SidePanelManager {
    constructor() {
      this.container = null;
      this.storage = new StorageManager();
      this.currentVideoId = null;
      this.notes = [];
      this.isExpanded = true;
      this.retryCount = 0;
      this.maxRetries = 50; // Increased for slow page loads and YouTube SPA
      this.observer = null;
      this.checkInterval = null;
      this.lastInjectionTime = 0;

      // DOM references
      this.elements = {};
    }

    /**
     * Initializes the side panel
     */
    async init() {
      await this.storage.init();

      // For Bilibili: delay injection to allow lazy-loaded images to render first
      const isBilibili = window.location.href.includes('bilibili.com');
      if (isBilibili) {
        // Wait for page to stabilize before injecting
        setTimeout(() => {
          this.injectPanel();
          this.setupUrlChangeListener();
          this.setupMutationObserver();
          this.setupPresenceCheck();
          log('SidePanel initialized (Bilibili delayed)');
        }, 2000);
      } else {
        this.injectPanel();
        this.setupUrlChangeListener();
        this.setupMutationObserver();
        this.setupPresenceCheck();
        log('SidePanel initialized');
      }
    }

    /**
     * Gets the appropriate injection point based on platform
     * @returns {Element|null} The target element to inject before
     */
    getInjectionPoint() {
      const url = window.location.href;

      if (url.includes('youtube.com/watch')) {
        // YouTube video page - try multiple selectors in order of preference
        // #secondary-inner is inside #secondary, prioritize the inner container
        const selectors = [
          '#secondary-inner #related',  // Most specific - related videos container
          '#secondary-inner',            // Inner secondary container
          '#secondary #related',         // Related inside secondary
          '#secondary',                  // Main secondary container
          'ytd-watch-flexy #related'     // Fallback for new layout
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.offsetParent !== null) {
            return el;
          }
        }
        return null;
      } else if (url.includes('bilibili.com/video')) {
        // Bilibili video page - insert between danmuku box and recommendation list
        // Structure: .right-container-inner > #danmukuBox > .recommend-list-container
        // We want to insert after #danmukuBox, before recommendation

        // Priority 1: Insert after danmuku box (before recommendation list)
        const danmuku = document.querySelector('#danmukuBox');
        if (danmuku && danmuku.parentElement) {
          return { insertAfter: danmuku };
        }

        // Priority 2: Insert before recommendation list
        const recoList = document.querySelector('.recommend-list-container') ||
                         document.querySelector('.rec-list') ||
                         document.querySelector('[class*="recommend"]');
        if (recoList && recoList.parentElement) {
          return { insertBefore: recoList, container: recoList.parentElement };
        }

        // Priority 3: Append to right-container-inner (at the end, safest)
        const rightContainer = document.querySelector('.right-container-inner') ||
                               document.querySelector('.right-container');
        if (rightContainer) {
          return rightContainer;
        }

        return null;
      }

      return null;
    }

    /**
     * Injects the panel into the page using pure DOM API
     */
    injectPanel() {
      // Prevent multiple rapid injections
      const now = Date.now();
      if (now - this.lastInjectionTime < 200) {
        return;
      }
      this.lastInjectionTime = now;

      const existing = document.getElementById('kairos-sidepanel');
      if (existing) existing.remove();

      const target = this.getInjectionPoint();

      if (!target) {
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          // Exponential backoff: 200ms, 400ms, 600ms... up to 3s
          const delay = Math.min(200 * this.retryCount, 3000);
          log(`SidePanel: Target not found, retry ${this.retryCount}/${this.maxRetries} in ${delay}ms`);
          setTimeout(() => this.injectPanel(), delay);
        } else {
          log('SidePanel: Max retries reached, giving up');
        }
        return;
      }

      this.retryCount = 0;
      this.injectStyles();
      this.container = this.buildPanel();

      // Handle different injection strategies
      if (target.insertAfter) {
        // Insert after a specific element (Bilibili: after UP panel)
        target.insertAfter.parentElement.insertBefore(
          this.container,
          target.insertAfter.nextSibling
        );
      } else if (target.insertBefore && target.container) {
        // Insert before a specific element
        target.container.insertBefore(this.container, target.insertBefore);
      } else {
        // Default: insert as first child
        target.insertBefore(this.container, target.firstChild);
      }

      this.bindEvents();
      this.loadNotes();
      log('SidePanel: Successfully injected into page');
    }

    /**
     * Builds the panel DOM structure
     * @returns {HTMLElement} Panel container
     */
    buildPanel() {
      const container = createElement('div', { id: 'kairos-sidepanel' });
      const card = createElement('div', { className: 'kairos-sp-card' });

      // Header
      const header = this.buildHeader();
      card.appendChild(header);

      // Body
      const body = this.buildBody();
      card.appendChild(body);

      container.appendChild(card);
      return container;
    }

    /**
     * Builds the header section
     * @returns {HTMLElement} Header element
     */
    buildHeader() {
      const header = createElement('div', { className: 'kairos-sp-header' });

      // Brand
      const brand = createElement('div', { className: 'kairos-sp-brand' });
      const logo = createElement('img', { className: 'kairos-sp-logo' });
      logo.src = chrome.runtime.getURL('icons/icon.png');
      logo.alt = 'Kairos';
      brand.appendChild(logo);

      const title = createElement('span', { className: 'kairos-sp-title', text: 'Kairos' });
      brand.appendChild(title);

      // Subtitle Badge
      const subBadge = createElement('span', { 
        className: 'kairos-sp-subtitle-badge', 
        text: 'CC',
        title: 'Captions available for better AI notes'
      });
      brand.appendChild(subBadge);
      this.elements.subBadge = subBadge;

      header.appendChild(brand);

      // Toggle button
      const toggle = createElement('button', { className: 'kairos-sp-toggle', title: 'Toggle panel' });
      toggle.appendChild(createSvgIcon('M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z'));
      header.appendChild(toggle);

      this.elements.toggle = toggle;
      return header;
    }

    /**
     * Builds the body section
     * @returns {HTMLElement} Body element
     */
    buildBody() {
      const body = createElement('div', { className: 'kairos-sp-body' });

      // Video info
      const videoInfo = createElement('div', { className: 'kairos-sp-video-info' });
      const videoTitle = createElement('div', { className: 'kairos-sp-video-title', text: 'Loading...' });
      const noteCount = createElement('div', { className: 'kairos-sp-note-count', text: '0 notes' });
      videoInfo.appendChild(videoTitle);
      videoInfo.appendChild(noteCount);
      body.appendChild(videoInfo);

      this.elements.videoTitle = videoTitle;
      this.elements.noteCount = noteCount;

      // Notes list
      const notesList = createElement('div', { className: 'kairos-sp-notes-list' });
      notesList.appendChild(this.buildEmptyState());
      body.appendChild(notesList);

      this.elements.notesList = notesList;

      // Actions
      const actions = createElement('div', { className: 'kairos-sp-actions' });

      // Export button
      const exportBtn = createElement('button', {
        className: 'kairos-sp-btn kairos-sp-btn-primary',
        id: 'kairos-sp-export'
      });
      exportBtn.appendChild(createSvgIcon('M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z'));
      exportBtn.appendChild(createElement('span', { text: 'Export Markdown' }));
      actions.appendChild(exportBtn);

      this.elements.exportBtn = exportBtn;

      // Dashboard button
      const dashboardBtn = createElement('button', {
        className: 'kairos-sp-btn kairos-sp-btn-secondary',
        id: 'kairos-sp-dashboard'
      });
      dashboardBtn.appendChild(createSvgIcon('M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z'));
      dashboardBtn.appendChild(createElement('span', { text: 'Open Dashboard' }));
      actions.appendChild(dashboardBtn);

      this.elements.dashboardBtn = dashboardBtn;

      body.appendChild(actions);
      return body;
    }

    /**
     * Builds empty state element
     * @returns {HTMLElement} Empty state element
     */
    buildEmptyState() {
      const empty = createElement('div', { className: 'kairos-sp-empty' });
      empty.appendChild(createElement('span', { className: 'kairos-sp-empty-icon', text: '📝' }));
      empty.appendChild(createElement('span', { text: 'No notes yet' }));
      empty.appendChild(createElement('span', { className: 'kairos-sp-empty-hint', text: 'Click the orb to capture moments' }));
      return empty;
    }

    /**
     * Builds a note item element
     * @param {Object} note - Note data
     * @returns {HTMLElement} Note item element
     */
    buildNoteItem(note) {
      const item = createElement('div', { className: 'kairos-sp-note-item' });
      item.dataset.id = note.id;
      item.dataset.timestamp = String(note.timestamp);

      // Time badge
      const time = createElement('span', {
        className: 'kairos-sp-note-time',
        text: note.timeLabel || Utils.formatTime(note.timestamp)
      });
      item.appendChild(time);

      // Content
      const contentText = note.content || note.note || '(Empty note)';
      const content = createElement('span', {
        className: 'kairos-sp-note-content'
      });
      content.innerHTML = SimpleMarkdown.parse(contentText);
      item.appendChild(content);

      // Delete button
      const deleteBtn = createElement('button', { className: 'kairos-sp-note-delete', title: 'Delete note' });
      deleteBtn.appendChild(createSvgIcon('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z', 14));
      item.appendChild(deleteBtn);

      return item;
    }

    /**
     * Injects CSS styles into the page
     */
    injectStyles() {
      if (document.getElementById('kairos-sidepanel-styles')) return;

      const style = document.createElement('style');
      style.id = 'kairos-sidepanel-styles';
      style.textContent = `
        #kairos-sidepanel {
          margin-bottom: 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
          position: relative;
          z-index: 1;
          pointer-events: auto;
          isolation: isolate;
        }

        /* Bilibili specific adjustments */
        .right-container #kairos-sidepanel,
        .right-container-inner #kairos-sidepanel {
          margin: 0 0 12px 0;
          padding: 0 12px;
          box-sizing: border-box;
        }

        .kairos-sp-card {
          background: linear-gradient(145deg, rgb(20, 20, 22), rgb(30, 30, 35));
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
          pointer-events: auto;
          /* Note: backdrop-filter removed to prevent interference with Bilibili image loading */
        }

        .kairos-sp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .kairos-sp-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .kairos-sp-logo {
          width: 24px;
          height: 24px;
          border-radius: 6px;
        }

        .kairos-sp-title {
          font-size: 15px;
          font-weight: 600;
          background: linear-gradient(135deg, #00f2ff 0%, #bd00ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .kairos-sp-subtitle-badge {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          font-weight: 600;
          letter-spacing: 0.05em;
          transition: all 0.3s ease;
          display: none; /* Hidden by default */
        }

        .kairos-sp-subtitle-badge.available {
          display: inline-block;
          background: rgba(0, 242, 255, 0.05);
          color: rgba(0, 242, 255, 0.6);
          border-color: rgba(0, 242, 255, 0.2);
        }

        .kairos-sp-subtitle-badge.active {
          background: rgba(0, 242, 255, 0.15);
          color: #00f2ff;
          border-color: rgba(0, 242, 255, 0.4);
          box-shadow: 0 0 8px rgba(0, 242, 255, 0.2);
        }

        .kairos-sp-toggle {
          width: 28px;
          height: 28px;
          border: none;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .kairos-sp-toggle:hover {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
        }

        .kairos-sp-toggle svg {
          transition: transform 0.3s ease;
        }

        .kairos-sp-card.collapsed .kairos-sp-toggle svg {
          transform: rotate(-90deg);
        }

        .kairos-sp-card.collapsed .kairos-sp-body {
          display: none;
        }

        .kairos-sp-body {
          padding: 16px;
        }

        .kairos-sp-video-info {
          margin-bottom: 16px;
        }

        .kairos-sp-video-title {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin-bottom: 6px;
        }

        .kairos-sp-note-count {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
        }

        .kairos-sp-notes-list {
          max-height: 240px;
          overflow-y: auto;
          margin-bottom: 16px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.2) transparent;
        }

        .kairos-sp-notes-list::-webkit-scrollbar {
          width: 4px;
        }

        .kairos-sp-notes-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .kairos-sp-notes-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
        }

        .kairos-sp-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          color: rgba(255, 255, 255, 0.3);
          font-size: 13px;
          text-align: center;
          gap: 8px;
        }

        .kairos-sp-empty-icon {
          font-size: 28px;
          opacity: 0.6;
        }

        .kairos-sp-empty-hint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.2);
        }

        .kairos-sp-note-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          margin-bottom: 8px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.04);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .kairos-sp-note-item:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(0, 242, 255, 0.2);
        }

        .kairos-sp-note-item:last-child {
          margin-bottom: 0;
        }

        .kairos-sp-note-time {
          flex-shrink: 0;
          font-size: 11px;
          font-weight: 600;
          color: #00f2ff;
          background: rgba(0, 242, 255, 0.1);
          padding: 4px 8px;
          border-radius: 6px;
          font-family: 'SF Mono', 'Menlo', monospace;
        }

        .kairos-sp-note-content {
          flex: 1;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .kairos-sp-note-delete {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.3);
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: all 0.2s ease;
        }

        .kairos-sp-note-item:hover .kairos-sp-note-delete {
          opacity: 1;
        }

        .kairos-sp-note-delete:hover {
          background: rgba(255, 80, 80, 0.15);
          color: #ff6b6b;
        }

        .kairos-sp-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .kairos-sp-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px 16px;
          border: none;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
        }

        .kairos-sp-btn-primary {
          background: linear-gradient(135deg, #00d4ff 0%, #0099ff 100%);
          color: #000;
          box-shadow: 0 2px 12px rgba(0, 212, 255, 0.3);
        }

        .kairos-sp-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(0, 212, 255, 0.4);
        }

        .kairos-sp-btn-primary:active {
          transform: translateY(0);
        }

        .kairos-sp-btn-secondary {
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .kairos-sp-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .kairos-sp-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }

        @keyframes kairos-sp-note-appear {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .kairos-sp-note-item.new {
          animation: kairos-sp-note-appear 0.3s ease-out;
        }
      `;
      document.head.appendChild(style);
    }

    /**
     * Binds event listeners
     */
    bindEvents() {
      // Toggle collapse
      this.elements.toggle?.addEventListener('click', () => {
        const card = this.container.querySelector('.kairos-sp-card');
        card.classList.toggle('collapsed');
        this.isExpanded = !card.classList.contains('collapsed');
      });

      // Export button
      this.elements.exportBtn?.addEventListener('click', () => this.exportMarkdown());

      // Dashboard button
      this.elements.dashboardBtn?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
      });

      // Periodically update subtitle badge
      setInterval(() => this.updateSubtitleBadge(), 3000);
    }

    /**
     * Updates the subtitle badge state
     */
    updateSubtitleBadge() {
      if (!this.elements.subBadge || !this.subtitleManager) return;

      const available = this.subtitleManager.isAvailable();
      const active = this.subtitleManager.buffer && this.subtitleManager.buffer.length > 0;

      if (available) {
        this.elements.subBadge.classList.add('available');
        this.elements.subBadge.title = 'Captions available - Turn them on for best AI results';
        
        if (active) {
          this.elements.subBadge.classList.add('active');
          this.elements.subBadge.title = 'Captions active - Kairos is listening';
        } else {
          this.elements.subBadge.classList.remove('active');
        }
      } else {
        this.elements.subBadge.classList.remove('available', 'active');
      }
    }

    /**
     * Loads notes for the current video
     */
    async loadNotes() {
      const info = Utils.getVideoInfo();
      this.currentVideoId = info.videoId;

      if (this.elements.videoTitle) {
        this.elements.videoTitle.textContent = info.title || 'Current Video';
      }

      this.updateSubtitleBadge();

      try {
        this.notes = await this.storage.getNotesForVideo(this.currentVideoId);

        if (this.elements.noteCount) {
          this.elements.noteCount.textContent = `${this.notes.length} note${this.notes.length === 1 ? '' : 's'}`;
        }

        if (this.notes.length > 0) {
          this.notes.sort((a, b) => a.timestamp - b.timestamp);
          this.renderNotes();
          if (this.elements.exportBtn) this.elements.exportBtn.disabled = false;
        } else {
          this.renderEmptyState();
          if (this.elements.exportBtn) this.elements.exportBtn.disabled = true;
        }
      } catch (err) {
        log('Failed to load notes:', err);
        this.renderEmptyState('Error loading notes');
        if (this.elements.exportBtn) this.elements.exportBtn.disabled = true;
      }
    }

    /**
     * Renders the notes list
     */
    renderNotes() {
      const list = this.elements.notesList;
      if (!list) return;

      // Clear list
      while (list.firstChild) {
        list.removeChild(list.firstChild);
      }

      // Add note items
      this.notes.forEach(note => {
        const item = this.buildNoteItem(note);
        this.bindNoteItemEvents(item, note);
        list.appendChild(item);
      });
    }

    /**
     * Renders empty state
     * @param {string} message - Optional custom message
     */
    renderEmptyState(message) {
      const list = this.elements.notesList;
      if (!list) return;

      while (list.firstChild) {
        list.removeChild(list.firstChild);
      }

      if (message) {
        const empty = createElement('div', { className: 'kairos-sp-empty', text: message });
        list.appendChild(empty);
      } else {
        list.appendChild(this.buildEmptyState());
      }
    }

    /**
     * Binds events to a note item
     * @param {HTMLElement} item - Note item element
     * @param {Object} note - Note data
     */
    bindNoteItemEvents(item, note) {
      // Click to seek
      item.addEventListener('click', (e) => {
        if (e.target.closest('.kairos-sp-note-delete')) return;

        const video = document.querySelector('video');
        if (video && !isNaN(note.timestamp)) {
          video.currentTime = note.timestamp;
          video.play();
        }
      });

      // Delete button
      const deleteBtn = item.querySelector('.kairos-sp-note-delete');
      deleteBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this note?')) {
          try {
            await this.storage.deleteNote(note.id);
            item.style.opacity = '0';
            item.style.transform = 'translateX(20px)';
            setTimeout(() => {
              item.remove();
              this.notes = this.notes.filter(n => n.id !== note.id);
              this.updateNoteCount();
            }, 200);
          } catch (err) {
            log('Failed to delete note:', err);
          }
        }
      });
    }

    /**
     * Updates the note count display
     */
    updateNoteCount() {
      if (this.elements.noteCount) {
        this.elements.noteCount.textContent = `${this.notes.length} note${this.notes.length === 1 ? '' : 's'}`;
      }

      if (this.notes.length === 0) {
        this.renderEmptyState();
        if (this.elements.exportBtn) this.elements.exportBtn.disabled = true;
      }
    }

    /**
     * Refreshes the notes list
     */
    refresh() {
      this.loadNotes();
    }

    /**
     * Adds a new note to the list with animation
     * @param {Object} note - Note data
     */
    addNote(note) {
      this.notes.push(note);
      this.notes.sort((a, b) => a.timestamp - b.timestamp);

      const list = this.elements.notesList;
      if (!list) return;

      // Clear empty state if present
      const emptyState = list.querySelector('.kairos-sp-empty');
      if (emptyState) {
        list.removeChild(emptyState);
      }

      // Find insertion position
      const index = this.notes.findIndex(n => n.id === note.id);
      const newItem = this.buildNoteItem(note);
      newItem.classList.add('new');
      this.bindNoteItemEvents(newItem, note);

      const existingItems = list.querySelectorAll('.kairos-sp-note-item');
      if (existingItems.length === 0 || index >= existingItems.length) {
        list.appendChild(newItem);
      } else {
        list.insertBefore(newItem, existingItems[index]);
      }

      this.updateNoteCount();
      if (this.elements.exportBtn) this.elements.exportBtn.disabled = false;
    }

    /**
     * Exports notes to Markdown file
     */
    exportMarkdown() {
      if (!this.notes || this.notes.length === 0) return;

      const info = Utils.getVideoInfo();
      const date = new Date().toLocaleDateString();

      let md = `# ${info.title}\n\n`;
      md += `**Source**: [${info.url}](${info.url})\n`;
      md += `**Captured**: ${date}\n\n`;
      md += `---\n\n`;

      this.notes.forEach(note => {
        const time = note.timeLabel || Utils.formatTime(note.timestamp);
        const content = note.content || note.note || '';
        md += `### ${time}\n`;
        md += `${content}\n\n`;
      });

      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Kairos-${this.currentVideoId}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    /**
     * Sets up URL change listener for SPA navigation
     */
    setupUrlChangeListener() {
      let lastUrl = window.location.href;

      setInterval(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          log('SidePanel: URL changed, reinitializing...');
          this.retryCount = 0;
          setTimeout(() => {
            this.injectPanel();
          }, 1000);
        }
      }, 1000);
    }

    /**
     * Sets up MutationObserver to watch for DOM changes
     * Re-injects panel if the secondary column is recreated
     */
    setupMutationObserver() {
      if (this.observer) {
        this.observer.disconnect();
      }

      let pendingReinject = false;

      this.observer = new MutationObserver((mutations) => {
        // Skip if already pending
        if (pendingReinject) return;

        // Only check if our panel was removed - don't react to other DOM changes
        const panelExists = document.getElementById('kairos-sidepanel');

        if (!panelExists && this.container) {
          pendingReinject = true;
          log('SidePanel: Panel was removed from DOM, re-injecting...');
          this.retryCount = 0;
          this.container = null;
          this.elements = {};
          setTimeout(() => {
            pendingReinject = false;
            this.injectPanel();
          }, 500);
          return;
        }

        // For YouTube SPA navigation, check if secondary container was recreated
        // Only for YouTube - Bilibili doesn't need this aggressive re-injection
        if (window.location.href.includes('youtube.com')) {
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const el = node;
                  const isYouTubeContainer = el.id === 'secondary' || el.id === 'related' ||
                      el.id === 'secondary-inner';

                  if (isYouTubeContainer && !panelExists) {
                    pendingReinject = true;
                    log('SidePanel: YouTube container recreated, injecting panel...');
                    this.retryCount = 0;
                    this.container = null;
                    this.elements = {};
                    setTimeout(() => {
                      pendingReinject = false;
                      this.injectPanel();
                    }, 500);
                    return;
                  }
                }
              }
            }
          }
        }
      });

      // Observe the body for child list changes, but NOT subtree for Bilibili
      // to avoid interfering with Vue's reactivity and lazy loading
      if (window.location.href.includes('bilibili.com')) {
        // For Bilibili: only observe direct children of body, not subtree
        this.observer.observe(document.body, {
          childList: true,
          subtree: false
        });
      } else {
        // For YouTube: observe subtree for SPA navigation
        this.observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    }

    /**
     * Sets up periodic check to ensure panel exists
     * Fallback for cases MutationObserver misses
     */
    setupPresenceCheck() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }

      // For Bilibili: use less aggressive checking to avoid interfering with lazy loading
      const isBilibili = window.location.href.includes('bilibili.com');

      // Check more frequently at first, then slow down
      let checkCount = 0;
      let lastPanelState = !!document.getElementById('kairos-sidepanel');

      const doCheck = () => {
        checkCount++;
        const panel = document.getElementById('kairos-sidepanel');
        const panelExists = !!panel;

        // Only re-inject if panel was previously present but now missing
        // This avoids re-injecting during initial page load
        if (lastPanelState && !panelExists) {
          const target = this.getInjectionPoint();
          if (target) {
            log('SidePanel: Panel missing (check #' + checkCount + '), re-injecting...');
            this.retryCount = 0;
            this.container = null;
            this.elements = {};
            this.injectPanel();
          }
        }

        lastPanelState = panelExists;
      };

      // Rapid checks for the first few seconds
      const rapidCheckInterval = isBilibili ? 1000 : 500;  // Slower for Bilibili
      const rapidCheckDuration = isBilibili ? 5000 : 10000;  // Shorter for Bilibili

      const rapidCheck = setInterval(() => {
        doCheck();
      }, rapidCheckInterval);

      setTimeout(() => {
        clearInterval(rapidCheck);
      }, rapidCheckDuration);

      // Then continue with slower periodic checks
      const slowCheckInterval = isBilibili ? 5000 : 3000;  // Even slower for Bilibili
      this.checkInterval = setInterval(() => {
        doCheck();
      }, slowCheckInterval);
    }

    /**
     * Destroys the side panel
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
      if (this.container) {
        this.container.remove();
        this.container = null;
      }
      const styles = document.getElementById('kairos-sidepanel-styles');
      if (styles) styles.remove();
    }
  }

  // Export to global namespace
  window.Kairos.SidePanelManager = SidePanelManager;

})();
