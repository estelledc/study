---
title: Grafana Tempo — 用对象存储装下你所有的 trace
来源: https://grafana.com/docs/tempo/latest/
日期: 2026-05-31
子分类: 基础设施
分类: 基础设施
难度: 中级
---

## 是什么

Tempo 是一个**分布式追踪后端**——专门负责"接收、存储、查询" trace 数据。日常类比：像快递公司的"包裹追踪系统"，你下单后能查到这个包裹经过了哪些中转站、每站停了多久、最后是哪一站把它弄丢的。

在软件世界里，一次用户请求会经过 N 个服务（前端 → API 网关 → 订单 → 库存 → 支付 → 数据库）。Tempo 把每段经过都记下来，串成一条 trace，让你在出问题时能精确定位是哪一步慢、哪一步错。

Tempo 最关键的设计选择：**只用对象存储（S3 / GCS / Azure Blob）**。这让它的存储成本比 Jaeger + Cassandra 低 10-100 倍。

## 为什么重要

trace 数据有个尴尬特性：**写入量极大，读取频率极低**。一个中等规模的电商一天产生 TB 级 trace，但工程师真正去查的可能只有出问题那几条。

老一代方案（Jaeger + Cassandra / Elasticsearch）把所有 trace 都放进可全文搜索的数据库。结果是：

- 存储贵（Cassandra 集群一年几十万）
- 运维重（要专人维护数据库）
- 90% 的存储钱花在没人会读的数据上

Tempo 反过来思考：**大多数时候你不会"凭空搜 trace"，你是从一条报错日志或一个慢指标点过去的**。所以 trace ID 直查就够了，不用做全文索引——丢到 S3 就行。

这个思路和 Loki 对日志、Prometheus 对指标是一脉相承的：**先用便宜的方式存下来，再用 ID 索引精准查询**。三件套（Grafana / Loki / Tempo / Prometheus）合起来叫 LGTM 栈。

## 核心要点

### 数据流：写入路径

```
应用 → OTel Collector → Distributor → Kafka → Ingester → 对象存储
                              ↓
                          按 trace ID 分片
```

1. **Distributor**：入口。接受 Jaeger / Zipkin / OpenTelemetry 三种协议，按 trace ID 哈希决定送给哪个 Ingester
2. **Ingester**（新版拆成 Live-Store + Block-Builder）：在内存攒最近 30 分钟的 trace，到时间打包成 block 写到对象存储
3. **Compactor**：后台进程，定期把小 block 合并成大 block、去重、应用保留期（默认 14 天）

### 数据流：查询路径

```
Grafana → Query-Frontend → 多个 Querier → Ingester（最近 30min）
                                       → 对象存储（历史）
```

1. **Query-Frontend**：把一个大查询切片，分发给多个 Querier 并行处理
2. **Querier**：同时查内存（Ingester）和磁盘（对象存储），合并结果

### TraceQL：查询语言

受 PromQL / LogQL 启发的 span 选择语言：

```traceql
{ service.name = "frontend" && duration > 1s }
```

意思："找所有由 frontend 服务发起、耗时超过 1 秒的 span"。新版还支持从 trace 派生指标（trace metrics），不必再依赖 Metrics-Generator。

### 部署模式

- **monolithic**（单进程跑全部组件）：适合新手 / 小规模 / 自己玩
- **microservices**（每个组件独立部署）：生产推荐，每个组件按负载独立扩缩

## 实践案例

### 案例 1：从指标曲线跳到 trace（Exemplars）

Prometheus 里你看到一个 P99 延迟突刺：

```
http_request_duration_seconds{quantile="0.99"} = 8.3s   <- 异常
```

启用 exemplar 后，这个数据点旁会带一个 trace ID。点进去 Grafana 自动调用 Tempo 把对应 trace 拉出来——你看到的不再是"某时刻某服务慢"，而是"具体那一次请求慢在数据库的哪条 SQL"。

### 案例 2：从日志跳到 trace（Loki Derived Fields）

Loki 里搜到一条报错：

```
2026-05-31 14:22:01 ERROR trace_id=abc123 payment failed
```

配置 Loki Derived Field 把 `trace_id=` 后的值识别成链接，点击直接跳 Tempo。这就是"先在便宜的日志里找异常，再去 trace 看完整调用链"的标准 workflow。

### 案例 3：trace 派生 RED 指标

Metrics-Generator（可选组件）从 trace 流自动算 RED：

