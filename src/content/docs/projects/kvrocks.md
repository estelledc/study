---
title: "Apache Kvrocks — 磁盘型 Redis 兼容数据库"
来源: https://github.com/apache/kvrocks
日期: 2026-06-13
分类: 后端 API
子分类: databases-storage
provenance: pipeline-v3
---

# Apache Kvrocks — 磁盘型 Redis 兼容数据库

## 一、为什么需要 Kvrocks？

想象一下：Redis 像一个办公桌——存取速度极快，但桌面面积（内存）有限。桌子满了，你就得扔掉一些东西。

Kvrocks 的做法是：办公桌下面加了一个巨大的文件柜（RocksDB 磁盘存储）。你依然用 Redis 的方式跟它打交道，但数据实际存在硬盘上。容量大了几个数量级，代价是速度比纯内存 Redis 慢一些，但对大多数场景来说完全够用。

简单说：**Kvrocks = Redis 协议兼容 + RocksDB 磁盘存储 + 分布式能力**。

## 二、核心概念

### 1. 存储引擎：RocksDB

RocksDB 是 Facebook 开源的嵌入式键值存储引擎，把数据有序地存在磁盘上。Kvrocks 不做自己的存储，直接把 Redis 的数据结构（String、List、Hash 等）映射到 RocksDB 的 Key-Value 上。

类比：RocksDB 像一个超级有条理的图书管理员，所有书按编号排好，找书很快，只是从书架拿比从手里翻要慢一点。

### 2. Redis 协议兼容

Kvrocks 监听一个端口（默认 6666），任何 Redis 客户端（redis-cli、Jedis、Lettuce 等）都能直接连接，不需要改代码。

### 3. Namespace（命名空间）

Redis 有 16 个数据库（db0-db15），通过 `SELECT` 切换。Kvrocks 的 Namespace 更灵活：每个命名空间绑定一个独立的 token（类似密码），不同用户/租户之间完全隔离。

### 4. 复制（Replication）

Kvrocks 的主从复制类似于 MySQL 的 binlog 机制。Master 把数据变更以 binlog 形式推送给 Slave，支持部分同步（增量）和全量同步两种模式。

### 5. 集群（Cluster）

Kvrocks 实现了无代理（proxyless）的中心化集群方案。你可以直接用 Redis Cluster 的客户端 SDK 连接 Kvrocks 集群，透明地进行分片。

## 三、快速上手

### 用 Docker 启动

```bash
docker run -it -p 6666:6666 apache/kvrocks --bind 0.0.0.0
```

### 用 redis-cli 连接

```bash
redis-cli -p 6666
127.0.0.1:6666> SET greeting "hello kvrocks"
OK
127.0.0.1:6666> GET greeting
"hello kvrocks"
```

你看，命令跟 Redis 一模一样。

## 四、代码示例

### 示例 1：Namespace 多租户隔离

Kvrocks 用 `namespace` 命令管理命名空间，每个空间有自己的访问 token：

```bash
# 添加命名空间 ns1，绑定 token "my_token"
127.0.0.1:6666> namespace add ns1 my_token
OK

# 更新 token
127.0.0.1:6666> namespace set ns1 new_token
OK

# 查看所有命名空间
127.0.0.1:6666> namespace get *
 1) "ns1"
 2) "new_token"
 3) "__namespace"
 4) "foobared"

# 删除命名空间
127.0.0.1:6666> namespace del ns1
OK
```

连接时用 `-a` 指定 token 即可进入对应命名空间：

```bash
redis-cli -p 6666 -a my_token
```

### 示例 2：主从复制配置

Kvrocks 的复制通过 `SLAVEOF` 命令开启，类似 Redis 的 `REPLICAOF`：

```bash
# 在从节点上执行，指向主节点
127.0.0.1:6666> SLAVEOF 192.168.1.100 6666
OK

# 查看复制状态
127.0.0.1:6666> INFO replication
# Replication
role:slave
master_host:192.168.1.100
master_port:6666
master_link_status:up
master_last_io_seconds_ago:3
master_sync_in_progress:0
```

复制建立后，主节点的写入会自动同步到从节点。如果网络断开重连，Kvrocks 会尝试部分同步（只补传断开的部分），而不是每次都全量拷贝。

### 示例 3：常用 Redis 命令操作

Kvrocks 支持绝大多数 Redis 命令。以下是字符串和哈希类型的操作：

```bash
# 字符串类型
127.0.0.1:6666> SET user:1001:name "Jason"
OK
127.0.0.1:6666> SET user:1001:age 28
OK
127.0.0.1:6666> INCR user:1001:age
(integer) 29

# 哈希类型
127.0.0.1:6666> HSET user:1001 profile:email "jason@example.com"
(integer) 1
127.0.0.1:6666> HGETALL user:1001
 1) "profile:email"
 2) "jason@example.com"
 3) "name"
 4) "Jason"
 5) "age"
 6) "29"

# 列表类型
127.0.0.1:6666> LPQ tasks "write report"
OK
127.0.0.1:6666> LPQ tasks "review code"
OK
127.0.0.1:6666> LRANGE tasks 0 -1
 1) "review code"
 2) "write report"

# 过期时间
127.0.0.1:6666> EXPIRE user:1001:name 3600
(integer) 1
```

## 五、架构对比：Redis vs Kvrocks

| 维度 | Redis | Kvrocks |
|------|-------|---------|
| 存储介质 | 纯内存（RDB/AOF 落盘备份） | RocksDB 磁盘存储 |
| 容量 | MB ~ GB 级 | TB 级 |
| 延迟 | 微秒级 | 毫秒级（取决于磁盘） |
| 成本 | 高（内存贵） | 低（磁盘便宜） |
| 复制 | SYNC/PSYNC | 类 MySQL binlog |
| 集群 | Redis Cluster | 自有 Cluster 方案 |
| 客户端 | 所有 Redis 客户端 | 所有 Redis 客户端 |

## 六、适用场景

- **缓存大容量数据**：比如用户会话、排行榜，数据量大但访问频繁
- **消息队列**：利用 List/Set/ZSet 实现队列，容量远超内存 Redis
- **配置中心**：存储大量配置项，不需要毫秒级响应
- **成本敏感场景**：同样的预算，磁盘存储能放的数据量是内存的百倍千倍

## 七、不适合的场景

- 需要微秒级延迟的高频交易
- 依赖 Redis 原子事务（MULTI/EXEC）的复杂业务
- 需要 Lua 脚本的场景（Kvrocks 的 Lua 支持有限）

## 八、生态工具

- **kvrocks-controller**：集群管理工具，支持故障转移、扩缩容
- **kvrocks_exporter**：Prometheus 指标导出器
- **RedisShake**：从 Redis 迁移数据到 Kvrocks
- **kvrocks2redis**：从 Kvrocks 反向同步到 Redis

## 九、一句话总结

Kvrocks 让你用 Redis 的方式，享受磁盘的容量。当你发现 Redis 内存不够用、成本太高时，它是第一候选方案。

---

*来源：https://github.com/apache/kvrocks*
