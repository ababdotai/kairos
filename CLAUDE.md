# Kairos 项目开发指南（Claude Agent 专用）

> 本文档为 Claude Code Agent 提供项目上下文和开发指导，确保代码生成符合项目规范和技术架构。

## 📋 项目概览

**项目名称**：Kairos
**项目类型**：Chrome Extension (Manifest V3)
**核心定位**：基于 Gemini 3 Flash 的视频笔记工具，遵循 Granola 的设计哲学，将 AI 融入心流模式

### 核心价值主张
- 将线性视频转化为可查询的知识库
- 零 UI 摩擦的悬浮球交互
- 本地优先的数据存储策略
- 深度集成 Obsidian/Notion 工作流

### 设计哲学
- **Kairos（关键时刻）**：只捕捉质的时间，而非量的时间
- **Signal vs Noise**：在视频流中提取高价值信号
- **Liquid Glass**：流体玻璃质感的 UI 设计语言
- **Local-First**：数据主权归用户所有

## 🏗️ 技术架构

### 当前技术栈（阶段 0-1：Vite + Vanilla 实现）
```
前端框架：Vanilla ES6+ JavaScript（通过 Vite 打包）
构建工具：Vite + CRXJS Vite Plugin
样式方案：Vanilla CSS3 + Shadow DOM 内联样式
AI 能力：Gemini 3 Flash API（多模态理解）
存储方案：IndexedDB（通过 Background Script 代理）
扩展架构：Manifest V3 (Chrome Extension)
```

### 未来技术栈（阶段 2+：可能迁移）
```
前端框架：React 18 + TypeScript
样式方案：Tailwind CSS + Framer Motion
```

### 架构设计原则

#### 1. 全局悬浮层（Global Overlay）
- **实现方式**：Shadow DOM 隔离样式，避免与宿主页面冲突
- **坐标同步**：使用 `requestAnimationFrame` 实时追踪视频元素的 `getBoundingClientRect`
- **层级管理**：`z-index: 2147483647`，确保在最顶层
- **事件穿透**：`pointer-events: none` 用于背景层，交互元素单独设置 `pointer-events: auto`

#### 2. 权限管理（Manifest V3）
- **必需权限**：
  - `storage`：存储用户配置和笔记数据
  - `host_permissions`：`*://www.youtube.com/*`, `*://www.bilibili.com/*`
- **可选权限**：
  - `fileSystem`：Obsidian 本地直连（需用户授权）

#### 3. 数据架构
```javascript
// IndexedDB Schema (background.js 中实现)
const NoteEntry = {
  id: String,           // UUID
  videoId: String,      // 平台前缀 + Video ID (如 "yt-xxxxx")
  videoUrl: String,     // 完整视频 URL
  videoTitle: String,   // 视频标题
  timestamp: Number,    // 视频时间戳（秒）
  timeLabel: String,    // 格式化时间 "MM:SS"
  percentage: Number,   // 时间轴百分比位置
  content: String,      // 用户笔记内容
  createdAt: Number     // 创建时间戳
};
```

## 📁 项目文件结构

```
kairos/
├── src/                    # 源代码目录
│   ├── background.js       # Background Service Worker
│   ├── content.js          # Content Script 入口点
│   ├── content.css         # Shadow Host 样式
│   ├── popup.html          # 扩展弹窗 HTML
│   ├── popup.js            # 扩展弹窗逻辑
│   ├── dashboard.html      # 笔记管理页面 HTML
│   ├── dashboard.js        # 笔记管理页面逻辑
│   └── content/            # Content Script 模块化目录
│       ├── config.js       # 配置常量
│       ├── utils.js        # 工具函数
│       ├── storage.js      # IndexedDB 代理
│       ├── tracker.js      # VideoTracker 类
│       ├── styles.js       # CSS 样式字符串
│       └── overlay.js      # OverlayManager 类
├── public/                 # 静态资源
│   └── icons/              # 图标资源
├── dist/                   # 构建输出目录（加载此目录）
├── vite.config.js          # Vite 配置
├── manifest.json           # Manifest 配置
├── package.json            # 项目依赖
├── doc/                    # 文档目录
├── test/                   # 测试文件
└── temp/                   # 临时文件
```

### 模块依赖关系
```
src/content.js (入口)
    ├── src/content/config.js     (导入)
    ├── src/content/utils.js      (导入)
    ├── src/content/storage.js    (导入)
    ├── src/content/tracker.js    (导入)
    ├── src/content/styles.js     (导入)
    └── src/content/overlay.js    (导入)
```

### 模块通信机制
虽然使用了 ES Modules 进行打包，运行时仍通过 `window.Kairos` 全局命名空间共享实例，以便于各模块间的协调：
```javascript
// content.js 入口
import './content/config.js';
import './content/utils.js';
// ...
const { CONFIG, log, OverlayManager } = window.Kairos;
```

## 🎯 开发阶段与任务

