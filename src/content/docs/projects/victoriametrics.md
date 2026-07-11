---
title: VictoriaMetrics — 高性能 Prometheus 替代
来源: https://github.com/VictoriaMetrics/VictoriaMetrics
日期: 2026-05-29
分类: 监控 / 时序数据库
难度: 中级
---

## 是什么

VictoriaMetrics（**VM**）是 Aliaksandr Valialkin 2018 年用 Go 写的 **Prometheus 兼容但更快更省**的时序数据库。日常类比：

- [[prometheus]] 是单店开支大——一个老板顾全店，内存吃货，存 30 天数据动辄几十 GB 内存
- VictoriaMetrics 是连锁店成本控制——同样数据往往几 GB 内存搞定，规模越大边际成本越低

VM 不是从头发明轮子。它对外说："Prometheus 的 API、PromQL、抓取协议我全兼容，你 Grafana 数据源切个 URL 就好——但内部存储我重写了。"

## 为什么重要

不理解 VM，下面这些场景没法处理：

- 为什么 Adidas / Roblox / Walmart 等会选 VM 而不是无限堆 Prometheus 实例——单实例垂直扩展有天花板
- 为什么同样保留期下 VM 往往比 Prometheus 更省内存与磁盘——压缩与存储结构重写
- 为什么 PromQL 写起来差不多但 VM 多了几个函数——MetricsQL 是 PromQL 超集
- 为什么长期存储除了 Thanos / Cortex / Mimir，很多人也会评估 VM——兼容 Prom 且运维更轻

## 核心要点

VM 的设计可以拆成 **三块**：

1. **单机合一、集群拆角色**：单机版一个 `victoria-metrics` 进程同时做写入、存储、查询（像一人店）。集群版拆成 `vminsert`（收货分拣）、`vmstorage`（仓库）、`vmselect`（查账）。`vmagent` 始终是**独立**采集二进制，不并进单机进程。

2. **高压缩存储**：类比把流水账压成速记本。基于 Gorilla（Facebook 2015）再改进，磁盘占用常比 Prometheus TSDB 低数倍；同样量级指标，磁盘与内存都更省。

3. **MetricsQL**：类比普通话（PromQL）加方言词。原有 PromQL 能跑，还多了 `keep_last_value`、`rollup_rate`、`histogram_quantiles` 等函数。

## 实践案例

### 案例 1：Single-node 一行起完整 VM

最快上手：

```bash
docker run -p 8428:8428 victoriametrics/victoria-metrics
```

**逐部分解释**：

- 镜像是单机版：写入 / 存储 / 查询在同一进程
- `8428` 同时提供 `/api/v1/write`、`/api/v1/query`、`/vmui`
- Grafana 数据源选 Prometheus，URL 填 `http://localhost:8428`
- 现有 dashboard / 告警规则通常可直接复用，不必改 PromQL

### 案例 2：Cluster 最小三组件

业务量上来后切集群。本机三进程最小演示：

```bash
# 终端 1：仓库（对 insert 开 8400，对 select 开 8401）
./vmstorage -storageDataPath=./vmdata -retentionPeriod=12
# 终端 2：分拣（HTTP 默认 8480）
./vminsert -storageNode=127.0.0.1:8400
# 终端 3：查账（HTTP 默认 8481）
./vmselect -storageNode=127.0.0.1:8401
```

**逐部分解释**：

- `vmstorage`：**有状态**分片，节点互不通信，各管各的盘
- `vminsert` 连 storage 的 **8400**；`vmselect` 连 **8401**（别混）
- Grafana 指向 `vmselect` 的 HTTP 口（8481）
- 生产常再加独立 `vmagent` 做 scrape / remote_write

### 案例 3：从 Prometheus 历史数据迁移

切到 VM 不丢历史：

```bash
curl -XPOST http://prometheus:9090/api/v1/admin/tsdb/snapshot
vmctl prometheus \
  --prom-snapshot=/path/to/snapshot \
  --vm-addr=http://victoria-metrics:8428
```

