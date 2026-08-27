---
title: Apache ECharts — 给一个 JSON 就能画图的可视化库
description: 介绍 Apache ECharts 6.1.0 如何用 option / series / component 描述图表，以及 init、setOption、采样和按需 use() 的边界。
来源: https://github.com/apache/echarts
日期: 2026-08-27
分类: projects / 数据可视化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/apache/echarts
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c5a48f5f97d23e5379720870b8444cd05b50ffb4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.1.0
---

## 是什么

Apache ECharts 是一份**声明式图表运行时**：你给 `option` JSON，它在容器里画出折线、柱、饼、热力、关系图等。日常类比：[[plotly-js]] 也是“写对象出图”，但 ECharts 把图层叫 `series`、把坐标轴/缩放/提示叫 `component`，并且默认走独立渲染层 zrender。

固定 `echarts@6.1.0` 的核心合同是 `init` → `setOption` →（可选）`resize` / `dispose`。默认 `import * as echarts from "echarts"` 走全量 `index.js`；要变瘦必须改走 `echarts/core` 再 `use()` 图表和渲染器。

```js
import * as echarts from "echarts"
const chart = echarts.init(document.getElementById("main"))
chart.setOption({
  xAxis: { type: "category", data: ["衬衫", "羊毛衫", "裤子"] },
  yAxis: {},
  series: [{ type: "bar", data: [5, 20, 36] }],
})
```

`init` 在容器上建实例；`setOption` 喂配置。默认渲染器是 `'canvas'`。

## 为什么重要

不按 6.1.0 源码读，下面这些事很容易写错：

- 为什么同一 DOM 再 `init` 一次，拿到的是旧实例而不是第二张图
- 为什么按需引入只 `use(LineChart)` 时，坐标轴或 tooltip 会缺，而全量入口看起来“开箱即有”
- 为什么 `sampling: "lttb"` 不是“百万点自动救命”，而是 cartesian2d 上的显式降采样
- 为什么 SPA 切路由后 CPU 还在转——`dispose` 才会停掉 zrender

## 核心要点

固定版本可以拆成四层：

1. **option / series / component**：`series[].type` 决定图层；grid / polar / dataZoom / tooltip / legend 是平行注册的 component。`echarts.all.ts` 注册了 22 个 chart installer（line/bar/pie/scatter/radar/map/tree/treemap/graph/chord/gauge/funnel/parallel/sankey/boxplot/candlestick/effectScatter/lines/heatmap/pictorialBar/themeRiver/sunburst/custom）。

2. **默认全量 vs `echarts/core`**：`exports["."]` 指向全量 `index.js`。`src/echarts.ts` 只默认 `use([CanvasRenderer, DatasetComponent])`；全量入口再装 SVGRenderer 和全部 chart。按需路径漏 `use` 的组件时，对应图层或坐标轴不会出现。

3. **更新周期**：`setOption` 默认合并（`notMerge=false`）。也可传 `{notMerge, lazyUpdate, silent, replaceMerge, transition}`。主过程中再次 `setOption` 会被拒绝。`resize` 只调用 `zr.resize`，源码没有 ResizeObserver。

4. **采样是显式的**：line 默认 `sampling: "none"`。`dataSample` 只在坐标系为 `cartesian2d`、点数 `>10` 且 `rate>1` 时下调；`lttb` / `minmax` / `average` / `min` / `max` / `sum` 或自定义函数都要写进 option。

## 实践示例

### 案例 1：全量入口的最小柱状图

```js
import * as echarts from "echarts"
const chart = echarts.init(el)
chart.setOption({
  xAxis: { type: "category", data: ["A", "B"] },
  yAxis: {},
  series: [{ type: "bar", data: [1, 2] }],
})
```

全量入口已经注册 BarChart 与 Grid。同一 `el` 再 `init` 一次，6.1.0 会返回已有实例。

### 案例 2：按需引入必须自己 `use`

```js
import * as echarts from "echarts/core"
import { BarChart } from "echarts/charts"
import { GridComponent, TooltipComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])
```

这里少 `use` 任何一个，图、轴或 tooltip 就会缺。这是 tree-shake 合同，不是“静默画一半也算成功”。

### 案例 3：LTTB 只在直角坐标且够密时生效

```js
chart.setOption({
  xAxis: { type: "time" },
  yAxis: {},
  dataZoom: [{ type: "inside" }],
  series: [{ type: "line", data, sampling: "lttb" }],
})
```

`lttb` 走 `data.lttbDownSample`。点数少、不是 `cartesian2d`、或 `rate<=1` 时，这段 processor 不会降采样。本文没有测量百万点帧率。

## 踩过的坑

