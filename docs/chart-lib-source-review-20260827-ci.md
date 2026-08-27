# Chart library source review CI

> 用途：记录 Apache ECharts、Plotly.js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer CI
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装各仓依赖，未运行上游 test、dev server、bundle、Canvas/SVG/WebGL 渲染或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target pair：既有 slug `echarts` 与 `plotly-js`
- fallback unused：未改其他 chart slug；未触及开放 PR 中的 `d3` / `chart-js`

## Apache ECharts

- canonical source：`https://github.com/apache/echarts`
- revision：`c5a48f5f97d23e5379720870b8444cd05b50ffb4`
- release tag / package：`6.1.0` / `echarts@6.1.0`
- companion：`zrender@6.1.0`（`package.json` dependencies 与 `src/core/echarts.ts` 的 `dependencies.zrender` 一致）
- inspected：
  - `package.json`
  - `src/echarts.ts`
  - `src/echarts.all.ts`
  - `src/export/core.ts`
  - `src/core/echarts.ts`
  - `src/processor/dataSample.ts`
  - `src/chart/line/LineSeries.ts`
  - `src/data/SeriesData.ts`
  - `src/util/types.ts`
- observed：
  - `version` 导出为 `6.1.0`；`package.json` 是 `type: module`，运行时依赖只有 `tslib@2.3.0` 与 `zrender@6.1.0`；
  - 默认 `exports["."].import` 指向 `index.js`（全量）；`echarts/core` 只导出 core API，图表与渲染器要 `use()`；
  - `src/echarts.ts` 默认 `use([CanvasRenderer, DatasetComponent])` 并安装 label layout；`src/echarts.all.ts` 再注册 SVGRenderer 与 22 个 chart installer（含 pictorialBar / chord / custom）；
  - `init(dom, theme, opts)`：非 SSR 时同一 DOM 已有实例会返回该实例（DEV 警告），不会再建第二个；`opts.renderer` 默认 `'canvas'`；`opts.ssr` 跳过 DOM 尺寸检查；
  - `setOption` 默认 `notMerge=false`；也可传 `{notMerge, lazyUpdate, silent, replaceMerge, transition}`；主过程中再次 `setOption` 会被拒绝；
  - `dispose` 先处置 component/chart view，再 `zr.dispose()`，并从 `instances` 删除；`resize` 只调 `zr.resize`，源码没有 ResizeObserver；
  - line 的 `sampling` 默认 `'none'`；`dataSample` 仅在 `cartesian2d`、点数 `>10` 且 `rate>1` 时下调采样；`lttb` / `minmax` / `average` / `min` / `max` / `sum` / 自定义函数是显式选项，不是自动百万点路径。
- provenance：
  - GitHub tag `6.1.0` 指向 `c5a48f5f97d23e5379720870b8444cd05b50ffb4`，与 npm `echarts@6.1.0` 的 `gitHead` 一致；
  - npm latest 仍为 `6.1.0`。

## Plotly.js

- canonical source：`https://github.com/plotly/plotly.js`
- revision：`e020cc00ef4eb3b0b7fbf25871c2f818e73a04ce`
- release tag / package：`v4.0.0` / `plotly.js@4.0.0`
- inspected：
  - `package.json`
  - `src/version.js`
  - `src/core.js`
  - `src/plot_api/plot_api.js`
  - `src/plot_api/plot_config.js`
  - `src/plot_api/index.js`
  - `src/plot_api/to_image.js`
  - `src/snapshot/index.js`
  - `lib/index.js`
  - `lib/index-basic.js`
  - `lib/index-cartesian.js`
  - `CHANGELOG.md`
  - `CUSTOM_BUNDLE.md`
- observed：
  - `src/version.js` 与 npm 均为 `4.0.0`；`engines.node` 为 `>=22.0.0`；默认入口 `lib/index.js`；
  - `src/core.js` 只 `register` `scatter`；完整 `lib/index.js` 再注册 bar/box/heatmap/…/`quiver` 等 traces，以及 `scattermap` / `choroplethmap` / `densitymap`，没有 `*mapbox`；
  - `_doPlot` 接受 `(gd, data, layout, config)`，或把第一个数据参数当成 `{data, layout, config, frames}` figure；
  - `newPlot` 先 `Plots.cleanPlot` + `Plots.purge`，再 `_doPlot`；`react` 在已有 plot div 上 diff `layout`/`data`，`config` 变化则先 `newPlot` 再 `react`；
  - `toImage` 默认 `format='png'`，枚举还有 `jpeg` / `webp` / `svg` / `full-json`；
  - v4 changelog 删除 `scattermapbox` / `choroplethmapbox` / `densitymapbox` 与 `mapboxAccessToken`，丢掉 MathJax v2，颜色处理改 `culori`；
  - 预置 partial bundle：`index-basic`（scatter+bar+pie）、`cartesian`、`geo`、`gl2d`、`gl3d`、`map`、`finance`、`strict`；自定义 bundle 说明 `scatter` 目前仍会进入所有 bundle。
- provenance：
  - GitHub tag `v4.0.0` 指向 `e020cc00ef4eb3b0b7fbf25871c2f818e73a04ce`，与 npm `plotly.js@4.0.0` 的 `gitHead` 一致；
  - npm latest 仍为 `4.0.0`。
