---
title: OpenTelemetry Collector — 可观测性数据的统一中转站
来源: https://opentelemetry.io/docs/collector/
日期: 2026-05-31
子分类: 可观测性
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

OpenTelemetry Collector（简称 **OTel Collector**）是 CNCF OpenTelemetry 项目的官方**数据采集与中转代理**。

日常类比：它是机场的中央分拣中心。你（应用）把行李（trace / metric / log）丢进去，它负责贴标签、合并、走 X 光、再分发到不同的目的地（Jaeger / Prometheus / Datadog / 阿里云 ARMS）。你不用知道每个目的地长什么样，分拣中心替你做完所有适配。

技术定义：**一个用 Go 写的单二进制服务**，做三件事——

1. **收**：接收 OTLP / Jaeger / Zipkin / Prometheus scrape 等多种格式的数据
2. **改**：批处理、过滤、采样、改字段、限流
3. **送**：把数据送到一个或多个后端（可以同一份数据扇出到 5 家）

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

2. **Processor（改）**：数据穿过时做处理。常见的有 `batch`（攒批再发，省网络）、`memory_limiter`（内存压力时主动丢，防 OOM）、`attributes`（改/加字段）、`tail_sampling`（看完整条 trace 再决定要不要采样）。

3. **Exporter（送）**：往后端送。OTLP / Jaeger / Prometheus / Loki / Kafka / Datadog / 各家 SaaS 都是 exporter。

4. **Extension（旁支）**：不在数据流里的辅助组件，如 `health_check`（健康检查）/ `pprof`（性能 profile）/ `zpages`（调试 UI）。

把它们串起来的是 **Pipeline**：traces / metrics / logs 三条独立流水线，每条都是 `receivers → processors → exporters` 的形状。

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger]
```

## 实践案例

### 案例 1：替代经典『Jaeger agent + Prometheus』组合

老方案：应用埋 Jaeger client + Prometheus client，两个 SDK，两套埋点。

新方案：应用只发 **OTLP** 给本机 Collector，Collector 配两个 exporter——`otlp/jaeger`（送 Jaeger 后端）+ `prometheus`（暴露为 Prometheus scrape 端点）。

**好处**：应用代码减一半，未来要加 Loki 或 Datadog，只改 Collector。

### 案例 2：gateway 模式做 tail_sampling 省 90% 存储

agent 模式：每节点一个 Collector，与应用同 pod。
gateway 模式：独立集群（3-10 个 Collector 实例），收所有 agent 转发上来的数据。

`tail_sampling` processor **只能在 gateway 模式跑**——它要看一条 trace 的全部 span 再决定采不采样。规则示例：错误链路 100% 留、慢请求（> 1s）100% 留、其余按 1% 抽样。

实际效果：后端存储从 1TB/天降到 80GB/天，关键链路一条不丢。

### 案例 3：多租户云的路由分流

SaaS 厂商给每个租户一条 pipeline：

```yaml
processors:
  attributes/tenant_a:
    actions: [{key: tenant, value: A, action: insert}]
exporters:
  otlp/tenant_a_backend: {...}
  otlp/tenant_b_backend: {...}
```

数据进来时按 header 分流，打租户标签，送到对应租户的后端。一个 Collector 服务全部租户。

## 踩过的坑

1. **`memory_limiter` 必须放 pipeline 第一个**——它在内存压力下会主动丢数据保命。放后面就来不及了，整个进程 OOM 你连日志都拿不到。

2. **忘配 `batch` processor**：每个 span 立刻发出去，exporter QPS 飙升，下游被打挂。永远要把 `batch` 放在 exporter 之前。

3. **`tail_sampling` 不能在 agent 模式做**——agent 只看到本节点的 span，看不全一条 trace。新人常配错。

4. **core vs contrib 发行版混用**：写了 contrib 的组件名（如 `loadbalancing` exporter），用 core 二进制启动会报『unknown component』。两个发行版别混。

5. **Prometheus receiver 是 pull，OTLP receiver 是 push**——前者是 Collector 主动去 scrape 应用；后者是应用主动推。语义反了，配置就错。

6. **配置改了不重启不生效**：Collector 不像 nginx 有 reload 命令，改 YAML 必须重启进程。Kubernetes 部署可借 ConfigMap + rolling restart；裸机要用 systemd 或外层 supervisor 重新拉起。

## 适用 vs 不适用场景

**适用**：

- 微服务架构，需要统一 trace / metric / log 入口
- 多后端共存（自建 Jaeger + 云厂商 Datadog 同时要喂）
- 需要做 tail_sampling、字段脱敏、限流等中间处理
- 想把应用代码与具体后端解耦

**不适用**：

- 单体应用、单进程——直接 print 日志就够
- 极致低延迟场景（金融交易撮合）——Collector 自己有几毫秒处理开销
- 只有一种信号且后端固定（比如只用 Prometheus）——直接 Prometheus client 更轻
- 移动端 / 浏览器端——Collector 是服务端组件，端上要走 OTLP HTTP 直连或专用 SDK

## 历史与定位

- **2019 年**：OpenTracing（追踪标准，Uber/Lyft 系）+ OpenCensus（指标 + 追踪，Google 系）合并成 OpenTelemetry，结束多年标准战
- **2020 年**：Collector 1.0 发布，core 与 contrib 分仓——核心组件官方维护，第三方厂商集成进 contrib
- **2021 年**：Collector 进入 CNCF 孵化器，与 Jaeger / Prometheus 同台
- **2022 年**：traces 信号 GA（生产可用），开始替代 Jaeger agent
- **2023 年**：metrics / logs 信号 GA，三合一统一管道正式落地
- **2024 年起**：成为云厂商默认 telemetry 入口（AWS Distro for OTel / Google Cloud Ops Agent / Azure Monitor 都基于它定制）

## 学到什么

1. **可观测性的标准抽象在 CNCF 收敛了**——以前是 Jaeger 一套、Prometheus 一套、Fluentd 一套，现在一根管子吃三类数据
2. **解耦应用与后端**是 Collector 的最大价值——这是基础设施抽象的经典模式（类比 [[envoy]] 解耦应用与服务网络）
3. **agent + gateway 两层部署**是大规模可观测性的标配：agent 做就近收，gateway 做集中处理
4. **YAML 配置 + 可插拔组件**让运维不写代码就能改管道——这是云原生工具链的统一范式
5. **三类信号合并的代价**：traces/metrics/logs 模型差异很大，统一抽象意味着每类都要做一些妥协；理解这种"统一带来的取舍"对设计 API 平台很有用

## 延伸阅读

- 官方文档：[OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)（先读 Architecture 章）
- GitHub core：[opentelemetry-collector](https://github.com/open-telemetry/opentelemetry-collector)
- GitHub contrib：[opentelemetry-collector-contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib)（100+ 第三方组件）
- [[jaeger]] —— Collector 的经典 trace 后端
- [[prometheus]] —— Collector 既消费它的 scrape 又能 remote_write 到它
- [[grafana]] —— 配 Loki/Tempo/Mimir 接收 Collector 的输出做统一展示

## 关联

- [[jaeger]] —— 分布式追踪后端，Collector 用 OTLP exporter 喂数据进去
- [[prometheus]] —— 指标系统，可双向（pull/push）与 Collector 协作
- [[grafana]] —— 可视化层，消费 Collector 路由出去的多类数据
- [[envoy]] —— 服务网格代理，与 Collector 是同一思路（解耦应用与基础设施）的不同切面
- [[ansible]] —— VM 场景下部署 Collector 的常见编排方式
