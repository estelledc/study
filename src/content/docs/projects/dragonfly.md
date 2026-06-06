---
title: Dragonfly — 多线程 Redis 替代
来源: https://github.com/dragonflydb/dragonfly
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Dragonfly 是 Roman Gershman 在 2022 年用 C++ 写的内存数据库——**协议兼容 [[redis]]，但单实例多线程**。原来连 Redis 的 client / SDK 完全不用改，连上去就能跑，但底层是一个能把多核机器吃满的服务端。

日常类比：

- [[redis]] 是**单核厨师**——再多客人来，菜还是一个人炒，第二个炉灶在那里也用不上
- Dragonfly 是**分工厨房**——每个 CPU 核坐一个厨师，客人按号分到不同厨师，吞吐量直接乘核数

一句话定位：「Redis 协议 + 多核并行 + 更省内存」的内存 KV。

## 为什么重要

不理解 Dragonfly 的存在，下面这些事都没法解释：

- 为什么 2022 年突然多一个「和 Redis 对标」的项目，云厂商跟进很快——单实例吞吐 25 倍是真金白银省钱
- 为什么「内存效率高 30%」也是卖点——大规模缓存集群里，每省一台机器都是月度账单的差距
- 为什么 [[redis]] 在 2024 年改 SSPL 许可后，Dragonfly 顺势接住了一批用户——Dragonfly 用 BSL（4 年后转 Apache 2.0），对很多团队更友好
- 为什么 [[valkey]] 出现后，「内存 KV」赛道变成了三家竞争（Redis / Valkey / Dragonfly），而不是一家独大

简单说：Dragonfly 把「Redis 协议」和「Redis 实现」解耦了——协议是公开标准，实现可以重写。

## 核心要点

Dragonfly 能比 [[redis]] 快这么多，靠三件事：

1. **多线程 + shared-nothing 架构**：每个 CPU 核绑定一个独立线程，每个线程管自己的一份 key 范围，互不抢锁。类比：分工厨房里每个厨师有自己的灶台和食材，不需要排队抢一口锅。

2. **Dashtable**（替代 Redis Dict 的哈希表）：Redis 用的 Dict 是单线程时代的设计，扩容时会卡顿（一次性把所有 key 重新哈希一遍）。Dashtable 是分段式哈希，扩容只动一段、不阻塞其他段。内存碎片也更少，所以总体省 30%。

3. **RESP 协议兼容**：RESP（REdis Serialization Protocol）是 Redis 的网络协议。Dragonfly 完整实现了 RESP2/3，所以 redis-cli、jedis、ioredis、go-redis 这些 client 直接连，不用改一行代码。

## 实践案例

### 案例 1：30 秒跑起来

```bash
docker run -p 6379:6379 docker.dragonflydb.io/dragonflydb/dragonfly
```

然后用任何 Redis client 连：

```bash
redis-cli SET foo bar
redis-cli GET foo
```

体感和 [[redis]] **完全一致**——这就是协议兼容的力量。

### 案例 2：性能对比

官方 benchmark（16 核机器，memtier_benchmark 压测）：

- Redis 单实例：约 200k ops/s（瓶颈在单核）
- Dragonfly 单实例：约 4M ops/s（吃满 16 核）

差距是 **20-25 倍**。要在 Redis 上达到同样吞吐，得跑 Redis Cluster 16 个分片，运维复杂度立刻上一个台阶（管 cluster 拓扑、resharding、客户端要懂分片）。

### 案例 3：替换现有 Redis 的步骤

```bash
# 1. 停 Redis（或者保留旧实例做迁移期对照）
# 2. 启 Dragonfly，监听同样的端口 6379
# 3. 应用代码不动，重启即可
```

如果原来用 RDB / AOF 持久化，需要规划迁移：Dragonfly 有自己的 snapshot 格式（DFS），不能直接读 Redis 的 RDB 文件——这是替换时第一个要踩的坑。常见路径有两条：双写 + 灰度切流（适合在线业务），或者 redis-cli --rdb 导出 + 自写脚本灌入新实例（适合离线缓存）。

### 案例 4：单实例代替小集群

假设原本用 3 个 Redis 节点做分片，每个吃满一个核：

- Redis 集群：3 实例 × 200k ops/s ≈ 600k ops/s，但要管 cluster 拓扑、resharding、客户端要懂分片
- Dragonfly 单实例（4 核机器）：能跑 1M+ ops/s，无 cluster 复杂度

很多中等规模的场景，单实例 Dragonfly 可以替掉 Redis 小集群，运维成本下一个台阶。但注意：单实例的可用性上限就是这台机器——彻底冗余还是要主从复制或 cluster。

## 踩过的坑

1. **部分 Redis 7 命令未完全实现**：FUNCTION 系列、部分第三方 module（RedisJSON / RediSearch 等）在 Dragonfly 上行为不一致或不支持。换之前先把项目用到的命令清单跑一遍兼容性测试。

2. **Lua 脚本 sandbox 略有差异**：Dragonfly 的 Lua 实现和 Redis 不完全等价，复杂脚本（特别是依赖 Redis 内部状态的）需要回归测试。

