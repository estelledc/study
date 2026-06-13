---
title: Dremel 十年回顾 — Web 规模交互式 SQL 分析如何演化为 BigQuery
来源: https://research.google/pubs/dremel-a-decade-of-interactive-sql-analysis-at-web-scale/
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：从「单位档案室」到「全城公共查询台」

想象你所在的城市要统计**所有市民的网购行为**——订单、商品、收货地址、嵌套在订单里的每一行 SKU，数据量相当于把全市档案堆成山。

2010 年之前的 Google 内部，主流做法是：

- 数据塞进 **MapReduce**，写 Java/C++ 批处理作业；
- 大家心里默认：**「SQL 撑不住 Web 规模」**，交互式分析要么等 overnight job，要么写 Sawzall 这类专用语言。

**Dremel**（2006 年立项，2010 年 VLDB 论文公开）像在城市里建了一座**公共查询台**：分析师写一句 SQL，秒级到分钟级拿到聚合结果，不必先 ETL 进传统数仓。**这篇 2020 回顾论文**（PVLDB, pp. 3461–3472，Melnik 等原班作者）回答的是：十年过去，当初哪些设计押对了行业方向？哪些在演进中换了引擎？它们如何沉淀为 **Google BigQuery**？

类比延伸：

| 日常场景 | Dremel / BigQuery 对应 |
|----------|------------------------|
| 档案存在各分局，查一次搬一次 | **存算分离**：数据在 Colossus/GCS，算力按需租用 |
| 书在架上就能借，不必先复印进阅览室 | **In situ 分析**：数据湖上多引擎共享同一份列式文件 |
| 图书馆按「借书位」计费，不用包下整栋楼 | **Serverless**：slot 虚拟调度单元，多租户按查询付费 |
| 嵌套目录（卷→章→节）仍可按「节标题」检索 | **嵌套列存**：repetition / definition level 编码 |

---

## 这篇论文是什么

**类型**：系统架构回顾（retrospective），不是全新算法论文。

**时间线锚点**：

- **2010**：*Dremel: Interactive Analysis of Web-Scale Datasets* — 多层执行树 + 嵌套列存 + 扩展 SQL；
- **2014 前后**：存储迁移到 **Capacitor** 列式格式；shuffle 基础设施重构；
- **2020**：本文总结五条架构原则如何成为云原生分析系统「标配」，并描述向 **BigQuery** 的演化路径。

**作者核心论断**：Dremel 是较早把 **SQL、存算分离、原地分析、Serverless、嵌套列存** 五条线捆在一起量产的系统；十年后的 Snowflake、Presto/Trino、Spark SQL、ClickHouse 云版都在不同程度上复现了这套组合。

---

## 2010 年的问题：为什么需要 Dremel

Google 内部数据几乎全是 **Protocol Buffers** 嵌套结构：日志、广告点击、网页索引元数据。MapReduce 能 scale，但：

1. **开发成本高**：每个 ad hoc 问题都要写分布式 job；
2. **交互延迟 unacceptable**：分析师等批处理排期，迭代慢；
3. **嵌套数据与 SQL 割裂**：传统数仓要 flatten + ETL， schema 一变 pipeline 就断。

Dremel 的赌注：**用 SQL 直接查嵌套只读数据**，通过列式布局 + 分布式 serving tree 把聚合压到秒级。Franklin 在 2010 评论里预言「万亿行 soon 会普及」——回顾论文证实这条曲线已被 BigQuery 外部客户反复验证。

---

## 五条经受住时间考验的架构原则

### 1. SQL 重新成为大数据 API

2010 年业界流行「SQL is dead for interactive analytics」。Dremel 用扩展 SQL（点号访问嵌套字段、`RECORD` 类型）证明：**声明式查询 + 优化器** 仍是最低摩擦接口。后续 Dremel SQL 方言逐步 **ANSI 化**，并通过开源库共享给 **Cloud Spanner** 等产品。