**逐部分解释**：先让 Prometheus 打 snapshot，再用官方 `vmctl` 导入；也支持 OpenTSDB / InfluxDB / Graphite。

## 踩过的坑

1. **Single-node vs Cluster 配置完全不同**：单机端口 8428；集群常用 `vminsert` 8480 / `vmselect` 8481 / `vmstorage` 8482。升集群不是改 flag，要重新部署。
2. **拉长 retention 不会复活已删数据**：按月 partition 整目录删；`-retentionPeriod` 从 12 改 24 救不回已删分区。
3. **Pull vs Push 选错**：VM **不主动 scrape**；要 `vmagent` 抓取，或应用 push 到 `/api/v1/import`。只起 VM 会"看不到指标"。
4. **VictoriaLogs / VictoriaTraces 别混**：同团队产品，LogsQL ≠ MetricsQL，端口与镜像都不同。

## 适用 vs 不适用场景

**适用**：

- Prometheus 内存 / 磁盘吃紧但不想换栈——drop-in 兼容
- 多机房聚合、长期存储（> 30 天）——高压缩 + 按月 partition
- 已有 PromQL dashboard / alert——零迁移成本
- 写入低于约百万 samples/s、可垂直扩展时——官方更推荐先试 single-node

**不适用**：

- 要日志 / 追踪搜索 → VictoriaLogs / Loki / ClickHouse，不是 VM
- 极端写入 + 复杂 join 查询 → 评估 ClickHouse / Druid
- 团队已深耕 InfluxDB / OpenTSDB 且无 Prom 包袱 → VM 主价值是兼容 Prom
- 需要 SQL → 只有 PromQL / MetricsQL

## 历史小故事（可跳过）

- **2018 年**：Aliaksandr Valialkin（前 Cloudflare）创立 VictoriaMetrics，痛点是 Prometheus 内存成本；早期有闭源商业版。
- **2019 年**：v1.0 开源（Apache 2.0），single-node 上线。
- **2021 年**：Cluster 模式 GA，开始出现 Adidas / Roblox 等公开用户。
- **2024 年**：持续跟进 Prometheus 生态（OpenMetrics、native histograms、乱序样本等）。

团队规模一直不大，但发版频率高、issue 响应快——典型工程师驱动的基础设施开源。

## 学到什么

1. **兼容性是最强迁移杠杆**——完全兼容 PromQL，企业切换成本接近零
2. **存储引擎决定时序库上限**——压缩 + 按时间分 partition 是工业标配
3. **按 IO 模式拆角色**——写入（insert）与查询（select）可独立扩容
4. **高基数标签是真敌人**——业务侧仍要约束 `pod` / `request_id` 类爆炸维度

## 延伸阅读

- 官方文档：[VictoriaMetrics Docs](https://docs.victoriametrics.com/)
- 集群说明：[Cluster version](https://docs.victoriametrics.com/cluster-victoriametrics/)
- 团队博客：[VictoriaMetrics Blog](https://victoriametrics.com/blog/)
- 源码：[GitHub - VictoriaMetrics/VictoriaMetrics](https://github.com/VictoriaMetrics/VictoriaMetrics)
- 相关笔记：[[prometheus]]、[[thanos]]、[[grafana]]

## 关联

- [[prometheus]] —— 兼容目标：PromQL / scrape / 数据模型
- [[grafana]] —— 最常见前端，数据源切 URL 即可
- [[thanos]] —— Prometheus 长期存储另一路线（sidecar + object storage）
- [[cortex]] —— 多租户 Prometheus-as-a-Service 路线
- [[m3]] —— Uber 分布式 TSDB，同属大规模 metrics 存储
- [[opentsdb]] —— 早期 HBase 上的分布式 TSDB，vmctl 可迁出

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[m3]] —— M3 — Uber 的分布式 TSDB
- [[opentsdb]] —— OpenTSDB — HBase 上的第一代分布式 TSDB
