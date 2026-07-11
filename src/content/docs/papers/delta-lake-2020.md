---
title: Delta Lake 2020 — 给对象存储补上事务日志
来源: 'Michael Armbrust et al., "Delta Lake: High-Performance ACID Table Storage over Cloud Object Stores", PVLDB 2020'
日期: 2026-05-29
分类: databases
难度: 中级
---

## 是什么

Delta Lake 是一套**把云对象存储里的文件目录，包装成可靠数据库表**的存储格式和访问协议。日常类比：对象存储像一个巨大仓库，里面堆着很多纸箱；Delta Lake 不直接相信"仓库当前看见哪些纸箱"，而是在门口放一本按页编号的账本，哪一页说哪些纸箱属于第几个版本，大家就按账本办事。

普通数据湖常把表存成一堆 Parquet 文件：写入快、便宜、很多工具都能读。但一旦要更新、删除、回滚、审计，问题就来了：写 100 个文件时中途失败怎么办？另一个读者会不会只看到其中 50 个？要找哪些文件属于这张表，是不是每次都要把目录扫一遍？

Delta Lake 的答案是：**数据仍然放在 Parquet 文件里，表状态放进 `_delta_log` 事务日志里**。每次写入只追加一个新日志文件，里面记录 `add` / `remove` / `metadata` 等动作；读者先重放日志得到一个稳定快照，再去读对应 Parquet 文件。

所以它不是把数据湖替换成数据库，而是在文件湖旁边加了一层"可信目录"。
这个目录足够小，可以频繁更新；数据文件足够大，可以继续享受对象存储的吞吐。
两边分工清楚，才是这篇论文的关键。

## 为什么重要

不理解 Delta Lake，下面这些事都没法解释：

- 为什么"数据湖"便宜又弹性，却长期被认为不如数据库可靠
- 为什么对象存储的 `LIST` 操作会成为大表查询的性能瓶颈
- 为什么 `DELETE FROM table WHERE user_id=...` 在纯 Parquet 目录里很危险
- 为什么 Lakehouse 会把数据湖和数仓两个词硬拼在一起

## 核心要点

Delta Lake 的设计可以拆成 **三层直觉**：

1. **Parquet 负责装数据**：真正的行列数据仍然写成不可变 Parquet 文件。类比：纸箱里装商品，箱子本身尽量不拆开重写。

2. **事务日志负责判定"哪些箱子算数"**：`_delta_log/000003.json` 这种文件按版本编号追加，记录新加了哪些文件、逻辑删除了哪些文件。类比：仓库账本说"第 3 版货架包含 A、B，不再包含 C"。

3. **检查点和统计信息负责快**：日志会周期性压成 Parquet checkpoint，`add` 记录还带 min/max/null count 等统计。类比：账本每十页做一次目录，还在目录里标出每箱大概装什么，找货不用开所有箱子。

这套组合把对象存储的优点留下来：低成本、弹性、开放格式；同时补上数据库世界最想要的东西：原子提交、一致快照、时间旅行和审计历史。

## 实践案例

### 案例 1：一次写入不是"多写几个文件"，而是"追加一页日志"

```text
mytable/
  part-001.parquet
  part-002.parquet
  _delta_log/
    000000.json
    000001.json
```

**逐部分解释**：

- `part-001.parquet` / `part-002.parquet` 是真正的数据文件
- `_delta_log/000001.json` 记录这一版新增或移除了哪些文件
- 读表时先读日志，算出"当前版本应该看哪些 Parquet"
- 所以失败的中间文件只要没进入日志，对读者就等于不存在

### 案例 2：逻辑删除靠 remove 记录，不是立刻删对象

```json
{"add": {"path": "part-003.parquet", "numRecords": 1000}}
{"remove": {"path": "part-001.parquet", "deletionTimestamp": 1710000000}}
```

**逐部分解释**：

- `add` 表示某个 Parquet 文件进入表的当前版本
- `remove` 表示某个文件从新版本里消失，但底层对象可以晚点物理删除
- 旧读者如果已经拿到旧快照，还能继续读 `part-001.parquet`
- 这就是 MVCC 的味道：新旧版本并存，用日志决定每个读者看到哪一版

### 案例 3：查询可以靠统计信息少读文件

```sql
SELECT *
FROM events
WHERE user_id = 42;
```

**逐部分解释**：

- Delta 的 `add` 记录可以保存每个文件里 `user_id` 的最小值和最大值
- 如果某个文件的范围是 `1000..2000`，查询 `user_id = 42` 就能跳过它
- Z-order 会把多列相关的数据重新排布，让多个维度的 min/max 都更有用
- 论文实验里，Z-order 在多维查询上平均能跳过更多 Parquet 对象

## 踩过的坑

