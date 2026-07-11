---
title: Dremel 十年回顾 — BigQuery 背后的交互式云数仓路线
来源: 'Sergey Melnik et al., "Dremel: A Decade of Interactive SQL Analysis at Web Scale", PVLDB 2020'
日期: 2026-05-29
分类: databases
难度: 初级
---

## 是什么

Dremel 是 Google 用来做**超大数据交互式 SQL 分析**的系统；这篇 2020 论文回看它从 2010 年论文到 BigQuery 的十年演化。

日常类比：像把一个城市图书馆拆成很多书架、很多检索员和一张总服务台。读者只问一句“帮我统计去年借出最多的书”，服务台把任务切小，检索员并行找答案，最后再合并成一张表。

这篇的重点不是发明一个单点技巧，而是解释一整套工程选择为什么后来变成云数仓常识：SQL、存算分离、原地分析、serverless、嵌套列存、低延迟调度。

如果只记一句话：Dremel 让“扫很多数据”从离线批处理，变成了用户可以一边写 SQL、一边几秒级看结果的交互体验。

## 为什么重要

不理解 Dremel，就很难解释下面这些事：

- 为什么 BigQuery 这种云数仓不用你先买机器，也能突然给一个查询分配很多计算资源。
- 为什么大数据系统从“SQL 不可扩展”又回到了“大家都想用 SQL”。
- 为什么 Parquet、ORC、Arrow 这类格式都要认真处理嵌套字段，而不是只存平铺表格。
- 为什么云数仓追求存算分离，但又必须花大量工程力气补回低延迟。

这篇像一张路线图：它把十年里“看起来互相矛盾”的选择串起来，让你知道现代云数仓不是一个数据库，而是一组服务协同出来的体验。

## 核心要点

1. **SQL 是给人用的方向盘**。类比：开车的人不想每次都拆发动机，只想转方向盘；SQL 让分析师表达“我要什么”，不用手写 MapReduce 过程。Dremel 早期 SQL 方言后来统一到 GoogleSQL / ZetaSQL，减少不同系统之间的方言成本。

2. **分离资源，才能弹性伸缩**。类比：餐厅把厨房、仓库和送餐队分开管理，高峰只加送餐员，不必同时买一座新仓库。Dremel 先分离存储和计算，后来连 shuffle 中间结果需要的内存也做成独立服务。

3. **低延迟靠很多小机制叠加**。类比：快递准时不是只因为车快，还因为仓库预热、路线分层、遇到慢车能换车。Dremel 用备用服务池、推测执行、多级执行树、近似结果、容量预留和动态 DAG，把大数据查询压到交互范围。

## 实践案例

### 案例 1：一条 SQL 如何被拆成并行任务

```sql
SELECT language, COUNT(*) AS n
FROM wiki
WHERE title LIKE '%Dremel%'
GROUP BY language
ORDER BY n DESC
LIMIT 10;
```

**逐部分解释**：

- `WHERE` 先在叶子 worker 附近过滤，减少后面要搬的数据。
- `GROUP BY language` 需要把相同语言的数据送到同一批 worker，这一步就是 shuffle。
- `ORDER BY ... LIMIT 10` 最后只保留很少结果，所以根节点不用收回所有原始行。

论文里的变化是：早期固定执行树适合简单聚合，后来 BigQuery 用 shuffle 持久层和灵活 DAG 来支持 join、窗口函数和更复杂的 SQL。

### 案例 2：嵌套日志为什么还能列式存

```json
{
  "name": [
    { "language": [{ "code": "en", "country": "us" }] },
    { "language": [] }
  ]
}
```

**逐部分解释**：

- 传统表格像 Excel，一格一个值；这条日志里有数组套对象，不能直接平铺。
- Dremel 用 repetition level 表示“这次值属于同一个数组还是新数组”，用 definition level 表示“中间哪个可选字段缺失”。
- Parquet 继承了这种思路，所以今天很多数据湖文件也能高效存嵌套 JSON / protobuf 风格数据。

论文还比较了另一种 length / presence 编码：在 65 个 Google 内部深嵌套数据集上，它平均比 repetition / definition 小 13%，但查询时常要多读祖先字段。

### 案例 3：为什么只处理 98% 数据也可能有价值

```sql
SELECT APPROX_COUNT_DISTINCT(user_id)
FROM events
TABLESAMPLE SYSTEM (98 PERCENT);
```

**逐部分解释**：

- 大规模查询最慢的常常不是平均 worker，而是最后几个掉队 worker。
- 如果业务只需要近似答案，提前在 98% 数据完成时返回，可能把延迟降低 2-3 倍。
- 这不是偷懒，而是让用户在探索阶段先快速判断方向，真正出报表时再跑精确查询。

Dremel 的交互性来自这种取舍：把“第一次看结果”的等待时间压低，鼓励用户不断改查询、提假设、再验证。

