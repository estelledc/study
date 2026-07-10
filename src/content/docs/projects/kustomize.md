---
title: Kustomize — 不动原 YAML 的 K8s 配置叠加器
来源: https://github.com/kubernetes-sigs/kustomize
日期: 2026-05-31
分类: DevOps / 容器
难度: 中级
---

## 是什么

Kustomize 是 Kubernetes 的**配置叠加工具**——你写一份基础 YAML，再为每个环境（dev / staging / prod）写一份"差异说明"，运行时把两者合并出最终 YAML。**整个过程不修改源文件**，也**不引入模板语法**。

日常类比：

- 像点咖啡——基础是"大杯拿铁"（base），改"少糖加燕麦奶"是 patch（overlay），最终交给店员的还是一杯具体咖啡
- 像穿衣服——里层是 T 恤（base），冷了套外套、雨天加雨衣（overlay），不会因为加件衣服就重织 T 恤

它从 Kubernetes 1.14（2019 年）起内置进 `kubectl`，用法是 `kubectl apply -k <目录>`，不需要另装。

## 为什么重要

K8s 部署最常见的痛是**多环境差异管理**：

- dev 跑 1 个副本、staging 跑 3 个、prod 跑 10 个
- 镜像 tag 每个环境不一样
- prod 要加资源 limit、加 `livenessProbe`、加 `nodeSelector`
- 环境变量 / Secret 引用各不相同

三种主流解法：

1. **复制三份完整 YAML**——简单但难维护，改一处要同步三份
2. **[[helm]] 模板**——用 Go template 把 YAML 写成 `replicas: {{ .Values.replicaCount }}`，灵活但 YAML 不再是合法 YAML
3. **Kustomize**——base 永远是合法 YAML，差异写在外面的 patch 里

不理解 Kustomize 绕不开下面这些场景：

- 看公司 [[argocd]] 仓库时一半项目用 Kustomize 一半用 Helm，得知道差别
- fork 一个开源 K8s 项目，想本地改 namespace / 加 label，不想动上游文件
- `kubectl apply -k` 这条命令在所有现代 K8s 教程里都会出现

## 核心要点

抓住三个概念就够：

**Base**——一个目录，放完整可部署的原始 YAML：

```
base/
  kustomization.yaml   # 列出本目录里参与构建的资源
  deployment.yaml
  service.yaml
```

`kustomization.yaml` 长这样：

```yaml
resources:
  - deployment.yaml
  - service.yaml
```

**Overlay**——另一个目录，**引用 base** + **声明差异**：

```
overlays/prod/
  kustomization.yaml
  replica-patch.yaml
```

`overlays/prod/kustomization.yaml`（新版推荐 `patches:`；旧字段 `patchesStrategicMerge` 仍常见）：

```yaml
resources:
  - ../../base
patches:
  - path: replica-patch.yaml
namespace: prod
commonLabels:
  env: prod
```

**Patch**——只写差异的那部分 YAML：

```yaml
# replica-patch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 10
```

跑 `kubectl apply -k overlays/prod`，Kustomize 合并 base 与 patch：`replicas` 改成 10，namespace 设成 prod，并打上 `env=prod` label。**base 文件一个字没动**。

## 实践案例

### 案例 1：dev / prod 跑同一份 base

```
myapp/
  base/
    kustomization.yaml
    deployment.yaml      # replicas: 1
  overlays/
    dev/
      kustomization.yaml # 只引用 base
    prod/
      kustomization.yaml
      patch.yaml         # replicas: 10
```

`kubectl apply -k myapp/overlays/dev` → 1 副本；`kubectl apply -k myapp/overlays/prod` → 10 副本。两边共享同一份 deployment.yaml，**没有任何复制**。

### 案例 2：批量改 namespace + 加 label

```yaml
namespace: my-team
commonLabels:
  team: platform
resources:
  - deployment.yaml
  - service.yaml
```

不用 sed，三行声明完成"把所有资源搬到 my-team namespace 并打上 label"。

### 案例 3：fork 上游项目只维护差异

