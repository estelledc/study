---
title: Argo CD 零基础学习笔记
来源: https://github.com/argoproj/argo-cd
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

## 一句话介绍

Argo CD 是一个**让 Git 仓库自动驱动 Kubernetes 部署**的开源工具。你把配置文件推到 Git，集群里的 Argo CD 自动拉取、对比、同步，保持实际运行状态和 Git 里定义的一致。

## 从日常类比开始

想象你要给一家连锁餐厅（Kubernetes 集群）下订单（部署应用）。

**传统做法（手动或 CI push）**：你打电话给每家门店的经理，说"帮我换成 V2 版本的菜单"。打完结账完——菜单真的换了吗？有没有哪个经理忘改了？没人知道，除非你一家家跑过去看。

**Argo CD 的做法（GitOps pull）**：你在总部的共享笔记本（Git 仓库）上写"所有门店用 V2 菜单"。每家门店配了一个专职员工（Argo CD 的 controller），每隔几分钟就看看笔记本——发现改了，马上照着改自己的菜单。如果有人偷偷改了（比如店长手动换了 V1），这位员工会标红提醒"你改的和笔记本不一样哦"。

关键区别：**Argo CD 是主动去"拉"（pull）最新状态，不是等人"推"（push）给它。**

## 为什么需要 Argo CD

在 Kubernetes 里管应用，规模小的时候 `kubectl apply -f app.yaml` 就够了。但到了以下场景，手动操作就扛不住了：

- 一个团队管 50+ 个微服务，分布在 dev、staging、prod 三个集群
- 运维同学手动改了一个 replicas 数，没人知道
- 部署完了，到底是成功了还是失败了？得翻日志看
- 想回滚？得记住上一个版本的 yaml 存在哪

Argo CD 解决了这四件事：**自动同步、漂移检测、可视化状态、一键回滚**。

## 核心概念

Argo CD 的设计围绕以下几个核心概念展开：

### 1. Application（应用程序）

Application 是 Argo CD 里最基本的管理单位。它描述了一组 Kubernetes 资源在哪里部署、从哪来、怎么同步。

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

逐字段理解：

- `source.repoURL` + `path` → 去哪找配置文件（一个 Git 仓库里的哪个目录）
- `destination.server` + `namespace` → 装到哪个集群、哪个命名空间
- `syncPolicy.automated.prune: true` → Git 里删掉的资源，集群里也一起删（不关的话只会新增不会删，慢慢堆垃圾）
- `syncPolicy.automated.selfHeal: true` → 有人手动改了集群，Argo CD 自动改回 Git 定义的状态

状态有三种：**OutOfSync**（不一致）、**Synced**（一致）、**Missing**（资源不存在，还没部署过）。

### 2. Sync Policy（同步策略）

Argo CD 有两套同步策略：

- **手动同步（Manual）**：Argo CD 只检测漂移、给你看"哪里不一样"，点一下 Sync 按钮才动手改
- **自动同步（Automated）**：Argo CD 检测到不一致就自动改，加上 `prune` 会自动清理 Git 里不存在的资源

### 3. Project（项目）

Project 是一种"分组 + 权限隔离"的机制。可以把一组 Application 归到一个 Project 里，限制它们只能部署到指定的集群和命名空间。

比如 `production` 项目只能部署到 `prod-cluster`，`staging` 项目只能部署到 `staging-cluster`。即使同一个 Git 仓库里有两类 Application，Argo CD 也会在部署前做检查，不合规的拒绝部署。

### 4. Sync Waves（同步波）

有些资源有依赖顺序。比如先创建 Namespace，再创建 ConfigMap，最后创建 Deployment。用 annotation `argocd.argoproj.io/sync-wave: "0"` 可以标顺序——数字小的先部署，数字大的后部署。

## 怎么安装

假设你已经有 K8s 集群（可以用 Minikube、kind、或者云厂商的 K8s 服务），三条命令装好：

```bash
# 1. 创建 argocd 命名空间并安装
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 2. 获取初始 admin 密码
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

# 3. 通过端口转发访问 UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

打开浏览器访问 https://localhost:8080，用用户名 `admin` 和第 2 步的密码登录。

## 创建一个应用：从 Git 到集群

假设你的 Git 仓库里有一个 `deployment.yaml` 文件，定义了一个 Web 应用的 Deployment 和 Service：

```yaml
# app.yaml — 你仓库里的配置文件
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-web
  template:
    metadata:
      labels:
        app: my-web
    spec:
      containers:
      - name: my-web
        image: nginx:1.27
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: my-web
spec:
  selector:
    app: my-web
  ports:
  - port: 80
  type: LoadBalancer