**演进**：早期刻意**弱化 join**（依赖 protobuf 反规范化）；后期 BigQuery 补齐分布式 join、子查询、窗口函数，并引入基于新 shuffle 层的 **shuffle join**。

### 2. 存算分离（Disaggregated Storage & Compute）

最初 Dremel 是 **shared-nothing**：计算与本地磁盘绑定。迁移到 **GFS**（后 **Colossus**）后，性能一度下降；经 I/O 合并、本地缓存、预读调优后，分离架构在**弹性**与**成本**上反超本地盘方案。

收益：

- 存储与计算**独立扩缩**；
- 同一份数据可被 MapReduce、Dremel、其他引擎**并发读取**；
- 故障域分离：坏盘不拖垮整个计算池。

### 3. In situ 分析（数据湖范式先驱）

Dremel 把列式格式开放为 Google 内部库，具备两大属性：

- **Columnar**：分析型扫描友好；
- **Self-describing**：文件自带 schema，无需先 load 进专有数仓。

MapReduce job 可写列式结果，Dremel **立刻** SQL 查询——这就是现代 **data lake + multiple compute engines** 的原型。BigQuery 后来支持 Bigtable、Cloud Storage、Google Drive 等作为 join 外表。

### 4. Serverless 多租户分析

从一开始 Dremel 就是**全托管内部服务**：无 upfront 容量规划，**按用量计费**。要支撑数千内部用户、亚秒到秒级交互，必须：

- **Disaggregation**：算力、存储、内存独立伸缩；
- **Fault tolerance & restartability**：子任务确定性可重放；调度器可派发同一 task 的多个副本；
- **Virtual Scheduling Units（slots）**：调度逻辑不绑定具体机器型号，抽象为 slot（CPU+内存配额）；
- **Centralized scheduling**：取代 2010 论文的 leaf dispatcher，由 **query coordinator** 统一编排，提升隔离与利用率。

这些能力直接移植到 **BigQuery** 的 serverless 模型。

### 5. 嵌套数据的列式存储

传统列存假设 flat 表。Dremel 引入 **repetition level** 与 **definition level**，把嵌套/重复结构信息**编码进每一列**，读子字段时不必回溯祖先列。

2014 年存储层升级到 **Capacitor**（改进的嵌套列式格式），影响后续 **Parquet** 等生态（嵌套模型与 Dremel 论文一脉相承）。

---

## 核心机制详解

### Repetition Level 与 Definition Level

以嵌套记录 `Name.Language.Code` 为例（一人多种语言，每种语言多个 code）：

- **Repetition level**：当前值相对路径上，**哪一层 repeated 字段**开始了新数组元素（0 表示新 top-level 记录）；
- **Definition level**：当前值相对路径上，**有多少 optional/required 祖先已定义**（NULL 用 definition level 小于最大深度表示）。

这样任意列可**单独解码**，无需读取兄弟列——对列投影（只读 `Code`）至关重要。

### 多层 Serving 执行树（2010 设计）

```
Client → Root Server → Intermediate Servers → Leaf Servers（读 Colossus 列块）
                ↑__________________|  聚合结果向上归并
```

Leaf 扫描列块、局部聚合；中间层继续聚合；根返回最终结果。2010 论文强调 **one-pass aggregation** 为主路径——与分析师 workload 匹配。

### 十年后的执行层演化（2020 回顾重点）

| 2010 | 2020 / BigQuery |
|------|-----------------|
| Leaf 本地 dispatcher | **Centralized query coordinator** |
| 执行计划相对静态 | **Dynamic execution plan**：基数估计错了可在运行时改 plan |
| Shuffle 与 stage 紧耦合 | **Shuffle persistence layer**（基于 Colossus）：stage 解耦，可 checkpoint、抢占 worker |
| 固定 DAG | **Flexible execution DAG evolution** |

Shuffle 曾是 MapReduce 时代最贵操作之一；Dremel 团队用 Colossus 构建**持久化 shuffle 层**，使调度器能在 checkpoint 处重新分配 worker，支撑**抢占式多租户**与**更细粒度 fault recovery**。

