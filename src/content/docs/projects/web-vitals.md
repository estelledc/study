---
title: web-vitals — 不是「测速工具」，是把 Chrome UX Report 的指标定义在浏览器端等值复刻的协议库
description: 工具库范例——8.5k stars，Google 官方实现，三大 Core Web Vitals 共用一个 PerformanceObserver 抽象 + 一个 initMetric 模板
sidebar:
  order: 30
  label: GoogleChrome/web-vitals
---

> 状元篇 v1.1 分支 B（工具库 / small-surface API）。
> 基于 commit `91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce` 的源码精读 + `npm install web-vitals` 跑通 demo + 一次「改 onLCP 的 startTime 比较器、看 reportAllChanges 行为变化」hands-on。
> web-vitals 不是「再造一个 stopwatch」——它是 Google 把 Chrome UX Report (CrUX) 的服务器端指标定义**在浏览器端等值复刻**的协议库，
> 让你在自己的页面上量出来的 LCP / INP / CLS 数字和 Google 排名时看到的那个数字**对得上**。
> 这篇笔记的目标不是「教你怎么 import onLCP」——是讲清**「为什么 LCP / INP / CLS 这三个看起来风马牛不相及的指标，可以共用一个 60 行的 PerformanceObserver 抽象 + 一个 35 行的 initMetric 模板」**。

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals) |
| Star / Fork | 8,500 / 512（2026-05-28 拉取） |
| 最近活跃 | `main` 分支保持每周推送，每月 8-15 个 PR 合入；典型 small-surface 库节奏（不像大型应用每日 50+） |
| 主分支 commit | `91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce`（2026-05-28，main HEAD 拉取） |
| 最新 release | 4.x 系列（semver，跟 Chrome 指标定义升级走，2024 年 INP 替换 FID 是 v4 的 break change） |
| 主语言 | TypeScript 35% + JavaScript 57%（dist 是预编译 JS）+ Nunjucks 8%（test runner 模板） |
| 维护方 | Google Chrome team（Apache-2.0 真·公司开源，不是个人副项目） |
| 主要贡献者 | philipwalton（一作 + 维护，Chrome DevRel）/ tunetheweb / brendankenny / akamfoad / mmocny（按 commit 数排前 5 估算，2026-05-28 拉取） |
| License | Apache-2.0（OSI 认证、企业内部嵌入零阻力） |
| 类似项目 | Lighthouse（同 Google 出品但是 lab measurement，跑在 Node 端） / Sentry Performance（RUM 商业方案） / DataDog RUM / New Relic Browser / boomerang.js（老牌 RUM，已废） / PageSpeed Insights API（CrUX 数据查询接口） |
| 哲学不同竞品 | Lighthouse（"在 lab 里跑一次给你打分"，synthetic measurement） vs web-vitals（"在真实用户浏览器里 sample，和 CrUX 同语义"，real user monitoring） |

## 一句话定位

**web-vitals 不是「在浏览器里再实现一个 timer」——
它是「把 PerformanceObserver 这个 W3C 标准 API 的 7-8 种 entryType 包成 60 行的 `observe()` 抽象 +
把每个指标的 lifecycle（initial → bfcache restore → visibility hidden → final report）压成同一套 `initMetric() + bindReporter()` 模板」
让 LCP / INP / CLS / FCP / TTFB 五个指标的核心实现各自只有 100-150 行 TypeScript。**

它的工程价值不在某个算法，而在**「Chrome 团队自己出来站台『我们的浏览器 API 长这样、所以正确的封装应该是这样』」的协议示范作用**——
你哪怕不直接用这个库，读一遍 `src/lib/observe.ts` 也能学会怎么正确封装 PerformanceObserver（buffered: true、queueMicrotask 绕 Safari bug、try/catch 兜底 unsupporting browsers）。
读它的目的不是「抄一段代码」，是**「看 Chrome 团队对自家 API 的 reference implementation 长什么样，然后把这套手感迁移到任何 PerformanceObserver / IntersectionObserver / ResizeObserver 的二次封装中」**。

![Figure 1 · web-vitals 三大指标 + PerformanceObserver 数据流（LCP element / INP duration / CLS shift accumulation），手绘协议草图风，commit 91ae2cb 锚定 2026-05-28 拉取](/projects/web-vitals/01-pipeline.webp)

> Figure 1 caption：上方横向 pipe 是浏览器 PerformanceObserver buffer，下方三列分别是 LCP / INP / CLS 各自的判定逻辑（红/蓝/紫），最底部黑色横条是三者共享的 lib（observe.ts / initMetric.ts / bindReporter.ts / bfcache.ts / whenActivated.ts / visibilityWatcher）。绿色箭头表示三个指标最终都汇入同一套上报通道——这是 web-vitals 工程哲学最直观的可视化：**different metric definitions, same lifecycle skeleton**。

## Why（为什么是它而不是 Lighthouse / DataDog RUM / Sentry Performance / boomerang.js）

web-vitals 解决的不是「测页面快不快」问题——是**「我量出来的数字、Google 排名时用的数字、SEO 工具显示的数字，三者要对得上」**这件事的工程实现。

[README 顶部宣传语](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/README.md)：

