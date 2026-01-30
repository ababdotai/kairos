/**
 * Kairos Capture Module
 * Handles video frame extraction
 */

(function () {
  'use strict';

  const { log } = window.Kairos;

  /**
   * CaptureEngine class - Extracts frames from video elements
   */
  class CaptureEngine {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Captures the current frame of the provided video element
     * @param {HTMLVideoElement} video - The video element to capture
     * @param {number} quality - JPEG quality (0 to 1)
     * @returns {Promise<string>} Base64 encoded image (JPEG)
     */
    async captureFrame(video, quality = 0.6) {
      if (!video || video.readyState < 2) {
        throw new Error('Video not ready for capture');
      }

      // Calculate target dimensions (Max 1920 width)
      let width = video.videoWidth;
      let height = video.videoHeight;
      const MAX_WIDTH = 1920;

      if (width > MAX_WIDTH) {
        const scale = MAX_WIDTH / width;
        width = MAX_WIDTH;
        height = Math.round(height * scale);
      }

      // Set canvas dimensions
      this.canvas.width = width;
      this.canvas.height = height;

      // Draw the current video frame to canvas
      this.ctx.drawImage(video, 0, 0, width, height);

      // Convert to base64
      // We use image/jpeg for smaller payload size compared to png
      return this.canvas.toDataURL('image/jpeg', quality);
    }
  }

  // Export to global namespace
  window.Kairos.CaptureEngine = CaptureEngine;

})();
