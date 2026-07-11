---
title: prom-client — Node 服务暴露监控指标的事实标准 SDK
来源: 'https://github.com/siimon/prom-client'
日期: 2026-05-30
分类: projects
难度: 初级
---

## 是什么

prom-client 是 Node.js 项目里**给监控系统暴露指标**的客户端 SDK，全名是 `siimon/prom-client`。日常类比：像餐厅门口贴的那张当日营业数据看板——客流量、平均等位时间、出菜速度——你（主厨）只管在心里记一个数字（"今天又来了一桌"就给计数 +1），到下班盘点时一次性写到看板上，外面来巡查的人扫一眼就走。

写 Node 服务时你做的事是：

```js
const client = require('prom-client')
const requests = new client.Counter({ name: 'http_requests_total', help: '请求总数' })
requests.inc()  // 每次请求 +1，就这么简单
```

到 Prometheus 来抓取（默认每 15 秒一次）时，prom-client 把内存里的所有数字一次性序列化成 OpenMetrics 文本格式从 `/metrics` 端点返回。**主线程只做数字加法，不拼字符串、不写文件、不发网络请求**。

## 为什么重要

不理解 prom-client，下面这些事都没法解释：

- 为什么几乎所有主流 Node 框架（Express / Fastify / Koa / Nest）的监控示例都默认 import 这一个包
- 为什么 Prometheus 模型敢用「拉取」而不是「推送」——背后必须有这种零成本累加的 client SDK
- 为什么生产 Node 服务能在 10k QPS 下还能开 metric——它们的 hot path 真的只是改一个 number
- 为什么 cluster 模式下 `/metrics` 经常只显示某个 worker 的数据——AggregatorRegistry 没接对

## 核心要点

prom-client 的设计可以拆成 **三步**：

1. **四种数学类型**：所有指标抽象成 Counter（单调递增，比如请求数）/ Gauge（任意瞬时值，比如队列长度）/ Histogram（预设 bucket 的延迟分布）/ Summary（本地算的百分位）。类比：四种不同的小账本，每种只擅长记一类数。选错类型比少埋点还难排查——比如 Counter 不能减、Gauge 不能算 p99。

2. **主线程零字符串**：`counter.inc()` 在 hot path 上的真实工作就是 `entry.value += 1`，找一下 label 对应的 entry 然后改一个 number。**没有 string 拼接、没有 IO、没有 lock**——这是 prom-client 速度的全部秘密。Histogram 略复杂一些：先线性扫一遍 bucket 边界（默认只 11 个，比二分还快），命中后给那个 bucket 自增。

3. **scrape 时才序列化**：Prometheus 来拉数据时，Registry 用 `Promise.all` 并发遍历所有 metric，把 `# HELP` / `# TYPE` 头 + 数据行拼成一段 OpenMetrics 文本一次性返回。慢一点也没关系，业务请求不在这条 stack 上。这个「写时只改 number、读时才拼字符串」是整个项目最重要的 trade-off。

## 实践案例

### 案例 1：Express 路由埋点 — Counter + Histogram

```js
const express = require('express')
const client = require('prom-client')

const reqs = new client.Counter({
  name: 'http_requests_total', help: '总请求数',
  labelNames: ['method', 'status']  // 有限枚举，别用 req.path
})
const lat = new client.Histogram({
  name: 'http_latency_seconds', help: '延迟', labelNames: ['method']
})

const app = express()
app.use((req, res, next) => {
  const end = lat.startTimer({ method: req.method })
  res.on('finish', () => {
    reqs.inc({ method: req.method, status: String(res.statusCode) })
    end()
  })
  next()
})
app.get('/metrics', async (_, res) => res.type('text/plain').send(await client.register.metrics()))
```

**逐步解释**：label 只用 `method` / `status` 这类有限枚举（GET/POST、200/404），**不要**把 `req.path` 当 label——那会按 URL 爆炸出 time series（见踩坑 #1）。`startTimer` 返回闭包，`finish` 时 `end()` 写入 Histogram；Counter 单独 `inc`。hot path 仍是闭包 + 一次 `+=`。

### 案例 2：队列消费者 — Gauge + Counter 配对

```js
const inFlight = new client.Gauge({ name: 'queue_inflight', help: '在跑任务数' })
const done     = new client.Counter({ name: 'queue_done_total', help: '完成数', labelNames: ['result'] })

async function consume(job) {
  inFlight.inc()
  try { await handle(job); done.inc({ result: 'ok' }) }
  catch (e) { done.inc({ result: 'fail' }) }
  finally { inFlight.dec() }
}
```

Gauge 跟踪「此刻还有多少任务在跑」（瞬时值），Counter 累计「累计跑了多少」。**两个不同维度**：Gauge 看现在是不是堵了，Counter 看吞吐 RPS。

### 案例 3：cluster 模式 — AggregatorRegistry

```js
const cluster = require('cluster')
const client = require('prom-client')

if (cluster.isPrimary) {
  for (let i = 0; i < 4; i++) cluster.fork()
  const aggregator = new client.AggregatorRegistry()
  require('http').createServer(async (_, res) => {
    res.end(await aggregator.clusterMetrics())
  }).listen(3000)
} else {
  new client.Counter({ name: 'worker_jobs_total', help: '任务数' }).inc()
}
```

