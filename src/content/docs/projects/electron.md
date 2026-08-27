---
title: Electron — 自带 Chromium + Node 的跨平台桌面运行时
来源: 'https://github.com/electron/electron'
日期: 2026-07-08
分类: 跨平台桌面
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/electron/electron
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: bf0c4e67e9a834479ee171e61057f7516a381d25
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 44.0.0
---

## 是什么

Electron 是把 **Chromium 渲染内核和 Node.js 绑进同一个桌面应用** 的运行时。日常类比：像给网站套上一台“自带浏览器的安装包”——窗口、菜单、托盘走系统 API，页面仍是 HTML / CSS / JS。

固定 `v44.0.0` 的进程模型来自 Chromium：一个 **main process**（Node 环境，管生命周期和原生能力）加上每个窗口一份 **renderer process**（按 Web 标准画 UI）。两边默认隔离，页面不能 `require('fs')`。真正把少量系统能力递出去的，是窗口加载前跑的 **preload**，再经 `contextBridge` 暴露白名单。

它不是 React / Vue 的替代品，也不自带发行链路。运行时是 Electron，打包、签名、自动更新通常另配 [[electron-builder]] 或 Electron Forge。

## 为什么重要

不理解这层边界，下面这些现象会对不上号：

- 为什么前端团队能做桌面产品，却要为每个窗口付出一份 Chromium 的内存账
- 为什么“网页里随便 `require('fs')`”曾经能用，现在默认会被安全模型拦住
- 为什么 XSS 在网站里只是改 DOM，在 Electron 里一旦 Node 进了 renderer 就可能变成本机 RCE
- 为什么 `electron .` 能跑，发给用户却还要 installer、asar、代码签名和 fuse

相对 [[tauri]]：Electron 把浏览器内核打进安装包，换来 Chromium 行为一致性；Tauri 借用系统 WebView，换体积与平台差异。

## 核心机制与架构流程

固定源码把职责拆成四段：

1. **Main 管窗口与生命周期**。`app` 决定何时退出；`BrowserWindow` 每创建一个窗口就再开一个 renderer，销毁窗口时对应 renderer 一起结束。`webContents` 是 main 操作该页的把手。

2. **Renderer 只按 Web 标准跑**。入口是 HTML；要引入 npm 包，走 webpack / Vite 这类 Web 打包器。文档明确：历史上 renderer 默认可带完整 Node，现已因安全关掉。

3. **Preload 是特权桥，不是共享 `window`**。`contextIsolation` 自 Electron 12 默认开启：preload 里 `window.hello = 'wave'`，页面读到的是 `undefined`。必须用 `contextBridge.exposeInMainWorld`。自 Electron 20 起 renderer **sandbox 默认开**；`nodeIntegration: true` 会关掉该进程 sandbox。沙箱 preload 只能 `require` 有限模块：`electron`（`contextBridge` / `ipcRenderer` 等）、`events`、`timers`、`url`。

4. **IPC 是唯一正规通道**。单向用 `ipcRenderer.send` + `ipcMain.on`；双向推荐 `ipcRenderer.invoke` + `ipcMain.handle`（Electron 7 引入）。`lib/browser/ipc-main-impl.ts` 里 `handle` 把回调放进 `_invokeHandlers`，同一 channel 注册第二次会抛错。`ipc-dispatch.ts` 的 `-ipc-invoke` 找到 handler 后回 `{ result }`，异常回 `{ error: error.toString() }`；官方 IPC 教程写明 renderer 只拿到序列化后的 `message`。另外还有 **utility process**：从 main fork 的 Node 进程，可与 renderer 建 `MessagePort`，文档建议优先于 `child_process.fork`。

## 实践案例

### 案例 1：默认安全窗口

```js
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
```

**逐部分**：

- 不写 `nodeIntegration` / `contextIsolation` / `sandbox` 时，走固定版本默认：无 Node、隔离、沙箱
- `preload` 指向特权脚本；页面本身拿不到 Electron 模块
- `app.whenReady()` 等运行时就绪再开窗；ESM 主进程还要注意 `ready` 前的 `await` 时机

### 案例 2：preload 只暴露一个 invoke

```js
// preload.js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
});

// main.js
const { ipcMain, dialog } = require('electron');
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
  });
  return canceled ? null : filePaths[0];
});
```

```html
<button id="pick">选择文件</button>
<script>
  document.getElementById('pick').onclick = async () => {
    console.log(await window.desktop.openFile());
  };
</script>
```

**逐部分**：

- 教程把直接暴露整个 `ipcRenderer.invoke` 标成不安全：页面就能打任意 channel
- `dialog:` 前缀只是命名空间，运行时不解析
- 真正弹系统对话框的是 main；renderer 只拿到路径字符串

### 案例 3：拒绝未授权跳转

```js
const { shell } = require('electron');

win.webContents.on('will-navigate', (event, url) => {
  const { origin } = new URL(url);
  if (origin !== 'https://app.example.com') event.preventDefault();
});

win.webContents.setWindowOpenHandler(({ url }) => {
  if (url.startsWith('https://docs.example.com')) {
    setImmediate(() => shell.openExternal(url));
  }
  return { action: 'deny' };
});
```

