---
title: VictoriaMetrics — 高性能 Prometheus 替代
来源: https://github.com/VictoriaMetrics/VictoriaMetrics
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

VictoriaMetrics（**VM**）是 Aliaksandr Valialkin 2018 年用 Go 写的 **Prometheus 兼容但更快更省**的时序数据库。日常类比：

- [[prometheus]] 是单店开支大——一个老板顾全店，内存吃货，存 30 天数据动辄 50GB 内存
- VictoriaMetrics 是连锁店成本控制——同样数据 7GB 内存搞定，门店越多边际成本越低

VM 不是从头发明轮子。它对外说："Prometheus 的 API、PromQL、抓取协议我全兼容，你 Grafana 数据源切个 URL 就好——但内部存储我重写了。"

## 为什么重要

不理解 VM，下面这些场景没法处理：

- 为什么 Adidas / Roblox / Walmart 用 VM 而不是直接堆 Prometheus 实例——单实例瓶颈
- 为什么 50GB 内存的 Prometheus 换成 7GB 内存的 VM——内部压缩 + 数据结构重写
- 为什么 PromQL 写起来差不多但 VM 多了几个函数——MetricsQL 是 PromQL 超集
- 为什么"Prometheus 长期存储"的标准方案不再是 Thanos / Cortex 而是 VM

## 核心要点

VM 的设计可以拆成 **三块**：

1. **单 binary 多角色**：一个 `victoria-metrics` 二进制可以当 4 种组件跑——`vmagent`（采集）、`vminsert`（写入路由）、`vmstorage`（存储）、`vmselect`（查询）。Single-node 模式四角色合一；Cluster 模式分四个进程。

2. **高压缩存储**：基于 Gorilla 论文（Facebook 2015）+ 自家改进，时序数据压缩比 Prometheus 的 TSDB 高 2-3 倍。同样 1 亿条 metrics，Prom 占 100GB，VM 占 30-50GB。

3. **MetricsQL**：PromQL 的超集——你写的 PromQL 直接能跑，但多了 `keep_last_value`、`rollup_rate`、`histogram_quantiles` 这些 PromQL 缺的函数。

## 实践案例

### 案例 1：Single-node 一行起完整 VM

最快上手方式：

```bash
docker run -p 8428:8428 victoriametrics/victoria-metrics
```

8428 端口同时开放：

- Prometheus 兼容写入（`/api/v1/write`、`/api/v1/import`）
- PromQL 查询（`/api/v1/query`、`/api/v1/query_range`）
- Web UI（`/vmui` 看图表、查 metrics）

Grafana 数据源选 "Prometheus"，URL 填 `http://localhost:8428`，**所有现有 dashboard 直接能用**。

### 案例 2：Cluster 三组件分工

业务规模上来后 single-node 顶不住，切 Cluster 模式。三类组件：

- `vmstorage`：存数据。每个节点存一份，互不通信（无状态分片）
- `vminsert`：接受写入，按 hash 分发给 vmstorage
- `vmselect`：处理查询，并行从所有 vmstorage 拉数据再聚合

部署形态：

```
[Prom / vmagent] → vminsert (3 副本) → vmstorage (5 节点)
                                              ↑
                                       vmselect (3 副本) ← Grafana
```

横向扩容只加 vmstorage 节点，vminsert / vmselect 跟着加副本。

### 案例 3：从 Prometheus 历史数据迁移

切到 VM 不丢历史数据：

```bash
# 1. Prometheus 打 snapshot
curl -XPOST http://prometheus:9090/api/v1/admin/tsdb/snapshot

# 2. vmctl 一行导入
vmctl prometheus \
  --prom-snapshot=/path/to/snapshot \
  --vm-addr=http://victoria-metrics:8428
```

vmctl 是官方迁移工具，支持 Prometheus / OpenTSDB / InfluxDB / Graphite 多种来源。

## 踩过的坑

1. **Single-node vs Cluster 配置完全不同**：Single-node 用 `victoria-metrics` 二进制，端口 8428；Cluster 用 `vminsert` / `vmselect` / `vmstorage` 三个二进制，端口 8480 / 8481 / 8482。配置文件、URL 路径、监控 metric 名字都不一样。从 single 升 cluster 不是改 flag——要重新部署。

2. **Long-term retention 改了之后旧数据保留行为复杂**：`-retentionPeriod=12` 改成 `24` 不会"复活"已删除数据。VM 按月分 partition，retention 触发是按 partition 删整个目录——已经删了的回不来。