3. **持久化格式不通用**：Dragonfly 的 DFS snapshot 不能被 Redis 读，反之亦然。从 Redis 迁移需要走「双写 + cutover」或者「redis-cli --rdb 导出 + 自写脚本灌入」。

4. **BSL 许可的 4 年期**：BSL（Business Source License）规定「4 年后自动转 Apache 2.0」，但前 4 年内某些商业用途（比如把 Dragonfly 包装成竞品 SaaS 卖）受限。自用 / 内部缓存场景没问题，但法务最好评估一下。

5. **集群模式还在演进**：单实例多线程已经能解决很多场景，但跨机器的 cluster 模式（v1.20 起加入）成熟度还在追赶 Redis Cluster。

6. **shared-nothing 的代价**：跨 key 范围的多 key 命令（MGET / MSET 跨分片、事务跨分片）需要在多个线程间协调，性能不如「同一个线程内」。设计 key schema 时尽量让相关数据 hash 到同一线程。

## 适用 vs 不适用场景

**适用**：

- 单实例 Redis 已经吃满 CPU，但还不想拆 Cluster——直接换 Dragonfly 立刻有 10 倍余量
- 大量内存缓存（几十 GB 起），省 30% 内存等于省钱
- 用标准 Redis 命令（SET/GET/HASH/LIST/ZSET/PUB-SUB）的场景，迁移成本最低
- 对许可敏感、不接受 SSPL 的团队

**不适用**：

- 重度依赖 Redis module（RedisJSON / RediSearch / RedisGraph 等）——module 生态还在 Redis 这边
- 已经用 Redis Cluster 大规模分片且没遇到瓶颈——切换收益小、风险大
- 需要和 Redis Enterprise 商业特性（Active-Active CRDT、Auto Tiering 等）对接的场景

## 历史小故事

- **2022 年**：Roman Gershman（前 Google / RedisLabs 工程师）和 Roy Allen 创立公司，目标是「用现代多核硬件假设重写 Redis」。**5 月开源**第一版，几个月就拿到 4 万 star
- **2023 年**：v1.0 GA，开始有公司在生产用
- **2024 年**：[[redis]] 改 SSPL 许可，社区分裂——一部分人转 [[valkey]]，一部分人选 Dragonfly。Dragonfly v1.20 加入 cluster 模式和主从复制
- **趋势**：内存 KV 赛道从「Redis 一家独大」变成「Redis / Valkey / Dragonfly 三足」，对用户是好事——选择多了，许可也更宽松

## 学到什么

1. **协议是标准、实现是商品**——RESP 协议是 Redis 留给社区的礼物，让重写实现成为可能
2. **单线程的简洁性 vs 多线程的吞吐**——Redis 用单线程换简单，Dragonfly 用 shared-nothing 换吞吐，两种设计哲学都对，看场景
3. **数据结构选型决定上限**——Dict → Dashtable 这一个改动就拿到 30% 内存收益，底层数据结构的影响比想象大
4. **许可证是技术决策的一部分**——SSPL 事件证明：选基础组件时，许可走向比性能更影响长期决策
5. **shared-nothing 不是免费的**——单实例多线程把锁竞争换成了「跨线程协调」，跨 key 操作仍有代价

## 怎么读源码

如果想从代码层面理解 Dragonfly 是怎么做到「多核并发」的，建议这样切入：

1. **先读 server/dragonfly_listener.cc**：网络入口，看 RESP 请求怎么从 socket 到达每个 shard。
2. **再读 server/engine_shard_set.cc**：核心 shard 调度器，每个 shard 对应一个 CPU 核绑定的线程，理解「key 怎么映射到 shard」。
3. **接着读 core/dash_table.h / dash_table.cc**：Dashtable 的实现，看分段哈希怎么避免「stop-the-world rehash」。
4. **最后读 server/transaction.cc**：跨 shard 事务，理解 shared-nothing 架构下「多 key 命令」是怎么协调的。

读源码时一个常见误解：以为 shared-nothing 等于「零协调」。其实跨 shard 的事务依然要锁，但锁只在涉及的 shard 之间，不像 Redis Cluster 那样要跨网络。

## 延伸阅读

- 官方架构文档：[Dragonfly Architectural Overview](https://www.dragonflydb.io/blog/dragonfly-architectural-overview)
- benchmark 复现脚本：仓库内 tools/benchmark/，可以在自己机器上跑出 25 倍数字
- Dashtable 论文背景：Pedrosa "Dash: Scalable Hashing on Persistent Memory"（VLDB 2020）

## 关联

- [[redis]] —— Dragonfly 协议兼容的对象，单线程的祖师爷
- [[valkey]] —— 同样从 Redis 衍生，但走「保持单线程 + 社区治理」路线，和 Dragonfly 是同赛道不同思路
- [[seastar]] —— shared-nothing 多线程框架的代表作，Dragonfly 架构思想的近亲

<!-- 合并自 [[dragonflydb]] dedup 2026-05-31 -->
