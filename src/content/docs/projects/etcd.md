---
title: etcd — 分布式键值数据库
来源: https://github.com/etcd-io/etcd
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
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
- **Lease**：带租约的 key，客户端要定期"续约"，断了就自动过期。常用来做服务注册（服务挂了 lease 不续约 → key 自动消失 → 别人发现服务下线）和 leader 选举（谁先抢到带 lease 的 key 谁是 leader）

## 实践案例

### 案例 1：启动单节点 etcd（开发环境用）

```bash
etcd \
  --listen-client-urls http://0.0.0.0:2379 \
  --advertise-client-urls http://0.0.0.0:2379
```

启动后默认监听 2379（客户端）和 2380（节点间通信）端口。生产环境必须 3 或 5 节点起步，奇数节点是为了 quorum 计算干净。

### 案例 2：基本读写

```bash
# 写一个服务地址
etcdctl put /service/web 'http://10.0.0.1:8080'

# 读出来
etcdctl get /service/web
# /service/web
# http://10.0.0.1:8080

# 列出某个前缀下所有 key
etcdctl get /service/ --prefix
```

把 etcd 当成"文件系统风格"的字典——key 用 `/` 分层，不是真目录但管理上一样好理解。

### 案例 3：Watch 订阅变化

```bash
# 终端 A：监听 /service/ 下任何变化
etcdctl watch /service/ --prefix

# 终端 B：写入新值
etcdctl put /service/api 'http://10.0.0.2:9090'
```

终端 A 立刻收到推送：`PUT /service/api`。这就是"配置中心"的核心——客户端不用 polling，etcd 主动告诉你。K8s 的 controller 就是靠 watch etcd 实现"声明式调谐"的。

### 案例 4：Lease 做服务自动下线

```bash
# 申请一个 10 秒租约，拿到 lease ID
etcdctl lease grant 10
# lease 694d71ddc9f4b801 granted with TTL(10s)

# 把 key 绑到这个 lease 上
etcdctl put --lease=694d71ddc9f4b801 /service/worker-1 'alive'

# 客户端要定期续约
etcdctl lease keep-alive 694d71ddc9f4b801
```

如果 worker 进程崩了，10 秒内没续约，etcd 自动删除 `/service/worker-1`。监听这个前缀的服务发现客户端立刻知道"worker-1 下线了"，无需任何心跳代码。这就是为什么 K8s 的 node heartbeat、leader election 都用 lease 做。

### 案例 5：分布式锁的两行写法

```bash
# 进程 A
etcdctl lock /lock/job-runner -- ./run-job.sh
```

`etcdctl lock` 内部做的事：拿 lease → 抢一个带 lease 的 key → 抢到就执行命令、抢不到就阻塞等。命令结束自动释放。这种"分布式锁"原理直接基于 lease + watch + 比较版本号（CAS），不需要额外组件。

## 踩过的坑

- **写 QPS 有天花板**：Raft 每次写都要落盘 + 多数节点确认，单 etcd 集群写入大约 1-2k QPS 顶天。K8s 大集群（万级节点）要做 etcd 拆分，常见做法是 events 单独存一个 etcd 实例
- **Disk IO 极敏感**：Raft log 必须 fsync 到磁盘才返回成功。机械盘跑 etcd = 性能灾难，生产必须 SSD，最好 NVMe；同机器跑别的写盘服务也会拖慢 etcd
- **备份恢复双轨**：etcd 用 snapshot（某时刻全量）+ WAL（之后的写日志）两层保护。单恢复 snapshot 会丢最新数据；只看 WAL 又重放慢；正确做法是"snapshot 兜底 + WAL 追到最新"
- **不能存大 value**：单 value 默认上限 1MB，接近这个值性能急剧下降。要存大文件（镜像、二进制）请用 S3 / MinIO 等对象存储，etcd 只存它们的 URL

## 历史小故事（可跳过）

