---
title: MVCC — 让读写互不挡路的版本账本
来源: 'Philip A. Bernstein, Nathan Goodman, "Multiversion Concurrency Control-Theory and Algorithms", ACM Transactions on Database Systems 8(4), 1983'
日期: 2026-07-09
分类: 数据库
难度: 中级
---

## 是什么

MVCC（Multiversion Concurrency Control，多版本并发控制）是一套**让数据库同一份数据同时保留多个历史版本**的并发控制方法。日常类比：会计不把旧账本涂掉，而是每次改账都复印一页新版本；查账的人按自己的时间点拿对应那本，不必等别人改完。

普通加锁思路像"门口只放一把钥匙"：有人写账，读的人就排队。MVCC 改成"每次写产生新版本"，读事务拿开始时能看见的版本，写事务继续生成更新版本。

Bernstein 和 Goodman 1983 这篇论文的重点不是只说"多存几份数据会更快"，而是给多版本数据库一套**判断正确性的理论**：哪些版本可以被读、哪些版本顺序会造成矛盾、一个并发执行能不能等价成某个串行顺序。

## 为什么重要

不理解 MVCC，下面这些现象都很难解释：

- 为什么 PostgreSQL / Oracle 里读事务通常不会挡住写事务，写事务也不会挡住普通读事务
- 为什么 Snapshot Isolation 看起来很强，却仍然可能发生写偏斜，不能自动等同 Serializable
- 为什么数据库后台要做 vacuum / purge / garbage collection，旧版本不清理会把磁盘和内存拖垮
- 为什么现代内存数据库、分布式数据库、甚至 RCU 都反复借用"旧读者看旧版本，新写者造新版本"这条思路

## 核心要点

整篇论文可以压成 **三个抓手**：

1. **写不是覆盖，而是追加一个版本**。类比：合同修改不拿橡皮擦涂旧条款，而是盖一个新日期的修订版。数据库里每个数据项可以有 `x1, x2, x3` 多个版本，写事务产生其中一个。

2. **读不是抢最新，而是按快照挑可见版本**。类比：你 9 点开始审账，就只看 9 点前已经盖章的账页；10 点别人补的新账，不会突然跳进你的审计结果里。这样长读事务不会因为写入不断发生而反复变脸。

3. **正确性要看版本依赖图**。单版本数据库只看读写冲突；多版本数据库还要问"读的是谁写的版本"和"多个版本的顺序是什么"。论文用这类图结构分析多版本调度，只要依赖关系没有绕成环，就能找到一个合理的串行解释。

这三个点合起来就是 MVCC 的核心 trade-off：**读写冲突少了，但系统必须付出版本选择、提交检查、旧版本回收的成本**。

## 实践案例

### 案例 1：读事务不被写事务打断

```sql
-- T1：一个长读事务
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM account WHERE id = 1; -- 看到 100

-- T2：另一个事务同时更新并提交
-- UPDATE account SET balance = 150 WHERE id = 1;
-- COMMIT;

SELECT balance FROM account WHERE id = 1; -- T1 仍然看到 100
COMMIT;
```

**逐部分解释**：

- T1 开始时拿到一个快照，像拿到"当时的账本复印件"
- T2 提交后生成 `balance=150` 的新版本，但不会改掉 T1 正在看的旧版本
- T1 两次读取一致，所以适合报表、审计、后台扫描这类长读任务
- 如果隔离级别是 Read Committed，很多数据库会每条语句拿新快照，行为就会不同

### 案例 2：版本链到底怎么被挑出来

```js
const versions = [
  { xmin: 10, xmax: 20, value: 100 },
  { xmin: 20, xmax: Infinity, value: 150 },
];

function readVisible(snapshotTs) {
  return versions.find(v => v.xmin <= snapshotTs && snapshotTs < v.xmax).value;
}

console.log(readVisible(15)); // 100
console.log(readVisible(25)); // 150
```

**逐部分解释**：

- `xmin` 可以理解成"这个版本从哪个时间开始存在"
- `xmax` 可以理解成"这个版本到哪个时间被新版本替换"
- 快照时间 `15` 落在 `[10, 20)`，所以读旧值 `100`
- 快照时间 `25` 落在 `[20, ∞)`，所以读新值 `150`

真实数据库的元数据更复杂，但直觉就是：**读操作不是找最新，而是找对自己快照可见的最新版本**。

### 案例 3：MVCC 也会犯错，写偏斜就是典型例子

```sql
-- 规则：至少要有一名医生 on_call = true
-- T1 和 T2 同时开始，各自看到 Alice、Bob 都在值班

-- T1
SELECT count(*) FROM doctors WHERE on_call = true; -- 2
UPDATE doctors SET on_call = false WHERE name = 'Alice';

-- T2
SELECT count(*) FROM doctors WHERE on_call = true; -- 2
UPDATE doctors SET on_call = false WHERE name = 'Bob';
```

