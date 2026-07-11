---
title: Apache ZooKeeper — 给一群机器装一个共同的小脑
来源: Apache ZooKeeper Documentation, https://zookeeper.apache.org/doc/current/
日期: 2026-06-01
分类: 分布式协调服务
难度: 中级
---

## 是什么

Apache ZooKeeper 是一套**让一群机器在关键事情上保持口径一致**的协调服务。

日常类比：像一个**剧组场记**——50 个演员同时拍戏，谁演主角、当前场号是几、哪个镜头已开拍，全部记在场记板上；任何人想知道当前状态，看场记一眼即可；任何人想改状态，必须先举手让场记同意。ZooKeeper 就是分布式系统里那块『所有人都信』的场记板。

它不是数据库，不是消息队列。它存的是『谁是主』『谁还活着』『当前配置是什么』这类**少量但关键、所有节点必须共识**的元数据。

一个反向定义可能更直观：如果你在分布式系统里发现自己想写『好像需要一个全局变量但又不能放在某一台机器上，因为那台挂了大家都瞎了』——这就是 ZooKeeper 的用武之地。

## 为什么重要

不理解 ZooKeeper，下面这些事都说不清：

- 为什么 Kafka 在 3.x 之前必须配一套 ZK 才能跑——broker 谁是 controller、topic 元数据存在哪，全靠它
- 为什么 HBase / Hadoop YARN / Solr / Dubbo 这些『大数据时代基建』全都把 ZK 当底座
- 为什么 etcd / Consul / Kafka KRaft 这些后继者出现时大家会立刻关注——它们是奔着替代 ZK 来的
- 为什么聊『分布式锁』『leader 选举』时，工业界第一反应是 ZK 而不是 Paxos 论文
- 为什么读分布式系统论文时『Wait-free coordination』『顺序一致性』这些词反复出现——ZK 把它们写进了一代基建工程师的肌肉记忆

## 核心要点

ZooKeeper 的世界由四件事拼起来：

1. **数据模型 znode 树**：像一个微型文件系统，路径长这样 `/services/kafka/broker-1`，每个节点叫 znode，可存少量数据（建议 < 1MB）。**它不是文件系统，是树形 KV**——既能像目录一样组织层级，又像 KV 一样按路径直接读写。
2. **三种 znode**：
   - **持久节点**：你不删它就一直在，重启集群也还在
   - **临时节点**（ephemeral）：客户端 session 断了自动消失——这是『感知谁还活着』的关键。临时节点不能有子节点，因为它命运随 session
   - **顺序节点**（sequential）：创建时 ZK 自动加 10 位单调递增编号，比如 `lock-0000000017`。两种属性可以叠加，最常用的是『临时 + 顺序』
3. **Watch 机制**：客户端在某个 znode 上注册 watch，节点变化（数据改 / 子节点增删 / 节点本身被删）时**触发一次回调**。注意是**一次性**——触发后必须重新注册，否则漏事件。这是 ZK 区别于 etcd 长连接 watch 的关键差异点。
4. **ZAB 协议**：ZooKeeper Atomic Broadcast，是 ZK 内部用来『让多台机器写入顺序完全一致』的共识协议。类似 Paxos 但专为『主备复制 + 顺序广播』场景做了简化，比通用 Paxos 容易实现和理解。所有写入由 leader 串行编号广播给 follower，过半 ack 后 commit。

部署形态固定：**奇数节点集群**（3 / 5 / 7），多数派存活即可服务。`2N+1` 节点容忍 `N` 台故障。读吞吐随节点数线性扩展（任意 follower 都可读），写需要过半确认（瓶颈在 leader）。一致性保证有五条：**顺序一致、原子性、单一系统镜像、可靠性、有界实时性**——理解这五条边界比死记 API 重要。

## 实践案例

### 案例 1：leader 选举（ZK 最经典的用法）

3 台 broker 都想当 controller，谁来决定？

```
所有候选者各自创建顺序临时 znode：
  /controller/candidate-0000000001  （broker A）
  /controller/candidate-0000000002  （broker B）
  /controller/candidate-0000000003  （broker C）
编号最小者为 leader，即 broker A。
A 挂了 → session 断 → 它的 znode 自动消失 → B 编号最小 → B 自动接任。
```

