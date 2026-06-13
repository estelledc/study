---
title: "Continuous Integration and Delivery: Modern Practices"
来源: https://arxiv.org/abs/2401.00039
日期: 2026-06-13
分类: 其他
子分类: software-engineering
provenance: pipeline-v3
---

## 是什么

Continuous Integration（持续集成，CI）和 Continuous Delivery / Continuous Deployment（持续交付 / 持续部署，CD）是一套**自动化**的软件开发实践。它们的目标是：让开发者把代码改好后，**快速、安全、自动地**变成用户能用的产品。

日常类比：你在家做饭。

- **传统方式**：你攒了一周的菜、一起洗一起切、最后一次性下锅炒一大锅。如果发现咸了，你不知道是哪一勺盐的问题——可能整锅都倒了。
- **CI/CD 方式**：每切完一种菜就立刻看一眼有没有烂、每炒完一盘菜就尝一口。咸了？立刻知道是哪盘菜的问题，改起来很容易。而且整个过程有人（或机器）在帮你盯着，不会忘。

CI/CD 流水线（Pipeline）就是这个"有人帮你盯着"的自动化流程。它把软件从「写完代码」到「用户拿到」之间的每一步——编译、测试、打包、发布——都用工具自动串起来。

## 为什么重要

1. **避免「合并地狱」**：多个开发者同时改代码时，不及时发现冲突，最后几天一起合并时可能产生几十个冲突文件。
2. **更快反馈**：改完代码几分钟内就知道有没有问题，而不是几天后测试阶段才发现。
3. **降低发布风险**：每次只改一点点、自动验证，出问题容易回退。
4. **解放人类**：不用手动一步步点按钮编译和部署，减少人为失误。

## 核心概念

### 1. 持续集成（Continuous Integration）

开发者频繁（通常每天多次）把自己的代码改动**合并到主分支**。每次合并后，系统自动：

1. **构建（Build）**：把代码编译成可执行的形式
2. **测试（Test）**：自动跑单元测试、集成测试
3. **报告（Report）**：告诉你通过了还是失败了

如果测试失败了，你要**立刻修复**——这就是"尽早发现问题"的原则。

### 2. 持续交付（Continuous Delivery）

在 CI 的基础上，自动把通过测试的代码**打包成发布版本**，放到一个"随时可以上线"的仓库里。但**是否发布到生产环境**，还是由人来决定（手动点一下发布按钮）。

### 3. 持续部署（Continuous Deployment）

比持续交付更进一步：测试通过后**自动发布到生产环境**，用户立刻用上最新功能。不需要人工审批。这需要**非常完善**的自动化测试来保驾护航。

### 4. 安全左移（Shift Left Security）

把安全检查**提前**到流水线早期阶段，而不是等到上线前才扫一遍。包括：依赖包漏洞扫描、代码安全审计、密钥泄露检测等。

## 流水线长什么样？

一个典型的现代 CI/CD 流水线包含以下阶段：

```
代码提交 → 静态分析 → 单元测试 → 集成测试 → 构建镜像 → 安全扫描 → 部署测试环境 → 端到端测试 → 部署生产
```

每一阶段都是**门禁（Gate）**：上一阶段不通过，后面就不继续。

## 代码示例

### 示例 1：GitHub Actions — 基础 CI 流水线

这是最轻量的方式，把配置写在 `.github/workflows/ci.yml`：

```yaml
name: CI Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: 检出代码
        uses: actions/checkout@v4

      - name: 设置 Node.js 环境
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 安装依赖
        run: npm ci

      - name: 运行 ESLint 检查代码风格
        run: npm run lint

      - name: 运行单元测试
        run: npm test

      - name: 构建项目
        run: npm run build
```

**解释**：

- `on:` 告诉 GitHub：当有人推到 main 分支或创建拉取请求时触发
- `runs-on: ubuntu-latest`：用 GitHub 提供的云服务器来跑
- 每个 `step` 就是一行命令，按顺序执行
- 任何一步失败，整个流水线标红，代码不会被合并

### 示例 2：Tekton — Kubernetes 原生流水线

Tekton 把流水线定义成 Kubernetes 资源，每个步骤跑在一个独立的容器里，天然适合云原生环境：

