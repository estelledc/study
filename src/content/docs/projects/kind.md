---
title: kind — 用容器当节点、kubeadm 起上游 Kubernetes 的本地集群
description: 介绍 kind v0.33.0 如何把 Docker/Podman/nerdctl 容器当成节点，再按 kubeadm init/join 拉起可换版本的本地集群。
来源: https://github.com/kubernetes-sigs/kind
日期: 2026-08-27
分类: 基础设施 / 容器编排
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/kubernetes-sigs/kind
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 407a9675e6d9af1200b5f57f9ca52ec6cdacce74
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.33.0
---

## 是什么

kind（Kubernetes IN Docker）是 SIG-Testing 维护的本地集群工具：每个节点是一个容器，容器里再跑 kubeadm。日常类比：你不租球场，而是在客厅摆一组穿球衣的机器人——每个机器人是 `kindest/node` 容器，11 个容器就能排出控制面和 worker。

固定 tag `v0.33.0` 的 CLI 版本常量是 `versionCore = "0.33.0"`。默认节点镜像写在 `pkg/apis/config/defaults/image.go`：

```text
kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5
```

```bash
kind create cluster
kubectl cluster-info --context kind-kind
```

默认集群名是 `kind`。本页没有真正创建集群。

## 为什么重要

不读固定 0.33.0 源码，旧笔记会把三件事写错：

- 默认节点还是 `kindest/node:v1.29.0`——当前默认是 **Kubernetes 1.37.0** 的 digest 锁定镜像
- kind 只能绑 Docker——`KIND_EXPERIMENTAL_PROVIDER` 还能切 `podman` / `nerdctl` / `finch` / `nerdctl.lima`
- `kind load docker-image` 是「共享 daemon」——它先 `docker image inspect`，再 `docker save` 成 tar，最后 `LoadImageArchive` 灌进节点自己的 containerd

它和 [[k3s]] 的对照是：**kind 跑的是上游 kubeadm 拓扑**；k3s 跑的是裁剪过的单进程发行版。

## 核心要点

`kind create cluster` 的固定主链是：

1. **校验并补默认配置**：没有 `nodes` 就生成 1 个 `control-plane`；IPv4 默认 `APIServerAddress=127.0.0.1`、`PodSubnet=10.244.0.0/16`、`ServiceSubnet=10.96.0.0/16`、`kubeProxyMode=iptables`。集群名超过 50 字符会警告（后面还要拼 `-control-plane`）。

2. **Provider 先起容器**：`p.Provision` 按节点列表造容器。失败且未 `--retain` 时直接 `delete.Cluster`。

3. **动作流水线**：外部 load balancer → 写 kubeadm 配置 → `kubeadm init` →（除非 `networking.disableDefaultCNI`）安装节点上的 `/kind/manifests/default-cni.yaml` → 安装默认 StorageClass → `kubeadm join` → 等待 Ready → 导出 kubeconfig。多于一个 control-plane 时，配置注释写明会隐式加外部控制面负载均衡。

4. **镜像跨 daemon**：`kind load docker-image` 只接受本机已有镜像；节点上已有同 ID 但缺 tag 会先尝试 re-tag，否则 save/load。

5. **运行时选择**：默认走探测到的 Docker；`KIND_EXPERIMENTAL_PROVIDER` 非空才覆盖。未知取值会被忽略并打警告。

## 实践示例

### 案例 1：默认单节点

```bash
kind create cluster
kubectl get nodes
```

不传 `--config` 时，`SetDefaultsCluster` 只放一个 control-plane，镜像为上面的 `kindest/node:v1.37.0@sha256:…`。`--name` 覆盖 `KIND_CLUSTER_NAME` 和配置里的 `name`。`--wait` 默认 `0s`，不阻塞等 Ready。

### 案例 2：声明式多节点 + 端口映射

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
  - role: worker
  - role: worker
```

```bash
kind create cluster --config 3nodes.yaml --name big
```

`extraPortMappings` 建集群时就要写；流水线没有「起来后再改映射」的步骤。Ingress 要在主机访问时，必须靠这张表，而不是假定容器 80 已经在 localhost。

### 案例 3：把本机镜像送进节点

```bash
kind load docker-image myapp:dev --name big
```

源码先 `docker image inspect -f '{{ .Id }}'`。镜像不在本机就直接报 `not present locally`。随后 `docker save -o <tmp>/images.tar`，对每个还没有该 ID 的节点调用 `LoadImageArchive`。

## 踩过的坑

1. **把 README 安装示例里的 `v0.32.0` 当成这个 tag 的 CLI**：`pkg/cmd/kind/version` 已是 `0.33.0`，但 README / `go install` 示例仍写 `@v0.32.0`。以剥皮提交和 `versionCore` 为准。

2. **本机 `docker build` 完直接 `kubectl run`**：节点里是另一份 containerd。必须 `kind load docker-image`，或推到节点能拉的仓库。

3. **Service `LoadBalancer` 会自动有 EXTERNAL-IP**：kind 自己的 create 流水线不装云厂商 CCM。旧笔记里的 MetalLB / `cloud-provider-kind` 是集群建好之后的外置步骤，不在本 tag 的 create actions 里。

4. **换 Kubernetes 小版本只改 kind 二进制**：节点镜像才绑 K8s 版本。用 `--image` 或每个 `Node.Image` 覆盖默认 digest。

5. **把「10–30 秒起集群」写成 SLA**：本轮未拉镜像、未计时。

## 适用 vs 不适用场景

**适用**：

- CI 或本机需要 **真 kubeadm、可换 K8s 小版本** 的 e2e
- 一份 `v1alpha4` YAML 描述多 control-plane / worker / 端口映射
- 接受 Docker（或实验性 Podman / nerdctl）作为节点载体

**不适用**：

- 边缘单二进制、默认 SQLite、打包 Traefik——看 [[k3s]]
- 第一次学 Ingress / dashboard addon——看 [[minikube]]
- 不需要 Kubernetes API，只想编排容器——直接 [[docker]] compose
- 本轮要把「已跑通集群」写成证据——状态仍是 `UNVERIFIED`

## 固定版本边界

- 本文绑定 `kubernetes-sigs/kind@407a9675e6d9af1200b5f57f9ca52ec6cdacce74`，annotated tag `v0.33.0` 剥皮后指向该提交。
- CLI `versionCore` 为 `0.33.0`；`go.mod` 最低语言版本是 `go 1.17`。
- 默认节点镜像是 `kindest/node:v1.37.0` 加 sha256 digest，不是浮动 `latest`。
- 本文未安装 kind、未调用 Docker/Podman、未创建或删除集群、未测启动耗时，状态保持 `UNVERIFIED`。

## 学到什么

1. **节点镜像才是 Kubernetes 版本合同**——kind 二进制版本和 `kindest/node` tag 要分开读。
2. **create 是一条固定动作链**——CNI 和 StorageClass 是可选跳过 / 必装的步骤，不是 addon 菜单。
3. **跨 daemon 必须走 tar**——`load docker-image` 的本质是 save + 向节点导入。
4. **多控制面会多一个非 Kubernetes 节点**：外部 load balancer 角色在常量里单独列出。

## 应用型自测

1. 不写 `nodes` 时，kind 会起几个节点、默认角色是什么？
2. `kind load docker-image` 在本机没有该镜像时会不会去仓库拉？
3. 默认节点镜像的 Kubernetes 版本是 1.29 还是 1.37？

检查点：

1. 一个节点，角色 `control-plane`。
2. 不会。`image inspect` 失败就返回 `not present locally`。
3. 1.37。默认常量是 `kindest/node:v1.37.0@sha256:a1ed56…`。

## 延伸阅读

- 文档：[kind.sigs.k8s.io](https://kind.sigs.k8s.io/)
- 固定源码：[kubernetes-sigs/kind](https://github.com/kubernetes-sigs/kind) —— 本文绑定 `407a9675e6d9af1200b5f57f9ca52ec6cdacce74`
- [[k3s]] —— 宿主机单二进制发行版对照
- [[minikube]] —— addon / 多 driver 的学习对照
- [[kubernetes]] —— kubeadm 拉起的上游

## 关联

- [[k3s]] —— 裁剪发行版，不是 kubeadm 容器节点
- [[minikube]] —— 学概念与 addon 时更常选
- [[kubernetes]] —— kind 节点里跑的就是它
- [[docker]] —— 默认 provider
- [[helm]] —— 常见的 chart 调试载体

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/k3s]] —— k3s — 单进程发行版把控制面、Kine 与打包组件收进一个二进制
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[minikube]] —— minikube — 一条命令在笔记本上起一个真 K8s 集群
- [[skaffold]] —— Skaffold — K8s 本地开发的 build-deploy 自动循环
