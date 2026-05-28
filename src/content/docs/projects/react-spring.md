---
title: react-spring 状元篇
description: 基于物理 spring 的 React 动画库，告别 duration-based 缓动
season: 19
episode: 4
tier: champion
category: tool-library
status: published
---

import Figure from '../../../components/Figure.astro';

## Layer 0 项目档案

| 字段 | 值 |
|------|----|
| 仓库 | pmndrs/react-spring |
| Stars | 28k |
| License | MIT |
| 主语言 | TypeScript |
| 首次提交 | 2017 |
| 当前主版本 | v9.x |
| 维护方 | Poimandres 集体（开源组织） |
| 包大小 | core ~16KB gzipped |
| 依赖 | 仅 React peer，无运行时第三方依赖 |
| 主要竞品 | Framer Motion / GSAP / Lottie |

## 一句话定位

react-spring 是一个**基于物理 spring 模型**的 React 动画库——它不让你设定"动画持续 300ms"，而是让你描述"这个东西的弹性、阻尼、初速度"，然后用数值积分让它自然地运动到目标值。

<Figure
  src="/projects/react-spring/01-architecture.webp"
  alt="react-spring 架构总览"
  caption="SpringValue（单值物理引擎）+ Controller（多动画协调）+ useSpring（React hook 桥）的三层结构"
/>

## Layer 1 为什么存在

### 痛点 1: CSS transition 的死板

CSS 的 `transition: all 0.3s ease-out` 看起来够用，但有三个硬伤：

1. **duration 是人为编的**：300ms 还是 350ms？没人说得清，全凭设计师拍脑袋。
2. **被打断后行为诡异**：动画进行到一半，目标值突然变了，CSS 会从当前位置**用同样的 duration**重新开始——视觉上像卡顿。
3. **物理感缺失**：现实世界的物体没有"匀加速到一半再匀减速"这种缓动，它们是**质量+弹性+阻尼**驱动的。

### 痛点 2: Framer Motion 也是 duration-based

[Framer Motion](/projects/framer-motion) 虽然 API 更友好，但默认仍然是 keyframe + duration 的思维。它后来加了 `type: "spring"` 模式，但那是**模仿** react-spring 的产物——react-spring 才是把 spring 当一等公民的库。

### react-spring 的回答

不指定 duration，只指定**弹性参数**：`tension`（劲度系数）、`friction`（阻尼系数）、`mass`（质量）。库内部用 ODE（常微分方程）数值积分，**每一帧**根据当前位置、速度、目标值计算下一帧的位置。打断时也只是改变目标值，速度连续保持——视觉上**自然过渡**。

## Layer 2 仓库地形

```
react-spring/
├── packages/
│   ├── core/              # SpringValue + Controller + useSpring 等核心
│   │   ├── src/SpringValue.ts        # 单值物理引擎
│   │   ├── src/Controller.ts         # 多动画协调器
│   │   ├── src/hooks/useSpring.ts    # React hook 入口
│   │   ├── src/animated/             # animated 组件包装
│   │   └── src/AnimationConfig.ts    # tension/friction 等配置
│   ├── animated/          # `<a.div>` 这类原生元素的代理
│   ├── shared/            # FrameLoop（全局帧循环管理器）
│   ├── konva/  three/  native/  zdog/   # 各渲染目标的适配
│   └── parallax/          # 视差专用组件
├── targets/               # web / native / zdog 等目标平台入口
└── demo/                  # 官方示例
```

核心三层结构：**SpringValue（数学层）→ Controller（协调层）→ useSpring（React 桥接层）**。

## Layer 3 精读

### 精读 A: SpringValue 的 ODE 数值积分

`SpringValue` 是单值物理引擎。每一帧它根据 spring 方程更新自身位置。**这是整个库的灵魂**——只要这一段代码理解了，剩下的都是工程胶水。

代码出自 pmndrs/react-spring `f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0`：

