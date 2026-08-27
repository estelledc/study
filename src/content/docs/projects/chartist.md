---
title: Chartist — 极简 SVG 图表
来源: https://github.com/chartist-js/chartist
日期: 2026-05-31
分类: 数据可视化
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/chartist-js/chartist
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4a721397994e366079573e90a792e7a647806df2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.5.0
---

## 是什么

Chartist 是一份 **用 inline SVG 画图、用 CSS class 改外观、无 runtime 依赖** 的图表库。日常类比：它只负责把点和线种进 DOM，颜色和线宽交给你自己的样式表，不另起一套画布 API。

固定 `1.5.0` 的公开入口是三个 class，不再有 `Chartist.Line(...)` 命名空间：

```js
import { LineChart } from "chartist"

new LineChart(".ct-chart", {
  labels: ["周一", "周二", "周三"],
  series: [[3, 5, 2]]
})
```

`package.json` 声明 `engines.node >=14`、`license: MIT OR WTFPL`，`dependencies` 为空。

## 为什么重要

不理解这条合同，下面这些事会对不上：

- 为什么旧教程里的 `Chartist.Line` 在 v1 对不上 export
- 为什么换颜色可以只改 `.ct-series-a .ct-line`，不必改 JS
- 为什么 `update()` 之后整棵 SVG 被拆掉重建
- 为什么注释写 cardinal 平滑，实际默认却是 monotone cubic

## 核心要点

固定版本可以拆成四层：

1. **三种图，一个基类**：`LineChart` / `BarChart` / `PieChart` 都继承 `BaseChart`。`PieChart` 用 `donut: true` 改成描边圆环，不是第四个 class。
2. **首次绘制进宏任务**：构造函数把实例放进容器 `WeakMap`，用 `setTimeout(..., 0)` 才 `initialize()`，好让同一调用栈先 `on(...)`。同容器再 new 一次会先 `detach()` 旧实例。
3. **响应式走 matchMedia**：第四参 `responsiveOptions` 是 `[mediaQuery, options]` 数组。`optionsProvider` 监听 `change`，匹配项 `extend` 进当前 options，再触发 `optionsChanged` → `update()`。
4. **样式在 class 上**：系列默认 `ct-series-a` 起跳；`alphaNumerate` 用 `n % 26` 生成 `a`–`z`。默认 SCSS 给 `a`–`o` 十五色，不是五种。

## 实践示例

### 案例 1：v1 最小折线

```js
import { LineChart } from "chartist"

new LineChart(".ct-chart", {
  labels: ["周一", "周二", "周三", "周四", "周五"],
  series: [[3, 5, 2, 6, 4]]
})
```

容器常加 `ct-perfect-fourth` 这类比例 class。默认 SCSS 把它们定义成音乐音程比，例如 perfect fourth = 4/5。

### 案例 2：CSS 换系列色

```css
.ct-series-a .ct-line,
.ct-series-a .ct-point { stroke: #ff5722; }
```

JS 里可以一行颜色都不写。默认样式表还预置了 `b`–`o`。

### 案例 3：responsiveOptions 与 update

```js
const chart = new LineChart(".ct-chart", data, { showArea: true }, [
  ["screen and (max-width: 640px)", { showArea: false, axisY: { offset: 0 } }]
])
chart.update(newData)
```

`update()` 会重建 SVG。只改 data 时沿用现有 `optionsProvider`；传入新 options 才会重建 provider。窗口 `resize` 也会整图重画。

## 踩过的坑

1. **把 v0 的 `Chartist.Line` 抄进 v1**：固定入口是 `new LineChart(...)`。看到 `Chartist.` 前缀先核版本。
2. **相信注释里的 cardinal 默认**：`lineSmooth: true` 实际调用 `monotoneCubic()`；要 cardinal 必须自己传入 `Interpolation.cardinal()`。
3. **以为核心带 tooltip**：`1.5.0` 没有内置悬浮层。`options.plugins` 接受函数或 `[plugin, options]`，README 仍写 v1 插件“Coming soon”。
4. **把轴标签当 SVG text**：`createLabel` 用 `foreignObject` 包 HTML `span`，CSS 选择器要按这个 DOM 写。
5. **把上千点当小图场景**：每个点都是 SVG 节点，`update` / `resize` 是全量重建。本文没有测卡顿阈值。

## 适用 vs 不适用场景

**适用**：

- 需要可点选、可加 `aria-*` 的 SVG 小图
- 设计师能直接改 `ct-` class，不想把颜色写进 JS
- 能接受 Line / Bar / Pie（含 donut option）三种图

**不适用**：

- 还在跟 v0 命名空间教程走，却按 v1 推理
- 需要雷达、散点、热力、地图——固定版本没有这些 class
- 要把未测的包体积或帧率写成选型结论
- 指望核心自带 tooltip / zoom 插件生态

## 固定版本边界

- 本文绑定 `chartist-js/chartist@4a721397994e366079573e90a792e7a647806df2`，包版本 `1.5.0`。npm latest 同号，未暴露 `gitHead`。
- 双许可是 `MIT OR WTFPL`。无 runtime 依赖。
- 本文未安装依赖、未跑 Jest / Storybook / size-limit、未在浏览器出图，状态保持 `UNVERIFIED`。

## 学到什么

1. **v1 把命名空间拆成 ESM class**——教程前缀和 import 必须对上同一条线。
2. **“CSS 主题化”依赖稳定的 `ct-series-*` 合同**——颜色表长度以 SCSS 为准，不是口播的五种。
3. **响应式 options 是 media query 覆盖，不是 `width: 100%`**。
4. **默认平滑以源码分支为准**——注释写 cardinal，实现走 monotone cubic。

## 应用型自测

1. `new Chartist.Line('.ct-chart', data)` 在固定 1.5.0 是公开 API 吗？
2. `lineSmooth: true` 默认用的是 cardinal 还是 monotone cubic？
3. 只调用 `chart.update(newData)`、不传 options 时，已匹配的 media query 覆盖还在吗？

检查点：

1. 不是。公开入口是 `LineChart` / `BarChart` / `PieChart`。
2. 实现走 `monotoneCubic()`。
3. 在。data-only `update` 继续用现有 `optionsProvider.getCurrentOptions()`。

## 延伸阅读

- 文档：[chartist.dev](https://chartist.dev/)
- 固定源码：[chartist-js/chartist](https://github.com/chartist-js/chartist) —— 本文绑定提交 `4a721397994e366079573e90a792e7a647806df2`
- [[chart-js]] —— Canvas 入门路线对照
- [[d3]] —— SVG 数据驱动祖师
- [[billboard-js]] —— 配置对象 + D3 模块，图类型更多
- [[recharts]] —— React 声明式 SVG

## 关联

- [[chart-js]] —— Canvas 派代表
- [[d3]] —— SVG + 数据驱动
- [[recharts]] —— React + SVG
- [[echarts]] —— 配置式，但走 Canvas + 海量图类型
- [[billboard-js]] —— 同主题配置式图表，绑定 D3 模块与可选 canvas

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amcharts5]] —— amCharts 5 — TypeScript 重写的商业级图表库
- [[dhtmlx-gantt]] —— DHTMLX Gantt — 给企业级排期用的全功能甘特组件
- [[frappe-gantt]] —— Frappe Gantt — 200 行 SVG 写出的甘特图
- [[pdfmake]] —— pdfmake — 用对象树声明 PDF，浏览器和 Node 都能跑
