# ResearchStudio 生态系统研究

> 快照日期：2026-07-17
> 研究对象：27 个 GitHub 仓库，均已 fork 到 `estelledc` 并以独立浅层稀疏仓库 clone 到 `explorations/research/repos/`。
> 核心问题：ResearchStudio 位于 AI 科研自动化生态的什么位置，各项目如何组织研究流程、证据、实验、评审与发布产物？

## 先看结论

ResearchStudio 不是“全自动 AI 科学家”的同义词。它更像一个面向 coding agent 的研究生产工具箱：

- `Idea` 把一个研究方向压缩成有证据、有碰撞检查、有批评修订的 idea card。
- `Reel` 把论文先解析成共享资产包，再生成海报、视频、博客和交互式 reel。
- 核心竞争力不在单一模型，而在可复用 skill、文件化中间产物和确定性质量门。
- 它当前没有覆盖完整实验执行、长期研究状态、系统性文献问答和多智能体科学辩论；这些能力可从本研究中的其他项目理解。

这一领域已形成六层生态：

1. 文献与证据：检索、全文解析、证据聚合、带引用写作。
2. 选题与假设：从文献、知识图谱或多智能体讨论生成并筛选研究想法。
3. 实验与发现：修改代码、运行实验、读取结果、迭代研究方向。
4. 写作与评审：生成论文、模拟审稿、管理可证伪性和证据链。
5. 发布与传播：海报、幻灯片、视频、网页和社交媒体内容。
6. Harness 与能力层：skills、状态文件、预算、恢复、审计和可复用科研软件能力。

## 材料地图

| 想回答的问题 | 阅读材料 |
|---|---|
| 整个领域有哪些路线，发展到哪一步？ | [01-ecosystem-landscape.md](01-ecosystem-landscape.md) |
| 每个项目具体做什么、代码怎么组织？ | [02-project-deep-dives.md](02-project-deep-dives.md) |
| 各架构模式有什么差异，ResearchStudio 可借鉴什么？ | [03-cross-project-comparison.md](03-cross-project-comparison.md) |
| 下一步怎么学，有哪些关键问题？ | [04-learning-route-and-questions.md](04-learning-route-and-questions.md) |
| fork、clone、提交、许可证和本地恢复信息是什么？ | [05-repository-inventory.md](05-repository-inventory.md) |
| 27 仓有什么增量，真实产物暴露了什么问题？ | [06-2026-07-17-refresh.md](06-2026-07-17-refresh.md) |
| 如何亲手验证 stage、artifact、gate 和 provenance？ | [07-beginner-artifact-first-research-lab.md](07-beginner-artifact-first-research-lab.md) |
| 每个项目怎样类比、从哪个源码入口开始？ | [08-beginner-project-onboarding-cards.md](08-beginner-project-onboarding-cards.md) |
| ResearchStudio 自身的旧版详细拆解 | [../researchstudio-architecture-overview.md](../researchstudio-architecture-overview.md) |
| ResearchStudio 本地部署与实跑记录 | [../researchstudio-local-deploy-notes.md](../researchstudio-local-deploy-notes.md) |

## 零基础 30 分钟路线

1. 用 5 分钟读本页“先看结论”，记住 ResearchStudio 的强项是 Idea、Reel 和
   Skill-first 工作流，不是完整实验平台。
2. 用 10 分钟读[零基础实验](07-beginner-artifact-first-research-lab.md)第 1-4 节，
   建立 `run -> stage -> artifact -> gate -> provenance` 的直觉。
3. 用 10 分钟运行 `labs/research_run.py` 和 8 个单元测试，观察环境失败如何从
   同一 stage 恢复。
4. 用 5 分钟回答实验页第 14 节的 3 道应用题。能解释“为什么文件齐全仍不能标
   完成”，就达到本类的入门标准。

运行命令：

```bash
cd explorations/research/researchstudio-ecosystem-study/labs
PYTHONDONTWRITEBYTECODE=1 python3 research_run.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v test_research_run.py
```

再按目标继续：

- 想理解领域分层：读[生态全景](01-ecosystem-landscape.md)和
  [横向比较](03-cross-project-comparison.md)。
- 想选择项目：从[项目上手卡](08-beginner-project-onboarding-cards.md)找到类比、证据
  和第一项任务，再读[逐项目深析](02-project-deep-dives.md)。
- 想检查证据：读[本轮刷新](06-2026-07-17-refresh.md)中的真实 run 失败卡。
- 想继续精读源码：先在[仓库清单](05-repository-inventory.md)固定 commit，
  再按[学习路线](04-learning-route-and-questions.md)一次追一条控制流。

## 研究口径

### 纳入标准

至少满足一项：

- 直接覆盖 ResearchStudio 的 idea、paper asset、poster、video、slides 或 skill 工作流。
- 提供完整或局部的 AI 科研生命周期实现。
- 在状态持久化、实验执行、证据治理、评审或质量门方面有独特可复用设计。
- 是该领域的重要官方实现或高质量生态索引。

### 没有纳入的类型

- 只有产品介绍、没有可读实现的空仓库。
- 泛化 deep research 工具，但与科学研究证据、实验或产物链没有明显关系。
- 只服务单一生物、金融等垂直任务，且没有独特通用架构。
- 上游的重复镜像或明显缺乏维护和可验证实现的项目。

“所有相关项目”无法形成绝对封闭集合；本材料中的“所有”指截至快照日，按上述标准检索并确认后进入深度语料集的项目。

## 证据边界

- 架构结论来自本地 pinned commit 的 README、目录树和核心实现，不把项目宣传语直接当作已验证事实。
- 本轮重新核对了 27 个仓库：26 个 upstream 与 pinned commit 一致，`ppt-master`
  有 4 个增量提交；没有为 27 个项目逐一安装依赖或运行全套端到端任务。
- E2 包括 8 个纯标准库 research run 测试，以及既有 ResearchStudio Idea run 的
  navigator / validator 复核；它们不证明科学假设成立，也不证明全部上游可运行。
- 真实 run 的 navigator 显示 `DONE`，但官方 validator 仍有 1 个 contract /
  artifact routing failure；完成权威应是 blocking gate，而不是目录投影。
- GitHub star、fork、许可证等是 2026-07-16 的清单快照，会随时间变化；本轮
  2026-07-17 只刷新 commit 漂移和代码增量。
- fork 便于个人研究，不代表取得额外授权；许可证不清晰的项目只作为阅读参考。

## 收尾状态

- 本轮已完成：生态检索、27 个项目 fork / clone、逐项目静态分析、横向比较、
  学习问题、恢复卡、全量快照复核、真实产物失败卡和 artifact-first 最小实验。
- 当前状态：`reference`，不继续无边界扩充项目清单，也不自动安装或运行全部上游依赖。
- 重新激活条件：出现具体架构问题、需要验证某个项目的运行主张，或准备把某项机制落到 ResearchStudio 实验中。
- 重新激活后的第一步：先选一条最小调用链，核对对应 pinned commit 与 upstream diff，再做代码级 trace 或最小运行验证。