```typescript
// packages/core/src/SpringValue.ts (简化版)
export class SpringValue<T = any> extends FrameValue<T> {
  // 当前显示值
  protected _displayed: T

  // 目标值
  protected _to: T | undefined

  // 当前速度（向量）
  protected _velocity: number = 0

  // 配置：tension（弹性）/ friction（阻尼）/ mass（质量）
  config: SpringConfig = {
    tension: 170,
    friction: 26,
    mass: 1,
    precision: 0.005,
  }

  // 每一帧由 FrameLoop 调用
  advance(dt: number): boolean {
    let from = this._displayed as number
    let to = this._to as number
    let velocity = this._velocity

    const { tension, friction, mass } = this.config

    // 用 RK4（四阶龙格-库塔）数值积分会更精确
    // 但库内部用的是简单的欧拉积分（够用了，1/120 秒一步）
    const numSteps = Math.ceil(dt / (1 / 120))
    const stepSize = dt / numSteps

    for (let i = 0; i < numSteps; i++) {
      // Hooke 定律：F_spring = -k * (x - target)
      const springForce = -tension * (from - to)
      // 阻尼力：F_damping = -c * v
      const dampingForce = -friction * velocity
      // 牛顿第二定律：a = F / m
      const acceleration = (springForce + dampingForce) / mass

      // 欧拉积分一步
      velocity = velocity + acceleration * stepSize
      from = from + velocity * stepSize
    }

    // 收敛判定：位置和速度都接近目标
    const isAtRest =
      Math.abs(velocity) < this.config.precision &&
      Math.abs(from - to) < this.config.precision

    if (isAtRest) {
      this._displayed = to as any
      this._velocity = 0
      return false  // 告诉 FrameLoop 不用再调度自己了
    }

    this._displayed = from as any
    this._velocity = velocity
    return true  // 还在运动，下一帧继续调度
  }
}
```

旁注：

- **为什么 tension 默认 170 / friction 默认 26**：这两个值是 react-motion（前身）调出来的"感觉自然"的经验值，相当于一个中等劲度的现实弹簧。改大 tension 变快变急，改大 friction 变慢变稳。
- **为什么内部循环 `numSteps`**：浏览器 `requestAnimationFrame` 给的 `dt` 不稳定（16ms / 32ms / 偶尔更大）。如果直接用大 `dt` 一步积分，spring 会"飞过头"震荡。所以拆成 1/120 秒的小步多次积分。
- **为什么用欧拉积分而不是 RK4**：欧拉精度差但足够（spring 是稳定系统，误差不会发散），RK4 每步计算量翻 4 倍不划算。这是**性能 vs 精度**的权衡。
- **`isAtRest` 的意义**：动画"看起来停了"和"数学上停了"是两件事——精确停在目标值要无穷多帧。`precision` 是工程妥协：肉眼分辨不出的差距就当停了。
- **`return false` 退出帧循环**：这个返回值非常关键。`FrameLoop` 是**全局共享**的，所有 SpringValue 都注册到它。一个 spring 静止后必须从循环里"自我移除"，否则 100 个静止 spring 也会持续吃 CPU。

怀疑：欧拉积分在极端参数下（比如 tension 10000、friction 1）会震荡发散吗？实测会的——库的解法是不暴露这种参数组合的"安全配置预设"（slow/wobbly/stiff/gentle），引导用户走稳定区间。这其实是**用 API 设计回避数学问题**。

### 精读 B: Controller 协调多个 SpringValue

光有 SpringValue 不够。一个动画通常涉及多个属性（x/y/scale/opacity），还要支持串行（先 A 再 B）、并行、链式 .then()。`Controller` 就是干这个的。

```typescript
// packages/core/src/Controller.ts (简化版)
export class Controller<State extends object = any> {
  // key → SpringValue 映射，每个 key 是一个动画属性
  springs: SpringValues<State> = {} as any

  // 当前所有正在跑的动画 promise
  private _running: Set<Promise<any>> = new Set()

  // 启动一组动画
  start(props: ControllerUpdate<State>): AsyncResult<this> {
    const queue = this._prepareQueue(props)

    // 每个 prop 对应一个 SpringValue
    return Promise.all(
      queue.map(async (update) => {
        const { to, config, delay = 0 } = update

        // 收集所有要动的 key
        const keys = Object.keys(to) as Array<keyof State>

        // 给每个 key 创建/复用 SpringValue
        const promises = keys.map(async (key) => {
          let spring = this.springs[key]
          if (!spring) {
            spring = new SpringValue(this.get()[key])
            this.springs[key] = spring
          }
          if (config) spring.config = { ...spring.config, ...config }
          if (delay) await new Promise(r => setTimeout(r, delay))

          // 调用 SpringValue.start，它会注册到 FrameLoop
          return spring.start(to[key])
        })

        return Promise.all(promises)
      })
    ).then(() => ({ value: this.get(), finished: true, controller: this }))
  }

  // 停止所有动画
  stop(...keys: Array<keyof State>): this {
    const targetKeys = keys.length ? keys : Object.keys(this.springs)
    targetKeys.forEach(key => {
      this.springs[key as keyof State]?.stop()
    })
    return this
  }

  // 获取当前所有值的快照
  get(): State {
    return Object.entries(this.springs).reduce((acc, [key, spring]) => {
      (acc as any)[key] = (spring as SpringValue).get()
      return acc
    }, {} as State)
  }
}
```

