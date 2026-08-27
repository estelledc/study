---
title: anime.js — 把 CSS / SVG / 对象写成同一条时间线
来源: https://github.com/juliangarnier/anime
日期: 2026-05-30
分类: 前端
难度: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/juliangarnier/anime
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2c9cf8ea00329f6768c7d7902252ed977d75ce42
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.5.0
---

## 是什么

anime.js（npm 包名 `animejs`）是一个 JavaScript 动画引擎：把「选哪些目标、动哪些属性、持续多久、用什么曲线」写成一份参数，由引擎按帧插值。日常类比：它像剪辑软件的时间线——你标出起点、终点和节奏，播放器负责中间帧。

你写：

```js
import { animate } from 'animejs'

const anim = animate('.box', {
  translateX: 250,
  duration: 1000,
  ease: 'out(2)',
})
```

固定 4.5.0 里，`animate(targets, parameters)` 构造 `JSAnimation` 并立刻 `.init()`。默认时长是 `1000` ms，默认缓动是字符串 `'out(2)'`（幂次 out，指数 2），默认 `autoplay: true`。CSS、SVG attribute、DOM、普通对象数值走同一套 tween。

## 为什么重要

不按固定 v4 源码读，下面这些旧印象会对不上：

- 网上大量 `anime({ targets, easing: 'easeInOutQuad' })` 是 v3 上帝函数，4.5.0 入口是 `animate` / `createTimeline` / `createTimer`
- 默认缓动不是 `inOutQuad`，而是 `globals.defaults.ease = 'out(2)'`
- 目标数 ≥ `1000` 且未显式 `composition` 时，会改成 `none`，不再做 sibling replace
- 滚动进场不必自己绑 `IntersectionObserver`：同仓导出 `onScroll().link(animation)`

## 核心要点

固定 4.5.0 的主链可以拆成五步：

1. **三个入口**：`animate` 做单动画；`createTimeline` 做编排；`createTimer` 只计时、不绑 DOM。三者都建立在 `Timer` 上。
2. **目标与属性分类**：`registerTargets` 解析选择器或对象；`getTweenType` 把属性分成 OBJECT / ATTRIBUTE / CSS / TRANSFORM / CSS_VAR。`x` / `y` / `z` 会映射到 `translateX` 等。
3. **引擎主循环**：浏览器用 `requestAnimationFrame`，非浏览器用 `setImmediate`。引擎默认 `pauseOnDocumentHidden = true`，`frameRate` 上限常量是 `240`。
4. **时间线位置**：`tl.add(targets, params, position)`。`position` 可以是数字、label、`'<'` / `'<<'`，或 `+=` / `-=` / `*=` 相对量。未写 position 时落到当前 `iterationDuration`（接下一段）。
5. **滚动观察**：`onScroll({ target, sync })` 默认 `sync: 'play pause'`、`enter: 'end start'`、`leave: 'start end'`；`.link(tickable)` 会先 `pause()` 被链接对象。

## 实践示例

### 案例 1：单动画与默认合同

```js
import { animate } from 'animejs'

const a = animate('.hero-title span', {
  opacity: [0, 1],
  translateY: [30, 0],
  delay: (el, i) => i * 50,
})
a.pause()
```

省略 `duration` / `ease` 时走默认 `1000` / `'out(2)'`。返回值是 `JSAnimation`（继承 `Timer`），要停必须拿住引用再 `pause()` / `cancel()`。

### 案例 2：timeline 相对位置

```js
import { createTimeline } from 'animejs'

const tl = createTimeline({ defaults: { duration: 800 } })
tl.add('.title', { opacity: [0, 1], translateY: [-50, 0] })
  .add('.subtitle', { opacity: [0, 1] }, '-=400')
  .add('.cta', { scale: [0.5, 1] }, '+=200')
```

`'-=400'` 从当前 duration 往回偏；`'<` 对齐上一段 start，不带第二个 `<` 时对齐上一段 end。`defaults` 只覆盖这条 timeline 的子动画，不会改全局 `globals.defaults`。

### 案例 3：用 onScroll 链接，而不是自己写 IO

```js
import { animate, onScroll } from 'animejs'

onScroll({
  target: '.hero-title',
  sync: 'play pause',
}).link(animate('.hero-title span', {
  opacity: [0, 1],
  translateY: [30, 0],
}))
```

`link()` 会暂停被链接动画，并在未指定 `target` 时尝试从动画的 DOM target 推断观察对象。这是仓内滚动合同，不是浏览器 `IntersectionObserver` 的封装名。

## 踩过的坑

1. **把 v3 示例直接贴进 v4**：`targets` 已是首参，`easing` 改 `ease`，`easeInOutQuad` 虽仍能被 `parseEaseString` 解析，但默认值是 `'out(2)'`。
2. **`spring(...)` 不是四个位置参数**：固定源码是 `spring({ mass, stiffness, damping, velocity, bounce, duration })`；默认 `mass=1`、`stiffness=100`、`damping=10`、`velocity=0`、`bounce=0.5`、`duration=628`。弹簧会覆盖 tween 的 `duration` 为 `settlingDuration`。
3. **`ease: "cubicBezier(...)"` 字符串已被移出核心**：`parseEase` 会 `console.warn` 并退回 `none`；要直接传入函数。
4. **大批量目标的 composition**：≥1000 个 target 且未写 `composition` 时走 `none`，重叠属性不会 replace sibling。
5. **忘记存返回值**：`animate()` 本身不登记到你的变量表；要停、要 `revert()`，必须握住 controller。

## 适用 vs 不适用场景

**适用**：

- vanilla / Astro / 静态页需要一条可编程时间线
- 同一套写法同时动 CSS transform、SVG 和普通对象
- 需要仓内 `onScroll` / `splitText` / `svg` / 可选 `adapters/three`

**不适用**：

- 必须声明式 React 组件树——对照 [[framer-motion]]，不要把 hook 合同外推到本页
- 需要本轮未核验的固定 bundle、帧率或与 GSAP 的快慢结论
- 想绑定上游 `5.0.0-beta.1` 分支——该线存在，但本文只钉 4.5.0

## 固定版本边界

- 本文绑定 `juliangarnier/anime@2c9cf8ea00329f6768c7d7902252ed977d75ce42`。lightweight tag `v4.5.0` 与 npm `animejs@4.5.0` 的 `gitHead` 都指向该提交。
- 包是 ESM，`license` 为 MIT；`three` 是 optional peer（`>=0.150.0`）。
- 远端另有 `5.0.0-beta.1` 分支，未绑定、未阅读。
- 本文未安装依赖、未跑浏览器套件或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **v4 把上帝函数拆成 Timer 家族**——单动画、时间线、纯计时共享同一套 pause / cancel。
2. **默认值以 `globals.defaults` 为准**——不要用旧文档的 `inOutQuad` 当出厂合同。
3. **composition 在大批量目标上会换策略**——这是创建路径上的性能开关，不是你显式写了 `replace`。
4. **滚动是一等模块**——`onScroll` 的默认 sync 是 `'play pause'`，和自己写 IO 不是同一条 API。

## 应用型自测

1. 省略 `ease` 时，4.5.0 实际用哪条默认缓动字符串？
2. `animate()` 的返回值是什么类？没存变量时还能 `pause()` 吗？
3. 目标数达到多少且未写 `composition` 时，会改成 `none`？

检查点：

1. `'out(2)'`。
2. `JSAnimation`（继承 `Timer`）。不能；必须握住返回值。
3. `1000`。

## 延伸阅读

- 官网：[animejs.com](https://animejs.com/)
- 固定源码：[juliangarnier/anime](https://github.com/juliangarnier/anime) —— 本文绑定提交 `2c9cf8ea00329f6768c7d7902252ed977d75ce42`
- 对照入口：`src/animation/animation.js`、`src/timeline/timeline.js`、`src/core/globals.js`、`src/events/scroll.js`
- [[gsap]] —— 同主题时间线，许可与默认值不同
- [[framer-motion]] —— React 声明式对照

## 关联

- [[gsap]] —— Tween / Timeline 对照 anime 的 Timer 家族
- [[framer-motion]] —— 组件树里的 variant / AnimatePresence
- [[lottie]] —— 设计师导出 JSON 再播放，不是属性 tween
- [[motion-one]] —— 更靠近 WAAPI 的另一条路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[fabric-js]] —— Fabric.js — 给 Canvas 加一层"对象模型"，让画布图形可以拖
- [[gsap]] —— GSAP — GreenSock 高性能动画
- [[konva]] —— Konva — 给 HTML5 Canvas 装一棵会响应的节点树
- [[motion-one]] —— Motion One — 把动画交给浏览器自己跑
- [[phaser]] —— Phaser — HTML5 2D 游戏框架
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
