---
title: Fabric.js — 给 Canvas 加一层"对象模型"，让画布图形可以拖
来源: https://github.com/fabricjs/fabric.js
日期: 2026-05-30
分类: 前端 / Canvas
难度: 中级
---

## 是什么

Fabric.js 是一个把 HTML5 `<canvas>` 这块"只能涂抹的画板"包装成"可以摆放、选中、拖拽、旋转、序列化对象的舞台"的 JavaScript 库。

日常类比：原生 Canvas 像**用粉笔在玻璃上写字**——写完一笔，它就只是像素，再也挪不动了。Fabric 像**在玻璃上贴磁贴**——每张磁贴有自己的身份，知道"我是矩形、现在在 (100, 200)、被旋转了 30 度"，可以拖、可以选中、可以叠在别的磁贴上面。

最小用法：

```js
const canvas = new fabric.Canvas('c');
canvas.add(new fabric.Rect({ left: 100, top: 100, width: 80, height: 60, fill: 'orange' }));
// 用户已经能拖、能缩放、能旋转——一行交互代码都不用写
```

## 为什么重要

不理解 fabric 这套思路，下面这些东西都没法解释：

- 为什么稿定设计、创客贴这类"在线设计工具"能在浏览器里跑——对象层往往是 fabric 或同一思路的自研
- 为什么许多 Miro 类白板 / 海报编辑器的早期 Canvas 原型，借 fabric 几天就能跑出可拖拽 demo（注：Excalidraw 等后来自研场景模型，并不依赖 fabric）
- 为什么"原生 Canvas 写编辑器"是个 800 行起步的工程，而 fabric 80 行就够
- 为什么所有 Canvas 编辑器的存档都是 JSON 不是 PNG——序列化对象层 vs 序列化像素

更广义的：**fabric 解决的是"无状态渲染 API → 可编辑对象层"这个范式**。这个范式在 WebGL、SVG 编辑器、PDF viewer、富文本编辑器里反复出现，是前端基建的一类共性问题。

## 核心要点

Fabric 的设计可以拆成 **三个核心抽象**：

1. **Object Model（对象模型）**：所有形状继承自 `fabric.Object`，存的是**原始尺寸 + 变换参数**（left / top / scaleX / scaleY / angle），不是最终的 boundingRect。每帧渲染时再算出实际位置。

2. **双 Canvas 分层**：DOM 里其实有两个 `<canvas>` 叠在一起——`lower-canvas` 负责画对象，`upper-canvas` 负责画选择框和辅助线。拖动时只重绘 upper，松手时再全量刷 lower。这是用"分层"换"局部刷新"，跟操作系统双缓冲是同源思维。

3. **事件桥接**：fabric 把 DOM 的 mousedown / mousemove / mouseup 翻译成对象级事件——`mouse:down`（命中谁触发）、`object:moving`（拖动中）、`object:modified`（一次操作结束）。开发者不用自己写"鼠标坐标 → 哪个对象被点中"的命中测试。

三层加起来，让你**只关心对象语义，不关心像素坐标**。

## 实践案例

### 案例 1：80 行最小编辑器

```html
<canvas id="c" width="900" height="600"></canvas>
<script src="https://cdn.jsdelivr.net/npm/fabric@6/dist/index.min.js"></script>
<script>
  const canvas = new fabric.Canvas('c');
  canvas.add(new fabric.Rect({ left: 100, top: 100, width: 120, height: 80, fill: '#f5a55f' }));
  canvas.add(new fabric.IText('双击编辑', { left: 300, top: 200, fontSize: 32 }));
  canvas.on('object:modified', (e) => console.log('改完了', e.target.toObject()));
</script>
```

这几行已经包含：拖动、缩放、旋转、双击编辑文本、修改事件钩子。raw Canvas 写同样功能至少 800 行。

### 案例 2：序列化是命脉

```js
// 保存
const json = JSON.stringify(canvas.toJSON());
localStorage.setItem('design', json);

// 恢复
canvas.loadFromJSON(JSON.parse(localStorage.getItem('design')), () => canvas.renderAll());
```

所有"在线设计工具"靠这一对方法吃饭：服务端只存 JSON（通常是 PNG 的 1/100 体积），客户端解析后重建对象树。**导出 PNG 是 raster（像素），导出 JSON 是 vector（语义）**——这是为什么你在设计平台看到"保存"和"导出图片"是两个不同的按钮。

### 案例 3：为什么存"原始 + 变换"而不存最终结果

如果只存 boundingRect：撤销重做要存全量、JSON 丢失"用户旋转了 30 度"这层语义、缩放会累积浮点误差。存"原始 + 变换"则让所有操作**可逆、可叠加、可序列化**。这跟 SVG 哲学一致——SVG 也是"原始路径 + transform"。

## 踩过的坑

1. **>1000 对象掉帧**：fabric 默认每帧全量重绘。优化方向：用 `fabric.Group` 把不动的对象合并、`renderOnAddRemove: false` 批量加完再 renderAll、`objectCaching: true`（默认开）让每个对象缓存为离屏 canvas、视口外的对象 `visible = false`。

2. **Image 跨域污染 canvas**：加载跨域图片再导出 PNG 会触发 SecurityError。必须 `fabric.Image.fromURL(url, { crossOrigin: 'anonymous' })`，且图床要返回 `Access-Control-Allow-Origin`。

3. **Text 缩放变模糊**：直接 `scaleX = 2` 缩放 Text 是像素拉伸（糊），正确做法是改 `fontSize`（重新栅格化）。Textbox 已自动处理，IText / Text 没有，要自己接。

