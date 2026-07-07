---
title: Coder — 自托管开发环境平台
来源: https://github.com/coder/coder
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

把 Coder 想成公司里的“统一工位仓库”：新人不再自己搬桌子、装电脑、接网线，而是在系统里点一下，平台就按同一张清单给他开一张可远程进入的开发工位。

技术上，Coder 是一个自托管的 Cloud Development Environment 平台。团队用 Terraform 描述 workspace，Coder 在 Docker、Kubernetes、云主机或内网机器上创建环境，开发者再用 SSH、VS Code、JetBrains、Web Terminal 等入口进去写代码。

它的价值不是“又一个在线编辑器”，而是把开发环境变成企业可以统一审计、统一销毁、统一升级的 DevBox。GitHub 上约 10k+ star，适合关心安全、成本和入职速度的团队。

## 为什么重要

不理解 Coder，很难解释下面这些工程问题：

- 为什么大团队会把“搭环境”当作平台工程问题，而不是每个新人自己的问题。
- 为什么 Terraform 不只能建云资源，也能描述“一个开发者的一整套工作区”。
- 为什么同一个 workspace 可以同时被 SSH、VS Code Desktop、code-server、JetBrains Gateway 访问。
- 为什么自托管 DevBox 比纯 SaaS Codespace 更适合内网、合规、GPU 和受限网络。

## 核心要点

Coder 可以先抓住三件事：

1. **模板是菜单**：模板像食堂套餐，平台团队写好 Terraform，开发者只选“前端套餐”“后端套餐”“GPU 套餐”。模板里可以包含镜像、CPU、内存、启动脚本、IDE、密钥和网络规则。

2. **workspace 是临时工位**：workspace 像当天领到的座位，可以启动、停止、重建，也可以只保留 home 目录这类持久资源。这样既能省钱，也能避免“每台机器状态都不一样”。

3. **agent 是门卫兼管家**：Coder agent 跑在 workspace 里，负责让外部连接进来，也负责启动脚本、端口转发、资源状态上报。没有 agent，平台就只能创建机器，不能让开发者顺手使用机器。

## 架构怎么跑起来

最小心智模型是四层：

- **Coder server**：控制台和 API，保存用户、模板、workspace 状态。
- **Provisioner**：执行 Terraform，相当于真正去“搬桌子、接电源”的人。
- **Workspace resource**：Docker 容器、Kubernetes Pod、EC2、VM 等真实算力。
- **Coder agent**：跑在 workspace 里的连接入口，让 SSH、IDE、端口转发都能工作。

一次创建大致是：

1. 开发者点创建 workspace，或者执行 `coder create`。
2. Coder server 把请求交给 provisioner。
3. Provisioner 对模板跑类似 `terraform apply` 的流程。
4. 真实资源启动后拉起 Coder agent。
5. 开发者通过 SSH、VS Code、JetBrains 或网页进入。

## 实践案例

### 案例 1：新人十分钟拿到统一 Docker 开发环境

```bash
curl -L https://coder.com/install.sh | sh
coder server
coder templates init --id docker ./templates/docker-dev
cd ./templates/docker-dev
coder templates push docker-dev -y
coder create -t docker-dev api-dev --stop-after 8h -y
```

**逐部分解释**：

- `coder server` 在本机或服务器上启动控制面。
- `templates init --id docker` 生成官方 Docker 模板骨架。
- `templates push` 把模板发布到 Coder。
- `coder create` 从模板创建 workspace，`--stop-after 8h` 防止下班后继续烧资源。

### 案例 2：同一个 workspace 同时支持 SSH、VS Code 和 JetBrains

```hcl
resource "coder_agent" "main" {
  arch = "amd64"
  os   = "linux"
  dir  = "/home/coder/project"

  display_apps {
    vscode      = true
    ssh_helper  = true
    web_terminal = true
  }
}

module "jetbrains_gateway" {
  source   = "registry.coder.com/modules/jetbrains-gateway/coder"
  version  = "1.0.29"
  agent_id = coder_agent.main.id
  folder   = "/home/coder/project"
}
```

**逐部分解释**：

- `coder_agent` 声明这个 workspace 是 Linux amd64，并把默认目录放到项目路径。
- `display_apps` 控制界面上显示哪些入口，不想暴露的入口可以关掉。
- `jetbrains_gateway` 模块把 JetBrains Gateway 入口挂到同一个 agent 上。
- 开发者本地还可以运行 `coder config-ssh`，之后用 `coder ssh api-dev -- pnpm test` 在远端跑测试。

