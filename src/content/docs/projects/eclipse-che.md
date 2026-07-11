---
title: Eclipse Che — Kubernetes 原生云 IDE
来源: 'https://github.com/eclipse-che/che'
日期: 2026-07-07
分类: editors
难度: 中级
---

## 是什么

Eclipse Che 是一个把 **开发环境变成 Kubernetes 里一组 Pod** 的云 IDE 平台。日常类比：桌面 IDE 像你自己的书桌，Che 像公司统一配好的实验室工位——打开门就有编辑器、终端、依赖、运行时和项目代码。

最小使用方式不是先装一堆本地工具，而是把仓库 URL 接到 Che 实例后面：

```text
https://<che_fqdn>#https://github.com/che-samples/cpp-hello-world
```

Che 会读取仓库里的 `devfile.yaml` 或 `.devfile.yaml`，没有 devfile 时就给你一个默认的 Universal Developer Image，再在浏览器里打开 Code - OSS 风格的 IDE。

它和 [[code-server]] / [[openvscode-server]] 的区别是：后两者更像"把 VS Code 跑到远端"，Che 更像"企业把工作区调度、身份、资源、镜像、默认插件都接到 Kubernetes 上"。

## 为什么重要

不理解 Eclipse Che，下面这些事会很难解释：

- 为什么企业云 IDE 不只是"网页里有编辑器"：真正难的是用户隔离、资源限制、镜像来源、身份认证和审计。
- 为什么 devfile 这种 YAML 会变重要：它把"怎么装环境、跑命令、开端口"写进仓库，让团队共享同一套工位。
- 为什么 Che 特别强调 Kubernetes：每个 workspace 都能映射成集群里的工位对象（自定义资源 CR）、运行容器组（Pod）、网络入口（Service）和持久硬盘（PVC）。
- 为什么本地电脑再轻也能参与大项目：编译、依赖下载、语言服务器和终端都在集群里跑，本地只负责浏览器。

## 核心要点

1. **DevWorkspace 是工位登记表**：类比前台登记一张工位申请单。Che 把 devfile 转成 Kubernetes 里的 DevWorkspace 自定义资源（CR = 你自定义的一种"工位档案"），Operator 再据此创建 Pod（一组一起跑的容器）、Service 和 PVC（挂着不丢的硬盘）。

2. **devfile 是开工说明书**：类比实验课的器材清单。它写清楚用哪个容器镜像（没有就用默认 UDI = Universal Developer Image，通用开发镜像）、要多少 CPU/内存、有哪些命令、哪些端口要暴露；仓库带着它走，新人就少读一大页手工安装文档。

3. **企业能力在平台层**：类比学校统一管理实验室钥匙。Che server、dashboard、gateway、devfile registry、plugin registry 和 RBAC 合起来，解决多人访问、默认编辑器、扩展来源和集群权限边界。

## 实践案例

### 案例 1：从一个 Git 仓库链接直接进工作区

```text
https://<che_fqdn>#https://github.com/che-samples/cpp-hello-world
https://<che_fqdn>#https://<github_host>/<org>/<repo>/pull/<pull_request_id>
https://<che_fqdn>#git@github.com:<org>/<repo>.git
```

逐部分解释：

- `https://<che_fqdn>` 是你们组织的 Che 入口，不是公共 GitHub 页面。
- `#` 后面放 git clone URL，Che 会在新 workspace 里克隆它。
- GitHub PR URL 可以直接打开某个评审分支，适合 code review。
- SSH URL 要提前配置 SSH key；私有仓库还要走访问令牌或 SCM 登录。

这个案例适合 onboarding、PR 评审、开源贡献者复现 issue：别人不需要先猜你本机装了哪些工具。

### 案例 2：用 devfile 固定 Rails 项目的工具链

```yaml
schemaVersion: 2.2.0
metadata:
  name: rails-blog
components:
  - name: devtools
    container:
      image: quay.io/mloriedo/rails-blog-cde:latest
      memoryRequest: 2G
      memoryLimit: 4G
      cpuRequest: '1'
      cpuLimit: '2'
commands:
  - id: bundle-install
    exec:
      component: devtools
      commandLine: bundle install
      workingDir: ${PROJECT_SOURCE}
  - id: server-start
    exec:
      component: devtools
      commandLine: ./bin/rails server --binding 0.0.0.0
events:
  postStart:
    - bundle-install
```

逐部分解释：

- `image` 选一个已经装好 Ruby / Rails 的开发镜像，避免默认镜像缺运行时。
- `memoryLimit` / `cpuLimit` 是给 Kubernetes 调度看的边界，防止一个 workspace 吃光节点。
- `commands` 会变成 IDE 里的 Devfile task，用户点一下就能安装依赖或启动服务。
- `postStart` 表示 workspace 启动后自动跑依赖安装，像开工前自动把工具摆好。

这个案例来自官方 Che blog 的 Rails 示例，重点不是 Rails，而是"项目特殊依赖写进 devfile"这件事。

