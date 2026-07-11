---
title: Datadog — 把所有监控装进一个仪表盘的 SaaS 标杆
来源: https://docs.datadoghq.com/account_management/billing/
日期: 2026-05-31
分类: 可观测性 / DevOps
难度: 中级
---

## 是什么

Datadog 是一家 2010 年在纽约成立的可观测性 SaaS 公司（NYSE: DDOG，2019 年上市），把以前要装五六个工具才能搞定的事——服务器监控、应用性能追踪（APM）、日志、前端真实用户监控（RUM）、网络流量、安全合规——**全塞进一个浏览器仪表盘**。

日常类比：以前的运维工具像一柜子专用医疗仪器（心电图、血压计、X 光机各一台），Datadog 是那台一次性给你出全身报告的体检中心。

为什么 ADR3 把它当全 SaaS 计费对照标杆：observability 这个品类里，所有竞品（Grafana Cloud / New Relic / Splunk Observability / Honeycomb）的定价表都在和 Datadog 的「按 host + 按用量混合」模型对照——它就是这个领域的价格坐标系。

## 为什么重要

不理解 Datadog 的计费和架构，下面这些事都没法解释：

- 为什么 2022 年传出 Coinbase 一年付给 Datadog 6500 万美金，业内会当真
- 为什么很多创业团队明明只有 50 台机器，月账单也能冲到 5 万美金
- 为什么有了 Prometheus + Grafana 全免费的开源栈，公司还愿意每月付几十万买 SaaS
- 为什么 2024 年 Datadog 营收 26.8 亿美金、毛利 80%，资本市场把它当软件公司估值天花板

## 核心要点

Datadog 计费可以拆成 **三个维度**：

1. **按 host**：Infrastructure Pro $15/host/月，Enterprise $23/host/月（年付）。host 的定义是「装了 agent 的一台机器」——一台 16 核服务器和一台 t2.micro 同价。
2. **按用量**：Logs ingest $0.10/GB（「进管道就收钱」）+ indexed $1.27-$2.50/百万事件（「进搜索引擎再收一次」）。Custom metrics 前 100 个/host 免费，超出 $0.05/月/个。
3. **按模块叠加**：APM Pro $31/host、Security CSPM $7.50/host、Synthetic browser $12/万次。同一台机器开三个模块，host 价格累加。

这三层叠完，才是 Datadog 月账单的真面目。

## 实践案例

### 案例 1：1000 台机器全开会花多少

假设一家中型公司 1000 台 EC2 + 全开 APM + 每天 1 TB 日志：

```
Infrastructure Enterprise:  1000 × $23   = $23,000/月
APM Enterprise:             1000 × $40   = $40,000/月
Logs ingest:                30 TB × $100 = $3,000/月
Logs indexed (15 天):       约 $25,000/月
合计：                                    约 $91,000/月
```

一年 109 万美金。这就是为什么 Datadog 的 ARR > 10 万美金客户超过 3600 家。

### 案例 2：custom metric 的 cardinality 陷阱

业务代码里写一行：

```python
statsd.increment('cart.add', tags=[f'user_id:{user_id}'])
```

看似无害，但每个不同的 user_id 都生成一个独立的 metric series。100 万用户 = 100 万个 series = 月底多收 $50,000。这就是「cardinality 爆炸」——Coinbase 的天价账单据说就栽在这。

### 案例 3：架构反向工程

Datadog Agent（Go 写的，开源在 github.com/DataDog/datadog-agent）跑在每台 host 上，K8s 里走 DaemonSet：

```yaml
helm install datadog datadog/datadog \
  --set datadog.apiKey=xxx \
  --set datadog.site=datadoghq.com
```

agent → intake API → Kafka 总线 → 三个独立后端：

- metrics 进自研 timeseries store（早期用 Cassandra，后来自研行存压缩）
- logs 进 Elasticsearch 派生存储（数据量大会切到归档 S3）
- traces 进 ClickHouse（2023 年从自研列存迁过去，单事件成本降一个数量级）

6 个 region（US1 / US3 / US5 / EU1 / AP1 / Gov），**数据不跨 region**——多区部署的客户要在 5 个 console 之间切。这也是 Datadog 不进中国、不进俄罗斯市场的根本原因：合规要求建本地 region 但市场体量摊不平成本。

## 踩过的坑

1. **custom metric 用高基数字段做 tag**：user_id / request_id / trace_id 当 tag → cardinality 爆炸 → 账单 10×。规则：tag 的值域必须可枚举（env / service / team 这种十几个值的）。

2. **日志默认全量 indexed**：写 log 没设保留策略，默认 15 天 indexed 全保留。ingest 便宜（$0.10/GB），indexed 贵 10 倍以上。要在 ingest pipeline 里写 exclusion filter 把 DEBUG 级别扔掉。

3. **APM 和 Infrastructure 分开计价没看清**：1000 host 同时开 Infra + APM，每月会多付约 3.1-4 万美元。合同期前要算清楚。

4. **agent 升级没 pin 版本**：Datadog Agent 自动升级开着，某次 release 引入内存泄漏，全集群 host RAM 涨 1G。生产建议固定 minor version，逐步灰度。

