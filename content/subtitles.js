(function (global) {
  'use strict';

  // Ensure Kairos namespace exists
  global.Kairos = global.Kairos || {};
  const { log } = global.Kairos;

  class SubtitleManager {
    constructor() {
      this.buffer = [];
      this.observer = null;
      this.maxAge = 60 * 1000; // 60 seconds
      this.pollInterval = null;

      // Platform detection
      const hostname = window.location.hostname;
      if (hostname.includes('youtube.com')) {
        this.platform = 'youtube';
        this.containerSelector = '.ytp-caption-window-container';
        this.segmentSelector = '.ytp-caption-segment';
      } else if (hostname.includes('bilibili.com')) {
        this.platform = 'bilibili';
        // Bilibili uses bpx-player usually now
        this.containerSelector = '.bili-subtitle-x-subtitle-panel-text, .bpx-player-subtitle-panel-text';
        this.segmentSelector = '.bili-subtitle-item, .bpx-player-subtitle-content'; 
      } else {
        this.platform = 'unknown';
      }
    }

    init() {
      log('SubtitleManager: Initializing...');
      this.startObserving();
    }

    startObserving() {
      if (this.platform === 'unknown') return;

      const container = document.querySelector(this.containerSelector);
      if (container) {
        log(`SubtitleManager: ${this.platform} container found, attaching observer.`);
        this._attachObserver(container);
      } else {
        // Poll for container presence
        if (!this.pollInterval) {
          this.pollInterval = setInterval(() => {
            // Try primary selector
            let c = document.querySelector(this.containerSelector);
            
            // Bilibili Fallback - try multiple selectors
            if (!c && this.platform === 'bilibili') {
               const fallbackSelectors = [
                 '.bili-subtitle-x-subtitle-panel-text',
                 '.bpx-player-subtitle-panel-text',
                 '.bpx-player-subtitle-panel',
                 '.bilibili-player-video-subtitle'
               ];
               for (const sel of fallbackSelectors) {
                 c = document.querySelector(sel);
                 if (c) {
                   this.containerSelector = sel;
                   this.segmentSelector = '.bili-subtitle-item, .bpx-player-subtitle-content, span';
                   break;
                 }
               }
            }

            if (c) {
              log(`SubtitleManager: ${this.platform} container found via polling.`);
              this._attachObserver(c);
              clearInterval(this.pollInterval);
              this.pollInterval = null;
            }
          }, 2000);
        }
      }
    }

    _attachObserver(targetNode) {
      if (this.observer) {
        this.observer.disconnect();
      }

      const config = { childList: true, subtree: true, characterData: true };
      
      this.observer = new MutationObserver((mutationsList) => {
        // Debounce slightly or just capture? 
        // For efficiency, let's just capture.
        this._captureCurrentCaption(targetNode);
      });

      this.observer.observe(targetNode, config);
    }

    _captureCurrentCaption(container) {
      let currentText = '';

      // Try segments first
      const segments = container.querySelectorAll(this.segmentSelector);
      if (segments.length) {
        segments.forEach(seg => {
          currentText += seg.innerText + ' ';
        });
      } else {
        // Fallback: direct text (common in Bilibili simple render)
        currentText = container.innerText;
      }
      
      currentText = currentText.trim();
      if (!currentText) return;

      // Avoid duplicate consecutive entries
      const lastEntry = this.buffer[this.buffer.length - 1];
      
      // Bilibili text usually replaces entirely, unlike YouTube's rolling partials.
      // So if it's the exact same text, ignore.
      if (lastEntry && lastEntry.text === currentText) {
          return; 
      }
      
      // If the new text contains the old text, replace the old one (growing sentence - YouTube style)
      if (lastEntry && currentText.startsWith(lastEntry.text) && currentText.length > lastEntry.text.length) {
          lastEntry.text = currentText;
          lastEntry.timestamp = Date.now();
      } else {
          this.buffer.push({
            text: currentText,
            timestamp: Date.now()
          });
      }
      
      this._pruneBuffer();
    }

    _pruneBuffer() {
      const now = Date.now();
      this.buffer = this.buffer.filter(item => (now - item.timestamp) < this.maxAge);
    }

    /**
     * Checks if subtitles are available for the current video
     * @returns {boolean} True if subtitle button exists
     */
    isAvailable() {
      if (this.platform === 'youtube') {
        const btn = document.querySelector('.ytp-subtitles-button');
        // YouTube button is always there for videos that support it, but check display just in case
        return btn && btn.style.display !== 'none';
      } else if (this.platform === 'bilibili') {
        // Bilibili modern player
        const btn = document.querySelector('.bpx-player-ctrl-subtitle');
        if (btn) return true;
        // Old player fallback
        const oldBtn = document.querySelector('.bilibili-player-video-btn-subtitle');
        return !!oldBtn;
      }
      return false;
    }

    /**
     * Checks if subtitles are currently active (enabled by user)
     * @returns {boolean} True if subtitles are turned on
     */
    isActive() {
      if (this.platform === 'youtube') {
        const btn = document.querySelector('.ytp-subtitles-button');
        // YouTube uses aria-pressed="true" when subtitles are on
        return btn && btn.getAttribute('aria-pressed') === 'true';
      } else if (this.platform === 'bilibili') {
        // Check multiple possible subtitle panel selectors
        const panelSelectors = [
          '.bili-subtitle-x-subtitle-panel-text',
          '.bpx-player-subtitle-panel-text',
          '.bpx-player-subtitle-panel',
          '.bilibili-player-video-subtitle'
        ];

        for (const selector of panelSelectors) {
          const panel = document.querySelector(selector);
          if (panel) {
            // Check if panel has visible text content
            const text = panel.textContent.trim();
            if (text.length > 0) {
              // Also verify it's actually visible
              const style = window.getComputedStyle(panel);
              if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                return true;
              }
            }
          }
        }

        return false;
      }
      return false;
    }

    getContext() {
      this._pruneBuffer();
      // Deduplicate overlapping segments roughly? 
      // YouTube captions often overlap. 
      // Simple join for now, refine later if garbage is high.
      return this.buffer.map(item => item.text).join(' ');
    }

    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
      }
      this.buffer = [];
    }
  }

  global.Kairos.SubtitleManager = SubtitleManager;

})(window);
