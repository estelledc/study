---
title: DORA State of DevOps Report 2023 — 用「餐厅经营」读懂软件交付科学
来源: https://services.google.com/fh/files/misc/2023_state_of_devops_report.pdf
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

## 先想成什么事

想象你经营一家**连锁餐厅**（这就是一家持续交付软件的公司）：

- **后厨**是开发团队：不断研发新菜、改配方、换供应商。
- **前厅**是运维/SRE：要保证每桌菜热、上菜快、不出食品安全事故。
- **顾客**是最终用户：他们不在乎你用了什么烤箱，只在乎「点的菜对不对、好不好吃、等多久」。

很多团队像只盯着后厨 KPI 的店长：今天出菜 200 份、换菜单 12 次、烤箱利用率 87%——数字很漂亮，但顾客抱怨「菜不对胃口」「等了一个小时」。**DORA 2023 报告的核心转向**就是：别只优化「出菜速度」，要问**顾客到底想吃什么**。

《Accelerate State of DevOps Report 2023》由 Google 旗下的 **DORA**（DevOps Research and Assessment）发布，基于 **36,000+** 名全球从业者的九年纵向调查，是软件交付领域规模最大、历时最长的实证研究之一。2023 版不再只讲「四个指标」，而是把**组织文化、用户中心、技术能力、文档、云弹性、公平分工**连成一张因果网。

## 这篇报告在说什么

