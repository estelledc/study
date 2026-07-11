---
title: OpenTelemetry Collector — 可观测性数据的统一中转站
来源: https://opentelemetry.io/docs/collector/
日期: 2026-05-31
分类: 基础设施 / 可观测性
难度: 中级
---

## 是什么

OpenTelemetry Collector（简称 **OTel Collector**）是 CNCF OpenTelemetry 项目的官方**数据采集与中转代理**。

日常类比：它是机场的中央分拣中心。你（应用）把行李（trace / metric / log）丢进去，它负责贴标签、合并、走 X 光、再分发到不同的目的地（Jaeger / Prometheus / Datadog / 阿里云 ARMS）。你不用知道每个目的地长什么样，分拣中心替你做完所有适配。

技术定义：**一个用 Go 写的单二进制服务**，做三件事——

1. **收**：接收 OTLP / Jaeger / Zipkin / Prometheus scrape 等多种格式的数据
2. **改**：批处理、过滤、采样、改字段、限流
3. **送**：把数据送到一个或多个后端（可以同一份数据扇出到多家）

## 为什么重要

四个理由：

- **解决"全链路黑洞"**——一次请求穿过 N 个服务，没采集源头就排不了错。Collector 是 trace/metric/log 的统一入口
- **解决厂商锁定**——应用代码只发 OTLP，换后端只改 Collector 配置；从 Datadog 切到自建栈，应用零改动
- **CNCF 事实标准**——把 Jaeger agent / Prometheus scrape / Fluentd 的活儿合并到一个进程里
- **三合一统一管道**——traces / metrics / logs 一套架构、一套配置、一套部署

不理解 Collector，写微服务时就会把每个应用直接耦合到具体后端，换后端等于全公司改代码。

## 核心要点

Collector 的架构可以拆成 **四类组件 + 一根管子**：

1. **Receiver（收）**：接收数据的入口。OTLP（gRPC/HTTP）/ Jaeger / Zipkin / Prometheus scrape / Kafka / syslog 都是 receiver。

2. **Processor（改）**：数据穿过时做处理。常见的有 `batch`（攒批再发）、`memory_limiter`（内存压力时主动丢，防 OOM）、`attributes`（改/加字段）、`tail_sampling`（看完整条 trace 再决定采不采样）。

3. **Exporter（送）**：往后端送。OTLP / Jaeger / Prometheus / Loki / Kafka / Datadog / 各家 SaaS 都是 exporter。

4. **Extension（旁支）**：不在数据流里的辅助组件，如 `health_check` / `pprof` / `zpages`。

把它们串起来的是 **Pipeline**：traces / metrics / logs 三条独立流水线，每条都是 `receivers → processors → exporters`。

## 实践案例

### 案例 1：本机 Collector 替代双 SDK

应用只发 OTLP；Collector 同时喂 Jaeger 与 Prometheus：

```yaml
receivers:
  otlp:
    protocols: { grpc: { endpoint: 0.0.0.0:4317 } }
processors:
  memory_limiter: { check_interval: 1s, limit_mib: 512 }
  batch: { timeout: 200ms }
exporters:
  otlp/jaeger: { endpoint: jaeger:4317, tls: { insecure: true } }
  prometheus: { endpoint: 0.0.0.0:8889 }
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

逐部分：`otlp` 收应用数据 → `memory_limiter` 保命 → `batch` 攒批 → 双 exporter 扇出。以后加 Loki 只改 YAML。

### 案例 2：gateway + tail_sampling 省存储

agent（每节点）只做就近收转发；gateway（独立集群）看完整 trace 再采样：

```yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow
        type: latency
        latency: { threshold_ms: 1000 }
      - name: probabilistic
        type: probabilistic
        probabilistic: { sampling_percentage: 1 }
```

规则：错误与慢请求全留，其余约 1%。`tail_sampling` 必须在能看到整条 trace 的 gateway 上跑，agent 模式看不全 span。

### 案例 3：按租户打标签再分流

```yaml
processors:
  attributes/tenant_a:
    actions: [{ key: tenant, value: A, action: insert }]
