---
title: SigNoz — 自托管的 OpenTelemetry 一体化可观测平台
仓库: https://github.com/SigNoz/signoz
日期: 2026-06-01
分类: 基础设施
难度: 中级
---

## 是什么

SigNoz 是一个**开源、自己部署的 APM 工具**。日常类比：像在自家服务器上装一台"行车记录仪 + 体检中心 + 黑匣子"，把网站和服务跑出来的所有蛛丝马迹都收下来，再一个网页上看完。

它把三种监控数据合并到同一个界面：

- **trace（追踪）**：一次请求经过哪几个服务、每段花多久
- **metrics（指标）**：CPU、内存、QPS 这种随时间变化的数字
- **logs（日志）**：程序自己打印出来的每条文字消息

过去这三种东西各用一套工具（Jaeger 看 trace、Prometheus 看指标、Loki 或 ELK 看日志），SigNoz 把它们装到**一个 UI**，并且全部用 OpenTelemetry 这一种标准协议进。

GitHub 27k+ star，开源主体 **MIT**（`ee/` 企业功能另有许可），2020 年底酝酿、2021 年开源并由 Pranay Prateek 与 Ankit Nayan 带队进 YC（W21）。

## 为什么重要

不理解 SigNoz 解决的问题，下面几件事会很别扭：

- 公司想监控线上服务，**Datadog 报价吓人**（按主机/数据量计费，每月几万美元起步），找开源替代时一搜全是"自己拼"
- 自己拼 Jaeger + Prometheus + Loki，每个工具都要单独部署、单独配仪表板、**仪表之间互相跳不过去**
- 一次故障要先在 trace 看到慢调用、再切到 logs 看错误堆栈、再到 metrics 看 CPU 是不是打满 —— 三个网页之间复制粘贴 trace ID
- OpenTelemetry 这套**新一代标准协议**已经被 CNCF 推成行业默认，但很多老监控工具还在用自家私有 agent

SigNoz 是这条路线上 star 数最多、最活跃的开源选项。

## 核心要点

### 一句话架构

应用代码 → OpenTelemetry SDK → OTel Collector → SigNoz 后端（Go 写的）→ ClickHouse（存储）→ React 前端（看图）。

### 三个关键设计选择

1. **ClickHouse 当统一存储**

   trace、metric、log 三种数据**都落到同一个 ClickHouse 集群**。日常类比：以前三种文件分别放三个柜子，现在合并成一个超大列存仓库，按列压缩存得很省，查询只读需要的那几列。
   - 好处：跨数据类型 join 很容易（拿 trace_id 跳到对应 log）
   - 代价：ClickHouse 运维门槛高，磁盘满了、内存爆了要自己处理

2. **完全 OpenTelemetry 原生**

   SigNoz **不再开发自己的 agent**。所有进入数据都走 OpenTelemetry SDK + OTel Collector。日常类比：以前每家监控厂商都要你装它的私有摄像头，现在大家说定一种通用摄像头标准（OTel），SigNoz 只负责后面的"录像存储和回放"。
   - 好处：你换厂商时 SDK 一行不改
   - 代价：OTel 标准还在演进，SDK 与 Collector 版本错配会丢字段

3. **PromQL 风格告警**

   告警规则的写法**抄了 Prometheus 的 PromQL**，让已经用 Prometheus 的团队几乎零迁移成本。

### 三层数据怎么连起来

| 入口 | 跳转 | 终点 |
|------|------|------|
| trace 看到 P99 飙升 | 点 trace 里的 span | 跳到该 span 时段对应的 log |
| log 看到 ERROR | 点 log 行的 trace_id | 跳到那次请求的完整 trace 火焰图 |
| metric 看到 CPU 满 | 点该时段的图 | 跳到那段时间最慢的 trace 列表 |

这种"三向跳转"过去要写胶水，SigNoz 把它内置成默认行为。

## 实践案例

### 案例 1：自部署最小集

最小跟做（官方文档以当前版本为准）：

```bash
git clone https://github.com/SigNoz/signoz.git
cd signoz/deploy
docker compose up -d   # 拉起 collector / ClickHouse / query-service / frontend 等
```

核心容器角色：

```text
otel-collector  -> 接收数据
clickhouse      -> 存数据
query-service   -> Go 后端 API
frontend        -> React UI
alertmanager    -> 告警
```

应用接入：装 OpenTelemetry SDK，把 endpoint 指到 collector（4317 gRPC / 4318 HTTP）：

```python
# Python 最小装配（概念示例）
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:4317", insecure=True))
)
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("order-service")
```

跑起来后，在 UI 的 Services / Traces 页应能看到 span。

### 案例 2：定位一次慢请求

用户报告"提交订单偶尔要 5 秒"。在 SigNoz 里的排查路径：

