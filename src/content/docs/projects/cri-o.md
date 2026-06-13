---
title: CRI-O — 只为 Kubernetes 而生的瘦身版容器运行时
来源: CRI-O GitHub, https://github.com/cri-o/cri-o
日期: 2026-05-31
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

CRI-O 是一套**只做一件事的容器运行时**——把 Kubernetes 发来的指令翻译成 Linux 容器进程。它不带 build、不带 compose、不带通用 CLI，K8s 之外的世界它不接。

日常类比：containerd 像一台**多功能微波炉**——加热、解冻、烧烤、发酵都行，谁都能用；CRI-O 则像**外卖店的专用蒸柜**——只接外卖系统的订单，不卖给散客，但因为只服务一个客户，腔体小、维护简单、出问题点也少。

名字本身就是它的定位说明：**CRI**（K8s Container Runtime Interface）+ **OCI**（Open Container Initiative 镜像和运行时标准）。两个标准之间的一根管子，仅此而已。

集群里跑起来大致这样：

```
kubelet → CRI（gRPC） → crio 守护进程 → conmon（每容器一个） → runc → 容器进程
```

K8s 节点上看不到 docker 命令，调试容器要用 `crictl`：

```bash
crictl ps           # 列正在跑的容器
crictl images       # 列镜像
crictl logs <id>    # 看容器日志
```

## 为什么重要

不理解 CRI-O，下面这些事就讲不通：

- 为什么 OpenShift / RHEL 集群默认不是 containerd 而是 CRI-O——Red Hat 2016 年发起这个项目就是要给自家发行版一个不依赖 Docker 的运行时
- 为什么 K8s 现在有 containerd 和 CRI-O **两个主流运行时**——前者是通用底座，后者是 K8s 专用瘦身版
- 为什么 CRI-O 版本号长得像 K8s（1.28、1.29、1.30）——它**严格跟 K8s minor version 对齐**，K8s 1.28 集群必须配 CRI-O 1.28
- 为什么排查容器问题要换工具：以前 `docker exec`，现在 `crictl exec`——CRI-O 不提供 docker 兼容层

## 核心要点

CRI-O 的世界由三层组件咬合：

1. **crio 守护进程**：Go 写的主程序，监听 CRI gRPC 接口（kubelet 是唯一客户端），负责镜像拉取、容器配置、网络挂载。
2. **conmon**：每个容器一个独立的小进程，作为容器进程的**真正父进程**——和 containerd-shim 同思路。守护进程崩溃或升级时，conmon 还活着，容器照常运行。
3. **runc / crun**：OCI runtime 标准实现，真正调用 Linux `clone` / `unshare` 创建 namespace、配 cgroup。CRI-O 默认用 runc，也支持换成 crun（C 写的，更快）。

底层库的复用很关键——CRI-O **不自己造轮子**：