整个过程**没有任何中心仲裁者**，全靠 ZK 的『顺序 + 临时』两个属性自动出结果。Kafka 0.x-2.x、HBase Master、YARN ResourceManager HA 全用这一套。

### 案例 2：分布式锁

10 个进程同时想改一份文件，怎么排队？

```
每个进程在 /lock 下创建顺序临时节点。
查看 /lock 下所有节点，自己编号是不是最小？
  是 → 拿到锁，干活，干完删自己的节点
  否 → watch 紧邻自己前一个节点，等它消失再轮到自己
```

为什么不让所有人都 watch 最小节点？那叫**羊群效应**——前一个释放锁，1000 个客户端同时被唤醒抢，浪费。watch 紧邻前序节点是公认的正确姿势。

### 案例 3：配置中心 + 服务发现

配置下发三步：

```
1. 运维把 db-url 写到 /config/db-url
2. 每个应用启动时 getData + 注册 watch
3. 运维改 znode → 所有应用收到一次性回调 → 刷配置并重新注册 watch
```

服务发现复用同一套：实例启动时在 `/services/order-svc/` 下建临时节点，写入 IP:port；客户端 list 子节点拿活实例，watch 感知上下线。**临时节点 + 子节点 watch** 是 2010–2020 微服务注册中心的事实模板。生产里这些配方多用 Apache Curator 封装，少直接裸调 ZK 客户端。

## 踩过的坑

1. **watch 是一次性的**：触发后不会自动续订，回调里必须重新调用 `getData(..., watch=true)` 重新注册。新人写出『以为订阅了所有变化』的代码很常见。

2. **session 过期 ≠ 连接断开**：网络抖一下 ZK 客户端会自动重连，session 还在，临时节点不删；但如果断开超过 session timeout（默认 30 秒），session 过期，**所有该 client 的临时节点立即被删**——下游可能误以为服务下线。两者要分别处理。

3. **不要把 znode 当 KV 存数据**：ZK 单 znode 默认上限 1MB，整个集群内存型存储，全量 snapshot 到磁盘。塞 GB 级数据会让 follower 同步超时、leader 选举失败。规则：**只放元数据和指针**，业务数据放 S3 / DB / Kafka。

4. **写吞吐是单 leader 瓶颈**：所有写都串行走 leader → 过半 follower ack → commit。QPS 通常在几千上限，不要把它当高吞吐数据库——它是为『慢但一致』优化的。

5. **JVM GC 停顿会拖死集群**：ZK 是 Java 写的，长时间 Full GC 会让 leader 心跳超时被踢，触发选举抖动。生产部署必须独立物理机或独立 JVM、关闭 swap、tune 好堆大小，**绝对不要和应用进程混部**。

6. **跨机房延迟放大写延迟**：ZAB 写需要过半 ack，如果 5 节点跨 3 机房部署，每次写都要等最远机房的 ack 回来。同城多机房 OK，跨城（>10ms RTT）写延迟会肉眼可见地变慢——这也是 Consul 主打『多数据中心』时把 ZK 当反例的原因。

## 适用 vs 不适用场景

**适用**：
- leader 选举（HBase / Kafka 老版本 / YARN HA）
- 服务注册与发现（Dubbo 早期、Solr 集群、ByteDance / Meituan 等大厂早期微服务底座）
- 分布式锁、屏障、队列等协调原语
- 配置中心（少量、变化不频繁、所有节点必须一致）
- 集群成员管理（谁在线、谁掉线）
- 任务分配 / 分片管理（典型如 Kafka topic partition 到 broker 的映射）

**不适用**：
- 高吞吐写（>10k QPS）→ 用 Kafka / Redis
- 大数据存储 → 用对象存储 / 数据库
- 需要丰富查询语义 → 用 etcd（支持 range、事务）或 KV 数据库
- Kafka 3.x+ 新部署 → 用 KRaft 替代，不再需要外置 ZK
- 跨地域强一致 → ZAB 的过半 ack 在跨城延迟下表现差，考虑 Spanner 类 TrueTime 方案
- 单机或两节点部署 → 没有多数派概念，等于裸奔，至少 3 节点起步

## 历史小故事（可跳过）

