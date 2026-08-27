---
title: prom-client — Node 进程内的 Prometheus 指标客户端
来源: https://github.com/siimon/prom-client
日期: 2026-05-30
分类: 可观测
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/siimon/prom-client
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c1d76c5d497ef803f6bd90c56c713c3fa811c3e0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 15.1.3
---

## 是什么

prom-client 是 Node.js 里把进程内数字暴露给 Prometheus 的客户端。日常类比：厨房只在黑板上用正字记“又出了一盘”，巡查员来了才把整块板誊成报表。

你写：

```js
const client = require('prom-client');
const requests = new client.Counter({
  name: 'http_requests_total',
  help: '请求总数',
});
requests.inc();
```

Prometheus 来抓时，调用 `await client.register.metrics()`，Registry 才把内存里的 Counter / Gauge / Histogram / Summary 序列化成文本。库不绑定 Express / Fastify；`/metrics` 路由要自己挂。

## 为什么重要

不理解 prom-client，下面这些事都没法解释：

- 为什么 Node 监控示例几乎都 `require('prom-client')`，却还要自己写 scrape handler
- 为什么拉取模型能把 IO 从业务 hot path 拿走
- 为什么 cluster 下只 `listen` 在 worker 上时，p99 会漂
- 为什么“零依赖、只做 `+= 1`”已经不是 15.1.3 的事实

## 核心要点

固定 15.1.3 可以拆成五步：

1. **四种类型**：Counter 只增；Gauge 可 `set` / `inc` / `dec`；Histogram 按预设 bucket 观察；Summary 在进程内用 tdigest 算分位。构造必须有 `name` 与 `help`，默认登记到 `Registry.globalRegistry`。

2. **写路径改哈希表**：`counter.inc(labels, value)` 先 `hashObject` + `validateLabel`，再 `hashMap[hash].value += value`。负增量直接抛错。Histogram 对默认 11 个上界做线性 `findBound`，只给命中桶 `+= 1`，导出时再累加成 cumulative。

3. **读路径才拼字符串**：`Registry.metrics()` 对全部 metric `Promise.all`，再输出 `# HELP` / `# TYPE`。默认 content type 是 Prometheus text `0.0.4`；OpenMetrics 要改 Registry。

4. **默认指标按 scrape 采集**：`collectDefaultMetrics()` 立刻注册采集器；CPU / 堆 / 事件循环等数字在 `metrics()` / `collect()` 时更新，不是另起一个业务 interval。

5. **cluster 才聚合**：`AggregatorRegistry.clusterMetrics()` 给每个 connected worker 发 IPC，5 秒超时后 `sum`（可改 `min` / `max` / `average` / `first` / `omit`）。该 revision 没有 `worker_threads` 聚合入口。

## 实践示例

### 案例 1：Express 上 Counter + Histogram

```js
const express = require('express');
const client = require('prom-client');

const reqs = new client.Counter({
  name: 'http_requests_total',
  help: '总请求数',
  labelNames: ['method', 'status'],
});
const lat = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: '请求耗时',
  labelNames: ['method'],
});

const app = express();
app.use((req, res, next) => {
  const end = lat.startTimer({method: req.method});
  res.on('finish', () => {
    reqs.inc({method: req.method, status: String(res.statusCode)});
    end();
  });
  next();
});
app.get('/metrics', async (_req, res) => {
  res.type(client.register.contentType);
  res.send(await client.register.metrics());
});
```

label 只用有限枚举。`startTimer` 内部是 `process.hrtime()`，观察值以秒写入 Histogram。

### 案例 2：队列的 Gauge + Counter

```js
const inFlight = new client.Gauge({name: 'queue_inflight', help: '在跑任务数'});
const done = new client.Counter({
  name: 'queue_done_total',
  help: '完成数',
  labelNames: ['result'],
});

async function consume(job) {
  inFlight.inc();
  try {
    await handle(job);
    done.inc({result: 'ok'});
  } catch {
    done.inc({result: 'fail'});
  } finally {
    inFlight.dec();
  }
}
```

Gauge 看此刻堵不堵，Counter 看累计吞吐。两者不能互相替代。

### 案例 3：cluster 聚合要两边都构造 AggregatorRegistry

```js
const cluster = require('cluster');
const client = require('prom-client');
const aggregator = new client.AggregatorRegistry();

if (cluster.isPrimary) {
  for (let i = 0; i < 4; i++) cluster.fork();
  require('http').createServer(async (_req, res) => {
    res.setHeader('Content-Type', aggregator.contentType);
    res.end(await aggregator.clusterMetrics());
  }).listen(3001);
} else {
  new client.Counter({name: 'worker_jobs_total', help: '任务数'}).inc();
}
```

