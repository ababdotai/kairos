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

        /* Constant Glass Theme (Shared) */
        --kairos-glass-bg: rgba(15, 15, 15, 0.45);
        --kairos-glass-border: rgba(255, 255, 255, 0.15);
        --kairos-glass-shadow: rgba(0, 0, 0, 0.4);

        /* Default Theme (Dark) */
        --kairos-bg-main: rgba(10, 10, 10, 0.45);
        --kairos-bg-secondary: rgba(25, 25, 25, 0.85);
        --kairos-text-main: #ffffff;
        --kairos-text-secondary: rgba(255, 255, 255, 0.6);
        --kairos-border: rgba(255, 255, 255, 0.18);
        --kairos-shadow: rgba(0, 0, 0, 0.4);
        --kairos-accent: #00f2ff;
        --kairos-input-bg: transparent;
      }

      @media (prefers-color-scheme: light) {
        .kairos-overlay {
          /* Note and UI elements still follow theme for readability */
          --kairos-bg-main: rgba(255, 255, 255, 0.7);
          --kairos-bg-secondary: rgba(255, 255, 255, 0.95);
          --kairos-text-main: #1a1a1a;
          --kairos-text-secondary: rgba(0, 0, 0, 0.6);
          --kairos-border: rgba(0, 0, 0, 0.12);
          --kairos-shadow: rgba(0, 0, 0, 0.1);
          --kairos-input-bg: rgba(0, 0, 0, 0.03);
        }
      }

      /* Apple Intelligence-style Border */
      .kairos-glow-border {
        position: absolute;
        inset: -1.5px;
        border-radius: 12px;
        border: 1px solid var(--kairos-border);
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
        color: var(--kairos-text-secondary);
        margin-right: 0;
        overflow: hidden;
      }

      .kairos-drag-handle:hover {
        color: var(--kairos-text-main);
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
        background: var(--kairos-glass-bg);
        backdrop-filter: blur(32px) saturate(210%);
        border: 0.5px solid var(--kairos-glass-border);
        border-radius: 24px;
        pointer-events: auto;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: width 0.4s cubic-bezier(0.3, 1.2, 0.3, 1), background 0.3s ease;
        box-shadow: 0 10px 40px var(--kairos-glass-shadow);
        overflow: hidden;
        flex-shrink: 0;
        padding: 0 12px;
        user-select: none;
      }

      /* Orb Expanded State (click to toggle) */
      .kairos-orb.expanded {
        width: auto;
        min-width: 130px;
        background: var(--kairos-glass-bg);
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

      /* Note Wrapper - absolute within overlay */
      .kairos-note-wrapper {
        position: absolute;
        width: 320px;
        max-height: 0;
        background: var(--kairos-bg-secondary);
        backdrop-filter: blur(32px) saturate(180%);
        border: 0.5px solid var(--kairos-border);
        border-radius: 12px;
        opacity: 0;
        transform: scale(0.6) translateY(10px);
        pointer-events: none;
        transition: 
          opacity 0.4s cubic-bezier(0.23, 1, 0.32, 1),
          transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
          max-height 0.4s ease;
        display: flex;
        align-items: center;
        overflow: visible;
        z-index: 1000;
        transform-origin: center bottom; /* Default, will be updated by JS */
      }

      .kairos-note-wrapper.active {
        max-height: 300px;
        min-height: 36px;
        opacity: 1;
        transform: scale(1) translateY(0);
        pointer-events: auto;
      }

      .kairos-note-wrapper {
        background: linear-gradient(145deg, #ffffff12, #ffffff03), rgba(20,27,37,.72);
        backdrop-filter: blur(14px) saturate(140%);
        border: 1px solid #ffffff38;
        border-radius: 16px;
        box-shadow: 0 8px 24px #0003, inset 0 1px #ffffff20;
        padding-top: 10px;
        flex-wrap: wrap;
        max-width: calc(100% - 24px);
      }
      .kairos-note-wrapper::before {
        content: none;
        position: absolute;
        width: 74px;
        height: 19px;
        top: -10px;
        left: calc(50% - 37px);
        background: #fff7d5aa;
        border: 1px solid #d4c39966;
        transform: rotate(-4deg);
        pointer-events: none;
      }
      .kairos-note-wrapper .kairos-note-input,
      .kairos-note-wrapper .kairos-note-preview {
        background: transparent;
        color: #eef3f8;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        line-height: 1.6;
      }
      .kairos-note-wrapper .kairos-note-input::placeholder { color: #bbc6d2; opacity: .85; font-style: normal; }
      .kairos-capture-preview {
        width: calc(100% - 20px);
        height: 76px;
        object-fit: contain;
        margin: 0 10px 6px;
        background: #0002;
        border: 1px solid #ffffff20;
        border-radius: 8px;
      }
      .kairos-capture-preview[hidden], .kairos-companion-hint[hidden] { display: none; }
      .kairos-capture-surface {
        position: absolute; inset: 32px 0 96px;
        z-index: 10; pointer-events: none; cursor: crosshair;
        touch-action: none; user-select: none; -webkit-user-select: none;
      }
      .kairos-overlay.active .kairos-capture-surface { pointer-events: auto; }
      .kairos-overlay:has(.kairos-note-wrapper.active) .kairos-capture-surface { pointer-events: none; }
      .kairos-ink-layer {
        position: absolute; inset: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 999;
      }
      .kairos-ink-layer rect {
        fill: #ffffff06; stroke: #fff; stroke-width: 1.5;
        stroke-dasharray: 6 4; vector-effect: non-scaling-stroke;
        filter: drop-shadow(0 1px 1px #000b);
      }
      .kairos-companion-hint {
        position: absolute; top: 28px; left: 50%; transform: translateX(-50%);
        padding: 8px 14px; border-radius: 20px; background: #242422dd;
        color: #edf3fa; font: 12px/1.5 system-ui; white-space: nowrap;
        pointer-events: none;
      }
      .kairos-spatial-tooltip img { display: block; max-width: 190px; max-height: 120px; margin-bottom: 6px; }

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

      /* Flip icon when orb is on the left side */
      .kairos-orb.flip-icon .kairos-orb-icon {
        transform: scaleX(-1);
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
        background: rgba(128, 128, 128, 0.1);
        color: var(--kairos-text-secondary);
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
        background: rgba(128, 128, 128, 0.2);
        color: var(--kairos-text-main);
        transform: scale(1.05);
      }

      /* Pin button special styling */
      .kairos-orb-btn.pin-btn {
        background: rgba(0, 242, 255, 0.15);
        color: #00f2ff;
        border-radius: 50%;
      }

      .kairos-orb-btn.pin-btn:hover {
        background: rgba(0, 242, 255, 0.3);
        color: white;
        border-radius: 50%;
      }

      /* Orb Icon Button (center, for collapsing) */
      .kairos-orb-btn.orb-icon-btn {
        background: transparent;
      }

      .kairos-orb-btn.orb-icon-btn img {
        width: 24px;
        height: 24px;
        transition: transform 0.4s ease;
      }

      /* Flip expanded menu icon when orb is on the left side */
      .kairos-orb.flip-icon .kairos-orb-btn.orb-icon-btn img {
        transform: scaleX(-1);
      }

      .kairos-note-icon { display: none; }

      .kairos-note-input {
        flex: 1;
        background: var(--kairos-input-bg);
        border: none;
        outline: none;
        color: var(--kairos-text-main);
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        font-weight: 400;
        padding: 10px 14px;
        min-height: 36px;
        max-height: 150px;
        min-width: 100px;
        resize: none;
        line-height: 1.5;
        overflow-y: auto;
      }

      .kairos-note-input::placeholder {
        color: var(--kairos-text-secondary);
        opacity: 0.5;
        font-style: italic;
      }

      /* AI Loading Shimmer */
      .kairos-note-input.ai-loading {
        background: linear-gradient(
          90deg,
          rgba(128, 128, 128, 0) 0%,
          rgba(128, 128, 128, 0.05) 50%,
          rgba(128, 128, 128, 0) 100%
        );
        background-size: 200% 100%;
        animation: kairos-shimmer 2s infinite linear;
        color: var(--kairos-text-secondary);
      }

      @keyframes kairos-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      
      /* Markdown Preview Mode */
      .kairos-note-preview {
        flex: 1;
        background: transparent;
        color: var(--kairos-text-main);
        font-size: 13px;
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
      
      .kairos-note-preview strong { font-weight: 700; color: var(--kairos-text-main); }
      .kairos-note-preview em { font-style: italic; opacity: 0.9; }
      .kairos-note-preview code { 
        background: rgba(128,128,128,0.15); 
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
        border-radius: 8px; /* Slightly more rounded */
        border: 1px solid transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        background: rgba(128, 128, 128, 0.1);
        color: var(--kairos-text-secondary);
      }

      .kairos-note-action-btn:hover {
        transform: scale(1.05);
        background: rgba(128, 128, 128, 0.15);
        color: var(--kairos-text-main);
      }

      .kairos-note-action-btn:active {
        transform: scale(0.95);
      }

      .kairos-note-action-btn.save-btn {
        background: rgba(0, 200, 100, 0.15);
        color: #00c864;
        border: 1px solid rgba(0, 200, 100, 0.2);
      }

      .kairos-note-action-btn.save-btn:hover {
        background: rgba(0, 200, 100, 0.25);
        color: #fff;
        box-shadow: 0 2px 8px rgba(0, 200, 100, 0.25);
      }

      .kairos-note-action-btn.cancel-btn {
        background: rgba(255, 80, 80, 0.15);
        color: #ff6b6b;
        border: 1px solid rgba(255, 80, 80, 0.2);
      }

      .kairos-note-action-btn.cancel-btn:hover {
        background: rgba(255, 80, 80, 0.25);
        color: #fff;
        box-shadow: 0 2px 8px rgba(255, 80, 80, 0.25);
      }

      /* Ceiling Timeline: Now only a viewer */
      .kairos-timeline-container {
        position: absolute;
        top: 20px;
        left: 0;
        right: 0;
        height: 16px;
        background: transparent;
        pointer-events: auto;
        z-index: 30;
        opacity: 0;
        transition: opacity 0.3s ease;
        overflow: visible;
        display: flex;
        align-items: center;
        padding: 0 40px;
        cursor: pointer;
      }

      /* Dragging state */
      .kairos-timeline-container.dragging {
        cursor: grabbing;
      }

      /* Show when active */
      .kairos-overlay.active .kairos-timeline-container {
        opacity: 1;
      }

      /* Pins remain interactive */
      .kairos-pin {
        pointer-events: auto;
      }

      /* The Visual Rail: Liquid Glass Effect (macOS 26 Style) */
      .kairos-timeline-rail {
        position: absolute;
        top: 50%;
        left: 40px;
        right: 40px;
        height: 12px;
        transform: translateY(-50%);
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.35) 0%,
          rgba(255, 255, 255, 0.25) 50%,
          rgba(255, 255, 255, 0.2) 100%
        );
        backdrop-filter: blur(40px) saturate(180%) brightness(1.1);
        -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.1);
        border-radius: 12px;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        box-shadow:
          0 2px 8px rgba(0, 0, 0, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.5),
          inset 0 -1px 0 rgba(0, 0, 0, 0.05);
        overflow: visible;
        border: 0.5px solid rgba(255, 255, 255, 0.4);
      }

      /* Hover Effect: Rail "Energizes" */
      .kairos-timeline-container:hover .kairos-timeline-rail {
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.4) 0%,
          rgba(255, 255, 255, 0.3) 50%,
          rgba(255, 255, 255, 0.25) 100%
        );
        box-shadow:
          0 2px 12px rgba(0, 0, 0, 0.12),
          inset 0 1px 0 rgba(255, 255, 255, 0.6),
          inset 0 -1px 0 rgba(0, 0, 0, 0.08);
      }

      /* The Progress Beam - White Fill with Liquid Glass */
      .kairos-progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 1) 0%,
          rgba(255, 255, 255, 0.98) 50%,
          rgba(255, 255, 255, 0.95) 100%
        ) !important;
        border-radius: 12px;
        position: relative;
        transition: width 0.1s linear;
        box-shadow:
          inset 0 1px 2px rgba(255, 255, 255, 0.8),
          inset 0 -1px 1px rgba(0, 0, 0, 0.05);
      }

      /* The Playhead: Bubble Timestamp - Reduced size */
      .kairos-progress-bar::after {
        content: attr(data-time);
        position: absolute;
        right: -18px;
        top: 50%;
        transform: translateY(-50%);
        min-width: 32px;
        height: 28px;
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(30px) saturate(200%);
        border-radius: 10px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
        color: #000000;
        padding: 0 8px;
        transition: transform 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        border: 0.5px solid rgba(255, 255, 255, 0.5);
      }

      /* Playhead expands on hover */
      .kairos-timeline-container:hover .kairos-progress-bar::after {
        transform: translateY(-50%) scale(1.05);
      }

      /* The Pin: Visual Emoji Marker */
      .kairos-pin {
        position: absolute;
        top: -12px;
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

      /* The Emoji Head - Only for manual pins */
      .kairos-pin:not(.kairos-marker-insight)::after {
        content: '📌';
        font-size: 20px;
        filter: drop-shadow(0 0 10px rgba(0, 242, 255, 0.6));
        transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: auto;
      }

      /* Hover Effect: Scale up */
      .kairos-pin:hover::after {
        transform: scale(1.2);
        filter: drop-shadow(0 0 12px rgba(0, 242, 255, 0.9));
        cursor: pointer;
      }

      .kairos-pin:hover {
        height: 24px;
      }

      /* Timeline Ticks Container */
      .kairos-ticks-container {
        position: absolute;
        top: 0;
        left: 40px;
        right: 40px;
        height: 100%;
        pointer-events: none;
        z-index: 28;
      }

      /* Individual Tick Mark */
      .kairos-tick {
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 2px;
        background: rgba(128, 128, 128, 0.2);
        pointer-events: none;
      }

      /* Major Tick (with label) */
      .kairos-tick-major {
        height: 8px;
        background: rgba(128, 128, 128, 0.35);
      }

      /* Minor Tick (shorter, no label) */
      .kairos-tick-minor {
        height: 4px;
        background: rgba(128, 128, 128, 0.18);
      }

      /* Tick Label (Time Text) - White with gradient border */
      .kairos-tick-label {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
        color: #ffffff;
        white-space: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        pointer-events: none;
        text-shadow:
          0 0 8px rgba(0, 0, 0, 0.8),
          0 1px 2px rgba(0, 0, 0, 0.6),
          -1px -1px 0 rgba(0, 0, 0, 0.3),
          1px -1px 0 rgba(0, 0, 0, 0.3),
          -1px 1px 0 rgba(0, 0, 0, 0.3),
          1px 1px 0 rgba(0, 0, 0, 0.3);
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
            inset 0 -6px 35px rgba(180, 0, 255, 0.8),
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

      /* AI Scanning State - Breathing glow effect */
      .kairos-orb.ai-scanning {
        border-color: rgba(0, 242, 255, 0.9);
        box-shadow: 0 0 25px rgba(0, 242, 255, 0.5);
        animation: kairos-orb-breathe 2s infinite ease-in-out;
      }

      .kairos-orb.ai-scanning .kairos-orb-icon {
        filter: drop-shadow(0 0 6px #00f2ff);
      }

      /* Spatial Note / Ripple Styles (Granola Style) */
      .kairos-spatial-marker {
        position: absolute;
        width: 12px;
        height: 12px;
        background: #00f2ff;
        border-radius: 50%;
        transform: translate(-50%, -50%) scale(1);
        box-shadow: 0 0 15px #00f2ff, 0 0 30px rgba(0, 242, 255, 0.4);
        pointer-events: none;
        z-index: 100;
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }

      .kairos-spatial-marker.active {
        opacity: 0.8;
        transform: translate(-50%, -50%) scale(1.2);
      }

      /* Ripple Animation on click */
      .kairos-spatial-ripple {
        position: absolute;
        width: 60px;
        height: 60px;
        border: 2px solid #00f2ff;
        border-radius: 50%;
        transform: translate(-50%, -50%) scale(0);
        pointer-events: none;
        z-index: 99;
        animation: kairos-spatial-ripple-anim 0.8s cubic-bezier(0.2, 0, 0.2, 1) forwards;
      }

      @keyframes kairos-spatial-ripple-anim {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 1; border-width: 4px; }
        100% { transform: translate(-50%, -50%) scale(2); opacity: 0; border-width: 1px; }
      }

      /* Ephemeral Spatial Note Tooltip */
      .kairos-spatial-tooltip {
        position: absolute;
        background: rgba(20,27,37,.72);
        backdrop-filter: blur(12px) saturate(140%);
        border: 1px solid #ffffff30;
        border-radius: 10px;
        padding: 8px 12px;
        color: #edf3fa;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        max-width: 240px;
        pointer-events: auto;
        z-index: 101;
        opacity: 0;
        transform: translate(-50%, -100%) translateY(-15px) scale(0.95);
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        box-shadow: 0 10px 30px var(--kairos-shadow);
      }

      .kairos-spatial-tooltip.active {
        opacity: 1;
        transform: translate(-50%, -100%) translateY(-10px) scale(1);
      }

      @keyframes kairos-orb-breathe {
        0%, 100% { box-shadow: 0 0 20px rgba(0, 242, 255, 0.4); border-color: rgba(0, 242, 255, 0.6); }
        50% { box-shadow: 0 0 35px rgba(0, 242, 255, 0.8); border-color: rgba(0, 242, 255, 1); }
      }

      @keyframes kairos-fade-in {
        from { opacity: 0; transform: scale(0.8); }
        to { opacity: 1; transform: scale(1); }
      }

      /* Error Toast */
      .kairos-error-toast {
        position: absolute;
        bottom: 60px; /* Above the orb */
        left: 0;
        background: rgba(30, 5, 5, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 80, 80, 0.3);
        border-radius: 12px;
        padding: 12px 14px;
        color: #ff8080;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        z-index: 2000;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 220px;
        max-width: 320px;
      }

      .kairos-error-toast.active {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .kairos-error-title {
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .kairos-error-icon {
        width: 16px;
        height: 16px;
        color: #ff6b6b;
      }

      .kairos-error-btn {
        align-self: flex-end;
        background: rgba(255, 80, 80, 0.1);
        color: #ff8080;
        border: 1px solid rgba(255, 80, 80, 0.2);
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .kairos-error-btn:hover {
        background: rgba(255, 80, 80, 0.25);
        color: #fff;
        border-color: rgba(255, 80, 80, 0.4);
      }

      /* HUD GenUI Styles */
      .kairos-hud-component {
        position: absolute;
        pointer-events: auto;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        z-index: 10;
      }

      .kairos-hud-component.active {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .kairos-hud-component.exiting {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }

      /* Positioning */
      .kairos-hud-component.bottom-left { bottom: 80px; left: 24px; }
      .kairos-hud-component.bottom-right { bottom: 80px; right: 24px; }
      .kairos-hud-component.top-left { top: 80px; left: 24px; }
      .kairos-hud-component.top-right { top: 80px; right: 24px; }
      .kairos-hud-component.center-top { top: 80px; left: 50%; transform: translateX(-50%) translateY(20px) scale(0.95); }
      .kairos-hud-component.center-top.active { transform: translateX(-50%) translateY(0) scale(1); }

      /* Default HUD Card Style (Glass) */
      .k-hud-card {
        background: rgba(15, 15, 15, 0.7);
        backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 16px;
        color: white;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        min-width: 200px;
        max-width: 320px;
      }
      /* Video-relative glass island; hover expansion is independent of activation. */
      .kairos-island-container.docked {
        position: absolute; top: var(--island-y, 12px) !important;
        left: var(--island-x, 50%) !important; right: auto !important; bottom: auto !important;
        transform: translateX(-50%) !important; z-index: 1100;
        width: 148px; max-width: calc(100% - 24px);
        align-items: stretch; will-change: auto; pointer-events: auto;
        transition: width 360ms cubic-bezier(.22,1,.36,1);
      }
      .kairos-island-container.docked:hover,
      .kairos-island-container.docked:focus-within,
      .kairos-island-container.docked:has(.dragging),
      .kairos-island-container.docked.dock-dragging { width: var(--island-expanded-width, 340px); }
      .docked, .docked .kairos-orb, .docked .kairos-island-panel { cursor: grab; }
      .docked .kairos-orb { touch-action: none; }
      .docked.has-custom-size .kairos-island-panel { height: calc(var(--island-expanded-height) - 54px); }
      .docked.has-custom-size .kairos-island-notes { max-height: max(0px, calc(var(--island-expanded-height) - var(--island-chrome-height, 190px))); }
      /* Override every hover/expanded variant while the pointer owns sizing. */
      .kairos-island-container.docked.is-resizing,
      .kairos-island-container.docked.is-resizing .kairos-orb { transition: none !important; }
      .kairos-island-resize { display: none; position: absolute; z-index: 5; touch-action: none; }
      .docked:is(:hover, :focus-within, .is-pinned, .dock-dragging) > .kairos-island-resize { display: block; }
      .kairos-island-resize.edge-n, .kairos-island-resize.edge-s { height: 8px; left: 20px; right: 20px; cursor: ns-resize; }
      .kairos-island-resize.edge-n { top: -3px; }
      .kairos-island-resize.edge-s { bottom: -3px; }
      .kairos-island-resize.edge-e, .kairos-island-resize.edge-w { width: 8px; top: 20px; bottom: 20px; cursor: ew-resize; }
      .kairos-island-resize.edge-e { right: -3px; }
      .kairos-island-resize.edge-w { left: -3px; }
      .kairos-island-resize.edge-ne, .kairos-island-resize.edge-nw,
      .kairos-island-resize.edge-se, .kairos-island-resize.edge-sw { width: 18px; height: 18px; }
      .kairos-island-resize.edge-ne { right: 0; top: 0; cursor: nesw-resize; }
      .kairos-island-resize.edge-nw { left: 0; top: 0; cursor: nwse-resize; }
      .kairos-island-resize.edge-se { right: 0; bottom: 0; cursor: nwse-resize; }
      .kairos-island-resize.edge-sw { left: 0; bottom: 0; cursor: nesw-resize; }
      .docked.dock-dragging, .docked.dock-dragging .kairos-orb,
      .docked.dock-dragging .kairos-island-panel { cursor: grabbing; }
      .docked .kairos-orb, .docked .kairos-orb.expanded,
      .docked .kairos-orb:not(.expanded):hover {
        width: 148px; min-width: 0; height: 44px;
        max-width: 100%; padding: 0 15px;
        justify-content: flex-start; gap: 8px;
        border-radius: 25px; color: #fff;
        background: linear-gradient(145deg, rgba(255,255,255,.16), rgba(255,255,255,.03) 45%, rgba(255,255,255,.09)), rgba(18,25,36,.38);
        backdrop-filter: blur(14px) saturate(170%);
        -webkit-backdrop-filter: blur(14px) saturate(170%);
        border: 1px solid rgba(255,255,255,.3);
        box-shadow: inset 0 1px 0 #ffffff66, inset 0 -1px 0 #ffffff14, 0 8px 28px #0003;
        transition: width 360ms cubic-bezier(.22,1,.36,1), height 360ms cubic-bezier(.22,1,.36,1), box-shadow 200ms;
      }
      .docked .kairos-orb:not(.expanded):hover,
      .docked .kairos-orb.expanded:hover, .docked .kairos-orb:focus-within,
      .docked:hover .kairos-orb, .docked:focus-within .kairos-orb,
      .docked:has(.dragging) .kairos-orb, .docked.dock-dragging .kairos-orb {
        width: var(--island-expanded-width, 340px); height: 54px; border-radius: 25px 25px 0 0;
      }
      .docked .kairos-orb.active {
        border-color: #b4e9ff99;
        box-shadow: inset 0 1px 0 #ffffff88, 0 0 18px #6bd4ff33, 0 8px 28px #0003;
      }
      .docked .kairos-orb .kairos-orb-icon {
        display: block; width: 23px; height: 23px; min-width: 23px;
        transform: none; flex-shrink: 0;
      }
      .kairos-island-feedback {
        position: absolute; left: 48px; top: 0; bottom: 0;
        display: flex; align-items: center; gap: 5px; opacity: 0;
        pointer-events: none; white-space: nowrap; color: #e4eee9;
        font: 500 12px/1 system-ui; letter-spacing: -.02em;
        transition: opacity 180ms ease;
      }
      .kairos-feedback-mark { color: #a7e7c6; font-size: 15px; }
      .kairos-orb[data-feedback] .kairos-island-feedback { opacity: 1; }
      .kairos-orb[data-feedback] .kairos-island-brand,
      .kairos-orb[data-feedback] .kairos-island-status { opacity: 0; }
      .kairos-orb[data-feedback=discarded] .kairos-feedback-mark { color: #bdc7d4; }
      .kairos-orb[data-feedback=error] .kairos-feedback-mark { color: #f2bb9c; }
      .kairos-island-brand, .kairos-island-status { transition: opacity 180ms ease; }
      @media (prefers-reduced-motion: reduce) {
        .kairos-island-feedback, .kairos-island-brand, .kairos-island-status { transition: none; }
      }
      .kairos-island-brand {
        font: 600 14px/1 -apple-system, BlinkMacSystemFont, sans-serif;
        letter-spacing: .025em; text-shadow: 0 1px 4px #0005;
        flex-shrink: 0;
      }
      .kairos-island-status {
        width: 11px; height: 11px; border-radius: 50%; margin-left: auto;
        background: #ffffff60; flex-shrink: 0;
      }
      .active .kairos-island-status { background: #57df96; box-shadow: 0 0 8px #57df9644; }
      .docked:is(:hover, :focus-within, .is-pinned, .dock-dragging) .kairos-island-status { margin-left: 0; }
      .docked:is(:hover, :focus-within, .is-pinned, .dock-dragging) .kairos-orb .kairos-orb-menu { margin-left: auto; }
      .docked .kairos-orb .kairos-orb-menu {
        max-width: 0; opacity: 0; visibility: hidden;
        pointer-events: none; gap: 4px; margin-left: 0;
        transition: opacity 180ms, max-width 360ms cubic-bezier(.22,1,.36,1);
      }
      .docked .kairos-orb:hover .kairos-orb-menu,
      .docked .kairos-orb:focus-within .kairos-orb-menu,
      .docked:hover .kairos-orb-menu, .docked:focus-within .kairos-orb-menu,
      .docked.dock-dragging .kairos-orb-menu {
        max-width: 190px; opacity: 1; visibility: visible; pointer-events: auto;
      }
      .docked .kairos-orb .kairos-orb-btn {
        width: auto; height: 32px; padding: 0 8px;
        border-radius: 17px; background: #ffffff12; color: #fff;
        font: 500 12px/1 system-ui; white-space: nowrap;
        border: 1px solid #ffffff20; text-shadow: 0 1px 3px #0005;
      }
      .docked .kairos-orb .kairos-orb-btn:hover { background: #ffffff28; transform: none; }
      .docked .kairos-orb:focus-visible { outline: 2px solid #b4e9ff; outline-offset: 3px; }
      .kairos-island-panel {
        display: none; width: 100%; min-width: 0;
        max-height: calc(var(--island-max-height, 300px) - 54px);
        overflow: auto; overscroll-behavior: contain; scrollbar-width: thin;
        padding: 10px 14px 12px; color: #f0f6ff;
        background: linear-gradient(145deg, #ffffff15, #ffffff05), rgba(18,25,36,.58);
        backdrop-filter: blur(14px) saturate(170%);
        -webkit-backdrop-filter: blur(14px) saturate(170%);
        border: 1px solid #ffffff40; border-top: 0;
        border-radius: 0 0 22px 22px; box-shadow: 0 14px 28px #0003;
        font: 12px/1.5 system-ui;
      }
      .docked:hover .kairos-island-panel, .docked:focus-within .kairos-island-panel,
      .docked:has(.dragging) .kairos-island-panel,
      .docked.dock-dragging .kairos-island-panel { display: block; }
      .kairos-island-time { color: #cee4f0; font-variant-numeric: tabular-nums; font-size: 11px; }
      .kairos-island-panel .kairos-timeline-container {
        position: relative; inset: auto; height: 30px; width: 100%; padding: 0;
        opacity: 1; pointer-events: auto;
      }
      .kairos-island-panel .kairos-timeline-rail {
        left: 0; right: 0; height: 4px; border: 0; box-shadow: none;
      }
      .kairos-island-panel .kairos-progress-bar::after,
      .kairos-island-panel .kairos-ticks-container { display: none; }
      .kairos-island-panel .kairos-pin { top: 0; height: 30px; width: 16px; pointer-events: auto; }
      .kairos-island-panel .kairos-pin:not(.kairos-marker-insight)::after {
        content: ''; width: 5px; height: 8px; border-radius: 3px; background: #b2eaff;
        filter: none; box-shadow: 0 0 0 2px #273d50;
      }
      .kairos-island-notes { max-height: 180px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
      .kairos-island-note-row { display: flex; gap: 4px; align-items: center; border-top: 1px solid #ffffff14; }
      .kairos-island-note {
        display: flex; flex: 1; min-width: 0; align-items: center; gap: 10px;
        background: transparent; border: 0; padding: 9px 3px; color: #f0f6ff;
        font: inherit; cursor: pointer; text-align: left;
      }
      .kairos-island-note span:first-child { color: #afe2f5; font-size: 11px; flex-shrink: 0; }
      .kairos-island-note span:last-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .kairos-island-delete { background: transparent; color: #becfda; border: 0; cursor: pointer; padding: 6px; }
      .kairos-island-delete { display: inline-flex; align-items: center; flex-shrink: 0; }
      .kairos-island-delete.is-confirming { white-space: nowrap; color: #ffb7b0; background: #b6373025; border-radius: 6px; font: 11px/1.4 system-ui; }
      .kairos-island-note:hover, .kairos-island-delete:hover { background: #ffffff12; border-radius: 6px; }
      .kairos-island-library { background: transparent; color: #cee4f0; border: 0; padding: 10px 0 0; font: inherit; cursor: pointer; }
      .kairos-island-empty { margin: 6px 0 10px; color: #becfda; font-size: 11px; }
      .kairos-island-container.docked.is-pinned { width: var(--island-expanded-width, 340px); }
      .docked.is-pinned .kairos-orb,
      .docked.is-pinned .kairos-orb.expanded,
      .docked.is-pinned .kairos-orb:not(.expanded) {
        width: var(--island-expanded-width, 340px); height: 54px; border-radius: 25px 25px 0 0;
      }
      .docked.is-pinned .kairos-orb .kairos-orb-menu {
        max-width: 190px; opacity: 1; visibility: visible; pointer-events: auto;
      }
      .docked.is-pinned .kairos-island-panel { display: block; }
      .kairos-island-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .kairos-island-pin-toggle {
        border: 1px solid #ffffff24; border-radius: 16px; padding: 0 8px; height: 32px; white-space: nowrap; flex-shrink: 0;
        background: #ffffff0d; color: #d6e7f3; font: 11px/1.4 system-ui; cursor: pointer;
      }
      .kairos-island-pin-toggle[aria-pressed=true] { color: #bcf0ff; background: #77d6ff26; border-color: #a0e2ff66; }
      .kairos-island-panel .kairos-timeline-container { height: 24px; }
      .kairos-island-panel .kairos-timeline-rail { height: 4px; background: #c4d6e52e; box-shadow: inset 0 1px 2px #0003; }
      .kairos-island-panel .kairos-progress-bar { background: linear-gradient(90deg, #a6c6da, #eef7ff) !important; }
      .kairos-island-panel .kairos-progress-bar::after {
        content: ''; display: block; width: 0; min-width: 0; padding: 0; right: -5px; top: -7px;
        height: 0; border-radius: 0; background: transparent; backdrop-filter: none;
        opacity: 1; box-shadow: none; border: 0;
        border-left: 5px solid transparent; border-right: 5px solid transparent;
        border-top: 8px solid #f4f8fc; transform: none;
        filter: drop-shadow(0 1px 2px #0008);
      }
      .kairos-island-panel .kairos-timeline-container:hover .kairos-progress-bar::after { transform: none; }
      .kairos-timeline-note-marks { position: absolute; inset: 0; pointer-events: none; }
      .kairos-timeline-note-mark {
        position: absolute; top: calc(var(--note-y, 12px) - 4px); height: 8px; width: 8px; padding: 0;
        transform: translateX(-50%); border: 0; background: transparent; cursor: pointer; pointer-events: auto;
      }
      .kairos-timeline-note-mark::before {
        content: ''; position: absolute; left: 2.5px; top: 2.5px; width: 3px; height: 3px;
        border-radius: 50%; background: #d1efff;
        box-shadow: 0 0 4px #a9ddff70;
        transition: background 160ms ease, box-shadow 160ms ease;
      }
      .kairos-timeline-note-mark.is-current::before,
      .kairos-timeline-note-mark:hover::before { background: #f0faff; box-shadow: 0 0 0 1px #b5e6ff22, 0 0 6px #b5e6ff90; }
      .kairos-timeline-note-mark:focus-visible { outline: 1px solid #b5edff; border-radius: 5px; }
      .kairos-island-panel .kairos-pin { display: none; }
      .kairos-island-moments {
        display: flex; gap: 6px; overflow-x: auto; scrollbar-width: thin;
        padding: 1px 0 9px; margin-bottom: 4px; overscroll-behavior: contain;
      }
      .kairos-island-moment {
        flex: 0 0 auto; padding: 6px 9px; border-radius: 8px;
        background: #a6dbf112; color: #d4f2ff; border: 1px solid #afe0f744;
        font: 11px/1.4 system-ui; font-variant-numeric: tabular-nums; cursor: pointer;
      }
      .kairos-island-moment:hover { background: #a6dbf133; border-color: #afe0f7aa; }
      .kairos-island-note-row { position: relative; padding-left: 12px; }
      .kairos-island-note-row.is-current { background: linear-gradient(90deg, #ffffff09, transparent); }
      .kairos-island-note-row.is-current::before {
        content: ''; position: absolute; left: 1px; top: calc(50% - 3px);
        width: 0; height: 0; border-top: 3px solid transparent;
        border-bottom: 3px solid transparent; border-left: 4px solid #fff;
      }
      .kairos-island-note-row.is-current .kairos-island-note span:first-child { color: #fff; font-weight: 600; }
      .kairos-island-note-row.is-current .kairos-island-note span:last-child { color: #fff; }
      .kairos-island-moment { position: relative; border-color: transparent; background: transparent; color: #d3dce4; }
      .kairos-island-moment.is-current { color: #fff; border-color: transparent; background: #ffffff0a; }
      .kairos-island-moment.is-current::after {
        content: ''; position: absolute; bottom: 1px; left: 25%; right: 25%;
        height: 1px; background: #ffffffd9;
      }
      .kairos-island-panel, .kairos-island-notes, .kairos-island-moments {
        scrollbar-color: rgba(192,220,240,.35) transparent; color-scheme: dark;
      }
      .kairos-island-moment:focus-visible, .kairos-island-pin-toggle:focus-visible { outline: 2px solid #bceeff; outline-offset: -2px; }
      .kairos-note-wrapper .kairos-note-action-btn {
        background: #ffffff0d; border: 1px solid #ffffff24; color: #dbe5ef;
        box-shadow: none;
      }
      .kairos-note-wrapper .kairos-note-action-btn:hover { background: #ffffff25; color: white; box-shadow: none; }
      .kairos-note-wrapper .kairos-note-preview strong,
      .kairos-note-wrapper .kairos-note-preview h1,
      .kairos-note-wrapper .kairos-note-preview h2,
      .kairos-note-wrapper .kairos-note-preview h3 { color: #fff; }
      .kairos-overlay:has(.kairos-note-wrapper.active) .kairos-spatial-tooltip { display: none; }
      @media (prefers-reduced-motion: reduce) {
        .docked .kairos-orb, .docked .kairos-orb .kairos-orb-menu { transition: none; }
      }
    `;
  }

  // Export to global namespace
  window.Kairos.getStyles = getStyles;

})();
