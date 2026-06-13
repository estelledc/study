---
title: Coder — 自托管开发环境平台
来源: https://github.com/coder/coder
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：公司统一配发的「云端工位」

想象你进了一家大厂。前台给你一张工牌，HR 说：「去三楼选个空位，电脑、显示器、VPN、内网权限都配好了，坐下就能写代码。」你不需要自己买机器、装系统、配防火墙——**平台团队**早就把「标准开发工位」定义成模板，你只管刷卡入座。

**Coder 干的就是这件事，只不过工位在云上。** 平台管理员用 Terraform 写好「工位规格」（Ubuntu + Docker + [[code-server]] + 8GB 内存），开发者登录后点几下就领到一台隔离的远程工作区，用 [[vscode]]、Cursor、JetBrains、SSH 或浏览器终端连进去写代码。机器闲置会自动关机省钱，下次启动几秒恢复——像本地电脑，但算力和数据都在你公司自己的 AWS / Azure / GCP / 内网 Kubernetes 上。

项目地址：[coder/coder](https://github.com/coder/coder)，Apache 2.0 开源。官方定位：**self-hosted platform for running AI coding agents and cloud development environments on infrastructure you control**——控制面、工作区、甚至 AI Agent 循环都跑在你掌控的基础设施上，而不是某家 SaaS 的黑盒里。

---

## 这个项目解决什么问题

### 痛点 1：每人本地环境不一致

新人入职要装三天：Node 版本、Docker、公司 CA 证书、私有 npm registry……「在我机器上能跑」是团队永恒的梗。Coder 把环境固化在 **Template（模板）** 里，所有人从同一套镜像和启动脚本出发，差异只剩「你领的是大规格还是小规格工作区」。

### 痛点 2：笔记本算力不够，又离不开完整 IDE

编译单体仓库、跑集成测试、起多个 Docker Compose 服务——笔记本风扇起飞。Coder 把重活放到云主机或 K8s Pod，本地只跑 IDE 客户端或浏览器；官方文档强调 idle workspace 可 **autostop**，避免云账单像漏水的水龙头。

### 痛点 3：远程开发 SaaS 绑定生态、数据出境

GitHub Codespaces、Gitpod 等产品好用，但计费、合规、数据驻留往往不由你说了算。Coder 是**自托管**方案：PostgreSQL、控制面、Provisioner 都在你的 VPC 或机房，适合金融、政务、军工等有数据主权要求的场景。

### 痛点 4：平台团队需要「可编程」的治理层

不仅要发机器，还要统一：谁能用 GPU 模板、工作区最长存活多久、能否访问外网、预装哪些 AI 工具。Coder 用 Terraform 描述基础设施，管理员在模板层注入策略，比手工 SSH 配机器可审计、可版本化。

---

## 核心概念拆解

理解 Coder 不需要先成为 Terraform 专家，但要把下面几个名词分清——它们出现在仪表盘、CLI 和每一行模板代码里。

### 1. coderd — 控制平面（大脑）

运行 `coder server` 启动的核心服务叫 **coderd**。它提供：

- Web 仪表盘与 HTTP API
- 用户认证（可对接 OIDC / SAML 等 IdP）
- 工作区生命周期编排（创建、启动、停止、删除）
- **Dev URLs**：把 `https://coder.company.com/@alice/my-ws/apps/code-server/` 反代到工作区内的 Web 应用
- 与 PostgreSQL 通信（**只有 coderd 读写数据库**）

生产环境通常部署多个 coderd 副本做高可用；默认每个副本内嵌若干 **provisionerd** 进程。

### 2. PostgreSQL — 唯一状态存储

会话令牌、模板版本、工作区元数据、审计日志索引等都落在 Postgres。试用可以内嵌数据库；生产建议外置托管 PG 并做备份。控制面本身无状态，扩缩容靠多加 coderd 实例。

### 3. provisionerd — Terraform 执行器（双手）

**provisionerd** 是真正跑 `terraform apply` / `destroy` 的地方。工作区每次创建、启动、停止，本质上都是一次受控的 IaC 变更。当前主要 Provisioner 是 **Terraform**；你可以把 provisionerd 拆到独立节点，避免用户工作负载与基础设施变更抢同一台机器的 CPU。

### 4. Template — 工位蓝图

**Template** 是管理员维护的「工作区配方」，主体是一个 Terraform 项目（`main.tf` + Dockerfile + 模块等）。里面定义：

- 计算资源（EC2、Azure VM、K8s Pod、本地 Docker 容器……）
- 存储卷是否持久（关机后 home 目录还在不在）
- `coder_agent` 如何安装、启动脚本、环境变量
- `coder_app` 暴露哪些 Web IDE（如 [[code-server]]、Jupyter）

模板推送到 Coder 后版本化；开发者只能选用管理员发布的模板，不能随意 `terraform` 一台裸机。

### 5. Workspace — 你的那一格工位

**Workspace** 是某用户从某模板实例化出来的一套云资源集合：可能包含 VM + 磁盘 + 密钥 + Sidecar。分两类资源：

- **计算资源（computational）**：跑 `coder_agent` 的 VM/容器
- **外围资源（peripheral）**：存储桶、数据库实例等不跑 agent 的东西

资源又可分 **持久（persistent）** 与 **临时（ephemeral）**：关机时临时资源销毁，持久卷保留——常见做法是「只有 `/home` 持久，容器每次重建」，兼顾省钱与环境新鲜度。

### 6. coder agent — 工作区内的联络员

每个工作区里跑一个 **coder_agent** 进程。它：

- 与 coderd 建立连接（常用 WireGuard 隧道，无需工作区开放公网入站端口）
- 提供 SSH、端口转发、文件同步
- 上报 CPU/内存等元数据到仪表盘
- 托管 `coder_app` 注册的本地 Web 服务

模板里通过 `coder_agent` Terraform resource 声明；容器启动时注入 `CODER_AGENT_TOKEN` 完成注册。

### 7. coder_app — 仪表盘里的「应用图标」

`coder_app` 把工作区内的 HTTP 服务（或外部链接）登记到 Coder UI。用户点图标即可打开浏览器版 VS Code、Jupyter Lab，或公司内部 Wiki。可配 `healthcheck` 做就绪探测。

### 8. 连接方式一览

| 方式 | 适用场景 |
|------|----------|
| VS Code / Cursor / JetBrains 插件 | 日常编码，体验接近 Remote-SSH |
| `coder ssh` / 原生 SSH | 终端党、脚本自动化 |
| Web Terminal | 无本地 IDE 时的兜底 |
| Dev URL / Workspace App | 浏览器里跑 [[code-server]] 等 |

### 9. 与 code-server 的关系

同仓库生态里的 [[code-server]] 是「单机浏览器版 VS Code」。**Coder 是编排层**：批量发工作区、管模板、做租户隔离和策略。模板里的 `startup_script` 经常安装 code-server，再用 `coder_app` 挂到仪表盘——二者是 **平台 vs 单应用** 的关系，不是替代关系。

### 10. Coder 不是什么

官方文档刻意划清边界：

- **不是** 通用 IaC 平台——Terraform 只是第一种 Provisioner，用来描述工作区
- **不是** 全托管 SaaS——你要自己装 coderd、备数据库、选云账号
- **不要求** 用户会写 Terraform——可以用 [Coder Registry](https://registry.coder.com) 现成模板起步

---

## 架构一图流

```text
开发者 ──► coder CLI / IDE 插件 / 浏览器
              │
              ▼
         ┌─────────┐      ┌──────────────┐
         │ coderd  │◄────►│ PostgreSQL   │
         │ (API/UI)│      └──────────────┘
         └────┬────┘
              │ 调度 terraform apply
              ▼
         ┌─────────────┐
         │ provisionerd │
         └────┬────────┘
              │ 创建/销毁云资源
              ▼
    ┌─────────────────────────────┐
    │ Workspace (VM / Pod / …)     │
    │  ┌─────────────────────┐    │
    │  │ coder_agent         │    │
    │  │  ├─ code-server:13337│    │
    │  │  └─ your app :8080  │    │
    │  └─────────────────────┘    │
    └─────────────────────────────┘
              ▲
              │ 加密隧道 (SSH / WireGuard)
              └──────── 开发者本机 IDE
```

---

## 代码示例 1：最小 Docker 模板（Terraform）

下面片段来自官方「从零写模板」教程的精简版，展示 **agent + 持久卷 + 临时容器 + code-server 应用** 四件套。完整教程见 [Write a template from scratch](https://coder.com/docs/tutorials/template-from-scratch)。

```hcl
terraform {
  required_providers {
    coder  = { source = "coder/coder" }
    docker = { source = "kreuzwerker/docker" }
  }
}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

# 1) 工作区里跑的 agent：启动脚本装 code-server，并暴露 CPU/RAM 元数据
resource "coder_agent" "main" {
  arch = "amd64"
  os   = "linux"

  startup_script = <<-EOT
    curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone --prefix=/tmp/code-server
    /tmp/code-server/bin/code-server --auth none --port 13337 &
  EOT

  env = {
    GIT_AUTHOR_EMAIL = data.coder_workspace_owner.me.email
  }
}

# 2) 在仪表盘添加「code-server」图标，带健康检查
resource "coder_app" "code-server" {
  agent_id     = coder_agent.main.id
  slug         = "code-server"
  display_name = "VS Code (Web)"
  url          = "http://localhost:13337/?folder=/home/coder"
  share        = "owner"

  healthcheck {
    url       = "http://localhost:13337/healthz"
    interval  = 5
    threshold = 6
  }
}

# 3) 持久 home 目录：关机不删
resource "docker_volume" "home" {
  name = "coder-${data.coder_workspace.me.id}-home"
  lifecycle { ignore_changes = all }
}

# 4) 临时容器：stop 时销毁，start 时按 start_count 重建
resource "docker_container" "workspace" {
  count = data.coder_workspace.me.start_count
  image = "coder-base-ubuntu:latest"
  name  = "coder-${lower(data.coder_workspace.me.name)}"

  env = ["CODER_AGENT_TOKEN=${coder_agent.main.token}"]

  volumes {
    container_path = "/home/coder"
    volume_name    = docker_volume.home.name
  }
}
```

读懂这段，你就抓住了 Coder 模板的灵魂：**Terraform 描述云资源，`coder_*` 资源描述「人怎么连上去」**。

---

## 代码示例 2：CLI 从登录到创建工作区

Coder 服务端与客户端共用同一个 `coder` 二进制。安装（Linux/macOS）：

```bash
curl -L https://coder.com/install.sh | sh
```

**启动单机试用服务器**（内置数据库，适合本机体验）：

```bash
coder server
# 浏览器打开 http://127.0.0.1:3000 完成首次设置
```

**连接已有团队部署**：

```bash
coder login https://coder.example.com
# 按提示在浏览器完成 CLI 授权，粘贴 token
```

**管理员推送模板**（在含 `main.tf` 的目录执行）：

```bash
cd my-template/
coder templates push
# 确认后模板出现在仪表盘 Templates 页
```

**开发者创建工作区并 SSH 进入**：

```bash
# 列出可用模板
coder templates list

# 从模板创建名为 backend 的工作区
coder create backend --template docker-ubuntu

# 查看状态，等待 Running
coder list

# 等价于 ssh backend.coder.example.com
coder ssh backend

# 在本地 VS Code 中打开（需安装 Coder 插件）
coder code backend
```

**自动停机省成本**（模板或用户级配置，示意）：

```bash
# 查看工作区调度策略
coder schedule show backend

# 设置 8 小时无活动自动停止（具体子命令随版本可能为 schedule autostop）
coder config set autostop_template_default 8h
```

---

## 安装与部署路径

| 路径 | 适合谁 | 要点 |
|------|--------|------|
| `coder server` 单机 | 个人尝鲜、小团队 | 最快，内置 PG，不适合大规模 |
| Docker Compose | 小中型团队 | 官方提供 compose 示例，外置 Postgres |
| Kubernetes Helm | 平台团队生产标准 | 多副本 coderd、Ingress、外部 PG |
| 空气隙 / 私有镜像仓库 | 强合规客户 | 需自建镜像同步，试用许可可能受限 |

系统要求随并发工作区数线性增长；Provisioner 节点建议与 coderd 分离，避免 Terraform 与用户编译争抢 I/O。

---

## 与同类方案怎么选

| 维度 | Coder | GitHub Codespaces | 自建 SSH 跳板机 |
|------|-------|-------------------|-----------------|
| 托管 | 自托管 | GitHub 托管 | 自托管 |
| 环境定义 | Terraform 模板 | devcontainer.json | 手工 / Ansible |
| IDE 支持 | 多 IDE + Web | 以 VS Code 为主 | 任意 SSH 客户端 |
| 多租户 / 审计 | 内置 | 依赖 GitHub Org | 需自建 |
| 自动关机 | 内置 autostop | 内置 | 需自己写 cron |
| 上手成本 | 中（要学模板） | 低 | 低但难规模化 |

若你只是一个人、一台云主机、想要浏览器 VS Code，[[code-server]] 足够。若你要**给整个工程团队发标准化云桌面**，Coder 是正解。

---

## 常见坑与排查

1. **Agent 连不上 coderd**：检查工作区能否 `curl` 到 Coder 访问地址；Docker 模板里常要把 `localhost` 换成 `host.docker.internal`。
2. **Provisioner 一直 Pending**：看 coderd 日志与 `coder provisioner jobs list`；Terraform 状态锁、云 API 配额、IAM 权限都会卡住。
3. **Dev URL 502**：`coder_app` 的 `healthcheck` 未通过——启动脚本里 code-server 还没监听端口就宣告就绪。
4. **持久卷被误删**：Terraform 里给 volume 加 `lifecycle { ignore_changes = all }`，并用 `coder_workspace.me.id` 而非常变名字做卷名。
5. **扩展与镜像漂移**：把工具链写进 Dockerfile / 启动脚本，而不是让用户 SSH 进去手工 `apt install`——否则下次 ephemeral 重建就丢失。

---

## 学习路径建议（零基础）

1. **30 分钟**：本机 `coder server`，用 Registry 里的 `docker` 或 `kubernetes` 入门模板创建一个工作区，体验 Web Terminal 和 code-server。
2. **半天**：跟官方教程改一版 `main.tf`——加一个 `coder_app` 指向你的内部文档站，练习 `coder templates push`。
3. **一周**：把模板迁到公司云账号（AWS EC2 或现有 K8s 集群），接上公司 OIDC 登录，配置 autostop 与配额。
4. **进阶**：阅读 [Architecture](https://coder.com/docs/admin/infrastructure/architecture)、拆分外部 provisionerd、探索 AI Gateway / Agent Firewall 等治理组件。

---

## 小结

Coder 把「远程开发环境」从个人英雄主义（每人自己配机器）提升为**平台能力**：模板即政策，工作区即工位，agent 即安全隧道。你掌控云、数据与 IDE 选择；Terraform 负责可重复的基础设施；开发者得到的是「刷卡入座」的体验。

一句话：**Coder = 用 Terraform 批量发放、统一治理、任意 IDE 接入的自托管云开发工位系统。**

---

## 延伸阅读

- 官方文档：[About Coder](https://coder.com/docs)
- 架构详解：[Infrastructure Architecture](https://coder.com/docs/admin/infrastructure/architecture)
- 模板教程：[Write a template from scratch](https://coder.com/docs/tutorials/template-from-scratch)
- 现成模板：[Coder Registry](https://registry.coder.com)
- 同生态浏览器 IDE：[[code-server]]
- 容器编排（工作区常跑在 K8s 上）：[[kubernetes]]
