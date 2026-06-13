---
title: Academic Research Skills — Claude Code 学术研究全流程自动化
来源: https://github.com/Imbad0202/academic-research-skills
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

## 日常类比：带审稿制度的研究生工作室

想象你进了一间**配置齐全的研究生工作室**，而不是只有一个会聊天的 ChatGPT 窗口：

- **文献助理**（Deep Research）负责检索、精读、做 annotated bibliography，还能用苏格拉底式提问逼你把研究问题想清楚；
- **写作教练**（Academic Paper）按大纲搭论证、写初稿、改格式、查引用，但**不会替你拍板「本文主张是什么」**；
- **模拟审稿人**（Academic Paper Reviewer）扮演主编、三位领域审稿人，外加一位「魔鬼代言人」专门挑刺；
- **课题秘书**（Academic Pipeline）把上述角色串成一条流水线，在关键节点**强制你点头**，并在送审前后各跑一轮**诚信核查**（Stage 2.5 / 4.5）。

[Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills)（简称 **ARS**，当前 v3.12.0，许可证 CC BY-NC 4.0）就是把这套工作室**写成 Claude Code 的 Skills + 命令 + 多 Agent 编排**。它覆盖「调研 → 写作 → 诚信检查 → 审稿 → 修改 → 再审 → 定稿 → 过程总结」的完整学术生产链，强调 **AI 是副驾驶（copilot），不是飞行员（pilot）**——引用核查、数据溯源、逻辑一致性由工具扛，研究问题、方法选择、结果解释仍须研究者本人负责。

---

## 是什么：四个 Skill 组成的学术流水线

ARS 不是单一 Prompt，而是**四个可独立调用、也可由编排器串联的 Claude Code Skills**：

| Skill | 目录 | 角色 | Agent 规模（约） |
|-------|------|------|------------------|
| **deep-research** | `deep-research/` | 文献调研、RQ 界定、系统综述 | 13 个专职 agent |
| **academic-paper** | `academic-paper/` | 规划、大纲、起草、修订、格式转换 | 12 个专职 agent |
| **academic-paper-reviewer** | `academic-paper-reviewer/` | 多视角同行评议、再审、校准 | 7 个专职 agent |
| **academic-pipeline** | `academic-pipeline/` | 十阶段总编排 + 诚信闸门 | 编排器 + 共享 agent |

此外还有：

- **`commands/ars-*.md`**：10 条斜杠命令快捷入口（如 `/ars-plan`、`/ars-lit-review`）；
- **`shared/`**：Material Passport 模式、跨模型核查、handoff schema、数据访问级别约定；
- **`scripts/`**：文献库适配（Zotero / Obsidian / 文件夹扫描）、schema 校验、eval harness；
- **插件清单**：`.claude-plugin/plugin.json`，支持 Claude Code v3.7.0+ 一行安装。

