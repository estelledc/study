# Visualization source review AO

> 用途：记录 D3、Chart.js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer AO
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装各仓依赖，未运行上游 test、dev server、bundle、Canvas/SVG 渲染或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target pair：既有 slug `d3` 与 `chart-js`
- fallback unused：未改其他 viz slug；未触及开放 PR 中的 `threejs` / `pixi`

## D3

- canonical source：`https://github.com/d3/d3`
- revision：`1f8dd3b92960f58726006532c11e9457864513ec`
- release tag / package：`v7.9.0` / `d3@7.9.0`
- companion packages locked by `yarn.lock` at the same umbrella revision（实现不在 umbrella `src/`）：
  - `d3-selection@3.0.0` / `d3/d3-selection@91245ee124ec4dd491e498ecbdc9679d75332b49`
  - `d3-scale@4.0.2` / `d3/d3-scale@83555bd759c7314420bd4240642beda5e258db9e`
  - `d3-shape@3.2.0` / `d3/d3-shape@8ec82658454750cfa29efb1e0ea514e3dd9b2297`
- inspected：
  - `package.json`
  - `src/index.js`
  - `yarn.lock`
  - `test/d3-test.js`
  - `docs/what-is-d3.md`
  - `../d3-selection/src/select.js`
  - `../d3-selection/src/selection/data.js`
  - `../d3-selection/src/selection/join.js`
  - `../d3-selection/src/selection/enter.js`
  - `../d3-scale/package.json`
  - `../d3-scale/src/index.js`
  - `../d3-scale/src/linear.js`
  - `../d3-scale/src/continuous.js`
  - `../d3-shape/package.json`
  - `../d3-shape/src/line.js`
  - `../d3-shape/src/path.js`
  - `../d3-shape/src/pie.js`
- observed：
  - umbrella `d3@7.9.0` 的 `src/index.js` 只 `export *` 30 个独立模块；自身测试断言每个依赖的 named export 都出现在 `d3` 命名空间；
  - `engines.node` 为 `>=12`；`type` 为 `module`；默认 export 指向 `src/index.js`，UMD 走 `dist/d3.min.js`；
  - `d3.select(selector)` 在字符串路径调用 `document.querySelector`，并构造 `Selection`；
  - `selection.data(value, key)` 把数据写到 `node.__data__`；无 key 时按索引 `bindIndex`，有 key 时用 `Map` 做 `bindKey`，重复 key 进 exit；
  - `selection.join(onenter, onupdate, onexit)`：`onenter` 为字符串时 `enter.append(name)`；未给 `onexit` 时默认 `exit.remove()`；返回 `enter.merge(update).order()`；
  - `scaleLinear` 建立在 `continuous()` 上，再挂 `ticks` / `tickFormat` / `nice`；`clamp` 默认关闭；`invert` 用数值插值反解；默认 `interpolate` 来自 `d3-interpolate`，颜色字符串可走同一通道；
  - `d3-scale@4.0.2` 导出 linear/log/symlog/pow/sqrt/radial/identity、band/point、ordinal、quantile/quantize/threshold、time/utc，以及 sequential/diverging 变体，不能再写成“一共 13 种”；
  - `d3.line()` 默认用 `d3-path` 缓冲成 path 字符串；设置 `context` 后改为向 Canvas-like 接口推 `lineStart` / `point` / `lineEnd`；
  - `d3.pie()` 返回带 `startAngle` / `endAngle` / `padAngle` 的弧描述数组，本身不生成 path；path 由 `d3.arc()` 另算。
- provenance：
  - GitHub annotated tag `v7.9.0` 解引用到 `1f8dd3b92960f58726006532c11e9457864513ec`，与 npm `d3@7.9.0` 的 `gitHead` 一致；
  - npm latest 仍为 `7.9.0`；
  - 三份 companion 的 annotated tag 均与对应 npm `gitHead` 一致；它们是 lockfile 解析结果，不能把 `7.9.0` 外推成这些子包的版本号。

## Chart.js

- canonical source：`https://github.com/chartjs/Chart.js`
- revision：`9c5cf9fac7ec04a71b516e2aff3f7d76876be369`
- release tag / package：`v4.5.1` / `chart.js@4.5.1`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/core/index.ts`
  - `src/core/core.controller.js`
  - `src/core/core.plugins.js`
  - `src/core/core.registry.js`
  - `src/core/core.defaults.js`
  - `src/plugins/index.js`
  - `src/plugins/plugin.decimation.js`
  - `src/controllers/index.js`
  - `src/controllers/controller.line.js`
  - `src/helpers/helpers.dom.ts`
  - `auto/auto.js`
- observed：
  - `new Chart(item, userConfig)` 经 `getCanvas` 解开 canvas / context / 元素 id；同一 canvas 已有实例会抛错；
  - 构造后走 `_initialize`：`beforeInit` → 可选 `resize()` / `retinaScale` → `bindEvents` → `afterInit`；`attached` 时立刻 `update()`；
  - `update()` 主链：刷新 config resolver → `_updateScales` → `beforeUpdate` → 构建/更新 controller → `beforeElementsUpdate` → layout → dataset update → `afterUpdate` → `render()`；
  - `draw()` 先 `clearCanvas`，再按 layer `z` 把 `z<=0` 的层画在 datasets 前，其余画在后；`afterDraw` 在全部层之后；
  - 默认 `responsive=true`、`maintainAspectRatio=true`、`parsing=true`；`Chart.defaults.global` 已不存在；
  - 默认入口不注册 controller；`chart.js/auto` 执行 `Chart.register(...registerables)`，`registerables` 含 controllers、elements、plugins、scales；
  - 未注册类型会在 `registry.getController` 抛 `'"line" is not a registered controller.'` 这类错误；
  - 内置 controller：bar / bubble / doughnut / line / polarArea / pie / radar / scatter；
  - 内置 plugin：Colors / Decimation / Filler / Legend / SubTitle / Title / Tooltip；
  - plugin 生命周期含 `install`/`start`、update/layout/draw 钩子、`resize`、`uninstall`/`stop`；`notify` 在 cancelable hook 上遇到 `false` 会中断；
  - decimation 默认 `enabled=false`、`algorithm='min-max'`；启用后还要求 line-like controller 的 `supportsDecimation`、x 轴为 linear/time、`parsing` 关闭，阈值默认 `4 * chart.width`，不是固定“1 万点”；
  - `retinaScale` 用 `devicePixelRatio` 设 canvas 像素宽高并 `setTransform`；CSS 尺寸与像素尺寸分离；
  - 运行时依赖只有 `@kurkle/color`；源码是 JS/TS 混写，不能说成“v4 整库 TypeScript 重写”；
  - `packageManager` 为 `pnpm@8.13.0`，`engines` 只约束 `pnpm>=8`，没有 Node engines 字段。
- provenance：
  - GitHub lightweight tag `v4.5.1` 指向 `9c5cf9fac7ec04a71b516e2aff3f7d76876be369`，与 npm `chart.js@4.5.1` 的 `gitHead` 一致；
  - npm latest 仍为 `4.5.1`。
