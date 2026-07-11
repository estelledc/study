---
title: Kustomize — 不写模板也能给 K8s 配置分环境
来源: Brian Grant et al., kustomize SIG-CLI 项目，并入 kubectl 1.14（2019）
日期: 2026-05-31
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

- 为什么很多团队不用 Helm 而用 Kustomize——Helm 把 YAML 变成字符串拼接，Kustomize 让 YAML 始终是 YAML
- 为什么改了 ConfigMap，Pod 会自动重启——Kustomize 给 ConfigMap 名字加了内容 hash 后缀
- 为什么生产事故里"环境差异漂移"是高频根因——分环境管理难，Kustomize 是少数能压住漂移的方案
- 为什么 GitOps（Argo CD / Flux）默认支持它——声明式、纯函数式的"YAML → YAML"

## 核心要点

Kustomize 的心智模型可以拆成 **三件事**：

1. **base + overlay**：base 是公共底图（完整可部署的 YAML）；overlay 引用 base 并叠加修改。每层一个 `kustomization.yaml` 描述"要什么、改什么"。

2. **三种修改手段**：
   - **transformer**：给所有资源加 namespace / label / namePrefix——结构化批量改
   - **patch**：精准改某个资源的某个字段——支持 Strategic Merge 与 JSON 6902
   - **generator**：从文件或字面量生成 ConfigMap / Secret，自动加 hash 后缀

3. **hash 后缀触发滚动更新**：`configMapGenerator` 生成的名字带内容 hash（`my-config-h7m4k8`），内容一变 hash 就变，引用它的 Deployment 自动滚动。Helm 默认没有，得自己写 annotation。

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

跑 `kustomize build overlays/prod`，输出：资源带 `prod-` 前缀、命名空间 `prod`、副本 5、镜像 `v1.2.3`。**base 一行没动**。

### 案例 2：用 patch 改单个字段

prod 要给 Deployment 加资源限制，dev 不要。`overlays/prod/cpu-patch.yaml`：

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
            limits: { cpu: "2", memory: 2Gi }
```

在 `overlays/prod/kustomization.yaml` 加 `patches: [{ path: cpu-patch.yaml }]`。策略合并按 name 匹配容器、覆盖 `resources`；**没列出的字段保留 base**——这是和"整段 YAML 替换"的关键区别。

### 案例 3：configMapGenerator + 自动滚动

```yaml
configMapGenerator:
  - name: app-config
    literals: [LOG_LEVEL=info, FEATURE_X=true]
```

三步：① 生成带 hash 的 ConfigMap（`app-config-h7m4k8`）；② 改写 Deployment 里所有 `name: app-config` 引用；③ 下次改 `LOG_LEVEL=debug`，hash 变 → 引用变 → K8s 滚动 Pod。

## 踩过的坑

1. **`bases` 已废弃**：老教程写 `bases: [../../base]`，应改 `resources: [../../base]`（文件和目录都能放）。
2. **`vars` 已废弃**：改用 `replacements`，显式指定"从哪字段替换到哪些目标"。
3. **CRD 策略合并要 openAPI**：无 schema 时默认整段替换，改数组一项可能整段被换掉。
4. **`kubectl apply -k` 版本常落后**：新功能（components / replacements）建议装独立 `kustomize`。
5. **patch 顺序敏感**：同字段后写覆盖先写；复杂场景务必 `kustomize build` 看终态。
6. **别把 secret 明文写进 `secretGenerator.literals`**：会进 git；生产用 sealed-secrets / SOPS。

## 适用 vs 不适用场景

**适用**：自家服务多环境（dev/staging/prod，差异字段少）；GitOps（Argo CD / Flux）；小幅改第三方 YAML；不想引入模板语法的团队。

**不适用**：给陌生用户打包安装（用 Helm：版本化/依赖/rollback）；需要 if/for 逻辑判断；跨集群复杂参数化——常见组合是 Helm 出 base，Kustomize 做环境覆盖。

## 历史小故事（可跳过）

- **2017**：Brian Grant 等发表 Declarative application management 白皮书，主张配置不该靠模板字符串
- **2018**：Kustomize 作为 SIG-CLI 子项目开源
- **2019.3**：并入 `kubectl 1.14`，`kubectl apply -k` 即开即用
- **2020 后**：Argo CD / Flux 一等公民支持，GitOps 浪潮把它推成事实标准

核心理念是"YAML in → YAML out"的函数式变换——对 Helm 模板派的系统性回应。

## 学到什么

1. **结构化合并 > 字符串拼接**：在结构化数据上变换，比文本拼模板可控
2. **base + overlay 是通用模式**：Nix overlay、CSS cascade、git rebase 同一思路
3. **hash 后缀保持不变量**：内容变 → 引用变 → 自然触发下游，无需副作用通知
4. **不引入新语法有代价**：工具链通用，但表达力受限

## 延伸阅读

- 官方教程：[kustomize.io](https://kustomize.io/)
- 设计白皮书：Declarative application management in Kubernetes（Brian Grant et al., 2017）
- 示例集：[kubernetes-sigs/kustomize/examples](https://github.com/kubernetes-sigs/kustomize/tree/master/examples)
- [[helm]] —— 模板派代表
- [[argocd]] —— GitOps 引擎，Kustomize 主战场之一

## 关联

- [[kubernetes]] —— Kustomize 的宿主生态
- [[helm]] —— 常配合：Helm 出 base，Kustomize 做覆盖
- [[nix]] —— overlay 模式的另一处经典应用
- [[gitops]] —— Kustomize 是 GitOps 主流配置工具
- [[argocd]] —— 默认把 Kustomize 当一等公民

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
