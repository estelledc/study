# anime.js + ApexCharts source review (writer FE)

> 用途：记录 `anime` 与 `apexcharts` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fe` 标记 2026-08-27 平行 writer FE，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FE
- assigned pair：anime + apexcharts（`juliangarnier/anime`、`apexcharts/apexcharts.js`）
- evidence：GitHub metadata、npm package metadata、blob-filtered 固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test / 浏览器动画 / 图表渲染 / SSR hydrate，未测 bundle、帧率、点数或任何性能数字
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- forbidden slugs not touched：act/age、aframe/3d-force-graph、ast-grep/asdf、axum/actix-web、babylonjs/cesium、bat/bottom、box2d/cannon-es、capacitor/boa-engine、chartist/billboard-js、automerge/yjs、caddy/centrifugo、altair/bokeh、annoy/ann-benchmarks、anchor/ape-framework、buildah/buildkit，以及已有 `docs/*-source-review-20260827-*.md` 或 benchmark-aligned 的 slug

## 选题

- `data/project-standard-audit.json` 中两页均为 `needs-evidence`，canonical 分别为 `https://github.com/juliangarnier/anime` 与 `https://github.com/apexcharts/apexcharts.js`。
- origin/main 上两页均无 `trust.immutable_revision`，也没有对应 receipt。
- 未改写 `framer-motion` / `gsap`（writer AD 已占用）或任何图表 wrapper 仓。

## anime.js

- canonical source：`https://github.com/juliangarnier/anime`
- tag：lightweight `v4.5.0` 直接指向 revision
- revision：`2c9cf8ea00329f6768c7d7902252ed977d75ce42`
- package：`animejs@4.5.0`，npm `gitHead` 与 tag / `package.json` 版本一致
- license：MIT
- also observed：远端存在 `5.0.0-beta.1` 分支；未绑定、未阅读
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/core/consts.js`
  - `src/core/globals.js`
  - `src/animation/animation.js`
  - `src/timeline/timeline.js`
  - `src/timeline/position.js`
  - `src/timer/timer.js`
  - `src/engine/engine.js`
  - `src/utils/stagger.js`
  - `src/easings/eases/parser.js`
  - `src/easings/spring/index.js`
  - `src/events/scroll.js`
  - `src/text/split.js`
- observed：
  - 入口是 `animate` / `createTimeline` / `createTimer`，不是 v3 的 `anime({ targets })`；
  - `globals.defaults`：`duration: 1000`、`ease: 'out(2)'`、`autoplay: true`、`composition: replace`、`loop: 0`；
  - `animate()` 返回 `new JSAnimation(...).init()`；`JSAnimation` 继承 `Timer`，`pause` / `cancel` / `revert` 在 Timer 上；
  - 未写 `composition` 且 `targets.length >= 1000` 时改用 `compositionTypes.none`；
  - `parseEaseString` 仍认识 `inOutQuad` 等 Penner 名；`cubicBezier(` / `steps(` / `linear(` / `irregular(` 字符串会 warn 并退回 `none`；
  - `spring({ mass, stiffness, damping, velocity, bounce, duration })`，不是四个位置参数；弹簧把 tween duration 换成 `settlingDuration`；
  - timeline `add(targets, params, position)`；`'<` 对齐上一段 end，`'<<'` 对齐 start；相对算子是 `+=` / `-=` / `*=`；
  - 引擎浏览器用 `requestAnimationFrame`，非浏览器用 `setImmediate`；`pauseOnDocumentHidden = true`；
  - `onScroll` 默认 `sync: 'play pause'`、`enter: 'end start'`、`leave: 'start end'`；`link()` 会先 pause 被链接对象；
  - `splitText` / `split`、`svg`、`waapi`、optional `adapters/three`（peer `three >= 0.150.0`）同仓导出。
- not claimed：bundle 体积、相对 GSAP 的快慢、下载量、star、v5 beta 行为。

## ApexCharts

- canonical source：`https://github.com/apexcharts/apexcharts.js`
- tag：annotated `v7.0.0` → tag object `02547501cf07bc08914890d75e46ed30e459b42d`，peeled commit 与 revision 一致
- revision：`1579e97ce9bb7eeca9f35f969259f10fff6e00a2`
- package：`apexcharts@7.0.0`，npm `gitHead` 与 peeled tag 一致
- license：`SEE LICENSE IN LICENSE`（Community / Commercial，年收入 200 万美元门槛）；不是 MIT
- runtime dependency：`apex-commons@^0.5.0`
- engines：`node ^20.19.0 || ^22.12.0 || >=24.0.0`（README 另写 SSR Node 18+，以 package.json 为准）
- inspected：
  - `package.json`
  - `LICENSE`
  - `README.md`
  - `src/apexcharts.js`
  - `src/modules/Core.js`
  - `src/modules/settings/Options.js`
  - `src/modules/settings/Defaults.js`
  - `src/modules/settings/Config.js`
  - `src/modules/Responsive.js`
  - `src/modules/license/LicenseEnforcer.js`
  - `src/modules/annotations/XAxisAnnotations.js`
  - `src/renderers/Renderer.js`
  - `src/ssr/index.js`
- observed：
  - 构造经 `Base` 合并默认值；默认 `chart.type = 'line'`、`toolbar.show = true`、`animations.enabled = true`（`speed: 800`，`respectReducedMotion: true`）、`chart.renderer = 'svg'`、`rendererThreshold = 8000`；
  - `render()` 缺 `chart` 则 reject；已有 `_renderPromise` 时直接返回该 Promise（幂等）；`destroy()` 把它置 `null`；
  - `destroy()` 移除 window / parent resize 监听、`clearTimeout(resizeTimer)`、teardown watermark、按 `chart.id` 从 `Apex._chartInstances` 删除；
  - `updateSeries` 非数组会 warn 并 `Promise.resolve(this)`；`updateOptions` 的非数组 `series` 会被删掉再继续合并；
  - `responsive` 用 `window.innerWidth`（`> 0` 否则 `screen.width`）；
  - `sparkline.enabled` 套 `Defaults.sparkline()`：关 grid / legend / x 轴标签刻度 / toolbar / zoom，并 `hideYAxis()`；
  - canvas 是 `apexcharts/features/renderer-canvas`；未打包或 fill 为 pattern / image / gradient 时回退 SVG；轴与 annotation 仍走 SVG；
  - `LicenseEnforcer` 只在 premium 功能实际使用时打水印（`unit` / storyboard / link / ink / measure / context-menu / perspectives / history）；注释写明不 throw、不禁用功能、客户端可绕过；
  - SSR 入口 `apexcharts/ssr` 挂 `renderToString` / `renderToHTML`；水合在 `hydrate` / `hydrateAll`；
  - 条件 exports 按 chart type 与 `features/*` 拆包；默认 `apexcharts` 入口是全量。
- not claimed：bundle 体积、50k/数十万点是否掉帧、wrapper 行数、star、任何运行时渲染结果。