```

在 Argo CD 里通过 CLI 创建 Application：

```bash
kubectl config set-context --current --namespace=argocd

argocd app create my-web \
  --repo https://github.com/your-user/my-k8s-configs.git \
  --path configs/ \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace production
```

创建后，Argo CD 的状态是 **OutOfSync**——因为它还没把配置同步到集群。执行同步：

```bash
argocd app sync my-web
```

现在 Nginx 就在集群里跑起来了。之后你在 Git 里把镜像版本从 `nginx:1.27` 改成 `nginx:1.28`，提交后 Argo CD 会自动检测漂移并同步更新（如果开了 `selfHeal`）。

## 进阶：Helm Chart 作为数据源

Argo CD 不仅支持原始 yaml，也原生支持 Helm chart。在 Application 里这样写：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-helm-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-user/helm-charts.git
    targetRevision: v1.2.0
    path: charts/my-app
    helm:
      valueFiles:
      - values.yaml
      parameters:
      - name: replicaCount
        value: "3"
      - name: image.tag
        value: "v2.0"
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
```

这里 `source.helm.parameters` 可以覆盖 chart 里的默认值，`valueFiles` 指定额外的 values 文件。

## 关键设计理念

### Git 是唯一的真相来源

所有配置变更先改 Git，再等 Argo CD 同步。不直接在集群里手动改。这样做的好处：

- **可回溯**：每次变更都有 Git commit 记录
- **可审计**：谁改了、什么时候改的、改了什么，一目了然
- **可回滚**：`git revert` 一个 commit 就能回滚到任意历史版本

### Pull 模式的安全性优势

Argo CD 自己定期去拉 Git 仓库的状态。凭证（访问 Git 的 token、连接 K8s 的 kubeconfig）都安全地存在集群内部。CI 系统（如 GitHub Actions）不需要拿集群凭证，只需要往 Git 推代码即可。这和 Jenkins 的 push 模式（CI 拿着 kubeconfig 直接 `kubectl apply`）相比，攻击面小很多。

### 漂移检测（Drift Detection）

有人手动改了集群里的资源（比如调大 replicas、改了镜像 tag），Argo CD 每 3 分钟（默认）对比一次 Git 和集群的实际状态。不一致时 UI 上标红，如果开了 `selfHeal` 会自动改回来。

## 常见陷阱

1. **默认不自修漂移**：创建 Application 时 `syncPolicy` 是空的（手动模式），不会自动修。很多人以为装了 Argo CD 就万事大吉，其实需要显式开启 `automated.selfHeal`。

2. **CRD 删除后的孤儿资源**：删掉了 CRD 定义，Argo CD 不会自动清理已创建的 CR 实例。需要加 annotation `argocd.argoproj.io/sync-options: Prune=true`。

3. **Helm chart 的 subchart**：chart 里 `dependencies` 引用的子 chart，Argo CD 不会自动跑 `helm dep update`。要么提前 commit 到仓库里，要么用 `valueFiles` 指定额外文件。

4. **多集群管理的凭证**：Argo CD 默认只管理自己所在的那个集群。要管理其他集群，需要在 Argo CD 里注册（`argocd cluster add <context-name>`），这会为那个集群创建一个 ServiceAccount。

## 适用和不适用的场景

**适合用**：

- K8s 集群有 10 个以上的应用需要统一管理
- 多环境部署（dev / staging / prod），需要环境隔离
- 团队有 PR 文化——部署变更走代码评审
- 需要可视化部署状态和漂移检测

**不适合用**：

- 没用 K8s（Argo CD 不管 VM、物理机）
- 单应用、单环境、部署频率极低（直接 `kubectl apply` 就够了）
- 团队完全不懂 K8s（Argo CD 排错要先了解 Pod、Service、Namespace 等基本概念）

## 学到的东西

1. **Git 作为真相来源**不是口号，需要工具落地——Argo CD 用"对比 + 自修 + 警报"三件套实现
2. **Pull 模式比 Push 更安全**——凭证不需要暴露给外部系统
3. **可视化比命令行强一个量级**——尤其对新人排错
4. **自动同步要谨慎开启**——`prune` 会删 Git 里没有的资源，容易误删

## 延伸阅读

- 官方文档：[argo-cd.readthedocs.io](https://argo-cd.readthedocs.io/)
- 在线演示：[cd.apps.argoproj.io](https://cd.apps.argoproj.io/)（免登录体验）
- 官方示例仓库：[argocd-example-apps](https://github.com/argoproj/argocd-example-apps)
- GitOps 概念定义：[opengitops.dev](https://opengitops.dev/)（CNCF GitOps Working Group）
