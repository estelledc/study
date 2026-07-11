---
title: Dragonfly — 多线程 Redis 替代
来源: https://github.com/dragonflydb/dragonfly
日期: 2026-05-31
分类: 数据库 / 缓存
难度: 中级
---

## 是什么

Dragonfly 是 Roman Gershman 在 2022 年用 C++ 写的内存数据库——**协议尽量兼容 [[redis]]，但单实例多线程**。多数现有 Redis client / SDK 不用改就能连；底层则按多核机器来设计，而不是死守单线程。

日常类比：

- [[redis]] 是**单核厨师**——客人再多，菜还是一个人炒
- Dragonfly 是**分工厨房**——每个 CPU 核一个厨师，请求按 key 分到不同灶台，吞吐随核数上去

一句话：「Redis 协议兼容面 + 多核并行 + 更省内存」的内存 KV。

它解决的不是"发明新 API"，而是"在你已经会的 Redis 用法上，把单核天花板拆掉"。

## 为什么重要

不理解 Dragonfly，下面这些事不好解释：

- 为什么 2022 年后多一个 Redis 对标项，云场景讨论多——官方 benchmark 宣称单实例可到约 20–25× 吞吐（视核数与 workload）
- 为什么「更省内存」也是卖点——大规模缓存里少几台机器就是账单差
- 为什么 [[redis]] 2024 年改 SSPL 后，有人转向 Dragonfly（BSL，约 4 年后转 Apache 2.0）或 [[valkey]]
- 为什么内存 KV 变成 Redis / Valkey / Dragonfly 多选手，而不是一家说了算

要点：把「Redis 协议习惯」和「Redis 单线程实现」拆开——协议可兼容，实现可重写。

## 核心要点

比单线程 Redis 更能吃满多核，主要靠三件事：

1. **多线程 + shared-nothing**：每个核绑一个线程，管自己的 key 分片，少抢全局大锁。类比：每个厨师有自己的灶和菜板。

2. **Dashtable 等结构**：替代 Redis 经典 Dict 的一条路径。分段扩容，避免整表 stop-the-world rehash。官方材料常提综合内存效率约高一截；**Dashtable 是原因之一，不是唯一原因**（编码与分配策略也有关）。

3. **RESP 兼容常用命令面**：RESP 是 Redis 的序列化协议。Dragonfly 实现 RESP2/3 的常用路径，所以 redis-cli、jedis、ioredis 等往往能直接连——但**不是**「每一个 Redis 7 命令 + 所有 module 都 100% 等价」。

把三件事串起来：请求进进程后按 key 落到某个 shard 线程，在 Dashtable 里读写，再用 RESP 把结果写回 client。你感觉像 Redis，是因为**外面那层协议熟**；快，是因为**里面不再单核排队**。

## 实践案例

### 案例 1：30 秒跑起来

```bash
docker run -p 6379:6379 docker.dragonflydb.io/dragonflydb/dragonfly
redis-cli PING          # 期望 PONG
redis-cli SET foo bar
redis-cli GET foo       # 期望 bar
```

体感和本机 Redis 很像——这就是协议兼容的力量。

### 案例 2：先列命令清单再谈替换

```bash
# 在旧 Redis 上导出你真正用到的命令（示例：慢日志 / 业务审计）
# 然后在 Dragonfly 上逐条试：
redis-cli SET k v
redis-cli HSET user:1 name Ada
redis-cli ZADD rank 1 alice
redis-cli EVAL "return redis.call('GET', KEYS[1])" 1 k
```

逐步：先确认 SET/HASH/ZSET/Lua 等你依赖的子集行为一致；再压测。官方 16 核 memtier 数字（约 200k vs 约 4M ops/s）只作参考，**以你的 key 分布与命令混合比为准**。

也可以用 `memtier_benchmark` 对旧 Redis 与 Dragonfly 各打一轮同参数，看 P99 与 ops/s，不要只背宣传倍数。

### 案例 3：迁移时持久化不互通

```bash
# 1. 新实例起 Dragonfly，监听 6379（或旁路端口做双写）
# 2. 应用先双写 Redis + Dragonfly，或离线用 redis-cli --rdb 导出后自写灌数
# 3. 切读 → 切写 → 下线旧实例
redis-cli --rdb dump.rdb   # 从旧 Redis 导出；Dragonfly 不直接吃这个文件当自己的 DFS
```

