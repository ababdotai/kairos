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
    async captureFrame(video, quality = 0.8) {
      if (!video || video.readyState < 2) {
        throw new Error('Video not ready for capture');
      }

      // Set canvas dimensions to match video
      this.canvas.width = video.videoWidth;
      this.canvas.height = video.videoHeight;

      // Draw the current video frame to canvas
      this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);

      // Convert to base64
      // We use image/jpeg for smaller payload size compared to png
      return this.canvas.toDataURL('image/jpeg', quality);
    }
  }

  // Export to global namespace
  window.Kairos.CaptureEngine = CaptureEngine;

})();
