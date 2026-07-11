---
title: Dremel 2010 — BigQuery 和 Parquet 背后的嵌套列式分析
来源: 'Sergey Melnik et al., "Dremel: Interactive Analysis of Web-Scale Datasets", PVLDB 2010'
日期: 2026-05-29
分类: databases
难度: 中级
---

## 是什么

日常类比：Dremel 像一个超大型仓库的“只取货架上需要的几列商品”的分拣系统，而不是每次把整箱货都搬出来再翻找。

Dremel 是 Google 做**只读嵌套数据交互式分析**的分布式查询系统。它把两件事绑在一起：一是给嵌套记录设计列式存储，二是用多级 serving tree 把 SQL 聚合拆给成千上万台机器并行执行。

如果只记一句话：Dremel 让“几百亿到上万亿行日志”不再只能等 MapReduce 批处理，而是可以用 SQL 在秒级到十秒级探索结果。

## 为什么重要

不理解 Dremel，下面这些事都很难解释：

- 为什么 BigQuery 这类云数仓敢把“超大日志 + SQL + 交互式”放在同一个产品里。
- 为什么 Parquet/ORC 处理嵌套字段时会提到 repetition level 和 definition level。
- 为什么 MapReduce 能处理大数据，却不适合分析师反复改问题、立刻看结果。
- 为什么列式存储不只是“少读列”，还必须解决嵌套结构、空值和重复字段的还原问题。

## 核心要点

Dremel 的设计可以拆成 **三件事**：

1. **嵌套数据也能列存**。类比：一本通讯录里每个人可能有多个电话、多个地址，Dremel 仍然把“电话号码”单独排成一列。它用 repetition level 记录“这个值属于同一个数组还是新数组”，用 definition level 记录“哪些可选层级实际存在”。

2. **查询沿树形结构分发和汇总**。类比：总部不直接问 3000 个门店要报表，而是让区域经理先汇总，再层层上交。Dremel 的 root、intermediate、leaf server 形成 serving tree，叶子扫 tablet，中间节点做局部聚合。

3. **交互速度来自少读、并行和容错叠加**。类比：快不是某个员工跑得特别快，而是只取需要的货、多人同时取、慢的人被重新分配任务。Dremel 读列、异步预取、调度 tablet，并能在慢副本或慢机器出现时重新派发。

## 实践案例

### 案例 1：嵌套记录为什么不能直接拆成普通列

```proto
message Document {
  required int64 DocId = 1;
  repeated group Name {
    repeated group Language {
      required string Code;
      optional string Country;
    }
    optional string Url;
  }
}
```

**逐部分解释**：

- `repeated group Name` 表示一个文档可以有多个名字，像一个人有多个昵称。
- `Language` 也 repeated，说明一个名字下面还可以有多个语言版本。
- 如果只把 `Code` 值排成一列，读到 `en-us, en, en-gb` 时不知道它们属于第几个 `Name`，所以必须额外记录结构信息。

### 案例 2：repetition / definition level 在记什么

```txt
Name.Language.Code:
value   repetition   definition
en-us   0            2
en      2            2
NULL    1            1
en-gb   1            2
```

**逐部分解释**：

- `repetition = 0` 像“新订单开始”，表示进入新 record。
- `repetition = 2` 表示更深层的 `Language` 重复了，还在同一个 `Name` 里。
- `definition = 1` 配合 `NULL` 表示外层 `Name` 存在，但里面的 `Language.Code` 没有定义。

### 案例 3：serving tree 怎么把聚合拆开

```sql
SELECT country, COUNT(*) FROM T GROUP BY country;
```

执行时可以理解成：

```sql
-- 叶子节点先扫自己负责的 tablet
SELECT country, COUNT(*) AS c FROM tablet_i GROUP BY country;

-- 中间节点继续合并局部结果
SELECT country, SUM(c) FROM partial_results GROUP BY country;
```

**逐部分解释**：

- 叶子节点只读需要的列，例如 `country`，不用拼回整条记录。
- 中间节点不用保存明细，只合并各叶子的计数。
- root 最后拿到的是已经压缩过的数据量，所以小结果聚合很适合这种树形执行。

## 踩过的坑

1. **把 Dremel 理解成“列式文件格式”**：列式只是底座，论文同样强调 SQL-like 查询语言、serving tree、调度器和容错。

