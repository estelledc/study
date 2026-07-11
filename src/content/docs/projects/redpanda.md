---
title: Redpanda — Kafka 兼容的 C++ 实现
来源: https://github.com/redpanda-data/redpanda
日期: 2026-06-01
分类: 数据库 / 消息队列
难度: 中级
---

## 是什么

Redpanda 是一个**用 C++20 写的、Kafka 协议二进制兼容、单二进制部署、不需要 JVM 也不需要 ZooKeeper** 的分布式流处理平台。Kafka 客户端直接连过来不用改一行代码。

日常类比：**Kafka 像一栋老式公寓楼**——有保安亭（ZooKeeper）守着大门、楼里多人值班室（JVM 多线程争锁 + 不定时 GC 暂停）。**Redpanda 把保安亭拆了，把值班室改成每个 CPU 核独占一间小屋**（thread-per-core）——核之间互不串门，没有锁竞争，更没有 GC 卡顿。

最简单的体验：

```bash
# 一行起一个 broker
rpk container start -n 1

# 用 Kafka 客户端连过去（kafkacat 完全不知道对面是 Redpanda）
kafkacat -b localhost:9092 -t demo -P
```

这种**协议兼容 + 实现重写**的取向，让 Redpanda 在 Kafka 主导十年的市场里硬生生切出一块。

## 为什么重要

不理解 Redpanda 的设计，下面这些事都没法解释：

- 为什么 Kafka 协议这么坚固——脱离 Java 重写一遍，整个客户端 / Connect / Schema Registry 生态都能直接用
- 为什么金融行情、广告竞价这些场景越来越多换掉 Kafka——P99 没有 JVM GC 抖动，社区/官方基准常见数倍到约一个数量级（视负载而定）
- 为什么 Redpanda / WarpStream 这类重写派多用 **Raft** 做复制，而 Pulsar 另走 BookKeeper——都在替代 Kafka 原创的 ISR + Controller 模型
- 为什么 thread-per-core 这个十年前的小众范式（Seastar / ScyllaDB）正在成为低延迟服务端的默认选择

简单说：**Redpanda 证明了 Kafka 协议是 de facto 标准但 Kafka 实现并不是**——用现代 C++ 范式可以做得更快、更简单、更省运维。

## 核心要点

Redpanda 的架构可以拆成 **三个关键技术** 加 **一个生态选择**：

1. **Seastar shard-per-core**：每个 CPU 核固定跑一个线程，独占自己的那块内存和 IO 队列。跨核要交换数据走显式消息传递。**无锁、无伪共享、cache 命中率高**——这是 ScyllaDB 用过的同一套框架。

2. **Raft 复制**：每个 partition 就是一个独立的 Raft group，leader 通过追加日志同步给 follower。**这一套替换掉 Kafka 的 ISR + Controller + ZK 三层协调**，故障切换更可预测。

3. **io_uring**：Linux 现代异步 IO 接口，避免传统 read/write 系统调用反复进出内核的上下文切换开销，配合 thread-per-core 把 IO 密集型工作压到极致。

4. **Kafka 协议兼容**：TCP wire protocol 字节级兼容，**Kafka 客户端 / Kafka Connect / Schema Registry 完全不用改**。这是它撬动 Kafka 生态的根本支点。

简单说：**实现层全部重写换性能，协议层一字不改吃生态**。

## 实践案例

### 案例 1：本地起一个集群

```bash
# rpk 是 Redpanda 官方 CLI，类似 Kafka 的 kafka-topics.sh 但命令更顺手
rpk container start -n 3       # 起 3 节点本地集群（Docker）
rpk topic create demo --partitions 3 --replicas 3
rpk cluster status             # 看 brokers / partitions / leadership
```

**整个集群一个二进制 + 一个 CLI**：没有 ZooKeeper，也没有单独的 KRaft 进程；元数据仍由内置 controller Raft group 管，只是不用再额外部署协调组件。

### 案例 2：Kafka 客户端无感接入

```python
# 标准 confluent-kafka 库，bootstrap 指 9092 就行
from confluent_kafka import Producer
p = Producer({'bootstrap.servers': 'localhost:9092'})
p.produce('demo', key='k1', value='hello redpanda')
p.flush()
```

**这段代码完全不知道对面是 Redpanda**——这就是协议兼容的含义。同一份代码切换 Kafka / Redpanda 只改一行 bootstrap。

### 案例 3：查看 Raft 状态

```bash
rpk cluster partitions list demo
# 输出每个 partition 的 leader、replicas、Raft term
```

每条 partition 都有自己独立的 Raft group——**partition 数多的集群相当于在跑成千上万个并行 Raft**，调度全靠 Seastar 的 shard-per-core 把它们均匀压到各核上。

## 踩过的坑

