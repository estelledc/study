---
title: BuildKit — Docker 构建从串行手工艺到并发流水线
来源: moby/buildkit (GitHub, 8.6k stars), Tõnis Tiigi 2017
日期: 2026-06-01
分类: 基础设施
难度: 中级
---

## 是什么

BuildKit 是 **Docker / Moby 的下一代镜像构建后端**。日常类比：老版 `docker build` 像一位独自做菜的厨师，从洗菜到摆盘只能一道一道按食谱顺序做；BuildKit 像一支配齐的厨房团队，看到食谱先画一张依赖图，能并行的步骤就并行，做过一次的备料下次直接端出来。

你写的还是同一份 Dockerfile：

```dockerfile
FROM node:20
COPY package.json .
RUN npm install
COPY . .
RUN npm run build
```

但 BuildKit 接到这份 Dockerfile 后，**不会**逐行跑。它先把它编译成一张叫 LLB（Low-Level Builder）的 DAG，再调度执行。无依赖的步骤并发起来，做过的层走内容寻址缓存。

从 Docker 22.06 起，BuildKit **就是默认 builder**——你以为还在用老 `docker build`，其实早换了引擎。

## 为什么重要

不理解 BuildKit，下面这些事都解释不通：

- 为什么 `docker build` 同样的 Dockerfile，今年比 2018 年快好几倍——引擎换了
- 为什么 CI 里能 `--mount=type=cache` 持久化 npm/go/pip 缓存——这是 BuildKit 独有
- 为什么 Dagger / Earthly / depot.dev 这些"新 CI 工具"都共享同一套缓存——它们底层都是 BuildKit
- 为什么一份 Dockerfile 能一次输出 amd64 + arm64 镜像——多平台构建是 BuildKit 加的

## 核心要点

BuildKit 做对了三件事：

1. **把 Dockerfile 编译成 DAG**：老 builder 把 Dockerfile 当串行脚本，一行一层；BuildKit 把它编译成 LLB（一张 protobuf 描述的依赖图），节点是操作（exec / copy / mount），边是依赖。日常类比：从"剧本"变成"流程图"。

2. **并发执行 + 内容寻址缓存**：DAG 里没有依赖关系的节点同时跑。每个节点的输出按内容算 hash，下次任何机器构建到同一节点（同输入），直接复用——不再依赖"层序号"。

3. **前端可插拔**：Dockerfile 只是 LLB 的一个前端，其他前端（HLB、Buildpacks、Mockerfile、Dagger 的 SDK）也能生成 LLB。BuildKit 实质是一个**构建协议**，不是只服务 Dockerfile。

三件事合起来，让构建从"一台机器的本地手艺"变成"一套可分发可缓存的协议"。

## 实践案例

### 案例 1：并发让构建变快

老 builder 跑下面的 Dockerfile：

```dockerfile
FROM node:20 AS frontend
RUN npm install
FROM golang:1.22 AS backend
RUN go mod download
FROM nginx
COPY --from=frontend /app/dist /usr/share/nginx/html
COPY --from=backend /app/server /usr/local/bin/
```

会**串行**跑 frontend 和 backend 两个 stage。BuildKit 看 DAG 发现两者无依赖，**并行**跑——总时间从 `T(前) + T(后)` 缩到 `max(T(前), T(后))`。

### 案例 2：cache mount 让构建机不重复下载

```dockerfile
RUN --mount=type=cache,target=/root/.npm \
    npm install
```

`--mount=type=cache` 是 BuildKit 独有语法。它告诉 BuildKit："这个目录在构建之间持久化"。第二次跑 `npm install` 时，`/root/.npm` 还在，npm 跳过下载。**这个 cache 不进最终镜像层**，只在构建期生效。

### 案例 3：远程缓存让一台机器的构建被另一台复用

```bash
docker buildx build \
  --cache-to=type=registry,ref=myorg/myapp:cache \
  --cache-from=type=registry,ref=myorg/myapp:cache \
  -t myorg/myapp:latest .
```

第一次构建后把缓存推到 registry，第二台机器（CI 跑出来的临时容器）直接从 registry 拉缓存——内容寻址保证 hash 对得上就能命中。

### 案例 4：多平台一次出多个架构

```bash
docker buildx build \
  --platform=linux/amd64,linux/arm64 \
  -t myorg/myapp:latest \
  --push .
```

BuildKit 把 Dockerfile 编译两次（每个平台一份 LLB），并发构建，最后合成一个**多架构 manifest** 推到 registry。下游 `docker pull` 时，registry 自动按客户端架构选层。

### 案例 5：构建期机密不进镜像层