## 踩过的坑

1. **把 Dremel 理解成“只是列存”**：列存只是底座之一，真正的系统能力还包括 SQL 前端、调度、shuffle、存储格式和多租户隔离。

2. **以为存算分离天然更快**：远程存储一开始让 Dremel 慢一个数量级，后来靠元数据、预取、亲和性和文件操作复用才追回低延迟。

3. **以为原地分析不需要托管存储**：in situ 省掉装载成本，但很多用户无法安全管理原始文件，也缺少统计信息和布局优化，所以 BigQuery 仍需要 Managed Storage。

4. **以为 SQL 标准能自动统一方言**：论文明确说 ANSI SQL 仍有欠规范处，Google 才需要共享解析器、函数库、测试和参考实现来统一行为。

## 适用 vs 不适用场景

**适用**：

- 交互式数据分析：用户一边改 SQL，一边想在秒级或十几秒内看到趋势。
- 云上弹性数仓：计算、存储、shuffle、调度都希望按需扩缩。
- 半结构化日志分析：数据里有 protobuf / JSON 式嵌套字段，不想先拆成很多表。
- 多团队共享数据湖：同一份文件希望被 SQL、批处理和其他引擎共同使用。

**不适用**：

- 单机小数据：如果几 MB CSV 用本地脚本就够，Dremel 的复杂度没有必要。
- 强事务写入：Dremel 主要是分析系统，不是替代 OLTP 数据库的行级更新引擎。
- 必须严格控制每台机器的部署：serverless 的目标是隐藏机器，而不是暴露机器。
- 任意脏格式原地查询：没有 schema、统计和权限治理的数据，原地分析会把问题推迟到查询时爆出来。

## 历史小故事（可跳过）

- **2006 年**：Dremel 作为 Google 内部的“20% 项目”开始，目标是让大规模日志能被交互式查询。
- **2009 年**：Dremel 迁移到 Borg 管理的集群，并开始走向存储与计算解耦。
- **2010 年**：原始 Dremel 论文发表，同年 BigQuery 以 Dremel 为基础对外提供服务。
- **2012-2014 年**：Dremel 增加分布式 join、集中式调度、shuffle 持久层和内存解耦，固定树逐渐变成灵活 DAG。
- **2020 年**：这篇论文回头总结：当年押中的方向已经成为云原生分析系统的默认选择。

## 学到什么

1. **工程趋势常从“反常识”开始**：Google 曾认为 SQL 不扩展，Dremel 却证明 SQL 可以成为大数据交互入口。
2. **架构选择会互相拉扯**：存算分离、原地分析和 serverless 都利于弹性，却都给低延迟制造新问题。
3. **云数仓的核心不是一台大机器**：它更像一组服务，分别负责解析 SQL、调度 worker、读列存、保存 shuffle、做容量隔离。
4. **成功系统也会承认误判**：论文明确承认早期低估了可靠快速 shuffle、托管存储和严肃 SQL 语言设计的重要性。

## 延伸阅读

- 论文 PDF：[Melnik et al. 2020 — Dremel: A Decade of Interactive SQL Analysis at Web Scale](http://www.vldb.org/pvldb/vol13/p3461-melnik.pdf)
- [[mapreduce]] —— Dremel 要解决的一个痛点，就是 MapReduce 写分析太慢、交互性太弱。
- [[gfs]] —— Dremel 从本地盘走向分布式文件系统，低延迟挑战也从这里开始。
- [[borg]] —— Dremel 的 serverless 能力依赖集群调度，把机器抽象成可分配资源。
- [[spanner-2012]] —— 同属 Google 大规模数据系统，但 Spanner 更偏全球事务，Dremel 更偏分析。
- [[cstore-2005]] —— 列式数据库早于 Dremel，Dremel 的新意在把列存推进到嵌套半结构化数据。

## 关联

- [[bigtable-2006]] —— Google 早期 NoSQL 存储路线，和 Dremel 的 SQL 回归形成对照。
- [[mapreduce]] —— 批处理范式提供规模基础，也暴露了交互式分析的缺口。
- [[gfs]] —— 存算分离依赖分布式文件系统，但必须解决远程读带来的延迟。
- [[borg]] —— 多租户、弹性调度和 slot 模型都离不开集群管理。
- [[spanner-2012]] —— GoogleSQL 的统一让分析系统和事务系统共享语言基础。
- [[snowflake-2016]] —— 同样代表云数仓的存算分离和按需扩缩路线。
- [[aurora]] —— 另一条云数据库路线，也把存储服务化作为核心设计。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[delta-lake-2020]] —— Delta Lake 2020 — 给对象存储补上事务日志
- [[dremel-2010]] —— Dremel 2010 — BigQuery 和 Parquet 背后的嵌套列式分析
