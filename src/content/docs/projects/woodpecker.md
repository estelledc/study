---
title: Woodpecker CI — Drone 闭源后社区接棒的轻量自托管 CI
来源: https://github.com/woodpecker-ci/woodpecker
日期: 2026-05-31
分类: DevOps / CI/CD
难度: 中级
---

## 是什么

Woodpecker CI 是一个**纯开源、容器原生的轻量 CI/CD 引擎**：每个步骤跑在一个容器里，配置写在仓库根目录的 `.woodpecker.yml`，server 和 agent 双角色架构。

日常类比：

- **Jenkins** 像三层楼的中央厨房，能做任何菜，但每次开火都要先把整套设备点起来
- **GitHub Actions** 像连锁外卖平台，下单方便但厨房在别人家，菜单和食材都受平台规则约束
- **Woodpecker** 像自家阳台支起来的小灶台：树莓派都能跑（server ~100MB、agent ~30MB 空闲），不联外网也能干活，菜谱就放在你自己家冰箱门上

它来自开源圈一段经典故事：2019 年 Drone CI 被 Harness 收购后商业版逐渐闭源，社区基于最后一个 Apache 2.0 提交 fork，2022 年 1.0 独立发布。今天它是 Codeberg / Forgejo 等开源 Git 平台上很常见的默认 CI 选择。名字取自啄木鸟"敲代码"的意象。

## 为什么重要

不理解 Woodpecker，下面这些事都不太好解释：

- **小团队和个人为什么不直接用 Jenkins 或 GitHub Actions**——Jenkins 配一套上线要写 Groovy 和插件清单，GitHub Actions 用得越深越绑在平台 runner 上；Woodpecker 是"拷二进制 + 写 docker-compose.yml 就能开工"
- **开源社区怎么对抗"好软件被收购后闭源"**——Woodpecker 是社区接棒范例，对照 Terraform → OpenTofu、Elasticsearch → OpenSearch
- **配置即代码的最小可行形态**——一份 yaml + Git 仓库 + 容器运行时就是完整 CI；server 仍用 SQLite/Postgres 存构建记录，但你几乎不用手写 schema 或填一堆 web 必填项
- **自托管 CI 与 Forgejo / Gitea / Codeberg 的捆绑生态**——这是 GitHub Actions 之外，开源世界保留"全栈自主"的关键一环

## 核心要点

Woodpecker 的架构可以拆成 **两个进程 + 一份 yaml**：

1. **Server**：监听 Git 平台（Gitea / Forgejo / GitHub / GitLab / Bitbucket）的 webhook（仓库一有 push/PR，平台就打电话通知 CI）。它自己不跑构建，只调度、存日志、出 web UI。类比：调度中心。

2. **Agent**：从 server 拿任务，按 `.woodpecker.yml` 的 step 顺序，**每个 step 启一个容器、跑命令、收 stdout、销毁容器**。后端可选 Docker / Kubernetes / Local，step 之间靠共享 workspace 卷传文件。类比：施工队。

3. **`.woodpecker.yml`**：每个 step 必填 `image:`（用哪个容器）和 `commands:`（跑啥）。`when:` 控制触发条件，`secrets:` 引用加密变量。语法是 Drone 1.0 近亲，但两边已显著分化。

三个加起来：**Git 管配置 + 容器管隔离 + agent 管执行** = 自托管 CI 的最简模型。

## 实践案例

### 案例 1：最小 `.woodpecker.yml`

```yaml
steps:
  test:
    image: golang:1.22
    commands:
      - go test ./...
  build:
    image: golang:1.22
    commands:
      - go build -o app ./cmd/server
    secrets: [ docker_password ]
```

push 一次，agent 顺序起两个容器：先测再编。两个 step 共享 workspace 卷，所以文件能传下去，但环境变量和已装包**不**共享——容器一销毁就清干净。

逐字段读：

- `steps:` 按声明顺序执行（也可用 `depends_on:` 显式拓扑）
- step 名字（`test` / `build`）会显示在 web UI 日志 tab
- `image:` 可以是任何 Docker Hub / 私有 registry 镜像
- `commands:` 按行执行，任一行非零退出则 step 失败
- `secrets:` 从 server 注入加密变量；默认只在 push 事件可见（见踩坑）

### 案例 2：Forgejo + Woodpecker 一把起

最小 `docker-compose.yml` 骨架：

```yaml
services:
  forgejo:
    image: codeberg.org/forgejo/forgejo:8
    ports: ["3000:3000"]
  woodpecker-server:
    image: woodpeckerci/woodpecker-server:v2
    ports: ["8000:8000"]
    environment:
      WOODPECKER_OPEN: "true"
      WOODPECKER_HOST: http://localhost:8000
      WOODPECKER_GITEA: "true"
      WOODPECKER_GITEA_URL: http://forgejo:3000
      WOODPECKER_GITEA_CLIENT: ${OAUTH_CLIENT_ID}
      WOODPECKER_GITEA_SECRET: ${OAUTH_CLIENT_SECRET}
  woodpecker-agent:
    image: woodpeckerci/woodpecker-agent:v2
    volumes: ["/var/run/docker.sock:/var/run/docker.sock"]
    environment:
      WOODPECKER_SERVER: woodpecker-server:9000
```

