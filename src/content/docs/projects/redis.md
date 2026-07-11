---
title: Redis — 内存键值数据库
来源: https://github.com/redis/redis
日期: 2026-05-29
分类: 数据库 / 缓存
难度: 中级
---

## 是什么

Redis（**Re**mote **Di**ctionary **S**erver）是 Salvatore Sanfilippo 2009 年用 C 写的"内存里的字典"——把所有数据全放 RAM，所以读写都是微秒级；服务器重启时再从硬盘文件恢复。

日常类比：

- [[postgresql]] 像图书馆按编号查书——慢但精确，断电也不丢
- Redis 像桌上一摞便签——伸手即查、即写即改，下班前抄一份带回家备份

你写：

```
SET user:1 "Alice"
GET user:1
```

服务端返回 `"Alice"`，整个往返通常在 0.1 毫秒内完成。Redis 快不是算法神奇，而是**根本没去碰硬盘**。

## 为什么重要

不理解 Redis，下面这些场景都没法解释：

- 为什么 GitHub / Twitter / Stack Overflow / Pinterest 这些大流量站，几乎都把 Redis 放在数据库前面挡读请求
- 为什么 5 种数据结构（string / hash / list / set / sorted set）能覆盖 90% 的缓存、计数、排行、消息场景
- 为什么 Pub/Sub + Stream 让"消息队列"这件事可以不用 Kafka 也能跑
- 为什么 Lua 脚本能在 Redis 内部"原子执行"——多步操作之间没人插得进来

## 核心要点

Redis 之所以是 Redis，靠 **三个核心设计**：

1. **单线程命令循环**：请求处理的主路径是一根线程跑事件循环——没有锁竞争、没有上下文切换；用 epoll（Linux）盯上百万连接，每次只挑就绪的处理。**Redis 6+** 可另开 I/O 线程做网络读写，但**命令执行仍是单线程**，大 key / 慢命令照样会堵住所有人。

2. **持久化双轨制**：
   - **RDB**：按时间间隔拍一张内存快照，写到 `dump.rdb`；恢复快、文件小，但两次快照之间宕机会丢数据
   - **AOF**：把每条写命令追加到日志文件；恢复慢、文件大，但能精确到秒级甚至每条
   - 生产通常两个都开

3. **集群分片**：Redis Cluster 把 key 哈希到 **16384 个 slot**，slot 分配给不同节点。客户端算完 hash 直接连对应节点，没有中间代理。

## 实践案例

### 案例 1：缓存（最经典用法）

```
SET user:1 "{name: Alice, age: 30}"
EXPIRE user:1 3600
GET user:1
```

跟做路径：

1. **命中**：应用先 `GET`，有值就直接返回
2. **未命中**：查关系库 → `SET` + `EXPIRE` 回填 → 再返回

这套叫 **cache-aside**，几乎是行业默认。`EXPIRE` 让 key 一小时后自动消失，避免缓存堆积。

### 案例 2：排行榜（sorted set 的招牌场景）

```
ZADD leaderboard 100 alice
ZADD leaderboard 200 bob
ZADD leaderboard 150 carol
ZREVRANGE leaderboard 0 9 WITHSCORES
```

sorted set 内部是 skiplist + hash，插入和查询都是 O(log N)；游戏、电商秒杀榜单都用它。最后那行 `ZREVRANGE` 拿前 10 名，`WITHSCORES` 把分数和名字一起带回。

### 案例 3：分布式锁

```
SET lock:order123 "uuid-abc" NX EX 10
# 释放（须校验 value，常用 Lua 一把做完）：
# if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end
```

- `NX` = 只在 key 不存在时才设
- `EX 10` = 10 秒后自动过期（防止持锁进程崩了死锁）
- value 写唯一 uuid；**释放必须先比对再 DEL**，避免误删别人的锁

这是单实例最简方案；强一致场景要看 Redlock 或 etcd / ZooKeeper。

## 踩过的坑

1. **大 key 阻塞单线程**：一个 hash 几十万字段，`HGETALL` 一下整个进程被它独占几百毫秒，所有请求排队。教训：拆分大 key、用 `HSCAN` 流式读。