### 查询优化

Dremel 采用**分层优化器**：规则重写 + 代价模型结合，针对嵌套列存与 serving tree 生成计划。回顾论文强调：在 disaggregated 架构下，**I/O 与 shuffle 代价模型**与 classic warehouse 不同——网络与 Colossus 读放大成为主导项。

---

## 代码示例 1：Dremel 风格 SQL 查询嵌套 protobuf 数据

以下语法贴近 2010/2020 论文中的 **nested SQL** 示例（概念演示，非特定产品方言）：

```sql
-- 统计每个国家、每种语言下，被访问过的 URL 数量
SELECT
  Name.Country,
  lang.code AS language_code,
  COUNT(DISTINCT visits.url) AS distinct_urls
FROM
  table `logs.web_access` AS t,
  UNNEST(t.Name.Language) AS lang,
  UNNEST(t.Visits) AS visits
WHERE
  visits.date BETWEEN '2020-01-01' AND '2020-01-31'
  AND visits.status = 200
GROUP BY
  Name.Country,
  language_code
ORDER BY
  distinct_urls DESC
LIMIT 100;
```

要点：

- **`Name.Language`** 是 repeated nested field，需 `UNNEST` 展开（现代 BigQuery 语法；2010 论文用点号与特殊聚合语法表达同类语义）；
- 查询**只读**嵌套列存文件，无需事先 flatten 成星型模式；
- 优化器可下推 `WHERE visits.status = 200` 到 leaf，利用列块 **zone map / 统计信息** 跳过无关 row group。

---

## 代码示例 2：Repetition / Definition Level 编码（简化示意）

假设 schema：

```text
message Person {
  required string Name;
  repeated Phone { optional string Number; }
}
```

两条记录：

```text
{Name: "Alice", Phone: [{Number: "111"}, {Number: "222"}]}
{Name: "Bob",   Phone: [{Number: null}]}
```

`Phone.Number` 列在 Dremel 编码中可能类似（值 + rep + def）：

```python
# 伪代码：展示三列并行数组如何表示嵌套 NULL 与 repeated
values = ["111", "222", None, "Bob端无有效号码时仍占位"]
repetition_levels = [1, 1, 0, 1]   # 1=新 Phone 元素, 0=新 Person
definition_levels = [2, 2, 1, 1]   # Phone 存在但 Number 为 NULL 时 def 较低

def decode_phone_numbers(values, rep, defn, max_def=2):
    """从单列还原当前 Person 下的 Number 列表（教学用简化解码器）"""
    numbers = []
    current = []
    for v, r, d in zip(values, rep, defn):
        if r == 0:
            if current:
                numbers.append(current)
            current = []
        if d == max_def:
            current.append(v)
        elif d > 0:
            current.append(None)  # optional 未定义
    if current:
        numbers.append(current)
    return numbers

# decode 结果示意: [["111","222"], [None]]
```

**为什么重要**：分析查询常只读 `Phone.Number` 一列；rep/def 让引擎**无需读 `Name` 或 `Phone` 的其他子列**即可重建嵌套结构，并与列压缩（RLE、字典编码）叠加。

---

## 代码示例 3：Serverless Slot 调度（概念伪代码）

回顾论文强调 **slot** 抽象如何支撑多租户 serverless：

```python
class QueryCoordinator:
    def __init__(self, slot_pool: SlotPool):
        self.slots = slot_pool  # 全局虚拟 CPU+内存单元，非绑定具体 VM

    def execute(self, query_plan: ExecutionDAG):
        root = query_plan.root_stage()
        # 中心化调度：按 stage 向 slot_pool 申请 workers
        while not query_plan.done():
            stage = query_plan.next_ready_stage()
            slots_needed = stage.estimate_slots(cardinality=stage.stats)
            workers = self.slots.acquire(
                count=slots_needed,
                priority=query_plan.tenant_fairness_weight,
            )
            # shuffle 中间结果持久化到 Colossus，便于抢占与重试
            handles = [
                w.run_deterministic(stage, shuffle_sink=ColossusShuffle())
                for w in workers
            ]
            stage_result = self.wait_and_merge(handles, allow_speculative_dup=True)
            query_plan.mark_complete(stage, stage_result)
            self.slots.release(workers)
        return query_plan.final_result()
```

