---
title: k3s — 把完整 K8s 塞进一个 60 MB 的二进制
来源: https://github.com/k3s-io/k3s
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 入门
provenance: pipeline-v3
---

## 是什么

**k3s** 是 Rancher Labs 2019 年推出的轻量级 Kubernetes 发行版：把完整 K8s 的控制平面打包成**一个不到 70 MB 的 Go 单二进制**，500 MB 内存就能跑起来。

日常类比：

- 完整 Kubernetes 像**整套商业厨房**——冰柜、烤箱、洗碗机、备餐台分成 5 台机器，要专人维护，开火前先开半小时
- k3s 像**露营用的多功能炊具**——一个小箱子里折叠出灶、锅、刀、铲，一插电就能做四菜一汤；功能砍了一些（不能同时做 100 人的菜），但能跑就行
- 同样的菜谱（YAML），同样的味道（API 兼容），换个炉子做出来

名字由来：K8s 是 Kubernetes 的缩写（K + 中间 8 个字母 + s 共 10 字符），k3s 取它一半的字符数（K + 3 + s = 5），意思是 **"半个 K8s"**——资源占用减半，功能保留主干。

由 Rancher CTO Darren Shepherd 主导开发，2020 年捐给 CNCF 沙箱，2022-08 毕业为 CNCF 孵化项目。

## 为什么重要

不用 k3s，下面这些场景就很尴尬：

- **树莓派 / 工控机想跑 K8s**——完整 K8s 内存吃 2 GB 起步，4 GB 的小板根本跑不动；k3s 在 1 GB ARM 板上能跑全套
- **边缘节点 / IoT 网关**——CDN 节点、工厂网关这种"人在偏远地方机器在更偏远地方"的场景，部署越简单越好；k3s 一条 `curl | sh` 装完
- **本地开发替代 minikube**——minikube 要起虚拟机或 Docker，k3s 直接在宿主机跑进程，启动 10 秒不是 60 秒
- **CI 测试环境**——GitLab Runner / Jenkins 节点上需要一个真 K8s 跑 e2e 测试，k3s 比 kind 启动快、比 minikube 资源省

## 核心要点

k3s 砍掉的、替换的、保留的，可以拆成 **三类设计决策**：

1. **单二进制塞进所有控制平面组件**：完整 K8s 的 `kube-apiserver` / `kube-scheduler` / `kube-controller-manager` / `kubelet` / `kube-proxy` 是 5 个独立进程，k3s 把它们**静态链接成一个 Go 二进制**，启动一个进程 = 完整 K8s。类比：把瑞士军刀的所有刀片焊成一把折叠刀。

2. **元数据存储默认 SQLite，不是 etcd**：完整 K8s 用 etcd 存集群状态（5 节点起步保证 HA），k3s 单节点默认用 SQLite 文件——一个文件就是整个集群的"账本"。多节点 HA 才切回嵌入式 etcd 或外接 MySQL/Postgres。

3. **替换重组件 + 移除废功能**：containerd 替代 Docker、flannel 替代 calico、traefik 替代 nginx-ingress、klipper-lb 替代 MetalLB；同时移除 in-tree 云厂商插件、in-tree 存储驱动、alpha 特性、过期 API。

API 100% 兼容标准 K8s——`kubectl` 命令、`kubeconfig`、Helm chart 都直接能用。

## 实践案例

### 案例 1：60 秒装好一个单节点 K8s

```bash
curl -sfL https://get.k3s.io | sh -
sudo kubectl get nodes
# NAME      STATUS   ROLES                  AGE   VERSION
# my-pi     Ready    control-plane,master   12s   v1.28.5+k3s1
```

完整 K8s 走 kubeadm 至少要：装 docker → 装 kubelet/kubeadm/kubectl → 配置 systemd cgroup → `kubeadm init` → 装网络插件，**5 步起 30 分钟**。

### 案例 2：默认装了什么、怎么关掉

`curl | sh` 跑完，集群里已经躺好了：

- `traefik`（Ingress 控制器，端口 80/443）
- `klipper-lb`（LoadBalancer，把 Service 直接绑到节点 IP）
- `local-path-provisioner`（默认 StorageClass，把 PVC 映射成节点本地目录）
- `coredns`（DNS）

不想要 traefik？`curl -sfL https://get.k3s.io | sh -s - --disable traefik`，启动时直接关掉。

### 案例 3：HA 多节点（生产场景）

单节点 SQLite 挂了集群挂了，生产必须 HA：

```bash
# 第一台 server 节点
curl -sfL https://get.k3s.io | sh -s - server \
  --cluster-init \
  --token=mysecret

# 第二、三台 server 节点
curl -sfL https://get.k3s.io | sh -s - server \
  --server https://node1:6443 \
  --token=mysecret
```

`--cluster-init` 把 SQLite 切成嵌入式 etcd，3 个 server 节点组成 raft 集群。这是 k3s 推荐的"中等规模 HA"方案——比外接 etcd/MySQL 简单，比单节点可靠。

## 踩过的坑

