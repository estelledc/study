---
title: react-spring — 用真实弹簧的物理写网页动画
来源: 'https://github.com/pmndrs/react-spring'
日期: 2026-05-30
分类: projects / 前端动画
难度: 中级
---

## 是什么

react-spring 是一个让你**用"真实弹簧的物理参数"写动画**的 React 库。日常类比：传统 CSS 动画像写一个机器人指令——"你 300 毫秒内从 A 走到 B"；react-spring 则是**给你一个真实的弹簧**——你只设定弹簧多硬、阻尼多大、物体多重，然后撒手让它自己弹过去。

你写：

```tsx
const { x } = useSpring({ from: { x: 0 }, to: { x: 200 } })
```

库内部每一帧用牛顿第二定律 + 胡克定律算出 x 应该在哪里——会冲过头一点，再回弹，再稳定。**默认路径没有"持续时间"**——你调的是弹性与阻尼；`config.duration` 只是可选旁路，不是主叙事。

这种"参数化物理"是 react-spring 区别于 [[framer-motion]] / CSS transition / [[anime]] 的核心，也是它能把"被打断的动画"做得最丝滑的原因。

## 为什么重要

不理解 react-spring 的物理思路，下面这些事就解释不了：

- 为什么手势驱动的 UI（拖拽卡片、Pinterest 长按）用 react-spring 会比 Framer Motion 更"贴手"
- 为什么 react-spring 比同类动画库小一半（~16KB vs 30KB+）但功能不少
- 为什么 [[react]] 树重渲染时 react-spring 仍能跑满 60fps——它**绕过了 React 渲染**
- 为什么 [[motion-one]] / Framer Motion 后来都加了 `type: "spring"` 选项——是在追这条路线

## 核心要点

react-spring 的内部架构可以拆成 **三层**：

1. **SpringValue（数学层）**：单个数值的物理引擎。每帧根据 `tension`（弹性）+ `friction`（阻尼）+ `mass`（质量）用欧拉积分算下一帧的位置。类比：一个独立的"弹簧+砝码"装置。

2. **Controller（协调层）**：把多个 SpringValue（x / y / opacity / scale 等）协调起来——支持串行、并行、链式 `.then()`。类比：乐队指挥，让每个乐器（每个属性）按节拍一起演奏。

3. **useSpring（React 桥）**：把 Controller 装进 React 组件的 ref，把数值暴露成 `<animated.div>` 能订阅的"动画值"。**关键：动画值不会触发 React 重渲染，而是直接改 DOM**。

三层加起来背后还有一个**全局 FrameLoop**——所有 SpringValue 注册到同一个 `requestAnimationFrame` 循环里，静止后自我注销。

## 实践案例

### 案例 1：最小例子，让方块从 0 滑到 200px

```tsx
import { useSpring, animated } from '@react-spring/web'

function Demo() {
  const styles = useSpring({
    from: { x: 0 },
    to: { x: 200 },
    config: { tension: 170, friction: 26 },
  })
  return <animated.div style={styles}>hi</animated.div>
}
```

`tension: 170 / friction: 26` 是默认值——感觉像中等劲度的现实弹簧。把 friction 改成 12，方块会**冲过 200 再回弹几次**才稳定；改成 100，方块像爬过去。

### 案例 2：手势驱动，拖完撒手回弹

```tsx
import { useSpring, animated } from '@react-spring/web'
import { useDrag } from '@use-gesture/react'

function Card() {
  const [{ x, y }, api] = useSpring(() => ({ x: 0, y: 0 }))
  const bind = useDrag(({ down, movement: [mx, my] }) => {
    api.start({ x: down ? mx : 0, y: down ? my : 0 })
  })
  return <animated.div {...bind()} style={{ x, y }} />
}
```

三步：① `down` 时 `api.start` 跟手坐标；② 松手把目标改回 `{x:0,y:0}`；③ spring **带着松手瞬间的速度**弹回，不是匀速 tween。这种"打断时速度连续"是 spring 模型的天然能力。

### 案例 3：列表过场，进出场都丝滑

```tsx
import { useTransition, animated } from '@react-spring/web'

function List({ items }) {
  const transitions = useTransition(items, {
    from: { opacity: 0, y: -20 },
    enter: { opacity: 1, y: 0 },
    leave: { opacity: 0, y: 20 },
  })
  return transitions((style, item) => (
    <animated.li style={style}>{item}</animated.li>
  ))
}
```

新元素从上方滑入并淡入，移除元素往下滑出——每个元素单独跑一组 spring，互不干扰。

## 踩过的坑

1. **极端参数会震荡发散**：tension 10000 + friction 1 这种组合下欧拉积分会越积越大、动画疯了——库**不会报警**，靠预设 `slow / wobbly / stiff` 引导你走稳定区间，新手凭直觉调数字会踩雷。

