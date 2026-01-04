# Kairos 项目开发指南（Claude Agent 专用）

> 本文档为 Claude Code Agent 提供项目上下文和开发指导，确保代码生成符合项目规范和技术架构。

## 📋 项目概览

**项目名称**：Kairos
**项目类型**：Chrome Extension (Manifest V3)
**核心定位**：基于 Gemini 3 Flash 的视频笔记工具，遵循Granola的设计哲学，将AI融入心流模式

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

### 技术栈
```
前端框架：React 18 + TypeScript
构建工具：Vite + CRXJS Vite Plugin
样式方案：Tailwind CSS + Framer Motion
AI 能力：Gemini 3 Flash API（多模态理解）
存储方案：IndexedDB + FileSystemAccess API
扩展架构：Manifest V3 (Chrome Extension)
```

### 架构设计原则

#### 1. 全局悬浮层（Global Overlay）
- **实现方式**：Shadow DOM 隔离样式，避免与宿主页面冲突
- **坐标同步**：使用 `requestAnimationFrame` 实时追踪视频元素的 `getBoundingClientRect`
- **层级管理**：`z-index: 2147483647`，确保在最顶层
- **事件穿透**：`pointer-events: none` 用于背景层，交互元素单独设置 `pointer-events: auto`

#### 2. 权限管理（Manifest V3）
- **必需权限**：
  - `scripting`：注入 Content Script
  - `storage`：存储用户配置和笔记数据
  - `host_permissions`：`*://www.youtube.com/*`, `*://www.bilibili.com/*`
- **可选权限**：
  - `fileSystem`：Obsidian 本地直连（需用户授权）

#### 3. 数据架构
```typescript
// IndexedDB Schema
interface NoteEntry {
  id: string;                    // UUID
  videoId: string;               // YouTube Video ID
  timestamp: number;             // 视频时间戳（秒）
  screenshotBlob: Blob;          // 截图二进制数据
  noteText: string;              // 用户笔记/AI 生成内容
  context?: {                    // 上下文信息
    subtitle: string;            // 字幕片段
    aiSummary: string;           // AI 摘要
    detectedObjects: string[];   // 检测到的对象（代码、公式等）
  };
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
}
```

## 🎯 开发阶段与任务

### 当前阶段：阶段 0 - 技术验证（Week 1）

#### 核心任务
0. **可行性验证**
  - 避免过度工程化，先使用Vanilla ES6+ JavaScript和Vanilla CSS3实现第一版

1. **项目初始化**
   - 使用 Vite + CRXJS Plugin 搭建项目脚手架
   - 配置 TypeScript + ESLint + Prettier
   - 设置 Tailwind CSS

2. **全局悬浮层实现**
   - 编写 Content Script，注入 `<div id="kairos-root">`
   - 使用 Shadow DOM 封装 React Root
   - 确保样式完全隔离（不受宿主页面 CSS 影响）

3. **视频坐标追踪**
   - 实现 `useVideoTracker` Hook
   - 实时读取 `<video>` 元素的位置和尺寸
   - 处理边界情况：全屏、画中画、页面滚动

4. **里程碑验证**
   - 在 YouTube/B站 上能看到红色边框紧贴视频
   - 滚动页面时边框跟随视频移动
   - 全屏模式下边框依然贴合
   - 点击边框内部能穿透到视频（暂停/播放）

## 💻 代码规范

### 文件组织
```
src/
├── content/
│   ├── index.tsx              # Content Script 入口
│   ├── App.tsx                # 主应用组件
│   ├── components/
│   │   ├── Overlay.tsx        # 悬浮层容器
│   │   ├── Orb.tsx            # 悬浮球组件
│   │   ├── Timeline.tsx       # 语义化进度条
│   │   └── NoteInput.tsx      # 笔记输入框
│   └── hooks/
│       ├── useVideoTracker.ts # 视频追踪 Hook
│       └── useGemini.ts       # Gemini API Hook
├── background/
│   ├── index.ts               # Background Script 入口
│   └── gemini-proxy.ts        # API 代理（解决跨域）
├── utils/
│   ├── storage.ts             # IndexedDB 封装
│   ├── capture.ts             # 视频截图引擎
│   └── markdown.ts            # Markdown 导出工具
└── manifest.json
```

