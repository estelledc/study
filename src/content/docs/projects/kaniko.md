---
title: kaniko — 在没有 Docker 的容器里也能构建 Docker 镜像
来源: https://github.com/GoogleContainerTools/kaniko
日期: 2026-06-01
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
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

这个 Pod **没有特权（non-privileged）**、没有挂载 Docker socket，但它读了 Dockerfile、构建了镜像、推到了仓库。

## 为什么重要

不理解 kaniko 的设计，下面这些事都没法解释：

- 为什么云原生 CI/CD（GitLab CI on K8s、Tekton、Argo Workflows）能在普通 Pod 里跑 `docker build`——背后大多是 kaniko
- 为什么很多公司把"build 镜像"从专用构建机迁到 K8s 集群里——多亏 kaniko 让构建 Pod 变成普通工作负载，可以共享集群资源
- 为什么 Docker-in-Docker（DinD）一直被视作安全风险——它要求容器开 `--privileged`，相当于把宿主机大门交出去；kaniko 是少数能完全绕开这条路的方案
- 为什么"GitOps + 镜像构建"这种工作流可行——kaniko Pod 跑完就销毁，没有残留状态

简单说：**它把"构建镜像"这件原本要特权的事，降级成普通容器工作负载**。

## 核心要点

kaniko 的工作原理可以拆成 **三步**：

1. **解压基础镜像到自己的根文件系统**：kaniko executor 启动时，把 Dockerfile 里 `FROM` 指定的基础镜像 layer 解压到自己容器的 `/` 目录下。它把"基础镜像"和"自己的运行环境"合二为一。

2. **逐条执行 Dockerfile 指令、每步快照文件系统**：每条 `RUN` / `COPY` / `ADD` 跑完后，kaniko 扫描整个文件系统，记下哪些文件新增、修改、删除，把这些差异打包成一层 layer。这一步叫 **filesystem snapshotting**。

3. **拼装 layer + 推到 registry**：所有指令跑完后，kaniko 按 OCI 规范把 layer 压成 tar.gz、写好 manifest、直接 HTTP 推到目标 registry。整个过程**没有用过 Docker daemon、没有用过 containerd**。

简单说：**它把 Docker daemon 的核心动作（解压基础层、执行指令、生成新层）在用户态自己重写了一遍**。

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

GitLab Runner 跑在 K8s 里，每个 job 是一个 Pod。这段配置让 kaniko 在普通 Pod 里完成构建——**不需要 DinD、不需要 privileged、不需要 mount /var/run/docker.sock**。

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

`--cache=true` 让 kaniko 把每个 RUN 指令产生的 layer 推到一个独立 cache repo 里。下次再构建时，如果 RUN 指令的 base + 命令完全一样，直接从 cache repo 拉，**省掉重新执行**。

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

`--no-push` 让它构建但不推送，方便本地测试 Dockerfile 是否能在 kaniko 环境下正常构建。注意：**有些 Dockerfile 在 `docker build` 能过，在 kaniko 会失败**——因为 kaniko 没模拟所有 Docker daemon 行为（比如 `--privileged` RUN）。

## 踩过的坑

1. **kaniko 必须用专用 executor 镜像**：不能在自己的 Alpine 镜像里 `apk add kaniko`——它需要预设的目录结构（`/kaniko/`、`/workspace/`）和工具链。永远从 `gcr.io/kaniko-project/executor` 起步。

2. **构建过程会污染容器文件系统**：kaniko 把基础镜像解压到自己根目录，意味着容器里跑的所有进程都被替换。**别在 kaniko 容器里再跑别的命令**——`/bin/sh` 可能已经是基础镜像里的版本而非原 executor 的。

3. **缓存配置错就等于没缓存**：`--cache=true` 单独写没用，必须配 `--cache-repo` 指向一个可写 registry 路径。常见错误是把 cache repo 设成了主镜像 repo，导致缓存层和正式镜像混在一起。