| 维度 | 内容 |
|------|------|
| 标题 | Accelerate State of DevOps Report 2023 |
| 发布方 | DORA / Google Cloud |
| PDF | [2023 报告全文](https://services.google.com/fh/files/misc/2023_state_of_devops_report.pdf) |
| 官网 | [dora.dev/research/2023](https://dora.dev/research/2023/dora-report/) |
| 数据规模 | 9 年、36,000+ 受访者 |
| 2023 主题 | 文化奠基、用户中心、技术能力 × 文档放大、云要「弹性」而非「搬家」 |

报告衡量三类**结果（outcomes）**：

1. **组织绩效（Organizational performance）** — 为客户与社区创造价值，不止于营收。
2. **团队绩效（Team performance）** — 团队能否通过创新与协作持续交付。
3. **员工福祉（Employee well-being）** — 倦怠、满意度、安全感。

以及两类**能力面（capabilities）**：

- **软件交付绩效** — 安全、高效地变更技术系统。
- **运营绩效** — 面向用户的可靠性、质量与体验。

## 为什么值得读（零基础也能建立图景）

如果你只听过「DevOps = 开发运维合并」，这份报告会给你**可量化的改进地图**：

- 哪些做法真的关联更高绩效（不是博客里的玄学）。
- 为什么 2023 年**用户中心**压过「功能工厂」思维。
- 为什么「上了云」不等于「变快了」——**基础设施弹性**才是关键。
- 为什么**文档**像阳光：有它时，CI、主干开发、SRE 实践的效力会成倍放大。

它和 [[chaos-engineering-netflix-2016]]（生产环境受控实验）、[[spanner]]（多副本一致性）、平台工程内部开发者体验等话题同属「大规模软件如何可靠交付」谱系；DORA 更偏**组织与流程的统计学证据**，而非单点技术方案。

## 核心概念

### 1. DORA 四个核心指标（仍有效，但 2023 更强调「为什么快」）

软件交付领域最常用的四个度量，像餐厅的**运营仪表盘**：

| 指标 | 英文 | 直觉含义 | 餐厅类比 |
|------|------|----------|----------|
| 部署频率 | Deployment frequency | 多久向生产交付一次变更 | 新菜/调价多久上一次桌 |
| 变更前置时间 | Lead time for changes | 从提交到上线的耗时 | 从定菜谱到顾客能点到 |
| 变更失败率 | Change failure rate | 部署导致生产故障的比例 | 新菜退菜/投诉比例 |
| 恢复时间 | Time to restore service | 事故后恢复服务的时间 | 停炉后多久恢复供餐 |

DORA 把团队分为 **Elite / High / Medium / Low** 四档（每年门槛在变——九年前的高绩效今天可能只是及格线）。**重点**：指标是学习的起点，不是 KPI 鞭子；报告反复强调 **continuous improvement（持续改进）** 文化。

### 2. Westrum 组织文化（文化的可测量模型）

Ron Westrum 将组织文化分为三类，DORA 用问卷把文化「算出来」：

| 类型 | 特征 | 与绩效关系 |
|------|------|------------|
| **Pathological（病态）** | 信息 hoarding、部门墙、责备文化 | 技术能力难以落地 |
| **Bureaucratic（官僚）** | 规则优先、层级审批、慢决策 | 中等 |
| **Generative（生成式）** | 信任、协作、失败可讨论、使命共享 | **组织绩效高约 30%** |

生成式文化像餐厅里**前厅后厨同桌开晨会**：昨天哪道菜退得多，一起查是配方、火候还是点单系统问题，而不是互相甩锅。

### 3. 2023 团队特质分类（Trait-based archetypes）

报告用数据把团队聚成四类「气质」，便于对照自省：

- **User-centric（用户中心）** — 理解用户需求、收集反馈、用体验指标驱动优先级。
- **Feature-driven（功能驱动）** — 以产出功能数量、路线图打卡为主。
- **Developing（发展中）** — 能力尚在建设，交付与运营都不突出。
- **Balanced（均衡）** — 交付、运营、用户关注较平衡。

**用户中心团队**组织绩效平均高约 **40%**，工作满意度高约 **20%**。报告结论：光快不够，要快在**对的地方**。

### 4. 技术能力 × 文档的「放大效应」

2023 年最「反直觉」的发现之一：**高质量文档**让技术实践更有效。

- 有高质量文档时，**SRE 实践**对组织绩效的估计影响约为无文档时的 **1.4 倍**。
- **主干开发（trunk-based development）** + 高质量文档，对组织绩效的影响可达 **12.8 倍**（相对低文档场景）。
- 文档本身关联约 **25%** 更高的团队绩效。

比喻：CI/CD 是引擎，文档是**润滑剂和线路图**——没有手册，引擎转得再快也会装错零件。

### 5. 云与「基础设施弹性」（Infrastructure flexibility）

- 使用**公有云**与约 **22%** 更高的基础设施弹性相关。
- **弹性基础设施**与约 **30%** 更高的组织绩效相关。
- 单纯 **lift-and-shift（把机房搬到云上不改架构）** 可能有害：你保留了数据中心的流程枷锁，却失去了熟悉环境的运维直觉。

弹性意味着：按需扩缩、托管服务、基础设施即代码、多区域、无状态设计——**用云的原生能力**，不是给旧服务器换地址。

### 6. 快速代码评审（Fast code reviews）

代码评审速度是 2023 年软件交付绩效的强预测因子：**更快评审**关联约 **50%** 更高的软件交付绩效。慢评审像后厨每道菜都要店长签字——质量可能略好，但前置时间和团队流动性的代价巨大。

### 7. 公平分工与倦怠

- **公平分配工作**可降低倦怠，但对自认「代表性不足群体」倦怠改善不显著。
- 代表性不足群体更常承担**重复性、低可见度**任务，倦怠更高。
- **工作安全感**与约 **61%** 的倦怠下降相关。

### 8. AI 开发工具（2023 年的早期信号）

超过半数受访者已在部分技术任务中使用 AI，对**员工福祉**有温和正向影响，但对交付绩效的预测力在 2023 年仍**弱于**文化、用户中心、文档等成熟能力。报告态度：有热情，但**广泛改变交付方式尚需时间**——这与「AI 主要加速写代码，而交付瓶颈常在协作、需求、评审」的观察一致。

## 代码示例一：用 GitHub Actions 实践持续集成（CI）

DORA 将 **continuous integration** 列为关键技术能力：每次提交都触发自动化构建与测试，尽早发现集成问题。

```yaml
# .github/workflows/dora-ci.yml
# 对应 DORA 能力：Continuous integration + Trunk-based development
name: DORA-style CI

on:
  push:
    branches: [main]          # 主干开发：变更频繁合入 main
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true    # 新提交取消旧流水线，缩短反馈环

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install & test
        run: |
          npm ci
          npm run lint
          npm test -- --coverage

      - name: Build artifact
        run: npm run build

      # 快速反馈 ≈ DORA「变更前置时间」的前半段
      - name: Publish test summary
        if: always()
        run: |
          echo "## CI finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> $GITHUB_STEP_SUMMARY
          echo "Deployment frequency improves when main is always green." >> $GITHUB_STEP_SUMMARY
```

这段流水线体现：**小批量、高频次、自动化验证**——精英团队往往每天多次部署，因为单次变更小、验证快、回滚容易。

## 代码示例二：从部署日志估算 DORA 四指标

下面用 TypeScript 演示如何从**部署事件表**粗算四个核心指标（教学用简化版；生产应接 CD 系统、事故工单、变更关联）：

```typescript
// scripts/dora-metrics.ts — 从部署/事故事件估算 DORA 四指标
type DeployEvent = {
  deployedAt: Date;
  leadTimeHours: number;   // commit → prod
  failed: boolean;         // 是否触发回滚/热修
};

type Incident = {
  startedAt: Date;
  restoredAt: Date;
};

function deploymentFrequency(deploys: DeployEvent[], windowDays = 30): string {
  const count = deploys.length;
  const perDay = count / windowDays;
  if (perDay >= 1) return `Elite-ish: ${perDay.toFixed(1)} deploys/day`;
  if (perDay >= 1 / 7) return `High: ${(perDay * 7).toFixed(1)} deploys/week`;
  if (perDay >= 1 / 30) return `Medium: ${(perDay * 30).toFixed(1)} deploys/month`;
  return `Low: ${(perDay * 365).toFixed(0)} deploys/year`;
}

function medianLeadTimeHours(deploys: DeployEvent[]): number {
  const sorted = [...deploys].map((d) => d.leadTimeHours).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function changeFailureRate(deploys: DeployEvent[]): number {
  if (!deploys.length) return 0;
  return deploys.filter((d) => d.failed).length / deploys.length;
}

function medianTimeToRestore(incidents: Incident[]): number {
  const hours = incidents.map(
    (i) => (i.restoredAt.getTime() - i.startedAt.getTime()) / 3_600_000
  );
  hours.sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  return hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
}

// 示例数据
const deploys: DeployEvent[] = [
  { deployedAt: new Date(), leadTimeHours: 4, failed: false },
  { deployedAt: new Date(), leadTimeHours: 2, failed: false },
  { deployedAt: new Date(), leadTimeHours: 24, failed: true },
];

console.log(deploymentFrequency(deploys));
console.log("Median lead time (h):", medianLeadTimeHours(deploys));
console.log("Change failure rate:", (changeFailureRate(deploys) * 100).toFixed(1) + "%");
```

**读数方式**：先建立基线，再对照 DORA 年度基准；更重要的是看趋势和**与业务结果的关联**——用户满意度、收入、任务完成率是否随交付改进而上升。2023 报告建议把 **CSAT、任务完成率、HEART 框架指标** 与四个交付指标并排放仪表盘，避免「忘了顾客」。

## 代码示例三（补充）：基础设施弹性 — Terraform 片段

弹性基础设施常用 **IaC + 托管服务 + 自动扩缩** 表达：

```hcl
# infra/flexible-service.tf
# DORA 2023: infrastructure flexibility（非 lift-and-shift）

resource "google_cloud_run_v2_service" "api" {
  name     = "user-api"
  location = var.region

  template {
  scaling {
      min_instance_count = 0    # 闲时缩到零，弹性计费
      max_instance_count = 100
    }
    containers {
      image = var.container_image
      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
      }
    }
  }
}

# 多区域 = 故障域分散，支撑「运营绩效」
resource "google_cloud_run_v2_service" "api_dr" {
  count    = var.enable_multi_region ? 1 : 0
  name     = "user-api-dr"
  location = var.dr_region
  # ... 镜像与主区域一致，由 CI 同步部署
}
```

这与「把 VM 原样搬进云」相反：利用 **Cloud Run / K8s HPA / 托管数据库** 等能力，让容量与故障恢复成为代码可版本化的一部分。

## 2023 五大发现（速查）

1. **文化是地基** — 生成式文化 → 组织绩效约 **+30%**；安全感强 → 倦怠约 **-61%**。
2. **以用户为中心** — 组织绩效约 **+40%**，满意度约 **+20%**；同时改善「做对的事」和「把事做对」。
3. **文档放大技术能力** — 团队绩效约 **+25%**；SRE、主干开发等实践在好文档下效力显著放大。
4. **云要弹性** — 公有云提升弹性；弹性基础设施 → 组织绩效约 **+30%**；忌 lift-and-shift。
5. **公平分工与快速评审** — 公平分工降倦怠；快速代码评审 → 软件交付绩效约 **+50%**。

## 团队如何落地（零基础行动清单）

### 第一步：照镜子，别只追 Elite 标签

用 [DORA Quick Check](https://dora.dev/quickcheck/) 或内部问卷评估四指标与文化。把结果当作**体检报告**，不是排名榜。

### 第二步：建立用户反馈闭环

- 产品/工程同看：**任务完成率、CSAT、支持工单主题**。
- 低延迟渠道：应用内反馈、每周用户访谈、发布说明下的「这解决你的问题吗？」。
- 优先级会议先问：**「哪条用户证据支持我们做这个？」**

### 第三步：投资「可发现的」文档

- README：如何本地跑、如何部署、如何 oncall。
- ADR（架构决策记录）：为什么选 A 不选 B。
- Runbook：告警时第一步做什么。
- 把文档质量纳入 PR 检查（见示例一 CI 可扩展 `docs/` 链接检查）。

### 第四步：缩短评审与集成分支寿命

- 小 PR（< 400 行）、24 小时内首次评审。
- 主干开发 + 功能开关，减少长期 feature branch。
- 与 [[chaos-engineering-netflix-2016]] 互补：快交付 + 生产实验验证韧性。

### 第五步：检查云是否「真弹性」

审计清单：能否自动扩缩？数据库是否托管？配置是否 IaC？多区域是否演练过？若答案多为否，可能仍在 lift-and-shift 舒适区。

## 常见误区

| 误区 | 报告怎么说 |
|------|------------|
| DevOps = 买一堆工具 | 文化与用户中心预测力常强于单点工具 |
| 功能越多越好 | Feature-driven 不如 User-centric 关联组织绩效 |
| 上云就更快 | 无弹性的云迁移可能更差 |
| 文档以后补 | 文档是技术能力的「倍增器」，不是附录 |
| 四个指标达标就毕业 | 持续改进；九年 Elite 门槛一直在升 |
| AI 会自动解决交付 | 2023 年 AI 对绩效影响仍早期，先夯实文化与流程 |

## 与其他知识的关系

- **SRE / 错误预算** — 运营绩效侧；DORA 证明 SRE 在好文档下对组织绩效影响更大。
- **平台工程** — 2023 报告首次更多提及；内部开发者也是「用户」，与 User-centric 一致。
- **精益 / 精益创业** — Build-Measure-Learn 与 DORA 用户反馈环同构。
- **团队拓扑** — Loosely coupled teams 与 DORA 技术能力一致；见相关组织设计读物。

## 小结

DORA 2023 用大规模调查说明：**软件交付卓越不是单一技巧，而是文化、用户理解、技术实践、文档与基础设施的共同产物**。像经营餐厅——后厨效率重要，但若从不听顾客，出菜再快也是在浪费食材。

对你而言，读完不必背诵「40%」「12.8 倍」，而应带走三个问题：

1. 我们上次根据**真实用户反馈**调整优先级是什么时候？
2. 新人能否仅凭文档在一天内跑通构建、测试、部署？
3. 我们的云是**弹性**的，还是**搬家**的？

从其中一条开始实验，度量，再改进——这正是 DORA 所说的 **get better at getting better**。

## 延伸阅读

- [DORA 2023 报告 PDF](https://services.google.com/fh/files/misc/2023_state_of_devops_report.pdf)
- [DORA Capabilities 目录](https://dora.dev/capabilities/)
- [User-centric focus 能力页](https://dora.dev/capabilities/user-centric-focus/)
- Nicole Forsgren, Jez Humble, Gene Kim — *Accelerate*（DORA 四指标原书）
- Ron Westrum — 组织文化类型学（生成式文化理论基础）
