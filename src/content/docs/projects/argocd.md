---
title: Argo CD — Kubernetes GitOps 工具
来源: https://github.com/argoproj/argo-cd
日期: 2026-05-29
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Argo CD 是一个**让 Git 仓库直接驱动 Kubernetes 部署**的工具——你把 yaml 推到 Git，集群里的 Argo CD 自动 fetch、对比、同步。

日常类比：

- **以前部署**像微信发消息：你在 CI 里 `kubectl apply`，相当于"发消息"告诉集群"装这个版本"。消息发完就不管了，发完之后状态是不是真的对？没人知道。
- **Argo CD 部署**像让同事盯着你的笔记本：笔记本（Git repo）一改，他自动照着改。如果有人手动改了集群（绕过 Git），他还会标"drift"提醒你。

它由 Intuit 在 2018 年开源，2020 年加入 CNCF，2022 年毕业。和 Flux 一起是 GitOps 范式的两大标杆。

## 为什么重要

不理解 Argo CD，下面这些事都不好解释：

- **GitOps 范式怎么落地**——"Git 是 source of truth"听起来抽象，Argo CD 是把这句话工程化的样本
- **多集群 / 多应用怎么管**——一个团队有 100+ 微服务、3 个集群（dev/staging/prod），手动 `kubectl apply` 难以维持；Argo CD 的 Apps of Apps 模式就是为这个生的
- **drift 检测怎么做**——集群被运维同学手动改一刀，谁能发现？Argo CD UI 直接红字标出
- **可视化 K8s 状态**——比 `kubectl get` + `describe` 直观一个量级；Pod / Service / Ingress 关系图一目了然

## 核心要点

Argo CD 的设计可以拆成 **三个概念**：

1. **声明式（Git 是 source of truth）**：集群"应该长什么样"完全由 Git 仓库里的 yaml 定义。如果集群里的状态和 Git 不一致，要么 Argo CD sync 修复，要么标 drift 给你看。

2. **Pull 模式（Argo CD 自己定期 fetch）**：和 Jenkins / GitHub Actions 的 push 模式相反——CI push 是"我推给你"，pull 是"我自己拉"。pull 的好处：集群的凭证不用暴露给 CI 系统。

3. **Sync waves（多 resource 按顺序部署）**：装一个应用要先建 namespace、再装 CRD、再起 Pod，顺序不能乱。Argo CD 用 annotation `argocd.argoproj.io/sync-wave: "0"` 标顺序，按 wave 一波波 apply。

## 实践案例

### 案例 1：30 秒装 Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

两条命令出一个完整的 Argo CD：server / repo-server / application-controller / Redis 全装好。

启动后用 port-forward 进 UI：

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
# 浏览器开 https://localhost:8080
# 初始密码：kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### 案例 2：定义一个 Application

Argo CD 里"被管理的东西"叫 Application。一个 yaml：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: guestbook
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**逐字段解读**：

- `source.repoURL + path` → 去哪个仓库的哪个目录找 yaml
- `destination.server + namespace` → 装到哪个集群、哪个 namespace
- `syncPolicy.automated` → 自动 sync（不开就只警告 drift，不动手修）
- `prune: true` → Git 里删了的资源，集群里也删（关掉就只新增不删，容易堆垃圾）
- `selfHeal: true` → 集群被手动改了，Argo CD 主动改回 Git 状态

### 案例 3：Apps of Apps 模式

一个 Git 仓库管 50 个应用，怎么办？写一个 "root Application"，它的内容是另一些 Application yaml：

```
infra-apps/
  ingress-nginx/Application.yaml
  cert-manager/Application.yaml
  prometheus/Application.yaml
root-app.yaml  # source 指向 infra-apps/
```

部署 `root-app` → Argo CD 解析 → 自动建子 Application → 子 Application 各自 sync 自己的 chart。一个仓库管理整套基础设施。

## 踩过的坑

1. **drift 默认只警告不修复**：装好 Argo CD 后第一天写的 Application 没开 `automated.selfHeal`，运维同学手动改了 replicas，Argo CD UI 红了一周没人理。开 selfHeal 才会真自动修。

2. **Helm subchart 路径解析**：`source.path` 指向一个 chart 目录，但 chart 里 `dependencies` 引了 subchart——Argo CD 默认不会自动 `helm dep update`。要么 commit 进 `charts/` 目录，要么在 `spec.source.helm.valueFiles` 配额外参数。

3. **多 cluster 管理凭证**：默认只管自己跑的那个集群。要管别的集群，得手动加 cluster secret（kubeconfig 转成 secret）。多集群也可以用 ApplicationSet 批量生成 Application，避免手写 N 份。

4. **Resource 删除策略 PrunePolicy**：CRD 删了不会自动清，需要 `argocd.argoproj.io/sync-options: Prune=true`。删错过一次 namespace（带着所有 PV），从 etcd 备份恢复花了 3 小时。

