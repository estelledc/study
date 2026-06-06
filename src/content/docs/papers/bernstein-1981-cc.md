---
title: Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
来源: 'Philip A. Bernstein, Nathan Goodman, "Concurrency Control in Distributed Database Systems", ACM Computing Surveys 13(2), 1981'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Bernstein-Goodman 1981 是一篇**把分布式数据库并发控制做成"分类树"的综述论文**。日常类比：像图书管理员把混乱书堆按"读者借书规则 + 书架补书规则"两条主线重新归架——所有看似不同的方案，归根到底就这两条。

1981 年之前，分布式 DBMS（distributed database management system，跨多台机器存数据的数据库）这个领域已经有 20 多个并发控制算法，每个作者都用自己一套术语，互相说"我比他强"。读完这些论文你会觉得自己迷路了。

Bernstein 和 Goodman 干了一件简单但震撼的事：他们发明了一个统一模型（TM 事务管理器 + DM 数据管理器），把并发控制问题**拆成两个子问题**——读写同步（rw）和写写同步（ww）——然后证明所有 20+ 算法只是这两个子问题的解法做排列组合。

整篇论文 51 页，目录 7 章，列了 48 种主要方法——但读完你只需记住一张 2×N 的组合表。

## 为什么重要

不理解这篇综述，下面这些事都没法解释：

- 为什么 MySQL 和 PostgreSQL 都说自己用"两阶段锁"，但行为不一样——它们对"读写同步"和"写写同步"选了不同子算法
- 为什么 Spanner 用 TrueTime 时间戳能不加锁就跑读事务——它继承了这篇里的"时间戳排序"路线
- 为什么"乐观并发控制（OCC）"在 1980 年代还叫 certifier——这篇里给它定的位置就是 2PL/T-O 的变体
- 为什么所有数据库教材谈事务都先讲 lost update 和 inconsistent retrieval 两个反例——这两个例子就出自这篇论文 §0
- 为什么"可串行化（serializability）"成了事务隔离的金标准——这篇是把它确立为正确性判定的关键综述之一

## 核心要点

整篇论文可以浓缩成 **三个观察**：

1. **并发控制 = rw 同步 + ww 同步**：读写之间的冲突和写写之间的冲突要分开设计。类比：路口红绿灯既要管人和车的冲突（rw），又要管车和车的冲突（ww），两个规则不一样。

2. **所有同步技术只有两条主线**：两阶段锁（2PL）和时间戳排序（T/O）。2PL 类比"先一次性借齐书再一次性还书"；T/O 类比"按号牌叫号——号小的先办"。

3. **复杂算法只是这两条线的混搭**：基础 2PL、主拷贝 2PL、投票 2PL、集中 2PL；基础 T/O、Thomas Write Rule、多版本 T/O、保守 T/O；外加 certifier（乐观）这条旁支。论文目录列了 48 个方法，归根结底就是 2PL × T/O × rw/ww 的组合表。

正确性的判定标准叫**可串行化（serializability）**：一个并发调度被认为对，当且仅当存在某个串行顺序，让所有事务一个接一个跑出来的结果和并发跑的结果一样。这是论文 §2 的核心定义，也是后来所有事务隔离级别的源头。

## 实践案例

### 案例 1：丢失更新（lost update）——为什么必须有并发控制

两个用户同时给同一账户存钱（时间从左到右）：

```
时间 →   t1        t2          t3        t4          t5        t6
账户初始 1,000
T1:    读→1,000              算 +500=1,500           写 1,500
T2:              读→1,000              算 +200=1,200          写 1,200
```

**最终账户 = 1,200**。两人各存了钱，结果只有一笔生效。这就是论文 Anomaly 1：lost update。原因是 T2 读到的是 T1 还没写回的旧值。

要修：让 T1 的"读—算—写"作为一个不可拆开的整体，T2 必须等。

### 案例 2：不一致读（inconsistent retrieval）——比丢更新更隐蔽

T1 转账 100 万：储蓄 -100 万、支票 +100 万。T2 同时查总额（时间从左到右）：

```
时间 →   t1            t2              t3            t4              t5
T1:    读储蓄→200万   写储蓄=100万                  读支票→50万    写支票=150万
T2:                                  读储蓄→100万   读支票→50万    打印总和=150万
```

