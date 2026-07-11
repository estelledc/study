---
title: Adaptive Optimization of Very Large Join Queries — 100 张表也敢精确求解
来源: 'Neumann & Radke, "Adaptive Optimization of Very Large Join Queries", SIGMOD 2018'
日期: 2026-05-30
分类: databases
难度: 高级
---

## 是什么

这是一种**让查询优化器自己看菜下饭**的算法：表少时上精确动态规划，表多时切到一种叫"线性化 + 贪心"的省力做法，但中间没有性能断崖。日常类比：像导航软件——5 公里内全街区遍历找最短，500 公里就只看主干道，不会突然在 11 公里处撂挑子。

数据库里 join 的"代价"差异极大。论文 Figure 1 给了一张 50 表查询的代价分布图：1 万条随机计划里，绝大多数比最优解贵 100 倍以上。所以"挑顺序"这件事比"会做 join"重要得多。

具体来说，假设一条查询有 50 张表，每两张表都有 join 边（极端 clique 情况），可能的连接顺序总数会膨胀到天文级别。即使是更稀疏的图（chain / star），数量也远超暴力枚举能力。所以 join order 是 query 优化器最核心、也最难的问题之一。

但传统优化器有个尴尬："小查询用 DP 精确解，>12 表切 GA / greedy"——切换那一刻**质量直接掉崖**。本文（TUM 的 Neumann 团队）提出一个 adaptive 框架：**先估搜索空间大小**，落得下就精确解，否则用 IKKBZ 把图压成链再贪心，端到端 2-5000 张表都不出 cliff。论文里被拿来对比的算法有 10 个以上，新方法在小、中、大三档查询里都没拖后腿。

需要强调的一点：这不是"又一个新算法"，而是**一种元决策框架**。它把已有的 DPhyp、IKKBZ、GOO、IDP 当积木，关键创新在于**先用极廉价的 connected subgraph 计数**判定下一步走哪条路径。后人很容易把它当成 IKKBZ 的某个变种，其实最值得抄的部分是那个"先估再算"的元思路。

## 为什么重要

不理解它，下面这些事都没法解释：

- 为什么 PostgreSQL 在 12 表那里"突然变笨"——它的 GEQO 切换点没用到搜索空间估计
- 为什么 SAP / Tableau 几百张表的查询能在秒级出计划而不是跑一晚上
- 为什么"NP-hard"不能当成优化器只会 greedy 的借口
- 为什么不少现代 OLAP / BI 优化器会借鉴"先估搜索空间再选算法"的元决策思路

## 核心要点

整个 adaptive 框架可以拆成 **三层决策**：

1. **数 connected subgraph 而不是数 join**：精确 DP 的代价不取决于表数量，而是查询图里"连通子图"的总数。chain 1000 表的子图只有 50 万级，clique 30 表却已经 10 亿+。所以**预算用 subgraph 数算**，给个上限 10000，落得下就跑 DPhyp 拿到全局最优。这一步只花 O(子图数) 的常数代价。

2. **超预算就线性化**：把任意查询图压成一条链，让 IKKBZ（一个多项式时间能解的特殊 case）能跑。具体做法是先建一棵"前驱树"，按 rank 排序合并子链——结果是一个**接近最优的链状解**，作为 baseline。类比：城市里的迷宫路网压成一条主干道，先把"基本能走通"的路画出来。

3. **再用 GOO 和局部 IDP 改进**：拿到链状解后，用 Greedy Operator Ordering 试着合并代价低的相邻 join，再对长度 ≤ K 的窗口跑一次小型 DP（IDP-2）局部修复。**贪心 + 局部 DP** 比单纯 greedy 高一截，比纯 DP 便宜上千倍。论文里 K 选了 10-20，效果显著超过纯 GOO。

三层叠在一起：小查询拿最优，中查询近最优，超大查询拿可用解，没有断崖。其中**子图数预估**是整个 adaptive 决策的元杠杆——它便宜、准、能直接告诉你下面跑哪条路径。

伪代码示意（保留核心决策骨架）：

```python
def optimize(query_graph, budget=10_000):
    n_subgraphs = count_connected_subgraphs(query_graph)
    if n_subgraphs <= budget:
        return dp_hyp_exact(query_graph)        # 路径 A：精确解
    chain = generalized_ikkbz(query_graph)      # 路径 B-1：线性化
    plan = greedy_operator_ordering(chain)      # 路径 B-2：贪心
    return iterative_dp_refine(plan, window=20) # 路径 B-3：局部精修
```

