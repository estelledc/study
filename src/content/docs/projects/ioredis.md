---
title: ioredis — Node 里同时覆盖单机、Sentinel 和 Cluster 的 Redis 客户端
description: 面向 Node 的 Redis 客户端，覆盖 standalone、Sentinel 与 Cluster。
来源: 'https://github.com/redis/ioredis'
日期: 2026-08-27
分类: backend-api
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/redis/ioredis
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8ed2946504a36ae9b1e186b9dccc56afcd046d78
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.0.0
---

## 是什么

ioredis 是一个面向 Node.js 的 Redis 客户端。日常类比：像总机接线员——你只报命令和参数，它负责连哪台机器、掉线怎么重拨、一批命令怎么打包，以及回复按哪种表格交到你手里。

```js
import Redis from "ioredis";

const redis = new Redis(); // 默认 localhost:6379
await redis.set("user:1", "Alice");
const name = await redis.get("user:1");
```

固定 `6.0.0` 同时覆盖 standalone、Sentinel 与 Cluster。构造后默认立刻 `connect()`；只有 `lazyConnect: true` 才会等到第一条命令或显式 `connect()`。

## 为什么重要

不理解 ioredis 的连接合同，下面这些事都没法解释：

- 为什么 v6 默认走 RESP3 线路，但回复形状默认仍按 RESP2 扁平化
- 为什么掉线后未完成命令会进队列，却不会无限等下去
- 为什么同一套 `set/get` 能指向单机、Sentinel 主从或 Cluster 分片
- 为什么 [[bullmq]] 可以把 ioredis 当成 Redis backend 的默认驱动，却不再把它写成硬依赖

## 核心要点

固定源码把一次调用拆成五层：

1. **解析连接目标**：端口/主机、URL 或 `sentinels` 决定用 StandaloneConnector 还是 SentinelConnector；Cluster 是独立类。
2. **握手与协议**：默认 `protocol: 3`。`replyMapping` 默认为 `"legacy"`，Map 仍是扁平数组、double 仍是字符串；要原生 RESP3 形状必须显式 `replyMapping: "resp3"`。
3. **命令排队**：连接未 ready 时，默认 `enableOfflineQueue: true` 先把命令放进离线队列。
4. **重连与重试上限**：默认 `retryStrategy` 是 `min(2^(times-1)*50, 5000)` 再加 0–199ms jitter；`maxRetriesPerRequest` 默认 20，超过就抛 `MaxRetriesPerRequestError`。
5. **批量与脚本**：`pipeline()` 把多条命令一次写出；`multi()`/`exec()` 走事务；`defineCommand` 绑定 Lua。`himportFieldsets` 是实验接口，源码写明需要 Redis 8.10+。

## 实践示例

### 案例 1：显式保留 v5 线路

```js
const redis = new Redis({
  host: "127.0.0.1",
  port: 6379,
  protocol: 2
});
```

v6 breaking change 是“默认 RESP3”。旧代码如果依赖 RESP2 线路而不是只依赖 legacy 回复形状，应显式钉 `protocol: 2`。

### 案例 2：Cluster 读路由

```js
import { Cluster } from "ioredis";

const cluster = new Cluster(
  [{ host: "127.0.0.1", port: 7000 }],
  { scaleReads: "master", maxRedirections: 16 }
);
await cluster.set("user:1", "Alice");
```

默认 `scaleReads` 是 `"master"`，`maxRedirections` 是 16。MOVED/ASK 会改写目标节点，但重定向次数有上限。

### 案例 3：Pipeline 与事务不是同一件事

```js
const pipe = redis.pipeline();
pipe.set("a", "1");
pipe.incr("a");
const replies = await pipe.exec();

const tx = redis.multi();
tx.set("b", "1");
tx.incr("b");
await tx.exec();
```

Pipeline 只保证一次写出多条命令；`MULTI/EXEC` 才是 Redis 事务边界。两者都不能代替服务端 Lua 的多键原子性。

## 踩过的坑

