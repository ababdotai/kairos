/**
 * Kairos HUD Agent
 * Generates visual HUD scripts based on Video URL (YouTube only)
 */

(function (global) {
  'use strict';

  const { log, Utils } = global.Kairos;

  class HUDAgent {
    constructor(subtitleManager, genUiManager) {
      // SubtitleManager is no longer used for HUD source, but kept for compatibility/other agents
      this.subtitleManager = subtitleManager; 
      this.genUiManager = genUiManager;
      this.isActive = false;
      this.currentVideoId = null;
      this.hasRequestedAnalysis = false;
    }

    async init() {
      // Check if HUD mode is enabled in settings
      const settings = await chrome.storage.sync.get(['hudMode']);
      this.isActive = settings.hudMode !== false; // Default true if not set
      
      log(`HUDAgent: Initialized (Active: ${this.isActive})`);

      if (this.isActive) {
        this.start();
      }
    }

    start() {
      // Monitor periodically for video ID changes (SPA navigation)
      // But DO NOT trigger analysis automatically. Analysis is triggered via onActivate.
      this.checkInterval = setInterval(() => this.checkVideoChange(), 2000);
    }

    stop() {
      if (this.checkInterval) clearInterval(this.checkInterval);
    }

    checkVideoChange() {
      const videoInfo = Utils.getVideoInfo();
      
      // Skip if no video ID
      if (!videoInfo.videoId) return;

      // Skip Bilibili for now as requested
      if (window.location.hostname.includes('bilibili')) {
        return;
      }

      if (videoInfo.videoId !== this.currentVideoId) {
        log(`HUDAgent: Video changed to ${videoInfo.videoId}`);
        this.currentVideoId = videoInfo.videoId;
        this.hasRequestedAnalysis = false;
        
        // Clear previous HUD elements
        if (this.genUiManager) this.genUiManager.clearAll();

        // DO NOT trigger analysis automatically here
      }
    }

    /**
     * Called when Kairos is activated by the user
     */
    onActivate() {
      log('HUDAgent: Kairos activated by user. Checking analysis status...');
      // Only analyze if we haven't done so for this video yet
      if (!this.hasRequestedAnalysis) {
        this.analyzeVideoUrl();
      } else {
        log('HUDAgent: Analysis already requested for this video. Skipping.');
      }
    }

    async analyzeVideoUrl() {
      if (!this.isActive || !this.currentVideoId || this.hasRequestedAnalysis) return;

      log('HUDAgent: Attempting to analyze Video URL via Gemini...');
      this.hasRequestedAnalysis = true;

      const overlayManager = window.Kairos.overlayManagerInstance;
      if (overlayManager) overlayManager.startLoading();

      try {
        const videoInfo = Utils.getVideoInfo();
        const videoUrl = window.location.href;

        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'GENERATE_HUD_SCRIPT',
            payload: { 
              videoUrl: videoUrl,
              videoTitle: videoInfo.title,
              // User requested low res/fps parameters to save token
              parameters: { resolution: 'low', fps: 1 } 
            }
          }, resolve);
        });

        if (response && response.success && Array.isArray(response.data) && response.data.length > 0) {
          log(`HUDAgent: HUD Script received with ${response.data.length} events!`);
          this.genUiManager.loadScript(response.data);
          if (overlayManager) overlayManager.showSuccess();
        } else {
          log('HUDAgent: No HUD events generated from URL analysis.');
          if (overlayManager) overlayManager.stopLoading();
        }
      } catch (err) {
        log('HUDAgent: URL analysis failed', err);
        if (overlayManager) overlayManager.stopLoading();
      }
    }

    /**
     * Force a scan now (e.g. when user clicks a button)
     */
    async forceScan() {
      this.hasRequestedAnalysis = false;
      await this.analyzeVideoUrl();
    }
  }

  global.Kairos.HUDAgent = HUDAgent;

})(window);
