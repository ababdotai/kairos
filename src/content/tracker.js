/**
 * Kairos Video Tracker Module
 * Tracks video element position and dimensions in real-time
 */

(function () {
  'use strict';

  const { CONFIG, log, Utils } = window.Kairos;

  /**
   * VideoTracker class - Tracks video element position and dimensions
   */
  class VideoTracker {
    /**
     * Creates a VideoTracker instance
     * @param {string} videoSelector - CSS selector for video elements
     */
    constructor(videoSelector) {
      this.videoSelector = videoSelector;
      this.videoElement = null;
      this.animationFrameId = null;
      this.callbacks = [];
    }

    /**
     * Finds the best candidate video element in the DOM
     * @returns {boolean} Whether a valid video was found
     */
    findVideoElement() {
      const videoId = Utils.getVideoId();
      if (!videoId) {
        this.videoElement = null;
        return false;
      }
      // 1. Get all potential video candidates
      const allVideos = Array.from(document.querySelectorAll(this.videoSelector));

      // 2. Filter candidates based on size, visibility, and ignore list
      const validCandidates = allVideos.filter(video => {
        const playerSelector = videoId.startsWith('yt-')
          ? '.html5-video-player'
          : '.bpx-player-container, .bilibili-player, #bilibili-player';
        if (!video.closest(playerSelector)) return false;
        // Check 1: Is it visible? (offsetParent is null if display:none)
        if (video.offsetParent === null) return false;
        const style = getComputedStyle(video);
        if (style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;

        const rect = video.getBoundingClientRect();

        // Check 2: Minimum Dimensions
        if (rect.width < CONFIG.MIN_WIDTH || rect.height < CONFIG.MIN_HEIGHT) {
          return false;
        }

        // Check 3: Ignore Selectors (Banners, etc.)
        const isIgnored = CONFIG.IGNORE_SELECTORS.some(selector => {
          try {
            return video.matches(selector);
          } catch (e) {
            return false;
          }
        });

        if (isIgnored) return false;

        // Check 4: Explicit Structure Check (Safety for known headers)
        if (video.closest('header') || video.closest('.bili-header') || video.closest('.animated-banner')) {
          return false;
        }

        return true;
      });

      // 3. Select the best candidate (Largest Visible Area)
      if (validCandidates.length === 0) {
        this.videoElement = null;
        return false;
      }

      // Sort by area descending
      validCandidates.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        const areaA = rectA.width * rectA.height;
        const areaB = rectB.width * rectB.height;
        return areaB - areaA;
      });

      const bestVideo = validCandidates[0];

      if (bestVideo && bestVideo !== this.videoElement) {
        this.videoElement = bestVideo;
        log('Video element found (Best Candidate):', bestVideo);
        return true;
      }

      return this.videoElement !== null;
    }

    /**
     * Gets the current bounding rectangle of the video element
     * @returns {DOMRect|null} Video bounding rectangle or null
     */
    getVideoRect() {
      if (!this.videoElement) {
        return null;
      }
      return this.videoElement.getBoundingClientRect();
    }

    /**
     * Starts tracking the video element
     * @param {Function} callback - Callback function receiving (rect, video)
     */
    start(callback) {
      this.callbacks.push(callback);

      if (!this.animationFrameId) {
        this.update();
      }
    }

    /**
     * Updates the video position and triggers callbacks
     */
    update() {
      const pageId = Utils.getVideoId();
      const pageChanged = pageId !== this.pageId;
      this.pageId = pageId;
      if (!this.findVideoElement()) {
        if (!this.notifiedMissing || pageChanged) this.callbacks.forEach(callback => callback(null, null));
        this.notifiedMissing = true;
        // Retry if video not found yet
        this.animationFrameId = requestAnimationFrame(() => this.update());
        return;
      }

      const rect = this.getVideoRect();
      if (rect) {
        this.notifiedMissing = false;
        this.callbacks.forEach(callback => callback(rect, this.videoElement));
      }

      this.animationFrameId = requestAnimationFrame(() => this.update());
    }

    /**
     * Stops tracking the video element
     */
    stop() {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }
  }

  // Export to global namespace
  window.Kairos.VideoTracker = VideoTracker;

})();
