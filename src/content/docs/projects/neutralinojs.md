---
title: Neutralinojs — 用系统 webview 写桌面应用，2MB 搞定
来源: 'https://github.com/neutralinojs/neutralinojs'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 初级
---

## 是什么

Neutralinojs 是一款**极简跨平台桌面应用框架**——用 HTML/CSS/JavaScript 写界面，核心运行时不到 2MB。日常类比：把你的网页装进一个"无玻璃的相框"，相框是操作系统自带的 webview，而不是随框附送的一整套玻璃厂（Chromium）。

Electron 的安装包动辄 100MB+，因为它把 Chrome 和 Node.js 全打包进去了。Neutralinojs 反其道而行：

- macOS 用 WKWebView，Windows 用 WebView2，Linux 用 gtk-webkit2——**都是 OS 自带的**，不需要额外下载
- 原生能力（读文件、操作剪贴板、调进程）通过 WebSocket IPC 暴露为 `Neutralino.*` API
- 核心二进制只有 < 2MB，加上你的前端资源，整个应用仍可控制在 5MB 以内

```bash
npm i -g @neutralinojs/neu
neu create my-app
cd my-app && neu run        # 几秒内出现桌面窗口
neu build                  # < 1 秒完成，无需编译
```

## 为什么重要

不了解 Neutralinojs 或类似框架，就没法解释：

- 为什么桌面工具有时可以做到和 Web 应用几乎一样的 MB 级大小
- 为什么 Electron 在轻量工具场景被骂"太重"——对比才能看清权衡
- 为什么"用 Web 技术写桌面"有好几种路线（Electron / Tauri / Wails / Neutralino），它们核心差异在哪
- 为什么部分场景下 WebView2 / WKWebView 的兼容性差异会成为线上 Bug 的来源

## 核心要点

Neutralinojs 的三个设计支柱：

1. **复用 OS webview，不打包 Chromium**：这是体积小的根本原因。代价是各平台 webview 版本可能不同，CSS 特性、JS API 支持会有细微差异——同一份 CSS 在 macOS 14 和 Windows 11 的 WebView2 上渲染可能略有出入。类比：借公寓里的暖气而不是自己带电暖器——省空间，但暖气是不是最新款你控制不了。

2. **WebSocket IPC 桥接原生能力**：前端想读本地文件，发一条 WebSocket 消息给内置的原生服务器，服务器调系统 API 后把结果推回来。内置支持：文件读写、进程启动、剪贴板、窗口控制、系统托盘、本地存储……还可以用任意语言（C++、Go、Python）写 Extension 来扩展。

   ```js
   // 读本地文件（不是 fetch，是原生 API）
   const data = await Neutralino.filesystem.readFile('./config.json');
   console.log(data);
   ```

3. **零编译构建**：`neu build` 不需要编译前端代码（除非你自己加了 bundler），把前端资源和 neutralinojs 二进制打包在一起即可分发。这对 Hackathon、内部工具、快速原型非常友好。

## 实践案例

### 案例 1：内部文件整理 CLI 变桌面工具

场景：团队有一个 Node 脚本，按规则把文件归类到子目录。现在要给非技术同事提供一个点击运行的 GUI。

```js
// neutralino app 里的前端逻辑
document.getElementById('run-btn').addEventListener('click', async () => {
  const dir = await Neutralino.os.showFolderDialog('选择目录');
  const files = await Neutralino.filesystem.readDirectory(dir);
  for (const file of files.filter(f => f.type === 'FILE')) {
    const ext = file.entry.split('.').pop();
    await Neutralino.filesystem.moveFile(
      `${dir}/${file.entry}`,
      `${dir}/${ext}/${file.entry}`
    );
  }
  document.getElementById('status').textContent = `整理完成，共处理 ${files.length} 个文件`;
});
```

打包后给同事一个单文件，双击即用，无需安装任何运行时。整个应用包 < 5MB。

### 案例 2：把现有 React Web 应用包装成桌面端

场景：已有一个 React 项目（`npm run build` 输出 `dist/`），想快速出一个 Windows + macOS 的桌面版。

```bash
# 在已有 React 项目旁创建 neutralino 壳
neu create my-desktop-shell
# neutralino.config.json 里把 documentRoot 指向 React 的 dist/
```

```json
{
  "applicationId": "com.mycompany.myapp",
  "url": "/",
  "documentRoot": "../my-react-app/dist/",
  "modes": {
    "window": { "title": "My App", "width": 1200, "height": 800 }
  }
}
```

前端 JS 里按需调用 `Neutralino.*` 做原生操作（比如保存文件到本地），其余代码和 Web 版完全一致。构建只需 `npm run build && neu build`，产物直接分发。

### 案例 3：用 Go 扩展原生能力（Extensions IPC）

场景：需要调系统底层 API（比如监控某个进程的 CPU 占用），JS 的 `Neutralino.*` 没有现成 API。

```bash
# 用任意语言写 extension 进程
# neutralino.config.json 里注册
{
  "extensions": [
    { "id": "js.neutralino.monitor", "command": "./extensions/monitor" }
  ]
}
```

```go
// extensions/monitor/main.go — 监听 Neutralino WebSocket，响应事件
// 通过 stdin/stdout 或 WebSocket 与 neutralinojs 主进程通信
```

前端直接：
```js
const result = await Neutralino.extensions.dispatch(
  'js.neutralino.monitor',
  'getCpuUsage',
  { pid: 12345 }
);
```

Extensions 可以用 C++、Go、Python、Rust 任意语言实现，和主进程完全解耦。

## 踩过的坑

