---
title: BuildKit — Docker 下一代镜像构建后端
来源: https://github.com/moby/buildkit
日期: 2026-06-01
分类: devops / 容器构建
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/moby/buildkit
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 991535e0973488b6a429096d21fa13f81f2d89d8
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.32.2
---

## 是什么

BuildKit 是一套**把构建定义编译成可并发、可缓存的 DAG，再交给 worker 执行**的工具包。日常类比：老厨房按菜谱一行行做；新厨房先画出依赖图，没有互相等待的步骤可以同时开火。

你写的还可以是 Dockerfile，但引擎不再按“指令序列”执行。中间格式叫 **LLB**（Low-Level Builder），README 的比喻是：LLB 之于 Dockerfile，就像 LLVM IR 之于 C。

固定 `v0.32.2` 由 `buildkitd` 守护进程和 `buildctl` 客户端组成。Docker Engine 23.0 起，`docker build` 默认走 Buildx + BuildKit——这是本仓 README 的声明，不是本轮对 Docker Engine 的运行核验。

## 为什么重要

不理解 LLB，下面这些事会对不上：

- 为什么同一份多 stage Dockerfile 能让无依赖的 stage 同时跑，而不只是“换了个日志颜色”
- 为什么 Dagger / Earthly / Depot 能长在同一套协议上——README 的 Used by 把它们列为 frontend / 客户端，而不是“更快”的证据
- 为什么 `RUN --mount=type=secret` 能把密钥喂进这一步，而 `PROJECT.md` 要求 secret 值不得进磁盘或 cache checksum
- 为什么 GitHub Actions / registry 能复用构建缓存——export 走的是 content-addressed 的 cache record，不是层序号

## 核心要点

固定版本可以拆成四层：

1. **LLB 是 protobuf DAG**：`solver/pb/ops.proto` 里每个 `Op` 是顶点，`oneof` 为 Exec / Source / File / Build / Merge / Diff / Passthrough。边是 `Input`（上游 digest + output index）。求解器按依赖并发执行，按输入做缓存。

2. **Frontend 可插拔**：Dockerfile frontend（本仓 const `1.26`）把 Dockerfile 编成 LLB。另外还有 `gateway.v0`：任意镜像都可以当 frontend。Buildpacks / HLB / Earthfile 等是外部语言，不是本仓必须实现的运行时。

3. **进程模型是 daemon + client**：`buildkitd` 默认听 `/run/buildkit/buildkitd.sock`；worker 默认 OCI/runc，可切 containerd。所谓 daemonless 是 `buildctl-daemonless.sh` 拉起一次性 daemon，不是“没有进程”。

4. **缓存按输入寻址，导出分 mode**：`parseCacheExportMode` 认 `min`（默认：顶层可传输层及其依赖）和 `max`（所有非 root vertex）；未知值回落 `min`。后端包括 inline、registry、local；README 把 GHA / S3 / Azure Blob 标成 experimental。

## 实践示例

### 案例 1：默认的 `docker build`

```bash
docker build -t myapp .
```

23.0+ 的 Docker 把这条接到 BuildKit。独立使用则是 `buildctl` 对 `buildkitd`。彩色并行日志是 UI，不是性能数字。

### 案例 2：无依赖 stage 可同时成为 LLB 顶点

```dockerfile
FROM node:20 AS frontend
RUN npm install

FROM golang:1.22 AS backend
RUN go mod download

FROM alpine
COPY --from=frontend /app /front
COPY --from=backend /app /back
```

`frontend` 与 `backend` 没有互相 `COPY --from`，在 LLB 里是可并行的 Exec 顶点；最终 stage 等两边。本轮未测量“快了多少”。

### 案例 3：cache / secret mount

```dockerfile
RUN --mount=type=cache,target=/root/.npm npm install
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm install
```

```bash
docker build --secret id=npmrc,src=$HOME/.npmrc .
```

`commands_runmount.go` 允许 bind / cache / tmpfs / secret / ssh。secret 还可 `env=` 注入，此时默认不落 `/run/secrets`。cache mount 的 key 由 id 等参数决定，与普通 layer hash 不是同一套。

### 案例 4：远程缓存导出

```bash
docker buildx build \
  --cache-to=type=registry,ref=myrepo/cache:main,mode=min \
  --cache-from=type=registry,ref=myrepo/cache:main \
  -t myapp .
```

`mode=min` 是 daemon 默认；`mode=max` 导出更多中间 vertex，体积也会更大。本轮未跑 registry，也没有命中率数字。

## 踩过的坑

1. **`DOCKER_BUILDKIT=1` 是旧开关**：README 的 Used by 仍写这句；23.0+ 默认已是 BuildKit。旧引擎不加这个环境变量就走不到它。

