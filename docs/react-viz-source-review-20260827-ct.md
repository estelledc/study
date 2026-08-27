# React visualization source review (CT)

> 用途：记录 Victory、nivo 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer CT
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、浏览器渲染或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Victory

- canonical source：`https://github.com/FormidableLabs/victory`
- revision：`d9d9ca2d5038d6ef9de91f2cef39e6fb2733baa6`
- package：`victory@37.3.6`
- Git tag：`v37.3.6` 指向同一提交
- npm：`victory@37.3.6` 未发布 `gitHead`；子包 `victory-core` / `victory-chart` / `victory-bar` 的 `package.json.version` 均为 `37.3.6`
- inspected：
  - `packages/victory/src/index.ts`
  - `packages/victory/package.json`
  - `packages/victory-core/package.json`
  - `packages/victory-core/src/victory-container/victory-container.tsx`
  - `packages/victory-core/src/victory-util/common-props.tsx`
  - `packages/victory-core/src/victory-util/data.ts`
  - `packages/victory-core/src/victory-util/domain.ts`
  - `packages/victory-core/src/victory-util/scale.ts`
  - `packages/victory-chart/src/victory-chart.tsx`
  - `packages/victory-bar/src/victory-bar.tsx`
  - `packages/victory-create-container/src/create-container.tsx`
- observed：
  - umbrella `victory` 只做 `export *` 聚合，实际实现分布在 `victory-*` 子包；
  - `VictoryChart` 默认 `standalone: true`、`theme: VictoryTheme.grayscale`，缺省尺寸 450×300、padding 50，并注入独立/因变量默认轴；
  - `VictoryBar` 可独立成图，默认样本数据是 `{x,y}` 四点，`getDomain` 走 `Domain.getDomainWithZero`，因此 y 域默认含 0；
  - `Data.formatData` 在未指定 accessor 时按字段名 `x` / `y` / `y0` 取值，字符串类目会建成 string map；
  - `VictoryContainer` 默认 `responsive: true`，此时 CSS 尺寸是 `100%`，`width`/`height` 只进入 `viewBox`；
  - `animate` 是 opt-in；`VictoryBar` 在开启后才走 `defaultTransitions`（onLoad 2000ms）；
  - `createContainer` 只组合 zoom / selection / brush / cursor / voronoi 这五种 web container hook；
  - d3 scale 经 `victory-vendor/d3-scale` 引入，支持 linear / time / log / sqrt 字符串名。
- provenance：GitHub tag 与仓内 package version 一致；npm 无 `gitHead`，不以 registry 反推 revision。

## nivo

- canonical source：`https://github.com/plouc/nivo`
- revision：`a2d9dab855365926cb41267eb20af154ca8fd558`
- packages：`@nivo/core@0.99.0`、`@nivo/bar@0.99.0`
- Git tag：`v0.99.0` 与 npm `gitHead` 均为该提交
- inspected：
  - `packages/core/package.json`
  - `packages/core/src/index.js`
  - `packages/core/src/components/Container.js`
  - `packages/core/src/components/ResponsiveWrapper.js`
  - `packages/core/src/hooks/useDimensions.js`
  - `packages/core/src/hooks/useMeasure.js`
  - `packages/core/src/defaults/index.js`
  - `packages/core/src/motion/context.js`
  - `packages/core/src/lib/propertiesConverters.js`
  - `packages/bar/package.json`
  - `packages/bar/src/index.ts`
  - `packages/bar/src/defaults.ts`
  - `packages/bar/src/Bar.tsx`
  - `packages/bar/src/ResponsiveBar.tsx`
  - `packages/bar/src/BarCanvas.tsx`
  - `packages/bar/src/hooks.ts`
  - `README.md`
- observed：
  - 当前入口是按图表分包的 `@nivo/*`；顶层 npm 名 `nivo@0.31.0` 停在 2017，不是本轮绑定对象；
  - `Bar` 需要显式 `width`/`height`；`ResponsiveBar` 用 `react-virtualized-auto-sizer` 测父容器，再把尺寸交给 `Bar`；
  - `useMeasure` 才走 `ResizeObserver`，且在缺失实现时返回 `null`；Responsive 路径不依赖它；
  - `commonDefaultProps`：`indexBy='id'`、`keys=['value']`、`groupMode='stacked'`、`layout='vertical'`、`colors={ scheme: 'nivo' }`；
  - SVG 默认 `animate: true`、`animateOnMount: false`、`motionConfig: 'default'`，动画由 `@react-spring/web` 的 `useTransition` 驱动；
  - Canvas 版复用 `useBar` 计算，改走 `renderBar`；`pixelRatio` 在浏览器取 `devicePixelRatio`，否则为 1；
  - `Container` 叠 Theme / Motion / Tooltip provider；`renderWrapper` 默认 true，注释写明 HTTP API 场景不要包外层 `div`；
  - README 声称 SSR 与 HTTP API，本轮未检视独立 server 包，也不把托管 PNG 服务写成已核验事实。
- provenance：GitHub `v0.99.0`、`@nivo/core@0.99.0` 与 `@nivo/bar@0.99.0` 的 `gitHead` 三方一致。
