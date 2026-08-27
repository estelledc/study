# Canvas 2D source review (writer BW)

> 用途：记录 Konva 与 Fabric.js 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BW
- evidence：GitHub metadata、npm 元数据、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、未渲染 canvas、未测量 bundle 或性能
- worktrees：本机 `research-worktrees/`，不进入 Git

## Konva

- canonical source：`https://github.com/konvajs/konva`
- revision：`005356e261367c2485c70149ffc0570e16ee64f4`
- package：`konva@10.3.2`
- provenance：
  - npm `latest` / `gitHead` 均为 `005356e261...`
  - GitHub lightweight tag `10.3.2` 指向同一提交（commit message：`build for 10.3.2`）
  - 另有 `v10.3.0` 等不同 SHA 的 tag；本文只绑定 `10.3.2`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/Core.ts`
  - `src/_CoreInternals.ts`
  - `src/_FullInternals.ts`
  - `src/Global.ts`
  - `src/Stage.ts`
  - `src/Layer.ts`
  - `src/FastLayer.ts`
  - `src/Group.ts`
  - `src/Node.ts`
  - `src/Shape.ts`
  - `src/Canvas.ts`
  - `src/canvas-backend.ts`
  - `src/skia-backend.ts`
  - `src/shapes/Transformer.ts`
- observed：
  - public default export is the `Konva` namespace; Core 只含 Stage / Layer / FastLayer / Group / Shape / DD / Animation / Tween；Rect、Transformer、Filters 在 `_FullInternals`;
  - Stage 清空 container 后挂 `div.konvajs-content`；每个 Layer 自带 `SceneCanvas` + `HitCanvas`；Group 没有自己的 canvas;
  - `FastLayer` 已 deprecated，构造时强制 `listening(false)`，官方改用 `new Konva.Layer({ listening: false })`;
  - Shape 分配唯一 `colorKey`；`getIntersection` 读 hit canvas 1×1 `getImageData`，非 listening 层把 hit canvas 释成 0×0;
  - `Konva.autoDrawEnabled` 默认 true，属性变化走 `_requestDraw()` → `batchDraw()` → `requestAnimFrame` 再 `draw()`;
  - Node 滤镜走 cache 路径；非 cache 的 CSS filter 调用在 10.3.2 源码里被注释为 skip;
  - Transformer 是 Group，默认 8 个 resize anchor + rotate；`nodes([shape])` 取代已弃用的 `setNode` / `attachTo`;
  - Node 后端是可选 peer `canvas` / `skia-canvas`，分别走 `konva/canvas-backend` 与 `konva/skia-backend`;
  - `size-limit` 写的是 45 KB / 26 KB 上限，不是本轮测到的体积。

## Fabric.js

- canonical source：`https://github.com/fabricjs/fabric.js`
- revision：`ce64f450bad811750cb5a75aa749fc1502c644be`
- package：`fabric@7.4.0`
- provenance：
  - npm `latest` / `gitHead` 均为 `ce64f450...`
  - GitHub lightweight tag `v740` 指向同一提交（commit message：`prepare 7.4.0 release`）
  - `engines.node` 声明 `>=20.0.0`
- inspected：
  - `package.json`
  - `README.md`
  - `fabric.ts`
  - `src/constants.ts`
  - `src/config.ts`
  - `src/canvas/Canvas.ts`
  - `src/canvas/StaticCanvas.ts`
  - `src/canvas/StaticCanvasOptions.ts`
  - `src/canvas/CanvasOptions.ts`
  - `src/canvas/DOMManagers/CanvasDOMManager.ts`
  - `src/shapes/Object/FabricObject.ts`
  - `src/shapes/Object/Object.ts`
  - `src/shapes/Object/defaultValues.ts`
  - `src/shapes/Rect.ts`
  - `src/shapes/Image.ts`
  - `src/shapes/IText/IText.ts`
  - `src/util/animation/animate.ts`
- observed：
  - 公开入口是 named ESM：`Canvas`、`StaticCanvas`、`Rect`、`IText`、`Textbox`、`FabricObject`、`FabricImage`、`FabricText`;
  - `fabric.Object` / `fabric.Image` / `fabric.Text` 因与 Web API 撞名，分别改名为 `FabricObject` / `FabricImage` / `FabricText`（旧名仍作 deprecated alias）;
  - `Canvas` 用 `CanvasDOMManager` 叠 `lower-canvas` + `upper-canvas`；`StaticCanvas` 只有 lower，无选择交互;
  - `FabricObject` 默认 `originX/originY` 为 `center`，`objectCaching` 为 true，变换字段是 `left/top/scaleX/scaleY/angle/skewX/skewY`;
  - `loadFromJSON` 返回 Promise，加载期间临时关闭 `renderOnAddRemove`；官方示例结束后再 `requestRenderAll()`;
  - `FabricImage.fromURL(url, { crossOrigin, signal }, imageOptions)` 返回 Promise，不是 v5 callback;
  - `object.animate({ left })` 只改属性；源码注释要求在 `onChange` 里自己调 `canvas.renderAll()`，默认不会刷屏;
  - `renderOnAddRemove` 默认 true，实际走 `requestRenderAll()`（rAF 合并）；`skipOffscreen` 默认 true;
  - `perPixelTargetFind` 默认 false；Node 可选依赖是 `canvas` 与 `jsdom`。
