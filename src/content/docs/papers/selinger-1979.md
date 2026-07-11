---
title: Selinger 1979 — 基于代价的查询优化
来源: 'Selinger et al., "Access Path Selection in a Relational Database Management System", SIGMOD 1979'
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

Selinger 1979 是 IBM System R 团队提出的一套**让数据库引擎自己决定 SQL 该怎么执行**的算法。

日常类比：你写一句

```sql
SELECT * FROM 顾客 JOIN 订单 JOIN 商品 WHERE ...
```

只说了"我要什么"，没说"先连哪两张表、用 hash 还是 nested loop、走不走索引"。这些选择，每一种组合的执行时间可能差**几百倍**。Selinger 的算法做的事，就是把这件凭直觉拍脑袋的事，变成一道**最小化代价**的数学题——读多少页磁盘、扫多少行、用多少 CPU 全部估出来加起来，挑总账最小的那条路径。

这套思路是今天 [[postgresql]] / Oracle / SQL Server 查询优化器的祖宗。

## 为什么重要

不理解 Selinger，下面这些事说不清楚：

- 为什么同一句 SQL，加了一个 `WHERE` 条件后**反而变快了**——优化器换了执行路径
- 为什么 `EXPLAIN ANALYZE` 输出里有一堆 `cost=...rows=...` 数字——那就是 Selinger 模型的直系后代
- 为什么 SQL 是"声明式"语言能成立——你只声明"要什么"，引擎自己挑"怎么做"，背后必须有人替你算账
- 为什么三表 join 的顺序选错了，查询能从 0.1 秒变成 10 分钟

简而言之：Selinger 把"怎么执行"从程序员手里抢过来，交给一台会算账的机器。

## 核心要点

整套算法可以拆成 **三块**：

1. **代价模型（Cost Model）**：给每个执行算子贴价签。读一页磁盘多少钱，哈希一行多少钱，nested loop 比对一次多少钱。最后所有候选路径都换算成同一个数字——总代价。

2. **动态规划 + 有趣顺序（Interesting Orders）**：三张表 A / B / C 有 6 种连法，N 张表 N!。Selinger 用动态规划：先算两表最优，再拼三表最优，复杂度从 N! 降到约 2^N。关键加分项是**有趣顺序**——同一表子集不只留一条最便宜计划，还按「结果是否已按某列排好序」各留一条，方便后面免排序或走归并连接。

3. **选择性估算（Selectivity Estimation）**：`WHERE age > 30` 会过滤掉多少行？System R 靠**目录统计**——表行数、页数、列上不同值个数等——估「大概留下 40%」。估得越准，代价模型才越靠谱。现代优化器才普遍加上直方图 / 多列统计；1979 原文还没有这些。

三块加起来，就是查询优化器的标配骨架，沿用了 40 多年。

## 实践案例

### 案例 1：三表 join 的代价比拼

三张表：顾客（10 万行）、订单（100 万行）、商品（1 万行）。

执行顺序 A：先 `顾客 ⋈ 订单`，再和 `商品` 连
- 中间结果：约 100 万行（顾客的全部订单）
- 若订单侧能走顾客id 索引，这一步往往更便宜

执行顺序 B：先 `订单 ⋈ 商品`，再和 `顾客` 连
- 中间结果：仍约 100 万行，但先扩商品列再回连顾客
- 若商品表很小且有索引，B 可能反超 A——**谁赢取决于统计信息**

执行顺序 C：先 `顾客 ⋈ 商品`（无共同连接键 → 笛卡尔积）
- 中间结果：约 10 亿行，代价爆炸

Selinger 算法**自动排除 C**，再在 A / B（及各自有趣顺序变体）里挑总代价最小的。

### 案例 2：索引扫描 vs 全表扫描

`SELECT * FROM 订单 WHERE 顾客id = 123`

- **方案 1（全表扫）**：读 100 万行，挑出几行——代价高但稳定
- **方案 2（走索引）**：先查索引找到几行的位置，再读那几行——代价低

但如果换成 `WHERE 顾客id < 999999`（几乎匹配所有行），索引反而**比全表扫还慢**——每行都要先查索引再回表，多绕一道。Selinger 的代价模型能算出**临界点**，过了就放弃索引。

### 案例 3：现代数据库的 EXPLAIN

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE total > 100;
```

输出大致长这样：

```
Seq Scan on orders  (cost=0.00..1234.56 rows=5000 width=64)
                    (actual time=0.012..3.456 rows=4892)
