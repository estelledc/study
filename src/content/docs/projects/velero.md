---
title: Velero — Kubernetes 集群备份与迁移
来源: https://github.com/vmware-tanzu/velero
日期: 2026-06-01
分类: DevOps / Kubernetes
难度: 中级
---

## 是什么

Velero 是 Kubernetes 上的**集群级别备份与恢复工具**——你跑一条 `velero backup create` 命令，它会把集群里指定的资源（Deployment、Service、ConfigMap、Secret 等）连同**持久卷数据**一起打包扔到对象存储（S3 / GCS / Azure Blob），下次想恢复或迁移到另一个集群直接 `velero restore create` 就行。

日常类比：

- **没有 Velero** 像把照片只放在手机本地：手机丢了照片就没了，集群崩了 etcd 没救活就全没。
- **Velero** 像 iCloud 自动备份：你照常拍照（用集群），它在后台把所有资源同步到云端，换台手机登录就能把照片拉回来。

最早叫 Ark，由 Heptio 2017 年开源；2018 年 VMware 收购 Heptio，2019 年改名 Velero（西班牙语 帆船）；2022 年捐给 CNCF 进入 sandbox，2024 年进入 incubating。

## 为什么重要

不理解 Velero，下面这些事都不好解释：

- **etcd 崩了怎么救集群**——单纯备份 etcd 只救得回控制平面对象，救不回 PV 数据；Velero 把两件事一起做
- **集群跨云迁移怎么做**——AWS 上一个集群的 200 个 Deployment 想搬到 GCP，靠 yaml 一份份导太脆，Velero 一条命令打包平移
- **多租户 SaaS 怎么给每个客户独立备份**——按 namespace 备份 + 还原是 Velero 的设计原点
- **灾备演练怎么自动化**——每周自动备份、每月一次还原到隔离集群验证可恢复性，是合规审计要的

## 核心要点

Velero 把备份流程写成集群里的**登记表条目**（CRD = Custom Resource Definition，自定义资源类型），共 **五类核心对象 + 两条数据通路**：

1. **Backup**：一次备份请求。声明备份哪些 namespace / 用什么 label 选 / 是否包含 PV 数据 / TTL 多久。类比：一张「今天要备份什么」的工单。
2. **Restore**：一次恢复请求。指向某个 Backup，可重映射 namespace、可只恢复部分资源。类比：按某张工单把东西搬回来。
3. **Schedule**：周期任务，按 cron 自动产生 Backup（如每天凌晨 2 点）。类比：闹钟到点就自动开一张工单。
4. **BackupStorageLocation**：声明对象存储桶（S3 / GCS 等）——备份文件最终扔到哪里。
5. **VolumeSnapshotLocation**：声明卷快照后端——云盘快照存在哪家云的哪一区。

两条数据通路：

- **资源通路**：调用 Kubernetes API 把资源对象序列化为 yaml/json，打包成 tar.gz 上传到对象存储。
- **PV 通路**：两种实现可选——**CSI 卷快照**（Container Storage Interface，云厂商提供的「整盘拍照」，秒级，绑死区域）；或 **File System Backup**（进容器逐文件拷贝：老工具 Restic 稳但慢，新工具 Kopia 并发更快，跨云通用）。

## 实践案例

### 案例 1：AWS 上装 Velero 并备份一个 namespace

前置：先建好 S3 桶，并把 IAM 访问密钥写成 `./aws-credentials`（缺这个文件，`--secret-file` 会直接失败）。再装：

```bash
velero install \
  --provider aws \
  --bucket my-velero-backups \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1 \
  --secret-file ./aws-credentials \
  --use-node-agent \
  --uploader-type kopia
```

`--use-node-agent` 在每个节点起一个小助手，负责读 PV 文件；`--uploader-type kopia` 选更快的上传器。备份 default namespace：

```bash
velero backup create demo-1 --include-namespaces default
velero backup describe demo-1 --details
```

桶里会出现 `backups/demo-1/` 目录，含资源 tar.gz、PV 数据和元信息 json。

### 案例 2：把一个集群整体搬到另一个集群

源集群备份（含所有 PV）：

```bash
velero backup create migrate-2026-06 \
  --include-namespaces app-prod,app-staging \
  --default-volumes-to-fs-backup
```

目标集群（已装 Velero，指向**同一个**桶）：

```bash
velero restore create --from-backup migrate-2026-06
```

资源对象重新 apply，PV 数据从对象存储 pull 回来挂载。这是 Velero 最经典的使用场景，也是它名字 帆船 的由来——载着你的工作负载漂去新港口。

### 案例 3：备份前调用 hook 让数据库刷盘

PostgreSQL Pod 上加 annotation：

```yaml
metadata:
  annotations:
    pre.hook.backup.velero.io/command: '["/bin/bash","-c","pg_dump -U postgres app > /backup/app.sql"]'
    pre.hook.backup.velero.io/timeout: 5m
    post.hook.backup.velero.io/command: '["/bin/bash","-c","rm /backup/app.sql"]'
```

