---
title: Motion One — 把动画交给浏览器自己跑
来源: 'https://github.com/motiondivision/motion'
日期: 2026-05-30
分类: projects / 前端动画
难度: 初级
---

## 是什么

Motion One 是一个**让浏览器自己跑动画、JS 主线程几乎不参与**的轻量 Web 动画库。日常类比：你想让朋友帮你搬家，可以亲自盯着每个箱子搬到哪（每帧自己算），也可以把清单交给搬家公司让他们自己安排（一次性下指令）。Motion One 选后者。

你写：

```js
import { animate } from "motion"
animate("#box", { x: [0, 300] }, { duration: 1 })
```

它把动画**一次性**派发给浏览器原生的 Web Animations API（`element.animate()`），后续每一帧由浏览器合成线程算。你的 JS 主线程哪怕在跑一个大列表渲染，动画也不卡顿。

作者 Matt Perry 同时也是 [[framer-motion]] 的作者——把核心引擎抽出来做成跨框架小包，是他对 "50KB React 组件库太重" 的回应。同代码三套 entry：vanilla / React / Vue 共享同一个 `motion-dom` 内核。

## 为什么重要

不理解 Motion One，下面这些事都没法解释：

- 为什么同样写 spring 动画，[[react-spring]] 主线程一直在算、Motion One 主线程几乎空闲
- 为什么 [[framer-motion]] 50KB 而 motion 只有 3KB，但很多 API 长得几乎一样
- 为什么写 [[astro]] / [[vue]] 静态站时不想拖 React 进来，却又想要现代动画库
- 为什么 [[anime]] 这种老牌 vanilla JS 动画库在 v3 (2019) 后基本停滞
- 为什么写动画时主线程 60fps 算下来"还是卡"——RAF 抢不到 CPU 时间片，WAAPI 不抢

## 核心要点

Motion One 的设计可以拆成 **三个关键判断**：

1. **能 native 就 native**：浏览器原生 `element.animate()` 跑在合成线程上，绕开 JS 主线程。类比：让司机走高速而不是市区，一脚油门。

2. **spring 也要走 native**：spring 是连续物理曲线、WAAPI 不原生支持，但可以**预采样 30 个点**翻译成 `linear(0, 0.1, ..., 1)` 字符串塞进 WAAPI。类比：直播信号没法直接走电报，那就把它录成 30 张快照按顺序发。

3. **同代码三套打包**：`motion`（vanilla 3KB / 18KB） / `motion/react`（hooks） / `motion/vue`（composables）共享 `motion-dom` 内核，按需 tree-shake。类比：同一道菜，堂食 / 外卖 / 自取三个窗口共用一个厨房。

三件事合起来叫"WAAPI-first 动画哲学"。

## 实践案例

### 案例 1：3 行代码让方块动起来

```html
<div id="box" style="width:80px;height:80px;background:tomato"></div>
<script type="module">
  import { animate } from "https://esm.run/motion"
  animate("#box", { x: [0, 300], rotate: [0, 360] }, { duration: 2, repeat: Infinity })
</script>
```

**逐部分解释**：

- `animate(target, props, options)` 是统一入口——target 是 CSS 选择器或 DOM 元素，props 是属性的关键帧数组
- `{ x: [0, 300] }` 表示 `transform: translateX` 从 0 到 300px——`x` 是 Motion 的语法糖
- 打开 DevTools Performance 录屏，会发现主线程几乎全空，动画完全跑在合成线程上

### 案例 2：把 ease 换成 spring

```js
animate("#box", { x: [0, 300] },
  { type: "spring", stiffness: 200, damping: 8, repeat: Infinity })
```

DevTools → Animations 面板能看到 `transform` 的 easing 变成了 `linear(0, 0.012, 0.045, ..., 1)` 这种 30 段字符串——这就是 Motion 把物理 spring 预采样成 WAAPI 能理解的形式。它的精彩在于：spring 也跑在合成线程，主线程依然空闲。

### 案例 3：scroll-linked + inView

```js
import { animate, scroll, inView } from "motion"
// 滚动驱动 y 位移：滚动条从顶到底，hero 同步从 0 平移到 -200px
scroll(animate("#hero", { y: [0, -200] }))
// 卡片入屏淡入上浮
inView("#card", el => animate(el, { opacity: [0, 1], y: [40, 0] }))
```

`scroll()` 把动画 progress 绑到滚动 progress（依赖 ScrollTimeline，新浏览器原生支持）；`inView()` 包装 IntersectionObserver——两行替代手写 30 行 boilerplate，是做营销页 landing page parallax / 卡片入场的常见诉求。

## 踩过的坑

1. **mini build 静默吃掉 spring**：`import { animate } from "motion/mini"` 砍掉物理引擎换 3KB，写 `type: "spring"` 不报错也不工作——文档没在 import 时给警告，新手一脸懵。