2. **cache mount ≠ layer cache**：改了上一行 `COPY` 不会按 layer 规则自动丢掉 `type=cache` 目录。这是机制，不是本轮测出的“一定更快”。

3. **远程缓存要自己管生命周期**：`max` 会推更多 vertex。BuildKit 不会替你制定 registry 保留策略。

4. **daemonless 仍要特权/安全选项**：`buildctl-daemonless.sh` 文档示例带 `--privileged` 或 rootless 的 seccomp/apparmor 放开。它不是 Buildah 那种“默认无长跑进程”。

5. **平台边界**：`buildkitd` 支持 Linux 与 Windows；macOS 公式不含 daemon。secret 的 uid/gid/mode 参数在 Windows 未实现。

## 适用 vs 不适用场景

**适用**：

- 需要把 Dockerfile 或其他 frontend 编成可并发 DAG
- 要跨机器导出/导入 content-addressed 缓存
- 要用 secret/ssh/cache mount，且接受 daemon 或 Buildx 客户端
- 多架构导出（LLB 带 Platform 约束）

**不适用**：

- 坚持“主机上不能有构建 daemon”，又不肯跑 daemonless 一次性进程——对照 [[buildah]]
- 把 README 的 Used by 名单当成性能排名
- 只想在 macOS 上本机跑 `buildkitd`（官方 daemon 不在这一侧）
- 跟踪 `v0.33.0-rc1` / dockerfile 1.27 RC，却按 0.32.2 推理

## 固定版本边界

- 本文绑定 `moby/buildkit@991535e0973488b6a429096d21fa13f81f2d89d8`，即 annotated tag `v0.32.2`。
- 同仓已有 `v0.33.0-rc1`（2026-08-27）与 `dockerfile/1.27.0-rc1`；未绑定。
- 本仓 Dockerfile frontend const 为 `1.26`。Go 1.26.3。许可 Apache-2.0。
- cache export 默认 `min`；GHA / S3 / Azure 缓存在 README 中标 experimental。
- 本文未启动 `buildkitd`、未跑 `buildctl`、未测耗时或命中率，状态保持 `UNVERIFIED`。

## 学到什么

1. **把指令序列变成依赖图**之后，并发和跨机器缓存才是同一套数学，而不是两套优化开关
2. **Frontend 与 solver 分离**让 Dockerfile 不再垄断构建定义
3. **Daemon 是 BuildKit 的默认形态**；daemonless 只是把 daemon 的寿命缩到一次 build
4. **secret 的合同是“不进层、不进 checksum”**，不是“日志里绝对看不见你自己 echo 出来的值”

## 应用型自测

1. LLB 的 `Op` 是不是只能表示 `Exec`（跑命令）？
2. `--cache-to` 不写 `mode` 时，daemon 按 `min` 还是 `max` 导出？
3. `buildctl-daemonless.sh` 是不是表示 BuildKit 可以完全没有 `buildkitd` 进程？

检查点：

1. 不是。`ops.proto` 的 oneof 还有 Source / File / Build / Merge / Diff / Passthrough。
2. `min`。`parseCacheExportMode` 把空/未知值回落 `CacheExportModeMin`。
3. 不是。脚本拉起一次性 daemon；README 把这叫做 daemonless mode。

## 延伸阅读

- 固定源码：[moby/buildkit](https://github.com/moby/buildkit) —— 本文绑定提交 `991535e0973488b6a429096d21fa13f81f2d89d8`
- LLB 定义：`solver/pb/ops.proto`
- Docker 文档：[docs.docker.com/build/buildkit](https://docs.docker.com/build/buildkit/)
- [[docker]] —— BuildKit 的常见宿主
- [[dagger]] —— README Used by 中的 LLB 客户端
- [[kaniko]] —— 另一条无 dockerd 的构建路线

## 关联

- [[docker]] —— Engine 23.0+ 默认 builder（README 声明）
- [[dagger]] —— 基于 BuildKit 的 pipeline 引擎
- [[kaniko]] —— 纯集群内构建的对照
- [[github-actions]] —— README 记载的 experimental cache 后端之一
- [[buildah]] —— fork-exec、默认 jobs=1 的对照实现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[buildah]] —— Buildah — 不要守护进程，每次构建都是一个 fork 出来的小工
- [[cri-o]] —— CRI-O — 只为 Kubernetes 而生的瘦身版容器运行时
- [[kaniko]] —— kaniko — 在没有 Docker 的容器里也能构建 Docker 镜像
- [[moby]] —— Moby — Docker 把引擎拆开后的开源上游
