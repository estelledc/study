---
title: System R 1976 — 第一个跑起来的关系数据库
来源: 'Astrahan et al., "System R: Relational Approach to Database Management", ACM TODS 1976'
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

System R 是 IBM San Jose 研究院 1974-1979 年做的数据库项目，1976 年这篇论文是它的中段总报告。它做了一件听起来普通、但当时没人做成过的事：**把 [[codd-1970]] 提出的"用关系（表）+ 高级查询语言"的纯数学想法，第一次变成一个真正能跑、能并发、能崩溃恢复的系统**。

日常类比：

- [[codd-1970]] 像建筑师画了一张革命性的图纸——"把传统拥挤的迷宫式仓库换成一排排整齐的货架"。
- System R 是工程队真把楼盖起来——找到地基怎么打、墙怎么砌、电梯怎么装、火灾怎么救，所有"图纸不会告诉你"的工程问题都得现场解决。

更关键的是它顺手发明了三件事：**SQL 语言**、**基于代价的查询优化器**（详见 [[selinger-1979]]）、**两阶段锁 + 预写日志的事务模型**。这三件事今天 [[postgresql]] / [[mysql]] / Oracle / SQL Server 内部都还看得见骨架。

整篇 1976 年的 ACM TODS 论文 41 页，作者 14 人，是研究项目第二阶段（多用户版本）的总报告——把"前一年单用户原型"踩过的坑、新加的事务和优化器一次性公开出来。

## 为什么重要

不理解 System R，下面这些事都说不清：

- 为什么所有主流关系库内部都长得很像（解析器 + 优化器 + 存储引擎）——这个分层在 System R 就定型了
- 为什么 SQL 而不是 QUEL 赢了（同一时代 Berkeley 的 Ingres 用 QUEL）——商业实现拼的是工程完整度
- 为什么数据库要谈"事务"和"恢复"——System R 第一次把它们写成可用算法
- 为什么 IBM Db2 / SQL/DS / Oracle 1979 起的产品全都长一个样——它们是 System R 的直系后代
- 为什么"关系数据库 = ACID + SQL"成了一个固定搭配——System R 把这两个本来无关的东西打包卖给了整个行业

## 核心要点

System R 定义了 **三层架构 + 三大核心机制**：

1. **RDS + RSS 双层结构**：上层 RDS（Relational Data System）负责 SQL 解析、视图、权限和优化；下层 RSS（Relational Storage System）负责把元组存进磁盘、加索引、管事务和锁。类比：餐厅前台（RDS）记单子，后厨（RSS）做菜，前台不需要知道菜怎么炒，后厨也不操心客人点的菜单长什么样。

2. **基于代价的查询优化器**：用户写一句 SQL，引擎自己算"哪条执行路径读盘最少"。具体算法见 [[selinger-1979]]——动态规划枚举 join 顺序。这是后来所有数据库优化器的祖宗。

3. **事务 + 锁 + 日志三件套**：两阶段锁（2PL）保证并发不出错；预写日志（WAL）保证崩溃后能恢复；多粒度锁（表锁 / 页锁 / 行锁）让锁竞争降下来。这套组合是 ACID 在工程上第一次完整落地。

第四个贡献：**视图 + 授权**——视图是"虚拟表"（一段查询起个名字），授权用 GRANT / REVOKE 控制谁能看哪张表 / 视图。今天 SQL 标准里它们仍然按这个语义工作。

## 实践案例

### 案例 1：System R 怎么把 SQL 翻译成执行计划

```sql
SELECT 员工.姓名, 部门.名称
FROM 员工 JOIN 部门 ON 员工.部门id = 部门.id
WHERE 员工.工资 > 50000
```

System R 内部分两步：

1. **RDS 层**：解析 SQL，检查权限（你能不能查员工表），调用优化器枚举执行路径——"先扫员工筛工资再 join 部门" vs "先 join 再筛工资"。优化器算每种的代价（读多少页、生成多少中间行），挑最小的一条。
2. **RSS 层**：拿到选中的计划（如 `nested-loop join, 索引扫描`），按计划访问磁盘上的页，并加合适粒度的锁。