### ✅ 阶段 0 - 技术验证（已完成）
- [x] 避免过度工程化，使用 Vanilla ES6+ JavaScript 实现
- [x] 引入 Vite 构建系统，支持 HMR 和 NPM 包
- [x] 全局悬浮层实现（Shadow DOM）
- [x] 视频坐标实时追踪（YouTube/Bilibili）
- [x] 里程碑：指示框紧贴视频播放器，支持全屏和滚动

### ✅ 阶段 1 - 交互 MVP（已完成）
- [x] 悬浮球交互组件（The Orb）：灵动岛风格展开
- [x] 天花板时间轴（The Ceiling Timeline）：Pin 功能
- [x] 浏览器本地笔记存储（IndexedDB CRUD）
- [x] Apple Intelligence 风格边框动效
- [x] Markdown 导出功能
- [x] Dashboard 管理界面
- [x] 里程碑：完整记录笔记并导出 MD

### 🚧 阶段 2 - AI 大脑接入（当前）
- [ ] 接入 Google Generative AI SDK
- [ ] Gemini API 调用管道（Background Script）
- [ ] 字幕抓取与解析：YouTube timedtext API
- [ ] 多模态内容分析：截图 + 字幕 + 用户笔记 → AI 摘要
- [ ] 自动发现关键点，以 💡 形式显示在 Timeline 上
- [ ] 里程碑：AI 自动提取视频中的代码并生成解释

### 📅 阶段 3 - 护城河建设
- [ ] Obsidian 本地直连（FileSystemAccess API）
- [ ] Notion Integration 同步
- [ ] Deep Link 回跳支持

### 📅 阶段 4 - 品质打磨与发布
- [ ] UI/UX 精细化
- [ ] Sound Design（截图音效、保存音效）
- [ ] Product Hunt 发布准备

## 💻 代码规范

### 命名规范
- **模块文件**：camelCase（如 `config.js`, `overlay.js`）
- **类名**：PascalCase（如 `OverlayManager`, `VideoTracker`）
- **函数名**：camelCase（如 `getVideoId`, `formatTime`）
- **常量**：UPPER_SNAKE_CASE（如 `CONFIG`, `Z_INDEX`）
- **CSS 类名**：kebab-case 带 `kairos-` 前缀（如 `kairos-overlay`, `kairos-orb`）

### 代码风格
- **语言**：所有代码和注释使用英文
- **注释规范**：函数级英文注释，遵守 Google 开源规范（JSDoc 风格）
- **模块封装**：使用 IIFE 防止全局污染
- **严格模式**：所有模块开头使用 `'use strict'`

### 示例代码

#### 模块定义示例
```javascript
/**
 * Kairos Utils Module
 * Helper functions for video identification and formatting
 */

(function () {
  'use strict';

  const { log } = window.Kairos;

  /**
   * Utility functions for video operations
   */
  const Utils = {
    /**
     * Extracts video ID from current URL based on platform
     * @returns {string} Platform-prefixed video ID
     */
    getVideoId() {
      const url = new URL(window.location.href);
      if (url.hostname.includes('youtube.com')) {
        return `yt-${url.searchParams.get('v')}`;
      } else if (url.hostname.includes('bilibili.com')) {
        const bvid = url.pathname.split('/').find(p => p.startsWith('BV'));
        return bvid ? `bili-${bvid}` : `bili-${url.pathname}`;
      }
      return `generic-${url.hostname}${url.pathname}`;
    },

    /**
     * Formats seconds into HH:MM:SS or MM:SS string
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    formatTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return [h, m, s]
        .filter((v, i) => v > 0 || i > 0)
        .map(v => v.toString().padStart(2, '0'))
        .join(':');
    }
  };

  // Export to global namespace
  window.Kairos.Utils = Utils;

})();
```

#### 类定义示例
```javascript
/**
 * VideoTracker class - Tracks video element position and dimensions
 */
class VideoTracker {
  /**
   * Creates a VideoTracker instance
   * @param {string} videoSelector - CSS selector for video elements
   */
  constructor(videoSelector) {
    this.videoSelector = videoSelector;
    this.videoElement = null;
    this.animationFrameId = null;
    this.callbacks = [];
  }

  /**
   * Starts tracking the video element
   * @param {Function} callback - Callback function receiving (rect, video)
   */
  start(callback) {
    this.callbacks.push(callback);
    if (!this.animationFrameId) {
      this.update();
    }
  }

  /**
   * Stops tracking the video element
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
```

## 🎨 UI/UX 设计规范

### 色彩方案（Dark Mode Only）
```css
/* 背景色 */
--bg-primary: #0A0A0A;        /* 黑曜石 */
--bg-secondary: #1A1A1A;      /* 浅黑 */
--bg-glass: rgba(25, 25, 25, 0.7);  /* 玻璃背景 */

/* 文本色 */
--text-primary: #FFFFFF;      /* 主文本 */
--text-secondary: rgba(255, 255, 255, 0.4);  /* 次要文本 */

/* 强调色 */
--accent-cyan: #00f2ff;       /* 青色高亮 */
--accent-purple: #7000ff;     /* 紫色 */
--accent-pink: #ff0095;       /* 粉色 */

/* 玻璃质感 */
--glass-blur: 32px;
--glass-border: rgba(255, 255, 255, 0.15);
```

