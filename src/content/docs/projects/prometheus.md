---
title: Prometheus — 时序监控系统
来源: https://github.com/prometheus/prometheus
日期: 2026-05-29
分类: 监控 / 时序数据库
难度: 中级
---

## 是什么

Prometheus 是 SoundCloud 2012 年开发的「**主动拉取（pull）+ 时序数据库 + PromQL 查询**」监控系统。

日常类比：
- **以前的监控**像每个员工主动汇报工作（push）——员工不汇报，经理就不知道他在干嘛
- **Prometheus** 是经理巡检办公桌（pull metrics endpoint）——每隔 15 秒上门看一眼，不汇报的员工立刻发现

每个被监控的服务暴露一个 `/metrics` 端点，Prometheus 主动来拉。它把拉到的数字按时间轴存进自己的时序数据库，配合 PromQL 这门查询语言，可以问"过去 5 分钟错误率是多少"、"内存涨速正常吗"。

## 为什么重要

- **CNCF 第二个毕业项目**：仅次于 [[kubernetes]]，地位相当于云原生世界的"监控官方认证"
- **云原生监控事实标准**：[[kubernetes]] / Istio / Linkerd 都内置 `/metrics` 端点；装好集群基本就插上 Prometheus
- **PromQL 时序查询语言**：`rate` 算速率、`histogram_quantile` 算 P99 延迟，原生为时序数据设计
- **Grafana 黄金组合**：Prometheus 存数据，Grafana 画看板——业内默认配置
- **会写 promql 是 SRE 的硬指标**：面试基本必问，不会等于不会运维

## 核心要点

### Pull-based scraping（主动拉取）

Prometheus 不等服务上报，自己定期上门。配置里写：「每 15 秒去 `app:8080/metrics` 拉一次」。

**好处**：
- 服务只需暴露端点，不用配 Prometheus 地址（解耦）
- Prometheus 知道服务是否健康（拉不到就标记 `up=0`）
- 拉取节奏 Prometheus 控制，不会被推爆

**对比 push 模式**（StatsD / OpenTelemetry push）：push 模式服务主动发，Prometheus 模式服务被动等。

### 时序数据模型

每条数据长这样：

```
http_requests_total{method="GET", status="200", path="/api/users"} 1027 1716969600
└────── metric ────┘└────────── labels ────────────┘ └ value ┘└─ timestamp ─┘
```

- **metric_name**：度量名，比如 `http_requests_total`
- **labels**：键值对维度，可以按 method / status / path 切分
- **value**：当前数值（计数器、仪表盘、直方图都行）
- **timestamp**：采样时间

同一个 metric_name 加不同 label 组合，就是不同的时序——这是后面"基数爆炸"踩坑的源头。

### PromQL（时序查询语言）

PromQL 专为"按时间问问题"设计：

```promql
# 5 分钟内 5xx 错误率
rate(http_requests_total{status=~"5.."}[5m])

# P99 延迟
histogram_quantile(0.99, rate(http_request_duration_bucket[5m]))

# 按服务分组求和
sum by (service) (rate(http_requests_total[1m]))
```

`rate` / `sum` / `histogram_quantile` 是高频三件套，会这三个就能写 80% 的告警。

## 实践案例

### 案例 1：起一个 Prometheus

```bash
docker run -p 9090:9090 prom/prometheus
```

打开 http://localhost:9090 ——自带的 web UI，可以直接写 PromQL 查询、看 target 状态。Prometheus 会先 scrape 自己（它自己也有 `/metrics`），所以马上就有数据可查。

### 案例 2：让 Prometheus 拉你的应用

`prometheus.yml`：

```yaml
scrape_configs:
  - job_name: 'app'
    scrape_interval: 15s
    static_configs:
      - targets: ['app:8080']
```

应用侧用 `prom-client`（Node）或 `prometheus_client`（Python）暴露 `/metrics`：

```js
const client = require('prom-client')
const counter = new client.Counter({ name: 'http_requests_total', help: '...', labelNames: ['status'] })
counter.inc({ status: '200' })
// GET /metrics 自动返回 Prometheus 格式
```

15 秒后 Prometheus 就开始拉数据。

### 案例 3：写一个错误率告警

