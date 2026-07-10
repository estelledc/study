---
title: GSAP — GreenSock 高性能动画
来源: https://github.com/greensock/GSAP
日期: 2026-05-29
分类: 动画
难度: 中级
---

## 是什么

GSAP（**GreenSock Animation Platform**）是一套**让网页上任何东西能丝滑动起来**的 JavaScript 动画库。日常类比：[[framer-motion]] 是给 React 用户的方便贴，GSAP 是给所有人用的瑞士军刀——不挑框架，性能更猛。

它 2008 年从 Flash 时代出生，那时候网页还没现代浏览器，动画都靠 Flash 做。Flash 死后 GSAP 把核心搬到了 JS，一路熬成今天 web 动画的工业标准。

你写一行：

```js
gsap.to(".box", { x: 100, duration: 1 })
```

页面上所有 class 是 `.box` 的元素就在 1 秒内向右移 100px。**不需要 React、不需要 Vue、纯 JS 也能用**。

## 为什么重要

不学 GSAP，下面这些事都会被卡住：

- **跑得快**：官方常说相对 jQuery 最高约 20×。原理是它跳过反复 DOM 重读，把动画值算好直接写；别把它理解成"比 CSS transition 快 20 倍"
- **Timeline API**：能精细编排几十个动画——串联（一个接一个）、并联（同时跑）、嵌套（动画里套动画）。其他库做不到这个粒度
- **兼容性稳**：GSAP 3 面向现代主流浏览器；老项目若还卡在 IE，那是 GSAP 2 时代的故事，不要默认拿 GSAP 3 去扛
- **大型互动站默认底层**：Apple 产品页、NASA、Awwwards 获奖站等互动页，背后经常是它
- **2024 年起插件免费**：Webflow 收购后，以前 Club 付费的 ScrollTrigger / DrawSVG / MorphSVG / SplitText 等改为免费可用

## 核心要点

GSAP 的世界由 **三块积木** 搭起来：

1. **Tween（动画原子）**：一次动画 = 起点 + 终点 + 缓动函数。`gsap.to(target, vars)` 是最常见的写法。类比：一段电影分镜，从 A 帧到 B 帧。

2. **Timeline（编排器）**：把多个 tween 串成时间轴。可以指定"第 2 秒开始"、"接在上一段后面"、"同步开始"。类比：剪辑软件的多轨时间线。

3. **Plugin（插件系统）**：核心库只负责"改属性的值"，复杂场景靠插件扩展。常用 4 个：
   - **ScrollTrigger**：滚动驱动动画
   - **DrawSVG**：让 SVG 路径"画出来"
   - **MorphSVG**：让一个形状变成另一个形状
   - **SplitText**：把段落拆成单字符再各自动画

## 实践案例

### 案例 1：最简单的一行动画

```js
gsap.to(".box", { x: 100, duration: 1 })
```

**逐部分解释**：

- `.to`：从当前状态过渡到目标状态
- `".box"`：CSS 选择器，所有匹配的 DOM 元素一起动
- `{ x: 100 }`：目标——往右 100px（GSAP 的 `x` 是 CSS `transform: translateX`）
- `duration: 1`：花 1 秒走完

GSAP 不像 CSS transition 写在样式里，它是命令式的——什么时候 call 什么时候动。

### 案例 2：Timeline 编排两段动画

```js
gsap.timeline()
  .to(".a", { x: 100 })
  .to(".b", { y: 50 }, "<")
```

**关键是那个 `"<"`**：

- 不写时间标签 → 第二段接着第一段播（串联）
- `"<"` → 第二段和第一段**同时开始**（并联）
- `">"` → 第二段在第一段结束后播（默认）
- `"+=0.5"` → 第一段结束后再延 0.5 秒

一行字符串就能表达复杂的时间关系。这是 GSAP 比手写 setTimeout 优雅的地方。

### 案例 3：滚动驱动动画

```js
gsap.registerPlugin(ScrollTrigger)

gsap.to(".box", {
  x: 500,
  scrollTrigger: {
    trigger: ".container",
    start: "top center",
    scrub: true,
  },
})
```

**逐部分解释**：

- `trigger: ".container"`：以 `.container` 进入视口为触发点
- `start: "top center"`：当 container 的 top 撞到 viewport 的 center 时开始
- `scrub: true`：动画进度跟滚动条**插值绑定**——你滚一半，动画走一半

这就是 Apple 产品页那种"滚动到哪儿，元素动到哪儿"的底层。

## 踩过的坑

1. **搞反 `kill()` 和 `onComplete`**：GSAP 3 里 `tween.kill()` 会立刻停掉动画，并且**通常不会**再触发 `onComplete`。API 是 `kill(target, propertiesList)`——按目标和属性局部杀掉，不是 `kill(true)` 清回调。若要在被中断时做事，用 `onInterrupt`；若要播完再收尾，别 `kill()`，改 `pause()` / 等它自然结束。

