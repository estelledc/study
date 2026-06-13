---
title: Loki — 给日志做 Prometheus，只索引标签不索引内容
来源: https://github.com/grafana/loki
日期: 2026-06-01
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Loki 是 Grafana Labs 2018 年开源的日志聚合系统。一句话定位：**"Like Prometheus, but for logs"**——把 [[prometheus]] 那套 label 思路从指标搬到日志上。

日常类比：
- **传统日志系统**（ELK / [[elasticsearch]]）像图书管理员把每本书每个词都做卡片索引——查得快，但索引卡和书一样厚甚至更厚
- **Loki** 像图书馆只在书脊贴几个标签（作者、年份、类别），书的内容直接堆仓库——查的时候先按标签找到几本书，再翻内容找词

它和 [[prometheus]] 共用一套 label 体系。Grafana 看板里指标告警一跳，就能跳到同一组 label 的日志，查问题不用换工具。

## 为什么重要

- **存储成本拉开 10x**：ELK 索引开销约日志体积的 50-200%，Loki 只占 2-5%（因为不全文倒排）
- **K8s 日志聚合事实选项**：Promtail / Vector DaemonSet 自动抓 pod 日志、贴 namespace/pod/container label，开箱可用
- **和 Prometheus + Grafana 三件套配齐**：监控告警 → 跳日志 → 跳 trace，全在一个 label 体系里
- **CNCF 沙箱毕业候选**：Grafana 系（Prometheus 生态、[[grafana-tempo]]、Loki）已成云原生可观测性默认栈
- **写 LogQL 是 SRE 新硬指标**：和 PromQL 同源，会一个就会另一个

## 核心要点

Loki 的设计可以拆成 **三个反直觉决定**：

1. **不索引日志内容，只索引一组 label**：`{app="api", env="prod"}` 这组 label 的所有日志归到一个 stream，stream 内的内容直接压缩成 chunk 写对象存储。查询时先用 label 缩小范围，再 grep。

2. **存储分层走对象存储**：chunk（gzip / snappy 压缩）写到 S3 / GCS / 本地盘，索引写 BoltDB（老）或 TSDB（新）。计算和存储解耦，Querier 可以横向扩展并行扫 chunk。

3. **三组件分工**：
   - **Distributor** 收日志、按 label hash 路由
   - **Ingester** 攒 chunk、写存储
   - **Querier** 接 LogQL、拉 chunk、grep

LogQL 长这样：

```logql
{app="api", env="prod"} |= "error" | json | status >= 500
```

读法："找 app=api 且 env=prod 这组流，包含 error，按 JSON 解析，留 status >= 500 的行"。前半 label 选择器走索引，后半内容过滤直接扫 chunk。

## 实践案例

### 案例 1：起一套 Loki + Grafana 看日志

```yaml
# docker-compose.yml
services:
  loki:
    image: grafana/loki:3.0
    ports: ["3100:3100"]
  promtail:
    image: grafana/promtail:3.0
    volumes:
      - /var/log:/var/log
      - ./promtail.yml:/etc/promtail/config.yml
  grafana:
    image: grafana/grafana
    ports: ["3000:3000"]
```

`promtail.yml` 让 agent 抓 `/var/log/*.log`、贴 `job=varlog` label 推给 Loki。Grafana 加 Loki 数据源，Explore 里就能写 LogQL 查了。

### 案例 2：从指标告警跳到对应日志

Prometheus 告警："订单服务 5xx 突然飙高"。Grafana 看板里这条告警的 panel 关联了一个 LogQL 查询：

```logql
{app="order-service", env="prod"} |= "ERROR"
```

点告警 → 跳 Explore → 自动填好同一组 label → 直接看 5xx 时间窗内的报错日志。这是 Loki 比 ELK 真正赢的体验：**label 体系打通指标和日志**。

### 案例 3：高基数 label 把自己玩死

新人常见错误：

```yaml
# 错误示范：把 trace_id / user_id 做 label
- labels:
    trace_id: '{{ .trace_id }}'
    user_id: '{{ .user_id }}'
```

每个 trace_id / user_id 都是一个新 stream。一天 1000 万请求 = 1000 万 stream。Ingester 内存爆掉、查询变慢、Loki 直接拒收。

正确做法：trace_id / user_id 留在日志正文里，用 LogQL `|= "trace_id=xxx"` 或 `| json | trace_id="xxx"` 在内容层面过滤。**label 是粗筛，正文是细筛**。

## 踩过的坑

