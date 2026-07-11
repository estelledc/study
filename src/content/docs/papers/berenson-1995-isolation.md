---
title: ANSI SQL 隔离级别批判 — 教科书的隔离定义其实有漏洞
来源: 'Berenson et al. "A Critique of ANSI SQL Isolation Levels". SIGMOD 1995'
日期: 2026-06-24
分类: 数据库
难度: 中级
---

## 是什么

这篇论文指出 ANSI SQL-92 标准对事务隔离级别的定义**有歧义、不完整、甚至漏掉了几种重要的并发异常**。

日常类比：SQL 标准给数据库写了一份"考试大纲"，说只要避免脏读、不可重复读、幻读这三种作弊就算合格。
但论文发现这份大纲用词模糊——同一句话能读出两种截然不同的意思；
而且大纲压根没收录好几种常见作弊手法（脏写、丢失更新、读偏斜、写偏斜），
导致很多数据库"按大纲达标"却仍然在并发场景下出 bug。

论文在重新精确定义这些异常之后，
提出了一个当时尚未标准化却极为重要的隔离级别——
**Snapshot Isolation（快照隔离）**，
也就是今天 PostgreSQL 的 Repeatable Read、Oracle 的 SERIALIZABLE 常被说成 "SI-like" 的核心原因。

## 为什么重要

不读这篇论文，下面这些现象说不清楚：

- 为什么 PostgreSQL 的 Repeatable Read 其实是快照隔离而不是传统锁式 RR
- 为什么 Oracle 的 SERIALIZABLE 更接近 Snapshot Isolation，遇到写偏斜不会像真正 Serializable 那样兜底
- 为什么 MySQL InnoDB 的 Repeatable Read 能防幻读但理论上不算 Serializable
- 为什么同一条 SQL 在不同数据库下跑出不同结果

今天任何关于数据库隔离级别的严肃讨论，都绕不开这篇 1995 年的论文——
它重新定义了整个话语体系，后续所有论文（包括 PostgreSQL SSI、CockroachDB 的隔离实现）都引用它作为基准。

## 核心要点

论文的贡献可以拆成三块。

**第一块：揭示 ANSI 定义的歧义。**
ANSI 标准用自然语言描述了三种异常现象。论文把每种异常拆成两种形式化解读：
"严格解释"（A1/A2/A3）只匹配非常特定的历史模式，
"宽泛解释"（P1/P2/P3）覆盖更多危险历史。
论文证明：如果你只禁止严格解释的异常（A1+A2+A3 全禁），
得到的并不是 Serializable——还有一大堆违反可串行化的执行历史漏网。
正确做法是禁止宽泛解释 P1+P2+P3。

**第二块：补上遗漏的异常。**
标准完全没提的异常包括：
P0 脏写——两个事务交叉写同一行，导致约束破坏或崩溃恢复时无法回滚；
P4 丢失更新——先读后写，覆盖了别人的写入，银行转账经典 bug；
A5A 读偏斜——事务内两次读看到不一致的状态；
A5B 写偏斜——两个事务各读一个值、各写另一个值，单独看都合法但合起来违反约束。

**第三块：正式定义 Snapshot Isolation。**
每个事务在开始时拿到一份数据库"快照"（逻辑时间戳），
读操作永远看这份快照；
提交时检查写集合有没有和其他已提交事务冲突（first-committer-wins），
有冲突就回滚。
论文画出了隔离级别之间的偏序关系图（Hasse Diagram），
证明 Snapshot Isolation 比 Read Committed 强、和 Repeatable Read 不可比较、比 Serializable 弱。

## 实践案例

### 案例 1：写偏斜导致数据不一致

银行有两个账户 x=50、y=50，业务约束是 x+y≥0：

```text
T1: 读 x=50,y=50 → 判断总额够 → 写 x=-10
T2: 读 x=50,y=50 → 判断总额够 → 写 y=-10
提交检查：T1 写 x，T2 写 y，写集合不重叠，都通过
```

逐步看：两人都拿到同一张旧快照；每个人单独看都合法；合起来变成 x+y=-20。
这就是 A5B 写偏斜，在真正的 Serializable 下应该至少回滚一个事务。

### 案例 2：丢失更新

库存初始是 10，两个人同时下单：

```text
A: read 10 → write 9
B: read 10 → write 9
```

逐步看：正确结果应该是 8；最后却是 9，说明有一单被覆盖。
这就是 P4 丢失更新。Snapshot Isolation 的 first-committer-wins 能防住同一行写冲突；
Read Committed 下如果只是"读出来再写回"，就要显式加锁或用原子 `UPDATE stock = stock - 1`。

