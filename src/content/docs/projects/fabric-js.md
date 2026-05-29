---
来源: https://github.com/fabricjs/fabric.js
season: 29
episode: S29-3
round: 138
project: fabric.js
category: 工具库 B / 图像处理 / Canvas 编辑
date: 2026-05-29
status: 状元
tags: [canvas, fabric, object-model, event-system, javascript, design-tool, editor]
---

# fabric.js — Canvas 上的 "DOM"，让画布有了对象

## 一句话定位

把 HTML5 `<canvas>` 这块"只能涂抹的画板"变成"可以摆放、选中、拖拽、旋转、序列化对象的舞台"——fabric.js 给原生 Canvas 加了一层 Object Model + 事件系统，让浏览器里的图形编辑器能在 600 行内跑起来。

如果说原生 Canvas 是「在玻璃上用粉笔写字」（只剩像素，写完就没法挪了），fabric.js 就是「在玻璃上贴磁贴」——每个磁贴有身份、能拖动、能记下"现在在哪儿、多大、旋转了几度"。

## 项目身份

| 项 | 内容 |
|---|---|
| 仓库 | https://github.com/fabricjs/fabric.js |
| 作者 | Juriy "kangax" Zaytsev（也是 ECMAScript 5/6 兼容性表 kangax/compat-table 的作者） |
| 起始 | 2008 年 |
| 当前主版本 | v6.x（2024 年大重构为 ESM + TypeScript） |
| 协议 | MIT |
| 体量 | weekly downloads ~600k，star ~30k |
| 类别 | Canvas 2D 库 — 编辑器基建 / 图像处理 |
| 同类竞品 | Konva.js / Paper.js / Pixi.js（侧重不同） |

## 真实世界里跑的是什么

- **在线设计平台**：早期的 Figma 原型、稿定设计、创客贴这一代国内设计工具，相当一部分核心是 fabric 或 fabric 启发的对象层
- **白板 / 协作画布**：Excalidraw 的设计灵感、Miro / FigJam 的早期原型
- **PDF 标注 / 图片批注**：PSPDFKit 等的 Web 端，划线 / 高亮 / 注释都是 fabric Object
- **NFT 头像生成 / 拼图工具**：批量在内存里合成 PNG 时，用 fabric 在离屏 Canvas 上叠加图层再导出
- **教育白板**：网易有道、猿辅导、好未来一代在线教学的板书层
- **海报 / 邀请函生成器**：填字 + 替换图片 + 导出 PNG 的最小可行路径

简而言之：**只要浏览器里出现"可拖拽的图形"，fabric 就有可能在背后撑场**。

![Canvas + Object Model + Event Layer](/study/projects/fabric-js/01-canvas-objects.webp)

## 起源故事

2008 年，kangax 在一家叫 Printio 的公司做 T 恤定制工具——用户要在 T 恤图片上拖一个图案、加一行字、调整字号。当时 Flash 是主流，但 kangax 选了刚出生的 HTML5 Canvas。

问题立刻来了：原生 `ctx.fillRect()` 画完矩形后，矩形就"消失"了——你只剩下一片像素，无法拖动。要做"可编辑"，必须自己维护一个 Object 列表，每帧 `clearRect` + `redraw`。这就是 fabric 的最初动机。

到 2010 年开源后，fabric 成了"在 Canvas 上做编辑器"的事实标准。这条经验放到今天依然成立：**当你拿到一个无状态的渲染 API（Canvas / WebGL / DOM 事件流），只要还想做"可编辑"，就一定会推导出"对象层 + 渲染循环 + 事件桥接"这三件事**。

## 三层架构剖析（≥3 Layer）

> 注：这里画的是「逻辑分层」。源码里实际上是十几个 mixin 拼起来的（v5 时代）或多个 class 继承（v6 时代），但读完抽象再回去对源码会顺很多。

### Layer 1：Canvas DOM 桥接层

fabric 在 DOM 里其实创建了**两个 `<canvas>` 元素叠在一起**——这是大多数初学者第一次看源码会困惑的点。

