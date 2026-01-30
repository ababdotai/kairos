# Kairos 图标生成指南

## 📌 说明

由于 Chrome 扩展要求 PNG 格式图标，这里提供三种生成方式。

## 方法 1：使用在线工具（推荐）

1. 打开 `icon.svg` 文件
2. 访问 https://svgtopng.com/ 或 https://cloudconvert.com/svg-to-png
3. 上传 `icon.svg`
4. 分别导出三个尺寸：
   - 16x16 → 保存为 `icon16.png`
   - 48x48 → 保存为 `icon48.png`
   - 128x128 → 保存为 `icon128.png`
5. 将生成的 PNG 文件放在此目录下

## 方法 2：使用 HTML 生成器

1. 在浏览器中打开 `generate-icons.html`
2. 右键点击每个 Canvas → "将图像另存为..."
3. 分别保存为 `icon16.png`, `icon48.png`, `icon128.png`

## 方法 3：使用 Python 脚本

```bash
# 安装依赖
pip install pillow

# 运行脚本
python3 generate_icons.py
```

## 🎨 设计规范

### 配色
- 背景：`#0A0A0A` (黑曜石)
- 前景：`#39FF14` (磷光绿)

### 元素
- 外圈：圆形描边
- 中心：实心圆点
- 四周：十字标记（仅限 48x48 和 128x128）

## 📦 生成后

将生成的图标文件放在此目录后，需要更新 `manifest.json`：

```json
"icons": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

然后重新加载扩展即可。

## 🔍 验证

图标生成后，在 `chrome://extensions/` 页面应该能看到 Kairos 的绿色圆形图标。

---

**注意**：图标缺失不影响扩展的核心功能，仅影响视觉展示。
