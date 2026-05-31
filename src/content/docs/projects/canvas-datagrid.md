---
title: canvas-datagrid — 整张表只用一块 canvas 画
来源: https://github.com/TonyGermaneri/canvas-datagrid
日期: 2026-06-01
分类: 数据可视化
难度: 中级
---

## 是什么

canvas-datagrid 是一套**用单个 `<canvas>` 元素画出来的数据表格 web component**，作者 Tony Germaneri，2015 年前后开源，BSD-3 许可。

日常类比：[[ag-grid]] 像在墙上贴贴纸，每一格都是一张可以单独贴/撕的便签（DOM 节点）；[[glide-data-grid]] 像拿马克笔在白板上画格子，每一格都是像素；canvas-datagrid 也是后者，但比 glide 更"原始"——**每一帧把整个可见区从头到尾重画一遍**，不做局部更新优化。

GitHub 1.6k star，原生 JavaScript 写成（不依赖 React / Vue），包成 Web Component 标准的自定义元素 `<canvas-datagrid>`，所以任何前端框架都能直接用。最后一次发布 v0.4.7（2023 年 5 月），239 个版本，970+ commits。

## 为什么重要

把它放在三套 canvas/DOM 表格库的谱系里看，差别一下子就清楚了：

- **AG Grid 路线**：DOM 节点池虚拟化 + 企业版收费
- **glide-data-grid 路线**：单 canvas + damage tracking（脏区重绘）+ React 专用
- **canvas-datagrid 路线**：单 canvas + **immediate mode**（每帧全量重画）+ Web Component 框架无关

为什么值得专门读 canvas-datagrid？因为它是**最"裸"的样本**——没有 damage tracking 优化，没有 React fiber 复用，整套 Excel 体验（点选 / 拖蓝 / 双击编辑 / 方向键 / 复制粘贴）从零开始重新长出来。读它就像读"如果浏览器只给你一块画布，你怎么把表格做出来"的范文。

不只是表格。这套思路在地图（Mapbox 走 WebGL）、图表（ECharts 默认 Canvas）、设计工具（Figma 整个画板是 WebGL）、甚至游戏引擎里反复出现——**放弃 DOM，自己重写所有交互**。

## 核心要点

canvas-datagrid 的实现可以拆成 **四个机制**，每一个都是 DOM 路线下"浏览器免费送"的能力：

### 1. immediate mode 绘制

每一帧调用 `requestAnimationFrame`，在 canvas 上把可见区的格子从头画一遍：边框 → 背景 → 文字 → 选区高亮 → 滚动条。**没有 retained scene graph，没有 dirty rectangles**——和 glide-data-grid 的 damage tracking 形成对照。

代价：每帧 CPU 开销恒定偏高。好处：实现极简单，作者一个人维护得动。这是"早期 canvas 表格"的典型选择。

### 2. hit-testing 自己写

DOM 路线下点击 cell，浏览器把事件冒泡到 `<td>`，自带 row/col 信息。canvas 没有 cell DOM——画上去的字只是像素，浏览器不知道你点的是"张三 28 岁"那一格还是空白。

canvas-datagrid 在 mousedown 里拿到 `(x, y)`，**反查内部维护的列宽数组和行高数组**，二分定位到 `(col, row)`，再去数据源里查值。每个 mousemove 都要做一次。

### 3. 编辑器是浮在 canvas 上的真 input

双击进入编辑模式时，canvas-datagrid **不是在 canvas 里画一个假输入框**——它创建一个真正的 `<input>` 或 `<textarea>` DOM 节点，绝对定位浮在那一格上方，编辑结束销毁。

为什么不画？因为光标闪烁、IME 候选词、移动端键盘弹起、复制粘贴右键菜单——**这些是浏览器免费送的，自己在 canvas 里实现要写几千行代码**。所以画归画，编辑归 DOM，分工。

### 4. 选区是状态 + 重绘

拖蓝（拖拽多选）的实现：mousedown 记起点，mousemove 算当前格，mouseup 结束。整个过程中 selection 状态存在内存（一个矩形 `{startRow, endRow, startCol, endCol}`），每一帧画完格子之后，再在选中区域上盖一层半透明蓝色 + 蓝色边框。

复制（Ctrl+C）：从 selection 状态读出涉及的 cell，组装成 TSV 字符串塞进剪贴板。粘贴反过来。这一切**没有浏览器原生 selection API 帮忙**——因为画上去的字不是真文本，浏览器不知道哪些字"被选中"。

## 实践案例

### 案例 1：最小可跑的表格

```html
<canvas-datagrid id="grid"></canvas-datagrid>
<script>
  document.getElementById('grid').data = [
    { 姓名: '张三', 年龄: 28, 城市: '北京' },
    { 姓名: '李四', 年龄: 35, 城市: '上海' },
  ]
</script>
```

注意没有 React / Vue / 任何框架引入。`<canvas-datagrid>` 是 Web Component，原生 HTML 直接用。给它一个数组，列名自动从对象 key 推出来，列宽自适应。

### 案例 2：百万行也能塞

```js
const data = []
for (let i = 0; i < 1_000_000; i++) {
  data.push({ id: i, name: '行' + i, value: Math.random() })
}
document.getElementById('grid').data = data
```

