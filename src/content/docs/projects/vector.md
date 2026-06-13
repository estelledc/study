---
title: Vector — Rust 写的统一可观测性数据管道
来源: https://github.com/vectordotdev/vector
日期: 2026-06-01
子分类: 可观测性
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Vector 是一套用 **Rust 写的可观测性数据管道**——把日志、指标、追踪三类数据从『收集 → 转换 → 发送』串成一张图，由它统一搬运。Datadog 主导维护，GitHub 19k stars。

日常类比：像**机场的行李分拣传送带**。每个值机柜台（应用服务器、K8s Pod）丢进来一袋袋数据，传送带读条码（tag），中间有几个工位拆包重贴（transform），最后按目的地分到不同登机口（Elasticsearch / S3 / Kafka / Prometheus）。Vector 就是这条传送带本体。

写起来是一份 TOML 配置：

```toml
[sources.app_logs]
type = "file"
include = ["/var/log/app/*.log"]

[transforms.parse]
type = "remap"
inputs = ["app_logs"]
source = '. = parse_json!(.message)'

[sinks.es]
type = "elasticsearch"
inputs = ["parse"]
endpoints = ["http://es:9200"]
```

三段：source 收文件 → transform 解 JSON → sink 写 Elasticsearch。配置即拓扑图。

## 为什么重要

不理解 Vector，下面这些事就解释不通：

- 为什么 Datadog 2021 年要收购 Timber.io 拿下 Vector——它需要一个**比 Fluent Bit 更快、比 Logstash 更省内存**的边缘 agent
- 为什么 K8s 日志方案分两派：Fluent Bit 系（CNCF 毕业，但 C 写的扩展难）和 Vector 系（Rust 写的，VRL 表达力更强）
- 为什么可观测性管道是 [[otel-collector]]、[[fluent-bit]]、Vector 三家在抢——大家都在赌『统一 logs/metrics/traces』这条赛道
- 为什么团队总在纠结『agent 模式还是 aggregator 模式』——Vector 是少数能在两端复用同一个二进制的方案

## 核心要点

Vector 的世界由四个概念咬合：

1. **Topology**：source → transform → sink 的有向无环图。配置文件里每个组件有 `inputs` 字段指上游，连成图。
2. **Component（三类）**：
   - **Source**：数据入口，几十种内置（file / kafka / kubernetes_logs / prometheus_scrape / opentelemetry / syslog）
   - **Transform**：处理节点（remap 用 VRL / filter / aggregate / route 分流）
   - **Sink**：数据出口（elasticsearch / s3 / kafka / loki / prometheus_remote_write / datadog_logs）
3. **Event 模型**：管道里流动的是统一 Event，分 Log / Metric / Trace 三种。一个 transform 既能接 log 也能输出 metric，三类数据共享一套基础设施。
4. **VRL（Vector Remap Language）**：专为可观测性数据写的小型 DSL。编译期就拒绝可能 panic 或无限循环的代码——你写 `parse_json!(.message)` 时编译器知道这一定 terminate，所以**生产环境跑 VRL 没有失控风险**。

**两种部署形态**：

- **Agent 模式**：每台机器跑一个 Vector，收本地文件 / journald / 系统指标，转发出去
- **Aggregator 模式**：集中部署几台 Vector，从一堆 agent 收数据做重型聚合 / 去重 / 采样，再写下游

同一个二进制，配置不同就切换形态。

## 实践案例

### 案例 1：K8s 日志收集 + 解析 JSON + 发到 Elasticsearch

```toml
[sources.k8s]
type = "kubernetes_logs"

[transforms.parse_json]
type = "remap"
inputs = ["k8s"]
source = '''
parsed, err = parse_json(.message)
if err == null { . = merge(., parsed) }
'''

[sinks.es]
type = "elasticsearch"
inputs = ["parse_json"]
endpoints = ["http://es-cluster:9200"]
bulk.index = "logs-%Y-%m-%d"
```

读起来：从 K8s 节点收所有容器日志 → 用 VRL 试着解析 JSON message（失败保持原样）→ 按日期分索引写 ES。

### 案例 2：流量大时降采样省钱

```toml
[transforms.sample_debug]
type = "sample"
inputs = ["app"]
rate = 100
key_field = "level"
exclude.level = ["error", "warn"]
```

DEBUG / INFO 级别只留 1/100，ERROR / WARN 全保留。一行 transform 把日志成本降两个数量级——这是 Vector 主打卖点之一。

### 案例 3：把 Prometheus 指标转发到多个后端

```toml
[sources.prom]
type = "prometheus_scrape"
endpoints = ["http://app:9090/metrics"]

[sinks.datadog_metrics]
type = "datadog_metrics"
inputs = ["prom"]

[sinks.victoria]
type = "prometheus_remote_write"
inputs = ["prom"]
endpoint = "http://vm:8428/api/v1/write"
```

同一份 Prometheus 抓取流，同时写 Datadog 和 VictoriaMetrics——多后端**双写**是迁移期常见姿势。

