---
title: Longhorn — K8s 原生的轻量分布式块存储
来源: https://github.com/longhorn/longhorn
日期: 2026-06-01
子分类: storage
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Longhorn 是一个**专门给 Kubernetes 用的分布式块存储系统**。Rancher 团队 2014 年开始写，2019 年开源，2020 年进 CNCF，2024 年升为 Incubating。

它做的事一句话：**给每个持久卷（PV）开一个独立的「专属控制器 + 多副本」**，副本散到不同节点，节点宕机时自动重建。

日常类比：

- 不要 Longhorn 时给 K8s 加块存储 像「自己买硬盘 + 装 Linux 软 RAID + 还要自己写跨机同步」
- 用 Longhorn 像「买一台 NAS 直接插上」 一份 YAML 声明几副本，剩下交给它

```yaml
apiVersion: longhorn.io/v1beta2
kind: Volume
metadata: { name: my-volume, namespace: longhorn-system }
spec:
  size: "10Gi"
  numberOfReplicas: 3
  frontend: blockdev
```

这一份 10 行的 CRD，等价于过去那种「自己拼 DRBD + iSCSI + 心跳监控」的几天活。

## 为什么重要

不理解 Longhorn，下面这些事都没法解释：

- 为什么 Rancher / RKE / K3s 用户**几乎默认装它** 它和 Rancher 同根，集成最丝滑
- 为什么很多人在 [[rook]] 和 Longhorn 之间纠结 它们解的是同一类问题，但路线完全不同
- 为什么它能在 [[ceph]] 这种「业界老大哥」面前活下来 因为「轻」本身就是一种竞争力
- 为什么 v2 引擎要重写到 SPDK 上 v1 的 iSCSI 路径性能撞墙了

## 核心要点

Longhorn 的本质是 **三层 Pod** 叠在一起：

1. **Manager（每节点一个 DaemonSet）**：watch 你写的 `Volume` CRD，决定「这卷要放几副本、放哪几个节点」并去执行。它同时也是 CSI 驱动入口。

2. **Engine（每卷一个 Pod）**：这卷的**专属控制器**。读写请求到 Engine，它再扇出到所有 replica。一卷挂了不影响别卷 这就是「per-volume controller」的核心好处。

3. **Replica（每副本一个 Pod）**：实际存数据的进程。一卷三副本就有三个 Replica Pod，分布在三台机器上的本地磁盘里。

记住一个对照：**Ceph = 一个大池子，所有卷共用一套 mon/osd**；**Longhorn = 一卷一套小班子，互不干扰**。前者扩展性强、运维复杂；后者简单、隔离好，但不适合 PB 级。

## 实践案例

### 案例 1：声明一个三副本的 PVC

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: mysql-data }
spec:
  storageClassName: longhorn
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 10Gi } }
```

整个链路：

1. 用户 `kubectl apply` PVC
2. K8s 调 Longhorn CSI，CSI 让 Manager 创一个 `Volume` CR
3. Manager 决定 replica 放哪三台节点，每台拉起一个 Replica Pod
4. Pod 调度到某节点时，Engine Pod 在该节点起来，把 iSCSI 块设备 attach 到业务 Pod
5. **业务以为在用本地盘** 实际写一次进 Engine，Engine 同步写三个 Replica

### 案例 2：节点挂了会发生什么

假设三副本里挂了一个节点：

1. Manager 收到节点 NotReady 事件
2. Engine 检测到这个 replica 心跳消失，标记为 ERR，**剩下两副本继续读写**（不阻塞业务）
3. Manager 在剩余健康节点上**新建一个空 replica**
4. Engine 触发 **rebuild**：从健康 replica 里把全量数据复制到新 replica
5. rebuild 完成，副本数恢复到 3

这套**双层自愈**（K8s 重新调度 Pod + Longhorn 重建 replica）让数据不会因为单点而丢，但 rebuild 期间副本数下降，仍是窗口风险。

### 案例 3：增量备份到 S3

```yaml
apiVersion: longhorn.io/v1beta2
kind: Backup
metadata: { name: mysql-data-backup-1 }
spec:
  snapshotName: mysql-data-snap-1
```

Longhorn 把这卷的 snapshot 链「拍平」成一个备份对象，按 2MB 分块上传到你配的 S3 bucket。第二次备份只传变化的块 这是工程上很关键的「增量备份」。

恢复时反过来：从 S3 下载块，重建 replica，attach Engine，业务挂回去。**整个过程不依赖原集群存在** 这才叫「灾备」。

## 踩过的坑

1. **v1 引擎的 iSCSI 单核瓶颈**：v1 Engine 是一个用户态 tgt 进程，单核就那么点 CPU。NVMe 盘单卷打满 8 万 IOPS 时 CPU 先撞墙。v2 引擎换 SPDK 用户态 NVMe 才解决。

2. **三副本 = 写放大三倍**：每次写都要发到三台机器再确认。10G 网络 + 高 IO 业务时网卡先打满。生产建议存储节点用 25G 以上专网。

3. **rebuild 会拖慢正在用的卷**：宕机重建时，健康 replica 既要服务业务又要复制全量数据给新 replica。rebuild 期间业务延迟会涨。可以调 `concurrent-rebuild-per-node-limit` 限流。

4. **snapshot 链过长拖读**：每多一个 snapshot 就多一层差分。链超过 50 层后读放大明显。生产必须配 RecurringJob 定期做 snapshot purge。

5. **卷迁移要 detach**：把卷从节点 A 搬到节点 B 必须先 detach（Pod 停掉）。不能像 Ceph RBD 那样在线迁。所以蓝绿部署时要预留 detach 窗口。

## 适用 vs 不适用场景

**适用**：

- 中小 K8s 集群（10-50 节点）需要持久卷
- Rancher / RKE / K3s 用户 集成最完整
- 需要「快照 + S3 备份」开箱即用 这是它的招牌
- 团队没人懂 Ceph 但要尽快上线持久卷

**不适用**：

- PB 级海量存储 用 [[rook]] + Ceph 或 MinIO
- 对象存储为主的场景 Longhorn 只做块
- 极致 IOPS / 微秒延迟数据库 直接本地 NVMe + 数据库自己复制（Postgres patroni / MySQL Group Replication）
- 已有成熟 Ceph 团队 没必要换

## 历史小故事（可跳过）

- **2014 年**：Sheng Yang 在 Rancher 启动 Longhorn，最初是 Rancher 内部给容器加持久卷的内部工具
- **2017 年**：开源到 GitHub，但定位还是 Rancher 附属
- **2019 年**：Rancher 把它独立出来，捐给 CNCF 进入 Sandbox
- **2020 年**：SUSE 收购 Rancher，Longhorn 跟过去
- **2023 年起**：v2 引擎开发，基于 SPDK 解决 v1 性能瓶颈
- **2024 年**：CNCF Incubating（毕业的下一站）

为什么没像 [[rook]] 那样追求大而全？官方理念：「**只做 K8s 上的轻量块存储，做到最简单**」。这种克制是 Longhorn 在 Ceph 阴影下活下来的关键。

## 学到什么

1. **「per-volume controller」是反直觉但好的设计** 一卷一控制器看似浪费，但隔离性强、debug 容易、垂直扩展简单
2. **Operator 模式在存储上的极致应用** Longhorn 的所有能力（卷 / 快照 / 备份 / 恢复）都是 CRD，运维和声明式一致
3. **简单 vs 强大是工程永恒的取舍** Longhorn 选了简单，丢了 PB 级；Ceph 选了强大，背了运维债
4. **重写引擎需要勇气** v1 撞墙不是丢人事；v2 完全推翻 IO 路径才是真工程实力

## 延伸阅读

- 官方文档：[Longhorn Concepts](https://longhorn.io/docs/1.6.0/concepts/)（架构图最清楚的入口）
- 视频：[Sheng Yang — Longhorn at KubeCon 2020](https://www.youtube.com/watch?v=DABBKcLXbpw)（创始人讲设计取舍）
- v2 引擎深入：[Longhorn V2 Data Engine with SPDK](https://longhorn.io/blog/longhorn-v2-data-engine/)（为什么要重写）
- 反面参考：[Reddit r/kubernetes Longhorn vs Rook 对比](https://www.reddit.com/r/kubernetes/comments/longhorn_vs_rook/)（实战吐槽）
- [[kubernetes]] Longhorn 跑在 K8s 之上
- [[rook]] 同赛道竞品，路线相反

## 关联

- [[kubernetes]] CSI / CRD / Operator / DaemonSet 全部用到
- [[rook]] 「重量竞品」 Rook 包 Ceph 做大而全，Longhorn 自己写做小而精
- [[ceph]] Longhorn 替代它的简化版，理解 Ceph 才能理解 Longhorn 砍了什么
- [[argocd]] Longhorn 自身就是 GitOps 友好（全 CRD 化），常和 ArgoCD 搭配
- [[cilium]] 同 CNCF 项目但管网络；可以对比「Operator 模式怎么用在不同基础设施层」

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[cilium]] —— Cilium — 用 eBPF 把 K8s 网络从 iptables 时代搬出来
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[rook]] —— Rook — 把 Ceph 装进 K8s 的 CRD 里

