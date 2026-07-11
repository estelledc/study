---
title: Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识
来源: 'Mohan, Lindsay, Obermarck. "Transaction Management in the R* Distributed Database Management System". ACM TODS 1986'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

**Presumed Abort（PA）和 Presumed Commit（PC）**，是 IBM R* 团队 1986 年给标准两阶段提交（2PC）协议加的两个优化。日常类比：像两个朋友约定好"如果电话打不通，默认对方没来"——这样就不用每次见面前都互相确认到了没。

标准 2PC 里，协调者每做一个决策都要先强制写磁盘日志（force write），参与者每收到一条消息也要回 ACK。这两件事都很贵：force write 要等磁盘转一圈，ACK 要走一趟网络往返。

```
标准 2PC 协调者：force PREPARE → 等票 → force COMMIT/ABORT → 等 ACK → force END
                  4 次磁盘写 + N 次网络往返 ACK
```

PA/PC 的洞见是：**如果双方对"日志里查不到某事务时该怎么判断"达成默认共识，就能直接省掉对应的日志写或 ACK**。R* 让所有 2PC 实现首次有了"轻量模式"，后续 PostgreSQL、Spanner、CockroachDB 都在用。

## 为什么重要

不理解 PA/PC，下面这些事都没法解释：

- 为什么现代分布式数据库的 2PC 比 1980 年代教科书版快好几倍——大半功劳就在这两个优化
- 为什么 PostgreSQL 的 `PREPARE TRANSACTION` 日志格式有"参与者列表"字段——这是 PC 的硬性要求
- 为什么有些系统标榜"读多优化"——PA 让只读事务几乎零日志开销
- 为什么分布式事务 abort 路径反而比 commit 路径"轻"——PA 把 abort 设成默认，省了一整轮 ACK

## 核心要点

PA 和 PC 各自的核心机制可以拆成 **三步**：

1. **约定默认值**：协调者和参与者事先达成共识——"如果你来问我某事务结果，但我日志里查不到，那就当它 ABORT（PA）/ COMMIT（PC）"。类比：两人约好"短信没回就当默认答案"。

2. **省掉对应方向的日志和 ACK**：PA 下，协调者 abort 一个事务**不用 force 写日志**，因为查不到就等于 abort；参与者收到 abort 也**不用 ACK**。PC 反向——commit 决策不用等 ACK，但要求 prepare 前把参与者列表 force 写好。

3. **恢复时按默认值回答**：协调者崩溃重启后，参与者来问"事务 T 怎么样了"，协调者查日志没找到——按约定回 abort（PA）或 commit（PC）。

三步加起来叫 **PA/PC 协议簇**。R* 论文还把它们组合到 **Tree of Processes**（树形协调结构）里——中间节点**既当爹又当儿子**：对上是参与者投票，对下是协调者拍板。

## 实践案例

### 案例 1：标准 2PC vs Presumed Abort（只读事务）

只读事务最常见——比如一笔跨两个分片的 SELECT。标准 2PC 流程：

```
协调者 → 参与者 A、B：PREPARE
A、B 都回 READ-ONLY VOTE（"我没改东西"）
协调者 force COMMIT
协调者 → A、B：COMMIT
A、B → 协调者：ACK
协调者 force END
```

**PA 优化后**：参与者投 READ-ONLY 时**直接结束**——不等 COMMIT、不发 ACK。协调者也不需要 force 任何日志。一次磁盘写都没有，省了 3 次 ACK。这就是为什么很多 OLTP 系统对只读混合事务几乎零开销。

### 案例 2：Presumed Commit 怎么救读写事务

读写事务如果用 PA，commit 路径上协调者还是要 force COMMIT + 等 N 个 ACK。PC 反过来：

```
协调者：force "事务 T 涉及 A、B，开始 prepare"  ← 这一步 PA 不需要、PC 必须
协调者 → A、B：PREPARE
A、B 都回 YES
协调者：force COMMIT
协调者 → A、B：COMMIT
A、B 不发 ACK ←  PC 省掉这一步
```

PC 的代价是**多一次开始日志**，但收益是**省掉 N 个 ACK**——参与者多时极划算。

### 案例 3：现代系统里能看到的影子

PostgreSQL 的两阶段提交命令：

```sql
BEGIN;
-- 改两个分片的数据
PREPARE TRANSACTION 'tx-42';   -- 这条会 force 写日志，记录参与者
COMMIT PREPARED 'tx-42';        -- 这条不需要等所有 ACK
```

这个"PREPARE 时就 force 写参与者列表"的设计，教学上可看作 PC 思路的工业对照（看日志里有没有参与者名单）。CockroachDB 在每个 range 上跑 2PC、Spanner 跨 Paxos 组协调事务，骨架仍是原子提交——把"本地 force 日志"换成复制日志，并沿用「默认共识省往返」一类优化，不必当成 R* 状态机的逐字移植。

## 踩过的坑