2. **DevTools 看不到 animated 值**：`<animated.div style={{ x }}>` 直接改 DOM 不走 React 渲染。React DevTools / Profiler 都看不到 x 的实时值，加 `console.log` 也只看得到 SpringValue 实例不是数字——必须订阅 `onChange`。

3. **SSR 第一帧会闪**：`useLayoutEffect` 在服务器端被 React 警告，库降级到 `useEffect`，hydrate 后第一帧值是 `from`，下一帧才跳到 `to`——视觉上闪一下。SSR 重的项目要注意。

4. **列表别用 1000 个 useSpring**：每个 `useSpring` 各自一个 Controller，1000 个就是 1000 个 Controller。用 `useSprings(1000, ...)` 让一个 Controller 管 1000 个 SpringValue 才不会卡。

## 适用 vs 不适用场景

**适用**：
- 手势驱动 UI（拖拽、滑动、长按反馈）—— spring 的速度连续是杀手锏
- 物理感强的过场（卡片回弹、橡皮筋边缘）
- 需要小包体的 React 项目（~16KB vs Framer 的 30KB+）
- 多渲染目标（react-three-fiber、konva、native）共享一套动画 API

**不适用**：
- 复杂时间线动画（游戏过场、广告 banner）—— [[gsap]] 的 timeline 强得多
- 设计师习惯"3 秒内做这个"思维 —— Framer Motion 的 keyframe API 更直觉
- 纯静态 hover 过渡 —— CSS `transition` 0KB 更简单
- SSR 重 + 首屏带动画 —— 第一帧闪烁的代价值得考虑

## 历史小故事（可跳过）

- **2016 年**：Cheng Lou 写了 react-motion，第一个用 spring 物理做 React 动画的库，但 API 是 render-prop 风格，hook 时代不友好。
- **2017–2018 年**：Paul Henschel 先有 react-springy-parallax（2017），2018-03 正式开源 react-spring；最初 render-prop，同年 v7 上 hooks，v9 再大重写。
- **2019 年**：Paul 创立 pmndrs（Poimandres）开源集体，react-spring 和 react-three-fiber、zustand、jotai 一起进入这个生态。
- **2019 起**：Framer Motion 等竞品也把 `type: "spring"` 当一等公民——侧面证明 spring 范式被主流采纳，不是谁 2021 才临时补丁。

## 学到什么

1. **物理参数比 duration 更通用**：duration 是结果（"花多久"），spring 是原因（"多硬多重"）——用原因描述，打断时行为天然合理。
2. **绕过框架渲染换性能**：animated values 直接改 DOM 是高频动画的标准技巧，代价是调试体验损失——这是工程权衡。
3. **全局调度器 + 自我注销**：FrameLoop 模式可迁移到任何"高频回调 + 多订阅者"场景（心跳、IntersectionObserver、setInterval 任务队列）。
4. **API 设计帮用户做对**：暴露 `slow/wobbly/stiff` 预设而非 tension 数字，把"哪些参数稳定"知识沉淀进 API。

## 延伸阅读

- 官方文档：[react-spring docs](https://www.react-spring.dev/) —— 大量交互式 demo，参数所见即所得
- 演讲视频：[Paul Henschel — How to Animate React](https://www.youtube.com/watch?v=jed3eGDDbR0) —— 作者亲自讲设计哲学
- 源码精读：[SpringValue.ts](https://github.com/pmndrs/react-spring/blob/main/packages/core/src/SpringValue.ts) —— 看欧拉积分怎么实现
- 物理基础：[Spring Animation Bouncy](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/) —— 把 tension/friction 讲成肌肉记忆
- 配套手势：[@use-gesture/react](https://use-gesture.netlify.app/) —— pmndrs 同生态，和 react-spring 黄金搭档

## 关联

- [[framer-motion]] —— 最大竞品，duration-first，包大但 API 直觉，spring 是后加的选项
- [[motion-one]] —— 走 WAAPI 路线的轻量库，和 react-spring 哲学不同但场景重叠
- [[anime]] —— 老牌 timeline 动画库，非 React 专属，无 spring 物理
- [[gsap]] —— 复杂时间线之王，react-spring 不和它正面竞争
- [[react]] —— react-spring 深度耦合 React 生命周期与 hook
- [[dnd-kit]] —— React 现代拖拽工具，常和 react-spring 联手做物理感拖拽
- [[konva]] —— Canvas 渲染目标之一，react-spring 通过 targets/konva 适配

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[dnd-kit]] —— dnd-kit — React 现代拖拽 toolkit
- [[hermes]] —— Hermes — Facebook 的 React Native JS 引擎
- [[motion-one]] —— Motion One — 把动画交给浏览器自己跑
- [[react-dnd]] —— react-dnd — React 时代第一个把拖拽拆成四层的库
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[styled-components]] —— styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
- [[visx]] —— visx — 把 d3 拆成 30 块乐高的 React 可视化原语
