---
title: Framer Motion — React 声明式动画
来源: https://github.com/motiondivision/motion
日期: 2026-05-29
分类: 动画
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/motiondivision/motion
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1b037b0032578b52af94b06ff3920bfa0aaa5e36
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 13.1.1
---

## 是什么

Framer Motion 是 Motion 仓库里面向 React 的声明式动画实现。日常类比：你只写“目标状态”，它负责在当前值和目标值之间插值，而不是手写每一帧。

你写：

```jsx
import { motion } from "motion/react"

<motion.div animate={{ x: 100, opacity: 1 }} />
```

固定 `13.1.1` 里，`motion` npm 包是一层再导出：默认入口转出 `framer-motion/dom`，`motion/react` 再导出整个 `framer-motion`。真正的 React 组件、`AnimatePresence` 和 feature bundle 在 `framer-motion` 包。`https://github.com/framer/motion` 会转到 `motiondivision/motion`。

## 为什么重要

不理解固定 13.1.1 的分层，下面这些事都会说错：

- 为什么文档写 `import { motion } from "motion/react"`，实现包却仍叫 `framer-motion`
- 为什么没写 `transition` 时，位移可能是 spring，透明度却是 0.3 秒 keyframes
- 为什么子 `motion` 能跟着父级 `"open"` / `"closed"` 一起切，但自己写了 `animate` 就不会继承
- 为什么 `exit` 必须包在 `AnimatePresence` 里才有机会跑完

## 核心要点

固定源码的主链可以拆成五步：

1. **入口分层**：`motion/react` 用本地绑定再导出 `framer-motion` 的 `motion` / `m`，避免 duplicate re-export；`motion/react-client` 对应 `framer-motion/client`。

2. **motion proxy**：`motion.div` 由 `createMotionProxy(featureBundle, createDomVisualElement)` 生成。默认 feature bundle 装入 animations、gestures、drag、layout。

3. **默认 transition**：`getDefaultTransition()` 按属性分流。超过两个 keyframe 用 `keyframes` 0.8s；transform（非 `scale*`）用 stiffness 500 / damping 25 的 under-damped spring；`scale*` 用 critically-damped spring；其余属性用 duration 0.3、ease `[0.25, 0.1, 0.35, 1]`。

4. **Variants 继承**：父节点把 `initial` / `animate` 放进 `MotionContext`。子节点在自己不是 controlling variant、且 `inherit !== false` 时读取父级标签。未显式 `inherit` 时，只有“有 `variants` 且没有 `animate`”才默认继承。

5. **AnimatePresence**：用 `key` 跟踪进出。默认 `mode="sync"`。条件卸载时先保留 exiting 子树，等 `exit` 结束再真正移除。`wait` 模式在仍有 exiting 时只渲染 exiting。

## 实践示例

### 案例 1：目标状态，不写 transition

```jsx
import { motion } from "motion/react"

<motion.div animate={{ x: 100, opacity: 1 }} />
```

`x` 走 transform spring；`opacity` 走 0.3 秒 keyframes。不要把“没写 transition = 全部 spring”当成固定合同。

### 案例 2：父级标签广播到子树

```jsx
const variants = {
  open: { x: 0, opacity: 1 },
  closed: { x: -100, opacity: 0 },
}

function Drawer({ isOpen }) {
  return (
    <motion.div variants={variants} animate={isOpen ? "open" : "closed"}>
      <motion.div variants={variants}>子内容</motion.div>
    </motion.div>
  )
}
```

子节点没有自己的 `animate`，因此继承父级标签。若子节点写了 `animate={{ opacity: 1 }}`，它就不再跟父级字符串标签走。

### 案例 3：exit 必须经过 AnimatePresence

```jsx
import { AnimatePresence, motion } from "motion/react"

<AnimatePresence>
  {visible && (
    <motion.div
      key="hello"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    />
  )}
</AnimatePresence>
```

多个条件子节点必须有唯一 `key`。没有 `AnimatePresence`，`exit` 没有延迟卸载的宿主。