**逐部分解释**：

- T1 和 T2 读到的是同一份旧快照，都觉得"还有另一个人兜底"
- 两个事务写的是不同行，普通 first-committer-wins 检查可能认为没有写写冲突
- 最后 Alice 和 Bob 都下线，业务约束被破坏
- 这说明 MVCC 是机制，不是魔法；要真正 Serializable，还需要额外冲突检测或谓词保护

## 踩过的坑

1. **以为 MVCC 等于完全无锁**：写写冲突、索引结构、提交阶段仍然可能需要锁或原子操作。
2. **以为快照隔离等于可串行化**：快照能保证读一致，但写偏斜这种跨行约束仍可能漏掉。
3. **忘了旧版本要回收**：长事务一直不结束，系统就不能删除它可能还要看的旧版本。
4. **把物理时间当版本时间**：MVCC 需要的是可比较的逻辑顺序，不一定等于墙上时钟。

## 适用 vs 不适用场景

**适用**：

- 读多写少或读写混合的 OLTP 系统，例如账户查询、订单查询、后台报表
- 长读事务和短写事务同时存在的系统，不希望读操作把写操作全部堵住
- 需要 Snapshot Isolation / Repeatable Read 这类一致快照的数据库
- 内存数据库或分布式数据库中，需要把读路径做轻、把冲突推到提交阶段的设计

**不适用**：

- 冲突极高的热点写入，例如所有事务都改同一行库存计数器
- 旧版本保存成本不可接受的场景，例如超大对象频繁更新且长事务很多
- 必须严格维护跨行约束但又没有 Serializable 检查的业务
- 只需要最终一致性的缓存或计数器系统，用 MVCC 可能太重

## 历史小故事（可跳过）

- **1976 年**：System R 相关工作把两阶段锁和谓词锁推到事务理论中心，单版本并发控制有了主路线。
- **1978 年**：Lamport 讲清楚分布式系统里的事件顺序，为时间戳类算法提供底层直觉。
- **1981 年**：Bernstein 和 Goodman 写并发控制综述，把分布式数据库算法整理成 2PL、时间戳、乐观验证等类别。
- **1983 年**：两人再写本文，把"多版本"单独拎出来，给出理论框架并分析新旧算法。
- **1987 年**：Bernstein、Hadzilacos、Goodman 把这些内容扩成教材《Concurrency Control and Recovery in Database Systems》，第 5 章专讲 MVCC。
- **1995 年**：Berenson 等人系统批判 ANSI SQL 隔离级别，Snapshot Isolation 进入主流数据库讨论。

## 学到什么

1. **MVCC 的本质是用空间换并发**：多留旧版本，换来读写少互相等待。
2. **版本可见性比"最新值"更重要**：数据库读到什么，取决于事务快照和提交顺序。
3. **正确性不能只看单行冲突**：多版本系统要同时看 read-from、version order 和事务依赖。
4. **工程代价集中在回收和提交检查**：旧版本不清理会膨胀，检查太弱会放过异常，检查太强又会牺牲吞吐。

## 延伸阅读

- 原论文：[ACM DOI — Multiversion Concurrency Control-Theory and Algorithms](https://doi.org/10.1145/319996.319998)
- 元数据摘要：[OSTI 条目](https://www.osti.gov/biblio/6422423)（有摘要、作者、DOI、期刊信息）
- 后续教材：Bernstein, Hadzilacos, Goodman, *Concurrency Control and Recovery in Database Systems*, 1987，第 5 章
- [[bernstein-1981-cc]] —— 读 MVCC 前先理解单版本并发控制的分类框架
- [[berenson-1995-isolation]] —— Snapshot Isolation 为什么不等于 Serializable
- [[rcu-2001]] —— 操作系统里的相似思想：读者看旧副本，写者发布新副本

## 关联

- [[bernstein-1981-cc]] —— 本文作者前一篇综述，提供 2PL / T-O / OCC 的地图
- [[eswaran-1976]] —— 两阶段锁和谓词锁的源头，MVCC 常拿它作单版本对照
- [[berenson-1995-isolation]] —— 解释 MVCC 数据库常见的 Snapshot Isolation 异常
- [[hekaton-2013-sigmod]] —— 内存数据库里版本可见性和提交检查的工程化案例
- [[silo-oltp-2013]] —— 高性能 OLTP 把版本、epoch、短事务组合起来
- [[aries-1992]] —— 并发控制负责"同时跑"，恢复算法负责"崩了能找回"
- [[rcu-2001]] —— 同样是用旧版本保护读路径，但应用在操作系统内核

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
