---
title: k3s — 把整个 Kubernetes 装进一个 70 MB 的二进制
来源: Rancher Labs 2019, github.com/k3s-io/k3s（CNCF 沙箱项目）
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

k3s 是 Rancher Labs 在 2019 年开源的**一个轻量级 Kubernetes 发行版**。日常类比：完整版 Kubernetes 像一整套宜家家具——桌椅床柜分箱送来，要自己拼一周；k3s 像一台便携折叠桌——打开就用，重量只有原来的三分之一。

你只需要一行命令：

```bash
curl -sfL https://get.k3s.io | sh -
```

几秒钟之后，你的机器上就有一个**能跑的 Kubernetes 集群**——api-server、scheduler、controller-manager、kubelet、kube-proxy 全在里面。

它的核心承诺：**单个 Go 二进制，约 60-70 MB；512 MB 内存就能跑控制平面**。

名字来由也是个梗：Kubernetes 缩写成 `K8s`（K + 8 个字母 + s = 10 字符），k3s 取一半字符（5 字符），意思是 "K8s 的一半"——但能跑的功能并不是一半。

## 为什么重要

不理解 k3s，下面这些事都没法解释：

- 为什么有人能在 **树莓派 4** 上跑生产级 K8s 集群——完整 K8s 占 1 GB+，树莓派内存全吃掉
- 为什么 Rancher Desktop / k3d / Rancher 的多集群产品**底层都是 k3s**——它是 Rancher 整个生态的发动机
- 为什么"边缘 K8s"这个赛道在 2020 年之后才热起来——k3s 把门槛降到让 IoT 厂家也敢上 K8s
- 为什么本地开发常选 k3d 而不是传统 minikube VM driver——k3d 复用 Docker，冷启动常在十几秒内；minikube 的 VM driver 首次还要拉镜像、等虚拟机就绪

## 核心要点

k3s 的"轻"不是删功能，而是**三个工程决定**叠加：

1. **单二进制静态链接**：把 api-server / scheduler / controller-manager / kubelet / kube-proxy 全部静态编译进一个 Go binary。启动这个进程 = 启动整个 K8s。完整 K8s 需要单独安装 5+ 个组件。

2. **替换沉重默认组件**：etcd → SQLite（单节点）或嵌入式 etcd（多节点）；Docker → containerd；calico → flannel；nginx-ingress → traefik；MetalLB → klipper-lb。每一个替换都选了**更轻、依赖更少**的方案。

3. **砍掉非必要代码**：移除 in-tree 云厂商驱动（aws / gce / azure 那些）、in-tree 存储驱动、alpha 特性、过期 API。它们对边缘场景没用，但占体积。

三步加起来，binary 从 200 MB+ 压到 70 MB，控制平面内存从 2 GB 压到 512 MB。

## 实践案例

### 案例 1：在一台 4GB 内存的 ARM 单板机上跑 K8s

```bash
# server 节点（控制平面）
curl -sfL https://get.k3s.io | sh -

# 等 5 秒，k3s 就起来了
sudo k3s kubectl get nodes
# NAME       STATUS   ROLES                  AGE   VERSION
# raspi-01   Ready    control-plane,master   5s    v1.28.5+k3s1
```

无需安装 etcd、无需配网络插件、无需配 kubelet——**全部内置**。换成完整 K8s 你需要 kubeadm + 大约 30 分钟教程时间。

### 案例 2：本地开发的快速集群（k3d）

k3d 是把 k3s 装进 Docker 容器的工具，比 kind 还轻：

```bash
k3d cluster create dev --servers 1 --agents 2
# 创建一个 1 server + 2 agent 的本地 K8s 集群
# 总耗时：约 15 秒
```

**对比 minikube（VM driver）**：传统路径要先拉 VM 镜像（500 MB+），首次常要一分钟量级。k3d 直接复用本机 Docker，通常十几秒内就绪（minikube 也有 Docker driver，但 k3d 仍更轻、专为「丢弃式」本地集群设计）。

### 案例 3：HA 模式（多节点高可用）

默认 SQLite 是单节点的，不支持高可用。生产场景切换到嵌入式 etcd：

```bash
# 第一台 server 节点
curl -sfL https://get.k3s.io | sh -s - server --cluster-init

# 第二、三台 server 节点
curl -sfL https://get.k3s.io | sh -s - server --server https://<node1>:6443
```

三台 server 节点形成 etcd 集群，任意一台挂了集群继续工作。这种 "默认 SQLite，需要时切 etcd" 的渐进设计是 k3s 的工程哲学。