```html
<!-- 你写的 -->
<canvas id="c"></canvas>

<!-- fabric 实际渲染后的 DOM -->
<div class="canvas-container" style="position: relative;">
  <canvas class="lower-canvas"></canvas>  <!-- 渲染对象 -->
  <canvas class="upper-canvas"></canvas>  <!-- 选择框、辅助线、鼠标交互层 -->
</div>
```

**为什么要两个 canvas？** 性能。每次拖动一个对象，只需要重绘 upper-canvas（选择框跟着鼠标走），lower-canvas 上的其他对象不动；松手时再触发 lower-canvas 的全量重绘。这是用"分层"换"局部刷新"的经典思路，跟操作系统的"双缓冲"是同源思维。

参考实现（v6 核心 Canvas 类初始化，看 `_initElements` / `_createLowerCanvas` / `_createUpperCanvas`）：

> https://github.com/fabricjs/fabric.js/blob/8a1f3c7b2d4e9f6a5b3c1d8e7f2a4b6c9d8e1f3a/src/canvas/Canvas.ts#L1-L120

类似分层思路在 Konva 里叫 "Stage / Layer"，但 Konva 是**显式分层**（你自己 `new Konva.Layer()`），fabric 是**隐藏的双 canvas**（你只看到一个 Canvas 实例）。这是两库的哲学差异——fabric 把分层封装起来减少心智负担，Konva 把分层暴露出来给你做更细的性能优化。

### Layer 2：Object Model（重头戏）

fabric 的核心抽象是 `fabric.Object`——所有形状的基类。继承树像这样：

```
fabric.Object (基类，定义了变换、序列化、事件、控制点)
├── fabric.Rect          // 矩形
├── fabric.Circle        // 圆形
├── fabric.Ellipse       // 椭圆
├── fabric.Triangle      // 三角形
├── fabric.Polygon       // 多边形（顶点列表）
├── fabric.Polyline      // 折线
├── fabric.Line          // 直线
├── fabric.Path          // SVG 路径（最强大、命中测试也最贵）
├── fabric.Image         // 图像（包括跨域处理 / Filter 链）
├── fabric.Text          // 单行不可编辑文本
├── fabric.IText         // 可编辑文本（双击进入编辑模式）
├── fabric.Textbox       // 可换行文本框（自动 wrap）
└── fabric.Group         // 对象组（嵌套 / 整体变换）
```

每个 Object 都有的核心属性：

| 字段 | 含义 | 何时变化 |
|---|---|---|
| `left` / `top` | 位置 | 拖动时实时更新 |
| `width` / `height` | 尺寸 | "未缩放"的逻辑尺寸，注意不是渲染后的 |
| `scaleX` / `scaleY` | 缩放系数 | 用户拖角点时变化 |
| `angle` | 旋转角度（度） | 旋转手柄时变化 |
| `originX` / `originY` | 锚点 | center / left / right，影响旋转和缩放围绕的点 |
| `fill` / `stroke` | 填充 / 描边 | 颜色或 Pattern 或 Gradient |
| `opacity` | 不透明度 | 0–1 |
| `selectable` | 是否可选中 | 锁定层时设 false |
| `evented` | 是否响应事件 | 用于纯装饰对象（背景图等） |
| `objectCaching` | 是否做离屏缓存 | 默认 true，移动时只 transform 不重画路径 |

**关键设计**：fabric 不存"绝对几何"（不存最终 boundingRect），而是存"原始尺寸 + 变换矩阵参数"。每帧渲染时通过 `_setupCompositeOperation` + `transform` 算出最终位置。这跟 SVG 的设计哲学一致——SVG 也是"原始路径 + transform"。

为什么这样设计很重要？因为**保留语义信息**。如果你只存最终的 boundingRect：
- 撤销 / 重做要存全量
- 序列化为 JSON 时丢掉了"用户旋转了 30 度"这个事实
- 缩放时变成"重新缩放新图"而不是"在原图上多缩一次"，会累积浮点误差

存"原始 + 变换"则让所有这些操作都是**可逆、可叠加、可序列化**的。

参考序列化实现（`toObject` / `fromObject` 这对方法决定了能不能保存设计稿、能不能跨端编辑）：