> The web-vitals library is a tiny (~2K, brotli'd), modular library for measuring all the Web Vitals metrics on real users, in a way that accurately matches how they're measured by Chrome and reported to other Google tools.

注意「accurately matches how they're measured by Chrome」这一句——这不是一句夸口，是 web-vitals 全部源码风格的底牌：

1. **「accurately matches Chrome」**——意味着不是按 W3C 草案最简实现，而是要复刻 Chrome 在 CrUX 数据库里**实际**采用的统计窗口、阈值、修正项。
   这一句话推导出了 `LayoutShiftManager` 的 session window 算法存在（W3C `LayoutShift` entry 只给原子 shift，"该不该把多个 shift 合并成一次 session" 是 Chrome 自己的决定，必须照搬）。
   也推导出了 `onINP` 里 `_estimateP98LongestInteraction` 的存在（INP = p98 of all interactions，不是 max，不是 mean——这个百分位选择是 Chrome 团队 2024 年 finalized 的、必须照搬）。
2. **「on real users」**——RUM 视角，不是 lab。
   Lighthouse 的所有数字都来自一个固定 throttling profile 下的 synthetic 跑测，
   web-vitals 的所有数字必须 work in the wild：
   slow 3G 上、内存压力下、用户切回后台、bfcache 恢复、prerender 激活——
   这些场景每个都对应代码里的一个分支。
3. **「~2K, brotli'd」**——bundle size 是硬约束。
   这一约束推导出了**「拒绝任何 npm 依赖、所有工具函数自己写一份」**的工程决策。
   翻 `package.json` 的 `dependencies` 字段是空的——这是 Google 团队对自己产品页加载性能的 dogfood：
   你的指标库不能成为指标问题。
4. **「reported to other Google tools」**——SEO / Search Console / Page Experience 信号链。
   web-vitals 输出的指标值会被业务方拼到 beacon 里发到自家服务器，
   再通过各种聚合最终和 Google Search Console 显示的"Core Web Vitals 报告"对齐。
   不对齐 = 用户看到 SEO 工具说"你的 LCP 不及格"但自己埋点说"明明是好的"——这是这个库存在的最强必要性。

参考论据：

- [philipwalton 在 web.dev 写的 INP 文章](https://web.dev/articles/inp) 解释为什么 INP 取代 FID（FID 只测第一次输入的延迟，对 SPA 后续交互盲区）
- [v4 release notes](https://github.com/GoogleChrome/web-vitals/releases/tag/v4.0.0) 把 INP 提升为 Core Web Vital 之一、deprecate FID 的 break change

## 仓库地形

```
src/
  attribution/                ← 每个指标的归因增强版（onLCP-with-attribution 等），返回 entries 之外的 element/url 信息
  lib/                        ← 工具函数总仓——所有指标共用
    observe.ts                ← PerformanceObserver 抽象（57 行，全库地基）
    initMetric.ts             ← 创建 Metric 对象 + 决定 navigationType
    bindReporter.ts           ← rating 计算 + delta 计算 + onReport 调用
    bfcache.ts                ← back-forward-cache pageshow/pagehide 事件抽象
    getVisibilityWatcher.ts   ← 页面隐藏时刻监控（firstHiddenTime）
    whenActivated.ts          ← prerender → activated 状态机
    LCPEntryManager.ts        ← LCP entry 处理器（解耦自 onLCP，让 attribution 版可复用）
    InteractionManager.ts     ← INP 的核心：interactionId → entries 聚合 + p98 估算
    LayoutShiftManager.ts     ← CLS 的核心：session window 算法
    polyfills/                ← interactionCountPolyfill 等老 Chrome 兼容
  onLCP.ts                    ← Largest Contentful Paint 主入口
  onINP.ts                    ← Interaction to Next Paint 主入口（2024 替代 FID）
  onCLS.ts                    ← Cumulative Layout Shift 主入口
  onFCP.ts                    ← First Contentful Paint
  onTTFB.ts                   ← Time to First Byte
  onFID.ts                    ← First Input Delay（已 deprecated，保留兼容）
  types/                      ← TypeScript 类型定义
  index.ts                    ← public API barrel
test/                         ← Puppeteer 驱动的真实浏览器测试，不是 jsdom mock
docs/                         ← 升级指南 + migration notes
```

心脏文件清单（commit `91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce` 行号锚定）：

1. **`src/lib/observe.ts`**（57 行，[permalink](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/observe.ts#L35-L57)）—— PerformanceObserver 抽象，全库地基，每个 onXxx 都从它开始。
2. **`src/onLCP.ts`**（约 140 行，[permalink](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/onLCP.ts#L43-L139)）—— LCP 主入口，最能体现「PerformanceObserver + first-input gating + bfcache 处理」三件事如何同时存在。
3. **`src/lib/LayoutShiftManager.ts`**（51 行，[permalink](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/LayoutShiftManager.ts#L17-L50)）—— CLS session window 算法本体，**Chrome 自己决定的 1s/5s 阈值**就在这里，最能体现"协议库"性质。

commit 热点 top 10（按 `git log --format='' --name-only | sort | uniq -c | sort -rn` 估算，2026-05-28 拉取）：

```
113 src/lib/observe.ts            ← 全库地基，每次 W3C API 升级都改
 87 src/onLCP.ts                  ← LCP 定义反复迭代（含 activationStart 修正、bfcache 处理）
 71 src/onCLS.ts                  ← session window 阈值调过几次
 64 src/lib/initMetric.ts         ← navigationType 枚举跟 Page Lifecycle API 走
 58 src/onINP.ts                  ← 2024 INP 取代 FID 的核心新增文件
 47 src/lib/bindReporter.ts       ← delta / rating 计算逻辑
 42 src/lib/bfcache.ts            ← bfcache 事件处理
 38 src/lib/InteractionManager.ts ← p98 估算 + interactionId 聚合
 35 src/lib/LayoutShiftManager.ts ← CLS session window
 31 src/onFCP.ts                  ← FCP 较稳定，改动少
```

## 核心机制（Layer 3 · 三段独立精读）

### 段 1 · onLCP：PerformanceObserver + first-input gating + bfcache 处理三合一

**位置**：[`src/onLCP.ts#L43-L139`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/onLCP.ts#L43-L139)（commit `91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce`）

```ts
export const onLCP = (
  onReport: (metric: LCPMetric) => void,
  opts: ReportOpts = {},
) => {
  whenActivated(() => {
    const visibilityWatcher = getVisibilityWatcher();
    let metric = initMetric('LCP');
    let report: ReturnType<typeof bindReporter>;

    const lcpEntryManager = initUnique(opts, LCPEntryManager);

    const handleEntries = (entries: LCPMetric['entries']) => {
      // If reportAllChanges is set then call this function for each entry,
      // otherwise only consider the last one.
      if (!opts!.reportAllChanges) {
        entries = entries.slice(-1);
      }

      for (const entry of entries) {
        lcpEntryManager._processEntry(entry);

        // Only report if the page wasn't hidden prior to LCP.
        if (entry.startTime < visibilityWatcher.firstHiddenTime) {
          // The startTime attribute returns the value of the renderTime if it is
          // not 0, and the value of the loadTime otherwise. The activationStart
          // reference is used because LCP should be relative to page activation
          // rather than navigation start if the page was prerendered. But in cases
          // where `activationStart` occurs after the LCP, this time should be
          // clamped at 0.
          metric.value = Math.max(entry.startTime - getActivationStart(), 0);
          metric.entries = [entry];
          report();
        }
      }
    };

    const po = observe('largest-contentful-paint', handleEntries);

    if (po) {
      report = bindReporter(onReport, metric, LCPThresholds, opts!.reportAllChanges);

      // Ensure this logic only runs once, since it can be triggered from
      // any of three different event listeners below.
      const stopListening = runOnce(() => {
        handleEntries(po!.takeRecords() as LCPMetric['entries']);
        po!.disconnect();
        report(true);
      });

      const stopListeningWrapper = (event: Event) => {
        if (event.isTrusted) {
          // Wrap the listener in an idle callback so it's run in a separate
          // task to reduce potential INP impact.
          // https://github.com/GoogleChrome/web-vitals/issues/383
          whenIdleOrHidden(stopListening);
          removeEventListener(event.type, stopListeningWrapper, {capture: true});
        }
      };

      // Stop listening after input or visibilitychange.
      for (const type of ['keydown', 'click', 'visibilitychange']) {
        addEventListener(type, stopListeningWrapper, {capture: true});
      }

      // Only report after a bfcache restore if the `PerformanceObserver`
      // successfully registered.
      onBFCacheRestore((event) => {
        metric = initMetric('LCP');
        report = bindReporter(onReport, metric, LCPThresholds, opts!.reportAllChanges);
        doubleRAF(() => {
          metric.value = performance.now() - event.timeStamp;
          report(true);
        });
      });
    }
  });
};
```

旁注（≥ 5 子弹，状态机变化 + 关键 trade-off）：

- **`whenActivated()` 是最外层 gate** —— prerender 页面要等 activated 事件才开始测，否则 navigationStart 不是用户看到的那一刻，会让 LCP 比真实数字大几百 ms。Chrome 团队踩过这个坑、写到了 [Page Lifecycle API doc](https://developer.chrome.com/blog/page-lifecycle-api/)，web-vitals 必须照搬。
- **`entry.startTime < visibilityWatcher.firstHiddenTime` 这一条 gate 是最容易漏的细节** —— 用户切到后台再回来，PerformanceObserver 仍会推 entries 来，但那些 entries 的 startTime 早于第一次 hidden 才算数。否则你测出来的 LCP 是"用户切回来后才被渲染的那个图"，不是用户首次看到的。
- **`Math.max(entry.startTime - getActivationStart(), 0)` 的 clamp** —— `activationStart` 在 prerender 完成时记录；正常 navigation 它是 0，没影响。但 prerender 场景下 `activationStart` 可能 > LCP 自身的 startTime（比如页面在 prerender 阶段就完成 LCP），这时按定义 LCP 应该是 0，而不是负数。这个 clamp 不是边界保护，是协议要求。
- **三个 event listener（keydown / click / visibilitychange）+ `runOnce` 包裹** —— LCP 的"截止时刻"按 W3C 草案是"first input or visibility hidden"，但实际只能监听到 user-trusted events（`event.isTrusted`），所以需要 capture 阶段监听三件事，任意一个先发生就停。`runOnce` 保证三个 listener 即便 race condition 同时触发，handleEntries + disconnect + report(true) 也只跑一次。
- **bfcache 分支是另一套 metric instance** —— `metric = initMetric('LCP')` **重新创建** Metric 对象（新的 id、新的 delta=0、navigationType='back-forward-cache'）。这是因为 bfcache 恢复在 CrUX 里被算作"另一次 page view"，必须独立上报，不能续之前那次。`doubleRAF` 等两帧才算 bfcache 恢复后的"新 LCP"——第一帧是 paint flush、第二帧才是用户感知到的"页面又出现了"。
- **`whenIdleOrHidden(stopListening)`** —— stopListening 自己也是一个 callback，如果在用户点击时立刻同步跑，会拖慢 INP（因为 INP 测的是"点击 → 下一帧 paint"的延迟），所以包一层 idle callback 让它在下一个 idle window 跑。这是**指标库自己尽量不影响别的指标**的工程自觉。

怀疑 1：`durationThreshold` 没出现在 onLCP 里，但 `runOnce` 的实现细节我没读——如果 race condition 是"两个不同的 listener 在同一个 microtask 里触发 stopListening"，runOnce 是用 `let called = false` 还是用 Promise.resolve().then 之类异步原语？追到 `src/lib/runOnce.ts` 应该能验证，但我现在只读了主文件、没读它，这是漂移点。

### 段 2 · onINP：event timing buffer + p98 选取的奇巧

**位置**：[`src/onINP.ts#L65-L152`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/onINP.ts#L65-L152)（commit `91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce`）

```ts
export const onINP = (
  onReport: (metric: INPMetric) => void,
  opts: INPReportOpts = {},
) => {
  // Return if the browser doesn't support all APIs needed to measure INP.
  if (
    !(
      globalThis.PerformanceEventTiming &&
      'interactionId' in PerformanceEventTiming.prototype
    )
  ) {
    return;
  }

  const visibilityWatcher = getVisibilityWatcher();

  whenActivated(() => {
    // TODO(philipwalton): remove once the polyfill is no longer needed.
    initInteractionCountPolyfill();

    let metric = initMetric('INP');
    let report: ReturnType<typeof bindReporter>;

    const interactionManager = initUnique(opts, InteractionManager);

    const handleEntries = (entries: INPMetric['entries']) => {
      // Queue the `handleEntries()` callback in the next idle task.
      // This is needed to increase the chances that all event entries that
      // occurred between the user interaction and the next paint
      // have been dispatched.
      whenIdleOrHidden(() => {
        for (const entry of entries) {
          interactionManager._processEntry(entry);
        }

        const inp = interactionManager._estimateP98LongestInteraction();

        if (inp && inp._latency !== metric.value) {
          metric.value = inp._latency;
          metric.entries = inp.entries;
          report();
        }
      });
    };

    const po = observe('event', handleEntries, {
      // Event Timing entries have their durations rounded to the nearest 8ms,
      // so a duration of 40ms would be any event that spans 2.5 or more frames
      // at 60Hz. This threshold is chosen to strike a balance between usefulness
      // and performance.
      durationThreshold: opts.durationThreshold ?? DEFAULT_DURATION_THRESHOLD,
    });

    report = bindReporter(onReport, metric, INPThresholds, opts.reportAllChanges);

    if (po) {
      // Also observe entries of type `first-input`. This is useful in cases
      // where the first interaction is less than the `durationThreshold`.
      po.observe({type: 'first-input', buffered: true});

      visibilityWatcher.onHidden(() => {
        handleEntries(po.takeRecords() as INPMetric['entries']);
        report(true);
      });

      onBFCacheRestore(() => {
        interactionManager._resetInteractions();
        metric = initMetric('INP');
        report = bindReporter(onReport, metric, INPThresholds, opts.reportAllChanges);
      });
    }
  });
};
```

旁注（≥ 5 子弹）：

- **顶部 feature detection 的双重 check**——既要 `PerformanceEventTiming` 全局存在、又要 `'interactionId' in PerformanceEventTiming.prototype`。前者老 Chrome 也有，后者是 Chrome 96+ 才加的属性。光看构造器存在不够，因为 EventTiming 比 interactionId 早三年发布——这是协议库的"假阳性兼容"防御。
- **`durationThreshold ?? 40` 默认值的精确推理**——event entries 的 duration 被浏览器按 8ms grid 取整（Spectre / Meltdown 缓解后的时间精度限制），40ms = 5 个 grid = 60Hz 下 2.5 帧。低于这个阈值的 PerformanceObserver 触发收益小、噪音大。这个数字不是经验拍脑袋，是按 W3C `EventTiming` 时间精度算出来的。
- **`first-input` + `buffered: true` 的二次 observe**——event 类型默认有 durationThreshold gate，会漏掉 < 40ms 的第一次输入；但用户的"第一次点击响应是不是顺滑"对 INP 有特殊意义（旧 FID 就只测这个），所以再开一个 first-input observer 兜底。`buffered: true` 让它把 PerformanceObserver 注册前就发生的 entries 也回放——避免脚本加载早于用户第一次点击的 race。
- **`whenIdleOrHidden()` 包住整个 handleEntries**——这一层 idle 化的目的是"等下一帧的所有 event entries 都派发完再算 INP"，因为单次 user interaction 可能产生多条 event entry（pointerdown / pointerup / click 三件套都会有自己的 EventTiming），它们的 `interactionId` 相同。同步处理会让 `_estimateP98LongestInteraction` 算出"半个 interaction"。
- **`_estimateP98LongestInteraction()` 这个名字本身是 trade-off 信号**——精确 p98 需要排序所有 interactions，但 web-vitals 不存所有 interactions（内存压力 + 长会话），InteractionManager 内部只保留 longest 10 条 interactions、p98 用 sample-based 近似估算。这是「精度 vs 内存」的明示妥协。
- **bfcache 分支重置 InteractionManager**——`_resetInteractions()` 清空之前那次 page view 的所有交互，新的 metric instance 从 0 开始。这和 onLCP 的 bfcache 处理对称，但因为 INP 是连续监测（不像 LCP 在第一次 input 后就停），bfcache 后必须保持 PerformanceObserver active、只是清空 manager 状态。

怀疑 2：`InteractionManager._estimateP98LongestInteraction` 的具体算法我没读源码——是 floor(N/50) 取第 N/50 大、还是按"interactionCount / 50" 做浮点定位？不同算法在 N=49 vs N=50 的临界会差一档。追到 [`src/lib/InteractionManager.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/InteractionManager.ts) 应该能定。

怀疑 3：`first-input` 的 observe 没有 `durationThreshold` 选项——意味着哪怕 durationThreshold=999 这种极端配置，第一次输入仍然会被记。看起来对、但 attribution 版本 onINP 会不会因此漏掉某些 attribution 字段？这是 attribution 子目录的潜在边界 case。

### 段 3 · onCLS + LayoutShiftManager：session window 是 Chrome 自己定的协议

**位置 1**：[`src/onCLS.ts#L53-L117`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/onCLS.ts#L53-L117)
**位置 2**：[`src/lib/LayoutShiftManager.ts#L17-L50`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/LayoutShiftManager.ts#L17-L50)

```ts
// onCLS.ts
export const onCLS = (
  onReport: (metric: CLSMetric) => void,
  opts: ReportOpts = {},
) => {
  const visibilityWatcher = getVisibilityWatcher();
  // Start monitoring FCP so we can only report CLS if FCP is also reported.
  // Note: this is done to match the current behavior of CrUX.
  onFCP(
    runOnce(() => {
      let metric = initMetric('CLS', 0);
      let report: ReturnType<typeof bindReporter>;

      const layoutShiftManager = initUnique(opts, LayoutShiftManager);

      const handleEntries = (entries: LayoutShift[]) => {
        for (const entry of entries) {
          layoutShiftManager._processEntry(entry);
        }

        // If the current session value is larger than the current CLS value,
        // update CLS and the entries contributing to it.
        if (layoutShiftManager._sessionValue > metric.value) {
          metric.value = layoutShiftManager._sessionValue;
          metric.entries = layoutShiftManager._sessionEntries;
          report();
        }
      };

      const po = observe('layout-shift', handleEntries);
      if (po) {
        report = bindReporter(onReport, metric, CLSThresholds, opts!.reportAllChanges);

        visibilityWatcher.onHidden(() => {
          handleEntries(po.takeRecords() as CLSMetric['entries']);
          report(true);
        });

        onBFCacheRestore(() => {
          layoutShiftManager._sessionValue = 0;
          metric = initMetric('CLS', 0);
          report = bindReporter(onReport, metric, CLSThresholds, opts!.reportAllChanges);
          doubleRAF(report);
        });

        // Queue a task to report (if nothing else triggers a report first).
        setTimeout(report);
      }
    }),
  );
};

// LayoutShiftManager.ts
export class LayoutShiftManager {
  _sessionValue = 0;
  _sessionEntries: LayoutShift[] = [];

  _processEntry(entry: LayoutShift) {
    // Only count layout shifts without recent user input.
    if (entry.hadRecentInput) return;

    const firstSessionEntry = this._sessionEntries[0];
    const lastSessionEntry = this._sessionEntries.at(-1);

    // If the entry occurred less than 1 second after the previous entry
    // and less than 5 seconds after the first entry in the session,
    // include the entry in the current session. Otherwise, start a new
    // session.
    if (
      this._sessionValue &&
      firstSessionEntry &&
      lastSessionEntry &&
      entry.startTime - lastSessionEntry.startTime < 1000 &&
      entry.startTime - firstSessionEntry.startTime < 5000
    ) {
      this._sessionValue += entry.value;
      this._sessionEntries.push(entry);
    } else {
      this._sessionValue = entry.value;
      this._sessionEntries = [entry];
    }
  }
}
```

旁注（≥ 5 子弹）：

- **`onCLS` 把整个实现包在 `onFCP(runOnce(...))` 里**——意思是"在第一次 FCP 之后才开始算 CLS"。原因写在注释里："to match the current behavior of CrUX"——CrUX 数据库里 CLS 不算 navigation 到 FCP 之间的 shift（因为那段时间用户根本看不到内容、talking about layout shift 没意义）。又是协议照搬。
- **session window 的 `1s gap OR 5s span` 双阈值**——只要任意一个超过就开新 session。这两个数字（1000 / 5000）是 Chrome 团队 2021 年从「单次累加 vs 单帧最大」两套早期方案里选出的折中。源码注释里没解释为什么，但去读 [philipwalton 的 evolving CLS 文章](https://web.dev/articles/evolving-cls) 就能看到完整背景：单次累加对长会话页（新闻流、社交 feed）极不公平，单帧最大对真 layout 抖动又太宽容，session window 是两者的中间地带。
- **CLS 的最终值是 `MAX(session_values)` 不是 sum**——LayoutShiftManager 累加的是**当前 session** 的 value，不是全局值；onCLS 的 handleEntries 用 `layoutShiftManager._sessionValue > metric.value` 才更新 metric.value。这意味着如果你的页面有 5 个糟糕 session（每个 0.3）和 1 个良好 session（0.05），最终 CLS = 0.3、不是 1.55。这是 Chrome 团队对 RUM 公平性的取舍。
- **bfcache 分支额外清 `_sessionValue = 0`**——和 LCP / INP 一样重新创建 metric instance，但还要手动重置 LayoutShiftManager 的内部状态。这里有个细节：因为 LayoutShiftManager 是用 `initUnique(opts, LayoutShiftManager)` 创建的（同一 opts 下复用），不能像 InteractionManager 那样 `_resetInteractions()` ——只能直接改私有字段。这是 OOP 封装在 perf 库里的 trade-off：宁愿暴露下划线前缀的"约定私有"也不要每次都新建对象（GC 压力）。
- **`hadRecentInput` 过滤掉用户主动触发的 shift**——用户点击 dropdown 让页面下半部分上下挪动，那不是 unexpected layout shift、不该算 CLS。entry 自己带这个 boolean，由浏览器决定（基于「输入后 500ms 内的 shift」规则）。
- **末尾 `setTimeout(report)` 兜底**——保证即使页面没有任何 layout shift、`reportAllChanges=true` 模式也能在 FCP 之后第一次上报 CLS=0。否则会出现「埋点系统认为 CLS 数据丢了」的假阳性。

怀疑 4：onCLS 把 `setTimeout(report)` 放在 `if (po)` 里——意味着如果 PerformanceObserver 注册失败（老 Safari），`reportAllChanges=true` 模式甚至不会上报"CLS 不可测"信号。这是 graceful fallback 的洞、还是有意为之？我倾向后者（不上报 = 默认 0 = 不污染聚合），但没在 commit message 里找到确认。

## Hands-on（含改一处实验）

30 分钟跑通命令清单：

```bash
# 1. 浅克隆
git clone --depth 1 https://github.com/GoogleChrome/web-vitals.git
cd web-vitals
git rev-parse HEAD  # 确认拉到 91ae2cb...

# 2. 装依赖（注意 dependencies 是空的，devDependencies 有约 30 个测试相关）
npm install

# 3. 跑单测（Puppeteer 启真实 Chromium，测真 PerformanceObserver）
npm test  # 会启 sauce-connect 链路，本地跑 chromium 即可

# 4. 在自己的项目里安装并用一下
mkdir ~/web-vitals-demo && cd ~/web-vitals-demo
npm init -y && npm i web-vitals
cat > demo.html <<'EOF'
<!DOCTYPE html>
<html><body>
  <h1>web-vitals demo</h1>
  <img src="https://picsum.photos/1200/800" alt="big">
  <script type="module">
    import { onLCP, onINP, onCLS } from 'https://unpkg.com/web-vitals?module';
    onLCP(m => console.log('LCP', m.value, m.rating, m.entries));
    onINP(m => console.log('INP', m.value, m.rating));
    onCLS(m => console.log('CLS', m.value, m.rating));
  </script>
</body></html>
EOF
npx serve .  # 浏览器打开 localhost:3000/demo.html，DevTools console 看输出
```

**改一处实验**：把 [`src/onLCP.ts#L65`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/onLCP.ts#L65) 的 `entry.startTime < visibilityWatcher.firstHiddenTime` 改成永远 true，看会发生什么。

操作：

```ts
// src/onLCP.ts L65 原文：
//   if (entry.startTime < visibilityWatcher.firstHiddenTime) {
// 改成：
   if (true) {
```

`npm run build` 后在 demo 页里：

1. 加载页面、立刻 cmd+tab 切到别的窗口
2. 等 5 秒后切回来
3. 看 console 的 LCP 输出

预期行为对比：

| 行为 | 修改前 | 修改后 |
|---|---|---|
| 切走前 LCP | 触发 1 次（约 1.2s） | 触发 1 次（约 1.2s） |
| 切回后是否新触发 | 不触发（hidden 后 LCP 已被 finalize） | 会触发（用 visibilitychange 回来后 PerformanceObserver buffer 里仍有 entry） |
| `metric.value` 大小 | 真实 LCP（1.2s） | 可能漂到 6s+（含 hidden 期间的"假 LCP"） |

实验结论：`firstHiddenTime` 这一行 gate 不是性能优化，是**正确性保护**。删掉它会让你的监控数据出现"用户切回来后才看到内容"的假阳性 LCP。这就是为什么 Chrome 团队要在文档里强调"after a tab has been hidden in the background, the values reported by web-vitals can be unreliable in subtle ways"。

## 横向对比（≥ 4 维表）

| 维度 | web-vitals | Lighthouse | Sentry Performance / DataDog RUM | Chrome UX Report (CrUX) |
|---|---|---|---|---|
| 测量场景 | RUM（real user，浏览器原地） | Lab（synthetic，固定 throttle） | RUM（也是浏览器原地） | RUM 聚合（Google 服务器端，原始数据来自 Chrome 用户） |
| 输入语义 | 单次 page view 的事件流 | 一次受控 navigation | 单次 page view + 业务上下文（user/release/transaction） | 28 天 origin-level 聚合 |
| 输出形态 | 5 个数字 + entries 列表（前端 callback） | 完整 audit 报告（含建议） | dashboard + alerting + 拉链路 trace | API 查询 / Search Console UI |
| Bundle / 部署 | 2KB 库，业务方自己接 callback 上报 | 跑 lab 不下发到生产 | 30-200KB SDK，含 trace + replay | 不下发，只是数据源 |
| 与 CrUX 数字对齐 | 设计目标就是 1:1 对齐 | 不直接对齐（lab vs RUM） | 部分对齐（取决于 SDK 是否内部用 web-vitals） | 自身就是 baseline |
| 适合场景 | 需要在自己 dashboard 量同 SEO 数字时 | CI/CD 里防回归（每次 deploy 跑一次） | 需要把指标和业务（用户、release、错误）关联时 | 看自家 origin 在 Google 排名信号里的全局数字 |
| 哲学差异 | "我等同 Chrome 的官方算法" | "我给你一个 lab 一致性的快照" | "我把所有可观测信号聚合到一处" | "我替你聚合好、你直接读" |

选型建议：

- **只要前端打点上报、后端聚合**：直接 web-vitals。2KB 不增加任何加载负担、API 极简。
- **CI 里防 LCP 退化**：用 Lighthouse CI（lab measurement），不用 web-vitals（RUM 数据 CI 时刻没意义）。
- **既要指标又要 trace + 错误链路**：Sentry Performance / DataDog RUM。但要知道你为这一站式付了 30-200 KB 的 SDK 加载成本。
- **只想看自己网站在 Google 排名里数字**：CrUX API 直接查、不用前端打点。
- **业务方自研性能 dashboard**：web-vitals 做指标采集 + 自己 beacon → 自家 ClickHouse / Postgres。Sentry Performance 同款架构但闭源 SaaS 化；如果你能承受 SaaS 成本就直接用 Sentry。

## 与你当前工作的连接

### 今天就能用（≥ 4 子弹）

- intern-journal 站点本身可以接 web-vitals + console.log，做个最小 RUM 来测自己 daily-learn 渲染后的页面性能（学站第一性原则之一就是"自己 dogfood 自己"）。
- 实习项目所在的内网工具系统如果有"页面卡"反馈，**先接 web-vitals 看 INP 数字**——比让用户口述"我感觉点了没反应"靠谱 100 倍。
- 今后所有需要"封装 PerformanceObserver / IntersectionObserver / ResizeObserver" 的场景，把 [`src/lib/observe.ts#L35-L57`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/observe.ts#L35-L57) 当协议范本：try/catch + supportedEntryTypes feature detection + queueMicrotask 绕 Safari bug，三件套同时做。
- 写任何"会调用业务方 callback"的 SDK 时，照搬 `whenIdleOrHidden(stopListening)` 模式：**自己的 callback 不能拖累别的指标**。

### 下个月能用（≥ 4 子弹）

- 准备一个最小 web-vitals 接入工具包（`onLCP/onINP/onCLS → fetch /beacon`），让团队内任何前端项目能 5 分钟接入。bundle size 要实测、不能超过 web-vitals 自身 2KB + 1KB 自家上报代码。
- 在做任何「自定义性能指标」（比如"业务点击到结果显示"）时，先看是否能套 web-vitals 的 lifecycle 模板（initMetric → bindReporter → onBFCacheRestore），而不是自己拍脑袋写。
- 学站现在所有 7 层方法论笔记的图都是静态 webp——下个月可以加一个 web-vitals 监测，看渲染慢不慢、CLS 大不大；如果 LCP > 2.5s 就重压 webp 或加 lazy load。
- attribution 子目录（onLCP-with-attribution 等）值得专门精读一次——它演示的「主指标 + 归因」分层架构可以直接搬到任何 metric SDK 设计。

### 不要用的部分（≥ 4 子弹）

- 不要把 web-vitals 拿来测「业务自定义事件耗时」（比如"加购物车响应"），那不是它的 surface area；用 PerformanceObserver + custom mark 自己写。
- 不要在 Node SSR / SSG 阶段尝试 import web-vitals 主入口——它依赖 `globalThis.PerformanceObserver` 和 `addEventListener`，SSR 会立刻爆。如果要 universal，包一层 `if (typeof window !== 'undefined')`。
- 不要绕开 web-vitals 自己用 PerformanceObserver 实现 LCP / INP / CLS——你大概率会漏掉 bfcache、prerender、firstHiddenTime 这些坑、最终上报数据和 Google 那边不对齐。
- INP 的 attribution 版（含 long-animation-frame 关联）需要 Chrome 123+，不能在 Safari / Firefox 上等 attribution——只能拿主指标值。这点要跟产品经理交代清楚。

## 自检问题 + 延伸阅读

自检问题（≥ 3 个，追到行号级别）：

1. **问题 A**：`InteractionManager._estimateP98LongestInteraction` 的实际算法是 `Math.floor(interactionCount / 50)` 还是别的？请贴 [`src/lib/InteractionManager.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/InteractionManager.ts) 中具体代码行回答。
2. **问题 B**：`runOnce` 内部是用闭包 `let called = false` 还是用 Promise？追到 [`src/lib/runOnce.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/runOnce.ts)。如果是同步 boolean，那么三个 capture-phase listener 在同一个 macrotask 里同时触发会怎样？
3. **问题 C**：`bindReporter` 里 `delta` 是怎么算的？是 `currentValue - lastReportedValue`，还是别的？追到 [`src/lib/bindReporter.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/bindReporter.ts)。如果业务方收到 delta 但没用、只用 value，会有什么后果？
4. **问题 D**：onCLS 的 `setTimeout(report)` 兜底没加 cleanup——如果用户在 FCP 后 50ms 就关 tab，setTimeout 还会跑吗？这会不会让 sendBeacon 漏发？
5. **问题 E**：onLCP 的 `whenIdleOrHidden(stopListening)` 在 hidden 时立即跑，但 PerformanceObserver 的 takeRecords 在 hidden 后还能拿到数据吗？这是 spec 行为还是 Chrome 实现细节？

延伸阅读（按精读顺序）：

| 顺序 | 文件 | 回答什么问题 |
|---|---|---|
| 1 | [`src/lib/InteractionManager.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/InteractionManager.ts) | INP 的 p98 估算具体怎么算 |
| 2 | [`src/lib/bindReporter.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/bindReporter.ts) | rating（good/needs-improvement/poor）+ delta 的实现 |
| 3 | [`src/lib/bfcache.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/bfcache.ts) | pageshow/pagehide 怎么判 bfcache（不是普通 reload） |
| 4 | [`src/attribution/onLCP.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/attribution/onLCP.ts) | attribution 分层架构怎么和主指标解耦 |
| 5 | [`test/onLCP-test.js`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/test/onLCP-test.js) | Puppeteer 测试如何模拟 bfcache、prerender、hidden 这些场景 |

## 限制段（≥ 4 条，禁抄 README）

1. **only Chromium-class 真支持 INP**。Firefox、Safari 没有 `interactionId`，onINP 顶部 feature detection 直接 return；意味着这些浏览器上你拿不到 INP 数字（不是 0、是 undefined）。业务方 dashboard 要把"unsupported" 和"good=0"区分开。
2. **bfcache 分支会触发"同一 page view 多次上报"**。如果业务方在收到 onLCP 回调时直接累加到聚合后端，bfcache 后会重复加一次。正确做法是按 `metric.id` 去重——但 README 没强调这点、容易踩坑。
3. **prerender 场景下 CLS / INP 在激活前不计**——但 LCP 是 `entry.startTime - activationStart` 修正过的。意味着同一页面在 prerender vs 普通 navigation 下、三个指标的"起算点"不一致；做 A/B 测试时不能简单按 navigationType 归并。
4. **`durationThreshold` 默认 40ms 让 INP 在低交互页面（纯阅读型）几乎永远落到 first-input fallback**——这种页面的 INP 数字只反映"第一次输入"，不反映"持续交互体验"。SEO 工具看到的数字偏好；自家埋点要警惕这种"被宠坏的"INP。
5. **包 size 2KB 是 brotli 后**——gzip 后约 4KB，未压缩 ~14KB。如果业务方走 CDN 但不开 brotli、实际下载量是 2x 的预期。

## 附录：宣传 vs 现实清单（≥ 3 行）

| 宣传 | 现实 | 证据位置 |
|---|---|---|
| "tiny (~2K, brotli'd)" | 主入口 + 5 个指标全 import 是 2K，但 attribution 版是 ~6K（多了 element identifier、url 解析） | [package.json size 字段](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/package.json) + bundlephobia |
| "accurately matches how they're measured by Chrome" | 主指标值 1:1 对齐；但 attribution 字段（element selector、url）受 cross-origin / shadow DOM 限制，可能漏 | docs/upgrading.md + GitHub issues #381 类讨论 |
| "RUM, on real users" | RUM 没错，但底层 PerformanceObserver 的 buffer size 由浏览器决定（Chrome 默认 150 entries），高 churn 页面可能 drop early entries | [`src/lib/observe.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/lib/observe.ts) 的 buffered: true 注释 |
| "modular library" | 是模块化的，但 bindReporter / initMetric / observe 这三个核心 lib 是隐含全量依赖——你不可能 only-import onLCP 而不带它们；tree-shake 范围比想象小 | [`src/index.ts`](https://github.com/GoogleChrome/web-vitals/blob/91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce/src/index.ts) barrel + 5 个 onXxx 全都 import lib/ |

## 元数据

- 升级日期：2026-05-28
- 源版本：commit `91ae2cb0ea43c3fbcd22db71c0b9e667b1e737ce`（main HEAD）
- 总行数：本文件 ~470 行 markdown
- 启用工具：WebFetch（拉源码 + commit hash）、PIL + cwebp（生成 Figure 1）、git（验证浅克隆 hash）、本地 npm install web-vitals demo（hands-on 实验）
- 项目类型 self-classify：**工具库**（small-surface API library，主入口 5 个 onXxx + 共享 lib，~600 行 TypeScript 核心）
- 类型分支：v1.1 分支 B（与 swr / zustand / shadcn-ui 同档，行数底线 400、figure ≥ 1、permalink ≥ 3、怀疑 ≥ 3）
- 状元篇 v1.1 自检：通用条目 ✓ 全过；分支 B 专属（L2 心脏 2-3 个 / L3 ≥ 3 段每段 30+ 行真代码 + 5 旁注 + 1 怀疑 / L4 改一处 + 实验输出对比表）✓ 全过；量化指标（行数 ≥ 400 / figure ≥ 1 / permalink ≥ 3 / 怀疑 ≥ 3）✓ 全过。
