---
title: Backstage — Spotify 的内部开发者门户如何变成开源的「开发工具前台」
来源: https://backstage.io/blog/2020/03/16/announcing-backstage/
日期: 2026-06-13
子分类: 工程文化
分类: 其他
provenance: pipeline-v3
---

## 先想成什么事

想象你刚入职一家**大型连锁酒店集团**（这就是 Spotify 规模下的工程组织）：

- **客房部**管入住退房（业务微服务）
- **工程部**管水电空调（Kubernetes、数据库）
- **安保**管监控门禁（可观测、权限）
- **培训部**管新人手册（文档、onboarding）
- 每个部门都有自己的**内部电话分机、纸质表格、独立 App**——没人能一张图说清「这家酒店到底有多少栋楼、哪栋楼谁负责、坏了找谁」。

新服务员（新工程师）第一天最常问的三句话：

1. 「我要改的那个服务在哪？」
2. 「谁拥有它？依赖什么？」
3. 「从空仓库到能跑起来，要走哪套流程？」

传统答案是：问 Slack、翻 Confluence、收藏十几个书签。Spotify 在 2016 年前后意识到：**工具越来越多，开发者花在「找工具」上的时间也在涨**。于是他们做了 **Backstage**——一个统一的**内部开发者门户（Internal Developer Portal, IDP）**，把目录、脚手架、文档、监控、CI 等能力收进**同一套 UI**。

