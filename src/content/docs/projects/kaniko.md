---
title: kaniko — 在没有 Docker 的容器里也能构建 Docker 镜像
来源: https://github.com/GoogleContainerTools/kaniko
日期: 2026-06-01
分类: DevOps
难度: 中级
---

## 是什么

kaniko 是一个**在不依赖 Docker 守护进程的环境里、把 Dockerfile 构建成容器镜像**的工具。它由 Google 开源，专门解决"我想在 Kubernetes 集群里构建镜像，可是又不想给容器开特权"这件事。

日常类比：**传统的 `docker build` 像在大厨房里做菜**——必须有完整厨房（Docker daemon）、必须有钥匙（root 权限）。**kaniko 像一个自带便携灶台的厨师**——只要给他一份食谱（Dockerfile）和食材（基础镜像），他自己在背包里就能把菜做出来，不需要进你家厨房。

最简单的体验，在 Kubernetes 里跑一个 Pod：

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:latest
    args:
    - "--dockerfile=Dockerfile"
    - "--context=git://github.com/your/repo"
    - "--destination=registry.example.com/myapp:latest"
```

这个 Pod **没有特权（non-privileged）**、没有挂载 Docker socket，但它读了 Dockerfile、构建了镜像、推到了仓库。注意：上游仓库现已 **archived**，下面案例仍可用来理解机制，新流水线应优先评估 BuildKit/buildah。

## 为什么重要

不理解 kaniko 的设计，下面这些事都没法解释：

- 为什么云原生 CI/CD（GitLab CI on K8s、Tekton、部分 Argo Workflows）能在普通 Pod 里跑镜像构建——历史上大量流水线选的是 kaniko
- 为什么很多公司把"build 镜像"从专用构建机迁到 K8s 集群里——多亏它让构建 Pod 变成普通工作负载
- 为什么 Docker-in-Docker（DinD）一直被视作安全风险——它要求 `--privileged`；kaniko 是早期能绕开这条路的主流方案之一
- 为什么"一次性构建 Pod"这种工作流可行——跑完就销毁，没有残留 daemon 状态

简单说：**它把"构建镜像"这件原本要特权的事，降级成普通容器工作负载**。

## 核心要点

kaniko 的工作原理可以拆成 **三步**：

1. **解压基础镜像到自己的根文件系统**：executor 启动时，把 Dockerfile 里 `FROM` 指定的基础镜像 layer 解压到自己容器的 `/` 目录下。它把"基础镜像"和"自己的运行环境"合二为一。

2. **逐条执行 Dockerfile 指令、每步快照文件系统**：每条 `RUN` / `COPY` / `ADD` 跑完后，扫描整个文件系统，记下新增、修改、删除，打包成一层 layer。这一步叫 **filesystem snapshotting**。

3. **拼装 layer + 推到 registry**：按 OCI 规范把 layer 压成 tar.gz、写好 manifest、直接 HTTP 推到目标 registry。整个过程**没有用过 Docker daemon、没有用过 containerd**。

简单说：**它把 Docker daemon 的核心动作在用户态自己重写了一遍**。

## 实践案例

### 案例 1：在 GitLab CI on K8s 里构建镜像

```yaml
build:
  image:
    name: gcr.io/kaniko-project/executor:debug
    entrypoint: [""]
  script:
    - /kaniko/executor
      --context $CI_PROJECT_DIR
      --dockerfile $CI_PROJECT_DIR/Dockerfile
      --destination $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
```

**逐部分解释**：

- `executor:debug` 带 shell，方便在 `script` 里直接调 `/kaniko/executor`
- `--context` 指向当前 job 的源码目录；`--dockerfile` 指定配方
- `--destination` 写到 GitLab 自带 registry，标签用 commit SHA 便于追溯
- Runner 在 K8s 里时，job 是普通 Pod：**不需要 DinD、privileged、或挂载 docker.sock**

### 案例 2：Tekton 流水线里的构建步骤

```yaml
- name: build-image
  image: gcr.io/kaniko-project/executor:latest
  args:
    - --dockerfile=Dockerfile
    - --context=/workspace/source
    - --destination=$(params.IMAGE)
    - --cache=true
    - --cache-repo=$(params.IMAGE)/cache
