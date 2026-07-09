---
title: neutralinojs — 系统 WebView 上的极简桌面壳
来源: 'https://github.com/neutralinojs/neutralinojs'
日期: 2026-07-09
分类: mobile
难度: 初级
---
## 是什么
Neutralinojs 是一个用 HTML、CSS、JavaScript 写跨平台桌面应用的轻量框架，核心卖点是：不把 Chromium 和 Node.js 一起打进你的应用。

日常类比：Electron 像搬一整套厨房到每个房间，锅、灶、冰箱全自带；Neutralinojs 更像借用房间里已有的电器，只带一把小刀和一张菜单。

它用系统自带的 WebView 显示界面，用一个本地小服务器提供资源，再用 WebSocket 把前端请求转给 C++ 核心执行原生操作。

这篇放在 mobile 主题里，不是说它能直接生成 iOS / Android 原生 App，而是因为它代表一种端侧轻量运行时思路：小包体、少依赖、靠宿主系统能力完成 UI。

官方主页强调，简单应用未压缩约 2MB、压缩约 0.5MB。这里要注意：这是框架和简单应用的体积心智，不代表你塞进 100MB 前端资源后还能保持 2MB。

## 为什么重要
不理解 Neutralinojs，下面这些事会很难解释：

- 为什么一个很简单的桌面小工具，用 Electron 打包后可能比业务代码大几十倍。
- 为什么“系统 WebView + 本地 IPC”能成为桌面应用的一条轻量路线。
- 为什么桌面框架不仅是 UI 问题，还牵涉权限、端口、token、文件系统和进程生命周期。
- 为什么它适合内部工具、小工具、控制面板，却不一定适合复杂 IDE 或重度浏览器功能。

## 核心要点
1. **不内置浏览器内核**。类比住酒店：Neutralinojs 不自己带床，而是用房间现成的床。Windows 走系统 WebView，macOS 走 WebKit，Linux 常见是 webkit2gtk，所以包体会小很多。

2. **本地服务器负责资源和原生 API**。类比前台窗口：页面想读文件，不是自己直接翻硬盘，而是把请求交给楼下前台。Neutralinojs 核心检查 token 和 allowlist 后，再决定能不能执行。

3. **扩展靠进程间通信补能力**。类比餐厅外包：厨房不会把所有菜系都塞进主菜单，真要数据库、AI、硬件协议，就启动一个你自己写的扩展进程，通过 WebSocket 和主进程说话。

## 实践案例
### 案例 1：从零创建一个桌面小工具
```bash
npm install -g @neutralinojs/neu
neu create hello-neutralino
cd hello-neutralino
neu run
neu build --release
```

逐部分解释：
- `neu create` 生成最小项目，里面有 `resources/`、`neutralino.config.json` 和前端入口。
- `neu run` 会启动本地资源服务，再打开默认的 window 模式窗口。
- `neu build --release` 不编译你的前端业务代码，只把资源和平台二进制整理成可分发产物，所以很快。

最小页面可以这样调用系统用户名：
```js
Neutralino.init();
async function showUser() {
  const key = NL_OS === 'Windows' ? 'USERNAME' : 'USER';
  const value = await Neutralino.os.getEnv(key);
  document.querySelector('#name').textContent = `Hello ${value}`;
}
showUser();
```

这里的关键不是 `getEnv` 多神奇，而是前端代码通过 Neutralino.js 客户端库发消息，原生侧再返回结果。

### 案例 2：只开放需要的原生 API
```json
{
  "applicationId": "dev.example.notes",
  "url": "/",
  "defaultMode": "window",
  "enableServer": true,
  "enableNativeAPI": true,
  "nativeAllowList": [
    "app.*",
    "filesystem.readDirectory",
    "storage.*"
  ],
  "nativeBlockList": [
    "os.execCommand"
  ]
}
```

逐部分解释：
- `enableNativeAPI` 是总开关，没开时前端不能调原生能力。
- `nativeAllowList` 像门禁白名单，只允许页面调用列出的能力。
- `nativeBlockList` 用来兜底禁止高风险方法，比如随便执行系统命令。

前端读目录时写成这样：

