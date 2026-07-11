---
title: Leis 2015 — 用真实数据打脸所有数据库的查询优化器
来源: 'Leis, Gubichev, Mirchev, Boncz, Kemper, Neumann. "How Good Are Query Optimizers, Really?". PVLDB 2015'
日期: 2026-05-30
分类: databases / 数据库
难度: 中级
---

## 是什么

这是 2015 年 TUM 团队的一篇 **实证打脸论文**。他们做了一件之前没人系统做过的事：**用真实世界数据（IMDB 电影库）和 113 个手写多表 join 查询，去测各家数据库的查询优化器到底准不准**。

日常类比：像 **消费者协会拿真实路况测各品牌车的自适应巡航**——以前厂商都拿厂内测试场（人造平直路）跑出漂亮数据，这次有人开到山路、市区、雨天，一测全露馅。

具体讲，他们造了一个 benchmark 叫 **JOB**（Join Order Benchmark），用 PostgreSQL、HyPer、DB2、SQL Server、Oracle 跑同一组查询，对比每一步 EXPLAIN 里的 **预估行数 vs 实际行数**，再分别"换零件"看哪部分错得最致命。

```text
查询优化器 = 基数估算 + cost model + plan 枚举
            ↑ 错得最离谱   ↑ 还行         ↑ 学术上已成熟
```

结论一句话：**几乎所有数据库的基数（cardinality）估算都错好几个数量级**，而且错误随 join 表数指数累积。

## 为什么重要

不理解这篇论文，下面这些事讲不清：

- 为什么你写一个 5 表 join，PostgreSQL 跑 30 秒，加个 hint 强制改 join 顺序就秒回——优化器自己选错了
- 为什么 2018 年开始 ML-for-DB 一窝蜂研究 **learned cardinality estimator**（MSCN / DeepDB / NeuroCard）——他们都拿 JOB 当标尺
- 为什么大家都说 "TPC-H 测不出真实优化器水平"——TPC-H 数据是合成均匀分布，刚好绕开了所有难题
- 为什么 cost model 调一万年也没用——根因在更上游的基数
- 为什么 DBA 老司机口袋手册里第一条都是"先 ANALYZE 再说"——基数靠的是统计信息

## 核心要点

论文把优化器拆成 **三个独立部件** 分头量化：

1. **基数估算（cardinality estimation）**：根据统计信息预测 "这个子查询会出多少行"。日常类比：开餐馆前估计今晚来多少客人——估错了再多备料也救不回来。

2. **代价模型（cost model）**：给候选执行计划打分。"扫一遍这张表多贵 / 用 hash join 还是 nested loop 谁快"。

3. **计划枚举（plan enumeration）**：把所有合法 join 顺序枚举一遍，挑最便宜的。两表 = 2 种顺序，10 表 = 几百万种，得用动态规划或启发式。

论文的关键发现是：**坏全坏在第 1 部件**。把第 1 部件换成真实值（作弊一下），即使 cost model 极简单、plan 枚举只用贪心，也能跑出近似最优计划。反之第 1 部件不准，后面再花哨都救不了。

误差还有方向性：**优化器系统性地低估**，原因是默认假设 "多个谓词彼此独立"——而真实数据高度相关（电影类型 / 年代 / 演员之间永远有相关性）。论文里给出一个度量叫 **q-error**：`max(estimate/true, true/estimate)`。1.0 是完美，10 是差一个数量级。多表 join 上误差随表数快速变差：PostgreSQL 在 3 个 join 时已有约一半估计误差 ≥10×，极端低估可到 1e8。

## 实践案例

### 案例 1：在 PostgreSQL 里亲眼看 1000x 误差

```sql
EXPLAIN ANALYZE
SELECT count(*)
FROM movie_info mi, title t, movie_keyword mk, keyword k
WHERE mi.movie_id = t.id
  AND mk.movie_id = t.id
  AND mk.keyword_id = k.id
  AND k.keyword = 'sequel'
  AND t.production_year > 2000;
```