## 踩过的坑

1. **VRL 不是 JS 也不是 Lua**：它故意没循环、没递归。看到要写循环时第一反应是『改用内置函数（map_values / filter_keys）』，而不是想办法绕。VRL 限制是为了**编译期就排除生产事故**，不是为了为难你。

2. **disk buffer 写满会丢数据**：sink 默认带磁盘缓冲，下游挂了就堆磁盘。但磁盘满了之后行为取决于 `when_full` 设置——`block` 会反压上游、`drop_newest` 会丢新事件。生产前必须显式选一个，**默认值不一定是你想要的**。

3. **agent 模式的 CPU 优势会被错配置抵消**：Vector 单核能压 100k events/s 是建立在『transform 简单、batch 合理』前提下。一个 VRL 里塞 10 个 regex match，单核掉到 5k/s——和 Logstash 一样慢。慢了先 profile transform，不要怪 Rust。

4. **Datadog 收购后中立性争议**：sink 列表里 `datadog_*` 是一等公民。竞品后端（Splunk / 新关系数据库）社区贡献节奏明显慢，关键 bugfix 优先 Datadog 客户。**做技术选型时把这点纳入考量**，不是说不能用，而是知道偏向在哪。

## 适用 vs 不适用场景

**适用**：

- K8s / 大规模日志聚合（agent 在节点 + aggregator 集中）
- 多后端分发 / 双写 / 灰度切流
- 需要在管道里做复杂转换（JSON 解析 / 字段重写 / 路由分流）
- CPU / 内存敏感的边缘场景（IoT 网关、边缘节点）

**不适用**：

- 重度依赖现有 Fluentd/Fluent Bit 插件生态（Vector 插件少）
- 团队完全不想维护 TOML/YAML 配置 → 用 [[otel-collector]] 标准化更省心
- 仅仅转发不做处理 → [[fluent-bit]] 更轻
- 强一致流处理（exactly-once）→ 用 Kafka Streams / Flink

## 历史小故事（可跳过）

- **2019 年 4 月**：Timber.io 开源 Vector 第一版。Timber 自己是日志 SaaS，被 Logstash 的 JVM 内存和 Fluent Bit 的扩展难度同时折磨，决定造一个 Rust 版本。
- **2020 年**：VRL 立项。团队意识到日志 transform 用通用语言（Lua / JS）有风险——一个糟糕的脚本能把整条管道 panic 掉。VRL 用『故意阉割』换『编译期可证安全』。
- **2021 年 2 月**：Datadog 收购 Timber.io。官方说法是**让 Vector 团队全职做开源**，社区担心是『Datadog 想要一个好看的 OSS 边缘 agent 接入自家平台』。
- **2022 年**：开始稳定发布周期，sink 列表扩到几十个。
- **2024 年**：和 [[otel-collector]] 在 OpenTelemetry 协议支持上正面竞争——Vector 选择**实现 OTLP 协议但不绑定 OTel SDK 模型**，保留自己的 Event 抽象。

## 学到什么

1. **DSL 选 VRL 而不是 Lua/JS** 是 Vector 最有判断力的设计决定——可观测性管道一旦失控影响全公司监控，宁可表达力弱一点也要『编译期可证 terminate』。
2. **同一个二进制做 agent + aggregator** 是工程上的小聪明：用户不用学两套部署模型，运维不用维护两种镜像。
3. **Rust 不是银弹**：Vector 比 Logstash 快是真的（语言 + 异步运行时优势），但和 Fluent Bit 比就是同一量级（Fluent Bit 是 C 写的）。语言选型给的是**性能下限**，不是上限。
4. **被收购后开源项目的方向偏向**值得长期观察——Datadog 是付费客户，Splunk 是竞品，社区贡献速度的差异会在 issue 列表里慢慢显现。

## 延伸阅读

- 官方文档：[Vector Documentation](https://vector.dev/docs/)
- VRL 设计文档：[VRL Reference](https://vector.dev/docs/reference/vrl/)
- 和 Fluent Bit 对比：[Vector vs Fluent Bit benchmarks](https://vector.dev/highlights/2020-04-01-benchmarking-fluent-bit/)
- 对照阅读：[[fluent-bit]] / [[otel-collector]] / [[loki]]

## 关联

- [[fluent-bit]] —— 同生态对照，C 写的轻量 forwarder，CNCF 毕业
- [[otel-collector]] —— OpenTelemetry 官方 collector，标准协议派
- [[loki]] —— 常见的下游 sink，Grafana 系日志后端
- [[elasticsearch]] —— 经典 sink，索引后供 Kibana 查询
- [[prometheus]] —— 上游 source 之一，Vector 抓 metrics 后转发
- [[grafana]] —— 看 Vector 转发的指标和日志的可视化前端
- [[kubernetes]] —— Vector 主战场，agent 以 DaemonSet 跑在每个节点
- [[datadog]] —— 母公司，也是默认优待的 sink
