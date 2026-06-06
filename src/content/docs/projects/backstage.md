---
title: Backstage — 把公司散在各处的开发工具拼成一个门户
来源: https://github.com/backstage/backstage
日期: 2026-06-01
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Backstage 是一个**开发者门户（Developer Portal）**框架，目标是把一家公司里分散的开发工具入口拼成一个网站。

日常类比：像公司前台。新员工进门先到前台，前台告诉你 财务在 3 楼、HR 在 5 楼、打印机在茶水间。开发者每天也要去十几个 工具楼层：CI 在 Jenkins、监控在 Grafana、文档在 Confluence、报警在 PagerDuty、服务图在某个 wiki。Backstage 就是给这些楼层做一个统一前台。

它由 Spotify 2016 年内部启动，2020 年 3 月开源，2022 年捐给 CNCF（云原生基金会），目前 30k stars，进 Incubating 阶段。

## 为什么重要

不理解 Backstage，下面这些事都看不懂：

- 为什么 2023 年起冒出大量 Platform Engineering / IDP（Internal Developer Platform）岗位
- 为什么 American Airlines、Expedia、HBO、Netflix、Splunk、Zalando、LinkedIn、Uber 都在自己的内网部署它
- 为什么 谁负责这个服务、它依赖什么、出问题找谁 这种问题，过去靠 wiki 加口口相传，现在能 SQL 查询
- 对零基础学习者：第一次能直观看到 大公司的开发工具是怎么拼起来的

## 核心要点

Backstage 的核心抽象只有 **5 个**，理解了就懂一大半：

1. **Software Catalog（软件目录）**：每个服务、库、数据源、团队、域，都在 git 仓库里放一个 `catalog-info.yaml`。Backstage 把这些 yaml 收集起来变成可查询的元数据库。

2. **Entity Model（实体模型）**：Catalog 里的东西分 7 类——Component（服务、库）/ API / Resource（数据库、消息队列）/ System（多个 Component 组成的业务系统）/ Domain（多个 System 组成的业务域）/ User / Group。彼此之间的 owns / dependsOn 关系可以画成图。

3. **Software Templates（脚手架）**：cookiecutter 思路。新建项目时选一个模板（比如 Node.js 微服务），Backstage 一键生成 repo、CI 配置、监控接入、文档骨架。

4. **TechDocs**：把 Markdown 文档放在代码仓库里（docs-as-code），Backstage 自动 build 成网站，文档跟代码同仓同步。

5. **Plugins（插件）**：前端 React 插件 + 后端 Node 插件。官方提供 ArgoCD、GitHub Actions、Jenkins、PagerDuty、Sentry、K8s 等接入；社区插件 150+。

## 实践案例

### 案例 1：catalog-info.yaml 长什么样

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: order-service
  description: 订单核心服务
spec:
  type: service
  lifecycle: production
  owner: team-checkout
  system: ecommerce
  dependsOn:
    - resource:default/orders-db
    - api:default/payment-api
```

每个服务在 repo 根目录放这么一份。Backstage 定时扫描所有 repo，把这些 yaml 拼成一张全公司的 服务地图。

### 案例 2：开发者一天的流程

早上打开 Backstage 首页：
- 上方搜索框：输入 order，跳到 order-service 详情
- 详情页左侧：CI 状态（GitHub Actions 拉过来的）、最近一次部署（ArgoCD 拉过来的）、错误率（Sentry 拉过来的）
- 详情页右侧：On-call 是谁（PagerDuty 拉过来的）、文档（TechDocs build 出来的）、依赖图（Catalog 算出来的）

**核心价值**：信息没有搬家，只是入口统一了。

### 案例 3：新建项目用 Software Template

点 Create，选 Node.js Microservice 模板，填名字 `coupon-service` 和 owner `team-promo`：

Backstage 在后台 30 秒内做完：
1. 在 GitHub 创建仓库 `coupon-service`
2. 写好 Dockerfile、CI 配置、`catalog-info.yaml`、TechDocs 骨架
3. 在 Catalog 里登记这个 Component
4. 把 owner 设为 `team-promo`
5. 给一个跑得起来的 Hello World

过去这一套要新人翻 3 篇 wiki、问 2 个人，现在 30 秒。

## 技术栈速览

```
前端：React 18 + TypeScript + Material UI
后端：Node.js + Express + Knex（SQL 抽象层）
存储：PostgreSQL（也支持 SQLite，仅本地开发）
Monorepo：Lerna + Yarn workspaces
仓库规模：200+ 个 npm 包，社区插件 150+
```

零前端基础读不懂代码很正常，**先理解抽象、再看插件示例**比从 main 入口硬啃高效得多。

## 踩过的坑

1. **学习曲线陡**：写一个 Plugin = React 组件 + 自定义 API + Backstage 内部 hook，零前端经验上手会迷失在 props/context/route 里。建议先跑通官方 hello-world plugin，再改东西。

2. **自己 host 维护成本不低**：PostgreSQL 备份、各插件凭据轮换、升级时 monorepo 兼容性，这些事一个 IDP 团队需要 2-3 个全职工程师维护。

3. **Catalog 质量取决于团队纪律**：`catalog-info.yaml` 靠人手填。半年后没人维护就成了僵尸条目——服务都下线了 yaml 还在，或者 owner 换了 team 没改。需要工具反向校验（比如 GitHub repo 与 catalog 双向对账）。

4. **Spotify 内部 Backstage ≠ 开源 Backstage**：开源版是 Spotify 内部版的子集。商业 SaaS 版（Spotify Portal）2024 年推出，含一些内部独有插件——但作为初学者，开源版完全够用。

5. **插件升级常断**：Backstage 大版本经常调整 plugin API，社区插件维护跟不上。生产部署建议锁版本，别 latest。

## 适用 vs 不适用场景

**适用**：
- 有 50+ 服务的公司，开发者每天要在 5+ 工具间跳转
- 已经在做 Platform Engineering / 想搭 IDP
- 团队有 React + Node 开发能力，能写或改插件

**不适用**：
- 服务总数 < 20，用 wiki + Slack 列表更轻
- 没有专人维护——会很快变僵尸网站
- 想 0 代码搞定 → 看 Port（无代码 IDP）或 Roadie（Backstage 托管 SaaS）

## 替代品

- **Cortex / OpsLevel**：商业 SaaS，开箱即用但不开源
- **Port**：无代码 IDP，配置驱动，适合不想写 React 的团队
- **Roadie**：Backstage 的托管 SaaS（基于 Backstage 商业化）

## 学到什么

1. **门户的价值不在功能，在统一入口**——CI、监控、文档原地不动，只是入口收拢
2. **元数据是基础设施**：把 谁拥有、依赖什么、生命周期 沉淀成 yaml，比 wiki 更可查询、更可校验
3. **Platform Engineering 的核心抽象是 Catalog + Templates**：前者解决 这是什么、谁的，后者解决 怎么开始
4. **开源捐给基金会才能活下去**：Spotify 单家公司养不起一个全行业框架，CNCF 的中立性让 American Airlines、Netflix 这些原本不会用 Spotify 工具的公司敢深度依赖

## 延伸阅读

- 官方文档：[backstage.io](https://backstage.io)（先读 Getting Started 跑通本地）
- 仓库：[github.com/backstage/backstage](https://github.com/backstage/backstage)
- Spotify 工程博客：[What the heck is a developer portal anyway](https://engineering.atspotify.com/2020/04/what-the-heck-is-backstage-anyway/)（2020 开源时的官宣）
- CNCF Landscape：[Platform Engineering 类目](https://landscape.cncf.io/)（看 Backstage 的同行们）
- [[argocd]] —— GitOps 部署，Backstage 最常接的插件之一
- [[grafana]] —— 监控仪表盘，Backstage 里嵌 iframe 显示

## 关联

- [[argocd]] —— Backstage 的 ArgoCD 插件把部署状态拉进详情页
- [[kubernetes]] —— Backstage 原生支持 K8s 资源视图（Pod / Deployment 一键查看）
- [[jenkins]] —— 老牌 CI，Backstage 插件可拉取构建历史
- [[helm]] —— K8s 包管理，与 Software Templates 思路接近（模板化部署）
- [[opentelemetry]] —— 可观测标准，Backstage 监控插件常对接

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[grafana]] —— Grafana — 监控可视化看板
- [[helm]] —— Helm — Kubernetes 包管理器
- [[jenkins]] —— Jenkins — 老牌开源 CI 服务器
- [[kubernetes]] —— Kubernetes — 容器编排平台

