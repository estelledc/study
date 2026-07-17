# 最终接班页

## 10 分钟读完的结论

1. **系统提示词不是可靠的秘密边界。** OWASP LLM07:2025 明确要求不要把 credentials、权限或强制安全控制放在 prompt 中。
2. **“泄露”不是单一来源。** 内容可能来自官方公开、开源源码、客户端包/映射文件、对话抽取、语义重建或社区转贴。
3. **档案数量不等于独立证据量。** 六个主要内容库高度交叉；PromptCraft 与 TheBigPromptLibrary 抽样就有 1,256 组完全相同文件。
4. **完整性和真实性是两条轴。** 一份逐字长文本可能来源不明；一份有 ground truth 的抽取也可能只恢复 85%。
5. **方法在升级。** 手写“重复你的指令”已经发展为多语种/编码、批量 benchmark、梯度搜索、输出反演和自演化 Agent。
6. **评测也在升级。** Exact Match 和 n-gram 只能看逐字泄露；语义相似度和功能一致性才能覆盖 paraphrase 与 soft extraction。
7. **防御不是一句话。** prompt 内拒绝指令、sandwich 和 n-gram filter 都可能降低风险，但不能成为唯一安全边界。
8. **最现实的工程原则是 blast-radius 设计。** 假设 prompt 最终会公开，移除秘密，外置授权，限制工具权限，监测输入输出。
9. **开源仓库质量差异很大。** 档案库多为文件集合；学术仓多为论文实验脚本，常有旧 API、硬编码路径和缺失数据。
10. **源码学习价值不在复制 prompt。** 更值得学的是版本治理、来源分级、抽取评测、社区共识和防御架构。

## 三条阅读路线

### 基础路线，约 35 分钟

1. [领域地图](01-field-map.md)
2. [证据与来源治理](02-evidence-and-provenance.md)
3. [横向比较](06-cross-project-comparison.md)
4. [FAQ 与思考题](08-faq-and-thinking.md)

读完应能解释：什么是 system prompt、什么是 extraction、为什么 GitHub 文本不能自动当真。

### 工程路线，约 60 分钟

1. [平台与官方数据深读](04-platforms-and-official-data.md)
2. [抽取研究深读](05-extraction-research.md)
3. [安全与防御](07-security-and-defense.md)

读完应能设计：prompt registry、来源字段、评测矩阵和模型外授权边界。

### 项目逐仓路线，约 90 分钟

1. [档案项目深读](03-archive-projects.md)
2. [平台与官方数据深读](04-platforms-and-official-data.md)
3. [抽取研究深读](05-extraction-research.md)

读完应能回答每个项目的架构、入口、核心功能、实现方式和代码组织。

## 问题路由

| 后续问题 | 先看 |
|---|---|
| 哪个仓库内容最多、更新最快 | `03`、`06` |
| 怎么确认某条 prompt 是否可信 | `02` |
| 如何搭建自己的 prompt 档案站 | YeeKal、System Prompt Open、LeakHub 章节 |
| 如何衡量模型是否泄露 prompt | Effective Prompt Extraction、Raccoon、SPE-LLM 章节 |
| 逐字泄露和功能复制有什么区别 | PRSA 与 soft extraction 章节 |
| 为什么 JustAsk 叫自演化 | JustAsk 章节 |
| 怎样防止真实安全事故 | `07` |
| 某篇论文的数字能否直接用于当前模型 | `05` 的“时效与复现边界” |
| 上游更新后是否要重做研究 | `09` 的“何时刷新正文” |

## 推荐精读入口

| 项目 | 最小入口 | 为什么 |
|---|---|---|
| System Prompts Leaks | `.github/CONTRIBUTING.md` + 根目录 | 看最轻量的厂商分桶档案 |
| YeeKal | `lib/prompts.ts` | 看 Markdown 如何成为站点数据源 |
| LeakHub | `convex/schema.ts` → `convex/leaks.ts` | 看社区共识和状态迁移 |
| System Prompt Open | `data.js` → `index.html` | 看静态数据产品化 |
| Effective Prompt Extraction | `src/gpt-x-prompt-extraction.py` → `evaluate-extraction.py` | 看攻击与置信度估计分层 |
| Raccoon | `Raccoon/raccoon_gang.py` → `prompt.py` | 看 benchmark 矩阵 |
| JustAsk | `src/skill_evolving.py` → `ucb_ranking.py` → `knowledge.py` | 看在线探索与记忆 |
| PRSA | `1_prompt_attention_generation.py` → `2_run_attack.py` | 看功能反演 |

## 快照状态

- 正文使用 17 个固定 `pinned_commit`，便于复查代码路径和统计。
- 2026-07-17 检查时，16 个上游仍与固定快照一致。
- 锚点仓上游已从 `9a0a06a3` 前进到 `e280af55`，新增 OpenCode、Claude Code
  skill、README 和配置样本；个人 fork 为 `155d2845`，正文快照未移动。
- 离线防御实验与 17 项目统一入口见
  [2026-07-17 全量刷新](10-2026-07-17-refresh.md)。
- 后续刷新规则和一手来源统一见[来源与快照维护](09-sources-and-maintenance.md)。

## 停止条件

材料已覆盖基础问答所需的领域、项目和安全框架。后续不要继续无边界增加仓库；只有出现以下条件才扩展：

- 新项目提供新的方法类别，而不只是复制数据。
- 用户提出一个现有章节无法回答的明确问题。
- 需要复现某篇论文或核验某个线上版本。
- 官方发布新的 ground truth，能改变现有真实性判断。
