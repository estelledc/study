---
title: Codex Skills 精选 — 让 AI 编程助手长出"专业特长"
来源: https://github.com/ComposioHQ/awesome-codex-skills
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

# Codex Skills 精选 — 让 AI 编程助手长出"专业特长"

## 一个类比：厨师与菜谱

想象你去一家餐厅。厨师（AI）本身厨艺不错，但他如果只靠"通用菜谱"做所有菜，做出来的东西可能中规中矩。

现在给他一套**专业菜谱手册**（Skills）：

- 川菜手册告诉他：花椒要用汉源的，麻婆豆腐要分三次勾芡
- 披萨手册告诉他：面团要冷藏 24 小时，烤炉必须是 400 度石窑

有了这些手册，同一个厨师就能从"会做饭的人"变成"专做川菜的师傅"或"意式披萨大师"。

**Codex Skills 就是这个道理。** Codex 是一个 AI 编程助手，Skills 是教它"特定任务该怎么做好"的手册。

---

## 核心概念：什么是 Codex Skill？

一个 Skill 就是一个**文件夹**，里面至少有一个 `SKILL.md` 文件。这个文件告诉 Codex 两件事：

1. **什么时候用我**（描述 `description`）
2. **用了之后该怎么做**（正文 `body`）

```
my-skill/
├── SKILL.md          ← 必须有：指令 + YAML 元数据
├── scripts/          ← 可选：自动化脚本
├── references/       ← 可选：详细说明文档
└── assets/           ← 可选：模板、图标等输出素材
```

**关键设计：渐进式加载（Progressive Disclosure）**

```
Level 1: 元数据（name + description）—— 始终在内存中，约 100 词
Level 2: SKILL.md 正文 —— 只在 Skill 触发后才加载
Level 3: 附属资源 —— 按需加载，不占内存
```

这就像你手机的 App：图标永远在桌面上（元数据），点进去才加载内容（正文），不会把所有 App 的完整功能同时塞进 RAM。

---

## 如何安装一个 Skill？

**方法一：用 Skill Installer（推荐）**

```bash
git clone https://github.com/ComposioHQ/awesome-codex-skills.git
cd awesome-codex-skills

python skill-installer/scripts/install-skill-from-github.py \
  --repo ComposioHQ/awesome-codex-skills \
  --path meeting-notes-and-actions
```

这会把 Skill 安装到 `$CODEX_HOME/skills/`（默认 `~/.codex/skills/`），然后重启 Codex 就生效了。

**方法二：手动安装**

把 Skill 文件夹直接复制到 `~/.codex/skills/`，重启 Codex 即可。

---

## 代码示例：一个 Skill 长什么样？

### 示例 1：最小模板

```yaml
---
name: template-skill
description: Replace with description of the skill and when Claude should use it.
---
```

```markdown
# Insert instructions below
```

这就是一个完整 Skill 的最小形式。两个字段：名字和描述。

### 示例 2：实用的"会议纪要" Skill

```yaml
---
name: meeting-notes-and-actions
description: >
  Turn meeting transcripts or rough notes into crisp summaries with decisions,
  risks, and owner-tagged action items; use for Zoom/Meet/Teams transcripts,
  call notes, or long meeting chats to generate share-ready outputs.
metadata:
  short-description: Meeting transcript to notes and actions
---

# Meeting Notes & Actions

## Inputs to ask for
- Source: pasted transcript/text or file path; meeting title/date; attendees.
- Output style: terse bullets vs. narrative, action-item format, due date/owner tags.

## Workflow
1) Normalize text: strip timestamps/speaker labels if noisy.
2) Extract essentials: agenda topics, key decisions, open questions, risks.
3) Action items: who/what/when. Propose due dates if missing.
4) Produce output with Summary, Decisions, Open Questions, Action Items sections.
```

这个 Skill 告诉 Codex：当你给它一段会议录音文字稿时，它应该自动提取"谁做了什么、什么时候做完"，而不是只给你一段泛泛的摘要。

### 示例 3：Skill Creator — 教 Codex 写 Skill

`awesome-codex-skills` 仓库里还有一个"教怎么写 Skill"的 Skill，它的 `description` 很长，因为需要覆盖各种触发场景：

```yaml
---
name: skill-creator
description: >
  Guide for creating effective skills. This skill should be used when users want
  to create a new skill (or update an existing skill) that extends Codex's
  capabilities with specialized knowledge, workflows, or tool integrations.
---
```

这个 Skill 本身就是一个 Skill——教你怎么写出更好的 Skill。

---

## 仓库里有哪些类型的 Skill？

`awesome-codex-skills` 按类别分了 5 个大类：

### 1. 开发与代码工具

| Skill | 用途 |
|---|---|
| `codebase-migrate` | 大批量代码迁移和多文件重构 |
| `pr-review-ci-fix` | PR 审查 + CI 自动修复循环 |
| `sentry-triage` | 自动把报错栈映射到本地代码 |
| `mcp-builder` | 构建和评估 MCP 服务器 |

### 2. 生产力与协作

| Skill | 用途 |
|---|---|
| `connect` | 连接 1000+ 应用（Slack、GitHub、Notion 等） |
| `linear` | 在 Linear 中管理 Issue 和项目 |
| `meeting-notes-and-actions` | 会议纪要转行动项 |
| `notion-spec-to-implementation` | Notion 需求文档直接转实施计划 |

### 3. 沟通与写作

| Skill | 用途 |
|---|---|
| `email-draft-polish` | 起草、改写、精简邮件 |
| `changelog-generator` | 从提交记录自动生成 Changelog |
| `tailored-resume-generator` | 根据 JD 定制简历 |

### 4. 数据与分析

| Skill | 用途 |
|---|---|
| `spreadsheet-formula-helper` | 编写和调试表格公式 |
| `datadog-logs` | 从终端筛选 Datadog 日志 |
| `lead-research-assistant` | 潜在客户研究与信息补充 |

### 5. 元工具与辅助

| Skill | 用途 |
|---|---|
| `skill-installer` | 安装和管理 Skill |
| `skill-creator` | 创建新 Skill 的指导 |
| `template-skill` | 新建 Skill 的空白模板 |
| `brand-guidelines` | 应用品牌色彩和字体规范 |

---

## 为什么这个仓库有价值？

**13.6k Star** 不是偶然的。它解决了一个实际痛点：

> "我知道 AI 能帮我做很多事，但怎么告诉它'按我的方式做'？"

Skills 就是答案。你把重复做的事情写成 Skill，AI 就永远按你的标准来做了。

这个仓库的精选价值在于：

- **不需要从零开始** — 直接用别人写好的
- **每个都是可运行的** — 不是概念验证，是真实在工作流中使用的
- **有统一的安装工具** — `skill-installer` 一键搞定
- **社区持续贡献** — 65 个 PR，45 次提交，说明活跃度高

---

## 一句话总结

**Codex Skills = 给 AI 编程助手的"专业技能手册"**。`awesome-codex-skills` 就是这本手册的"精选目录"，让你不用自己一本本写，直接选用别人写好的，或者在此基础上修改。

---

*本文基于 ComposioHQ/awesome-codex-skills 仓库 README 及 Skill 模板整理。*
