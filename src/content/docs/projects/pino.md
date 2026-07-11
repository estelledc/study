---
title: pino — 日志不该阻塞热路径
来源: 'https://github.com/pinojs/pino'
日期: 2026-05-30
分类: projects / Node.js
难度: 中级
---

## 是什么

pino 是一个 **Node.js 的 JSON 日志库**，主打「打日志不能拖慢业务」。日常类比：餐厅里厨师专心炒菜，端盘子、写小票、报账这些事全交给传菜员去做——pino 让主线程只做最快的一步，剩下的丢给另一条线程。

具体到代码，写一句 `logger.info({ user: 1 }, 'login')`，主线程做的事只有两件：

- 把字段拼成一行 NDJSON 字符串（手写 concat，不调 `JSON.stringify` 整段）
- 调一次 `stream.write` 把字节扔出去

真正会慢的事（着色、写文件、发网络、过滤敏感字段后置部分）由 worker thread 异步消化，主线程立刻返回。这是它跟 winston / bunyan 在哲学上的根本差异。

NDJSON 即「每行一个 JSON」的格式：日志收集器（Loki / Elasticsearch / Filebeat）拿到一行就能 parse 一条记录，不需要等流式 JSON parser 的关合括号——这是「结构化日志」生态的事实标准。

## 为什么重要

不理解 pino，下面这些事都没法解释：

- 为什么同一台机器上换个 logger，Node 服务的 P99 延迟能从 80ms 掉到 8ms
- 为什么「打日志」这件小事，能在高 QPS 下变成 CPU 占比第一名
- 为什么 Edge runtime（Cloudflare Workers / Vercel Edge）上 pino 跑不动，得换别的
- 为什么 Fastify 默认日志是 pino 而不是 winston

## 核心要点

pino 把「快」拆成 **三步**：

1. **lsCache 预拼接**：每个 level（trace=10 / debug=20 / info=30 ...）的前缀字符串如 `'{"level":30'` 在 logger 创建时就预先 stringify 好，hot path 直接拿来用，省掉一次 `JSON.stringify`。类比：餐厅常用的辣椒油提前调好，下单时直接舀，不必现切现拌。

2. **setLevel 替换 method**：你设 level=info，pino 把 `logger.debug` 这个属性直接赋成 `noop`（一个空函数）。日后调 `debug()` 没有 if 判断，就是一个空调用——少一个分支。类比：值班表上把今天不来的厨师整行涂掉，叫号系统连看都不看。

3. **transport 进 worker**：通过 `thread-stream` 包用 `SharedArrayBuffer` 做无锁 ring buffer，主线程 write 完立刻返回，worker 那边异步跑用户配置的 targets（写文件、转发 Loki、着色 pretty 输出）。类比：传菜员有自己的传菜口，厨师把菜放上传送带就走，传菜员该送哪桌、走哪条路自己想。

三步合起来：在 M2 Pro / Node 22 上 pino 能跑到约 284 万 ops/sec，winston 约 17 万——大致 16x 关系。

## 实践案例

### 案例 1：替换 console.log 拿到结构化日志

```js
import pino from 'pino'
const log = pino()

log.info({ user: 1 }, 'login')
// {"level":30,"time":1747...,"pid":12345,"hostname":"my-mac","msg":"login","user":1}
```

**逐部分**：`pino()` 不传参数走默认配置，输出到 `process.stdout`，level 默认 info；`log.info(obj, msg)` 第一个参数是合并到 record 的字段，第二个是 msg。这一行就够替代 `console.log`，免费拿到 level / 时间戳 / pid / hostname。

线上把这一行的输出经过 stdout → docker 日志驱动 → Loki / ELK 收集，就是一条最常见的「Node 服务结构化日志」链路。

### 案例 2：child logger 给请求注入 reqId

```js
import pino from 'pino'
const log = pino()

app.use((req, res, next) => {
  req.log = log.child({ reqId: req.headers['x-request-id'] })
  next()
})
```

**逐部分**：`log.child({ ... })` 不是 new 一个 logger，而是基于父 logger 复用 lsCache，把 `reqId` 字段预拼到 `chindings` 字符串里。这条请求里所有 `req.log.info(...)` 都自动带上 reqId，运维 grep 一下就能拼出整条调用链。

`chindings` 是 child 的预拼字符串缓存——重点不是「child 怎么继承字段」，而是「child 不付任何运行时代价」。

### 案例 3：transport 把日志双写文件 + Loki

```js
const log = pino(pino.transport({
  targets: [
    { target: 'pino/file', options: { destination: '/var/log/app.log' } },
    { target: 'pino-loki', options: { host: 'http://loki:3100' } },
  ],
}))
```

**逐部分**：`pino.transport({ targets })` 启动一个 worker thread，worker 内部分发字节到两个 target；主线程对这俩 target 慢不慢一无所知，永远只跟 ring buffer 打交道。一个 worker 多目的地，启停成本只付一次——这跟 winston 一个 transport 一个 IO 句柄是相反的工程取舍。

## 踩过的坑

