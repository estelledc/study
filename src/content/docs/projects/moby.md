---
title: Moby — Docker 把引擎拆开后的开源上游
来源: https://github.com/moby/moby
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 入门
provenance: pipeline-v3
---

## 是什么

**Moby 是 Docker 公司在 2017 年把自家容器引擎源码"剥离品牌"后留下的上游开源项目**。一句话：你装的 Docker Desktop 是商品；它的发动机源码躺在 [github.com/moby/moby](https://github.com/moby/moby) 这个仓库里。

日常类比：

- **Fedora → Red Hat Enterprise Linux**——前者社区做、后者打包卖
- **Chromium → Chrome**——同一份内核，前者裸源码、后者加品牌和服务
- **Moby → Docker**——同一份引擎代码，前者叫 Moby、后者打包成 Docker 商品

具体来说，Moby 仓库里包含：

- `dockerd`（Docker daemon）——长驻后台、监听 `/var/run/docker.sock`、接受 `docker run / docker ps` 这类命令
- 一组 Go package：daemon 主循环、REST API server、镜像层管理、网络（libnetwork）、日志驱动、卷驱动
- **不**包含：`docker` CLI（在 [docker/cli](https://github.com/docker/cli)）、容器运行时 runc（在 [opencontainers/runc](https://github.com/opencontainers/runc)）、构建器 BuildKit（在 [moby/buildkit](https://github.com/moby/buildkit)）

所以读 Moby 等于读 **"docker 命令到底是怎么把一个容器跑起来的中间层胶水"**。

## 为什么重要

学 Moby 而不是只用 Docker 的理由：

- **Docker 不是单体**——`docker run` 一行命令背后是 CLI → dockerd（Moby）→ containerd → runc 四层调用，不读 Moby 你永远不知道每层在干什么
- **大型 Go 守护进程的标准范本**——plugin 系统、API server、长连接事件流、graceful shutdown，这些在 Moby 里都有教科书级实现
- **想给 containerd / BuildKit 提 PR**——很多改动需要顺手改 Moby 这层壳
- **排查 dockerd 卡死**——线上偶尔遇到 daemon 进程不响应、`docker ps` 挂住，不读源码只能重启了事

最关键：**Moby 这个名字让无数新人踩坑**——2017 年改名后，原来的 `git clone github.com/docker/docker` 变成 redirect，老博客老 issue 链接全乱。理解"Moby 是上游、Docker 是发行版"这层关系，是入门的第一步。

## 核心要点

Moby 仓库可以拆成 **4 个子系统**：

1. **dockerd 主进程**：`cmd/dockerd/` 是入口，启动 API server（监听 unix socket / TCP）、启动 daemon 主循环、加载插件。整个进程长驻，CLI 每次调用都是一次 HTTP 请求。

2. **API server**：HTTP/REST 接口定义在 `api/server/`。每条 docker 子命令（`run / ps / logs / exec / build`）都映射成一个 HTTP endpoint。这是**理解 Docker 行为最快的入口**——读 endpoint 处理函数等于读"这条命令到底干什么"。

3. **daemon package**：`daemon/` 是 dockerd 的"业务逻辑层"，调用 containerd 起容器、管理镜像层（基于 [[overlay-fs]] 的 overlay2 driver）、记录容器状态。**不**包含真正的 namespace/cgroup 操作——那是 runc 的活，Moby 通过 containerd 间接调用。

4. **libnetwork**：曾经是独立仓库，2023 年合并进 moby/moby。负责 bridge 网络（容器互通）、overlay 网络（跨主机）、端口映射、DNS。容器之间能不能 ping 通、`-p 8080:80` 怎么生效，全靠这一层。

旁路但同样关键的两个外部仓库：

- **[[containerd]]**——真正的运行时管理者，接收 dockerd 命令，再调 runc。CNCF 项目，K8s 也直接用它（绕开 dockerd）
- **[[buildkit]]**——`docker build` 的新一代实现，支持并行、缓存挂载、secret 注入，2018 后逐步替代老 builder

## 实践案例

### 案例 1：读 docker run 的源码路径

想知道 `docker run nginx` 一行命令到底走了哪些函数：

```
docker CLI（docker/cli）
  → POST /containers/create   ──┐
  → POST /containers/{id}/start │ moby/moby 的 api/server/router/container/
                                ┘
  → daemon.containerCreate()      moby/moby 的 daemon/create.go
  → daemon.containerStart()       moby/moby 的 daemon/start.go
  → containerd client.NewContainer / Task.Start
  → containerd shim → runc → clone() + 各种 namespace
```

读 Moby 源码就是沿这条链一层层 grep 函数名。`api/server/router/container/container_routes.go` 是入口。

### 案例 2：libnetwork 的 bridge 模式

```bash
docker run -d --name a nginx
docker run -d --name b alpine ping a
```

`b` 能 ping 到 `a` 是因为 dockerd 启动时建了一个 `docker0` 虚拟网桥（bridge），每个容器加一个 veth pair 接进去。这套逻辑全在 `libnetwork/drivers/bridge/`。读完这部分再看 `iptables -L -n -t nat` 就知道为什么 `-p 8080:80` 会自动加一条 DNAT 规则。

### 案例 3：本地编译一个 dockerd

```bash
git clone https://github.com/moby/moby.git
cd moby
# 官方推荐用 dind 容器编译，不污染宿主
make BIND_DIR=. shell
# 容器里：
make binary
# 产物在 bundles/binary-daemon/dockerd
```

把这个二进制拿出来替换系统 dockerd，就能跑你改过的代码。这是给 Moby 提 PR 的标准开发循环。

## 踩过的坑

1. **`github.com/docker/docker` 不是它的真名**——2017 年改成 `moby/moby` 后，老链接靠 GitHub redirect 维持，但 Go module path 是 `github.com/docker/docker`（兼容历史）。新人写 `import` 会被这两个路径搞混
2. **CLI 和 daemon 是两个仓库**——想改 `docker run` 的参数解析在 [docker/cli](https://github.com/docker/cli)，想改实际行为在 moby/moby
3. **Moby 不再含 swarm**——swarm classic 编排已废弃，K8s 是事实标准；如果你在找 K8s 替代，看错仓库了
4. **Docker Desktop 的私货**——Mac/Windows 版的虚拟机层、文件共享、k8s 集成都是 Docker Inc 闭源加在 Moby 之上的；只读 Moby 看不到这部分

## 适用 vs 不适用场景

**适用**：

- 想读"docker 命令到底怎么跑"的源码学习者
- 给 Docker 引擎提 PR 修 bug
- 排查线上 dockerd 异常（卡死、内存涨、网络丢）需要看源码定位
- 学大型 Go daemon 的工程范本
- 写自己的容器管理工具，需要参考 dockerd 怎么和 containerd 打交道

**不适用**：

- 只想用 Docker 不读源码——看官方文档 [docs.docker.com](https://docs.docker.com)
- 找轻量替代品——直接用 [[containerd]] / runc / podman，不需要 Moby 这层
- K8s 编排——读 [kubernetes/kubernetes](https://github.com/kubernetes/kubernetes)
- 学 BuildKit / containerd 内部——它们是独立仓库，Moby 只是调用方

## 学到什么

1. **Docker 是品牌，不是单体软件**——引擎在 moby/moby、CLI 在 docker/cli、运行时在 containerd/runc，四个仓库才组装成一台 Docker
2. **API-first 守护进程**——dockerd 几乎所有功能都先暴露成 HTTP endpoint 再被 CLI 调用，读 API 路由表等于读功能清单
3. **CNCF 拆分潮**——containerd / runc / CNI / OCI image-spec 都是从 Docker 拆出来的标准，Moby 越来越像一个"装配器"而不是"实现者"
4. **品牌剥离的混乱代价**——一次改名让大量教程链接、Go import path、issue 引用错位多年，是开源治理的反面教材

## 延伸阅读

- 官方：[Moby Project blog 公告 2017](https://www.docker.com/blog/introducing-the-moby-project/)
- 架构图：[Moby Architecture diagram](https://github.com/moby/moby/blob/master/docs/architecture.md)
- 视频：Solomon Hykes "Introducing Moby" DockerCon 2017（解释为什么改名）
- 论文式分析：Brendan Burns 等 "Borg, Omega, and Kubernetes" 末尾对比 Docker/Moby 演化路径
- 源码导读：moby/moby 仓库根目录 `CONTRIBUTING.md` + `docs/` 下的 architecture / project 子目录
- [[docker]] —— 商品发行版，Moby 是它的上游
- [[containerd]] —— Moby 调用的运行时管理层
- [[buildkit]] —— Moby 用的构建子系统
- [[runc]] —— 真正调 namespace/cgroup 的最底层

## 关联

- [[docker]] —— Moby 是引擎源码、Docker 是品牌发行版，二者源码差一层 packaging
- [[containerd]] —— dockerd 不直接调 runc，先调 containerd，再由 containerd 调 runc
- [[buildkit]] —— 新版 `docker build` 的实际实现，独立仓库
- [[kubernetes]] —— K8s 早期通过 dockerd 起容器，1.24 后改直连 containerd 绕开 Moby
- [[oci-image-spec]] —— Moby 推动制定的容器镜像格式标准
- [[overlay-fs]] —— Moby 默认 storage driver overlay2 的内核基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[runc]] —— runc — Linux 容器最底层那个真正在 fork 进程的 CLI