1. **默认 SQLite 不支持高可用**——单节点挂 = 集群挂；上生产必须切嵌入式 etcd 或外接 DB，别图省事
2. **traefik 默认占 80/443**——如果你想用 nginx-ingress / istio，必须 `--disable traefik` 启动，否则端口冲突
3. **klipper-lb 太简单**——只把 Service 直接绑节点 IP，没有 BGP / ECMP / VIP 漂移；生产要换 MetalLB 或云厂商 LB
4. **flannel 默认只有 vxlan 后端**——跨子网性能差、没 NetworkPolicy；要做 zero-trust 网络考虑换 cilium
5. **升级机制和主流 K8s 不一样**——k3s 升级是"换二进制"（systemd unit 重启），不是 `kubeadm upgrade`；写自动化时要注意

## 适用 vs 不适用场景

**适用**：

- 边缘 / IoT / ARM 设备上的 K8s（树莓派、工控机、车载网关）
- 单团队 / 小集群（< 50 节点）的生产环境
- 本地开发、CI e2e 测试、培训演示
- Rancher 多集群管理产品的内嵌"管理集群"

**不适用**：

- 超大规模集群（> 500 节点）——核心 K8s 更稳定，调优空间更大
- 强合规场景需要厂商支持的——选 OpenShift / GKE / EKS，k3s 是社区项目
- 需要完整云厂商集成（云盘、云 LB、云 DNS）——k3s 砍掉了 in-tree provider，要自己装 CSI / cloud-controller

## 生态相关项目

- **k3d**：在 Docker 容器里跑 k3s（类似 kind），更轻；本地开发一条命令起多节点集群
- **Rancher Desktop**：Mac / Windows 桌面 K8s，底层就是 k3s
- **k3os**：整个操作系统围绕 k3s 构建，启动即 K8s（已停止维护，被 Rancher Elemental 替代）

## 跟它相邻的"轻量 K8s"工具谁选谁

| 工具 | 节点形态 | 主要场景 | 跟 k3s 的差异 |
|------|----------|----------|----------------|
| minikube | VM 或 Docker | 本地开发 | 启动慢、资源吃得多、偏开发不偏生产 |
| kind | Docker 容器 | CI 测试 | 节点是容器不是真机器，没法上边缘 |
| microk8s | Snap 包 | Ubuntu 生态 | 依赖 systemd + snap，Linux 之外不友好 |
| k3s | 单二进制 | 边缘 + 小生产 | 任何 Linux 都跑，可上 ARM、可 HA |

## 历史小故事（可跳过）

- **2019-02**：Rancher Labs 开源 k3s，最初 GitHub README 第一行是 "Lightweight Kubernetes. 5 less than k8s"
- **2020-08**：Rancher 把 k3s 捐给 CNCF，进入沙箱
- **2020-12**：SUSE 收购 Rancher Labs，k3s 项目继续在 CNCF 治理下独立发展
- **2022-08**：k3s 从 CNCF 沙箱晋升为孵化项目（Incubating）
- **2024**：k3s GitHub 突破 27k star，成为最流行的轻量 K8s 发行版

## 学到什么

1. **"砍掉非必要"也是一种产品力**——完整 K8s 想覆盖所有云厂商所有场景，k3s 大胆砍掉 80% 让 20% 跑得飞起
2. **单二进制部署的复利**——一个文件解决依赖、版本、升级、回滚四个问题，运维心智负担骤降
3. **API 兼容是上限**——k3s 实现可以激进重写，但 K8s API 必须 100% 兼容，否则 Helm chart 全废、用户教育成本无穷
4. **边缘场景驱动主流创新**——树莓派跑 K8s 听起来像玩具，但逼出来的"轻量化"思路反向影响了云厂商发行版

## 延伸阅读

- 官方文档：[docs.k3s.io](https://docs.k3s.io)（架构图 + 配置参数最全）
- 设计动机：[Why we built K3s](https://www.rancher.com/blog/2019/2019-02-26-introducing-k3s-the-lightweight-kubernetes-distribution-built-for-the-edge)（Darren Shepherd 2019 博客）
- 视频：[CNCF KubeCon — k3s deep dive](https://www.youtube.com/results?search_query=k3s+deep+dive+kubecon)
- 源码入口：[github.com/k3s-io/k3s](https://github.com/k3s-io/k3s)，从 `cmd/server/main.go` 看单二进制怎么 demux 子命令

## 关联

- [[kubernetes]] —— k3s 是它的轻量发行版，API 100% 兼容
- [[containerd]] —— k3s 内嵌的容器运行时，替代 Docker
- [[etcd]] —— 多节点 HA 模式下 k3s 用嵌入式 etcd 存元数据
- [[traefik]] —— k3s 默认 Ingress 控制器
- [[helm]] —— k3s 集群里直接能用 Helm 装 chart
- [[kustomize]] —— 给 k3s 写 yaml 时常配套用的覆盖工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[containerd]] —— containerd — Docker 和 Kubernetes 共用的那台容器运行机
- [[etcd]] —— etcd — 分布式键值数据库
- [[helm]] —— Helm — Kubernetes 包管理器
- [[kaniko]] —— kaniko — 在没有 Docker 的容器里也能构建 Docker 镜像
- [[kind]] —— kind — 用 Docker 容器当 K8s 节点的本地集群
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[kustomize]] —— Kustomize — 不动原 YAML 的 K8s 配置叠加器
- [[linkerd2]] —— Linkerd 2 — 用 Rust 写的轻量服务网格
- [[minikube]] —— minikube — 一条命令在笔记本上起一个真 K8s 集群

