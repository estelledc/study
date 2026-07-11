---
title: Podman — 无 daemon 容器引擎
来源: https://github.com/containers/podman
日期: 2026-05-29
分类: DevOps / 容器
难度: 中级
---

## 是什么

Podman 是 Red Hat 2018 年开源的容器引擎，与 [[docker]] 几乎完全兼容（命令一致），但**没有后台 daemon**。

日常类比：

- Docker 像「一直运行的小区管理处」——dockerd 这个守护进程永远开着，你跑命令其实是请管理处帮你启容器
- Podman 像「按需的自助洗衣」——你跑 `podman run`，进程就直接 fork 出一个容器，跑完进程退出，没有后台值班的人

把 docker 命令前缀换成 podman，绝大多数情况能直接跑：

```bash
docker run -p 8080:80 nginx
# ↓ 完全等价
podman run -p 8080:80 nginx
```

这是 Podman 设计上最直观的特征——**接口一致，架构换骨**。

## 为什么重要

不理解 Podman 这种"无 daemon"路线，下面这些事都没法解释：

- 为什么 Red Hat / Fedora / RHEL 8+ **默认不装 docker**，而是装 podman
- 为什么云厂商的安全合规扫描越来越偏好无 root daemon 的容器引擎跑 CI
- 为什么部分 self-hosted CI（含部分 GitHub Actions runner 场景）会用 podman 替 docker——图的是无长期 dockerd、更好做 rootless
- 为什么 Kubernetes 1.24 之后弃用 dockershim，podman 反而毫无影响

四个关键优势：

1. **安全性高**：没有 root daemon，攻击面小一截。Docker 的 dockerd 默认以 root 跑，被攻破等于拿到主机 root；podman 没有这个长期暴露的进程
2. **Rootless 容器一等公民**：普通用户不用 sudo 就能跑容器。Docker 的 rootless 模式是后加的补丁，podman 一开始就是这么设计的
3. **Pod 概念原生**：`podman pod` 直接对齐 [[kubernetes]] 的 Pod 概念——一组容器共享网络命名空间。学 podman 顺便就熟悉 k8s 心智模型

4. **systemd 集成深**：`podman generate systemd` 一键把容器变成系统服务，比 docker 自己造一套重启策略更贴近 Linux 原生

## 核心要点

Podman 的三个架构特征，每个都值得单独理解。

### 1. 无 daemon 架构（fork-exec）

```
用户跑 `podman run nginx`
   ↓
podman 进程直接 fork → 子进程做 namespace / cgroup 设置
   ↓
exec nginx 主进程
   ↓
podman 自己退出，留下 conmon 监控容器（轻量级）
```

对比 docker：用户 → CLI → REST API → dockerd → containerd → runc → 容器。链路长一截。

### 2. Rootless（用户命名空间映射）

普通用户跑 `podman run`，进入容器看到自己是 root（uid 0），但宿主机看这个进程的真实 uid 还是 1000。靠的是 Linux 的 **user namespace**：

```
容器里的 uid 0  ←→  宿主机里的 uid 100000（你的子 uid 段）
容器里的 uid 1  ←→  宿主机里的 uid 100001
```

子 uid 段在 `/etc/subuid` 里配，每个用户 65536 个。

### 3. Pod 编排（多容器共享网络）

```bash
podman pod create --name myapp -p 8080:80
podman run -d --pod myapp nginx           # web 容器
podman run -d --pod myapp redis           # 缓存容器
```

两个容器在同一个 Pod 里，**共享 localhost**——nginx 访问 redis 就是 `localhost:6379`，跟 Kubernetes Pod 行为一致。

## 实践案例

### 案例 1：Mac 上起步

```bash
brew install podman
podman machine init        # 起一个 Linux VM（podman 在 Mac 上必须靠 VM）
podman machine start
podman run -p 8080:80 nginx
curl http://localhost:8080
```

注意：Mac/Win 没有 Linux 内核，podman 必须借 QEMU/Hyper-V 跑 VM——比 OrbStack 慢一些是正常的。

### 案例 2：从 docker 命令迁移

绝大多数 `docker xxx` 直接换成 `podman xxx` 就能跑。还可以装 `podman-docker` 包，让 `docker` 命令变成 podman 的别名：

```bash
sudo dnf install podman-docker
docker ps    # 实际跑的是 podman ps
```

CI 脚本几乎零改动迁移。

### 案例 3：Pod + systemd 集成

