---
title: Calvin — 先排队再执行的分布式事务系统
来源: 'Alexander Thomson et al., "Calvin: Fast Distributed Transactions for Partitioned Database Systems", SIGMOD 2012'
日期: 2026-05-29
分类: 数据库
难度: 高级
---

## 是什么

Calvin 是一套**把事务先排成全局顺序，再让分布式数据库照着顺序执行**的系统。
日常类比：火锅店高峰期如果每桌客人都现场抢服务员，容易乱；Calvin 像门口先发号、先确认每桌要什么，再让后厨按号并行做菜。

传统分布式事务常在最后提交时才让多台机器投票确认，也就是两阶段提交。
问题是投票期间锁还握在手里，热门数据会被堵住。

Calvin 的反向思路是：**需要大家达成一致的事，尽量放到拿锁之前完成**。
它先复制事务输入并确定顺序，再用确定性锁管理器执行，所以很多场景下不需要提交阶段的分布式协调。

## 为什么重要

不理解 Calvin，下面这些事都没法解释：

- 为什么强一致分布式事务不只有 [[spanner-2012]] 这一条路，另一条路是"先定顺序，再执行"
- 为什么两阶段提交的痛点不只是消息多，而是**锁被多占了几个网络来回**
- 为什么复制"事务请求"有时比复制"事务结果"更便宜，也更适合主动复制
- 为什么高冲突跨分区事务最怕的不是计算慢，而是所有机器执行进度稍微错开

## 核心要点

Calvin 的设计可以拆成 **三件事**：

1. **sequencer 先排队**：所有事务输入被收集进 10ms epoch，复制后组成确定的全局顺序。类比：先把所有订单贴到厨房看板上，每个厨师看到同一张看板。

2. **scheduler 按顺序拿锁**：锁请求必须按全局顺序发出，冲突事务自然排队，但不冲突事务仍可并行执行。类比：同一口锅只能按号使用，不同锅可以同时开火。

3. **storage 只负责存取**：Calvin 把事务层和存储层拆开，底下可以接一个普通 CRUD 存储。类比：前台负责排队和规则，仓库只负责按钥匙取货放货。

核心收益：复制的是**还没执行的事务输入**，不是执行后的每条数据变化。
只要每个副本按同一顺序、同一锁规则执行，就会走到同一个数据库状态。

## 实践案例

### 案例 1：跨仓库扣库存

```sql
BEGIN ORDER_TXN;
  READ stock WHERE item = 'keyboard' AND warehouse IN (1, 2);
  UPDATE stock SET qty = qty - 1 WHERE item = 'keyboard' AND warehouse = 1;
  INSERT INTO orders VALUES ('order-7', 'keyboard');
COMMIT;
```

逐部分解释：

- 事务会碰到仓库 1 和仓库 2，所以它是跨分区事务
- 传统系统常在 COMMIT 时跑 2PC，锁会一直持有到投票结束
- Calvin 先让 sequencer 把这笔订单放进全局顺序，再让相关分区按这个顺序拿锁和执行
- 如果每个副本都看到同一笔输入、同一位置，它们最终会写出同一结果

### 案例 2：事务输入日志长什么样

```txt
epoch 8123:
  seq-A: txn-1 read=[w1:keyboard,w2:keyboard] write=[w1:keyboard,orders]
  seq-B: txn-2 read=[w3:mouse] write=[w3:mouse,orders]
  deterministic merge => txn-1, txn-2
```

逐部分解释：

- epoch 是 Calvin 把时间切成的小批次，论文实现里是 10ms
- 每个 sequencer 收到的事务先复制，再按确定规则合并
- scheduler 不需要猜"谁先谁后"，它只照着这个输入序列工作
- 日志里保存事务输入，崩溃恢复时重放输入即可，不必记录每条物理 REDO

### 案例 3：远程读如何并行

```txt
phase 1: 分析 read/write set，判断哪些 key 在本机
phase 2: 每个分区读本地记录
phase 3: 被动分区把读结果发给主动分区
phase 4: 主动分区收齐远程读结果
phase 5: 执行业务逻辑，只写本地拥有的 key
```

