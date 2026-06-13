---
title: Redis — 内存键值数据库
来源: https://redis.io/docs/latest/
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 是什么

**Redis**（**Re**mote **Di**ctionary **S**erver，远程字典服务）是把数据主要放在 **内存（RAM）** 里的键值数据库。官方把它定义为 *in-memory data structure store*：不只是「字符串 → 字符串」，还提供列表、集合、哈希、有序集合等**原生数据结构**，在服务端就能完成计数、排行、队列等操作。

日常类比：

- **PostgreSQL** 像图书馆的密集架——按编号精确找书，书永久上架，查一本要走书架（磁盘 I/O），稳但慢。
- **Redis** 像办公桌上一摞**彩色便利贴**——伸手就能改、就能读，速度是微秒级；下班前把便签**复印一份**锁进抽屉（RDB/AOF 持久化），第二天还能恢复，但抽屉里的副本总比桌面晚半拍。

最小交互长这样：

```bash
redis-cli SET user:1 "Alice"
redis-cli GET user:1
# → "Alice"
```

一次往返通常在亚毫秒级。快的原因很朴素：**热数据在内存里**，不必每次读盘。

Redis 由 Salvatore Sanfilippo（antirez）于 2009 年用 C 语言编写，MIT 协议开源；GitHub 仓库 [redis/redis](https://github.com/redis/redis) 仍是核心实现。2024 年起上游许可证曾调整为 SSPL，社区 fork 出 [[valkey]] 延续 BSD 路线——选型时要留意「Redis Inc. 发行版」与「Valkey」的治理差异。

## 为什么重要

零基础学后端或做全栈，几乎绕不开 Redis，因为：

- **缓存**：把读多写少的数据挡在 [[postgresql]]、[[mysql]] 前面，减轻数据库压力（GitHub、Twitter、Stack Overflow 等大量站点都这样用）
- **会话 / 限流 / 计数**：`INCR` 原子自增 + `EXPIRE` 过期，几行命令就能做 API 限流、点赞数、验证码尝试次数
- **排行榜与延时队列**：有序集合（sorted set）和列表（list）是游戏榜单、任务队列的标配
- **实时能力**：Pub/Sub、Stream 可做通知、简单消息流，不必一上来就上 [[kafka]]
- **理解「单线程也能高 QPS」**：和 nginx、Node.js 事件循环同属一类工程直觉——少锁、少切换、把热路径写短

## 核心概念

### 1. Key–Value 与命名空间

一切皆 **key**。key 是字符串（二进制安全），value 的类型由你创建时决定。习惯用冒号分层，例如 `user:1001:profile`，便于 `SCAN` 按前缀浏览，也避免不同业务撞名。

每个 key 可单独设置 **TTL**（存活时间），到期自动删除——缓存场景的核心机制。

### 2. 五种经典数据结构（再加扩展）

| 类型 | 类比 | 典型命令 | 常见用途 |
|------|------|----------|----------|
| **String** | 一张便签上的整段字 | `SET` `GET` `INCR` | 缓存 HTML/JSON、计数器、分布式锁 |
| **Hash** | 便签上的「字段:值」表 | `HSET` `HGET` `HGETALL` | 用户资料、购物车一行对象 |
| **List** | 双向排队绳 | `LPUSH` `RPOP` `LRANGE` | 消息队列、最新 N 条动态 |
| **Set** | 不重复名单袋 | `SADD` `SISMEMBER` `SINTER` | 标签、共同好友、去重 |
| **Sorted Set** | 带分数的排名榜 | `ZADD` `ZRANGE` `ZREVRANK` | 排行榜、延时任务（按时间戳打分） |

新版 Redis 还提供 **JSON**、**Stream**、**Time Series**、**Probabilistic**（HyperLogLog、Bloom 等）类型；零基础先把上表五种练熟即可覆盖大部分面试与业务题。

### 3. 单线程命令执行 + 事件循环

Redis 处理命令的**主路径**长期是单线程：一个 `ae` 事件循环（Linux 上基于 epoll）同时盯很多客户端连接，谁有数据可读就解析 RESP 协议、执行命令、写回结果。好处是**不需要给共享数据结构加锁**，实现简单、延迟稳定。

注意区分：

- **命令执行**：默认仍在主线程串行（保证原子语义简单）
- **持久化 fsync、惰性删除大 key、6.0+ 的 I/O 线程**：可在后台线程或子进程做，避免拖死主循环

因此：**一条很慢的命令**（如对巨大 hash 做 `HGETALL`）会阻塞同一实例上的其他请求——这是架构约束，不是 bug。

### 4. 持久化：RDB 与 AOF

内存再快，重启也会空。Redis 用两种方式把数据落到磁盘：

| 方式 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **RDB** | 间隔拍快照（`dump.rdb`） | 文件紧凑、恢复快 | 两次快照之间可能丢数据 |
| **AOF** | 追加每条写命令日志 | 可配置为每秒或每次 `fsync`，更耐丢 | 文件大、重写时占 CPU |

生产常见 **两者都开**；Redis 7+ 的 AOF 还可带 **RDB 前缀**（hybrid），兼顾加载速度与增量日志。重启时若两者都在，通常 **优先用更完整的 AOF** 恢复。

### 5. 过期与淘汰

- `EXPIRE key seconds` / `SET key value EX 3600`：key 级 TTL
- 内存达到 `maxmemory` 时按 **maxmemory-policy** 淘汰（如 `allkeys-lru`）

默认 `noeviction` 会在写满时**拒绝写入**——很多线上故障来自没改这项。

### 6. 集群与高可用（知道名词即可）

- **主从复制**：读扩展、故障切换基础
- **Redis Sentinel**：监控主节点、自动故障转移
- **Redis Cluster**：16384 个 hash slot 分片，key 按 slot 落到不同节点；**跨 slot 的多 key 事务受限**

零基础本地开发先用**单实例**；分片与 Sentinel 在流量上来后再学。

## 快速上手

### 安装与启动

```bash
# macOS
brew install redis
brew services start redis

# 或 Docker（适合本机多版本共存）
docker run -d --name redis -p 6379:6379 redis:7-alpine

# 进入命令行
redis-cli ping
# → PONG
```

默认监听 `6379`，无密码（生产必须设 `requirepass` 和网络隔离）。

## 代码示例

### 示例 1：Cache-Aside 缓存用户资料

应用读路径：**先 Redis，未命中再查库，回写并设过期**。这是最常见的缓存模式。

```bash
# 模拟：库中查到的 JSON（实际由应用写入）
SET user:42 '{"name":"Bob","plan":"pro"}' EX 3600

GET user:42
# 命中则直接返回，省一次 SQL

# 更新用户时：先写库，再删缓存（或 SET 新值），避免脏读
DEL user:42
```

对应 Node.js 伪代码逻辑：

```javascript
async function getUser(id) {
  const key = `user:${id}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const row = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  await redis.set(key, JSON.stringify(row), 'EX', 3600);
  return row;
}
```

要点：`EX 3600` 防止冷数据永久占内存；更新策略要和团队约定一致（删 key vs 更新 key）。

### 示例 2：排行榜（Sorted Set）

游戏或电商秒杀常用 **ZSET**：成员唯一，按 **score** 排序；底层跳跃表 + 哈希，插入与按名次查询约 **O(log N)**。

```bash
ZADD leaderboard 9850 "alice"
ZADD leaderboard 12000 "bob"
ZADD leaderboard 10300 "carol"

