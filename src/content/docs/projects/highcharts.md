---
title: Highcharts — 配置对象驱动的商业 SVG 图表库
description: 配置对象驱动的商业 SVG 图表库，绑定 Highcharts 13.0.2 源码仓的 chart 工厂、update/setData 与独立 Boost 模块。
来源: https://github.com/highcharts/highcharts
日期: 2026-08-27
分类: 数据可视化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/highcharts/highcharts
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 69edf8952a04b9872b6510fbdacd7dff8b03970b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 13.0.2
---

## 是什么

Highcharts 是 Highsoft 的 **source-available 商业图表库**。日常类比：像一套带说明书的成品家具——你填一份 options（尺寸、抽屉、颜色），工厂按单装配；默认车间画 SVG，另买 Boost 模块才改走 WebGL。

固定 `v13.0.2` 的公开入口是 `Highcharts.chart`：

```js
const chart = Highcharts.chart('container', {
  title: { text: 'My chart' },
  series: [{ data: [1, 3, 2, 4] }],
});
```

工厂内部 `new Chart(...)`，再返回 `chart.promise ?? chart`。没有浏览器 `document` 时构造器记 error 36 并提前返回。

## 为什么重要

不理解 Highcharts 的发布与更新合同，下面这些事会对不上：

- 为什么 npm 上的 `highcharts@13.0.2` 指向 `highcharts-dist`，而源码审查必须回 `highcharts/highcharts`
- 为什么“改一下 series”有时该走 `chart.update`，有时该走 `series.setData`
- 为什么默认包能画折线/柱/饼，却画不出 Stock / Maps / Gantt
- 为什么“大数据走 Canvas”不是默认主链，而是独立 Boost 模块

## 核心要点

固定版本的主链可以拆成四层：

1. **工厂与挂载**：第一参数可以是 DOM / id，也可以整份 options；`renderTo` 也可写在 `options.chart.renderTo`。`callback === true` 时设置 `chart.promise`，工厂因此返回 Promise。
2. **默认渲染是 SVG**：`ts/masters/highcharts.src.ts` 挂 `SVGRenderer`，并 compose Line / Area / Spline / AreaSpline / Column / Bar / Scatter / Pie。Stock、Maps、Gantt、3D、more 是别的 master。
3. **更新分两条路**：`Chart.update` 先 `diffObjects`，没变化就返回；集合默认按 id 或下标对齐，`oneToOne` 才增删；`redraw ?? true`。`Series.setData` 写入 `DataTable`，默认重绘。
4. **Boost 不在默认入口**：`modules/boost` 探测 WebGL；`boostThreshold` 默认 5000，`boost.seriesThreshold` 默认 50。本页未测吞吐。

## 实践示例

### 案例 1：最简工厂调用

```js
import Highcharts from "highcharts";

const chart = Highcharts.chart(document.getElementById("container"), {
  chart: { type: "line" },
  series: [{ name: "订单", data: [10, 41, 35, 51] }],
});
```

`chart` 是实例。若第三个参数传 `true`，拿到的是等首次就绪的 Promise。

### 案例 2：改配置用 update，改点用 setData

```js
chart.update({ title: { text: "Q2" } });
chart.series[0].setData([12, 40, 33, 58]);
```

`update` 会合并 userOptions。没有 `id` 时，series 数组按下标对齐；要增删系列需 `oneToOne: true`。源码注明改 series data 时 `update` 可能改你传入的数组。

### 案例 3：无 DOM 不能当“服务端画图成功”

```js
// Node 且没有 document 时
const chart = Highcharts.chart({ series: [{ data: [1] }] });
```

构造器在 `!doc` 时返回，不会走到 `init` / `firstRender`。服务端渲染要另接官方导出或自己补 DOM，不能把这行当成已验证的 SSR 合同。

## 踩过的坑

1. **把 npm 包 SHA 当成 source revision**：`highcharts@13.0.2` 的 `gitHead` 在 dist 仓，source tag 是另一提交。
2. **省略 `series` 以为会清空图**：`update` 不传 `series` 就不动现有系列；空数组且 `oneToOne` 才会删光。
3. **默认包里找 Stock / Maps**：那些入口在 `highstock.src.ts` / `highmaps.src.ts`。
4. **把 Boost 注释里的“数十万点、毫秒级”写成自己的测量**：本页只读到阈值默认值，没有跑 WebGL。
5. **`allowMutatingData === false` 时仍改原数组**：`setData` 会先深拷贝。

## 适用 vs 不适用场景

**适用**：

- 浏览器里用一份 options 装配常见笛卡尔 / 饼图
- 需要官方导出、注解、响应式规则，并接受商业许可
- 阅读 `update` / `setData` / `redraw` 三条更新路径

**不适用**：

- 要 MIT 原语、自己拼 SVG → 看 [[visx]]
- 要 React 组件树当图表 DSL → 看 [[recharts]]
- 把本页当 WebGL 性能结论：Boost 未运行
- 无 DOM 的 Node 环境：默认构造器会提前退出

## 固定版本边界

- 本文绑定 `highcharts/highcharts@69edf895...`，tag `v13.0.2`，仓内版本 `13.0.2`。
- npm `highcharts@13.0.2` 发布自 `highcharts-dist@387b98df...`，不是本页 revision。
- 许可是 Highsoft 商业 / source-available，不是 OSI 开源默认。
- 未安装依赖、未跑测试或 Boost，状态保持 `UNVERIFIED`。

## 学到什么

1. **源码仓和发行仓可以合法分裂**——审查必须写清绑的是哪一边
2. **配置更新和数据更新不是同一条 API**——`update` 管 options 树，`setData` 管点表
3. **默认包的 series 清单就是产品边界**——Stock / Maps 不是“打开一个开关”
4. **可选加速模块不能写成默认渲染器**

## 应用型自测

1. `Highcharts.chart(options, true)` 一定返回 Chart 实例吗？
2. 图上已有两条 series。调用 `chart.update({ series: [{ data: [1] }] })` 且不传 `oneToOne`，第二条还在吗？
3. 只引入默认 `highcharts` master，能直接 `stockChart` 吗？

检查点：

1. 不一定。`callback === true` 时工厂返回 `chart.promise`。
2. 在。默认不是 one-to-one，未出现的系列不会被删。
3. 不能。Stock 是另一条 master。

## 延伸阅读

- 官方文档：[highcharts.com/docs](https://www.highcharts.com/docs)
- 固定源码：[highcharts/highcharts](https://github.com/highcharts/highcharts) —— 本文绑定 `69edf8952a04b9872b6510fbdacd7dff8b03970b`
- 审查记录：仓库内 `docs/highcharts-visx-source-review-20260827-ea.md`
- 发行仓：[highcharts/highcharts-dist](https://github.com/highcharts/highcharts-dist)
- [[visx]] —— React 原语对照
- [[recharts]] —— JSX 图表对照
- [[echarts]] —— 另一条配置驱动路线，本页未审查其固定源码

## 关联

- [[visx]] —— 低层 React / d3 原语，哲学相反
- [[recharts]] —— React 成品图
- [[apexcharts]] —— 另一条 SVG options 库
- [[echarts]] —— 配置驱动对照
- [[d3]] —— 许多高层库的数学底座；Highcharts 核心并不包装 d3
