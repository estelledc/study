---
title: anime.js — 一行 JS 让网页元素按时间线动起来
来源: 'https://github.com/juliangarnier/anime'
日期: 2026-05-30
分类: 前端
难度: 入门
---

## 是什么

anime.js 是一个用 JavaScript 写的**轻量动画库**：把"哪些元素 / 动什么属性 / 动多久 / 用什么节奏"四件事写在一个函数里，浏览器每秒 60 帧自动算中间值。日常类比：像剪辑软件的时间线——把每段素材拖到 0~3 秒，选一条加速曲线，点播放，剩下交给软件。

你写：

```js
import { animate } from 'animejs'

animate('.box', {
  translateX: 250,
  duration: 1000,
  ease: 'inOutQuad'
})
```

四行：选中所有 `.box`，**1 秒内向右滑 250 像素**，节奏是"两头慢中间快"。CSS 属性、SVG 描边、DOM attribute、纯 JS 对象的数值都能这样动——anime.js 把它们抽象成同一种"目标 + 属性 + 时长 + 曲线"的写法。

## 为什么重要

不理解 anime.js 这一类时间线动画库，下面这些事写起来都很别扭：

- 为什么用纯 CSS `@keyframes` 写"标题先飞入、0.3 秒后副标题滑入、1 秒后按钮弹出"会嵌套一堆 `animation-delay`，改一处全乱
- 为什么 [[gsap]] 是业界基准但商用插件要钱（$99-499/年），独立开发者不舍得买
- 为什么 React 圈现在默认用 [[framer-motion]]（`<motion.div animate={{x:100}}/>`），但纯 JS / Astro / 静态站点仍偏向 anime.js
- 为什么"timeline + keyframes + easing"这套词汇是所有动画库（含 [[lottie]]）的共同心智模型

## 核心要点

anime.js v4 的设计可以拆成 **三件套**：

1. **animate / createTimeline / createTimer**：三个一等公民函数。`animate()` 做单动画；`createTimeline()` 做多动画的时间轴编排；`createTimer()` 只数节拍不绑 DOM。v3 时代这三件事挤在一个上帝函数里，v4 拆开后类型友好、按需引入。

2. **easing（缓动曲线）**：动画的"性格"。`linear` 是机器人匀速；`inOutQuad` 是老练司机刹车，两头慢中间快；`outBack` 是弹簧门，过冲再回弹；`spring(质量, 刚度, 阻尼, 速度)` 是真实物理弹簧。背后是 cubic-bezier 公式或弹簧微分方程。

3. **stagger（错峰）**：高级感的关键。10 个元素一起浮现是廉价感，错开 50ms 是高级感。`delay: stagger(50)` 让第 i 个元素延迟 `i*50ms`——一行 API 把"团操错峰出场"封装好。

## 实践案例

### 案例 1：landing page 标题逐字浮现

简历项目里能直接用的 6 行：

```js
import { animate, stagger } from 'animejs'

animate('.hero-title span', {
  opacity:    [0, 1],
  translateY: [30, 0],
  duration:   800,
  ease:       'outBack',
  delay:      stagger(50)   // 第 i 个字母延迟 i*50ms
})
```

把 `<h1 class="hero-title">` 里每个字母用 `<span>` 包一下，跑完上面这段，每个字母从下方 30px 滑入 + 透明度 0→1，结尾轻微过冲——就是 95% landing page hero 区的标准做法。

### 案例 2：用 timeline 编排多个动画

```js
import { createTimeline } from 'animejs'

const tl = createTimeline({ defaults: { duration: 800 } })
tl.add('.title',    { opacity: [0,1], translateY: [-50, 0] })
  .add('.subtitle', { opacity: [0,1] },          '-=400')   // 比上一段早 400ms
  .add('.cta',      { scale:   [0.5, 1] },       '+=200')   // 比上一段晚 200ms
```

`'-=400'` / `'+=200'` 这种"相对时间"语法是 anime.js / GSAP 共用的核心抽象——单一动画好写，**多动画编排**才是动画库真正的难点，timeline 把"时间"当一等公民。

### 案例 3：v3 → v4 改了哪几个名

```js
// v3：上帝函数 + 旧命名
anime({ targets: '.box', translateX: 250, easing: 'easeInOutQuad' })

// v4：函数式 + 新命名
animate('.box', { translateX: 250, ease: 'inOutQuad' })
```

`targets` 提到首参、`easing` 改 `ease`、`easeInOutQuad` 简称 `inOutQuad`——这是迁移指南里 20 多条改动里最常踩的三条。

