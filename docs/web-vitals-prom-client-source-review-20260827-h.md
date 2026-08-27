# Client metrics source review (writer H)

> 用途：记录 web-vitals、prom-client 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL H
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与类型/测试阅读
- not executed：未安装两仓依赖，未运行上游 test、e2e、bundle、PerformanceObserver 或 Prometheus scrape，未做吞吐/延迟/体积测量
- worktrees：本机 `research-worktrees/`，不进入 Git

## web-vitals

- canonical source：`https://github.com/GoogleChrome/web-vitals`
- revision：`582ee7450ca5c60a947edbfd95ad53e135ca5dde`
- package / release：`web-vitals@6.2.1`（annotated tag `v6.2.1` 解引用；npm `gitHead` 与该提交一致）
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/onLCP.ts`、`src/onINP.ts`、`src/onCLS.ts`、`src/onFCP.ts`、`src/onTTFB.ts`
  - `src/lib/observe.ts`
  - `src/lib/bindReporter.ts`
  - `src/lib/initMetric.ts`
  - `src/lib/bfcache.ts`
  - `src/lib/whenActivated.ts`
  - `src/lib/getVisibilityWatcher.ts`
  - `src/lib/LayoutShiftManager.ts`
  - `src/lib/InteractionManager.ts`
  - `src/lib/softNavs.ts`
  - `src/types/base.ts`
  - `src/attribution/index.ts`
  - `CHANGELOG.md`、`docs/upgrading-to-v6.md`
- observed：
  - 公开入口只导出 `onCLS` / `onFCP` / `onINP` / `onLCP` / `onTTFB` 与对应 thresholds；`onFID` 已不在该 revision 的公开 API；
  - `observe()` 接受 entry type 数组，按 `supportedEntryTypes` 过滤，默认 `buffered: true`，回调包在 `queueMicrotask` 里，多类型时按 `startTime + duration` 排序；
  - LCP 相对 `activationStart` 取 `max(startTime - activationStart, 0)`，且要求 renderTime 早于 `firstHiddenTime`；默认在可信 `keydown` / `click` / `visibilitychange` 上 finalize；
  - INP 要求 `PerformanceEventTiming.prototype.interactionId`；默认 `durationThreshold=40`；`InteractionManager` 只保留至多 10 个最长 interaction，用 `floor(interactionCount / 50)` 取估计 p98；
  - CLS 先等 `onFCP` 才开始累计，session window 为 1s 间隔 / 5s 跨度，忽略 `hadRecentInput`；
  - soft navigation 为 opt-in：`reportSoftNavs` 且浏览器同时支持 `soft-navigation` entry 与 `getLargestInteractionContentfulPaint()`；
  - attribution 走独立导出 `web-vitals/attribution`；运行时 `dependencies` 为空。
- provenance note：
  - GitHub annotated tag `v6.2.1` 解引用到 `582ee745...`，与 npm `web-vitals@6.2.1` 的 `gitHead` 一致；
  - 旧正文的 `onFID`、单类型 `observe(type)`、`Promise.resolve().then` 微任务、固定 2KB / v4.0 年表在该 revision 已过时，已由上述观察替换。

## prom-client

- canonical source：`https://github.com/siimon/prom-client`
- revision：`c1d76c5d497ef803f6bd90c56c713c3fa811c3e0`
- package / release：`prom-client@15.1.3`（annotated tag `v15.1.3` 解引用；npm `gitHead` 与该提交一致）
- inspected：
  - `package.json`
  - `index.js`、`index.d.ts`
  - `lib/metric.js`
  - `lib/counter.js`、`lib/gauge.js`、`lib/histogram.js`、`lib/summary.js`
  - `lib/registry.js`
  - `lib/cluster.js`
  - `lib/defaultMetrics.js`
  - `lib/metrics/processCpuTotal.js`
  - `lib/timeWindowQuantiles.js`
  - `lib/pushgateway.js`
  - `example/cluster.js`、`example/server.js`
  - `CHANGELOG.md`
- observed：
  - 四种 metric 类为 Counter / Gauge / Histogram / Summary；构造必须有 `name` 与 `help`，默认注册到 `Registry.globalRegistry`，同名重复注册抛错；
  - 默认 exposition 是 Prometheus text `0.0.4`；OpenMetrics `1.0.0` 需改 Registry content type；exemplar 只允许 OpenMetrics registry；
  - Counter 禁止负增量；Histogram 默认 11 个 bucket（`0.005`…`10`），`findBound` 线性扫描后只给命中桶 `+= 1`，导出时再累加成 cumulative 并补 `+Inf` / `_sum` / `_count`；
  - Summary 用 `tdigest` 的滑动窗口分位；默认百分位 `[0.01, 0.05, 0.5, 0.9, 0.95, 0.99, 0.999]`；
  - `Registry.metrics()` 对所有 metric `Promise.all` 后再拼 `# HELP` / `# TYPE`；
  - `AggregatorRegistry` 只走 Node `cluster` IPC（`prom-client:getMetricsReq/Res`），超时 5s；监听器在构造函数里安装，worker 也必须构造该类才会应答；该 revision 没有 `worker_threads` 聚合入口；
  - `collectDefaultMetrics()` 立即注册默认采集器，数值在 scrape/`metrics()` 时由 `collect()` 更新；`process_cpu_*` 的 exemplar 会读 `@opentelemetry/api` 当前 span；
  - `engines` 为 `^16 || ^18 || >=20`；运行时依赖为 `@opentelemetry/api` 与 `tdigest`。
- provenance note：
  - GitHub annotated tag `v15.1.3` 解引用到 `c1d76c5d...`，与 npm `prom-client@15.1.3` 的 `gitHead` 一致；
  - 旧正文的“零运行时依赖”“v15 支持 worker_threads 聚合”“hot path 只做 `entry.value += 1`”在该 revision 不成立，已由上述观察替换。
