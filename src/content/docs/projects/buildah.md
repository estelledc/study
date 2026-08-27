---
title: Buildah — 不要守护进程，每次构建都是一个 fork 出来的小工
来源: https://github.com/containers/buildah
日期: 2026-06-01
分类: DevOps
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/containers/buildah
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7ae7d5a4021b24d02a5c281badca8c4d8ebbf442
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.45.0
---

## 是什么

Buildah 是一个**把 OCI 镜像构建做成一次普通进程调用**的工具：每个 `buildah` 子命令跑完就退出，不靠 dockerd 那种长跑守护进程。日常类比：Docker daemon 像写字楼全职前台；Buildah 像每次来客临时雇一个小工，事做完人就走。

固定 1.45.0 的 Go module 是 `go.podman.io/buildah`。仓库 URL `https://github.com/containers/buildah` 现在 301 到 `podman-container-tools/buildah`，是同一份源码，不是分叉。

主入口已经是 `buildah build`；`bud` / `build-using-dockerfile` 只是别名：

```bash
container=$(buildah from alpine)
buildah run $container -- apk add --no-cache curl
buildah copy $container ./app.sh /usr/local/bin/
buildah config --entrypoint '["/usr/local/bin/app.sh"]' $container
buildah commit $container myapp:latest
```

每行都是独立进程。`buildah build -t myapp:latest .` 则读 Containerfile（没有再找 Dockerfile）。

## 为什么重要

不理解这条进程模型，下面这些事会对不上：

- 为什么 RHEL / Fedora 能用 Podman + Buildah 过日子，而不必装 Docker daemon
- 为什么同一份 `go.podman.io/storage` 里的镜像，`buildah commit` 之后可以被同机的其他 containers 工具看见
- 为什么 `buildah build` 能解析 `RUN --mount` / heredoc，却不是把 BuildKit solver 当成自己的执行引擎
- 为什么 `FROM scratch` 的 rootfs 是空的，但默认镜像 config 已经带了 `WorkingDir: "/"`

## 核心要点

固定源码可以拆成四层：

1. **CLI 是进程，库是 `Builder`**：`NewBuilder` 创建一个工作容器；`Run` / `Add` / `Copy` / `Set*` 改它；`Commit` 写成镜像。`buildah from/run/copy/config/commit` 就是这条链的命令行皮。

2. **Containerfile 是另一条入口**：`buildah build` 调用 `imagebuildah.BuildDockerfiles`。无参数时用当前目录当 context，必须能找到 Containerfile 或 Dockerfile。CLI `--jobs` 默认 1，阶段默认串行。

3. **默认 OCI，isolation 可切**：`--format` / `BUILDAH_FORMAT` 未设时是 `oci`。isolation：环境变量优先，rootless 用户默认 `rootless`，否则 `oci`；还可以 `chroot`。默认 runtime 名是 `runc`。

4. **BuildKit 只进了 parser**：`go.mod` 依赖 `github.com/moby/buildkit v0.31.2`，经 `openshift/imagebuilder` 处理 heredoc 与 shell lex。执行、缓存、layer 仍走 Buildah 自己的 store / executor，不是 LLB solver。

隐藏子命令 `rpc` 会在单次命令期间起临时 gRPC socket，命令结束就拆掉；这不是常驻 daemon。

## 实践示例

### 案例 1：`buildah build` 读 Containerfile

```bash
buildah build -t myapp:dev -f Containerfile .
```

**逐部分解释**：`build` 的 alias 仍接受 `bud`。它把指令交给 `imagebuildah`，结束后不留守护进程。rootless 时 isolation 默认 `rootless`（user namespace），不是“必须 `--privileged`”的合同。本轮未测 OpenShift 多租户场景。

### 案例 2：脚本化、不写 Containerfile

```bash
#!/bin/bash
set -e
ctr=$(buildah from registry.fedoraproject.org/fedora-minimal:39)
buildah run $ctr -- microdnf install -y python3
buildah copy $ctr ./src /app
buildah config --workingdir /app --cmd "python3 main.py" $ctr
buildah commit $ctr myorg/pyapp:local
buildah rm $ctr
```

**逐部分解释**：`from` 可接收镜像名或 `scratch`。`run` / `copy` / `config` 改工作容器。`commit` 按默认 OCI manifest 固化。中间可以插普通 shell，不必受 Dockerfile 语法限制。

### 案例 3：RUN --mount

```dockerfile
RUN --mount=type=cache,target=/root/.cache pip install -r requirements.txt
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm install
```

`Builder` 的 mount 分发支持 `secret` / `ssh` / bind / cache / tmpfs。`internal/volumes.getMounts`（`buildah run --mount` 那条辅助路径）只接受 bind/cache/tmpfs。secret 会拷到容器工作目录再只读 bind，不是写进最终 layer 的合同保证——本轮未实际跑构建。

## 踩过的坑