逐部分解释：

- 主动分区是会写数据的分区，被动分区只提供读结果
- 远程读结果可以并行发送，不需要事务执行到一半才临时请求
- 事务代码看起来仍像普通 CRUD，分区通信由 Calvin 层接管
- 这套流程的前提是系统提前知道 read/write set

## 踩过的坑

1. **把 Calvin 理解成更快的 2PC**：它不是优化提交投票，而是尽量取消提交投票，因为确定性顺序已提前达成一致。

2. **以为确定性就是串行执行**：Calvin 保证等价于同一串行顺序，但不冲突的事务仍可并发运行，原因是锁管理器只限制冲突 key。

3. **忘了 read/write set 必须提前知道**：锁要先申请完，事务若执行后才发现要读哪个 key，就会破坏确定性调度。

4. **只看吞吐不看延迟**：Paxos 同步复制事务输入不会降低吞吐，但跨洲复制仍会增加事务开始前的等待时间。

## 适用 vs 不适用场景

**适用**：

- 跨分区事务多，而且热门记录容易被 2PC 锁住的 OLTP 系统
- 事务逻辑比较模板化，可以在执行前算出 read/write set
- 希望在普通存储层之上加 ACID、复制和恢复能力的系统
- 更在意高吞吐和强一致，而能接受排队带来的基础延迟

**不适用**：

- 事务访问范围高度动态，执行中才知道下一步读哪个 key
- 大量交互式长事务，用户思考时间会被错误地放进锁和排队路径
- 主要瓶颈是复杂 SQL 优化或分析查询，而不是事务协调
- 必须用底层物理页锁、next-key locking、ARIES 风格恢复细节的传统数据库内核

## 历史小故事（可跳过）

- **1980s**：System R* 风格分布式事务把两阶段提交变成教科书方案，但锁等待成本也随之进入系统。
- **2000s**：Dynamo、Bigtable、Cassandra 等系统为了扩展性，常减少或限制跨分区事务。
- **2011 年前后**：Megastore、Spinnaker 用 Paxos 做强一致复制，说明业界开始重新接受强一致。
- **2012 年**：Calvin 和 Spanner 同年出现，分别代表"确定性排序"和"全球时间戳"两条强一致路线。
- **后来**：很多 NewSQL 系统继续探索如何在事务、复制、分区和延迟之间找工程平衡。

## 学到什么

- 分布式事务慢，常常不是因为业务逻辑慢，而是锁覆盖了网络协调时间。
- Calvin 的核心不是某个魔法协议，而是把"达成一致"搬到事务边界之外。
- 确定性执行让系统可以复制输入、重放输入，并减少物理日志需求。
- 论文提醒我们：系统设计里的顺序选择，往往比单点优化更关键。

## 延伸阅读

- 论文 PDF：[Calvin: Fast Distributed Transactions for Partitioned Database Systems](https://cs.yale.edu/homes/thomson/publications/calvin-sigmod12.pdf)
- [[spanner-2012]] —— 同在 2012 年给出强一致分布式事务的另一条路线
- [[paxos-1998]] —— Calvin 的同步复制模式会用 Paxos 复制事务输入
- [[gray-1981-transaction]] —— 理解 ACID 和事务成本的老底座
- [[f1-2013]] —— 展示强一致分布式数据库如何承载真实 SQL 业务

## 关联

- [[spanner-2012]] —— Spanner 用时间戳和 2PC 组织全球事务，Calvin 用确定性顺序减少提交协调。
- [[paxos-1998]] —— Paxos 在 Calvin 里不是复制每次写入效果，而是复制事务输入批次。
- [[bigtable-2006]] —— Bigtable 代表可扩展存储底座，Calvin 关心在这类底座上补事务能力。
- [[dynamo]] —— Dynamo 系系统偏可用和最终一致，Calvin 站在强一致事务的另一侧。
- [[f1-2013]] —— F1 说明 SQL 层如何建立在强一致分布式存储之上。
- [[cockroachdb-2020]] —— CockroachDB 走 Spanner 系路线，对照 Calvin 可看清 NewSQL 的不同取舍。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

