---
title: SKIP LOCKED — 让 Postgres 当任务队列用
来源: PostgreSQL 9.5 Release Notes, 2016-01-07
日期: 2026-05-31
分类: 后端
难度: 中级
---

## 是什么

`SELECT ... FOR UPDATE SKIP LOCKED` 是 Postgres 9.5（2016 年 1 月）加的一个**只多了两个单词**的 SQL 语法。它让一条查询**遇到已经被别人锁住的行就直接跳过**，而不是排队等。

日常类比：超市自助结账，前面机器有人在用。原本你只能排队等他付完。SKIP LOCKED 等于说"这台被占了？我去下一台"——你**永远不卡在别人后面**。

```sql
BEGIN;
SELECT id FROM jobs
  WHERE state = 'pending'
  ORDER BY priority
  LIMIT 1
  FOR UPDATE SKIP LOCKED;   -- 关键：跳过被锁的行
-- 处理任务 ...
UPDATE jobs SET state = 'done' WHERE id = $1;
COMMIT;                      -- COMMIT 才释放锁
```

10 个 worker 并发跑这段代码，**每个都拿到不同的任务**——互不阻塞等同一行，也不用客户端互相协调谁拿哪条。

## 为什么重要

不理解 SKIP LOCKED，下面这些事都没法解释：

- 为什么 Solid Queue / River / pg_queue 这一波"Postgres 当队列"的库 2020 年后才爆发——核心特性 9.5 才有
- 为什么架构决策（ADR）常选 Postgres 做后端队列而不是引入 Redis / RabbitMQ——少一个组件少一份运维
- 为什么 MySQL 用户做并发作业队列一直很难——MySQL 8.0（2018）才补上同名特性
- 为什么"用数据库做队列"从被嘲笑（2010s）变成主流推荐（2020s）

## 核心要点

`FOR UPDATE`（给选中的行上锁）之后能跟三种修饰：

1. **默认（什么都不加）**：行被别人锁住 → **阻塞等待**。类比：前面结账机有人，你就站着等。
2. **NOWAIT**：行被别人锁住 → **立即报错**，应用层接住重试。类比：机子被占就立刻喊"换一台"，不排队。
3. **SKIP LOCKED**：行被别人锁住 → **跳过这一行**，继续往下找。类比：被占就默默去下一台，不喊也不等。

执行顺序拆开看：

```
WHERE → ORDER BY → 加锁 → 跳过被别人锁的 → LIMIT 计数
```

注意：被跳过的行**不计入 LIMIT**。`LIMIT 1 SKIP LOCKED` 在 9 个 worker 都拿到任务时还能给第 10 个找到第 10 行，不会"该返回的没返回"。

## 实践案例

### 案例 1：最小作业队列

```sql
CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY,
  payload JSONB,
  priority INT DEFAULT 0,
  state TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON jobs (state) WHERE state = 'pending';  -- 部分索引
```

worker 循环里（无行返回就 sleep 再试）：

```sql
BEGIN;
SELECT id, payload FROM jobs
  WHERE state = 'pending'
  ORDER BY priority DESC, id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
-- 业务处理
UPDATE jobs SET state = 'done' WHERE id = $1;
COMMIT;
```

**为什么是部分索引**：`pending` 任务只占总量的极小比例（健康系统下 done 是 99%+），部分索引比全表索引小一两个数量级。

### 案例 2：批量取任务

```sql
SELECT id FROM jobs
  WHERE state = 'pending'
  ORDER BY priority DESC, id
  LIMIT 50
  FOR UPDATE SKIP LOCKED;
```

**逐部分解释**：

- `ORDER BY priority DESC`：先试高优先级；被锁就跳过，继续按排序找
- `LIMIT 50`：一次最多拿 50 条；被跳过的行不占名额
- 瓶颈从"加锁次数"变成"业务处理速度"

### 案例 3：抢库存

```sql
UPDATE inventory
  SET stock = stock - 1
  WHERE id = (
    SELECT id FROM inventory
      WHERE sku = 'X' AND stock > 0
      ORDER BY id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
  )
  RETURNING id;
```

**逐部分解释**：

- 子查询先锁住一行有货的库存记录；别人已锁的行直接跳过
- 外层 `UPDATE` 只改这一行的 `stock`
- 前提：同 SKU 有多行库存；10 个并发请求锁不同行，避免热点行抢锁

## 踩过的坑

1. **忘 COMMIT 任务永远 stuck**：worker 进程崩溃但事务没结束（连接还活着）→ 行锁不释放 → 这条任务**永远没人能拿**。解决：用短事务 + 连接 idle timeout + 监控 long-running tx。

