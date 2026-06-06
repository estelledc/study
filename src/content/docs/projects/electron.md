---
title: Electron — Chromium + Node.js 跨平台桌面应用框架
来源: 'https://github.com/electron/electron'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

Electron 是一个开源框架，让你用 **JavaScript、HTML 和 CSS** 写出能在 Windows、macOS、Linux 上安装的桌面应用。日常类比：它像一个「自带厨房和水电的精装商铺」——店面装修用你熟悉的网页技术（HTML/CSS），后厨水电（读文件、弹系统对话框、托盘图标）通过 Node.js 接通，你不必分别学三套原生 UI 框架。

具体来说，Electron 把两样东西绑在一起：**Chromium** 负责画窗口、跑网页；**Node.js** 负责访问操作系统（文件、进程、网络底层）。每个应用至少有一个 **主进程**（`main`）管生命周期和系统调用，每个窗口对应一个 **渲染进程** 显示页面。两者之间用 **IPC**（进程间通信）传消息，就像前台收银和后厨之间通过对讲机点菜。

```javascript
// main.js — 主进程：创建窗口
const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
```

## 为什么重要

不理解 Electron，下面这些事都没法解释：

- 为什么 VS Code、Slack、Discord、Figma 桌面版能用 Web 技术栈却拥有原生窗口和菜单
- 为什么「一个前端团队」能同时交付网站和桌面客户端，而不必招 C++/Swift 工程师
- 为什么桌面应用安装包动辄 80–150MB——里面打包了一整份 Chromium 内核
- 为什么 Electron 应用的安全新闻常和「XSS 能读本地文件」绑在一起——渲染进程默认能碰 Node 时风险极高

## 核心要点

**1. 主进程 vs 渲染进程 — 前台与后厨**

主进程是应用入口，负责 `app` 生命周期、`BrowserWindow` 创建、系统菜单和托盘。每个窗口的页面跑在独立的渲染进程里（类似浏览器每个标签页）。渲染进程默认不应直接 `require('fs')` 读全盘——正确做法是用 **preload** 脚本通过 `contextBridge` 只暴露必要 API。

类比：主进程是店长，渲染进程是店面服务员；客人（网页脚本）不能直接进仓库，只能通过店长批准的取货单（IPC）拿东西。

**2. IPC — 进程对讲机**

`ipcMain` / `ipcRenderer` 让主进程和渲染进程异步传数据。现代写法推荐 `ipcMain.handle` + `ipcRenderer.invoke`（Promise 风格），避免 `sendSync` 卡死 UI。

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  readConfig: () => ipcRenderer.invoke('read-config'),
});

// main.js
const { ipcMain } = require('electron');

ipcMain.handle('read-config', async () => {
  const fs = require('node:fs/promises');
  return JSON.parse(await fs.readFile('config.json', 'utf8'));
});
```

**3. 打包与分发 — 把网页装进安装包**

开发时 `electron .` 直接跑源码；发布时用 **electron-builder** 或 **Electron Forge** 把 `main`、静态资源、`node_modules` 依赖和 Electron 运行时打成 `.exe` / `.dmg` / `.AppImage`。Chromium 版本与 Electron 主版本号绑定，升级时要读官方迁移文档。

这三层构成 Electron 的核心价值：**用 Web 技能栈 + npm 生态，快速做出三平台桌面应用**，代价是体积和内存。

## 实践案例

### 案例 1：最小可读配置文件的桌面工具

场景：做一个读本地 `config.json` 并在窗口里展示的小工具。

```javascript
// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

