# 03. 横向比较：架构模式与 ResearchStudio 可借鉴点

## 1. 编排模型

| 模式 | 代表项目 | 优点 | 风险 |
|---|---|---|---|
| 线性脚本 | AI-Scientist、Paper2Poster | 易理解、易启动 | 失败恢复粗，早期错误向后传播 |
| 有限状态 / stage pipeline | AutoR、Paper2Slides、AutoResearchClaw | 阶段边界和恢复清楚 | 阶段过多会增加协议成本 |
| 图工作流 | PosterGen、nano-scientist | 节点与状态显式，可插拔 | 图本身不能保证节点质量 |
| 搜索树 | AI-Scientist-v2 | 保留多条实验路线 | 成本高，节点评分可能偏 |
| 数据库任务队列 | Co-Scientist | 并发、幂等、租约和观察性强 | 工程复杂度高 |
| 多角色对话 | Agent Laboratory、STORM、Co-Scientist | 引入多视角和批评 | 角色可能只是 prompt 表演 |
| Skill 协议 | ResearchStudio、ppt-master、posterly | 易接入 coding agent，知识可读 | 强依赖宿主正确执行长指令 |

对 ResearchStudio 最合适的演进不是直接引入庞大多智能体，而是：

1. 保留 skill-first 接口。
2. 为长任务增加小型 manifest / stage state。
3. 只在确有分支竞争的 Idea 环节引入 hypothesis lineage。
4. 把确定性门做成统一可调用脚本。

## 2. 状态与恢复

| 项目 | 状态介质 | 恢复粒度 | 审计能力 |
|---|---|---|---|
| ResearchStudio | 目录、Markdown、JSON、产物 | skill / run | 中等 |
| AI-Scientist | 模板副本、日志 | idea 目录 | 较弱 |
| AI-Scientist-v2 | journal、树节点、目录 | 实验分支 | 中等 |
| Agent Laboratory | pickle、文件 | workflow phase | 中等但不透明 |
| AutoR | manifest、stage report、evidence | stage / attempt | 强 |
| Co-Scientist | SQLite + event / span | task / hypothesis | 很强 |
| ARA | artifact schema + evidence binding | claim / branch | 很强 |
| Paper2Slides | checkpoint + 输出目录 | stage | 强 |

状态设计的三个层次：

- “能继续”：知道上次停在哪里。
- “能解释”：知道为什么做了这个决定。
- “能复核”：能从 claim 追到证据、代码、配置和结果。

ResearchStudio 目前主要达到第一层和部分第二层；ARA / AutoR 提供了走向第三层的参考。

## 3. 证据与新颖性

| 项目 | 证据来源 | 证据结构 | 主要缺口 |
|---|---|---|---|
| ResearchStudio Idea | 搜索与论文阅读 | idea card / citation | 缺少持久化证据图 |
| Idea2Paper | Paper-KG、多路径召回 | pattern、anchor、novelty index | KG 构建成本 |
| PaperQA2 | 多元数据源、全文 | evidence context、Docs | 不产生实验 |
| STORM | 多视角检索对话 | information table | 新颖性检查有限 |
| Co-Scientist | 检索、reviews、embedding | hypothesis / review / proximity | 自评偏差 |
| ARA | 运行中的全部 evidence | claim-to-evidence binding | 记录负担 |

推荐组合：

`paper-search-mcp 发现 → PaperQA2 聚合证据 → Idea2Paper / ResearchStudio 生成候选 → Co-Scientist 式反例与近邻竞争 → ARA 绑定结论`

这是一条架构参考链，不代表需要把五个项目直接拼接运行。

## 4. 实验执行

### 模板修改型

AI-Scientist 复制已知模板，让 agent 在有限文件中修改代码。优势是环境和指标相对可控，适合早期验证；缺点是研究空间受模板约束。

### 开放工具型

AI-Researcher、InternAgent 允许浏览器、终端、Docker 和更开放的代码操作。覆盖面大，但安全、复现和失败分类更难。