5. **2023-03 us1 跨 AZ 中断 24 小时**：Chef 推 systemd-resolved 升级触发 BGP 路由重启，客户连续 26 小时没 metrics 也没告警——「监控系统自己挂了谁来监控它」的经典案例。

## 适用 vs 不适用场景

**适用**：

- 中后期创业 → 上市公司，团队 < 200 人但服务器 > 100 台，没专职 SRE 维护监控栈
- 多语言混合（Java + Go + Python + Node + Rust）需要统一 APM 视图
- 合规驱动行业（金融 / 医疗）需要日志 7 年保留 + SOC2 / HIPAA 审计
- DevOps 文化成熟的公司，dev 和 ops 真的会一起看 dashboard
- 跨云团队（AWS + Azure + GCP 都有）需要一个统一控制台跨 cloud 看资源

**不适用**：

- 早期创业 < 30 台机器：Grafana Cloud free tier + 自托管 Prometheus 就够
- 高基数核心场景（trace 每个字段都想查）：Honeycomb 不限 cardinality 更适合
- 极度成本敏感且有 SRE 资源：Prometheus + Loki + Tempo + Grafana 自建可以省 80%
- 主权数据要求强（中国 / 俄罗斯）：Datadog 没本地 region，得另选
- 想自己掌握存储格式做长期归档：Datadog 是黑盒，导出 raw 数据贵且慢

## 历史小故事（可跳过）

- **2010 年**：Olivier Pomel（法国人，前 Wireless Generation CTO）和 Alexis Lê-Quôc 在纽约创立 Datadog。名字来源是「让 dev 和 ops 看同一个 dashboard」——dev + ops 中间那只看门狗。当时观点很反直觉：业内都在分头做 Nagios / Splunk / NewRelic，他们偏要拼一锅。
- **2015 年**：推出 APM，从基础设施监控扩到应用层。这一步把 ARPU 从几千美金/月顶到几万美金/月。
- **2019 年 9 月**：IPO，开盘市值 100 亿美金，是 SaaS IPO 史上前十大。
- **2021 年**：收购 Sqreen（应用运行时安全） + Timber.io（拿到 Rust 写的 Vector 日志管道）。
- **2023 年**：trace 后端从自研迁到 ClickHouse，单事件存储成本降一个数量级。
- **2024 年**：推出 LLM Observability 模块，对标 Helicone / LangSmith，押注下一波生成式 AI 应用监控。

## 学到什么

1. **「按 host + 按用量混合」是 SaaS 计费的黄金范式**：固定底盘锁住客户增长曲线，用量层吃住业务增量。Snowflake / MongoDB Atlas 都在抄这个套路。底盘价让 CFO 好预算，用量价让财务模型在客户做大时自动跟涨——两边都不放过。

2. **垂直整合比单点最优更值钱**：Prometheus 单看比 Datadog metrics 强，Loki 单看比 Datadog logs 便宜，但客户愿意为「一个登录、一个告警、一个 trace 跳到 log」多付 5 倍价钱。observability 的护城河不是某项指标第一，而是**关联跳转的体验**。

3. **agent 模型 + auto-discovery 是入场费**：dd-trace 库自动注入 12 种语言运行时，业务代码不改一行就出 APM 数据——这种「免费午餐」是 SaaS 能锁住客户的关键。一旦 agent 装到 1000 台机器上，迁移成本就接近无限。

4. **cardinality 是 observability 的核心成本变量**：metric / trace / log 三种数据存储成本差异都来自基数，理解它才能既不被坑也不被锁。新项目接 Datadog 第一周一定要做 cardinality budget review。

## 延伸阅读

- 计费总览：[Datadog Billing](https://docs.datadoghq.com/account_management/billing/)（官方价格页，半年更一次）
- agent 源码：[github.com/DataDog/datadog-agent](https://github.com/DataDog/datadog-agent)（Go，工业级 agent 学习样本）
- Vector 文档：[vector.dev](https://vector.dev/)（Rust 写的 log pipeline，可独立用替换 Fluentd）
- 公司财报：Datadog 2024 Q4 10-K（30000+ 客户、80% gross margin、ARR > 100k 客户 3600+）
- 演讲推荐：Datadog 2023 Dash 大会主题演讲（讲 ClickHouse 迁移 + LLM Observability roadmap）
- [[grafana-cloud]] —— 按用量计费的开源派对照
- [[honeycomb]] —— 高基数 trace 专攻派对照
- [[opentelemetry]] —— 行业标准协议，Datadog 既兼容也想吞

## 关联

- [[grafana-cloud]] —— 同品类「按用量」派标杆，对照定价模型
- [[honeycomb]] —— event-based 高基数路线，避开 host 计费
- [[new-relic]] —— 2020 改成按 GB + 按席位，承诺去 host 锁定
- [[opentelemetry]] —— 行业开源 trace 标准，Datadog 兼容它
- [[prometheus]] —— 自建监控的事实标准，DD 的对立面
- [[clickhouse]] —— Datadog 2023 把 trace 后端迁到它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[prometheus]] —— Prometheus — 时序监控系统
- [[signoz]] —— SigNoz — 自托管的 OpenTelemetry 一体化可观测平台
- [[vector]] —— Vector — Rust 写的统一可观测性数据管道