1. 打开 Services 页 → 看到 order-service 的 P99 在 14:30 飙到 5.2s
2. 点该服务 → 进 trace 列表 → 按 duration 倒序 → 第一条就是慢请求
3. 火焰图发现 90% 时间消耗在 `payment-service` 的一次 DB 查询
4. 点该 span 的 view logs 按钮 → 跳到对应时段的 log → 发现是慢 SQL
5. 回到 metric 看 DB 连接池 → 满了

整个过程**没切过工具**，过去这要 Jaeger + Loki + Prometheus 三个网页来回切。

### 案例 3：和 Datadog 的成本对比

某 50 服务团队的真实公开案例（2024 年用户反馈）：

- Datadog SaaS：约 $8000/月（按主机数 + 数据量算）
- SigNoz 自部署：3 台 c5.2xlarge ≈ $700/月 + 2 人天初始部署

省钱主因：ClickHouse 列存压缩比好，trace 数据通常压到原始 1/10。代价是要自己运维 ClickHouse 集群。

## 踩过的坑

1. **ClickHouse 磁盘吃满**：默认保留 15 天，但全采样下 trace 体积巨大。生产前必须配 TTL 与采样率（通常头采样 10% + 尾采样异常）

2. **OTel SDK 版本错配**：collector 升到 0.95、SDK 还在 0.85，某些 attribute 会被 drop。每次升级先在测试环境对照官方版本矩阵

3. **trace_id 跳不到 log**：要让跳转工作，log 里**必须**带 trace_id 字段，需要在日志框架里手工注入 OTel context。新人接入常忘记

4. **企业版和开源版边界模糊**：高级 RBAC、SSO、多租户在云版/企业版，开源版只到单团队级别。生产部署前先确认需要的功能在哪一档

## 适用 vs 不适用场景

**适用**：

- 已经在用或打算用 OpenTelemetry 的团队
- Datadog 太贵想自托管，团队有 ClickHouse 运维能力
- 微服务规模 10-200 个、单团队管理、希望 trace/log/metric 统一看
- 想替换掉 Jaeger + Prometheus + Loki 的拼装方案

**不适用**：

- 完全没有运维资源 → 直接买 Datadog/Grafana Cloud SaaS
- 万级服务的超大规模 → SigNoz 单集群上限有限，需要分片或转向商业 SaaS
- 强需求私有 agent / 非 OTel 生态 → 用 New Relic 或 Datadog
- 只需要其中一种数据（比如纯指标）→ 直接 Prometheus 就够，没必要拉一整套

## 历史小故事（可跳过）

- **2020 年底**：团队在选存储（Druid / Pinot / ClickHouse），先走 Druid + Kafka
- **2021 年**：开源并进 YC W21；首版偏 Kafka + Druid，后端 Go
- **2021–2022 年**：主存储切到 ClickHouse，降低单机试玩与运维成本
- **之后**：全面押注 OpenTelemetry 原生接入，弱化/淘汰私有 agent 路线；logs 与列存查询持续加强

每一步都是"砍掉自家造的轮子，换成行业标准"，是把 OTel 推成默认的重要开源推手之一。

## 学到什么

1. **可观测性正在收敛到 OpenTelemetry**，提前学 OTel SDK 比学具体厂商工具更值
2. **trace + metric + log 同存一个引擎**比拼装方案体验好得多，但前提是这个引擎（ClickHouse）你能 hold 住
3. **开源 APM 的真正护城河不是功能，是"自部署成本是否真的低于 SaaS"**——SigNoz 押注 ClickHouse 列存压缩
4. **PromQL 抄过来当告警语言**是聪明设计：复用了行业最大的运维肌肉记忆

## 延伸阅读

- 官网与文档：https://signoz.io/docs/
- GitHub：https://github.com/SigNoz/signoz
- 创始人对架构选型的 blog：https://signoz.io/blog/clickhouse-vs-elasticsearch/
- [[opentelemetry]] —— 上游协议标准
- [[clickhouse]] —— 底层存储引擎
- [[jaeger]] —— SigNoz 替代的 trace UI

## 关联

- [[opentelemetry]] —— SigNoz 完全基于这套 SDK 与协议
- [[clickhouse]] —— SigNoz 把 trace/metric/log 全落到 ClickHouse 列存
- [[jaeger]] —— SigNoz 想替代的 trace UI
- [[prometheus]] —— SigNoz 告警语法抄了 PromQL
- [[grafana-tempo]] —— Tempo 是另一种 trace 后端，与 SigNoz 思路类似但分散在 Grafana 全家桶
- [[datadog]] —— 闭源 SaaS 的代表，SigNoz 的主要参照对象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[datadog]] —— Datadog — 把所有监控装进一个仪表盘的 SaaS 标杆
- [[prometheus]] —— Prometheus — 时序监控系统