```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm install
```

执行 `docker buildx build --secret id=npmrc,src=$HOME/.npmrc .`。secret 在 `RUN` 期间挂进来，**不写入任何 layer**。镜像推到 registry 后，别人 pull 下来 `cat .npmrc` 是空的——老 builder 做不到这点，只能用 multi-stage 绕。

## 踩过的坑

1. **cache mount 的 key 和 layer 缓存是两套**：`--mount=type=cache` 的 key 是按 mount 配置算的；layer 缓存是按 RUN 命令 + 输入算的。改了 RUN 命令但没改 mount target，cache mount 还在但 layer 重做。新人常以为是同一个东西。

2. **远程缓存不会自己清理**：push 到 registry / S3 的 cache 越攒越多，registry 配额会爆。需要外部 GC（registry 自带的 gc 命令或 lifecycle 策略）。

3. **rootless 模式 OverlayFS 限制**：rootless 跑 BuildKit 用的是 fuse-overlayfs，性能比 native 慢，且某些 chmod / chown 跨用户场景会失败。生产建议要么给 root，要么用专门的 rootless 兼容镜像。

4. **并发让日志不再按 Dockerfile 顺序**：以前看日志知道"卡在第 5 行"，现在多个步骤并发，日志是混合输出。需要用 `--progress=plain` 和按步骤 ID 分组看。

## 适用 vs 不适用场景

**适用**：
- CI 里有多个独立步骤想并行（前后端 / 多语言 / 多 service 同 Dockerfile）
- 跨团队跨机器共享构建缓存（push 到 registry / S3）
- 需要构建期机密但不想泄漏到镜像层（`--mount=type=secret`）
- 多架构镜像分发（一次出 amd64 + arm64）
- rootless 容器环境跑构建（K8s pod 里）

**不适用**：
- Windows 容器构建（支持有限，主战场是 Linux）
- 纯 K8s 集群里不依赖 Docker 生态的镜像构建（用 Kaniko / img 更轻）
- 只是本地随手 `docker build` —— 新版 Docker 默认就是 BuildKit，不必单独学命令

## 历史小故事（可跳过）

- **2017 年**：Docker 内部 Tõnis Tiigi 启动 BuildKit 项目，目标替换老 `docker build`。当时 1.x builder 是单一守护进程串行跑，已成性能瓶颈
- **2018 年**：BuildKit 合入 moby/moby；Docker 18.06 加 `DOCKER_BUILDKIT=1` 实验开关，老用户可以试用
- **2020 年**：Docker 19.03 起 `docker buildx` 子命令稳定，作为 BuildKit 的官方客户端
- **2022 年**：Docker 22.06 开始**默认**走 BuildKit，legacy builder 标记 deprecated
- **2023 年**：Dagger 基于 BuildKit 重写 pipeline 引擎，证明 LLB 不只用于 Dockerfile——别人也能写自己的前端

## 学到什么

1. **把过程抽象成 DAG** 是个反复出现的好套路——构建系统、查询优化器、ML 训练框架、CI 引擎都在这条路上
2. **内容寻址缓存** 比"层序号缓存"强一个数量级——前者跨机器跨团队天然共享，后者只在本机有效
3. **协议化** 让一个工具的下游生态远超它本身——BuildKit 自己只跑 Linux 容器构建，但因为 LLB 是个开放协议，Dagger / Earthly / depot 都成了它的"用户"
4. **默认即转换** 是基础设施升级最优雅的姿势——用户没改任何命令，引擎已经换了一代

## 延伸阅读

- 官方仓库：[moby/buildkit](https://github.com/moby/buildkit)（README 是最快入门）
- 官方文档：[docs.docker.com/build/buildkit](https://docs.docker.com/build/buildkit/)（cache mount / secret / ssh 都有例子）
- 对比文章：[Earthly — BuildKit vs Buildah](https://earthly.dev/blog/buildkit-vs-buildah/)（讲清两条路线差异）
- [[moby]] —— BuildKit 的母仓库，Docker Engine 上游
- [[docker]] —— BuildKit 的最大下游
- [[dagger]] —— 基于 BuildKit 的"代码即 CI"引擎

## 关联

- [[moby]] —— Docker Engine 上游开源项目，BuildKit 在它仓库里
- [[docker]] —— 默认 builder 已切到 BuildKit
- [[dagger]] —— 把 BuildKit 当通用并发执行引擎，不只是构建
- [[kaniko]] —— Google 的 K8s 原生构建器，与 BuildKit 同代但路线不同
- [[nerdctl]] —— containerd 的 docker 兼容 CLI，内置 BuildKit
