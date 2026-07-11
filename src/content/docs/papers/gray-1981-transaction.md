---
title: Gray 1981 — 把"事务"提升为通用抽象
来源: 'Jim Gray, "The Transaction Concept: Virtues and Limitations", VLDB 1981'
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

Gray 1981 是 Jim Gray 在 Tandem Computers 写的一份技术报告（TR 81.3），同年发表在 VLDB 第七届会议上。它第一次系统地把"事务"从数据库特定术语，**抽象成所有数据管理系统都该用的通用概念**。

日常类比：你在 ATM 上把钱从储蓄账户转到信用卡。你按下确认时，机器内部要做四件事——查余额、扣储蓄账户、加信用卡、写流水。万一中间断电了，**你最不希望看到的就是"储蓄扣了但信用卡没加"**。事务的承诺是：**这四件事，要么全做、要么一件都没做**——你看到的余额永远是合法的。

Jim Gray 把这个朴素的需求抽象成三个性质：原子性（atomicity）、持久性（durability）、一致性（consistency）。两年后 Härder 和 Reuter 加了 Isolation（隔离性），合起来就是大家熟悉的 ACID 四个字母。

## 为什么重要

不理解 Gray 1981，下面这些事都没法解释：

- 为什么 [[postgresql]] / [[mysql]] 默认会自动加锁加日志，付出 30% 性能代价也不肯关——因为 Gray 论证了"没有事务的并发更新必然出错"
- 为什么分布式数据库（[[spanner]] / [[cockroachdb]] / [[foundationdb]]）即使写到全球节点，对外接口仍然是"一个 BEGIN ... COMMIT" —— 这就是 Gray 主张的"事务 = 通用抽象"
- 为什么 [[paxos]] / [[raft]] 这些共识算法把"提交"叫 commit、把"回滚"叫 abort —— 整个分布式系统术语表是 Gray 这一篇定下的
- 为什么微服务时代又冒出 Saga 模式 —— 因为 Gray 在原文最后一节就预言了"长事务"是经典 ACID 的死穴

## 核心要点

事务的三个性质（Gray 1981 原文版本）：

1. **原子性（Atomicity）**：要么全做完，要么一件没做。类比：婚礼仪式上牧师问"你愿意吗？"，两个人说"我愿意"才算婚礼成立——任何一方说"不"，整个仪式作废。代码里就是 `BEGIN ... COMMIT`，中间任何一步出错就 `ABORT`。

2. **持久性（Durability）**：一旦 COMMIT 完成，就算之后地震断电，结果也要在。类比：合同一旦签字盖章，事后撕毁也算违约。工程上靠**预写日志（WAL）**——把意图写到永久介质后再改主存。

3. **一致性（Consistency）**：事务把数据库从"一个合法状态"搬到"另一个合法状态"。类比：账户余额永远不能为负数；转账前后两个账户总和不变。这条由应用约束 + DB 引擎共同保证。

第四个 Isolation（隔离性）由 [[eswaran-1976]] 已经数学化，但 Gray 1981 这篇没并列写进 ACI——是 1983 年 Härder/Reuter 总结时才加上 I 凑成 ACID。

Gray 还把数据库动作分成三类，这一分类比"三性质"还实用：

- **Unprotected**（不受保护）：临时草稿、过程消息——崩溃后丢了无所谓
- **Protected**（受保护）：常规读写——崩溃后必须能 undo 或 redo
- **Real**（真实）：取款机吐钱、火箭点火——做了就改不了，必须延迟到 COMMIT 后再做

## 实践案例

### 案例 1：银行转账的事务包裹

```sql
BEGIN TRANSACTION;
  UPDATE accounts SET balance = balance - 100 WHERE id = 'A';
  UPDATE accounts SET balance = balance + 100 WHERE id = 'B';
COMMIT;
```

**逐部分解释**：

- `BEGIN` 之后两条 UPDATE 进入"暂存区"——别人查 A 还是看到原余额
- 万一第二条之前断电，重启时 DB 看到日志里有 BEGIN 没 COMMIT，会自动 `UNDO` 第一条
- 只有 `COMMIT` 写进日志且刷盘，转账才算定数

