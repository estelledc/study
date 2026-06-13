---
title: "Academic Research Skills — Claude Code 学术研究全流程自动化技能包"
来源: 'https://github.com/Imbad0202/academic-research-skills'
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
难度: 中级
provenance: pipeline-v3
---

## 是什么

Academic Research Skills（ARS）是一套**把学术研究的脏活累活交给 Claude Code 多 Agent 协作，但保留你在每个关键节点签字权的技能包**。日常类比：带审稿制度的研究生工作室。

想象你进了一间配置齐全的工作室：文献助理（deep-research）负责检索、精读、做 annotated bibliography；写作教练（academic-paper）搭大纲、写初稿、查引用；模拟审稿人（academic-paper-reviewer）扮演主编、三位领域审稿人加一位魔鬼代言人挑刺；课题秘书（academic-pipeline）把所有人串成一条流水线，在送审前后各跑一轮诚信核查。**但论文的主张、方法选择、结果解释——永远由你拍板。**

ARS 由四个可独立调用、也可由编排器串联的 Claude Code Skills 组成，覆盖调研、写作、诚信检查、审稿、修改、再审、定稿、过程总结的完整学术生产链。一句话安装：`/plugin marketplace add Imbad0202/academic-research-skills` + `/plugin install academic-research-skills`。

## 为什么重要

不理解 ARS 这类工具，下面这些事都没法解释：

- 为什么即使用 ChatGPT 写论文，审稿人还是能一眼看出「AI 写的」——ARS 的 Style Calibration 会从你过往论文学习写作节奏，Writing Quality Check 会抓破折号滥用、AI 高频词等机器感
- 为什么全自动 AI 科学家能发 ICLR workshop 但 Nature 同期论文列出了 7 类失败模式——ARS 把同样的 7 类模式做成了**强制性阻塞闸门**，不是"建议检查"
- 为什么 arXiv 上 2025 年估计有 14.7 万条幻觉引用——ARS 对 Semantic Scholar / OpenAlex / Crossref / arXiv 做确定性存在性核查，不是你问一句「这个引用存在吗」它就编一个
- 为什么学术写作最难的环节不是「写」而是「别被自己的假设框住」——ARS 的 Devil's Advocate 有 Concession Threshold Protocol，强制在 1-5 分打分后才让步

## 核心要点

ARS 拆成四个 Skill 加一个编排器，每个都能独立用，也能串联：

1. **deep-research（13 个 Agent）**：文献调研引擎。支持 full / quick / socratic / lit-review / fact-check / systematic-review 七种模式。苏格拉底模式用 SCR（State-Challenge-Reflect）协议：展示证据前让你先承诺预测，防止过早收敛和附和。bibliography_agent 优先读你已有的 Zotero/Obsidian 语料（corpus-first），缺的再去 Semantic Scholar 补（search-fills-gap）。类比：一个有自己资料库、会反问你的文献助理，不是 ChatGPT 窗口里搜一下。

2. **academic-paper（12 个 Agent）**：写作引擎。从大纲、论证图、初稿到格式转换（MD/DOCX/LaTeX/PDF）。Style Calibration 学你的写作风格，anti-leakage protocol 防止「编数据填充空白」——遇到缺数据就写 `[MATERIAL GAP]`，不假装有。类比：一个会模仿你文风、但绝不替你编数据的写作教练。

3. **academic-paper-reviewer（7 个 Agent）**：多视角审稿。EIC（主编）+ 三位领域自适应审稿人 + Devil's Advocate，0-100 分 rubric。Devil's Advocate 有 Concession Threshold Protocol——每次反驳必须 1-5 打分，低于 4 分不让步，防止模型一被 push back 就认怂。类比：不是「帮我看看有什么问题」，而是一场有规则的模拟答辩。

4. **academic-pipeline（编排器 + 诚信闸门）**：十阶段状态机。Stage 1 RESEARCH → Stage 2 WRITE → Stage 2.5 INTEGRITY（强制诚信闸门，不可跳过）→ Stage 3 REVIEW → Stage 4 REVISE → Stage 3' RE-REVIEW → Stage 4' RE-REVISE → Stage 4.5 FINAL INTEGRITY → Stage 5 FINALIZE → Stage 6 PROCESS SUMMARY。每阶段结束需你确认 checkpoint；诚信闸门检查 7 类 AI 研究失败模式（实现 bug 通过自审、幻觉引用、幻觉实验结果、捷径依赖、把 bug 包装成洞见、方法论编造、frame-lock），任一触发则阻塞流水线，最多 3 次重试。

贯穿全流程的**Material Passport**（材料护照）是结构化交接账本：每阶段盖章（artifact + 版本），下游 Agent 只消费护照里声明过的字段，减少「模型凭记忆编造引用」的空间。

## 实践案例

### 案例 1：从零规划一篇论文

