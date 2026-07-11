---
title: Framer Motion — React 声明式动画
来源: https://github.com/framer/motion
日期: 2026-05-29
分类: 动画
难度: 中级
---

## 是什么

Framer Motion 是 Framer 公司出的 React 动画库——你写一句 `<motion.div animate={{ x: 100 }}>`，元素就从当前位置滑到 x=100，**中间过程它自己算**。

日常类比：以前用 CSS transition / keyframes，得写"先 0%、再 50%、再 100%，每一帧给个值"，像编排一段舞蹈每一拍都告诉舞者站哪。Framer Motion 是"我要从这变到那、半秒到位、带点弹性"——它接管中间的每一帧。

```jsx
<motion.div
  animate={{ x: 100, opacity: 1 }}
  transition={{ duration: 0.5 }}
/>
```

这一行就是完整的动画。没有 `@keyframes`、没有 `requestAnimationFrame` 循环、没有 `setTimeout`。

11.x 后官方包名从 `framer-motion` 改成了 `motion`，import 路径变 `motion/react`——同一个项目，跨 React / Vue / vanilla JS 三个生态。

## 为什么重要

不理解 Framer Motion 在 React 生态的位置，下面这些事都没法解释：

- 为什么很多 React 项目把 UI 微交互默认交给它，而不是老牌的 GSAP——GSAP 时间轴更强，但 motion 跟 React 的 mount / unmount / re-render 集成更深
- 为什么 React 项目里"元素消失前先 fade out 再卸载"这件事用纯 CSS / Hooks 写起来很烦，motion 一个 `<AnimatePresence>` 就完事
- 为什么 Linear / Vercel / Apple 营销页都选它——它把 layout 变化动画做成一个 prop `layout`（底层类似 FLIP：先记下旧位置，再插值过渡到新位置）
- 为什么"声明式动画"这个词常和它绑在一起——你声明**目标状态**，它推断中间过程；不再声明"每帧的样子"

## 核心要点

Framer Motion 的整套 API 可以拆成 **三块积木**：

1. **motion 组件**：把普通 `div` 替换成 `motion.div`，就解锁了一套动画 props（`animate` / `initial` / `exit` / `transition` / `whileHover` / `drag` 等）。它是 React 自带 div 的"超集"——所有原 props 仍然可用。

2. **Variants（变体）**：给一组**命名状态**起名字，比如 `"open"` / `"closed"`，每个状态里写"这个状态下我长什么样"。然后 `animate="open"` 切换状态。子节点能继承父节点的状态切换——一个开关传遍整棵子树。

3. **AnimatePresence**：包住会被 `if/else` 卸载的组件，让它在被 React 真删之前**先跑完 exit 动画**。React 没有官方的"延迟 unmount" 机制，AnimatePresence 自己实现了一套。

三块加起来覆盖了 React 动画的 95% 场景。

## 实践案例

### 案例 1：最简动画（2 行入门）

```jsx
<motion.div
  animate={{ x: 100, opacity: 1 }}
  transition={{ duration: 0.5 }}
/>
```

**逐部分解释**：

- `animate` prop 写"目标状态"——元素最终要到 x=100、opacity=1
- `transition` 控制怎么过去——这里是 0.5 秒线性
- 没写 `initial`，默认从元素当前 CSS 值出发

不写 `transition` 时默认是 spring（弹性）——这是 motion 的"风格"，不像 CSS 默认 ease。

### 案例 2：Variants 让一个开关控制一棵树

```jsx
const variants = {
  open:   { x: 0,    opacity: 1 },
  closed: { x: -100, opacity: 0 },
}

function Drawer({ isOpen }) {
  return (
    <motion.div
      variants={variants}
      animate={isOpen ? "open" : "closed"}
    >
      <motion.div variants={variants}>子内容</motion.div>
    </motion.div>
  )
}
```

子 `motion.div` 没写自己的 `animate` prop——它**继承**父节点的当前状态。父切到 `"open"`，子也切。这是 motion 的"状态广播"机制：父子用 React Context 串起来，一个 `animate` 触发整棵子树。

### 案例 3：AnimatePresence 让消失也能动

```jsx
<AnimatePresence>
  {visible && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      Hello
    </motion.div>
  )}
</AnimatePresence>
```

`visible` 从 true 变 false 时，React 想立刻卸载这个 `motion.div`。AnimatePresence 拦下来——先让元素跑完 `exit` 动画（fade 到 0），跑完了再真正从 DOM 删除。

如果不包 AnimatePresence，`exit` 这个 prop 就完全没机会触发。

