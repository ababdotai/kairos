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

    /** Crops a normalized display region, accounting for contain/cover letterboxing. */
    async captureRegion(video, region) {
      if (!video || video.readyState < 2 || !video.videoWidth) throw new Error('Video not ready');
      const rect = video.getBoundingClientRect();
      const style = getComputedStyle(video);
      let width = rect.width, height = rect.height;
      if (style.objectFit !== 'fill') {
        let scale = (style.objectFit === 'cover' ? Math.max : Math.min)(
          rect.width / video.videoWidth, rect.height / video.videoHeight);
        if (style.objectFit === 'none') scale = 1;
        if (style.objectFit === 'scale-down') scale = Math.min(1, scale);
        width = video.videoWidth * scale;
        height = video.videoHeight * scale;
      }
      const positions = style.objectPosition.split(' ');
      const offset = (value, available) => value?.endsWith('%')
        ? available * parseFloat(value) / 100 : (parseFloat(value) || 0);
      const ox = offset(positions[0], rect.width - width);
      const oy = offset(positions[1] || positions[0], rect.height - height);
      const x1 = Math.max(0, (region.x * rect.width - ox) / width);
      const y1 = Math.max(0, (region.y * rect.height - oy) / height);
      const x2 = Math.min(1, ((region.x + region.width) * rect.width - ox) / width);
      const y2 = Math.min(1, ((region.y + region.height) * rect.height - oy) / height);
      if (x2 <= x1 || y2 <= y1) throw new Error('Selection outside video image');
      const sw = (x2 - x1) * video.videoWidth, sh = (y2 - y1) * video.videoHeight;
      const scale = Math.min(1, 1920 / sw);
      this.canvas.width = Math.max(1, Math.round(sw * scale));
      this.canvas.height = Math.max(1, Math.round(sh * scale));
      this.ctx.drawImage(video, x1 * video.videoWidth, y1 * video.videoHeight, sw, sh,
        0, 0, this.canvas.width, this.canvas.height);
      return this.canvas.toDataURL('image/jpeg', 0.85);
    }
  }

  // Export to global namespace
  window.Kairos.CaptureEngine = CaptureEngine;

})();