在 Claude Code 会话里装好插件后，输入 `/ars-plan`，然后描述你在写的论文：

```text
/ars-plan

我打算研究"大语言模型对高等教育评价体系的影响"，
已经读了几篇关于自动化评分的论文，但还没确定具体的研究问题。
```

ARS 进入苏格拉底模式——不是直接给你一个大纲，而是反问：「你更关心公平性（AI 评分对不同背景学生是否有偏），还是效率（AI 能否替代人工评分的某些环节）？」每轮对话帮你收敛研究问题，最后产出 RQ Brief + 方法论蓝图。

**逐部分解释**：`/ars-plan` 是 academic-paper 的 plan 模式入口；苏格拉底对话的核心是 SCR 协议——先让你说出预测、再展示证据、最后反思差距，防止你过早锁定到一个不够好的研究问题上。

### 案例 2：对已有稿件做模拟审稿

如果你已经写好了一篇草稿，想看看审稿人会怎么说：

```text
/ars-reviewer

这是我的论文草稿 [附上全文]，目标投 Nature Human Behaviour，
请启动完整审稿流程。
```

ARS 启动 7 Agent 审稿团队：EIC 先评估整体贡献和创新性；三位领域自适应审稿人分别从方法、领域知识、跨学科角度打分；Devil's Advocate 专门找论证漏洞——但每次反驳必须按 1-5 分打分，低于 4 分不让步。最终产出一份 Editorial Decision（Accept/Minor/Major/Reject）+ 各审稿人的详细 rubric + Revision Roadmap。

**逐部分解释**：`/ars-reviewer` 是 academic-paper-reviewer 的 full 模式入口；Concession Threshold Protocol 是防 sycophancy 的关键——模型被训练成"用户说了算"，很容易你一反驳它就认错，这个协议强制它先量化评估你的反驳力度再决定是否让步。

### 案例 3：接 Zotero 文献库做 corpus-first 调研

如果你已经有 Zotero 文献库，不想每次都从零搜索：

```bash
cd academic-research-skills
pip install -r requirements-dev.txt

# 扫描 Zotero 数据目录
python -m scripts.literature_corpus_adapters.zotero \
  --zotero-data "$HOME/Zotero" \
  --output ./my-corpus.json

# 校验格式
python -m scripts.validate_schema \
  --schema shared/literature_corpus_entry.schema.json \
  --instance ./my-corpus.json
```

然后在 Claude Code 里启动 pipeline 时把 `my-corpus.json` 放进 Material Passport 的 `literature_corpus[]` 字段。Phase 1 的 bibliography_agent 会先扫你的语料（pre-screen），只对语料覆盖不到的缺口去 Semantic Scholar 补检索。四条铁律：同样标准筛选、不静默跳过、不修改语料、解析失败优雅降级。

**逐部分解释**：`corpus-first` 的优势是——已经在你硬盘上的 PDF 不会被 Agent 忽略，也不会被 Semantic Scholar 的检索偏差带着走；`search-fills-gap` 意味着它不是"先上网搜一通再对比"，而是"先看你有什么，缺的再搜"。

## 踩过的坑

1. **诚信闸门不能保证零幻觉**：官方展示案例中 Stage 2.5 抓到 15 条捏造引用，但事后独立审计（post-publication audit）仍发现 21/68 个漏网问题——三关诚信检查都没抓全。工具降低风险，不消除风险。
2. **Frame-lock 是隐性杀手**：Devil's Advocate 会攻击你的论点，但可能从未挑战你的前提假设。因为 DA 和你的写作 Agent 共享同一个模型的认知框架——它看不见框架之外的视角。
3. **Sycophancy under pushback**：你反驳 DA 的攻击时，模型容易过度让步——不是因为你反驳有力，而是训练数据奖励「用户说得对」。Concession Threshold Protocol 是缓解，不是根治。
4. **非商业许可 + 无实验执行**：CC BY-NC 4.0 意味着不能用于商业代写；ARS 本身不跑实验——如果你需要跑代码实验或收问卷，要用配套的 experiment-agent。

## 适用 vs 不适用场景

**适用**：

- 需要可重复、有闸门的论文工作流，而非一次性「帮我写一篇」
- 希望把 Zotero/Obsidian 语料、审稿意见、修订轨迹结构化留存
- 用 Claude Code 做日常写作环境，愿意在每个 checkpoint 做人工决策
- 从短综述（3000 词）到完整论文（1.5 万词）都支持，成本约 $4-6

**不适用**：

- 商业代写或机构售卖——CC BY-NC 4.0 非商业许可，需另议授权
- 需要 IRB 备案、数据合规审查的场景——ARS 不替代机构审查
- 全自动端到端发表（像 AI Scientist 那样无人值守）——ARS 的设计前提是人必须在环中
- 需要跑实验（Python 训练脚本、问卷收集、统计检验）——用配套的 experiment-agent，ARS 只做写作和核查