function createWindow() {
  const win = new BrowserWindow({
    width: 640,
    height: 480,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');
}

ipcMain.handle('read-config', async () => {
  const raw = await fs.readFile(path.join(__dirname, 'config.json'), 'utf8');
  return JSON.parse(raw);
});

app.whenReady().then(createWindow);
```

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  loadConfig: () => ipcRenderer.invoke('read-config'),
});
```

```html
<!-- index.html -->
<script>
  desktop.loadConfig().then((cfg) => {
    document.body.textContent = JSON.stringify(cfg, null, 2);
  });
</script>
```

关键洞察：`contextIsolation: true` + `nodeIntegration: false` 是生产默认安全配置；页面只通过 `desktop.loadConfig` 间接读文件，即使将来页面里混入恶意脚本也拿不到完整 Node 权限。

### 案例 2：React + Vite 项目接入 Electron

场景：已有 Vite 构建的 React 前端，希望开发时有热更新，生产时打成桌面安装包。

```javascript
// electron/main.js（开发 / 生产分支）
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({ width: 1024, height: 768 });
  if (isDev) {
    // 开发时窗口像浏览器一样打开本机 Vite 地址，改代码可热更新
    win.loadURL('http://localhost:5173'); // Vite dev server
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);
```

```json
// package.json 脚本片段
{
  "scripts": {
    "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build && electron-builder"
  }
}
```

关键洞察：开发态加载远程 dev server URL，生产态 `loadFile` 静态 `dist`——同一套 React 组件，只是「壳」在开发/打包时切换加载源。社区工具 **electron-vite** 把这套双模式配置进一步模板化。

### 案例 3：系统托盘 + 单实例后台工具

场景：内部运维小工具，关闭窗口不退出，托盘右键才能彻底退出；同时防止用户开两个实例。

```javascript
const { app, BrowserWindow, Tray, Menu } = require('electron');

let tray = null;
let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({ show: false });
  mainWindow.loadFile('index.html');
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  tray = new Tray('icon.png');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示', click: () => mainWindow.show() },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
});
```

关键洞察：`requestSingleInstanceLock` 保证只有一个进程；`close` 事件里 `preventDefault` + `hide` 实现「关窗即最小化到托盘」，适合常驻后台类工具。

## 踩过的坑

1. **渲染进程开 nodeIntegration**：一旦页面被 XSS 注入，攻击脚本能 `require('fs')` 读用户目录——务必 `contextIsolation: true`，用 preload 白名单暴露 API。

2. **同步 IPC 卡 UI**：`ipcRenderer.sendSync` 会让渲染进程等主进程返回，主进程若在做磁盘 IO，整个窗口冻结——改用 `invoke` / `handle` 异步模式。

3. **打包体积失控**：默认把整个 `node_modules` 打进 asar，安装包轻松破百 MB——在 `electron-builder` 的 `files` 里只包含运行时依赖，devDependencies 绝不打进生产包。

4. **大版本升级 breaking**：Electron 30 和 Electron 35 对应的 Chromium/Node 版本不同，废弃 API（如旧版 `remote` 模块）会直接报错——升级前必读 [Electron Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes) 文档。

## 适用 vs 不适用场景

**适用**：
- 团队主力是前端 / 全栈，需要快速交付 Windows + macOS + Linux 桌面客户端
- 应用 UI 复杂、迭代快，希望和 Web 版共享组件（如 VS Code、Notion 类生产力工具）
- 需要深度系统集成：托盘、全局快捷键、本地文件读写、自动更新
- 内部工具、开发者工具、协作类客户端（接受 80MB+ 安装包）

**不适用**：
- 对安装包体积和内存极度敏感（嵌入式、低配机器）——考虑 [[flutter]] 原生或 Tauri（Rust + 系统 WebView）
- 纯游戏或重度 GPU 3D——应用游戏引擎而非 Electron
- 只需简单通知栏工具且 UI 极简——系统原生菜单栏应用可能更轻
- 安全合规要求禁止捆绑完整 Chromium——部分政企环境更接受系统 WebView 方案

## 历史小故事（可跳过）

- **2013 年**：GitHub 为 Atom 编辑器开发底层 shell，后从 Atom 仓库独立，项目最初叫 Atom Shell，后更名为 Electron。
- **2015–2016 年**：Visual Studio Code（2015 发布）、Slack 桌面版等大规模采用，证明 Web 技术栈能支撑「每天数小时使用」的生产力应用。
- **2018 年**：Electron 加入 OpenJS Foundation，版本发布与 Chromium 升级节奏绑定，安全补丁跟随 Chromium 节奏。
- **2020 年**：Electron 11+ 默认开启 `contextIsolation`，推动社区从「渲染进程直接 require」迁移到 preload 安全模型。
- **2023 年起**：Tauri 2.0 等轻量替代升温，但 Electron 在 npm 生态、第三方模块成熟度和「能跑任意 Node 原生扩展」上仍占主导。

## 学到什么

1. **架构分进程是安全底线**：把 Node 权限关在主进程，渲染进程只拿白名单 API——这不是过度设计，是桌面 Web 应用的安全基础
2. **体积是设计决策**：打包 Chromium 换来的是跨平台一致渲染和成熟 DevTools，接受代价才能在选型时心安理得
3. **IPC 设计影响体验**：异步、细粒度、可取消的 API 比「一个大 sync 函数」更能保持 UI 流畅
4. **与 Web 同源共享资产**：同一套 React 组件、状态管理和构建链可同时服务网站和桌面，团队边际成本低于维护三套原生 UI

## 延伸阅读

- 官方文档：[Electron Docs — Tutorial](https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites)（从零搭建第一个应用的权威路径）
- 安全指南：[Security Tutorial](https://www.electronjs.org/docs/latest/tutorial/security)（contextIsolation / preload 必读）
- 工具：[Electron Fiddle](https://www.electronjs.org/fiddle)（浏览器里试 API、切换版本）
- 打包：[electron-builder 文档](https://www.electron.build/)（多平台签名与自动更新）
- 视频：[Fireship — Electron in 100 Seconds](https://www.youtube.com/watch?v=8YP0-vvwIeY)（快速建立整体图景）

## 关联

- [[node-js]] —— Electron 主进程即 Node 运行时，npm 生态可直接用于桌面端
- [[react]] —— 最常见的 Electron UI 层选择，与 Vite/Webpack 构建链成熟对接
- [[react-native]] —— 同属「用 JS 写原生体验」路线，RN 主攻移动，Electron 主攻桌面
- [[vscode]] —— 最成功的 Electron 应用之一，验证了 Web 技术写编辑器的技术路线
- [[expo]] —— 移动端的「开箱工具链」 counterpart，Electron + Forge 扮演类似角色
- [[vite]] —— 现代 Electron 前端常配 Vite 做 dev server 与生产构建
- [[playwright]] —— 可驱动 Electron 应用做 E2E 测试（`electron.launch` API）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lens]] —— Lens — Kubernetes 集群的桌面 IDE

