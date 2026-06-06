---
title: Redis — 内存键值数据库
来源: https://github.com/redis/redis
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
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

1. **单线程事件循环**：一个进程一根线程处理所有请求。听起来弱，实际超强——没有锁竞争、没有上下文切换；用 epoll（Linux）一次性盯上百万连接，每次只挑就绪的处理。

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

应用先查 Redis，命中就返回；没命中再查关系库，结果回填 Redis。这套模式叫 **cache-aside**，几乎是行业默认。`EXPIRE` 让 key 一小时后自动消失，避免缓存堆积。

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
```

- `NX` = 只在 key 不存在时才设
- `EX 10` = 10 秒后自动过期（防止持锁进程崩了死锁）
- value 写一个唯一 uuid，释放时校验自己才删，避免删到别人的锁

这是单实例最简单的方案；强一致场景要看 Redlock 或 etcd / zookeeper。

## 踩过的坑

1. **大 key 阻塞单线程**：一个 hash 几十万字段，`HGETALL` 一下整个进程被它独占几百毫秒，所有请求排队。教训：拆分大 key、用 `HSCAN` 流式读。

2. **OOM 后内存策略选错**：`maxmemory-policy` 默认 `noeviction`——写满直接拒绝写入，应用全报错。生产几乎必改成 `allkeys-lru`（最近最少用淘汰）或 `volatile-lru`。

3. **集群跨 slot 事务做不了**：Redis Cluster 下，`MULTI / EXEC` 里的 key 必须落在同一个 slot。要让两个 key 同 slot，得用 hashtag：`{user1}:profile` 和 `{user1}:orders` 都按 `user1` 算 hash。

4. **许可证改了**：Redis 7.4 起改成 SSPL（不再 OSI 认证开源）。Linux 基金会 2024 年 fork 出 [[valkey]] 接续 BSD 路线，AWS / Google / Oracle 都加入了。生产选型现在多一道题：用 Redis Inc. 还是 Valkey。

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
- **2024 年 3 月**：Redis Inc. 把许可证改成 SSPL（不再算 OSI 开源），Linux 基金会接手社区诉求，fork 出 Valkey 继续 BSD 路线

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

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[arangodb]] —— ArangoDB — 文档+图+KV 三合一的多模型数据库
- [[asynq]] —— Asynq — Go 版 Sidekiq，把后台任务丢进 Redis 慢慢跑
- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[celery]] —— Celery — Python 把慢任务搬到后台干的工头
- [[centrifugo]] —— Centrifugo — Go 写的开源实时消息服务器
- [[chatwoot]] —— chatwoot — 把 11 种外部聊天渠道归一到同一张消息表
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[couchdb]] —— Apache CouchDB — Erlang 写的文档数据库
- [[cvat]] —— CVAT — 视频帧标注与半自动追踪的开源王者
- [[docker]] —— Docker — 容器化平台
- [[dovecot]] —— Dovecot — 主流 IMAP/POP3 服务器
- [[dragonfly]] —— Dragonfly — 多线程 Redis 替代
- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[emqx]] —— EMQX — 单集群千万连接的 MQTT 物联网消息总线
- [[etcd]] —— etcd — 分布式键值数据库
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[feast]] —— Feast — 让训练和上线用同一份特征定义的开源 Feature Store
- [[ferretdb]] —— FerretDB — 用 PostgreSQL 当后端的开源 MongoDB 协议代理
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[gin]] —— Gin — Go 写 web API 的事实标准框架
- [[go-zero]] —— go-zero — 一份契约文件生成整套 Go 微服务
- [[haproxy]] —— HAProxy — 高性能 LB，TCP/HTTP 双层负载均衡
- [[immich]] —— Immich — 把家庭照片从别人的云里救回自己机器
- [[inngest]] —— Inngest — 让 async 函数自动从断点恢复的工作流引擎
- [[kafka]] —— Apache Kafka — 分布式流处理平台
- [[kong]] —— Kong — 基于 nginx + Lua 的云原生 API 网关
- [[langchain]] —— LangChain — LLM 应用开发框架
- [[laravel]] —— Laravel — 现代 PHP 全栈框架，Eloquent + Blade + Artisan 三件套
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[lmdb]] —— LMDB — 闪电内存映射嵌入式 KV 库
- [[memcached]] —— Memcached — 经典内存缓存
- [[memgraph]] —— Memgraph — 内存图数据库
- [[minio]] —— MinIO — S3 兼容对象存储
- [[mongo]] —— MongoDB — 文档数据库服务端开源实现
- [[mongodb]] —— MongoDB — 文档型 NoSQL 数据库
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[nats]] —— NATS — 极简云原生消息系统
- [[nats-server]] —— NATS Server — 极简云原生消息中间件
- [[nebula]] —— NebulaGraph — 国产分布式图数据库
- [[neo4j]] —— Neo4j — 主流图数据库
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[nsq]] —— NSQ — Go 写的去中心化消息队列
- [[penpot]] —— Penpot — 开源自托管的 Figma 替代
- [[postfix]] —— Postfix — 把 sendmail 拆成一群最小权限的小工
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[prom-client]] —— prom-client — Node 服务暴露监控指标的事实标准 SDK
- [[pulsar]] —— Apache Pulsar — 云原生消息队列
- [[rabbitmq-server]] —— RabbitMQ — 用 Erlang 写的多协议消息总线
- [[rails]] —— Ruby on Rails — 约定大于配置的全栈 Web 框架教科书
- [[sidekiq]] —— Sidekiq — Ruby 后台任务的事实标准
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
- [[skip-list-1990]] —— Skip List — 用抛硬币代替平衡树
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
- [[soketi]] —— Soketi — 自己跑一台 Pusher，把实时通信费砍到零头
- [[surrealdb]] —— SurrealDB — 一种语法吃下 SQL 图 文档 向量
- [[synapse]] —— Synapse — Matrix 协议的参考 homeserver，让聊天像电邮一样能跨服务器互通
- [[timescaledb]] —— TimescaleDB — PostgreSQL 时序扩展
- [[token-bucket-stripe]] —— Stripe Rate Limiters — 工业级令牌桶长什么样
- [[tyk]] —— tyk — Go 实现的开源 API 网关，自带门户和多协议转换
- [[typesense]] —— Typesense — 高性能搜索引擎
- [[unstorage]] —— unstorage — 让 KV 存储不绑死运行时的统一抽象层
- [[valkey]] —— Valkey — Redis 7.4 的开源 fork

