---
title: Plotly.js — 一个 JSON 描述任何图表的浏览器全家桶
description: 介绍 Plotly.js 4.0.0 如何用 data / layout / config 描述图表，以及 newPlot、react、core scatter 与 v4 删除 mapbox 的边界。
来源: https://github.com/plotly/plotly.js
日期: 2026-08-27
分类: projects / 数据可视化
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/plotly/plotly.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e020cc00ef4eb3b0b7fbf25871c2f818e73a04ce
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.0
---

## 是什么

Plotly.js 是一份**用 JSON 描述图表的浏览器运行时**。你给 traces、layout 和 config，它负责画图、交互和导出。日常类比：[[echarts]] 的对象叫 option/series；Plotly 的对象叫 figure，骨架是 `{data, layout, config, frames}`。

固定 `plotly.js@4.0.0` 的公开入口是 `Plotly.newPlot` 与 `Plotly.react`。`src/core.js` 默认只注册 `scatter`；完整 `lib/index.js` 再挂上柱、箱线、热力、3D、地图和新增的 `quiver`。

```js
Plotly.newPlot("chart", [{
  x: [1, 2, 3, 4],
  y: [10, 15, 13, 17],
  type: "scatter",
}], {
  title: { text: "我的第一张图" },
})
```

四行对象就能出一张可交互散点/折线。`newPlot` 会先 `purge` 再画；频繁更新应走 `react`。

## 为什么重要

不按 4.0.0 源码读，下面这些事很容易写错：

- 为什么 `import Plotly from "plotly.js/lib/core"` 只有 scatter，而默认 `plotly.js` 才有完整 traces
- 为什么实时仪表盘用 `newPlot` 会整图重建，`react` 才会 diff
- 为什么 v4 不能再写 `scattermapbox`——mapbox traces 和 `mapboxAccessToken` 已被删除
- 为什么自定义 bundle 文档仍说 `scatter` 去不掉

## 核心要点

固定版本可以拆成四层：

1. **figure 合同**：`_doPlot` 接受 `(gd, data, layout, config)`，或把第一个数据参数当成 `{data, layout, config, frames}`。`data` 是 trace 数组，`layout` 管坐标轴/标题，`config` 管 modebar 与静态导出。

2. **注册表**：core 只 `register(scatter)`。完整 `lib/index.js` 再注册 bar/box/heatmap/histogram/contour/violin/pie/sunburst/treemap/scatter3d/surface/scattergl/splom/sankey/scattermap/choroplethmap/densitymap/`quiver` 等。没有 `*mapbox`。

3. **newPlot vs react**：`newPlot` 先 `Plots.cleanPlot` + `Plots.purge`，再 `_doPlot`。`react` 在已有 plot div 上 diff layout/data；`config` 一变会先 `newPlot`（并尝试保留事件监听）再 `react`。

4. **v4 边界**：`engines.node` 为 `>=22`。颜色处理改 `culori`。MathJax v2 已删除，文档写的是 v3/v4。`toImage` 默认 `png`，还允许 `jpeg` / `webp` / `svg` / `full-json`。

## 实践示例

### 案例 1：换 trace 类型

```js
const data = [{
  x: ["周一", "周二", "周三"],
  y: [3, 7, 5],
  type: "scatter",
}]
Plotly.newPlot("chart", data)
```

完整 bundle 里把 `type` 改成 `"bar"` 或 `"box"` 会换图层。core-only 包没有 bar，必须先 `Plotly.register`。

### 案例 2：更新走 `react`

```js
Plotly.react("chart", nextData, nextLayout)
```

已有图时 `react` 会 `supplyDefaults` 再 diff。第一次调用空容器则退回 `newPlot`。`config` 变了会重建。

### 案例 3：partial bundle 只装需要的 traces

```js
import Plotly from "plotly.js/lib/index-basic"
Plotly.newPlot(gd, [{ type: "bar", x: ["A"], y: [1] }])
```

`index-basic` 只额外注册 bar 与 pie。3D / 地图 / `quiver` 不在这个入口。自定义 bundle 文档写明 `scatter` 目前仍会进入所有 bundle。

## 踩过的坑