### 案例 2：NonStop 容错——把不可靠零件拼成可靠系统

Gray 论文第一个大案例：Tandem 公司用**镜像磁盘 + 进程对**做出年级别 MTBF 的系统。

- 单磁盘一年坏一次，镜像后两块同时坏的期望时间是 800 年
- 每个关键进程有 backup process，主进程死了 backup 接管
- 接管的难点是"接哪一刻的状态"——这是 Gray 引出事务概念的钩子：**用事务的 abort+restart 替代手动 checkpoint**

这套思路后来被 [[paxos]] / [[raft]] 系统化成"共识 + 日志复制"。

### 案例 3：两阶段提交的婚礼类比

跨多个节点的事务怎么"一起 COMMIT"？Gray 用了一个非常生动的类比：

```
阶段 1（PREPARE）: 协调者问每个参与者"你 OK 吗？"
                  每个回 "I do"（准备好了，承诺不再单方面 abort）
阶段 2（COMMIT）: 协调者收齐 "I do" 后宣布"我现在宣布你们..."
                  把 commit 决定广播给所有参与者
```

跟基督教婚礼一字不差——牧师问双方"你愿意吗"，都说"我愿意"才宣布"我现在宣布你们结为夫妇"。这就是 [[2pc]] 协议的雏形，今天每个分布式数据库都在用它的某个变种。

关键设计点：进入 PREPARE 阶段后，参与者**放弃单方面回滚的权利**——必须等协调者最终决定。这条"放弃自由"换来"集体一致"的设计哲学，后来在 [[paxos]] / [[raft]] 里化身为"投票后必须服从多数"。

## 踩过的坑

1. **update-in-place 是个毒苹果**：直接覆盖磁盘上的旧值省存储，但崩溃时旧值丢了无法 undo。Gray 主张要么用日志保留旧值，要么用"时间域寻址"保留多版本。今天的 MVCC（[[postgresql]] / [[cockroachdb]]）就是后者的工业版本。

2. **死锁随并发度平方增长**：Gray 引用自己 1980 年的分析——deadlock 频率 ≈ 并发度² × 事务大小⁴。今天高并发系统拒绝"长事务 + 多行锁"组合就是这条定律的工程后果。

3. **长事务把锁卡死**：旅行社订票场景里，从客户问询到出票可能跨几小时。如果整段都开事务，锁会卡住后端所有人。Gray 在原文最后一章就承认这是 ACID 的死穴，提议"放宽一致性"，后来演化成 1987 年的 Saga 模式。

4. **真实动作没法 undo**：取款机已经吐出 100 元现金，事务事后 abort 也吐不回来。Gray 把动作分成 unprotected（草稿）/ protected（可撤销）/ real（不可逆）三类，real 动作必须**推迟到 commit 之后**再做——这是今天消息队列"恰好一次"语义的源头。

## 适用 vs 不适用

**适用**：

- 短事务 OLTP（银行转账、电商下单、库存扣减）—— 持续毫秒级、影响行数少
- 单机或同机房集群—— 锁延迟低，2PC 协调代价可接受
- 强一致性诉求场景（金融、医疗、票务）

**不适用**：

- 跨秒级以上的工作流（订单履约、报销审批、跨服务编排）—— 用 Saga 加补偿事务替代
- 跨大洲分布式（[[spanner]] 用 TrueTime 优化、但本质还是放宽延迟容忍）
- 高吞吐分析型场景（OLAP、日志聚合）—— 用最终一致性 + 不可变存储（[[kafka]] / [[clickhouse]]）

## 历史小故事（可跳过）

- **1976 年**：[[eswaran-1976]] 发表《On the Notions of Consistency and Predicate Locks》，把 isolation 数学化（serializability）。Gray 是合作者之一。
- **1980 年**：Gray 在欧洲讲座里发表《A Transaction Model》（Springer LNCS V.80），第一次完整描述 BEGIN/COMMIT/ABORT 语义。
- **1981 年 6 月**：Gray 在 Tandem 写下 TR 81.3《The Transaction Concept: Virtues and Limitations》，把 model + implementation + limitations 拼成 23 页综述。同年 9 月在 VLDB-7 宣讲。
- **1983 年**：Härder & Reuter 在 ACM Computing Surveys 发表《Principles of Transaction-Oriented Database Recovery》，把 ACID 四字母敲定。从此 Gray 的 ACI + Eswaran 的 I 合体成为统一术语。
- **1987 年**：Salem & Garcia-Molina 提出 Saga 模式，专门解决 Gray 在 1981 论文末尾点名的"长事务"问题。
- **1998 年**：Jim Gray 因事务概念和数据库恢复研究获得图灵奖。

