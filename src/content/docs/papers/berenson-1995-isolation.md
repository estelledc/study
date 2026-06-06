---
title: Berenson 1995 — ANSI SQL 隔离级别的漏洞与快照隔离
来源: 'Berenson et al., "A Critique of ANSI SQL Isolation Levels", Microsoft Research TR 1995'
日期: 2026-06-06
分类: 数据库
子分类: 存储与查询
难度: 中级
provenance: pipeline-v3
---

## 是什么

这篇 1995 年微软研究报告是数据库界的**「皇帝新衣」揭穿文**：ANSI SQL 标准里定义的四个隔离级别（READ UNCOMMITTED / READ COMMITTED / REPEATABLE READ / SERIALIZABLE）在形式上很整齐，但 Berenson 等人证明——**标准语义有洞、实现各说各话、现象命名混乱**，按标准字面值实现并不能保证你以为的那几种异常真的不会发生。

日常类比：标准像一份**安检清单**——「要有三道门」。Berenson 指出：三道门可以都装了，但门之间的缝隙能让小偷照样钻过去；而且各家机场对「门」的定义还不一致，你以为过了安检，其实漏洞还在。

论文的另一大贡献：正式提出并分析 **Snapshot Isolation（SI）**——后来 PostgreSQL、Oracle、SQL Server 等「可重复读」的真正实现，往往更接近 SI 而非 ANSI 字面 SERIALIZABLE。

SI 的直觉：**每个事务看到数据库在某一刻的「照片」**；别人之后的写入不影响你已读的行，但两个事务若写同一行，后提交者失败。理解 SI 是读懂现代 MVCC 数据库行为的钥匙。

## 为什么重要

不理解这篇 critique，下面这些事说不清：

- 为什么 DBA 背了四个隔离级别名词，线上还是会出现**写偏斜（write skew）**、**幻读**——ANSI 定义没覆盖全
- 为什么 PostgreSQL 的 `REPEATABLE READ` 行为跟 MySQL 不一样——各家实现映射到不同现象集合
- 为什么今天讨论 [[snapshot]]、MVCC、SSI（Serializable Snapshot Isolation）都要引用 Berenson——SI 概念出自此文
- 为什么「Serializable」在标准里既是隔离级别名又是理想语义——Berenson 把它拆成**异常现象（phenomena）**来谈更清楚

## 核心要点

论文核心贡献拆成 **三件事**：

1. **批判 ANSI 定义**：标准用「现象」描述隔离，但现象定义不完整、与实现脱节；按标准测试无法区分很多实际 bug。

2. **现象分类清单**：系统梳理脏读、不可重复读、幻读、写偏斜等，并说明在哪些级别**理论上**该禁止、**实际上**仍可能出现。

3. **提出 Snapshot Isolation**：事务读到的是**启动时刻数据库的一致性快照**；写冲突用「先提交者胜」检测。SI 禁止脏读/不可重复读，但**不防止写偏斜**——这是后来 SSI 要补的洞。

## 实践案例

### 案例 1：经典写偏斜（SI 拦不住）

```sql
-- 两人同时转岗：要求至少一名医生在岗
-- Tx A                          -- Tx B
SELECT count(*) FROM on_call
WHERE role='doctor' AND on_duty=true;
-- 都得到 1                       -- 也得到 1
UPDATE on_call SET on_duty=false
WHERE name='Alice';
                                 UPDATE on_call SET on_duty=false
                                 WHERE name='Bob';
COMMIT;                          COMMIT;
-- 结果：0 人在岗！SI 允许，Serializable 应禁止
```

Berenson 用这类例子说明：**「可重复读」名字好听，不等于所有异常都消失**。

### 案例 2：PostgreSQL 隔离级别对照

| PG 级别 | 接近语义 | 写偏斜 | 幻读（Fuzzy） |
|---|---|---|---|
| READ COMMITTED | 语句级快照 | 可能 | 可能 |
| REPEATABLE READ | Snapshot Isolation | **可能** | SI 下已处理很多幻读 |
| SERIALIZABLE | SSI（2000s+ 改进） | 禁止 | 禁止 |

读 PG 文档时要记得：RR ≈ Berenson 的 SI，不是 ANSI 纸面 SERIALIZABLE。

### 案例 3：用现象问实现方，而不是背级别名

