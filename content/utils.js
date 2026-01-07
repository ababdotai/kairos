/**
 * Kairos Utils Module
 * Helper functions for video identification and formatting
 */

(function () {
  'use strict';

  const { log } = window.Kairos;

  /**
   * Utility functions for video operations
   */
  const Utils = {
    /**
     * Extracts video ID from current URL based on platform
     * @returns {string} Platform-prefixed video ID
     */
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

    /**
     * Gets comprehensive video information
     * @returns {Object} Video info containing id, url, and title
     */
    getVideoInfo() {
      return {
        videoId: this.getVideoId(),
        url: window.location.href,
        title: document.title.replace(/\(\d+\)\s*/, '').split(' - YouTube')[0].trim()
      };
    },

    /**
     * Formats seconds into HH:MM:SS or MM:SS string
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    formatTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return [h, m, s]
        .filter((v, i) => v > 0 || i > 0)
        .map(v => v.toString().padStart(2, '0'))
        .join(':');
    },

    /**
     * Generates a unique ID using timestamp and random string
     * @returns {string} Unique identifier
     */
    generateId() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
  };

  // Export to global namespace
  window.Kairos.Utils = Utils;

})();