按这三步跟做：

1. 在 Forgejo 建 OAuth 应用（像给 CI 发一张门禁卡：`client_id` / `client_secret`），写入环境变量
2. `docker compose up -d`，打开 Woodpecker UI，用 Forgejo 账号登录
3. 建仓库 → 点 Activate → push，流水线就会跑

**整个栈可完全自托管，断网也能用**——这也是 Codeberg 选它作默认 CI 的原因。

### 案例 3：从 Drone 0.8 老仓库迁过来

1. 文件名 `.drone.yml` → `.woodpecker.yml`
2. 顶层 `pipeline:` → `steps:`
3. `secrets: [foo]` 缩写 → `secrets: { foo: { from_secret: foo } }`
4. `when:` 字段按新文档核对；老的 `event: [push, pull_request]` 有时要写成 `event: { include: [...] }`
5. plugin 先查是否还在维护；没有就改成普通 `image:` + `commands:`

中型团队两三天能迁完；之后新流水线直接按 Woodpecker 语法写。

## 踩过的坑

1. **当 Drone drop-in 用**：1.0 后 `when:` / `secrets:` / plugin 已分化，老配置常被静默忽略——先看官方迁移文档。
2. **激活仓库漏 webhook 权限**：需要管理员级 OAuth scope；普通成员看似成功但 push 不触发——去 Git 平台 webhooks 投递日志查 401/403。
3. **挂宿主 `docker.sock` 等于交 root**：任何能改 yaml 的人都能 `docker run -v /:/host` 逃逸；多租户/公开仓改用 docker-in-docker 或 Kubernetes backend。
4. **secrets 默认对 PR 不可见**：防外部 contributor 偷 token；要在 secret 设置里显式勾选 `pull_request` 才会注入。

## 适用 vs 不适用场景

**适用**：

- 个人 / 小团队自托管 CI，配合 Forgejo / Gitea / Codeberg（单机到几十人规模）
- 要完全自主、不依赖 SaaS 的流水线；嵌入式 / 内网 / 树莓派
- Drone 老用户从闭源版迁出；k8s 里需要多租户隔离的中等规模 CI

**不适用**：

- 已深度绑定 GitHub 且不打算自建 → GitHub Actions 更省事
- 要复杂可视化编排、人工审批门、跨组合规审计 → Jenkins / Tekton / 商业 CI
- 完全没有容器运行时 → Woodpecker 的核心模型跑不起来

## 历史小故事（可跳过）

- **2014–2019**：Drone CI 以轻量容器流水线走红，配置即代码成为卖点
- **2019**：Drone.io 被 Harness 收购，商业版逐步闭源，社区开始讨论 fork
- **2019–2021**：laszlocph 等维护者基于最后一个 Apache 2.0 提交建 Woodpecker，语法先兼容再独立
- **2022-01**：Woodpecker 1.0 发布，与 Drone 分道扬镳；随后成为 Codeberg 等平台的常用 CI

## 学到什么

1. **CI 本质是"事件触发的脚本调度器"**——剥掉 UI 和插件市场，剩下 webhook + yaml + 容器
2. **开源社区可以接住被收购后闭源的项目**——前提是核心维护者长期投入，且原 license 允许 fork
3. **轻量自托管的价值在边缘**——小团队、内网、教学场景，SaaS CI 覆盖不好的地方
4. **每个 step 一个容器** 从根上解决环境污染；缓存与跨 step 传文件是可工程化的小问题

## 延伸阅读

- 官方文档：[woodpecker-ci.org/docs](https://woodpecker-ci.org/docs)（部署、yaml、迁移）
- 仓库：[github.com/woodpecker-ci/woodpecker](https://github.com/woodpecker-ci/woodpecker)
- 来龙去脉：[Why we forked Drone](https://woodpecker-ci.org/blog)（fork 当时的讨论）
- [[drone]] —— 上游；理解差异从 Drone 看起最快
- [[github-actions]] —— SaaS 对照组：厂商托管 vs 自托管
- [[kubernetes]] —— 生产场景推荐的 agent backend

## 关联

- [[drone]] —— 直接上游，Woodpecker 是闭源后的社区分叉
- [[earthly]] —— 同期"容器化构建"工具，DSL 而非 yaml
- [[github-actions]] —— 主流 SaaS CI，对比自托管边界
- [[docker]] —— 每个 step 起一个容器的默认 runtime
- [[kubernetes]] —— 生产场景下推荐的 agent backend
- [[forgejo]] —— 常与 Woodpecker 搭配的自托管 Git 平台
- [[helm]] —— 把 Woodpecker 装进 k8s 集群的常用工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
