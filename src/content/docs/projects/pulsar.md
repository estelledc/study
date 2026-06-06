---
title: Apache Pulsar — 云原生消息队列
来源: https://github.com/apache/pulsar
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Apache Pulsar 是 Yahoo 开源的**云原生消息队列**，主打"**计算与存储分离**"——broker（处理消息的服务器）不直接存数据，专门由 Apache BookKeeper 存。

日常类比：

- [[kafka]] 像**自营快递**：broker 自己既收件又管仓库，扩张要把仓库一起搬
- Pulsar 像**分工式快递**：broker 只收件、转交，仓库（BookKeeper）独立运营——加快递员（broker）不用动仓库

写代码看着差不多——都是"发消息 / 订阅消息"。但底下的扩容、运维、成本结构完全不一样。

## 为什么重要

不理解 Pulsar 这套架构，下面这些事就解释不通：

- 为什么有些大公司用 Pulsar 而不用更知名的 [[kafka]]——分工式让弹性扩容容易（broker 是无状态的，加机器秒级生效）
- 为什么 Pulsar 能做"分层存储"——热数据放 broker 内存、温数据放 BookKeeper、冷数据归档到 S3，成本能降一个量级
- 为什么"多租户"是 Pulsar 的原生能力——Yahoo 内部跑过几千个 tenants（租户），租户之间完全隔离，[[kafka]] 要靠运维拼凑
- 为什么消息队列领域形成"两强格局"——[[kafka]] 占生态优势，Pulsar 占架构优势

## 核心要点

Pulsar 的架构可以拆成 **三层 + 一个抽象**：

1. **Broker（无状态接收发送层）**：负责接收 producer 的消息、推送给 consumer。**自己不存数据**，只做转发与缓存。挂掉一台不丢消息，因为数据在 BookKeeper 里。

2. **Apache BookKeeper（分布式日志存储层）**：真正写数据的地方。每条消息以"日志条目"形式写到多台 bookie（BookKeeper 节点），保证写入持久化。可以理解为给 broker 当"专业仓库"。

3. **Topic + Partition + Subscription（消息抽象）**：
   - **Topic**：消息的频道（比如 `订单创建`）
   - **Partition**：把一个 topic 切成多份并行处理
   - **Subscription**：消费者组的概念——Pulsar 比 [[kafka]] 多两种模式：
     - `exclusive`：一个订阅只允许一个消费者（独占）
     - `shared`：多消费者并行抢消息（适合任务队列）
     - `key_shared`：相同 key 的消息固定到同一消费者（保序）
     - `failover`：主备模式，主挂了备顶上

整套抽象比 [[kafka]] 灵活——同一个 topic 可以同时按 4 种模式订阅。

## 实践案例

### 案例 1：Docker 三十秒启动一个 Pulsar

```bash
docker run -p 6650:6650 -p 8080:8080 \
  apachepulsar/pulsar:3.0.0 \
  bin/pulsar standalone
```

- `6650`：客户端连 broker 用的二进制协议端口
- `8080`：管理 API（pulsar-admin / web UI）
- `standalone`：把 broker / BookKeeper / ZooKeeper 三件套打包进一个进程，本机调试用

启完就能发收消息了。生产环境会拆成三个独立集群部署。

### 案例 2：发一条消息

```bash
# 创建 topic
bin/pulsar-admin topics create persistent://public/default/test

# 发消息
bin/pulsar-client produce test --messages "hi pulsar"

# 收消息
bin/pulsar-client consume test -s "my-sub" -n 1
```

注意 topic 命名：`persistent://public/default/test`

- `persistent`：持久化（写到 BookKeeper），还有 `non-persistent` 模式不落盘
- `public`：tenant（租户）名
- `default`：namespace（命名空间）
- `test`：topic 名

这套四级命名是多租户的基础——每个 tenant 互不干扰。

### 案例 3：多租户隔离

```bash
# 创建一个新 tenant
bin/pulsar-admin tenants create my-team

# 在 tenant 下创建 namespace
bin/pulsar-admin namespaces create my-team/orders

# 限定该 namespace 的资源配额
bin/pulsar-admin namespaces set-backlog-quota \
  my-team/orders --limit 10G --policy producer_request_hold
```