与 2010 leaf dispatcher 相比：**调度决策集中**、**shuffle 可持久化**、**任务确定性可重放**——三者共同支撑 BigQuery 式「提交查询即走，无需告诉系统你要多少台机器」。

---

## 与 2010 原论文的对照阅读

| 主题 | 2010 原论文 | 2020 十年回顾 |
|------|-------------|---------------|
| 存储位置 | 本地盘 → 正在迁 GFS | Colossus + Capacitor 成熟 |
| Join | 基本回避 | 分布式 shuffle join |
| 调度 | Leaf dispatcher | Central coordinator + slots |
| 产品形态 | Google 内部服务 | BigQuery 对外 Serverless |
| 行业语境 | SQL 式微 | SQL 一统数据平台 API |

零基础读者建议：**先读 2020 回顾建立地图，再读 2010 原论文看 serving tree 与 rep/def 细节**。

---

## 对现代数据栈的影响

1. **BigQuery** 直接 lineage 自 Dremel；
2. **Parquet / Arrow** 嵌套模型与 rep/def 思想可追溯至 Dremel 2010；
3. **Snowflake、Redshift Spectrum、Athena** 等「对象存储 + 弹性计算 + SQL」_triad_ 与本文五条原则同构；
4. **Lakehouse**（Delta/Iceberg + 多引擎）是 in situ 分析的工业化版本；
5. **「SQL doesn't scale」** 作为 2000 年代迷思，被 Dremel 系列论文系统性反驳。

---

## 局限与未竟之处

回顾论文也诚实提到：

- **超大 join** 仍是研究与工程热点；shuffle join 依赖内部网络优化，不完全可移植；
- **Disaggregated 存储** 对极短查询仍可能 I/O 放大，需 aggressive caching；
- **多引擎写同一 data lake** 时的 **schema 演化、ACID 表格式** 在 2020 时仍靠外部系统（Iceberg 等）补齐；
- 内部细节（Capacitor 精确布局、slot 定价模型）在公开论文中着墨有限。

---

## 自测清单（零基础）

1. 用一句话向同事解释：**Dremel 2020 回顾论文在讲什么？**（答案方向：架构原则十年验证 + BigQuery 演化。）
2. **存算分离** 相比本地盘 shared-nothing 的两个优点、一个代价？
3. **Repetition level** 与 **definition level** 分别解决什么问题？
4. 为什么说 Dremel 是 **data lake in situ 分析** 的早期实例？
5. **Slot** 调度与 2010 leaf dispatcher 的核心区别？

---

## 延伸阅读

- Melnik et al., *Dremel: Interactive Analysis of Web-Scale Datasets*, VLDB 2010 — 原始系统设计。
- Seattle Report on Database Research — 2020 回顾引用的行业趋势框架。
- 本仓库笔记：[列式存储格式实证评估](./columnar-storage-formats-2023.md)、[Lakehouse](./lakehouse-2021.md) — 与嵌套列存、湖仓范式衔接。
- Google Research 原文：https://research.google/pubs/dremel-a-decade-of-interactive-sql-analysis-at-web-scale/

---

## 一句话总结

**Dremel 十年回顾** 不是新算法炫耀，而是一份「架构预言书」的验收报告：SQL、存算分离、原地列式分析、Serverless 多租户与嵌套列存——这五条在 2010 年捆绑出现在 Google 内部查询引擎里，十年后被 BigQuery 与整个云分析行业证明为**默认正确选项**；理解它，等于理解现代「写 SQL 查对象存储上的 PB 级嵌套数据」从何而来。
