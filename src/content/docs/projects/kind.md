---
title: kind — 用 Docker 容器当 K8s 节点的本地集群
来源: https://github.com/kubernetes-sigs/kind
日期: 2026-06-01
分类: 基础设施 / 容器编排
难度: 入门
---

## 是什么

**kind** = **K**ubernetes **IN** **D**ocker。它把 K8s 的每个节点（control-plane / worker）做成一个 Docker 容器，几条命令就在你笔记本里起一个真 K8s 集群。

日常类比：

- **真集群**像一支足球队，每个球员是一台机器
- **minikube** 给你租一辆大巴拉一队人来训练（VM 或容器一台节点）
- **kind** 直接在你客厅地毯上摆 11 个机器人小球员——每个机器人就是一个 Docker 容器，11 个容器组成一支球队
- 因为是容器套容器（Docker-in-Docker），**启动只要 10-30 秒**，比 minikube 快 2-3 倍

仓库 15k+ Star，Apache-2.0，Go 写的。2018 年 Google 工程师 Benjamin Elder 起的项目，现在归 Kubernetes SIG-Testing 维护。**K8s 项目自己的 CI 跑端到端测试就是用 kind**——这是最强的可信度证明：K8s 团队信任它能复现真实集群的行为。

## 为什么重要

如果只学一个本地 K8s 工具，kind 是 CI / 自动化场景的事实标准：

- **K8s 自己的 e2e 测试用它**——你写的 controller / operator 想跑 K8s 官方 conformance 测试，kind 是最近的复现环境
- **GitHub Actions 里大量 K8s 相关 workflow 用 kind**——`helm/kind-action` 很常见，因为它启动快、不依赖虚拟化、CI runner 上能跑
- **多集群拓扑零成本**——`kind create cluster --name a` / `--name b`，一条命令再起一个，测 cluster federation / multi-cluster mesh 不用开第二台机器
- **节点数量随便加**——配置文件里写几个 control-plane 几个 worker，kind 就起几个容器；测调度策略 / Pod affinity / taint 不用真买机器

注意 kind 和 [[minikube]] 的分工：**学 K8s 概念、装 ingress、跑 dashboard** 选 minikube（addons 齐）；**跑 CI、测 operator、起多集群** 选 kind（快、轻、可脚本化）。

## 核心要点

kind 的关键设计可以拆成 **三件事**：

1. **节点 = 容器**：用 `kindest/node` 镜像启动 Docker 容器，容器里跑 systemd / kubelet / containerd / kube-apiserver。**容器版本绑 K8s 版本**——`kindest/node:v1.29.0` 起的就是 K8s 1.29 集群，换版本只换镜像 tag，不改 kind 二进制。

2. **声明式拓扑**：写一个 YAML 描述要几个节点、什么角色、什么端口映射，kind 一键拉起。

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

   这就是一个 1 control-plane + 2 worker 的集群，外加把容器 80 端口暴露到主机 80。

3. **本地镜像直送**：和 minikube 一样，本机 `docker build` 出来的镜像默认进不了 kind 集群（kind 容器里跑的是另一个 containerd）。用 `kind load docker-image myapp:dev`，kind 会把镜像 tar 出来塞进每个节点容器。比 minikube 的 `image load` 命令一致，直觉相同。

这三件事共同保证：**你拿 K8s 官方 YAML 在 kind 上跑通的东西，云上 EKS / GKE 上一行不改也跑得通**——因为 kind 用的是真 kubeadm，CNCF Conformance 测试通过。

## 实践案例

### 案例 1：30 秒起一个集群

```bash
brew install kind                    # macOS
kind create cluster                  # 默认 1 节点集群
kubectl get nodes
# NAME                 STATUS   ROLES
# kind-control-plane   Ready    control-plane

docker ps                            # 你能看到那个节点其实是容器
# CONTAINER ID   IMAGE                  ...
# abc123def456   kindest/node:v1.29.0   ...
```

`kind create cluster` 背后做了：拉 `kindest/node` 镜像、起容器、跑 kubeadm init、把 kubeconfig 写到 `~/.kube/config`、把当前 context 切到 `kind-kind`。SSD + 已缓存镜像下 10-20 秒。

### 案例 2：起多节点 + 多集群

```bash
# 多节点
cat > 3nodes.yaml <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF
kind create cluster --config 3nodes.yaml --name big

# 同时再起一个独立集群
kind create cluster --name small

# 列出当前所有 kind 集群
kind get clusters
# big
# small

# 切换 kubectl 上下文
kubectl config use-context kind-big
```

这种"同时跑多个集群"的能力是 kind 的杀手锏——测 cluster mesh / federation / multi-tenant 场景，minikube 默认只起一个。

### 案例 3：CI 里跑 K8s e2e

GitHub Actions 标准写法：

```yaml
- uses: helm/kind-action@v1
  with:
    node_image: kindest/node:v1.29.0
- run: kubectl apply -f manifests/
- run: kubectl wait --for=condition=ready pod --all --timeout=120s
- run: ./run-e2e-tests.sh
```

CI runner 上 30 秒就有了真集群，跑完测试自动 destroy。**这是 kind 区别于其他本地 K8s 工具的核心价值**：minikube 在 CI 上启动慢、依赖虚拟化、容易超时。

## 踩过的坑

1. **镜像必须 `kind load`**——和 minikube 同一个坑：本机 `docker build` 完直接 `kubectl run` 一定 `ImagePullBackOff`。要么 `kind load docker-image myapp:tag`，要么推到真 registry。

2. **节点镜像版本绑 K8s 版本**——想测 K8s 1.28 / 1.29 / 1.30 行为差异，必须显式 `--image kindest/node:v1.28.x`。kind 自己的 release notes 会列每个 kind 版本支持的 K8s 版本范围，跨太远会失败。

3. **LoadBalancer 默认 pending**——kind 没内置 cloud-provider，Service type=LoadBalancer 拿不到 EXTERNAL-IP。两条路：装 [metallb](https://metallb.universe.tf/)，或用官方 [cloud-provider-kind](https://github.com/kubernetes-sigs/cloud-provider-kind) sidecar。生产 EKS / GKE 上是云厂商自动给 LB IP，kind 上要自己补这一块。

4. **ingress 要在 config 里开 extraPortMappings**——默认容器端口不暴露到主机，装完 ingress-nginx 你 curl localhost 也通不了。建集群时就要写 `extraPortMappings: [{containerPort: 80, hostPort: 80}]`，集群起来后再改不了。

5. **macOS / Windows 多一层 VM**——Docker Desktop 在 mac/win 上本身就是个 VM，kind 容器跑在 VM 里，文件挂载、网络性能都受 VM 限制。Linux 原生 Docker 上 kind 体验最好。

## 适用 vs 不适用

**适用**：

- CI / GitHub Actions 跑 K8s e2e 测试（启动快、可脚本化）
- 测 controller / operator / CRD（多集群 / 多节点零成本）
- K8s 版本兼容性测试（换 node image tag 即可切版本）
- 写 K8s 教程 / 演示需要 reproducible 起点
- 本地开发跑一个长存集群（资源占用比 minikube 低）

**不适用**：

- 第一次学 K8s 概念 → 选 [[minikube]]，addons / dashboard 更齐
- 极轻量边缘部署 → 选 [[k3s]]（裁剪版，资源更省）
- 不需要真 K8s API 兼容性 → 直接 [[docker]] compose
- 笔记本 4 GB 内存以下 → 单节点能跑，多节点会 OOM

## 和兄弟工具的对比

| 工具 | 启动方式 | 启动速度 | 多集群 | CI 友好 | 完整 K8s |
|------|---------|---------|-------|--------|---------|
| kind | Docker-in-Docker | 10-30s | 极易 | 强 | 是 |
| minikube | VM 或容器（多 driver） | 30-60s | 一般 | 中 | 是 |
| k3d | k3s in Docker | 5-10s | 易 | 强 | 否（裁剪） |
| k3s | 主机进程 | 5s | 难 | 弱 | 否（裁剪） |
| Docker Desktop K8s | Docker Desktop 内置 | 一键 | 不支持 | 弱 | 是 |

**选择心法**：CI / 多集群 → kind；学 K8s 概念 → minikube；ARM / 边缘 → k3s。

## 学到什么

1. **CI 工具的核心是启动速度**——kind 比 minikube 快 2-3 倍这件事，决定了它在 GitHub Actions 上的统治地位；CI 每次跑都付出几十秒成本，乘以 commit 数就是巨大账单
2. **Docker-in-Docker 不是 hack，是抽象**——把"节点"这层抽象化成容器，比传统的"节点 = VM"省一层模拟开销，但仍保留 K8s API 完全一致
3. **K8s 项目自己用 kind 测自己**——这是工具可信度的最强信号；你写的工具被你的上游项目当 CI 基础设施用，意味着兼容性 / 稳定性会被持续打磨
4. **配置即拓扑**——一个 YAML 决定起几个节点 / 什么角色 / 什么端口，可 diff 可 review 可 commit；这种"基础设施声明式"是 K8s 自己的设计哲学，kind 把它向下递归到自己

## 延伸阅读

- 官方文档：[kind.sigs.k8s.io](https://kind.sigs.k8s.io/)（quickstart / 配置 / known issues）
- GitHub：[kubernetes-sigs/kind](https://github.com/kubernetes-sigs/kind)
- GitHub Actions 集成：[helm/kind-action](https://github.com/helm/kind-action)
- LoadBalancer 支持：[cloud-provider-kind](https://github.com/kubernetes-sigs/cloud-provider-kind)
- [[kubernetes]] —— kind 跑的就是它
- [[minikube]] —— 学概念用它，跑 CI 用 kind
- [[docker]] —— kind 节点的载体

## 关联

- [[kubernetes]] —— kind 节点跑的是真 kubeadm 起的 K8s
- [[minikube]] —— 同类工具，学概念 / 装 addon 选 minikube；跑 CI / 多集群选 kind
- [[k3s]] —— 极轻量裁剪版，边缘场景的对手
- [[docker]] —— kind 节点本质是 Docker 容器
- [[helm]] —— 在 kind 上调试 chart 是标准做法