## 踩过的坑

1. **默认 SQLite 不能 HA**：单节点 server 挂了，整个集群不可用。生产环境**必须**用 `--cluster-init` 切换到嵌入式 etcd 或外接数据库（MySQL / Postgres）。

2. **自带 traefik 可能冲突**：k3s 默认装了 traefik 作为 ingress controller，如果你想用 nginx-ingress，必须启动时加 `--disable traefik`，否则两者抢 80/443 端口。

3. **klipper-lb 不是真正的 LoadBalancer**：它是简化版，用 hostPort 转发，没有 BGP 也没有 ECMP。生产环境要换成 MetalLB 或云厂商 LB。

4. **flannel 默认 vxlan 跨子网慢**：对于跨机房的边缘部署，vxlan 加密开销 + UDP 封包开销，性能下降明显。建议换 cilium（基于 eBPF）。

5. **升级方式和主流 K8s 不一样**：完整 K8s 用 `kubeadm upgrade`；k3s 直接替换二进制（`curl ... | sh -` 重跑一次）。这导致很多 K8s 教程对 k3s 不直接适用。

## 适用 vs 不适用场景

**适用**：
- 边缘计算 / IoT 网关 / 工厂控制器（ARM 友好，资源占用低）
- 本地开发集群（k3d 一键启动）
- CI/CD 跑 K8s 集成测试（启动快，可丢弃）
- 树莓派集群、家庭实验室、Homelab
- Rancher 多集群管理的目标集群

**不适用**：
- 大规模生产 K8s（>50 节点）→ 用完整 K8s + 专业 etcd 集群
- 需要云厂商深度集成（CSI / CCM）→ 完整 K8s 的 in-tree 驱动更稳
- 团队已有 K8s 运维体系 → 切 k3s 反而要重新培训
- 严格合规场景（金融 / 医疗）→ k3s 的精简组件可能不在合规清单里

## 历史小故事（可跳过）

- **2019-02**：Rancher 的 CTO Darren Shepherd 在 GitHub 开源 k3s。当时 K8s 已是云原生标准，但"边缘 K8s"还是个无人问津的赛道。
- **2020-08**：Rancher 把 k3s 捐赠给 CNCF，进入**沙箱（Sandbox）**阶段。
- **2020-12**：SUSE 收购 Rancher Labs，k3s 也跟着进了 SUSE 体系。
- **2025-2026**：维护者提交 CNCF 孵化（Incubating）申请并补安全自评等材料；截至 2026 中，官网仍标注为 Sandbox，尚未升到孵化级。
- **2023+**：边缘 AI 兴起，k3s 成了边缘节点跑模型的常见底座之一。

## 学到什么

1. **"轻"不是删功能，是换组件**——k3s 没去掉 K8s 的核心 API，只是把所有重组件换成轻量替代
2. **单二进制是工程红利**——分发简单、启动快、依赖少；Go 的静态链接是关键技术基础
3. **默认配置 = 大多数人的选择**——SQLite 默认让 80% 单节点用户开箱即用，有需要再切 etcd
4. **生态比内核更重要**——k3s 真正的价值是 Rancher / k3d / Rancher Desktop 这一整套配套工具
5. **渐进式工程**——单节点 SQLite → 多节点嵌入式 etcd → 外接数据库，三层方案对应三种规模，不强迫小用户上 HA
6. **"砍 alpha 特性"是个被低估的策略**——主流 K8s 每个 release 都带新 alpha，长期占体积；k3s 砍掉它们换来更小 binary、更快启动、更少 CVE 面

## 延伸阅读

- 官网快速上手：[k3s.io](https://k3s.io)
- 完整文档：[docs.k3s.io](https://docs.k3s.io)
- 源码（CNCF 项目）：[github.com/k3s-io/k3s](https://github.com/k3s-io/k3s)
- 在 Docker 里跑 k3s：[k3d.io](https://k3d.io)
- [[containerd]] —— k3s 默认的容器运行时
- [[etcd]] —— k3s HA 模式底层的元数据存储

## 关联

- [[containerd]] —— k3s 内置的容器运行时，替代了 Docker
- [[etcd]] —— k3s HA 模式底层用嵌入式 etcd，单节点用 SQLite
- [[cilium]] —— k3s 默认 flannel 性能不够时常见的替换网络插件
- [[traefik]] —— k3s 默认捆绑的 ingress controller

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[containerd]] —— containerd — Docker 和 Kubernetes 共用的那台容器运行机