### 命名规范
- **组件文件**：PascalCase（如 `Overlay.tsx`）
- **工具函数**：camelCase（如 `captureVideoFrame.ts`）
- **Hook 文件**：`use` 前缀（如 `useVideoTracker.ts`）
- **常量**：UPPER_SNAKE_CASE（如 `MAX_Z_INDEX`）

### 代码风格
- **语言**：所有代码和注释使用英文
- **注释规范**：函数级英文注释，遵守 Google 开源规范
- **TypeScript**：优先使用接口（`interface`）而非类型别名（`type`）
- **组件**：优先使用函数组件和 Hooks

### 示例代码

#### Hook 实现示例
```typescript
/**
 * Tracks the position and dimensions of the video element in real-time.
 * @param videoSelector - CSS selector for the video element
 * @returns Video bounding rectangle or null if not found
 */
export function useVideoTracker(videoSelector: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    let animationFrameId: number;

    const updateRect = () => {
      const videoElement = document.querySelector<HTMLVideoElement>(videoSelector);
      if (videoElement) {
        setRect(videoElement.getBoundingClientRect());
      }
      animationFrameId = requestAnimationFrame(updateRect);
    };

    updateRect();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [videoSelector]);

  return rect;
}
```

#### 组件实现示例
```typescript
/**
 * Global overlay component that renders on top of the video player.
 * Uses Shadow DOM for style isolation.
 */
export function Overlay() {
  const videoRect = useVideoTracker('video');

  if (!videoRect) return null;

  return (
    <div
      className="kairos-overlay"
      style={{
        position: 'fixed',
        top: videoRect.top,
        left: videoRect.left,
        width: videoRect.width,
        height: videoRect.height,
        pointerEvents: 'none',
        zIndex: 2147483647,
      }}
    >
      {/* Overlay content */}
    </div>
  );
}
```

## 🎨 UI/UX 设计规范

### 色彩方案（Dark Mode Only）
```css
/* 背景色 */
--bg-primary: #0A0A0A;        /* 黑曜石 */
--bg-secondary: #1A1A1A;      /* 浅黑 */

/* 文本色 */
--text-primary: #D4D4D4;      /* 高级灰 */
--text-secondary: #8A8A8A;    /* 次要文本 */

/* 强调色 */
--accent-green: #39FF14;      /* 磷光绿 */
--accent-violet: #8A2BE2;     /* 电紫色 */

/* 玻璃质感 */
--glass-bg: rgba(26, 26, 26, 0.6);
--glass-blur: 20px;
--glass-border: rgba(255, 255, 255, 0.1);
```

### 字体规范
```css
/* 英文字体 */
font-family: 'Inter', 'Geist Sans', system-ui, sans-serif;

/* 代码字体 */
font-family: 'JetBrains Mono', 'Fira Code', monospace;
```

### 动效规范
- **悬浮球呼吸效果**：`scale` 动画，周期 2s，easing: `ease-in-out`
- **输入框展开**：`scaleY` + `opacity`，持续 200ms，easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- **笔记保存**：抛物线动画（贝塞尔曲线），持续 400ms

## 🔧 关键技术实现要点

### 1. Shadow DOM 样式隔离
```typescript
// 创建 Shadow Root 并注入样式
const shadowRoot = container.attachShadow({ mode: 'open' });
const styleElement = document.createElement('style');
styleElement.textContent = `
  /* Tailwind CSS 编译后的样式 */
  @layer base, components, utilities;
`;
shadowRoot.appendChild(styleElement);

// 渲染 React 应用到 Shadow DOM
const root = createRoot(shadowRoot);
root.render(<App />);
```

### 2. 视频截图引擎
```typescript
/**
 * Captures the current frame of the video element.
 * @param videoElement - The video element to capture
 * @returns Base64-encoded image data URL
 */
export function captureVideoFrame(videoElement: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.85);
}
```