```yaml
resources:
  - https://raw.githubusercontent.com/some/operator/v1.2.3/install.yaml
namespace: my-cluster
images:
  - name: registry.example.com/operator
    newName: my-registry.local/operator
```

升级时只改 URL 里的版本号，**本地零文件维护**。

## 踩过的坑

1. **patch 语法两套混淆**：strategic merge（`patches:` / 旧名 `patchesStrategicMerge`）按 K8s 字段语义合并；JSON 6902 按路径增删改。改 list 想覆盖某一项时，strategic 常按 key 合并而不是整段替换，结果 list 里多一项。

2. **kubectl 内置版本落后**：`kubectl` 里的 kustomize 通常落后 standalone 几个版本，新功能（如 components / openapi）可能没有。生产建议装独立 `kustomize` CLI，CI 里用它生成 YAML 再 apply。

3. **不要在 base 里写"环境无关"是个谎**：base 看似纯净，但 `image: nginx:latest` 这种隐含决策也是一种环境绑定。真实项目里 base 经常被迫保留某个环境的默认值。

4. **没有 if / else / loop**：想根据 environment 做条件渲染做不到，得拆成多个 overlay 或上 Helm。复杂业务逻辑场景 Kustomize 不够用。

## 适用 vs 不适用场景

**适用**：

- 一份基础部署 + 多环境差异（dev / staging / prod）
- 给一批资源批量改 namespace / 加 label / 改镜像
- fork 上游项目只维护本地补丁
- GitOps 仓库（[[argocd]] 原生支持 `-k`，无需额外配置）

**不适用**：

- 需要条件渲染 / 循环 / 字符串拼接 → 用 [[helm]]
- 需要打包发布给第三方安装 → Helm 有 Chart 仓库生态（[[helm]] 配 Artifact Hub）
- 完全动态的运行时配置（基于集群状态调整）→ 写 Operator
- 跨集群复制 + 漂移检测 → 上 [[argocd]] 这类 GitOps 工具

## 历史小故事（可跳过）

- **2017 年**：Google 内部团队提出 Kustomize 概念，作为 K8s SIG-CLI 项目开源
- **2019 年**：Kubernetes 1.14 起 kustomize v2.0.3 内置进 `kubectl`，命令 `kubectl apply -k` 成为官方一等公民
- **后续**：standalone CLI 和 kubectl 内置版本平行演进；Argo CD / Flux CD 等 GitOps 工具原生支持 Kustomize 目录

## 学到什么

1. **配置管理可以"叠加"而非"替换"**——保留源文件不动，差异写在外面，可读性 / 可审计性远高于模板替换
2. **声明式 > 命令式**——`namespace: prod` 一行声明，胜过 `sed -i 's/namespace: .*/namespace: prod/' *.yaml`
3. **K8s-aware 工具的优势**——按 Deployment / Service 字段语义合并，不像通用文本工具会破坏 YAML 结构
4. **够用就好的设计取舍**——故意不加 if/else 是为了避免变成"另一个 Helm"，复杂场景留给真正的模板工具

## 延伸阅读

- 官方教程：[Kustomize - Tutorials](https://kustomize.io/)（有交互式 demo）
- 入门视频：[Kubernetes Kustomize Tutorial](https://www.youtube.com/watch?v=ASK6p2r-Yrk)
- vs Helm 对比：[Kustomize vs Helm](https://www.cloudbees.com/blog/kustomize-vs-helm-comparison-which-is-best-for-you)
- [[helm]] —— K8s 应用包管理事实标准（模板派）
- [[kubernetes]] —— Kustomize 服务的对象
- [[argocd]] —— GitOps 工具，原生支持 Kustomize

## 关联

- [[kubernetes]] —— Kustomize 处理的是 K8s YAML
- [[helm]] —— 解决同一问题的另一条路（模板派 vs 叠加派）
- [[argocd]] —— GitOps 部署工具，把 Kustomize 输出推到集群
- [[terraform]] —— IaC 同类思想，但管理对象是云资源而非 K8s 对象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

