---
title: Konva — 给 HTML5 Canvas 装一棵会响应的节点树
来源: 'https://github.com/konvajs/konva'
日期: 2026-05-30
分类: projects / Canvas 2D
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/konvajs/konva
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 005356e261367c2485c70149ffc0570e16ee64f4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.3.2
---

## 是什么

Konva 是一个在 HTML5 Canvas 上重建对象模型的 JavaScript 框架。日常类比：原生 Canvas 是一块一次性白板——你画了红方块就只剩像素；Konva 给这块白板配了一份花名册，每个图形都有事件、变换和命中检测。

你写：

```js
import Konva from "konva";

const stage = new Konva.Stage({ container: "app", width: 800, height: 600 });
const layer = new Konva.Layer();
const rect = new Konva.Rect({
  x: 10, y: 10, width: 100, height: 100, fill: "red", draggable: true
});
layer.add(rect);
stage.add(layer);
rect.on("click", () => console.log("点中了"));
```

`Stage` 接管一个 DOM 容器；`Layer` 是真正的 `<canvas>`。固定 10.3.2 默认 `Konva.autoDrawEnabled = true`，属性变化会排进下一帧 `batchDraw()`。本轮只读源码，未渲染页面，状态保持 `UNVERIFIED`。

## 为什么重要

不理解 Konva，下面这些事都没法解释：

- 为什么点击、拖拽和变换必须先有节点树，而不是直接操作像素
- 为什么“Layer = 一块独立 canvas”决定了谁会被重绘
- 为什么关掉 `listening` 能少画一张 hit canvas
- 为什么 `konva/lib/Core` 里没有 `Rect`，而默认入口有

## 核心要点

Konva 10.3.2 可以拆成四层：

1. **Stage**：构造时清空 container，再挂 `div.konvajs-content`。它监听 mouse / touch / pointer，把坐标换算进舞台，再向子层做命中。

2. **Layer**：每个 Layer 自带 `SceneCanvas` 和 `HitCanvas`。`clearBeforeDraw` 默认 true。非 listening 层会把 hit canvas 释成 0×0，不再读像素。

3. **Group**：只做逻辑分组。`Group` 只能再收 Group 或 Shape，自己没有 canvas。

4. **Shape**：叶子节点。构造时分配唯一 `colorKey`，hit 图用这块纯色；`getIntersection` 读 1×1 `getImageData`，必要时绕抗锯齿像素螺旋搜索。

`FastLayer` 已 deprecated：构造函数强制 `listening(false)` 并警告改用 `new Konva.Layer({ listening: false })`。`hitGraphEnabled()` 同样 deprecated，改走 `listening()`。

完整入口 `_FullInternals` 才注入 `Rect` / `Transformer` / `Filters`。`konva/lib/Core` 只有节点树、拖拽和动画。Node 端要另装可选 peer `canvas` 或 `skia-canvas`，再 import `konva/canvas-backend` 或 `konva/skia-backend`。

## 实践示例

### 案例 1：选中后挂 Transformer

```js
const layer = new Konva.Layer();
stage.add(layer);
const rect = new Konva.Rect({
  x: 50, y: 50, width: 100, height: 100, fill: "#3b82f6", draggable: true
});
const tr = new Konva.Transformer();
layer.add(rect, tr);
rect.on("click", () => tr.nodes([rect]));
stage.on("click", (e) => { if (e.target === stage) tr.nodes([]); });
```

`Transformer` 是 Group，默认 8 个 resize 锚点加旋转把手。`nodes([shape])` 是当前 API；`setNode` / `attachTo` 已标 deprecated。本轮未点选验证。

### 案例 2：背景层关掉 listening

```js
const bgLayer = new Konva.Layer({ listening: false });
const mainLayer = new Konva.Layer();
stage.add(bgLayer, mainLayer);
bgLayer.add(grid);
```

`listening: false` 让 hit canvas 保持 0×0。`FastLayer` 不再是推荐写法。官方文档常建议少开 Layer，但 10.3.2 源码没有写死“最多 5 层”。

### 案例 3：滤镜必须先 cache

```js
rect.cache();
rect.filters([Konva.Filters.Blur]);
rect.blurRadius(8);
```

