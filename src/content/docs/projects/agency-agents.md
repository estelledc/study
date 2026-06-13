---
title: Agency Agents — 用 197+ 个专业角色组建你的 AI 团队
来源: https://github.com/msitarzewski/agency-agents
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# Agency Agents — 用 197+ 个专业角色组建你的 AI 团队

## 这是什么

**日常类比**：想象你要开一家广告公司，接了一个大客户——要推出一款面向年轻人的社交 App。

如果只招一个"全能选手"，让他同时做：市场调研、产品设计、前端开发、后端架构、测试、运营推广、财务核算——这个人就算能力再强，也一定会顾此失彼。正确的做法是：按岗位招人，各司其职。产品经理出需求文档、UI 设计师做界面、前端工程师写页面、后端架构师搭 API、测试工程师找 Bug、市场专员出推广方案、项目经理盯进度。

**Agency Agents 做的事情一模一样**。区别只在于：它的"员工"不是真人，而是 197+ 个经过精心设计的 AI Agent 角色定义文件。

[Agency Agents](https://github.com/msitarzewski/agency-agents)（107k+ Stars，MIT 协议）是一个开源项目。它不是软件、不是框架、不是可以安装运行的程序。**它是 197+ 个 Markdown 文件的集合**——每个文件定义了一个 AI Agent 的"人格"和"工作规范"。诞生于一个 Reddit 帖子，迅速成为 GitHub 上最受关注的 AI Agent 仓库之一。

把 Agent 定义加载到 AI 编程工具（Claude Code、Cursor、Copilot 等 17+ 种）里，工具就会按照该 Agent 的专业设定来工作。

### 项目结构总览

```
agency-agents/
├── engineering/          ← 29 个 Agent（后端架构师、前端、DevOps、安全...）
├── marketing/            ← 30 个 Agent（增长黑客、SEO、TikTok、小红书...）
├── specialized/          ← 40+ 个 Agent（编排器、MCP 构建器、区块链审计...）
├── game-development/     ← 20 个 Agent（Unity、Unreal、Godot、Roblox...）
├── design/               ← 8 个 Agent（UI/UX、品牌守护、视觉叙事...）
├── sales/                ← 8 个 Agent（外呼策略、交易教练、提案专家...）
├── testing/              ← 8 个 Agent（证据收集、现实检查、性能基准...）
├── product/              ← 5 个 Agent（产品经理、冲刺优先级排序...）
├── project-management/   ← 6 个 Agent（项目牧羊人、Jira 管家...）
├── support/              ← 6 个 Agent（客户支持、分析报告、法律合规...）
├── spatial-computing/    ← 6 个 Agent（visionOS、WebXR、Metal 工程师...）
├── paid-media/           ← 7 个 Agent（PPC 策略师、程序化购买...）
├── finance/              ← 5 个 Agent（记账、财务分析、税务策略...）
├── academic/             ← 5 个 Agent（历史学家、心理学家、叙述学家...）
└── scripts/              ← 自动化工具（安装、转换、校验）
```

共 14 个部门，覆盖从开发、设计到市场、金融、学术的各个领域。

### 支持的 AI 工具

同一个 Agent 定义文件，通过 `scripts/convert.sh` 可转换成 17+ 种工具格式：

| 工具 | 安装命令 | 激活方式 |
|------|---------|---------|
| Claude Code | `./scripts/install.sh --tool claude-code` | `Use the Frontend Developer agent to...` |
| Cursor | 转为 `.mdc` 规则文件 | `@backend-architect design this API` |
| GitHub Copilot | 复制到 `~/.github/agents/` | 同上 |
| Windsurf | 项目本地安装 | 自动识别 |
| Aider | 编译为 `CONVENTIONS.md` | 自动加载 |
| Gemini CLI | 用户全局安装 | `@frontend-developer review this` |

核心价值：维护一套 Agent 定义，在所有工具中使用。

## 为什么重要

### 1. 把 AI 使用从"碰运气"变成"工程化"

普通使用 AI 的方式：每次手动写提示词，质量取决于你当场的表达能力和运气。Agency Agents 的方式：提示词已经由社区反复迭代、验证过。你把经过实战检验的 Agent 定义加载进来，就相当于请了一个有经验的专业人士。

### 2. 专业化分工释放 AI 的真正潜力

单个 AI 模型即使再强大，一次只能做好一件事。通过角色分工，每个 Agent 专注自己最擅长的领域，组合起来完成一个人做不了的事。就像现实世界中，你不会让律师同时做手术、让医生同时做审计——专业的人做专业的事。

### 3. 多 Agent 系统 73% 的失败发生在交接环节

Agency Agents 内置的 NEXUS 编排框架正是为解决这个问题而设计——通过质量门禁、Dev-QA 循环、标准化交接模板，确保 Agent 之间协作不出错。

### 4. 和配套项目 AGENT-ZERO 形成完整闭环

同一作者维护的 [AGENT-ZERO](https://github.com/msitarzewski/AGENT-ZERO) 是一个状态机工作流框架（PLAN → BUILD → DIFF → QA → APPROVAL → APPLY → DOCS）。Agency Agents 提供"人"（角色定义），AGENT-ZERO 提供"流程"（状态机），两者配合形成完整的 AI 辅助开发方法论。

### 5. 社区生态活跃

107k+ Stars，中文社区 fork（`jnMetaCode/agency-agents-zh`）新增了 50+ 个中国特有 Agent（微信、抖音、小红书、钉钉、政府政策、医疗合规等）。30 天内 34 个 PR、18 个 Issue，持续迭代中。

## 核心要点

### 要点 1：Agent = 人格 + 工作流程 + 质量标准

普通 AI 提示词长这样：

```
你是一个开发者，帮我写一段代码。
```

Agency Agents 的 Agent 定义包含 8 个标准化段落：

| 段落 | 说明 | 示例 |
|------|------|------|
| **YAML Frontmatter** | name, description, color, emoji, vibe | `vibe: Ships architectures that scale from day one` |
| **Identity & Memory** | 角色、人格、经验年限 | "15+ years designing production systems at scale" |
| **Core Mission** | 核心职责与交付物 | "Design systems that are scalable, maintainable, observable" |
| **Critical Rules** | 硬约束，不可违反 | "Never use float for money — always DECIMAL" |
| **Technical Deliverables** | 具体模板、代码示例 | API 设计文档模板、数据库 Migration 模板 |
| **Workflow Process** | 分步骤 SOP（3-6 Phase） | Discovery → Design → Review → Handoff |
| **Communication Style** | 语调、例句 | "The simplest thing that could work: ..." |
| **Success Metrics** | 可量化 KPI | "Failure modes identified per design >= 5" |

关键区别：vibe 字段赋予 Agent **性格**，让它在工作时更有倾向性和判断力——比如 Evidence Collector 的 vibe 是 "The detective who never accepts 'it looks fine' without photographic evidence"，这会驱动它主动截图验证，而不是轻信口头描述。

### 要点 2：NEXUS 框架——多 Agent 协作的"乐队指挥"

**NEXUS**（Network of EXperts, Unified in Strategy）是内置的多 Agent 编排框架。核心洞察：**多 Agent 系统 73% 的失败发生在交接环节**——上下文丢失、质量标准不一致。

**7 阶段产品生命周期：**

```
Phase 0: Discovery  →  情报收集（6 Agent 并行：市场、用户、法律、技术）
Phase 1: Strategy   →  架构设计、品牌策略、预算、冲刺优先级
Phase 2: Foundation →  搭建骨架（CI/CD、监控、DB Schema、设计 Token）
Phase 3: Build      →  核心开发（Dev↔QA 持续循环，下面详述）
Phase 4: Hardening  →  最终质量审判（压力测试、合规审计、完整回归）
Phase 5: Launch     →  协调上线（T-7 准备 → T-0 上线 → T+7 优化）
Phase 6: Operate    →  持续运营（测量 → 分析 → 规划 → 执行）
```

**Phase 3 核心：Dev↔QA 循环**

```
开发 Agent ──生成代码──▶ Evidence Collector（截图验证）
    ▲                        │
    │                        ├─ PASS → 下一个任务
    └── QA 反馈 ─────────────┤
                             ├─ FAIL（≤3次）→ 退回重做
                             └─ BLOCKED → 升级处理
```

每次开发完成，Evidence Collector 截图对比设计稿与实际实现，不通过就打回。最多退回 3 次，超过则人工介入。质量门禁不可绕过。

**三种部署模式：**

| 模式 | 活跃 Agent | 时间线 | 适用 |
|------|-----------|--------|------|
| NEXUS-Full | ~50+ | 12-24 周 | 完整产品生命周期 |
| NEXUS-Sprint | 15-25 | 2-6 周 | 功能构建、MVP |
| NEXUS-Micro | 5-10 | 1-5 天 | Bug 修复、单次交付 |

### 要点 3：跨工具兼容——写一次，处处用

同一套 Agent 定义，通过 `scripts/convert.sh` 输出为不同格式：Claude Code → `~/.claude/agents/`、Cursor → `.mdc` 规则、Copilot → `~/.github/agents/`、Aider → `CONVENTIONS.md`、Gemini CLI → `.gemini/agents/`。团队中有人用 Claude Code、有人用 Cursor、有人用 Copilot——所有人共享同一套 Agent，输出质量统一。

## 实践案例

### 案例 1：创建一个自定义 Agent（代码规范检查员）

从零创建一个新 Agent 只需一个 Markdown 文件：

```markdown
---
name: Code Style Enforcer
description: Strict code style enforcer who ensures every line follows project conventions.
color: "#DC2626"
emoji: 📏
vibe: Consistency is not optional — it's the foundation of maintainable code.
---

# Code Style Enforcer

## 🧠 Your Identity & Memory

You are **CodeStyleEnforcer**, a meticulous code reviewer who has memorized
every style guide ever written. You don't care if the code works — you
care if it's maintainable.

- **Role**: Code Style & Convention Enforcer
- **Personality**: Strict, precise, zero-tolerance for inconsistency

## 🎯 Your Core Mission

Enforce project code conventions with absolute consistency.
Every review produces one of two outcomes:
1. PASS: All conventions met
2. FAIL with specific violations (cite rule + file location + fix)

## 🚨 Critical Rules

1. Never approve code with inconsistent naming (camelCase vs snake_case)
2. Always check import ordering and grouping
3. Maximum line length violations are blocking
4. Missing type annotations in TypeScript/Python are blocking
5. console.log / print() in production code is always a violation
6. TODO comments without ticket reference are always a violation

## 📋 Technical Deliverables

### Review Report Template

## Code Style Review: [branch/PR name]

### Summary
- Files checked: N
- Violations found: N
- Verdict: PASS / FAIL

### Violation V-001: Inconsistent Naming
- **File**: src/utils/userHelper.ts:42
- **Rule**: Use camelCase for variables
- **Found**: `const user_name = getUserName()`
- **Fix**: `const userName = getUserName()`

## ✅ Success Metrics

| Metric | Target |
|--------|--------|
| Style violations caught | 100% |
| False positives | < 2% |
| Fix suggestions accepted | > 95% |
```

把这个文件放到 `~/.claude/agents/code-style-enforcer.md`，就可在 Claude Code 中直接调用。

### 案例 2：多 Agent 协作——登录页从需求到上线的完整流水线

**第 1 步——产品定义：**

```
Use the Product Manager agent to define the login page requirements.
Include user stories, acceptance criteria, and Figma link.
Save to specs/login-page.md.
```

**第 2 步——架构设计：**

```
Use the Backend Architect agent to design the auth API:
- POST /api/auth/login (email + password → JWT)
- POST /api/auth/refresh (refresh token → new JWT)
- Rate limit: 5 attempts per IP per minute
- Idempotency: use request ID header
```

**第 3 步——前端开发 + QA 循环：**

```
Use the Frontend Developer agent to implement the login page.
After each component, use the Evidence Collector agent to:
1. Take screenshots of the rendered page
2. Compare against Figma design
3. Test on mobile (375px) and desktop (1440px)
4. Verify dark mode rendering
Report deviations → send back to Frontend Developer for fixes.
```

**第 4 步——安全检查：**

```
Use the Security Engineer agent to audit:
- SQL injection in auth queries
- JWT token expiry and refresh logic
- Rate limiting enforced server-side
- CSRF protection on login form
- Password hashing (bcrypt with appropriate cost factor)
```

**第 5 步——最终把关：**

```
Use the Reality Checker agent for production readiness assessment.
Default stance: NOT READY until proven otherwise.
Required evidence: all tests passing, performance benchmarks met,
accessibility audit passed, security audit cleared, load test passed.
```

这条流水线的核心：每个环节有专门 Agent 负责，Evidence Collector 和 Reality Checker 形成两道质量防线。

## 踩过的坑

### 坑 1：一次激活太多 Agent → 上下文爆炸

刚拿到 197+ 个 Agent 时，容易想把所有相关的都激活。但每个 Agent 定义本身占用上下文窗口（从几百到几千 token 不等），一次激活 10+ 个会导致 AI 工具上下文不足，反而降低质量。

**解法**：从 2-3 个 Agent 开始（NEXUS-Micro 模式），逐步增加。先跑通最小流水线，再扩展。

### 坑 2：让同一个 Agent 既写代码又审查自己

这是最常见的反模式——让 Frontend Developer 写完代码后，再让它自己检查质量。Agent 会倾向于给自己的代码打 PASS。

**解法**：写代码的 Agent（Developer）和检查质量的 Agent（Evidence Collector / Code Reviewer）必须分开。这是 NEXUS 框架 Dev↔QA 循环的设计核心。

### 坑 3：忽略 Evidence Collector

很多人只激活 Developer Agent，跳过 Evidence Collector——觉得"代码写完了就行"。但 UI 层面的偏差（间距、颜色、排版）肉眼很难全部发现。

**解法**：任何时候涉及 UI 变更，都应让 Evidence Collector 截图对比。截图比文字描述可靠 100 倍。

### 坑 4：Agent 定义长期不更新

Agency Agents 仓库更新频繁（30 天内 34 个 PR）。如果克隆后从不 `git pull`，会错过 Agent 定义的优化和新 Agent 的加入。

**解法**：定期 `git pull` 拉取最新版本。Agent 定义是活文档，社区在持续改进。

### 坑 5：认为 Agent 能替代人的判断

Agent 只是遵循预定义流程的工具——它没有真正的"理解"和"判断力"。Reality Checker 的默认立场是 "NOT READY until proven otherwise"，但最终的 ready/not-ready 判断仍然需要人来确认。

**解法**：把 Agent 当工具用——它帮你做 80% 的重复性检查，剩下的 20% 靠你的判断。

## 适用场景

| 场景 | 推荐 Agent 组合 | Agent 数量 |
|------|----------------|-----------|
| 从零开发 Web App | Product Manager → Backend Architect → Frontend Developer + Evidence Collector → Security Engineer → Reality Checker | 6 |
| 修一个 Bug | Evidence Collector（定位）→ Frontend/Backend Developer（修复）→ Reality Checker（验证） | 3 |
| 做市场推广方案 | Growth Hacker + Content Creator + Social Media Strategist | 3 |
| 代码审查 | Code Reviewer + Security Engineer | 2 |
| 学习新技术 | Codebase Onboarding Agent + Backend/Frontend Architect | 2 |
| 游戏开发（Unity） | Unity Developer + Game Designer + 3D Asset Specialist | 3 |
| 中国市场营销 | 小红书策略师 + 抖音内容策划 + 微信私域运营 | 3 |

适用人群：任何用 AI 辅助开发的工程师——从个人项目到团队协作。尤其适合需要标准化 AI 输出质量的团队场景。

## 历史小故事

2024 年底，一个 Reddit 用户在 r/ClaudeAI 发帖分享了自己用 Claude Code 做项目的经历——他给 Claude 分配了不同"角色"（设计师、开发者、测试员），发现协作效率远超让 Claude 做一个"全能助手"。帖子引发了大量讨论和模仿。

开发者 msitarzewski 决定把这些"角色定义"系统化。他从社区收集、自己设计，最终整理出 197+ 个 Agent 定义，于 2025 年初开源。

项目发布后迅速走红——2 天破万星，随后突破 10 万星。核心原因：它解决了一个真实痛点——"AI 编程工具很强，但我不知道该让它怎么做事"。Agency Agents 给出了答案：**不要告诉 AI "帮我做"，要告诉它"作为 XX 角色，按这个流程做"**。

中文社区也迅速跟进（`jnMetaCode/agency-agents-zh`），新增了 50+ 个中国特有 Agent：微信生态、抖音运营、小红书种草、钉钉协作、政府合规等。目前仓库仍在高速迭代中，社区贡献活跃。

## 学到什么

| 维度 | 核心收获 |
|------|---------|
| **Agent 的本质** | Agent = 人格（身份+性格）+ 流程（SOP）+ 标准（可量化指标）——不是简单的"系统提示词" |
| **多 Agent 协作** | 73% 的失败在交接环节 → 需要质量门禁、标准化交接、证据驱动验证 |
| **NEXUS 框架** | 7 阶段生命周期 + Dev↔QA 循环 + 3 种部署模式（Full/Sprint/Micro） |
| **工程化思维** | 提示词变成可复用、可版本管理、可跨工具使用的工程资产 |
| **社区驱动** | 197+ Agent 由社区迭代，覆盖 14 个领域，支持 17+ 种 AI 工具 |
| **上限与边界** | Agent 是工具，不是人——它做 80% 重复检查，20% 判断靠你 |

记住这个类比：**Agency Agents 是给 AI 编程工具配备的一支专业团队**。你不需要成为每个领域的专家——你只需要知道什么时候该叫哪个"员工"来干活，以及怎么用 Evidence Collector 和 Reality Checker 来检查他们的工作成果。

## 延伸阅读

- [GitHub 仓库](https://github.com/msitarzewski/agency-agents) — 源码、Agent 定义、安装脚本
- [AGENT-ZERO](https://github.com/msitarzewski/AGENT-ZERO) — 配套的状态机开发流程框架
- [中文社区 Fork](https://github.com/jnMetaCode/agency-agents-zh) — 50+ 中国特有 Agent（微信、抖音、小红书等）
- [DeepWiki 文档](https://deepwiki.com/msitarzewski/agency-agents/1-overview) — 完整的技术参考和 Agent 目录
- [掘金中文介绍](https://juejin.cn/post/7618226713330499634) — 中文社区的使用教程

## 关联项目

- **AGENT-ZERO**（同一作者）：定义了 AI 辅助开发的 7 状态工作流（PLAN → BUILD → DIFF → QA → APPROVAL → APPLY → DOCS），包含 Memory Bank（跨会话持久化上下文）、Approval Gates（无批准不修改）等机制。与 Agency Agents 配合使用：Agent 定义提供"角色"，AGENT-ZERO 提供"流程"。
- **agency-agents-zh**（中文社区 Fork）：在原始 197+ Agent 基础上新增 50+ 个中国特有 Agent，覆盖微信生态（公众号、小程序、视频号）、抖音运营、小红书种草、钉钉/飞书协作、政府政策合规等领域。
- **AGENT-ZERO**：不同于 Agency Agents 的"角色库"定位，AGENT-ZERO 是一个可执行的工作流引擎，定义了从计划到文档的完整开发生命周期状态机。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

