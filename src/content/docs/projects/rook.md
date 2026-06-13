---
title: Rook — 把 Ceph 装进 K8s 的 CRD 里
来源: https://github.com/rook/rook
日期: 2026-06-01
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Rook 是一个 **Kubernetes Operator**，它把 [[ceph]]（一个老牌分布式存储系统）变成几张 **CRD（自定义资源）**——你写一份 YAML，它替你把 Ceph 的全部组件（mon/mgr/osd/mds）部署成 Pod，并在节点宕机时自动恢复。

日常类比：

- 没有 Rook 时装 Ceph 像「装 Linux 版 Oracle 数据库」——上百行 bash、十几台机器手工配 ssh
- 有了 Rook 像「装 macOS 版 App Store 应用」——`kubectl apply -f cluster.yaml`，剩下交给系统

```yaml
apiVersion: ceph.rook.io/v1
kind: CephCluster
metadata: { name: my-cluster, namespace: rook-ceph }
spec:
  cephVersion: { image: quay.io/ceph/ceph:v18 }
  mon: { count: 3 }
  storage: { useAllNodes: true, useAllDevices: true }
```

这一份 30 行的 YAML，等价于过去那种「ceph-deploy + 12 台机器手填 hostname」的几小时工作量。

## 为什么重要

不理解 Rook，下面这些事都没法解释：

- 为什么 2020 年 CNCF 把它**毕业（Graduated）**了——它是 CNCF 第一个毕业的**存储类**项目
- 为什么云厂商纷纷把 Rook 作为「私有云块存储 / 对象存储」的默认方案——它把 Ceph 的运维复杂度从 10 分降到 3 分
- 为什么很多公司不愿意把数据库放 K8s——而 Rook 就是想让你**敢**把数据放进来
- 为什么 Rook 在 1.x 版本里**只剩 Ceph**——之前的 Cassandra / NFS / EdgeFS 提供者都砍掉了

## 核心要点

Rook 的本质是 **三件套**叠在一起：

1. **Operator（控制器）**：一个常驻 Pod，watch 你的 `CephCluster` 资源，把声明的状态翻译成「该建几个 mon、几个 osd、用哪些磁盘」并去执行。挂了会自愈。

2. **CSI 驱动（容器存储接口）**：当用户写 `kind: PersistentVolumeClaim` 时，CSI 替 K8s 去 Ceph 那里申请一块 RBD 镜像（块设备）或挂一个 CephFS 子卷（文件系统），再 attach 到 Pod。

3. **Ceph 进程本身**：mon（监控法定人数）/ mgr（管理面）/ osd（每块磁盘一个进程）/ mds（CephFS 元数据）。这些**都跑成 Pod**——和你写的业务 Pod 同一调度器、同一网络、同一日志栈。

记住一个对照：**ceph-deploy / cephadm = 在裸机上装 Ceph**；**Rook = 在 K8s 里装 Ceph**。后者把「机器」抽象成「节点 + 磁盘」两个 K8s 原生概念。

## 实践案例

### 案例 1：声明一个块存储池

```yaml
apiVersion: ceph.rook.io/v1
kind: CephBlockPool
metadata: { name: replicapool, namespace: rook-ceph }
spec:
  failureDomain: host
  replicated: { size: 3 }
```

读法：

- `failureDomain: host` 意思是「同一份数据的三个副本必须分布在三台不同主机上」
- `replicated.size: 3` = 三副本（损失两台机器仍可读）
- 写完这份 YAML，Operator 会去 Ceph 创建一个名为 `replicapool` 的 pool，并暴露一个 `StorageClass` 给业务用

