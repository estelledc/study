---
title: Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完
来源: 'Jim Gray, "Notes on Data Base Operating Systems", in Operating Systems: An Advanced Course, LNCS 60, 1978'
日期: 2026-05-30
分类: databases
难度: 中级
---

## 是什么

Gray 1978 是 Jim Gray 在 1977 年慕尼黑暑期学校讲的一份**130 页讲义**。日常类比：像一位主厨把"开餐厅每天要做的所有事"——进货、备料、点菜、上菜、对账、关店——一次性写成厨房手册。后来所有数据库内核（PostgreSQL / MySQL / Oracle / SQL Server / Spanner）的厨房，都是照这本手册改的。

它不是一篇论文，是**操作系统暑期学校的讲义**，1978 年收入 Springer LNCS 60。题目用的是"Data Base Operating Systems"——把数据库当成"建在普通操作系统之上的另一层操作系统"来讲。

讲义里第一次完整地把**四件事讲在一起**：

1. 事务（transaction）的语义 — BEGIN / COMMIT / ABORT
2. 并发控制 — 两阶段封锁（2PL）+ 锁粒度层级
3. 故障恢复 — 写前日志（WAL）+ DO/UNDO/REDO
4. 分布式提交 — 两阶段提交（2PC）

今天数据库面试讲到的 80% 内核知识，源头就这一份。

## 为什么重要

不理解 Gray 1978，下面这些事都没法解释：

- 为什么 PostgreSQL / MySQL 的事务接口叫 `BEGIN ... COMMIT ... ROLLBACK` —— 这三个动词是 Gray 1978 写下来的
- 为什么所有 DBMS 默认要写 redo/undo 日志，宁可慢也不肯关 —— 因为 Gray 论证了"没有日志的崩溃恢复必然丢数据"
- 为什么 [[spanner]] / [[cockroachdb]] 跨大洲提交事务，对外仍然是一句 `COMMIT` —— Gray 把 2PC 设计成"用户看不见的内部协议"
- 为什么微服务时代冒出 Saga / TCC 模式 —— 因为 Gray 自己就指出 2PC 在协调者挂掉时会**阻塞**，长事务下不可接受
- 为什么 [[aries-1992]]、[[bernstein-1981-cc]]、[[gray-1981-transaction]] 都把 1978 这份讲义当起点引

## 核心要点

### 1. 事务 = 原子单位

事务是一段代码，对外承诺**要么全做、要么一件没做**。例子（Gray 原文用的）：

```
BEGIN
  account_A := account_A - 100
  account_B := account_B + 100
COMMIT
```

中间任何一步出错或断电，最终账面要么是"两个账户都没动"，要么是"A 减 100、B 加 100"。**绝不允许 A 减了但 B 没加**。这一条性质叫**原子性**。

Gray 同时指出事务还要保证：

- **持久性（durability）**：COMMIT 一旦返回，数据**写到磁盘后断电也不丢**
- **一致性（consistency）**：事务结束后数据库符合所有约束（如总余额不变）
- **隔离性（isolation）**：多个事务并发跑，看起来像**一个一个跑**

四个性质合起来，五年后 Härder-Reuter 1983 给它起了名字叫 **ACID**。1978 年原文还没有这个缩写，但**语义已经全在**。

### 2. 两阶段封锁（2PL）= 并发协议

并发问题：两个事务同时读写同一行，结果可能错。Gray 给的协议：

- **增长阶段（growing phase）**：事务一直加锁，**永不释放**
- **收缩阶段（shrinking phase）**：开始放锁后，**永不再加新锁**

定理：所有事务都遵守 2PL → 执行结果**等价于某个串行顺序**（叫"可串行化"）。

日常类比：像图书馆借书规则。你可以一次借 5 本（增长），但开始还书后就不能再借（收缩）。这条规则保证了"借书人之间的顺序"始终是合理的。

### 3. 锁粒度层级 + 意向锁

不是所有锁都加在"一行"上。Gray 列了五层粒度：

```
database → area → file → record → field
```

粗粒度（整库锁）省管理开销但**并发差**；细粒度（行锁）并发好但**锁数量爆炸**。

Gray 发明了**意向锁（intention locks）**让粗细粒度共存：

- **IS**（intention shared）：我准备在子节点加 S 锁
- **IX**（intention exclusive）：我准备在子节点加 X 锁
- **SIX**：S + IX 组合

类比：你要进图书馆某个房间翻书，先在大门口贴张"我要进 305 房间翻书"的牌子（意向锁）。别人想锁整层楼时一看牌子就知道有人在用，避免冲突。

PostgreSQL / MySQL / Oracle 今天的锁管理器都是这套表格的工程实现。

### 4. WAL + DO/UNDO/REDO = 恢复模型

崩溃恢复的核心问题：磁盘只写了一半事务的页就断电了，重启后怎么办？

Gray 给的答案——**写前日志（WAL，write-ahead logging）**：

1. 修改数据页之前，**先**把"我打算改什么"写到日志（顺序追加，便宜）
2. 真正改数据页（可能延迟）
3. COMMIT 时只要**日志落盘**就算事务完成

崩溃后扫描日志做三类操作：

- **DO**：第一次执行
- **REDO**：日志里说改过、但磁盘上看不到 → 重做
- **UNDO**：日志里说改过、但事务没 COMMIT → 撤销