## 实践案例

这三个案例覆盖三个量级：50 表（中等）/ 369 表（大）/ 4598 表（极端），把 adaptive 框架的伸缩性展示完整。

### 案例 1：50 表的数据仓库查询

BI 工具自动生成一条 join 50 张维表 + 事实表的 SQL：

```sql
SELECT ... FROM fact f
JOIN dim_user u ON f.uid = u.id
JOIN dim_geo g ON u.gid = g.id
... -- 50 个 join
```

优化器先数 subgraph：星型图（事实表在中心、维表挂一圈）的连通子图数随维表指数涨，**轻松超过 10000 预算**，于是跳过精确 DP，走 IKKBZ 线性化 + GOO 路径，毫秒级出近最优计划。重点：**不会**因为表数过 12 就硬切到 GA，决策由查询图拓扑驱动。

### 案例 2：Tableau 369 表 ad-hoc 查询

用户拖拽生成一条 join 369 张表的探索性查询。subgraph 数早爆。优化器的策略：

1. IKKBZ 跑 O(n²) 拿链状解（毫秒）
2. GOO 沿着链合并，遇到选择性高的 join 优先（< 1 秒）
3. 长度 20 的窗口跑 IDP，做最后一公里精修

最终拿到一个比纯 greedy 好一两个数量级的计划。这种**ad-hoc 工作负载**特别值得用 adaptive：用户每次跑的查询不一样，缓存计划没用，每次都要现场决策——元决策的便宜尤其关键。

### 案例 3：SAP 4598 表的 mega query

视图展开后 4598 表。**这种时候连 IKKBZ 也会慢**——其平方复杂度乘上几百万级常数因子也吃不消。论文里专门做了实现优化：

- 去掉 hash table 用紧凑的 vector / bitmap 表示连通子图
- cardinality 用对数累加避免溢出
- 把每个内层操作压到 O(1)

最后这条查询能在十几秒级出计划，而不是几十分钟跑 GA。论文专门把 DPhyp 重写了一版叫 DPhypE，常数因子降一个量级，正是这种工程改造让"理论可解"变成"现实能跑"。

## 踩过的坑

1. **把 NP-hard 当甩锅借口**：原文一句话"the argument is defeatist"——100 表内 DP 完全能跑，懒得做才说做不到。这是态度问题不是算法问题；很多优化器在这里偷懒。

2. **切换点处掉崖 + 只数 join 不数 subgraph**：PostgreSQL 在 12 表硬切 GEQO 是典型反面。chain 1000 表 DP 能跑、clique 25 表已经爆，决策必须基于查询图拓扑而不是表数。两个错误连在一起就是"用错指标 → 切换点错位 → 用户体验崩"。

3. **greedy 单跑会陷局部最优**：GOO 自己跑得到的解经常比 GOO + 局部 IDP 修复差一个数量级。线性化 + 贪心 + 局部 DP 三连才稳；少一环都容易陷在劣解里出不来。

4. **常数因子是工程命门**：算法理论上 O(n²) 不代表能跑——hash 表 vs vector、cardinality 用对数 vs 直接乘，每个细节都决定 100 表能不能秒级返回。论文专门把 DPhyp 重写成 DPhypE，常数因子降一个量级，正是这种"工程性能榨干"才让大查询可解。

## 适用 vs 不适用场景

**适用**：
- OLAP 数据仓库 / BI 工具自动生成的中大型查询（50-500 表）
- 探索式可视化产品（Tableau / Looker / Superset）的 ad-hoc 查询
- 需要在合理时间内对 1000+ 表查询给出"够用"计划的场景
- 想替换现有引擎里 GA / SA / TabuSearch 这类 meta-heuristic 兜底逻辑
- 视图展开后 join 数膨胀的 SaaS 场景（多租户 schema / 自动建模）

**不适用**：
- OLTP 几张表的事务查询——直接 DPhyp 就好，不需要这套机制
- 有大量非 inner join（outer / anti / semi）且依赖很强的查询——线性化前提是无环，需要先转化
- 完全静态、查询模板已知的场景——预编译 + 缓存计划比每次 adaptive 决策更省
- 列式向量化引擎里"代价模型"已经很不准的查询——光优化 join order 帮不了，还要重新校准 cardinality estimator

