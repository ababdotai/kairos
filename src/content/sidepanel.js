/**
 * Kairos Side Panel Module
 * Injects a panel into the video page sidebar to display notes
 * Uses pure DOM API to comply with YouTube's CSP (no innerHTML)
 */

(function () {
  'use strict';
  const { t } = window.Kairos.I18n;

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
      this.container.hidden = !!document.fullscreenElement;

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
      logo.alt = t("Kairos: AI Video Notepad");
      brand.appendChild(logo);

      const title = createElement('span', { className: 'kairos-sp-title', text: 'Kairos', title: t("Kairos: AI Video Notepad") });
      const brandCopy = createElement('div', { className: 'kairos-sp-brand-copy' });
      brandCopy.appendChild(title);
      brandCopy.appendChild(createElement('span', { className: 'kairos-sp-tagline', text: t('Watch together. Remember more.') }));
      brand.appendChild(brandCopy);

      // Subtitle Badge
      const subBadge = createElement('span', {
        className: 'kairos-sp-subtitle-badge',
        text: 'CC',
        title: t("Captions available for better AI notes")
      });
      brand.appendChild(subBadge);
      this.elements.subBadge = subBadge;

      header.appendChild(brand);

      // Header Actions (Right)
      const headerActions = createElement('div', { className: 'kairos-sp-header-actions' });

      // Export Button
      const exportBtn = createElement('button', { 
          className: 'kairos-sp-header-btn', 
          title: t("Export Markdown"),
          id: 'kairos-sp-export' 
      });
      exportBtn.appendChild(createSvgIcon('M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z', 18));
      headerActions.appendChild(exportBtn);
      this.elements.exportBtn = exportBtn;

      // Dashboard Button
      const dashboardBtn = createElement('button', { 
          className: 'kairos-sp-header-btn', 
          title: t("My Notes"),
          id: 'kairos-sp-dashboard'
      });
      dashboardBtn.appendChild(createSvgIcon('M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z', 16));
      headerActions.appendChild(dashboardBtn);
      this.elements.dashboardBtn = dashboardBtn;

      // Settings Button
      const settingsBtn = createElement('button', { 
          className: 'kairos-sp-header-btn', 
          title: t("Settings"),
          id: 'kairos-sp-settings'
      });
      settingsBtn.appendChild(createSvgIcon('M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.57,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.08-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z', 16));
      headerActions.appendChild(settingsBtn);
      this.elements.settingsBtn = settingsBtn;

      // Toggle button
      const toggle = createElement('button', { className: 'kairos-sp-toggle', title: t("Toggle panel") });
      toggle.appendChild(createSvgIcon('M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z'));
      headerActions.appendChild(toggle);
      this.elements.toggle = toggle;

      header.appendChild(headerActions);
      return header;
    }

    /**
     * Builds the body section
     * @returns {HTMLElement} Body element
     */
    buildBody() {
      const body = createElement('div', { className: 'kairos-sp-body' });

      // Video info (Title + Badge)
      const videoInfo = createElement('div', { className: 'kairos-sp-video-info' });
      
      const titleRow = createElement('div', { className: 'kairos-sp-title-row' });
      const videoTitle = createElement('div', { className: 'kairos-sp-video-title', text: t("Loading...") });
      
      const badge = createElement('span', { className: 'kairos-sp-count-badge', text: '0' });
      
      titleRow.appendChild(videoTitle);
      titleRow.appendChild(badge);
      videoInfo.appendChild(titleRow);
      
      body.appendChild(videoInfo);

      this.elements.videoTitle = videoTitle;
      this.elements.noteCountBadge = badge;

      // Notes list
      const notesList = createElement('div', { className: 'kairos-sp-notes-list' });
      notesList.appendChild(this.buildEmptyState());
      body.appendChild(notesList);

      this.elements.notesList = notesList;

      // Help / Tips Section
      body.appendChild(this.buildHelpSection());

      return body;
    }

    /**
     * Builds the help/tips section
     * @returns {HTMLElement} Help element
     */
    buildHelpSection() {
        const help = createElement('div', { className: 'kairos-sp-help' });
        help.appendChild(createElement('div', { className: 'kairos-sp-help-title', text: t('Quick Actions') }));
        
        const items = [
            { icon: 'icons/icon.png', key: t('Click Enable'), text: t('to activate kairos') },
            { icon: 'icons/keyboard_key_k.png', key: t('Start Typing'), text: t('to take a note · Esc to exit') },
            { icon: 'icons/mouse-double-click.png', key: t('Left-drag on Video'), text: t('to capture a region') },
            { icon: 'icons/ai_enhanced_input.png', key: t('Enter without Input'), text: t('to trigger AI note') },
        ];

        items.forEach(item => {
            const row = createElement('div', { className: 'kairos-sp-help-item' });
            
            const img = document.createElement('img');
            img.src = chrome.runtime.getURL(item.icon);
            img.className = 'kairos-sp-help-img';
            img.alt = '';
            
            row.appendChild(img);
            const text = createElement('div', { className: 'kairos-sp-help-text' });
            text.appendChild(createElement('kbd', { text: item.key }));
            text.appendChild(createElement('span', { text: item.text }));
            row.appendChild(text);
            help.appendChild(row);
        });

        return help;
    }

    /**
     * Builds empty state element
     * @returns {HTMLElement} Empty state element
     */
    buildEmptyState() {
      const empty = createElement('div', { className: 'kairos-sp-empty' });
      empty.appendChild(createElement('span', { className: 'kairos-sp-empty-icon', text: '📝' }));
      empty.appendChild(createElement('span', { text: t("No notes yet") }));
      empty.appendChild(createElement('span', { className: 'kairos-sp-empty-hint', text: t("Click Enable in the island to start") }));
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

      // Timeline Dot
      const dot = createElement('div', { className: 'kairos-sp-timeline-dot' });
      item.appendChild(dot);

      // Note Body Container
      const body = createElement('div', { className: 'kairos-sp-note-body' });

      // Header: Time + Badge
      const header = createElement('div', { className: 'kairos-sp-note-header' });
      
      const time = createElement('span', {
        className: 'kairos-sp-note-time',
        text: note.timeLabel || Utils.formatTime(note.timestamp)
      });
      header.appendChild(time);

      const source = note.source || 'user';
      const badgeText = source === 'ai' ? 'AI' : t("YOU");
      const badge = createElement('span', {
        className: `kairos-badge ${source} mini`,
        text: badgeText
      });
      header.appendChild(badge);

      body.appendChild(header);

      // Content
      const contentText = note.content || note.note || t("(Empty note)");
      const content = createElement('div', {
        className: 'kairos-sp-note-content'
      });
      content.innerHTML = SimpleMarkdown.parse(contentText);
      body.appendChild(content);

      item.appendChild(body);

      // Delete button (Absolute positioned)
      const deleteBtn = createElement('button', { className: 'kairos-sp-note-delete', title: t("Delete note") });
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
          --kairos-accent-start: #4fb6c8;
          --kairos-accent-end: #5a7bd8;
          --kairos-accent-ink: #0d1418;

          /* Default Theme (Dark) */
          --kairos-sp-bg: linear-gradient(145deg, rgb(22, 23, 26), rgb(28, 30, 34));
          --kairos-sp-text: rgba(255, 255, 255, 0.9);
          --kairos-sp-text-muted: rgba(255, 255, 255, 0.5);
          --kairos-sp-border: rgba(255, 255, 255, 0.06);
          --kairos-sp-item-bg: rgba(255, 255, 255, 0.03);
          --kairos-sp-header-bg: rgba(255, 255, 255, 0.015);
          --kairos-sp-timeline-line: rgba(255, 255, 255, 0.1);
        }

        @media (prefers-color-scheme: light) {
          #kairos-sidepanel {
            --kairos-sp-bg: linear-gradient(145deg, rgb(255, 255, 255), rgb(245, 245, 245));
            --kairos-sp-text: #1a1a1a;
            --kairos-sp-text-muted: rgba(0, 0, 0, 0.5);
            --kairos-sp-border: rgba(0, 0, 0, 0.08);
            --kairos-sp-item-bg: rgba(0, 0, 0, 0.03);
            --kairos-sp-header-bg: rgba(0, 0, 0, 0.01);
            --kairos-sp-timeline-line: rgba(0, 0, 0, 0.1);
          }
        }

        /* Bilibili specific adjustments */
        .right-container #kairos-sidepanel,
        .right-container-inner #kairos-sidepanel {
          margin: 0 0 12px 0;
          padding: 0 12px;
          box-sizing: border-box;
        }

        .kairos-sp-card {
          background: var(--kairos-sp-bg);
          border-radius: 16px;
          border: 1px solid var(--kairos-sp-border);
          overflow: hidden;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
          pointer-events: auto;
        }

        .kairos-sp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--kairos-sp-border);
          background: var(--kairos-sp-header-bg);
        }

        .kairos-sp-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .kairos-sp-logo {
          width: 20px;
          height: 20px;
          border-radius: 5px;
        }

        .kairos-sp-title {
          font-size: 14px;
          font-weight: 600;
          background: linear-gradient(135deg, var(--kairos-accent-start) 0%, var(--kairos-accent-end) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .kairos-sp-subtitle-badge {
          font-size: 9px;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(128, 128, 128, 0.05);
          color: var(--kairos-sp-text-muted);
          border: 1px solid var(--kairos-sp-border);
          font-weight: 600;
          letter-spacing: 0.02em;
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

        .kairos-sp-header-actions {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .kairos-sp-header-btn, .kairos-sp-toggle {
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          border-radius: 6px;
          color: var(--kairos-sp-text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .kairos-sp-header-btn:hover, .kairos-sp-toggle:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--kairos-sp-text);
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
          padding: 12px 14px;
        }

        .kairos-sp-video-info {
          margin-bottom: 12px;
        }

        .kairos-sp-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .kairos-sp-video-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--kairos-sp-text);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          flex: 1;
        }

        .kairos-sp-count-badge {
          display: none;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--kairos-accent-start) 0%, var(--kairos-accent-end) 100%);
          color: var(--kairos-accent-ink);
          font-size: 10px;
          font-weight: 700;
          height: 18px;
          min-width: 18px;
          padding: 0 6px;
          border-radius: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }

         .kairos-sp-note-count {
          font-size: 12px;
          color: var(--kairos-sp-text-muted);
          display: none; /* Deprecated but kept for safety */
        }

        /* Help Section */
        .kairos-sp-help {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--kairos-sp-border);
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 6px;
        }

        .kairos-sp-help-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: var(--kairos-sp-text-muted);
          background: var(--kairos-sp-item-bg);
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--kairos-sp-border);
        }

        .kairos-sp-help-img {
          width: 16px;
          height: 16px;
          object-fit: contain;
          opacity: 0.95;
          background: #ffffff;
          padding: 1px;
          border-radius: 3px;
        }
        
        /* Dark mode invert for black icons if needed, but assuming PNGs are colored or white-friendly. 
           If they are black text on transparent, we might need inversion in dark mode. 
           Let's assume they are designed for the UI. */

        /* Timeline Container */
        .kairos-sp-notes-list {
          max-height: 320px;
          overflow-y: auto;
          margin-bottom: 12px;
          padding-left: 24px; /* More compact padding */
          position: relative;
          scrollbar-width: thin;
          scrollbar-color: var(--kairos-sp-border) transparent;
        }

        /* Vertical Line Segment */
        .kairos-sp-note-item::before {
          content: '';
          position: absolute;
          left: -12px; /* Center of 24px padding */
          top: 0;
          bottom: -10px; /* Extend to cover the margin gap */
          width: 1px;
          background: var(--kairos-sp-timeline-line);
          z-index: 1;
        }

        .kairos-sp-note-item:first-child::before {
          top: 14px; /* Starts at the center of the first dot */
        }

        .kairos-sp-note-item:last-child::before {
          bottom: auto;
          height: 14px; /* Ends at the center of the last dot */
        }
        
        /* Single item case: hide line */
        .kairos-sp-note-item:first-child:last-child::before {
          display: none;
        }

        .kairos-sp-notes-list::-webkit-scrollbar {
          width: 4px;
        }

        .kairos-sp-notes-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .kairos-sp-notes-list::-webkit-scrollbar-thumb {
          background: var(--kairos-sp-border);
          border-radius: 2px;
        }

        /* Note Item */
        .kairos-sp-note-item {
          position: relative;
          margin-bottom: 10px;
          padding-left: 0;
          transition: all 0.2s ease;
          cursor: pointer; /* Interaction hint */
        }

        .kairos-sp-note-item:last-child {
          margin-bottom: 0;
        }

        /* Timeline Dot */
        .kairos-sp-timeline-dot {
          position: absolute;
          left: -12px; /* Aligns with the 12px line center relative to 24px padding */
          transform: translateX(-50%);
          top: 14px; /* Aligned with note header */
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--kairos-sp-bg);
          border: 2px solid var(--kairos-accent-start);
          z-index: 2;
          box-shadow: 0 0 0 2px var(--kairos-sp-bg);
          transition: all 0.2s ease;
        }
        
        .kairos-sp-note-item:hover .kairos-sp-timeline-dot {
          transform: translateX(-50%) scale(1.2);
          box-shadow: 0 0 0 2px var(--kairos-sp-bg), 0 0 8px rgba(79, 182, 200, 0.4);
        }

        /* Active State (Current Time) */
        .kairos-sp-note-item.active .kairos-sp-timeline-dot {
          background: var(--kairos-accent-start);
          box-shadow: 0 0 0 4px rgba(79, 182, 200, 0.2);
          border-color: var(--kairos-accent-start);
        }

        .kairos-sp-note-body {
          background: var(--kairos-sp-item-bg);
          border-radius: 10px;
          border: 1px solid var(--kairos-sp-border);
          padding: 8px 10px;
          transition: all 0.2s ease;
          position: relative;
        }

        .kairos-sp-note-item:hover .kairos-sp-note-body {
          background: rgba(128, 128, 128, 0.06);
          border-color: rgba(0, 242, 255, 0.2);
        }

        .kairos-sp-note-item.active .kairos-sp-note-body {
          background: rgba(0, 242, 255, 0.06);
          border-color: var(--kairos-accent-start);
        }

        .kairos-sp-note-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 2px;
        }

        .kairos-sp-note-time {
          font-size: 11px;
          font-weight: 700;
          color: var(--kairos-accent-start);
          font-family: 'SF Mono', 'Menlo', monospace;
        }

        /* Mini Badges */
        .kairos-badge.mini {
          padding: 1px 3px;
          font-size: 8px;
          border-radius: 3px;
          line-height: 1;
          height: auto;
          margin-right: 0;
          opacity: 0.8;
        }
        
        .kairos-badge.ai {
          background: rgba(138, 43, 226, 0.15);
          color: #c471ed;
          border: 1px solid rgba(138, 43, 226, 0.3);
        }

        .kairos-badge.user {
          background: rgba(128, 128, 128, 0.15);
          color: var(--kairos-sp-text-muted);
          border: 1px solid var(--kairos-sp-border);
        }

        .kairos-sp-note-content {
          font-size: 12.5px;
          color: var(--kairos-sp-text);
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .kairos-sp-note-delete {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 20px;
          height: 20px;
          border: none;
          background: transparent;
          color: var(--kairos-sp-text-muted);
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: all 0.2s ease;
        }

        .kairos-sp-note-item:hover .kairos-sp-note-delete {
          opacity: 1;
        }
        .kairos-sp-note-delete:focus-visible { opacity: 1; outline: 2px solid currentColor; }
        .kairos-sp-note-delete.is-confirming {
          opacity: 1; width: auto; height: 26px; padding: 0 8px;
          white-space: nowrap; font: 12px/1.4 system-ui;
          color: #dc514b; background: rgba(220,81,75,.12);
        }
        .kairos-sp-note-item:has(.is-confirming) .kairos-sp-note-header { padding-right: 90px; }

        .kairos-sp-note-delete:hover {
          background: rgba(255, 80, 80, 0.15);
          color: #ff6b6b;
        }

        .kairos-sp-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .kairos-sp-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          border: 1px solid transparent;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
          font-family: inherit;
          position: relative;
          isolation: isolate;
          height: 36px;
        }

        .kairos-sp-btn:active {
          transform: scale(0.98);
        }

        .kairos-sp-btn-primary {
          background: var(--kairos-accent-start);
          color: #fff; /* Always white text on accent */
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 
            0 1px 2px rgba(0, 0, 0, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
        }

        .kairos-sp-btn-primary:hover {
          filter: brightness(1.1);
          box-shadow: 
            0 4px 12px rgba(var(--kairos-accent-start), 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.25);
          transform: translateY(-1px);
        }

        .kairos-sp-btn-secondary {
          background: var(--kairos-sp-item-bg);
          color: var(--kairos-sp-text);
          border: 1px solid var(--kairos-sp-border);
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .kairos-sp-btn-secondary:hover {
          background: var(--kairos-sp-border);
          border-color: var(--kairos-sp-text-muted);
        }

        .kairos-sp-btn-accent {
          background: rgba(255, 255, 255, 0.05);
          color: var(--kairos-sp-text);
          border: 1px solid var(--kairos-sp-border);
          backdrop-filter: blur(10px);
        }

        .kairos-sp-btn-accent:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: var(--kairos-sp-text-muted);
        }

        .kairos-sp-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: none !important;
        }

        .kairos-sp-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          color: var(--kairos-sp-text-muted);
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
          color: var(--kairos-sp-text-muted);
          opacity: 0.7;
        }

        /* Animation */
        @keyframes kairos-sp-note-appear {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .kairos-sp-note-item.new {
          animation: kairos-sp-note-appear 0.3s ease-out;
        }

        /* Shared glass and quiet playback indicators with the video island. */
        #kairos-sidepanel {
          --kairos-sp-text: #eef3fa;
          --kairos-sp-text-muted: #b5c1ce;
          --kairos-sp-border: #ffffff20;
          --kairos-sp-item-bg: #ffffff06;
          --kairos-sp-header-bg: #ffffff04;
          color-scheme: dark;
        }
        #kairos-sidepanel .kairos-sp-card {
          background: linear-gradient(145deg, #ffffff12, #ffffff03), rgba(20,27,37,.84);
          backdrop-filter: blur(14px) saturate(150%);
          -webkit-backdrop-filter: blur(14px) saturate(150%);
          border: 1px solid #ffffff38; border-radius: 22px;
          box-shadow: inset 0 1px #ffffff30, 0 8px 24px #0002;
        }
        #kairos-sidepanel .kairos-sp-header { min-height: 54px; box-sizing: border-box; gap: 8px; }
        #kairos-sidepanel .kairos-sp-brand { min-width: 0; }
        #kairos-sidepanel .kairos-sp-brand-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        #kairos-sidepanel .kairos-sp-tagline { font-size: 10px; line-height: 1.4; color: #b8cbdc; }
        #kairos-sidepanel .kairos-sp-title { background: none; -webkit-text-fill-color: currentColor; color: #fff; letter-spacing: .025em; }
        #kairos-sidepanel .kairos-sp-logo { width: 23px; height: 23px; }
        #kairos-sidepanel .kairos-sp-header-actions { flex-shrink: 0; }
        #kairos-sidepanel .kairos-sp-subtitle-badge { color: #d5e2ec; background: #ffffff0a; border-color: #ffffff26; box-shadow: none; }
        #kairos-sidepanel .kairos-sp-subtitle-badge.active { color: #a7e7c6; }
        #kairos-sidepanel .kairos-sp-count-badge { background: #ffffff0e; color: #dbe7f1; border: 1px solid #ffffff20; box-shadow: none; }
        #kairos-sidepanel .kairos-sp-video-title { font-size: 13px; line-height: 1.5; font-weight: 500; overflow-wrap: anywhere; }
        #kairos-sidepanel .kairos-sp-notes-list { padding-left: 0; overscroll-behavior: contain; }
        #kairos-sidepanel .kairos-sp-note-item { margin: 0; border-top: 1px solid #ffffff14; }
        #kairos-sidepanel .kairos-sp-note-item::before,
        #kairos-sidepanel .kairos-sp-timeline-dot { display: none; }
        #kairos-sidepanel .kairos-sp-note-body { background: transparent; border: 0; border-radius: 6px; padding: 10px 28px 10px 13px; }
        #kairos-sidepanel .kairos-sp-note-item:hover .kairos-sp-note-body { background: #ffffff08; }
        #kairos-sidepanel .kairos-sp-note-item.active .kairos-sp-note-body { background: linear-gradient(90deg, #ffffff09, transparent); }
        #kairos-sidepanel .kairos-sp-note-item.active::after {
          content: ''; position: absolute; left: 2px; top: 16px;
          border-left: 4px solid #fff; border-top: 3px solid transparent; border-bottom: 3px solid transparent;
        }
        #kairos-sidepanel .kairos-sp-note-time { color: #b8cbdc; font: 500 11px/1.5 system-ui; font-variant-numeric: tabular-nums; }
        #kairos-sidepanel .active .kairos-sp-note-time { color: #fff; font-weight: 600; }
        #kairos-sidepanel .kairos-sp-note-content { line-height: 1.5; overflow-wrap: anywhere; }
        #kairos-sidepanel .kairos-sp-note-content p { margin: 0; }
        #kairos-sidepanel .kairos-sp-note-content ul { margin: 3px 0; padding-left: 16px; }
        #kairos-sidepanel .kairos-badge.mini { background: transparent; border: 0; color: #aab7c5; }
        #kairos-sidepanel .kairos-sp-help { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding-top: 12px; }
        #kairos-sidepanel .kairos-sp-help-title { font: 600 10px/1.5 system-ui; letter-spacing: .07em; color: #b5c1ce; text-transform: uppercase; }
        #kairos-sidepanel .kairos-sp-help-item { display: flex; align-items: flex-start; gap: 8px; padding: 0; border: 0; background: none; font-size: 11px; line-height: 1.6; }
        #kairos-sidepanel .kairos-sp-help-img { flex: 0 0 16px; margin-top: 2px; }
        #kairos-sidepanel .kairos-sp-help-text { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 7px; min-width: 0; color: #b5c1ce; }
        #kairos-sidepanel .kairos-sp-help kbd { font: 11px/1.5 system-ui; color: #e0e8f1; padding: 1px 5px; border: 1px solid #ffffff26; background: #ffffff06; border-radius: 4px; overflow-wrap: anywhere; }
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

      // Settings button
      this.elements.settingsBtn?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
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
      const active = this.subtitleManager.isActive();

      if (available) {
        this.elements.subBadge.classList.add('available');
        this.elements.subBadge.title = t("Captions available - Turn them on for best AI results");

        if (active) {
          this.elements.subBadge.classList.add('active');
          this.elements.subBadge.title = t("Captions active - Kairos is listening");
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
        this.elements.videoTitle.textContent = info.title || t("Current Video");
      }

      this.updateSubtitleBadge();

      try {
        this.notes = await this.storage.getNotesForVideo(this.currentVideoId);

        if (this.elements.noteCountBadge) {
          this.elements.noteCountBadge.textContent = String(this.notes.length);
          this.elements.noteCountBadge.style.display = this.notes.length > 0 ? 'inline-flex' : 'none';
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
        this.renderEmptyState(t("Error loading notes"));
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
      if (deleteBtn) window.Kairos.bindDeleteButton(deleteBtn, async () => {
          try {
            await this.storage.deleteNote(note.id);

            // Notify overlay to remove the pin
            const event = new CustomEvent('kairos-note-deleted', {
              detail: { noteId: note.id }
            });
            window.dispatchEvent(event);

            item.style.opacity = '0';
            item.style.transform = 'translateX(20px)';
            setTimeout(() => {
              item.remove();
              this.notes = this.notes.filter(n => n.id !== note.id);
              this.updateNoteCount();
            }, 200);
          } catch (err) {
            log('Failed to delete note:', err);
            let errorText = item.querySelector('.kairos-delete-error');
            if (!errorText) {
              errorText = createElement('div', { className: 'kairos-delete-error' });
              errorText.setAttribute('role', 'alert');
              errorText.style.cssText = 'padding:6px 12px;color:#ffb7b0;font-size:12px;overflow-wrap:anywhere';
              item.appendChild(errorText);
            }
            errorText.textContent = window.Kairos.deletionError(err);
          }
      });
    }

    /**
     * Updates the note count display
     */
    updateNoteCount() {
      if (this.elements.noteCountBadge) {
        this.elements.noteCountBadge.textContent = String(this.notes.length);
        this.elements.noteCountBadge.style.display = this.notes.length > 0 ? 'inline-flex' : 'none';
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

    /** Keeps the page list out of fullscreen and avoids scrolling the hidden page. */
    setFullscreen(fullscreen) {
      this.isFullscreen = fullscreen;
      if (this.container) this.container.hidden = fullscreen;
    }

    /**
     * Adds a new note to the list with animation
     * @param {Object} note - Note data
     */
    addNote(note) {
      this.notes = this.notes.filter(existing => existing.id !== note.id);
      this.notes.push(note);
      this.notes.sort((a, b) => a.timestamp - b.timestamp);

      const list = this.elements.notesList;
      if (!list) return;
      for (const item of list.querySelectorAll('.kairos-sp-note-item')) {
        if (item.dataset.id === note.id) item.remove();
      }

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
     * Updates the active note based on video time
     * @param {number} currentTime - Current video time in seconds
     */
    updateTime(currentTime) {
      if (this.isFullscreen || document.fullscreenElement) return;
      if (!this.notes || this.notes.length === 0 || !this.elements.notesList) return;

      // Find the active note (closest note before current time)
      let activeNote = null;
      for (let i = this.notes.length - 1; i >= 0; i--) {
        if (this.notes[i].timestamp <= currentTime + 0.5) { // 0.5s buffer
          activeNote = this.notes[i];
          break;
        }
      }

      if (activeNote && activeNote.id !== this.activeNoteId) {
        this.activeNoteId = activeNote.id;
        this.highlightActiveNote();
      }
    }

    /**
     * Highlights the active note element and scrolls to it
     */
    highlightActiveNote() {
      const items = this.elements.notesList.querySelectorAll('.kairos-sp-note-item');
      items.forEach(item => {
        if (item.dataset.id === this.activeNoteId) {
          item.classList.add('active');
          // Scroll to view
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          item.classList.remove('active');
        }
      });
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
