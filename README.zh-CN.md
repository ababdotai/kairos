<p align="center">
  <img src="public/icons/icon.png" alt="Kairos Logo" width="128" />
</p>

<h1 align="center">Kairos</h1>

<p align="center">
  <em><strong>Kairos = 关键时刻。</strong></em><br/>
  <strong>一起看，随手记</strong><br/>
  <sub>将线性视频转化为可查询的知识库。</sub>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-核心功能">核心功能</a>
</p>

---

如何让知识载体类视频的消费过程更有价值和互动性?

Kairos 是一个基于 Gemini 3 Flash (gemini-3-flash-preview)多模态理解能力的视频笔记Agent，目前的载体为一个Chrome Extension，核心功能为在用户观看Coursera/Udemy/Bilibili/YouTube/TED等高信息密度视频时，在不打断心流的前提下优雅地做笔记，通过简单直观的操作+AI结合智能的视觉理解和语义分析，让每个关键时刻（Kairos）都被精准捕获，将用户的碎片化视频笔记转化为可查询、可索引的知识库。

Kairos 是一个Proactive+Reactive的Agent：
- Proactive：Kairos陪用户观看视频，自动发现重点和亮点
- Reactive：用户负责提供信号（Signal），AI 负责降低噪点（Noise）并填充细节（Fidelity）

## 当前伴随体验

- 笔记管理页的「总结与分享」按视频整理文字笔记与字幕上下文，生成可编辑、带时间点的 AI 总结，可复制分享或下载 Markdown；总结保存在扩展本地，此操作不上传截图。支持将编辑后的文字在本地排版为包含视频标题、要点、来源和 Kairos 标识的 PNG 分享长图，预览后下载；图片宽 1080px，高度随内容自适应。
- 在视频内的玻璃灵动岛点击「启用」，直接打字记笔记，或左键拖动矩形截图。播放器底部控制区保留操作；空白截图默认不保存，笔记保存成功后继续播放。
- 悬浮展开灵动岛，点击「展开」可保持打开。支持拖动位置、边缘调整大小，并记忆跨视频偏好；普通模式下侧边栏和灵动岛都可查看笔记。
- 时间轴使用三角播放指针和细小发光笔记点；密集光点沿轻微曲线排列，点击仍跳转到准确时间。
- 播放到笔记时间附近自动回显笔记，兼容纯文字笔记和缺少截图坐标的旧笔记。**鼠标悬浮在回显笔记上时保持显示，视频继续播放；移开后淡出，淡出期间移回可继续阅读。** 停用 Kairos 会清除回显。
- 垃圾桶按钮采用区域内二次确认，删除时无需退出全屏；灵动岛区分保存反馈与查看笔记。
- 界面语言可跟随系统或手动选择中文、英文，与 AI 笔记语言独立；侧边栏和弹窗支持导出 Markdown。

下文还包含长期产品方向与早期交互设计，不代表所有规划均已实现。

## 🎯 核心理念

传统视频学习是线性和非结构化的——用户必须通过进度条寻找信息；边看视频边做笔记是麻烦的--用户必须手动截图粘贴到另一个软件中，文字也必须全部自己编写。
Kairos 重新定义了看视频做笔记的交互方式：

- **心流模式**：遵循Granola的设计理念：“无感AI”与“增强而非替代”
- **非线性知识提取**：将长视频变成可查询的动态数据库
- **零 UI 摩擦**：悬浮球交互，无需打开侧边栏
- **本地优先**：数据存储在用户本地，深度集成 Obsidian/Notion
- **多模态理解**：利用 Gemini 3 Flash 的视觉能力，自动提取代码、公式、关键概念

Deep Understanding（深度理解）和Active Learning（主动学习）: 追求观看时的效率，更追求深入的理解和学习。

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
- [x] 所有视频区叠层功能仅在Kairos激活时生效，在Kairos未激活时，所有交互都应被禁用
- [x] Markdown 导出功能
- [x] Dashboard 管理界面
- [x] 里程碑：完整记录 5 条笔记并导出MD

