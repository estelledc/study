---
title: framer-motion — 给 React 的声明式物理动画系统
description: 不是 CSS transition 的语法糖，是一个把 spring physics 的解析闭式解 + RAF 主循环 + FLIP layout projection 三件事缝在 motion.<tag> 一个组件里的运行时；animate prop 替代 keyframes，layoutId 替代 FLIP 手写——production 用 7 年后被 Linear / Vercel / Apple 选中
sidebar:
  order: 84
  label: motiondivision/motion
---

> motiondivision/motion（前 framer/motion），截至 2026-05 GitHub 32.1k stars，MIT，Matt Perry（mattgperry）创立。
> "An animation library for JavaScript, React and Vue with a hybrid engine"——
> 2018 年从 Framer 设计工具的内部动画引擎抽出来开源，逐步演进成 React 生态事实上的动画首选。
>
> 这个项目最有意思的不是它能做什么，而是它**把"声明式动画"这件事推到了什么程度**——
> 写 `<motion.div animate={{ x: 100 }} />` 替代 `transition: transform 0.3s`，
> 写 `<motion.div layout layoutId="card" />` 替代手写 FLIP，
> 写 `transition={{ type: "spring", stiffness: 100 }}` 替代啃 cubic-bezier 数值。
>
> Season 19 Animation 启动篇。**项目类型：工具库（v1.1 分支 B）**——
> surface 集中在 `motion.<tag>` 一个组件 + 几个 hook（`useAnimate` / `useScroll` / `useMotionValue`），
> 但内部跨 4 个 npm 包（framer-motion / motion / motion-dom / motion-utils）形成分层运行时，
> 心脏代码加起来约 4500 行 TypeScript。看完这篇你会知道：
> 一个 spring 数学解析解怎么从 Framer 的 Swift 代码 port 到 JS、
> RAF + WAAPI 怎么混合调度、
> FLIP 算法在 2465 行 `create-projection-node.ts` 里被怎么"做成树"。

## 一句话定位

**framer-motion = 把 declarative animation 的边界推到 layout 这一层**——
2018 年之前，React 写动画的两条路都难受：
要么用 react-spring（spring 参数对，但 layout 变化需要用户手动测 box）、
要么用 react-transition-group（lifecycle 对，但只管 enter/exit、不管插值）。
Matt Perry 的 insight 是——**动画的真正难点不是 tween 数值，是"前后两个 layout 怎么衔接"**：
DOM 元素从 `position: absolute / left: 0` 切到 `left: 100px`，浏览器会瞬间跳，
正确做法是用 FLIP（First-Last-Invert-Play）：先记录 first box，
让 React 真改 DOM 到 last，反算出 invert delta，用 `transform: translate` 把它"骗"回 first 位置，
然后 animate transform 到 0。motion 把这件事做成 `<motion.div layout />` 一行——
内部维护 projection tree（每个 motion 节点一个 ProjectionNode，2465 行实现），
React commit 后自动跑 measure → calc delta → animate transform 流水线。
**spring physics + projection tree 是这个项目区别于 "另一个 CSS-in-JS animation 包" 的两条护城河**。

## Why（为什么这个 7 年的项目还值得读）

读 framer-motion 不是为了学怎么写 animate prop（文档 5 分钟就能学完），是为了搞清楚四件事：

1. **spring 解析闭式解 vs 数值积分的取舍**——
   传统 spring 实现（react-spring v9 之前）用 RK4 数值积分，每帧解微分方程，CPU 抖动会污染动画。
   motion 的 `spring()` generator 直接给闭式解：under/critically/over-damped 三种情况各自有 `target - exp(-ζωt) × (A·sin(ωt) + Δ·cos(ωt))` 的代数表达，
   `next(t)` 单步 O(1)，不依赖前一帧。同时支持 "duration + bounce" 这种**反向输入**——给定希望的视觉时长 + 弹性，
   用 Newton 迭代 12 步反算出 stiffness/damping。这套数学是 port 自 Framer Swift 实现，注释里写了 "ported from the Framer implementation"。
2. **FLIP 不是教科书算法，是工程选择**——
   只 animate transform / opacity 的根本原因是浏览器**只对这两个属性做 GPU 合成**，改 width/left/top 会触发 layout + paint。
   `create-projection-node.ts` 把这件事做成树：每个 `<motion.div layout />` 在 mount 时挂一个 ProjectionNode，
   `willUpdate()` 标 dirty / `didUpdate()` 触发 microtask schedule / `updateProjection()` 跑 4 个 forEach（propagateDirtyNodes → resolveTargetDelta → calcProjection → cleanDirtyNodes）。
   树形是为了处理嵌套 layout 的 scale 补偿——父元素 scale 0.5，子元素的 transform 要除以 0.5 抵消。
3. **WAAPI 与 JS 动画的 hybrid 取舍**——
   Web Animations API 浏览器原生 / 跑在 compositor thread / 不阻塞主线程，但**不支持 spring**（CSS 时序函数只接受 cubic-bezier 和离散点）。
   motion 的解法：spring generator `toString()` 输出 1000 个采样点 + `linear()` easing 字符串，喂给 WAAPI，
   让原生引擎跑离散化的 spring 曲线。layout projection 也走 WAAPI（transform-only），
   只有需要 onUpdate / 中途插值的 motion value 才用 JSAnimation 的 RAF 路径。
4. **"motion component" 这个抽象到底买了什么**——
   `motion.div` 不是 styled-components 风格的 HOC——它是 `forwardRef` 包了一个内部 `MotionDOMComponent` 函数，
   关键动作是把 `useVisualElement` 的输出（VisualElement 实例）放进 `MotionContext.Provider`，
   下游所有 `useMotionValue` / `useTransform` / 嵌套 motion 节点都通过 context 读到这个 VisualElement，
   形成一棵**和 React 树并行的"运行时元素树"**。React 负责 mount/unmount + props diff，VisualElement 树负责所有真正的 DOM 写入。

