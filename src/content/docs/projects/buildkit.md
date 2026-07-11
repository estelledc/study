---
title: BuildKit — Docker 下一代镜像构建后端
来源: https://github.com/moby/buildkit
日期: 2026-06-01
分类: devops / 容器构建
难度: 中级
---

## 是什么

BuildKit 是 Docker / Moby 的**新一代镜像构建后端**——你写的还是 `Dockerfile`，但跑起来的引擎换了一个。日常类比：

> 老式厨房：师傅一道菜做完才开始下一道（哪怕第二道根本不依赖第一道）。新厨房：先看菜单画一张依赖图，没相互等的菜同时开火。

BuildKit 干的就是后一件事——把 Dockerfile 编译成一张**有向无环图**（DAG），叫 LLB（Low-Level Builder），然后并发跑、共享缓存。结果是同样一个镜像，构建时间经常能明显缩短。

8.6k star，原作者 Tõnis Tiigi（Docker），2017 年从 `docker build` 抽出来重写，2018 年合入 Moby。Docker Engine 23.0 起默认就是它，老 builder 进入 deprecated 路线。

## 为什么重要

不理解 BuildKit 解释不了下面这些：

- 为什么同一份 Dockerfile 在新版 Docker 上突然快了——默认 builder 换了
- 为什么 GitHub Actions / GitLab CI 能"跨 job 共享 layer 缓存"——BuildKit 的远程缓存协议
- 为什么 Dagger / depot.dev / Earthly 这些"代码即流水线"工具都长得有点像——它们底下都是 BuildKit
- 为什么 `RUN --mount=type=secret` 能把密钥喂进构建过程而不会泄漏到镜像层——BuildKit 的高级 mount

## 核心要点

BuildKit 的设计可以拆成 **三个核心抽象**：

1. **LLB（中间表示）**：Dockerfile 不直接执行，先编译成一张 protobuf 描述的 DAG。每个节点是一个操作（exec / file 改动 / 拉镜像），边是依赖。这一步把"指令序列"变成"依赖关系"

2. **前端可插拔**：Dockerfile 只是 LLB 的一个 frontend。你也可以用 Buildpacks、HLB、Mockerfile，甚至自己写一个——只要最终输出 LLB 就行。BuildKit 不是构建器，是**构建协议**

3. **内容寻址缓存**：缓存键是步骤输入的 hash，不是层序号。同样的输入在任何机器上都命中同一份缓存——可以推到 registry / S3 / GitHub Actions cache，团队共享

三件事叠加：DAG 让并发可能，前端让协议复用，content hash 让缓存跨机器。

## 实践案例

### 案例 1：默认就在用，但你不知道

```bash
docker build -t myapp .
```

新版 Docker Engine（23.0+）这条命令背后跑的就是 BuildKit。如果你看到构建日志里有彩色进度条 + 多个步骤同时显示 `=>`，那就是它。老 builder 是一行一行串着打日志。

逐部分解释：

- `docker build` 仍然是入口命令，用户不需要直接调用 `buildkitd`。
- 日志里多个步骤同时刷新，说明 BuildKit 已经把独立步骤并发执行。

### 案例 2：并发省时间

```dockerfile
FROM node:20 AS frontend
RUN npm install        # 步骤 A：装前端依赖

FROM golang:1.22 AS backend
RUN go mod download    # 步骤 B：装后端依赖

FROM alpine
COPY --from=frontend /app /front
COPY --from=backend /app /back
```

老 builder：A 装完才装 B，串行 2 分钟。BuildKit：A 和 B 没相互依赖，**同时开跑**，1 分钟搞定。

逐部分解释：

- `frontend` 和 `backend` 是两个独立 stage，彼此没有 `COPY --from` 依赖。
- BuildKit 看到依赖图后，可以同时下载 npm 包和 Go module。
- 最后的 `FROM alpine` 需要等两个 stage 都完成，才把产物复制进最终镜像。

### 案例 3：持久化构建缓存

```dockerfile
RUN --mount=type=cache,target=/root/.npm npm install
```

`/root/.npm` 这个目录在多次构建之间**保留**——npm 不用每次重新下整个 cache。这是 BuildKit 的 cache mount，跟普通 layer cache 是两套机制。

逐部分解释：

- `type=cache` 声明这是构建机上的临时缓存，不会进入最终镜像。
- `target=/root/.npm` 告诉 BuildKit 把 npm 下载目录接到缓存卷上。

### 案例 4：构建机密不泄漏

```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm install
```

```bash
docker build --secret id=npmrc,src=$HOME/.npmrc .
```

`.npmrc`（含 token）只在这一步可见，**不会写入镜像层**。`docker history` 里看不到它。

逐部分解释：

- `--secret id=npmrc` 把宿主机文件注册成一次性密钥。
- Dockerfile 里的 `RUN --mount=type=secret` 只在这一条命令运行时挂载它。

