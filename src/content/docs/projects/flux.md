---
title: Flux — 让 Git 当 Kubernetes 集群的真理来源
来源: https://github.com/fluxcd/flux2
日期: 2026-06-01
分类: infrastructure
难度: 中级
---

## 是什么

Flux 是一只**住在 Kubernetes 集群里的小狗**，它每隔一两分钟就跑去 Git 仓库里看一眼："主人要我跑成什么样？" 然后回过头来把集群调成那个样子。

日常类比：像家里的扫地机器人，它不需要你每次按遥控器，只要你在 App 里把"地图分区"画好（写在 Git 里），它就会自己按图清扫，发现哪里偏了就自己补回去。

你写：

```yaml
# k8s-config repo / clusters/prod/app.yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: my-app
spec:
  interval: 1m
  path: ./apps/my-app
  sourceRef: { kind: GitRepository, name: my-config }
```

push 到 Git。Flux 在集群里看到了，自动 `kubectl apply -k`。你下次想升级，只 push Git，**不进集群**。

这种"Git 是唯一真理 + 集群自己 pull 同步"的范式，叫 **GitOps**。Flux 就是它的老牌实现，也是这个词的发明者（Weaveworks 2017）。

## 为什么重要

不理解 Flux 这套做法，下面这些事都说不清：

- 为什么大公司宁可多绕一层 Git，也不让 CI 直接 `kubectl apply` ——CI 拿到集群凭证 = 整个集群暴露
- 为什么 Kubernetes 的 controller 长得都很像（watch → diff → reconcile），Flux 是这个模式最干净的教学样本
- 为什么 Argo CD 跟 Flux 总被一起提——同一目标两种风格，选型时要懂差异
- 为什么 GitOps 比传统 CD 更扛"手滑"——任何漂移都会被 Flux 自己拉回来

## 核心要点

Flux v2 的本体是 **GitOps Toolkit**，6 个 controller 组合干活：

1. **source-controller**：从 Git / Helm 仓库 / OCI / S3 拉源，缓存为 artifact。类比：快递柜，把外面的东西先收进集群里。
2. **kustomize-controller**：拿到 artifact，按 Kustomization 资源里写的路径，apply 到集群。
3. **helm-controller**：管 HelmRelease（声明式 helm install / upgrade）。
4. **notification-controller**：事件外发（发 Slack / webhook）。
5. **image-reflector-controller**：扫容器镜像仓库的新 tag。
6. **image-automation-controller**：把新 tag **commit 回 Git**，闭环。

核心 CRD 只有几个：`GitRepository` / `Kustomization` / `HelmRelease` / `HelmRepository` / `ImagePolicy` / `Alert` / `Receiver`。**Git 是唯一真实来源**——这是整个系统的宪法。

## 实践案例

### 案例 1：最小 GitOps 闭环

```bash
flux bootstrap github \
  --owner=my-org --repository=k8s-config \
  --path=clusters/prod --personal
```

逐步看它做了什么：

1. 在集群里装上 Flux 的 6 个 controller（source / kustomize / helm 等）。
2. 在 Git 仓生成一份指向 `clusters/prod/` 的 Kustomization 清单。
3. 把部署用的 SSH deploy key 写进 GitHub，让集群能只读拉配置。

从此你**只改 Git，不动集群**；Flux 按 `interval` 自己 reconcile。

### 案例 2：镜像自动升级

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
spec:
  imageRepositoryRef: { name: my-app }
  policy:
    semver: { range: '>=1.0.0 <2.0.0' }
```

Flux 检测到 `my-app:1.4.2` 出现，自动改 Git 里的 deployment.yaml `image: my-app:1.4.2`，commit + push。再由自己 reconcile 部署到集群。**人不用按一次按钮**。

### 案例 3：多集群一份配置（base + overlay）

```
k8s-config/
  clusters/
    dev/    → kustomize overlay 用 dev 配置
    stage/  → stage 配置
    prod/   → prod 配置