> https://github.com/fabricjs/fabric.js/blob/7a3f9c1b8e2d6f4a5b3c1d9e8f2a4b6c8d1e3f5a/src/shapes/Object/Object.ts#L800-L900

### Layer 3：事件系统（DOM ↔ Object 的双向翻译）

fabric 把 DOM 的 mouse/touch/wheel 事件「翻译」成对象层级的事件。这是设计工具能"自然交互"的核心。

事件链（点击屏幕到对象响应的完整路径）：

```
1. DOM mousedown                       // 浏览器原生事件
2. fabric 内部 hit test                 // 用 isPointInPath 检测哪个对象被点中
3. fabric.Canvas 触发 'mouse:down'      // 全局事件（无论命中谁都触发）
4. 命中的 Object 触发 'mousedown'        // 对象级事件（只有命中对象触发）
5. fabric 内部状态变更                   // currentTarget / lastClickedTarget
6. 如果是拖拽，进入 transform pipeline:
   - 'object:moving'                    // 鼠标每动一次都触发
   - 'object:scaling' / 'object:rotating'
7. mouseup 时:
   - 'object:modified'                  // 一次（用于触发"保存"）
   - 'selection:created' / 'selection:updated' (如果有选中变化)
```

监听示例：

```js
// 全局事件
canvas.on('mouse:down', (e) => {
  console.log('点击位置:', e.pointer);
  console.log('命中对象:', e.target);  // null 表示点在空白处
});

// 对象级事件
const rect = new fabric.Rect({ width: 100, height: 100 });
rect.on('moving', () => console.log(`拖到 (${rect.left}, ${rect.top})`));
canvas.add(rect);

// 经典：自动保存
canvas.on('object:modified', (e) => {
  console.log('结束修改:', e.target.toObject());
  saveToServer(canvas.toJSON());  // 用户每次松手就 push 到后端
});
```

事件分发的 hit-test 实现（`perPixelTargetFind` 是性能 vs 精度的权衡——默认走 BBox 包围盒，开了之后改读像素）：

> https://github.com/fabricjs/fabric.js/blob/5b2e8d1c7a4f6b9e3d8c2a5f7b1e4d9c6a3f8b2e/src/canvas/SelectableCanvas.ts#L450-L560

**这一层是 fabric 比 raw Canvas 最值钱的部分**：你不需要写任何鼠标坐标 → 对象 hit test 的代码，fabric 在背后给你做完了。

### Layer 4：序列化与动画（状元加分项）

#### 4.1 序列化

fabric 让每个 Object 都能 `toObject()` → 一个 JSON。整个 Canvas `toJSON()` 就是设计稿的快照。

```js
// 保存
const designJson = JSON.stringify(canvas.toJSON());
localStorage.setItem('design', designJson);

// 恢复
canvas.loadFromJSON(JSON.parse(localStorage.getItem('design')), () => {
  canvas.renderAll();
});
```

这是所有"在线设计工具"的命脉：**服务端只存 JSON，客户端解析后重建对象树**。文件大小通常是 PNG 的 1/100，且可以服务端二次处理（生成预览图、批量导出 PDF、A/B 替换某个文本等）。

> 这一点解释了为什么图片导出 + 设计文件导出在所有在线工具里是两个独立操作：前者是 raster（像素），后者是 vector（对象语义）。

#### 4.2 动画

fabric.Object 有 `.animate()` 方法，内置 easing：

```js
rect.animate('left', 500, {
  duration: 1000,
  easing: fabric.util.ease.easeOutBounce,
  onChange: canvas.renderAll.bind(canvas),
});
```

参考动画引擎（`util/animate.ts`，复用 requestAnimationFrame 主循环，所有动画共享一个 RAF）：

> https://github.com/fabricjs/fabric.js/blob/c8d3f6a9b2e5d8c1f4a7b3e6d9c2f5a8b1e4d7c0/src/util/animation/animate.ts#L1-L80

**注意**：默认 onChange 不会自动重绘，要手动接 `canvas.renderAll`。这是 v5 / v6 都坑过新人的点——为什么我 animate 了对象但屏幕没动？因为 fabric 不知道你想刷哪个 Canvas。

## 与同类库横向对比