旁注：

- **为什么 Controller 而不是直接用 SpringValue**：用户写 `useSpring({ x: 100, y: 200, opacity: 1 })` 时，需要**一次 API 调用**启动 3 个独立的 SpringValue。Controller 就是这一层抽象。
- **`Promise.all` + 链式 then**：这是 react-spring 的"动画即 promise"哲学——可以 `await api.start({ x: 100 }).then(() => api.start({ y: 200 }))` 实现串行。Framer Motion 的 sequence API 是后来加的，react-spring 一开始就这么设计。
- **复用 SpringValue 而不是销毁重建**：`if (!spring)` 检查很关键。重渲染时 useSpring 会再调一次 start，如果每次都新建 SpringValue，**速度会丢失**——动画看起来卡顿。复用让"打断时的速度连续"成为可能。
- **`stop(...keys)`**：停止动画不是把目标设为当前位置（那会有突变），而是**把速度清零**——物体停在哪就停在哪，下次 start 再从这里开始。

怀疑：`get()` 每次都遍历所有 springs 调 `spring.get()`——如果 springs 数量大（比如 1000 个并发动画），这是 O(n) 调用。文档说"列表动画用 useSprings 而不是 1000 个 useSpring"，但这只是绕过问题，没解决根本性能瓶颈。

### 精读 C: useSpring hook + onChange/onRest

到这里物理引擎和协调器都有了，怎么把它们装到 React 里？答案是**把 Controller 装进 ref，把 spring values 暴露成 animated values**。

```typescript
// packages/core/src/hooks/useSpring.ts (简化版)
export function useSpring<Props extends UseSpringProps>(
  props: Props | (() => Props),
  deps?: any[]
): SpringValues<PickAnimated<Props>> & { ref: SpringRef } {

  // 用 useMemo 创建一次 Controller，组件生命周期内复用
  const controller = useMemoOne(() => new Controller(), [])

  // 解析 props（支持函数式 props 和对象式 props）
  const propsFn = typeof props === 'function' ? props : null
  const propsObj = propsFn ? propsFn() : props

  // 把 onChange / onRest 这类回调挂到 controller
  useLayoutEffect(() => {
    if (propsObj.onChange) {
      controller.onChange = propsObj.onChange
    }
    if (propsObj.onRest) {
      controller.onRest = propsObj.onRest
    }
  })

  // 关键：deps 变了就触发新的 start
  useLayoutEffect(() => {
    controller.start(propsObj)
  }, deps)

  // 卸载时停止动画，防止内存泄漏
  useEffect(() => () => {
    controller.stop()
  }, [])

  // 把 springs 包装成 animated values 返回
  // animated values 不是普通数值，而是订阅型对象
  // <a.div style={{ x: springs.x }} /> 中的 springs.x 每帧会触发 div 重渲
  // 但**不是 React 重渲——是直接改 DOM 样式**
  return controller.springs as any
}
```

旁注：

- **`useMemoOne` 而不是 `useMemo`**：React 的 useMemo 不保证复用（即使 deps 没变也可能重算）。useMemoOne 是 react-spring 自己的一个工具，**严格只在 deps 变时重算**。这关系到 Controller 不被重建，进而关系到动画状态不丢。
- **`useLayoutEffect` 而不是 `useEffect`**：动画启动要在浏览器绘制**之前**，否则会有一帧"旧值"。useLayoutEffect 是同步执行的，正好。
- **animated values 是订阅型对象**：返回的 `springs.x` 不是 number，而是一个 SpringValue 实例。`<a.div style={{ x: springs.x }} />` 内部会订阅这个 SpringValue 的更新，**直接改 DOM**——绕过 React 的渲染。这是为什么 react-spring 跑 60fps 不会让 React 树重渲染卡顿。
- **`onChange` 和 `onRest`**：onChange 每帧触发（用于"动画过程中触发副作用"），onRest 在 isAtRest 时触发一次（用于"动画结束的回调"）。**两个都是必须的**——只有 onRest 没法做"动画过半触发音效"这种需求。
- **卸载时 stop**：如果不停，组件卸载后 Controller 还在帧循环里跑，SpringValue 内部 setState 会报"set state on unmounted component"。这是 React 库的经典坑。

