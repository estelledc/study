---
title: GSAP — GreenSock 高性能动画
来源: https://github.com/greensock/GSAP
日期: 2026-05-29
分类: 动画
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/greensock/GSAP
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 13e2b790546426a1a2e0e9b409f3f8dc6d6611f2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.15.0
---

## 是什么

GSAP（GreenSock Animation Platform）是一套框架无关的 JavaScript 动画引擎。日常类比：[[framer-motion]] 让你声明目标状态，GSAP 让你命令“这段属性在何时从哪到哪”。

你写：

```js
import gsap from "gsap"

gsap.to(".box", { x: 100 })
```

固定 `3.15.0` 的默认入口会注册 `CSSPlugin`。没写 `duration` 时用 `0.5` 秒，没写 ease 时用 `quad.out`。`x` 由 CSSPlugin 写成 `transform`。选择器字符串会走 `document.querySelectorAll`。

## 为什么重要

不读固定 3.15.0 的核心文件，下面这些合同很容易被旧印象带偏：

- 为什么默认时长是 0.5 而不是 1
- 为什么 `kill()` 通常触发 `onInterrupt`，而不是 `onComplete`
- 为什么 Timeline 里 `"<"` 是对齐最近子动画的起点，不是“并行”这个口语
- 为什么 `import ScrollTrigger from "gsap/ScrollTrigger"` 之后还要 `registerPlugin`
- 为什么许可写的是 Standard no-charge，不是 MIT

## 核心要点

GSAP 主链可以拆成五步：

1. **Tween**：`gsap.to` / `from` / `fromTo` 创建 `Tween`。默认 `duration: 0.5`、`overwrite: false`、`delay: 0`、ease `quad.out`。源码把版本写成 `gsap.version = "3.15.0"`。

2. **Timeline**：`gsap.timeline()` 创建可嵌套时间轴。`position == null` 时插到当前 clipped duration（接在最近子动画之后）。`"<"` 用最近子动画的 `_start`，`">"` 用它的 `endTime`；`+=0.5` 是相对当前终点再偏 0.5 秒。

3. **Plugin**：核心只负责改属性。`src/index.js` 已注册 `CSSPlugin`。ScrollTrigger、Flip、Draggable、MorphSVG 等与核心同仓，经 `gsap/<Plugin>` 导入后仍要 `gsap.registerPlugin(...)`。

4. **kill / interrupt**：`Animation.kill()` 无参，走 `_interrupt`：从父级摘除；若 `progress() < 1` 调用 `onInterrupt`，不调用 `onComplete`。`Tween.kill(targets, vars = "all")` 可以按目标或属性局部杀掉。

5. **环境边界**：`_wake()` 只在存在 `window` 时绑定 `document`。模块加载末尾执行 `_windowExists() && _wake()`。没有 document 时，选择器字符串没有可查询的树。`@gsap/react` 的 `useGSAP` 不在本仓库。

## 实践示例

### 案例 1：默认时长的 tween

```js
import gsap from "gsap"

gsap.to(".box", { x: 100 })
```

没有 `duration` 就是 0.5 秒，ease 是 `quad.out`。要 1 秒必须显式写 `duration: 1`。

### 案例 2：Timeline 位置参数

```js
gsap.timeline()
  .to(".a", { x: 100 })
  .to(".b", { y: 50 }, "<")
```

`"<"` 让第二段从最近子动画的起点开始。省略位置则接到当前时间轴终点。`">"` 对齐最近子动画的结束时间。

### 案例 3：ScrollTrigger 必须注册