### 阶段治理型

AutoR、AutoResearchClaw 强调先计划、再审批、再运行，并保留阶段报告。它们更适合多人协作和可追责环境。

### 搜索优化型

AI-Scientist-v2 在实验分支上做树搜索，适合“多个改法都可能有效”的任务，但必须防止只针对自动评分器过拟合。

ResearchStudio 若未来扩展实验能力，建议从“调用外部实验 runner + 读取结构化结果”开始，不把通用 shell 自治直接塞进 Idea skill。

## 5. 评审与质量门

| 门类型 | 代表实现 | 验证什么 |
|---|---|---|
| LLM reviewer | AI-Scientist、Agent Laboratory | 论文结构、贡献和表达 |
| 多智能体互评 | Co-Scientist | 假设竞争、反思和排序 |
| 证据审计 | ARA、posterly | claim 是否有来源、范围是否越界 |
| 程序测试 | AutoR、PaperQA2 | 状态协议、检索和工具行为 |
| 几何测量 | ResearchStudio、posterly | 溢出、尺寸、布局密度 |
| 视觉模型评审 | Paper2Poster、Paper2Video | 审美、视觉一致性和可读性 |
| 预算 / 终止 | Co-Scientist、nano-scientist | 防止无限运行 |

关键结论：质量门必须分层。一个模型给出“8/10”不能替代代码测试、引用检查、几何测量和人工研究判断。

## 6. 代码组织模式

### 传统应用型

FAROS、Paper2Slides、PosterGen 有 backend / frontend / core / state / agents 分层，适合产品化和团队维护。

### 研究原型型

AI-Scientist、Paper2Poster 以主脚本和实验目录为核心，创新方法清楚，但历史代码和职责混合较多。

### 框架型

InternAgent、AI-Researcher 包含大规模 agent / tool / memory 基础设施，扩展强但阅读成本高。

### Skill-first 型

ResearchStudio、ppt-master、posterly、paper2anything 把流程知识放在 Markdown，将脚本作为确定性工具。它们与 Codex / Claude Code 等宿主天然兼容。

### Artifact / protocol 型

AutoR、ARA 的主要价值不是某个 agent class，而是文件结构、schema、阶段契约和审计规则。

## 7. ResearchStudio 的建议参考架构

```text
Research direction
  → Evidence adapter
      → search providers
      → normalized paper/evidence records
  → Idea workflow
      → candidates
      → collision / critique
      → hypothesis lineage
      → idea card + claim/evidence links
  → External experiment adapter
      → plan
      → bounded runner
      → structured results
  → Paper asset bundle
      → figures / tables / claims / citations / sections
  → Dissemination skills
      → poster
      → slides
      → video
      → blog / reel
  → Unified gates
      → evidence
      → compile
      → geometry
      → visual
      → budget / termination
```

## 8. 优先级建议

### P0：保持现有优势

- 继续坚持共享 `paper2assets`。
- 每种产物都保留可编辑源文件。
- LLM 判断后必须有确定性验证。

### P1：补齐 provenance

- 为每条核心 claim 保存来源、页码或段落。
- 为每张图记录原始文件、裁剪和转换链。
- 让 poster / video / blog 都引用同一 claim 和 asset ID。

### P2：统一运行状态

- 增加最小 `run-manifest.json`。
- 记录输入 hash、模型、配置、阶段、产物、门禁和失败原因。
- 支持从明确 stage 继续，而不是只靠 agent 读目录猜测。

### P3：扩展时保持 adapter 边界

- 文献层接 PaperQA2 类接口。
- 实验层接外部 runner，不直接扩大 skill 的 shell 权限。
- 领域能力按 scientific-agent-skills 式按需安装。

### P4：只在有证据时增加多智能体

先通过单 agent + critique prompt 建立基线；只有在假设多样性、反例发现或评审一致性上有量化收益，才引入 Co-Scientist 式多角色和队列。