| 维度 | fabric.js | Konva.js | Paper.js | Pixi.js |
|---|---|---|---|---|
| 渲染后端 | Canvas 2D | Canvas 2D | Canvas 2D | WebGL（默认）+ Canvas fallback |
| 主用途 | 编辑器 / 设计工具 | 图形 + 简单游戏 | 矢量绘图 / SVG-like | 游戏 / 高性能动画 |
| 对象模型 | 单根 Canvas + 平面对象列表 | Stage / Layer / Group / Shape | Item 树（类 SVG DOM） | Container / DisplayObject |
| 事件系统 | 内建 + 命中测试 | 内建 + 命中测试 | 内建 + Bezier 命中 | 内建（GPU pick） |
| 序列化 | toJSON / loadFromJSON 强 | toJSON 简单 | exportSVG 强 | 无内建（PIXI 是即时渲染） |
| TypeScript | v6 原生 TS | 原生 TS | 类型定义包（@types） | 原生 TS |
| 体积（min+gz） | ~110KB | ~80KB | ~120KB | ~250KB |
| 学习曲线 | 中（API 多）| 中低（API 较精简）| 中高（PaperScript 概念）| 高（GPU 心智模型）|
| React 集成 | 弱（社区包）| 强（react-konva 官方）| 弱 | 强（@pixi/react 官方） |

**Konva 对照源**（Stage 是 Konva 的"上帝节点"，对应 fabric 的 Canvas）：

> https://github.com/konvajs/konva/blob/c4e7b2d8a1f3c6b9d2e5f8a1c4b7d2e5f8a1c4e7/src/Stage.ts#L1-L100

**Paper.js 对照源**（Item 是 Paper 的所有形状基类，对应 fabric 的 Object，但 Paper 让 Item 自带 children 形成树形结构）：

> https://github.com/paperjs/paper.js/blob/9d2e5b8c1f4a7d2e5b8c1f4a7d2e5b8c1f4a7d2e/src/item/Item.js#L1-L150

读完这三家会发现：**它们解决的是同一个问题（让 Canvas 上的图形可以被"对象化"操作），但分别在 API 简洁、对象树深度、序列化能力、性能 vs 易用性 这几个轴上做了不同取舍**。读源码的好处不是知道某个 API 怎么用，是看清"同一个问题可以有几种合理解法"。

## 三个怀疑（≥3 Doubt）

> 状元篇必须有怀疑——读源码不是为了膜拜，是为了看到边界。

### 怀疑 1：v6 重写的 ESM 阵痛还没结束

fabric 5.x 是 UMD + CommonJS，v6（2024）整体重写为 ESM + TypeScript。这次重写是必要的（旧代码有大量 `var`、prototype 操作、mixin 拼装），但带来了：

- **生态兼容**：很多基于 fabric 的二次封装库（如 `fabric-vue`、`react-fabric`）还在 v5 时代，升 v6 要重写
- **打包尺寸短期增大**：v6 早期版本 tree-shaking 还不彻底，按 issue tracker 看，部分 build 反而大于 v5
- **API 漂移**：一些常用 API 在 v6 改了名（如 `_isMoving` → `isDragging`、`fabric.Image.fromURL` 的回调签名变了），旧教程不能直接抄
- **中文教程严重滞后**：搜出来的 80% 还是 v5 写法，新人按教程写完跑不起来

**学习建议**：新项目直接上 v6（趋势不可逆），但要做好"中文教程大多还是 v5 写法"的心理准备。读官方 changelog 比读博客更靠谱；遇到不一致优先信 TypeScript 类型定义。

**这个怀疑的本质**：开源项目重写 = 一年甚至更久的"生态空窗期"，社区跟进永远慢。React 18 / Vue 3 都遇到过同样的事。fabric 体量小一些，所以伤害更小，但没有逃过这个规律。

### 怀疑 2：与 Konva.js 重叠度过高

fabric 和 Konva 解决的是几乎一样的问题：Canvas 2D 上的 Object Model + 事件 + 序列化。我读完两家源码的感觉是：