当时的优化器代码住在 RDS 内，不是另一个进程——这种紧耦合至今仍是大多数数据库的做法。

### 案例 2：B-tree 索引在 System R 里的角色

```sql
CREATE INDEX idx_salary ON 员工(工资)
```

System R 的索引用 [[b-tree-1972]]——查一行是 O(log n) 而不是 O(n)。对于 `WHERE 工资 > 50000`，优化器算："如果有索引、命中率低（只筛 5% 行），就走索引扫描；命中率高（80% 行满足），就直接全表扫"。

这套"看选择率挑访问路径"的判断，至今写在 [[postgresql]] 优化器源码里。System R 的索引也是**复合索引**——可以一个索引包含多列，按字典序排，专门服务多条件查询。

### 案例 3：事务和恢复怎么协作

```sql
BEGIN;
UPDATE 账户 SET 余额 = 余额 - 100 WHERE id = 1;
UPDATE 账户 SET 余额 = 余额 + 100 WHERE id = 2;
COMMIT;
```

System R 的处理：

1. 两条 UPDATE 各自先写一条**日志**（"id=1 旧值 X 新值 Y"）到日志文件，**再**改真实数据页——这就是预写日志（WAL）。
2. 同时在两行上加 X 锁（写锁），别的事务读不到中间态。
3. COMMIT 时把日志强刷到磁盘；中途崩溃就用日志做 redo / undo。

这个流程是今天每个事务数据库的样板。System R 没用今天的 ARIES，但思路完全是它的雏形——日志先行 + 锁保证可串行化 + 检查点定期截断日志，三个关键决策都在这里被验证可行。

## 踩过的坑

1. **早期版本性能太差**：Phase 0 单用户原型（1974-75）把每条 SQL 都现解释执行，慢到无法实测。Phase 1 重写成"把 SQL 编译为机器码模板"才跑得动——这个"预编译"思路被 IBM Db2 继承。

2. **多粒度锁互相阻塞**：表锁和行锁互不兼容，但实现时如果先拿行锁、又有人来要表锁，就会死锁。团队为此发明了"意向锁"（IS / IX）——拿行锁前先在表上挂 IX 标记，让上层判断有没有冲突。

3. **优化器估错代价**：优化器需要"表大小、列分布"的统计信息。早期 System R 没自动收集，DBA 要手动跑 RUNSTATS——忘了跑统计就会挑出离谱执行路径。今天叫"统计过期问题"，被骂了 50 年。教训：成本模型再准，输入数据老了一切都崩。

4. **SEQUEL 和最终 SQL 不完全一样**：1974 年 SEQUEL 论文里的语法和 1976 System R 实际跑的版本已有差异；1979 年外卖给客户时又改一轮。早期客户拿着旧论文写代码会跑不通——经典"论文 vs 实现"差。

## 适用 vs 不适用场景

**适用**（System R 思路的延续）：
- 任何关系数据库——它的三层架构是默认范式
- OLTP 场景——事务 + 锁 + 日志组合就是为高并发短查询设计的
- 通用 SQL 接口——SQL 不是凭空冒出来的，是 System R 团队磨出来的

**不适用**：
- 大规模分析（OLAP）—— [[clickhouse]] / [[snowflake]] 用列存 + 向量化代替了行存 + 单元组遍历
- KV / NoSQL 场景 —— [[dynamo]] / [[bigtable]] 砍掉 SQL 和事务换可用性
- 流式数据处理 —— [[kafka]] / Flink 是另一套数据流模型，不是关系模型
- 嵌入式 / 单文件场景 —— SQLite 借鉴了 SQL 但把锁 / 事务大幅简化，不走 System R 的多层架构

## 历史小故事（可跳过）