Dragonfly 快照格式是 DFS，和 Redis RDB/AOF **不能当同一文件互读**。在线业务优先双写灰度；纯缓存可重建。

替换验收清单（最少三项）：

1. `INFO` / 业务探针：延迟与错误率不差于旧实例基线
2. 热点 key 的 GET/SET 与一小段 Lua 回归通过
3. 故障演练：进程重启后快照能否按你的 RPO 恢复（别假设"和 Redis 一样丢文件就能救"）

## 踩过的坑

1. **命令与 module 子集**：FUNCTION、RedisJSON / RediSearch 等可能缺失或行为不同——换之前用真实命令清单做兼容测试。
2. **Lua sandbox 有差异**：依赖 Redis 内部细节的复杂脚本要回归。
3. **持久化格式不通用**：DFS ≠ RDB；迁移靠双写或导出重灌，不是改个文件名。
4. **跨分片多 key 有代价**：shared-nothing 下 MGET/事务跨线程要协调；相关 key 尽量设计到同一 hash 槽/线程。

补充许可提醒：BSL 前约 4 年对"包装成竞品云服务转售"等场景有限制，自用缓存通常没事，上线前让法务看一眼条款。

## 适用 vs 不适用场景

**适用**：

- 单实例 Redis 已吃满 CPU，又不想立刻上 Cluster——换多线程实例换吞吐余量
- 几十 GB 级缓存，在乎内存账单
- 主要用 SET/GET/HASH/LIST/ZSET/PUB-SUB 等常见命令
- 对 SSPL 敏感、可接受 BSL 条款的团队（法务过一遍）
- 想用单实例多核先顶住流量，cluster 能力可以后补的中等规模缓存

**不适用**：

- 重度依赖 Redis module / Enterprise 特性（Active-Active CRDT、Auto Tiering 等）
- 已有大规模 Redis Cluster 且无瓶颈——换的收益小、回归成本高
- 需要与旧 RDB 文件直接互操作的运维流程

## 历史小故事（可跳过）

- **2022 年**：Gershman 等开源 Dragonfly，目标按现代多核假设重写内存 KV；很快获得大量 star。
- **2023 年**：v1.0 GA，开始有生产采用。
- **2024 年**：Redis 改 SSPL，社区分流到 [[valkey]] 与 Dragonfly；Dragonfly 继续补齐复制与 cluster 能力。
- **趋势**：内存 KV 从一家独大变成多实现竞争，许可与架构都有的选。
- **读史时注意**：吞吐倍数随硬件与 workload 变；把它当"架构证明多核有用"，别当永远不变的 SLA。

## 学到什么

1. **协议习惯可复用，实现可替换**——RESP 生态让"换引擎不换 client"成为可能
2. **单线程简洁 vs 多线程吞吐**——看瓶颈在 CPU 核还是运维复杂度
3. **结构与编码决定内存上限**——换哈希表只是拼图一块
4. **许可证是技术决策的一部分**——SSPL 事件后尤其明显
5. **shared-nothing 不是零协调**——单 key 很快；跨 key 仍要在涉及的 shard 之间握手

## 延伸阅读

- 架构文：[Dragonfly Architectural Overview](https://www.dragonflydb.io/blog/dragonfly-architectural-overview)
- 仓库 benchmark：`tools/benchmark/`（自己机器复现，别只背 25×）
- Dashtable 背景：Pedrosa 等，Dash（VLDB 2020）——分段哈希思路参考
- 读码入口（可选）：`server/engine_shard_set.cc`（shard 调度）、`core/dash_table.h`（分段表）、`server/transaction.cc`（跨 shard 协调）
- 对照笔记：先读 [[redis]] 单线程模型，再回看 Dragonfly 的分片线程，对比会更清楚

## 关联

- [[redis]] —— 协议兼容对象与单线程对照
- [[valkey]] —— 同赛道、偏保留经典模型 + 社区治理
- [[seastar]] —— shared-nothing 多线程近亲思路
- [[dynamo]] —— 分区与最终一致的历史对照
- [[raft]] —— 强一致复制对照面
- [[paxos]] —— 另一条"靠共识协调"的路线，和多线程缓存加速不是同一层问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[redis]] —— Redis — 内存键值数据库
- [[valkey]] —— Valkey — Redis 7.2.4 的开源 fork
