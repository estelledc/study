---
title: web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上
来源: 'https://github.com/GoogleChrome/web-vitals'
日期: 2026-05-30
分类: projects / 前端
难度: 中级
---

## 是什么

web-vitals 是 **Google Chrome 团队写的一个小到 2KB 的 JS 库**，它让你在自己页面里测出来的"加载快不快、点了响应快不快、布局抖不抖"这三个数字，和 Google 用来给网站打分的那套指标**同一口径、同一算法**（单次页面测值不会等于 Search Console 的站点聚合分）。

日常类比：像考试时学校给的标准答题卡。你自己用普通纸算了一遍考分（90 分），但学校用统一答题卡再算一遍，得到 85 分——这种偏差就是 SEO 上常见的"我自己测明明很快，Google 却说我慢"。web-vitals 就是那张标准答题卡的 JS 版本，所有人同算法。

```js
import { onLCP, onINP, onCLS } from 'web-vitals'
onLCP((m) => console.log('LCP', m.value, m.rating))
onINP((m) => console.log('INP', m.value, m.rating))
onCLS((m) => console.log('CLS', m.value, m.rating))
```

三行代码上报三个指标。它本质是把浏览器原生的 `PerformanceObserver` 包了一层，里面塞了 Chrome 团队几十次踩坑的边界处理。

## 为什么重要

不理解 web-vitals，下面这些事都没法解释：

- 为什么前端监控 "自己 setTimeout 测一下" 永远做不对——bfcache（浏览器整页缓存后退前进）、prerender（预渲染未激活）、firstHidden（用户切走标签）这些坑你踩不全
- 为什么 INP 在 2024 年突然取代了 FID，作为 Google 排名信号——FID 只看第一次输入，对 SPA（单页应用）后续交互盲区
- 为什么 2KB 的库在公司前端里被广泛集成——它是 Chrome 团队自己写的"参考实现"，等于宣告"这就是正确算法"
- 为什么 Lighthouse 跑出来的分和 Search Console 显示的分不一样——前者是实验室模拟（lab），后者是真实用户监控（RUM），web-vitals 解决后者

## 核心要点

它能做到"和 Google 算法对齐"靠 **三招**：

1. **抽出 6 个共用 lib**：`observe.ts`（57 行包住 PerformanceObserver）、`initMetric.ts`（创建 metric 对象）、`bindReporter.ts`（算 delta 和 rating）、`bfcache.ts`、`whenActivated.ts`（prerender 状态机）、`visibilityWatcher`（监听 hidden）。所有指标共享，避免每家自己写一份漏一处。

2. **每个指标自己的判定逻辑**：CLS 用 "1 秒间隔或 5 秒跨度" 的 session window；INP 用 p98 longest interaction（不是 max 也不是 mean）；LCP 卡 `entry.startTime < firstHiddenTime` gate。这些数字都是 Chrome 团队拍板的协议、必须照搬。

3. **零依赖**：`package.json` 的 `dependencies` 是空的。Google 团队对自己的 dogfood——指标库不能成为指标问题。所有工具函数自己手写一遍，宁愿重复也不引第三方。

三招加起来，让一个监控库的 bundle 控制在 2KB（brotli），还能保证算法和服务器端 CrUX 一致。

## 实践案例

### 案例 1：给自己的博客加最小 RUM

适合刚学性能监控的人——没有付费 SaaS、不要 dashboard，先把数字采下来。

```js
// 在 layout 或 root 组件
import { onLCP, onINP, onCLS } from 'web-vitals'

const send = (metric) => {
  navigator.sendBeacon('/beacon', JSON.stringify({
    name: metric.name, value: metric.value,
    rating: metric.rating, id: metric.id,
  }))
}
onLCP(send); onINP(send); onCLS(send)
```

**逐部分解释**：

- `sendBeacon`：页面关闭也能把数据发出去，比 `fetch` 更适合埋点
- `name / value / rating`：指标名、毫秒（或 CLS 分数）、good / needs-improvement / poor
- `metric.id`：同一 page view 的唯一标识——bfcache 恢复会换 id，按它去重

### 案例 2：在内部工具系统排查"页面卡"反馈

用户说"点完按钮要等好久"——你不知道是网络慢、JS 慢、还是渲染慢。

```js
onINP((m) => {
  if (m.value > 200) {  // INP 超过 200ms 是 needs-improvement
    console.warn('slow interaction', m.entries[0].name, m.value)
  }
})
```

**逐部分解释**：

- `m.value > 200`：Google 阈值，200ms 以上算 needs-improvement，500ms 以上算 poor
- `m.entries[0]`：触发最长交互的那条 EventTiming（事件类型、target、duration）
- 比让用户口述"卡了一下"准得多——直接定位到哪个按钮、哪种事件

### 案例 3：读源码学习如何包 PerformanceObserver

`src/lib/observe.ts` 只有 57 行，它做了 3 件事：

```ts
export const observe = (type, callback, opts = {}) => {
  try {
    if (PerformanceObserver.supportedEntryTypes.includes(type)) {
      const po = new PerformanceObserver((list) => {
        Promise.resolve().then(() => callback(list.getEntries()))
      })
      po.observe({ type, buffered: true, ...opts })
      return po
    }
  } catch {}
  return undefined
}
```