exporters:
  otlp/tenant_a: { endpoint: backend-a:4317, tls: { insecure: true } }
  otlp/tenant_b: { endpoint: backend-b:4317, tls: { insecure: true } }
```

数据进 gateway 后按 header/属性分流，打租户标签，送到对应后端。一个 Collector 服务多租户。

## 踩过的坑

1. **`memory_limiter` 必须放 pipeline 第一个**——放后面就来不及，进程 OOM 时连日志都拿不到。
2. **忘配 `batch`**：每个 span 立刻发出，网络 QPS 飙升，下游被打挂。
3. **`tail_sampling` 不能在 agent 模式做**——agent 只看到本节点 span。
4. **core vs contrib 混用**：写了 contrib 组件名却用 core 二进制，启动报 unknown component。
5. **Prometheus receiver 是 pull，OTLP 是 push**——语义反了配置就错。
6. **改 YAML 必须重启**：Collector 没有 nginx 式 reload；K8s 用 ConfigMap + rolling restart。

## 适用 vs 不适用场景

**适用**：

- 微服务，需要统一 trace / metric / log 入口
- 多后端共存（自建 Jaeger + 云厂商同时要喂）
- 需要 tail_sampling、字段脱敏、限流等中间处理
- 想把应用代码与具体后端解耦

**不适用**：

- 单体、单进程——直接打日志就够
- 极致低延迟路径（撮合核心）——Collector 有毫秒级开销
- 只有一种信号且后端固定——直接客户端更轻
- 移动端 / 浏览器——端上走 OTLP HTTP 或专用 SDK，Collector 是服务端组件

## 历史小故事（可跳过）

- **2019 年**：OpenTracing + OpenCensus 合并为 OpenTelemetry，结束标准分裂
- **2021 年 8 月**：OpenTelemetry 进入 CNCF 孵化；同年 Collector tracing 组件达到稳定里程碑（约 0.36 线）
- **2022 年末**：Collector 模块化推进，pdata 等进入 1.0 RC；traces 管道已广泛替代 Jaeger agent
- **2023 年起**：metrics / logs 信号与管道继续成熟，三合一部署成主流
- **2024 年起**：云厂商默认 telemetry 入口多基于 Collector 定制（AWS ADOT / Google Ops Agent / Azure Monitor 等）

## 学到什么

1. **可观测性抽象在 CNCF 收敛了**——以前 Jaeger / Prometheus / Fluentd 各一套，现在一根管子吃三类数据
2. **解耦应用与后端**是最大价值——类比 [[envoy]] 解耦应用与服务网络
3. **agent + gateway 两层**是大规模标配：就近收 + 集中处理
4. **YAML + 可插拔组件**让运维不写代码改管道
5. **统一有代价**：三类信号模型不同，统一抽象意味着各自妥协

## 延伸阅读

- 官方文档：[OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)（先读 Architecture）
- GitHub core：[opentelemetry-collector](https://github.com/open-telemetry/opentelemetry-collector)
- GitHub contrib：[opentelemetry-collector-contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib)
- [[jaeger]] —— 经典 trace 后端
- [[prometheus]] —— 既可 scrape 也可被 remote_write
- [[grafana]] —— Loki/Tempo/Mimir 常接 Collector 输出

## 关联

- [[jaeger]] —— 分布式追踪后端，Collector 用 OTLP exporter 喂数据
- [[prometheus]] —— 指标系统，可双向与 Collector 协作
- [[grafana]] —— 可视化层，消费 Collector 路由出去的数据
- [[envoy]] —— 同一「解耦应用与基础设施」思路的网络切面
- [[ansible]] —— VM 场景部署 Collector 的常见编排方式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[grafana-tempo]] —— Grafana Tempo — 用对象存储装下你所有的 trace
- [[opentelemetry]] —— OpenTelemetry — 让所有应用用同一种语言吐监控数据
- [[opentelemetry-collector]] —— opentelemetry-collector — OTel 官方核心仓库与组件模型
- [[tempo]] —— Tempo — 把分布式追踪扔进 S3 的开源后端
- [[vector]] —— Vector — Rust 写的统一可观测性数据管道