## 适用 vs 不适用场景

**适用**：

- K8s 集群有 10+ 应用，需要统一部署管理
- 多环境（dev/staging/prod），需要环境隔离 + 一份代码出多份配置
- 团队有"代码评审"文化——所有部署变更走 Git PR，留 audit log
- 需要可视化部署状态 / drift 检测

**不适用**：

- 没用 K8s（Argo CD 只管 K8s 资源，不管 VM / 物理机）
- 单应用 + 单环境（直接 `kubectl apply` 就够，引 Argo CD 反而重）
- 部署频率极低（一年 2 次），GitOps 工具的运维成本回不来
- 团队不熟 K8s（Argo CD 排错要先懂 Pod / Service / RBAC，否则 UI 红了不知道哪里红）

## 历史小故事（可跳过）

- **2017 年**：Intuit 内部团队在 K8s 上跑微服务，部署痛苦——CI 推 yaml、手动 `kubectl apply`、状态没人盯。
- **2018 年**：Argo Workflows 先开源（K8s 工作流引擎），同期 Argo CD 开发。
- **2019 年**：Argo CD 1.0 发布，"以 Git 为唯一真相"的口号开始流行。
- **2020 年**：加入 CNCF Incubator。同年 Weaveworks 提出 GitOps 概念正式化（其实他们的 Flux 比 Argo CD 早，但 Argo CD UI 更受欢迎）。
- **2022 年**：CNCF Graduated（毕业项目），和 Kubernetes / Prometheus / Envoy 同级。
- **2024 年**：v2.13 把 ApplicationSet GA（可批量生成 Application），多集群管理大幅简化。

## 学到什么

1. **Pull 比 Push 更安全**——CI 系统不用拿集群凭证，凭证只在集群内
2. **Git 是真相**这句话需要工具支撑——Argo CD 提供"对比 + 修复 + 警报"三件套，否则只是口号
3. **可视化的部署状态**比命令行 `kubectl describe` 强一个量级——尤其新人排错
4. **Apps of Apps** 是把"单应用工具"扩展到"基础设施级"的关键模式

## 延伸阅读

- 官方文档：[argo-cd.readthedocs.io](https://argo-cd.readthedocs.io/)
- GitOps 概念：[opengitops.dev](https://opengitops.dev/)（CNCF GitOps Working Group 的定义）
- 实战：[argocd-example-apps](https://github.com/argoproj/argocd-example-apps)（官方示例仓库，可直接 fork 玩）
- 对比 Flux：[Argo CD vs Flux](https://www.cncf.io/blog/2022/09/27/argo-vs-flux-for-gitops/)

## 关联

- [[kubernetes]] —— Argo CD 管的资源都是 K8s 对象
- [[helm]] —— Argo CD 原生支持 Helm chart 作为 source
- [[github-actions]] —— CI 推代码到 Git，Argo CD 拉到集群——两者配合是 GitOps 标准管线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[actions-runner-controller]] —— Actions Runner Controller — 让 GitHub Actions 在你自己的 K8s 上跑
- [[argo-workflows]] —— Argo Workflows — Kubernetes 原生工作流引擎
- [[backstage]] —— Backstage — 把公司散在各处的开发工具拼成一个门户
- [[cert-manager]] —— cert-manager — K8s 自动签发与续期 TLS 证书
- [[chaos-mesh]] —— Chaos Mesh — K8s 原生混沌工程平台
- [[encore]] —— Encore — 类型安全 Go/TS 后端框架，基础设施即代码
- [[flux]] —— Flux — 让 Git 当 Kubernetes 集群的真理来源
- [[github-actions]] —— GitHub Actions — 仓库自带的 CI/CD 流水线
- [[helm]] —— Helm — Kubernetes 包管理器
- [[k9s]] —— k9s — 让 kubectl 长出眼睛和键盘的终端 UI
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[kustomize]] —— Kustomize — 不动原 YAML 的 K8s 配置叠加器
- [[litmus]] —— LitmusChaos — 给 K8s 集群安排"故意搞坏"的演习
- [[longhorn]] —— Longhorn — K8s 原生的轻量分布式块存储
- [[nvidia-gpu-operator]] —— NVIDIA GPU Operator — K8s 上自动装 GPU 软件栈
- [[sealed-secrets]] —— Sealed Secrets — 把加密后的 Secret 安全提交到 Git
- [[skaffold]] —— Skaffold — K8s 本地开发的 build-deploy 自动循环
- [[temporal]] —— Temporal — 持久化工作流引擎
- [[velero]] —— Velero — Kubernetes 集群备份与迁移
- [[woodpecker]] —— Woodpecker CI — Drone 闭源后社区接棒的轻量自托管 CI