Velero 备份这个 Pod 的 PV 之前，先在容器里跑 `pg_dump` 生成一致性快照，备份完再清理。这样恢复出来的数据库不是 撕到一半 的状态。

## 踩过的坑

1. **Restic vs Kopia 选错性能差 5 倍**——老版本默认 Restic，单线程上传，TB 级 PV 跑一夜传不完。1.10 后引入 Kopia 作为可选 uploader，并发分片上传，新装一定加 `--uploader-type kopia`。

2. **CSI 快照只能在源集群恢复**——CSI snapshot 是云盘层快照，绑死区域和账号。跨云迁移必须用 File System Backup（Restic / Kopia），慢但通用。

3. **包含 PV 默认是关的**——`velero backup create` 不加 `--default-volumes-to-fs-backup` 或 Pod 上没 annotation，PV 数据不备份，只备份了 PVC 对象。新人常以为备份成功，恢复时数据全丢。

4. **CRD 自身得先恢复**——如果集群里装了别的 Operator（cert-manager、Argo CD），它们的 CRD 必须排在自己 CR 前面恢复。Velero 默认按字母序，可能出错；用 `--include-cluster-resources=true` 并配合 restore order 解决。

5. **过期清理不会删 PV 快照**——Backup TTL 到期后 Velero 删对象存储里的备份，但云厂商的卷快照（EBS snapshot 等）不一定一起删，要看 VolumeSnapshotLocation 的 deletionPolicy 配置。账单容易悄悄涨。

## 适用 vs 不适用场景

**适用**：

- Kubernetes 集群备份与恢复（资源 + PV 数据一站式）
- 跨云 / 跨集群迁移（AWS → GCP / on-prem → cloud）
- 多 namespace 隔离备份（按租户 / 按业务线）
- 灾备演练（定期备份 + 在隔离集群自动还原验证）
- 升级前快照（K8s 大版本升级前 backup，回滚有底气）

**不适用**：

- 单纯 etcd 二进制备份 → 用 etcdctl snapshot save，更轻量
- 数据库逻辑级一致性快照 → 用数据库自己的工具（pg_dump / mysqldump / mongodump），Velero hook 只是辅助
- 极低 RPO/RTO（秒级）→ Velero 是分钟级，要求秒级用云盘同步复制 + 多活
- 非 Kubernetes 工作负载 → Velero 只懂 K8s API

## 历史小故事（可跳过）

- **2017 年**：Heptio（Kubernetes 联合创始人 Joe Beda、Craig McLuckie 创办）开源 Ark
- **2018 年**：VMware 收购 Heptio
- **2019 年**：Ark 改名 Velero（避免与 Apache Ark 重名，新名取自西班牙语 帆船）
- **2022 年**：捐给 CNCF 进入 sandbox
- **2024 年**：CNCF incubating，与 OpenTelemetry 早期同级
- 当前主要维护方仍是 VMware Tanzu，社区贡献活跃，与 Kasten K10、Stash 等商业方案并存

## 学到什么

1. **备份不是单点动作**——资源对象 + PV 数据 + Hook 时序，三件事必须协调好才叫 可恢复
2. **CRD 抽象 = 把流程显式化**——Backup / Restore / Schedule 暴露为对象，让 GitOps 工具能管，让审计能查
3. **uploader 可插拔**：Restic 老但稳，Kopia 新而快，留接口比绑死实现更重要
4. **跨云迁移的本质是 序列化 + 反序列化**——只要两边都能读懂同一个桶里的 yaml + tar，物理位置就不重要

## 延伸阅读

- 官方文档：[velero.io](https://velero.io/docs/)（quickstart 半小时跑通）
- 源码：[github.com/vmware-tanzu/velero](https://github.com/vmware-tanzu/velero)（Go 写，`pkg/backup` 是入口）
- File System Backup 设计：[velero.io fs-backup](https://velero.io/docs/main/file-system-backup/)（Restic 与 Kopia 对照）
- [[kubernetes]] —— Velero 操作的对象就是 K8s 资源
- [[etcd]] —— K8s 控制平面存储，Velero 备份的是 etcd 里的对象快照

## 关联

- [[kubernetes]] —— Velero 的工作对象就是 K8s 集群本身
- [[etcd]] —— K8s 元数据底座，Velero 通过 K8s API 读取其内容序列化
- [[argocd]] —— GitOps 重建集群与 Velero 数据恢复互补：声明式重建 + 数据回灌
- [[helm]] —— Helm 管 release 模板，Velero 管 release 运行时状态加 PV 数据
- [[kustomize]] —— 与 Helm 同位的资源生成层，重建路径上常见组合
- [[cert-manager]] —— 都用 Kubernetes 控制器范式，把运维任务变成声明式对象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[cert-manager]] —— cert-manager — K8s 自动签发与续期 TLS 证书
- [[etcd]] —— etcd — 分布式键值数据库
- [[helm]] —— Helm — Kubernetes 包管理器
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[kustomize]] —— Kustomize — 不动原 YAML 的 K8s 配置叠加器