### 案例 5：远程缓存共享

```bash
docker buildx build \
  --cache-to=type=registry,ref=myrepo/cache:main \
  --cache-from=type=registry,ref=myrepo/cache:main \
  -t myapp .
```

CI 跑完把缓存推到 registry，下一次（哪怕在另一台机器）`--cache-from` 直接拉回来。第一次构建 5 分钟，之后命中缓存 30 秒。

逐部分解释：

- `--cache-to` 把本次构建的可复用中间结果推到远端。
- `--cache-from` 在下次构建前先拉缓存，命中后跳过重复步骤。

## 踩过的坑

1. **`DOCKER_BUILDKIT=1` 是历史包袱**：老 Docker（< 23.0）要手动设这个环境变量才走 BuildKit。新版默认就是，但很多教程还在写——加了无害，没加且 Docker 旧就走不到 BuildKit

2. **cache mount 和 layer cache 是两套**：`RUN --mount=type=cache` 的 cache key 由你给的 `id` 决定，跟 `RUN` 这一层的 hash 无关。改了上一行 `COPY` 不会让 cache mount 失效——这反而是好事，但新人容易混

3. **远程缓存不会自己清**：推到 registry 的缓存会一直涨。需要自己设保留策略（比如 `mode=max` 推全量，`mode=min` 只推最终产物的关键层）

4. **并发让日志非确定**：步骤 A 和 B 同时跑，日志会交错。要按步骤分组看，命令行加 `--progress=plain` 或在 CI 里看每个 step 的独立日志

5. **rootless 模式有 OverlayFS 限制**：rootless（不需要 root 跑 buildkitd）更安全但有些 mount / chmod 操作受限。生产容器里跑构建（K8s pod）常用，但 Dockerfile 里跨用户改文件权限要小心

## 适用 vs 不适用场景

**适用**：

- CI 里多个独立步骤想并行（前端 + 后端依赖同时装）
- 跨团队 / 跨机器共享构建缓存（推到 registry，下次直接拉）
- 需要构建机密但不泄漏到镜像层（secret mount）
- 多架构镜像分发（一次构建出 amd64 + arm64）
- rootless 容器环境跑构建（K8s pod 里安全跑）

**不适用**：

- Windows 容器构建（支持有限，主战场是 Linux）
- 不用 Docker 生态、纯 K8s 镜像构建（Kaniko / img 更轻，不需要 daemon）
- 只想本地随手 `docker build`：默认已是 BuildKit，不必单独学

## 历史小故事（可跳过）

- **2017 年**：Tõnis Tiigi 在 Docker 内部启动 BuildKit，目标替换 1.x 的 `docker build`——并发 + 可插拔前端
- **2018 年**：合入 moby/moby；同年 Docker 18.06 加 `DOCKER_BUILDKIT=1` 实验开关
- **2020 年**：Docker 19.03 起 `buildx` 子命令稳定，作为 BuildKit 客户端
- **2023 年**：Docker Engine 23.0 默认走 BuildKit，legacy builder 标记 deprecated
- **2023 年**：Dagger 基于 BuildKit 重写 pipeline 引擎——证明 LLB 不只是 Dockerfile 的后端，是通用的"可缓存可并发的执行图"

## 学到什么

1. **把"指令序列"抽象成"依赖图"** 这一步，让并发、缓存、跨前端复用全部成为可能——这是工程设计上一个反复出现的模式
2. **前端可插拔**（Dockerfile 不是唯一）让 BuildKit 不只是构建器，是**构建协议**——抽象一旦立起来，生态就能在上面长
3. **content-addressable cache** 让缓存跨机器、跨团队可共享——这跟 Git / Nix / IPFS 的设计哲学一致：用 hash 取代位置

## 延伸阅读

- 官方文档：[docs.docker.com/build/buildkit](https://docs.docker.com/build/buildkit/)（最权威，有 LLB / cache / secret 各章节）
- 对比文章：[Earthly Blog — BuildKit vs Buildah](https://earthly.dev/blog/buildkit-vs-buildah/)（讲清两套主流构建后端取舍）
- 源码入口：[github.com/moby/buildkit](https://github.com/moby/buildkit) `frontend/dockerfile/` 看 Dockerfile 怎么编译成 LLB
- [[docker]] —— BuildKit 的宿主，理解镜像 / layer / registry 是前置
- [[dagger]] —— 基于 BuildKit 的"代码即 CI"工具
- [[kaniko]] —— K8s 原生镜像构建器，不依赖 daemon

## 关联

- [[docker]] —— BuildKit 是 Docker Engine 23.0+ 默认 builder
- [[dagger]] —— 用 LLB 重写 pipeline 引擎，证明 BuildKit 是通用执行图
- [[kaniko]] —— 纯 K8s 场景的替代方案，无 daemon 设计
- [[github-actions]] —— `actions/cache` 集成 BuildKit 远程缓存协议

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