1. **以为 Delta Lake 是一个数据库服务器**：它主要是存储格式和协议，不是必须常驻的中心服务，读写客户端直接和对象存储交互。
2. **把 Parquet 文件目录当成表状态**：真正可信的是 `_delta_log`，目录里多出来的临时文件不一定属于任何版本。
3. **以为 ACID 等于跨所有表事务**：论文里的强保证主要是单表事务，多表原子提交不是这个设计的核心能力。
4. **忽略对象存储延迟**：Delta 能容忍最终一致和慢 `LIST`，但做不到毫秒级流处理延迟，秒级更现实。

## 适用 vs 不适用场景

**适用**：

- TB 到 PB 级分析表，数据放在 S3 / Azure Blob / GCS 等对象存储上
- ETL、BI、机器学习特征、日志分析等读多写少的大批量负载
- 需要 `MERGE` / `DELETE` / `UPSERT` / time travel / audit history 的数据湖
- 多个计算引擎共享同一份开放数据，而不想被某个封闭数仓锁住

**不适用**：

- 高并发小事务 OLTP，例如订单支付、库存扣减、银行记账
- 毫秒级流式链路，底层对象存储的提交和可见延迟会拖后腿
- 需要强跨表事务的场景，单表日志会限制事务边界
- 小数据集和单机分析，直接用 DuckDB / SQLite / 普通 Parquet 可能更简单

## 历史小故事（可跳过）

- **2010 年前后**：Hive 把"表 = HDFS 上的文件目录"做成大数据标配，便宜但弱事务。
- **2016 年**：Delta Lake 的早期设计在 Databricks 内部开始使用，目标是让 Spark 数据湖更可靠。
- **2018-2019 年**：Apache Hudi、Apache Iceberg、Delta Lake 这类开放表格式一起成熟，业界开始叫它们 Lakehouse 的底座。
- **2020 年**：本论文发表于 PVLDB，系统解释了如何只靠对象存储操作实现单表 ACID 和高性能查询。
- **之后几年**：Delta、Iceberg、Hudi 成为云数据平台的核心格式选择，争论焦点从"要不要事务日志"变成"谁的协议和生态更开放"。

## 学到什么

1. **对象存储缺的不是容量，而是表语义**：容量、带宽和成本已经很好，难点在"哪些文件构成同一张表的同一版本"。
2. **事务日志是把文件堆变成数据库表的最小杠杆**：只要日志追加是有序的，客户端就能围绕它实现快照和提交冲突检测。
3. **开放格式和数据库能力可以叠加**：Parquet 继续保持开放可读，Delta 只在旁边补协议层。
4. **工程取舍很清楚**：Delta 放弃高频小事务，换来低成本对象存储上的大规模分析可靠性。

## 延伸阅读

- 论文 PDF：[Delta Lake: High-Performance ACID Table Storage over Cloud Object Stores](https://www.vldb.org/pvldb/vol13/p3411-armbrust.pdf)（重点读 Section 2-4）
- 官方文档：[Delta Lake Documentation](https://docs.delta.io/latest/index.html)（看 transaction log 和 time travel）
- 对比材料：[Apache Iceberg 官方文档](https://iceberg.apache.org/)（同类开放表格式）
- [[hive-petabyte-scale-data-warehouse-using-hadoop-2010]] —— Hive 把文件目录变成大数据表的早期方案
- [[spark-sql-2015]] —— Delta Lake 最重要的执行引擎宿主之一
- [[snowflake-2016]] —— 闭源云数仓用中心服务管理对象存储元数据

## 关联

- [[aries-1992]] —— 同样用日志保证恢复和一致性，但 ARIES 面向数据库页，Delta 面向对象存储文件。
- [[snowflake-2016]] —— 两者都把计算和对象存储分离，Snowflake 用中心服务，Delta 尽量用开放日志协议。
- [[flink-snapshots-2015]] —— Flink 用 checkpoint 保证流处理一致状态，Delta 用表日志保证存储快照。
- [[kafka-2011]] —— Kafka 是追加日志形态的消息系统，Delta 的 `_delta_log` 也靠追加顺序建立事实。
- [[codd-1970]] —— 关系模型关心"表"的抽象，Delta 是在文件湖上重新补回表抽象。
- [[dremel-decade-2020]] —— Dremel 系系统强调交互式分析，Delta 提供可被分析引擎消费的可靠表层。
- [[lsm-tree-1996]] —— 两者都偏向追加和后台整理，用 compaction/OPTIMIZE 把小写入整理成适合读取的布局。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[data-lake-management-2019]] —— Data Lake Management 2019 — 数据湖从文件堆变成可治理资产
- [[lakehouse-2021]] —— Lakehouse 2021 — 把数据湖和数仓合成一套开放平台
