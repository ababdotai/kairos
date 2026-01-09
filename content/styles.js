/**
 * Kairos Styles Module
 * CSS styles for Shadow DOM injection
 */

(function () {
  'use strict';

  const { CONFIG } = window.Kairos;

  /**
   * Returns the complete CSS stylesheet for the Kairos overlay
   * @returns {string} CSS stylesheet content
   */
  function getStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      .kairos-overlay {
        position: fixed;
        pointer-events: none;
        z-index: ${CONFIG.Z_INDEX};
      }

      /* Apple Intelligence-style Border */
      .kairos-glow-border {
        position: absolute;
        inset: -1.5px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        box-shadow: 0 0 0 rgba(0,0,0,0);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Active State: Narrower and subtler colorful inner border */
      .kairos-glow-border.active {
        opacity: 1;
        border-color: rgba(255, 255, 255, 0.6);
        box-shadow:
          inset 4px 0 25px rgba(0, 200, 255, 0.7),
          inset -4px 0 25px rgba(180, 0, 255, 0.7),
          inset 0 4px 25px rgba(255, 0, 150, 0.7),
          inset 0 -4px 25px rgba(255, 100, 0, 0.7),
          0 0 15px rgba(255, 255, 255, 0.2);
        animation: kairos-border-pulse 3s infinite alternate ease-in-out;
      }

      /* The Intelligent Island Container: Free Floating inside Overlay */
      .kairos-island-container {
        position: absolute;
        bottom: 80px;
        left: 16px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0;
        pointer-events: none;
        z-index: 50;
        will-change: top, left, transform;
      }

      .kairos-island-container.positioned {
        bottom: auto;
      }

      /* Note positioning relative to orb */
      .kairos-island-container.orient-bottom .kairos-note-wrapper {
        top: calc(100% + 12px);
        bottom: auto;
      }

      .kairos-island-container.orient-top .kairos-note-wrapper {
        bottom: calc(100% + 12px);
        top: auto;
      }

      .kairos-note-wrapper.active {
        width: 320px;
        opacity: 1;
        pointer-events: auto;
      }

      .kairos-drag-handle {
        width: 0;
        opacity: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        color: rgba(255, 255, 255, 0.4);
        margin-right: 0;
        overflow: hidden;
      }

      .kairos-drag-handle:hover {
        color: rgba(255, 255, 255, 0.9);
      }

      .kairos-drag-handle:active {
        cursor: grabbing;
      }

      /* Show handle when hovering collapsed orb or dragging */
      .kairos-orb:not(.expanded):hover .kairos-drag-handle,
      .kairos-island-container.dragging .kairos-drag-handle {
        width: 24px;
        opacity: 1;
      }

      /* Collapsed orb expands slightly on hover to show drag handle */
      .kairos-orb:not(.expanded):hover {
        width: 72px;
        justify-content: flex-start;
        padding-left: 4px;
      }

      /* Orb: The Anchor */
      .kairos-orb {
        position: relative;
        height: 48px;
        width: 48px;
        background: rgba(10, 10, 10, 0.4);
        backdrop-filter: blur(32px) saturate(210%);
        border: 0.5px solid rgba(255, 255, 255, 0.18);
        border-radius: 24px;
        pointer-events: auto;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: width 0.4s cubic-bezier(0.3, 1.2, 0.3, 1), background 0.3s ease;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
        overflow: hidden;
        flex-shrink: 0;
        padding: 0 12px;
        user-select: none;
      }

      /* Orb Expanded State (click to toggle) */
      .kairos-orb.expanded {
        width: auto;
        min-width: 130px;
        background: rgba(20, 20, 20, 0.55);
        justify-content: center;
        padding: 0 8px;
        gap: 0;
      }

      /* Ensure menu shows when expanded */
      .kairos-orb.expanded .kairos-orb-menu {
        opacity: 1;
        max-width: 200px;
        pointer-events: auto;
      }

      /* Hide icon in expanded state */
      .kairos-orb.expanded .kairos-orb-icon {
        display: none;
      }

      /* Show drag handle when expanded */
      .kairos-orb.expanded .kairos-drag-handle {
        width: 24px;
        opacity: 1;
        margin-right: 0;
      }

      /* Note Wrapper - absolutely positioned relative to island */
      .kairos-note-wrapper {
        position: absolute;
        width: 320px;
        max-height: 0;
        background: rgba(25, 25, 25, 0.85);
        backdrop-filter: blur(32px) saturate(180%);
        border: 0.5px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        opacity: 0;
        pointer-events: none;
        transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        display: flex;
        align-items: center;
        overflow: visible;
      }

      .kairos-note-wrapper.active {
        max-height: 200px;
        min-height: 36px;
        opacity: 1;
        pointer-events: auto;
      }

      .kairos-orb.active {
        border-color: rgba(0, 242, 255, 0.5);
        box-shadow: 0 0 30px rgba(0, 242, 255, 0.2);
      }

      .kairos-orb-icon {
        width: 24px;
        height: 24px;
        min-width: 24px;
        object-fit: contain;
        transition: all 0.4s ease;
      }

      .kairos-orb.active .kairos-orb-icon {
        filter: drop-shadow(0 0 2px #00f2ff);
      }

      /* Orb Menu Container (hidden by default) */
      .kairos-orb-menu {
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        max-width: 0;
        overflow: hidden;
        transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        pointer-events: none;
      }

      /* Orb Menu Button */
      .kairos-orb-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }

      .kairos-orb-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        transform: scale(1.1);
      }

      /* Pin button special styling */
      .kairos-orb-btn.pin-btn {
        background: rgba(0, 242, 255, 0.2);
        color: #00f2ff;
      }

      .kairos-orb-btn.pin-btn:hover {
        background: rgba(0, 242, 255, 0.4);
        color: white;
        box-shadow: 0 0 12px rgba(0, 242, 255, 0.5);
      }

      /* Orb Icon Button (center, for collapsing) */
      .kairos-orb-btn.orb-icon-btn {
        background: transparent;
      }

      .kairos-orb-btn.orb-icon-btn img {
        width: 24px;
        height: 24px;
      }

      .kairos-note-icon { display: none; }

      .kairos-note-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: white;
        font-size: 13px; /* Reduced from 16px */
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        font-weight: 400;
        padding: 10px 14px; /* Reduced padding */
        min-height: 36px;
        max-height: 150px;
        min-width: 100px;
        resize: none;
        line-height: 1.5;
        overflow-y: auto;
      }

      .kairos-note-input::placeholder {
        color: rgba(255, 255, 255, 0.3);
        font-style: italic;
      }

      /* AI Loading Shimmer */
      .kairos-note-input.ai-loading {
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.05) 50%,
          rgba(255, 255, 255, 0) 100%
        );
        background-size: 200% 100%;
        animation: kairos-shimmer 2s infinite linear;
        color: rgba(255, 255, 255, 0.5);
      }

      @keyframes kairos-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      
      /* Markdown Preview Mode */
      .kairos-note-preview {
        flex: 1;
        background: transparent;
        color: white;
        font-size: 13px; /* Reduced from 16px */
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        font-weight: 400;
        padding: 10px 14px;
        min-height: 36px;
        max-height: 150px;
        min-width: 100px;
        line-height: 1.5;
        overflow-y: auto;
        white-space: pre-wrap;
        cursor: text;
      }
      
      .kairos-note-preview strong { font-weight: 700; color: #fff; }
      .kairos-note-preview em { font-style: italic; color: #ddd; }
      .kairos-note-preview code { 
        background: rgba(255,255,255,0.15); 
        padding: 2px 4px; 
        border-radius: 4px; 
        font-family: 'Menlo', 'Monaco', monospace; 
        font-size: 12px; 
        color: #00f2ff;
      }
      .kairos-note-preview ul { padding-left: 16px; margin: 4px 0; }
      .kairos-note-preview li { margin-bottom: 2px; }
      .kairos-note-preview h1, .kairos-note-preview h2, .kairos-note-preview h3 {
        font-size: 14px;
        font-weight: 700;
        margin: 8px 0 4px 0;
        color: #00f2ff;
      }
      
      .hidden { display: none !important; }

      /* Note Action Buttons (Save & Cancel) */
      .kairos-note-actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px 8px 8px 0;
        flex-shrink: 0;
      }

      .kairos-note-action-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: all 0.2s ease;
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.6);
      }

      .kairos-note-action-btn:hover {
        transform: scale(1.1);
      }

      .kairos-note-action-btn.save-btn {
        background: rgba(0, 200, 100, 0.2);
        color: #00c864;
      }

      .kairos-note-action-btn.save-btn:hover {
        background: rgba(0, 200, 100, 0.4);
        color: white;
      }

      .kairos-note-action-btn.cancel-btn {
        background: rgba(255, 80, 80, 0.2);
        color: #ff6b6b;
      }

      .kairos-note-action-btn.cancel-btn:hover {
        background: rgba(255, 80, 80, 0.4);
        color: white;
      }

      /* Ceiling Timeline: Now only a viewer */
      .kairos-timeline-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 24px;
        background: transparent;
        pointer-events: none;
        z-index: 30;
        opacity: 0;
        transition: opacity 0.3s ease;
        overflow: visible;
      }

      /* Show when active */
      .kairos-overlay.active .kairos-timeline-container {
        opacity: 1;
      }

      /* Pins remain interactive */
      .kairos-pin {
        pointer-events: auto;
      }

      /* The Visual Rail: Frosted Glass Fiber */
      .kairos-timeline-rail {
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 4px;
        transform: translateY(-50%);
        background: rgba(255, 255, 255, 0.15);
        border-radius: 2px;
        backdrop-filter: blur(4px);
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      }

      /* Hover Effect: Rail "Energizes" */
      .kairos-timeline-container:hover .kairos-timeline-rail {
        height: 6px;
        background: rgba(255, 255, 255, 0.25);
        box-shadow: 0 0 15px rgba(0, 242, 255, 0.3);
      }

      /* The Progress Beam */
      .kairos-progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, transparent 0%, #00f2ff 100%);
        border-radius: 2px;
        position: relative;
      }

      /* The Playhead: Glowing Bead */
      .kairos-progress-bar::after {
        content: '';
        position: absolute;
        right: -4px;
        top: 50%;
        transform: translateY(-50%);
        width: 8px;
        height: 8px;
        background: #ffffff;
        border-radius: 50%;
        box-shadow:
          0 0 10px rgba(255, 255, 255, 1),
          0 0 20px rgba(0, 242, 255, 0.8);
        transition: transform 0.3s ease;
      }

      /* Playhead expands on hover */
      .kairos-timeline-container:hover .kairos-progress-bar::after {
        transform: translateY(-50%) scale(1.5);
      }

      /* The Pin: Visual Emoji Marker */
      .kairos-pin {
        position: absolute;
        top: 2px;
        width: 24px;
        height: 24px;
        transform: translateX(-50%);
        cursor: pointer;
        z-index: 31;
        pointer-events: none;
        display: flex;
        justify-content: center;
        align-items: center;
        background: transparent;
      }

      /* The Emoji Head */
      .kairos-pin::after {
        content: '📌';
        font-size: 20px;
        transform: rotate(180deg) scaleX(-1);
        filter: drop-shadow(0 0 8px rgba(0, 242, 255, 0.6));
        transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: auto;
      }

      /* Hover Effect: Scale up */
      .kairos-pin:hover::after {
        transform: rotate(180deg) scaleX(-1) scale(1.3);
        filter: drop-shadow(0 0 12px rgba(0, 242, 255, 0.9));
        cursor: pointer;
      }

      .kairos-pin:hover {
        height: 24px;
      }

      /* Animation Layers */
      .kairos-effect-container {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 10;
        overflow: hidden;
        border-radius: 12px;
      }

      .kairos-flash {
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.03);
        opacity: 0;
      }

      .kairos-flash.animating {
        animation: kairos-flash-anim 1.2s ease-in-out forwards;
      }

      .kairos-ripple {
        position: absolute;
        top: 36px;
        left: 50%;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: radial-gradient(circle,
          #ffffff 0%,
          #00f2ff 25%,
          #7000ff 50%,
          #ff0095 75%,
          transparent 100%
        );
        filter: blur(12px);
        transform: translate(-50%, -50%) scale(0);
        opacity: 0;
        mix-blend-mode: screen;
      }

      .kairos-ripple.animating {
        animation: kairos-ripple-expand 1.6s cubic-bezier(0.33, 1, 0.68, 1) forwards;
      }

      .kairos-ripple.reversing {
        animation: kairos-ripple-contract 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
      }

      @keyframes kairos-border-pulse {
        0% {
          box-shadow:
            inset 4px 0 25px rgba(0, 200, 255, 0.7),
            inset -4px 0 25px rgba(180, 0, 255, 0.7),
            inset 0 4px 25px rgba(255, 0, 150, 0.7),
            inset 0 -4px 25px rgba(255, 100, 0, 0.7),
            0 0 15px rgba(255, 255, 255, 0.2);
        }
        100% {
          box-shadow:
            inset 6px 0 35px rgba(0, 200, 255, 0.8),
            inset -6px 0 35px rgba(180, 0, 255, 0.8),
            inset 0 6px 35px rgba(255, 0, 150, 0.8),
            inset 0 -6px 35px rgba(255, 100, 0, 0.8),
            0 0 25px rgba(255, 255, 255, 0.3);
        }
      }

      @keyframes kairos-flash-anim {
        0% { opacity: 0; }
        40% { opacity: 1; }
        100% { opacity: 0; }
      }

      @keyframes kairos-ripple-expand {
        0% {
          transform: translate(-50%, -50%) scale(0);
          opacity: 0.8;
        }
        30% {
          opacity: 1;
        }
        100% {
          transform: translate(-50%, -50%) scale(100);
          opacity: 0;
        }
      }

      @keyframes kairos-ripple-contract {
        0% {
          transform: translate(-50%, -50%) scale(100);
          opacity: 0;
        }
        30% {
          opacity: 0.6;
        }
        100% {
          transform: translate(-50%, -50%) scale(0);
          opacity: 0;
        }
      }
    `;
  }

  // Export to global namespace
  window.Kairos.getStyles = getStyles;

})();
