---
title: Jaeger — 分布式追踪系统
来源: https://github.com/jaegertracing/jaeger
日期: 2026-05-29
分类: 监控 / 分布式追踪
难度: 中级
---

## 是什么

Jaeger 是 Uber 2017 年开源的**分布式追踪系统**，灵感来自 Google 2010 年那篇 Dapper 论文。

日常类比：

- [[prometheus]] 看的是**一段时间的指标**——这一小时 CPU 多少、错误率多高
- Jaeger 看的是**一次请求的完整路径**——这一个用户点了下单，请求穿过 30 个服务，哪个服务慢、哪个抛错、哪个调了下游什么——一目了然

如果你的系统只有一个进程，print 日志就够了。但当一次请求要穿过订单服务、库存服务、风控服务、支付服务、消息队列、3 个数据库——日志散在 8 台机器上、时间戳还有偏差——只看日志根本拼不回来一次请求做了什么。

Jaeger 就是来拼这个的。

## 为什么重要

四个理由：

- **微服务排错刚需**——单体应用 print 日志就行；微服务下"哪个服务慢"看不出来，必须要追踪
- **OpenTracing / OpenTelemetry 标准支持**——Jaeger 是这两个标准的早期实现者，跨语言（Go / Java / Python / Node / Rust）通吃
- **CNCF 毕业项目**——2019 年从 CNCF 孵化器毕业，等于拿到了"云原生事实标准"的徽章
- **大厂背书**——Uber / Lyft / Red Hat / ByteDance / 阿里都在用；不是玩具

## 核心要点

理解 Jaeger 抓三个概念就够了。

### Span（一次操作）

一个 Span 是**一次操作的记录**——比如"调用了下游订单服务"或"查了一次数据库"。一个 Span 包含：

- 开始时间 + 结束时间（差值就是耗时）
- 操作名（如 `POST /orders`）
- Tags（贴在这次操作上的标签，如 `http.status=500`、`user.id=42`）
- Logs（操作中途记下的事件，像飞行记录仪的一笔笔备注）

### Trace（一组关联 span）

一个 Trace 是**一次完整请求穿过整个系统的所有 span**，通过同一个 **trace-id** 串联。span 之间有父子关系——一个 span 调了下游，下游就是子 span。

可视化是这样：

```
[Trace abc123]
├── span: API gateway       (100ms)
│   └── span: order service (80ms)
│       ├── span: db query  (30ms)
│       └── span: rpc call  (40ms)
│           └── span: ...
```

### Sampling + Storage

- **Sampling（抽样）**：生产环境一秒动辄上万次请求，全存爆炸；通常采样 1%-10%。常见策略：probabilistic（概率）/ rate-limiting（限速）/ adaptive（自适应）
- **Storage（存储后端）**：Jaeger 自己不存数据，靠后端。默认 [[elasticsearch]]，也支持 [[cassandra]] / Kafka / Badger

## 实践案例

### 案例 1：Docker 一键启

最快上手（同时开 UI 与 OTLP 端口）：

```bash
docker run -d \
  -p 4317:4317 -p 4318:4318 \
  -p 16686:16686 \
  jaegertracing/all-in-one:latest
```

然后浏览器开 `http://localhost:16686`，Jaeger UI 就来了。`4317/4318` 收 OTLP；`all-in-one` 把 collector / query / storage 塞一个镜像——只能玩玩，不能上生产。

### 案例 2：Python 接入（OTLP，勿用已弃用的 JaegerExporter）

用 OpenTelemetry SDK + OTLP（旧的 `opentelemetry.exporter.jaeger` 已从规范移除）：

```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

exporter = OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")
trace.get_tracer_provider().add_span_processor(BatchSpanProcessor(exporter))

with tracer.start_as_current_span("checkout"):
    with tracer.start_as_current_span("validate-cart"):
        # 你的业务代码
        pass
    with tracer.start_as_current_span("charge-payment"):
        pass
```

跑起来后，Jaeger UI 上就能看到 checkout 这个 trace，里面嵌套两个子 span。