# 分数从高到低，取前 10 名并带上分数
ZREVRANGE leaderboard 0 9 WITHSCORES

# 查某用户名次（0 表示第一名）
ZREVRANK leaderboard "carol"
```

若要「每周榜」与「总榜」并存，用不同 key 即可，例如 `leaderboard:2026-W24` 与 `leaderboard:all`。

### 示例 3：简单分布式锁（单实例）

多实例部署时，可用 **SET NX EX** 做互斥（更强一致需 Redlock 或 [[etcd]] 等）：

```bash
# 仅当 key 不存在时设置，10 秒后自动释放，value 用唯一 token
SET lock:order:8817 "uuid-7f3a" NX EX 10

# 业务完成后，用 Lua 校验 token 再删，避免删掉别人的锁
```

`NX` = not exists；`EX` = 秒级 TTL，防止进程崩溃导致死锁。

### 示例 4：用 Hash 存对象字段

比把整个对象塞进一个 JSON 字符串更省内存的场景，是 **Hash**（字段数不多时）：

```bash
HSET bike:1 model "Deimos" brand "Ergonom" price 4972
HGET bike:1 model
# → "Deimos"
HGETALL bike:1
```

官方教程 [Redis as a data store](https://redis.io/docs/latest/develop/get-started/data-store/) 用自行车库存演示这套 API，适合跟着敲一遍。

## 适用与不适用

**适合：**

- 读多写少的缓存、会话存储、验证码、限流计数
- 排行榜、简单队列、去重集合、实时在线用户集合
- 需要亚毫秒级读写的热数据（配合过期与容量规划）

**不适合：**

- **唯一主库**：内存贵，持久化语义弱于关系库；冷数据应落盘到 PostgreSQL 等
- **复杂查询 / JOIN / 报表**：没有 SQL；分析型 workload 看 [[clickhouse]] 或数仓
- **强一致金融账务**：单实例故障切换仍可能丢最后一秒写入，需业务层补偿或换专用方案
- **超大 value**：单 key 最大约 512MB，且大 key 会阻塞单线程——应拆分或用 `HSCAN` 流式读

## 常见坑（零基础避雷）

1. **把 Redis 当唯一数据源**：宕机 + 持久化间隙 = 丢数据；它是加速层，不是档案柜。
2. **缓存穿透 / 击穿 / 雪崩**：穿透用布隆过滤器或空值缓存；击穿用互斥重建；雪崩用随机 TTL、分批过期。
3. **大 key 与热 key**：`KEYS *` 在生产禁用，用 `SCAN`；热 key 用本地缓存或多副本分散。
4. **集群里跨 slot 事务**：`MULTI` 里的 key 必须落在同一 slot；可用 `{user1}:profile` 与 `{user1}:orders` 的 **hash tag** 强制同 slot。
5. **本地 `file://` 打开页面**：浏览器里跑 Redis 客户端连不上 Web Worker 语言服务；和 Monaco 一样要用 `http://` 服务。
6. **许可证与发行版**：关注 Redis SSPL 与 Valkey fork，合规与长期维护策略要纳入选型。

