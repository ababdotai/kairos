import './content/i18n.js';
import './content/delete_button.js';
import './content/refinement.js';
import './content.css';
import './content/config.js';
import './content/utils.js';
import './content/storage.js';
import './content/markdown.js';
import './content/tracker.js';
import './content/capture.js';
import './content/subtitles.js';
import './content/agent.js';
import './content/styles.js';
import './content/gen_ui.js';
import './content/hud_agent.js';
import './content/companion.js';
import './content/overlay.js';
import './content/sidepanel.js';

/**
 * Kairos Content Script Entry Point
 * Orchestrates the video overlay functionality
 */

(function () {
  'use strict';

  // Wait for modules to initialize window.Kairos
  // In a bundled environment, they execute immediately upon import.
  const { CONFIG, log, OverlayManager, VideoTracker, SubtitleManager, SidePanelManager } = window.Kairos;

  /**
   * Main application initialization
   */
  async function init() {
    await window.Kairos.I18n.init();
    await window.Kairos.Refinement.init();
    log('Initializing Kairos...');

    // Create GenUI Manager
    const { GenUIManager } = window.Kairos;
    const genUiManager = new GenUIManager();

    // Create subtitle manager
    const subtitleManager = new SubtitleManager();
    subtitleManager.init();
    const sidePanelManager = new SidePanelManager();
    sidePanelManager.subtitleManager = subtitleManager;
    await sidePanelManager.init();

    // Sidebar and fullscreen island share the current video's notes.
    const overlayManager = new OverlayManager();
    overlayManager.sidePanel = sidePanelManager;
    window.Kairos.overlayManagerInstance = overlayManager; // Store for HUD Agent feedback
    overlayManager.subtitleManager = subtitleManager;
    overlayManager.genUiManager = genUiManager; // Link HUD manager
    await overlayManager.init();

    // Create HUD Agent
    const { HUDAgent } = window.Kairos;
    const hudAgent = new HUDAgent(subtitleManager, genUiManager);
    await hudAgent.init();
    overlayManager.hudAgent = hudAgent;

    // Initialize GenUI with overlay's shadow root
    genUiManager.init(overlayManager.shadowRoot);

    // Initialize Proactive Agent
    const { ProactiveAgent } = window.Kairos;
    const agent = new ProactiveAgent(subtitleManager, overlayManager);
    await agent.init();

    // Link agent to overlay manager
    overlayManager.agent = agent;

    // Create video tracker
    const videoTracker = new VideoTracker(CONFIG.VIDEO_SELECTOR);

    // Start tracking and update overlay position
    videoTracker.start((rect, video) => {
      overlayManager.updatePosition(rect, video);
      if (!window.Kairos.Utils.getVideoId()) {
        sidePanelManager.injectPanel(); // Removes a stale sidebar immediately on SPA exit.
        if (overlayManager.currentVideoId) overlayManager.loadNotesForCurrentVideo();
      }
      if (video) sidePanelManager.updateTime(video.currentTime);
    });

    // Monitor URL changes (for SPA like YouTube)
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        log('URL changed, reloading notes...');
        overlayManager.loadNotesForCurrentVideo();
        sidePanelManager.refresh();
        if (genUiManager) genUiManager.clearAll();
        if (hudAgent) hudAgent.lastAnalysisTime = 0; // Trigger scan soon
      }
    }, 2000);

    // Initial load
    overlayManager.loadNotesForCurrentVideo();

    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      log('Fullscreen state changed');
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      videoTracker.stop();
      overlayManager.destroy();
    });

    log('Kairos initialized successfully');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