### 3. Gemini API 调用（通过 Background Script）
```typescript
// background/gemini-proxy.ts

/**
 * Proxies Gemini API calls to avoid CORS issues in Content Script.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GEMINI_ANALYZE') {
    analyzeWithGemini(request.data)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep message channel open for async response
  }
});

async function analyzeWithGemini(data: {
  screenshot: string;
  subtitle: string;
}) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-3-pro:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: `Summarize the key insights from this video frame. Context: ${data.subtitle}` },
          { inline_data: { mime_type: 'image/jpeg', data: data.screenshot.split(',')[1] } }
        ]
      }]
    }),
  });

  return response.json();
}
```

## 🚧 开发注意事项

### 避坑指南

1. **不要过度设计**
   - 当前阶段专注于核心功能验证，不要引入复杂的状态管理（如 Redux）
   - 保持代码简洁，优先使用 React Context + Hooks

2. **不要支持 DRM 保护的视频**
   - Netflix、Disney+ 等平台的视频无法截图（会得到黑屏）
   - 专注于 UGC 平台：YouTube、Bilibili、Coursera

3. **不要一次性分析整个视频**
   - 采用 On-Demand 策略：只在用户点击时调用 Gemini API
   - 避免高昂的 Token 成本和缓慢的响应速度

4. **注意 Chrome 扩展审核要求**
   - `host_permissions` 必须在审核时说明用途
   - 示例说明：*"本插件的核心功能是视频笔记，需要自动检测视频播放器状态以渲染笔记层"*

### 性能优化

1. **视频追踪优化**
   - 使用 `requestAnimationFrame` 而非 `setInterval`
   - 当用户不在视频页面时停止追踪（通过 Intersection Observer）

2. **截图优化**
   - 使用 `canvas.toDataURL('image/jpeg', 0.85)` 而非 PNG（减少 60% 体积）
   - 存储到 IndexedDB 时使用 Blob 而非 Base64

3. **渲染优化**
   - 悬浮层组件使用 `React.memo` 避免不必要的重渲染
   - 输入框使用 `debounce` 延迟 AI 调用

## 📦 构建与部署

### 开发模式
```bash
npm run dev
```
- 自动重载 Content Script 和 Background Script
- 支持 React Fast Refresh

### 生产构建
```bash
npm run build
```
- 输出目录：`dist/`
- 自动压缩和优化资源
- 生成 Manifest V3 兼容的扩展包

### 加载到 Chrome
1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist/` 目录

## 🔄 版本迭代策略

### 护城河建设原则
- **版本领先策略**：始终保持 2 周的功能领先，当竞品抄袭 V1 时，我们已发布 V2
- **深度绑定工作流**：通过 Obsidian/Notion 集成增加用户迁移成本
- **设计驱动增长**：极致的 UI/UX 是最难被抄袭的壁垒

### 功能迭代顺序
1. **V1.0（MVP）**：手动截图 + 本地笔记
2. **V2.0（AI）**：Gemini 自动摘要 + 代码提取
3. **V3.0（集成）**：Obsidian/Notion 深度集成
4. **V4.0（高级）**：知识图谱 + 语义搜索

## 📞 常见问题

### Q: 如何处理视频跨域问题？
A: YouTube 等平台默认允许同源 Canvas 截图。若遇到跨域污染（Tainted Canvas），需在 Background Script 中转发请求。

### Q: 如何优雅地处理全屏模式？
A: 监听 `fullscreenchange` 事件，动态调整悬浮层的父容器（从 `document.body` 切换到 `document.fullscreenElement`）。

### Q: 如何确保 Gemini API Key 安全？
A: 存储在 `chrome.storage.local` 中，仅在 Background Script 中使用，永远不要暴露到 Content Script。

### Q: 如何测试 Shadow DOM 内的组件？
A: 使用 Testing Library 的 `container.shadowRoot` 访问 Shadow DOM 内部元素。

---

## 🎯 当前开发目标

**阶段 0 - 可行性验证**：
- [x] 避免过度工程化，先使用Vanilla ES6+ JavaScript和Vanilla CSS3实现插件
- [x] 在视频周围渲染边框，紧贴视频播放器
- [x] 支持滚动和全屏模式下的坐标同步
- [x] 点击边框内部能穿透到视频（pointer-events 正确处理）

完成此里程碑后，立即进入阶段 1 的悬浮球交互开发。

---

**本文档将随项目进展持续更新。所有代码生成必须严格遵守本文档规范。**
