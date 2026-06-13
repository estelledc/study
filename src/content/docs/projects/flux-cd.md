---
title: Flux CD 零基础学习笔记
来源: https://github.com/fluxcd/flux2
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

# Flux CD 零基础学习笔记

## 一、什么是 Flux CD？日常类比

想象你有一个大乐高城堡，里面的每个模块——城墙、塔楼、士兵——都可以拆下来重装。

你手里有一份"蓝图"，详细记录了城堡应该是什么样子。如果不小心碰歪了一座塔，你会重新按照蓝图把它装好。

Flux CD 做的事情就是：它是一位永远不休息的"乐高检查员"。

1. 你把蓝图存在 Git 仓库里（一份声明式的配置）
2. Flux 在 Kubernetes 集群里跑着，不停地检查
3. 如果集群的实际状态和蓝图不一致——不管是因为你手动改了，还是出错了——Flux 都会自动把它改回蓝图的样子

这就是 **GitOps** 的核心：用 Git 当唯一真相源，用自动化保证集群状态永远匹配。

> GitOps 一句话总结：代码写在哪，集群就长什么样；有人改了，Flux 拉回来。

---

## 二、核心概念

### 2.1 五大组件（控制器）

Flux v2 不是单个程序，而是由几个"控制器"组成的集合，每个控制器负责一件事：

- **Source Controller** — 去 Git/OCI/Helm 仓库"取货"，拿到配置工件
- **Kustomize Controller** — 把拿到的配置用 Kustomize 合在一起，然后应用到集群
- **Helm Controller** — 管理 Helm Release，类似用 Helm 但自动化驱动
- **Notification Controller** — 发出告警和事件通知（比如部署成功/失败）
- **Image Automation Controllers** — 自动检测镜像更新，并推送变更回 Git

它们都跑在同一个 `flux-system` Namespace 里。

### 2.2 Source（来源）

Source 告诉 Flux：配置从哪里来。

常见类型：

| Source 类型 | 用途 |
|---|---|
| GitRepository | 拉取 Git 仓库里的 YAML 配置 |
| OCIRepository | 从容器注册表获取配置工件 |
| HelmRepository | 获取 Helm Chart 仓库索引 |
| Bucket | 从 S3/GCS 等对象存储拉取文件 |

### 2.3 Kustomization（自定义化）

Kustomization 告诉 Flux：拿到配置后怎么处理。

比如：应用哪个目录？是否删除集群里多余的资源（prune）？是否等待资源就绪（wait）？

### 2.4  reconcilation（调和）

调和是 Flux 的灵魂机制。它的循环很简单：

1. Flux 检查 Git 仓库是否有新提交
2. 如果有，拉取新配置
3. 对比集群当前状态
4. 如果有差异，自动应用变更
5. 重复步骤 1

这个循环默认每 5 分钟检查一次，可以手动触发 `flux reconcile` 立即执行。

### 2.5 Bootstrap（启动）

Bootstrap 是 Flux 的自我安装过程。一条命令：

```bash
flux bootstrap github \
  --owner=$GITHUB_USER \
  --repository=fleet-infra \
  --branch=main \
  --path=./clusters/my-cluster \
  --personal
```

它做了四件事：

1. 在 GitHub 创建（或复用）一个仓库
2. 把 Flux 组件的清单推送到那个仓库
3. 在集群里安装 Flux 控制器
4. 配置 Flux 去追踪那个仓库的变化

---

## 三、动手示例

### 示例 1：定义一个 Git 来源

你要部署一个应用，应用的 Kubernetes 配置存在 GitHub 上的 `stefanprodan/podinfo` 仓库。

第一步，创建一个 `GitRepository` 资源告诉 Flux 去哪里取：

```yaml
# podinfo-source.yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/stefanprodan/podinfo
  ref:
    branch: master
```

关键字段解释：

- `interval: 1m` — 每 1 分钟检查一次有没有新提交
- `url` — Git 仓库地址
- `ref.branch` — 只关注 master 分支

创建之后，Flux 的 Source Controller 会开始拉取这个仓库。

你可以用 CLI 命令快速生成这个文件：

```bash
flux create source git podinfo \
  --url=https://github.com/stefanprodan/podinfo \
  --branch=master \
  --interval=1m \
  --export > ./clusters/my-cluster/podinfo-source.yaml
```

然后把文件提交到你的基础设施仓库，Flux 自动同步到集群。

### 示例 2：用 Kustomization 部署应用