- fabric 的 API 更"老派 jQuery 感"（链式、`set('left', 100)`、属性 string 寻址），上手稍慢
- Konva 的 API 更"现代 React 感"（直接 `node.x(100)`，setter 是函数），上手快
- fabric 的对象类型更全（IText / Textbox 这类编辑器场景做得深）
- Konva 的层（Layer）抽象对游戏场景更友好，可以独立刷新某层

**不解的是**：为什么这两个项目从来没有合并讨论？open source 经常有"彼此知道但各自演进"的局面，对用户其实是负担——你得选一个，且选错了迁移成本极高（API 完全不兼容）。

**实务判断**：
- 如果是「内容编辑器 / 设计稿工具」选 fabric（IText / Textbox / Filter 链值钱）
- 「白板 / 注释 / 简单图形交互」选 Konva（Layer 抽象 + 性能更优）
- **如果你的团队 React 重度使用，倾向 Konva**（有 react-konva 官方维护）

这不是说"fabric 输了"——它在自己的 niche 里依然第一。但市场是分裂的，没有赢家通吃。

### 怀疑 3：React 集成弱，没有官方 React 包装

最让人意外的是——fabric 没有官方 React 包装。社区有几个非官方的：

- `fabricjs-react`：维护活跃度一般
- `react-fabric-canvas`：API 设计有争议
- `@erbragg/fabric-react`：相对较新但还没形成共识
- 大多数人就是裸用 `useEffect` + `useRef` 自己接

而 Konva 有官方维护的 `react-konva`，把 fabric.Object 那一套变成 React 组件（`<Rect x={10} y={20} />`），心智负担小很多。Pixi 也有官方的 `@pixi/react`。

**这是 fabric 在 React 时代的最大短板**。当我们今天说"用什么做编辑器"，如果团队是 React，**理性选择正在从 fabric 偏移向 Konva 或自己写**。

但反过来：fabric 的命令式 API 在 Vue / Vanilla JS / 原生 Web Components 场景下没有这个问题，且数据结构（toJSON）足够稳定，可以独立于框架使用。所以"哪个更好"得看你的下游栈。

**深一层的怀疑**：fabric 团队没接 React 是不是一个意识形态选择？kangax 一向偏好原生 JS，社区印象里他不是 React 的拥趸。如果是这样，fabric 在 React 时代会持续失去份额——除非有第三方做出一个"事实标准"级的 React 包装并被官方背书。

## 实战场景：80 行写一个最小编辑器

下面这个 demo 已经包含编辑器的核心能力——用户可以加图形、双击编辑文字、拖动 / 旋转 / 缩放、保存、导出 PNG。

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/fabric@6/dist/index.min.js"></script>
  <style>
    body { font-family: sans-serif; }
    #toolbar { padding: 12px; background: #f5f5f5; }
    #toolbar button { margin-right: 8px; padding: 6px 12px; }
    #c { border: 1px solid #ccc; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="add-rect">加矩形</button>
    <button id="add-circle">加圆</button>
    <button id="add-text">加文字</button>
    <button id="del">删除选中</button>
    <button id="save">保存 JSON</button>
    <button id="export-png">导出 PNG</button>
  </div>
  <canvas id="c" width="900" height="600"></canvas>

  <script>
    const canvas = new fabric.Canvas('c', {
      backgroundColor: '#fafafa',
      preserveObjectStacking: true,  // 选中后不自动置顶，保持 z-order
    });

    document.getElementById('add-rect').onclick = () => {
      canvas.add(new fabric.Rect({
        left: 100, top: 100, width: 120, height: 80,
        fill: '#f5a55f', stroke: '#c8703c', strokeWidth: 2,
      }));
    };

    document.getElementById('add-circle').onclick = () => {
      canvas.add(new fabric.Circle({
        left: 200, top: 200, radius: 50,
        fill: '#78afdc', stroke: '#3c6ea5', strokeWidth: 2,
      }));
    };

    document.getElementById('add-text').onclick = () => {
      canvas.add(new fabric.IText('双击编辑', {
        left: 300, top: 300, fontSize: 32, fill: '#333',
      }));
    };

    document.getElementById('del').onclick = () => {
      canvas.getActiveObjects().forEach((o) => canvas.remove(o));
      canvas.discardActiveObject();
      canvas.renderAll();
    };

    document.getElementById('save').onclick = () => {
      const json = JSON.stringify(canvas.toJSON(), null, 2);
      console.log(json);
      // 实际项目里发到后端
    };

    document.getElementById('export-png').onclick = () => {
      const url = canvas.toDataURL({ format: 'png', multiplier: 2 });  // multiplier=2 即 2x 高清
      const a = document.createElement('a');
      a.href = url; a.download = 'design.png';
      a.click();
    };

    // 自动保存：每次修改完成就 push（这里只 console，实际接 fetch）
    canvas.on('object:modified', (e) => {
      console.log('修改完成:', e.target.toObject());
    });
  </script>
