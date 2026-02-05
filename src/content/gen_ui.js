/**
 * Kairos Generative UI (HUD) Manager
 * Manages rendering of dynamic, AI-generated Motion Graphics animations
 */

(function () {
  'use strict';

  const { log } = window.Kairos;

  /**
   * GenUIManager class - Manages the HUD overlay components
   */
  class GenUIManager {
    /**
     * Creates a GenUIManager instance
     */
    constructor() {
      this.shadowRoot = null;
      this.hudLayer = null;
      this.activeComponents = new Set();
      this.script = [];
      this.lastTimestamp = -1;
      this.isPlaying = false;
    }

    /**
     * Initializes the manager with the shadow root
     * @param {ShadowRoot} shadowRoot - The overlay shadow root
     */
    init(shadowRoot) {
      this.shadowRoot = shadowRoot;
      
      // Create HUD layer if it doesn't exist
      this.hudLayer = document.createElement('div');
      this.hudLayer.className = 'kairos-hud-layer';
      this.hudLayer.style.cssText = `
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 5;
      `;
      
      this.shadowRoot.querySelector('.kairos-overlay').appendChild(this.hudLayer);
      log('GenUIManager initialized');
    }

    /**
     * Loads a visual script for the current video
     * @param {Array} script - Array of event objects [{ start, duration, html, css, position }]
     */
    loadScript(script) {
      log(`Loading HUD script with ${script.length} events`);
      // Sort script by start time for efficient processing
      this.script = [...script].sort((a, b) => a.start - b.start);
      this.lastTimestamp = -1;
    }

    /**
     * Updates the HUD state based on current video time
     * @param {number} currentTime - Current video time in seconds
     */
    update(currentTime) {
      if (!this.script.length) return;

      // Detect jumps or rewinds
      if (Math.abs(currentTime - this.lastTimestamp) > 1.5) {
        log('Jump detected, resetting HUD state');
        this.clearAll();
      }

      // Find events that should start now
      const currentEvents = this.script.filter(event => {
        return event.start <= currentTime && 
               event.start > this.lastTimestamp &&
               (event.start + (event.duration || 5)) > currentTime;
      });

      currentEvents.forEach(event => {
        this.renderComponent({
          ...event,
          duration: (event.duration || 5) * 1000 // Convert to ms
        });
      });

      this.lastTimestamp = currentTime;
    }

    /**
     * Test method to verify HUD rendering and synchronization
     */
    test() {
      // Mock script for verification
      const mockScript = [
        {
          start: 2,
          duration: 4,
          position: 'bottom-left',
          html: `
            <div class="k-hud-card" style="border-left: 4px solid #00f2ff;">
              <div style="font-size: 10px; text-transform: uppercase; color: #00f2ff; margin-bottom: 4px; font-weight: bold;">Intro</div>
              <div style="font-size: 14px;">Welcome to Kairos GenUI</div>
            </div>
          `
        },
        {
          start: 7,
          duration: 5,
          position: 'top-right',
          html: `
            <div class="k-hud-card" style="border-top: 4px solid #ff0095;">
              <div style="font-size: 10px; text-transform: uppercase; color: #ff0095; margin-bottom: 4px; font-weight: bold;">Sync Check</div>
              <div style="font-size: 14px;">Timeline Synchronization Active</div>
            </div>
          `
        }
      ];

      this.loadScript(mockScript);
      log('Phase 2 Test Script Loaded. Play video to see sync.');
    }

    /**
     * Renders a component based on configuration
     * @param {Object} config - Component configuration { id, type, html, css, position, duration }
     */
    renderComponent(config) {
      if (!this.hudLayer) return;

      const { id, html, css, position, duration = 5000 } = config;
      
      log(`Rendering HUD component: ${id || 'unnamed'}`);

      // Create component wrapper
      const wrapper = document.createElement('div');
      wrapper.className = `kairos-hud-component ${position || 'bottom-left'}`;
      if (id) wrapper.id = `hud-${id}`;
      
      // Inject HTML
      wrapper.innerHTML = html;

      // Inject Component-specific CSS if provided
      if (css) {
        const style = document.createElement('style');
        style.textContent = css;
        wrapper.appendChild(style);
      }

      this.hudLayer.appendChild(wrapper);
      this.activeComponents.add(wrapper);

      // Trigger entry animation
      requestAnimationFrame(() => {
        wrapper.classList.add('active');
      });

      // Auto-remove after duration
      if (duration > 0) {
        setTimeout(() => {
          this.removeComponent(wrapper);
        }, duration);
      }

      return wrapper;
    }

    /**
     * Removes a specific component
     * @param {HTMLElement} component - The component element to remove
     */
    removeComponent(component) {
      if (this.activeComponents.has(component)) {
        component.classList.add('exiting');
        // Wait for potential CSS animations to finish
        setTimeout(() => {
          if (component.parentNode) {
            component.parentNode.removeChild(component);
          }
          this.activeComponents.delete(component);
        }, 1000); // 1s buffer for exit animations
      }
    }

    /**
     * Clears all active components
     */
    clearAll() {
      this.activeComponents.forEach(comp => this.removeComponent(comp));
    }
  }

  // Export to global namespace
  window.Kairos.GenUIManager = GenUIManager;

})();