```text
问 DBA 五个问题：
1. 会不会脏读？
2. 同一事务内两次读同一行会不会变？
3. 范围查询两次结果行数会不会变？
4. 两个事务交叉更新不同行，会不会破坏全局不变式？（写偏斜）
5. 全序等价于串行执行吗？（真 Serializable）
```

Berenson 教的是**用现象验收**，而不是背 `READ COMMITTED` 四个单词。

### 案例 4：库存扣减的脏读（READ UNCOMMITTED 才允许）

```sql
-- Tx A: 扣库存但未提交          -- Tx B: 读库存做展示
UPDATE stock SET qty = qty - 1 WHERE sku='X';   -- 仍 COMMIT 前
                                 SELECT qty FROM stock WHERE sku='X';
                                 -- 若隔离=RU，可能读到已减未提交的值
```

绝大多数 OLTP 默认至少 READ COMMITTED，就是**禁止这种脏读**——但 Berenson 指出：光说级别名不够，要问「未提交数据会不会被别的事务看见」。

## 踩过的坑

1. **把隔离级别当互斥档位**：实际是「禁止哪些现象」的集合，集合边界实现-dependent。

2. **以为 REPEATABLE READ = 可重复读一切**：通常只保证**已读行**稳定，不保证**谓词**稳定（幻读/写偏斜仍可能）。

3. **忽略 SI 与 Serializable 差距**：PG 在 RR 下踩写偏斜坑的团队不少，直到改 SERIALIZABLE 或应用层加锁。

4. **标准考试答案当生产真理**：1995 年后工业界大量用 MVCC+SI，与 ANSI 字面不同步——要以厂商文档和现象测试为准。

5. **在 SI 下用「锁表」思维**：SI 靠快照与写冲突检测，滥用 `SELECT FOR UPDATE` 可能不必要地降吞吐——先画现象再选锁。

## 适用 vs 不适用场景

**适用**：
- 设计金融、库存、排班等**有全局不变式**的事务逻辑
- 评测数据库隔离语义、写对比测试
- 读 PostgreSQL / Oracle 隔离文档前的必读背景

**不适用**：
- 纯只读分析查询、无并发写——隔离级别讨论价值低
- 最终一致性 NoSQL 场景——用不同理论框架（[[kafka-2011]] 等）
- 单线程 SQLite 默认——无并发则无隔离问题
- 应用层已用乐观锁/version 列兜底全部不变式——可简化隔离需求但仍需懂 SI 边界

## 历史小故事（可跳过）

- **1992**：ANSI SQL 隔离级别进标准，业界以为事务并发有统一语言。
- **1995**：Berenson TR 指出标准漏洞，提出 Snapshot Isolation。
- **2000s**：PostgreSQL 等广泛实现 MVCC + SI。
- **2008+**：Serializable Snapshot Isolation（SSI）在 PG 等补齐写偏斜，向真 Serializable 靠拢。

## 学到什么

1. **隔离级别是现象集合**，不是四个神圣档位；实现映射要实测。
2. **Snapshot Isolation** 是工业界「可重复读」的真实面孔，但有写偏斜洞。
3. 设计并发系统要问「**哪种异常不能接受**」，而不是「我上第几级」。
4. 这篇 critique 的精神——**质疑标准字面**——在分布式事务（[[spanner-2012]]）时代同样适用。
5. **Snapshot Isolation** 不是银弹：懂 SI 能解释 80% MVCC 库的行为，剩下 20% 写偏斜要靠 SSI 或应用锁。

## 延伸阅读

- 论文 PDF：[Microsoft TR-95-51](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-95-51.pdf)
- [[snapshot]] —— MVCC 快照机制工程实现
- PostgreSQL 文档：Transaction Isolation
- [[kafka-2011]] —— 另一端的「放弃跨分区事务」思路
- [[raft]] —— 复制一致性；与单机隔离互补

## 关联

- [[snapshot]] —— SI 的工程载体，MVCC 读快照
- [[postgresql]] —— RR 实现贴近 SI 的代表
- [[mysql]] —— 隔离实现与 PG 差异的对照
- [[kafka-2011]] —— 分布式日志放弃传统隔离的另一极
- [[spanner-2012]] —— 全球分布下 Serializable 的工程尝试

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kafka-2011]] —— Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[raft]] —— Raft — 易理解的共识算法
- [[snapshot]] —— Snapshot — DAO 不花 Gas 也能投票的链下治理前端
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳

