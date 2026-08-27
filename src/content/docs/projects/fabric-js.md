---
title: Fabric.js — 给 Canvas 加一层"对象模型"，让画布图形可以拖
来源: https://github.com/fabricjs/fabric.js
日期: 2026-05-30
分类: projects / Canvas 2D
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/fabricjs/fabric.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ce64f450bad811750cb5a75aa749fc1502c644be
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.4.0
---

## 是什么

Fabric.js 是一个把 HTML5 `<canvas>` 包成可选择、可变换、可序列化对象集合的 JavaScript 库。日常类比：原生 Canvas 像粉笔字——写完只剩像素；Fabric 像磁贴——每张磁贴记得自己的几何和变换。

你写：

```js
import { Canvas, Rect } from "fabric";

const canvas = new Canvas("c");
canvas.add(new Rect({ left: 100, top: 100, width: 80, height: 60, fill: "orange" }));
```

7.4.0 的公开入口是 named ESM，不再把 `fabric.Canvas` 当唯一合同。`Canvas` 会叠 lower / upper 两张画布；`Rect` 默认 `originX/originY` 是 `center`，所以上面的 `left/top` 指中心点，不是左上角。本轮只读源码，未渲染页面，状态保持 `UNVERIFIED`。

## 为什么重要

不理解 Fabric 7.4.0，下面这些事都没法解释：

- 为什么选择框能在拖动时单独重绘，而对象画在另一张 canvas
- 为什么 `left/top` 不再默认等于包围盒左上角
- 为什么 `loadFromJSON` 和 `FabricImage.fromURL` 都返回 Promise
- 为什么 `object.animate()` 改了数字却可能看不见运动

## 核心要点

7.4.0 主链可以拆成四步：

1. **Canvas vs StaticCanvas**：`StaticCanvas` 只有 lower canvas，负责对象列表和导出。交互版 `Canvas` 用 `CanvasDOMManager` 再叠一张 `upper-canvas`，专门画控件和选择框。

2. **对象模型**：形状继承 `FabricObject`（旧名 `fabric.Object` 因与 JS `Object` 撞名而改）。默认存 `left/top/width/height/scaleX/scaleY/angle/skewX/skewY`，`originX/originY` 默认 `center`，`objectCaching` 默认 true。

3. **序列化**：`canvas.toJSON()` 等于 `toObject()`。`loadFromJSON` 返回 Promise，加载期间临时关闭 `renderOnAddRemove`，官方示例在 `.then` 里再 `requestRenderAll()`。

4. **重绘**：`renderOnAddRemove` 默认 true，实际调用 `requestRenderAll()`，用 rAF 合并。立即绘制用 `renderAll()`。`skipOffscreen` 默认 true，按 viewport 跳过完全在画外的对象。

`FabricImage.fromURL(url, { crossOrigin, signal }, imageOptions)` 返回 Promise。`IText` 和 `Textbox` 仍在公开导出里。Node 声明 `>=20`，可选依赖是 `canvas` 与 `jsdom`。

## 实践示例

### 案例 1：最小可编辑舞台

```js
import { Canvas, Rect, IText } from "fabric";

const canvas = new Canvas("c");
canvas.add(new Rect({ left: 120, top: 80, width: 120, height: 80, fill: "#f5a55f" }));
canvas.add(new IText("双击编辑", { left: 300, top: 200, fontSize: 32 }));
canvas.on("object:modified", (e) => console.log(e.target.toObject()));
```

`Canvas` 默认打开选择和变换控件。因为 origin 默认是中心，`left: 120, top: 80` 的矩形中心在 (120, 80)。本轮未在浏览器点选。

### 案例 2：JSON 往返是 Promise

```js
const json = canvas.toJSON();
await canvas.loadFromJSON(json);
canvas.requestRenderAll();
```

不要再写 `loadFromJSON(data, () => canvas.renderAll())` 当唯一签名。7.4.0 文档示例是 `loadFromJSON(json).then((canvas) => canvas.requestRenderAll())`。第二个参数是 reviver，不是“加载完成回调”。

### 案例 3：动画不会自己刷屏

```js
rect.animate({ left: 400 }, {
  duration: 1000,
  onChange: () => canvas.renderAll()
});
```

`animate()` 只改属性。`src/util/animation/animate.ts` 的注释要求在 rAF 回调里调 `renderAll()`，不要再叠一层 `requestRenderAll()`。旧写法 `obj.animate("left", 500)` 不是 7.4.0 签名。

## 踩过的坑

1. **把默认原点当成左上角**：`fabricObjectDefaultValues.originX/originY` 是 `center`。照抄 v5 教程的 `left/top` 会对不齐。

2. **继续用 v5 `fromURL(url, callback)`**：7.4.0 是 `await FabricImage.fromURL(url, { crossOrigin: "anonymous" })`。跨域导出仍要图床回 CORS；本轮未发网络请求。

3. **`animate` 后以为画布会动**：属性在变，默认不渲染。要在 `onChange` 里 `renderAll()`。

4. **命名空间与 Web API 撞名**：公开迁移路径是 `FabricObject` / `FabricImage` / `FabricText`。`import { Object, Image, Text } from "fabric"` 仍在，但标 deprecated。

5. **把 `perPixelTargetFind` 当默认**：默认 false，命中按包围盒。像素级命中要显式打开；代价未在本轮测量。

## 适用 vs 不适用场景

**适用**：

- 浏览器里的海报 / 标注 / 简单设计工具，需要选择框和 JSON 存档
- 接受命令式对象 API，并按 7.x named export 重写旧 `fabric.*` 教程
- Node 20+ 上配合可选 `canvas` / `jsdom` 做导出

**不适用**：

- 只要分层 scene graph、官方 React reconciler → 看 [[konva]]
- 万级精灵 / WebGL 批处理 → 看 [[pixi]]，不在本页范围
- 纯展示图表，不需要选择与序列化
- 仍把 v5 callback 和左上角 origin 当当前合同的代码库，需先改调用面

## 固定版本边界

- 本文绑定 `fabricjs/fabric.js@ce64f450...`，npm `7.4.0` 与 GitHub tag `v740` 指向同一提交。
- `engines.node` 为 `>=20.0.0`；浏览器入口是 `dist/index.min.mjs`。
- 默认 `origin` 为 center、`objectCaching` true、`renderOnAddRemove` true、`skipOffscreen` true。
- 本文未安装依赖、运行 vitest / Playwright、导出 PNG 或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **对象模型把无状态 canvas 变成可编辑层**——存的是原始几何加变换，不是最终像素。
2. **双 canvas 是选择交互的实现，不是装饰**——lower 画对象，upper 画控件。
3. **7.x 的异步边界是 Promise**——`fromURL` 和 `loadFromJSON` 都不再靠“第二个参数一定是完成回调”。
4. **默认原点改了，教程不会跟着改**——`center` 会让所有旧 `left/top` 例子偏一截。

## 应用型自测

1. `new Rect({ left: 0, top: 0, width: 100, height: 50 })` 的左上角在 (0, 0) 吗？
2. `canvas.loadFromJSON(json, () => canvas.renderAll())` 里的函数，在 7.4.0 是“全部加载完”的回调吗？
3. `rect.animate({ left: 200 })` 之后，画布一定立刻看到移动吗？

检查点：

1. 默认不是。origin 在中心，左上角大约在 (-50, -25)。
2. 不是。第二参数是 reviver；完成信号是返回的 Promise。
3. 不一定。必须自己在 `onChange` 里渲染。

## 延伸阅读

- 仓库与 7.x 文档：[github.com/fabricjs/fabric.js](https://github.com/fabricjs/fabric.js)
- 固定源码：本文绑定提交 `ce64f450bad811750cb5a75aa749fc1502c644be`
- 对照：[Konva](https://github.com/konvajs/konva) 的显式 Layer，[Paper.js](https://github.com/paperjs/paper.js) 的 Item 树
- [[konva]] —— 多 canvas 节点树，官方 React 包装在另一仓库
- [[pixi]] —— WebGL 2D，不提供这套编辑器对象合同

## 关联

- [[konva]] —— 同领域的 scene graph；Layer 是性能边界
- [[excalidraw]] —— 自研画布模型，不依赖 Fabric
- [[d3]] —— 数据驱动 SVG，不是对象编辑器
- [[prosemirror]] —— 文档对象模型，对照“自管模型和渲染”

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[konva]] —— Konva — 给 HTML5 Canvas 装一棵会响应的节点树
- [[piskel]] —— Piskel — Web 像素艺术编辑器
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