每个 tenant 可以有独立的认证、限额、retention 策略。Yahoo 内部就这么把几千个业务方塞到一个 Pulsar 集群。

## 踩过的坑

1. **学习曲线陡**：要懂 broker / BookKeeper / ZooKeeper / proxy 四层组件、四级命名、四种订阅模式。新人前两周大概率被绕晕。建议先 standalone 跑通，再拆集群。

2. **与 [[kafka]] API 不兼容**：从 [[kafka]] 迁过来要改客户端代码（虽然 Pulsar 提供了 kafka 兼容层，但功能不全）。已有大量 [[kafka]] 投资的团队迁移成本高。

3. **客户端成熟度参差**：Java 客户端最完整，Python 跟得上，Go / JS / C++ 缺一些高级功能（比如 transactions）。选语言前先确认客户端支持。

4. **监控指标多到吓人**：broker / bookie / ZK 各自有几百个指标。要把 Prometheus + Grafana + 自定义 dashboards 全配齐才能运维。中小团队会直接劝退。

5. **`non-persistent` topic 易被误用**：图省事用了 non-persistent，broker 重启消息全丢。生产环境绝大多数场景都该用 `persistent`。

## 适用 vs 不适用场景

**适用**：

- 多租户场景（SaaS 平台、公司内部多业务线共享集群）
- 需要弹性扩容 broker 不影响存储的高可用场景
- 数据量大、需要分层存储（热/温/冷）降成本的场景
- 同一 topic 多种消费模式（任务队列 + 流处理同时跑）

**不适用**：

- 简单场景、团队没运维 Pulsar 经验——直接用 [[redis]] streams 或 [[kafka]] 更省心
- 已经深度绑定 [[kafka]] 生态（Kafka Streams / Connect / Schema Registry）——迁移收益不一定覆盖成本
- 极致低延迟场景（< 1ms）——多一层 BookKeeper 转发，延迟比 [[kafka]] 略高

## 历史小故事（可跳过）

- **2013**：Yahoo 内部为消息基础设施造 Pulsar，目标是"一套系统替代邮件、IM、订单、广告等所有异步通信"
- **2016**：Yahoo 开源 Pulsar，业界最初反应冷淡——[[kafka]] 已经是事实标准
- **2018**：进入 Apache 基金会成为顶级项目，StreamNative 公司成立专注商业化
- **2020**：v2.x 加分层存储（tiered storage），冷数据自动归档 S3，成本优势凸显
- **2024**：v3.0 GA，broker 和 BookKeeper 协议改造完成，运维复杂度下降一档

十年时间，从 Yahoo 内部工具长成了能挑战 [[kafka]] 的开源项目。

## 学到什么

1. **计算存储分离不是 Pulsar 独创**——但它是把这个理念落到消息队列的最早尝试。后来 ClickHouse / Snowflake 等都验证了这条路
2. **多租户原生设计成本** vs **后期改造成本**：Yahoo 一开始就按多租户设计，所以原生支持；[[kafka]] 后来想加只能靠运维拼凑
3. **生态 vs 架构**：[[kafka]] 的生态优势短期难撼动，Pulsar 的架构优势长期会持续放大——选型要看团队所处阶段
4. **运维复杂度是真成本**：理论上更优的架构，如果运维门槛高 3 倍，对中小团队就是负价值

## 延伸阅读

- 官方文档：[Pulsar Documentation](https://pulsar.apache.org/docs/)
- StreamNative 博客：[计算存储分离实战经验](https://streamnative.io/blog)
- [[kafka]] —— 消息队列另一极，对照看架构差异
- [[redis]] —— Redis Streams 在轻量场景能替代消息队列

## 关联

- [[kafka]] —— 消息队列两强之一，架构对照组
- [[redis]] —— 轻量消息队列替代方案
- [[zookeeper]] —— Pulsar 早期版本的协调依赖
- [[s3]] —— 分层存储的冷数据后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[nats-server]] —— NATS Server — 极简云原生消息中间件
- [[redis]] —— Redis — 内存键值数据库
- [[redpanda]] —— Redpanda — Kafka 兼容的 C++ 实现