### 字体规范
```css
/* UI 字体 */
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;

/* 代码字体 */
font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
```

### 动效规范
- **边框脉冲**：`kairos-border-pulse` 动画，周期 3s，alternate
- **输入框展开**：`max-height` + `opacity`，持续 500ms，easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`
- **Orb 展开**：`width` 动画，持续 400ms，easing: `cubic-bezier(0.3, 1.2, 0.3, 1)`
- **涟漪效果**：`scale` 从 0 到 100，持续 1.6s

## 🔧 关键技术实现要点

### 1. Shadow DOM 样式注入
```javascript
// overlay.js 中的实现
injectStyles() {
  const style = document.createElement('style');
  style.textContent = getStyles();  // 从 styles.js 获取 CSS 字符串
  this.shadowRoot.appendChild(style);
}
```

### 2. Content Script 与 Background Script 通信
```javascript
// content/storage.js - 发送消息
async saveNote(note) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'SAVE_NOTE', payload: note }, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (response && response.success) resolve(response.data);
      else reject(response ? response.error : 'Unknown error');
    });
  });
}

// background.js - 接收消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_NOTE') {
    saveNote(request.payload)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;  // 保持消息通道开放
  }
});
```

### 3. 视频元素过滤逻辑
```javascript
// tracker.js 中的实现
findVideoElement() {
  const allVideos = Array.from(document.querySelectorAll(this.videoSelector));

  const validCandidates = allVideos.filter(video => {
    // 1. 可见性检查
    if (video.offsetParent === null) return false;

    // 2. 最小尺寸检查
    const rect = video.getBoundingClientRect();
    if (rect.width < CONFIG.MIN_WIDTH || rect.height < CONFIG.MIN_HEIGHT) return false;

    // 3. 忽略列表检查（Banner、预览等）
    const isIgnored = CONFIG.IGNORE_SELECTORS.some(sel => video.matches(sel));
    if (isIgnored) return false;

    return true;
  });

  // 选择最大面积的视频
  validCandidates.sort((a, b) => {
    const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
    const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
    return areaB - areaA;
  });

  return validCandidates[0] || null;
}
```

## 🚧 开发注意事项

### 避坑指南

1. **模块加载顺序**
   - `manifest.json` 中的 JS 文件顺序很重要
   - 必须按依赖关系排列：config → utils → storage → tracker → styles → overlay → content

2. **Shadow DOM 事件冒泡**
   - Shadow DOM 内的事件不会自动冒泡到外部
   - 需要手动 `stopPropagation()` 防止影响视频播放器的快捷键

3. **视频平台差异**
   - YouTube 和 Bilibili 的视频元素选择器不同
   - 使用 `CONFIG.IGNORE_SELECTORS` 过滤非主视频元素

4. **Chrome 扩展审核要求**
   - `host_permissions` 必须说明用途
   - 不要请求不必要的权限

### 性能优化

1. **视频追踪优化**
   - 使用 `requestAnimationFrame` 而非 `setInterval`
   - 在视频元素稳定后减少重绘频率

2. **DOM 操作优化**
   - 批量更新样式，避免重排
   - 使用 CSS transform 代替 top/left 进行动画

## 📦 构建与部署

### 开发模式（当前）
由于使用 Vanilla JS，无需构建步骤：
1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目根目录（不是 dist/）
5. 修改代码后点击刷新图标重新加载

### 调试技巧
- Content Script 日志：在视频页面的 Console 中查看 `[Kairos]` 前缀的日志
- Background Script 日志：在 `chrome://extensions/` 点击 "Service Worker" 查看
- Shadow DOM 检查：在 DevTools Elements 面板展开 `#kairos-overlay-root` 下的 `#shadow-root`

## 📞 常见问题

### Q: 如何添加新的 Content Script 模块？
A:
1. 在 `content/` 目录创建新文件
2. 使用 IIFE 封装，通过 `window.Kairos` 导出
3. 在 `manifest.json` 的 `content_scripts.js` 数组中按依赖顺序添加

### Q: 如何修改 CSS 样式？
A: 编辑 `content/styles.js` 中的 `getStyles()` 函数返回的 CSS 字符串。

### Q: 如何处理新的视频平台？
A:
1. 在 `manifest.json` 的 `host_permissions` 和 `matches` 中添加域名
2. 在 `content/utils.js` 的 `getVideoId()` 中添加解析逻辑
3. 在 `content/config.js` 的 `IGNORE_SELECTORS` 中添加需要忽略的元素选择器

### Q: IndexedDB 操作失败怎么办？
A: 检查 `background.js` 的 Service Worker 日志，确保数据库已正确初始化。

---

## 🎯 当前开发目标

**阶段 2 - AI 大脑接入**：
- [ ] 在 `background.js` 中实现 Gemini API 调用
- [ ] 实现字幕抓取功能
- [ ] 设计多模态分析的 Prompt 模板
- [ ] 在 Timeline 上显示 AI 发现的关键点

---

**本文档将随项目进展持续更新。所有代码生成必须严格遵守本文档规范。**