这三个动词后来成了 [[aries-1992]] 算法的骨架。

### 5. 两阶段提交（2PC）= 分布式原子

跨多台机器的事务，每台机器必须**要么都 COMMIT、要么都 ABORT**。Gray 的协议：

- **阶段 1（prepare）**：协调者问每个节点"你能提交吗？"，节点把 redo 日志写好后回 YES
- **阶段 2（commit）**：所有节点都 YES → 协调者发 COMMIT；任何一个 NO → 发 ABORT

类比：婚礼上牧师问双方"你愿意吗？"两边都说"我愿意"才宣布婚礼成立。

**已知缺陷（Gray 自己写在原文里）**：协调者在阶段 2 之前挂掉，所有节点都**阻塞**，必须等协调者回来。这就是后来 3PC、Paxos commit、Saga 模式要解决的问题。

## 实践案例

### 案例 1：PostgreSQL 的 `BEGIN ... COMMIT` 直接来自 1978

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 'A';
UPDATE accounts SET balance = balance + 100 WHERE id = 'B';
COMMIT;
```

**逐步看**：① `BEGIN` 打开事务边界；② 两条 `UPDATE` 先写 WAL，再改缓冲页；③ `COMMIT` 只保证日志落盘。中间断电 → 重启按 UNDO 撤掉未提交改动。三个动词与原子语义都是 Gray 1978 定下的。

### 案例 2：MySQL InnoDB 的锁层级

InnoDB 锁类型：`IS / IX / S / X / SIX`——照搬 Gray 意向锁表，连命名都没改。

**逐步看**：① 事务要改一行，先在表上拿 `IX`（意向排他）；② 再在行上拿 `X`；③ 另一事务想锁整表时，看到表上已有 `IX`，无法直接上表级 `X`，只能等。粗细粒度靠意向锁共存，正是讲义里的锁粒度层级。

### 案例 3：Spanner 跨洲事务用 2PC

Spanner 跨数据中心写订单，内部仍是 prepare → commit。

**逐步看**：① 协调者问各副本"能提交吗？"（prepare）；② 副本写好 redo 后回 YES；③ 全 YES 才广播 COMMIT，对外仍是一句 `COMMIT`。Gray 1978 的 2PC，46 年后跑在跨洲光纤上；协调者挂掉仍会阻塞——讲义里写过的缺陷没变。

## 踩过的坑

1. **Gray 1978 ≠ Gray 1981**：1978 是 130 页讲义（全景课），1981 是 VLDB 短论文（把"事务"升华为通用抽象）。引用时分清两份
2. **ACID 不在原文**：缩写是 Härder-Reuter 1983 起的，1978 只有四个性质的口语描述
3. **2PL 不防死锁**：两阶段封锁保证可串行化，但**两个事务互锁**仍然会死锁，要靠死锁检测器或超时
4. **2PC 阻塞问题**：协调者挂掉所有参与者卡住——这是 2PC 的根本缺陷，不是实现 bug。Saga / Paxos commit 才真正解掉

## 适用 vs 不适用场景

**适用**：
- 关系型数据库内核（OLTP）
- 单机或局域网内的强一致事务
- 需要"全做或不做"语义的关键业务（金融、订单、库存）

**不适用**：
- 长事务（人审批一周）→ 协调者锁太久，用 Saga 拆成补偿动作
- 跨广域网高延迟 → 2PC 阻塞窗口太大，用 Paxos commit 或最终一致
- 海量只读分析（OLAP）→ 完整 ACID 太重，用 snapshot / MVCC

## 历史小故事（可跳过）

- **1976**：IBM System R 已把 2PL、锁粒度、WAL 跑在原型机上，Gray 是核心成员
- **1977-78**：Bayer 在慕尼黑办暑期学校，Gray 讲数据库专题，整理成 130 页讲义
- **1981 / 1992**：Gray VLDB 把"事务"升华成通用抽象；Mohan 工程化为 [[aries-1992]]

## 学到什么

1. **事务是数据库的"核心数据类型"**——并发/恢复/分布式都围绕它
2. **三条主线**：并发=2PL，恢复=WAL+DO/UNDO/REDO，分布式=2PC
3. **2PC 阻塞**：原子性 vs 可用性的张力 46 年没变；教学讲义反成开山之作

## 延伸阅读

- 论文 PDF：[Notes on Data Base Operating Systems (1978)](https://jimgray.azurewebsites.net/papers/dbos.pdf)（130 页，前 30 页讲事务，建议从 §3 开始读）
- 视频：[CMU 15-445 — Two-Phase Locking](https://www.youtube.com/watch?v=Mfwa7QXqI94)（Andy Pavlo 讲 2PL，1 小时）
- [[gray-1981-transaction]] —— 三年后的精炼版（VLDB 1981）
- [[aries-1992]] —— DO/UNDO/REDO 的工业级实现
- [[bernstein-1981-cc]] —— 把 2PL 放进 20+ 并发算法分类树

## 关联

- [[gray-1981-transaction]] —— 1981 把"事务"升华成通用抽象
- [[aries-1992]] —— 1978 恢复模型的工业级版本
- [[bernstein-1981-cc]] —— 把并发控制做成分类综述
- [[spanner]] —— Google 把 2PC 跑在全球时钟同步上
- [[postgresql]] —— BEGIN/COMMIT/ROLLBACK 现代继承者

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

