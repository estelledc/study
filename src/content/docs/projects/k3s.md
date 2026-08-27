---
title: k3s — 单进程发行版把控制面、Kine 与打包组件收进一个二进制
description: 介绍 k3s v1.36.3+k3s1 如何用嵌入执行器、默认 SQLite/Kine 与 --disable 清单把 Kubernetes 收成轻量发行版。
来源: https://github.com/k3s-io/k3s
日期: 2026-08-27
分类: 基础设施 / 容器编排
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/k3s-io/k3s
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5aed4d7beddeb3e67120da477c876ac9efd70318
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: v1.36.3+k3s1
---

## 是什么

k3s 是 Rancher / CNCF 维护的 **Kubernetes 发行版**，不是另一套 API。日常类比：整套商业厨房拆成五台机器（apiserver / scheduler / controller-manager / kubelet / kube-proxy）；k3s 把刀片焊进一把折叠刀——`main.go` 用 `embed.New` 初始化执行器，再按子命令分发 `server` / `agent` / `kubectl` / `crictl`。

固定 tag `v1.36.3+k3s1` 的 `go.mod` 把 `k8s.io/*` replace 到 `github.com/k3s-io/kubernetes/... v1.36.3-k3s1`。README 写的是「小于 100 MB 的单二进制」，不是旧教程里的 70 MB；本轮未称重。

```bash
curl -sfL https://get.k3s.io | sh -
sudo kubectl get nodes
```

README 的 Quick-Start 说：安装脚本会把 kubeconfig 写到 `/etc/rancher/k3s/k3s.yaml`，并启动或重启 systemd / openrc 服务。本页没有执行这条命令。

## 为什么重要

不读固定 1.36.3 源码，旧笔记会把三件事写错：

- 默认账本还是「一个 SQLite 文件，没有 shim」——实际是 **Kine** 把 SQLite / MySQL / Postgres / NATS / 外接 etcd 伪装成 etcd API
- `--disable traefik` 能关掉所有打包件——`DisableItems` 现在是 `coredns, servicelb, traefik, local-storage, metrics-server, runtimes`
- flannel「只有 vxlan」——`--flannel-backend` 合法值是 `none` / `vxlan` / `host-gw` / `wireguard-native`，默认才是 `vxlan`

它和 [[kind]] 的分工也不是「谁更快」：k3s 是宿主机上的发行版进程；kind 是用容器当节点、再用 kubeadm 起上游 Kubernetes。

## 架构与流程

从敲下 `k3s server` 到集群能 `kubectl`，固定源码的主链是：

1. **单进程执行器**：`main` 给 `server` / `agent` 包一层 `initExecutor`。`embed.New` 失败就直接退出；成功后 `executor.Set(ex)`，控制面组件不再各起一个独立二进制。

2. **默认走 Kine，不自动起嵌入 etcd**：`server.Run` 先把 `Datastore` 设成 `etcd.DefaultEndpointConfig()`（监听 Kine unix socket、模拟 etcd 版本、`compact-interval=0s`），再写入 `--datastore-endpoint`。只有 `--cluster-init`，或带 token 去 `--server` 加入，才会 `assignManagedDriver` 选中嵌入 etcd。SQLite 文件落在 `${data-dir}/db/state.db`。

3. **打包清单与 `--disable`**：`deploy.Stage` 把 `//go:embed embed/*` 的清单写到 data-dir；`DisableItems` 列出可删的打包组件。`servicelb` 对应 README 里的 Klipper-lb；`local-storage` 对应 local-path-provisioner。helm-controller、kube-router 网络策略是另外的开关（`--disable-helm-controller` / `--disable-network-policy`）。

4. **默认网络与端口**：`--https-listen-port` 默认 6443；`--cluster-cidr` 默认 `10.42.0.0/16`，`--service-cidr` 默认 `10.43.0.0/16`，CoreDNS 默认 `10.43.0.10`。

5. **可选嵌入仓库**：`--embedded-registry` 打开 Spegel 分布式镜像仓库，且要求嵌入 containerd；打开后 agent 也会听 supervisor 端口。本轮未验证 Spegel 行为。

## 实践示例

### 案例 1：README 记录的单节点安装合同

```bash
curl -sfL https://get.k3s.io | sh -
sudo kubectl get nodes
```

这是源码仓 README 写明的安装脚本路径，不是本轮实测。装完后 kubeconfig 约定在 `/etc/rancher/k3s/k3s.yaml`。默认数据目录：root 用 `/var/lib/rancher/k3s`，非 root 用 `${HOME}/.rancher/k3s`。

### 案例 2：关掉 Traefik，但不要误关整个 Ingress 能力以外的件

```bash
curl -sfL https://get.k3s.io | sh -s - --disable traefik
```

`--disable` 的合法值是 `coredns, servicelb, traefik, local-storage, metrics-server, runtimes`。想换 nginx-ingress / Istio，关 `traefik` 即可；把 `coredns` 一起关会失去默认集群 DNS。

### 案例 3：三节点嵌入 etcd，而不是「给 SQLite 加副本」

```bash
k3s server --cluster-init --token=mysecret
k3s server --server https://node1:6443 --token=mysecret
```

`--cluster-init` 的 usage 是 “Initialize a new cluster using embedded Etcd”。已有 SQLite `state.db` 时，嵌入 etcd 启动路径会尝试把 `/registry/` 迁过去并改名为 `state.db.migrated`。外接库走 `--datastore-endpoint`，不能和 `--disable-etcd` 同时用。

## 踩过的坑

1. **把 README 的「< 100 MB / 一半内存」写成当前测量**：那是仓库文案。本轮未称二进制、未测 RSS。

2. **以为默认就是嵌入 etcd**：单节点不传 `--cluster-init`、也不设 `--datastore-endpoint` 时，走 Kine；etcd 只在初始化/加入托管驱动时出现。

3. **`--disable servicelb` 和文档里的 klipper-lb 对不上号**：清单键是 `servicelb`。只关 CCM 但留着 ServiceLB，源码仍会继续跑 Klipper-lb 路径。

4. **flannel 只能 vxlan**：默认是 vxlan，但 `host-gw` 和 `wireguard-native` 是同旗标的合法值；`none` 表示自己装 CNI。

5. **把 1.28 示例版本当成当前发行**：本页绑定的上游 Kubernetes 是 `v1.36.3-k3s1`。

## 适用 vs 不适用场景

**适用**：

- 边缘 / ARM / 单进程运维，需要标准 `kubectl` 与 Helm，但不想装五件套控制面
- 单节点开发或小集群，接受默认 SQLite + Kine，或显式切嵌入 etcd / 外接库
- 想用 `--disable` 换掉 Traefik / ServiceLB / local-path，而不是重写发行版

**不适用**：

- 必须用上游 kubeadm 拓扑、节点镜像可换版本——看 [[kind]]
- 第一次学 addon / dashboard 全家桶——看 [[minikube]]
- 需要 in-tree 云盘 / 云厂商 CCM：README 写明这两类已从二进制移除，要走 CSI / 外置 CCM
- 本轮不能接受「未实际起集群」的 `UNVERIFIED` 边界

## 固定版本边界

- 本文绑定 `k3s-io/k3s@5aed4d7beddeb3e67120da477c876ac9efd70318`，轻量 tag `v1.36.3+k3s1` 直接指向该提交。
- `go.mod` 语言版本 `go 1.26.5`；Kubernetes replace 为 `v1.36.3-k3s1`。
- README 同时列出 containerd、runc、Flannel、CoreDNS、metrics-server、Traefik、Klipper-lb、kube-router netpol、helm-controller、Kine、local-path-provisioner。
- 本文未安装 k3s、未跑 `install.sh`、未起 server/agent、未测内存或启动耗时，状态保持 `UNVERIFIED`。

## 学到什么

1. **「一个二进制」是进程合同，不是「没有组件」**——打包件仍在，只是用 embed 清单和 `--disable` 开关。
2. **默认账本是 Kine 伪装的 etcd API**——SQLite 文件在 `db/state.db`；HA 要 `--cluster-init` 或外接 datastore。
3. **关掉组件要按清单键，不要按营销名**——`servicelb` / `local-storage` 才是 `--disable` 认识的名字。
4. **发行版版本号跟上游 Kubernetes 走**——`v1.36.3+k3s1` 的 `+k3s1` 只是同一上游版本上的发行序号。

## 应用型自测

1. 不传 `--cluster-init`、也不设 `--datastore-endpoint` 时，k3s 会不会自动起嵌入 etcd？
2. `--disable` 能否关掉 helm-controller？应该用哪个旗标？
3. 固定 README 把二进制体积写成「不到 70 MB」了吗？

检查点：

1. 不会。嵌入 etcd 只在 `--cluster-init` 或带 token 加入时由托管驱动选出。
2. 不能。`DisableItems` 不含 helm-controller；要用 `--disable-helm-controller`。
3. 没有。README 写的是 less than 100 MB；70 MB 是旧文案。

## 延伸阅读

- 文档：[docs.k3s.io](https://docs.k3s.io)
- 固定源码：[k3s-io/k3s](https://github.com/k3s-io/k3s) —— 本文绑定 `5aed4d7beddeb3e67120da477c876ac9efd70318`
- [[kind]] —— 容器节点 + kubeadm 的本地对照
- [[kubernetes]] —— k3s 跟踪的上游 API
- [[minikube]] —— 多 driver、addon 更齐的学习集群

## 关联

- [[kind]] —— CI / 多节点容器拓扑；不是宿主机发行版
- [[minikube]] —— 官方本地完整集群，偏学习与 addon
- [[kubernetes]] —— 被 replace 进来的上游
- [[containerd]] —— 嵌入运行时
- [[etcd]] —— `--cluster-init` 后的托管账本
- [[traefik]] —— 默认可 `--disable` 的 Ingress
- [[helm]] —— helm-controller 吃 HelmChart CRD

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[containerd]] —— containerd — Docker 和 Kubernetes 共用的那台容器运行机
- [[kaniko]] —— kaniko — 在没有 Docker 的容器里也能构建 Docker 镜像
- [[kind]] —— kind — 用容器当节点、kubeadm 起上游 Kubernetes 的本地集群
- [[linkerd2]] —— Linkerd 2 — 用 Rust 写的轻量服务网格
- [[minikube]] —— minikube — 一条命令在笔记本上起一个真 K8s 集群
