---
title: PNUTS — 介于强一致与最终一致之间的实用一致性
来源: 'Cooper et al., "PNUTS: Yahoo!''s Hosted Data Serving Platform", VLDB 2008'
日期: 2026-05-31
分类: 分布式系统
难度: 高级
---

## 是什么

PNUTS 是 Yahoo! 2008 年公开的一套**全球分布、按记录排序、内部产品共用**的存储系统。它最大的贡献是提出 **per-record timeline consistency**——**同一条记录的所有副本按相同顺序应用更新，但不同记录之间不保证全局顺序**。

日常类比：像微信里你和不同朋友的聊天窗口。**你跟 A 的对话**——消息一定按你发的顺序到 A 那边（per-record 顺序）。**你跟 A 和 你跟 B 两个窗口之间**——别人不需要看到"你 9:00 发给 A、9:01 发给 B"这个跨窗口顺序（不保证全局顺序）。绝大多数业务都只需要前者。

PNUTS 是第一个把这个观察工业化的系统。它比 Spanner（2012）早 4 年讨论这件事，是 Bigtable（强一致单数据中心）和 Dynamo（最终一致多数据中心）之间长期空缺的"中间档"。

## 为什么重要

不理解 PNUTS，下面这些事都没法解释：

- 为什么 DynamoDB 全局表、Cosmos DB 一致性档位会强调"按键/按记录"的复制语义——它们更贴近 PNUTS 这条中间档，而不是照搬 Bigtable 或 Dynamo
- 为什么"用消息中间件做跨数据中心复制"会成为后来 10 年的主流——PNUTS 用 Yahoo! Message Broker（YMB）替代了两阶段提交
- 为什么 NoSQL 时代不是非选 Bigtable 就是 Dynamo——PNUTS 给了第三条路："按记录算一致性"，业务上更贴合
- 为什么后来 Spanner 要另开一条路（TrueTime + 跨记录事务）——对照 PNUTS 才懂：全球低延迟与全局强一致很难兼得

## 核心要点

PNUTS 解决"全球低延迟 + 业务能用的一致性"是 **3 件套** 配合：

1. **per-record timeline consistency**：每条记录有一个**版本号链**（v1 → v2 → v3 …），所有副本严格按此顺序应用。日常类比：每条记录像一本独立的日记本，所有抄写员只能按页码顺序抄，不能跳页。**好处**：开发者读 / 写自己关心的那条记录时，逻辑和单机数据库一样简单。

2. **record-level mastership（记录级主副本）**：每条记录有一个 master 副本，**写入必须经过它**，由它产生版本号。但 master **是元数据，可以随访问局部性漂移**——用户从西雅图飞新加坡，系统会发现新加坡命中率上升，把这条记录的 mastership 迁过去。日常类比：村里的"村长"不固定住一个院子，谁家来人多，村长就搬过去办公。

3. **YMB pub/sub 跨地域复制**：master 写完后，更新作为消息发到 Yahoo! Message Broker，其他副本订阅消费。**不用两阶段提交**——本地写成功即返回，复制是异步、保序、可靠。日常类比：村长写完通告挂广播站，各村抄录员各自去抄，谁先抄到谁先广播给本村。

读 / 写 API 也按一致性档位拆开，让开发者**按业务选成本**：

- `read-any`：最快，可能读到旧版本（适合"刷推荐 feed"）
- `read-critical(v)`：保证读到 ≥ 版本 v 的副本（适合"我刚改的资料要看到"）
- `read-latest`：强制访问 master，跨洲贵但保证最新
- `write` / `test-and-set-write`：普通写 / 条件写（用于乐观并发）

## 实践案例

### 案例 1：用户改头像后立刻看到

```
用户在西雅图改头像
→ 西雅图 region 是这条 record 的 master
→ 本地写成功，返回 v=42
→ YMB 异步推送 v=42 给亚洲、欧洲副本
→ 用户立刻刷新页面，应用用 read-critical(42)
  ——西雅图副本一定 ≥ 42，亚洲副本可能还没收到
```

**关键点**：用户体验是"我改完立刻看到"，但其他用户在亚洲看到的可能还是旧头像几秒——业务上完全可接受。

### 案例 2：mastership 跟着用户漂移

```
用户原本在西雅图（master 在 us-west）
→ 飞到新加坡，连续在新加坡侧改了 5 次资料
→ 每次写都要跨太平洋打到 us-west，延迟 200ms+
→ Tablet Controller 检测到模式：80% 写来自 ap-southeast
→ 触发 mastership transfer：master 切到 ap-southeast
→ 之后写入本地完成，延迟 < 10ms
```

**关键点**：master 是可漂移的元数据，不是固定地理位置。这个设计 10 年后被 Cosmos DB 的"强一致写区域"参数化暴露给用户。

### 案例 3：乐观并发买库存

```python
# 检查库存有就扣 1（教学伪 API）
record = pnuts.read_latest("sku:123")  # 强制读 master
if record["stock"] > 0:
    pnuts.test_and_set_write(
        "sku:123",
        new_stock=record["stock"] - 1,
        expect_version=record["version"]
    )
# version 不匹配 → 写失败 → 重试
```

**逐步拆解**：① `read-latest` 拿到当前库存和版本号；② 本地算 `stock-1`；③ `test-and-set-write` 带上 `expect_version`——只有 master 上仍是该版本才写入。有人抢先扣过就失败重试。这是单记录 CAS，补的是「没有跨记录事务」的缺口。

## 踩过的坑

