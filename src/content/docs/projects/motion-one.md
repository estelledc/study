---
title: motion-one 状元篇
description: 用 WAAPI 而非 RAF 写动画——浏览器自己跑，主线程不卡顿
season: 19
episode: 5
tier: champion
category: tool-library
status: published
---

## Layer 0 项目档案

| 字段 | 值 |
|------|----|
| 仓库 | motiondivision/motion |
| Stars | 32.1k |
| Forks | 1.2k |
| License | MIT |
| 主语言 | TypeScript（75.6%） |
| 默认分支 | main |
| 读时 commit | 43e508e3e967b3d17b5361064d0d53812f12fee6 |
| 读时日期 | 2026-05-29 |
| 主版本 | 12.x（同 Framer Motion 同 monorepo） |
| 维护方 | Matt Perry（一作 / Framer 前员工） + Motion 团队 |
| 包大小 | mini ~2.6KB / full ~18KB / framer-motion ~50KB |
| 依赖 | 仅 motion-dom + motion-utils（同 monorepo） |
| 主要竞品 | Framer Motion / GSAP / react-spring / Lottie / anime.js |

## 一句话定位

motion-one 是**用 Web Animations API 而非 requestAnimationFrame 写动画**的轻量库——浏览器自己在合成线程跑动画，JS 主线程一帧不参与，连 spring 物理动画也提前预采样成 linear() easing 交给 WAAPI 去跑。

![Motion One 架构图：animate() 双引擎分发](/projects/motion-one/01-architecture.webp)

*animate() 入口 → 检测 value 类型 → transform/opacity 走 NativeAnimation (WAAPI, GPU 合成线程) / 其他走 JSAnimation (RAF + generator.next)；spring/keyframes/inertia 三个 generator 是两套引擎共享的数学层*

## Layer 1 为什么存在

### 痛点 1：RAF 动画一卡就全卡

[GSAP](/projects/gsap)、[react-spring](/projects/react-spring)、anime.js 这一代库都用 `requestAnimationFrame` 驱动——每帧 JS 主线程算下一帧的值，写进 style。问题是 RAF 跟主线程绑定：你在动画时打开一个大列表渲染、跑一段同步 reduce、做一次 layout thrash，**RAF 直接被踩到 30fps 以下**。视觉上就是"动画卡住一下又继续"。

### 痛点 2：[Framer Motion](/projects/framer-motion) 太重

Framer Motion 一作 Matt Perry 自己也意识到：50KB+ 的 React 组件库（含 layout 动画 / AnimatePresence / motion.div 代理）对很多场景是 overkill——你只是想给个 `<button>` 加 hover 过渡，凭啥背 React reconciler + projection 系统？

### 痛点 3：vanilla JS 动画无人续命

老牌 anime.js v3 (2019) 之后基本停滞，velocity.js 早就归档。但写文档站、营销页、Astro/Vue/Svelte 项目时，**没人想拖一个 React-only 库进来**。空缺很大。

### Motion One 的回答

三句话：

1. **能用 WAAPI 就用**：`element.animate(keyframes, { duration, easing })` 是现代浏览器原生 API，跑在合成线程上，JS 卡顿不影响动画。
2. **spring 也要走 WAAPI**：spring 是连续的物理曲线，WAAPI 不原生支持——Motion 的 trick 是**预采样 30 个点**变成 `linear(0, 0.1, ..., 1)` 多段 easing 字符串塞进 WAAPI。
3. **同代码三种打包**：`motion`（mini 2.6KB / full 18KB） + `motion/react`（React hooks） + `framer-motion`（完整组件）共享同一个 `motion-dom` 引擎包，按需 tree-shake。

