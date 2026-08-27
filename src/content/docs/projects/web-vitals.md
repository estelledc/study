---
title: web-vitals — 浏览器端 Core Web Vitals 的官方参考实现
来源: https://github.com/GoogleChrome/web-vitals
日期: 2026-05-30
分类: 前端工程化
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/GoogleChrome/web-vitals
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 582ee7450ca5c60a947edbfd95ad53e135ca5dde
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.2.1
---

## 是什么

web-vitals 是 Chrome 团队维护的浏览器端 RUM 库。日常类比：像考试时学校发的标准答题卡——你自己用秒表测“页面快不快”，它按与 CrUX / Search Console 同一套入口、阈值和隐藏态规则出数。

你写：

```js
import {onLCP, onINP, onCLS} from 'web-vitals';
onLCP((m) => console.log(m.name, m.value, m.rating, m.id));
onINP((m) => console.log(m.name, m.value, m.rating, m.id));
onCLS((m) => console.log(m.name, m.value, m.rating, m.id));
```

固定 6.2.1 的公开入口是 `onCLS` / `onFCP` / `onINP` / `onLCP` / `onTTFB`。`onFID` 已不在该版本 API。attribution 诊断走独立导出 `web-vitals/attribution`。

## 为什么重要

不理解 web-vitals，下面这些事都没法解释：

- 为什么自己 `setTimeout` 测加载，永远对不上 Search Console
- 为什么 INP 取代 FID 后，SPA 后续点击也会进入排名相关指标
- 为什么默认 callback 不是“每个 paint 都报一次”，而是要等 hidden / 输入 finalize
- 为什么 prerender、bfcache、soft navigation 会换 `metric.id` 或重开一条会话

## 核心要点

固定 6.2.1 的测量链可以拆成五步：

1. **等激活**：`whenActivated` 在 `document.prerendering` 时等到 `prerenderingchange`，避免把预渲染时间算进 LCP。

2. **观察 Performance 条目**：`observe(types)` 按 `supportedEntryTypes` 过滤，默认 `buffered: true`，回调放进 `queueMicrotask`；同时观察多种 type 时按 `startTime + duration` 排序。

3. **按指标改值**：LCP 用 `max(startTime - activationStart, 0)`，且 renderTime 必须早于 `firstHiddenTime`；INP 把带 `interactionId` 的 event 交给 `InteractionManager`；CLS 在 FCP 之后才按 session window 累加。

4. **算 rating 再上报**：`bindReporter` 用固定阈值写 `good` / `needs-improvement` / `poor`，并填 `delta`。默认只在 `forceReport` 或 `reportAllChanges` 时回调。

5. **生命周期重置**：`pageshow.persisted` 会换新 Metric（新 `id`）；`reportSoftNavs` 开启且浏览器支持时，soft navigation 也会重开一条。

## 实践示例

### 案例 1：给博客加最小 RUM

```js
import {onLCP, onINP, onCLS} from 'web-vitals';

const send = (metric) => {
  navigator.sendBeacon('/beacon', JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
  }));
};
onLCP(send);
onINP(send);
onCLS(send);
```

`sendBeacon` 适合页面进入 hidden 时的最后一次上报。`metric.id` 是去重键：bfcache 恢复会新建 Metric，不能按 path 累加。

### 案例 2：看哪一次交互最慢

```js
onINP((m) => {
  if (m.value > 200) {
    const entry = m.entries[0];
    console.warn('slow interaction', entry?.name, m.value, m.rating);
  }
}, {reportAllChanges: true});
```

阈值来自源码常量 `INPThresholds = [200, 500]`。默认 `durationThreshold` 是 40ms：更短的 event 不会进 observer，库会退回 first-input 的 input delay。`entries` 是构成该次估计 p98 的 Event Timing，不是页面上每一次点击。

### 案例 3：读 `observe()` 怎么包 PerformanceObserver

```ts
export const observe = (types, callback, opts = {}) => {
  const supportedTypes = types.filter((t) =>
    PerformanceObserver.supportedEntryTypes.includes(t),
  );
  const po = new PerformanceObserver((list) => {
    queueMicrotask(() => callback(list.getEntries()));
  });
  for (const t of supportedTypes) {
    po.observe({type: t, buffered: true, ...opts});
  }
  return po;
};
```

固定版本接受 **type 数组**，不再是单字符串。Safari 同步派发用 `queueMicrotask` 错开，不是 `Promise.resolve().then`。

## 踩过的坑

1. **把默认上报理解成“每个新 LCP 都 callback”**：`bindReporter` 默认要 `forceReport`。LCP 在可信 keydown/click/visibilitychange 上 finalize；INP/CLS 主要在 hidden 时强制报。