怀疑：useLayoutEffect 在 SSR 时会警告"useLayoutEffect does nothing on server"。react-spring 的解法是检测 `typeof window === 'undefined'` 时降级到 useEffect。这个降级**会让 SSR 时第一帧动画状态不对**，但他们认为 SSR 场景下用户不需要动画——是工程妥协。

## Layer 4 改一处

加一个 toy 例子：`<a.div>` 用 useSpring 让它从 0 移动到 200px，并打印每一帧的速度。

```tsx
import { useSpring, animated } from '@react-spring/web'

function ToyDemo() {
  const [{ x }, api] = useSpring(() => ({
    from: { x: 0 },
    to: { x: 200 },
    config: { tension: 170, friction: 12 },  // friction 调小让它弹一下
    onChange: ({ value }) => {
      // 每一帧打印当前 x 值
      console.log('current x:', value.x)
    },
    onRest: () => {
      console.log('arrived')
    },
  }))

  return (
    <animated.div
      style={{
        width: 50,
        height: 50,
        background: 'tomato',
        transform: x.to(v => `translateX(${v}px)`),  // 注意 .to 是 SpringValue 的链式映射
      }}
    />
  )
}
```

可观察：

- friction = 12 时 div 会**冲过 200 再回弹**几次再稳定（弹性强）
- friction = 26（默认）时 div 平滑减速到 200 几乎不超调
- friction = 100 时 div 像爬过去一样很慢

这就是物理 spring vs duration-based 的核心差异：**改一个数字，动画的"质感"整体变了**——而不是改 duration 让"快慢"变了。

## Layer 5 横向对比

| 维度 | react-spring | Framer Motion | GSAP | CSS transition | WAAPI |
|------|--------------|---------------|------|----------------|-------|
| 核心模型 | 物理 spring (ODE) | duration + spring 选项 | timeline + tween | duration + cubic-bezier | duration + cubic-bezier |
| 心智模型 | 弹性/阻尼/质量 | from/to + 时长 | timeline 串行 | 单属性过渡 | keyframe API |
| React 集成 | 一等公民 | 一等公民 | 需手写 useEffect | 无（DOM 层） | 无（DOM 层） |
| 包大小 | ~16KB | ~30KB+ | ~30KB+ | 0 | 0 |
| SSR | 支持但有降级 | 支持 | N/A | 原生支持 | 原生支持 |
| 打断处理 | 速度连续 | 速度连续（spring 模式） | 切换 tween | 重新开始 | 重新开始 |
| 适用场景 | 物理感 UI / 拖拽 / 视差 | 通用 React 动画 | 复杂时间线（游戏/Banner） | 简单状态过渡 | 浏览器原生动画 |
| 学习曲线 | 中（要理解 spring 参数） | 低（直觉 API） | 中（timeline 概念） | 极低 | 中 |

补充：

- **vs Framer Motion**：Framer Motion 包大、API 更"产品化"（`<motion.div animate={...}>` 直觉），适合 99% 的通用动画。react-spring 包小、物理感强，适合需要**自然过渡 + 频繁打断**的场景（拖拽、手势驱动）。
- **vs GSAP**：GSAP 是"动画专业户"，做复杂 timeline（游戏过场、广告 banner）无敌。但它和 React 不是一路人——你要手动 useEffect 控制 GSAP 实例。react-spring 是"为 React 而生"。
- **vs Lottie**：Lottie 是放预渲染动画（设计师导出 JSON），不是程序化动画。和 react-spring 不冲突，可以共存。

## Layer 6 通用模式（可迁移到其他项目）

### 模式 A: 全局 FrameLoop + 自我移除

react-spring 用一个**全局共享**的 FrameLoop，所有 SpringValue 注册进去。每个 SpringValue 静止后通过 `return false` 自我移除。这个模式可以泛化：