T1 转账前后总和都是 250 万，但 T2 看到的是 150 万——少了 100 万。

可怕在最终数据库**是对的**，T1 没出错，但 T2 已经把错的数字打出来发邮件了。这是论文 Anomaly 2：rw 同步比 ww 同步更难发现。

### 案例 3：用 2PL 修上面两个例子

在 MySQL InnoDB 里，把每个事务用"成长期—收缩期"两阶段包起来——靠 `SELECT ... FOR UPDATE` 显式加行锁：

```sql
-- T1（转账）
START TRANSACTION;                                  -- 成长期开始
SELECT 余额 FROM 储蓄 WHERE id=1 FOR UPDATE;         -- 加锁 1
SELECT 余额 FROM 支票 WHERE id=1 FOR UPDATE;         -- 加锁 2（仍在成长期）
UPDATE 储蓄 SET 余额 = 余额 - 1000000 WHERE id=1;
UPDATE 支票 SET 余额 = 余额 + 1000000 WHERE id=1;
COMMIT;                                             -- 收缩期：一次性放所有锁
```

逐部分解释：

- 成长期（growing phase）只许加锁、不许放锁
- 收缩期（shrinking phase）只许放锁、不许加锁
- `COMMIT` 到来才进入收缩期；一旦放掉第一把锁就回不去
- T2 此时若执行同样的 `SELECT ... FOR UPDATE` 会被阻塞，等 T1 提交后再继续

规则：**任何锁释放后，不准再申请新锁**。这条规则保证调度等价于某个串行顺序。Bernstein-Goodman 把它形式化为论文 §3，证明只要所有事务都遵守 2PL，整个调度就是可串行化的。

## 踩过的坑

1. **把 2PL 拆成"加锁就行"**：忘掉两阶段，中途放锁再申请新锁——这正是论文 §3.5 警告的反例，会破坏可串行化，比没加锁更危险（因为你以为有保护）。

2. **把时间戳排序当成只用本地时钟**：在分布式里时间戳必须能跨节点比较且单调，否则 N1 的"最早"和 N2 的"最早"打架，T/O 退化成相互拒绝（活锁）。Lamport 1978 的逻辑时钟就是为这个生的。

3. **把 rw 同步和 ww 同步混为一谈**：论文反复提醒——一个粗暴的"全局大锁"两个都管，但吞吐为零。正确做法是分别选子算法（如 ww 用 2PL、rw 用多版本 T/O），这就是 MVCC 的雏形。

4. **把 Thomas Write Rule 当通用规则**：旧时间戳的写直接丢弃，只在 ww 同步合法。读用它会拿到陈旧数据。论文 §4.2 明确说它只适用 blind write 工作流（如日志覆盖、传感器最新值）。

第 1 条对应案例 3 的 SQL：如果你在 `UPDATE 储蓄` 之后就 `UNLOCK 储蓄`，再去 `LOCK 支票`，这就不是 2PL 了——典型反模式。

## 适用 vs 不适用场景

**适用**：
- 任何需要可串行化（serializable）隔离级别的系统：银行、订单、库存
- 写少读多的 OLTP：用多版本 T/O / MVCC（PostgreSQL、Oracle 走的是这条线）
- 写多场景：用 2PL（MySQL InnoDB 默认走这条线）
- 跨地域复制 + 强一致：用集中 2PL 或主拷贝 2PL，但要做好高延迟心理准备

**不适用**：
- 弱一致性可接受的系统（社交动态、计数器）→ 用最终一致性 / [[crdt-json]]
- 完全无冲突的批处理（每个 worker 写各自分片）→ 不需要并发控制，分区即可
- 极低延迟读（毫秒级）+ 强一致 → 这篇里所有方法都给不了，需要 TrueTime 这种硬件辅助（[[spanner]]）
- 高频小事务（每秒百万级）+ 高冲突 → 2PL 死锁泛滥；改用确定性调度（[[calvin]]）或分区

## 历史小故事（可跳过）