### 案例 2：业务侧申请一块 10G 的 PVC

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: mysql-data }
spec:
  storageClassName: rook-ceph-block
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 10Gi } }
```

整个链路：

1. 用户 `kubectl apply` PVC
2. K8s 找到 `rook-ceph-block` 这个 StorageClass，调对应的 CSI 驱动
3. CSI 在 Ceph 里 `rbd create` 一个 10G 镜像
4. Pod 调度到某节点时，CSI 把 RBD 镜像 map 成 `/dev/rbd0`，再 mount 到 Pod
5. **应用以为自己在用本地磁盘**——实际是分布式三副本

### 案例 3：节点挂了会发生什么

假设三个 osd 节点挂了一个：

1. mon 检测到 osd 心跳消失，标记 down
2. Ceph 自动开始 **rebalance**——把丢失的副本从健康节点重建到另一个节点
3. Operator 看到 K8s 那边节点 NotReady，但**不会乱动**——它知道 Ceph 自己在重平衡
4. 节点恢复后，Operator 把 osd Pod 重新拉起，Ceph 把数据补回来

这套**双层自愈**（K8s 重新调度 Pod + Ceph 重建副本）是 Rook 的真正卖点。

## 踩过的坑

1. **生产环境别用 loopback 文件**：教程里常见 `useAllDevices: true` + 本地文件模拟磁盘，但生产**必须**用真实块设备（`/dev/sdb` 之类）。loopback 性能塌方、稳定性差。

2. **mon 数量必须是奇数且 >=3**：mon 用 Paxos 类协议选主，2 个 mon 等于自杀（任何一个挂了都丢法定人数）。生产至少 3 个，重要场景 5 个。

3. **跨大版本升级不能跳级**：Rook 1.10 → 1.13 必须经过 1.11、1.12，每升一级跑一遍 `ceph health`。直接跳级会触发 CRD schema 不兼容。

4. **资源很贵**：每块磁盘一个 osd Pod（典型 4G 内存），加 mon/mgr/mds，10 块盘的小集群轻松吃 50G+ 内存。别拿 t3.medium 跑生产。

5. **`useAllNodes: true` 会吃整个集群**：包括 master / 业务专用节点。生产请用 `nodes:` 列表显式指定哪几台做存储节点，避免「数据库 Pod 和 OSD 抢 CPU」。

## 适用 vs 不适用场景

**适用**：

- 私有云 / 本地数据中心需要「块 + 文件 + 对象」三合一存储
- 已经在 K8s 上跑业务，不想再维护一套外部 Ceph
- 数据量从 TB 级到 PB 级——Ceph 是少数能横向扩到 PB 级的开源方案
- 团队熟悉 K8s 操作模式，但不想学 ceph-deploy 那一套

**不适用**：

- 单节点 / 双节点小集群——副本数都凑不齐
- 只想要「简单 ReadWriteOnce 块卷」——用 [[longhorn]] 更轻
- 需要极致低延迟（< 1ms）——Ceph 至少 1-3ms，本地 NVMe 直挂更快
- 公有云上已有托管块存储（EBS / PD）——再叠一层 Rook 没意义

## 历史小故事（可跳过）

- **2016 年**：Bassam Tabbara 在 Quantum Corp 启动 Rook，最初想做「面向云原生的存储抽象」，支持多种后端
- **2018 年**：进入 CNCF 孵化器
- **2020 年 10 月**：CNCF 毕业，第一个毕业的存储类项目
- **2021 年**：宣布**砍掉所有非 Ceph 提供者**——Cassandra / EdgeFS / NFS / Minio 全部移除，专注 Ceph
- **2022 年起**：维护方主要是 Red Hat（OpenShift Data Foundation 就是 Rook + Ceph 的商业化封装）

为什么砍掉多后端？官方解释：「**做精一个比做多个都半吊子**好。」这是开源项目少见的**主动收敛**。

## 学到什么

1. **Operator 模式是在做翻译**——把命令式运维（"先 ssh，再 apt install，再改 conf"）翻译成声明式资源（一份 YAML），让 K8s 控制循环替你跑这个翻译
2. **CRD 是 K8s 的可扩展性核心**——Rook 没改 K8s 一行代码，仅靠注册新 CRD 就把整个 Ceph 嵌进去
3. **存储是有状态服务的最难一块**——Rook 的存在证明：用对模式（Operator + CSI），有状态服务**也**可以 K8s 原生
4. **主动收敛比盲目扩张更值得尊敬**——Rook 砍多后端是反直觉但正确的工程决定

## 延伸阅读

- 官方文档：[Rook Ceph Quickstart](https://rook.io/docs/rook/latest-release/Getting-Started/quickstart/)（30 分钟跑通最小集群）
- CNCF 毕业公告：[Rook becomes the first CNCF storage project to graduate](https://www.cncf.io/announcements/2020/10/07/cloud-native-computing-foundation-announces-rook-graduation/)
- 视频：[Sage Weil — Ceph and Rook at KubeCon 2019](https://www.youtube.com/watch?v=KqaTYepbCEY)（Ceph 创始人讲为何选 Rook）
- 反面教材：[Why we moved off Rook](https://news.ycombinator.com/item?id=27858501)（HN 讨论，了解局限）
- [[ceph]] —— Rook 管的就是 Ceph
- [[kubernetes]] —— Rook 跑在 K8s 之上
- [[operator-sdk]] —— Rook 自身就是用 Operator 模式写的

## 关联

- [[ceph]] —— Rook 是 Ceph 的「K8s 包装纸」，不理解 Ceph 就不理解 Rook 在调什么
- [[kubernetes]] —— CRD / Operator / CSI 三个概念都来自 K8s
- [[operator-sdk]] —— 写 Operator 的脚手架，Rook 是 Operator 模式的范例之一
- [[longhorn]] —— Rook 的「轻量竞品」，只做块存储不做对象/文件
- [[cilium]] —— 同样是 CNCF 毕业项目，但管网络不是存储；可对比看「Operator 模式怎么用在不同基础设施层」

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cilium]] —— Cilium — 用 eBPF 把 K8s 网络从 iptables 时代搬出来
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[longhorn]] —— Longhorn — K8s 原生的轻量分布式块存储
- [[operator-sdk]] —— Operator SDK — 写 K8s Operator 的"豪华套餐"版脚手架

