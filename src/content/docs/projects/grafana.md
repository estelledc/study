---
title: Grafana — 监控可视化看板
来源: https://github.com/grafana/grafana
日期: 2026-05-29
分类: 监控 / 可视化
难度: 中级
---

## 是什么

Grafana 是一个**把时序数据画成折线图、仪表盘的可视化工具**。日常类比：[[prometheus]] 是仓库管理员（存数据 + 查询），Grafana 是数据可视化大屏——把仓库里的数字画成图，给人看。

它本身不存数据，只负责"问 + 画"——你点开看板，它去后端数据库（[[postgresql]] / [[clickhouse]] 等）拉数据，然后渲染成图。

2014 年由瑞典工程师 Torkel Ödegaard 从 Kibana fork 出来，最初目的就是"我想画 Graphite 的时序图，但 Kibana 只能画 Elasticsearch 的"。

## 为什么重要

不理解 Grafana，运维和监控这一摊基本干不了：

- **监控可视化事实标准**：与 [[prometheus]] / Loki（日志）/ Tempo（追踪）深度集成，几乎所有 SRE 团队都在用
- **100+ 数据源**：[[postgresql]] / [[mysql]] / [[clickhouse]] / [[elasticsearch]] / InfluxDB 全支持，一个看板可以混合多个来源
- **Alerting 内置**：基于查询结果可直接发邮件 / Slack / PagerDuty；这是 Grafana 自己的告警路径（也可以继续把 Prometheus Alertmanager 当另一条链路）
- **10w+ 公司部署**：从初创到 Netflix / PayPal / Bloomberg 都在用

## 核心要点

Grafana 的工作可以拆成 **三块**：

1. **Datasource（数据源）**：连各种数据库 / TSDB（时序数据库）拿数据。每个 Datasource 配置一个连接（URL + 认证），后续看板查询都通过它走。

2. **Dashboard（看板）**：一组 Panel 拼起来。每个 Panel 一个查询（PromQL / SQL / Lucene 等），返回数据后画成折线 / 柱状 / 饼图 / 仪表盘。看板可以保存为 JSON，用 git 版本管理。

3. **Alerting（告警）**：基于 Panel 的查询结果定阈值。比如 "如果 5 分钟内 500 错误率 > 1%，就报警"。触发后通过 Notification Channel（邮件 / Slack / Webhook）通知。

## 实践案例

### 案例 1：5 分钟跑起来

```bash
docker run -d -p 3000:3000 --name=grafana grafana/grafana
```

打开 `http://localhost:3000`，初始账号 `admin/admin`（首次登录会强制改密码）。

### 案例 2：加 [[prometheus]] 数据源

打开 **Connections → Data sources**（老版本菜单名可能是 Configuration → Data Sources）→ Add → Prometheus。URL 填 `http://prometheus:9090`（docker compose 同一网络）或 `http://host.docker.internal:9090`（本机 Prometheus）。Save & Test，绿勾就连上了。

### 案例 3：第一个 Panel

新建 Dashboard → Add Panel → 选 Prometheus 数据源 → Query 填：

```
rate(http_requests_total[5m])
```

PromQL 含义：「过去 5 分钟内 HTTP 请求总数的每秒变化率」。Grafana 自动按时间画折线图。

把图标 Title 改成 "QPS"，保存看板。下次打开就能看到实时数据流。

### 案例 4：配一条 Alert（Unified Alerting）

Grafana 8 起用**统一告警**（不要再找旧版 Panel 里的 Alert Tab / `WHEN avg() OF query(...)` 语法）。大致步骤：

1. 左侧 **Alerting → Alert rules → New alert rule**
2. 选 Prometheus 数据源，表达式写你真正关心的条件，例如 `rate(http_requests_total{status=~"5.."}[5m]) > 0.01`
3. 设 **pending period**（如 5m）避免抖动误报
4. 在 **Contact points** 里配好 Slack / 邮件，再绑到 notification policy

要点：告警查询最好独立于"好看的折线 Panel"，语义对准事件本身。
## 踩过的坑

1. **Panel query 不优化查爆 DB**：新人常写 `SELECT * FROM huge_table`，Grafana 默认 1000 行截断，但数据库该扫的还是扫完了。看板每 30 秒刷新一次 = 每 30 秒一次全表扫。生产事故级。**对策**：永远加 `WHERE time > $__timeFrom() AND time < $__timeTo()`（Grafana 内置时间宏），让 DB 用索引。

2. **时间范围选错看不到关键时间段**：右上角默认 "Last 6 hours"，新人复盘故障时忘了改，怎么也看不到昨天的尖峰。**对策**：复盘前先把时间范围改到事故发生时段；或者保存看板时锁定时间。

3. **Alert 误报率高**：直接用 Panel 的 query 当 Alert 条件，但 Panel 的 query 往往为了美观做了 `rate()` 平滑、`group by` 聚合，跟"我真正想报警的事件"对不上。**对策**：Alert 用独立的、专门为告警设计的 query，从语义上派生（"500 错误率"而不是"漂亮的折线"）。

4. **升级跨大版本破坏配置**：v9 → v10、v10 → v11 都改过 Provisioning 配置语法 / Panel 数据格式。直接升不读 changelog 一定踩雷。**对策**：升级前先在测试环境跑一遍 `grafana-cli plugins ls` 和 dashboard import 验证。

## 适用 vs 不适用场景

**适用**：

