---
title: glide-data-grid — Canvas 画出来的百万行表格
来源: https://github.com/glideapps/glide-data-grid
日期: 2026-06-01
分类: 数据可视化
难度: 中级
---

## 是什么

glide-data-grid 是一套**用 HTML Canvas（而不是 DOM 元素）画出来的 React 数据表格**，由 Glide（glideapps.com）开源，作为他们 Data Editor 产品的底座。

日常类比：传统网页表格像在白板上贴便利贴——每一格都是一张可以单独贴/撕的纸（DOM 节点）。glide-data-grid 像直接拿马克笔在白板上画——整张白板只是一块画布（canvas），所有格子是画上去的像素，不是独立物件。

撕便利贴的速度有上限，画笔没有。所以当你要展示百万行数据，DOM 路线撑不住，画布路线还能保持每秒 60 帧滚动。

GitHub 5.2K star，TypeScript 写成，MIT 开源，支持 React 16 到 19。

## 为什么重要

把它和上一篇 [[ag-grid]] 对照看，会发现两套思路在解同一道题，但走的是相反方向：

- **AG Grid 路线（DOM 虚拟化）**：DOM 节点池循环复用，屏幕上只放可见的 30 个 `<tr>`，滚动时改这 30 个的内容。极限大约 5 万到 10 万行
- **glide-data-grid 路线（Canvas 命令式绘制）**：屏幕上 0 个 cell DOM，整张 canvas 是一块画布，每帧只重画「变化的区域」。极限 100 万行以上仍能 60 帧

这是前端工程里非常经典的一个取舍：**用 DOM 还是用 Canvas**。同一道「展示大表格」的题，在「易写 + 可访问」和「极致性能」之间分裂出两个方案。理解它能帮你建立一个直觉——什么时候放弃 DOM 是值得的。

不只是表格。地图（Mapbox 走 WebGL）、图表（ECharts 默认 Canvas）、设计工具（Figma 整个画板是 WebGL），都是同一道题的不同答案。

## 核心要点

glide-data-grid 的性能秘诀可以拆成 **四个机制**：

### 1. 单 canvas + 命令式绘制

整张表格只用一个 `<canvas>` 元素。每帧调用 `ctx.fillText` / `ctx.fillRect` 把每个可见 cell 画上去。

对比 AG Grid：每个 cell 是一个 `<div>` / `<span>`，浏览器要走完整的 layout → paint → composite。glide 跳过 layout 和 composite，直接 paint 像素。

### 2. 可视区虚拟化

和 AG Grid 一样：只「画」可见的 cell。但 AG Grid 是只渲染可见的 DOM 节点，glide 是只调用可见 cell 的绘制函数。

差别在常数。DOM 节点「渲染一次」的成本远高于「画一笔」，所以 glide 的可见 cell 上限更高（每帧画 1000+ cell 还是 60 帧；DOM 路线画 100 个 cell 就开始掉帧）。

### 3. damage 追踪（脏区重绘）

最关键的优化。改一个 cell 的值，glide 不会重画整张表，只重画那个 cell 占的矩形区域——叫做 **damage region**。

类比：你在白板上写错一个字，不会擦掉整张白板重写，只擦那个字的位置重写。每帧只画 dirty 区域，CPU 占用降一个数量级。

### 4. 自定义 hit-testing 和无障碍层

代价：**没有 cell DOM，浏览器不知道你点的是哪一格**。glide 必须自己写鼠标事件处理——把鼠标坐标 (x, y) 反推回 (row, column)，叫 hit-testing。

更大的代价：**screen reader 看不到 canvas 内容**。glide 在 canvas 上层叠了一个隐形 DOM 层，把当前焦点 cell 的文字写进去给读屏软件读。

## 实践案例

### 案例 1：最小可跑的表格

```tsx
import { DataEditor, GridCellKind } from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'

const columns = [
  { title: '姓名', width: 100 },
  { title: '年龄', width: 80 },
]

function getCellContent([col, row]) {
  const data = [['张三', 28], ['李四', 35]][row]
  return {
    kind: GridCellKind.Text,
    data: String(data[col]),
    displayData: String(data[col]),
    allowOverlay: false,
  }
}

<DataEditor columns={columns} rows={2} getCellContent={getCellContent} />
```

注意 `getCellContent` 是个**函数**，不是数组。glide 按需调用它取数据，所以你给 `rows: 1000000` 也不需要先把 100 万行准备好。

### 案例 2：百万行就是一个数字

```tsx
<DataEditor
  columns={columns}
  rows={1_000_000}
  getCellContent={([col, row]) => ({
    kind: GridCellKind.Text,
    data: `行${row}-列${col}`,
    displayData: `行${row}-列${col}`,
    allowOverlay: false,
  })}
/>
```

跑起来还是 60 帧滚动。换成 AG Grid 社区版客户端模型，光把 100 万行 push 进 rowData 就先卡几秒。

### 案例 3：富单元格（图片 / Markdown / 链接）

