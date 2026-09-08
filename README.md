# Kairos

> **Kairos = Vital Moments. Your AI secretary while watching videos.**

[中文文档 (Chinese README)](README.zh-CN.md)

How can watching knowledge-dense videos become more valuable and interactive?

Kairos is a video note-taking agent built on the multimodal understanding capabilities of Gemini 3 Flash (`gemini-3-flash-preview`), currently shipped as a Chrome Extension. While you watch high-information-density videos on Coursera / Udemy / Bilibili / YouTube / TED, Kairos lets you take notes elegantly without breaking your flow. With simple, intuitive interactions combined with intelligent visual understanding and semantic analysis, every vital moment (Kairos) is captured precisely — turning your fragmented video notes into a queryable, indexable knowledge base.

Kairos is a **Proactive + Reactive** agent:

- **Proactive**: Kairos watches the video with you and automatically discovers highlights and key points.
- **Reactive**: You provide the signal; the AI reduces the noise and fills in the fidelity.

## 🎯 Core Philosophy

Traditional video learning is linear and unstructured — you have to scrub the progress bar to find information. Taking notes while watching is painful — you must manually screenshot into another app and type everything yourself.

Kairos redefines how you take notes on videos:

- **Flow mode**: following Granola's design philosophy — "imperceptible AI" that augments rather than replaces
- **Non-linear knowledge extraction**: turn long videos into a queryable, living database
- **Zero UI friction**: floating-orb interaction, no sidebar required
- **Local-first**: your data stays on your device, with deep Obsidian / Notion integration
- **Multimodal understanding**: Gemini 3 Flash's vision capabilities automatically extract code, formulas, and key concepts

Deep understanding and active learning: not just watching efficiency, but genuine comprehension.

## ✨ Key Features

- **Smart notes**: watch together with the AI — it analyzes and discovers highlights, marking them with 💡 on the timeline. Add a note via hotkey, clicking 💡, or 📌; Kairos captures the frame plus the surrounding audio/video context and generates a summary (optionally expanded from your keywords).
- **Semantic timeline**: a visualized progress bar based on information density.
- **AI-assisted completion**: auto-generates note summaries from video content and subtitles.
- **Workflow integration**: Obsidian local direct-connect (FileSystemAccess API), Notion database sync, deep-link jump-back support.
- **Object-level interaction**: recognizes code blocks and diagrams in the video, with one-click copy / explain.

## 🏗️ Tech Stack

- **Build**: Vite + CRXJS Plugin
- **AI**: Gemini 3 Flash API (multimodal understanding), OpenAI-compatible providers
- **Storage**: IndexedDB (local) + FileSystemAccess API (Obsidian)
- **Architecture**: Manifest V3, Shadow DOM isolated overlay layer

## 📦 Project Structure

```
kairos/
├── src/                  # Source code
│   ├── content/          # Content script modules
│   ├── background.js     # Background service worker
│   ├── content.js        # Content script entry
│   ├── popup.html        # Extension popup
│   └── dashboard.html    # Notes management page
├── public/               # Static assets (icons)
├── dist/                 # Build output (load this directory)
├── vite.config.js        # Vite config
├── manifest.json         # Manifest V3 config
└── doc/                  # Documentation
```

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Dev mode (hot reload — the extension refreshes automatically)
pnpm run dev

# Build for production
pnpm run build
```

Load into Chrome:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` directory (not the project root)

## 🛡️ Privacy & Security

- **Local-first data**: all notes are stored locally (IndexedDB) by default
- **Optional sync**: metadata syncs to Obsidian/Notion only with your authorization
- **Serverless architecture**: no backend — calls the Gemini API directly with your own key (BYOK)
- **Transparent permissions**: only the necessary host permissions, compliant with Chrome Web Store review requirements

## 📖 References

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/)
- [Shadow DOM Tutorial](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)
- [FileSystemAccess API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)

## 📄 License

MIT License

---

**Built with ❤️ by an indie maker who believes in the power of capturing the right moment.**