1. **Edge runtime 不可用**：Cloudflare Workers / Vercel Edge 没有 `worker_threads`，pino 的 transport 模型直接失效，要么换 logger，要么 fallback 到同步 stream（性能优势丢一大半）。

2. **pino-pretty 拖慢吞吐**：开发期常开的 `pino-pretty` 会 parse NDJSON、用 chalk 着色，吞吐降一个数量级——线上要靠下游 Loki / Grafana 做后处理，不要在生产开 pretty。

3. **fatal 不保证落盘**：主进程 `process.exit(1)` 时 worker 里 ring buffer 还没消化的字节会丢——审计 / 合规场景必须走同步路径，pino 自己也建议这样做。

4. **自定义 formatters 走慢路径**：一旦传 `formatters.log` / 自定义 messageKey，hot path 多几个分支，性能从 16x winston 跌到 1.5-2x。pino 的「快」是 happy path 默认配置的快。

## 适用 vs 不适用场景

**适用**：

- Node 后端服务、QPS > 1k、需要结构化 JSON 日志
- 需要 child logger 在请求维度注入字段（reqId / traceId / userId）
- 已有 Fastify / Express / Koa 项目，想 5 分钟换掉 console.log
- 需要把日志同时写到多个目的地，但不想主线程为此付代价

**不适用**：

- Cloudflare Workers / Vercel Edge / Deno（部分版本）—— 没 worker_threads
- AWS Lambda / Cloud Run 短生命周期函数——worker 起停成本反而成负担，直接 stdout 更划算
- 终端 CLI 工具——启动 worker thread 拖慢 cold start，winston 更合适
- 审计 / 合规日志——pino fatal 路径可能丢字节，得单独同步写

## 历史小故事（可跳过）

- **2016 年**：Matteo Collina 发起 pino。当时 Node 生态主流 logger 是 winston（transport-first，主线程跑 format）和 bunyan（NDJSON 但同步写），他的论点是「logger 设计是性能问题，不是 API 问题」。
- **2017 年**：写出第一版 `_asJson` 字符串 fast path，benchmark 比 winston 快 5x，引起社区关注；同年 Fastify 把 pino 设为默认 logger。
- **2018 年**：加 worker thread transport，把 formatting / IO 全搬出主线程，性能差距进一步拉大。
- **2020 年起**：thread-stream 独立成包，sonic-boom（高速文件流）拆出来；生态进化成「pino + N 个 transport 包」。
- **2026 年**：Node.js TSC 成员维护，连续 9 年活跃，每月发版本，GitHub ~17.9k★。名字 `pino` 是意大利语「松树」，作者博文里写过想要「不挡路」的 logger。

## 学到什么

- **性能不是 API 设计的副产品**——pino 把「不能阻塞热路径」当第一公理，所有 API 都向这个公理对齐，反过来推「为什么 winston 慢」的根因
- **预计算 + 字符串拼接 > 通用序列化**：lsCache 这种「每个 level 预 stringify」的小动作撑起 60% 的吞吐，关掉就跌一半
- **赋值替代 if 判断**：setLevel 把不该输出的 method 换成 noop，hot path 上少一个分支也是钱；这是「数据决定行为」的极致简化
- **把慢的事丢到另一条线程**：worker_threads 在 Node 里少有人用得优雅，pino 的 transport 是教科书级实现——业务代码看不到 worker 的存在

## 延伸阅读

- 官方网站：[getpino.io](https://getpino.io/)（API 索引、transports 列表、redaction 教程）
- 仓库：[pinojs/pino](https://github.com/pinojs/pino)（先看 `lib/proto.js` 和 `lib/tools.js`）
- 配套生态：`pino-http`（HTTP 中间件）/ `pino-pretty`（dev 着色）/ `pino-loki`（写 Loki）
- 必读 PR：[pinojs/pino #740](https://github.com/pinojs/pino/pull/740)（worker thread transport 的初始 patch，Collina 在评论里讲清了设计动机）
- 视频：[Matteo Collina — Node.js Logging Best Practices](https://www.youtube.com/results?search_query=matteo+collina+pino)（作者本人讲设计动机）
- 源码精读对象：`thread-stream` 仓库的 `lib/index.js`，看 SharedArrayBuffer ring buffer 怎么写

## 关联

- [[fastify]] —— 默认集成 pino，pino-http 中间件就是为 Fastify 风格设计的
- [[express]] —— 用 pino-http 五分钟替换 morgan / winston，立刻拿到结构化日志
- [[koa]] —— 同上，pino 不绑框架，任何 Node middleware 模型都能挂
- [[kafka]] —— 高吞吐管道下游常配 pino → 文件 → Filebeat → Kafka 的日志收集链路
- [[nginx]] —— 反向代理日志走 nginx，应用层日志走 pino，两边在 Loki / ELK 汇总
- [[grafana]] —— Grafana Loki 是 pino transport 常见目的地，pino-loki 包直连
- [[elasticsearch]] —— ELK 栈下用 pino-elasticsearch transport 直接 ingest

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[prom-client]] —— prom-client — Node 服务暴露监控指标的事实标准 SDK