- **1974 年**：[[codd-1970]] 论文已发表 4 年但没人实现，IBM 内部争论"关系模型到底快不快"。San Jose Lab 立项 System R 来证明它能跑。
- **1974-1975 年（Phase 0）**：单用户原型，验证 SQL 可以编译执行。Donald Chamberlin 和 Raymond Boyce 设计 SEQUEL；后来因商标冲突缩写成 SQL。
- **1976-1977 年（Phase 1）**：多用户版本，加锁、加事务、加恢复、加优化器。1976 这篇 ACM TODS 论文就是这个阶段的总报告。
- **1977-1979 年（Phase 2）**：在 Pratt & Whitney 等 3 家客户实测。[[selinger-1979]] 优化器论文随后出炉。同时 Berkeley 的 Ingres（Stonebraker 团队）独立做出另一个关系实现，用 QUEL 语言。
- **1979-1983 年**：IBM 把 System R 商业化为 SQL/DS（1981）和 Db2（1983）。SQL 成为 ANSI 标准（1986）。

## 学到什么

1. **想法 vs 实现差 6 年**：Codd 1970 提出关系模型，1976 才有第一个跑起来的版本。理论和工程的距离不可低估。
2. **SQL 不是设计出来的，是磨出来的**：从 SQUARE → SEQUEL → SQL，每次实现碰到问题就改一轮语法。今天看似自然的 `SELECT...FROM...WHERE...` 是无数次工程取舍的结果。
3. **分层是数据库内部的根性架构**：RDS / RSS 这种"逻辑层 + 物理层"分离今天还在每个数据库里，是写大型系统的元方法论。
4. **事务、锁、日志是一个整体**：System R 第一次让人看清，要做并发安全的数据库，这三件事必须一起设计——后来 [[paxos]] / [[raft]] 的分布式事务也建立在这个三件套之上。
5. **研究项目能改变行业的标准做法**：System R 不是产品而是研究——它的价值不在于直接卖给客户，而在于把"关系模型可以工程化"这件事证明给所有怀疑者看，几年后整个市场就跟着转过来了。

## 延伸阅读

- 论文 PDF：[System R: Relational Approach to Database Management (ACM TODS 1976)](https://dl.acm.org/doi/10.1145/320455.320457)（41 页，工程细节密度极高）
- 视频讲解：[CMU 数据库课 — Andy Pavlo 讲数据库系统史](https://www.youtube.com/watch?v=ZqfDJSbkA9w)（30 分钟把 System R 架构和影响讲一遍）
- 1995 SQL Reunion 文集：[The 1995 SQL Reunion - McJones 编](https://www.mcjones.org/System_R/SQL_Reunion_95/sqlr95.html)（团队成员口述史）
- [[codd-1970]] —— System R 实现的就是这篇提出的关系模型
- [[selinger-1979]] —— System R 优化器的核心算法
- [[b-tree-1972]] —— System R 索引底座

## 关联

- [[codd-1970]] —— 提出关系模型的论文，System R 是它的首个工业级实现
- [[selinger-1979]] —— System R 团队为 RDS 写的优化器，至今是查询优化的样板
- [[b-tree-1972]] —— System R 索引和 RSS 的存储基础
- [[lsm-tree-1996]] —— 反方向的存储设计：写优化 vs System R B-tree 的读优化
- [[postgresql]] —— Berkeley Postgres 是 System R 后期的同时期对手，今天合流到关系范式
- [[spanner]] —— 分布式版本的 System R 思路，把锁 + 日志 + 事务推到全球
- [[mysql]] —— 工程简化版的 System R，InnoDB 引擎的事务 / 锁机制几乎照搬

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[benchmarking]] —— Wisconsin Benchmark — 给数据库出一套可重复的体检题
- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[cascades-1995]] —— Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器
- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[comer-1979-btree]] —— Comer 1979 — B-Tree 综述：为什么这棵树到处都有
- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[ingres-1976]] —— INGRES 1976 — Berkeley 平行实现的关系数据库
- [[leis-2015-optimizers]] —— Leis 2015 — 用真实数据打脸所有数据库的查询优化器
- [[neumann-2015-large-joins]] —— Adaptive Optimization of Very Large Join Queries — 100 张表也敢精确求解
- [[presumed-abort-1986]] —— Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识
- [[sequel-1974]] —— SEQUEL 1974 — 让数据库"听懂"近似英语的查询
- [[vertica-2012]] —— Vertica 2012 — C-Store 论文走向产品的七年改造账
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流
- [[mysql-server]] —— mysql-server — 一个仓库装下整套 OLTP 引擎