1. **Series cardinality 是 Loki 第一杀手**：和 Prometheus 同病——label 取值集合必须有限可枚举。namespace / app / env / level OK；trace_id / user_id / 完整 URL 不行。Loki 3.0 的 Bloom filter 缓解了 needle-in-haystack 全文搜，但治不了 cardinality 爆炸。

2. **大时间范围全文搜很慢**：要拉的 chunk 数量随时间线性涨。Querier 可以并行扫，但 S3 拉数据有延迟。**对策**：尽量靠 label 缩小到几个 stream，再做内容过滤；recording rule 把高频查询预计算成指标。

3. **Promtail 抓 K8s 日志默认 label 太多**：pod 重启就换 pod_name → 短期内大量新 stream。**解法**：用 `relabel_configs` 把 pod_name 这种瞬时 label 丢掉，只保留稳定的 namespace + app。

4. **本地盘存储不是 HA**：单机 Loki 挂了就断数据。生产要 microservices 模式分组件部署 + 对象存储 + replication factor ≥ 3。

5. **LogQL 不是 SQL**：`|=` 是包含、`!=` 是不包含、`|~` 是正则、`!~` 是正则反向。和 grep / SQL 都有差异，新人容易写错。

## 适用 vs 不适用

**适用**：
- K8s / 容器化集群日志聚合（pod 日志天然带稳定 label）
- 已经在用 Prometheus + Grafana，想日志和指标 label 打通
- 中小规模日志量（< 几 TB/天），不需要毫秒级全文搜
- 成本敏感场景（对象存储比 ELK 集群便宜一个数量级）

**不适用**：
- 需要任意词毫秒级全文搜（搜索引擎类业务）→ 选 [[elasticsearch]] / [[opensearch]]
- 高基数维度分析（按 user_id / trace_id 任意切片）→ 选 [[clickhouse]]
- 极小日志量（< 10 GB/月）+ 简单需求 → 直接 grep 文件 + journalctl 可能更省事
- 强一致性审计日志（金融合规要 WORM）→ Loki 不保证

## 历史小故事

- **2018 KubeCon Seattle**：Grafana Labs 的 David Kaltschmidt + Tom Wilkie 发布 Loki 0.0.1，灵感来自他们之前做的 Cortex（Prometheus 长期存储）
- **2019 v0.4**：引入 LogQL 第一版
- **2020 v1.0 GA**：进入 CNCF 候选，Promtail 成为默认 agent
- **2022 v2.5**：引入 unwrap / metric queries——LogQL 可以直接出指标
- **2024 v3.0**：Bloom filter 加速 needle-in-haystack，TSDB index 替代 BoltDB，性能大跨步

## 学到什么

1. **不索引的索引是好索引**：花在索引上的存储 = 浪费在不查的字段上。Loki 反过来——索引只覆盖必查的几个 label，其他全靠扫，整体成本反而低
2. **label 体系是可观测性的通用骨架**：[[prometheus]] 用 label 切指标，Loki 用同一套 label 切日志，[[grafana-tempo]] 用同一套 label 切 trace——label 就是云原生时代的 schema
3. **存储和计算分离**：chunk 在 S3，Querier 无状态、随便扩。这套架构 Cortex / Mimir / Tempo / Loki 一脉相承
4. **基数是设计约束不是性能问题**：series 数 = 各 label 值的笛卡尔积，这是 schema 决策不是参数调优

## 延伸阅读

- 官方上手：[Loki Getting Started](https://grafana.com/docs/loki/latest/get-started/)
- LogQL 速查：[LogQL Cheat Sheet](https://grafana.com/docs/loki/latest/query/)
- 设计论文级博客：[Loki: Prometheus-inspired, open source observability for logs](https://grafana.com/blog/2018/12/12/loki-prometheus-inspired-open-source-logging-for-cloud-native/)
- [[prometheus]] —— Loki 的精神兄弟，共享 label 体系
- [[grafana-tempo]] —— 同一套架构搬到 trace 上
- [[elasticsearch]] —— 全文搜索路线，Loki 的对照组

## 关联

- [[prometheus]] —— Loki 直接复用 PromQL 的 label 选择器语法
- [[grafana]] —— Loki 默认 UI，Explore 面板就是 LogQL 编辑器
- [[grafana-tempo]] —— trace 走 Tempo，日志走 Loki，指标走 Prometheus，三件套同 label
- [[kubernetes]] —— Promtail / Vector DaemonSet 是 K8s 日志聚合的常见组合
- [[elasticsearch]] —— 全文搜需求选 ES，成本和 label 打通选 Loki
- [[clickhouse]] —— 高基数事件分析的互补选项
- [[opentelemetry]] —— OTel logs signal 可以直接推给 Loki