```js
import gsap from "gsap"
import ScrollTrigger from "gsap/ScrollTrigger"

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

有 trigger、未 pin、且未写 `start` 时，固定实现默认 `start` 为 `"0 100%"`。例子里的 `"top center"` 是显式覆盖。`markers` 只是调试绘制，生产构建不会替你删掉。

## 踩过的坑

1. **以为 `kill()` 还会跑 `onComplete`**：未完成时 `_interrupt` 走 `onInterrupt`。
2. **把 `Tween.kill` 的参数记成 `kill(true)`**：签名是 `kill(targets, vars = "all")`，用来按目标或属性裁剪。
3. **导入插件却不 `registerPlugin`**：条件 exports 能解析到文件，不注册就不会挂到核心。
4. **把 `@gsap/react` 写成这个 pin 的一部分**：`useGSAP` 是独立 npm 包，本仓库没有。
5. **把 README 的 “20x faster than jQuery” 当成测量结果**：那是项目自述，本轮未跑任何 benchmark。

## 适用 vs 不适用场景

**适用**：

- 需要精确串并联、标签和 position 字符串的时间轴
- 滚动驱动、SVG/属性/通用对象一起编进同一套 ticker
- 能接受 Standard no-charge 许可，而不是 OSI MIT

**不适用**：

- React 组件级 enter/exit 且希望声明式 props → [[framer-motion]]
- 只做 hover 变色 → CSS transition 更短
- 必须在没有 `window`/`document` 的环境里解析选择器字符串
- 需要本轮未提供的运行时帧率或体积数字

## 固定版本边界

- 本文绑定 `greensock/GSAP@13e2b790...`，tag 与 `package.json` / `gsap.version` 均为 `3.15.0`。
- npm 未暴露 `gitHead`；锚点是 lightweight tag 与版本字符串一致。
- 许可是 Standard no-charge，不是 MIT。README 称 Webflow 之后 bonus 插件免费；具体条款仍以许可页为准。
- 未安装依赖、未跑上游测试、未测滚动或 ticker，状态保持 `UNVERIFIED`。

## 学到什么

1. **命令式时间轴把“何时开始”做成位置 DSL**——`"<"` / `">"` / `+=` 是解析规则，不是口语。
2. **默认值必须从 `_defaults` 读**——时长 0.5、ease `quad.out`，不能沿用旧教程的 1 秒。
3. **中断和完成是两条回调**——`kill` 对齐 `onInterrupt`。
4. **插件同仓不等于自动注册**——除默认 `CSSPlugin` 外都要显式登记。

## 应用型自测

1. `gsap.to(".box", { x: 100 })` 没写 duration，会跑多久？
2. 一段 tween 播到一半调用无参 `kill()`，会触发 `onComplete` 吗？
3. Timeline 第二段写 `">"`，它从哪里开始？

检查点：

1. 0.5 秒，ease 为 `quad.out`。
2. 不会；`progress() < 1` 时走 `onInterrupt`。
3. 从最近子动画的 `endTime` 开始。

## 延伸阅读

- 文档：[gsap.com/docs](https://gsap.com/docs/)
- 固定源码：[greensock/GSAP](https://github.com/greensock/GSAP) —— 提交 `13e2b790546426a1a2e0e9b409f3f8dc6d6611f2`
- 许可：[Standard license](https://gsap.com/standard-license)
- [[framer-motion]] —— React 声明式对照
- [[lottie]] —— 设计师工具链产物，可与 timeline 配合

## 关联

- [[framer-motion]] —— 声明式 React 动画对照
- [[lottie]] —— JSON 回放与命令式时间轴互补
- [[react]] —— React 集成应另查 `@gsap/react`，不在本 pin
- [[anime]] —— 另一套命令式时间轴
- [[pixi]] —— 2D 引擎侧常见的 GSAP 搭档

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来
- [[bubbletea]] —— Bubble Tea — 用 Elm 架构写终端 UI 的 Go 框架
- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[lottie]] —— lottie-web — 把 AE 动画变成网页可播放的 JSON
- [[motion-one]] —— Motion One — 把动画交给浏览器自己跑
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
- [[visx]] —— visx — 把 d3 拆成 30 块乐高的 React 可视化原语