官方 `example/cluster.js` 把 `new AggregatorRegistry()` 放在 `isMaster` 判断之前，让 worker 重跑同一入口时也安装 `process.on('message')`。只在主进程 new、worker 只 new Counter，主进程会等到 5 秒超时。

## 踩过的坑

1. **高基数 label**：`user_id` / 完整 `req.path` 会按值复制 time series。label 只放 method / status / 有限 route。

2. **默认 Histogram 桶到 10 秒**：默认 `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`。秒级离线任务会堆进导出时的 `+Inf`。用 `linearBuckets` / `exponentialBuckets` 另设。

3. **worker 没装 IPC 监听**：`addListeners()` 只在 `AggregatorRegistry` 构造函数里调用。该 revision 不聚合 `worker_threads`。

4. **hot path 里 `new Counter`**：同名重复 `registerMetric` 会抛错。metric 必须在模块顶层建一次。

5. **把默认输出当成 OpenMetrics**：默认是 Prometheus `0.0.4`。exemplar 还要求 OpenMetrics registry，否则构造期抛 TypeError。

## 适用 vs 不适用场景

**适用**：

- 已用 Prometheus 拉取模型的 Node 服务
- 需要 Counter / Gauge / Histogram / Summary 这四种进程内账本
- `cluster` 多进程要把 worker 数字合成一份 scrape

**不适用**：

- 非 Prometheus 生态的推送 agent → 用对应 SDK；`Pushgateway` 只补短任务
- 要 traces / logs / metrics 统一管道 → 这是 metric client，不是完整 OTel SDK
- Node 10/12/14 → `engines` 是 `^16 || ^18 || >=20`
- 需要线程级聚合 → 固定 15.1.3 没有 `worker_threads` 入口

## 固定版本边界

- 本文绑定 `siimon/prom-client@c1d76c5d...`，tag 与 package 均为 `15.1.3`。
- 运行时依赖是 `@opentelemetry/api`（默认 CPU 指标的 exemplar 读当前 span）和 `tdigest`（Summary）。
- 默认聚合器是 `sum`；`clusterMetrics()` 超时 5 秒。
- 本文未安装依赖、未 scrape、未跑 Jest / cluster 示例，状态保持 `UNVERIFIED`。

## 学到什么

1. **指标是有限分类的数，不是日志**——hot path 改哈希表，scrape 才负责文本与 IO。
2. **“只 += 1”是教学简化**——真实写路径还有 label hash、校验和 Histogram 分桶。
3. **拉取模型把网络责任交给抓取方**——client 可以不连 Prometheus。
4. **多进程聚合是显式协议**——要构造 `AggregatorRegistry`、约定 IPC 消息名，不能指望 worker 自动汇总。

## 应用型自测

1. `counter.inc(-1)` 在固定 15.1.3 会怎样？
2. 只在 `cluster.isPrimary` 里 `new AggregatorRegistry()`，worker 只 `new Counter()`。`clusterMetrics()` 默认会怎样？
3. 新建 Histogram 后 `observe(12)`（秒）。默认桶里哪一个会被 `+= 1`？导出时 `+Inf` 是什么？

检查点：

1. 抛错：Counter 不能减少。
2. worker 没有 IPC 监听，主进程约 5 秒后超时。
3. 12 > 10，没有有限桶被命中；`+Inf` 等于该 label 组合的 `count`。

## 延伸阅读

- 固定源码：[siimon/prom-client](https://github.com/siimon/prom-client) —— 本文绑定提交 `c1d76c5d497ef803f6bd90c56c713c3fa811c3e0`
- 上游类型：[Prometheus Metric Types](https://prometheus.io/docs/concepts/metric_types/)
- 文本格式：[OpenMetrics](https://openmetrics.io/)（需显式切换 Registry content type）
- [[grafana]] —— scrape 之后的可视化层
- [[express]] —— 最常见的手写 `/metrics` 宿主

## 关联

- [[grafana]] —— Prometheus 抓到的数据最终在这里画图
- [[express]] —— 常见 Web 宿主；本库不内置中间件
- [[fastify]] —— 社区 plugin 常包一层本库
- [[nginx]] —— 拉取链路上常见的反代，exporter 思路同类
- [[redis]] —— 连接池 / 命中率常用本库暴露
- [[kafka]] —— Node 客户端常自带 prom-client 集成

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