## 踩过的坑

1. **把包名改写理解成“旧包消失”**：固定 13.1.1 同时发布 `motion` 与 `framer-motion`，前者依赖后者。
2. **默认动画不是单一 spring**：只有部分 transform 走 spring；`opacity` 等走 keyframes。
3. **自己写了 `animate` 还指望继承父级 variants**：默认继承条件是“有 variants 且没有 animate”。
4. **AnimatePresence 多子节点不给 key**：源码用 `props.key` 判断进出；缺 key 会把 update 认成同一节点。
5. **Server Component 直接 import hooks**：相关文件带 `"use client"`，peer 是 React 18/19。

## 适用 vs 不适用场景

**适用**：

- React 18/19 里需要 enter / exit / layout / 手势的声明式 UI 动画
- 希望用 variants 把一棵子树切到同一命名状态
- 能接受实现落在 `framer-motion`，入口落在 `motion/react`

**不适用**：

- 多段时间轴、标签、scrub、精确 position 参数 → 用 [[gsap]]
- 需要本轮未测量的最小 bundle 数字才能做决策
- 把历史 Motion One 3KB 包当成当前 13.1.1 的同一合同 → 见 [[motion-one]]
- 本页未运行，因此不能用它证明首帧、水合或列表性能

## 固定版本边界

- 本文绑定 `motiondivision/motion@1b037b00...`，npm `motion@13.1.1` / `framer-motion@13.1.1` 的 `gitHead` 与 `v13.1.1` peeled commit 一致。
- 包内 `package.json` 仍残留另一 `gitHead`；不把它当成第二个可绑定 revision。
- React peer 为 `^18.0.0 || ^19.0.0`，且 optional。
- 同仓也承载历史 Motion One 文档对象 [[motion-one]]；本页只描述 13.1.1 的 React 声明式表面。
- 未安装依赖、未跑上游测试、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **入口包 ≠ 实现包**——`motion/react` 是再导出，`framer-motion` 才是 React 运行时。
2. **默认 easing 必须按属性读**——transform 与非 transform 走两条默认合同。
3. **Context 广播有退出条件**——variants 继承不是“只要是子节点就会跟”。
4. **延迟卸载是库补丁**——`AnimatePresence` 用 key 和 presence 状态补 React 没有的 exit 相位。

## 应用型自测

1. 只写 `animate={{ x: 100, opacity: 1 }}`，不写 `transition`。`opacity` 会走 spring 吗？
2. 子 `motion.div` 既有 `variants` 又写了 `animate={{ opacity: 1 }}`，还会继承父级 `"open"` 吗？
3. 两个条件子节点共用同一个 key，包在 `AnimatePresence` 里。源码按什么判断进出？

检查点：

1. 不会。非 transform 默认是 0.3 秒 keyframes。
2. 不会默认继承；有 `animate` 时 `checkShouldInheritVariant` 为假。
3. 按 `props.key` 做 diff，不按组件类型。

## 延伸阅读

- 文档：[motion.dev](https://motion.dev/docs)
- 固定源码：[motiondivision/motion](https://github.com/motiondivision/motion) —— 提交 `1b037b0032578b52af94b06ff3920bfa0aaa5e36`
- [[gsap]] —— 命令式时间轴对照
- [[motion-one]] —— 同仓历史轻量入口，合同不同
- [[react]] —— hooks / Context 宿主

## 关联

- [[gsap]] —— 命令式时间轴与插件注册对照
- [[motion-one]] —— 同一 GitHub 仓的另一文档对象
- [[react]] —— `"use client"` 与 Context 继承的运行时
- [[react-spring]] —— 另一套 React 物理动画 API
- [[anime]] —— 框架无关的时间轴写法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[gsap]] —— GSAP — GreenSock 高性能动画
- [[lottie]] —— lottie-web — 把 AE 动画变成网页可播放的 JSON
- [[motion-one]] —— Motion One — 把动画交给浏览器自己跑
- [[projects/react]] —— React — 用组件描述界面的 JavaScript 库
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