主进程用 `AggregatorRegistry.clusterMetrics()` 给所有 worker 发 IPC 请求拉数据再 sum/max 聚合。**没接 AggregatorRegistry**：每次 scrape 命中谁谁的数据出来，p99 就乱了。

## 踩过的坑

1. **高基数 label**：把 `user_id` 当 label 会让每个用户产生一行 time series，10 万用户瞬间爆 Registry 内存。Label 只放有限枚举值（route / status_code / method）。

2. **Histogram bucket 用默认值**：默认 11 个 bucket 顶到 10 秒，量 RPC 几百毫秒延迟刚好；但量秒级离线任务会全堆 `+Inf` 看不出分布。要自定义 `exponentialBuckets`。

3. **cluster 模式忘记 AggregatorRegistry**：4 worker 各自跑，`/metrics` 走哪个 worker 就只看到那个 worker 数据，p99 / 总和都是错的。生产事故第一名。

4. **hot path 里 new Counter**：每次请求 `new client.Counter(...)` 会重复注册同名 metric，要么报错要么内存泄漏。**一定要 module 顶层 new 一次**复用。

## 适用 vs 不适用场景

**适用**：
- 已经在用 Prometheus + Grafana 做监控的 Node 服务（拉取模型）
- 需要秒级精度的 latency / 错误率告警
- cluster / worker_threads 多进程 Node 服务
- 短任务 / 批处理通过 pushgateway 推送（prom-client 自带 push 模式）

**不适用**：
- 非 Prometheus 生态的推送监控（StatsD / Datadog agent）→ 用对应 SDK；本库主路径是拉取，pushgateway 只覆盖批任务补洞
- 需要 trace / log / metric 三件套统一 → 用 OpenTelemetry SDK，prom-client 只管 metric
- 极小内存场景（< 50MB heap） → Registry + 4 个 metric class 也要点常驻内存

## 历史小故事（可跳过）

- **2012-2015 年**：Prometheus 在 SoundCloud 内部诞生，2015 年开源。Go 端 client_golang 是官方第一方实现。
- **2015 年前后**：siimon（社区开发者）开始把 client_golang 的设计迁到 Node。早期版本只支持 Counter + Gauge，Histogram / Summary 是后来补的。
- **2018 年 v11**：加入 cluster 聚合（`AggregatorRegistry`），解决多 worker 模式下 metric 分裂问题。
- **2024 年 v15**：支持 OpenMetrics 输出格式 + worker_threads 模式聚合，与 Go 端 client 功能对齐。
- 至今：~3.5k★，零运行时依赖，每月 npm 下载量上千万。Node 监控的事实标准。

整个项目从首版到 v15 用了将近 10 年，**核心 API 几乎没变**——`new Counter({ name, help }).inc()` 这一行从 2015 写到今天都能编。这是「surface 小到改不动」的活样本。

## 学到什么

1. **指标不是日志**——指标的本质是有限分类的数值（递增 / 瞬时 / 分桶 / 百分位），主线程只改一个 number 即可
2. **拉取模型让 client 设计极简**——不主动发包，等 Prometheus 来抓，IO 责任全部外包给抓取方
3. **抽象层级要刚好够**——4 个 class 比 OpenTelemetry 的 Resource/Meter/Instrument/View/Aggregation 简单 10 倍，但能覆盖 95% Node 服务的监控需求
4. **小 surface 是工具库的护城河**——5 年没大改 API，因为没什么可改的，每一个新增都要过「真的必须？」的关

## 延伸阅读

- 官方 README：[siimon/prom-client](https://github.com/siimon/prom-client)（含 Counter / Gauge / Histogram / Summary 的最小例子）
- 上游 Prometheus 概念：[Prometheus Metric Types](https://prometheus.io/docs/concepts/metric_types/)（4 种 metric 数学定义）
- OpenMetrics spec：[openmetrics.io](https://openmetrics.io/)（serialize 出来的文本格式标准）
- 视频：[Prometheus monitoring for Node.js](https://www.youtube.com/results?search_query=prometheus+node.js+prom-client)（社区入门讲解）
- [[grafana]] —— 拿到 metrics 后的可视化层
- [[kafka]] —— 同样大量用 prom-client 暴露 broker 客户端指标

## 关联

- [[grafana]] —— Prometheus 抓到的数据最终在 Grafana 画图，prom-client 是数据起点
- [[express]] —— Node 最常见 web 框架，几乎每个 Express 服务都装 prom-client 做埋点
- [[fastify]] —— 高性能替代 Express，官方 plugin `fastify-metrics` 底层就是 prom-client
- [[pino]] —— 同样追求 hot path 零成本的 Node 库，prom-client 之于 metrics 等于 pino 之于 log
- [[nginx]] —— Prometheus 拉取链路上常见的反向代理，nginx exporter 的设计思想和 prom-client 一致
- [[redis]] —— 服务层常监控 Redis 连接池 / 命中率，用 prom-client 暴露
- [[kafka]] —— Node Kafka client 库通常自带 prom-client 集成的 metric

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