装好 JOB/IMDB 后跑 `EXPLAIN ANALYZE`，会看到 `rows=`（预估）和 `actual rows=`（真实）两栏。教学示意：预估可能是几十行，真实却是几万行——**差三个数量级并不罕见**。根因是优化器以为 `keyword = sequel` 和 `production_year > 2000` 彼此独立，但续集电影本来就集中在 2000 年后，相关性把估算压扁了。

### 案例 2：把基数注入真实值后计划完全变样

PostgreSQL 若低估成"只有几十行"，常会选 **nested loop**（"循环一下也快"）。注入真实基数后，往往改选 **hash join**——论文用 cardinality injection 反复证明：计划质量会立刻好转。

```
错估 →  Nested Loop (cost=...)  →  可能慢一个数量级以上
真实 →  Hash Join (cost=...)    →  接近该 cost model 下的最优
```

教训：优化器不是 "算法不行"，是 **被错误输入误导**。论文里这种 "换上真实基数 → 计划立刻好" 的实验做了很多次，证明 plan 枚举本身没问题，只是输入垃圾导致输出垃圾。

### 案例 3：JOB 为什么至今还在被引用

```bash
# JOB 公开下载（论文随附；需先装 IMDB 数据才能复现）
wget http://www-db.in.tum.de/~leis/qo/job.tgz
# 113 query × 多数据库 × 调换基数 / cost / plan，组合矩阵
```

2015 年至今，但凡有新基数估算方法（learned 模型、采样、sketch）出来，第一件事就是 "在 JOB 上跑一下，q-error 降了多少"。这是论文留下的最大公共财富——**一把所有人都认的尺**。后来 MSCN（神经网络估基数）、DeepDB（概率图模型）、NeuroCard（深度自回归）等工作都把 "JOB q-error 低于 PostgreSQL" 当首要 KPI。

工业上 PostgreSQL 14 加入 multi-column statistics、SQL Server 引入 batch mode adaptive joins、HyPer 用采样替直方图——这些改动的动机都能在这篇论文里找到原型。

## 踩过的坑

1. **直接信 EXPLAIN 的 rows 字段** —— 在 5+ join 时几乎一定错好几个数量级。不要拿它做容量规划，也不要拿它做"哪条 SQL 该加索引"的判断依据。

2. **以为加更多直方图能救** —— 直方图只解决单列分布问题，独立性假设是跨列的，加多少直方图都堵不住。要解决得用 multi-column statistics 或采样，但开销大。

3. **拿 TPC-H 评估优化器** —— TPC-H 数据是均匀合成的，没有真实数据的偏斜和相关性，跑不出问题。要测优化器**必须**用真实或带 skew 的数据。

4. **把锅甩给 cost model** —— 论文证明即使 cost model 简单到只数 IO，只要基数对，就能选出近似最优计划。换 cost model 救不了基数错。

## 适用 vs 不适用场景

**这篇论文的洞见适用于**：

- 任何要做 **join 多表** 的 OLAP 查询场景（数据仓库 / BI / 即席分析）
- 评估某个新优化器 / 学术 paper 时，看它有没有报 JOB 上的 q-error
- 解释生产事故 "为什么这条 SQL 突然慢 100 倍"——常常是统计信息陈旧导致基数翻车
- 设计 hint / plan stability 机制时——知道优化器哪里靠不住，才好设计兜底

**不直接适用于**：

- 单表 / 2 表 join 的简单 OLTP 查询——不会触发 join 顺序灾难
- 流处理 / 实时计算——这些系统有自己的执行模型，不靠传统基数
- 列存向量化引擎中的微优化（与 cost model 强相关）——本文的结论是 cost model 不重要，但那是相对于基数而言
- 嵌入式 / 移动端的小数据库——数据量小，错估也跑不慢

## 历史小故事（可跳过）

