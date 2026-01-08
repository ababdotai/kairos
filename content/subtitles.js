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
      // Selectors for YouTube
      this.containerSelector = '.ytp-caption-window-container';
      this.segmentSelector = '.ytp-caption-segment';
      this.pollInterval = null;
    }

    init() {
      log('SubtitleManager: Initializing...');
      this.startObserving();
    }

    startObserving() {
      const container = document.querySelector(this.containerSelector);
      if (container) {
        log('SubtitleManager: Container found, attaching observer.');
        this._attachObserver(container);
      } else {
        // Poll for container presence (e.g. if user enables captions later)
        if (!this.pollInterval) {
          this.pollInterval = setInterval(() => {
            const c = document.querySelector(this.containerSelector);
            if (c) {
              log('SubtitleManager: Container found via polling.');
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
        for (const mutation of mutationsList) {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
             this._captureCurrentCaption(targetNode);
          }
        }
      });

      this.observer.observe(targetNode, config);
    }

    _captureCurrentCaption(container) {
      // Get all segments
      const segments = container.querySelectorAll(this.segmentSelector);
      if (!segments.length) return;

      // Extract text
      let currentText = '';
      segments.forEach(seg => {
        currentText += seg.innerText + ' ';
      });
      currentText = currentText.trim();

      if (!currentText) return;

      // Avoid duplicate consecutive entries
      const lastEntry = this.buffer[this.buffer.length - 1];
      if (lastEntry && lastEntry.text === currentText) {
          // Just update timestamp if it's the exact same text block persisting?
          // Actually, YouTube updates segments dynamically. 
          // Usually we get partials "Hello", "Hello world", "Hello world."
          // Simplest approach: Add it, then debouncing or deduplication logic on getContext?
          // Let's just add new unique strings for now.
          return; 
      }
      
      // If the new text contains the old text, replace the old one (growing sentence)
      if (lastEntry && currentText.startsWith(lastEntry.text)) {
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