- 时序数据可视化（指标 / 性能 / 业务 KPI）
- 多数据源混合看板（Prometheus + PostgreSQL 一张图）
- 中小型告警体系（< 1000 条规则 / 团队自管）
- 有 SRE / 运维团队的中大型公司

**不适用**：

- 需要复杂交互的 BI 报表 → 用 Metabase / Superset / Tableau
- 海量告警规则集中管理（> 万级）→ 用 Prometheus Alertmanager + 路由策略
- 业务数据 ad-hoc 探索 → Jupyter / Hex / Mode
- 实时流式更新（< 1 秒）→ Grafana 默认轮询 5 秒，需要 streaming 数据源

## 历史小故事（可跳过）

- **2014 年 1 月**：Torkel Ödegaard 在 Orbitz 工作，想可视化 Graphite 数据，发现 Kibana 只支持 Elasticsearch，于是 fork Kibana 改写。第一个版本只支持 Graphite。
- **2015 年**：Grafana Labs 在斯德哥尔摩成立，全职做开源 + 商业版（Grafana Cloud）。
- **2018 年**：Grafana 5.0 重构 Dashboard JSON 结构，引入 Variable / Library Panel。这是看板真正能"复用"的开始。
- **2021 年 4 月**：Grafana 8 改协议，从 Apache 2.0 改 AGPL v3。商业用户必须付费或开源整个产品。
- **2023 年**：Grafana 10 引入 Scenes 框架，看板从静态 JSON 变成 React 组件树，可以写代码动态生成。
- **2024 年**：Grafana 11 + LLM Plugin，支持自然语言生成 PromQL（"过去一天 5xx 率最高的服务"→ 自动生成查询）。

## 学到什么

1. **可视化不是画图工具，是查询编排引擎**：Grafana 的核心价值是"按时间窗口、按数据源、按聚合方式调度查询"，画图只是最后一步
2. **看板即代码（Dashboard as Code）**：JSON 化 + Provisioning 让看板能 git 管理、code review、CI/CD，跟基建一致
3. **告警和可视化要解耦**：好看的图 ≠ 好的告警条件，混在一起容易误报
4. **fork 是创新的合法路径**：Torkel 不是从零造，是 fork 已有项目改造方向，14 年后估值 60 亿美金

## 延伸阅读

- 官方教程：[Grafana Fundamentals](https://grafana.com/tutorials/grafana-fundamentals/)（30 分钟从装到第一个看板）
- 视频：[Grafana for Beginners](https://www.youtube.com/watch?v=1kJyQKgk_oY)（YouTube 官方频道）
- Dashboard 模板库：[grafana.com/grafana/dashboards/](https://grafana.com/grafana/dashboards/)（社区贡献的几千个看板，复制 ID 直接 import）
- Loki —— Grafana Labs 自家的日志后端，与 Grafana 同一套 UI
- [[clickhouse]] —— 大流量场景下的可视化后端

## 关联

- [[prometheus]] —— 拉模式时序数据库，与 Grafana 是经典 CP
- [[postgresql]] —— 关系型数据库，Grafana 直连画业务指标
- [[mysql]] —— 同上，老牌业务数据库
- [[clickhouse]] —— OLAP 列存，海量日志 / 指标场景下的 Grafana 后端
- [[elasticsearch]] —— Grafana 的"祖宗" Kibana 就是给它画图的

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[backstage]] —— Backstage — 把公司散在各处的开发工具拼成一个门户
- [[besu]] —— Hyperledger Besu — 用 Java 写的以太坊客户端
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[cilium]] —— Cilium — 用 eBPF 把 K8s 网络从 iptables 时代搬出来
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[dropwizard]] —— Dropwizard — Java 微服务的"开箱即用 12-factor 起步包"
- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[evidence]] —— Evidence — 把 Markdown + SQL 编译成静态报告站
- [[fluent-bit]] —— Fluent Bit — C 写的轻量日志 forwarder，K8s DaemonSet 默认选
- [[glances]] —— Glances — Python 写的全栈系统监控（终端 + Web + REST + 远程）
- [[grafana-tempo]] —— Grafana Tempo — 用对象存储装下你所有的 trace
- [[influxdb]] —— InfluxDB — 专用时序数据库
- [[jaeger]] —— Jaeger — 分布式追踪系统
- [[k6]] —— k6 — 用 JS 写脚本的现代负载测试器
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[loki]] —— Loki — 给日志做 Prometheus，只索引标签不索引内容
- [[m3]] —— M3 — Uber 的分布式 TSDB
- [[metabase]] —— Metabase — 让非技术人查数
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[nethermind]] —— Nethermind — .NET 写的高性能以太坊客户端
- [[opensearch]] —— OpenSearch — AWS 主导的 Apache 2.0 搜索引擎分叉
- [[otel-collector]] —— OpenTelemetry Collector — 可观测性数据的统一中转站
- [[pino]] —— pino — 日志不该阻塞热路径
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[prom-client]] —— prom-client — Node 服务暴露监控指标的事实标准 SDK
- [[prometheus]] —— Prometheus — 时序监控系统
- [[questdb]] —— QuestDB — 高性能时序库
- [[superset]] —— Apache Superset — 开源 BI 平台
- [[tempo]] —— Tempo — 把分布式追踪扔进 S3 的开源后端
- [[terraform]] —— Terraform — 基础设施即代码
- [[vector]] —— Vector — Rust 写的统一可观测性数据管道
- [[victoriametrics]] —— VictoriaMetrics — 高性能 Prometheus 替代