- 镜像：用 [containers/image](https://github.com/containers/image) 库（Podman 同款）
- 存储：用 [containers/storage](https://github.com/containers/storage)（联合文件系统、layer 管理）
- shim：用 [containers/conmon](https://github.com/containers/conmon)
- 网络：调 CNI 插件（K8s 标准，和 containerd 一样）

整体形状画一下：

```
     kubelet（K8s 节点 agent）
        ↓ CRI gRPC
     crio 守护进程              ← 镜像 / 容器 / 网络（CNI）
        ↓ 启动 conmon
     conmon                     ← 每容器一个，作为容器进程真父进程
        ↓ exec
     runc / crun                ← 调 Linux clone / cgroup
        ↓
     容器进程（业务进程）
```

三层各司其职，每层都被夹得很小——这是 CRI-O 比 containerd 攻击面更窄的根本原因。

## 实践案例

### 案例 1：把 K8s 节点的运行时从 containerd 换成 CRI-O

```bash
# 1. 装 CRI-O（版本要对齐 K8s）
sudo apt install cri-o cri-o-runc

# 2. 启动 crio 守护进程
sudo systemctl enable --now crio

# 3. 改 kubelet 配置，把 --container-runtime-endpoint 指向 CRI-O 的 socket
# /etc/default/kubelet
KUBELET_EXTRA_ARGS=--container-runtime-endpoint=unix:///var/run/crio/crio.sock

# 4. 重启 kubelet
sudo systemctl restart kubelet

# 5. 验证
kubectl get nodes -o wide   # CONTAINER-RUNTIME 列应显示 cri-o://1.28.x
```

OCI 镜像格式两边一样，已拉的镜像不用重拉。

### 案例 2：用 crictl 调试节点

`docker ps` 在 CRI-O 节点上根本不存在。换成 `crictl`：

```bash
crictl ps                    # 列容器
crictl pods                  # 列 K8s pod 沙箱
crictl logs <container-id>   # 看日志
crictl exec -it <id> sh      # 进容器
crictl inspect <id>          # 看完整配置
```

注意 crictl 是 **K8s 社区维护的 CRI 通用调试工具**，对接 containerd / CRI-O 都能用——不是 CRI-O 独家的。

### 案例 3：conmon 让容器在守护进程重启时活下去

跑一个 pod 后 `ps -ef | grep conmon`：

```
root  1234  1   conmon -s -c <id> -u <id> -r /usr/bin/runc ...
root  1235  1234 nginx: master process ...
```

conmon 的 PPID 是 1（init），nginx 的 PPID 是 conmon——**不是 crio 守护进程**。`systemctl restart crio` 时容器照样跑，crio 重启后通过 socket 重新接管 conmon。

## 踩过的坑

1. **版本必须对齐 K8s**：CRI-O 1.28 配 K8s 1.28，跨版本不保证 CRI 兼容。升级集群必须同步升级 CRI-O。
2. **镜像 mirror 配置位置不一样**：containerd 在 `/etc/containerd/config.toml`，CRI-O 在 `/etc/containers/registries.conf`（containers/image 库的标准），改完都要重启守护进程。
3. **没有 docker 兼容 CLI**：调试只能 `crictl`，命令语义和 docker 有差异（比如 `crictl pull` 和 `docker pull` 都 OK，但 `crictl run` 需要 JSON 配置文件，不像 `docker run` 那么自由）。
4. **conmon 进程数 = 容器数**：节点容器多时 `ps` 列表里一堆 conmon，看着吓人但正常。

## 适用 vs 不适用场景

**适用**：

- OpenShift / RHEL / Fedora CoreOS 集群（这些发行版默认就是 CRI-O）
- 想要最小化运行时——K8s 之外不需要任何容器功能
- 安全敏感环境：少一层抽象，少一份攻击面

**不适用**：

- 本地开发——CRI-O 没有 `docker build` / `nerdctl run` 的开发者体验，要装 Podman 配套用
- 非 K8s 场景——CRI-O 不是通用容器运行时，强行用很别扭
- 需要丰富生态工具——containerd 的 ctr / nerdctl / buildkit 工具链更全

## 学到什么

1. **极致专用化**：containerd 选『通用底座』，CRI-O 选『K8s 专用瘦身』——同一个生态位的两种打法都能成立，看市场需要哪种。
2. **shim 模式的普适性**：conmon（CRI-O）、containerd-shim（containerd）做的事一模一样——容器进程的父进程独立于守护进程。这是分布式系统里『让控制面可重启而不影响数据面』的经典模式。
3. **底层库复用**：CRI-O 不自己造存储 / 镜像库，复用 containers/* 系列——和 Podman 同根，社区生态共享。
4. **CNCF 毕业的含义**：2024 年 CRI-O 从 incubating 毕业，等于行业承认它和 containerd 并列为 K8s 两大主流 runtime。

## 延伸阅读

- 官方文档：[cri-o.io](https://cri-o.io/)
- 架构文档：[CRI-O Architecture](https://github.com/cri-o/cri-o/blob/main/tutorials/setup.md)
- Red Hat 介绍：[What is CRI-O?](https://www.redhat.com/en/topics/containers/what-is-cri-o)
- crictl 工具：[cri-tools](https://github.com/kubernetes-sigs/cri-tools)

## 关联

- [[containerd]] —— 同生态位的通用容器运行时，K8s 默认选项
- [[kubernetes]] —— CRI-O 唯一的服务对象
- [[runc]] —— CRI-O 默认调用的 OCI runtime，真正创建 namespace / cgroup