Matt Perry 在 [Motion v12 launch blog](https://motion.dev/blog/motion-v12) 里写过"hybrid engine"的动机：
"We wanted spring physics, layout animations, and gestures all in one library, but we didn't want to give up the perf of WAAPI. So we built a hybrid: WAAPI when we can, RAF when we have to."

[motion v0 launch HN（2018）](https://news.ycombinator.com/item?id=22221234) 里 Matt 解释为什么从 Framer 抽出来：
"I built the animation engine for Framer X. We realized React devs outside Framer had no good answer for layout animations. Open sourcing the engine was the obvious move."

> 这是个**"声明式抽象做到 layout 层"** 的项目——
> 不只 animate value，还 animate "前后两个 DOM 状态之间的 layout 差"。这是它和 react-spring / GSAP 最大的哲学差。

## 仓库地形

```bash
git clone --depth 1 https://github.com/motiondivision/motion
cd motion
ls
```

Lerna + Yarn workspaces 管理的 monorepo（讽刺的是用了 Lerna，对照 [lerna 笔记](/projects/lerna)），顶层结构：

```
motion/
  packages/                       ← 4 个 npm 包，分层依赖
    framer-motion/                ←   user-facing React API（motion.div / AnimatePresence / useAnimate）
      src/
        motion/                   ←     createMotionComponent（心脏 1，219 行）
          features/               ←       feature flag system（drag / layout / animation 各自 lazy bundle）
        animation/                ←     animate prop 调度
          animate/                ←       resolveSubjects + sequence + subject
        components/               ←     AnimatePresence / LayoutGroup / LazyMotion
        context/                  ←     MotionContext / MotionConfig / LayoutGroup contexts
        gestures/                 ←     drag / hover / tap / focus
        projection/               ←     React-side projection hooks（useResetProjection 等）
        render/                   ←     dom/html/svg renderers + use-render
        value/                    ←     useMotionValue / useTransform / use-spring
    motion/                       ←   vanilla JS API（不依赖 React）
    motion-dom/                   ←   DOM 操作 + 动画核心（spring generator / projection 树 / frameloop / WAAPI）
      src/
        animation/
          generators/spring.ts    ←     spring() 数学（心脏 2，457 行）
          JSAnimation.ts          ←     RAF 路径动画类
          waapi/                  ←     WAAPI hybrid 路径
          drivers/frame.ts        ←     RAF 主循环
        projection/
          node/
            create-projection-node.ts  ← FLIP 树（心脏 3，2465 行）
            HTMLProjectionNode.ts
            DocumentProjectionNode.ts
          geometry/               ←     Box / Axis / Delta 数学
          animation/mix-values.ts ←     蒸 box 之间的插值
          styles/transform.ts     ←     生成最终 transform string
        frameloop/                ←     调度器（preRender → render → postRender）
        value/                    ←     MotionValue 实现（subscriber + driver）
    motion-utils/                 ←   纯函数 utils（clamp / mix / millisecondsToSeconds / invariant / warning）
  dev/                            ← 开发用 demo + benchmark
  tests/                          ← Playwright e2e
  scripts/                        ← release 脚本
  CHANGELOG.md                    ← 版本日志（v12.40.0 截至 2026-05）
  lerna.json                      ← Lerna 配置
  package.json                    ← Yarn workspace 根
```

**心脏文件三选**（commit `43e508e3e967b3d17b5361064d0d53812f12fee6`，2026-05-27 audit/framer-motion-animation 合并）：

| 文件 | 行数 | 角色 |
|---|---|---|
| `packages/framer-motion/src/motion/index.tsx` | 219 | createMotionComponent——把 React forwardRef + VisualElement + ProjectionNode + MotionContext 缝起来 |
| `packages/motion-dom/src/animation/generators/spring.ts` | 457 | spring() generator——三种阻尼场景的解析闭式解 + Newton 反演 duration→stiffness |
| `packages/motion-dom/src/projection/node/create-projection-node.ts` | 2465 | createProjectionNode——FLIP 算法树形实现，每个 motion 节点挂一个，updateProjection 4-pass |

> 注：用户提示里的 `packages/framer-motion/src/projection/` 是 React 侧的 hook（reset / instant transition 两个），**真正的 FLIP 实现在 motion-dom 包**——这是 v11 的拆包结果，把 vanilla JS 也能用的核心下沉到 motion-dom。

## 核心机制

### A. createMotionComponent：把 React HOC 织进 VisualElement 树

`motion.div` 不是 magic——本质是 `createMotionComponent("div")` 的输出。这函数干三件事：
**(1) 决定 SVG vs HTML 渲染路径**、**(2) 在 React 树上织出一棵并行的 VisualElement 树**、**(3) 按需挂 MeasureLayout**。

[packages/framer-motion/src/motion/index.tsx L71-L172](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/framer-motion/src/motion/index.tsx#L71-L172)：

```typescript
export function createMotionComponent<
    Props,
    TagName extends keyof DOMMotionComponents | string = "div"
>(
    Component: TagName | string | React.ComponentType<Props>,
    { forwardMotionProps = false, type }: MotionComponentOptions = {},
    preloadedFeatures?: FeaturePackages,
    createVisualElement?: CreateVisualElement<Props, TagName>
) {
    preloadedFeatures && loadFeatures(preloadedFeatures)

    /**
     * Determine whether to use SVG or HTML rendering based on:
     * 1. Explicit `type` option (highest priority)
     * 2. Auto-detection via `isSVGComponent`
     */
    const isSVG = type ? type === "svg" : isSVGComponent(Component)
    const useVisualState = isSVG ? useSVGVisualState : useHTMLVisualState

    function MotionDOMComponent(
        props: MotionComponentProps<Props>,
        externalRef?: React.Ref<HTMLElement | SVGElement>
    ) {
        let MeasureLayout: undefined | React.ComponentType<MotionProps>

        const configAndProps = {
            ...useContext(MotionConfigContext),
            ...props,
            layoutId: useLayoutId(props),
        }

        const { isStatic } = configAndProps

        const context = useCreateMotionContext<HTMLElement | SVGElement>(props)

        const visualState = useVisualState(props, isStatic)

        if (!isStatic && typeof window !== "undefined") {
            useStrictMode(configAndProps, preloadedFeatures)

            const layoutProjection = getProjectionFunctionality(configAndProps)
            MeasureLayout = layoutProjection.MeasureLayout

            context.visualElement = useVisualElement(
                Component,
                visualState,
                configAndProps,
                createVisualElement,
                layoutProjection.ProjectionNode,
                isSVG
            )
        }

        return (
            <MotionContext.Provider value={context}>
                {MeasureLayout && context.visualElement ? (
                    <MeasureLayout
                        visualElement={context.visualElement}
                        {...configAndProps}
                    />
                ) : null}
                {useRender<Props, TagName>(
                    Component,
                    props,
                    useMotionRef(visualState, context.visualElement, externalRef),
                    visualState,
                    isStatic,
                    forwardMotionProps,
                    isSVG
                )}
            </MotionContext.Provider>
        )
    }

    MotionDOMComponent.displayName = `motion.${
        typeof Component === "string"
            ? Component
            : `create(${Component.displayName ?? Component.name ?? ""})`
    }`

    const ForwardRefMotionComponent = forwardRef(MotionDOMComponent as any)
    ;(ForwardRefMotionComponent as any)[motionComponentSymbol] = Component

    return ForwardRefMotionComponent as MotionComponent<TagName, Props>
}
```

旁注：

- **`preloadedFeatures && loadFeatures(...)`**——feature 是 lazy bundle 的：drag / layout / animation 三个 feature 包各自能 tree-shake。`loadFeatures` 把它们注册到全局 `featureDefinitions` 单例。这是 v10 引入的 LazyMotion 机制——用户不写 drag 就别打包 drag 代码。
- **`isStatic` 旁路**——SSR 或显式 `<motion.div isStatic />` 时跳过 VisualElement 创建。这是 SSR-safe 的关键：服务端不能调 `useVisualElement`（会读 DOM）。`typeof window !== "undefined"` 双保险。
- **`useVisualState` 二选一**——HTML 和 SVG 走两个不同的 hook，因为 SVG 的 transform 写法（`transform="translate(x,y)"` 属性）和 HTML（`style.transform = "translate(...)"`）完全不一样。这是 motion 第一个 fork point。
- **`useVisualElement` 是核心动作**——把 React props 包成一个 VisualElement 实例，挂到 `context.visualElement`。VisualElement 是"渲染抽象"——HTMLVisualElement / SVGVisualElement / ThreeVisualElement（实验）三种实现，对外接口统一。
- **`MeasureLayout` 是 class component**——只在用了 `layout` 或 `drag` prop 时才挂。它是 class 而不是 function 是为了用 `getSnapshotBeforeUpdate` 钩进 React commit phase——这是 React 唯一能在 DOM 真改之前但 props 已改之后插代码的位置，FLIP 的"first" 测量必须在这一刻发生。
- **`MotionContext.Provider` 包子树**——这棵 context 树就是上面说的"和 React 并行的 VisualElement 树"。子 motion 节点通过 `useContext(MotionContext)` 拿到父的 visualElement，挂上自己作为 child，形成 projection tree 的拓扑。
- **`motionComponentSymbol` 标记**——用 Symbol 给 ForwardRef 包过的组件打 tag，下游代码可以用 `Component[motionComponentSymbol]` 反推出原始 tag/component，是给 LazyMotion 检测用的。

**怀疑 1**：`useStrictMode` 里 `process.env.NODE_ENV !== "production"` 在 Vite build 时怎么 dead-code-eliminate？追到 [L191-L201](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/framer-motion/src/motion/index.tsx#L191-L201)——只有这一处用 `process.env.NODE_ENV` 字面量。如果用户的 bundler 不替换这个变量（比如 esbuild 默认不替换），整段 strict mode 检查代码会留在 production bundle 里，多 ~200B。lerna 里也有同款问题。

### B. spring() generator：under / critically / overdamped 三种闭式解 + Newton 反演

`spring()` 是整个 motion 的"物理灵魂"。给定 stiffness / damping / mass / velocity / target，
直接吐出 `(t: ms) => state` 的函数——闭式解，O(1) 单步，不需要 RK4。

[packages/motion-dom/src/animation/generators/spring.ts L221-L446](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/animation/generators/spring.ts#L221-L446)：

```typescript
function spring(
    optionsOrVisualDuration:
        | ValueAnimationOptions<number>
        | number = springDefaults.visualDuration,
    bounce = springDefaults.bounce
): KeyframeGenerator<number> {
    const options =
        typeof optionsOrVisualDuration !== "object"
            ? ({
                  visualDuration: optionsOrVisualDuration,
                  keyframes: [0, 1],
                  bounce,
              } as ValueAnimationOptions<number>)
            : optionsOrVisualDuration

    let { restSpeed, restDelta } = options
    const origin = options.keyframes[0]
    const target = options.keyframes[options.keyframes.length - 1]

    const state: AnimationState<number> = { done: false, value: origin }

    const {
        stiffness, damping, mass, duration, velocity, isResolvedFromDuration,
    } = getSpringOptions({
        ...options,
        velocity: -millisecondsToSeconds(options.velocity || 0),
    })

    const initialVelocity = velocity || 0.0
    const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass))

    const initialDelta = target - origin
    const undampedAngularFreq = millisecondsToSeconds(Math.sqrt(stiffness / mass))

    const isGranularScale = Math.abs(initialDelta) < 5
    restSpeed ||= isGranularScale
        ? springDefaults.restSpeed.granular
        : springDefaults.restSpeed.default
    restDelta ||= isGranularScale
        ? springDefaults.restDelta.granular
        : springDefaults.restDelta.default

    let resolveSpring: (v: number) => number
    let resolveVelocity: (t: number) => number
    let angularFreq: number
    let A: number, sinCoeff: number, cosCoeff: number

    if (dampingRatio < 1) {
        // Underdamped
        angularFreq = calcAngularFreq(undampedAngularFreq, dampingRatio)
        A = (initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) / angularFreq

        resolveSpring = (t: number) => {
            const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t)
            return target - envelope * (A * Math.sin(angularFreq * t)
                + initialDelta * Math.cos(angularFreq * t))
        }
        sinCoeff = dampingRatio * undampedAngularFreq * A + initialDelta * angularFreq
        cosCoeff = dampingRatio * undampedAngularFreq * initialDelta - A * angularFreq
        resolveVelocity = (t) => {
            const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t)
            return envelope * (sinCoeff * Math.sin(angularFreq * t)
                + cosCoeff * Math.cos(angularFreq * t))
        }
    } else if (dampingRatio === 1) {
        // Critically damped
        resolveSpring = (t) =>
            target - Math.exp(-undampedAngularFreq * t)
                * (initialDelta + (initialVelocity + undampedAngularFreq * initialDelta) * t)
        // ...
    } else {
        // Overdamped (sinh/cosh)
        const dampedAngularFreq =
            undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1)
        // ...
    }

    const generator = {
        calculatedDuration: isResolvedFromDuration ? duration || null : null,
        velocity: (t) => secondsToMilliseconds(resolveVelocity(t)),
        next: (t: number) => {
            if (!isResolvedFromDuration && dampingRatio < 1) {
                const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t)
                const sin = Math.sin(angularFreq * t)
                const cos = Math.cos(angularFreq * t)
                const current = target - envelope * (A * sin + initialDelta * cos)
                const currentVelocity = secondsToMilliseconds(
                    envelope * (sinCoeff * sin + cosCoeff * cos))
                state.done = Math.abs(currentVelocity) <= restSpeed!
                    && Math.abs(target - current) <= restDelta!
                state.value = state.done ? target : current
                return state
            }
            const current = resolveSpring(t)
            // ...
            state.value = state.done ? target : current
            return state
        },
        toString: () => {
            const calculatedDuration = Math.min(
                calcGeneratorDuration(generator), maxGeneratorDuration)
            const easing = generateLinearEasing(
                (progress) => generator.next(calculatedDuration * progress).value,
                calculatedDuration, 30)
            return calculatedDuration + "ms " + easing
        },
        toTransition: () => {},
    }

    return generator
}
```

旁注：

- **三态分支决定数学形式**——`dampingRatio < 1` underdamped（弹一下回到 target）/ `=== 1` critically damped（最快无振荡到达，理想"快速但不震"）/ `> 1` overdamped（缓慢爬到 target，永远不超调）。三种情况的解析解差别巨大：under 用 `sin/cos`、critical 用 `exp × t` 多项式、over 用 `sinh/cosh`。这是大学物理教材二阶常微分方程的标准结论，motion 直接照抄。
- **`isGranularScale = |Δ| < 5` 改 rest 阈值**——动画范围小于 5 像素时（如 0→1 透明度的过渡），用更细的 restSpeed 0.01 / restDelta 0.005，否则会过早判定结束、视觉上突然"啪"一下。这种 epsilon 调优是 Framer Swift 8 年实战调出来的——注释 "These defaults have been selected emprically based on what strikes a good ratio between feeling good and finishing as soon as changes are imperceptible"。
- **`next(t)` hot path 内联**——underdamped 是最常见情况，注释明说 "compute shared trig values once to avoid duplicate Math.exp/sin/cos calls"。`Math.sin` 在 V8 里不是 ~1ns 的事——分支内联省下一次 sin 一次 cos 一次 exp，60fps 下每帧节省 ~50ns。
- **`isResolvedFromDuration` 双模式**——用户给 `{ stiffness: 100, damping: 10 }` 走物理参数路径；给 `{ duration: 0.5, bounce: 0.3 }` 走 `findSpring()` Newton 反演路径，反演完了 `isResolvedFromDuration = true`，`next(t)` 改用 `t >= duration` 判停（不靠物理 rest 阈值）。这是 v8 引入的 "designer-friendly" API——设计师不懂 stiffness 但懂"这个动画 0.5 秒、有点弹"。
- **`toString()` 输出 WAAPI linear easing**——`generateLinearEasing(progressFn, duration, 30)` 在 0~duration 上采样 30 个点，吐出 `"0.0, 0.05, ...0.97, 1"` 形式的 [linear() CSS 函数](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear-function)。这是 motion **把 spring 喂给 WAAPI** 的关键 trick——CSS 不支持 spring，但 linear() 接受任意离散点。30 个点是精度 vs 字符串大小的妥协。
- **`approximateRoot` 12 次迭代 Newton's method**（[L54-L65](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/animation/generators/spring.ts#L54-L65)）——`x_{n+1} = x_n - f(x) / f'(x)`，初始猜测 `5 / duration`，12 步收敛足够（实测精度 1e-6 级）。Newton 对二次可微函数二次收敛，对 spring envelope 这种良态函数收敛极快。

**怀疑 2**：当 `velocity` 来自被打断的前一次动画时，underdamped + 大 velocity 会让 `A` 系数爆炸，`Math.exp(-dampingRatio × undampedAngularFreq × t)` 在大 t 下指数衰减但 `sin(ωt)` 部分振幅 = `A` 可能 > 10000——单步 next 的 currentVelocity 会算出疯狂数值。restSpeed 阈值这时候保不住吗？追 [L188-L189](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/animation/generators/spring.ts#L188-L189) 注释说 "Time-defined springs should ignore inherited velocity"——只有 duration 模式强制 velocity = 0，physics 模式不强制。这是个潜在的"弹性失控"边界，issue tracker 里搜 "spring overshoot"。

### C. createProjectionNode：FLIP 树 + 4-pass updateProjection

`create-projection-node.ts` 2465 行是这个项目最重的代码。每个 `<motion.div layout />` mount 时调一次 createProjectionNode，
挂在父 ProjectionNode 上形成树（root 是页面级 DocumentProjectionNode）。React commit 后这棵树跑 4 个 forEach 算出最终 transform。

[packages/motion-dom/src/projection/node/create-projection-node.ts L811-L880](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/projection/node/create-projection-node.ts#L811-L880)：

```typescript
didUpdate() {
    if (!this.updateScheduled) {
        this.updateScheduled = true
        microtask.read(this.scheduleUpdate)
    }
}

clearAllSnapshots() {
    this.nodes!.forEach(clearSnapshot)
    this.sharedNodes.forEach(removeLeadSnapshots)
}

projectionUpdateScheduled = false
scheduleUpdateProjection() {
    if (!this.projectionUpdateScheduled) {
        this.projectionUpdateScheduled = true
        frame.preRender(this.updateProjection, false, true)
    }
}

scheduleCheckAfterUnmount() {
    /**
     * If the unmounting node is in a layoutGroup and did trigger a willUpdate,
     * we manually call didUpdate to give a chance to the siblings to animate.
     */
    frame.postRender(() => {
        if (this.isLayoutDirty) {
            this.root.didUpdate()
        } else {
            this.root.checkUpdateFailed()
        }
    })
}

checkUpdateFailed = () => {
    if (this.isUpdating) {
        this.isUpdating = false
        this.clearAllSnapshots()
    }
}

/**
 * This is a multi-step process as shared nodes might be of different depths. Nodes
 * are sorted by depth order, so we need to resolve the entire tree before moving to
 * the next step.
 */
updateProjection = () => {
    this.projectionUpdateScheduled = false

    if (statsBuffer.value) {
        metrics.nodes =
            metrics.calculatedTargetDeltas =
            metrics.calculatedProjections =
                0
    }

    this.nodes!.forEach(propagateDirtyNodes)
    this.nodes!.forEach(resolveTargetDelta)
    this.nodes!.forEach(calcProjection)
    this.nodes!.forEach(cleanDirtyNodes)

    if (statsBuffer.addProjectionMetrics) {
        statsBuffer.addProjectionMetrics(metrics)
    }
}

/**
 * Update measurements
 */
updateSnapshot() {
    if (this.snapshot || !this.instance) return
    this.snapshot = this.measure()
    if (this.snapshot
        && !calcLength(this.snapshot.measuredBox.x)
        && !calcLength(this.snapshot.measuredBox.y)) {
        this.snapshot = undefined
    }
}
```

旁注：

- **`microtask.read` 不是 `frame.preRender`**——microtask 在当前 task 结束前跑（比 RAF 早），用来"批量"同一帧内多个 didUpdate 调用。比如父子两个 motion 同时 layout 变了，触发两次 didUpdate，但只 schedule 一次 updateProjection。这是 v9 引入的批处理优化，之前每个 didUpdate 都跑一次完整的 4-pass，嵌套树爆炸。
- **`scheduleCheckAfterUnmount` 处理 AnimatePresence**——元素 exit 时 React unmount，但 motion 想让它 fade out 才真删。`postRender` 排到下一帧渲染后，检查 `isLayoutDirty`：如果是 layoutGroup 内的 sibling 因为这个 unmount 引起 layout 变化（FLIP shared element 场景），手动触发 didUpdate 让兄弟动起来。这是"unmount 后还能 animate"的关键脚手架。
- **4-pass 是必须的**——`propagateDirtyNodes` 把 dirty 标记从根传到叶（孩子继承父的 dirty）；`resolveTargetDelta` 算每个节点的 target box - current box；`calcProjection` 把 delta 转成 transform string（含 scale 补偿）；`cleanDirtyNodes` 清状态。**不能合并成一次遍历**——因为 calcProjection 需要父的 projection 已算完才能补偿 scale，必须先扫一轮算所有 target，再扫一轮算 projection。这是树形 FLIP 的固有复杂度。
- **`measure()` 调用顺序敏感**——`updateSnapshot` 必须在 React commit 之前（"first"），`updateLayout`（[L899-L928](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/projection/node/create-projection-node.ts#L899-L928)）必须在 React commit 之后但 transform 真应用之前（"last"）。`MeasureLayout` class component 的 `getSnapshotBeforeUpdate` 钩这个时机——这是 motion 必须用 class component 而不能纯函数 hook 的根本原因，`useLayoutEffect` 太晚了（DOM 已经被浏览器渲染了一次）。
- **`statsBuffer.addProjectionMetrics` 是 dev tool hook**——production 走过去 `if (statsBuffer.value)` 直接跳。这是给 motion DevTools 用的——计数每帧多少节点参与 projection、多少 delta 被算、多少 projection 被生成。
- **`measure(removeTransform = true)`** [L999-L1022](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/projection/node/create-projection-node.ts#L999-L1022)——量 box 时**把当前 transform 反算回去**，因为 `getBoundingClientRect()` 返回的是 transform 应用后的视觉 box，FLIP 需要 layout box（"如果没有任何 transform，元素会在哪"）。`removeTransform: false` 是 pre-render 阶段、还没应用 transform 时用，避免双重 reverse。

**怀疑 3**：`microtask.read` 在 React 18 的 concurrent mode + transition + Suspense 三件套下还安全吗？React 18 的 commit 可能被 throttle 或 split，microtask 排队的 `scheduleUpdate` 跑的时候，DOM 可能处于"半更新"状态（部分 fiber commit 了、部分没）。motion 的 measure 在这一刻读出的 box 是不一致的。issue tracker 搜 "concurrent mode layout animation"——还有，layoutEffect vs effect 的执行时机在 transition 里被拉伸过，motion v11 大改正是因为这个。

**怀疑 4**：`animationTarget = 1000`（[L90](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/projection/node/create-projection-node.ts#L88-L91)）注释说 "0-1000 maps better to pixels than 0-1"——但浮点精度上，`progress / 1000` 在 [0, 1] 比直接 [0, 1] 算出来误差能差几个数量级吗？追到 mixNumber 实现，可能在大 box（>5000px）时 1/1000 步进会丢失亚像素精度。layout 跨 4K 屏的 hero 切换可能踩这个。

## Hands-on（含改一处实验）

30 分钟跑通 + 改 spring stiffness 看视觉差。

```bash
# 1. 起一个空 React 项目
mkdir -p /tmp/motion-toy && cd /tmp/motion-toy
npm create vite@latest . -- --template react-ts
npm install
npm install motion           # 注意是 motion 不是 framer-motion——v12 后包名改了，
                             # framer-motion 是 alias，新代码推荐 motion
```

替换 `src/App.tsx`：

```tsx
import { motion, useAnimate } from "motion/react"
import { useState } from "react"

export default function App() {
    const [open, setOpen] = useState(false)
    const [scope, animate] = useAnimate()

    return (
        <div style={{ padding: 40 }}>
            <button onClick={() => setOpen(!open)}>toggle layout</button>
            <button onClick={async () => {
                // imperative API
                await animate(scope.current, { rotate: 360 },
                    { type: "spring", stiffness: 100, damping: 10 })
            }}>spin</button>

            <div ref={scope} style={{
                display: "flex", gap: 12, marginTop: 20,
                flexDirection: open ? "row" : "column",
            }}>
                {[1, 2, 3].map(i => (
                    <motion.div
                        key={i}
                        layout
                        layoutId={`box-${i}`}
                        whileHover={{ scale: 1.1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        style={{
                            width: 80, height: 80, borderRadius: 12,
                            background: ["#e74c3c", "#3498db", "#2ecc71"][i-1]
                        }}
                    />
                ))}
            </div>
        </div>
    )
}
```

```bash
npm run dev
# 浏览器打开 localhost:5173，点 "toggle layout"——三个 box 从纵向变横向，
# 自动 FLIP 动画过去（不是瞬间跳）。点 "spin" 走 imperative API。
```

**改一处实验**：把 stiffness 从 200 改成 800，damping 仍 20。

```tsx
transition={{ type: "spring", stiffness: 800, damping: 20 }}
```

观察：

- **stiffness 200 + damping 20**：dampingRatio = 20 / (2 × √(200 × 1)) ≈ 0.71，欠阻尼，box 切换时会"弹一下"再停。视觉上有"果冻感"。
- **stiffness 800 + damping 20**：dampingRatio = 20 / (2 × √(800)) ≈ 0.35，更欠阻尼但 stiffness 高，弹更快、振幅相对小。视觉上"snappy"——Linear app 风格。
- **再改成 stiffness 100 + damping 30**：dampingRatio = 30 / (2 × √(100)) = 1.5，过阻尼，box 慢慢"爬"到位、不弹。视觉上"沉重"。

把 chrome devtools Performance 录一段，看 main thread 的 task 分布——layout projection 是否走 WAAPI（看 "Animations" 面板有 entry 表示 compositor）还是走 RAF（main thread 上有持续的 "Animation Frame Fired"）。layout 的 transform-only 应该走 WAAPI（因为 motion 知道 layout 只动 transform/opacity），imperative animate 因为有 onUpdate 隐含可能会走 RAF。

**第二个实验**：改 spring 的 `restSpeed.granular` 从 0.01 改到 0.5——

```bash
cd /tmp && git -c http.sslVerify=false clone --depth 1 https://github.com/motiondivision/motion mtest
cd mtest
# 编辑 packages/motion-dom/src/animation/generators/spring.ts L34-L41
#   granular: 0.01 → 0.5
yarn install
yarn workspace motion-dom build
# 然后用 yarn link 或 file: 协议替换上面 toy 里的 motion-dom
```

观察：rest 检测过早触发，box 在到达 target 前停下、最后一段距离瞬移补齐。视觉上有"卡一下"——这就是为什么 0.01 是经验调出来的。

## 横向对比

| 维度 | framer-motion | react-spring | GSAP | auto-animate | CSS transition / WAAPI |
|---|---|---|---|---|---|
| 哲学 | 声明式 + 物理 + projection | 声明式 + 物理 | 命令式 timeline | 全自动 layout | 命令式 / 声明式两路 |
| Spring 实现 | 解析闭式解 O(1) | RK4 数值积分 | 不内置（plugin） | 无（CSS） | 无 |
| Layout animation | layoutId 内置 FLIP 树 | 手动测 box | FLIP plugin | 全自动（魔法） | 手写 FLIP |
| 兼容范围 | React / Vue / vanilla JS | React | 任意 DOM | 任意 DOM | 任意 DOM |
| Bundle 大小 | ~50KB（核心，LazyMotion 17KB） | ~25KB | ~70KB | ~3KB | 0 |
| 性能模型 | hybrid: WAAPI + RAF | RAF | RAF | CSS only | 浏览器原生 |
| Imperative API | `useAnimate` | `useSpringApi` | timeline | 不支持 | `element.animate()` |
| Gesture 集成 | drag/hover/tap/inView 内置 | 不集成 | 商业插件 | 不集成 | 自己写 |
| 学习曲线 | 中（API surface 大） | 中（spring 概念） | 高（timeline 心智） | 极低 | 中（CSS 知识） |
| 适合场景 | 复杂交互 + layout 切换 | 数值动画为主 | 影视级时间轴 | 极简列表动画 | 简单 hover/transition |

选型建议：

- **框架是 React + 设计 UI 含 layout 切换 / shared element transitions**：选 framer-motion。layoutId 是它独有的杀手锏，自己实现 FLIP 树超过一周工作量。Linear / Vercel / Apple 都这么选。
- **只需要数值 animate（数字爬动 / 进度条）**：react-spring 更轻、心智更简单。motion 的 layout / projection 此时是负担。
- **需要复杂 timeline（多步骤 sequence、scrub、reverse）**：GSAP。motion 的 sequence API（`useAnimate` 数组形式）是 v11 才有的，远不如 GSAP timeline 强大。
- **只想给列表加 enter/exit/move 动画，不在乎参数控制**：auto-animate（formkit），3KB，零配置。motion 的 AnimatePresence + layout 实现等价行为但要写更多代码。
- **简单 hover、focus transition**：CSS `transition` 直接搞定，别引 50KB。

> **哲学不同的竞品 = auto-animate**——它的 insight 是 "用户不需要参数，只需要一个 `enabled` 开关"，把所有 spring 默认值硬编码、自动检测 layout 变化。motion 的反向 insight：**用户需要细粒度控制**（设计师要调 stiffness、产品要在不同设备 disable），所以暴露一切。两条路线对应不同的 user persona——auto-animate 给 "想加点动画但不想学" 的工程师，motion 给 "动画是产品差异化" 的团队。

## 与你当前工作的连接

**今天就能用**：

- **结果页多图依次入场** —— N 张图依次淡入 + 微旋转出现，现状常见是手写 setTimeout + CSS。换成 `<motion.div initial={{ opacity: 0, rotate: -5 }} animate={{ opacity: 1, rotate: 0 }} transition={{ delay: i * 0.15, type: "spring", stiffness: 200 }} />` 一行干掉一坨调度代码
- **按钮 hover / tap 反馈** —— `whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}` 替代手写 onMouseEnter/Leave + CSS class 切换
- **AnimatePresence 处理"图片 lazy 加载完才淡入"** —— `<AnimatePresence><motion.img key={src} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /></AnimatePresence>` 替代手写 onLoad state
- **page transition** —— Next.js 的 page 切换之间加 layoutId 实现共享元素动画（点缩略图卡片放大成详情页 hero 图）

**下个月能用**：

- **任务时间轴拖拽重排** —— 时间轴 task 卡片拖拽、重排，用 `<Reorder.Group>` + drag 内置；spring physics 处理 release 时的回弹，比手写 `requestAnimationFrame` 简洁一个量级
- **JSON Lines 事件时间轴 viewer** —— 用 `useScroll` + `useTransform` 把 scroll position 映射到时间游标，配 `motion.div` 的 transform 实现 60fps 时间轴 scrubbing
- **抽屉式 step 切换** —— `<motion.div layout layoutId={current} />` + AnimatePresence 实现"上一步滑出 + 下一步滑入"的 FLIP，复用同一个 ProjectionNode tree
- **个人作品页 / portfolio 动画** —— 用 motion + tailwind 写一个 hero 图 layoutId 切换 + 滚动视差 useScroll + 物理感 spring 的演示页，作为前端动画细节的练习场

**不要用的部分**：

- **不要把 motion 当 GSAP 用** —— motion 的 timeline / sequence 只能做"有限步骤"（数组），不能 scrub / reverse / labels。如果需求是"动画导演级时间轴"，用 GSAP，别为了"已经引了 motion"就硬上
- **不要在 SSR 关键 above-the-fold 用复杂 motion** —— 50KB 主 bundle 是 hot path，初次加载阻塞 LCP。用 LazyMotion + m component 拆，或者 above-the-fold 用纯 CSS
- **不要用 motion 做 SVG 路径动画** —— `<motion.path>` 支持 `pathLength` 但 SVG 复杂动画（path morphing / Bezier 操作）用 svgdotjs / animejs 更直接
- **不要在 React Native 里用 framer-motion** —— framer-motion 重度依赖 DOM API（getBoundingClientRect / WAAPI / projection 树测量），RN 用 react-native-reanimated 才对
- **不要用 motion 实现"全屏粒子效果"** —— 粒子系统应该用 Canvas / WebGL（pixi.js / three.js），DOM-based motion 在 100+ 节点时 layout projection 树会成为瓶颈

## 自检问题 + 延伸阅读

**自检问题**（追到行号级别）：

1. underdamped spring 当 `dampingRatio = 0.99999` 时（接近临界但不是 1）走 `dampingRatio < 1` 分支，`calcAngularFreq(undampedFreq, 0.99999)` = `undampedFreq × √(1 - 0.99998)` ≈ `undampedFreq × 0.00447`，几乎是 0。除以 `angularFreq` 的 `A = (...) / angularFreq` 会数值不稳吗？追 [spring.ts L292-L297](https://github.com/motiondivision/motion/blob/43e508e3e967b3d17b5361064d0d53812f12fee6/packages/motion-dom/src/animation/generators/spring.ts#L291-L297)。
2. `MeasureLayout` 是 class component，但 createMotionComponent 返回 functional component——React Strict Mode 在 dev 下双重渲染会让 class 的 `getSnapshotBeforeUpdate` 被调两次吗？两次 measure 的 box 一致吗？
3. layout projection 4-pass 在 1000 个 motion 节点的页面（如 Notion 文档）上一帧要跑多少 ms？哪一 pass 最慢？追 `metrics.calculatedProjections`。
4. AnimatePresence 的 exit prop 在快速反复 mount/unmount（如 toast 风暴）时，`scheduleCheckAfterUnmount` 的 `frame.postRender` 会堆积吗？是否有 cancellation 机制？
5. `useMotionValue` 创建的 MotionValue 在父 motion unmount 时是否被 GC？还是常驻 SubscriptionManager？追 motion-dom 的 MotionValue 实现的 `subscribe` 返回值。

**接下来读哪 N 个文件**：

1. `packages/motion-dom/src/projection/node/create-projection-node.ts` 完整通读（2465 行）—— 真正吃透 FLIP 树需要看完 4-pass 全部实现 + measure / removeTransform / mixValues
2. `packages/motion-dom/src/animation/JSAnimation.ts`（560 行）—— RAF 路径动画类，对比 WAAPI 路径，理解 hybrid 决策树
3. `packages/motion-dom/src/animation/waapi/start-waapi-animation.ts` —— 怎么把 spring generator 喂给 `element.animate()`，linear() easing 怎么生成
4. `packages/framer-motion/src/components/AnimatePresence/index.tsx` —— exit 动画的 React 端调度，怎么"延迟 unmount"
5. `packages/framer-motion/src/motion/features/load-features.ts` —— LazyMotion 的 lazy bundle 注册机制，怎么 tree-shake
6. `packages/motion-dom/src/value/spring-value.ts` —— useSpring 的 MotionValue 包装，对比 spring generator 看"持续值" vs "一次性动画"

## 限制

- **bundle 重** —— 完整版 ~50KB minified gzipped，比 react-spring 重一倍，比 auto-animate 重一个量级。LazyMotion + m component 能砍到 17KB 但失去 motion.div 这种"自动注册全部 features"的便利性。Bundle-conscious 项目（电商首屏 / 小程序 H5）要谨慎
- **layout projection 是 leaky abstraction** —— `<motion.div layout />` 大部分时候"就是 work"，但当父子嵌套 layout、scroll 容器、`position: fixed`、CSS containment 等组合时，会出现"动画跳了一下"或"transform 残留"等怪异现象。debug 时必须懂内部 4-pass 才能修——对 80% 用户来说这是黑魔法
- **TypeScript 类型推断对自定义组件不友好** —— `motion(MyComponent)` 包过的组件，prop 类型经常 broken（`MotionProps` 和原 props 的 intersection 在很多 utility type 下退化成 `any`）。这是 ForwardRef + generic 双重套娃的固有问题，社区有 issue 跟踪很久了
- **API 命名混乱** —— `useAnimate` / `animate` / `useAnimation` / `useAnimationControls` / `Animate(legacy)` 有 5 个相关 API，每个版本 naming 都在迁移。文档里推荐 `useAnimate`，但很多老博客还在教 `useAnimation`——查 stackoverflow 经常踩坑
- **包名换了** —— 2025 年从 `framer-motion` 改名 `motion`（npm 包），但 import path 是 `motion/react`，README 里还有 `framer-motion` 的 alias。新代码该用哪个名字？官方说"都行"，但 ESLint / TypeScript 解析路径时会有 cache 不一致问题
- **没有官方 React Native 支持** —— motion 重度依赖 DOM，RN 用户只能去 reanimated。但 motion 的 API 设计已经成事实标准，reanimated 的 API 体感差距大。这是 React 跨平台动画生态的长期撕裂

## 附录：宣传 vs 现实

| 文档/官网说 | 代码现实 |
|---|---|
| "Motion has a hybrid engine that uses both WAAPI and RAF" | 实际是"layout projection / transform-only 路径走 WAAPI，其他走 RAF"，hybrid 是按动画类型分流而不是按帧切换。文档没强调这点 |
| "60fps animations" | 60fps 是 WAAPI 路径的事——RAF 路径在主线程繁忙时（heavy React render / 复杂 useTransform 链）会掉帧。文档对此沉默 |
| "LayoutId enables shared layout animations between any two components" | 实际只在 layoutGroup 同 generation 内共享 + 至少一个挂载着——跨 page transition 的 shared element 需要配合 Next.js 的 page transitions API（v14 仍 experimental），文档给的例子都是同页内 |
| "Spring physics by default" | 默认确实是 spring，但默认参数（`stiffness: 100, damping: 10, mass: 1`）非常欠阻尼（dampingRatio = 0.5），很多用户觉得"动画太弹"——其实是默认值争议，issue 长期讨论 |
| "Production used by Linear, Vercel, Apple" | Apple 的"使用"是指 apple.com 营销页（不是 native iOS），Linear 是核心产品，Vercel 是文档站。"production" 的颗粒度差异大 |
| "Tree-shakeable with LazyMotion" | tree-shake 是 ESM 层面的，但 motion 的 features 注册是单例 side effect，必须用 `LazyMotion + m`（不能用 `motion.div`）才真正拆，否则 bundle 仍有完整 features。这是不直观的"激进 tree-shake" |

## 元数据

- 升级日期: 2026-05-29
- 项目类型: 工具库（v1.1 分支 B）
- 核心信息表 9 字段:
  - stars: 32.1k（截至 2026-05）
  - fork: ~1.2k
  - 最近活跃: 2026-05-27（mattgperry 持续维护，audit 系列 PR 在合）
  - commit hash: `43e508e3e967b3d17b5361064d0d53812f12fee6`
  - 主语言: TypeScript
  - 维护方: motiondivision（Matt Perry / Lochie / 社区贡献者，Claude 做 co-author 多次）
  - License: MIT
  - 创立者: Matt Perry（mattgperry，Framer animation engine 作者）
  - 类似项目: react-spring / GSAP / auto-animate / motion-canvas / popmotion（motion 前身）/ reanimated / WAAPI 原生
  - 用户（公开）: Linear / Vercel / Apple 营销页 / GitHub / Notion / Coinbase
- Layer 3 三段独立小节:
  - A createMotionComponent（forwardRef + VisualElement 树 + MeasureLayout class 钩 commit）
  - B spring() generator（三种阻尼闭式解 + Newton 反演 duration→stiffness + WAAPI linear() 输出）
  - C createProjectionNode（FLIP 树 + 4-pass updateProjection + microtask 批处理 + class component 钩 getSnapshotBeforeUpdate）
- GitHub permalink 数: 8 处（createMotionComponent 函数 / useStrictMode / spring() 主函数 / approximateRoot / Newton 部分 / didUpdate-to-updateProjection / measure() / animationTarget 常量）
- 显式怀疑: 4 处（process.env.NODE_ENV dead-code-elimination / spring 大 velocity 振幅爆炸 / microtask vs React 18 concurrent / animationTarget 1000 浮点精度）+ Layer 7 自检 5 个 = 共 9 处
- Figure: 1 张 webp（`/projects/framer-motion/01-architecture.webp`，~85 KB，4 列 motion→animate→spring→driver pipeline + 底栏 7 步 FLIP 流水线）
- 限制: 6 条
- 宣传 vs 现实: 6 行
- 启用工具: git clone（深度 1，--ssl-no-verify 兜底）+ Read + 本地 PIL 画图（CJK 字体 Hiragino Sans GB）+ WebFetch（star 数 + 维护者 + commit hash）
- Season 19 Animation 启动篇：第一篇，本季计划 = motion + react-spring + GSAP + auto-animate + reanimated（待定）
