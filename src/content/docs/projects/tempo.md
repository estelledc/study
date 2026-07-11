---
title: Tempo — 把分布式追踪扔进 S3 的开源后端
来源: https://github.com/grafana/tempo
日期: 2026-06-01
分类: 基础设施
难度: 中级
---

## 是什么

Tempo 是 Grafana Labs 开源的**分布式追踪后端**——专门接收、存储、查询 trace 的服务。日常类比：一座只写不删的"快递包裹存档库"。每天有海量包裹（span，一次函数/RPC 调用的计时片段）涌进来，工程师只在出问题那十几次去翻。Tempo 的核心赌注：**与其用昂贵的"全文搜索仓库"放所有包裹，不如全扔进便宜的对象存储（S3/GCS/Azure Blob），只留一份按 trace ID（运单号）找件的索引**。

这个思路和 Loki 对日志、Mimir 对指标一脉相承：先用便宜方式存下来，再用 ID 精准取件。

仓库地址 `github.com/grafana/tempo`，约 5k star，Go 写的，AGPLv3 协议。2020 年开源，2021 年 1.0 GA；仍由 Grafana Labs 主导维护，**不是** CNCF 托管项目。

## 为什么重要

不理解 Tempo，下面几件事都解释不通：

- 为什么 LGTM 栈（Loki / Grafana / Tempo / Mimir）能把观测成本压到接近对象存储价位
- 为什么把 TB 级 trace 塞进 Cassandra / Elasticsearch 会一年白烧几十万运维费
- 为什么多数排障不是"凭空全文搜 trace"，而是从一条报错日志或一个慢指标点过去
- 为什么 Grafana 用户学 TraceQL 几乎零成本——语法风格抄自 PromQL / LogQL

## 核心要点

### 仓库长什么样

- `cmd/tempo/` —— 主入口二进制
- `modules/` —— distributor / ingester / compactor / frontend / querier / generator
- `tempodb/` —— 存储抽象层（S3 / GCS / Azure / 本地盘统一接口）
- `pkg/traceql/` —— TraceQL 解析器与执行器

### 三条设计思想

1. **对象存储优先**：像把包裹全堆进廉价冷库，只留运单号索引——不建全文倒排。

2. **写入与查询两条路**：

```
写入：应用 → OTel Collector → Distributor → Ingester → 对象存储
查询：Grafana → Query-Frontend → Querier → 内存(近) + 对象存储(远)
```

Distributor 按 trace ID 哈希分片，收 Jaeger / Zipkin / OTLP（OpenTelemetry 协议）；Ingester 内存攒约 30 分钟活 trace 再打成 block；Compactor 后台合并小 block、去重、执行保留期。

3. **TraceQL**：`{ service.name = "frontend" && duration > 1s }` —— 找 frontend 上耗时超过 1 秒的 span。部署可选 monolithic（单进程试玩）或 microservices（生产按负载扩缩）。

## 实践案例

### 案例 1：本地三件套跑起来

```bash
docker compose -f example/docker-compose/local/docker-compose.yaml up
# 浏览器打开 Grafana :3000 → Explore → 选 Tempo
# TraceQL：{ duration > 100ms }
```

**逐步解释**：

1. compose 拉起 Tempo + Grafana + 示例应用
2. 给示例应用发几条请求，产生 span
3. 在 Explore 用 TraceQL 按耗时过滤，确认写入与查询通路通

### 案例 2：从 Loki 报错日志跳到 trace

Loki 里搜到 `ERROR trace_id=abc123 payment failed`。在 Grafana 给 Loki 配 Derived Field（从日志文本抽出字段做成可点链接）：

1. 正则匹配 `trace_id=(\w+)`
2. 目标数据源选 Tempo，URL 用捕获组填 trace ID
3. 保存后，日志行里的 ID 变成可点链接，一点即打开完整调用链

标准 workflow：**先在便宜的日志找异常，再去 trace 看传播路径**。

### 案例 3：从 Prometheus 突刺跳到 trace

启用 exemplar（指标数据点旁挂的 trace ID 样例）后，P99 延迟突刺旁会带一个 ID。Grafana 一点即可调 Tempo 拉出那次请求，定位慢在哪条 SQL，而不是只知道"某服务某时刻慢"。可选组件 Metrics-Generator 还能从 trace 流自动算 RED（Rate / Errors / Duration）写回 Prometheus。

## 怎么开始读这个项目

