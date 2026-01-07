# Kairos

> **Your AI notetaker while watching videos.**

如何让观看视频学习的过程更有价值和互动?

Kairos 是一个基于 Gemini 3 Flash 多模态理解能力的视频笔记 Chrome Extension，核心功能为在用户观看视频时通过快捷键或点击进行AI笔记，通过智能的视觉理解和语义分析，让每个关键时刻（Kairos）都被精准捕获，将用户的碎片化视频笔记转化为可查询、可索引的知识库。

用户负责提供信号（Signal），AI 负责降低噪点（Noise）并填充细节（Fidelity）

## 🎯 核心理念

传统视频学习是线性的——用户必须通过进度条寻找信息；边看视频边做笔记是麻烦的--用户必须手动截图粘贴到另一个软件中，文字也必须全部自己编写。
Kairos 重新定义了看视频做笔记的交互方式：

- **心流模式**：遵循Granola的设计理念：“无感AI”与“增强而非替代”
- **非线性知识提取**：将长视频变成可查询的动态数据库
- **零 UI 摩擦**：悬浮球交互，无需打开侧边栏
- **本地优先**：数据存储在用户本地，深度集成 Obsidian/Notion
- **多模态理解**：利用 Gemini 3 Flash 的视觉能力，自动提取代码、公式、关键概念

## ✨ 核心功能

产品设计允许用户在观看视频中手动高亮重点，AI则会自动补全这些重点的上下文，背后就是一套复杂的提示词逻辑，它告诉模型：“当用户标记了这句话/这个时间点/这个物体时，请将其作为核心要点，并围绕它扩展相关的讨论细节和结论。用户不希望被一个机器人“监视”，而是希望有一个工具能默默地在后台帮助他们记录和整理。

### 已规划功能
- **智能笔记**：用户和AI可以一起观看视频，AI自动分析并发现视频亮点，并通过💡高亮提示；用户可通过快捷键、点击💡、点击📌添加一个笔记点，Kairos捕获视频画面、自动截取时间点前后强相关的音频或视频段，生成总结（用户可选择先输入若干关键词，AI会综合考虑进行拓展）
- **语义化时间轴**：基于信息密度的可视化进度条
- **AI 辅助补全**：根据视频内容和字幕，自动生成笔记摘要
- **工作流集成**：
  - Obsidian 本地直连（FileSystemAccess API）
  - Notion Database 同步
  - Deep Link 回跳支持
- **对象级交互**：识别视频中的代码块、图表，支持一键复制/解释

### 交互设计（优雅&沉浸式&顺手&心流）
1. 悬浮球交互 (The Orb & Tooltip)
  * 形态：模仿 iOS 的 Dynamic Island (灵动岛)。
  * 交互：当鼠标悬浮在 Orb 上时，Orb 不应只是弹出一个方框文字，而是平滑地横向展开（Morphing），变成一个长条胶囊，显示 "Activate Kairos" 或 "Deactivate"。
  * 动画：使用弹簧物理效果（Spring Physics），松开鼠标时，胶囊“弹”回圆形的 Orb。

2. 天花板时间轴（The Ceiling Timeline）
  * 平时：它是一条几乎不可见的透明轨道，只有极细的微光指示。
  * 激活/悬浮时：它会微微亮起，成为一条清晰的时间轴。
  * 鼠标移至顶部：显示出所有已标记的 Pin 点(📌)。
  * 点击顶部任意位置：在该时间点暂停视频，并在该位置下方垂下一个输入框。

3. 笔记输入 (The Whisper Input)
  * 痛点：传统的 "Sticky Note"（便利贴）通常是大大的黄色方块，会遮挡视频画面，很丑且破坏沉浸感。
  * Taste 升级：Spotlight Search 风格。
      * 触发：按下快捷键。
      * 表现：视频自动暂停。在视频底部中央（或跟随鼠标位置）浮现一个磨砂玻璃（Frosted Glass）质感的长条输入框。
      * 体验：
          1. 用户输入关键词："这部分讲了架构模式"。
          2. 回车。
          3. 输入框缩小并飞入到顶部的进度条中，变成一颗光点（Particle）。
          4. 视频自动恢复播放。
      * 隐喻：你捕获了一个想法，并将它存入了时间流中。

4. 快捷键策略 (The Hotkeys)
  * 逻辑：
      * 未激活 Kairos：K = YouTube 原生暂停。
      * 已激活 Kairos：K = 暂停视频 + 唤起输入框。
      * 再次按下 K（或 Esc）：取消输入 + 恢复播放。
  * 理由：用户记笔记时本来就需要暂停。将“暂停”和“记笔记”合并为一个动作，是最高效的。

### 技术亮点
- **全局悬浮层架构**：Shadow DOM 隔离，完美兼容任何网页
- **坐标实时同步**：支持全屏、画中画等所有播放模式
- **本地优先存储**：IndexedDB + 可选云端元数据同步

## 🏗️ 技术栈

- **前端框架**：React 18 + TypeScript
- **构建工具**：Vite + CRXJS Plugin
- **样式方案**：Tailwind CSS + Framer Motion
- **AI 能力**：Gemini 3 Flash API (多模态理解)
- **存储方案**：IndexedDB (本地) + FileSystemAccess API (Obsidian)
- **扩展架构**：Manifest V3

## 📅 开发计划

### 阶段 0：技术验证（Week 1）：避免过度工程化，先使用Vanilla ES6+ JavaScript和Vanilla CSS3实现
- [x] 项目初始化与架构设计
- [x] 全局悬浮层实现（Shadow DOM）
- [x] 视频坐标实时追踪（考虑YouTube和Bilibili的几种视频播放方式：默认、影院、全屏）
- [x] 里程碑：指示框紧贴视频播放器，支持全屏和滚动

