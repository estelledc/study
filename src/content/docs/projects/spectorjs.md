---
title: Spector.js — WebGL/WebGPU 调试器
来源: 'https://github.com/BabylonJS/Spector.js'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
---

## 是什么

**Spector.js** 是 Babylon.js 团队维护的 **WebGL / WebGL2 帧级调试器**：它拦截并记录某一帧内所有 GL 调用，连同当时的纹理、着色器、缓冲区、帧缓冲和中间渲染结果，一起放进可交互的时间线里供你逐条回放。

日常类比：

> 原生 WebGL 像一家后厨：厨师（你的代码）不断下单——绑纹理、改 uniform、draw call——但顾客（你）只能看到最终上桌的菜（canvas 像素），中间哪一步盐放多了完全不知道。Spector.js 相当于在厨房装了 **全程监控 + 每步试吃**：每一道「工序」都有快照，你可以从最后一帧往回倒带，看「绑定了哪张纹理」「这个 draw call 之前 framebuffer 长什么样」。

与 Chrome DevTools 的 Performance 面板不同，Spector 专注 **图形 API 语义层**，而不是 JS 堆栈或 CPU 采样。它与引擎无关——Three.js、Babylon.js、PlayCanvas、regl、手写 WebGL 都能抓，只要最终走的是 `WebGLRenderingContext` / `WebGL2RenderingContext`。

官方提供三种使用形态：

| 形态 | 适用场景 |
|------|----------|
| **浏览器扩展**（Chrome / Firefox） | 调试任意网站，零侵入 |
| **npm 包 `spectorjs`** | 嵌入自己的 demo / 内网工具页 |
| **MCP Server** | 让 AI 助手远程加载 URL、抓帧、读 draw call |