### 案例 3：UI 看时间线

Jaeger UI 主视图是一条**水平时间线**：

- 横轴是时间（毫秒）
- 每一行是一个服务的一个 span
- 子 span 缩进显示
- 鼠标 hover 看 tags / logs

实战价值：一眼就能看出"这次 800ms 的请求里，500ms 都耗在风控服务的某个 redis 查询上"。这种洞察力，光看日志是拿不到的。

## 踩过的坑

- **采样率太低会错过偶发慢请求**——1% 采样意味着 99% 请求被丢，那个偶尔出现的 30 秒慢请求多半不在你抽到的 1% 里。生产建议用 adaptive sampling，对慢请求 / 错误请求强制保留
- **[[elasticsearch]] 后端写入压力大**——trace 数据量是日志的几倍，要配 ILM（Index Lifecycle Management）自动删旧索引；也要给 ES 单独的集群，不要和业务日志混
- **Trace 上下文传播配错链路就断**——HTTP 服务靠 `traceparent` header 传递，gRPC 靠 metadata；中间任何一层没传，下游 span 就成了孤儿。框架自动注入是常态，但跨技术栈（HTTP → 消息队列 → gRPC）容易漏
- **All-in-one 不是生产用**——生产要分开部署 collector（接收 span）/ query（查询 UI）/ storage（持久化），三层独立扩容；一键镜像只是 demo

## 适用 vs 不适用场景

**适用**：

- 微服务架构（≥ 5 个服务），跨服务请求耗时排查
- 突发慢请求 / 偶发错误的根因定位
- 跟 [[prometheus]] / Grafana 组合做"先指标后 trace" 的分层排错

**不适用**：

- 单体应用——一根 trace 全在一个进程里，APM 工具更直接
- 极致低延迟（每次插入都要传 context）的高频路径——trace 本身有 1-2% 开销
- 数据极敏感 + 跨境合规要求严的场景——trace 里常含 PII，要单独做脱敏

## 历史小故事（可跳过）

- **2017 年 4 月**：Uber 工程团队开源 Jaeger（名字来源于德语"猎人"）
- **2017 年 9 月**：捐给 CNCF，进入孵化器
- **2019 年 10 月**：从 CNCF 毕业（继 Kubernetes / [[prometheus]] 之后又一个图形化云原生项目）
- **2021 年**：与 OpenTelemetry 整合——OpenTelemetry 成为新事实标准，Jaeger 转向兼容
- **2024 年**：Jaeger v2 发布，底层用 OpenTelemetry SDK 重写，正式成为 OTel 生态一员

## 学到什么

- **观测三件套是分工而非替代**：metrics（[[prometheus]]）/ logs / traces（Jaeger）各管一个维度，缺一不可
- **trace-id 是把分布式系统拼回一致体验的核心抽象**——一根线把分散的事件串起来
- **采样不是省钱手段，是必需品**——100% 存储等于让追踪系统拖垮主系统
- **CNCF 毕业不等于永远主导**——Jaeger 毕业 5 年后被 OpenTelemetry 反客为主，开源世界没有终局

## 延伸阅读

- 官方文档：[Jaeger Getting Started](https://www.jaegertracing.io/docs/latest/getting-started/)
- OpenTelemetry 接入：[OTLP → Jaeger](https://opentelemetry.io/docs/languages/python/exporters/)（用 OTLP，不要再用 JaegerExporter）
- 灵感来源：Google Dapper 论文（2010）——分布式追踪的工业起点
- [[prometheus]] —— 指标侧对照；先告警再下钻到 Jaeger
- [[opentelemetry]] —— 今天写埋点应优先学的 API / SDK

## 关联

- [[prometheus]] —— 监控三件套之一，看时间序列指标
- [[elasticsearch]] —— Jaeger 常用存储后端之一
- [[cassandra]] —— Jaeger 另一个常用存储后端
- [[grafana]] —— 常和 Jaeger 配合，从指标跳到对应 trace 排错
- [[opentelemetry]] —— 现代埋点标准，Jaeger 作为后端接收 OTLP

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
