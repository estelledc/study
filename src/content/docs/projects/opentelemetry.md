---
title: OpenTelemetry — 让所有应用用同一种语言吐监控数据
来源: OpenTelemetry Specification, https://opentelemetry.io/docs/
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

OpenTelemetry（**OTel**）是一套**让所有应用、所有语言、所有监控厂商用同一种格式说"我现在在干什么"**的开源标准。日常类比：以前每家医院化验单格式都不一样，换医院要重做一遍；OTel 是国际化验单标准，一次抽血到哪都能读。

它解决的具体问题是：

- 你给程序埋了监控代码（"我现在在处理订单 #123"）
- 这堆数据要送到 Datadog / Grafana / Jaeger 之一
- 换个监控厂商，原来全部代码要重写

OTel 把"写埋点"和"数据发到哪"切成两半。代码里调的是 OTel 的 API，发到哪交给配置层处理。

## 为什么重要

不理解 OTel，下面这些事都没法解释：

- 为什么 CNCF（云原生基金会）排活跃度 OTel 排第二，仅次于 Kubernetes
- 为什么现在所有主流 APM 厂商（Datadog / New Relic / Honeycomb / Grafana）都被迫接 OTLP 协议
- 为什么微服务架构里一个请求穿过 5 个服务还能拼回一棵完整调用树
- 为什么 2019 年之前可观测性领域一片混战，2019 年之后开始收敛

## 核心要点

OTel 由 **四件套** 组成：

1. **API**：你在代码里调的接口。`tracer.start_span("query_db")` 之类。API 语言无关、稳定。
2. **SDK**：API 的运行时实现。负责采样、批处理、序列化。可换。
3. **OTLP（OpenTelemetry Protocol）**：把数据从 SDK 送到 Collector 的线协议。gRPC 或 HTTP，protobuf 编码。
4. **Collector**：独立进程，接数据、做处理（过滤 / 加 attribute / 聚合）、转发到后端。

观测信号（**signals**）目前有三大类：

- **Traces（追踪）**：一个请求从入口到出口的完整链路，由多个 **span** 组成树
- **Metrics（指标）**：数字时间序列，比如 QPS、错误率、延迟分布
- **Logs（日志）**：离散事件文本，每条带时间戳和 trace_id

第四类 **profiling**（CPU 采样）2024 年加入。

把三个信号通过同一个 **trace_id** 串起来，就能从"延迟突增"指标点到"哪条 trace 慢"再点到"那条 trace 里某行 log"。

## 实践案例

### 案例 1：一个 span 长什么样

```python
from opentelemetry import trace
tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("fetch_user") as span:
    span.set_attribute("user.id", 42)
    span.set_attribute("db.system", "postgresql")
    user = db.query("SELECT * FROM users WHERE id=42")
    span.set_attribute("db.rows_returned", 1)
```

执行后产生一条 span：

- `name`: `fetch_user`
- `trace_id`: 32 位十六进制（贯穿整条调用链）
- `span_id`: 16 位（这一段的唯一标识）
- `start_time` / `end_time`: 纳秒时间戳
- `attributes`: `{user.id: 42, db.system: "postgresql", db.rows_returned: 1}`

### 案例 2：跨服务怎么拼回一棵树

服务 A 调服务 B（HTTP）。OTel 自动在请求头加：

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
              ^版本  ^trace_id (32位)              ^parent_span_id   ^flags
