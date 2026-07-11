---
title: Buildah — 不要守护进程，每次构建都是一个 fork 出来的小工
来源: https://github.com/containers/buildah
日期: 2026-06-01
分类: DevOps
难度: 中级
---

## 是什么

Buildah 是一个**把容器镜像构建从"长跑守护进程"改成"用完即走的小工"的工具**。它由 Red Hat 牵头开发，和 Podman、Skopeo 是亲兄弟，三个一起组成"无 Docker 的容器工具链"。

日常类比：**Docker daemon 像写字楼里的全职前台**——24 小时坐在那儿、负责所有人的访客登记、出了问题整栋楼瘫痪。**Buildah 像每次有人来访就临时雇一个小工**——他帮你登记完就下班，没人来时谁都不在。

最简单的体验，不写 Dockerfile，直接在 shell 里像搭积木一样造一个镜像：

```bash
container=$(buildah from alpine)
buildah run $container -- apk add --no-cache curl
buildah copy $container ./app.sh /usr/local/bin/
buildah config --entrypoint '["/usr/local/bin/app.sh"]' $container
buildah commit $container myapp:latest
```

每行都是一个独立的 buildah 子命令，跑完就退出。**没有任何后台进程在你不知道的地方运行**。

当然 Buildah 也支持 Dockerfile：`buildah bud -t myapp:latest .`，行为和 `docker build` 几乎一样。

## 为什么重要

不理解 Buildah 的设计，下面这些事都解释不通：

- 为什么 Red Hat Enterprise Linux 8+ 和 Fedora 默认**没有 Docker**——它们用 Podman + Buildah + Skopeo 替代，整个系统不再需要一个常驻 root daemon
- 为什么 OpenShift 集群里跑 CI 镜像构建，能不开 `--privileged`——Buildah 在 rootless 模式下也能跑通完整构建
- 为什么 Podman build 的速度和 docker build 差不多——Podman 内部直接 vendor 了 Buildah 的 Go API，不是命令行调用
- 为什么"不写 Dockerfile 也能造镜像"成为可能——Buildah 把 Dockerfile 拆成几十个 shell 子命令，于是镜像构建变成一份普通 shell 脚本

简单说：**它让"构建镜像"从一个需要守护进程的特殊操作，降级成一次普通的 fork-exec**。

## 核心要点

Buildah 的设计可以拆成 **三层**：

1. **fork-exec 而非 daemon**：每个 `buildah` 命令都是一个独立的 OS 进程，跑完就退出。没有 socket、没有后台 service、没有需要 systemd 守护的东西。日常类比：从"前台模式"改成"自助模式"。

2. **Containerfile / Dockerfile 双轨 + 脚本式 API**：要兼容 Docker 生态就用 `buildah bud`（**b**uild-**u**sing-**d**ockerfile）跑 Dockerfile；要更细控制就直接调 `buildah from / run / copy / config / commit` 这些子命令，每条都对应 Dockerfile 里的一条指令，但你能在它们之间插入任意 shell 逻辑。

3. **Go API 可被 vendor**：Buildah 不只是一个命令行工具，它的核心是一个 Go library。Podman、CRI-O、ko、s2i 这些项目直接引用 buildah 的 Go 包，不通过命令行交互。

三层合起来，让 Buildah 同时是"工具""脚本""库"三个角色。

## 实践案例

### 案例 1：rootless 构建，不开任何特权

```bash
# 普通用户、不 sudo、不 privileged
buildah bud -t myapp:dev -f Dockerfile .
```

Buildah 利用 Linux user namespace 把当前用户映射成容器里的 root，所有"需要 root"的构建步骤（apt install、chown）在 namespace 内合法，但宿主机上没有任何 root 进程。这是 OpenShift / Kubernetes 多租户场景的关键能力。

逐部分解释：

- `buildah bud` 读取 Dockerfile / Containerfile，产出镜像，但命令结束后不留下守护进程。
- 普通用户能构建，是因为 user namespace 把"容器里的 root"和"宿主机普通用户"隔开。

### 案例 2：脚本化构建，不写 Dockerfile

```bash
#!/bin/bash
set -e
ctr=$(buildah from registry.fedoraproject.org/fedora-minimal:39)
buildah run $ctr -- microdnf install -y python3 pip
buildah copy $ctr requirements.txt /tmp/
buildah run $ctr -- pip install -r /tmp/requirements.txt
buildah copy $ctr ./src /app
buildah config --workingdir /app --cmd "python3 main.py" $ctr
buildah commit $ctr myorg/pyapp:$(git rev-parse --short HEAD)
buildah rm $ctr
```

这个 shell 脚本干的事和一份 Dockerfile 完全等价，但你能在中间随便插 `if`、`for`、调 `jq` 算版本号、读环境变量分支构建——都是普通 shell，**不需要 Dockerfile 那一套受限语法**。

逐部分解释：

- `buildah from` 先创建一个可修改的工作容器，相当于 Dockerfile 的 `FROM`。
- `run / copy / config` 分别对应安装依赖、放入代码、设置启动命令。
- `commit / rm` 把工作容器固化成镜像，再清掉临时容器，避免本地堆垃圾。

### 案例 3：和 Podman 配合，构建完直接跑

```bash
buildah bud -t myapp:test .
podman run --rm -p 8080:8080 myapp:test
```

Buildah 和 Podman 共享同一份 `containers/storage` 后端（默认 `~/.local/share/containers/`），所以 `buildah bud` 写出来的镜像，`podman run` 不需要 push 到 registry 就能直接跑。这就像 docker build 完直接 docker run，但整条链路里没有 daemon。

逐部分解释：

- `buildah bud` 负责构建镜像，不负责长期运行容器。
- `podman run` 负责启动容器，两者通过同一个本地镜像存储交接。