零基础读 Go 项目，建议路径：

1. 先跑案例 1 的 compose，在 Grafana 里看到 trace
2. 回头读 `cmd/tempo/main.go`，看启动逻辑怎么把各 module 串起来
3. 挑 `modules/distributor/distributor.go` 细读——入口最浅
4. 真想贡献，先看 `CONTRIBUTING.md` 和 `good first issue`

## 踩过的坑

1. **对象存储不能全文搜索**：大 TraceQL 要扫 block 元数据，时间范围一长就慢；查询模式若是"按任意 tag 海搜所有 trace"，Jaeger + ES 更合适
2. **Ingester 内存压力大**：要在内存保留约 30 分钟内所有活 trace；量翻倍 → 内存翻倍，生产里 Ingester OOM 最常见
3. **Compactor 单点瓶颈**：小 block 合并、去重、执行保留期都靠它；IOPS 不够则 block 堆积、查询拖垮
4. **保留期改了不立即生效**：默认约 14 天（`compactor.compaction.block_retention`）；改短后要等 Compactor 下一轮合并才真删

## 适用 vs 不适用

**适用**：

- 已用 Grafana / Loki / Prometheus，想补齐 trace
- trace 量大、存储成本敏感（K8s 微服务 / 电商 / 广告）
- workflow 是"从日志或指标点过来查"，不是凭空全文搜

**不适用**：

- 主用法是按多 tag 全文检索 → Jaeger + Elasticsearch
- trace 量极小（< 1 GB/天）→ Jaeger all-in-one 更简单
- 已深度绑定 Datadog / New Relic 等 SaaS → 没必要换

## 历史小故事（可跳过）

- **2020-10**：Grafana ObservabilityCON 宣布 Tempo，对标"像 Loki 存日志那样用对象存储存 trace"
- **2021-06**：1.0 GA，主打低依赖 + 按 trace ID 查询
- **2022–2023**：Tempo 2.0 默认 Apache Parquet block 格式，正式推出 TraceQL
- **之后**：Metrics-Generator、Kafka WAL 写入加固等能力陆续补齐；项目仍留在 Grafana Labs 名下（AGPL），未捐赠 CNCF

## 学到什么

1. **写多读少的数据适合廉价对象存储 + ID 索引**，不是默认可搜索数据库
2. **观测三件套分工**：metrics 告诉你有问题，logs 告诉你哪里有问题，traces 告诉你问题怎么传播
3. **强大查询 vs 低存储成本是真权衡**：Tempo 选了后者，靠 LGTM 生态协同补搜索入口
4. **设计选择会传染**：同一范式贯穿 Loki（日志）/ Tempo（追踪）/ Mimir（指标）

## 关键事实速查

- **存储后端**：S3 / GCS / Azure Blob / 本地磁盘
- **协议支持**：Jaeger / Zipkin / OpenTelemetry（OTLP gRPC + HTTP）
- **默认保留期**：约 14 天（`compactor.compaction.block_retention`）
- **block 时间窗口**：默认约 5 分钟
- **新版写入**：可选 Kafka 做 write-ahead log（WAL，断电不丢的预写日志）；旧版直接 Ingester 内存
- **查询并发**：Query-Frontend 默认把一个查询切成约 50 个 shard
- **License**：AGPLv3（SaaS 化场景需注意 copyleft）
- **治理**：Grafana Labs 主导，非 CNCF 项目
- **主要语言**：Go（约 95%）+ 少量 shell / Makefile / Jsonnet

## 延伸阅读

- [Tempo Architecture](https://grafana.com/docs/tempo/latest/operations/architecture/)——官方架构图
- [TraceQL by example](https://grafana.com/docs/tempo/latest/traceql/)——查询语言教程
- [GitHub: grafana/tempo](https://github.com/grafana/tempo)——源码与 CONTRIBUTING
- 视频：[Get started with Tempo — Joe Elliott](https://www.youtube.com/watch?v=zDrA7Ly3ovU)

## 关联

- [[jaeger]] —— 老一代分布式追踪后端，Tempo 的全文检索对照组
- [[prometheus]] —— exemplar 让指标点直跳 Tempo
- [[grafana]] —— Tempo 的主要 UI 和数据源接入点
- [[otel-collector]] —— OpenTelemetry 标准上游，Tempo 用它做接入
- [[loki]] —— 同思路的日志后端，Derived Field 跳转搭档

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
