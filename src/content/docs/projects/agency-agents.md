---
title: Agency Agents — 用 232 个专业角色组建你的 AI 团队
来源: https://github.com/msitarzewski/agency-agents
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# Agency Agents — 用 232 个专业角色组建你的 AI 团队

## 一、日常类比：你不需要一个"全能员工"

想象你在经营一家广告公司。老板（也就是你）接了一个项目：要做一款面向年轻人的社交 App。

如果你只招一个人，让他既做产品设计、又写后端代码、还负责推广运营——这个人就算再厉害，也很难把每件事都做好。

更合理的做法是：**招一个团队**。每个成员只负责自己最擅长的那一块：

- 产品经理写需求文档
- 前端工程师做界面
- 后端工程师搭 API
- 测试工程师找 Bug
- 市场专员出推广方案

**Agency Agents 做的事情一模一样**——只不过它的"员工"不是真人，而是 232 个经过精心设计的 AI Agent（智能体）。每个 Agent 都有自己的名字、性格、工作流程和交付标准。

## 二、什么是 Agency Agents？

[Agency Agents](https://github.com/msitarzewski/agency-agents) 是一个开源项目，提供了一整套"AI 员工手册"。

它不是一个软件、不是一个框架、也不是一个可以安装运行的程序。**它是一组 Markdown 文件**——每个文件定义了一个 Agent 的"人格"和"工作规范"。

你把它们放到 AI 编程工具（比如 Claude Code、Cursor、Copilot）里，这些工具就会按照每个 Agent 的专业设定来工作。

### 核心结构

整个项目有 **16 个部门（Division）**，涵盖从设计、开发、测试到市场、安全、游戏开发的各个领域：

| 部门 | 包含 Agent 数量 | 职责 |
|------|------|------|
| Design Division | 设计相关 | UI/UX 设计、品牌守护、创意注入 |
| Engineering Division | 开发相关 | 前端、后端、全栈、移动端 |
| Testing Division | 测试相关 | 证据收集、性能基准、API 测试 |
| Marketing Division | 营销相关 | 内容创作、社交媒体、增长策略 |
| Security Division | 安全相关 | 威胁建模、渗透测试、合规审计 |
| ... 等 11 个更多部门 | | |

每个 Agent 文件都遵循相同的模板结构：

1. **Frontmatter** — 元数据（名称、描述、颜色、表情符号）
2. **身份与记忆** — 角色定位、性格特征、经验积累
3. **核心使命** — 这个 Agent 要完成的主要任务
4. **关键规则** — 必须遵守的工作原则
5. **工作流程** — 分步骤的操作指南
6. **成功指标** — 如何判断工作做得好

## 三、核心概念拆解

### 概念 1：Agent = 专业化的人格 + 流程

传统的 AI 提示词是这样的：

```
你是一个开发者，帮我写一段代码。
```

Agency Agents 的 Agent 是这样的：

```markdown
---
name: Frontend Developer
description: Senior frontend wizard who crafts pixel-perfect, accessible, performant web interfaces.
color: green
emoji: 🎨
vibe: The meticulous craftsman who believes every pixel matters.
---

# Frontend Developer Agent Personality

You are **FrontendDeveloper**, a senior frontend engineer with 15+ years of experience building
world-class web interfaces. You specialize in React, TypeScript, CSS, and performance optimization.

## 🎯 Your Core Mission

### Build Production-Ready Interfaces
- Create responsive, accessible, and performant UIs
- Follow modern best practices (WCAG 2.1 AA+, semantic HTML)
- Write clean, maintainable code with proper TypeScript types
```

区别在哪？后者有**明确的角色定位**（15年经验的高级前端）、**具体的质量标准**（无障碍访问、语义化 HTML）、**可衡量的交付物**（类型安全的代码）。

### 概念 2：多 Agent 协作 = 流水线作业

单个 Agent 再好，也有能力边界。Agency Agents 的核心价值在于：**多个 Agent 按顺序协作，完成复杂项目**。

以"从零构建一个 Web App"为例：

```
产品经理 → 架构师 → 前端开发 ↔ 测试 → 集成 → 上线
                              ↑________↓
                         （开发与测试形成持续循环）
```

其中有一个专门的 **Agents Orchestrator** Agent，负责当"项目经理"，自动调度整个流程：

```markdown
## 🔄 Your Workflow Phases

### Phase 3: Development-QA Continuous Loop
- **Task-by-task validation**: Each implementation task must pass QA before proceeding
- **Automatic retry logic**: Failed tasks loop back to dev with specific feedback
- **Quality gates**: No phase advancement without meeting quality standards
- **Failure handling**: Maximum retry limits with escalation procedures
```

### 概念 3：跨工具兼容 = 一套手册，处处可用

同一个 Agent 定义文件，可以通过脚本转换成不同 AI 工具的格式：

| 工具 | 安装方式 | 激活方式 |
|------|------|------|
| Claude Code | 直接复制到 `~/.claude/agents/` | `Use the Frontend Developer agent to...` |
| GitHub Copilot | 复制到 `~/.github/agents/` | 同上 |
| Cursor | 转为 `.mdc` 规则文件 | `Use the @security-engineer rules to...` |
| OpenCode | 放到 `.opencode/agents/` | `@backend-architect design this API` |
| Aider | 编译为单个 `CONVENTIONS.md` | 自动加载 |
| ... 更多 | | |

这意味着：**你只需要维护一套 Agent 定义**，就能在所有主流 AI 编程工具中使用。

## 四、代码示例

### 示例 1：理解一个 Agent 文件的完整结构

这是项目中 **Evidence Collector**（证据收集者）Agent 的一部分——属于测试部门，专门负责截图验证：

```markdown
---
name: Evidence Collector
description: Screenshot-based QA specialist who captures visual proof of bugs, UI states, and design deviations.
color: purple
emoji: 📸
vibe: The detective who never accepts "it looks fine" without photographic evidence.
---

# Evidence Collector Agent Personality

You are **EvidenceCollector**, a QA specialist who believes that a screenshot is worth
a thousand bug reports. You specialize in systematic visual testing, screenshot-based
documentation, and design-vs-reality comparison.

## 🎯 Your Core Mission

### Capture Visual Proof
- Take annotated screenshots of every screen you test
- Highlight specific issues with arrows and callouts
- Compare expected design vs. actual implementation
- Document browser/device/environment context with each capture

## 📋 Your Workflow

### Phase 1: Test Planning
1. Read the design specifications and component documentation
2. Identify all screens and states that need visual verification
3. Create a test checklist with pass/fail criteria for each element

### Phase 2: Systematic Testing
1. Navigate to each screen in the application
2. For each screen, compare against the design specification
3. Take annotated screenshots showing any deviations
4. Log each finding with severity level and reproduction steps
```

**关键点**：注意 `vibe` 字段——"从不接受没有照片证据的'看起来没问题'"。这给 Agent 赋予了一种**性格**，让它在工作时更有倾向性和判断力，而不是冷冰冰地执行指令。

### 示例 2：实际使用场景——启动一个多 Agent 协作流程

假设你要用 Claude Code 启动一个完整的项目。在安装了 Agency Agents 之后，你可以这样操作：

**第一步：让产品经理定义需求**

```
Use the Sprint Prioritizer agent to read the product specification
and create a prioritized task list. Save it to project-tasks/tasklist.md.
```

**第二步：让架构师设计技术方案**

```
Use the Backend Architect agent to design the API schema and database
models based on the task list. Follow the security requirements in the
Security Architect agent's guidelines.
```

**第三步：让开发和测试形成循环**

```
Use the Frontend Developer agent to implement the login page.
After each component, use the Evidence Collector to take screenshots
and verify the implementation matches the design.
```

**第四步：让 Reality Checker 做最终把关**

```
Use the Reality Checker agent to perform a production readiness
assessment of the entire application before we ship.
```

整个过程不需要你手动切换角色、传递上下文——每个 Agent 都知道自己的职责，也知道什么时候该把成果交给下一个 Agent。

## 五、为什么这很重要？

### 1. 降低 AI 使用的门槛

以前，想让 AI 帮你写好一个项目，你需要自己写出非常精确的提示词。现在，**提示词已经有人帮你写好了**——而且是由社区反复迭代过的。

### 2. 从"一个人用 AI"到"一支团队用 AI"

单个 AI 模型的能力是有限的。但通过**专业化分工**，每个 Agent 都在自己擅长的领域达到最高水平。就像现实中你不会让同一个人同时做设计和写代码一样。

### 3. 可复用、可定制、可分享

每个 Agent 都是一个独立的 Markdown 文件。你可以：
- **复制**到自己项目的某个目录
- **修改**其中的规则和工作流
- **分享**给团队成员使用
- **创建**自己的新 Agent

## 六、动手尝试

### 快速上手

```bash
# 克隆项目
git clone https://github.com/msitarzewski/agency-agents.git

# 浏览所有 Agent
ls agency-agents/

# 查看某个 Agent 的完整内容
cat agency-agents/engineering/backend-architect.md
```

### 安装到 Claude Code

```bash
cd agency-agents
./scripts/install.sh --tool claude-code
```

安装完成后，在 Claude Code 中就可以直接使用：

```
Use the Frontend Developer agent to review this component.
```

### 自定义你的第一个 Agent

创建一个新 Agent 非常简单。新建一个 `.md` 文件，填入：

```markdown
---
name: My Custom Agent
description: 一句话描述这个 Agent 做什么
color: blue
emoji: 🎯
---

# My Custom Agent

You are **MyCustomAgent**, [角色描述].

## 🎯 Your Core Mission
1. [任务一]
2. [任务二]
3. [任务三]

## 🚨 Critical Rules
- [规则一]
- [规则二]
```

然后把它放到你的 AI 工具对应的 Agent 目录中即可。

## 七、小结

| 要点 | 说明 |
|------|------|
| 这是什么 | 232 个专业 AI Agent 的定义集合 |
| 怎么工作 | 每个 Agent 是一个 Markdown 文件，定义了角色、流程和标准 |
| 核心价值 | 专业化分工 + 多 Agent 协作 + 跨工具兼容 |
| 适合谁 | 想用 AI 更高效地完成复杂项目的任何人 |
| 学习路径 | 先读几个 Agent 文件感受风格 → 选一个工具安装 → 开始协作 |

记住类比：**Agency Agents 就是给 AI 编程工具配备了一支专业团队**。你不需要成为每个领域的专家——你只需要知道该叫哪个"员工"来干活，以及怎么检查他们的工作成果。