2020 年 3 月 16 日，Spotify 在官方博客 [Announcing Backstage](https://backstage.io/blog/2020/03/16/announcing-backstage/) 宣布把这套系统**开源**。这不是又一个 CI 或监控产品，而是**盖在现有工具之上的「体验层」**——像酒店大堂的前台：各楼层系统不动，但客人永远知道先去哪问。

## 这篇「发布」在说什么

| 维度 | 内容 |
|------|------|
| 发布方 | Spotify Engineering |
| 时间 | 2020-03-16 开源宣布；2020-09 进入 CNCF Sandbox |
| 定位 | 开源的 **Developer Portal 框架**，围绕中心化 **Software Catalog** |
| Spotify 内部成效（博客数据） | 工程师 onboarding 到第 10 个 PR 的时间 **缩短 55%**；280+ 团队管理 2000+ 后端服务、300+ 网站、4000+ 数据 pipeline、200+ 移动特性 |
| 开源版初期形态 | 可扩展的前端平台 + 逐步补齐 Catalog / Templates / TechDocs；**不是** Spotify 内部 120+ 插件的完整拷贝 |

博客用三阶段描述路线图（对理解「先有什么、后补什么」很重要）：

1. **Phase 1 — 可扩展前端平台（当时已有）**：统一 UI/UX，用可复用组件把 Jenkins、K8s、文档站等「拼」进同一界面。
2. **Phase 2 — 管理你的软件资产（随后 2–3 个月）**：Software Catalog 成为中心——创建库、看 K8s 部署状态、查网站测试覆盖率，都在一个门户里完成。
3. **Phase 3 — 生态（更长期）**：通过开源插件市场，让每家公司按自己的技术栈选配集成——「Kubernetes 之于基础设施」类比为「Backstage 之于开发者体验」。

## 为什么值得学（零基础图景）

如果你只听过 DevOps 工具名（Jenkins、Grafana、Argo CD……）却没见过**平台工程（Platform Engineering）**怎么落地，Backstage 是一个极好的**解剖标本**：

- 它回答的不是「怎么写代码」，而是**组织变大后，开发者如何不被工具碎片淹没**。
- 它把「服务是谁的、在哪、依赖谁」从 wiki 搬进**可查询的目录（Catalog）**。
- 它把「新建项目」从「问老员工 + 抄三个仓库」变成 **Software Templates（脚手架）** 的一键流程。
- 它把「文档在 Confluence 里腐烂」变成 **TechDocs（docs-like-code）**——Markdown 跟代码同仓，门户里统一渲染。

2023 年后的 DORA 报告、大量公司的 IDP 岗位潮，都和这类「**把内部开发者当产品用户**」的思路同频。Backstage 是这条路上**最早被大规模验证的开源实现之一**。

与仓库内其他条目的关系：

- [[dora-state-of-devops-2023]] —— 用数据说明「用户中心 + 平台能力」与交付绩效的关联；Backstage 是平台能力的**一种具体产品形态**。
- [[chaos-engineering-netflix-2016]] —— Netflix 用实验验证分布式可靠性；Backstage 用目录 + 门户解决**认知与协作可靠性**（找对人、找对服务）。
- [[projects/backstage]] —— 本仓库对 Backstage **项目本身**的速览；本篇侧重 **2020 官宣语境与概念起源**。

## 核心概念

### 1. Developer Portal（开发者门户）≠ 又一个 DevOps 工具

门户**不替代** CI、监控、Git、K8s；它提供：

- **统一入口**：一个域名、一套导航、一种搜索体验。
- **上下文聚合**：打开 `order-service` 详情页，同时看到 CI 状态、最近部署、on-call、文档、依赖图——数据仍来自各工具，只是**视图合并**。
- **一致交互**：学会创建一种组件，就学会创建所有模板化的组件（Spotify 工程博客强调的 UX 复利）。

日常类比：手机上的「控制中心」不发电、不送网，但把 Wi‑Fi、蓝牙、亮度、勿扰收在一个面板里——**减少切换成本**。

### 2. Software Catalog（软件目录）—— 全公司的「服务户籍册」

Catalog 是 Backstage 的**心脏**。每个软件资产（微服务、网站、库、数据 pipeline、ML 模型等）用一份**实体描述符**登记，通常放在仓库根的 `catalog-info.yaml`。

实体有固定「信封」结构：`apiVersion`、`kind`、`metadata`、`spec`。常见 `kind` 包括：

| Kind | 含义（简化） |
|------|----------------|
| `Component` | 可部署或可消费的软件单元（service、website、library…） |
| `API` | 对外/对内 API 定义（常挂 OpenAPI） |
| `Resource` | 数据库、队列、存储等基础设施资源 |
| `System` | 多个 Component 组成的业务系统 |
| `Domain` | 更高层的业务域 |
| `User` / `Group` | 人员与团队（常从 HR / GitHub 同步） |

关系字段（如 `dependsOn`、`owner`）让 Catalog 不只是一张表，而是**可画图谱的图数据库**——「这个服务挂了会影响谁」第一次可以机器回答。

### 3. Software Templates（软件模板 / Scaffolder）—— 黄金路径按钮

2020 年 8 月，Backstage 宣布 [Software Templates](https://backstage.io/blog/2020/08/05/announcing-backstage-software-templates/)：开发者选模板 → 填几个字段 → 自动创建仓库、跑首构建、写入 Catalog。

价值在于**标准化与自治的平衡**：

- 团队仍可快速开工（自治）
- 语言、CI、监控接入、目录登记在模板里写死（标准）
- Spotify 内部形容为「几次点击就能在 GKE 上跑 Hello World 微服务」

### 4. TechDocs —— 文档跟代码走

Spotify 采用 **docs-like-code**：Markdown 放在仓库 `docs/`，CI 用 MkDocs 构建，Backstage 插件集中展示。解决的是「文档链接在 wiki 里指向已删除的分支」这类经典腐烂问题。

### 5. Plugins（插件）—— 门户的「App Store」

Backstage 前后端都插件化。Spotify **内部**曾有 100+ 集成；开源社区后续发展出 Plugin Marketplace。写一个 React 前端插件 +（可选）Node 后端插件，就能把专有系统接进统一 UI。博客标题 *As simple as writing a plugin* 指的就是这种扩展方式。

### 6. 架构一眼（零基础版）

```
开发者浏览器
    ↓
Backstage 前端 (React) —— 各功能由 Plugin 组成
    ↓
Backstage 后端 (Node) —— Catalog API、Scaffolder、权限、集成
    ↓
PostgreSQL（Catalog 实体存储）+ 外部系统（GitHub、K8s、CI…）
```

你不需要先会 React 才能理解 Backstage；先记住：**Catalog 存元数据，Plugin 拉实时状态，Template 造新仓库**。

## 代码示例

### 示例 1：在仓库里登记一个 Component（`catalog-info.yaml`）

这是 Backstage 最常见的「户籍本」文件，通常放在服务仓库根目录，由 Catalog 定期扫描或通过 `Location` 注册：

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: playlist-api
  description: 为用户生成个性化歌单的 REST 服务
  tags:
    - java
    - rest
  annotations:
  # 插件常通过 annotation 关联外部系统（示例键名因插件而异）
    github.com/project-slug: spotify/playlist-api
    backstage.io/techdocs-ref: dir:.
spec:
  type: service
  lifecycle: production
  owner: group:default/audio-platform
  system: listening-experience
  dependsOn:
    - resource:default/playlist-db
    - api:default/recommendation-api
```

要点：

- `metadata.name` 是机器引用用的稳定 ID；`owner` 指向 Catalog 里的 `Group`，方便找 on-call 与权限。
- `dependsOn` 声明依赖后，门户可画依赖图、做影响分析——**前提是团队愿意维护 yaml**（这也是落地难点）。

### 示例 2：注册一批 Catalog 实体（`app-config.yaml` 片段）

本地或公司实例通过 `catalog.locations` 告诉后端「去哪里读 yaml」：

```yaml
app:
  title: Acme Developer Portal
  baseUrl: http://localhost:3000

backend:
  baseUrl: http://localhost:7007

catalog:
  locations:
    # 从 GitHub 组织拉取所有 catalog-info.yaml
    - type: url
      target: https://github.com/acme-corp/services/blob/main/catalog/all.yaml
    # 本地示例实体（开发用）
    - type: file
      target: ../../examples/entities.yaml
```

`all.yaml` 可以是 `Location` 列表，指向各仓库的 `catalog-info.yaml`——**目录是联邦式的**，不要求所有元数据挤在一个大文件里。

### 示例 3：Software Template 定义骨架（`template.yaml`）

模板描述「创建时问用户什么」以及「后台执行哪些步骤」（常用 [Cookiecutter](https://cookiecutter.readthedocs.io/) + 发布到 Git + 注册 Catalog）：

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: node-microservice
  title: Node.js 微服务（公司黄金路径）
  description: 创建带 CI、Dockerfile、catalog-info 的新服务仓库
spec:
  owner: group:default/platform-team
  type: service

  parameters:
    - title: 基本信息
      required:
        - name
        - owner
      properties:
        name:
          title: 服务名
          type: string
          pattern: '^[a-z0-9-]+$'
        owner:
          title: 负责团队
          type: string
          ui:field: OwnerPicker

  steps:
    - id: fetch
      name: 拉取模板骨架
      action: fetch:template
      input:
        url: ./skeleton
        values:
          name: ${{ parameters.name }}
          owner: ${{ parameters.owner }}

    - id: publish
      name: 发布到 GitHub
      action: publish:github
      input:
        repoUrl: github.com?owner=acme-corp&repo=${{ parameters.name }}

    - id: register
      name: 写入 Software Catalog
      action: catalog:register
      input:
        repoContentsUrl: ${{ steps.publish.output.repoContentsUrl }}
        catalogInfoPath: /catalog-info.yaml

  output:
    links:
      - title: 在 Catalog 中打开
        url: ${{ steps.register.output.entityRef }}
```

开发者在前端 `/create` 选这个模板，填 `name` 和 `owner`，后台按 `steps` 顺序执行——**组织最佳实践被编码进模板**，而不是写在 wiki 第 17 页。

### 示例 4：最小前端插件（概念代码）

插件是「把外部系统 UI 嵌进 Backstage」的标准方式。下面是一个只展示某服务 CI 状态的极简 React 插件轮廓（真实项目还需 `createPlugin`、路由注册等样板）：

```tsx
import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard } from '@backstage/core-components';

export const CiStatusCard = () => {
  const { entity } = useEntity();
  const slug = entity.metadata.annotations?.['github.com/project-slug'];

  // 真实实现会调用 backend 插件去 GitHub API 取数据
  const status = slug ? 'passed' : 'unknown';

  return (
    <InfoCard title="CI 状态">
      <p>仓库 {slug ?? '未配置 annotation'}：{status}</p>
    </InfoCard>
  );
};
```

`useEntity()` 说明插件运行在 **Catalog 实体详情页的上下文里**——这就是为什么先登记 `catalog-info.yaml` 再谈集成：门户需要知道「当前在看哪个服务」。

## Spotify 内部 vs 2020 开源版：别混淆

官宣博客特意强调：内部 Backstage 已演进约四年，**开源首版是「有潜力的壳」**，不是 Spotify 内网的完整克隆。

| 维度 | Spotify 内部（2020 前后） | 开源版（2020 起） |
|------|---------------------------|-------------------|
| 插件数量 | 100+ / 后增至 120+ | 需自行安装社区或自研插件 |
| 模板 | 深度集成 GHE、Jenkins、GKE 等 | 提供示例，需按自己栈改造 |
| 目标 | 服务 Spotify 工程师 | 让**任何公司**能搭建自己的门户 |

理解这一点，就不会抱怨「为什么装完开源 Backstage 没有监控页」——**门户框架给你，具体内容要你或社区用插件填满**。

## 落地时要记住的坑

1. **Catalog 质量 = 组织纪律**：yaml 不更新，门户会展示僵尸服务；需要治理（CI 校验、对账、owner 轮换流程）。
2. **不是小团队的银弹**：服务 < 20、工具 < 5 时，维护门户的固定成本可能高于收益。
3. **插件与版本升级**：Backstage monorepo 大版本升级常波及插件 API，生产环境宜锁版本、分批升级。
4. **成功指标要业务化**：Spotify 用「到第 10 个 PR 的时间」衡量 onboarding——你也可以定义「新服务从创建到首次生产部署的时长」等可观测指标，而不是「门户 PV」。

## 时间线（便于记忆）

| 时间 | 事件 |
|------|------|
| ~2016 | Spotify 内部开始建设开发者门户雏形 |
| 2018 | 内部 Backstage 成型，工程师自发采用 |
| 2020-03-16 | 开源宣布（本篇来源博客） |
| 2020-08 | Software Templates 功能发布 |
| 2020-09 | 进入 CNCF Sandbox |
| 2021+ | Catalog、TechDocs、K8s 插件等逐步 beta/GA；社区与商业托管（如 Roadie）兴起 |
| 2022 | 晋升 CNCF Incubating |

## 学到什么（零基础带走的 4 句话）

1. **Backstage 解决的是「认知与协作税」**，不是替代你的 CI/CD。
2. **Software Catalog 把「谁拥有、依赖谁」变成数据**，是平台工程的地基。
3. **Templates 把组织标准executable 化**，比 wiki 更难被绕过。
4. **插件化让门户可长成你想要的样子**——Spotify 开源的是「盖楼框架」，不是「精装样板间」。

## 延伸阅读

- 官宣原文：[Announcing Backstage](https://backstage.io/blog/2020/03/16/announcing-backstage/)
- Spotify 工程博客：[What the heck is Backstage anyway?](https://engineering.atspotify.com/2020/03/what-the-heck-is-backstage-anyway)
- 软件目录描述符：[Descriptor Format](https://backstage.io/docs/features/software-catalog/descriptor-format)
- 模板功能：[Announcing Backstage Software Templates](https://backstage.io/blog/2020/08/05/announcing-backstage-software-templates/)
- 仓库内项目速览：[[projects/backstage]]
- 关联工具：[[kubernetes]]、[[jenkins]]、[[grafana]]、[[argocd]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