### 案例 3：内网团队把浏览器 IDE 做成可选参数

```hcl
data "coder_parameter" "code_server" {
  name        = "code_server"
  type        = "bool"
  default     = false
  description = "是否启动浏览器版 VS Code"
}

resource "coder_agent" "main" {
  arch = "amd64"
  os   = "linux"
  startup_script = <<-EOF
    if [ ${data.coder_parameter.code_server.value} = true ]; then
      curl -fsSL https://code-server.dev/install.sh | sh
      code-server --auth none --port 13337 >/dev/null 2>&1 &
    fi
  EOF
}
```

**逐部分解释**：

- `coder_parameter` 让创建 workspace 的表单多一个布尔选项。
- `startup_script` 根据参数决定是否安装并启动 code-server。
- `--auth none` 不是裸奔，因为外层已经由 Coder 做登录和访问控制。
- 创建时可以用 `coder create -t web-dev ui-dev --parameter code_server=true -y` 打开这个入口。

## 踩过的坑

1. **把 Coder 当在线 IDE**：它真正管理的是 workspace 生命周期，IDE 只是入口之一。
2. **模板写得太重**：每次启动都重新装大依赖，会让 workspace 变慢；应把稳定依赖烘进镜像。
3. **忘记 autostop**：没有 `--stop-after` 或模板默认 TTL，空闲环境会持续占用云资源。
4. **只保留临时资源**：源码、缓存或 home 目录如果也随停止销毁，新人会以为平台“丢文件”。

## 适用 vs 不适用场景

**适用**：

- 企业希望统一开发环境、审计访问、降低新人 onboarding 成本。
- 团队需要云上大机器、GPU、Kubernetes Pod 或内网资源，本地电脑不够用。
- 安全要求高，源码和凭据不希望散落在每个人的笔记本上。
- 平台团队已经会 Terraform，愿意把 DevBox 当基础设施维护。

**不适用**：

- 个人小项目，本地环境已经足够简单。
- 团队没有人维护模板，最后会变成“坏了没人修”的共享脚本。
- 需要极低延迟图形界面或重度本地硬件访问的开发。
- 只想要代码托管，不想管工作区生命周期。

## 历史小故事（可跳过）

- **2017 年前后**：浏览器版 VS Code 和远程开发开始流行，大家发现“编辑器可以在本地，算力可以在远端”。
- **2019 年**：Coder 团队开源 code-server，让 VS Code 能跑在服务器浏览器里。
- **2022 年**：Coder v2 把重点转向 Terraform 模板和自托管 workspace 平台。
- **2024 年以后**：企业 DevBox 和 AI coding agent 需求变强，Coder 把 agent、审计、成本控制放进同一个控制面。

## 学到什么

1. **开发环境也是基础设施**：只要能被 Terraform 描述，就能被版本化、审计和复用。
2. **入口和算力要分开看**：VS Code、JetBrains、SSH 是门；Docker、Kubernetes、VM 才是屋子。
3. **自托管的核心收益是边界可控**：源码、模型凭据、内网服务和日志都留在企业自己的基础设施里。
4. **好模板决定体验**：Coder 本身只是平台，真正让新人舒服的是模板里的镜像、脚本、参数和默认策略。

## 延伸阅读

- 官方仓库：[coder/coder](https://github.com/coder/coder)
- 官方快速开始：[Quickstart](https://coder.com/docs/tutorials/quickstart)
- 模板教程：[Write a Template from Scratch](https://coder.com/docs/tutorials/template-from-scratch)
- 生命周期说明：[Workspace Lifecycle](https://coder.com/docs/user-guides/workspace-lifecycle)
- IDE 入口：[VS Code](https://coder.com/docs/user-guides/workspace-access/vscode) 与 [JetBrains](https://coder.com/docs/user-guides/workspace-access/jetbrains)

## 关联

- [[terraform]] —— Coder 模板的核心表达语言。
- [[docker]] —— 最容易上手的 workspace 承载方式。
- [[kubernetes]] —— 企业批量 DevBox 和 GPU workspace 的常见底座。
- [[code-server]] —— 浏览器版 VS Code，是 Coder 常见 Web IDE 入口。
- [[vscodium]] —— 同属编辑器生态，帮助理解 VS Code 远程开发形态。
- [[backstage]] —— 都是平台工程工具，一个管开发门户，一个管开发环境入口。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