```tsx
function getCellContent([col, row]) {
  if (col === 0) return { kind: GridCellKind.Image, data: ['https://...'], allowOverlay: true }
  if (col === 1) return { kind: GridCellKind.Markdown, data: '**加粗文字**', displayData: '加粗文字', allowOverlay: true }
  return { kind: GridCellKind.Uri, data: 'https://example.com', allowOverlay: true }
}
```

glide 内置了 7 种 cell 类型：Text / Number / Markdown / Image / Uri / Bubble / Drilldown。想要自定义类型，注册一个 `customRenderer`，里面拿到 `ctx: CanvasRenderingContext2D` 自己画。

## 踩过的坑

1. **getCellContent 不能太慢**：每帧滚动要画 1000+ cell，每个 cell 都会调用 getCellContent。如果你在里面做 fetch / 复杂计算，立刻掉帧。修复：函数内部只做 O(1) 索引；数据预先放在 ref / Map 里
2. **可访问性要实测，别误关**：无障碍树**默认开启**（`experimental.strict` 只管可见区取数，不是 a11y 开关）。勿设 `disableAccessibilityTree`；建议打开 `pageUp`/`pageDown` keybindings 并用读屏实测隐藏 DOM 层
3. **文本选择是假的**：浏览器原生的 Ctrl+A 选不中 canvas 里的文字。glide 自己实现了一套「像选择」的高亮渲染，但复制粘贴需要绑 `onPaste` / 自己处理
4. **theme 必须传完整对象**：内置 light / dark theme 想改一个颜色，必须传整个 theme 对象覆盖，不是 spread。修复：`theme={{ ...darkTheme, accentColor: '#ff0000' }}`
5. **窗口 resize 不自动**：canvas 不像 DOM 会自适应父容器。要监听 resize 改 `width` / `height` props，否则 retina 下会糊

## 适用 vs 不适用场景

**适用**：
- 数据量极大（10 万行以上）+ 滚动是核心交互
- 富单元格（图片 / Markdown / 自定义画法）+ 数据量也大
- 类似 Notion / Airtable 的电子表格界面，需要平滑滚动

**不适用**：
- 数据量 < 1 万行——AG Grid 或原生 `<table>` 更省心
- 需要 Pivot / 复杂筛选 UI——glide 的内置 UI 较朴素，重型功能不如 [[ag-grid]] 企业版
- 重度依赖屏幕阅读器 / 键盘导航的场景——可访问性要自己补
- 需要导出 / 打印——canvas 不能直接导出 HTML，需要自己实现

## 历史小故事（可跳过）

- **起点**：Glide 是一家做「用 Google Sheets 当后端的 no-code app builder」的公司。他们的 Data Editor 要让用户在浏览器里编辑几万行表格，DOM 路线先后试了几个，都卡
- **转向 canvas**：团队发现地图和游戏行业早就用 canvas / WebGL 解大数据可视化，于是把这套思路搬到表格
- **开源**：2021 年前后开源 glide-data-grid，作为 Data Editor 的底层。React 社区第一次有了「认真做 canvas 表格」的开源选项

## 学到什么

1. **DOM 不是唯一路线**——前端默认用 DOM，但 DOM 有 1 万 ~ 10 万节点的实际上限。突破这个上限要么换 canvas，要么换 WebGL
2. **damage 追踪是图形系统的通用思想**——只重画 dirty 区域，操作系统、浏览器、游戏引擎、glide 全用这招
3. **性能换可访问性**：canvas 路线必须自己补 ARIA / hit-testing / 文本选择。这是设计约束，不是 bug
4. **「画」比「渲染」快**：layout + paint + composite 三步只剩 paint。常数级提速但意义重大
5. **取舍的本质**：DOM 路线易写但有性能上限；canvas 路线难写但天花板高得多

## 延伸阅读

- 仓库：[glideapps/glide-data-grid](https://github.com/glideapps/glide-data-grid)
- Glide 工程博客：[How we built our data grid](https://www.glideapps.com/blog)
- React 文档：[Working with Canvas](https://react.dev/reference/react-dom/components/common)
- [[ag-grid]] —— DOM 虚拟化路线，对照阅读
- [[react]] —— glide 是 React 组件，但内部几乎不走 React 渲染

## 关联

- [[ag-grid]] —— 同一道题的另一个答案：DOM 虚拟化 vs Canvas 绘制
- [[react]] —— 宿主框架，但 glide 用 React 只做 props 接口，绘制走 canvas
- [[d3]] —— 数据可视化老牌库，同样把 SVG / Canvas 抽象成图形语言
- [[mapbox-gl]] —— WebGL 路线的代表，思路和 glide 同源（放弃 DOM）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ag-grid]] —— AG Grid — 企业级数据表格
- [[canvas-datagrid]] —— canvas-datagrid — 整张表只用一块 canvas 画
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[handsontable]] —— Handsontable — 浏览器里的 Excel
- [[react]] —— React UI 组件库
- [[tabulator]] —— Tabulator — 纯 JS 交互式表格