## 与周边项目的关系

- [[postgresql]] / [[mysql]]：Redis 常坐在前面做缓存，关系库做权威数据
- [[memcached]]：更单纯的字符串缓存，无持久化、无丰富结构；要数据结构选 Redis
- [[bullmq]] / [[sidekiq]] / [[celery]]：后台任务队列常把 Redis 当 broker
- [[dragonfly]]：多线程、Redis 协议兼容的替代实现，高核数机器上可对比测试
- [[valkey]]：社区 BSD fork，API 高度兼容

## 学习路径建议

1. 本地 `redis-cli` 把五种结构各练 10 条命令（官方 [命令参考](https://redis.io/docs/latest/commands/)）
2. 读 [Data types 概览](https://redis.io/docs/latest/develop/data-types/)，理解「按访问模式选型」
3. 在真实项目里实现一个 **带 TTL 的 cache-aside**，观察命中率和内存
4. 读 [Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)，弄清 RDB/AOF/`appendfsync` 与你能接受丢多少数据
5. 有余力再看复制、Sentinel、Cluster 文档与 `redis.conf` 注释

## 小结

Redis 的核心不是「又一个数据库」，而是：**在内存里用合适的数据结构，以单线程语义简单的方式，极快地完成一小类高频操作**。记住三句话就够入门：

- **Model 在内存，key 要会起名、会过期**
- **String/Hash/List/Set/ZSet 按场景选，别全当字符串硬塞**
- **它是缓存与加速层，持久化与集群是为了少丢数据、撑规模，不能替代关系库**

## 延伸阅读

- 官方入门：[redis.io/learn](https://redis.io/learn/)
- 数据结构对比决策树：[Compare data types](https://redis.io/docs/latest/develop/data-types/compare-data-types/)
- 事件库 internals：[Event library](https://redis.io/docs/latest/operate/oss_and_stack/reference/internals/internals-rediseventlib/)
- antirez 博客：[antirez.com](http://antirez.com/)（设计复盘可读性很高）
- 源码入口：`server.c` 中的 `main()` → `aeMain()` 理解事件循环主循环