### 案例 3：给团队预装 VS Code 扩展

```yaml
schemaVersion: 2.3.0
metadata:
  generateName: example-project
components:
  - name: tools
    container:
      image: quay.io/devfile/universal-developer-image:ubi8-latest
      env:
        - name: DEFAULT_EXTENSIONS
          value: '/projects/example-project/extension.vsix'
```

逐部分解释：

- `DEFAULT_EXTENSIONS` 告诉 Che 的 Code - OSS 编辑器启动后后台安装指定 `.vsix`。
- 扩展二进制可以放在仓库里，也可以由 `postStart` 命令下载，还可以打进编辑器镜像。
- 这个方式适合团队统一装 YAML、Ruby LSP、公司内部插件；版本最好固定。
- 受限网络里要准备内部 Open VSX 或私有扩展包，不能默认假设公网可访问。

这个案例适合企业环境：不靠每个新人手动点扩展市场，而是让 workspace 自动拿到该有的工具。

## 踩过的坑

1. **把 Che 当成个人 code-server**：Che 的价值在多人平台和 K8s 控制面，单人临时写代码会显得重。

2. **仓库没有 devfile 就以为环境可复现**：没有 devfile 时会落到默认 UDI，能打开不代表能编译、调试和运行。

3. **自定义镜像缺库**：官方文档提到有些镜像缺 `openssl` 或 `libbrotli` 时，Code - OSS 可能起不来。

4. **资源限制随手写太小**：语言服务器、构建工具和测试一起跑，内存不足会变成 OOMKilled 或 CrashLoopBackOff。

## 适用 vs 不适用场景

**适用**：

- 企业已经有 OpenShift / Kubernetes，并希望开发环境和集群权限统一治理。
- 新人 onboarding、培训、PR 复现、客户 demo 需要"点仓库链接就有同一套环境"。
- 项目依赖复杂，本地装环境成本高，适合用 devfile 和镜像固定。
- 需要默认 IDE、默认扩展、默认资源策略和团队级 dashboard。

**不适用**：

- 个人轻量远程编辑：[[code-server]] 或 [[openvscode-server]] 更直接。
- 团队没有 Kubernetes 运维能力，也不想购买托管方案。
- 项目强依赖本机 GUI、USB、移动端模拟器或低延迟图形能力。
- 只需要一份简单 `docker compose up` 的小项目，平台成本会盖过收益。

## 历史小故事（可跳过）

- **2010s 中期**：Eclipse Che 从浏览器 IDE 和 workspace server 思路出发，后来逐步拥抱容器化开发环境。
- **Che 7 之后**：重心转向 Kubernetes-native，把 workspace 运行时交给 Pod、Service、PVC 和 Operator。
- **DevWorkspace 体系成熟后**：Che 更强调 devfile 标准、Code - OSS 默认 IDE、Open VSX 扩展生态和企业管理能力。
- **2026 年 7 月**：GitHub 页面显示 `eclipse-che/che` 约 7.2k stars，定位仍是企业团队的 Kubernetes cloud development environments。

## 学到什么

- 云 IDE 要拆开看：编辑器只是门面，workspace 调度、镜像、权限和存储才是企业级难点。
- devfile 的价值是把"本机安装经验"变成仓库里的可执行说明书。
- Kubernetes 给 Che 提供统一抽象：workspace 可以被 `kubectl get devworkspaces` 观察和管理。
- 判断 Che 是否合适，先问团队是不是已经接受 K8s 作为底座；否则它会太重。

## 延伸阅读

- 官方仓库：[eclipse-che/che](https://github.com/eclipse-che/che)
- 官方文档：[Eclipse Che Documentation](https://eclipse.dev/che/docs)
- 架构概览：[Che architecture](https://eclipse.dev/che/docs/stable/discover/architecture-overview/)
- 实战文章：[Customizing Eclipse Che Cloud Development Environments](https://che.eclipseprojects.io/2024/02/05/%40mario.loriedo-cde-customization.html)
- [[kubernetes]] —— 理解 Che 为什么把 workspace 做成集群资源
- [[vscode]] —— Che 默认 IDE 体验和 Code - OSS / VS Code 生态有关

## 关联

- [[kubernetes]] —— Che 的 workspace 最终落到 Pod、Service、PVC 和 DevWorkspace CR。
- [[minikube]] —— 官方文档用它在本地评估 Che，但只适合测试。
- [[vscode]] —— Che 的默认浏览器 IDE 与 Code - OSS 体验相近。
- [[code-server]] —— 更轻量的个人浏览器 VS Code，对比能看出 Che 的平台层。
- [[openvscode-server]] —— 同属远程 VS Code 形态，但不负责企业 workspace 编排。
- [[gitpod]] —— 同样强调仓库级云开发环境和可复现配置。
- [[docker]] —— devfile 里的开发环境通常从容器镜像开始。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