## 历史小故事（可跳过）

- **1979**：[[selinger-1979]] System R 论文奠定 join order DP 框架，用 left-deep tree + interesting orders，但只能跑十几张表。
- **1986**：Krishnamurthy / Boral / Zaniolo 提出 IKKBZ——acyclic 查询多项式可解的特殊 case，本论文核心借了它的 rank 排序思路；名字是四个人的姓首字母拼起来的。
- **1993**：Ono & Lohman 提出 DPccp，让 bushy tree DP 能跑到 12-15 表，确立了"枚举连通子图对而不是子集"的方法论。
- **2006-2008**：Moerkotte / Neumann 把 DPhyp 推到 20-30 表，覆盖大多数业务查询，常数因子降到能用的程度。
- **2015**：Leis 等 *How Good Are Query Optimizers, Really?* 揭露大查询优化质量参差，给 adaptive 思路扔下了直接动机。
- **2018**：本文把 adaptive 思路顶到 5000 表，10+ 算法对比中最稳，正式把"先估搜索空间再选算法"写进 SIGMOD。

线索一直是同一条："NP-hard 没错，但常数因子和搜索空间结构留了大量真实工程余地"。本文的贡献是把这条原则落到一个**全自动决策**的优化器里，而不再依赖 DBA 手工挑算法。

## 学到什么

1. **元决策比算法本身重要**：选哪个算法 = 比每个算法跑得多块更关键，本文最大的设计洞见。
2. **数对了量纲**：connected subgraph 数是真实成本的代理，而不是表数；很多看似复杂的判定其实只缺一个对的指标。
3. **没有 cliff 是工程美学**：用户体验的连续性 > 某个点的极致性能，宁可放弃某段最优也要让端到端表现平滑。
4. **理论 case + 工程改造 + 局部修复** 三段叠加才是大规模问题的解药，不是单押一个银弹。
5. **把"defeatist"当 self-check**：每次说"NP-hard 所以做不到"前，先量化下到底搜索空间多大，可能只是没找对量纲。

## 延伸阅读

- 原论文 PDF：[hugejoins.pdf](https://db.in.tum.de/~radke/papers/hugejoins.pdf)（16 页，前 6 页是核心，后面是十个算法对比的实验）
- 视频讲解：[CMU 15-721 Query Optimization](https://www.youtube.com/watch?v=pvpwIM5xfEI)（Andy Pavlo 把 join order 历史一气讲完）
- DPhyp 算法：Moerkotte & Neumann VLDB 2008 — 本文 DP 阶段的算法基础
- 配套博文：Andy Pavlo — "What Goes Around Comes Around"（讲优化器代际演进）
- HyPer 数据库：本文方法的真实落地引擎，Neumann 同实验室
- [[selinger-1979]] —— System R — join order DP 的开山祖
- [[volcano-1994]] —— Volcano — 现代优化器框架，rule-based 改写 + cost-based 选择

## 关联

- [[selinger-1979]] —— System R 优化器 — left-deep + DP 的范式基础，本文延伸了它的 DP 阶段
- [[volcano-1994]] —— Volcano — 优化器框架，本文的 adaptive 决策可以塞进它的 rule pipeline
- [[cascades-1995]] —— Cascades — Volcano 的下一代，记忆化 + group expression，与 adaptive 思路互补
- [[system-r-1976]] —— System R — 第一个完整关系数据库，join order 问题最早被规范化的地方
- [[turing-1936]] —— 可计算性 — NP-hard 的根，但这篇告诉你"硬"不等于"放弃"
- [[cook-levin]] —— Cook-Levin 定理 — NP 完全性的源头，给本文的"defeatist 论"做铺垫

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/clickhouse]] —— ClickHouse — 把列存 OLAP 推到硬件极限
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[leis-2015-optimizers]] —— Leis 2015 — 用真实数据打脸所有数据库的查询优化器
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[morsel-driven-2014]] —— Morsel-Driven Parallelism — 把 SQL 查询切成小口分给多核
- [[vertica-2012]] —— Vertica 2012 — C-Store 论文走向产品的七年改造账
- [[wco-joins-relational-2020]] —— WCO Joins 2020 — 把最坏情况最优连接搬进关系数据库