```

- `cost=0.00..1234.56`：Selinger 模型估算的代价区间（启动代价..总代价）
- `rows=5000`：选择性估算预测会返回 5000 行
- `actual rows=4892`：实际跑出来 4892 行——估得挺准

`cost` 和 `actual` 差太多时，往往是统计信息过期了，跑一次 `ANALYZE` 让优化器重新采样。

## 踩过的坑

1. **统计信息过期 = 代价估错**：表数据每天变，但优化器看的是**上次 ANALYZE 时的快照**。新插入大量数据后不重跑 ANALYZE，优化器还以为表是空的，可能选出灾难级的执行计划。

2. **N 张表的指数爆炸**：动态规划把 N! 降到 2^N，但 20 张表 join 仍然是 100 万种组合——优化本身就慢。商用数据库通常加启发式：超过阈值就用贪心或遗传算法近似。

3. **只考虑"左深树"**：Selinger 原算法只枚举左深树（A⋈B⋈C⋈D 这种线性形状），不考虑"丛树"（(A⋈B) ⋈ (C⋈D) 这种平行结构）。后者在分布式 / 列存场景下往往更优——后续的优化器才把这个补上。

4. **均匀假设遇倾斜就翻车**：1979 的目录统计常假设值均匀分布；遇到**倾斜数据**（90% 的订单来自 10% 的顾客）就严重失准。现代优化器才用直方图、多列统计和采样来缓解。

## 适用 vs 不适用场景

**适用**：
- 关系型数据库的 SQL 查询优化（[[postgresql]] / MySQL / Oracle / SQL Server / DB2）
- 中等规模的 join（2 到 10 张表），统计信息靠谱
- 工作负载稳定的 OLTP 系统——一次优化，多次复用执行计划

**不适用**：
- 数据高度倾斜，简单选择性估算严重失真——需要**自适应执行**（运行中根据真实行数改计划）
- 大规模并行 / 流式 / 分布式查询——需要扩展成 [[volcano]] 风格算子树 + 数据交换
- 数据每秒变化的实时分析——优化的成本可能超过查询本身，直接走启发式更划算
- NoSQL / KV 存储——没有 SQL 也没有 join，根本用不上

## 历史小故事（可跳过）

- **1974 年**：IBM 圣何塞研究中心启动 System R 项目，证明"关系数据库能不能商用"。Patricia Selinger 加入团队负责优化器。
- **1979 年**：SIGMOD 论文发表，**14 页**讲清楚了代价模型 + 动态规划 + 选择性估算三件套。论文标题是"Access Path Selection"，但讨论范围远超访问路径——它定义了整个查询优化的数学框架。
- **1990 年代**：Goetz Graefe 提出 Volcano 优化器（1993）和 Cascades 框架（1995），把 Selinger 的算法推广到任意算子代数 + 规则驱动改写。这是现代 SQL Server / Apache Calcite / CockroachDB 的直接父辈。
- **2000 年代**：Oracle CBO 全面替换 RBO（基于规则的优化器），PostgreSQL 引入 ANALYZE 命令收集统计信息——都是 Selinger 思想的工业落地。
- **2024 年**：Apache Calcite、DuckDB、ClickHouse 的优化器内核仍然是"代价 + 动态规划 + 选择性"三板斧，只是统计模型更精细、规则库更庞大。

## 学到什么

1. **声明式语言的代价**：用户只说"要什么"，引擎必须替他算"怎么做"——这层翻译有数学
2. **代价模型 + 动态规划 + 有趣顺序** 是搜索最优计划的标配骨架，今天的 [[volcano]] / Cascades 都是它的徒孙
3. **统计信息是优化器的眼睛**：估错一行就能让计划差几百倍，所以 ANALYZE 不能省
4. **理论 → 算法 → 工程**：1979 一篇论文 → 1990s 通用化 → 2000s 工业落地，每一步隔约 10 年

## 延伸阅读

- 论文 14 页 PDF：[Selinger et al. 1979](https://www.cs.berkeley.edu/~brewer/cs262/3-selinger79.pdf)（密度高，前 6 页就够看）
- 视频：[CMU Database Systems — Query Optimization](https://www.youtube.com/watch?v=lDWiHOSQGUk)（Andy Pavlo 把 Selinger 全过程画在白板上）
- PostgreSQL 源码导览：`src/backend/optimizer/path/` 目录下 `costsize.c` 就是 Selinger 模型的现代 C 实现
- 教科书：Garcia-Molina 等《Database Systems: The Complete Book》第 16 章把 Selinger 拆得最细
- [[postgresql]] —— 工业上 Selinger 算法最完整的开源实现
- [[volcano]] —— 把 Selinger 推广到任意算子树的下一代框架

## 关联

- [[postgresql]] —— 优化器源码就是 Selinger 思想的现代翻译版
- [[volcano]] —— 1990 年代继承 + 推广 Selinger 的下一代查询优化框架
- [[spanner]] —— 分布式 SQL 数据库，把 Selinger 思路扩展到跨数据中心查询

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[b-tree-1972]] —— B-Tree 1972 — 磁盘友好的索引结构
- [[berenson-1995-isolation]] —— ANSI SQL 隔离级别批判 — 教科书的隔离定义其实有漏洞
- [[cascades-1995]] —— Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[comer-1979-btree]] —— Comer 1979 — B-Tree 综述：为什么这棵树到处都有
- [[ingres-1976]] —— INGRES 1976 — Berkeley 平行实现的关系数据库
- [[leis-2015-optimizers]] —— Leis 2015 — 用真实数据打脸所有数据库的查询优化器
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[neumann-2015-large-joins]] —— Adaptive Optimization of Very Large Join Queries — 100 张表也敢精确求解
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[sequel-1974]] —— SEQUEL 1974 — 让数据库"听懂"近似英语的查询
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[volcano]] —— Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流