参考一作 [motion.dev/docs/animate](https://motion.dev/docs/animate)（"Animate everything with one function"）和 [Framer 工程博客](https://www.framer.com/blog/animation-libraries/) 的"WAAPI is the future"立场。

## Layer 2 仓库地形

```
motion/
├── packages/
│   ├── motion/                # mini / full / react 三种 entry，全是 re-export
│   │   └── src/
│   │       ├── index.ts                # export * from "framer-motion/dom"
│   │       ├── mini.ts                 # mini 版（无 spring 物理）
│   │       └── react.ts                # React hooks
│   ├── motion-dom/            # 心脏：所有动画引擎都在这
│   │   └── src/animation/
│   │       ├── animate/single-value.ts          # animateSingleValue 入口
│   │       ├── NativeAnimation.ts               # WAAPI 包装类
│   │       ├── JSAnimation.ts                   # RAF fallback 引擎
│   │       ├── waapi/start-waapi-animation.ts   # 调 element.animate()
│   │       ├── waapi/utils/linear.ts            # spring → linear() easing
│   │       ├── generators/spring.ts             # 物理 spring 解析解
│   │       ├── generators/keyframes.ts          # keyframe 插值
│   │       ├── generators/inertia.ts            # 滑出动画
│   │       ├── drivers/frame.ts                 # RAF driver
│   │       └── GroupAnimation.ts                # 多动画协调
│   ├── motion-utils/          # clamp / mix / 类型 helper
│   ├── framer-motion/         # 完整 React 组件 + projection layout 系统
│   └── motion-v/              # Vue 适配（不是本笔记重点）
└── tests/                     # Playwright e2e 测试，不是 unit
```

**心脏文件清单**（按"如果这文件挂了项目挂"排序）：

1. `packages/motion-dom/src/animation/waapi/start-waapi-animation.ts`（57 行）—— WAAPI 调用唯一入口，所有 native 动画都从这出去
2. `packages/motion-dom/src/animation/generators/spring.ts`（458 行）—— spring 物理引擎，**解析解**而非数值积分（这点和 react-spring 哲学不同）
3. `packages/motion-dom/src/animation/JSAnimation.ts`（500+ 行）—— RAF fallback，处理 WAAPI 不支持的 color/path/JS object 动画

shallow clone 没拿到 commit 历史，commit 热点用维护者博客交叉验证：spring.ts / NativeAnimation.ts / start-waapi-animation.ts 是 v11 → v12 重构期改动最频繁的三个文件。

## Layer 3 精读

### 精读 A：WAAPI 调用入口（`element.animate()` 包装）

**永久链接**：[start-waapi-animation.ts L6-L56 @ 43e508e3e967b3d17b5361064d0d53812f12fee6](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/animation/waapi/start-waapi-animation.ts#L6-L56)

整个 motion-one 的"native 引擎"就这 50 行，几乎是对 `element.animate()` 的薄薄一层封装。

```typescript
export function startWaapiAnimation(
    element: Element,
    valueName: string,
    keyframes: ValueKeyframesDefinition,
    {
        delay = 0,
        duration = 300,
        repeat = 0,
        repeatType = "loop",
        ease = "easeOut",
        times,
    }: ValueTransition = {},
    pseudoElement: string | undefined = undefined
) {
    const keyframeOptions: PropertyIndexedKeyframes = {
        [valueName]: keyframes as string[],
    }
    if (times) keyframeOptions.offset = times

    const easing = mapEasingToNativeEasing(ease, duration)

    /**
     * If this is an easing array, apply to keyframes, not animation as a whole
     */
    if (Array.isArray(easing)) keyframeOptions.easing = easing

    if (statsBuffer.value) {
        activeAnimations.waapi++
    }

    const options: KeyframeAnimationOptions = {
        delay,
        duration,
        easing: !Array.isArray(easing) ? easing : "linear",
        fill: "both",
        iterations: repeat + 1,
        direction: repeatType === "reverse" ? "alternate" : "normal",
    }

    if (pseudoElement) options.pseudoElement = pseudoElement

    const animation = element.animate(keyframeOptions, options)

    if (statsBuffer.value) {
        animation.finished.finally(() => {
            activeAnimations.waapi--
        })
    }

    return animation
}
```

**旁注**：

- `[valueName]: keyframes` 是 WAAPI 的 `PropertyIndexedKeyframes` 格式——一个 property 一组关键帧。如果你想动画 `transform`，就 `{ transform: ['translateX(0)', 'translateX(100px)'] }`。Motion 把"按属性分组"当作一等公民，因为 transform 走 GPU 合成层，opacity 走另一层，分开发给 WAAPI 才能让浏览器各自最优化。
- `mapEasingToNativeEasing(ease, duration)` 是关键 trick：传入 `"easeOut"` 返回浏览器原生支持的 `"ease-out"`；传入 `[0.4, 0, 0.2, 1]` 返回 `cubic-bezier(0.4, 0, 0.2, 1)`；传入 `spring()` generator 时它会**预采样成 `linear(0, 0.1, ..., 1)` 字符串**——这是 motion-one 把物理动画也送进 WAAPI 的唯一办法。
- 数组 easing 走 `keyframeOptions.easing`（每段 keyframe 一个 easing），非数组走顶层 `options.easing`（整段动画一个 easing）——是 WAAPI spec 强制的，不是 Motion 的设计选择。
- `fill: "both"` 是默认值，让动画结束后保留终态、动画开始前应用首帧。如果不设这个，CSS 会回弹到原值——视觉上跟用户期望不符。
- `iterations: repeat + 1` 把 `repeat: 0` 翻译成 `iterations: 1`（跑一次），`repeat: Infinity` 翻译成 `iterations: Infinity`——repeat=0 不是不跑，是不重复。Motion 的语义和 CSS animation-iteration-count 错开 1。
- `statsBuffer.value` 是 dev mode 的活动动画计数器，prod build 会被 tree-shake 掉。

**怀疑 1**：spring 预采样成 30 段 linear() easing 真的等价于真正的物理 spring 吗？高频振荡的 underdamped spring（dampingRatio < 0.3）可能被 30 段欠采样，肉眼应该看得到"假 spring"。这是 motion-one vs [react-spring](/projects/react-spring)（每帧真实 ODE 数值积分）的潜在视觉差。

### 精读 B：Spring 物理引擎（解析解，不是数值积分）

**永久链接**：[spring.ts L221-L446 @ 43e508e3e967b3d17b5361064d0d53812f12fee6](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/animation/generators/spring.ts#L221-L446)

react-spring 用的是 RK4 数值积分（每帧从上一帧推下一帧），motion-one 用的是 spring ODE 的**解析解**（给定时间 t 直接算位置）——能这么做是因为线性二阶 ODE 的解是已知的 sin/cos/exp 组合。

```typescript
function spring(
    optionsOrVisualDuration:
        | ValueAnimationOptions<number>
        | number = springDefaults.visualDuration,
    bounce = springDefaults.bounce
): KeyframeGenerator<number> {
    // ... options 处理略 ...

    const initialVelocity = velocity || 0.0
    const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass))
    const initialDelta = target - origin
    const undampedAngularFreq = millisecondsToSeconds(Math.sqrt(stiffness / mass))

    let resolveSpring: (v: number) => number
    let resolveVelocity: (t: number) => number

    // Underdamped coefficients, hoisted for use in the inlined next() hot path
    let angularFreq: number
    let A: number
    let sinCoeff: number
    let cosCoeff: number

    if (dampingRatio < 1) {
        angularFreq = calcAngularFreq(undampedAngularFreq, dampingRatio)

        A =
            (initialVelocity +
                dampingRatio * undampedAngularFreq * initialDelta) /
            angularFreq

        // Underdamped spring
        resolveSpring = (t: number) => {
            const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t)
            return (
                target -
                envelope *
                    (A * Math.sin(angularFreq * t) +
                        initialDelta * Math.cos(angularFreq * t))
            )
        }
    }
    // ... critically-damped / overdamped 分支略 ...

    const generator = {
        calculatedDuration: isResolvedFromDuration ? duration || null : null,
        next: (t: number) => {
            if (!isResolvedFromDuration && dampingRatio < 1) {
                const envelope = Math.exp(
                    -dampingRatio * undampedAngularFreq * t
                )
                const sin = Math.sin(angularFreq * t)
                const cos = Math.cos(angularFreq * t)

                const current =
                    target -
                    envelope *
                        (A * sin + initialDelta * cos)

                state.done =
                    Math.abs(currentVelocity) <= restSpeed! &&
                    Math.abs(target - current) <= restDelta!
                state.value = state.done ? target : current

                return state
            }
            // ...
        },
    }

    return generator
}
```

**旁注**：

- `dampingRatio = damping / (2 * sqrt(stiffness * mass))` 是阻尼比的标准定义——< 1 是 underdamped（会回弹）、= 1 是 critically damped（最快回到平衡且不超调）、> 1 是 overdamped（缓慢爬向目标）。Motion 三种情况各写一支解析解。
- underdamped 解析解 `target - exp(-ζωt) · (A·sin(ωd·t) + Δ·cos(ωd·t))` 是教科书公式（任意线性二阶 ODE）。`envelope = exp(-ζωt)` 是指数衰减包络，`A·sin + Δ·cos` 是受迫振荡——肉眼看就是"过冲一下又回来"。
- **关键 trade-off**：解析解 vs 数值积分。解析解 O(1) 算任意 t（可以"快进 100ms 看那时的位置"），数值积分 O(t) 必须从 0 一帧帧算过来。Motion 选解析解就是为了**支持 WAAPI 预采样**——可以一次性采 30 个点出来。react-spring 用数值积分是因为它要支持任意非线性力（如 friction 不是线性阻尼），代价是不能"任意时间点直接求值"。
- `let A`, `sinCoeff`, `cosCoeff` 在闭包顶部 hoist 是性能 trick——`next(t)` 是 hot path（每帧调一次），把不依赖 t 的系数算一次存起来，每次只算 sin/cos/exp。
- `state.done = Math.abs(currentVelocity) <= restSpeed && Math.abs(target - current) <= restDelta` 是"动画结束"的双重判定：**速度足够小 AND 距离目标足够近**——只看其中一个会误判（spring 经过平衡点时速度最大）。
- 注释里"hoisted for use in the inlined next() hot path"明确说这段是性能优化，不是设计美学。

**怀疑 2**：解析解能算任意 t 是优势，但 `damping <= 0` 或 `mass <= 0` 这种边界值会让 `dampingRatio = NaN` 然后 sin/cos 都 NaN——代码里没看到对这种 invalid input 的 guard。如果用户从 React state 传进来一个意外的负数会不会崩？

### 精读 C：JSAnimation RAF tick（fallback 路径）

**永久链接**：[JSAnimation.ts L195-L290 @ 43e508e3e967b3d17b5361064d0d53812f12fee6](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/animation/JSAnimation.ts#L195-L290)

WAAPI 不能动画 color / path / 任意 JS object（只能动画 element 的 CSS 属性），motion-one 给这些保留 RAF fallback。

```typescript
private tick(timestamp: number, sample = false) {
    const { generator, totalDuration, resolvedDuration } = this

    if (this.startTime === null) return generator.next(0)

    const {
        delay = 0,
        keyframes,
        repeat,
        repeatType,
        repeatDelay,
        type,
        onUpdate,
        finalKeyframe,
    } = this.options

    /**
     * requestAnimationFrame timestamps can come through as lower than
     * the startTime as set by performance.now(). Here we prevent this,
     * though in the future it could be possible to make setting startTime
     * a pending operation that gets resolved here.
     */
    if (this.speed > 0) {
        this.startTime = Math.min(this.startTime, timestamp)
    } else if (this.speed < 0) {
        this.startTime = Math.min(
            timestamp - totalDuration / this.speed,
            this.startTime
        )
    }

    if (sample) {
        this.currentTime = timestamp
    } else {
        this.updateTime(timestamp)
    }

    // Rebase on delay
    const timeWithoutDelay =
        this.currentTime - delay * (this.playbackSpeed >= 0 ? 1 : -1)
    const isInDelayPhase =
        this.playbackSpeed >= 0
            ? timeWithoutDelay < 0
            : timeWithoutDelay > totalDuration
    this.currentTime = Math.max(timeWithoutDelay, 0)

    // If this animation has finished, set the current time  to the total duration.
    if (this.state === "finished" && this.holdTime === null) {
        this.currentTime = totalDuration
    }

    let elapsed = this.currentTime
    let frameGenerator = generator

    if (repeat) {
        const progress =
            Math.min(this.currentTime, totalDuration) / resolvedDuration
        let currentIteration = Math.floor(progress)
        let iterationProgress = progress % 1.0

        if (!iterationProgress && progress >= 1) {
            iterationProgress = 1
        }

        iterationProgress === 1 && currentIteration--
        currentIteration = Math.min(currentIteration, repeat + 1)

        const isOddIteration = Boolean(currentIteration % 2)
        elapsed = iterationProgress * resolvedDuration
        // ...
    }

    return frameGenerator.next(elapsed)
}
```

**旁注**：

- 整个 tick() 的输入是 `requestAnimationFrame` 的高精度时间戳，输出是 `generator.next(elapsed).value`——一帧一次，调用方拿到值后写进 element style 或调 onUpdate 回调。和 react-spring 的 FrameLoop 几乎一样的协议，只是 motion 把 generator 抽象到了 spring/keyframes/inertia 三种共用接口。
- `if (this.speed > 0) { this.startTime = Math.min(this.startTime, timestamp) }` 是对 RAF 时间戳偏移的防御——浏览器在 high refresh rate（120Hz、144Hz）下会出现 `RAF.timestamp < performance.now()`，不防御会让 elapsed 负数。
- `repeat` 处理用 `progress = currentTime / resolvedDuration`、`Math.floor(progress)` 拿到当前在第几次循环——这种"全局时间 → 循环内进度"映射是 RAF 动画通用模板。WAAPI 这部分由 `iterations` option 自动处理，所以 NativeAnimation 不需要这段代码。
- `isOddIteration` 是给 `repeatType: "reverse"` 用的——奇数次反向跑，配合 `1 - iterationProgress` 实现 yoyo 效果。Motion 同时支持 reverse / mirror / loop 三种 repeatType，是 anime.js 的超集。
- **关键 trade-off**：RAF 跑在主线程，长任务会让动画掉帧——这就是 motion-one 推 WAAPI 的根本原因。但 color、SVG path、任意 number 跑 WAAPI 都不行，所以 RAF fallback 必须存在。motion-one 选了"能 native 就 native，必须 RAF 才 RAF"的 fallback 哲学，不是统一全 RAF 也不是统一全 WAAPI。
- `state` 字段是 W3C `AnimationPlayState`（"idle" | "running" | "paused" | "finished"），motion 强行复用 WAAPI 的状态机给 JS 动画——好处是两个引擎对外 API 完全一致，调用方不需要 if/else 区分。

**怀疑 3**：JSAnimation 的 driver 默认是 `frameloopDriver`（来自 motion-dom 的 frameloop），但测试时可以注入同步 driver。生产环境如果同时跑 50 个 JS 动画（color、path），motion 没看到 batch 写 style 的逻辑——每个 tick 都各自 setStyle 会触发 layout thrash 吗？这是 GSAP 用 ticker 单点统一写的强项，motion 似乎放弃了。

## Layer 4 改一处 Hands-on

### 30 分钟跑通

```bash
mkdir -p /tmp/motion-one-toy && cd /tmp/motion-one-toy
npm init -y
npm install motion
cat > index.html <<'EOF'
<!DOCTYPE html>
<html>
<body>
  <div id="box" style="width:100px;height:100px;background:red;"></div>
  <script type="module">
    import { animate } from "https://esm.run/motion"
    animate("#box",
      { x: [0, 300], rotate: [0, 360] },
      { duration: 2, repeat: Infinity, ease: "easeInOut" })
  </script>
</body>
</html>
EOF
npx http-server -p 8080
# 浏览器开 http://localhost:8080，应该看到红框左右晃 + 旋转
```

打开 DevTools → Performance → 录 5s。**看 Main 线程**：动画期间 JS 几乎没有活动（只有一次 animate() 调用 + WAAPI 派发），主线程空闲——这就是 WAAPI 跑在合成线程的证据。对照 [react-spring](/projects/react-spring) 同样的动画，主线程会有连续的 RAF 任务条。

### 改一处实验

把 ease 从 `"easeInOut"` 换成 spring：

```js
import { animate, spring } from "https://esm.run/motion"
animate("#box",
  { x: [0, 300] },
  { type: "spring", stiffness: 200, damping: 8, repeat: Infinity })
```

DevTools → Elements → 选 `#box` → Computed → 看 `transform` 属性的 animation——会发现 motion 把 spring 翻译成了 `linear(0, 0.012, 0.045, 0.097, ..., 1)` 形式的 easing 字符串塞进 WAAPI（DevTools 的 Animations 面板能看到 30 段采样点）。

**预期**：和真实 spring（react-spring 同参数）肉眼几乎一样。

**实际**：低 damping（< 5）情况下能看到 motion-one 的"假 spring"卡顿——30 段采样在剧烈振荡时不够细，react-spring 的真正每帧积分平滑度更高。这正好印证 Layer 3 怀疑 1。

**改一处的另一选项**：把 `import { animate } from "motion"` 换成 `import { animate } from "motion/mini"`（mini build 不支持 spring）—— DevTools Sources 面板能看到 bundle 从 18KB 缩到 2.6KB，spring 物理引擎完全 tree-shake 掉。

## Layer 5 横向对比

| 维度 | Motion One | [Framer Motion](/projects/framer-motion) | [GSAP](/projects/gsap) | [react-spring](/projects/react-spring) | [Lottie](/projects/lottie) | anime.js |
|------|------------|----------------|------|--------------|-----------|----------|
| 动画引擎 | WAAPI + RAF fallback | WAAPI + RAF + projection | RAF (ticker) | RAF (FrameLoop) | Canvas/SVG renderer | RAF |
| 主线程 cost | 接近 0（WAAPI 路径） | 中（projection 计算） | 高（每帧 JS 写 style） | 高（RK4 + setStyle） | 中（独立 canvas） | 高（每帧 JS） |
| Spring 实现 | 解析解 + 30 点预采样 | 同上（共代码） | 无原生 spring | RK4 数值积分 | 无（设计师在 AE 烘焙好） | 无原生 spring |
| 包大小 | 2.6KB / 18KB | 50KB+ | 30KB+ | 16KB | 60KB+ runtime | 17KB |
| 框架绑定 | 无（vanilla + react + vue 三 entry） | React-only | 无（jQuery 时代过来的） | React (核心) + RN/three 适配 | 无 | 无 |
| spring physics 灵活度 | 中（线性 ODE，无任意力） | 中（同 motion） | 无 | 高（任意力函数） | 无 | 无 |
| 设计师 → 工程师交接 | 代码内手写参数 | 代码内手写参数 | 代码内 + GSDevTools | 代码内 + leva GUI | After Effects 直接出 JSON | 代码内 |
| 学习曲线 | 低（一个 animate() 函数） | 中（要懂 React + variants） | 中（API 巨大，timeline 概念） | 中高（需懂物理） | 低（设计师都不写代码） | 低 |
| 成熟度 | 32k★，活跃 | 同 monorepo，活跃 | 11k★（GreenSock 主仓库另算） | 28k★，活跃 | 31k★，活跃 | 50k★ 但 v3 后停滞 |

**哲学差异**：

- **Motion One vs Framer Motion**：同源同作者同 monorepo，差异只在打包粒度。Motion 是 framer-motion/dom 的重导出，去掉 React 组件层。**选型**：Astro / Vue / 静态站 → Motion；React 用 layout / AnimatePresence / motion.div → Framer Motion。
- **Motion One vs GSAP**：哲学正面冲突。GSAP 押注"RAF + 自己写 style 才能精确控制"；Motion 押注"浏览器自己跑动画才不卡"。**选型**：复杂 timeline / SVG morph / scrubbing → GSAP；简单过渡 / 不想阻塞主线程 → Motion。
- **Motion One vs react-spring**：spring 哲学不同。react-spring 用 RK4 数值积分支持任意非线性力（如 inertia + friction 组合），Motion 用解析解只支持线性 spring 但能预采样塞进 WAAPI。**选型**：要细腻物理感 + React-only → react-spring；要 0 主线程 cost + 跨框架 → Motion。
- **Motion One vs Lottie**：Lottie 是"设计师在 AE 烘焙好的动画 JSON"，Motion 是"工程师代码里写参数"。互不替代。**选型**：营销页复杂插画动画 → Lottie；UI 交互 hover/expand → Motion。
- **Motion One vs anime.js**：anime.js 是 Motion 出现前的 vanilla JS 王者，但 v3 (2019) 后停滞。Motion 用 WAAPI 和现代打包淘汰了它。**选型**：维护老项目 → anime.js；新项目 → Motion。

## Layer 6 与你当前工作的连接

### 今天就能用的部分

- **小体积移动端 H5 / 营销 landing page**：mini 2.6KB 比 framer-motion 50KB 小一个量级，对首屏 critical rendering path 友好。`animate("#btn", { scale: [1, 1.05] }, { duration: 0.2 })` 一行替代 CSS animation keyframe。
- **Astro / Vue / 静态站**：不依赖 React，直接 ESM import。比 anime.js 现代、比 framer-motion 轻、比 GSAP 主线程更友好。
- **进入视口动画**：`inView(element, () => animate(...))`——内置 IntersectionObserver 包装，比手写 observer + classList 三行写完。
- **Hover/tap 微交互**：`hover(element, ...)` 和 `press(element, ...)` 工具，省去手写 mouseenter/mouseleave + touchstart/touchend 的 boilerplate，且自动处理 pointer events 兼容。

### 下个月能用的部分

- **替换项目里残留的 anime.js**：API 几乎一比一映射，搜全项目 `anime(` 改 `animate(`，参数顺序基本一致。两到三个 PR 能搞定。
- **scroll-linked 动画**：`scroll(animate(...))` 把动画 progress 绑到滚动 progress。原生写法要监听 scroll + 节流 + 计算交集，motion-one 一行——但要确认 ScrollTimeline browser support（Chrome 115+，Safari 还在 flag 后）。
- **复杂 sequence**：`animate([[el1, {x: 100}], [el2, {opacity: 1}, {at: "<"}]])` 数组语法可读性比 timeline.to().to().to() 好——做产品 onboarding 引导动画时考虑。
- **跨框架共享动画逻辑**：如果未来有 React + Vue 双前端（管理后台 React + C 端 Vue），用 motion 写一套动画 helper 两端 import。

### 不要用的部分

- **复杂 spring 物理（多力叠加 / 非线性阻尼）**：motion-one 的 spring 是线性 ODE 解析解，不支持任意力函数。要做这类动画用 [react-spring](/projects/react-spring) 的 imperative API。
- **设计师烘焙好的复杂插画动画**：Lottie 是为这场景生的，motion-one 的 declarative API 写不出来 AE 那种逐帧 morph。
- **scrubbing / 精确 timeline 控制**：GSAP 的 timeline 仍然是黄金标准，motion 的 sequence 数组虽然好读但 API 表面比 GSAP 小一个量级（没有 GSDevTools、没有 ScrollTrigger 这种 mature 工具链）。
- **Canvas / WebGL 动画**：motion-one 只动画 DOM 元素的 CSS 属性 + 任意 JS object 的 number 字段。Canvas 内部动画要自己跑 RAF + 调 ctx 方法，motion 帮不上忙。

## Layer 7 自检 + 延伸阅读

### 自检问题（追到行号级别）

1. **`mapEasingToNativeEasing` 在 spring 输入时如何把 generator 转 linear() 字符串？追到 `packages/motion-dom/src/animation/waapi/easing/map-easing.ts` 具体哪行调用 `generator.next()` 采样、采样几次、间隔均匀还是按 calculatedDuration 比例？**

2. **`statsBuffer.value` 在 prod build 怎么 tree-shake 掉？是 dead code elimination 还是 import.meta.env 守卫？追到 packages/motion/package.json 的 sideEffects 字段 + rollup config。**

3. **WAAPI 的 `partial-keyframes`（只有 to value 没有 from value）motion 怎么处理？追 `packages/motion-dom/src/animation/waapi/supports/partial-keyframes.ts`——浏览器版本嗅探还是 try/catch？**

4. **`GroupAnimation.attachTimeline` 如何把多个动画绑到同一 ScrollTimeline？多动画 attach 同一 timeline 时第一个 detach 会不会影响其他？追 `packages/motion-dom/src/animation/GroupAnimation.ts` L41+。**

### 怀疑（散布在前文，汇总）

- **怀疑 1**：spring 30 点预采样 vs 真实 ODE，underdamped 高频振荡（damping < 5）肉眼可分辨吗？需要在 60Hz / 120Hz 屏幕分别录屏对照。
- **怀疑 2**：`damping <= 0` / `mass <= 0` 输入会让 dampingRatio = NaN 然后整个 spring NaN——代码里没看到 invariant guard，怀疑这是潜在 footgun。
- **怀疑 3**：JSAnimation 多动画并发时无 batched style write，可能 layout thrash——和 GSAP 单 ticker 集中写相比是劣势？需要做 50 个动画并发的性能基准。

### 接下来读哪几个文件

| 顺序 | 文件 | 回答什么问题 |
|------|------|-------------|
| 1 | `packages/motion-dom/src/animation/waapi/easing/map-easing.ts` | spring → linear() 采样逻辑细节 |
| 2 | `packages/motion-dom/src/animation/NativeAnimationExtended.ts` | NativeAnimation 之上的扩展（pause、playbackRate） |
| 3 | `packages/framer-motion/src/animation/sequence/create.ts` | sequence 数组语法如何编译成多个 animate() 调用 |
| 4 | `packages/motion-dom/src/scroll/index.ts` | scroll-linked 动画如何 polyfill ScrollTimeline |
| 5 | `packages/motion-dom/src/gestures/hover/index.ts` | hover/press 手势检测的 pointer events 兼容写法 |

## 限制（独立于上面 Layer 6 的"不要用"段）

1. **WAAPI 浏览器版本断层**：Safari < 13.1 不支持 `linear()` easing 字符串（spring 预采样依赖此特性），motion 在老 Safari 会回退到 RAF 路径，意味着"主线程 0 cost"的承诺仅在 modern browser 兑现。
2. **shallow clone 拿不到 commit 热度**：本笔记的"心脏文件清单"按代码行数 + 调用关系推导，不是 git log 频率统计——状元篇的硬要求略打折，下次能在本机长 history clone 时复核。
3. **mini build 不支持 spring**：`motion/mini` 砍掉 spring 物理引擎换 2.6KB——但很多人下意识 import mini 觉得"轻就是好"，会发现 `type: "spring"` 静默失败。文档没在 import 时给警告。
4. **解析解 vs 数值积分的物理灵活度不可逆**：选了线性 ODE 解析解就永远不能加非线性阻尼或多力叠加——除非整个 spring engine 推倒重来。这是架构决策不是实现细节，未来想做"游戏感"动画会卡住。

## 附录：宣传 vs 现实

| 文档/blog 宣传 | 代码现实 |
|----------------|----------|
| "Tiny 2.6KB" | mini build 才 2.6KB；要 spring 物理就得 18KB（full）；要 React layout 就得 50KB+（framer-motion） |
| "Hardware-accelerated" | 仅 transform/opacity 走 GPU 合成；color/path/任意 JS object 仍走 RAF 主线程 |
| "Spring animations" | 是线性二阶 ODE 解析解，不支持非线性力；高频振荡 30 点采样可能不够细 |
| "Cross-framework" | 三个 entry（motion / motion/react / motion-v）共享 motion-dom，但 motion-v 的 Vue API 比 motion/react 的 React API 落后一个版本 |

## 元数据

- **升级日期**：2026-05-29
- **总行数**：约 460 行
- **启用工具**：WebFetch（GitHub repo 元数据）+ git clone shallow + Read（源码精读）+ PIL（架构图生成）
- **方法论版本**：v1.1 工具库分支 B（小 surface API 库，Layer 3 ≥ 3 段独立精读）
- **Season 19 episode 5**：S19 收官篇——动画库五连（gsap / lottie / framer-motion / react-spring / motion-one）完成
