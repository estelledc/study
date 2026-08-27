# Highcharts / visx source review

> 用途：记录 Highcharts、visx 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EA
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、dev server、WebGL boost 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- fallback：未使用。`highcharts` 原先没有项目页，`visx` 是 legacy 教程页；两 slug 都不在开放 PR 中。未改 `d3` / `chart-js` / `echarts` / `plotly-js` / `victory` / `nivo`。

## Highcharts

- canonical source：`https://github.com/highcharts/highcharts`
- revision：`69edf8952a04b9872b6510fbdacd7dff8b03970b`
- git tag：`v13.0.2`（annotated tag 剥到上述 commit）
- package：源码仓 `package.json` 报 `highcharts@13.0.2` 且 `private: true`
- inspected：
  - `package.json`
  - `license.txt`
  - `readme.md`
  - `ts/masters/highcharts.src.ts`
  - `ts/Core/Chart/Chart.ts`
  - `ts/Core/Chart/ChartDefaults.ts`
  - `ts/Core/Defaults.ts`
  - `ts/Core/Series/Series.ts`
  - `ts/Extensions/Boost/Boost.ts`
  - `ts/Extensions/Boost/BoostSeries.ts`
  - `ts/Extensions/Boost/BoostChart.ts`
- observed：
  - `Highcharts.chart` 是 `Chart.chart` 工厂：`new Chart(...)` 后返回 `chart.promise ?? chart`；
  - 构造器在没有 `doc` 时记 error 36 并提前返回；`renderTo` 可以是第一参数，也可以是 `options.chart.renderTo`；
  - `callback === true` 时设置 `chart.promise`，工厂因此返回 Promise；
  - 默认主入口挂 `SVGRenderer`，并 compose Line / Area / Spline / AreaSpline / Column / Bar / Scatter / Pie；
  - Stock / Maps / Gantt / 3D / more 是另一些 `ts/masters/*` 入口，不在默认 `highcharts.src.ts`；
  - `Chart.update` 先 `diffObjects`，无变化则直接返回；`oneToOne` 默认 false；`redraw ?? true`；
  - `Series.setData` 默认 `redraw=true`，写入 `DataTable`；`chart.allowMutatingData` 为假时深拷贝；boosted series 不走 `matchPoints`；
  - Boost 是独立 `modules/boost`：WebGL 上下文探测，`boostThreshold` 默认 5000，`boost.seriesThreshold` 默认 50。
- provenance：
  - GitHub source tag `v13.0.2` 与仓内 `package.json` 版本一致，revision 可达；
  - npm `highcharts@13.0.2` 的 `repository` 是 `highcharts/highcharts-dist`，`gitHead` 为 `387b98dfc3063decedbb89e2a99b7a0253a83022`，该 SHA 不在 source repo；
  - 本页绑定 source working repo，不把 dist 包当成源码审查对象；
  - `license.txt` 指向 Highsoft 商业许可，readme 自称 source-available。

## visx

- canonical source：`https://github.com/airbnb/visx`
- revision：`78839796081beb0370fc928cc922b21908bbabaf`
- git tag：`v4.0.0`
- package：`@visx/scale@4.0.0` / `@visx/shape@4.0.0` / `@visx/responsive@4.0.0` / `@visx/zoom@4.0.0` / `@visx/xychart@4.0.0`
- inspected：
  - `package.json`
  - `packages/visx-scale/package.json`
  - `packages/visx-scale/src/index.ts`
  - `packages/visx-scale/src/scales/linear.ts`
  - `packages/visx-scale/src/operators/scaleOperator.ts`
  - `packages/visx-shape/src/shapes/Bar.tsx`
  - `packages/visx-responsive/src/components/ParentSize.tsx`
  - `packages/visx-responsive/src/hooks/useParentSize.ts`
  - `packages/visx-zoom/package.json`
  - `packages/visx-zoom/src/Zoom.tsx`
  - `packages/visx-vendor/package.json`
  - `packages/visx-xychart/src/index.ts`
- observed：
  - `@visx/scale` 用 `@visx/vendor/d3-scale` 创建 d3 scale，再按 `scaleOperator` 顺序套 domain → nice → zero → interpolate → round → range → reverse；
  - `Bar` 只渲染带 `visx-bar` class 的 `<rect>`，坐标与尺寸全是 SVG 属性；
  - `ParentSize` 用 ResizeObserver；`useParentSize` 默认 `debounceTime=300`、`enableDebounceLeadingCall=true`、初始宽高 0；
  - `Zoom` 把 `transformMatrix` 放在 React state，`toString()` 写成 SVG `matrix(...)`；默认 `scaleXMin/scaleYMin=0`、`scaleXMax/scaleYMax=Infinity`；手势走 `@use-gesture/react`；
  - `@visx/zoom` peer 为 React `^18 || ^19`；
  - `packages/` 在此提交有 38 个 `visx-*` 目录（含 `visx-demo` 与 umbrella `visx-visx`）；
  - `@visx/xychart` 导出 `XYChart` 与一组 series，不是“只有散装原语”。
- provenance：
  - Git tag `v4.0.0` 与 npm `@visx/scale@4.0.0` / `@visx/shape@4.0.0` / `@visx/zoom@4.0.0` 的 `gitHead` 同为 `78839796...`。
