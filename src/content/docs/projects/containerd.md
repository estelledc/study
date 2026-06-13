---
title: containerd — Docker 和 Kubernetes 共用的那台容器运行机
来源: containerd GitHub, https://github.com/containerd/containerd
日期: 2026-05-31
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

containerd 是一套**只做容器运行时核心、把上层工具（Docker / K8s / nerdctl）和底层 Linux 隔离开**的守护进程。

日常类比：如果 Docker 是一整座汽车工厂——造车、卖车、售后都做，那 containerd 就是工厂里的**发动机制造车间**——只负责把发动机装好、点火、跑起来；卖车归 Docker、维修归 K8s、零件加工归 runc。

更形象一点，它像**快递分拣中心**：上游（Docker / K8s）下单要发件，它负责拉镜像、调度容器、管理生命周期，再交给底层的 runc 真正去开门搬箱。

跑起来像这样：

```bash
# 通过 ctr（containerd 自带的低层 CLI）拉镜像、跑容器
ctr image pull docker.io/library/nginx:latest
ctr run --rm -t docker.io/library/nginx:latest demo
```

或者用 nerdctl（Docker-like 兼容层，子命令几乎一比一对应 docker）：

```bash
nerdctl run -d -p 8080:80 nginx
```

## 为什么重要

不理解 containerd，下面这些事就解释不通：

- 为什么 2022 年 Kubernetes 1.24 移除 dockershim 后**集群没崩**——因为 containerd 早就是 K8s 默认运行时，dockershim 只是中间垫片
- 为什么 Docker 装好后里面**也跑着一个 containerd 守护进程**——Docker 自己 2017 年把这块剥离捐给了 CNCF
- 为什么排查容器问题时，老司机会跳过 `docker ps` 直接用 `ctr` 或 `crictl`——绕过上层就能看到运行时真实状态
- 为什么 nerdctl / Podman / K3s 这些项目敢说自己『不依赖 Docker』——它们都直接对接 containerd

## 核心要点

containerd 的世界由四层组件咬合：

1. **客户端**：Docker / K8s（通过 CRI 插件）/ nerdctl / ctr——它们都是 containerd 的 gRPC API 调用方，本身不真的运行容器。
2. **containerd 守护进程**：Go 写的主程序，监听 gRPC，做镜像管理、容器配置、网络挂载、快照。
3. **containerd-shim**：每个容器一个 shim 进程，作为容器进程的**真正父进程**。设计目的是：containerd 守护进程崩溃或升级时，shim 还活着，**容器照常运行**。
4. **runc**：OCI runtime 标准实现，真正调用 Linux `clone` / `unshare` 创建 namespace、配 cgroup，把容器进程拉起来。

三个核心抽象（这是和 Docker 的关键区别）：

- **Image**：内容可寻址存储——按 sha256 摘要存层，相同层永不重复。
- **Container**：只是**配置元数据**（rootfs 在哪、要挂哪些卷、环境变量）。本身不跑。
- **Task**：真正运行的进程。Container + Task 分离意味着可以**先建容器配置，再多次启动 / 停止 task**，而不必每次重新组装。

Snapshotter 插件机制决定镜像层怎么叠加：默认 overlayfs（联合文件系统，合并只读层 + 可写层），可换 btrfs / zfs / native。换 snapshotter 不用改上层代码——这就是插件化的好处。

简单画一下整体形状：

```
Docker / kubelet / nerdctl       ← 客户端，发 gRPC 调用
        ↓ gRPC
   containerd 守护进程            ← 镜像 / 容器 / task / 网络
        ↓ 启动 shim
   containerd-shim-runc-v2        ← 每容器一个，作为容器进程的真父进程
        ↓ exec
        runc                      ← 调 Linux clone / cgroup，真正起进程
        ↓
        容器进程（nginx 等）
```

四层各司其职，任意一层崩溃，影响范围都被夹得很小。

## 实践案例

### 案例 1：K8s 1.24 移除 dockershim 为什么没出大事

K8s 之前要跑容器，调用链是这样的：

```
kubelet → dockershim（K8s 维护的垫片） → Docker → containerd → runc
```

四级转换。dockershim 维护成本高，K8s 1.24 把它拆了，调用链变成：

```
kubelet → containerd（通过 CRI 插件） → runc
```

