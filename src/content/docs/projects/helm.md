---
title: Helm — Kubernetes 包管理器
来源: https://github.com/helm/helm
日期: 2026-05-29
分类: DevOps / 容器
难度: 中级
---

## 是什么

Helm 是 [[kubernetes]] 应用的**安装包格式 + 包管理器**——把一组 K8s 资源（Deployment、Service、ConfigMap 等十来份 yaml）打成一个 Chart，一行 `helm install` 装进集群。

日常类比：

- K8s 像 Linux 内核——裸机功能强大，但你不会自己写驱动
- Helm 像 apt / yum / brew——不用一份份手写 yaml，找个包装上就能跑

写 K8s yaml 的痛：装个 Postgres 要写 Deployment + Service + ConfigMap + PVC + Secret，5 个文件 200 行。Helm 把这 5 个文件打成一个 Chart 包，社区维护，你 `helm install my-pg bitnami/postgresql` 一行就装完。

## 为什么重要

Helm 在 K8s 生态里**几乎是事实标准**，不理解它绕不开下面这些场景：

- **部署复杂应用一行搞定**——Postgres / Prometheus / Argo / Grafana / Redis 都有官方 Chart，运维不用写 yaml
- **模板化让 yaml 可参数化**——同一份 Chart，dev / staging / prod 用不同 `values.yaml` 注入参数
- **Artifact Hub 5000+ Chart**——开源社区共享，相当于 K8s 应用的 npm registry
- **K8s 应用包管理事实标准**——另一条路是 Operator（更复杂、更强大），但 Helm 是默认起点

## 核心要点

理解 Helm 抓住三个概念就够：

**Chart**——一个目录，结构固定：

```
mychart/
  Chart.yaml         # 包元信息（name / version / description）
  values.yaml        # 默认参数
  templates/         # K8s 资源模板（yaml 加 Go template 语法）
    deployment.yaml
    service.yaml
    _helpers.tpl     # 可复用的命名片段
```

**Templating（Go template）**——把 yaml 变成模板，`values.yaml` 的值注入进去：

```yaml
# templates/deployment.yaml
spec:
  replicas: {{ .Values.replicaCount }}
  image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
```

`values.yaml` 写 `replicaCount: 3`，渲染后就是 `replicas: 3`。

**Release**——每次 `helm install` 在集群里创建一个 release（带名字、版本号），可 `helm rollback` 回滚到上一个版本。同一个 Chart 可以装多个 release（不同 namespace 或不同名字）。

## 实践案例

### 案例：装一个 nginx，从 0 到能访问

```bash
# 加 Bitnami 仓库（K8s Chart 里最知名的源之一）
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# 装一个 release，名字叫 my-nginx
helm install my-nginx bitnami/nginx

# 看装了什么
helm list
kubectl get pods,svc
```

不到 5 行命令，集群里就跑起来一份 nginx，包含 Deployment + Service（Bitnami chart 默认 `replicaCount: 1`，可用 values 改成多副本）。

### 案例：用 values.yaml 自定义参数

线上想跑 10 个副本、绑特定域名，写一份 `values-prod.yaml`：

```yaml
replicaCount: 10
ingress:
  enabled: true
  hostname: nginx.example.com
```

```bash
helm install my-nginx bitnami/nginx -f values-prod.yaml
```

同一个 Chart 在 dev / staging / prod 用三份不同的 values 文件，**代码不变、环境差异全部进配置**。

### 案例：升级 + 回滚

```bash
# 改了 values.yaml，升级
helm upgrade my-nginx bitnami/nginx -f values-prod.yaml

# 看升级历史
helm history my-nginx

# 升级出问题，回到上一个 revision
helm rollback my-nginx 1
```

`helm rollback` 是 Helm 最让人放心的能力——比 `kubectl apply` 改坏了再手动回滚强太多。

## 踩过的坑

- **values.yaml 与 templates 不同步**——values 加了字段，templates 没引用；或 templates 用了字段，values 没声明默认值。`helm template` 渲染时不报错，装进集群后参数没生效，排查半小时
- **Helm 2 → 3 移除 Tiller 但 chart 不兼容**——Helm 2 时代有个集群里跑的 Tiller 组件（安全噩梦），Helm 3 砍掉了。但老 Chart 用了 Tiller-only 的 API（如 `crd-install` hook），迁移要改
- **Hooks 执行顺序混乱**——Helm 支持 `pre-install` / `post-install` / `pre-upgrade` 等 hook，多个 hook 同时存在时执行顺序不直观，容易导致依赖资源没就绪就跑了 hook
- **Subchart 配置嵌套**——一个 Chart 可以依赖另一个 Chart（subchart），parent 给 child 传 values 要写嵌套结构 `child-name: { key: value }`，写错了 child 看不到值，沉默失败