2. **按 path 聚合 bfcache 恢复**：`pageshow.persisted` 会 `initMetric` 换新 `id`。后端若按 origin+path 累加，会话数会虚高。

3. **SSR / Node 直接 import 主入口**：库读 `PerformanceObserver`、`document`、`addEventListener`。Astro / Next 必须放进 client-only 边界。

4. **Firefox / Safari 的 INP 当成 0**：缺少 `interactionId` 时 `onINP` 直接 return。dashboard 要把 unsupported 和 “INP=0” 分开。

5. **打开 soft navigation 却以为所有浏览器都会重开会话**：还要 `soft-navigation` entry 与 `getLargestInteractionContentfulPaint()` 同时存在，并且显式传 `reportSoftNavs: true`。

## 适用 vs 不适用场景

**适用**：

- 要让前端 RUM 与 CrUX / Search Console 口径对齐的站点
- 只需 CLS / INP / LCP（以及诊断用 FCP / TTFB）
- 学习 PerformanceObserver、Page Lifecycle 与 hidden 态的参考实现

**不适用**：

- 服务端 / CI lab 测量 → 用 Lighthouse CI，不是这套 RUM API
- 自定义业务事件（“加购耗时”）→ 自己观察 mark/measure
- 需要完整 APM、错误链路或 session replay → 这不是那类 SDK
- 仍依赖 `onFID` 的旧集成 → 固定 6.2.1 已删除该入口

## 固定版本边界

- 本文绑定 `GoogleChrome/web-vitals@582ee745...`，tag 与 package 均为 `6.2.1`。
- 评分阈值：LCP `[2500, 4000]`、INP `[200, 500]`、CLS `[0.1, 0.25]`、FCP `[1800, 3000]`、TTFB `[800, 1800]`。
- 运行时 `dependencies` 为空；attribution 是另一条 export，不是默认包进标准入口。
- README 自报体积约 3K brotli，本文未复测 bundle。
- 本文未安装依赖、运行 unit/e2e、触发 PerformanceObserver 或对照 CrUX，状态保持 `UNVERIFIED`。

## 学到什么

1. **参考实现先对齐隐藏态，再对齐 paint**——`firstHiddenTime`、prerender activation 和 bfcache 比“取最后一个 LCP entry”更关键。
2. **INP 的 p98 是候选池估计**——只留最长 10 次 interaction，用 `floor(count / 50)` 取下标，不是对全部点击做统计库 p98。
3. **CLS 故意等 FCP**——为了和 CrUX 行为对齐，FCP 前的 layout shift 不会单独成篇。
4. **默认少报一次，胜过把中间态当终值**——`bindReporter` 把持续更新和最终上报分开。

## 应用型自测

1. 页面一直可见、用户从未点击或按键，默认 `onLCP` 一定会立刻 callback 吗？
2. 一次 INP 会话里发生了 3 次交互。估计值取的是平均值、最大值，还是候选池里的某一档？
3. 只传 `reportSoftNavs: true`，但浏览器没有 `getLargestInteractionContentfulPaint`。会不会按 soft navigation 重开 LCP？

检查点：

1. 不一定。默认要等 finalize 事件或 hidden；`reportAllChanges` 才会更早报。
2. 3 次时 `floor(3/50)=0`，取最长那一次，不是平均。
3. 不会。`checkSoftNavsEnabled` 还要求该方法存在。

## 延伸阅读

- 指标定义：[web.dev — Core Web Vitals](https://web.dev/articles/vitals)
- INP：[web.dev — INP](https://web.dev/articles/inp)
- 固定源码：[GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals) —— 本文绑定提交 `582ee7450ca5c60a947edbfd95ad53e135ca5dde`
- 升级说明：仓库内 `docs/upgrading-to-v6.md`
- [[lighthouse]] —— lab 测量；本文是 RUM 参考实现

## 关联

- [[lighthouse]] —— Lighthouse 是 lab，web-vitals 是 RUM
- [[vite]] —— 浏览器入口里三行 `onLCP` / `onINP` / `onCLS` 即可接入
- [[astro]] —— 必须放进 client-only 组件，避免 Node 端读 PerformanceObserver
- [[preact]] —— framework-agnostic，不依赖 React 调度
- [[vitepress]] —— 文档站自己测加载，是常见 dogfood
- [[webpack]] —— tree-shake 只能去掉未 import 的 `onXxx`，共享 lib 仍会留下

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[video.js]] —— Video.js — Web 视频播放器框架