有了来源还不够，你需要告诉 Flux：拿到配置后，怎么处理并部署到集群。

```yaml
# podinfo-kustomization.yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 30m
  path: ./kustomize
  prune: true
  wait: true
  sourceRef:
    kind: GitRepository
    name: podinfo
  targetNamespace: default
  timeout: 3m
```

关键字段解释：

- `interval: 30m` — 每 30 分钟检查一次变更
- `path: ./kustomize` — 在源仓库里应用 `kustomize` 目录下的配置
- `prune: true` — 删除源仓库里已不存在的资源（自动清理）
- `wait: true` — 等待所有资源就绪（Ready）
- `sourceRef` — 关联上面定义的 GitRepository 来源
- `targetNamespace: default` — 部署到 default 命名空间
- `timeout: 3m` — 操作超时时间

部署后你可以用这些命令观察状态：

```bash
# 持续观察 Kustomization 的状态
flux get kustomizations --watch

# 查看已部署的资源
kubectl -n default get deployments,services
```

输出类似：

```
NAME      REVISION                  SUSPENDED  READY   MESSAGE
podinfo   master@sha1:44157ecd      False      True    Applied revision: master@sha1:44157ecd
```

### 示例 3：自定义部署（Inline Patch）

如果应用的配置在你无法控制的仓库里，怎么修改它？Flux 支持用内联补丁（Inline Patch）做微调。

比如把 podinfo 的最小副本数从 2 改成 3：

```yaml
# 在 podinfo-kustomization.yaml 的 spec 下追加
spec:
  # ... 其他字段保持不变 ...
  patches:
    - patch: |-
        apiVersion: autoscaling/v2
        kind: HorizontalPodAutoscaler
        metadata:
          name: podinfo
        spec:
          minReplicas: 3
      target:
        name: podinfo
        kind: HorizontalPodAutoscaler
```

提交这个改动到 Git，Flux 自动应用补丁，集群里的副本数就变成 3 了。

---

## 四、Flux 的工作流程图

```
┌──────────────┐     拉取配置      ┌──────────────────┐
│  Git 仓库     │ ──────────────►  │ Source Controller │
│ (蓝图所在处)   │                  └────────┬─────────┘
└──────────────┘                           │ 工件(artifact)
                                           ▼
                                   ┌──────────────────┐
                                   │Kustomization CRD │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │Kustomize Controller│
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │  Kubernetes 集群   │
                                   │  实际运行状态      │
                                   └──────────────────┘
                                            ▲
                                            │ 持续比对 + 自动修复
                                            └─────────┘
```

---

## 五、为什么要用 Flux？

| 场景 | 不用 Flux | 用 Flux |
|---|---|---|
| 有人手改了集群配置 | 配置漂移，和 Git 不一致 | 自动恢复为 Git 中的状态 |
| 多环境部署 | 手动重复操作，易出错 | 一套配置推多个仓库/集群 |
| 镜像更新 | 手动改版本号，容易漏 | Image Automation 自动检测并推送 |
| 审计追踪 | 难以追溯谁改了什么 | Git 提交记录就是完整审计链 |
| 回滚 | 复杂的手动操作 | `git revert` + Flux 自动同步 |

---

## 六、常见术语速查

| 术语 | 含义 |
|---|---|
| GitOps | 用 Git 作为基础设施唯一真相源的管理范式 |
| Reconciliation | Flux 持续比对并修复差异的循环机制 |
| Bootstrap | Flux 的自我安装过程 |
| Source | 配置来源（Git/OCI/Bucket 等） |
| Kustomization | 定义如何应用配置的声明资源 |
| HelmRelease | 用 Helm 方式管理应用发布 |
| Drift | 集群状态偏离 Git 定义的状态 |
| Prune | 自动删除 Git 中不存在的资源 |

---

## 七、后续学习方向

1. **Helm Release** — 学习用 Flux 管理 Helm Chart 而非裸 YAML
2. **Image Automation** — 学习让 Flux 自动检测 Docker 镜像更新并推送 PR
3. **多集群管理** — 学习用一套 Git 仓库管理多个 Kubernetes 集群
4. **渐进式交付（Flagger）** — 学习 Canary 发布和 A/B 测试
5. **Gitless GitOps** — Flux 2022 年引入的新模式，用 OCI 注册表替代 Git 作为配置源

---

*参考资料：https://github.com/fluxcd/flux2 | https://fluxcd.io/flux/concepts/ | https://fluxcd.io/flux/get-started/*
