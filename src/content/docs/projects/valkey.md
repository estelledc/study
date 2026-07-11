---
title: Valkey — Redis 7.2.4 的开源 fork
来源: https://github.com/valkey-io/valkey
日期: 2026-05-29
分类: 数据库 / 缓存
难度: 中级
---

## 是什么

Valkey 是一个**开源的内存键值数据库**，2024 年 3 月由 Linux Foundation 联合 AWS、Google、Oracle 一起从 [[redis]] 7.2.4 fork 出来的。

日常类比：原本免费开放的健身房（Redis）突然改成"会员制"（SSPL + RSALv2 双许可证，云厂商不能直接拿来卖托管服务），原来的常客们集体跑出来，按原来的样子复刻了一个免费版本，挂上"Valkey"的招牌继续营业。

你如果用 Redis 写过这种代码：

```bash
SET user:1001 "alice"
GET user:1001
```

把客户端连接的主机名换成 Valkey，**一行代码不用改**就能跑——这就是它的核心承诺：协议兼容、API 兼容、数据结构兼容。

## 为什么重要

不理解 Valkey 的诞生背景，下面这些事都没法解释：

- 为什么 AWS ElastiCache、GCP Memorystore 这些托管服务在 2024 下半年把默认引擎切到了 Valkey
- 为什么 Redis 还在更新，但云厂商与大量开源用户把注意力转到了 Valkey
- 为什么开源协议变更（BSD → SSPL/RSALv2）会引发整个行业的连锁反应
- 为什么 Linux Foundation 治理的开源项目，比单一公司主导的源码可得项目更受云厂商信任

简单说：**这是 2024 年开源世界最大的一次"集体出走"**，影响每个用 Redis 的后端开发者。

## 核心要点

Valkey 与 [[redis]] 的关系可以拆成 **三层**：

1. **协议层兼容**：用的是 RESP（Redis Serialization Protocol，像双方约定好的"快递单格式"）。客户端库（jedis / lettuce / ioredis / redis-py）连 Valkey 时，**完全感知不到差异**。

2. **数据结构完全继承**：string / hash / list / set / sorted set / stream / bitmap / hyperloglog / geo——Redis 7.2.4 之前定义的所有数据类型，Valkey 全都有，行为一致。

3. **路线图开始分叉**：从 Valkey 8.0（2024-09 GA）起开始走自己的路——优先做**性能优化 + 多线程 IO**；而 Redis 7.4+（SSPL/RSALv2 源码可得，非闭源）优先做**商业模块**（向量搜索、时序、JSON）。

简单说：**短期一样，长期会分家**。

## 实践案例

### 案例 1：装一个跑起来

```bash
docker run -d -p 6379:6379 valkey/valkey:7.2
redis-cli -h localhost -p 6379
> SET hello "world"
OK
> GET hello
"world"
```

注意看：客户端用的是 **`redis-cli`**（Redis 自带的工具）。Valkey 没改协议，所以 Redis 工具直接能用。

### 案例 2：从 Redis 平迁

如果你的 Java 后端原来这样连 Redis：

```java
JedisPool pool = new JedisPool("redis.example.com", 6379);
```

迁到 Valkey **只需要改主机名**：

```java
JedisPool pool = new JedisPool("valkey.example.com", 6379);
```

建议按三步验收：① 改主机名连上；② `SET`/`GET` 读写一条测试键；③ `INFO server` 确认 `redis_version`/`server_name` 指向 Valkey。代码、数据结构、命令都不动。

### 案例 3：Valkey 8.0 的多线程优势

Valkey 8.0 把网络读写从单线程拆给多个 worker。社区/官方基准在高并发场景下常见约 1.5–2× 吞吐提升（视负载与硬件而定，不是硬承诺）：

```bash
# Valkey 8.0 配置
io-threads 4              # 开 4 个 IO 线程处理网络读写
io-threads-do-reads yes   # 读请求也交给 IO 线程，不只写
```

这是 Valkey 第一次走出 Redis 路线图——优先吞吐而不是模块。

## 踩过的坑