- **R**ate：每秒请求数
- **E**rrors：错误率
- **D**uration：延迟分布

写回 Prometheus，省去你手动埋点。

## 踩过的坑

1. **对象存储不能全文搜索**：TraceQL 大查询要扫 block 元数据，时间范围一长就慢。如果你的查询模式是"全文找包含某 tag 的所有 trace"，Tempo 会比 Jaeger + ES 慢很多。

2. **Ingester 内存压力大**：要在内存保留 30 分钟内所有"活 trace"。trace 量翻倍 → 内存翻倍。生产中 Ingester OOM 是最常见的事故。

3. **Compactor 是单点瓶颈**：所有 block 合并都要它做。给的 IOPS 不够，block 越积越多，查询直接拖垮。

4. **保留期改了不立即生效**：保留期是 Compactor 在合并时执行的。改 14 天 → 7 天后，老数据要等下一轮合并才会真删。

## 适用 vs 不适用

**适用**：

- 已经在用 Grafana / Loki / Prometheus，想补齐 trace 这一块
- trace 量大、存储成本敏感（K8s 微服务、电商、广告）
- workflow 是"从日志或指标点过来查 trace"，不是"凭空全文搜"

**不适用**：

- 主用法是按多 tag 全文检索 trace → Jaeger + Elasticsearch 更合适
- trace 量极小（< 1 GB/天）→ Jaeger all-in-one 更简单
- 已深度绑定 Datadog / New Relic 等 SaaS → 没必要换

## 学到什么

1. **trace 是观测三件套的最后一块**：metrics 告诉你"有问题"，logs 告诉你"哪里有问题"，traces 告诉你"问题怎么传播"
2. **存储分层是基础设施的核心 trick**：把"写多读少"的数据扔到 S3，比放进可搜索数据库便宜 10-100 倍
3. **设计选择是会传染的**：Tempo 这个"对象存储 + ID 查询"思路抄自 Loki 对日志、抄自 Prometheus 对指标。一旦你接受了这个范式，工具链就自然形成
4. **强大的查询能力 vs 低存储成本是真权衡**：Tempo 选了后者，用 LGTM 栈的协同（从 metrics/logs 跳过来）补搜索

## 关键事实速查

- **存储后端**：S3 / GCS / Azure Blob / 本地磁盘
- **协议支持**：Jaeger / Zipkin / OpenTelemetry（OTLP gRPC + HTTP）
- **默认保留期**：14 天（`compactor.compaction.block_retention` 调整）
- **block 时间窗口**：默认 5 分钟（trace 攒够 5 分钟打包一次）
- **新版架构**：Kafka 做 write-ahead log，旧版直接 Ingester 内存
- **查询并发**：Query-Frontend 默认把一个查询切成 50 个 shard
- **License**：AGPLv3（注意 SaaS 化场景）

## 第一性原理推导

为什么 Tempo 长成这样？倒推一遍设计逻辑：

1. **观察**：trace 写入量 = QPS × span 数；查询量 ≈ 工程师 / 报警 主动查询次数。前者是后者的 1000 倍以上
2. **结论 1**：写优化优先级远高于读
3. **结论 2**：读路径只需要 trace ID 查询就够（因为读 trace 通常是从别处跳过来的，已经知道 ID）
4. **存储选择**：写多 + ID 查 + 历史不可变 = 对象存储完美匹配
5. **架构反推**：Ingester 缓内存（覆盖最近）+ Compactor 整理（覆盖历史）+ Query 双查（兜底）

这个推导不是只 Tempo 独有：Loki 对日志、Prometheus 远程写入对指标，都用同样的"廉价存储 + ID 索引"模式。一旦理解这个范式，再看新工具会快很多。

## 延伸阅读

- 官方架构图：[Tempo Architecture](https://grafana.com/docs/tempo/latest/operations/architecture/)
- TraceQL 教程：[TraceQL by example](https://grafana.com/docs/tempo/latest/traceql/)
- 对比文章：[Tempo vs Jaeger vs Zipkin](https://grafana.com/blog/2020/10/27/grafana-tempo-is-a-new-open-source-distributed-tracing-system/)

## 关联

- [[jaeger]] —— 老一代分布式追踪后端，Tempo 的对照组
- [[prometheus]] —— 同思路的指标后端，exemplars 让指标点直跳 trace
- [[grafana]] —— Tempo 的主要 UI 和数据源接入点
- [[otel-collector]] —— OpenTelemetry 的标准上游，Tempo 用它做接入