4. **不支持所有 Dockerfile 指令**：`HEALTHCHECK`、`STOPSIGNAL` 这些被忽略；`RUN --mount=type=cache` 这种 BuildKit 扩展语法不支持。复杂 Dockerfile 迁过来要先验证。

## 适用 vs 不适用场景

**适用**：

- Kubernetes 集群里跑 CI/CD，需要构建容器镜像
- 多租户 / 安全合规环境，禁止给容器开 `--privileged`
- 想脱离 Docker-in-Docker 这种"嵌套虚拟化 + 特权"的风险组合
- GitLab CI / Tekton / Argo Workflows / Jenkins on K8s 等云原生流水线

**不适用**：

- 本地开发、纯桌面构建场景 → 直接 `docker build` 更顺手
- 需要 BuildKit 高级特性（`--mount=type=cache` / `--mount=type=secret`）→ 用 BuildKit 或 buildah
- 极致追求构建速度和增量精度 → BuildKit 的并行执行和 mount cache 更强
- 需要 Windows 容器构建 → kaniko 只支持 Linux 容器

## 历史小故事（可跳过）

- **2018 年**：Google 内部在 GKE 用户中反复听到一个痛点——"我们想在 K8s 里跑 CI 构建镜像，但 DinD 太危险"。team 把内部工具开源，命名为 kaniko（来自卡纳卡人 Kanaka，夏威夷土著工人，象征"自己就能干活"）。
- **2019-2020 年**：随着 GitLab CI、Tekton、Argo CD 在 K8s 集群普及，kaniko 成为这些平台默认推荐的镜像构建工具。
- **2021 年起**：BuildKit rootless 模式成熟，Buildah 也在追赶；kaniko 不再是唯一选择，但因为简单、稳定、配置最少，依旧被很多团队保留。
- **现在**：项目维护节奏放缓，但仍是云原生 CI 的事实标准之一。GitHub 上 stars 超过 14k。

它是少有的"为单一痛点而生 + 真把那个痛点解决了"的工具。

## 学到什么

1. **绕开守护进程是云原生的关键模式** —— kaniko 把"daemon 模型"换成"一次性进程模型"，让构建任务能像普通工作负载一样调度
2. **filesystem snapshot 是构建工具的核心抽象** —— 不管 Docker、kaniko 还是 BuildKit，本质都是"对比前后差异、打包成 layer"
3. **专注比通用更长寿** —— kaniko 没尝试重做整个 BuildKit，只解决"K8s 里安全构建镜像"这一件事，反而活得很久
4. **OCI 规范让工具替换变得可能** —— 因为镜像格式标准化，kaniko 产出的镜像和 `docker build` 产出的镜像在 registry 里完全等价

## 延伸阅读

- 官方仓库：[GoogleContainerTools/kaniko](https://github.com/GoogleContainerTools/kaniko)（README 是最快入门路径）
- 设计博客：[Building Container Images Securely on Kubernetes](https://cloud.google.com/blog/products/containers-kubernetes/introducing-kaniko-build-container-images-in-kubernetes-and-google-container-builder-even-without-root-access)（Google 官方介绍 kaniko 起源的文章）
- 与 BuildKit 对比：[kaniko vs BuildKit vs Buildah](https://blog.alexellis.io/building-containers-without-docker/)（社区里常被引用的对比文）
- [[docker]] —— kaniko 的对照对象，理解 Docker daemon 工作流后再看 kaniko 一通百通
- [[buildkit]] —— Docker 官方下一代构建后端，功能更强但配置更重
- [[tekton]] —— K8s 原生流水线，kaniko 是它最常搭配的构建步骤

## 关联

- [[docker]] —— kaniko 是 Docker daemon 在 K8s 安全场景下的替代品
- [[buildkit]] —— 同为下一代构建工具，BuildKit 走"功能丰富"路线，kaniko 走"足够简单"路线
- [[tekton]] —— K8s 原生 CI，kaniko 是它构建容器镜像的事实标准
- [[k3s]] —— 轻量 K8s 发行版，kaniko Pod 在 k3s 集群里同样能直接跑
