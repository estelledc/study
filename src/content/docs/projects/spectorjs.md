---
title: Spector.js — WebGL/WebGPU 调试器
来源: https://github.com/BabylonJS/Spector.js
日期: 2026-05-29
分类: graphics
难度: 初级
---

## 是什么

Spector.js 是一个帮你**抓住浏览器里一帧 3D 画面，并拆开看每一步怎么画出来**的调试器。

日常类比：你看餐厅最后端上来一盘菜，肉眼只知道“好看或不好看”；Spector.js 像后厨录像，把“先洗菜、再下锅、再调味、最后摆盘”的每一步都列出来。

在技术上，它主要面向 WebGL / WebGL2：把一个 canvas 当前帧里的 GL 命令、draw call、shader、texture、uniform、framebuffer 和状态变化保存成可检查的记录。

标题里写 WebGPU，是因为今天的 Web 图形正在从 WebGL 走向 WebGPU；但按官方 README 和 luma.gl 文档，Spector.js 的稳定核心仍是 WebGL 调试。理解它，先学会“图形程序不是一口气画完，而是一串 GPU 指令”。

## 为什么重要

不理解 Spector.js，下面这些事会很难解释：

- 为什么 3D 页面黑屏时，普通 `console.log` 常常没用，因为错误可能发生在 GPU 状态、纹理绑定或 shader 输入里。
- 为什么同一个模型在 three.js、Babylon.js、PlayCanvas 里都能用它查，因为它站在 WebGL 命令层，不依赖某个引擎。
- 为什么“draw call 太多”不是一句口号，而是可以一条条看到哪些 mesh、材质、透明物体或后处理在产生绘制。
- 为什么 WebGPU 时代仍需要帧调试思维：无论 API 名字怎么换，都要知道一帧由哪些资源、管线和命令组成。

## 核心要点

Spector.js 可以拆成 **三件事**：

1. **抓一帧**：像给快递流程拍一张完整清单。它不只是截屏，而是记录这一帧发给 GPU 的命令，所以能看到“第几步画了什么”。

2. **看状态**：像检查厨房每个灶台的火候、锅具和调料。WebGL 的结果取决于当前绑定的 shader、buffer、texture、blend、depth 等状态，漏看任何一个都可能误判。

3. **把资源命名**：像给仓库箱子贴标签。通过 `__SPECTOR_Metadata` 或引擎的 `id`，捕获结果里不再只有匿名 buffer，而能看到“city-points-vertex-buffer”这类人能读的名字。

它不是自动修 bug 的工具，更像显微镜：把 GPU 那层原本看不见的事实摆出来，再由你判断为什么画错。

## 实践案例

### 案例 1：Cocos Creator 找到谁打断了批处理

Cocos Creator 社区教程里，用 Spector.js 检查 `dynamicAtlas` 后的 draw call，发现 Label 和 Sprite 能不能合批，关键看它们是否真的共用同一张 atlas 纹理。

```js
// 真实场景的简化写法：让 Label 使用位图缓存，便于进入动态图集
label.cacheMode = cc.Label.CacheMode.BITMAP;

// 背景图太小会影响动态图集策略，教程里把 2x2 调整为 32x32
background.getComponent(cc.Sprite).spriteFrame = frame32x32;
```

**逐部分解释**：

- `cacheMode = BITMAP`：把文字先变成一张图，才更容易和普通 Sprite 一起走贴图批处理。
- `frame32x32`：小到异常的贴图可能被 atlas 策略跳过，Spector.js 能在 draw call 右侧看到实际绑定的 texture。
- 结果判断：如果 Label 和 Sprite 落在同一个 draw call，说明它们被合批；如果拆开，就沿着材质、分组、纹理继续查。

### 案例 2：luma.gl 给 GPU 对象贴名字

luma.gl 官方调试文档把 Spector.js 作为 WebGL-only 集成项，并建议用对象 `id` 和调试开关把捕获结果变得可读。

```js
const device = luma.createDevice({
  type: 'webgl',
  debugSpectorJS: true,
});

const pipeline = device.createRenderPipeline({
  id: 'city-points-pipeline',
  // vertex shader、fragment shader、attribute 省略
});
```

**逐部分解释**：

- `debugSpectorJS: true`：让 luma.gl 在 WebGL 设备上动态加载 Spector.js，不把调试器塞进日常包体。
- `id: 'city-points-pipeline'`：给管线一个人类名字，捕获时能从匿名对象回到业务含义。
- 这个案例说明：Spector.js 最适合和引擎的命名系统配合，否则你只会看到一堆长得一样的 GPU 对象。

### 案例 3：WebXR 或 shader 黑屏时查 sampler

WebXR 性能调试文章和 GLSL 调试笔记都提到：当画面卡顿、黑屏或贴图不对时，Spector.js 能看到每个 draw call 绑定了哪个 shader、uniform 和 texture。

```js
const texture = gl.createTexture();
texture.__SPECTOR_Metadata = { name: 'left-eye-ui-atlas' };

// 如果 shader 里 sampler2D 读到的不是这张纹理，
// Spector.js 的 draw call 详情会暴露绑定错误。
gl.bindTexture(gl.TEXTURE_2D, texture);
```