1. **Redis Stack 模块在 Valkey 不通用**：RediSearch / RedisJSON / RedisTimeSeries 绑定 Redis Labs 协议，Valkey 用不了；社区有 `valkey-search` / `valkey-json`，但成熟度仍参差。
2. **Redis 7.4+ 的新功能不会同步**：如 hash 字段过期等，Valkey 不一定跟，要看自己的路线图。
3. **客户端版本检测可能踩坑**：有些库用 `INFO server` 检查 Redis 版本，看到 Valkey 输出可能误判；老版本客户端要升级。
4. **三选一困难症**：Redis 7.2.4（旧 BSD）/ Redis 7.4+（SSPL/RSALv2）/ Valkey（BSD）。新项目多数选 Valkey，但要确认依赖模块是否还能用。

## 适用 vs 不适用场景

**适用**：
- 缓存层、会话存储、排行榜、消息队列等 Redis 的所有经典场景
- 云厂商托管的 Redis 服务迁移（AWS ElastiCache / GCP Memorystore 已默认 Valkey）
- 想避开 SSPL/RSALv2 协议风险的开源项目
- 高并发场景需要多线程 IO（Valkey 8.0+）

**不适用**：
- 强依赖 Redis Stack 商业模块（向量搜索、时序、JSON 文档）的项目
- 需要 Redis 7.4+ 新功能（如 hash 字段 TTL）的项目
- 已经买了 Redis Enterprise 商业支持的企业

## 历史小故事（可跳过）

- **2009 年**：意大利程序员 antirez（Salvatore Sanfilippo）创建 Redis，BSD 协议开源，迅速成为缓存层事实标准。
- **2018 年**：Redis Labs 把部分模块改成 Commons Clause 协议，第一次商业化信号。
- **2024-03-20**：Redis 主仓库改 SSPL + RSALv2 双许可证，云厂商不能直接拿来卖托管服务。
- **2024-03-28**：Linux Foundation 联合 AWS、Google、Oracle 宣布 Valkey 成立，从 Redis 7.2.4 fork。
- **2024-04**：Snap、Ericsson、阿里云加入 Valkey 治理。
- **2024-09**：Valkey 8.0 GA，性能优化 + 多线程 IO，正式走自己的路线。

四年从协议变更到生态分家，是开源世界少有的快速反应。

## 学到什么

1. **开源协议不是小事**——一个 BSD → SSPL/RSALv2 的改动，半年内重塑了整个 KV 数据库生态
2. **协议兼容是迁移的最大红利**——Valkey 不发明新协议，让用户"换品牌零成本"
3. **基金会治理 vs 公司治理**——Linux Foundation 让云厂商敢押注（不会突然又改协议）
4. **fork 不是终点**：Valkey 8.0 已开始走自己的路（多线程优先），长期会成为另一个数据库

## 延伸阅读

- 官方仓库：[valkey-io/valkey](https://github.com/valkey-io/valkey)（看 README 和 CHANGELOG，了解最新动向）
- 协议文档：[RESP3 Specification](https://github.com/antirez/RESP3/blob/master/spec.md)（理解 Valkey 和 Redis 共享的通信协议）
- AWS 切 Valkey 的公告：[AWS ElastiCache for Valkey](https://aws.amazon.com/elasticache/valkey/)（云厂商视角）
- Linux Foundation 公告：[Linux Foundation Launches Valkey](https://www.linuxfoundation.org/press/linux-foundation-launches-open-source-valkey-community)
- [[redis]] —— Valkey 的源头，理解 Valkey 必须先理解 Redis 的数据结构和命令

## 关联

- [[redis]] —— Valkey 是 Redis 7.2.4 的 fork，命令、协议、数据结构都继承
- [[dragonfly]] —— 另一条多线程 Redis 兼容路线，可与 Valkey 8.0 对照
- [[memcached]] —— 更早的内存缓存，理解 Valkey/Redis 为何后来居上
- [[timescaledb]] —— 时序场景若不用 RedisTimeSeries，可看关系库扩展路线
- [[sqlite]] —— 嵌入式持久化对照：Valkey 主打内存，SQLite 主打本地文件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dragonfly]] —— Dragonfly — 多线程 Redis 替代
- [[redis]] —— Redis — 内存键值数据库
- [[timescaledb]] —— TimescaleDB — PostgreSQL 时序扩展
