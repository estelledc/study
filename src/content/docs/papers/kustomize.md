---
title: Kustomize — 不写模板也能给 K8s 配置分环境
来源: Brian Grant et al., kustomize SIG-CLI 项目，并入 kubectl 1.14（2019）
日期: 2026-05-31
子分类: 基础设施
分类: 基础设施
难度: 入门
---

## 是什么

Kustomize 是一个**给 Kubernetes YAML 做"分层覆盖"的工具**。日常类比：像在 Photoshop 里给一张底图叠图层——底图（base）不动，每个图层（overlay）只画自己要改的那一部分，最后合成出一张完整图。

你有一份 K8s 部署清单，dev / staging / prod 三套环境基本一样，只有副本数、镜像 tag、命名空间不同。传统做法：

- 复制三份 YAML，手改三处——容易漂移
- 用 Helm 写模板（`{{ .Values.replicas }}`）——多了一种语法

Kustomize 走第三条路：**不引入新语法**。base 是合法的 K8s YAML，overlay 也是合法的 K8s YAML，工具负责"按结构合并"。

```bash
kubectl apply -k overlays/prod
# 或
kustomize build overlays/prod | kubectl apply -f -
```

它已经**内置在 `kubectl` 里**（1.14 起，2019 年），写 K8s 的人几乎绕不开。

## 为什么重要

不理解 Kustomize，下面这些问题会反复来咬你：

- 为什么很多团队不用 Helm 而用 Kustomize 管自家服务——Helm 模板把 YAML 变成字符串拼接，Kustomize 让 YAML 始终是 YAML
- 为什么改了 ConfigMap 内容，Pod 自动重启了——Kustomize 给 ConfigMap 名字加了 hash 后缀
- 为什么生产事故里"环境差异漂移"是高频根因——分环境管理本身就难，Kustomize 是少数能压住漂移的方案
- 为什么 GitOps（Argo CD / Flux）默认支持 Kustomize——它是声明式、纯函数式的"YAML → YAML"

## 核心要点

Kustomize 的心智模型可以拆成 **三件事**：

1. **base + overlay**：base 是公共底图（一份完整可部署的 YAML 集合）；overlay 引用 base 并叠加修改。每层都有一个 `kustomization.yaml` 描述"我要什么、改什么"。

2. **三种修改手段**：
   - **transformer**（变换器）：给所有资源加 namespace、加 label、加 namePrefix——结构化批量改
   - **patch**（补丁）：精准改某个资源的某个字段——支持策略合并（Strategic Merge）和 JSON 6902 两种语法
   - **generator**（生成器）：从文件或字面量生成 ConfigMap / Secret，自动加 hash 后缀

3. **hash 后缀触发滚动更新**：`configMapGenerator` 生成的 ConfigMap 名字带内容 hash（`my-config-h7m4k8`），内容一变 hash 就变，引用它的 Deployment 自动滚动。Helm 没这个机制，得自己写 annotation 触发。

## 实践案例

### 案例 1：最小可用骨架

```
myapp/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   └── service.yaml
└── overlays/
    ├── dev/
    │   └── kustomization.yaml
    └── prod/
        └── kustomization.yaml
```

`base/kustomization.yaml`：

```yaml
resources:
  - deployment.yaml
  - service.yaml
```

`overlays/prod/kustomization.yaml`：

```yaml
resources:
  - ../../base
namespace: prod
namePrefix: prod-
replicas:
  - name: myapp
    count: 5
images:
  - name: myapp
    newTag: v1.2.3
```

跑 `kustomize build overlays/prod`，输出：所有资源带 `prod-` 前缀、命名空间 `prod`、副本数 5、镜像 tag `v1.2.3`。**base 一行没动**。

### 案例 2：用 patch 改单个字段

prod 想给 Deployment 加资源限制，但 dev 不要：

`overlays/prod/cpu-patch.yaml`：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
        - name: app
          resources:
            limits:
              cpu: "2"
              memory: 2Gi
```

`overlays/prod/kustomization.yaml` 加一行：

```yaml
patches:
  - path: cpu-patch.yaml
```

策略合并按"name 匹配"找到容器、覆盖 `resources` 字段。**没列出来的字段保留 base 原值**——这是和"整个 YAML 替换"的关键区别。

### 案例 3：configMapGenerator + 自动滚动

```yaml
configMapGenerator:
  - name: app-config
    literals:
      - LOG_LEVEL=info
      - FEATURE_X=true