```

**逐部分解释**：

- Tekton step 的工作目录通常在 `/workspace/source`，与 `--context` 对齐
- 只写 `--cache=true` 不够，必须配可写的 `--cache-repo`
- 下次构建若某条 `RUN` 的 base + 命令未变，可直接拉缓存层，省掉重跑
- 不要把 cache repo 设成正式镜像路径，否则缓存层和发布标签会混在一起

### 案例 3：本地用 Docker 跑 kaniko 体验

```bash
docker run \
  -v $(pwd):/workspace \
  -v ~/.docker/config.json:/kaniko/.docker/config.json \
  gcr.io/kaniko-project/executor:latest \
  --dockerfile=/workspace/Dockerfile \
  --context=dir:///workspace \
  --destination=myregistry/myapp:test \
  --no-push
```

**逐部分解释**：

- 把当前目录挂进 `/workspace`，用 `dir://` context 读本地 Dockerfile
- 挂载 `config.json` 只在真正 push 时需要；`--no-push` 可先验证能否构建
- 有些在 `docker build` 能过的 Dockerfile，在 kaniko 会失败（未模拟全部 daemon 行为，如特权 `RUN`）

## 踩过的坑

1. **kaniko 必须用专用 executor 镜像**：不能 `apk add kaniko`——它依赖 `/kaniko/`、`/workspace/` 等预设布局。

2. **构建过程会污染容器文件系统**：基础镜像解压到根目录后，别再在同一容器里跑无关命令。

3. **缓存配置错就等于没缓存**：`--cache=true` 必须配独立可写 `--cache-repo`。

4. **不支持所有 Dockerfile 指令**：`HEALTHCHECK` 等常被忽略；BuildKit 的 `RUN --mount=...` 不支持，迁过来要先验证。

## 适用 vs 不适用场景

**适用**：

- 已有依赖 kaniko 的 K8s CI 流水线，需要理解或维护现有 Job
- 多租户环境里复盘"为何曾用非特权 Pod 构建镜像"
- 对比 DinD / privileged 构建的安全模型时，作为经典对照

**不适用**：

- **新项目默认选型**：上游已 archived，应优先 BuildKit rootless、buildah 等仍在维护的方案
- 本地桌面开发 → 直接 `docker build` / BuildKit 更顺手
- 需要 BuildKit 高级 mount/secret → 用 BuildKit
- Windows 容器构建 → kaniko 只支持 Linux 容器

## 历史小故事（可跳过）

- **2018 年**：Google 开源 kaniko，回应 GKE 用户"想在 K8s 里构建镜像又不愿开 DinD"的痛点。
- **2019-2020 年**：随 GitLab CI、Tekton、Argo Workflows 在 K8s 普及，kaniko 成为常见推荐构建器之一。
- **2021 年起**：BuildKit rootless、Buildah 成熟，选择不再唯一；kaniko 仍因配置简单被大量存量流水线保留。
- **2025 年前后**：GitHub 仓库标记为 **archived**，代码可查但不再作为活跃上游；stars 仍约 15k+。

## 学到什么

1. **绕开守护进程是云原生的关键模式** —— 一次性进程比常驻 daemon 更适合集群调度
2. **filesystem snapshot 是构建工具的核心抽象** —— 对比前后差异、打包成 layer
3. **专注比通用更长寿，但维护停了仍要迁移** —— 单一痛点方案会过时，选型要看上游状态
4. **OCI 规范让工具替换变得可能** —— 镜像格式标准化后，构建器可以替换而不改 registry 契约

## 延伸阅读

- 官方仓库：[GoogleContainerTools/kaniko](https://github.com/GoogleContainerTools/kaniko)（已 archived，README 仍是机制入门）
- 设计博客：[Building Container Images Securely on Kubernetes](https://cloud.google.com/blog/products/containers-kubernetes/introducing-kaniko-build-container-images-in-kubernetes-and-google-container-builder-even-without-root-access)
- 社区对比：[kaniko vs BuildKit vs Buildah](https://blog.alexellis.io/building-containers-without-docker/)
- [[docker]] —— 对照对象，先理解 daemon 工作流
- [[buildkit]] —— 更适合新项目的下一代构建后端
- [[tekton]] —— K8s 原生流水线，历史上常与 kaniko 搭配

## 关联

- [[docker]] —— kaniko 是 Docker daemon 在 K8s 安全场景下的经典替代品
- [[buildkit]] —— 同为构建工具；新项目更常看 BuildKit
- [[tekton]] —— K8s 原生 CI，存量流水线里常见 kaniko step
- [[k3s]] —— 轻量 K8s 上同样能跑（或迁移）构建 Pod
- [[buildah]] —— 另一条非 daemon 构建路线，常与 kaniko 对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