要点：feature detection 用 `supportedEntryTypes`、`buffered: true` 让 observer 注册前发生的 entry 也回放、`Promise.resolve().then` 绕开 Safari 的同步派发 bug。任何二次封装 ResizeObserver / IntersectionObserver 的人都该照抄这套范本。

## 踩过的坑

1. **bfcache 恢复会触发"同一 page view 重复上报"**：bfcache 把页面整页缓存，pageshow 时 web-vitals 会重新创建 Metric 对象、再上报一次。聚合后端如果按 origin + path 累加，数字会虚高。**对策**：以 `metric.id` 为去重 key。

2. **SSR / Node 端 import 主入口立刻爆**：库依赖 `globalThis.PerformanceObserver` 和 `addEventListener`，Node 没有。**对策**：在 Astro / Next.js 这类有 SSR 的框架里，import 必须包 `if (typeof window !== 'undefined')` 或放在 client-only 组件里。

3. **Firefox / Safari 拿不到 INP**：`onINP` 顶部检测 `'interactionId' in PerformanceEventTiming.prototype`，没有就直接 return。**对策**：dashboard 要把 "unsupported" 和 "INP=0" 显式区分，不然误以为这些浏览器用户体验完美。

4. **不要绕开它自己手写**：你大概率漏 prerender 的 `activationStart` 修正、漏 `entry.startTime < firstHiddenTime` 的 gate、漏 session window 的 1s/5s 阈值——最后埋点数字和 Google Search Console 显示的不一致，业务方一脸懵。

## 适用 vs 不适用场景

**适用**：
- 想让前端监控数字和 Google SEO 数字对齐的所有项目（只覆盖 LCP / INP / CLS 三指标）
- 监控库的 bundle 预算很紧（2KB 几乎可以忽略）
- 学习 PerformanceObserver / 性能 API 的最佳"参考实现"
- 在浏览器端做 RUM（真实用户监控），不要完整 APM SDK

**不适用**：
- 服务端 / SSR 阶段需要测试 → web-vitals 跑不起来，用 Lighthouse CI 或后端 trace
- 想测自定义业务事件（"加购物车响应时间"）→ 库不管，自己用 PerformanceObserver + custom mark
- CI 里防性能回归 → 那是 lab measurement 的活，用 Lighthouse CI，不是 RUM
- 需要 trace + 错误链路 + replay 一站式 → 用 Sentry / DataDog RUM（代价是 30-200KB SDK）

## 历史小故事（可跳过）

- **2020 年 5 月**：Google 公布 Core Web Vitals（LCP / FID / CLS）作为搜索排名信号；同年 web-vitals v1 发布，给前端一个"官方算法"实现。
- **2021 年**：CLS 算法从"全程累加"改为"session window 取最大"，避免长会话页（新闻流、社交 feed）被惩罚；web-vitals 同步更新。
- **2024 年 3 月**：INP 正式替代 FID 成为 Core Web Vital；web-vitals v4.0 发布，作为 break change。FID 只测第一次输入响应，对 SPA 后续交互盲区——这是 INP 出生的直接动因。
- **维护者**：一作 Philip Walton 是 Chrome DevRel，长期在 web.dev 写 RUM、Page Lifecycle、INP 等深度文章；库本身和这些文章是配套的"理论 + 实现"双产物。

## 学到什么

1. **协议库 vs 工具库的区别**：web-vitals 不只是一个测量工具，它是 Chrome 自己的"标准答案" reference implementation——大公司团队下场写库本身就是在为整个生态定调
2. **Bundle 预算可以推导设计决策**：为了 2KB，就得零依赖、就得手写所有工具函数。约束不是限制，而是设计指南
3. **"和服务器端对齐"是一种特殊的工程目标**：比"功能对"还要苛刻，因为服务器端 CrUX 算法变了你也得跟着变
4. **看官方库源码的 ROI 极高**：57 行的 `observe.ts` 浓缩了 try/catch + feature detection + queueMicrotask 三个坑，比读 10 篇博客高效

## 延伸阅读

- 视频：[Philip Walton — Measuring Real User Performance](https://www.youtube.com/watch?v=tF8YUzJ50Xc)（Chrome 团队亲自讲设计取舍）
- 文档：[web.dev — Core Web Vitals](https://web.dev/articles/vitals)（指标定义 + 阈值由来）
- INP 取代 FID：[web.dev — INP becomes a Core Web Vital](https://web.dev/articles/inp-cwv)
- 源码：[GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals)（重点读 `src/lib/observe.ts`、`src/lib/LayoutShiftManager.ts`、`src/onINP.ts`）
- [[lighthouse]] —— 同 Google 出品的 lab 测量工具，和 web-vitals 互补

## 关联

- [[lighthouse]] —— Lighthouse 是 lab measurement，web-vitals 是 RUM；CI 用前者，生产监控用后者
- [[vite]] —— Vite 项目里接 web-vitals 是 import + 三行 callback
- [[astro]] —— Astro SSG/SSR 接 web-vitals 必须包 client-only 组件，避免 Node 端爆
- [[preact]] —— Preact 项目同 React，web-vitals 是 framework-agnostic 的纯 JS 库
- [[vitepress]] —— 文档站接 web-vitals 测自家文档加载性能，是经典 dogfood
- [[webpack]] —— Webpack tree-shake web-vitals 时只能 shake 掉没 import 的 onXxx 入口，共享 lib 全保留

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[preact]] —— Preact — 3KB React 替代
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[webpack]] —— webpack 模块打包