1. **PA 不是"忘了就行"**：协调者忘记 abort 决策后参与者再来问，必须按"查不到 = abort"明确回答；如果回"我不知道"参与者会 block。PA 是**双方共识的默认值**，不是省略日志。

2. **PC 必须先 force 参与者列表**：否则协调者崩溃后不知道要通知谁，恢复时漏掉某个参与者，对方还卡在 prepared 状态——这是新人实现 PC 最容易踩的洞。

3. **PA 和 PC 不能在同一笔事务里混**：协调者用 PA 决策、参与者按 PC 解释，结论会相反（一边以为 abort、一边以为 commit）。R* 实现里同一笔事务必须从头到尾用同一种。

4. **Tree of Processes 状态机复杂**：中间节点既是协调者又是参与者，需要同时维护"对父亲的投票"和"对孩子的决策"两套状态。很多教材只讲两层平面 2PC，回避树形扩展——但真实系统的子事务、嵌套调用都是树。

## 适用 vs 不适用场景

**适用**：

- 跨多分片 / 多节点的关系型分布式事务（PostgreSQL XA、CockroachDB、TiDB）
- 只读比例高的 OLTP 工作负载——PA 让只读事务零开销
- 写多但参与者多的事务——PC 省 ACK 数和 N 成正比
- 嵌套子事务、跨服务调用——直接套 Tree of Processes 模型

**不适用**：

- 单机数据库（不需要协调多节点，2PC 整体没必要）
- 高并发短事务且抗不了 prepare 阶段阻塞 → 考虑 Calvin / 确定性事务
- 跨广域网 + 节点频繁失效 → 优化省下的开销不抵网络抖动 → 用 Paxos commit / Spanner-style
- 完全乐观并发 / 不用 2PC 的系统（很多 NoSQL）

## 历史小故事（可跳过）

- **1976 年**：IBM 圣何塞 System R 跑出第一个完整 SQL 关系数据库，事务与恢复的工程基础在这里成型。
- **1978 年**：Jim Gray《Notes on Data Base Operating Systems》（LNCS；稿约约 1977）系统讲清原版 2PC，成为后续分布式提交的对照基线。
- **1980–1986 年**：System R 团队做 R* 多机扩展；1986 年 Mohan、Lindsay、Obermarck 在 ACM TODS 发表 "Transaction Management in the R*"，系统化提出 PA/PC 与 Tree of Processes。
- **1992 年**：Mohan 在 ARIES 论文里把日志与恢复思想推到极致。
- **2012 年起**：Spanner、CockroachDB、TiDB 等在 2PC 骨架上嫁接 Paxos / Raft 复制日志；教学上常对照 PA/PC 的「默认共识省 I/O」思路，而非逐字复刻 R* 状态机。

之后 40 年，支持分布式事务的关系型系统仍绕不开这套提交与恢复语义。

## 学到什么

1. **共识默认值省的是 I/O 不是状态**——日志和 ACK 都贵，约好"查不到等于什么"就能直接砍掉
2. **优化方向取决于工作负载**：只读多用 PA，写多参与者多用 PC，没有银弹
3. **协议设计 = 状态机 + 恢复语义**：每省一笔日志都要问"崩溃后能不能正确恢复"，PA/PC 设计的关键在恢复路径而非正常路径
4. **基础研究 → 标配** 用了 30 多年。1986 提出的优化，今天每个分布式 DB 都在用，但很少有人意识到来源

## 延伸阅读

- 教材章节：Gray & Reuter《Transaction Processing》第 12 章——把 PA/PC 用动画讲一遍
- 论文 PDF：[ACM TODS 1986 原文](https://dl.acm.org/doi/10.1145/7239.7265)（密度高，案例少）
- PostgreSQL 文档：`PREPARE TRANSACTION` 命令——直接看 PC 在工业里的形态
- [[aries-1992]] —— ARIES 把同一作者的日志思想推到恢复极致
- [[skeen-3pc-1981]] —— 三阶段提交，2PC 阻塞问题的另一种解法
- [[gray-1978-notes]] —— 原版 2PC 论文，PA/PC 的对照基线

## 关联

- [[gray-1978-notes]] —— 原版 2PC 协议，PA/PC 是它的优化
- [[system-r-1976]] —— System R 是 R* 的单机祖先，关系模型同源
- [[aries-1992]] —— 同一团队的恢复算法，日志思想一脉相承
- [[skeen-3pc-1981]] —— 3PC 解决 2PC 阻塞，但工业上反而是 PA/PC 胜出
- [[spanner-2012]] —— Spanner 的 2PC 嫁接 Paxos 复制日志，PA/PC 思想还在
- [[cockroachdb-2020]] —— 每个 range 跑 2PC + Raft，PA/PC 优化直接复用
- [[bernstein-1981-cc]] —— 并发控制理论基础，2PC 解决的是其中"原子提交"子问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[berenson-1995-isolation]] —— ANSI SQL 隔离级别批判 — 教科书的隔离定义其实有漏洞