## 历史小故事（可跳过）

- **2025 年末**：Imbad0202 用 ARS 写一篇关于 AI 与高等教育的反思文章时，发现自己陷入了三个结构性困境：DA 从不挑战前提（frame-lock）、一反驳就认怂（sycophancy）、苏格拉底导师总想提前收工（intent misdetection）。这些不是 prompt engineering 能解决的。

- **v3.0（2026 年初）**：受 Lu et al. (2026, Nature) 对全自动 AI 科学家失败模式的剖析启发，ARS 引入 Concession Threshold Protocol、Intent Detection Layer、Dialogue Health Indicator，并首次加入 Stage 2.5/4.5 诚信闸门。

- **v3.3**：受 Google 的 PaperOrchestra (Song et al., 2026) 启发，加入 Semantic Scholar API 验证、anti-leakage protocol、VLM 图表验证、score trajectory tracking。

- **v3.7-v3.8**：受 Zhao et al. (2026) 大规模引用审计驱动——2.5M 篇论文中估计 2025 年有 14.7 万条幻觉引用。ARS 加入 locator 锚点（每一条引用都有精确到段落的锚点）和可选 claim-audit 通道（`ARS_CLAIM_AUDIT=1`），用 LLM 判断「引用的内容是否真的支持这篇论文的主张」。

- **v3.12.0（当前版本）**：四个 Skill 共计 32+ Agent，十阶段状态机，支持 Claude Code 插件市场一键安装。

## 学到什么

1. **AI 辅助学术写作的核心矛盾不是「写得不够快」而是「写得不可靠」**——ARS 把精力花在引用核查、诚信闸门、Material Passport 交接上，而不是「生成得更快」。
2. **人机协作的关键不是「人能做什么」而是「人必须在哪些节点签字」**——ARS 的每阶段 checkpoint 和不可跳过的诚信闸门，是在流程里硬编码了人的决策点。
3. **AI 的认知局限无法通过 prompt engineering 根除**——frame-lock、sycophancy 这些是模型训练目标的本性，ARS 的做法不是消除它们，而是让它们可见、可管理（Concession Threshold Protocol、Dialogue Health Indicator）。
4. **工具降低风险，不消除风险**——展示案例中事后审计仍发现 21/68 个漏网问题。学术诚信的最终签字权永遠在研究者手中。

## 延伸阅读

- 架构总览：[docs/ARCHITECTURE.md](https://github.com/Imbad0202/academic-research-skills/blob/main/docs/ARCHITECTURE.md)（十阶段状态机矩阵、Agent 职责、数据访问流）
- 安装详解：[docs/SETUP.md](https://github.com/Imbad0202/academic-research-skills/blob/main/docs/SETUP.md)（五种安装路径、API Key 配置、跨模型核查）
- 真实产出样例：[examples/showcase/](https://github.com/Imbad0202/academic-research-skills/tree/main/examples/showcase)（含诚信报告 PDF、审稿报告、修订轨迹）
- 配套实验工具：[experiment-agent](https://github.com/Imbad0202/experiment-agent)（跑代码实验、人试、统计检验，ARS 本身不跑实验）
- [[claude-code]] —— ARS 是 Claude Code 的插件生态产物，理解 Claude Code 的 Skills/Agent 机制再看 ARS 会更轻松
- [[deep-research-harness-2026]] —— deep-research 模式的泛化版本，独立于学术场景的深度调研框架

## 关联

- [[claude-code]] —— ARS 运行在 Claude Code 平台上，四个 Skill 靠 Claude Code 的多 Agent 编排框架调度
- [[deep-research-harness-2026]] —— ARS 的 deep-research Skill 的泛化灵感来源，两者共享「fan-out 搜索 + 多源验证」思路
- [[mcp-spec]] —— ARS 的跨模型核查和外部 API 调用依赖 MCP 协议连接外部工具
- [[dspy]] —— ARS 的 prompt 编排和 Agent 协作可类比 DSPy 的模块化 LLM 编程思路
- [[swe-agent]] —— 同为 Claude Code 生态的 Agent 工具，SWE-agent 面向代码修复，ARS 面向学术写作，对比看「Agent 编排」的通用模式
- [[openhands]] —— 另一个多 Agent 协作框架，ARS 的 Material Passport 设计可作为跨 Agent 上下文管理的参考案例
- [[autogen]] —— 微软的多 Agent 框架，ARS 的 32 Agent 编排思路与 AutoGen 的 group chat 模式有异曲同工之处

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[mcp-spec]] —— MCP — 让一个 LLM 客户端能插任何外部能力的 USB 协议
- [[openhands]] —— OpenHands — 开源 AI 软件工程师
- [[swe-agent]] —— SWE-Agent — Princeton SWE-bench 解法

