---
title: Eclipse Che — Kubernetes 原生云 IDE
来源: https://github.com/eclipse/che
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：Kubernetes 上的「标准化研发车间」

想象一家汽车厂。每个工程师不再自带工具箱、焊枪和测试台——**车间管理员**在流水线上预先划好工位：A 区装 Node 18 + PostgreSQL，B 区装 Go 1.22 + Redis，每个工位还配一块带语言服务、调试器和终端的**操作屏**（浏览器 IDE）。工程师刷卡进门，选「今天做哪个项目」，Kubernetes 就按图纸（Devfile）在集群里拉起一个隔离 Pod；下班点「停止」，资源回收；明天同一套图纸再开，环境一模一样。

**Eclipse Che 就是这个「车间调度系统 + 操作屏」的组合**，只不过车间跑在你自己的 Kubernetes 或 OpenShift 上，而不是某家 SaaS 的黑盒里。官方定义：**Kubernetes-native IDE and developer collaboration platform**——工作区不是「远程桌面里的一台 VM」，而是**声明式、可版本化的容器化开发环境**，IDE 本身也被当作工作区依赖一起打包进 Pod。

项目地址：[eclipse/che](https://github.com/eclipse/che)，Eclipse Public License 2.0 开源。文档站：[eclipse.dev/che](https://eclipse.dev/che/docs/stable/overview/introduction-to-eclipse-che/)。

---

## 这个项目解决什么问题

### 痛点 1：「在我机器上能跑」

本地 Node 版本、系统库、Docker 权限各不相同，新人 onboarding 常卡在环境对齐。Che 把**可复现环境**写进 **Devfile**（或仓库里的 `devfile.yaml`），所有人从同一份声明出发；工作区在 K8s Pod 里运行，差异只剩「你选 standard 还是 large 规格」。

### 痛点 2：IDE 与运行时割裂

传统模型：代码在仓库里，IDE 装在本机，运行时靠 `docker compose up` 临时凑。Che 的 **Workspace 模型**把「项目源码 + 构建/运行依赖 + IDE + 插件」视为**一个整体**——IDE 不是外挂工具，而是工作区 Pod 里的容器之一。这样可以在 dev 模式里叠加 Language Server、Debug Adapter，同时复刻生产侧的微服务拓扑。

### 痛点 3：远程开发 SaaS 的数据与合规

[[gitpod]]、GitHub Codespaces 等产品体验好，但计费、数据驻留、审计策略不一定满足金融、政务、内网场景。Che **自托管**在自有集群：OIDC（Dex / OpenShift OAuth）、RBAC、Prometheus/Grafana 监控都可按企业标准接入。

### 痛点 4：平台团队需要 K8s 原生治理

Che 不是「又一套 PaaS」，而是 **Custom Resource + Operator** 模式：`CheCluster` 描述平台，`DevWorkspace` 描述每个开发者工作区，**DevWorkspace Operator（DWO）** 负责 reconcile。平台工程师用熟悉的 `kubectl`、GitOps、Helm 运维，而不是单独学一套私有 API。

---

## 核心概念拆解

理解 Che 时，先把下面几个 Kubernetes 层面的名词分清——它们会出现在 Dashboard、YAML 和运维手册里。

### 1. CheCluster — 平台总开关

**CheCluster** 是 Che 在集群里的「安装说明书」Custom Resource（CR）。Eclipse Che Operator 读取 `CheCluster` spec，生成各组件的 ConfigMap、Deployment、Route/Ingress 等。常见配置块包括：

| 区块 | 作用 |
|------|------|
| `components.cheServer` | Che Server（API + 编排） |
| `components.dashboard` | 用户仪表盘，创建工作区入口 |
| `components.devWorkspace` | 与 DWO 的集成方式 |
| `components.devfileRegistry` | 内置/外置 Devfile 模板库 |
| `components.pluginRegistry` | IDE 插件（兼容 VS Code 扩展体系）注册表 |
| `devEnvironments` | 默认编辑器、工作区存储、超时策略 |
| `networking` | 域名、TLS、OAuth 客户端 |

改 `CheCluster` 等价于改整个 Che 实例的行为；Operator 会滚动重启受影响的 Pod。

### 2. DevWorkspace — 工作区的 K8s 身份证

用户在 Dashboard 点「Start workspace」时，Che 在后台创建 **DevWorkspace** CR——它是工作区在集群里的**权威表示**。每个 Che 工作区对应一个 DevWorkspace；DWO 读取该 CR，创建 Deployment、Service、Secret、ConfigMap、PVC，最终得到一个（或多个）运行 IDE 与工具链的 **Pod**。

DevWorkspace 还关联 **DevWorkspaceRouting**，定义工作区对外暴露的 endpoint（编辑器 URL、应用预览端口等）。

### 3. DevWorkspace Operator（DWO）— 车间主任

**DWO** 是 Che 的核心依赖，负责 **reconcile DevWorkspace**。你可以把它理解为：把 Devfile + 编辑器定义翻译成「能跑的 Pod 清单」的控制器。Che 还会在 Che 命名空间维护 Che 专用的 **DevWorkspaceOperatorConfiguration（DWOC）**，通过 `controller.devfile.io/devworkspace-config` 属性挂到每个工作区。

没有 DWO，DevWorkspace CR 只是 YAML 装饰；有了 DWO，才是可启动的浏览器 IDE。

### 4. Devfile — 开发者环境即代码

**Devfile** 是 CNCF 生态里的开放标准（[devfile.io](https://devfile.io)），Che 用它声明：

- **components**：容器镜像、Kubernetes 组件、Volume
- **projects**：Git 仓库克隆来源
- **commands**：构建、测试、运行脚本
- **events**：`postStart` 等生命周期钩子

Devfile v2 与 OCI 打包、Registry 分发兼容；Che 的 Devfile Registry 提供官方 Stack（Node、Java、Python 等）模板，团队也可自建 Registry 固化内部标准栈。

### 5. Che Server + Dashboard — 前台与 API

**Che Server** 处理多用户认证、权限、工作区 CRUD、与 Git 提供方集成。**Dashboard** 是浏览器里的控制面：选 Devfile、选编辑器（默认基于 [[theia]] / Open VS Code 体系）、启停工作区。开发者日常交互大多在 Dashboard + 内嵌 IDE 完成，不必直接编辑 DevWorkspace YAML。

### 6. 编辑器与插件 — 可替换的操作屏

Che 7+ 默认提供 **Eclipse Theia** 或 **code-editor**（Open VS Code 衍生）类编辑器，通过 **Plugin Registry** 加载语言扩展。插件机制与 **VS Code 扩展**兼容度较高（Language Server Protocol、Debug Adapter Protocol 是一等公民）。企业也可以配置「自带 IDE」——只要能在容器里跑、能通过 endpoint 暴露即可。

### 7. Factory — 一键复制工作区（历史概念仍常见）

早期 Che 强调 **Factory**：把 Devfile + 项目 URL 编码成链接，分享给队友「一点即开」同款环境。现代流程更多直接用 Devfile Registry + Dashboard，但「可分享、可复现」的思想与 Factory 一致——类似 [[gitpod]] 的 `#https://github.com/...` 深链。

---

## 架构一图流

Che 官方架构可概括为三层协作（详见 [Architecture overview](https://eclipse.dev/che/docs/stable/administration-guide/architecture-overview/)）：

```text
┌─────────────────────────────────────────────────────────────┐
│  Che Server 组件（Dashboard、Che Server、Registry…）         │
│  用户在这里创建/管理工作区                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ 创建 DevWorkspace CR
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  DevWorkspace Operator                                      │
│  reconcile → Deployment / Service / PVC / Routing         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  User Workspace Pod（IDE 容器 + 工具容器 + 可选 sidecar）    │
│  隔离命名空间，RBAC 控制，监控可接 Prometheus                │
└─────────────────────────────────────────────────────────────┘
```

与 [[coder]] 对比：Coder 用 **Terraform Template + coderd** 在 VM/K8s/Docker 上发「工位」；Che 用 **Devfile + DevWorkspace CR + DWO** 在 **纯 Kubernetes** 上发「Pod 型工位」，IDE 内嵌更深，K8s 原生味更浓。与 [[gitpod]] 对比：Gitpod 强调 **Prebuild** 与 `.gitpod.yml` SaaS 体验；Che 强调 **自托管、Operator、Devfile 标准**，预构建需自行在 CI 或 Registry 层设计。

---

## 代码示例 1：仓库根目录的 `devfile.yaml`

下面是一个最小可用的 Devfile v2.2 示例：一个 `tools` 容器（带 Node），克隆 Git 项目，并在 `postStart` 里安装依赖。Che 创建工作区时会把它合并进 DevWorkspace spec。

```yaml
schemaVersion: 2.2.0
metadata:
  name: node-react-dev
  version: 1.0.0
  displayName: Node.js React 开发栈
components:
  - name: tools
    container:
      image: quay.io/devfile/universal-developer-image:ubi8-latest
      memoryLimit: 1Gi
      mountSources: true
      endpoints:
        - name: web-preview
          targetPort: 3000
          exposure: public
          secure: false
          protocol: http
  - name: projects-root
    volume:
      size: 10Gi
projects:
  - name: my-app
    git:
      remotes:
        origin: https://github.com/example/my-react-app.git
      checkoutFrom:
        remote: origin
        revision: main
commands:
  - id: install-deps
    exec:
      component: tools
      commandLine: "cd ${PROJECTS_ROOT}/my-app && npm ci"
      workingDir: ${PROJECTS_ROOT}/my-app
events:
  postStart:
    - install-deps
```

要点说明：

- `components[].container.endpoints` 定义预览 URL，DWO 会写入 **DevWorkspaceRouting**。
- `projects` 段让 Che 在启动时自动 `git clone`。
- `commands` + `events.postStart` 实现「工作区起来就装依赖」，类似 Gitpod 的 `init`，但语法是 Devfile 标准，可跨 Che、OpenShift Dev Spaces 等实现复用。

---

## 代码示例 2：部署 Che 的 `CheCluster` 与 `kubectl`

生产环境通常先装 **Eclipse Che Operator**（Helm 或 OLM），再 apply `CheCluster`。下面是从官方文档提炼的**最小 CR 骨架**与等待就绪命令（域名与 OAuth 需按集群替换）：

```yaml
apiVersion: org.eclipse.che/v2
kind: CheCluster
metadata:
  name: eclipse-che
  namespace: eclipse-che
spec:
  components: {}
  devEnvironments: {}
  networking:
    domain: che.example.com
    auth:
      identityProviderURL: https://oauth.example.com
      oAuthClientName: che-public
      oAuthSecret: <replace-with-secret>
```

```bash
# 创建命名空间并安装 Operator 后，应用 CheCluster
kubectl apply -f che-cluster.yaml -n eclipse-che

# 等待 Che 进入 Active 阶段（官方 Helm 文档常用 jsonpath 探测）
kubectl wait checluster/eclipse-che \
  --namespace eclipse-che \
  --for=jsonpath='{.status.chePhase}'=Active \
  --timeout=360s

# 运行中调整配置（例如扩大 devfileRegistry 存储）
kubectl edit checluster/eclipse-che -n eclipse-che

# 验证 Che Server ConfigMap 是否已同步某配置项
kubectl get configmap che -o jsonpath='{.data.CHE_WORKSPACE_DEVFILE__REGISTRY__URL}' \
  -n eclipse-che
```

运维心智模型：**改 CheCluster → Operator 改 ConfigMap → K8s 滚动重启组件 Pod**。这与改 Deployment env 不同，所有平台级开关应走 CR，便于 GitOps 审计。

---

## 代码示例 3：用 CLI 直接提交 DevWorkspace（进阶）

Dashboard 背后是 CR；平台工程师调试时可以直接 apply DevWorkspace（需已安装 DWO 且 RBAC 允许）。示意：

```yaml
apiVersion: workspace.devfile.io/v1alpha2
kind: DevWorkspace
metadata:
  name: demo-workspace
  namespace: che-user-alice
spec:
  started: true
  template:
    projects:
      - name: sample
        git:
          remotes:
            origin: https://github.com/eclipse-che/che-docs.git
    components:
      - name: editor
        attributes:
          che.eclipse.org/editor: eclipse/che-code/latest
        container:
          image: quay.io/devfile/universal-developer-image:ubi8-latest
          memoryLimit: 512Mi
```

```bash
kubectl apply -f devworkspace-demo.yaml -n che-user-alice
kubectl get devworkspace -n che-user-alice -w
```

Che Dashboard 创建的工作区本质上也是类似结构，只是 Che Server 替你填好了 editor 属性、Registry URL 和 user namespace。

---

## 典型工作流（零基础第一次用）

1. **集群准备**：Kubernetes 1.25+（或 OpenShift 4.x），Ingress/Route、默认 StorageClass、可拉取的容器镜像仓库。
2. **安装 Operator + CheCluster**：用 [chectl](https://github.com/eclipse-che/che/tree/main) 或 Helm chart `eclipse-che/eclipse-che`；Red Hat 场景可用 OpenShift Dev Spaces（Che 下游产品化）。
3. **配置身份**：Dex 或 OpenShift OAuth，让 Dashboard 能登录并映射 K8s RBAC。
4. **导入 Devfile**：从 Devfile Registry 选 Stack，或把 `devfile.yaml` 放进 Git 仓库。
5. **启动工作区**：Dashboard → Create Workspace → 选 Devfile + 编辑器 → Start；浏览器打开 IDE URL。
6. **停止与清理**：Stop workspace 释放 CPU/内存；删除 DevWorkspace 释放 PVC（注意备份未 push 的代码）。

---

## 适用场景与边界

**适合：**

- 已有 Kubernetes/OpenShift，希望**统一 dev 环境**且 IDE 在浏览器内完成
- 需要 **Devfile 标准**、多团队共享 Stack、与 CNCF 工具链对齐
- 合规要求**数据不出集群**，同时要 LSP/DAP 现代 IDE 体验

**不太适合：**

- 小团队、无 K8s 运维能力——安装 Che + DWO + OAuth 的门槛明显高于单机 Docker
- 主要诉求是 **PR 预览环境 / 全栈 ephemeral staging**——这类「环境即服务」更像 [[gitpod]] 预构建或专用 EaaS，Che 聚焦**个人/团队工作区**而非整条 delivery pipeline
- 只想快速用 SaaS、不想自管 Operator——托管版（如 developers.redhat.com 上的 Che）可缓解，但仍需理解 Devfile

---

## 与相近项目怎么选

| 维度 | Eclipse Che | Gitpod | Coder |
|------|-------------|--------|-------|
| 部署 | K8s Operator + CR | 自托管或 gitpod.io SaaS | 自托管 coderd + Terraform |
| 环境定义 | Devfile v2 | `.gitpod.yml` | Template (Terraform) |
| IDE 位置 | 工作区 Pod 内嵌 | 工作区容器 + OpenVSCode | 用户自选（SSH/VS Code/code-server） |
| 最强卖点 | K8s 原生、Devfile 标准、企业 OIDC | Prebuild、秒开、深链 | 多后端、策略治理、AI Agent 场景 |
| 运维复杂度 | 高（Operator 生态） | 中–高 | 中 |

三者可以并存：Che 管「标准 K8s 研发车间」，Coder 管「GPU/Windows/非 K8s 工位」，Gitpod 管「开源仓库秒开贡献流程」——按团队边界拆分，而不是非此即彼。

---

## 学习路径建议

1. 读官方 [Introduction to Eclipse Che](https://eclipse.dev/che/docs/stable/overview/introduction-to-eclipse-che/)，理解 Workspace 模型与 enterprise integration。
2. 本地实验：Minikube/Kind + chectl `che deploy`（资源需求见文档 *Calculating Che resource requirements*）。
3. 手写一个 `devfile.yaml` 推到自己 Git 仓库，在 Dashboard 从 URL 创建工作区。
4. 读 [DevWorkspace Operator overview](https://eclipse.dev/che/docs/stable/administration-guide/devworkspace-operator/)，用 `kubectl get devworkspace,devworkspacerouting` 观察 reconcile。
5. 对比 Devfile 与 `.gitpod.yml` / Coder template，理解「环境即代码」的三种方言。

---

## 延伸阅读

- 官方文档：[eclipse.dev/che/docs](https://eclipse.dev/che/docs/stable/)
- Devfile 规范：[devfile.io](https://devfile.io)
- 架构：[Che architecture](https://eclipse.dev/che/docs/stable/administration-guide/architecture-overview/)
- CheCluster 字段参考：[CR fields reference](https://eclipse.dev/che/docs/stable/administration-guide/checluster-custom-resource-fields-reference/)
- 相关笔记：[[theia]]、[[openvscode-server]]、[[kubernetes]]、[[gitpod]]、[[coder]]