### 案例 4：让动画只在元素进入视口时开始

```js
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return
    animate(e.target.querySelectorAll('span'), {
      opacity: [0, 1], translateY: [30, 0],
      duration: 800, ease: 'outBack', delay: stagger(50)
    })
    io.unobserve(e.target)
  })
}, { threshold: 0.5 })

io.observe(document.querySelector('.hero-title'))
```

`IntersectionObserver` 是浏览器原生 API，配 anime.js 一句调用——这就是"滚动到才动"的标准做法，比库自带的 ScrollTrigger 更省体积。

## 踩过的坑

1. **老教程语法跑不动**：CodePen 上 5000+ 个 anime.js demo 大多是 v3 写法，复制到 v4 项目直接报错。**新项目直接学 v4**，老 demo 只看思路别复制代码。

2. **停止动画忘了存返回值**：`animate()` 返回一个 controller，要 `const a = animate(...)` 拿在手里，之后 `a.pause()` / `a.cancel()` 才能停。新手写完就丢，然后想停时无从下手。

3. **React 里要手动 ref**：`animate(ref.current, {...})` 必须放进 `useEffect`，比 Motion 的 `<motion.div animate={{x:250}}/>` 多 5 行样板代码。**React 项目应该选 Motion**，不要硬上 anime.js。

4. **大量元素掉帧**：>500 个元素同时动，anime.js 明显比 GSAP 慢。瓶颈是 anime.js 在每帧里挨个读写 DOM，缺少 GSAP 那套"批量读写分离"优化。

## 适用 vs 不适用场景

**适用**：

- 纯 vanilla JS / Astro / Starlight / 静态 HTML 的 landing page、作品集
- 中小项目想要 timeline 编排但不想付 [[gsap]] 钱
- SVG 描边 / morphing / 沿路径运动这类设计师驱动的视觉

**不适用**：

- React 项目 → 用 [[framer-motion]]（声明式 + DevTools 可见）
- 需要 SplitText / MorphSVG 等商业插件级能力 → 直接上 GSAP
- 几千粒子级别的高性能场景 → WebGL 或 GSAP 的核心引擎
- Lottie 风格的"设计师导出 JSON 直接播" → 用 [[lottie]]

## 历史小故事（可跳过）

- **2017 年**：法国独立设计师 Julian Garnier 在 dribbble 发作品集时嫌 CSS 难写、GSAP 要钱，自己撸了 v1.0 发到 GitHub，6 个月 Star 破万。
- **2018-2020**：v2 加 SVG morphing，v3 稳定 4 年，npm 周下载长期 70 万级。
- **2024 年**：v4.0 用 TypeScript 完全重写，bundle 从 17KB 砍到 7KB，API 拆成 `animate` / `createTimeline` / `createTimer` 三个独立导出——技术上正确，但生态阵痛：教程、demo、Stack Overflow 答案大量基于 v3。
- **2026 年**：npm 上 v3 / v4 各占约一半下载量，新项目应直接用 v4，老项目保持 v3 也能继续跑。

## 学到什么

1. **timeline + keyframes + easing 是动画库的通用三件套**——理解这三个词，跨库迁移（GSAP / Motion / Lottie）只是查 API
2. **"重写换现代化" vs "兼容老生态"** 是开源治理的经典权衡，v4 选了前者，付出生态分裂的代价
3. **License + 框架绑定**才是动画库选型的核心维度，不是 API 美丑：纯 JS 选 anime.js，React 选 Motion，预算够选 GSAP
4. **错峰（stagger）一行就把"高级感"做出来**——很多设计直觉能压成一个简洁 API，是好库的标志

## 延伸阅读

- 官网与 v4 文档：[animejs.com](https://animejs.com/) · [v4 文档](https://animejs.com/documentation/)
- v3 → v4 迁移：[migrating-from-v3](https://animejs.com/documentation/migrating-from-v3)（20+ 破坏性改动一览）
- GitHub：[juliangarnier/anime](https://github.com/juliangarnier/anime)
- 横向对比：Sarah Drasner — "Modern Web Animation"（CSS-Tricks，跨库横评）

## 关联

- [[gsap]] —— 业界基准，anime.js 的"免费替代"心智就是冲它来的
- [[framer-motion]] —— React 圈默认动画库，把 anime.js 留在了 vanilla 战场
- [[lottie]] —— 另一种思路：设计师在 AE 里做完导出 JSON，库负责播放
- [[starlight]] —— 文档站点主题，常见的"anime.js 用武之地"
- [[playwright]] —— 端到端测试，能 assert 动画后的最终态截图

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