### 阶段 2：AI Agent实现（Week 4-5）
- [x] 在Dashboard中实现Settings，支持Subscribe Kairos AI和BYOK两种模式提供AI API Key
- [x] 自适应语言：优先使用设置中的笔记语言，默认使用视频本身/标题/字幕中的主要语言
- [x] Gemini API 调用管道（Background Script）
- [x] Auto Highlight功能：
  - [x] Basic(Free)：激活时同时视频在播放时，通过字幕CC关键词自动筛选和发现关键点和重点，并以💡等emoji的形式显示在Timeline上
  - [x] Smart(API key/Subscription required)：激活后立刻通过让模型查看Subtitle(timedtext API)/VoiceOver发现提取出最精华、最有独特观点的部分，并通过“概念即时浮窗（Contextual Tooltip）”显示在视频上
- [x] Pin Everywhere功能：支持自由点击屏幕任意位置进行时间temperal+空间spatial维度的笔记，可以贴在视频上模拟写实的Sticky notes
- [ ] 交互：
  - [x] 改进双击、点击后视频是否自动暂停的逻辑
  - [x] 空白回车后或快捷键按下后AI生成过程中通过Orb图标展示状态，不阻塞视频播放
  - [ ] note input时退出有内容则自动保存
  - [ ] 分离AI笔记快捷键（FF）和手动输入快捷键（JJ）
  - [ ] 在Dashboard以及Sidepanel等界面用小胶囊区别标识显示用户输入的手动笔记（You）和AI笔记（AI）
  - [ ] 允许在Dashboard界面编辑笔记、删除任意一条笔记
- [ ] UI:
  - [x] 检测浏览器亮色与暗色模式，自动切换所有UI主题
  - [x] Side panel显示关于UX的交互帮助信息，在视频标题上通过胶囊+数字显示当前视频笔记个数
  - [x] Side panel中视频播放到特定时间时同步滚动定位到笔记并高亮
  - [x] Buttons: 将所有按钮改为更好看的Buttons，参考Linear/Arc/macOS26的设计
  - [x] Dashboard中Reference直接平铺展示，不需要展开收缩
  - [x] Dashboard中note添加复制按钮，不复制图片数据
- [ ] 功能：
  - [x] 整体架构：升级为Vite
  - [ ] 使用VideoWrapper类似思路智能添加重点，AR/HUD for Video! Multimodal Perception + CodeAct Execution + GenUI
  - [ ] 接入Kimi K2.5作为默认云端服务，为后续订阅做准备，云端默认选择K2.5
  - [ ] 对于YouTube直接将YouTube URL发送给模型指定时间分析，对于Bilibili将片段发送给Kimi 2.5进行分析（实时监听音频，偶尔查看画面）
  - [ ] 完善核心的无感记录Context-Aware Note功能，不断让自己觉得都好用：截图/完整片段 + 字幕（可能为空）+ 音频 + 用户笔记（可能为空）→ AI 摘要，紧密结合Multi-modal Context的解释
  - [ ] Ceiling timeline改为可以设置位置：底部原生进度条上方，或屏幕顶部（当前），添加Hide、Move按钮
  - [ ] 画面笔记：参考选中-高亮这一类似Liner的操作对视频进行笔记，不仅是PIN
- [ ] Bug:
  - [x] B站时间轴遮挡弹幕问题、全屏无法显示的问题
  - [ ] 通过PIN/快捷键触发的笔记在播放到对应时间点时也应该有渐现渐隐的效果
  - [ ] 点击PIN与时间轴的位置不对齐的问题
  - [ ] 正式上线前接入数据跟踪与分析机制
- [ ] Export Note to Video：非线性叙事的重组Agent，根据笔记智能剪辑和重组视频，生成专属视频笔记
- [ ] 针对所有笔记进行一键总结与分享，采用Growing Knowledge Tree形式
- [ ] Growing Knowledge Tree：动态生长的思维导图，不剧透后面的内容，它只实时绘制已讲过内容的逻辑结构，帮助用户把线性的语音流，在脑中“编译”成结构化的知识结晶
- [ ] Agent化：打破视频的**“只读属性” (Read-only)**，视频不再是封闭的，而是可交互的，联通外部世界（Google Grounding）和沙箱（Gemini Code Interpreter），支持识别和点击视频元素进行解释和笔记