2. **没索引就是灾难**：`WHERE state = 'pending'` 不走索引时，每次 `SELECT FOR UPDATE` 都要全表扫 + 给所有候选行加锁，并发 worker 互相阻塞退化到 O(N²)。

3. **Repeatable Read 隔离级别有惊喜**：RR 下事务看的是一致快照，但 SKIP LOCKED 看的是**当前可见**的行。可能跳过你以为还在那的行，或锁到一行后发现已被别人 UPDATE 走了。**作业队列默认用 READ COMMITTED 就够**。

4. **autovacuum bloat**：每次 UPDATE state 产生一行死元组。高吞吐队列表死元组堆积快，autovacuum 跟不上 → 表膨胀到原来 5 倍。配 `autovacuum_vacuum_scale_factor=0.05` 给 jobs 表单独调。

5. **ORDER BY 在 SKIP LOCKED 前**：先排序再锁，所以 ORDER BY 会让你"按优先级试着拿"，被跳过后**继续按排序**找下一个。优先级高的任务会被先尝试，但不保证"高优先级总比低优先级先被某个 worker 拿到"——某个 worker 在锁高优先级任务时，另一个 worker 可能已经从低优先级里捞了一个。

## 适用 vs 不适用

**适用**：

- 中低吞吐作业队列（<10k 任务/秒）—— Postgres 单机够用，省一个 Redis/MQ 组件
- 抢库存 / 抢订单 / 抢配额 —— 多行可分配的场景
- 已经在用 Postgres 的小团队 —— 把队列也放进事务里，免去跨系统一致性

**不适用**：

- 极高吞吐（>50k/s）—— 走 Redis Streams / Kafka / NATS
- 强顺序保证 —— SKIP LOCKED 不保证 FIFO，需要严格顺序用单 worker + 默认锁
- 任务延迟敏感（毫秒级）—— Postgres 事务开销 + 索引扫描有 ms 级抖动

## 历史小故事（可跳过）

- **2014**：PostgreSQL 邮件列表上 Thomas Munro 提交 patch 实现 SKIP LOCKED，参考 Oracle 同名特性
- **2016-01-07**：PostgreSQL 9.5 发布，正式进入主线
- **2018**：MySQL 8.0 跟进，从此两大主流开源 RDBMS 都有
- **2020 后**：Rails Solid Queue、Go 的 River、Ruby 的 GoodJob 等"Postgres-backed queue"框架爆发，全部以 SKIP LOCKED 为命脉
- **2024**：37signals 把 Sidekiq（基于 Redis）替换成 Solid Queue（基于 Postgres）写进 Rails 8 默认栈

## 学到什么

1. **两个单词改变一个生态**：SKIP LOCKED 让 Postgres 从"勉强能当队列"变成"推荐方案"，新组件的引入门槛被一句 SQL 削平
2. **基础设施特性 vs 应用层重试**：以前要在客户端做的"锁冲突重试"被下沉到 SQL 引擎，少一层错误处理就少一类 bug
3. **数据库做队列的真正成本是运维**：少一个 Redis 实例 = 少一份监控 / 备份 / 故障恢复，**这是架构决策常选 Postgres 的真正理由**，性能反而是次要的
4. **看版本号**：当一个流行做法忽然在某年大量出现，往往是底层某个小特性那一年才正式可用——SKIP LOCKED 之于队列正是如此

## 延伸阅读

- 官方文档：[The Locking Clause — PostgreSQL Docs](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- 长文教程：[2ndQuadrant — What is SKIP LOCKED for in PostgreSQL 9.5](https://www.2ndquadrant.com/en/blog/what-is-select-skip-locked-for-in-postgresql-9-5/)（Craig Ringer 写的，含基准测试）
- 真实工程案例：[Solid Queue 源码](https://github.com/rails/solid_queue/blob/main/lib/solid_queue/processes/poller.rb)（生产级 SKIP LOCKED 使用）
- 性能权衡：[Brandur Leach — Postgres Job Queues at Scale](https://brandur.org/job-drain)（讨论 bloat 和长事务问题）

## 关联

- [[stonebraker-2010-sqlnosql]] —— Stonebraker 论"何时需要 NoSQL"，SKIP LOCKED 是 SQL 派"不要急着换"的论据
- [[sqlite-2022]] —— SQLite 没有 SKIP LOCKED（单写），所以 SQLite-backed queue 走完全不同的路线（WAL + 单线程写）
- [[aries-1992]] —— ARIES 给所有现代行级锁数据库提供恢复理论基础，SKIP LOCKED 跑在它的上面
- [[rest-fielding-2000]] —— REST 强调无状态客户端；SKIP LOCKED 把"谁拿到任务"的状态留在数据库，客户端无须协调

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mysql-server]] —— mysql-server — 一个仓库装下整套 OLTP 引擎