官方架构说明见 [docs/ARCHITECTURE.md](https://github.com/Imbad0202/academic-research-skills/blob/main/docs/ARCHITECTURE.md)；安装与 API Key、Pandoc、跨模型核查等见 [docs/SETUP.md](https://github.com/Imbad0202/academic-research-skills/blob/main/docs/SETUP.md)。

---

## 十阶段 Pipeline（核心流程）

`academic-pipeline` 把零散技能收成**可审计的十阶段状态机**（每阶段结束需用户确认 checkpoint）：

```text
Stage 1  RESEARCH          → deep-research（产出 RQ Brief、方法蓝图、文献矩阵）
Stage 2  WRITE             → academic-paper（大纲 → 论证图 → 初稿）
Stage 2.5 INTEGRITY        → integrity_verification_agent（送审前诚信闸门，不可跳过）
Stage 3  REVIEW            → academic-paper-reviewer（主编 + 审稿人 + 魔鬼代言人）
Stage 4  REVISE            → academic-paper revision 模式（修订稿 + 回复审稿人）
Stage 3' RE-REVIEW         → 验证修订是否落实
Stage 4' RE-REVISE         → 必要时第二轮修改
Stage 4.5 FINAL INTEGRITY  → 终稿前再次诚信核查（须 100% 通过才可定稿）
Stage 5  FINALIZE          → format-convert（MD → DOCX/PDF/LaTeX 等）
Stage 6  PROCESS SUMMARY   → 协作质量自评报告（六维度 1–100 分）
```

**中途切入**也支持：若你已有成稿，可从 Stage 2.5 先做诚信核查；若只有审稿意见，可从 Stage 4 进入修订循环。编排器通过 **Material Passport**（Schema 9）在各阶段之间传递结构化产物，避免长对话里上下文腐烂。

---

## 核心概念

### 1. Material Passport（材料护照）

贯穿全流程的**结构化交接账本**，记录：研究问题简报、文献语料、大纲、论证图、引用列表、诚信报告、审稿轨迹、`repro_lock`（可选复现配置快照）、`experiment_provenance[]`（外部实验声明）等。  
作用类似海关护照：**每个阶段盖章（artifact + 版本）**，后续 agent 只消费护照里声明过的字段，减少「模型凭记忆编造引用」的空间。

v3.6.4+ 支持可选的 `literature_corpus[]`：可把 Zotero / Obsidian / 本地 PDF 文件夹扫进护照，文献 agent 走 **corpus-first、检索补缺口** 流程，而不是每次都从零上网搜。

### 2. 诚信闸门（Stage 2.5 / 4.5）

受 Lu et al. (2026, *Nature*) 对全自动 AI 科学家失败模式启发，ARS 在送审前后插入**强制性** `integrity_verification_agent`：

- 七类 AI 研究失败模式清单（实现 bug、幻觉结果、捷径依赖、把 bug 包装成洞见等）；
- 五类引用幻觉分类（完全捏造、张冠李戴、页码错误等）；
- 对外部索引（Semantic Scholar、OpenAlex、Crossref、arXiv）做**确定性**存在性核查；
- v3.8+ 可选 `ARS_CLAIM_AUDIT=1`：按 locator 抓取原文，判断**主张是否被引用真正支持**。

闸门**默认阻塞**流水线，不像普通建议那样可忽略。

### 3. 数据访问级别（data_access_level）

每个 Skill 在 frontmatter 声明 `raw` / `redacted` / `verified_only`，由 `scripts/check_data_access_level.py` 在 CI 中校验——模式借鉴 Anthropic 自动化研究项目，防止「未验证草稿」被下游当成定稿引用。

### 4. 人机协作设计哲学

README 明确反对「humanizer」式掩盖 AI 痕迹；提供的是 **Style Calibration**（从你过往论文学写作节奏）和 **Writing Quality Check**（抓 AI 高频词、破折号滥用等**写作质量问题**）。苏格拉底模式（`/ars-plan`）用 SCR（State–Challenge–Reflect）协议：在展示证据前让你先**承诺预测**，减少过早收敛和附和。

### 5. 斜杠命令与模式注册表

`MODE_REGISTRY.md` 统一登记各 Skill 的模式（如 `full`、`socratic`、`systematic-review`、`revision-coach`）。`commands/ars-*.md` 把常用模式映射为插件命令，并在 frontmatter 固定模型路由（如 `full` 用 Opus，`lit-review` 用 Sonnet）。

---

## 安装与验证（零基础第一步）

**前置**：已安装 [Claude Code](https://docs.claude.com/en/docs/claude-code/setup)，并配置 `ANTHROPIC_API_KEY`。可选：Pandoc（DOCX）、tectonic + 思源宋体（APA PDF）。

**推荐：插件市场安装（约 30 秒）**

在 Claude Code 会话内执行：

```text
/plugin marketplace add Imbad0202/academic-research-skills
/plugin install academic-research-skills
```

**验证是否加载成功**

```text
/ars-plan
```

然后用自然语言描述你正在写的论文主题；ARS 应进入苏格拉底式对话，帮你拆章节结构。若想单次测试文献能力，可试：

```text
/ars-lit-review "大语言模型对高等教育评价的影响"
```

**传统方式**（无插件时）：`git clone` 仓库后，把 `deep-research/`、`academic-paper/`、`academic-paper-reviewer/`、`academic-pipeline/` 软链到项目的 `.claude/skills/` 或全局 `~/.claude/skills/`。详见 SETUP.md 五种安装路径。

**Codex CLI 用户**：姊妹仓库 [academic-research-skills-codex](https://github.com/Imbad0202/academic-research-skills-codex) 提供 `$academic-research-suite` 与 `ars-*` 别名，工作流内容一致。

---

## 代码示例 1：用环境变量开启跨模型诚信抽检

ARS 默认单模型即可运行；若希望诚信样本由 **GPT 或 Gemini 交叉复核**，可设置 `ARS_CROSS_MODEL`（详见 `shared/cross_model_verification.md`）。

```bash
# 在启动 Claude Code 前导出（示例：用 OpenAI 做交叉核查）
export ARS_CROSS_MODEL=1
export OPENAI_API_KEY="sk-..."

# 可选：开启主张-引用对齐审计（v3.8+，默认关闭，因会增加 API 成本）
export ARS_CLAIM_AUDIT=1

# 进入你的论文工作目录后启动 Claude Code
cd ~/papers/llm-education-qa
claude
```

在会话中说：「我想走完整 academic pipeline，题目是……」编排器会在 Stage 2.5/4.5 按协议抽样调用外部模型，**不设置上述变量则行为与 v3.7 前兼容**。

---

## 代码示例 2：把 Zotero 文献库接入 Material Passport

`scripts/` 提供 `literature_corpus[]` 适配器。扫描本地 Zotero 导出或 SQLite 后，护照里会带上已读文献条目，Phase 1 的 `bibliography_agent` / `literature_strategist_agent` 优先读语料，再决定是否补检索。

```bash
# 在 ARS 仓库根目录（或已 clone 的路径）
cd academic-research-skills

# 安装开发依赖（含 schema 校验）
pip install -r requirements-dev.txt

# 扫描 Zotero 数据目录，输出符合 literature_corpus_entry.schema.json 的 JSON
python -m scripts.literature_corpus_adapters.zotero \
  --zotero-data "$HOME/Zotero" \
  --output ./my-corpus.json

# 校验形状（CI 同款）
python -m scripts.validate_schema \
  --schema shared/literature_corpus_entry.schema.json \
  --instance ./my-corpus.json
```

在 Claude Code 里启动 pipeline 时，把 `my-corpus.json` 内容合并进 Material Passport 的 `literature_corpus[]` 字段（或按 SETUP 文档把文件放在项目约定路径），即可触发 **corpus-first** 文献流，减少重复检索与漏引本地已有 PDF 的问题。

---

## 常用斜杠命令速查

| 命令 | 用途 |
|------|------|
| `/ars-plan` | 苏格拉底式论文结构规划 |
| `/ars-lit-review "主题"` | 文献综述模式 |
| `/ars-full` | 启动完整十阶段 pipeline |
| `/ars-reviewer` | 对已有稿件做模拟审稿 |
| `/ars-citation-check` | 引用格式与存在性检查 |
| `/ars-abstract` | 双语摘要 + 关键词 |
| `/ars-disclosure` | 生成会议/期刊要求的 AI 使用声明 |

完整列表见仓库 `commands/` 与插件加载时的 SessionStart hook 提示。

---

## 与 Experiment Agent 的配合

ARS **本身不跑实验**（不写 Python 训练脚本、不替你收问卷）。若研究含实证，官方建议：

```text
ARS Stage 1（研究设计）
    ↓ 暂停
experiment-agent（外部仓库，跑代码/人试 + 统计检验）
    ↓ 带回 experiment_provenance[]
ARS Stage 2（写作，诚信门会审计主张与实验声明是否对齐）
```

Stage 1 结束时会 fail-closed 写入 `experiment_intake_declaration`：要么 `experiments_declared` 并列出 `experiment_id`，要么显式 `no_experiments_declared`，防止「忘了声明实验」却写了实验段落。

---

## 成本与性能预期

官方 [docs/PERFORMANCE.md](https://github.com/Imbad0202/academic-research-skills/blob/main/docs/PERFORMANCE.md) 估算：一篇约 1.5 万英文词的完整 pipeline 约 **$4–6**（视模型与轮次而定）。长任务可设 `ARS_PASSPORT_RESET=1` 在 FULL checkpoint 重置上下文，凭 Material Passport 在新会话 `resume_from_passport` 续跑。

---

## 适用场景与边界

**适合**

- 需要**可重复、有闸门**的论文工作流，而非一次性「帮我写一篇」；
- 希望把 Zotero/Obsidian 语料、审稿意见、修订轨迹结构化留存；
- 用 Claude Code 做日常写作环境，愿意在 checkpoint 人工决策。

**不适合 / 需注意**

- **非商业许可**（CC BY-NC 4.0）：商业代写、机构售卖需另议授权；
- 不能替代 IRB、数据合规、终稿学术责任；
- showcase 中的事后审计仍发现部分引用问题——工具降低风险，**不保证零幻觉**；
- 全自动发表（类似 AI Scientist 端到端无人值守）不是 ARS 目标，反而被其引用为反面教材。

---

## 学习路径建议（零基础）

1. **只装插件 + 跑 `/ars-plan`**：熟悉苏格拉底规划，不碰全长 pipeline；
2. **单 Skill 练习**：`/ars-lit-review` → 自己写一节 → `/ars-citation-check`；
3. **读 ARCHITECTURE.md §3 矩阵**：弄清 Stage 2.5 产出哪些 artifact；
4. **小规模端到端**：短综述（3000 词）走 `ars-full`，观察 Material Passport 文件树；
5. **按需开高级开关**：`ARS_CROSS_MODEL`、`ARS_CLAIM_AUDIT`、严格 `terminal_policies`。

---

## 延伸阅读

- 架构总览：[docs/ARCHITECTURE.md](https://github.com/Imbad0202/academic-research-skills/blob/main/docs/ARCHITECTURE.md)
- 安装详解：[docs/SETUP.md](https://github.com/Imbad0202/academic-research-skills/blob/main/docs/SETUP.md)
- 真实产物样例：[examples/showcase/](https://github.com/Imbad0202/academic-research-skills/tree/main/examples/showcase)（含 Stage 2.5 抓到 15 条捏造引用等的 PDF 报告）
- 中文 Substack  walkthrough（作者）：README 内链接「學術寫作不該是一個人的事」
- 姊妹项目：[experiment-agent](https://github.com/Imbad0202/experiment-agent)、[teaching-skills](https://github.com/YujxZJCN/teaching-skills)（教学侧 Course Passport）

---

## 小结

Academic Research Skills 把「研究生工作室」拆成**可版本化的 Markdown 技能包 + 十阶段状态机 + Material Passport 合同**，在 Claude Code 里实现调研、写作、审稿、诚信核查的自动化编排。零基础使用者应先掌握 **插件安装、`/ars-plan`、Pipeline 阶段图、诚信闸门为何不可跳过**；再按需接入文献语料、跨模型核查与实验溯源。记住 README 的底线：**它帮你把脏活累活做规范，论证与学术诚信的最终签字权仍在研究者手中。**