1. **webview 版本差异踩雷**：Windows 上的 WebView2 和 macOS WKWebView 对 CSS 的 `backdrop-filter`、某些 ES2022+ 特性支持度不同。在一个平台调试好的 UI，到另一平台跑出来面目全非。建议本地同时开 Windows + macOS 测试，或用 CI 矩阵。

2. **WebSocket IPC 高频调用有延迟**：每次 `Neutralino.filesystem.readFile` 都是一次 WebSocket roundtrip，连续读几百个小文件会比 Electron 的 Node IPC 慢。解决方案：批量读取，或改用 Extension IPC 把批量操作封装到原生进程里。

3. **没有 Node.js，npm 生态不能直接用**：`require('sharp')` 这类依赖底层 C++ 原生模块的 npm 包完全失效。需要把同等能力封装成 Extension，或找替代的纯 JS 库。这是迁移 Electron 项目时最大的摩擦点。

4. **生态和文档比 Electron / Tauri 薄**：StackOverflow 上 `neutralinojs` tag 的问题数量远少于 Electron。踩到冷门问题时，只能翻 GitHub Issues 或读源码，社区响应速度也比大项目慢。

## 适用 vs 不适用场景

**适用**：
- 工具型桌面应用（文件管理、配置编辑、数据导出），功能集中，界面不复杂
- 包体大小有严格限制（嵌入式设备、企业内网分发）
- 已有 Web 应用想快速出"桌面壳"，原生能力需求简单
- Hackathon、原型验证——neu CLI 几分钟出产物，无需配置复杂构建链

**不适用**：
- 重度依赖 npm 原生模块（`node-gyp` 产物、sharp、canvas 等）
- 需要丰富媒体能力（多窗口、音视频流、复杂拖拽 DnD）
- 团队已深度绑定 Electron/Tauri 生态，迁移成本高于收益
- 应用需要跨进程通信、多 webview 窗口等复杂架构

## 历史小故事（可跳过）

- **2018 年**：斯里兰卡开发者 Shalitha Suranga 开始写 Neutralinojs，目标是"比 Electron 轻的桌面框架"。
- **2020-2021 年**：项目在 GitHub 逐渐积累关注，Tauri（Rust 实现的类似理念框架）同期崛起，二者一起引发了"轻量桌面框架"讨论热潮。
- **2022 年**：引入 Extensions IPC，任意编程语言可通过 WebSocket 扩展原生能力，消除了"只能用内置 API"的局限。
- **2025 年**：构建系统从 BuildZri 迁移到 CMake + Ninja，v5+ 版本稳定后项目维护活跃，stars 约 8.5k。

## 学到什么

1. **"不打包 = 更轻"的代价是控制权减少**：复用 OS webview 省了体积，但版本、特性支持交给了操作系统，需要额外的跨平台测试投入
2. **IPC 设计决定了性能上限**：WebSocket roundtrip 适合低频原生操作，批量/高频场景必须在原生层做聚合——这个取舍在所有 webview 框架里都存在
3. **工具型应用 vs 产品型应用选型不同**：内部工具/原型用 Neutralinojs 效率最高；面向 C 端用户的复杂产品，Tauri 或 Electron 的生态更有保障
4. **体积是可感知的产品特性**：一个 < 5MB 的桌面工具和一个 200MB 的安装包，用户的第一印象完全不同——框架选型影响产品可信度

## 延伸阅读

- 官方文档：[neutralino.js.org/docs](https://neutralino.js.org/docs)（快速上手、API 参考）
- 框架横向对比：[web-to-desktop-framework-comparison](https://github.com/Elanis/web-to-desktop-framework-comparison)（Electron/Tauri/Neutralino/Wails 等多维对比）
- [[tauri]] —— Rust 实现的轻量桌面框架，类似理念但生态更丰富
- [[electron]] —— 打包 Chromium + Node.js 的经典方案，生态最大
- [[wails]] —— 用 Go 写后端逻辑的跨平台桌面框架

## 关联

- [[electron]] —— 同为"Web 技术写桌面"的方案，Neutralinojs 的主要对比对象；Electron 打包 Chromium + Node，体积大但生态无敌
- [[tauri]] —— Rust 实现的轻量桌面方案，同样复用 OS webview，比 Neutralinojs 生态更大、安全模型更严格
- [[wails]] —— 用 Go 写后端的跨平台桌面框架，类似 Tauri 思路，适合熟悉 Go 的团队
- [[flutter]] —— Google 跨平台框架，渲染引擎自带（Skia/Impeller），和 Neutralinojs 的 webview 路线截然不同
- [[react-native]] —— 移动端跨平台框架，同样复用原生组件而非打包完整引擎，思路与 Neutralinojs 有共鸣
- [[nativescript]] —— 直接映射原生 API 的移动端框架，和 Neutralinojs 的 IPC 桥接设计可类比
- [[nodegui]] —— 用 Qt 渲染的 Node.js 桌面 GUI 库，同样试图避免 Chromium 依赖

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[electron]] —— Electron — Chromium + Node.js 跨平台桌面应用框架
- [[electron-forge]] —— Electron Forge — 官方一体化桌面应用构建与发布工具链
- [[flutter]] —— Flutter — Google 自绘像素的跨平台 UI 框架
- [[nativescript]] —— NativeScript — JS/TS 直接调原生 API，无 WebView
- [[nodegui]] —— NodeGUI — Qt6 驱动的零 WebView 桌面框架
- [[react-native]] —— React Native — 用 React 写、编译成真正的原生 App
- [[tauri]] —— Tauri — Rust 写的 Electron 替代，用系统 webview 打包桌面/移动端应用
- [[wails]] —— Wails — 用 Go 写后端、Web 写 UI 的跨平台桌面框架

