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
  const { CONFIG, log, OverlayManager, VideoTracker, SidePanelManager, SubtitleManager } = window.Kairos;

  /**
   * Main application initialization
   */
  async function init() {
    log('Initializing Kairos...');

    // Create GenUI Manager
    const { GenUIManager } = window.Kairos;
    const genUiManager = new GenUIManager();

    // Create side panel manager
    const sidePanelManager = new SidePanelManager();
    await sidePanelManager.init();

    // Create subtitle manager
    const subtitleManager = new SubtitleManager();
    subtitleManager.init();

    // Link subtitle manager to side panel
    sidePanelManager.subtitleManager = subtitleManager;

    // Create overlay manager with side panel reference
    const overlayManager = new OverlayManager();
    window.Kairos.overlayManagerInstance = overlayManager; // Store for HUD Agent feedback
    overlayManager.sidePanel = sidePanelManager;
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
      if (video) {
        sidePanelManager.updateTime(video.currentTime);
      }
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