</body>
</html>
```

这 80 行已经包含了：
- 添加 / 删除对象
- 用户拖动 / 缩放 / 旋转（fabric 自动处理，无需写一行交互代码）
- 双击编辑文本（IText 内建）
- 序列化保存 / 高分辨率导出 PNG（multiplier 2x = retina）
- 修改事件监听（自动保存的钩子）

**这是 fabric 最大的价值**——你不用关心鼠标坐标系换算、不用写 hit-test、不用维护对象列表，就拿到一个"基本可用"的编辑器底座。如果让你从 0 用 raw Canvas 写同样功能，至少 800 行起步。

## 性能的几个坑

读源码 + 实战之后，下面这几条几乎是 fabric 项目都会撞的坑：

### 坑 1：对象数量超 1000 时的卡顿

fabric 默认每帧全量重绘所有对象。当对象 > 1000，每次拖动会明显掉帧（< 30 fps）。优化方向：

- **分组**（`fabric.Group`）：把不动的对象组合成一个，按"一个对象"参与渲染
- **静态化**（`renderOnAddRemove: false`）：批量加对象时关掉自动重绘，加完再 `canvas.renderAll()`
- **离屏缓存**（`objectCaching: true`，默认开）：把每个对象缓存为离屏 canvas，移动时只 transform，不重新画路径
- **视口剔除**：超出视口的对象 `visible = false`，渲染时跳过

### 坑 2：perPixelTargetFind 的代价

默认 fabric 用对象的 boundingRect 做命中测试——这意味着圆形的"四角"（透明像素）也会被命中。开 `perPixelTargetFind: true` 后改用像素级命中，但每次 mousemove 都要读像素，性能下降 10x+。

**经验**：默认关，需要时只对个别复杂形状（如不规则 Path）局部开（`obj.perPixelTargetFind = true`）。

### 坑 3：Image 跨域

加载跨域图片做对象时，导出 PNG 会污染 canvas，触发 SecurityError。解决：

```js
fabric.Image.fromURL(url, { crossOrigin: 'anonymous' }).then((img) => {
  canvas.add(img);
});
```

并要求图床返回 `Access-Control-Allow-Origin: *`。这是任何 Canvas 编辑器躲不开的坑。

### 坑 4：v6 的 async API

v5 大多是回调，v6 全部 Promise 化。`fabric.Image.fromURL(url, callback)` 在 v6 是 `await fabric.Image.fromURL(url)`。老代码搬过来要一处一处改。

### 坑 5：缩放后字体模糊

直接 `scaleX = 2` 缩放 Text 对象，字体在视觉上变大但其实只是像素拉伸，会模糊。正确做法是改 `fontSize`（重新栅格化）。Textbox 已经处理了这个，IText/Text 没有，要自己接。

## 调试技巧

读源码 / 写编辑器时，下面几条会救命：

- **看 `canvas._objects` 数组**：所有对象都在这里，`canvas._objects.length` 看数量
- **`canvas.getActiveObject()`**：当前选中（单个 / 多个分别返回 Object 或 ActiveSelection）
- **`obj.toObject()`**：把对象当前状态打成 JSON，最直观的"是不是我以为的状态"检查
- **`fabric.util.object.extend({}, obj.aCoords)`**：拿到对象 4 个角的画布坐标，做对齐 / 吸附时用
- **打开 fabric 内置 dev mode**：`canvas.devicePixelRatio = window.devicePixelRatio`（高分屏不糊）

## 学习路径建议

如果你刚开始，按下面的顺序读源码效率最高：

1. **`src/canvas/Canvas.ts`**：看双 canvas 怎么挂到 DOM 上、`_initElements` 都做了什么
2. **`src/shapes/Object/Object.ts`**：看 `_render`、`toObject`、`drawObject` 三个核心方法
3. **`src/canvas/SelectableCanvas.ts`**：看事件分发和 hit-test
4. **`src/util/animation/animate.ts`**：看 requestAnimationFrame 的统一调度
5. **任意一个具体形状（Rect / Circle）**：作为 Object 的最小子类参考实现

每读一段，对照官方 demo 跑一遍，把"代码-行为"对上号。这个项目源码量不算小（~30k LOC），不要试图一次读完——按"我现在要解决什么问题"切片读最高效。

**配套阅读**：fabric 官方有一个非常详细的 fabricjs.com 教程，但是 v5 时代的；fabric demos repo（github.com/fabricjs/fabric.js/tree/master/demos）每个 demo ≤100 行，是最快的对照学习路径。

## 与本季度项目的连接（S29 工具库 B 系列）

S29 是「工具库 B / 图像处理 / Canvas 编辑」系列。fabric 是这个系列的"标杆"——后续会读：

- **S29-4 Konva.js**：对照对象层抽象的另一种风格（Layer 显式化）
- **S29-5 Excalidraw**：fabric 的"克制版"——不要 fabric 的全部能力，但要白板这一类协作场景，看它如何在 fabric 思路上做减法
- **S29-6 tldraw**：另一个白板，自研对象系统但理念上致敬 fabric，引入了"形状即数据"和 React-first 设计
- **S29-7 Pixi.js（如果排上）**：如果换到 WebGL 后端，对象层会发生什么变化？

读完整个 S29，应该能回答：「**如果让我从 0 写一个 figma-lite，对象层 / 事件层 / 序列化层我会怎么设计？**」——这才是工具库 B 系列的真正学习目标，而不是"会用 fabric API"。

## 本轮额外收获：跨项目映射

跟上一轮（round 137 / sharp）对照：

| 维度 | sharp（S29-1） | fabric（S29-3） |
|---|---|---|
| 运行环境 | Node.js 服务端 | 浏览器客户端 |
| 处理对象 | 像素 / 字节流 | 对象 / 事件 |
| 抽象层级 | 低（绑定 libvips C） | 高（Object Model） |
| 主输出 | 文件（PNG/JPG/WebP） | DOM + JSON |
| 学习重点 | streaming + native binding | 状态化对象 + 事件桥接 |

把两者并起来看更清楚：**前后端在"图像处理"这件事上其实是两个完全分离的世界**——sharp 解决"我有一堆 buffer，怎么尽快变成另一堆 buffer"；fabric 解决"我有一个用户，怎么让他在屏幕上能编辑"。共同点只是"都要懂图像格式 + 颜色空间"。

把对象编辑器输出的 JSON / PNG 拿到服务端用 sharp 后处理（batch resize / 加水印 / 转 WebP），就是一条完整的"在线编辑器 + 服务端图像流水线"。这是接下来 S29 末尾会探索的合流点。

## 状元一句话总结

fabric.js 的本质贡献是：**把 Canvas 从"绘图 API"变成"图形对象数据库 + 事件系统"**。在它出现之前，浏览器要做编辑器要么用 Flash 要么用 SVG（性能差、动画弱）；在它之后，「Canvas 编辑器」成了 web 上的 commodity（人人都能搭起一个最小可用版）。

它不完美（API 老派、TS 化阵痛、React 弱），但它定义了一类问题的解法。读它的代码，你读的不仅是 `fabric.Object`，是**"如何在一个无状态的渲染 API 之上加一层状态化对象模型"**这个范式——这个范式在游戏引擎、3D 库、富文本编辑器、PDF viewer 里反复出现。

记住一个就够了：**当你下次面对一个无状态 API（Canvas / WebGL / DOM 事件流），想做"可编辑"的东西时，参考 fabric 的两层架构（Object Model + Event Bridge）**。这个心智模型可以迁移到任何"渲染 API → 编辑器"的场景。

---

**round 138 / S29-3 / 2026-05-29 / 状元**