- **2013 年**：CoreOS 创立，做最小化 Linux 镜像跑容器。需要一个分布式配置存储——市面上 ZooKeeper 太重（Java + 复杂运维），自己用 Go 写了 etcd
- **2014 年**：etcd 0.x 发布，HTTP + JSON API，简单但性能一般
- **2015 年**：Kubernetes 1.0 发布，选 etcd 作为唯一存储后端。这一刻起 etcd 命运绑定 K8s
- **2018 年**：etcd v3 改用 gRPC + Protobuf，吞吐量提升约 10 倍；同年加入 CNCF
- **2020 年**：v3.5 GA，稳定性大幅改善，K8s 1.22 起把它作为默认推荐版本
- **2024 年**：v3.5.x 仍是 K8s 默认后端，至今没有大规模可替代品

## 学到什么

- **共识算法可以工业化**：Raft 论文 2014 发表，几年后 etcd / TiKV / Consul 全跑起来——理论到落地不一定要等几十年，关键看有没有清晰的工程参考实现
- **协议演进的代价**：v2 → v3 等于全量数据重写，K8s 升级花了大约 2 年才做完。基础设施升级的复杂度远超应用层，向后兼容是基础设施第一原则
- **限制就是边界**：1MB value / 1-2k QPS 这些不是 bug，是分布式一致性的物理代价。理解了边界才用得对——别拿 etcd 当 [[redis]] 跑高频读写
- **奇数节点不是约定，是数学约束**：3 节点容忍 1 故障 / 5 节点容忍 2 故障——加偶数节点反而降低容灾能力。
- **watch 是 etcd 的灵魂**：K8s 控制平面所有 controller 都在 watch etcd，事件触发式调和；理解 watch 的"流式 + revision 顺序" 是看懂 K8s 调度的前提。
- **MVCC 而非锁**：etcd v3 用 multi-version 让读不阻塞写——这条选择决定了 K8s 控制平面"高读低写" 的访问模式能跑得动。
- **Compact 不是可选**：MVCC 历史版本不清理会一直膨胀，etcd 必须周期 compact 才不会耗光磁盘——RocksDB / TiKV 都有同款问题。

## 关联

- [[raft]] —— etcd 的共识引擎，理解了 Raft 才理解 etcd 为什么必须奇数节点
- [[kubernetes]] —— etcd 最大用户，K8s 控制平面所有状态都存这里
- [[redis]] —— 同样是 KV，但 redis 单机内存型，etcd 多机磁盘一致型，定位互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bbolt]] —— bbolt — Go 嵌入式 B+ 树 KV
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[go-zero]] —— go-zero — 一份契约文件生成整套 Go 微服务
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[k3s]] —— k3s — 把完整 K8s 塞进一个 60 MB 的二进制
- [[kratos]] —— kratos — Go 微服务一锅出 HTTP 和 gRPC 两份服务
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
- [[lmdb]] —— LMDB — 闪电内存映射嵌入式 KV 库
- [[nats]] —— NATS — 极简云原生消息系统
- [[nats-server]] —— NATS Server — 极简云原生消息中间件
- [[nsq]] —— NSQ — Go 写的去中心化消息队列
- [[pebble]] —— Pebble — CockroachDB 自研 LSM
- [[raft]] —— Raft — 易理解的共识算法
- [[redis]] —— Redis — 内存键值数据库
- [[redpanda]] —— Redpanda — Kafka 兼容的 C++ 实现
- [[thrift]] —— Thrift — 写一份 IDL 自动生成 28 种语言的 RPC 代码
- [[tikv]] —— TiKV — 分布式事务 KV
- [[velero]] —— Velero — Kubernetes 集群备份与迁移
- [[yugabyte-db]] —— YugabyteDB — 复用 Postgres 源码的分布式 SQL
- [[zookeeper]] —— Apache ZooKeeper — 给一群机器装一个共同的小脑