3. **Pull vs Push 模式选错**：VM 自己**不主动 scrape**，要么部署 vmagent 模拟 Prometheus 抓取行为，要么应用直接 HTTP push 到 `/api/v1/import`。新人常装好 VM 发现"看不到任何指标"——因为没 vmagent，VM 也不知道去哪抓。

4. **VictoriaLogs / VictoriaMetrics 混淆**：同一团队还做了 VictoriaLogs（日志）和 VictoriaTraces（追踪），三个产品都叫 "Victoria*"。安装包、端口、查询语言都不同——VictoriaLogs 用 LogsQL，不是 MetricsQL。别 docker pull 错。

## 适用 vs 不适用场景

**适用**：

- Prometheus 内存 / 磁盘吃不消但又不想换栈——VM 是 drop-in replacement
- 多 cluster / 多机房聚合监控——VM Cluster 天然多副本
- 长期存储（> 30 天）——VM 高压缩 + 按月 partition，存几年都不慌
- 已有 PromQL dashboard / alert 规则——直接复用，零迁移成本

**不适用**：

- 想要日志搜索 / 追踪 → 用 VictoriaLogs / Loki / ClickHouse，不是 VM
- 极端写入（百万 series/s）+ 极端查询（复杂 join） → 评估 ClickHouse / Druid，VM 偏向"轻查询重写入"
- 团队已用 InfluxDB / OpenTSDB 且没历史包袱 → 那俩各有生态，VM 主要价值是"兼容 Prom"
- 需要 SQL 查询 → VM 只支持 PromQL / MetricsQL，没 SQL

## 历史小故事（可跳过）

- **2018 年**：Aliaksandr Valialkin（前 Cloudflare 工程师）创立 VictoriaMetrics，源于"Prometheus 内存太贵"的实战痛点。最早是闭源商业版。
- **2019 年**：v1.0 开源（Apache 2.0）。Single-node 模式上线。
- **2021 年**：Cluster 模式 GA，开始有 Adidas / Roblox 等大客户。
- **2024 年**：v1.105 与 Prometheus 2.x 完全兼容，包括 OpenMetrics、native histograms、out-of-order samples。

VM 团队规模一直很小（< 20 人），但每月稳定发版，issue 响应快——典型的"工程师驱动"开源项目。

## 学到什么

1. **兼容性是最强的迁移杠杆**——VM 没创新查询语言，反而完全兼容 PromQL，让企业切换零成本
2. **存储引擎是时序数据库的命门**——Gorilla 压缩 + 列式 + 按时间分 partition 是工业级标配
3. **单 binary 多角色** 是简化运维的好设计——开发期一个进程跑，生产期分四个进程跑，代码不变
4. **小团队 + 高频迭代** 也能做基础设施级开源——不是只有 Google / Facebook 才能做监控
5. **历史 series 高基数是真敌人**：标签维度爆炸（pod_name + container_id + request_id 三件套）会让任何时序库爆掉，VM 的"Inverted Index 按 label 分桶"是缓解办法但不解决根因，业务侧仍要约束高基数 label
6. **写入路径与查询路径分离**：vminsert / vmstorage / vmselect 拆三角色，让"高吞吐写入" 与"复杂查询" 可以独立 scale——这种"按 IO pattern 切角色" 的设计在所有时序库（InfluxDB / Prometheus / TimescaleDB）都看得到

## 延伸阅读

- 官方文档：[VictoriaMetrics Docs](https://docs.victoriametrics.com/)（部署、配置、迁移全在这）
- 团队博客：[VictoriaMetrics Blog](https://victoriametrics.com/blog/)（有详细 benchmark 与 Prom 对比）
- 源码：[GitHub - VictoriaMetrics/VictoriaMetrics](https://github.com/VictoriaMetrics/VictoriaMetrics)（Go 源码，结构清晰）

## 关联

- [[prometheus]] —— VM 的兼容目标，PromQL / scrape 协议 / 数据模型全照搬
- [[grafana]] —— 最常见的 VM 前端，数据源切换零成本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[grafana]] —— Grafana — 监控可视化看板
- [[m3]] —— M3 — Uber 的分布式 TSDB
- [[opentsdb]] —— OpenTSDB — HBase 上的第一代分布式 TSDB
- [[prometheus]] —— Prometheus — 时序监控系统