```yaml
apiVersion: tekton.dev/v1beta1
kind: PipelineRun
metadata:
  name: my-app-pipeline
spec:
  pipelineRef:
    name: build-test-deploy
  workspaces:
    - name: source
      volumeClaim:
        spec:
          accessModes: ["ReadWriteOnce"]
          storageClassName: standard
          resources:
            requests:
              storage: 1Gi

  params:
    - name: repo-url
      value: "https://github.com/my-org/my-app.git"
    - name: revision
      value: main
    - name: image
      value: "registry.example.com/my-app:latest"
```

对应的 Pipeline 定义：

```yaml
apiVersion: tekton.dev/v1beta1
kind: Pipeline
metadata:
  name: build-test-deploy
spec:
  workspaces:
    - name: source

  params:
    - name: repo-url
      type: string
    - name: image
      type: string

  tasks:
    - name: fetch-source
      taskRef:
        name: git-clone
      params:
        - name: url
          value: $(params.repo-url)
      workspaces:
        - name: output
          workspace: source

    - name: run-tests
      runAfter: ["fetch-source"]
      taskRef:
        name: run-tests
      workspaces:
        - name: source
          workspace: source

    - name: build-image
      runAfter: ["run-tests"]
      taskRef:
        name: buildah
      params:
        - name: IMAGE
          value: $(params.image)
      workspaces:
        - name: source
          workspace: source

    - name: deploy-to-k8s
      runAfter: ["build-image"]
      taskRef:
        name: kubectl-apply
      params:
        - name: args
          value: ["apply", "-f", "k8s/"]
```

**解释**：

- `Pipeline` 定义了"做什么"——拉代码 → 测试 → 构建镜像 → 部署
- `PipelineRun` 是某一次具体的运行，填上参数值（比如仓库地址、镜像名）
- `runAfter` 控制顺序：测试必须在拉代码之后，构建必须在测试之后
- 每个 task 跑在自己的容器里，失败了不影响其他已经跑完的 task
- 天然支持并行：如果有两个独立任务（比如前端测试和后端测试），可以一起跑

### 示例 3：GitOps — Argo CD 持续部署

GitOps 的核心思想是：**把生产环境的配置也放在 Git 里**。Argo CD 监听 Git 仓库，发现配置变了就自动同步到 K8s 集群：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/my-org/k8s-manifests.git
    targetRevision: main
    path: deployments/production
  destination:
    server: https://kubernetes.default.svc
    namespace: my-app
  syncPolicy:
    automated:
      prune: true          # 自动删除 Git 里不存在的资源
      selfHeal: true       # 如果有人手动改了集群，自动改回来
    syncOptions:
      - CreateNamespace=true
```

**解释**：

- `syncPolicy.automated` 开启全自动同步：Git 变了 → Argo CD 检测到 → 自动更新集群
- `prune: true` 自动清理：从 Git 里删掉 deployment，集群里也删掉
- `selfHeal: true` 防篡改：如果有人直接用 kubectl 改了配置，Argo CD 会改回去
- 所有变更都有 Git 审计日志：谁、什么时候、改了什么，一目了然

## 关键术语速查

| 术语 | 意思 |
|------|------|
| Pipeline | 从代码到上线的完整自动化流程 |
| Stage | 流水线中的一个阶段（如"测试"、"构建"、"部署"） |
| Build | 把源代码编译/打包成可部署的形式 |
| Artifact | 构建产出的产物（如 Docker 镜像、JAR 文件） |
| Gate | 门禁：上一阶段不通过就不继续 |
| Rollback | 回退：出了问题回到上一个稳定版本 |
| Shift Left | 把测试/安全等工作提前到更早阶段 |

## 进阶：现代 CI/CD 的关键趋势

1. **云原生流水线**：Tekton、Argo CD 等 Kubernetes 原生工具，让流水线本身也像应用一样弹性伸缩。
2. **平台工程（Platform Engineering）**：把 CI/CD 工具链封装成"内部开发者平台（IDP）"，开发者只需关注写代码，不用管流水线怎么配。
3. **AI 辅助**：AI 可以自动分析失败日志、推荐修复方案、甚至自动生成测试用例。
4. **Supply Chain Security**：对第三方依赖做签名验证（如 Sigstore / cosign），确保没人篡改过你的依赖包。
5. **GitOps 成为标准**：生产环境的声明式配置存在 Git 里，Argo CD / Flux 自动同步，所有变更可追溯。

## 思考题

你目前参与的项目（或想象中一个项目），哪些步骤是手动的？如果让你设计一个 CI/CD 流水线，第一步自动化什么最划算？（提示：通常从"自动跑测试"开始最合理，因为它成本最低、回报最高。）