## 学到什么

1. **抽象的复用价值最大**：Gray 把"事务"从数据库特定术语推广到所有"容错状态变换"，这一抽象后来直接被分布式系统、操作系统、消息队列、文件系统都拿走了。给概念起对名字、画对边界，比写出某段实现代码影响远得多。

2. **失败优先设计**：论文反复强调"系统总会失败、人总会犯错"，所以应该让失败成为一等公民——`ABORT` 跟 `COMMIT` 同等重要。这套"先想最坏再写代码"的姿态贯穿了后来所有可靠系统的设计哲学。

3. **类比是合法的工具**：Gray 用婚礼仪式讲两阶段提交、用 Hansel and Gretel 撒面包屑讲日志、用合同法讲事务起源——一篇 23 页论文里日常类比占一半。理论搞不通时，先用日常生活搭一座桥让人理解。

4. **承认不能解决的就承认**：论文最后三节专门列出"现有事务做不到的事"——长事务、嵌套事务、跟编程语言集成。Gray 没硬讲完美，反而引出了后续 30 年研究方向。这种"指出未来"的诚实，比强行收束的论文有价值得多。

## 延伸阅读

- 论文 23 页 PDF：[The Transaction Concept: Virtues and Limitations](https://jimgray.azurewebsites.net/papers/thetransactionconcept.pdf)（Gray 自己的话最好读，几乎没有数学）
- 视频：[Pat Helland — Standing on Distributed Shoulders of Giants](https://www.youtube.com/watch?v=1KuTWnjenlI)（Pat 是 Gray 的同事，把这条思想线讲了 50 分钟）
- 配套阅读：Härder & Reuter 1983《Principles of Transaction-Oriented Database Recovery》——把 Gray 的工作整理成 ACID 标准
- 现代视角：Martin Kleppmann《Designing Data-Intensive Applications》第 7 章，把事务讲到 21 世纪
- Saga 模式原始论文：Salem & Garcia-Molina 1987《Sagas》—— 解决 Gray 在本论文末章预言的"长事务"难题

## 关联

- [[codd-1970]] —— 关系模型给事务提供了"操作的对象"，事务概念给关系模型补上"怎么改而不出错"
- [[eswaran-1976]] —— 把 Isolation/Serializability 数学化的姊妹篇，Gray 是合作者
- [[paxos]] —— 把 Gray 的 commit/abort 语义在分布式环境里做出来
- [[raft]] —— Paxos 的工程化，commit 语义直接继承 Gray 的定义
- [[spanner]] —— 用 TrueTime 把 ACID 推到跨大洲规模
- [[cockroachdb]] —— 开源版 Spanner，事务模型直接源于本论文
- [[foundationdb]] —— 用确定性模拟测试事务正确性的工业代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[berenson-1995-isolation]] —— ANSI SQL 隔离级别批判 — 教科书的隔离定义其实有漏洞
- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[calvin]] —— Calvin — 先排队再执行的分布式事务系统
- [[farm-2015]] —— FaRM — 把一排机器的内存当成一个低延迟仓库
- [[foundationdb]] —— FoundationDB — 把事务、日志和存储拆开，再用仿真守住正确性
- [[gray-1978-notes]] —— Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
- [[lampson-hints-1983]] —— Lampson Hints 1983 — 系统设计思维起点
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[saga-1987]] —— Sagas — 长事务拆成一串能"反向走回去"的小事务
- [[stm-shavit-touitou]] —— STM Shavit-Touitou — 把"加锁"改成"事务"的源头
- [[stonebraker-2010-sqlnosql]] —— Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL
- [[mysql-server]] —— mysql-server — 一个仓库装下整套 OLTP 引擎
