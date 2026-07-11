---
title: Electron — 用网页技术做跨平台桌面应用
来源: 'https://github.com/electron/electron'
日期: 2026-07-08
分类: mobile
难度: 中级
---

## 是什么

Electron 是一个**把 Chromium 浏览器内核和 Node.js 绑在一起的桌面应用框架**。你用 HTML、CSS、JavaScript 写界面，就能打成 Windows、macOS、Linux 上可安装的程序。

日常类比：像给网站套上一个“可安装的外壳”。外壳负责窗口、菜单、托盘、文件系统；里面还是你熟悉的网页技术。VS Code、Slack、Figma 桌面版都走这条路。

它不是新的前端框架，也不替代 React/Vue。真正多出来的是：主进程能调系统 API，渲染进程跑页面，两者用 IPC 通信。

## 为什么重要

不理解 Electron，下面这些事很难解释：

- 为什么前端团队能快速做出桌面产品，而不必先学 Swift / WinUI / GTK
- 为什么桌面 App 会吃掉上百 MB 内存：每个窗口大致带着一份 Chromium
- 为什么“网页里随便 `require('fs')`”曾经能用，现在却被安全模型拦住
- 为什么打包、签名、自动更新往往要另配 [[electron-builder]]，而不是 `npm start` 就完事

## 核心要点

1. **双进程模型**。类比：餐厅后厨和前厅。**主进程**（Main）管窗口生命周期和系统能力；**渲染进程**（Renderer）管页面 UI。两边默认隔离，不能直接互调函数。

2. **IPC + preload 是安全桥**。类比：前厅不能进保险柜，只能通过传菜口点菜。`preload` 脚本在页面加载前注入，用 `contextBridge` 暴露少量白名单 API；页面通过 IPC 向主进程要文件、通知、窗口操作。

3. **打包才是交付**。开发时 `electron .` 只是本地跑；发给用户要 installer、图标、asar、代码签名和更新通道。Electron 负责运行时，发行链路常交给 [[electron-builder]]。

## 实践案例

### 案例 1：最小窗口

```js
// main.js
const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: require('path').join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
```

**逐部分解释**：

- `BrowserWindow` 创建一个真正的系统窗口，里面嵌 Chromium
- `contextIsolation: true` + `nodeIntegration: false` 是现代默认安全组合
- `preload` 指向桥接脚本；页面本身拿不到完整 Node API
- `app.whenReady()` 等 Electron 初始化完再开窗，避免过早创建失败

### 案例 2：preload 暴露受限 API

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
<!-- index.html 里的渲染脚本 -->
<button id="pick">选择文件</button>
<script>
  document.getElementById('pick').onclick = async () => {
    const path = await window.desktop.openFile();
    console.log(path);
  };
</script>
```

**逐部分解释**：

- `contextBridge.exposeInMainWorld` 只放出 `openFile`，不是整个 Node
- `ipcRenderer.invoke` / `ipcMain.handle` 是请求-响应式 IPC
- 真正弹系统对话框的是主进程；渲染进程只拿到路径字符串
- 这比打开 `nodeIntegration` 安全得多：页面 XSS 也摸不到任意文件 API

### 案例 3：系统通知与托盘入口

```js
const { Tray, Menu, Notification, nativeImage } = require('electron');

app.whenReady().then(() => {
  const tray = new Tray(nativeImage.createEmpty());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示窗口', click: () => createWindow() },
    { role: 'quit' },
  ]));
  new Notification({ title: '任务完成', body: '导出已写到桌面' }).show();
});
```

**逐部分解释**：

- `Tray` 把应用挂到菜单栏/托盘，适合常驻工具
- `Menu.buildFromTemplate` 用声明式结构生成原生菜单
- `Notification` 走操作系统通知中心，不是网页 `Notification` 的弱化版
- 真实项目还要处理图标资源、macOS 通知权限和窗口隐藏策略

## 踩过的坑

1. **打开 `nodeIntegration` 图省事**：渲染进程 XSS 一次就能读本地文件、起子进程。
2. **在渲染进程做重计算**：大 JSON 解析、视频转码会卡住 UI 并抬高内存；应放主进程、Worker 或本地服务。
3. **IPC 频道命名混乱、无鉴权**：任意页面消息都当可信输入，容易被事件风暴或伪造调用打穿。
4. **只测 `electron .` 就发版**：安装包、asar 路径、签名和自动更新与开发模式行为不同，必须测打包产物。

## 适用 vs 不适用场景

**适用**：

- 前端团队要快速交付跨平台桌面 MVP 或内部工具
- UI 以 Web 技术为主，需要中等程度的文件系统、通知、菜单能力
- 产品形态接近编辑器、管理后台、IM、媒体工具（VS Code 类）

**不适用**：

- 极限性能、严格低内存（每个窗口 bundling Chromium 成本高）
- 必须像素级原生控件与系统深度集成
- 嵌入式、无显示器设备，或团队几乎没有 Web 经验却强行上 Electron

## 历史小故事（可跳过）

- **2013 年**：GitHub 做 Atom 编辑器时抽出 **Atom Shell**，把 Chromium + Node 绑成桌面壳。
- **2015 年**：项目改名 **Electron**，社区开始用它做 Slack 等商业客户端。
- **之后几年**：VS Code 等明星应用把它推成事实标准；安全默认项逐步收紧（contextIsolation 等）。
- **同期对照**：[[tauri]]、[[neutralinojs]]、[[nodegui]] 走更轻的 WebView/原生路线，和 Electron 形成体积与生态权衡。

## 学到什么

1. **Electron 的本质是“浏览器 + 系统桥”**，不是又一个 UI 库。
2. **安全边界在主进程 / preload / 渲染进程之间**，默认应最小暴露。
3. **开发能跑 ≠ 可以发布**：打包、签名、更新是另一条产品能力链。
4. **选型要算内存与包体账**：跨平台速度换来的是 Chromium 运行时成本。

## 延伸阅读

- 官方仓库：[electron/electron](https://github.com/electron/electron)
- 官方文档：[Electron Documentation](https://www.electronjs.org/docs/latest)
- 安全清单：[Security, Native Capabilities, and Your Users](https://www.electronjs.org/docs/latest/tutorial/security)
- [[electron-builder]] —— 打包、签名与自动更新的常见配套
- [[tauri]] —— 更轻量的 Rust + 系统 WebView 对照路线
- [[neutralinojs]] —— 极简桌面壳，帮助理解 Electron 体积从何而来

## 关联

- [[electron-builder]] —— Electron 应用的打包发布事实标准之一
- [[node-js]] —— 主进程与 preload 依赖的 Node 运行时
- [[tauri]] —— 同类桌面壳，强调更小包体与 Rust 后端
- [[neutralinojs]] —— 轻量对照，看清 Chromium 捆绑的成本
- [[nodegui]] —— 用 Node 调 Qt 原生控件的另一条路
- [[capacitor]] —— 移动端 WebView 壳，和桌面 Electron 问题同构但平台不同
- [[vite]] —— 许多 Electron 项目用 Vite 构建 renderer 再交给主进程加载

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
