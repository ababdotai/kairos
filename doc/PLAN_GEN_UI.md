# Kairos Generative UI (HUD) Implementation Plan

## Objective
Enhance Kairos with a "Generative UI" system that creates a Heads-Up Display (HUD) effect on top of videos. This replaces the static "Auto Highlight" with dynamic, AI-generated Motion Graphics (MG) animations synchronized with video content.

## Architecture
- **Renderer (`GenUIManager`)**: A new module responsible for rendering HTML/CSS animations in the Overlay Shadow DOM.
- **Scheduler**: A timing engine to mount/unmount components based on video `currentTime`.
- **Generator (`HUDAgent`)**: An AI agent that analyzes subtitles/audio and generates a "Visual Script" (JSON) containing timestamps, types, and content.

## Implementation Steps

### Phase 1: Foundation - The Renderer & Mock Verification
**Goal:** Verify we can render arbitrary HTML/CSS components on the overlay.
1.  **Create `src/content/gen_ui.js`**:
    -   Define `GenUIManager` class.
    -   Implement `renderComponent(config)` method.
    -   Support basic positioning (e.g., "bottom-left", "top-right") and raw HTML/CSS injection.
2.  **Mock Integration**:
    -   Manually inject a static "Lower Third" component (using `Video-Wrapper-Skills` templates as reference) into the active video overlay.
    -   **Verification:** Ensure styles (Tailwind-like or custom CSS) are isolated and visible on top of YouTube/Bilibili.

### Phase 2: Timeline Synchronization
**Goal:** Enable components to appear/disappear at specific times.
1.  **Implement Scheduler**:
    -   Add `loadScript(script)` method to `GenUIManager`. Script format: `[{ start: 5.0, duration: 3.0, html: "...", css: "..." }]`.
    -   Listen to video `timeupdate` events.
    -   Manage an "Active Queue" to mount new items and unmount expired ones.
2.  **Mock Script Test**:
    -   Create a hardcoded script (e.g., "At 00:05 show Card A, At 00:10 show Card B").
    -   **Verification:** Play video and verify exact synchronization.

### Phase 3: AI Data Pipeline (The Brain)
**Goal:** Connect LLM to generate the visual script.
1.  **Prompt Engineering**:
    -   Design a System Prompt for Gemini.
    -   Input: Subtitle chunk (text + timestamps).
    -   Output: JSON Array of Visual Events (Type, Start Time, Duration, Content).
    -   *Constraint:* Output must be valid JSON and include specific visual instructions (color, style).
2.  **Backend Handler**:
    -   Update `src/background.js` to handle `GENERATE_HUD_SCRIPT` message.
3.  **Verification**:
    -   Send a sample subtitle text to the model.
    -   **Verification:** Check if the returned JSON contains valid HTML/CSS and correct timestamps.

### Phase 4: End-to-End Integration
**Goal:** Automate the flow.
1.  **Create `HUDAgent`**:
    -   Orchestrate the flow: `SubtitleManager` -> `Background (LLM)` -> `GenUIManager`.
    -   Handle streaming/buffering (analyze 1-minute chunks).
2.  **UI Trigger**:
    -   Add a toggle in the Orb menu to enable/disable "HUD Mode".
3.  **Verification:**
    -   Open a video, enable HUD, and verify animations appear automatically without manual input.

### Phase 5: Polish & Safety
1.  **Smart Positioning**: Implement a simple "Quadrant System" to avoid blocking the center of the screen (simulating the "Smart Grid" concept).
2.  **Performance**: Ensure DOM nodes are cleaned up (garbage collected) after animation ends.

## Dependencies
- Existing: `src/content/overlay.js` (for Shadow DOM access).
- Existing: `src/content/tracker.js` (for video context).
- New: `src/content/gen_ui.js`.