4. **v6 全 Promise 化**：v5 是 `fabric.Image.fromURL(url, callback)`，v6 是 `await fabric.Image.fromURL(url)`。中文教程 80% 还停在 v5 写法，照抄会跑不起来——优先信 TypeScript 类型定义，不要信博客。

5. **animate 不会自动重绘**：`obj.animate('left', 500, { duration: 1000 })` 默认不刷屏，必须接 `onChange: canvas.renderAll.bind(canvas)`。新人会以为代码没生效。

6. **perPixelTargetFind 性能陷阱**：默认用 boundingRect 命中测试（圆形四角的透明区域也会被点中），开 `perPixelTargetFind: true` 改用像素级，但每次 mousemove 要读像素，慢 10 倍以上。只对个别复杂 Path 局部开。

## 适用 vs 不适用场景

**适用**：

- 浏览器内的设计工具 / 编辑器底座（IText / Textbox / Filter 链做得深）
- 海报 / 邀请函 / 头像 / 拼图等需要"对象层 + 序列化"的工具
- 教育白板、PDF 标注、图片批注
- Canvas 2D 上 ≤ 几千对象的中等规模交互

**不适用**：

- 重度 React 项目（fabric 没有官方 React 包装，命令式 API + useRef 接得很别扭，理性选择是 Konva + react-konva）
- 万级以上对象 / 大量动画（应该上 Pixi.js 走 WebGL）
- 纯展示无交互的图表（用 D3 / ECharts 即可，不需要这层对象抽象）
- 矢量图编辑（Paper.js 的 Item 树更接近 SVG DOM）

## 历史小故事（可跳过）

- **2008 年**：kangax (Juriy Zaytsev) 在 Printio 做 T 恤定制工具，需要让用户在 T 恤图片上拖图案、加文字。当时主流是 Flash，他选了刚出生的 HTML5 Canvas，发现"拖动"得自己维护对象列表，于是写了 fabric。
- **2010 年**：开源后迅速成为"Canvas 编辑器"的事实标准。
- **2024 年**：v6 整体重写为 ESM + TypeScript，开源生态进入"老教程都过期"的一年阵痛期。

kangax 也是 ECMAScript 兼容性表 `kangax/compat-table` 的作者，一向偏好原生 JS，这也解释了 fabric 为什么没接 React。

## 学到什么

1. **对象模型是"无状态渲染 API"长出可编辑能力的必经之路**——不只是 Canvas，WebGL / DOM 事件流 / PDF 也一样
2. **存"原始 + 变换"而不是"最终结果"** —— 让一切操作可逆、可序列化、可重放
3. **分层换局部刷新** —— 双 canvas 是经典的"用空间换时间"
4. **事件桥接是开发者最值钱的一层** —— hit-test 看似简单，但每个圆 / 路径 / 旋转过的矩形都要处理，自己写几百行起步
5. **生态空窗期是开源项目重写的必然代价** —— React 18、Vue 3、fabric v6 都遇到过；一旦新版发布，旧教程会持续误导新人 1-2 年

## 一个反直觉的事实

fabric 没有官方 React 包装。这件事很反直觉——一个 2008 年起、30k LOC 的成熟库，居然把"和最大前端框架的整合"留给社区。

社区有 `fabricjs-react`、`react-fabric-canvas` 等几个非官方包装，维护活跃度都一般，大多数人就是裸用 `useEffect` + `useRef` 自己接。而 Konva 有官方 `react-konva`、Pixi 有官方 `@pixi/react`，把对象模型直接变成 React 组件 `<Rect x={10} y={20} />`。

**所以今天选编辑器底座，如果团队是 React 重度，理性选择正在从 fabric 偏移向 Konva 或自研**。fabric 的命令式 API 在 Vue / Vanilla JS / Web Components 场景下没有这个问题，且 toJSON 数据结构足够稳定，可以独立于框架使用。这不是"fabric 输了"——它在自己的 niche 里依然第一，但市场是分裂的，没有赢家通吃。

## 延伸阅读

- 官方仓库：[github.com/fabricjs/fabric.js](https://github.com/fabricjs/fabric.js)（v6 文档比 fabricjs.com 更新）
- 对照阅读：[Konva.js](https://github.com/konvajs/konva)（显式 Layer + 官方 React 包装），[Paper.js](https://github.com/paperjs/paper.js)（Item 树近 SVG）
- 学习路径：从 `src/canvas/Canvas.ts` 看双 canvas 怎么挂 DOM → `src/shapes/Object/Object.ts` 看 `_render` / `toObject` → `src/canvas/SelectableCanvas.ts` 看事件分发
- demos repo：[fabric.js/demos](https://github.com/fabricjs/fabric.js/tree/master/demos)，每个 demo ≤ 100 行，最快的对照学习路径

## 关联

- [[anime]] —— 都靠 requestAnimationFrame 主循环；fabric 的 animate 工具复用同一思路
- [[d3]] —— D3 偏数据驱动 SVG，fabric 偏对象驱动 Canvas，两套抽象解决相邻问题
- [[dnd-kit]] —— React 现代拖拽 toolkit；fabric 在 Canvas 内自己处理拖拽，dnd-kit 在 DOM 层
- [[prosemirror]] —— 文档编辑器的对象模型；和 fabric 同样是"自定义对象模型 + 自管渲染"
- [[storybook]] —— 组件展厅；fabric 的 demos repo 是它的"穷人版" Storybook

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[konva]] —— Konva — 给 HTML5 Canvas 装一棵会响应的节点树
- [[piskel]] —— Piskel — Web 像素艺术编辑器
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
