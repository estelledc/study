---
title: etcd — 分布式键值数据库
来源: https://github.com/etcd-io/etcd
日期: 2026-05-29
分类: 数据库 / 分布式
难度: 中级
---

## 是什么

etcd 是 CoreOS 团队 2013 年用 Go 写的**基于 [[raft]] 的分布式可靠 KV 存储**。日常类比：

- [[redis]] 是单机内存字典——一台机器跑，速度快，但这台机器一坏数据就读不到
- etcd 是 3-5 台机器共同维护的字典——任何一台坏掉不影响读写，剩下机器还能保证你看到的数据是最新一致的

[[kubernetes]] 用它存所有集群状态（Pod / Service / Secret / ConfigMap），所以当你说 "K8s 控制平面" 的时候，etcd 就是这个大脑里装的"长期记忆"。

## 为什么重要

不理解 etcd，下面这些事都没法解释：

- 为什么 K8s 把 master 节点和 etcd 分开部署——因为 etcd 写入要 quorum，3 节点和 5 节点性能差异很大
- 为什么 Consul / ZooKeeper 总和 etcd 一起被提——它们是同类产品（服务发现 + 配置中心 + 分布式锁）
- 为什么"读 Raft 论文"和"读 etcd 源码"是搭配学习——etcd 是 Raft 工程化最清晰的开源实现之一
- 为什么 K8s 大集群（>5000 节点）要做 etcd 拆分——单 etcd 写 QPS 上限大约 1-2k，集群一大就成瓶颈

## 核心要点

etcd 解决"分布式一致性 KV"靠三件武器：

- **Raft 共识**：3-5 节点一组（叫 cluster），写入必须超过半数（quorum）确认才返回成功。类比：5 个人开会，至少 3 个人同意才能通过决议——单个人病了不影响开会
- **Watch**：订阅某个 key 或前缀的变化，服务端用 streaming 推送给客户端。类比：你不用每秒去问"配置变了吗"，配置变了 etcd 主动告诉你
- **Lease**：带租约的 key，客户端要定期"续约"，断了就自动过期。常用来做服务注册（服务挂了 lease 不续约 → key 自动消失）和 leader 选举

再补两块工程现实：

- **MVCC**：每次写产生新 revision，读可以带版本；历史靠 compact 回收
- **gRPC API（v3）**：比早期 HTTP/JSON（v2）吞吐高得多，也是今天默认该学的接口

## 实践案例

### 案例 1：启动单节点 etcd（开发环境用）

```bash
etcd \
  --listen-client-urls http://0.0.0.0:2379 \
  --advertise-client-urls http://0.0.0.0:2379
```

启动后默认监听 2379（客户端）和 2380（节点间通信）。生产必须 3 或 5 节点，奇数是为了 quorum 计算干净。

### 案例 2：基本读写

```bash
etcdctl put /service/web 'http://10.0.0.1:8080'
etcdctl get /service/web
etcdctl get /service/ --prefix
```

把 etcd 当成"文件系统风格"的字典——key 用 `/` 分层，不是真目录但管理上一样好理解。

### 案例 3：Watch + Lease 做服务发现

```bash
# 终端 A：监听前缀
etcdctl watch /service/ --prefix

# 终端 B：申请 10 秒租约，绑定 key，并续约
etcdctl lease grant 10
# 输出里的 lease ID 填到下一行
etcdctl put --lease=<LEASE_ID> /service/worker-1 'alive'
etcdctl lease keep-alive <LEASE_ID>
```

逐步：A 先 watch → B 把存活信息写成带租约的 key → keep-alive 维持。worker 崩了不续约 → key 过期删除 → A 立刻收到删除事件。K8s 的 node heartbeat、leader election 同构。

### 案例 4：分布式锁（了解原理即可）

```bash
etcdctl lock /lock/job-runner -- ./run-job.sh
```

内部大致是：拿 lease → 抢带版本号的 key → 抢到执行、抢不到就 watch 等待。命令结束自动释放。教学上够用；生产锁还要处理时钟、续约失败与 fencing token。