- **2006 年**：Yahoo! 内部 Hadoop 集群膨胀，各组件自写协调逻辑 bug 频出。Mahadev Konar 提议抽出通用协调服务共用。
- **2007–2010 年**：Patrick Hunt / Mahadev Konar / Flavio Junqueira / Benjamin Reed 开发；论文 *ZooKeeper: Wait-free coordination for Internet-scale systems* 发表于 USENIX ATC 2010。名字来自 Hadoop『动物园』隐喻——需要一个看管员。
- **2008–2010 年**：开源进 Apache（先是 Hadoop 子项目，2010 升顶级项目）；Yahoo 内部已用它管几千节点。
- **2013 年起**：Kafka / HBase / Solr / Dubbo 等把 ZK 当元数据底座，成『大数据基建标配』。
- **2013–2014 年**：CoreOS 推出 etcd（Raft + 后来的 gRPC），社区开始出现 ZK 替代路线；2018 年前后 etcd 进入 CNCF 加速迁移。
- **2022–2024 年**：Kafka 3.3 KRaft GA；3.5+ ZK 模式 deprecated，新部署默认 KRaft。HBase / 老 Hadoop / Solr 仍大量用 ZK；新项目多选 etcd 或 KRaft。

## 学到什么

1. **协调服务是分布式系统的『内核态』**——它不解决业务问题，只解决『大家对关键事实达成一致』这一件事；解决之后，上层各种业务才能并行。把这一层独立出来是 ZK 最重要的工程贡献。
2. **ZAB 是工业级共识协议的活样本**——理解 ZAB 才能理解后来的 Raft 把哪些点简化、etcd 又改进了什么；从 ZAB → Raft → KRaft 是一条清晰的演化线，是学共识协议的最佳教学路径。
3. **临时节点 + 顺序节点 + watch** 三个原语组合，能拼出 leader 选举、分布式锁、屏障、队列、组成员——这是设计协调原语的范式课。学习 ZK 不是为了用 ZK，而是为了看懂『少数原语如何组合出复杂语义』。
4. **痛点驱动后继者**——ZK 的写瓶颈、watch 一次性、运维复杂直接催生了 etcd / KRaft；学一个老系统的『不好用之处』比学它的『好用之处』更长见识。
5. **CAP 里 ZK 选 CP**——网络分区时少数派 follower 拒绝服务而不是返回旧数据，这是它『协调服务』身份决定的硬选择；如果选了 AP，下游的 leader 选举就会脑裂。

## 延伸阅读

- 官方文档（首选）：[ZooKeeper Documentation](https://zookeeper.apache.org/doc/current/)
- 原始论文：[Hunt et al. 2010 — ZooKeeper: Wait-free coordination for Internet-scale systems](https://www.usenix.org/conference/usenixatc10/zookeeper-wait-free-coordination-internet-scale-systems)
- ZAB 协议论文：[Junqueira et al. 2011 — Zab: High-performance broadcast for primary-backup systems](https://marcoserafini.github.io/papers/zab.pdf)
- 配方手册（最实用）：[ZooKeeper Recipes](https://zookeeper.apache.org/doc/current/recipes.html) —— 官方给出的 leader 选举、分布式锁、屏障、双屏障、队列、共享锁、可重入锁的标准实现
- Curator 客户端：[Apache Curator](https://curator.apache.org/) —— Netflix 开源的 ZK 高级封装，把 recipes 打包成开箱即用的 API，生产环境几乎都用它而不是裸 ZK 客户端
- 对照阅读：[[etcd]] —— Raft + gRPC 的现代替代者；[[kafka]] —— 从依赖 ZK 到 KRaft 自管的迁移代表

## 关联

- [[etcd]] —— 后继者，用 Raft 替代 ZAB，社区逐步迁移的目的地
- [[kafka]] —— 老版本依赖 ZK 管 broker / topic 元数据，3.x 起转 KRaft
- [[hbase]] —— Master 选举与 RegionServer 注册全靠 ZK
- [[hadoop]] —— YARN ResourceManager HA failover 用 ZK 协调
- [[dubbo]] —— 早期默认注册中心是 ZK，后来支持 Nacos
- [[consul]] —— HashiCorp 的协调 + 服务发现替代品，主打多数据中心
- [[nacos]] —— 阿里开源注册中心，AP 模式 + 配置管理一体化，常被对照
- [[paxos]] —— 共识协议鼻祖，ZAB 是它在主备复制场景下的简化变体
- [[raft]] —— ZAB 的精神继任者，把可理解性放在第一位

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