```js

async function loadFiles() {
  const entries = await Neutralino.filesystem.readDirectory('./');
  console.log(entries.map((entry) => entry.entry));

loadFiles();

这类权限配置是 Neutralinojs 和“把 Node 全塞进页面”路线最大的差异之一：默认要你把边界想清楚。

### 案例 3：用扩展接入自己的后端逻辑
```json
{
  "enableExtensions": true,
  "extensions": [
    {
      "id": "dev.example.worker",
      "command": "node ${NL_PATH}/extensions/worker/main.js"
    }
  ],
  "nativeAllowList": [
    "app.*",
    "extensions.*"
  ]
}
```

应用里向扩展发事件：
```js
Neutralino.init();
await Neutralino.extensions.dispatch('dev.example.worker', 'ping', {
  from: 'window'
});
```

扩展进程收到启动信息后，再用 WebSocket 连回 Neutralinojs：
```js
const fs = require('node:fs');
const { w3cwebsocket: WS } = require('websocket');
const boot = JSON.parse(fs.readFileSync(process.stdin.fd, 'utf8'));
const url = `ws://localhost:${boot.nlPort}?extensionId=${boot.nlExtensionId}&connectToken=${boot.nlConnectToken}`;
const client = new WS(url);
client.onclose = () => process.exit(0);
client.onmessage = (event) => console.log(event.data);
```
逐部分解释：
- 扩展本质是普通子进程，可以用 Node、Python、Go 或任何你能启动的语言写。
- `stdin` 里传入端口和 token，避免把连接密钥暴露在命令行参数里。
- 主应用退出后，扩展要监听连接关闭并自己退出，否则容易留下后台进程。

## 踩过的坑
1. **把它当成手机跨端框架**：Neutralinojs 主战场是桌面和浏览器模式，不是直接发 iOS / Android 安装包。
2. **忽略 WebView 差异**：系统 WebView 省体积，但 CSS、字体、编码器和调试体验会随平台变化。
3. **把 native API 全放开**：`os.*`、`filesystem.*`、`extensions.*` 权限过宽时，前端 XSS 就可能变成本机权限问题。
4. **以为没有 Chromium 就没有运行时成本**：本地端口、token、资源服务、扩展进程和自动更新仍然需要设计和监控。

## 适用 vs 不适用场景
**适用**：
- 内部桌面工具、配置面板、日志查看器、数据库小客户端。
- 已经有 Web 前端，希望快速加文件系统、窗口、剪贴板等少量原生能力。
- 对安装包体积敏感，不想为一个小工具分发上百 MB 运行时。
- 希望用任意语言补后端能力，而不是被 Node.js 或某个插件生态锁死。

**不适用**：
- 需要完全一致的 Chromium 行为、复杂 DevTools、浏览器扩展能力的应用。
- 大型 IDE、复杂音视频编辑器、重度 GPU 或多窗口协作产品。
- 安全模型要求极高，但团队又不愿维护 allowlist、CSP、签名和更新链路。
- 以移动原生体验为目标的项目；这类更应该先看 Flutter、React Native 或原生开发。

## 历史小故事（可跳过）
- Electron 和 NW.js 普及后，Web 技术写桌面应用变简单，但包体和内存也成为长期争议点。
- Neutralinojs 把问题反过来问：如果不打包 Chromium 和 Node.js，只借系统 WebView，最小桌面壳能做到多轻。
- 项目逐步形成 `neu` CLI、window / browser / cloud / chrome 四种模式、native API allowlist 和扩展 IPC。
- 到本笔记整理时，仓库约 9k stars，定位仍是“轻量桌面框架”，不是要替代所有重型桌面运行时。

## 学到什么
1. 端侧框架的体积差异，往往来自“是否自带浏览器内核”这个架构选择。
2. WebView 框架的核心不是会不会显示 HTML，而是前端到本机能力的 IPC 和权限边界。
3. 小包体换来的不是免费午餐，而是要接受系统 WebView 差异和更谨慎的兼容测试。
4. 扩展机制让框架保持轻，但也把进程管理、协议版本和错误恢复交给应用开发者。

## 延伸阅读
- 官方入口：[Neutralinojs documentation](https://neutralino.js.org/docs/)
- 架构说明：[Architecture](https://neutralino.js.org/docs/contributing/architecture/)
- 模式说明：[Modes](https://neutralino.js.org/docs/configuration/modes/)
- 权限与安全：[Security](https://neutralino.js.org/docs/contributing/security/)
- 前端框架接入：[Using Frontend Libraries](https://neutralino.js.org/docs/getting-started/using-frontend-libraries/)

## 关联
- [[vite]] —— Neutralinojs 常和前端构建工具配合，用 dev server 做开发体验。
- [[react]] —— 可以作为 Neutralinojs 的 UI 层，但原生能力仍走 Neutralino 客户端库。
- [[openvscode-server]] —— 同样是“浏览器 UI + 本地/远端能力边界”，但目标是远程 IDE。
- [[lima]] —— 都体现轻量工具壳思路：少做内核，多借宿主系统能力。
- [[flutter]] —— 对照路线：Flutter 自带渲染引擎，Neutralinojs 借系统 WebView。
- [[react-native]] —— 同属跨端开发讨论，但 RN 面向移动原生视图，Neutralinojs 面向桌面 WebView。

## 反向链接
<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