1. **BSL 许可证**（Business Source License）：源码可读，但**云服务商 4 年内不能直接转售托管 Redpanda**。AWS / GCP 的托管版本只能由 Redpanda Cloud 自己提供。需要纯 Apache 2.0 的场景请绕开。

2. **Seastar 默认吃光全部内存**：启动后会 mmap 大块内存做 hugepage 优化。**生产环境必须显式设 `--memory` 限制**，否则跟其他进程混部会 OOM。

3. **Raft 对 fsync 极敏感**：每次日志追加都要真正落盘，**机械盘上吞吐直接崩塌**。生产部署只考虑 NVMe SSD，且要关掉 SSD 的写缓存或确认带断电保护。

4. **WASM Data Transforms 还很新**：v23 才引入，类似 Kafka Connect 的轻量替代，但**生态比 Kafka Connect 数百个连接器差太远**。需要丰富 source/sink 时反而要用 Kafka Connect 反向连进 Redpanda（协议兼容这点救场）。

5. **rpk 才是一等公民**：协议兼容下不少 `kafka-topics.sh` 等工具也能连上，但覆盖与报错体验不如官方 CLI。**生产排障与集群管理优先用 rpk**，不要默认 Kafka 脚本行为一致。

6. **集群规模上限不如 Kafka 验证充分**：metadata 跑在内置 controller raft group，**单集群超过几百节点的实战案例少**。超大规模仍是 Kafka KRaft 的主场。

## 适用 vs 不适用场景

**适用**：

- **P99 延迟敏感**的实时管道：金融行情、广告竞价、游戏匹配——没有 JVM GC 抖动
- 想用 Kafka 客户端但**不想运维 JVM + ZK** 的中小团队
- 边缘 / IoT 场景：**单二进制 + 内存可控**，部署简单
- 想验证 Kafka 协议兼容性的对照实验环境

**不适用**：

- 重度依赖 Kafka **Streams DSL** 或大量 Kafka Connect 插件的存量系统——迁移工作量大
- 已稳定运行 Kafka KRaft 的大厂——迁移收益不抵风险
- 严格要求 **Apache 2.0 / MIT 等纯 OSS 许可证**的发行版（BSL 不算）
- 单集群节点数预期破千的超大规模

## 历史小故事（可跳过）

- **2017 年**：Alexander Gallego（Akamai 出身）创立 Vectorized，立志重写 Kafka
- **2019 年**：内部首版完成，命名 Redpanda
- **2020 年 8 月**：BSL 许可证下开源，完成 Series A
- **2022 年**：公司更名 Redpanda Data，Series C 估值约 10 亿美元
- **2023 年**：v23 引入 WASM Data Transforms，broker 内执行轻量转换
- **2024-2025 年**：GitHub 接近 10k 星，Anaplan / Vodafone / NetApp 等生产采用

## 学到什么

1. **协议是标准，实现可换**——Kafka 协议成为 de facto 标准，谁重写实现都能直接吃整个生态。这是开源协议兼容生态的复利
2. **thread-per-core 是新默认**——Scylla / Redpanda / ClickHouse 部分模块都在用，未来低延迟服务端这个范式会更常见
3. **Raft / BookKeeper 替代 ISR**——Redpanda 等选 Raft 做 partition 复制，Pulsar 选 BookKeeper；殊途同归是换掉 Kafka 原创的 ISR + Controller 模型
4. **BSL 是商业开源新折中**——源码可读、4 年后转 Apache、限制云转售。这种许可证在 MongoDB / Elastic / CockroachDB 之后越来越普遍

## 延伸阅读

- 官方文档：[Redpanda Docs](https://docs.redpanda.com/)（架构章节把 thread-per-core 讲得清楚）
- 设计博客：[Redpanda Engineering Blog](https://redpanda.com/blog)（Seastar / Raft / 性能对比文章很多）
- Jepsen 测试报告：[Redpanda 21.11.19 by Kyle Kingsbury](https://jepsen.io/analyses/redpanda-21.11.19)（独立第三方分布式正确性审计）
- 视频：[Redpanda Talk by Alex Gallego](https://www.youtube.com/results?search_query=redpanda+alex+gallego)（创始人讲架构选型）

## 关联

- [[kafka]] —— 协议与生态对照组，Redpanda 协议兼容、实现重写
- [[pulsar]] —— 同代消息系统，分层存储 + 多组件路线 vs Redpanda 单体路线
- [[nsq]] —— 极简轻量路线，与 Redpanda 重型高性能路线形成对照
- [[etcd]] —— Raft 的另一个广泛使用者，证明 Raft 已是分布式复制的默认选择
- [[clickhouse]] —— 同样大量使用 thread-per-core 思想的现代 C++ 数据系统

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[etcd]] —— etcd — 分布式键值数据库
- [[nsq]] —— NSQ — Go 写的去中心化消息队列
- [[pulsar]] —— Apache Pulsar — 云原生消息队列