1. **把 core 当全家桶**：`src/core.js` 只有 scatter；完整 traces 在 `lib/index.js`。
2. **更新仍用 `newPlot`**：它会 `purge` 后重建。频繁更新应 `react`。
3. **继续写 mapbox traces**：v4 删除 `scattermapbox` / `choroplethmapbox` / `densitymapbox` 和 `mapboxAccessToken`，对应物是 `*map`。
4. **把颜色字符串当旧 TinyColor 语义**：v4 改 `culori`，`hsv()` 与部分非 CSS 颜色会被拒绝。
5. **把未测量的“3MB 全量包”当事实**：本文没有跑 gzip / bundle stats。

## 适用 vs 不适用场景

**适用**：
- 数据探索、仪表盘、需要现成 zoom/hover/modebar
- 只要 scatter/bar/pie 时可用 `index-basic` 等 partial bundle
- 能接受 Node >=22 的构建链

**不适用**：
- 非标准图形 → [[d3]]
- 只要 React 组件树 → [[recharts]]
- 国内业务大屏、option/series 心智 → [[echarts]]
- 还依赖 mapbox traces 或 MathJax v2 → 不要停在 4.0.0 的旧文档

## 固定版本边界

- 本文绑定 `plotly/plotly.js@e020cc00...`，npm 与 GitHub tag 均为 `4.0.0`。
- `engines.node` 为 `>=22.0.0`。
- 完整入口是 `lib/index.js`；core 只有 scatter。
- 本轮只读 plotly.js，没有打开 plotly.py / Dash，不能把跨语言 JSON 说成字节级一致。
- 本文只做静态源码阅读，没有安装依赖、运行上游测试或测量包体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **figure 是 data + layout + config，不是“一个 type 字段”**
2. **core 与 full bundle 的注册表不同**
3. **newPlot 重建，react 才 diff**
4. **v4 的地图合同是 `*map`，不是 mapbox**
5. **partial bundle 以 `lib/index-*.js` 为准，不能口算体积**

## 应用型自测

1. `plotly.js/lib/core` 上直接 `type: "bar"`，不 `register`。会画出柱状图吗？
2. 已经有一张图，只改 `y` 仍调用 `newPlot`。它会 diff 还是 purge 重建？
3. 4.0.0 还能用 `scattermapbox` 和 `mapboxAccessToken` 吗？

检查点：

1. 不会。core 只注册 scatter，bar 在完整 `lib/index.js` 或自行 `register`。
2. `newPlot` 先 `purge` 再画；diff 是 `react` 的路径。
3. 不能。v4 删除了 mapbox traces 与该 config，应改 `scattermap` 一类入口。

## 延伸阅读

- 文档：[plotly.com/javascript](https://plotly.com/javascript/)
- 固定源码：[plotly/plotly.js](https://github.com/plotly/plotly.js) —— 本文绑定提交 `e020cc00ef4eb3b0b7fbf25871c2f818e73a04ce`
- 自定义 bundle：[CUSTOM_BUNDLE.md](https://github.com/plotly/plotly.js/blob/v4.0.0/CUSTOM_BUNDLE.md)
- [[echarts]] —— 另一条声明式 option 路线
- [[d3]] —— Plotly 依赖 `@plotly/d3`，但公开 API 不是 selection/join

## 关联

- [[echarts]] —— option/series vs figure/traces
- [[d3]] —— 底层 mapping；Plotly 的公开合同仍是 JSON
- [[chart-js]] —— 更小的 Canvas Chart
- [[recharts]] —— React 组件树
- [[plotly-py]] —— Python 端；本轮未核验其 JSON 是否字节级一致
- [[dash]] —— 把 figure 接到 Python 仪表盘

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[altair]] —— Altair — Python 上的 Vega-Lite 绑定
- [[amcharts5]] —— amCharts 5 — TypeScript 重写的商业级图表库
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[bokeh]] —— Bokeh — 浏览器端交互式 Python 图，可挂 Server 做实时数据流
- [[chart-js]] —— Chart.js — Canvas 渲染入门级图表
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[dash]] —— Dash — 用 Python 回调拼出交互仪表盘
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[holoviews]] —— HoloViews — 声明式数据可视化，一次声明多后端
- [[panel]] —— Panel — Python 数据应用工具箱
- [[plotly-py]] —— Plotly.py — DataFrame 一行变交互图表
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[regl]] —— regl — 函数式 WebGL 封装
- [[streamlit]] —— Streamlit — 脚本即应用的 Python 数据应用框架
- [[vega]] —— Vega — 整张图就是一棵 JSON
- [[projects/vega-lite]] —— Vega-Lite — 高层声明式可视化语法