1. **storage 不跟 Docker 共用**：Buildah 走 `go.podman.io/storage`。`docker images` 看不到这些镜像，除非先 push/save。具体 GraphRoot 以本机 `containers-storage` 配置为准，旧文里的 `~/.local/share/containers/` 不是这份源码写死的路径。

2. **`bud` 只是别名**：新文档和 cobra `Use` 都是 `build`。教程继续写 `bud` 能跑，但主命令已经换名。

3. **scratch 不再是完全空 config**：rootfs 仍空、没有 `/bin/sh`；默认却会写 `WorkingDir: "/"`。只有 `CompatScratchConfig` 为 true 才回到“配置也空”。`buildah run` 对 scratch 容器仍会因没有 shell/二进制失败。

4. **`--jobs` 默认 1**：独立 stage 不会像 BuildKit 那样默认并发。库层若既不传 `Jobs` 也不传 semaphore，executor 才会按 stage 数建信号量。

5. **依赖了 BuildKit ≠ 用了 BuildKit 引擎**：1.45.0 vendor 的是 parser。`RUN --mount=type=cache` 的目录落在宿主机临时目录下的 `buildah-cache-<uid>`，生命周期跟本机 tmp 清理策略走。

## 适用 vs 不适用场景

**适用**：

- 需要 fork-exec 构建、不想常驻 Docker daemon 的 Linux 环境
- 要把构建嵌进 Go 程序：直接 import `go.podman.io/buildah`
- 脚本化、非 Dockerfile 流程（`from` / `run` / `copy` / `commit`）
- 与 Podman 同用一份 containers storage 的本机工作流

**不适用**：

- 默认就要跨 stage 并发 DAG、远程 content-addressed cache——那是 BuildKit 的合同
- 非 Linux 桌面：这份源码的 isolation/runtime 假设是 Linux 容器
- 把未测的 rootless 网络吞吐或“比 Docker 快/慢”写成结论
- Windows 容器构建

## 固定版本边界

- 本文绑定 `containers/buildah@7ae7d5a4021b24d02a5c281badca8c4d8ebbf442`，即 annotated tag `v1.45.0`，`define.Version` 为 `1.45.0`。
- GitHub 页面已 301 到 `podman-container-tools/buildah`；module 路径是 `go.podman.io/buildah`。
- 许可 Apache-2.0；Go 1.25.9。
- 默认：OCI manifest、`--jobs 1`、runtime 名 `runc`；isolation 见上。
- 隐藏 `rpc` 子命令存在，但不改变“默认无常驻 daemon”的 CLI 模型。
- 本文未安装依赖、未编译、未构建镜像，状态保持 `UNVERIFIED`。

## 学到什么

1. **守护进程是产品选择，不是镜像构建的物理定律**——Buildah 把构建降成进程 + 工作容器状态文件
2. **命令行和库共用一条 `Builder` 链**，Containerfile 只是另一条调度入口
3. **vendor 了 parser 不等于换了执行引擎**——看 `go.mod` 还要看调用点
4. **默认值会漂**：scratch 的 config、`bud` 别名、jobs=1，都要以固定提交为准

## 应用型自测

1. `buildah bud` 在 1.45.0 还是独立实现，还是别名？
2. 默认 `buildah commit` 写出的是 Docker schema2 还是 OCI manifest？
3. `FROM scratch` 的默认镜像 config 是否完全没有 `WorkingDir`？

检查点：

1. 别名。cobra 主命令是 `build`，aliases 包含 `bud` 与 `build-using-dockerfile`。
2. OCI。`DefaultFormat()` 在未设 `BUILDAH_FORMAT` 时返回 `define.OCI`。
3. 不是。默认会写 `WorkingDir: "/"`；只有 `CompatScratchConfig` 为 true 才保持空配置。

## 延伸阅读

- 固定源码：[containers/buildah](https://github.com/containers/buildah) —— 本文绑定提交 `7ae7d5a4021b24d02a5c281badca8c4d8ebbf442`
- 教程：[docs/tutorials](https://github.com/containers/buildah/tree/main/docs/tutorials)
- [[docker]] —— Buildah 要绕开的 daemon 模型
- [[buildkit]] —— 另一条路径：LLB DAG + 常驻 `buildkitd`
- [[kaniko]] —— 容器内构建的另一条路线
- [[podman]] —— 常与 Buildah 共享 storage 的运行时

## 关联

- [[docker]] —— 出现动机是绕开 Docker daemon
- [[buildkit]] —— 同主题对照：并发 DAG vs 默认 jobs=1 的 fork-exec
- [[kaniko]] —— K8s 内构建的同类方案
- [[tekton]] —— 流水线里常见的构建步骤宿主
- [[podman]] —— 无 daemon 容器引擎

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kaniko]] —— kaniko — 在没有 Docker 的容器里也能构建 Docker 镜像
- [[podman]] —— Podman — 无 daemon 容器引擎
