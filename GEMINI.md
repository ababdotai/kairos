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
├── manifest.json         # Extension configuration (Entry point)
├── background.js         # Service Worker (DB access, API calls)
├── content.js            # Main Content Script loader
├── content.css           # Shadow Host styles
├── content/              # Modular Content Logic
│   ├── config.js         # Global configs & constants
│   ├── utils.js          # Helpers (Time format, ID extraction)
│   ├── storage.js        # IndexedDB Proxy (Messaging)
│   ├── tracker.js        # Video tracking logic
│   ├── overlay.js        # Main UI Manager (Shadow DOM)
│   ├── styles.js         # CSS-in-JS (Template literals)
│   └── ...
├── popup.html/js         # Extension popup
├── dashboard.html/js     # Full-page dashboard
└── icons/                # Assets
```

### 2. Module System & Communication
- **Content Modules:** Uses **IIFE** (Immediately Invoked Function Expressions) to encapsulate logic.
- **Global Namespace:** All modules export to `window.Kairos`.
  - Dependency Order: `config` -> `utils` -> `storage` -> `tracker` -> `styles` -> `overlay` -> `content`.
- **Inter-Process Communication:**
  - Content Scripts $\leftrightarrow$ Background Script: `chrome.runtime.sendMessage` (e.g., for saving notes to IndexedDB).

### 3. UI Implementation
- **Shadow DOM:** All UI is encapsulated in a Shadow Root (`#kairos-overlay-root`) to prevent style bleeding.
- **Styles:** Injected dynamically via `content/styles.js` into the Shadow Root.
- **Overlay:** A global overlay sits on top of video players (`z-index: MAX`).

## Development Workflow

### Building and Running
1.  **No Build Step:** The project uses raw files.
2.  **Load Extension:**
    - Open `chrome://extensions/`
    - Enable **Developer mode**.
    - Click **Load unpacked**.
    - Select the project root directory (`kairos/`).

### Key Commands
- Since there is no `package.json` with scripts, standard `npm` commands are not applicable for building.
- **Reloading:** Updates to `content/*` require reloading the extension in `chrome://extensions/` and refreshing the target video page. Updates to `background.js` require clicking "Update" or "Service Worker" inspect to refresh.

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
