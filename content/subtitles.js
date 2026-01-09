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
        this.containerSelector = '.bpx-player-subtitle-panel';
        this.segmentSelector = '.bpx-player-subtitle-content'; 
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
            
            // Bilibili Fallback (Old Player)
            if (!c && this.platform === 'bilibili') {
               c = document.querySelector('.bilibili-player-video-subtitle');
               if (c) {
                 this.containerSelector = '.bilibili-player-video-subtitle'; // Update selector
                 this.segmentSelector = 'span'; // Usually spans in old player
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
        // Bilibili modern player - check if subtitle panel is visible
        const panel = document.querySelector('.bpx-player-subtitle-panel');
        if (panel) {
          // Check if panel has content or is not hidden
          const hasContent = panel.textContent.trim().length > 0;
          const isVisible = window.getComputedStyle(panel).display !== 'none';
          return hasContent || isVisible;
        }

        // Old player fallback - check if subtitle container exists and has content
        const oldPanel = document.querySelector('.bilibili-player-video-subtitle');
        if (oldPanel) {
          const hasContent = oldPanel.textContent.trim().length > 0;
          const isVisible = window.getComputedStyle(oldPanel).display !== 'none';
          return hasContent || isVisible;
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