## 适用 vs 不适用场景

**适用**：

- 部署社区已有的标准应用（Postgres / Redis / Prometheus / Argo / Cert-Manager）
- 同一应用要在多环境部署（dev / staging / prod 用不同 values）
- 团队需要"打包 + 版本化 + 回滚"的发布流程

**不适用**：

- 需要复杂的运维逻辑（自动备份、故障恢复、扩缩容决策）→ 用 Operator（CRD + Controller）
- 单文件 K8s yaml 已经够用 → 不必引入 Helm 复杂度
- 需要严格的 GitOps 工作流 → ArgoCD / Flux 直接管 yaml 更直观（也支持 Helm 但是另一层）

## 历史小故事（可跳过）

- **2015**：Deis 公司启动 Helm 项目，目标是给 K8s 做包管理器（早期亦称 Helm Classic）
- **2016**：Helm 2 发布，引入 **Tiller**（集群内的 server 端组件，负责渲染与安装）
- **2018**：加入 [[cncf]] 孵化
- **2019**：Helm 3.0 发布，移除 Tiller（解决长期诟病的安全问题），改为客户端直连 K8s API
- **2020**：从 CNCF 毕业，成为生态稳定标准
- **2024**：Helm 3.x 对 OCI registry 的支持继续完善（用 Docker registry 协议存 Chart，统一镜像与 Chart 的分发渠道）

## 学到什么

- **包管理器是抽象层**——apt 之于 Debian，Helm 之于 K8s，把"装一堆零散组件"抽象成"装一个包"
- **模板化 = 代码与配置分离**——同一套 Chart 适配多环境，差异全部进 values，可读性和复用性双赢
- **Release 概念让回滚便宜**——比起手动 `kubectl apply` 后再手动还原，Helm 的 release 历史让回滚是一行命令
- **生态网络效应**——Artifact Hub 5000+ Chart 让你装绝大多数开源应用都不必自己写 yaml，这是 Helm 真正的护城河

## 延伸阅读

- 官方文档：[Helm Docs](https://helm.sh/docs/)（中文社区也有翻译版）
- Chart 仓库：[Artifact Hub](https://artifacthub.io/)（K8s 应用的 npm registry）
- 实战教程：[Bitnami Helm Charts](https://github.com/bitnami/charts)（看人家怎么写生产级 Chart）

## 关联

- [[kubernetes]] —— Helm 部署的目标平台
- [[cncf]] —— Helm 是 CNCF 毕业项目之一
- [[argo-cd]] —— GitOps 工具，可以管 Helm release，是另一层抽象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/kustomize]] —— Kustomize — 不写模板也能给 K8s 配置分环境
- [[age]] —— age — 把"用 GPG 加密一个文件"重新做对
- [[argo-workflows]] —— Argo Workflows — Kubernetes 原生工作流引擎
- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[backstage]] —— Backstage — 把公司散在各处的开发工具拼成一个门户
- [[drone]] —— Drone CI — 容器原生的 YAML 流水线
- [[flux]] —— Flux — 让 Git 当 Kubernetes 集群的真理来源
- [[jenkins]] —— Jenkins — 老牌开源 CI 服务器
- [[projects/k3s]] —— k3s — 把完整 K8s 塞进一个不到 70 MB 的二进制
- [[k9s]] —— k9s — 让 kubectl 长出眼睛和键盘的终端 UI
- [[kind]] —— kind — 用 Docker 容器当 K8s 节点的本地集群
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[projects/kustomize]] —— Kustomize — 不动原 YAML 的 K8s 配置叠加器
- [[lens]] —— Lens — Kubernetes 集群的桌面 IDE
- [[linkerd2]] —— Linkerd 2 — 用 Rust 写的轻量服务网格
- [[minikube]] —— minikube — 一条命令在笔记本上起一个真 K8s 集群
- [[nvidia-gpu-operator]] —— NVIDIA GPU Operator — K8s 上自动装 GPU 软件栈
- [[skaffold]] —— Skaffold — K8s 本地开发的 build-deploy 自动循环
- [[sops]] —— SOPS — 让密码也能放心进 Git
- [[stern]] —— stern — 多 pod 多 container 日志聚合 tail
- [[tilt]] —— Tilt — K8s 微服务本地开发的"文件保存即上线"
- [[velero]] —— Velero — Kubernetes 集群备份与迁移
- [[woodpecker]] —— Woodpecker CI — Drone 闭源后社区接棒的轻量自托管 CI
- [[yq]] —— yq — YAML 的 jq（也吃 XML/TOML/properties）