### 阶段 3：护城河建设（Week 6-7）
- [ ] 账号体系：支持谷歌登录
- [x] AI服务：采用SDK调用而非URL请求
- [ ] Obsidian 本地直连（FileSystemAccess API）
- [ ] Notion Integration 同步
- [ ] Deep Link 回跳支持 (生成的笔记带有直接跳转到视频特定时间的链接)
- [ ] Kairos Cloud：云端存储同步
- [ ] Publish Notes：像《死亡搁浅》游戏中一样，可以在视频上看到别人留下的公开笔记，类似在YouTube上实现学习的弹幕和聊天室！
- [ ] 里程碑：卸载插件后，笔记仍完整保留在 Obsidian

### 阶段 4：品质打磨与发布（Week 8+）
- [ ] UI/UX 极致体现taste和on hand
- [x] 记录上次拖动位置，切换视频依然生效
- [ ] 支持语音输入，支持文件夹分类甚至智能笔记聚类（超越单个视频）
  - Auto-Wiki: “帮我把这个 PlayList 里所有关于 Python 装饰器的内容整理成一篇文档。” -> Agent 自动后台倍速刷视频、提取、重组。
  - Interactive Tutorial: 将被动视频转化为交互式教程。
- [ ] 录制 Demo 视频, 增加交互引导
- [ ] 支持手机端悬浮球，通过点击、按住等操作交互，重触摸轻输入
- [ ] Product Hunt 发布准备

## 🎨 设计语言

- **核心隐喻**："Kairos"（关键时刻）—— 捕捉质的时间，而非量的时间，参考Granola，通过点击甚至无需输入，由AI智能辅助笔记
- **视觉风格**：Liquid Glass（流体玻璃），参考 Linear/Granola/Arc/macOS26
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
├── src/                  # 源代码
│   ├── content/          # Content Script 模块
│   ├── background.js     # Background Service Worker
│   ├── content.js        # Content Script 入口
│   ├── popup.html        # 扩展弹窗
│   └── dashboard.html    # 笔记管理页面
├── public/               # 静态资源 (Icons)
├── dist/                 # 构建输出 (加载此目录)
├── vite.config.js        # Vite 配置
├── manifest.json         # Manifest V3 配置
├── doc/                  # 文档目录
├── test/                 # 测试文件
└── ChatHistory.md        # 产品推演聊天记录
```

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm run dev
# 此时代码修改会自动触发扩展刷新

# 构建生产版本
pnpm run build

# 加载到 Chrome
# 1. 打开 chrome://extensions/
# 2. 开启"开发者模式"
# 3. 点击"加载已解压的扩展程序"
# 4. 选择 dist/ 目录 (注意：不是项目根目录)
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



Gemini 3 + AICoding 的核心优势——**“懂逻辑（Logic-aware）”\**和\**“能执行复杂指令（Code-based）”**，去解决那些需要**脑子**才能剪好的视频（如叙事重组、私有素材匹配），而不是去解决只需要**眼睛**就能剪好的视频（如简单的去静音、加特效）：**“AI帮你把素材变成生意的资产”**

个性化叙事组装、数据驱动的动态广告生成自迭代、非线性叙事的重组Agent，重组叙事

*“Just finished watching @karpathy's new video. Mind-blowing. Used Kairos to extract all the code snippets and diagrams into a structured note. Here is the link for anyone who needs a quick review: [Link] ⚡️”**

1. **Build in Public (Twitter):** 每天发一个产品细节的 GIF，吸引最早期的 50 个极客用户。

2. **Reddit 截流:** 每天搜一遍相关问题，真诚回答并推荐自己的工具。
3. **Obsidian 插件库:** 争取把你的插件（或配合的 Obsidian 插件）上架到 Obsidian 官方社区列表，那是源源不断的精准长尾流量。