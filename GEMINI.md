# Kairos - Gemini Context

## Project Overview
**Kairos** is a Chrome Extension designed to be an AI-powered video secretary. It helps users capture key moments while watching videos (YouTube, Bilibili) by transforming linear video content into queryable knowledge bases.

**Core Philosophy:**
- **Proactive:** Automatically discovers highlights.
- **Reactive:** User provides signals; AI reduces noise.
- **Local-First:** Data stored in IndexedDB; optionally syncs to Obsidian/Notion.
- **Zero Friction:** "Dynamic Island" style floating interactions.

## Technology Stack
- **Platform:** Chrome Extension (Manifest V3)
- **Language:** Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Build System:** None (Currently using raw JS modules). Future plans include Vite + React.
- **Storage:** IndexedDB (via Background Script), FileSystemAccess API.
- **AI:** Google Gemini 3 Flash (Multimodal capabilities).

## Architecture
The project follows a modular Vanilla JS architecture without a bundler.

### 1. File Structure
```
kairos/
├── src/                  # Source code
│   ├── background.js     # Service Worker (DB access, API calls)
│   ├── content.js        # Main Content Script loader
│   ├── popup.html        # Extension popup
│   ├── popup.js          # Extension popup logic
│   ├── dashboard.html    # Full-page dashboard
│   ├── dashboard.js      # Full-page dashboard logic
│   ├── content/          # Modular Content Logic
│   │   ├── config.js     # Global configs & constants
│   │   ├── utils.js      # Helpers
│   │   ├── storage.js    # IndexedDB Proxy
│   │   ├── tracker.js    # Video tracking logic
│   │   ├── overlay.js    # Main UI Manager
│   │   ├── styles.js     # CSS-in-JS
│   │   └── ...
│   └── content.css       # Shadow Host styles
├── public/               # Static assets
│   └── icons/            # Extension icons
├── dist/                 # Build output (Load this in Chrome)
├── vite.config.js        # Vite configuration
├── manifest.json         # Source Manifest
└── package.json          # Dependencies & Scripts
```

### 2. Module System & Communication
- **Build System:** Vite + CRXJS Plugin. Bundles ESM modules into browser-compatible scripts.
- **Content Modules:** Standard ES Modules (`import/export`).
- **Global Namespace:** Still uses `window.Kairos` for runtime coordination between bundled modules.
- **Inter-Process Communication:**
  - Content Scripts $\leftrightarrow$ Background Script: `chrome.runtime.sendMessage`.

### 3. UI Implementation
- **Shadow DOM:** All UI is encapsulated in a Shadow Root (`#kairos-overlay-root`) to prevent style bleeding.
- **Styles:** Injected dynamically via `content/styles.js` into the Shadow Root.
- **Overlay:** A global overlay sits on top of video players (`z-index: MAX`).

## Development Workflow

### Building and Running
1.  **Install Dependencies:** `pnpm install`
2.  **Development (HMR):** `pnpm run dev`
    - Watches for changes and updates the extension automatically.
3.  **Production Build:** `pnpm run build`
4.  **Load Extension:**
    - Open `chrome://extensions/`
    - Enable **Developer mode**.
    - Click **Load unpacked**.
    - **Select the `dist/` directory** (NOT the project root).

### Key Commands
- `pnpm run dev`: Start development server.
- `pnpm run build`: Build for production.
- **Reloading:**
  - With `pnpm run dev`, most changes (UI, logic) hot reload.
  - If you change `manifest.json` or background script logic significantly, you may need to reload the extension in `chrome://extensions/`.

## Coding Conventions
- **Style:** Google JavaScript Style Guide.
- **Formatting:** 2 spaces indentation.
- **Naming:**
  - Classes: `PascalCase` (e.g., `OverlayManager`)
  - Functions/Variables: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - CSS Classes: `kebab-case` with `kairos-` prefix.
- **Comments:** JSDoc style for functions and classes.
- **Commits:** Angular Commit Message Convention. BUT DONOT commit automatically!

## Documentation
- `CLAUDE.md`: Detailed architecture and design philosophy.
- `README.md`: User-facing introduction.
- `doc/`: Project documentation.