### 阶段 1：实现交互 MVP（Week 2-3）
- [x] 悬浮球交互组件（The Orb）：鼠标悬浮之上显示“Activate/Deactivate Kairos”
- [x] 天花板时间轴（The Ceiling Timeline）：实现Pin功能
- [x] 浏览器本地笔记存储（IndexedDB CRUD）
- [x] 快捷键仅在Kairos激活时生效
- [x] Markdown 导出功能
- [x] Dashboard 管理界面
- [x] 里程碑：完整记录 5 条笔记并导出MD

### 阶段 2：AI Agent实现（Week 4-5）
- [ ] 在Dashboard中实现Settings，支持Subscribe Kairos AI和BYOK两种模式提供AI API Key
- [ ] Gemini API 调用管道（Background Script）
- [ ] 只在真正重要的时候调用 AI：监测
- [ ] 激活时同时视频在播放时，自动发现关键点和重点，并以💡的形式显示在Timeline上，并显示文字
- [ ] 多模态内容分析：截图 + 字幕（可能为空） + 用户笔记（可能为空）→ AI 摘要
- [ ] 里程碑：AI 自动发现视频重点，提取视频中的代码并生成解释

### 阶段 3：护城河建设（Week 6-7）
- [ ] Obsidian 本地直连（FileSystemAccess API）
- [ ] Notion Integration 同步
- [ ] Deep Link 回跳支持
- [ ] 里程碑：卸载插件后，笔记仍完整保留在 Obsidian

### 阶段 4：品质打磨与发布（Week 8+）
- [ ] UI/UX 精细化（Glassmorphism + 动效）
- [ ] 记录上次拖动位置，切换视频依然生效
- [ ] Sound Design（截图音效、保存音效）
- [ ] 录制 Demo 视频
- [ ] Product Hunt 发布准备

## 🎨 设计语言

- **核心隐喻**："Kairos"（关键时刻）—— 捕捉质的时间，而非量的时间，参考Granola，通过点击甚至无需输入，由AI智能辅助笔记
- **视觉风格**：Liquid Glass（流体玻璃），参考 Linear/Granola/Arc
- **色彩方案**：
  - 背景：`#0A0A0A`（黑曜石）
  - 主色：`#D4D4D4`（高级灰）
  - 强调色：Phosphor Green (`#39FF14`) 或 Electric Violet (`#8A2BE2`)
- **字体选择**：
  - 英文：Inter / Geist Sans
  - 代码：JetBrains Mono / Fira Code

## 🌍 竞品分析

### 核心差异化优势

| 竞品           | 核心局限                     | Kairos 的优势                      |
| -------------- | ---------------------------- | ---------------------------------- |
| Monica AI      | 侧边栏交互，打断视频沉浸感   | 全局悬浮层，无侵入式交互           |
| Recall (Rewind)| 屏幕录制，隐私风险高         | 本地优先，无云端存储               |
| Granola        | 仅支持会议，不支持视频学习   | 专注视频知识提取，支持所有视频平台 |
| YouTube 原生字幕 | 无法结构化，无法回溯         | 语义化时间轴 + 笔记锚点            |

### 护城河策略
1. **设计驱动增长**：极致的 UI/UX，让工具成为"时尚单品"
2. **工作流绑定**：深度集成 Obsidian/Notion，迁移成本极高
3. **本地优先架构**：规避大厂合规包袱，快速迭代
4. **版本领先策略**：保持 2 周的功能领先，避免被抄袭

## 📦 项目结构

```
kairos/
├── src/
│   ├── content/          # Content Script（注入页面）
│   │   ├── overlay/      # 全局悬浮层组件
│   │   ├── orb/          # 悬浮球交互
│   │   └── timeline/     # 语义化进度条
│   ├── background/       # Background Script（API 调用）
│   ├── popup/            # 扩展弹窗
│   ├── options/          # 设置页面/Dashboard
│   ├── hooks/            # React Hooks
│   │   └── useVideoTracker.ts  # 视频坐标追踪
│   ├── utils/
│   │   ├── gemini.ts     # Gemini API 封装
│   │   ├── storage.ts    # IndexedDB 封装
│   │   └── capture.ts    # 截图引擎
│   └── manifest.json     # Manifest V3 配置
├── doc/                  # 文档目录
├── test/                 # 测试文件
├── temp/                 # 临时文件
└── ChatHistory.md        # 产品推演聊天记录
```

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建生产版本
npm run build

# 加载到 Chrome
# 1. 打开 chrome://extensions/
# 2. 开启"开发者模式"
# 3. 点击"加载已解压的扩展程序"
# 4. 选择 dist/ 目录
```

## 📝 开发规范

- **提交规范**：遵守 Angular Commit Message 规范
- **代码注释**：函数级英文注释，遵守 Google 开源规范
- **文件组织**：
  - 测试文件 → `test/`
  - 文档文件 → `doc/`
  - 临时文件 → `temp/`

## 🛡️ 隐私与安全

- **数据本地化**：所有笔记数据默认存储在用户本地（IndexedDB）
- **可选同步**：仅在用户授权时同步元数据到 Obsidian/Notion
- **无服务器架构**：不依赖后端服务器，直接调用 Gemini API
- **透明权限**：仅申请必要的 Host Permissions，符合 Chrome Web Store 审核要求

## 📖 参考资料

- [Gemini 3 Flash API 文档](https://ai.google.dev/docs)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/mv3/)
- [Shadow DOM 教程](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)
- [FileSystemAccess API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)

## 📄 许可证

MIT License

---

**Built with ❤️ by an indie maker who believes in the power of capturing the right moment.**