## 踩过的坑

1. **Buildah 和 Docker 的 storage 路径不互通**：Buildah 默认写到 `~/.local/share/containers/`，Docker 写到 `/var/lib/docker/`。`docker images` 看不到 Buildah 的镜像，反过来也一样。要互通得先 `buildah push` 到 registry 或 `docker save | buildah pull`。

2. **rootless 模式下网络受限**：rootless Buildah 用 slirp4netns 模拟网络，速度比 root 慢一档。如果 Dockerfile 里有大量 `RUN apt install`，rootless 跑会明显慢。CI 场景能 root 就 root。

3. **`buildah bud` 不是完整 BuildKit 替代品**：`RUN --mount=type=cache` 这类 BuildKit 扩展语法部分版本支持部分不支持，复杂 Dockerfile 迁过来要先 dry-run 验证。

4. **OCI vs Docker 镜像格式默认值**：Buildah 默认产 OCI 格式镜像，老版 Docker（< 20.10）拉不动。要兼容老 Docker 加 `--format docker`。

5. **`buildah from scratch` 真的从零开始**：不像 Docker `FROM scratch` 给你一个最小 rootfs，Buildah 的 scratch 容器是**完全空的**——连 `/bin/sh` 都没有。要手动 `buildah copy` 进静态二进制，或先 mount 容器再用宿主机工具往里塞文件。新人常因此踩到"为什么 buildah run 报 exec format error"。

## 适用 vs 不适用场景

**适用**：

- RHEL / Fedora / CentOS Stream 系统，默认就装 Buildah，没有 Docker daemon
- OpenShift / Kubernetes 集群里需要 rootless 构建镜像
- CI 环境想脚本化生成镜像，不愿被 Dockerfile 语法限制
- 把镜像构建嵌进自己的 Go 程序里——直接 vendor buildah Go API

**不适用**：

- 本地开发、Mac / Windows 桌面 → Docker Desktop 体验更顺，Buildah 在非 Linux 上要靠虚拟机
- 需要 BuildKit 的并行 DAG 和高级缓存 → 用 BuildKit 或 buildx
- 团队已经深度绑定 Docker Hub / Compose 生态 → 迁移成本不划算
- Windows 容器构建 → Buildah 只支持 Linux 容器

## 历史小故事（可跳过）

- **2017 年**：Project Atomic（Red Hat 主导的容器优化 OS 项目）需要一个**不依赖 Docker daemon 的镜像构建工具**，启动 Buildah，主导者是 Dan Walsh（也是 SELinux、Podman 背后的人）
- **2018 年**：Buildah 与 Podman、Skopeo 一起搬到 GitHub `containers/` 组织下，三件套定型
- **2019 年**：RHEL 8 发布，**默认不装 Docker**，改用 Podman + Buildah + Skopeo，Red Hat 系统正式与 Docker daemon 切割
- **2020-2022 年**：rootless 容器生态成熟，Buildah 成为 OpenShift Pipelines、Tekton on OpenShift 默认构建工具
- **现在**：v1.44（2026-05），仍由 Red Hat / containers 社区维护，GitHub 8.8k stars。kaniko、BuildKit 是同代竞品，但 Buildah 是**唯一原生集成进发行版的那个**

它代表"少一个长跑进程"的软件设计美学：能不要的复杂度就不要。

## 学到什么

1. **守护进程是默认选项，不是必须选项** —— Docker 用 daemon 是历史选择，不是技术必需，Buildah 证明 fork-exec 模型完全够用
2. **命令行工具 + Go 库双形态扩散更广** —— Buildah 既能脚本调用又能 vendor 进 Go 项目，单一形态做不到的扩散面
3. **和发行版绑定带来生命力** —— 单一工具难火，进了 RHEL / Fedora 默认包就有了基础盘
4. **OCI 标准是工具竞争的前提** —— 镜像格式标准化后，多个构建工具才能并存，每个工具不必再重做整个生态

**实际选择参考**：

- 在 RHEL / Fedora 系上 → 直接用 Buildah
- 在 Ubuntu / Debian 上做 CI → BuildKit / buildx 生态更顺
- 在 K8s 集群里要 rootless → Buildah 或 kaniko 二选一，看你愿不愿意装 containers/ 整套工具链
- 想脚本化非 Dockerfile 流程 → Buildah 是少数选择

## 延伸阅读

- 官方仓库：[containers/buildah](https://github.com/containers/buildah)（README + tutorials/ 目录是最快入门路径）
- 教程：[Buildah Tutorials](https://github.com/containers/buildah/tree/main/docs/tutorials)（官方一步步带你不写 Dockerfile 造镜像）
- 设计文章：[Buildah: A new way to build container images](https://opensource.com/article/18/6/getting-started-buildah)（opensource.com，Dan Walsh 等人讲设计动机）
- [[docker]] —— Buildah 要替代的对照对象
- [[buildkit]] —— 另一条"重做 docker build"的路径，并行 DAG vs Buildah 简单 fork-exec
- [[kaniko]] —— K8s 场景的同类工具，但 Buildah 比它更早集成进发行版

## 关联

- [[docker]] —— Buildah 出现的根本动机就是绕开 Docker daemon
- [[buildkit]] —— 同为下一代构建工具，BuildKit 走"功能丰富"路线，Buildah 走"少守护进程"路线
- [[kaniko]] —— K8s 内构建镜像的同类方案，与 Buildah 设计思路有交集但生态不同
- [[tekton]] —— OpenShift Pipelines 默认用 Buildah 做镜像构建步骤

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kaniko]] —— kaniko — 在没有 Docker 的容器里也能构建 Docker 镜像
- [[podman]] —— Podman — 无 daemon 容器引擎