10.3.2 的滤镜走 cache 画布。非 cache 路径里，CSS filter 调用被注释成 skip。没 `cache()` 就挂 `Konva.Filters.*`，静态阅读看不到绘制。文本 cache 后的抗锯齿变化本轮未测。

## 踩过的坑

1. **把 size-limit 写成当前体积**：`package.json` 给 `lib/index.js` 的上限是 45 KB、`lib/Core.js` 是 26 KB。本轮未跑 `size-limit`，不能当验收数字。

2. **继续用 FastLayer / hitGraphEnabled**：两者都在 10.3.2 标 deprecated。等效写法是 `new Konva.Layer({ listening: false })`。

3. **以为 touch 只是假鼠标**：`Stage` 同时绑 mouse、touch 和 pointer。手势算法仍要自己写；本轮未在真机核对多指。

4. **把 react-konva 写进本页合同**：`react-konva` 是另一个仓库。本文只绑定 `konvajs/konva@005356e2`，未读 reconciler。

5. **关掉 autoDraw 后还等自动刷新**：`Konva.autoDrawEnabled` 默认 true。设成 false 后必须自己 `layer.draw()` 或 `batchDraw()`。

## 适用 vs 不适用场景

**适用**：

- 需要节点事件、拖拽和 Transformer 的编辑器 / 白板 / 标注
- 要把不动背景和高频层拆到不同 `<canvas>`
- 浏览器为主，偶尔用 `canvas` / `skia-canvas` 做 Node 导出

**不适用**：

- 只要像素、不要对象模型 → 原生 Canvas 或更轻的绘制库
- WebGL / 游戏级批处理 → 看 [[pixi]]，不在本页范围
- 默认就要变换框且接受单画布对象列表 → 看 [[fabric-js]]
- 把 React 组件树当合同 → 需要另读 `react-konva`

## 固定版本边界

- 本文绑定 `konvajs/konva@005356e2...`，npm / GitHub tag 均为 `10.3.2`。
- 默认导出是完整 namespace；`konva/lib/Core` 不含形状和滤镜。
- `autoDrawEnabled` 默认 true，`dragDistance` 默认 3，`angleDeg` 默认 true，`dragButtons` 默认 `[0, 1]`。
- 本文未安装依赖、运行 mocha、渲染 Stage 或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **对象模型是交互 Canvas 的前置条件**——没有节点，就没有事件、拖拽和选中。
2. **Layer 既是性能边界也是命中边界**——scene 和 hit 是两张画布；`listening: false` 直接丢掉后者。
3. **自动重绘是默认策略，不是魔法**——`autoDrawEnabled` 把属性变化收进 `batchDraw()`。
4. **Core 和 Full 不是同一份合同**——最小入口没有 `Rect`，完整入口才有 Transformer 和 Filters。

## 应用型自测

1. `new Konva.FastLayer()` 在 10.3.2 还是官方推荐的背景层写法吗？
2. 给 `Rect` 设 `filters([Konva.Filters.Blur])` 但不调用 `cache()`，源码保证滤镜会画出来吗？
3. `import Konva from "konva/lib/Core"` 之后，`new Konva.Rect()` 一定可用吗？

检查点：

1. 不是。`FastLayer` 已 deprecated，应使用 `Layer({ listening: false })`。
2. 不保证。10.3.2 非 cache 路径跳过滤镜。
3. 不一定。Core 没有注入形状；要另 import `konva/lib/shapes/Rect`。

## 延伸阅读

- 文档：[konvajs.org](https://konvajs.org)
- 固定源码：[konvajs/konva](https://github.com/konvajs/konva) —— 本文绑定提交 `005356e261367c2485c70149ffc0570e16ee64f4`
- Node 后端：`konva/canvas-backend`、`konva/skia-backend`
- [[fabric-js]] —— 单组 lower/upper canvas 的对象编辑器模型
- [[pixi]] —— WebGL 2D 渲染，不在本页合同内

## 关联

- [[fabric-js]] —— 同为 Canvas 2D 对象模型，默认双 canvas 选择层
- [[pixi]] —— GPU 批处理路线，命题不同
- [[excalidraw]] —— 自研场景模型，不依赖 Konva
- [[d3]] —— SVG / 数据驱动，节点数量上来后常被拿来对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[melonjs]] —— melonJS — 轻量 JS 2D 游戏引擎
- [[piskel]] —— Piskel — Web 像素艺术编辑器
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