2. **OOM 后内存策略选错**：`maxmemory-policy` 默认 `noeviction`——写满直接拒绝写入，应用全报错。生产几乎必改成 `allkeys-lru`（最近最少用淘汰）或 `volatile-lru`。

3. **集群跨 slot 事务做不了**：Redis Cluster 下，`MULTI / EXEC` 里的 key 必须落在同一个 slot。要让两个 key 同 slot，得用 hashtag：`{user1}:profile` 和 `{user1}:orders` 都按 `user1` 算 hash。

4. **许可证改了**：Redis 7.4（2024-03）起改为 **RSALv2 / SSPLv1 双许可**（二者都不是 OSI 认证开源）。Linux 基金会同年 fork 出 [[valkey]] 接续 BSD 路线，AWS / Google / Oracle 都加入了。生产选型现在多一道题：用 Redis Inc. 还是 Valkey。

## 适用 vs 不适用场景

**适用**：

- 缓存层（cache-aside / read-through / write-back）
- 计数器、限流（`INCR` 原子自增 + `EXPIRE` 滑动窗口）
- 排行榜（sorted set）/ 简单消息队列（list / Stream）/ 分布式锁、会话存储、临时去重（set）

**不适用**：

- 主数据存储——内存贵，且持久化不如关系数据库强
- 复杂查询、JOIN——没有 SQL，Redis 是 KV 模型
- 海量冷数据——内存装不下，强行装也很贵
- 强事务一致性（金融转账）——AOF 能恢复，但故障切换时仍可能丢秒级数据

## 历史小故事（可跳过）

- **2009 年**：意大利人 antirez（Salvatore Sanfilippo）做实时分析工具时嫌 MySQL 慢，自己用 C 写了 Redis 第一版
- **2010 年**：VMware 看上他，把他雇下来全职维护
- **2015 年**：Redis Labs（现 Redis Inc.）成立，商业化路线启动
- **2020 年**：antirez 宣布退出核心维护
- **2024 年 3 月**：Redis Inc. 把源码许可改为 RSALv2 / SSPLv1 双许可（均非 OSI 开源），Linux 基金会接手社区诉求，fork 出 Valkey 继续 BSD 路线

## 学到什么

- **简单 + 单线程**也能扛百万 QPS——架构常被高估、实现质量常被低估
- **数据结构**不是大学课题，是产品差异——5 种结构让 Redis 在缓存外又吃下队列、排行、限流
- **持久化是工程权衡 + 开源不是终点**——RDB 快但糙、AOF 慢但准生产同时开；许可证可以变、社区可以 fork，技术栈选型要把"治理"算进去

## 延伸阅读

- 官方教程：[redis.io/learn](https://redis.io/learn/)
- 源码精读起点：`server.c` 里的 `aeMain()`（事件循环主函数，约 80 行能看懂大局）
- antirez 个人博客：[antirez.com](http://antirez.com/)（设计哲学和复盘文章很值得读）
- 持久化原理：官方文档 `topics/persistence`（RDB / AOF 的 fsync 时机权衡）

## 关联

- [[postgresql]] —— Redis 通常坐在 PostgreSQL 前面挡读流量，一个稳一个快
- [[valkey]] —— 2024 年 fork 出来的 BSD 版 Redis

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成；审计时裁剪过长列表以过 quality-gate -->

- [[asynq]] —— Asynq — Go 版 Sidekiq，把后台任务丢进 Redis 慢慢跑
- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[celery]] —— Celery — Python 把慢任务搬到后台干的工头
- [[dragonfly]] —— Dragonfly — 多线程 Redis 替代
- [[etcd]] —— etcd — 分布式键值数据库
- [[kafka]] —— Apache Kafka — 分布式流处理平台
- [[memcached]] —— Memcached — 经典内存缓存
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[sidekiq]] —— Sidekiq — Ruby 后台任务的事实标准
- [[skip-list-1990]] —— Skip List — 用抛硬币代替平衡树
- [[unstorage]] —— unstorage — 让 KV 存储不绑死运行时的统一抽象层
- [[valkey]] —— Valkey — Redis 7.4 的开源 fork