```

每个集群各自跑一个 Flux：dev 集群的 GitRepository/Kustomization 指向 `clusters/dev/`，prod 指向 `clusters/prod/`。公共 Deployment 放 base，环境差异（副本数、域名、资源限额）写在 overlay 里——同一份 base + overlay，**三套环境差异通常 < 50 行**。

## 踩过的坑

1. **v1 和 v2 不兼容**：2020 年重写，单进程 → 多 controller。v1 的 `--git-poll-interval` 这种 flag 在 v2 全没了，要重写所有声明。老教程别看；2020 年之前的中文文章基本作废。

2. **drift detection 只管声明过的字段**：你在 Git 里只写了 `replicas: 3`，有人 `kubectl edit` 改了未出现在清单里的 `image`，Flux **默认不会**把 image 拉回来——这是 server-side apply 的字段所有权行为，不是 bug。想严格对齐，要把该字段写进 Git 清单让 Flux 接管；`prune: true` 管的是另一件事：删除「Git 里已经不存在、但集群里还留着」的资源。

3. **image automation 要写权限**：自动改回 Git 必须给 Flux 写权限，意味着集群里的 SSH key 能 push 到生产仓。漏出来 = 整条 GitOps 链被劫持。建议单独的 deploy key + 单独 branch + PR 走人审核。

4. **多租户 RBAC 易配错**：Flux 默认用自己的 ServiceAccount apply，权限大；多租户场景要给每个 Kustomization 显式绑 `serviceAccountName`，否则一个租户能在别人 namespace 创建资源——曾出过真实事故。

5. **interval 别设太短**：每个 GitRepository / Kustomization 都有 `interval`，默认 1m。几十个清单同时 1m 会把 Git 服务器打挂；分级设置（关键 30s，次要 5m）。

## 适用 vs 不适用场景

**适用**：
- Kubernetes 多集群（dev/staging/prod）配置同步
- 多租户平台——Flux 多 namespace + RBAC 隔离原生支持
- 镜像自动升级闭环（new tag → commit → deploy）
- CI 不应持有集群凭证的合规场景（金融 / 医疗）

**不适用**：
- 非 K8s 资源（DB schema / DNS / IAM）→ 用 [[crossplane]] 或 Terraform
- 团队强依赖图形 UI 看应用拓扑 → 选 [[argocd]]，UI 是它强项
- 单集群单应用、改动很少 → 直接 `kubectl apply` 就够，引 Flux 反而是负担

## 历史小故事（可跳过）

- **2016**：Weaveworks 开源 Flux v1，单 binary，主要为自家 SaaS 服务。
- **2017**：Weaveworks Alexis Richardson 写下 GitOps 一词的定义博文——"用 Git 做 ops"。
- **2019**：Flux 进 CNCF sandbox。
- **2020**：Flux v2 发布，拆成 Toolkit，CRD 化。同期 Argo CD 也红起来，两强格局成型。
- **2021 → 2023**：CNCF incubation → graduated（毕业）。已是 K8s 生态里 GitOps 的事实标准之一。

## 学到什么

1. **GitOps 不是一个工具，是一种范式**：Git 当真理 + 集群 pull + 持续 reconcile。Flux 把这三件事拆成最小 CRD。
2. **controller pattern 是 K8s 的核心抽象**：watch → diff → reconcile，写一次会写十次。理解 Flux 后再看 cert-manager / external-dns / argo-rollouts，套路一模一样。
3. **pull > push**：CI push 给集群，CI 必须有集群凭证；集群 pull Git，Git 凭证只读就够——攻击面缩小一半。
4. **闭环自动化的代价是写权限**：image automation 强大，但意味着集群能改你的代码仓库——风险与便利成对出现。
5. **Toolkit 化的好处**：6 个 controller 各管一摊，可以只装一部分（比如不要 image automation），单点故障小，调试日志也只看一个 controller。

## 看源码从哪进

- `cmd/flux/`：CLI 入口，bootstrap / get / reconcile 命令
- `controllers/source/`：source-controller 主循环，看 GitRepository reconcile 流程最直观
- `pkg/runtime/`：所有 controller 共用的工具——event recorder、conditions、metrics
- 想理解 reconcile pattern：直接读 `KustomizationReconciler.Reconcile`，200 行讲完整套循环

## 延伸阅读

- 官方文档：[fluxcd.io](https://fluxcd.io/flux/)（concepts → get-started → cheatsheets，2 小时能跑通最小 demo）
- GitOps 原文：[Weaveworks GitOps blog 2017](https://www.weave.works/blog/gitops-operations-by-pull-request)（这个词的源头）
- 对比文章：[Flux vs Argo CD](https://fluxcd.io/flux/faq/#how-does-flux-compare-to-argo-cd)（官方自己写的，少见的客观）
- [[argocd]] —— 同代竞品，UI 派
- [[kustomize]] —— Flux 的清单引擎之一
- [[helm]] —— Flux 的另一种清单源
- [[kubernetes]] —— Flux 的宿主

## 关联

- [[argocd]] —— GitOps 双雄之一，UI vs CLI 路线之争
- [[kustomize]] —— Flux kustomize-controller 的核心依赖
- [[helm]] —— Flux helm-controller 把 HelmRelease 翻成实际部署
- [[kubernetes]] —— Flux 整套架构都建在 controller pattern 上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[comfyui]] —— ComfyUI — 节点式扩散模型 GUI