少了两层。绝大多数集群升级 K8s 时直接换 runtime 配置一行就行——因为 Docker 底下本来就是 containerd，**Image 格式（OCI）也一样**，已经拉好的镜像不用重拉。

### 案例 2：用 ctr 直接看运行时状态

`docker ps` 看不到 K8s 的容器（它们走的是 K8s 命名空间，不是 Docker 的）。但用 ctr 加 `-n k8s.io` 命名空间就能看到：

```bash
ctr -n k8s.io containers list   # 列 K8s 跑的所有容器
ctr -n k8s.io tasks list        # 列正在跑的 task
ctr -n k8s.io images list       # 列 K8s 拉过的镜像
```

这是排查 K8s 节点问题时的关键路径——绕过 kubelet / Docker，直接问运行时。

### 案例 3：shim 让容器在守护进程崩溃时活下去

跑一个容器：

```bash
ctr run -d --rm docker.io/library/nginx:latest demo
```

然后 `ps -ef | grep shim`，能看到一个 `containerd-shim-runc-v2` 进程，它的子进程才是 nginx。

这时如果 `systemctl restart containerd`——守护进程重启——nginx **依然在跑**。原因：shim 才是 nginx 的真父进程，守护进程崩溃只断了 gRPC 连接，shim 用 socket 等守护进程回来重新接管。

## 踩过的坑

1. **命名空间隔离**：`ctr containers list` 默认只看 default 命名空间，K8s 的容器在 k8s.io——找不到容器先确认 `-n` 加对了。
2. **ctr 不是给人用的**：ctr 是 containerd 的调试工具，参数格式生硬、不支持 docker-compose 类高层语法。日常工作用 nerdctl 才舒服，ctr 留给排查。
3. **CRI 插件不是默认开**：containerd 的 CRI 插件在 `/etc/containerd/config.toml` 里，老版本默认禁用——K8s 集群启动失败时第一件事是 `containerd config default | grep cri`。
4. **镜像拉取代理**：containerd 的 mirror 配置和 Docker 完全不同——在 `config.toml` 的 `[plugins."io.containerd.grpc.v1.cri".registry.mirrors]` 段，改完要重启守护进程。

## 适用 vs 不适用场景

**适用**：

- 生产 K8s 集群的容器运行时（事实标准）
- 需要轻量、稳定、长期运行的容器底座（不带 build / compose / swarm，攻击面小）
- 自研容器平台想直接对接 OCI 标准而不引入完整 Docker 时

**不适用**：

- 本地开发还想 `docker build` / `docker compose`——containerd 没有 build，要 buildkit / nerdctl 才有
- Windows 容器场景受限（虽然支持，但生态主要在 Linux）
- 想要『一个二进制全包』的开发者体验——那是 Docker 的定位

## 学到什么

1. **关注点分离的胜利**：Docker 把『build / 运行 / 编排』全做了，K8s 时代发现『运行』这块最稳定，剥出来标准化就成了 containerd——CNCF 2019 年毕业。
2. **shim 设计**：父进程独立于守护进程，是分布式系统里『让组件可重启而不影响数据面』的经典模式——同样思路在 systemd、Kubernetes kubelet 都有影子。
3. **抽象分层（Image / Container / Task）**：不同生命周期的东西分开存储和管理，比 Docker 当年的『一锅烩』更清晰，扩展性更好。
4. **OCI 标准的力量**：Image 格式、Runtime 接口、Distribution 协议三个 OCI 标准让 containerd / runc / podman 互相兼容，集群升级不用重拉镜像。

## 延伸阅读

- 官方文档：[containerd Documentation](https://containerd.io/docs/)
- 架构图：[containerd Architecture](https://github.com/containerd/containerd/blob/main/docs/PLUGINS.md)
- K8s 切换 runtime 指南：[Container Runtimes | Kubernetes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/)
- nerdctl（Docker 兼容 CLI）：[containerd/nerdctl](https://github.com/containerd/nerdctl)

## 关联

- [[docker]] —— containerd 的上游母体，2017 年把运行时部分剥离捐给 CNCF
- [[kubernetes]] —— 最大用户，1.24 版本起直接走 containerd 而不再经 Docker
- [[runc]] —— containerd 默认调用的 OCI runtime，真正创建 namespace / cgroup
- [[k3s]] —— 轻量 K8s 发行版，内置 containerd 不需要单独安装