- **1979 年**：IBM Pat Selinger 在 System R 论文里第一次提出 cost-based 优化器和基于直方图 + **独立性假设** 的基数估算。这一假设从此 "默认开启"。
- **1990s**：商业数据库（Oracle / DB2 / SQL Server）相继落地 Selinger 路线。社区用 TPC-H 当 benchmark，因为数据均匀，优化器看起来都很好。
- **2010 前后**：开始有零散吐槽 "真实场景下优化器不靠谱"，但没人系统化测过。
- **2015 年**：TUM Kemper / Neumann 实验室的 Viktor Leis 等人做这篇论文，造了 JOB，用 IMDB 实测。论文一出，"优化器很好" 的幻觉破掉。
- **2015–2018**：DBA 圈广为流传，被 CMU、Berkeley 数据库课列入必读。
- **2018 年至今**：MSCN / DeepDB / NeuroCard 等 learned 基数估算工作集中爆发，全部以 JOB 为标尺。

## 学到什么

1. **真实数据 benchmark 比合成数据有破坏力得多**——一个数据集换掉，30 年的乐观结论全翻
2. **诊断系统瓶颈靠"换零件"**：把每个组件换成 oracle ground truth，看哪个换完效果最大，瓶颈在哪一目了然
3. **独立性假设** 是数据库 30 年没解决的债——不是没人发现，而是没人愿意付代价改
4. **公开 benchmark 是最大遗产**：JOB 比论文本身更有影响力，因为它让后来人能比较
5. **q-error 这种简单指标比花哨指标管用**：一个比值，所有人一看就懂，争议就少

## 延伸阅读

- 论文 PDF：[How Good Are Query Optimizers, Really? (PVLDB 2015)](http://www.vldb.org/pvldb/vol9/p204-leis.pdf)
- JOB 数据集 + 查询：`http://www-db.in.tum.de/~leis/qo/job.tgz`（论文随附，37 个表 + 113 query）
- 后续工作：Neumann 2018 "Adaptive Optimization of Very Large Join Queries"（继续在 JOB 上做 join 顺序优化）
- CMU 数据库课对应章节：[Andy Pavlo 15-721 Optimizer 1](https://15721.courses.cs.cmu.edu/spring2024/) 把这篇当必读
- learned 基数估算入门：MSCN（Kipf 2019）/ DeepDB（Hilprecht 2020）/ NeuroCard（Yang 2021）
- [[selinger-1979]] —— System R 优化器奠基论文，独立性假设的源头
- [[neumann-2015-large-joins]] —— 同一团队同年关于大型 join 优化的另一篇

## 关联

- [[selinger-1979]] —— Selinger 1979 — cost-based 优化器奠基论文，本文是它 36 年后的"打脸续集"
- [[system-r-1976]] —— System R — 第一个实用关系数据库，独立性假设最早就装在它里面
- [[volcano-1994]] —— Volcano — 基于规则的优化器框架，本文测的几家系统都基于 Volcano 谱系
- [[cascades-1995]] —— Cascades — Volcano 的工业版本（SQL Server / Greenplum 用），同样受困于基数估算
- [[neumann-2015-large-joins]] —— Neumann 大型 join 优化 — 同一实验室同年姐妹篇，改进 join 顺序枚举
- [[volcano]] —— Volcano 执行模型 — 火山式 pull-based 执行迭代器，与本文测的系统执行层共通
- [[ioannidis-1991-propagation]] —— Ioannidis 1991 误差传播 — 早就证明 join 树越深误差越离谱，本文做了实证验证

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[benchmarking]] —— Wisconsin Benchmark — 给数据库出一套可重复的体检题
- [[papers/clickhouse]] —— ClickHouse — 把列存 OLAP 推到硬件极限
- [[duckdb-2019]] —— DuckDB — 把 OLAP 数据库塞进你的 Python 进程
- [[vertica-2012]] —— Vertica 2012 — C-Store 论文走向产品的七年改造账
- [[wco-joins-relational-2020]] —— WCO Joins 2020 — 把最坏情况最优连接搬进关系数据库
