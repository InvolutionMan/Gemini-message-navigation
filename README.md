# Gemini Message Navigator

一个 Firefox 浏览器扩展，为 Google Gemini 网页版添加 **DeepSeek 风格的侧边导航栏**，快速定位您发送的每一条消息。

## 效果

- 右侧出现一条 **超薄竖线**（6px），标记每条用户消息的位置
- **鼠标悬浮** 时展开为 220px 面板，显示消息序号和预览文字
- **点击** 任意标记即可平滑滚动到对应消息并高亮
- 支持 **拖拽** 调整位置
- 自动适配 **深色模式**

## 安装方法

### 临时安装（开发模式）

1. 打开 Firefox 浏览器
2. 地址栏输入 `about:debugging#/runtime/this-firefox`
3. 点击 "临时载入附加组件…"
4. 选择项目文件夹中的 `manifest.json`
5. 完成！访问 [Gemini](https://gemini.google.com) 即可看到效果

### 永久安装

1. 将项目文件夹打包为 `.zip`
2. 重命名为 `.xpi`
3. Firefox 中打开 `about:addons` → 齿轮 → "从文件安装附加组件…"

## 项目结构

```
extention1/
├── manifest.json      # 扩展配置（Manifest V2 / Firefox）
├── content.js         # 核心脚本（检测 + 导航栏 + 样式）
├── icons/
│   ├── icon-48.png
│   ├── icon-96.png
│   └── icon.svg
├── README.md
└── TESTING.md
```

## 技术细节

- 使用 Gemini 原生的 `<user-query>` 自定义元素检测用户消息——准确、稳定、不依赖易变的 CSS 类名
- MutationObserver 实时监听新消息，自动更新导航栏
- 所有样式内联在 JS 中，不依赖外部 CSS 文件
- 支持 SPA 页面内导航切换

## 调试

在 Gemini 页面按 F12 打开控制台，可使用：

```javascript
GeminiNavigator.scan()        // 手动扫描
GeminiNavigator.getMessages() // 获取消息列表
```

## 许可证

MIT