## 踩过的坑

1. **layout animation + SSR 第一帧错位**——`<motion.div layout />` 依赖 mount 时测量 DOM 大小，SSR 时服务端没 DOM、客户端 hydrate 后第一帧测出来的盒子和服务端 HTML 对不上，画面会"跳一下"。Next.js 项目要么把 layout 组件标 `"use client"` + `dynamic({ ssr: false })`，要么接受首帧抖动。

2. **大列表里每个 item 都 motion 性能差**——每个 `motion.div` 都挂一个 VisualElement + 可能的 ProjectionNode（layout 用），1000 条会卡。解法：搭 `react-window` 之类的虚拟列表只渲染可见项；或者 above-the-fold 用纯 CSS、below-the-fold 才用 motion。

3. **AnimatePresence 必须给 key**——条件渲染的元素必须有 `key`，否则 motion 认不出"是哪一个在 exit"。两个条件分支共用同一个 key 也会出问题——motion 以为是 update 而不是 mount/unmount。

4. **Server Components 不能直接放 motion 组件**——motion 内部用 `useState` / `useEffect`，是 client-only。在 React Server Components / Next.js App Router 里，包含 motion 的组件文件必须顶部写 `"use client"`，否则编译时报错。

## 适用 vs 不适用场景

**适用**：

- React / Next.js 项目里需要 enter / exit / layout 切换 / hover / drag 任意组合的动画
- 设计师参与调动画参数（暴露 stiffness / damping / duration 给设计师好理解）
- 需要"声明式 + 物理感"——spring 默认值就有不错手感

**不适用**：

- 影视级时间轴动画（多步骤 sequence、scrub、reverse、labels）→ 用 GSAP
- React Native → 用 react-native-reanimated（motion 重度依赖 DOM API）
- 电商首屏 / H5 小程序对 bundle 体积敏感（motion 完整版 ~50KB gzip）→ 用纯 CSS 或 auto-animate（3KB）
- Canvas / WebGL 粒子系统 → 用 pixi.js / three.js

## 历史小故事（可跳过）

- **2018-2019 年**：Framer 团队把内部动画能力抽成 React 库开源，强调声明式 props 而不是手写时间轴
- **2020-2022 年**：`AnimatePresence`、variants、layout 动画让它成为 React UI 动效的常见默认选择
- **2023-2024 年**：官方把包名逐步统一到 `motion`，同一套引擎覆盖 React / Vue / vanilla
- **之后**：继续围绕性能、手势和文档站（motion.dev）迭代；GSAP 仍在复杂时间轴场景占优

## 学到什么

1. **声明式 vs 命令式的边界可以推到 layout 这一层**——传统认为"layout 切换必须命令式手写 FLIP"，motion 把它做成 `layout` 一个 prop，颠覆了这个边界
2. **状态广播比 prop drilling 更适合动画**——variants + Context 让父组件改一个字符串，整棵树自动协同动画，比每层手动传 props 简洁一个数量级
3. **延迟 unmount 仍是 React 的缺口**——AnimatePresence 是库侧补丁：先跑完 exit，再真正从 DOM 删除；不要把它和 `useTransition` 混为一谈

## 延伸阅读

- 官方文档：[Motion docs](https://motion.dev/docs)（v12 后改名 motion，但 React API 不变）
- 视频教程：[Matt Perry — Why I built Framer Motion](https://www.youtube.com/results?search_query=matt+perry+framer+motion)（创始人讲设计哲学）
- 替代品速览：[react-spring](https://www.react-spring.dev/) / [GSAP](https://gsap.com/) / [auto-animate](https://auto-animate.formkit.com/)
- [[react]] —— motion 的宿主框架，VisualElement 树寄生在 React 树上
- [[lerna]] —— motion 仓库用的 monorepo 工具

## 关联

- [[react]] —— React 是 motion 的运行时基底，所有 hook 和 context 机制都靠它
- [[lerna]] —— motion 仓库自己用 Lerna + Yarn workspaces 管 4 个 npm 包
- [[express]] —— 同样是"把一坨样板代码缩成一行 API"的设计哲学
- [[next-js]] —— Next.js App Router 里 motion 必须 `"use client"`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[gsap]] —— GSAP — GreenSock 高性能动画
- [[lerna]] —— lerna — 一个仓库发几十个 npm 包的祖宗工具
- [[motion-one]] —— Motion One — 把动画交给浏览器自己跑
- [[next-js]] —— Next.js — React 全栈框架
- [[react]] —— React UI 组件库
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画