1. **per-record 不是跨 record**：两条记录的更新可能被不同副本以**不同顺序**看到。如果业务逻辑写"先改 A，再改 B，B 必须比 A 晚"，副本上看到的可能是 B 先 A 后——必须显式编码因果关系。

2. **read-latest 跨洲贵**：read-latest 强制打 master 所在 region。如果 master 在美国、读者在亚洲，延迟可能 200ms+。**只在真正需要最新时用**，否则用 read-critical 配版本号。

3. **mastership 切换有抖动**：用户飞行途中频繁切 region 时，mastership 可能反复迁移，每次迁移要等当前在途消息消费完。**实践中**会加冷却期（cooldown）避免抖动。

4. **YMB 不是开源的**：论文里 YMB 描述偏简略，外人复刻时要拿 Kafka / RabbitMQ 顶替，但保序保证要自己确认——Kafka 单 partition 内保序、跨 partition 不保。

5. **tablet 同时支持 hash 和 ordered**：ordered table 支持 range scan 但 split 复杂；hash table 不能 scan 但好分。**别上来就选 ordered**，除非真有 range 查询。

6. **版本号是 record 内单调，不是全局单调**：两条 record 的 v=42 没有可比性。新人常误以为"v 大的就是新的"，导致跨记录因果推理出错。

7. **YMB 故障会让复制无限滞后**：当 YMB 集群故障时，写仍然成功（master 本地写入即返），但其他副本 lag 持续累积。读 read-any 的副本会看到越来越旧的数据——监控必须看 **per-region replication lag**，不能只看错误率。

## 适用 vs 不适用

**适用**：

- 用户产品里大多数操作是"用户改自己的数据"——邮件、profile、社交时间线、播放历史
- 需要全球低延迟读写、能容忍跨记录无序；单记录热点写时 master 仍是瓶颈，要靠迁移或拆 key
- 需要简单的 per-record 乐观并发（test-and-set）

**不适用**：

- 跨记录事务——银行转账（A 减 100 / B 加 100 必须原子）→ 用 Spanner / CockroachDB
- 全局快照读——财务对账要看"某一刻所有账户余额" → PNUTS 给不了
- 极简自建——依赖 YMB、Tablet Controller、Router 多组件 → 自建用 Cassandra / FoundationDB

## 历史小故事（可跳过）

- **2006**：Bigtable 论文发表，强一致但单数据中心。Yahoo! 在做"全球用户产品"——邮箱、Flickr、Messenger，单中心不够用。
- **2007**：Dynamo 论文发表，多数据中心但最终一致。Yahoo! 的工程师发现纯最终一致性写业务很痛苦——"我刚改完我自己怎么读不到"是高频投诉。
- **2008**：Brian Cooper 团队提出 PNUTS——多数据中心 + per-record 顺序，论文发表在 VLDB。
- **2010**：同一团队发布 YCSB（Yahoo! Cloud Serving Benchmark，SoCC 2010），用来量化云存储的延迟/吞吐权衡。
- **之后**：Brian Cooper 离开 Yahoo!，去 Google 参与 Spanner 团队；PNUTS/Sherpa 在 Yahoo! 内部继续服务多年。**系统本身没开源**，主要留下论文与 YCSB，是工业界"消失的大型系统"代表。

## 学到什么

1. **一致性不是非黑即白**——"per-record timeline" 是实用业务的最佳点，不需要全局序但比 eventual 强
2. **用消息中间件做地理复制比两阶段提交工程上简单得多**——pub/sub 让"复制"和"业务写"解耦
3. **把 mastership 做成可迁移的元数据**，比"固定 leader"更贴合用户漂移的真实场景
4. **理论上的弱一致性，加上"读 API 让你按需选"**，业务方既能要快也能要准——这是后来 Cosmos DB 五档一致性的雏形
5. **"消失的大型系统"也值得读**——PNUTS 没开源、Yahoo! 后来式微，但论文里的设计被 AWS / Azure / Google 各自重新发明了一次。读原始论文比读后人改写的版本更清晰

## 延伸阅读

- 论文 12 页 PDF：[PNUTS VLDB 2008](http://www.vldb.org/pvldb/vol1/1454167.pdf)（密度适中，工程细节多）
- YCSB 基准：[Cooper et al., "Benchmarking Cloud Serving Systems with YCSB", SoCC 2010](https://dl.acm.org/doi/10.1145/1807128.1807152)（PNUTS 团队后续作品）
- 对照阅读：[[bigtable-2006]] / [[dynamo]] / [[spanner-2012]]——三篇放一起看就理解了 PNUTS 的位置
- 现代继承者：DynamoDB Global Tables、Cosmos DB 一致性档位、CockroachDB follower reads——都能看到 PNUTS 影子

## 一句话记忆

**"同一条记录的所有副本，按相同顺序应用更新；记录之间互不打扰。"** 这就是 per-record timeline consistency。

## 关联

- [[bigtable-2006]] —— 单数据中心强一致，PNUTS 在它基础上加了多数据中心
- [[dynamo]] —— 多数据中心最终一致，PNUTS 在它基础上加了 per-record 顺序
- [[spanner-2012]] —— PNUTS 之后的"强一致跨地域"方案，用 TrueTime 做全局序
- [[cassandra-2010]] —— Dynamo 工业后继者，PNUTS 没开源所以社区流向了它
- [[aurora]] —— 单一 region 内的强一致云数据库，与 PNUTS 思路相反

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[cassandra-2010]] —— Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳

