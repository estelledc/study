---
title: Tempo — 把分布式追踪扔进 S3 的开源后端
来源: https://github.com/grafana/tempo
日期: 2026-06-01
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Tempo 是 Grafana Labs 开源的**分布式追踪后端**——专门接收、存储、查询 trace 的服务。日常类比：把它想成一座只写不删的"快递包裹存档库"。每天有几十亿个包裹（span）涌进来，但工程师只在出问题那十几次去翻。Tempo 的核心赌注：**与其用昂贵的"全文搜索仓库"放所有包裹，不如全扔进便宜的对象存储（S3/GCS/Azure Blob），只留一份按 trace ID 找件的索引**。

仓库地址 `github.com/grafana/tempo`，4.5k star，Go 写的，AGPLv3 协议。2020 年开源，2022 年进 CNCF Sandbox。

## 为什么重要

trace 数据有个尴尬特性：**写入量极大，查询频率极低**。一个中等规模电商一天产生 TB 级 trace，工程师真去翻的可能只有出问题那几条。

老一代方案（Jaeger + Cassandra / Elasticsearch）把每条 trace 都丢进可全文搜索的数据库，结果是：

- 存储贵——Cassandra 集群一年几十万
- 运维重——要专人看着数据库
- 90% 的钱花在没人会读的数据上

Tempo 反过来想：**大多数时候你不是凭空搜 trace，你是从一条报错日志或一个慢指标点过去的**。所以"按 trace ID 直接取"就够，不用做全文索引——丢 S3 就行。

这个思路和 Loki 对日志、Mimir 对指标是一脉相承的：先用便宜的方式存下来，再用 ID 索引精准查询。这套四件套合起来叫 **LGTM 栈**（Loki / Grafana / Tempo / Mimir）。理解 Tempo 等于理解 Grafana Labs 整个观测产品线的设计哲学。

## 核心要点

### 仓库长什么样

进 `github.com/grafana/tempo` 一眼能看到几个核心目录：

- `cmd/tempo/` —— 主入口二进制
- `modules/` —— 各组件（distributor / ingester / compactor / frontend / querier / generator）
- `tempodb/` —— 存储抽象层，把 S3 / GCS / Azure / 本地磁盘统一成一个接口
- `pkg/traceql/` —— TraceQL 查询语言的解析器和执行器
- `docs/` —— Markdown 文档（站点 grafana.com/docs/tempo 从这里生成）

### 写入路径

```
应用 → OTel Collector → Distributor → (Kafka WAL) → Ingester → 对象存储
                              按 trace ID 哈希分片
```

1. **Distributor**：接受 Jaeger / Zipkin / OTLP（gRPC + HTTP）三种协议，按 trace ID 哈希决定送哪个 Ingester
2. **Ingester**：内存攒最近 30 分钟的活 trace，到时间打包成 block 写到对象存储
3. **Compactor**：后台进程，把小 block 合并成大 block、去重、应用保留期（默认 14 天）

### 查询路径

```
Grafana → Query-Frontend → 多个 Querier → Ingester（最近 30 min）
                                       → 对象存储（历史）
```

Query-Frontend 把一个大查询切成 N 个 shard 并行发给 Querier。Querier 同时查内存和对象存储，合并结果。

### TraceQL 长这样

```traceql
{ service.name = "frontend" && duration > 1s }
```

意思："找所有由 frontend 服务发起、耗时超过 1 秒的 span"。语法风格抄 PromQL / LogQL，Grafana 用户上手零成本。

### 部署模式

- **monolithic**——一个进程跑全部组件，新手 / 测试环境
- **microservices**——每个组件独立部署，生产推荐，按负载独立扩缩

## 实践案例

### 案例 1：从 Prometheus 指标突刺跳到 trace

启用 exemplar 后，Prometheus 的延迟数据点旁会带一个 trace ID。Grafana 看到 P99 突刺，点一下直接调 Tempo 把对应 trace 拉出来——不再是"某时刻某服务慢"，而是"具体那一次请求慢在哪条 SQL"。

### 案例 2：从 Loki 报错日志跳到 trace

Loki 里搜到 `ERROR trace_id=abc123 payment failed`。配置 Loki Derived Field 把 `trace_id=` 后的值识别成 Tempo 链接，点击直跳完整调用链。这是"先在便宜的日志找异常，再去 trace 看传播路径"的标准 workflow。

### 案例 3：trace 派生 RED 指标

可选组件 Metrics-Generator 从 trace 流自动算 **R**ate / **E**rrors / **D**uration，写回 Prometheus，省去你手动埋点。

## 怎么开始读这个项目

零基础读 Go 项目，建议路径：

1. 先在本地跑 `docker-compose -f example/docker-compose/local/docker-compose.yaml up`，看到三件套（Tempo + Grafana + 一个示例应用）跑起来
2. 给示例应用发请求，在 Grafana 里看到 trace
3. 回头读 `cmd/tempo/main.go`，看启动逻辑怎么把各 module 串起来
4. 挑一个组件细读，比如 `modules/distributor/distributor.go`——入口最浅，逻辑相对简单
5. 真想贡献，先看 `CONTRIBUTING.md` 和 issue tracker 里 `good first issue` label

## 踩过的坑

1. **对象存储不能全文搜索**：TraceQL 大查询要扫 block 元数据，时间范围一长就慢。如果你查询模式是"全文找包含某 tag 的所有 trace"，Tempo 比 Jaeger + ES 慢很多
2. **Ingester 内存压力大**：要在内存保留 30 分钟内所有活 trace。trace 量翻倍 → 内存翻倍。生产里 Ingester OOM 是最常见的事故
3. **Compactor 单点瓶颈**：所有 block 合并都靠它，IOPS 不够 block 越积越多，查询直接拖垮
4. **保留期改了不立即生效**：保留是 Compactor 在合并时执行的。改 14 天 → 7 天后，老数据要等下一轮合并才会真删

## 适用 vs 不适用

**适用**：

- 已用 Grafana / Loki / Prometheus，想补齐 trace 这一块
- trace 量大、存储成本敏感（K8s 微服务 / 电商 / 广告）
- workflow 是"从日志或指标点过来查 trace"，不是凭空全文搜

**不适用**：

- 主用法是按多 tag 全文检索 trace → Jaeger + Elasticsearch 更合适
- trace 量极小（< 1 GB/天）→ Jaeger all-in-one 更简单
- 已深度绑定 Datadog / New Relic 等 SaaS → 没必要换

## 学到什么

1. **trace 是观测三件套的最后一块**：metrics 告诉你"有问题"，logs 告诉你"哪里有问题"，traces 告诉你"问题怎么传播"
2. **存储分层是基础设施的核心 trick**：把"写多读少"的数据扔到 S3，比放进可搜索数据库便宜 10-100 倍
3. **设计选择是会传染的**：Tempo 的"对象存储 + ID 查询"思路抄自 Loki 对日志、Prometheus 对指标。一旦接受这个范式，整个 LGTM 工具链就自然形成
4. **强大查询 vs 低存储成本是真权衡**：Tempo 选了后者，靠生态协同补搜索

## 关键事实速查

- **存储后端**：S3 / GCS / Azure Blob / 本地磁盘
- **协议支持**：Jaeger / Zipkin / OpenTelemetry（OTLP gRPC + HTTP）
- **默认保留期**：14 天（`compactor.compaction.block_retention`）
- **block 时间窗口**：默认 5 分钟
- **新版架构**：Kafka 做 write-ahead log，旧版直接 Ingester 内存
- **查询并发**：Query-Frontend 默认把一个查询切成 50 个 shard
- **License**：AGPLv3（注意 SaaS 化场景）
- **CNCF 状态**：2022 年进 Sandbox，目标毕业到 Incubating
- **主要语言**：Go（约 95%）+ 少量 shell / Makefile / Jsonnet

## 第一性原理推导

为什么 Tempo 长成这样？倒推一遍：

1. **观察事实**：trace 写入量 = QPS × span 数；查询量 ≈ 工程师主动查询次数。前者是后者的上千倍
2. **结论 1**：写优化优先级远高于读
3. **结论 2**：读路径只需要 trace ID 查就够，因为读 trace 通常从别处跳过来时已经知道 ID
4. **存储匹配**：写多 + ID 查 + 历史不可变 = 对象存储完美适配
5. **架构反推**：Ingester 缓内存（覆盖最近）+ Compactor 整理（覆盖历史）+ Querier 双查（兜底合并）

这个推导不只 Tempo 独有：Loki 对日志、Prometheus 远程写入对指标，都用同样的"廉价存储 + ID 索引"模式。一旦理解这个范式，再看新工具会快很多。

## 延伸阅读

- [Tempo Architecture](https://grafana.com/docs/tempo/latest/operations/architecture/)——官方架构图
- [TraceQL by example](https://grafana.com/docs/tempo/latest/traceql/)——查询语言教程
- [GitHub: grafana/tempo](https://github.com/grafana/tempo)——源码、issue、CONTRIBUTING

## 关联

- [[grafana-tempo]] —— 同主题文档站视角的笔记（本文是 GitHub 项目视角）
- [[jaeger]] —— 老一代分布式追踪后端，Tempo 的对照组
- [[prometheus]] —— 同思路的指标后端，exemplar 让指标点直跳 trace
- [[grafana]] —— Tempo 的主要 UI 和数据源接入点
- [[otel-collector]] —— OpenTelemetry 标准上游，Tempo 用它做接入