- **1970 年**：Codd 发表关系模型（[[codd-1970]]），单机数据库才有理论基础
- **1976 年**：Eswaran 等人在 [[system-r-1976]] 项目里提出 2PL 和 predicate lock（[[eswaran-1976]]）
- **1978 年**：Lamport 提出逻辑时钟（[[lamport-1978]]），分布式时间戳排序有了底层工具
- **1979-80 年**：Stonebraker、Thomas、Reed 各自发表 20+ 个 DDBMS 并发控制算法，互相不兼容、术语混乱
- **1981 年 6 月**：Bernstein 和 Goodman 这篇综述发表于 ACM Computing Surveys 13(2)，把整个领域整理成两条主线，作者当时都在 Computer Corporation of America
- **同年**：Jim Gray 发表《The Transaction Concept》（[[gray-1981-transaction]]），与本篇合奠后续 30 年事务理论
- **1987 年**：Bernstein、Hadzilacos、Goodman 把这篇综述扩展成 400 页教科书《Concurrency Control and Recovery in Database Systems》，至今仍是 DB 课程标准教材

## 学到什么

1. **分类是研究最重要的工作之一**——把 20 个算法归到 2 条主线，比再发明第 21 个有价值
2. **rw 和 ww 要分开看**——这是论文最深刻的洞见，今天 MVCC（多版本并发控制）的核心思想就来自这里
3. **2PL 和 T/O 是并发控制的"加法乘法"**——所有方案都是它们的组合，理解这两个就理解了 80%
4. **统一模型（TM/DM）是写好综述的前提**——没有共同语言，比较就是各说各话；这条经验在 AI/系统领域同样适用

## 延伸阅读

- 论文 PDF：[Concurrency Control in Distributed Database Systems (1981)](https://dl.acm.org/doi/10.1145/356842.356846)（51 页，密度高，建议先读 §0+§2 再挑兴趣段）
- 后续专著：Bernstein, Hadzilacos, Goodman 《Concurrency Control and Recovery in Database Systems》（1987），把 1981 综述扩成 400 页教科书
- 视频讲解：[CMU 15-445 Andy Pavlo — Concurrency Control](https://www.youtube.com/playlist?list=PLSE8ODhjZXjbohkNBWQs_otTrBTrjyohi)（公开课，把 2PL/T-O 演到代码级）
- [[lamport-1978]] —— 给分布式时间戳排序提供了理论基础
- [[eswaran-1976]] —— 2PL 在 System R 里的最早实现
- [[gray-1981-transaction]] —— 同年提出 ACID 概念，与本篇互补

## 关联

- [[eswaran-1976]] —— 2PL 起源论文，本篇把它推广到分布式
- [[gray-1981-transaction]] —— 同年的事务模型理论，与本篇合奠事务领域
- [[lamport-1978]] —— 逻辑时钟，是分布式时间戳排序的底层工具
- [[system-r-1976]] —— 第一个实现 2PL 的关系数据库系统
- [[codd-1970]] —— 关系模型论文，事务概念建立在它之上
- [[spanner]] —— 30 年后用 TrueTime 把时间戳排序推向行星级
- [[calvin]] —— 用确定性事务调度替代传统并发控制的现代变体

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[calvin-2012]] —— Calvin 2012 — 先排好顺序再执行，让跨分区事务不再走 2PC
- [[cascades-1995]] —— Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器
- [[chain-replication-2004]] —— Chain Replication — 把多副本排成流水线，简单且强一致
- [[chaitin-graph-coloring]] —— Chaitin 图染色寄存器分配 — 把硬件资源问题翻译成数学问题
- [[chapar-2016]] —— Chapar — 第一个被机器证明的因果一致 KV 存储
- [[cockroachdb-2020]] —— CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库
- [[codd-1970]] —— Codd 1970 — 关系模型奠基
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[fast-paxos-2006]] —— Fast Paxos — 给 Paxos 加一条乐观快车道
- [[foundationdb-2021]] —— FoundationDB 2021 — 把数据库拆成五个角色，再用一个 seed 烧十年 bug
- [[gray-1978-notes]] —— Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[presumed-abort-1986]] —— Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识
- [[saga-1987]] —— Sagas — 长事务拆成一串能"反向走回去"的小事务
- [[skeen-3pc-1981]] —— Skeen 1981 三阶段提交 — 给 2PC 的阻塞缺陷打补丁
- [[smr-1990]] —— SMR 1990 — 把"容错服务"还原成"多副本一起跑同一台状态机"
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[stm-shavit-touitou]] —— STM Shavit-Touitou — 把"加锁"改成"事务"的源头
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[volcano]] —— Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流

