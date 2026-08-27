# Chartist + billboard.js source review (writer FL)

> 用途：记录 `chartist` 与 `billboard-js` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fl` 标记 2026-08-27 平行 writer FL，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL FL
- evidence：GitHub metadata、npm provenance 与固定提交静态源码阅读
- not executed：未安装两仓依赖，未在浏览器渲染，未运行 Jest / Vitest / Storybook / size-limit，未测 bundle / 帧率 / 吞吐
- worktrees：本机 `research-worktrees/chartist` 与 `research-worktrees/billboard-js`（gitignored blob-filtered sparse clone），不进入 Git
- slugs：仓库笔记 slug 仍为 `chartist` 与 `billboard-js`

## Chartist

- canonical source：`https://github.com/chartist-js/chartist`
- tag：`v1.5.0`（lightweight tag）
- revision：`4a721397994e366079573e90a792e7a647806df2`
- package：`chartist@1.5.0`（`MIT OR WTFPL`）
- npm：`chartist@1.5.0` latest，无 `gitHead`；`package.json` version 与 tag 一致
- engines：`node >=14`；无 runtime `dependencies`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/charts/index.ts`
  - `src/charts/BaseChart.ts`
  - `src/charts/LineChart/LineChart.ts`
  - `src/charts/PieChart/PieChart.ts`
  - `src/core/creation.ts`
  - `src/core/optionsProvider.ts`
  - `src/core/constants.ts`
  - `src/core/lang.ts`
  - `src/core/types.ts`
  - `src/interpolation/index.ts`
  - `src/styles/_settings.scss`
- observed：
  - 公开入口只导出 `LineChart` / `BarChart` / `PieChart` 与 `Interpolation`、`Svg`、轴和工具函数；没有 `Chartist.Line` 命名空间 API；
  - `BaseChart` 用 `setTimeout(..., 0)` 推迟首次 `initialize()`，同容器用 `WeakMap` 先 `detach()` 旧实例；`initialize` 挂 `window.resize` 并重建整棵 SVG；
  - `update()` 注释写明当前是 full reconstruction，不是增量 path patch；
  - `optionsProvider` 对 `responsiveOptions` 的每个 media query 调 `matchMedia` 并监听 `change`，匹配项 `extend` 进当前 options；
  - `lineSmooth === true` 走 `monotoneCubic()`，`false` 走 `none()`；注释仍写 cardinal，与实现不一致；
  - 轴标签用 `foreignObject` + HTML `span`，不是 SVG `<text>`；
  - 系列 class 为 `ct-series-${alphaNumerate(i)}`，`alphaNumerate` 是 `String.fromCharCode(97 + (n % 26))`；默认 SCSS 给 `a`–`o` 十五色；
  - `PieChart` 用 `donut: true` 切到描边圆环，不是第四种 chart class；
  - 核心无 tooltip；`options.plugins` 接受 `plugin` 或 `[plugin, options]`。

## billboard.js

- canonical source：`https://github.com/naver/billboard.js`
- tag：`4.0.3`（lightweight tag）
- revision：`f599730a0a0428ab4717c8f57b826d1cf9beff63`
- package：`billboard.js@4.0.3`（MIT）
- npm：`billboard.js@4.0.3` latest，`gitHead` 与 tag 提交一致
- dependencies：一组 `d3-*` 模块（`d3-selection@^3`、`d3-scale@^4`、`d3-shape@^3` 等），不是单一 `d3` 包
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG-v4.md`
  - `MODULE_IMPORTS.md`
  - `src/index.ts`
  - `src/index.esm.ts`
  - `src/index.canvas.ts`
  - `src/core.ts`
  - `src/Chart/Chart.ts`
  - `src/Chart/api/chart.ts`
  - `src/config/Options/common/main.ts`
  - `src/config/resolver/shape/index.ts`
  - `src/config/resolver/shape/line.ts`
  - `src/config/const.ts`
  - `types/index.d.ts`
- observed：
  - `bb.generate(config)` 把 `bb.defaults` 与传入 config merge 后 `new Chart`；`bindto` 默认 `"#chart"`；
  - ESM 入口 `src/index.esm.ts` 只 re-export resolver，不再自动安装 shape / interaction / optional API；UMD `src/index.ts` 会调用全部 shape、interaction，以及 `exportApi` / `flow` / `grid` / `regions` / `category` / `canvas`；
  - `line()` 等 resolver 首次调用把模块挂到 prototype，返回值是类型字符串（如 `"line"`），之后可写 `data.type: "line"`；
  - v4 从默认 ESM 拆出的 optional API 是 `exportApi`、`flow`、`grid`、`regions`、`category`；缺 import 时走 stub 报明确错误；
  - 固定提交的 SVG shape 常量是 area 族、bar、bubble、candlestick、donut、funnel、gauge、line、pie、polar、radar、scatter、spline、step、treemap；没有 sunburst / sankey；
  - canvas 入口 `billboard.js/canvas` 另装 canvas shape；`render.mode: canvas()` 才切渲染器；canvas 支持 axis 族与 treemap，不包含 pie / donut / gauge / polar / radar；
  - `resize.auto` 默认 `true`，还可 `"parent"` / `"viewBox"` / `false`；`chart.resize()` 是显式改 `size_*` 再 `flush`；
  - README 主题文件是 datalab / dark / insight / graph / modern，另加默认 `billboard.css`；
  - `ChartOptions` 定义在 `types/options.d.ts`。
