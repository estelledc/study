# ResearchStudio 生态系统研究

> 快照日期：2026-07-16
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

## 阅读路线

| 想回答的问题 | 阅读材料 |
|---|---|
| 整个领域有哪些路线，发展到哪一步？ | [01-ecosystem-landscape.md](01-ecosystem-landscape.md) |
| 每个项目具体做什么、代码怎么组织？ | [02-project-deep-dives.md](02-project-deep-dives.md) |
| 各架构模式有什么差异，ResearchStudio 可借鉴什么？ | [03-cross-project-comparison.md](03-cross-project-comparison.md) |
| 下一步怎么学，有哪些关键问题？ | [04-learning-route-and-questions.md](04-learning-route-and-questions.md) |
| fork、clone、提交、许可证和本地恢复信息是什么？ | [05-repository-inventory.md](05-repository-inventory.md) |
| ResearchStudio 自身的旧版详细拆解 | [../researchstudio-architecture-overview.md](../researchstudio-architecture-overview.md) |
| ResearchStudio 本地部署与实跑记录 | [../researchstudio-local-deploy-notes.md](../researchstudio-local-deploy-notes.md) |

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
- 本轮完成源码静态分析和仓库治理验证，没有为 27 个项目逐一安装依赖或运行全套端到端任务。
- GitHub star、fork、许可证等是 2026-07-16 快照，会随时间变化。
- fork 便于个人研究，不代表取得额外授权；许可证不清晰的项目只作为阅读参考。

## 收尾状态

- 本轮已完成：生态检索、27 个项目 fork / clone、逐项目静态分析、横向比较、学习问题、恢复卡和仓库门禁。
- 当前状态：`reference`，不继续无边界扩充项目清单，也不自动安装或运行全部上游依赖。
- 重新激活条件：出现具体架构问题、需要验证某个项目的运行主张，或准备把某项机制落到 ResearchStudio 实验中。
- 重新激活后的第一步：先选一条最小调用链，核对对应 pinned commit 与 upstream diff，再做代码级 trace 或最小运行验证。