安全清单第 13–15 条要求限制导航、限制新窗口，并且不要把未信任 URL 丢给 `shell.openExternal`。这是机制推论下的最小写法，不是完整策略引擎。

## 踩过的坑

1. **打开 `nodeIntegration` 图省事**：固定文档把“远程内容 + Node”标成严重风险；它还会关掉 sandbox。
2. **preload 里 `window.api = ...`**：隔离开启后页面读不到；必须走 `contextBridge`。
3. **把整个 `ipcRenderer` 暴露出去**：等于把任意 channel 交给 XSS。
4. **只测 `electron .` 就发版**：fuse 在打包期翻转（`runAsNode` 默认开、`cookieEncryption` 默认关），安装包、asar 路径和签名与开发模式不同。
5. **沙箱 preload 写 ESM `import`**：`electron@28` 起 main 可用 Node ESM，但 **sandboxed preload 不支持 ESM import**；拆文件要打包。

## 适用 vs 不适用场景

**适用**：

- 需要跨 Windows / macOS / Linux 且 UI 以 Web 技术为主
- 产品依赖特定 Chromium 行为（DevTools、扩展、一致的 CSS / JS 引擎）
- 团队已有前端栈，能接受自带内核的体积与更新义务
- 满足 npm `electron@44.0.0` 的 `engines.node >= 22.12.0`

**不适用**：

- 安装包 / 常驻内存必须压到系统 WebView 量级——对照 [[tauri]] / [[neutralinojs]]
- 必须像素级原生控件，而不是“浏览器画出来的桌面”
- 团队不打算跟 Chromium 发布节奏升级
- 要把未信任远程页直接加载进带 Node 的窗口

## 固定版本边界

- 本文绑定 `electron/electron@bf0c4e67...`，即 annotated tag `v44.0.0` peel 后的 commit，对应 npm `electron@44.0.0`。
- 仓库根 `package.json` 是开发用 `@electron-ci/dev-root@0.0.0-development`；发布包元数据在 `npm/package.json`，`engines.node >= 22.12.0`。
- 默认安全组合：`contextIsolation` 自 12 开启，sandbox 自 20 开启，`nodeIntegration` 自 5 关闭。
- ESM 自 28.0.0 起按进程选择 Node 或 Chromium loader；沙箱 preload 不能 ESM import。
- `ipcMain.handle` 同一 channel 不能注册两个 handler；invoke 错误对 renderer 不透明。
- 本文未安装 Electron、未开窗口、未跑 spec / 打包 / fuse 翻转，状态保持 `UNVERIFIED`。

## 学到什么

1. **Electron 的本质是“浏览器进程模型 + 系统桥”**，不是又一个 UI 库。
2. **默认安全来自隔离与沙箱，不是来自“我没写危险代码”**；显式打开 Node 会把 XSS 升级成本机能力。
3. **preload 只该暴露任务，不该暴露通道**。
4. **开发能跑 ≠ 可以发布**：fuse、签名、更新是另一条产品链。

## 应用型自测

1. `contextIsolation` 开启时，preload 里给 `window.desktop = {}` 赋值，页面能读到吗？
2. 某个 renderer 设置了 `nodeIntegration: true`，它的 sandbox 还开着吗？
3. main 里 `ipcMain.handle('x', fn)` 已经注册过，再 `handle` 一次会怎样？

检查点：

1. 不能。隔离下 preload 与页面不共享 `window`，必须 `contextBridge.exposeInMainWorld`。
2. 不会。固定文档写明启用 Node 会禁用该进程 sandbox。
3. 抛错。`IpcMainImpl.handle` 发现 `_invokeHandlers` 已有同名 channel 就 throw。

## 延伸阅读

- 官方文档：[Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)、[Security](https://www.electronjs.org/docs/latest/tutorial/security)
- 固定源码：[electron/electron](https://github.com/electron/electron) —— 本文绑定提交 `bf0c4e67e9a834479ee171e61057f7516a381d25`
- [[electron-builder]] —— 常见打包、签名与更新配套
- [[tauri]] —— 系统 WebView + Rust 的对照运行时

## 关联

- [[electron-builder]] —— Electron 应用的打包发布事实标准之一
- [[node-js]] —— 主进程与 preload 依赖的 Node 运行时
- [[tauri]] —— 同类桌面壳，强调更小包体与 Rust 后端
- [[neutralinojs]] —— 轻量对照，看清 Chromium 捆绑的成本
- [[nodegui]] —— 用 Node 调 Qt 原生控件的另一条路
- [[capacitor]] —— 移动端 WebView 壳，问题同构但平台不同
- [[vite]] —— 许多 Electron 项目用它构建 renderer

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atom]] —— Atom — Web 技术做桌面编辑器的先驱
- [[ionic-framework]] —— Ionic Framework — 用网页技术做跨端 App 的 UI 工具箱
- [[lens]] —— Lens — Kubernetes 集群的桌面 IDE
- [[quasar]] —— Quasar Framework — 一套代码跑 Vue 全端的应用框架
- [[tauri]] —— Tauri — 用系统浏览器内核 + Rust 做轻量桌面应用
- [[wails]] —— Wails — 用 Go + 网页技术打成单个桌面应用
- [[xi-editor]] —— xi-editor — 异步架构编辑器的先驱实验