```bash
podman pod create --name webapp -p 8080:80
podman run -d --pod webapp --name web nginx
podman generate systemd --new --files --name webapp
sudo cp pod-webapp.service /etc/systemd/system/
sudo systemctl enable --now pod-webapp
```

容器变成系统服务，开机自启、崩了自动拉起——全靠 systemd，不需要 docker 的 `--restart=always`。

## 踩过的坑

1. **compose 兼容**：`docker-compose.yml` 不能直接 `podman-compose up`，需要装 `podman-compose`（pip 包）；podman v4+ 自带 `podman compose` 子命令，但部分 docker compose v2 特性还不齐
2. **Mac 慢一截**：`podman machine` 用 QEMU 跑 Linux VM，文件挂载 IO 比原生 docker 慢明显；性能敏感场景考虑 OrbStack
3. **挂载权限**：rootless 模式下挂载本地目录到容器，宿主机文件 owner 是 1000，容器里看到的是 100000——SELinux 系统要加 `:Z` 标签：`-v $(pwd):/data:Z`
4. **buildx 不全**：docker buildx 的多平台（arm64/amd64 同时构建）支持成熟；podman 的 `--platform` 还在追，多架构镜像构建偶尔需要装 `qemu-user-static`
5. **网络**：rootless 模式下默认用 slirp4netns，性能比 root 模式的 CNI 桥接差；高吞吐场景要切 pasta 后端（podman 4.4+）

## 适用 vs 不适用场景

**适用**：

- Linux 服务器（Fedora / RHEL / Ubuntu）跑生产容器，特别是合规要求高的环境
- CI/CD pipeline（无需 daemon = runner 启动快）
- 学习 Kubernetes Pod 模型——本地 podman pod 直接对齐
- systemd 管理的服务化部署

**不适用**：

- Mac 上做密集开发（VM 性能损耗）→ OrbStack 更顺手
- 重度依赖 docker compose v2 高级特性 → 暂时回 docker
- Windows 桌面开发 → Docker Desktop 体验更成熟
- 需要 docker swarm 的小集群编排 → podman 没对应物，直接上 [[kubernetes]]

## 历史小故事（可跳过）

- **2018**：Red Hat 启动 libpod 项目，定位为 "无 daemon 的容器引擎库"
- **2019**：Podman 1.0 发布，CLI 接口与 docker 对齐
- **2020**：podman-compose 加入，开始啃 compose 兼容性
- **2022**：Podman 4.0 发布，引入与 BuildKit 对齐的构建能力；同年 Kubernetes 1.24 移除 dockershim，podman 本就不依赖 docker socket，零迁移成本
- **2024**：Podman 5 默认强化 user namespace，rootless 体验进一步默认化

## 学到什么

1. **架构差异比命令兼容更重要**：命令几乎一样，daemon vs no-daemon 决定运维心智完全不同
2. **rootless 是默认而不是补丁**：从一开始就这么设计，比事后加更彻底
3. **Pod 是好抽象**：把"一组共享网络的容器"独立出来，比 docker 的 `--network=container:xxx` 干净
4. **接口兼容 ≠ 实现兼容**：先保接口（用户无感），再换底层实现

## 延伸阅读

- 官方文档：[Podman Documentation](https://docs.podman.io/)
- 命令对照：[Podman vs Docker](https://docs.podman.io/en/latest/Commands.html)
- Rootless 原理：[Rootless Containers](https://rootlesscontaine.rs/)
- [[docker]] —— daemon 架构对照系
- [[kubernetes]] —— Pod 概念的原始来源

## 关联

- [[docker]] —— 命令行高度兼容；最大区别是有无长期 daemon
- [[kubernetes]] —— `podman pod` 直接对齐 k8s Pod，本地学编排的好桥
- [[buildah]] —— 同属 containers 生态，专注无 daemon 镜像构建
- [[containerd]] —— 另一条「有 daemon 的」行业运行时，对照理解 CRI
- [[cri-o]] —— 专为 Kubernetes 的轻量运行时，和 podman 同出 Red Hat 系
- [[runc]] —— 底层 OCI runtime；podman/docker/containerd 最终都落到它（或兼容实现）
- [[nerdctl]] —— containerd 的 docker 兼容 CLI，对照「换 CLI 不换架构」另一条路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cri-o]] —— CRI-O — 只为 Kubernetes 而生的瘦身版容器运行时
- [[drone]] —— Drone CI — 容器原生的 YAML 流水线
- [[nerdctl]] —— nerdctl — containerd 官方的 Docker 兼容 CLI