**逐部分解释**：

- `createTexture()`：创建 GPU 纹理对象，普通 JS 调试器看不到它里面真正被谁使用。
- `__SPECTOR_Metadata`：给纹理贴可读标签，捕获后能快速确认 sampler 读的是不是目标纹理。
- `bindTexture`：WebGL 是状态机，后续 draw call 会使用“当前绑定”的纹理；很多黑屏 bug 就藏在这类当前状态里。

## 踩过的坑

1. **把它当性能计时器**：Spector.js 能看 draw call 和状态，但 Babylon.js 论坛也提醒它不提供精确 GPU timing，精确耗时要用 PIX、RenderDoc 或浏览器 profiler。

2. **忘记静态画面不会自动出新帧**：官方教程说如果场景完全静止，捕获可能等不到渲染；动一下相机或触发一次重绘才有东西可抓。

3. **只看截图不看状态**：图像结果只是“症状”，真正根因常在 shader uniform、texture 绑定、depth/blend 状态或 framebuffer 目标。

4. **调试代码进生产包**：嵌入式 UI 和完整捕获有额外开销，应该只在开发环境或显式调试开关下启用。

## 适用 vs 不适用场景

**适用**：
- WebGL / WebGL2 页面黑屏、花屏、贴图错位、shader 输入不符合预期。
- 想知道一个 three.js、Babylon.js、PlayCanvas 或原生 WebGL 场景到底发出了哪些 draw call。
- 排查批处理、材质共享、透明物体、后处理、shadow map 这类“一帧里画了多次”的问题。
- 给团队或用户导出 capture JSON，让别人复盘同一帧事实。

**不适用**：
- 纯 DOM / CSS / Canvas 2D 问题，直接用浏览器 DevTools 更合适。
- 需要精确 GPU 每条命令耗时的性能分析，Spector.js 只能辅助定位方向。
- 已经完全迁到 WebGPU 且不走 WebGL fallback 的项目，应优先看 WebGPU Inspector、Chrome GPU 工具或平台 profiler。
- 线上常驻监控，它的同步捕获和 UI 成本不适合挂在所有用户页面上。

## 历史小故事（可跳过）

- **2017 年前后**：Babylon.js 团队在 WebGL2 普及后发现旧 WebGL Inspector 很多功能跟不上，于是做了 Spector.js。
- **Real-Time Rendering 文章**：Sebastien Vandenberghe 公开写过教程，重点是捕获一帧、查看命令列表、状态和 shader 源码。
- **社区扩散**：Cocos Creator、luma.gl、WebXR 开发者都把它放进自己的调试流程，用来拆 draw call 和资源绑定。
- **近年变化**：官方 README 增加了 OffscreenCanvas、Worker 捕获和 MCP server，说明它从浏览器插件扩展成可嵌入、可自动化的调试组件。
- **WebGPU 时代**：它不是完整 WebGPU 调试器，但它教会的“帧捕获 + 状态检查 + 资源命名”仍是现代 GPU 调试的基本功。

## 学到什么

1. **浏览器 3D 不是一张图，而是一串命令**：Spector.js 把这串命令展开，所以你能从“看起来不对”走到“第几步不对”。
2. **WebGL 是状态机**：很多 bug 不是函数写错，而是当前绑定的 buffer、texture、program 或 framebuffer 和你以为的不一样。
3. **draw call 是可解释的工程事实**：批处理失败、透明排序、阴影和后处理都会在捕获里留下痕迹。
4. **调试工具要和命名约定一起用**：没有 metadata 或 id，捕获结果会很难读；有名字，GPU 对象才能回到业务语境。

## 延伸阅读

- 官方仓库：[BabylonJS/Spector.js](https://github.com/BabylonJS/Spector.js)
- 官方站点：[Spector.js WebGL. Simple. Powerful.](https://spector.babylonjs.com/)
- 入门教程：[Debugging WebGL with SpectorJS](http://www.realtimerendering.com/blog/debugging-webgl-with-spectorjs/)
- 真实案例：[Cocos Creator + Chrome Utility Plugin](https://forum.cocosengine.org/t/tutorial-cocos-creator-chrome-utility-plugin/47879)
- 集成案例：[luma.gl Debugging](https://luma.gl/docs/developer-guide/debugging)
- 相关笔记：[[babylonjs]]、[[threejs]]、[[luma-gl]]

## 关联

- [[babylonjs]] —— Spector.js 出自 Babylon.js 团队，很多设计来自引擎级调试需求。
- [[threejs]] —— three.js 场景出现黑屏或材质异常时，也能从 WebGL 命令层用 Spector.js 追踪。
- [[playcanvas]] —— 同样是 WebGL 引擎，draw call、材质和贴图问题可用相同思路拆解。
- [[luma-gl]] —— 官方文档内置 Spector.js 集成，是“库主动给调试器喂名字”的好例子。
- [[regl]] —— regl 把 WebGL 调用声明化；Spector.js 则反过来观察这些调用最后落成什么命令。
- [[glslify]] —— shader 模块化后更需要捕获最终展开的 shader，确认浏览器实际编译了什么。
- [[pixi]] —— 2D WebGL 渲染也会遇到批处理、纹理 atlas 和 draw call 问题。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