```

**逐部分解释**：

- 这是 **W3C Trace Context** 标准头，不是某家厂商私货。
- 服务 B 的 SDK 读这个头：新建 span 的 `parent_id` = `00f067aa0ba902b7`，`trace_id` 继承同一串。
- 后端按 `trace_id` 聚合同一请求、按 `parent_id` 拼成树。

### 案例 3：为什么生产里常加 Collector

直连：`SDK → 后端`。问题：每台机器都要配后端凭证；后端宕机时数据丢；批量压缩在每个 SDK 实例里重复。

加 Collector：`SDK → Collector → 后端`。Collector 集中做缓冲 / 重试 / 采样 / 加 K8s 元信息。换后端只改 Collector 配置，不动应用。

**逐部分解释**：本地 demo 直连后端完全可以；多服务、要统一采样/脱敏/换厂商时，Collector 才变成架构决策而不是可选项。

### 案例 4：Semantic Conventions（语义约定）

不同语言不同框架报同一件事，attribute 名字必须一致：

- HTTP 请求方法 → `http.request.method`（不是 `http.method` 也不是 `method`）
- 数据库类型 → `db.system`（值是 `postgresql` / `mysql` / `redis`）
- 消息中间件 → `messaging.system`（值是 `kafka` / `rabbitmq`）

**逐部分解释**：不遵守的代价是 dashboard 上同一字段在 Java 叫 `http.method`、Go 叫 `httpMethod`，永远聚不到一起。约定名字比多埋几个点更重要。

## 踩过的坑

1. **把 SDK 当 Collector 用**：本地 demo 直连后端没问题；多实例生产里直连脆（凭证分散、后端抖动易丢数），常见姿势是 SDK → Collector → 后端
2. **Auto-instrumentation 全开**：Java agent 默认可埋几十个框架，生产里 CPU 开销常见到两位数百分比量级。要按需开
3. **Head sampling 1% 然后看不到错误**：随机 1% 采样后稀有错误链路全丢。错误要走 **tail sampling**（在 Collector 看完整条 trace 再决定留不留）
4. **trace_id 没串到 log 里**：log 不带 trace_id，监控只能"看见慢"但点不到"哪行 log 慢"
5. **不遵守 Semantic Convention**：自己造名字，团队规模一大全是孤儿字段

## 适用 vs 不适用场景

**适用**：

- 微服务 / 多语言 / 多团队架构——OTel 是事实标准
- 想避免 vendor lock-in——OTLP 让换后端只改配置
- 三个信号要联动分析（trace + metric + log 串 trace_id）
- 需要统一采样、脱敏、加 K8s 元信息——上 Collector 比每台 SDK 各写一遍划算

**不适用**：

- 单体小应用、只要本机指标——Prometheus + 普通日志通常够用，上全套 OTel 是过度工程
- 实时性极强（毫秒级反馈环）——SDK/Collector 默认批处理常见是秒级导出延迟
- 嵌入式 / 资源极受限——SDK 内存与线程开销不低

## 历史小故事（可跳过）

- **2016**：Uber Jaeger 团队推 OpenTracing，定 API 但不管实现
- **2017**：Google 开源 OpenCensus，trace + metric 一体但偏 Google 生态
- **2019-05**：两家合并为 OpenTelemetry，进 CNCF sandbox。理由很务实：开发者厌倦了在两套标准之间选边
- **2021-02**：Tracing 规范 1.0 GA
- **2023-11**：Logs 规范 1.0 GA，三大信号齐
- **2024+**：profiling 加入第四类信号

合并的关键洞察：可观测性数据格式应该是 **公共物品**，不是每家厂商的护城河。

## 学到什么

1. **API 和数据落地解耦** 是这套设计的核心——埋点代码一次写，后端可换
2. **三个信号 + 同一个 trace_id** 让"看见症状 → 定位根因"变成可点击的工作流
3. **Semantic Conventions 比想象中重要**——名字不统一时再多数据也是孤岛
4. **Collector 是中央枢纽**，不是可选组件，是架构决策
5. **标准合并比赢标准更重要**——OpenTracing + OpenCensus 各自都没赢，合并后才成事

## 延伸阅读

- 官方规范：[OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- W3C Trace Context：[W3C Recommendation](https://www.w3.org/TR/trace-context/)
- Collector 设计：[opentelemetry-collector GitHub](https://github.com/open-telemetry/opentelemetry-collector)
- [[prometheus]] —— 只管 metric 那一支，OTel 的 metric pipeline 兼容它
- [[jaeger]] —— 只管 trace 的前辈，现在是 OTel 后端之一

## 关联

- [[prometheus]] —— OTel metric 信号兼容 Prometheus exposition format
- [[jaeger]] —— OTel trace 后端的常见落地
- [[otel-collector]] —— Collector 运维与 pipeline 配置视角
- [[opentelemetry-collector]] —— Collector 核心仓库与组件模型
- [[kubernetes]] —— Collector 常作为 DaemonSet 部署，自动注入 pod 元信息
- [[grpc-go]] —— OTLP 常用 gRPC 传输（Go 实现入口）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/wandb]] —— Weights & Biases — 几行 init 把指标系统代码自动入库
- [[backstage]] —— Backstage — 把公司散在各处的开发工具拼成一个门户
- [[datadog]] —— Datadog — 把所有监控装进一个仪表盘的 SaaS 标杆
- [[fluent-bit]] —— Fluent Bit — C 写的轻量日志 forwarder，K8s DaemonSet 默认选
- [[istio]] —— Istio — 给微服务装一层透明的网络治理面
- [[jaeger]] —— Jaeger — 分布式追踪系统
- [[loki]] —— Loki — 给日志做 Prometheus，只索引标签不索引内容
- [[opentelemetry-collector]] —— opentelemetry-collector — OTel 官方核心仓库与组件模型
- [[sentry]] —— Sentry — 把崩溃和报错自动收集 + 分组 + 可查询的错误监控平台
- [[signoz]] —— SigNoz — 自托管的 OpenTelemetry 一体化可观测平台