2. **以为嵌套列存只是多存一个 NULL bitmap**：普通空值位图只能说“有没有值”，definition level 才能说清“哪一层父结构存在”。

3. **以为所有查询都适合 serving tree**：返回少量或中等聚合结果时树形汇总很强，超大 join 或海量中间结果仍需要并行数据库或 MapReduce 式机制。

4. **只看平均速度，忽略最后几个慢 tablet**：论文里 99% tablet 很快处理完，但少量慢任务会把查询从一分钟内拖到几分钟。

## 适用 vs 不适用场景

**适用**：
- 只读或追加后的大规模日志分析，尤其是字段很多但每次只读少数列。
- 嵌套、半结构化、Protocol Buffers 类数据，不想先展开成大量关系表。
- 交互式探索：用户要不断改 SQL，快速验证假设。
- 聚合结果较小或中等，例如 count、top-k、group by 维度统计。

**不适用**：
- 频繁行级更新、事务写入和强一致读写混合负载。
- 需要完整扫描很多列并反复重建整条嵌套记录的任务。
- 中间结果巨大、必须复杂 join 和 shuffle 的查询，这类更接近并行 DBMS 或 MR 的强项。
- 对精确扫完 100% 数据有硬要求但集群副本少、慢任务多的场景。

## 历史小故事（可跳过）

- **2003-2006 年**：GFS、MapReduce、Bigtable 先把 Google 的大规模存储和批处理底座铺好。
- **2010 年**：Dremel 论文发表，重点回答“能不能不用写批处理，也能秒级分析海量嵌套日志”。
- **2010 年同年**：BigQuery 以 Dremel 思路对外提供服务，把内部交互式分析能力产品化。
- **之后几年**：Dremel 的嵌套列式表示影响 Parquet 等生态，repetition/definition level 成为理解嵌套列存的关键词。
- **2020 年**：Dremel 十年回顾论文总结它如何演化成 serverless、多租户、存算分离的云数仓路线。

## 学到什么

1. **数据模型会决定存储格式**：嵌套数据不是普通二维表，多一层 list/optional 就需要额外结构编码。
2. **交互式大数据不是单点优化**：少读列、并行树、预取、复本、重试和近似结果一起把延迟压低。
3. **MapReduce 和 SQL 不是互斥关系**：Dremel 不是消灭 MR，而是让 MR 产出的数据可以继续被快速探索。
4. **工程论文要看边界条件**：Dremel 的强项是 scan + aggregate，论文也承认大结果和复杂查询需要其他执行机制。

## 延伸阅读

- 论文 PDF：[Melnik et al. 2010 — Dremel: Interactive Analysis of Web-Scale Datasets](http://www.comp.nus.edu.sg/~vldb2010/proceedings/files/papers/R29.pdf)
- ACM 页面：[Dremel: Interactive Analysis of Web-Scale Datasets](https://dl.acm.org/doi/10.14778/1920841.1920886)
- [[dremel-decade-2020]] —— 看 Dremel 十年后如何演化成 BigQuery 的云数仓架构。
- [[mapreduce]] —— 对照 Dremel 解决的批处理延迟和交互性问题。
- [[columnar-storage-formats-2023]] —— 看 Dremel 的嵌套列存思想如何进入 Parquet/ORC 生态。

## 关联

- [[mapreduce]] —— Dremel 直接补 MapReduce 不适合交互式分析的短板。
- [[gfs]] —— Dremel 的 in-situ 分析依赖分布式文件系统承载大规模 tablet。
- [[bigtable-2006]] —— 同属 Google 数据系统谱系，但 Bigtable 偏在线存取，Dremel 偏分析。
- [[cstore-2005]] —— 列式数据库解释了“只读需要列”的收益，Dremel 把它扩展到嵌套数据。
- [[dremel-decade-2020]] —— 后续论文复盘 Dremel 如何支撑 BigQuery 的十年演化。
- [[columnar-storage-formats-2023]] —— 现代列式文件格式继承了 Dremel 的嵌套编码问题。
- [[borg]] —— 大规模多租户查询需要集群调度和资源隔离作为运行底座。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[columnar-storage-formats-2023]] —— Columnar Storage Formats 2023 — Parquet/ORC 的体检报告
- [[snowflake]] —— Snowflake — 云数仓把存储和计算拆开