### 案例 3：PostgreSQL 的 Repeatable Read 名不副实

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
-- 两个事务各自读到同一份旧快照
-- 只要它们写不同的行，提交时不会互相冲突
COMMIT;
```

逐步看：这个级别让你反复读到同一份快照，所以名字叫 Repeatable Read；
但它不是传统锁式 RR，而是 Snapshot Isolation。写偏斜场景下要改用 PostgreSQL 9.1 之后的
`SERIALIZABLE`（SSI 算法），并准备好重试被回滚的事务。

## 踩过的坑

最常见的误解是以为数据库文档里写的隔离级别名字就是论文里的定义。
Oracle 的 SERIALIZABLE 实际是 Snapshot Isolation，遇到写偏斜不会自动回滚。
MySQL 的 Repeatable Read 靠 MVCC + 间隙锁实际上防了很多 Phantom，
但没有完整的谓词锁，极端情况仍然不是真正的 Serializable。

第二个坑是把"不可重复读"和"幻读"混为一谈。
不可重复读（P2）是同一行的值变了，用行锁就能防；
幻读（P3）是查询范围里多了或少了行，需要谓词锁或间隙锁才能防。
防了 P2 不代表防了 P3，它们是不同维度的问题。

第三个坑是忽略脏写（P0）。
所有隔离级别都应该禁止脏写，但 ANSI 标准连 P0 都没提。
脏写不只导致数据错乱，还让崩溃恢复（[[aries-1992|ARIES]] 那样的 WAL 恢复）无法正确回滚。

## 适用 vs 不适用场景

**适用**：
需要在并发正确性和性能之间做权衡的关系型数据库系统设计；
需要理解为什么同一个 SQL 在不同数据库下行为不同；
需要选择隔离级别的应用开发者——读完论文才知道自己真正需要什么级别；
在做分布式数据库（如 [[spanner-2012|Spanner]]、[[cockroachdb-2020|CockroachDB]]）的隔离设计时，这篇论文是必读基准文献。

**不适用**：
单线程或无事务的场景（比如 Redis 单线程命令）；
最终一致性的 NoSQL 系统——它们根本不在这个隔离级别体系内讨论；
纯读场景——没有写冲突就不存在这些异常。

## 历史小故事（可跳过）

论文作者阵容豪华：Hal Berenson 来自微软 SQL Server 团队，
Phil Bernstein 是事务处理理论大家（写了[[bernstein-1981-cc|经典并发控制教材]]），
Jim Gray 是数据库领域图灵奖得主（[[gray-1981-transaction|事务概念奠基人]]）。
这篇论文本质上是工业界三大高手联手向 ANSI 标准委员会喊话："你们的定义写错了。"

有趣的是，论文发表后 ANSI 标准委员会并没有立刻修改 SQL 标准。
但整个数据库社区从此用论文里的定义取代了标准原文来讨论隔离级别，
"P0/P1/P2/P3/A5A/A5B"这套编号已成为事实上的行业标准。
SQL:1999 及后续版本依然没有收录 Snapshot Isolation 作为标准隔离级别，
但几乎所有主流数据库的实现都以它为核心。

## 学到什么

三个要带走的认知。
第一，标准文档不一定对——形式化和严格定义比自然语言描述更可靠。
ANSI 标准用英文散文定义异常，结果同一句话能解读出"严格版"和"宽泛版"两种完全不同的含义。
这告诉我们写技术文档时要尽量用形式化语言或至少给出明确的例子。

第二，隔离级别之间不是简单的线性排序，而是一个偏序关系。
Snapshot Isolation 和 Repeatable Read 就是不可比较的——
SI 防了读偏斜但防不了写偏斜，锁定义的 RR 防了 P2 但实现上各家不同。
这意味着你不能简单地说"级别越高越好"，需要根据业务场景选择。

第三，理论漏洞会变成工程 bug。
写偏斜导致的数据不一致在金融、库存、医疗值班排班等场景里是真实事故，
不是学术界自娱自乐的例子。

## 延伸阅读

- [[gray-1978-notes]] —— Jim Gray 的事务处理笔记，理解事务模型的起点
- [[aries-1992]] —— 事务恢复算法 ARIES，和隔离级别互为表里
- [[presumed-abort-1986]] —— 两阶段提交的优化，理解分布式事务语义
- Fekete et al. "Making Snapshot Isolation Serializable" TODS 2005 —— 在 SI 上加冲突检测达到真正的 Serializable
- Cahill et al. "Serializable Isolation for Snapshot Databases" SIGMOD 2008 —— PostgreSQL SSI 的理论基础

## 关联

- [[gray-1981-transaction]] —— 事务的概念和隔离最早由 Jim Gray 定义，本文是对那套定义的修正和细化
- [[eswaran-1976]] —— 最早证明两阶段锁保证可串行化，本文的锁级别定义直接对应这里的理论
- [[bernstein-1981-cc]] —— 并发控制理论教材，本文作者之一 Phil Bernstein 的代表作
- [[selinger-1979]] —— System R 查询优化器，和 System R 的锁实现共享同一套隔离语义
- [[saga-1987]] —— 长事务的替代方案，当严格隔离代价太高时的另一条路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[cockroachdb-2020]] —— CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[gray-1978-notes]] —— Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[presumed-abort-1986]] —— Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识
- [[saga-1987]] —— Sagas — 长事务拆成一串能"反向走回去"的小事务
- [[selinger-1979]] —— Selinger 1979 — 基于代价的查询优化
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳

