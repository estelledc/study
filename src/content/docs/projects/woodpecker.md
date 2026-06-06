---
title: Woodpecker CI — Drone 闭源后社区接棒的轻量自托管 CI
来源: https://github.com/woodpecker-ci/woodpecker
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Woodpecker CI 是一个**纯开源、容器原生的轻量 CI/CD 引擎**：每个步骤跑在一个容器里，配置写在仓库根目录的 `.woodpecker.yml`，server 和 agent 双角色架构。

日常类比：

- **Jenkins** 像三层楼的中央厨房，能做任何菜，但每次开火都要先把整套设备点起来
- **GitHub Actions** 像连锁外卖平台，下单方便但厨房在别人家，菜单和食材都受平台规则约束
- **Woodpecker** 像自家阳台支起来的小灶台：树莓派都能跑（server ~100MB、agent ~30MB 空闲），不联外网也能干活，菜谱就放在你自己家冰箱门上

它的来历也是开源圈一段经典故事：2019 年 Drone CI 的母公司 Drone.io 被 Harness 收购、Drone 商业版逐渐闭源化，社区基于 Drone 最后一个 Apache 2.0 提交开了 fork，由 laszlocph 等几位维护者推动，2022 年 1.0 发布时已经独立演进，今天是 Codeberg / Forgejo 等开源 Git 生态的事实标准 CI。名字取自啄木鸟 "敲代码" 的意象。

## 为什么重要

不理解 Woodpecker，下面这些事都不太好解释：

- **小团队和个人为什么不直接用 Jenkins 或 GitHub Actions**——Jenkins 配一套上线要写 Groovy 脚本和插件清单，GitHub Actions 用得越深越被绑死在平台 runner 上；Woodpecker 是真正的 "拷一个二进制 + 写 docker-compose.yml 就能开工"
- **开源社区怎么对抗 "好软件被收购后闭源" 这件事**——Woodpecker 是社区接棒成功的范例，对照 Terraform → OpenTofu、Elasticsearch → OpenSearch 是同一类故事
- **配置即代码（pipeline as code）的最小可行形态**——一个 yaml 文件配 git 仓库 + 一个容器运行时就是完整 CI，没有数据库 schema 也没有 web admin 必填项
- **自托管 CI 与开源 Git 平台（Forgejo / Gitea / Codeberg）的捆绑生态**——这是 GitHub Actions 体系之外，开源世界保留 "全栈自主" 的关键一环

## 核心要点

Woodpecker 的架构可以拆成 **两个进程 + 一份 yaml**：

1. **Server**：监听 Git 平台（Gitea / Forgejo / GitHub / GitLab / Bitbucket）的 webhook，收到 push / PR / tag 事件后把任务排队、派发给 agent。它自己不跑构建，只调度 + 存日志 + 出 web UI。类比：调度中心。

2. **Agent**：从 server 拿任务，按 `.woodpecker.yml` 的 step 顺序，**每个 step 启一个容器、跑命令、收 stdout、销毁容器**。后端可选 Docker / Kubernetes / Local，step 之间靠一个共享 workspace 卷传文件。类比：施工队。

3. **`.woodpecker.yml`**：仓库根目录的流水线配置，每个 step 必填 `image:`（用哪个容器）和 `commands:`（在容器里跑啥）。`when:` 字段控制触发条件（事件类型、分支、tag），`secrets:` 字段引用加密变量。语法上是 Drone 1.0 的近亲，但 1.0 之后两边已经显著分化。

三个加起来：**Git 仓库管配置 + 容器管隔离 + agent 管执行** = 自托管 CI 的最简模型。

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
```

push 一次，agent 顺序起两个容器：先在 `golang:1.22` 里跑测试，再起一个新的 `golang:1.22` 跑构建。两个 step 之间共享一个 workspace 卷，所以 `build` 看得到 `test` 留下的文件，但环境变量和已装的包**不**共享——容器一销毁就清干净，下个 step 完全是新的镜像。

逐字段读一下：

- `steps:` 顶层是 step 列表，按声明顺序执行（也支持 `depends_on:` 显式拓扑）
- 每个 step 名字（`test` / `build`）是任意字符串，会显示在 web UI 的日志 tab 上
- `image:` 用什么容器跑这个 step，可以是任何 Docker Hub / 私有 registry 镜像
- `commands:` 容器启动后在里面跑的 shell 命令，按行执行，任意一行非零退出整个 step 失败

### 案例 2：在自家服务器配 Forgejo + Woodpecker 一把起

把这三个服务写进 `docker-compose.yml`：Forgejo 监听 3000，Woodpecker server 监听 8000，agent 挂宿主 `docker.sock` 来起 step 容器。Forgejo 一侧建一个 OAuth 应用，把 `client_id` / `client_secret` 注入到 Woodpecker server 的环境变量里，二者就握手成功。

`docker compose up -d` 之后去 Forgejo 建仓库、Woodpecker 里点 "Activate"，仓库一推送 Woodpecker 就能跑流水线。**整个栈完全自托管，断网也能用**——这是它和 GitHub Actions / GitLab.com 最本质的区别，也是为什么 Codeberg 这种 "拒绝美国云厂商依赖" 的开源平台会把它选为默认 CI。

### 案例 3：从 Drone 0.8 老仓库迁过来

旧团队留下来的 `.drone.yml` 不能直接拷。迁移路径大致是：

1. 文件名 `.drone.yml` → `.woodpecker.yml`
2. 顶层 `pipeline:` 段 → `steps:`
3. `secrets: [foo]` 这种缩写 → 展开成 `secrets: { foo: { from_secret: foo } }`
4. `when:` 子句的字段名和组合规则按新文档逐条对，老的 `event: [push, pull_request]` 在某些版本下要写成 `event: { include: [push, pull_request] }`
5. plugin 引用先去查目标 plugin 是否还在维护，没维护的直接用普通 `image:` + `commands:` 重写

中型团队两三天能迁完，迁完之后基本不再回头——后续新写的流水线就按 Woodpecker 的语法来。

### 案例 4：Kubernetes 里跑生产 CI

server 用社区维护的 Helm chart 装到集群里，agent 配成 `kubernetes` backend——每个 step 起一个 Pod 而不是 Docker 容器，天然多租户隔离，也直接吃掉现有 namespace 配额、NetworkPolicy、PVC 这一整套 k8s 治理体系。CPU/内存上限通过 `resources:` 字段写进 yaml，比 Docker backend 的 `--cpus` 参数好管得多。

实际部署里有两个细节常被忽略：

- workspace 卷在 k8s backend 下变成 `emptyDir` 或动态 PVC——前者快但没法跨节点，后者要 StorageClass 支持 RWX；多 step 流水线最好让 agent 把所有 step 调到同一节点
- step 容器之间的 service（如 `services:` 段里启动的 postgres / redis）在 k8s 下变成 sidecar Pod，要给 agent 服务账号加上创建 Pod / Service 的 RBAC 权限，否则 step 启动时报 forbidden

## 踩过的坑

1. **当 Drone 的 drop-in replacement 用**：网上还能搜到 "把 .drone.yml 改个名就能跑" 的老帖子。早期版本确实兼容，但 1.0 之后 `when:` 条件、`secrets:` 引用语法、plugin 字段已经显著分化，老配置直接拷过来很多字段会被静默忽略或报错。**先看官方迁移文档再动手**。

2. **仓库激活时漏装 webhook 权限**：Woodpecker 激活仓库时要去 Git 平台装 push/PR/tag webhook，需要管理员级 OAuth scope。普通成员 token 激活后界面看着成功，但 push 不触发流水线。排查路径：去 Git 平台 → 仓库 settings → webhooks → 看投递日志，多半是 401 或 403。

3. **agent 直接挂宿主 `docker.sock` 等于交出 root**：`-v /var/run/docker.sock:/var/run/docker.sock` 是教程里最常见的姿势，但等于给所有流水线 root 权限逃逸宿主——任何能改 `.woodpecker.yml` 的人都能 `docker run -v /:/host` 把宿主磁盘挂进容器。**多租户或公开仓库场景**必须改用 docker-in-docker（隔离但慢）或 Kubernetes backend（推荐）。

4. **secrets 默认对 PR 事件不可见**：默认 secret 只在 push 事件中注入，PR 事件拿不到，是为了防外部 contributor 提一个改 CI 的 PR 偷你的 token。新人以为 "secret 没生效"，跑去翻配置改半天，其实是事件类型不匹配——要在 secret 设置里**显式勾选** `pull_request` 才会注入。

5. **plugin 镜像生态比 Drone 小**：很多 Drone 时代的官方 plugin（drone-s3 / drone-slack 等）在 Woodpecker 里能跑但**不官方维护**，新版本不会及时跟进。生产链路推荐自己写一个一次性 step（直接 `image: alpine` + `commands:` 几行）而不是依赖外部 plugin 镜像，可控性高得多。

## 适用 vs 不适用场景

**适用**：

- 个人项目 / 小团队自托管 CI，配合 Forgejo / Gitea / Codeberg
- 想完全自主、不依赖任何 SaaS 厂商的 CI 流水线
- 嵌入式 / 边缘设备 / 内网环境（树莓派、隔离实验室、私有数据中心）
- Drone 老用户从闭源版迁出
- Kubernetes 集群里需要多租户隔离的中等规模 CI

**不适用**：

- 团队已经深度绑定 GitHub 且不打算自建 → GitHub Actions 更省事
- 需要复杂可视化流水线编排、人工审批门、跨组合规审计 → 用 Jenkins / Tekton / 商业 CI
- 完全不接受 Docker 概念 / 没有容器运行时的环境 → Woodpecker 的核心模型就跑不起来

## 学到什么

1. **CI 的本质就是 "事件触发的脚本调度器"**——剥掉 web UI 和插件市场，剩下的就是 webhook + yaml + 容器，Woodpecker 把这三者的最小可用版做到极致
2. **开源社区可以接住 "被收购后闭源" 的项目**——前提是有几个核心维护者愿意长期投入，并且原项目的 license 还在 Apache/MIT 这一档允许 fork。Woodpecker 与 OpenTofu、OpenSearch 是同一类故事的不同样本
3. **轻量自托管的价值在边缘**——小团队、嵌入式、内网、教学环境，这些场景永远不会被 SaaS CI 覆盖好，是开源 CI 的长期生态位
4. **配置语法的兼容性会随时间分化**——fork 出来的项目刚开始可能宣称兼容，半年到一年后就要做出独立判断；用户要把迁移成本提前算进决策
5. **每个 step 一个容器** 这件事比想象中更重要——它把 "环境是否被污染" 这个 CI 维护里最痛的问题从根上解决了，剩下的复杂度（缓存、跨 step 数据传递）都是可以工程化的小问题

## 延伸阅读

- 官方文档：[woodpecker-ci.org/docs](https://woodpecker-ci.org/docs)（部署、yaml 语法、迁移指南）
- 仓库：[github.com/woodpecker-ci/woodpecker](https://github.com/woodpecker-ci/woodpecker)
- 来龙去脉：[Why we forked Drone](https://woodpecker-ci.org/blog)（社区博客里有 fork 当时的讨论与设计取舍）
- [[drone]] —— Woodpecker 的上游，理解二者差异从 Drone 看起最快
- [[earthly]] —— 另一种 "构建即容器" 的思路，把 CI 流水线写成 Earthfile 而不是 yaml
- [[github-actions]] —— SaaS 阵营对照组，对比 "厂商托管 vs 自托管" 的取舍
- [[actions-runner-controller]] —— 想留在 GitHub Actions 又自托管 runner 时的方案
- [[argocd]] —— CD 一侧的对照，专注 "把 Git 状态同步到 k8s 集群"
- [[docker]] —— 每个 step 跑在容器里的底层
- [[kubernetes]] —— Woodpecker 的 k8s backend 落地于此
- [[helm]] —— 部署 Woodpecker 到 k8s 集群的常用工具
- [[podman]] —— 替代 Docker 的容器运行时（在 daemonless 场景里有用）
- [[nomad]] —— 更轻的调度器，与 Woodpecker 同属 "拒绝重平台" 的开源工具谱系

## 关联

- [[drone]] —— 直接上游，Woodpecker 是它闭源后的社区分叉
- [[earthly]] —— 同期出现的 "容器化构建" 工具，理念相近但形态不同（DSL 而非 yaml）
- [[github-actions]] —— 主流 SaaS CI，对比能看清自托管与托管的边界
- [[docker]] —— 每个 step 起一个容器，Docker 是默认 runtime
- [[kubernetes]] —— 生产场景下推荐的 agent backend