2. **React 用必须用 `useGSAP` hook**：旧版用 `useEffect` 创建 tween，React 18 strict mode 会创建两次，动画跑两遍。`@gsap/react` 包提供的 `useGSAP` hook 会自动处理 cleanup 和 strict mode。

3. **ScrollTrigger 的 `markers` 调试好用，但 production 要删**：
   ```js
   scrollTrigger: { markers: true }  // 显示 start/end 红绿线
   ```
   忘删上线，用户会看到一堆诡异的彩条。

4. **SSR 配合要在 useEffect 内创建**：Next.js / Remix 里 GSAP 不能在 server 端跑（碰不到 window），必须用 `useEffect` / `useGSAP` 包起来。否则 build 时直接炸。

## 适用 vs 不适用场景

**适用**：

- 复杂时间轴动画（多段串并联嵌套）
- 滚动驱动的互动站（产品介绍页 / 故事网站）
- SVG / Canvas / WebGL 高频更新（GSAP 的 ticker 比手写 requestAnimationFrame 更省心）
- 需要跨框架、命令式精确编排的现代浏览器项目

**不适用**：

- 极简过渡（鼠标 hover 变色）→ 直接 CSS transition 更省事
- React 组件级的进入退出动画 → [[framer-motion]] 的 `<AnimatePresence>` 更对味
- 严格遵守 React 声明式哲学的项目 → GSAP 是命令式，会和 state 驱动的 UI 打架
- 体积敏感（核心约几十 KB，加插件再涨）→ Web Animations API 原生免费
- 还必须支持 IE9/IE10 → 别硬上 GSAP 3，那是历史版本的战场

## 历史小故事（可跳过）

- **2008 年**：Jack Doyle 在 Flash 论坛发布 TweenLite，最初是 ActionScript 库，目标是"比 Adobe 自家 Tween 类快 10 倍"
- **2012 年**：HTML5 革命，Flash 在被埋的路上。Jack 用三个月把 TweenLite 重写成 JS，叫 GSAP
- **2018 年**：GSAP 3 重构 API，引入 Timeline 数据结构和 plugin 注册系统，成为今天的形态
- **2024 年**：Webflow 收购 GSAP，原本付费的 BusinessGreen / ShockinglyGreen 订阅取消，全套插件免费

之后 web 动画领域分成两派：声明式（[[framer-motion]] / Vue Transition）vs 命令式（GSAP / [[anime]]）。GSAP 是后者的代表。

## 学到什么

1. **命令式动画 vs 声明式动画**——GSAP 是命令式，你 call 它它动；React state 驱动是声明式，状态变它动。两套哲学，没有谁对谁错
2. **Timeline 是动画的灵魂**——单段 tween 谁都会写，Timeline 把"几十个动画的精确编排"做成可读的链式调用
3. **Plugin 系统让核心保持小**——core 不到 50KB，复杂能力按需加载。这是写库的好范式
4. **历史包袱也是优势**——15 年的迭代让兼容性、缓动函数细节、边缘情况都被磨平。新库要追这套底蕴很难

## 延伸阅读

- 官方文档：[GSAP Docs](https://gsap.com/docs/)（文档质量极高，每个 API 都有交互式 demo）
- ScrollTrigger 教程：[Cassie Evans — Animating with ScrollTrigger](https://www.youtube.com/watch?v=X7IBa7vZjmo)（GSAP 团队成员讲，30 分钟讲透 scrollTrigger）
- Codepen 灵感库：[GSAP Showcase](https://codepen.io/collection/AEbkkJ)（看别人用 GSAP 做的获奖站）
- [[framer-motion]] —— React 声明式动画对照组
- [[lottie]] —— After Effects 出码方案，和 GSAP 互补

## 关联

- [[framer-motion]] —— React 生态的声明式动画库，与 GSAP 形成两派
- [[lottie]] —— 设计师工具链产物，能和 GSAP timeline 配合
- [[react]] —— React 用 GSAP 需要 `useGSAP` hook 处理 cleanup
- [[svg]] —— GSAP DrawSVG / MorphSVG 是 SVG 动画的工业标准方案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来
- [[bubbletea]] —— Bubble Tea — 用 Elm 架构写终端 UI 的 Go 框架
- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[framer-motion]] —— Framer Motion — React 声明式动画
- [[motion-one]] —— Motion One — 把动画交给浏览器自己跑
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[react]] —— React UI 组件库
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
- [[visx]] —— visx — 把 d3 拆成 30 块乐高的 React 可视化原语