```promql
rate(http_requests_total{status=~"5.."}[5m]) 
  / rate(http_requests_total[5m]) > 0.05
```

读法：「5 分钟内 5xx 占比超过 5%」。配进 Alertmanager，超过阈值发 Slack。

## 踩过的坑

1. **Cardinality 爆炸**：把 `user_id` 这种唯一值放 label —— 1000 万用户 = 1000 万时序。Prometheus 内存爆掉，查询变慢。**规则**：label 值的取值集合必须是有限可枚举的（status / method / endpoint 模板 OK；user_id / request_id / 完整 URL 不行）。

2. **Pull 模式不适合短任务**：Cron job 跑 30 秒就退出，Prometheus 还没来得及 scrape。**解法**：用 Pushgateway 做桥接——任务 push 到 Pushgateway，Prometheus 从 Pushgateway pull。

3. **单实例 ≠ HA**：Prometheus 默认单机存储，挂了就断数据。生产要 HA：跑两台同配置 + Thanos / Cortex / Mimir 做集群和长期存储。

4. **长期存储贵**：默认本地保留 15 天，再长就要远程存储（Thanos 写 S3 / Cortex 写对象存储）。原始 scrape 数据量大，要会用 recording rule 预计算降采样。

5. **PromQL `rate` vs `increase` 容易混**：`rate` 算每秒速率，`increase` 算窗口总增量。监控速率用 `rate`，做业务统计用 `increase`。

## 适用 vs 不适用

**适用**：
- 容器化 / 微服务监控（[[kubernetes]] / Docker / 服务网格）；数值指标（CPU / QPS / 延迟）
- 中短期数据（默认 15 天）；拉模式可达的服务

**不适用**：
- 日志（用 Loki / [[elasticsearch]]）
- 链路追踪（用 Jaeger / Tempo）
- 高基数事件分析（用户行为分析用 [[clickhouse]]）
- 移动端 / 浏览器监控（push 模式更合适）
- 强一致性的财务数据（Prometheus 优先可用性，会丢点）

## 历史小故事（可跳过）

- **2012**：SoundCloud 工程师 Matt Proud 和 Julius Volz 受 Google Borgmon 启发，在内部造了 Prometheus
- **2015 年初**：开源
- **2016**：加入 CNCF，成为继 [[kubernetes]] 之后第二个项目
- **2018**：从 CNCF 毕业，和 [[kubernetes]] 形成"K8s + Prometheus"的云原生标配
- **2024-11**：Prometheus 3.0 发布——可选 OTLP metrics 接收端 + UTF-8 指标名，更好对接 OpenTelemetry

## 学到什么

1. **pull vs push**：pull 让监控系统主动发现服务死活（`up=0`）；push 适合短命任务，需 Pushgateway 桥接
2. **cardinality = label 笛卡尔积**：有限枚举 OK，`user_id` 级唯一值会把内存打爆
3. **PromQL 把时间窗口 / 速率 / 分位数做成一等公民**：会 `rate` + `histogram_quantile` 就能写大多数告警
4. **单机 scrape 不是 HA**：生产要双实例 + Thanos / Mimir 做长期存储

## 延伸阅读

- 官方教程：[Prometheus First Steps](https://prometheus.io/docs/introduction/first_steps/)
- PromQL 速查：[PromLabs PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)
- [[kubernetes]] —— 云原生底座，Prometheus 最常驻的栖息地
- [[docker]] —— 跑 Prometheus 自身的最快方式
- [[clickhouse]] —— 高基数日志和事件分析的互补选项
- [[elasticsearch]] —— 日志聚合的传统选项，与 Prometheus 协作

## 关联

- [[kubernetes]] —— K8s 集群默认监控方案就是 Prometheus
- [[docker]] —— `docker run prom/prometheus` 是上手最快路径
- [[nginx]] —— Nginx 暴露 stub_status，Prometheus exporter 转成 metrics
- [[caddy]] —— Caddy 自带 `/metrics` 端点，开箱即用
- [[clickhouse]] —— 长期高基数数据用 ClickHouse 补 Prometheus 短板
- [[elasticsearch]] —— 日志走 ES，指标走 Prometheus，分工清晰

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