2. **解析解 spring 改不了**：Motion 的 spring 是线性二阶 ODE 解析解，加不了非线性阻尼或多力叠加。要做"游戏感"物理（弹跳 + 摩擦组合）只能换 [[react-spring]] 的 imperative API。

3. **underdamped 振荡假 spring**：`damping < 5` 时 spring 高频振荡，30 点预采样不够细，肉眼可见阶梯感——与 [[react-spring]] 真正每帧 RK4 积分相比有视觉差。低阻尼场景慎用。

4. **老 Safari 退回 RAF**：WAAPI `linear()` easing 字符串需要 Chrome 115+ / Safari 16+。老浏览器走 RAF fallback 路径，意味着"主线程 0 cost"承诺只在 modern browser 兑现。

5. **transform/opacity 之外没有合成层加速**：只有 `transform` 和 `opacity` 跑在 GPU 合成线程；`color`、SVG `path`、任意 JS object 数值仍走 RAF 主线程——文档"hardware-accelerated"宣传容易让人误以为所有属性都加速。

## 适用 vs 不适用场景

**适用**：
- 营销页 / landing / 静态站 hover/expand 微交互——3KB 体积友好
- [[astro]] / [[vue]] / vanilla JS 项目——不绑 React 框架
- 大量并发动画 + 主线程任务重——WAAPI 跑合成线程不抢 CPU
- 替换老项目里的 [[anime]] —— API 一比一对应、迁移成本极低

**不适用**：
- 复杂 timeline / scrubbing / SVG morph → 用 [[gsap]]，timeline DSL 还是黄金标准
- 多力叠加的物理动画 → 用 [[react-spring]] 的数值积分
- 设计师在 AE 烘焙好的复杂插画动画 → 用 [[lottie]]
- Canvas / WebGL 内部动画 → Motion 只动 DOM CSS 属性，帮不上忙

## 历史小故事（可跳过）

- **2018**：Matt Perry 在 Framer 工作期间发布 framer-motion 1.0，主打 React 声明式动画 + layout 自动过渡
- **2021**：framer-motion 体积膨胀到 50KB+（含 layout projection / AnimatePresence / motion.div 代理），Matt 决定把核心引擎抽出来做轻量包，发布 Motion One
- **2023**：Chrome 115 落地 `linear()` easing 函数，Motion 第一时间用它实现 spring 走 WAAPI 路径（之前要 RAF fallback）
- **2024**：motion-one 与 framer-motion 合并到同一 monorepo（motiondivision/motion），共享 motion-dom 引擎；按需打包成 mini / full / react / vue 多个 entry
- **2026**：仓库 32k★，已成跨框架 Web 动画事实标准之一

## 学到什么

1. **API 选型决定主线程负担**：requestAnimationFrame 把动画绑死主线程，WAAPI 把动画送进合成线程。一行代码差异，体感差一个数量级。
2. **预采样是把"连续"塞进"离散"接口的通用 trick**：spring 物理 → 30 点 linear()，本质是把数学曲线烘焙成数据。Lottie 烘焙整段动画也是同思路。
3. **同源不同包**：motion 与 framer-motion 同作者同 monorepo，差异只在打包粒度——按场景选粒度，不要二选一。
4. **架构决策有不可逆成本**：选了线性 ODE 解析解换 WAAPI 兼容，就永远不能加非线性力——这种 trade-off 在选型时要看清。
5. **大库拆轻库往往是同作者主动做的**：motion-one 不是 framer-motion 的对手，是它的"内核独立发布版"——同作者出的轻量版往往最有保障。

## 延伸阅读

- 官方文档：[motion.dev/docs/animate](https://motion.dev/docs/animate)（"Animate everything with one function"）
- Framer 工程博客：[Why we built Motion One](https://www.framer.com/blog/animation-libraries/)（"WAAPI is the future" 立场原文）
- WAAPI MDN：[Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API) — 浏览器原生动画接口背景
- 视频：Matt Perry "Building animations with Web APIs"（YouTube 搜，30 分钟讲底层）
- W3C linear() 规范：[CSS Easing Functions Level 2](https://drafts.csswg.org/css-easing-2/#linear-easing-function-section) — 看 spring 预采样依赖的标准
- [[framer-motion]] —— 同作者同 monorepo 的 React 重型版本
- [[react-spring]] —— spring 哲学对照（数值积分 vs 解析解）

## 关联

- [[framer-motion]] —— 同作者；motion-one 是它的核心引擎独立包
- [[gsap]] —— RAF 时代王者；timeline / scrubbing 仍是 motion 短板
- [[react-spring]] —— spring 哲学对手；任意非线性力 vs WAAPI 兼容
- [[lottie]] —— 设计师烘焙路径；Motion 是工程师代码路径，互补不替代
- [[anime]] —— vanilla JS 前辈；Motion 是它的现代继承者
- [[astro]] —— 静态站常见宿主；Motion 体积友好契合
- [[vue]] —— motion/vue entry 的目标用户

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