```

输出的 ConfigMap 名字会变成 `app-config-h7m4k8`。Kustomize 同时改写 Deployment 里所有 `name: app-config` 的引用。下次 `LOG_LEVEL=debug` 一改，hash 变成 `c2x9p1`，Deployment 的 ConfigMap 引用变了 → K8s 自动滚动 Pod。

## 踩过的坑

1. **`bases` 字段已废弃**：老教程写 `bases: [../../base]`，新版本应该写 `resources: [../../base]`。`resources` 既能放 YAML 文件也能放目录引用。

2. **`vars` 已废弃，用 `replacements`**：旧的变量替换 `vars` 限制多（不能跨字段类型），新方案 `replacements` 显式指定"从哪个资源的哪个字段，替换到哪些目标的哪些字段"。

3. **CRD 上的策略合并需要 openAPI schema**：原生 K8s 资源有内置 schema，自定义资源（CRD）默认按"整段替换"合并——除非给 `kustomize` 提供 openapi 文件。常见症状：你想改 CRD 里数组的一项，结果整个数组被换掉。

4. **`kubectl` 内置的 kustomize 版本经常落后**：`kubectl apply -k` 用的是编译进 kubectl 的版本，常比独立 `kustomize` 旧 1-2 年。新功能（components / replacements）建议装独立二进制。

5. **patch 顺序敏感**：多个 patch 改同一字段，后面的覆盖前面的。复杂场景下 debug 一定要 `kustomize build` 看最终输出，不要凭脑补。

6. **不要把 secret 明文写进 `secretGenerator.literals`**：会进 git。生产用 sealed-secrets / external-secrets / SOPS 这类方案。

## 适用 vs 不适用场景

**适用**：

- 自家服务多环境部署（dev / staging / prod）—— Kustomize 的甜点
- GitOps 流水线（Argo CD / Flux 默认支持）
- 小幅修改第三方 YAML —— 比 fork 仓库改源文件干净
- 不想引入模板语法的团队

**不适用**：

- 要打包给陌生用户安装的应用 —— 用 Helm，它有版本化、依赖、rollback、社区 chart
- 改动需要逻辑判断（if / for / 复杂计算）—— Kustomize 是纯结构变换，没条件分支
- 跨集群分发 + 复杂参数化 —— Helm + Kustomize 混用（Helm 出 base，Kustomize 做环境覆盖）是常见组合

## 历史小故事（可跳过）

- **2017 年**：Brian Grant（K8s API 负责人）等人发表 "Declarative application management in Kubernetes" 白皮书，提出 K8s 配置不该靠模板字符串
- **2018 年**：Kustomize 作为 SIG-CLI 子项目开源
- **2019 年 3 月**：并入 `kubectl 1.14`，从此 `kubectl apply -k` 即开即用
- **2020 年后**：Argo CD / Flux 把 Kustomize 作为一等公民，GitOps 浪潮推动它成为事实标准

它的核心理念——"配置变换是函数式的、YAML in YAML out"——是对 Helm 模板派的一次系统性回应。

## 学到什么

1. **结构化合并 > 字符串拼接**：在结构化数据上做变换，远比在文本上拼模板可控
2. **base + overlay 是处理"近似副本"的通用模式**：不止 K8s，Nix overlay、CSS cascade、git rebase 都是同一思路
3. **hash 后缀是优雅的不变量保持**：内容变 → 引用变 → 自然触发下游响应，不需要副作用通知
4. **不引入新语法是有成本的**：换来的是工具链通用性（任何 YAML 工具都能读 base），代价是表达力受限

## 延伸阅读

- 官方教程：[kustomize.io](https://kustomize.io/) —— 30 分钟跑通 base + overlay
- 设计白皮书：[Declarative application management in Kubernetes](https://goo.gl/T66ZcD) —— 理解为什么不用模板
- 仓库 example 集：[kubernetes-sigs/kustomize/examples](https://github.com/kubernetes-sigs/kustomize/tree/master/examples) —— 真实 patch 写法
- [[helm]] —— 模板派代表，和 Kustomize 常被对比
- [[argocd]] —— GitOps 引擎，Kustomize 的主战场之一

## 关联

- [[kubernetes]] —— Kustomize 的宿主生态
- [[helm]] —— 模板派的另一种思路，常和 Kustomize 配合（Helm 出 base，Kustomize 做覆盖）
- [[nix]] —— overlay 模式的另一处经典应用
- [[gitops]] —— Kustomize 是 GitOps 主流配置工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[helm]] —— Helm — Kubernetes 包管理器
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[nix]] —— Nix — 把每个软件包当成纯函数的输出

