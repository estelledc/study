---
title: Grafana Tempo — 用对象存储装下你所有的 trace
来源: https://grafana.com/docs/tempo/latest/
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

Tempo 是一个**分布式追踪后端**——专门负责"接收、存储、查询" trace 数据。日常类比：像快递公司的"包裹追踪系统"，你下单后能查到这个包裹经过了哪些中转站、每站停了多久、最后是哪一站把它弄丢的。

在软件世界里，一次用户请求会经过 N 个服务（前端 → API 网关 → 订单 → 库存 → 支付 → 数据库）。Tempo 把每段经过都记下来，串成一条 trace，让你在出问题时能精确定位是哪一步慢、哪一步错。

Tempo 最关键的设计选择：**只用对象存储（S3 / GCS / Azure Blob）**。官方与社区常见口径是：相对 Jaeger + Cassandra 这类可搜索后端，存储成本常能低一个数量级（宣传里偶见 10–100×，视采样率与保留期而定）。

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
2. **Ingester**（新版拆成 Live-Store + Block-Builder）：head block 默认最长约 30 分钟（`max_block_duration`）再切块上传；单条活 trace 的内存窗口更短（秒级 idle/live）
3. **Compactor**：后台进程，定期把小 block 合并成大 block、去重、应用保留期（默认 14 天）

### 数据流：查询路径

```
Grafana → Query-Frontend → 多个 Querier → Ingester（最近未刷盘）
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

**逐部分解释**：

- 指标点旁的 exemplar 会附带 `trace_id`（应用在埋点时写入）。
- Grafana 把该 ID 交给 Tempo 数据源做直查，而不是全文搜。
- 你看到的不再是"某时刻某服务慢"，而是"那一次请求慢在哪条 SQL"。

### 案例 2：从日志跳到 trace（Loki Derived Fields）

Loki 里搜到一条报错：

```
2026-05-31 14:22:01 ERROR trace_id=abc123 payment failed
```

Loki datasource 里可加 Derived Field（示意）：

```yaml
regex: 'trace_id=(\\w+)'
url: '/explore?left={"datasource":"Tempo","queries":[{"query":"${__value.raw}"}]}'
```

**逐部分解释**：

- 正则抽出日志里的 `trace_id`。
- Grafana 把它渲染成可点链接，跳到 Tempo。
- workflow 是"先在便宜日志里找异常，再看完整调用链"。

### 案例 3：trace 派生 RED 指标

Metrics-Generator（可选）从 trace 流自动算 RED：Rate / Errors / Duration，写回 Prometheus。

**逐部分解释**：

- 打开 generator 后，不必为每个 span 再手写一套 RED 埋点。
- 适合"已经有 trace、想补服务级概览"的团队。
- 若你主要靠 TraceQL metrics，可不部署旧版 generator。

## 踩过的坑

1. **对象存储不能全文搜索**：TraceQL 大查询要扫 block 元数据，时间范围一长就慢。如果你的查询模式是"全文找包含某 tag 的所有 trace"，Tempo 会比 Jaeger + ES 慢很多。
2. **Ingester / Live-Store 内存压力大**：head block 窗口内的活数据都在内存。trace 量翻倍 → 内存翻倍。生产中 OOM 是最常见事故之一。
3. **Compactor 易成瓶颈（经典 microservices）**：合并与保留期都靠它；IOPS 不够时 block 堆积、查询变慢。新版架构组件名有演进，但"整理路径跟不上写入"仍是同类坑。
4. **保留期改了不立即生效**：保留期在合并时执行。改 14 天 → 7 天后，老数据要等下一轮合并才会真删。

## 适用 vs 不适用

**适用**：

- 已经在用 Grafana / Loki / Prometheus，想补齐 trace 这一块
- trace 量大、存储成本敏感（K8s 微服务、电商、广告）
- workflow 是"从日志或指标点过来查 trace"，不是"凭空全文搜"

**不适用**：

- 主用法是按多 tag 全文检索 trace → Jaeger + Elasticsearch 更合适
- trace 量极小（< 1 GB/天）→ Jaeger all-in-one 更简单
- 已深度绑定 Datadog / New Relic 等 SaaS → 没必要换

## 历史小故事（可跳过）

- **2020 年**：Grafana Labs 发布 Tempo，对标"对象存储上的 trace"，与 Loki 同一设计哲学。
- **2021–2023 年**：TraceQL、Exemplars、Metrics-Generator 陆续补齐，LGTM 栈成型。
- **2024–2026 年**：写入路径走向 Kafka + Live-Store / Block-Builder，Ingester 角色被拆分演进。

## 学到什么

1. **trace 是观测三件套的最后一块**：metrics 告诉你"有问题"，logs 告诉你"哪里有问题"，traces 告诉你"问题怎么传播"
2. **存储分层是基础设施的核心 trick**：把"写多读少"的数据扔到 S3，通常比可搜索数据库便宜一个数量级以上
3. **设计选择是会传染的**：Tempo 的"对象存储 + ID 查询"抄自 Loki / Prometheus 思路；接受范式后工具链自然成套
4. **查询能力 vs 存储成本是真权衡**：Tempo 选后者，用从 metrics/logs 跳转补搜索

## 关键事实速查

- **存储后端**：S3 / GCS / Azure Blob / 本地磁盘
- **协议支持**：Jaeger / Zipkin / OpenTelemetry（OTLP gRPC + HTTP）
- **默认保留期**：14 天（`compactor.compaction.block_retention` 调整）
- **head block 切块**：`max_block_duration` 默认约 30 分钟（不是单条 trace 存活 30 分钟）
- **新版架构**：Kafka 做 write-ahead log；Live-Store / Block-Builder 承接原 Ingester
- **License**：AGPLv3（注意 SaaS 化场景）

## 延伸阅读

- 官方架构图：[Tempo Architecture](https://grafana.com/docs/tempo/latest/operations/architecture/)
- TraceQL 教程：[TraceQL by example](https://grafana.com/docs/tempo/latest/traceql/)
- 对比文章：[Tempo vs Jaeger vs Zipkin](https://grafana.com/blog/2020/10/27/grafana-tempo-is-a-new-open-source-distributed-tracing-system/)

## 关联

- [[jaeger]] —— 老一代分布式追踪后端，Tempo 的对照组
- [[prometheus]] —— 同思路的指标后端，exemplars 让指标点直跳 trace
- [[grafana]] —— Tempo 的主要 UI 和数据源接入点
- [[otel-collector]] —— OpenTelemetry 的标准上游，Tempo 用它做接入

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[loki]] —— Loki — 给日志做 Prometheus，只索引标签不索引内容
- [[opentelemetry-collector]] —— opentelemetry-collector — OTel 官方核心仓库与组件模型
- [[signoz]] —— SigNoz — 自托管的 OpenTelemetry 一体化可观测平台