百万行 push 进去之后，滚动还是流畅的。原因是 immediate mode + 可视区虚拟化——只画当前看到的那 30 行。但和 glide 比，CPU 占用更高（每帧全量重画），所以滚动 60 帧但风扇会响。

### 案例 3：监听 cell 编辑事件

```js
grid.addEventListener('endedit', (e) => {
  console.log('编辑了第', e.cell.rowIndex, '行第', e.cell.columnIndex, '列')
  console.log('原值', e.cell.value, '新值', e.value)
  // e.preventDefault() 可以阻止值真的写回 data
})
```

事件名借鉴 DOM 习惯（`endedit` / `beginedit` / `selectionchanged`），但事件源是自定义元素自己派发，不是浏览器原生。

## 踩过的坑

1. **每帧全量重画 → 移动端发热**：immediate mode 在 PC 上是 60 帧丝滑，到中端安卓机会让 GPU 占用 70%+。修复方案：fork 后自己加 damage tracking，或换 glide-data-grid
2. **没有受控模式（controlled mode）**：data 传进去之后，组件**直接修改你传入的对象**（in-place mutation）。和 React 单向数据流冲突，要么深拷贝传入，要么监听 endedit 自己同步状态
3. **可访问性默认关**：和所有 canvas 表格一样，screen reader 看不到内容。需要监听焦点变化，把当前 cell 文本同步到一个隐藏 DOM 节点供读屏软件读
4. **样式是 JS 对象不是 CSS**：`grid.style.cellBackgroundColor = '#fff'` 这种——因为 canvas 里画的不是 DOM，CSS 类选择器对它无效。所有视觉配置走 JS API
5. **维护活跃度下降**：2023 年 5 月之后没有新版本。生产用之前要确认 issue tracker 状态；新项目优先 glide-data-grid

## 适用 vs 不适用场景

**适用**：
- 不想绑定 React / Vue，想要框架无关的 web component 数据表格
- 数据量 10 万到 100 万行，需要 60 帧滚动
- 项目预算紧 / 不想付 [[ag-grid]] 企业版的钱
- 需要原生 JS 直接 `<canvas-datagrid>` 用 HTML 嵌入

**不适用**：
- 已经在 React 项目里 → glide-data-grid 体验更好（damage tracking + 富 cell）
- 数据 < 1 万行 → 原生 `<table>` 或 ag-grid 社区版即可
- 重度依赖屏幕阅读器 / 键盘无障碍 → 需要自己补很多 ARIA 代码
- 需要 Excel 公式 / 合并单元格 / 拖拽填充柄 → 用 [[handsontable]]
- 维护活跃度敏感的关键业务 → 看一眼 issue tracker 再决定

## 历史小故事（可跳过）

- **2015 年前后**：作者 Tony Germaneri 一个人写起来。当时 Web Components 标准刚出来，他选这个标准是看中"框架无关"
- **2017–2020**：稳步迭代到接近 240 个版本，被一些金融 / 数据分析的小工具采用，star 数缓慢爬到 1.6k
- **2023 年 5 月**：v0.4.7 之后停更。社区里偶有 PR，但作者投入度下降。同时期 glide-data-grid 在 React 圈快速崛起

它代表了"前 React 时代的 canvas 表格思路"——单人维护、原生 JS、Web Component 标准、immediate mode 绘制。这种风格今天在新项目里少见，但读它能直观理解"如果不用任何框架抽象，从零画一张可交互表格要做什么"。

## 学到什么

1. **canvas 表格的最小骨架是四件事**：绘制 / 命中测试 / 编辑器叠层 / 选区状态。少任何一件，表格就用不起来
2. **immediate mode vs damage tracking** 是 canvas 渲染的核心选择——前者简单 CPU 高，后者复杂 CPU 低。glide 走后者，canvas-datagrid 走前者
3. **不是所有事都自己画**：编辑器借 DOM `<input>`，因为光标 / IME / 移动键盘是浏览器免费送的。**会"画 vs 不画"的边界比会画更重要**
4. **Web Component 在 2015 年是一个赌注**——它赌"框架无关 = 长期赢"。但 React 的市场份额碾压让这个赌注没赢。技术选择的兴衰常常不取决于技术本身
5. **看"裸"实现胜过看抽象封装**：canvas-datagrid 没做任何"聪明"的优化，因此每一段代码都直白对应一个 Excel 习以为常的小动作。读它的源码是理解"DOM 帮我们承担了多少事"的最好途径

## 延伸阅读

- 仓库：[TonyGermaneri/canvas-datagrid](https://github.com/TonyGermaneri/canvas-datagrid)
- 在线文档：[canvas-datagrid.js.org](https://canvas-datagrid.js.org/)
- MDN: [Web Components 概念](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
- [[glide-data-grid]] —— 同思路的 React 版，加了 damage tracking
- [[ag-grid]] —— DOM 虚拟化路线对照
- [[handsontable]] —— DOM + Excel 完整体验对照

## 关联

- [[glide-data-grid]] —— 同走 canvas 路线，但加 damage tracking + 限定 React
- [[ag-grid]] —— 同一道题的 DOM 虚拟化答案
- [[handsontable]] —— 同走 DOM，但目标是"在浏览器里做 Excel"
- [[excalidraw]] —— 另一个用单 canvas 做交互应用的样本（白板而非表格）