- 多个 setInterval 改成单一 setInterval + 任务队列：避免 100 个组件各自开 100 个 interval
- WebSocket 心跳统一管理：一个 socket 多路复用
- IntersectionObserver 全局共享：一个 observer 监听多个元素
- 任何"高频回调 + 多订阅者"场景：**集中调度 + 自我注销**

### 模式 B: 用 API 设计回避数学陷阱

react-spring 有 `slow / wobbly / stiff / gentle / molasses` 五个预设。用户绝大多数情况只需要选一个，不必懂 tension/friction 的数学含义。这把"参数空间里哪些组合是稳定的"知识沉淀到了 API。可迁移到：

- 配置项里只暴露 `low / medium / high` 而不是数字 0-100：把"什么数字是合理的"知识封装
- 错误码里"1001 / 1002"换成 `INSUFFICIENT_BALANCE / INVALID_TOKEN`：把"代码含义"封装
- 颜色 token 用语义名 `primary / danger` 而不是 `#ff0000`：把"什么颜色用在什么场景"封装
- API 设计的本质是**用约束帮用户做对**

### 模式 C: 把异步操作 promise 化

`controller.start(...).then(...)` 让动画可以 await 串联。Promise 是 JS 异步的统一抽象，把任何"有开始有结束"的事情包成 promise 就能用 async/await 编排。可迁移到：

- 弹窗：`showDialog(...).then(result => ...)` 而不是 `onConfirm` 回调
- 过场动画：`await fadeOut(); await loadData(); await fadeIn();`
- 用户引导：`await showHint('点击这里'); await waitForClick(); await showHint('再点这里');`
- 任何 callback hell 都可以 promise 化

### 模式 D: 渲染目标可插拔（targets/）

react-spring 不只支持 web，还支持 native / three / konva / zdog。核心数学层（SpringValue）和渲染层（怎么把数值塞进 DOM/Canvas/WebGL）是**解耦的**。targets/ 目录每个文件是一个适配器。可迁移到：

- 业务逻辑和 UI 框架解耦：core 库不依赖 React，再写 React/Vue/Solid 适配
- 数据库 ORM 支持多种 driver：SQL 生成层和驱动层分离
- 日志库支持多种 transport：format 层和 output 层分离
- **把"算什么"和"渲染到哪"分开**

## Layer 7 怀疑

1. **欧拉积分的精度问题**：精读 A 提到欧拉在极端参数下会震荡。库通过 API 预设回避了，但这意味着**用户能写出的参数空间是真实参数空间的子集**。如果有人非要 tension 10000、friction 1，库会无声地表现得很差——没有 warn，没有 error。这是**隐性约束**，新手会困惑。

2. **animated values 绕过 React 渲染的代价**：`<a.div style={{ x: springs.x }} />` 直接改 DOM，不走 React 渲染。性能好，但**和 React DevTools 不兼容**——你看不到 props 的实时值。Profiler 也看不到这个组件在更新。这是 React 库追求性能时常见的**调试体验损失**。

3. **SSR 降级的隐性 bug**：useLayoutEffect 在 SSR 时降级到 useEffect。这意味着服务器渲染的 HTML 里 `from` 值是初始值，客户端 hydrate 后立刻变成 `to` 值——会闪一下。文档没强调这个，新手 SSR 时会疑惑"为什么动画第一帧不对"。

## 限制

1. **不适合复杂时间线**：序列化的精确控制（"3 秒后做这个，然后 0.5 秒做那个"）GSAP 强得多。
2. **物理参数需要调试**：默认值好用，但要做出"特定质感"的动画（比如 iOS 风格的橡皮筋），要花时间调 tension/friction/mass。
3. **包大小不算最小**：~16KB 比纯 CSS transition（0KB）和 WAAPI（0KB）大。轻量项目不一定值得引入。
4. **学习曲线比 Framer Motion 陡**：要理解 spring 物理模型才能用好。设计师转开发的人可能更喜欢 Framer Motion 的"timing"思维。

## 元数据

- **撰写时间**：S19-4
- **图源**：`/projects/react-spring/01-architecture.webp`（自制架构图）
- **commit 引用**：pmndrs/react-spring `f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0`
- **本系列定位**：v1.1 工具库 B（动画/UI 库类）状元篇
- **关联篇目**：[framer-motion](/projects/framer-motion) / [gsap](/projects/gsap)
- **未涵盖话题**：parallax 子包、konva/three/zdog 渲染目标、useChain/useTransition 高阶 API