1. **把默认 RESP3 当成回复形状也变了**：默认 `replyMapping` 仍是 `"legacy"`。要对象型 Map / 数值 double，必须显式 `"resp3"`；`"resp3"` 配 `protocol: 2` 会在构造期抛错。
2. **把无限等待当成默认**：`maxRetriesPerRequest` 默认是 20，不是 `null`。[[bullmq]] 的 Redis 连接路径会要求把它改成 `null`。
3. **以为 `lazyConnect` 是默认**：默认会立即建连。测试或短命令工具如果没处理早期 `error`，会看到未监听的连接失败。
4. **把 README 的“新项目推荐 node-redis”写成性能结论**：那是上游维护立场，本轮没有跑对比。

## 适用 vs 不适用场景

**适用**：

- 已经在用 ioredis 的 Node 服务，需要单机 / Sentinel / Cluster 同一套 API
- 需要离线队列、ready check、自定义 Lua 或 pipeline
- 给 [[bullmq]] Redis backend 提供 client 实例

**不适用**：

- Node < 20，或 Redis < 6.2——这是 v6 矩阵，不是建议值
- 只要标准 node-redis / Web 客户端，且团队准备跟上游推荐走
- 需要已验证的 hash-field expiration / Redis 8 新面，但不能只靠 README 推断当前实现覆盖

## 固定版本边界

- 本文绑定 `redis/ioredis@8ed29465...`，npm / tag / `gitHead` 均为 `6.0.0`。
- `engines.node` 为 `>=20.0.0`。默认 `protocol: 3`、`replyMapping: "legacy"`、`maxRetriesPerRequest: 20`。
- 本文未安装依赖、连接 Redis、运行上游测试或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **线路协议和回复形状是两层合同**——RESP3 默认不等于业务代码突然拿到 Map 对象。
2. **重连策略必须带上限**——jitter 只平滑重拨，`maxRetriesPerRequest` 决定命令何时失败。
3. **连接拓扑是构造期选择**——standalone / Sentinel / Cluster 不是运行时自动升级。
4. **队列库会改写客户端默认**——BullMQ 需要 `maxRetriesPerRequest: null`，不能直接套 ioredis 默认值。

## 应用型自测

1. `new Redis()` 不改选项，HGETALL 在固定 6.0.0 默认会返回普通对象还是扁平数组？
2. 连接断开后第 21 次仍未恢复，默认会一直排队还是抛错？
3. `new Redis({ protocol: 2, replyMapping: "resp3" })` 能建起来吗？

检查点：

1. 扁平数组。默认 `replyMapping` 是 `"legacy"`。
2. 抛 `MaxRetriesPerRequestError`；默认上限是 20。
3. 不能。`"resp3"` 只允许和 `protocol: 3` 一起用。

## 延伸阅读

- 固定源码：[redis/ioredis](https://github.com/redis/ioredis) —— 本文绑定提交 `8ed2946504a36ae9b1e186b9dccc56afcd046d78`
- 升级说明：[Upgrading from v5 to v6](https://github.com/redis/ioredis/wiki/Upgrading-from-v5-to-v6)
- 默认选项：[lib/redis/RedisOptions.ts](https://github.com/redis/ioredis/blob/8ed2946504a36ae9b1e186b9dccc56afcd046d78/lib/redis/RedisOptions.ts)
- [[bullmq]] —— 默认 Redis backend 仍可走 ioredis，但 v6 把它降成 optional peer
- [[redis]] —— 服务端数据结构与 Lua，决定客户端能表达什么

## 关联

- [[bullmq]] —— Node 任务队列；Redis backend 会覆盖 ioredis 的 `maxRetriesPerRequest`
- [[redis]] —— 服务端；RESP、Cluster slot 与 Lua 都在这边定义
- [[nestjs]] —— 常见组合是 Nest 注入 ioredis 或 `@nestjs/bullmq`
- [[fastify]] —— 请求线程里用 ioredis 做缓存/锁，慢活再丢给队列

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