1. **把默认入口当按需包**：`import * as echarts from "echarts"` 是全量；要瘦必须 `echarts/core` + `use()`。
2. **漏组件**：只 `use(LineChart)` 没有 `GridComponent` 时，折线可以在，轴不在。
3. **重复 `init`**：同一 DOM 已有实例会直接返回，不会帮你清掉旧 option。
4. **不调 `dispose`**：`dispose` 才会 `zr.dispose()` 并从实例表删除。
5. **以为 resize 会跟着容器走**：窗口或 flex 变了要自己 `chart.resize()`。

## 适用 vs 不适用场景

**适用**：
- 业务仪表盘、运维大屏、需要现成 series/component
- 能接受 Canvas 默认渲染，或显式切 `renderer: "svg"`
- 愿意为 tree-shake 维护 `use()` 依赖图

**不适用**：
- 非标准图形、要自己拼 scale/path → [[d3]] / [[visx]]
- 只要 React 组件树当图表 → [[recharts]]
- 需要跨语言同一份 figure schema → [[plotly-js]]
- 把未测量的包体积或百万点帧率当选型依据 → 本文没有跑 bundle / 渲染 benchmark

## 固定版本边界

- 本文绑定 `apache/echarts@c5a48f5f...`，npm 与 GitHub tag 均为 `6.1.0`。
- 运行时依赖锁定 `zrender@6.1.0`；`src/core/echarts.ts` 的 `dependencies.zrender` 也是 `6.1.0`。
- 默认渲染器是 canvas；SSR 走 `init(..., { ssr: true })`。
- 本文只做静态源码阅读，没有安装依赖、运行上游测试或测量包体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **声明式图表库的合同是 option，不是画布 API**
2. **全量入口和 `use()` 入口是两套注册表**
3. **合并更新是默认值**，清空要显式 `notMerge` 或 `replaceMerge`
4. **降采样是 option，不是隐式性能开关**
5. **实例生命周期要自己 `resize` / `dispose`**

## 应用型自测

1. 同一 `div` 上连续调用两次 `echarts.init`，会得到两个独立实例吗？
2. `echarts/core` 只 `use(LineChart, CanvasRenderer)`，不 `use(GridComponent)`。折线图会有直角坐标轴吗？
3. `series: [{ type: "line", sampling: "lttb" }]` 在极坐标、只有 8 个点时，一定会走 LTTB 吗？

检查点：

1. 不会。非 SSR 路径发现 DOM 上已有实例就返回它。
2. 不会按全量入口那样自动出现。轴是 GridComponent，要自己注册。
3. 不会。`dataSample` 要求 `cartesian2d`、点数 `>10`，并且算出的 `rate>1`。

## 延伸阅读

- 文档：[echarts.apache.org](https://echarts.apache.org/)
- 固定源码：[apache/echarts](https://github.com/apache/echarts) —— 本文绑定提交 `c5a48f5f97d23e5379720870b8444cd05b50ffb4`
- 渲染层：[ecomfe/zrender](https://github.com/ecomfe/zrender)
- [[plotly-js]] —— 另一条 JSON figure 路线
- [[d3]] —— 对照乐高原语

## 关联

- [[plotly-js]] —— 同主题的声明式 JSON 图表，跨语言 schema 更重
- [[d3]] —— 底层 mapping / join，不是成品 series 枚举
- [[chart-js]] —— 更小的 Canvas Chart 抽象
- [[recharts]] —— React 组件树当图表
- [[visx]] —— 把 d3 纯函数接到 JSX

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amcharts5]] —— amCharts 5 — TypeScript 重写的商业级图表库
- [[antv-f2]] —— AntV F2 — 移动端 Canvas 图表，G2 同语法的轻量子集
- [[antv-g2]] —— AntV G2 — 把 Grammar of Graphics 写成 JavaScript
- [[antv-g6]] —— AntV G6 — 把"关系数据"画成会自己摆位置的图
- [[antv-x6]] —— AntV X6 — 把 mxGraph 的图编辑思路搬到 TypeScript
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[billboard-js]] —— billboard.js — c3.js 的 TypeScript 继任者
- [[chart-js]] —— Chart.js — Canvas 渲染入门级图表
- [[chartist]] —— Chartist — 极简 SVG 图表
- [[projects/cytoscape-js]] —— Cytoscape.js — 浏览器里画图（节点 + 边）的图论库
- [[konva]] —— Konva — 给 HTML5 Canvas 装一棵会响应的节点树
- [[leaflet]] —— Leaflet — 轻量交互式地图
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[openlayers]] —— OpenLayers — 全功能 GIS 前端
- [[plotly-js]] —— Plotly.js — 一个 JSON 描述任何图表的浏览器全家桶
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[sigma-js]] —— Sigma.js — 上万节点仍流畅的 WebGL 图渲染器
- [[vega]] —— Vega — 整张图就是一棵 JSON
- [[projects/vega-lite]] —— Vega-Lite — 高层声明式可视化语法
- [[visx]] —— visx — 把 d3 拆成 30 块乐高的 React 可视化原语