官网：[spector.babylonjs.com](https://spector.babylonjs.com)

## 为什么重要

不理解 Spector.js，下面几件事很难排查：

- 画面全黑 / 全粉（shader 编译失败）——需要看 **哪条 linkProgram 报错、编译日志是什么**
- 「多 pass 后颜色不对」——需要对比 **每次 `bindFramebuffer` 前后 attachments 里到底有什么**
- draw call 数量爆炸导致移动端掉帧——需要数 **每帧到底发了多少次 drawArrays / drawElements**
- Worker + OffscreenCanvas 架构——主线程 DevTools 看不到 Worker 里的 GL，需要 **Worker 侧 capture**
- 引擎升级 WebGL2 后旧工具（如 WebGL Inspector）失效——Spector 同时支持 WebGL1/2

一句话：**当「像素结果」和「你的 mental model」对不上时，Spector 是把 GPU 黑盒打开的最短路径。**

## 核心概念

### 1. Capture（捕获）：一帧的「GL 录像带」

一次 capture 不是截图，而是 **有序命令列表 + 每步 GL 状态 + 可选缩略图**。核心 API：

- `captureNextFrame(canvas | gl)` — 等下一帧结束后自动停止
- `startCapture(obj, commandCount, quickCapture?)` — 抓满 N 条 GL 命令或 10 秒超时
- `stopCapture()` — 手动结束，返回 JSON 结构的 `ICapture`

`quickCapture: true` 时跳过每步缩略图，适合命令量极大的场景。

### 2. Spy（监听）：先挂钩，再录制

`spyCanvases()` 会在 **capture 之前** 就开始跟踪 canvas / context 上的 GL 调用，从而记录纹理上传、buffer 创建等「帧外」信息——内存占用、纹理输入历史在 UI 里才完整。

类比：Spy 是「一直开着的监控」，Capture 是你按下的「导出这一段」。

### 3. Command List + Visual State

捕获结果里每条命令通常包含：

- 函数名与参数（如 `drawElements(4, 36, 5123, 0)`）
- 调用时的 **GL 状态快照**（当前 program、bound textures、viewport、blend 等）
- **Visual State**：执行该命令后 framebuffer 内容的缩略图（非 quick 模式）

你可以在 UI 里点击任意 draw call，右侧看 shader 源码、uniform 值、顶点布局。

### 4. Marker 与自定义元数据

调试多 pass 管线时，用 marker 在时间线上打书签：

```javascript
spector.setMarker('ShadowPass');
// ... shadow map draws ...
spector.clearMarker();
```

给 WebGL 对象起可读名字（引擎资源追踪）：

```javascript
const buf = gl.createBuffer();
buf.__SPECTOR_Metadata = { name: 'cubeVerticesColorBuffer' };
```

Capture  UI 里会显示 `cubeVerticesColorBuffer`，而不是匿名的 `WebGLBuffer #17`。

### 5. OffscreenCanvas 与 Worker

现代架构常把渲染放进 Worker。Spector 提供两套 bundle：

| 文件 | 用途 |
|------|------|
| `dist/spector.bundle.js` | 主线程，含完整 UI |
| `dist/spector.worker.bundle.js` | Worker 内 headless 拦截 |

主线程用 `spyWorker(worker)` 建桥，再 `captureWorker(worker)` 触发 Worker 侧抓帧。

### 6. 与 WebGPU 的关系

项目名称和 roadmap 里常出现 WebGPU，但 **当前稳定版仍以 WebGL/WebGL2 为主**。WebGPU 调试生态仍在演进；学 Spector 的价值在于理解「帧级图形调试器」应提供什么信息——命令序列、资源绑定、中间 RT——这些概念在 WebGPU 工具（RenderDoc 思路、浏览器未来内置层）里同样适用。

## 安装与入口

```bash
npm install spectorjs
```

CDN（版本以 npm 为准）：

```html
<script src="https://cdn.jsdelivr.net/npm/spectorjs/dist/spector.bundle.js"></script>
```

浏览器扩展（零代码调试任意页）：

- [Chrome Web Store — Spector.js](https://chrome.google.com/webstore/detail/spectorjs/denbgaamihkadbghdceggmchnflmhpmk)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/spector-js/)

扩展启用后，页面上的 `<canvas>` 会出现 Spector 图标；也可在控制台用全局 `spector` 对象编程触发 capture（与嵌入版 API 一致）。

## 代码示例

### 示例 1：嵌入页面 — 显示 UI + 抓取下一帧

适合本地 demo：边改 shader 边点「Capture」。

```javascript
import { Spector } from 'spectorjs';

const canvas = document.getElementById('glcanvas');
const spector = new Spector();

// 可选：提前 spy，记录纹理上传等帧外操作
spector.spyCanvases();

// 内嵌调试面板（左上角 capture 按钮、结果视图）
spector.displayUI();

// 编程式：下一帧结束后拿到 JSON
spector.onCapture.add((capture) => {
  console.log('commands:', capture.commands.length);
  // 可持久化、做 CI 回归对比、或发给同事
  localStorage.setItem('lastCapture', JSON.stringify(capture));
});

document.getElementById('btnCapture').addEventListener('click', () => {
  spector.captureCanvas(canvas);
});
```

配合最小 WebGL 循环：只要 canvas 上有 draw call，`captureCanvas` 就能工作，与是否使用引擎无关。

### 示例 2：按命令数量截断 + Marker 分段

适合分析「阴影 pass 和光照 pass 各有多少 draw call」：

```javascript
const spector = new Spector();
spector.displayUI();

function renderFrame() {
  spector.setMarker('DepthPrePass');
  renderDepthOnly();

  spector.setMarker('MainColorPass');
  renderOpaque();
  renderTransparent();

  spector.clearMarker();
  requestAnimationFrame(renderFrame);
}

// 只抓前 200 条 GL 命令，quick 模式加快速度
spector.startCapture(canvas, 200, true);

// 或在 DevTools 里：
// spector.startCapture(document.querySelector('canvas'), 500);
```

在 Result 面板搜索 marker 名称，或搜 `LOG` 过滤 `spector.log('message')` 插入的自定义日志点。

### 示例 3：Worker + OffscreenCanvas（架构级调试）

**主线程：**

```javascript
const spector = new Spector();
const worker = new Worker('render-worker.js', { type: 'classic' });

spector.spyWorker(worker);

spector.onCapture.add((capture) => {
  spector.getResultUI().display();
  spector.getResultUI().addCapture(capture);
});

document.getElementById('capture').onclick = () => {
  spector.captureWorker(worker, undefined, false, true);
};
```

**render-worker.js：**

```javascript
importScripts('spector.worker.bundle.js');

const canvas = new OffscreenCanvas(800, 600);
const gl = canvas.getContext('webgl2');

function frame() {
  gl.clearColor(0.1, 0.1, 0.15, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // ... 你的 draw calls ...
  setTimeout(frame, 16);
}
frame();
```

`spyWorkers('spector.worker.bundle.js')` 可自动注入到新 Worker，但在 CSP 严格或 module Worker 下可能失败——**手动 `spyWorker` 更可靠**。

## 典型调试工作流

1. **复现问题帧** — 暂停游戏逻辑或锁定相机，减少 capture 噪声
2. **Capture** — 扩展一键抓帧，或代码里 `captureNextFrame`
3. **从后往前搜** — 最后几条 draw call 往往对应屏幕可见内容；往前找第一个「变全黑/变粉」的步骤
4. **查状态** — 该步 bound program、texture unit、depth test、blend 是否符合预期
5. **Shader 面板** — 看编译错误、对比 vertex/fragment 源码与引擎里文件是否一致
6. **导出 JSON** — 团队异步排查，或做「capture diff」回归（同一场景升级引擎前后对比命令数）

Real Time Rendering 博客有 [Debugging WebGL with SpectorJS](http://www.realtimerendering.com/blog/debugging-webgl-with-spectorjs/) 图文教程，扩展版操作与嵌入版 API 互通。

## 与周边工具的分工

| 工具 | 擅长 | 不擅长 |
|------|------|--------|
| **Spector.js** | GL 命令时间线、每步 RT、shader/uniform | JS CPU 性能、内存泄漏 |
| **Chrome Performance** | JS 耗时、GPU 粗粒度时间线 | 单条 draw call 的 GL 参数 |
| **WebGL Inspector**（旧） | 经典 WebGL1 场景 | WebGL2、现代维护 |
| **引擎内置 Inspector**（如 Babylon `scene.debugLayer`） | 场景图、材质业务语义 | 跨引擎、Vanilla WebGL |
| **Spector MCP** | AI 驱动「打开 URL → 抓帧 → 读 draw call」 | 需本地构建 MCP server |

做 [Babylon.js](/docs/projects/babylonjs) 项目时，引擎 Inspector 管「场景语义」，Spector 管「底层 GL 是否与预期一致」——两者互补。

## Shader  live 编辑说明

Spector 内嵌 shader 编辑器，但 **完整重编译 + 自动重绑所有 uniform/VAO/UBO** 在通用场景里极不可靠。官方策略：支持 live 编辑的引擎（如 Babylon.js）在 `linkProgram` 后挂载 `rebuildProgram(vertex, fragment, onCompiled, onError)`，由 **引擎自己** 负责重链与状态恢复。Vanilla WebGL 项目更适合「复制 shader → 本地改 → 刷新页面」。

## MCP Server（AI 辅助调试）

仓库自带 MCP server，可在 Cursor 等客户端配置后：

```json
{
  "mcpServers": {
    "spector": {
      "command": "node",
      "args": ["<path-to-Spector.js>/mcp/dist/index.js"]
    }
  }
}
```

构建步骤见仓库 `mcp/README.md`（`npm run mcp:install` / `mcp:build`）。适合「把线上 WebGL  demo URL 丢给 AI，让它读 capture 结构」的工作流。

## 局限与注意

- **开销**：完整 capture（含缩略图）在大场景下可能卡顿；开发时用 `quickCapture` 或限制 `commandCount`
- **WebGPU**：不要假设当前 npm 包能抓 WebGPU command buffer；以 README 与 release note 为准
- **生产环境**：`displayUI()` / `spyCanvases()` 应只在 development 启用，避免用户侧性能与安全问题
- **Worker 自动注入**：跨域 Worker、CSP、`type: 'module'` Worker 可能失败，优先手动 bridge

## 小结

| 要点 | 一句话 |
|------|--------|
| 定位 | WebGL 帧级「命令录像 + 状态回放」 |
| 核心 API | `displayUI`、`captureCanvas`、`startCapture`、`spyCanvases`、`spyWorker` |
| 最佳入口 | 浏览器扩展调陌生页；npm 嵌入调自己的 demo |
| 进阶 | `__SPECTOR_Metadata` 命名资源；Marker 切分 render pass |
| 生态 | Babylon.js 同源；与引擎 Inspector 互补 |

零基础记住：**画面不对时，用 Spector 抓一帧，从最后一条 draw call 往前查「哪一步开始错」**——比盲目 `console.log` uniform 快一个数量级。

## 延伸阅读

- 仓库 README 与 [API 文档](https://github.com/BabylonJS/Spector.js/blob/master/documentation/apis.md)
- [扩展使用说明](https://github.com/BabylonJS/Spector.js/blob/master/documentation/extension.md)
- 同目录：[regl](/docs/projects/regl)、[glslCanvas](/docs/projects/glsl-canvas)、[PlayCanvas](/docs/projects/playcanvas) — 被调试的常见 WebGL 运行时