## 踩过的坑

- **写 QPS 有天花板**：Raft 每次写都要落盘 + 多数确认，单集群写入大约 1-2k QPS 顶天。K8s 大集群常把 events 拆到独立 etcd
- **Disk IO 极敏感**：Raft log 必须 fsync。机械盘 = 灾难；生产用 SSD/NVMe，同盘别跑重写负载
- **备份要 snapshot + WAL**：只恢复 snapshot 会丢最新写入；正确是 snapshot 兜底再追 WAL
- **不能存大 value**：单 value 默认上限 1MB，接近后性能骤降。大文件进对象存储，etcd 只存 URL
- **MVCC 必须 compact**：历史版本不清理会撑爆磁盘——和 RocksDB / TiKV 同款运维题

## 适用 vs 不适用场景

**适用**：

- K8s / 服务发现 / 配置中心：读多写少、要强一致、要 watch
- 分布式锁、leader 选举（lease + 版本比较）
- 集群元数据（节点列表、schema 版本）——单 key 通常 KB 级

**不适用**：

- 高频写缓存、会话、排行榜 → 用 [[redis]]
- 大 value / 大吞吐日志流 → 对象存储或消息队列
- 单机开发只想要本地字典 → 嵌入式 [[bbolt]] 或普通文件即可

## 历史小故事（可跳过）

- **2013 年**：CoreOS 需要分布式配置存储，觉得 ZooKeeper 太重，用 Go 自研 etcd
- **2014 年**：etcd 0.x，HTTP + JSON API，简单但性能一般
- **2015 年**：Kubernetes 1.0 选 etcd 作唯一存储后端，命运绑定
- **2016 年**：etcd v3.0 改用 gRPC + Protobuf + MVCC，吞吐大幅提升
- **2018 年**：加入 CNCF（孵化）；**2020 年**毕业
- **2021 年**：v3.5.0 发布，成为后续 K8s 常用基线之一

## 学到什么

- **共识可以工业化**：Raft 论文 2014 发表后，etcd / TiKV / Consul 很快落地——清晰参考实现比纯理论更能推动采用
- **限制就是边界**：1MB value / 1-2k 写 QPS 不是 bug，是强一致的物理代价；别拿 etcd 当 [[redis]]
- **奇数节点是数学**：3 容 1、5 容 2；加偶数节点往往不增加容错
- **watch + MVCC 决定了 K8s 控制平面形态**：事件驱动调和依赖有序修订号，不靠客户端盲轮询
- **协议升级很贵**：v2 → v3 近似全量数据面重写，K8s 生态花了很长时间才切完——基础设施兼容性优先

## 延伸阅读

- 官方文档：[etcd.io/docs](https://etcd.io/docs/)
- 运维手册入口：备份、compact、磁盘与超时调参（同站 ops 章节）
- [[raft]] —— 共识算法原文与工程对照
- [[kubernetes]] —— etcd 最大生产用户
- [[zookeeper]] —— 上一代协调服务对照
- [[tikv]] —— 另一条 Raft KV 工业化路线

## 关联

- [[raft]] —— etcd 的共识引擎；理解奇数节点与 quorum 的前提
- [[kubernetes]] —— 控制平面状态几乎全在 etcd
- [[redis]] —— 同是 KV，但单机内存型 vs 多机强一致型
- [[zookeeper]] —— 经典协调服务，API 与运维模型对照
- [[tikv]] —— 分布式事务 KV，Raft 工业化另一极
- [[bbolt]] —— etcd 存储引擎家族的嵌入式 B+ 树近亲
- [[grpc-go]] —— etcd v3 API 的运输层
- [[pebble]] —— 另一类现代 KV 存储引擎对照（LSM 路线）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kubernetes]] —— 控制平面状态依赖 etcd
- [[raft]] —— 共识层对照
- [[zookeeper]] —— 协调服务对照
