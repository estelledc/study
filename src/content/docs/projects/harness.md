---
title: Harness — Agent 团队架构工厂
来源: https://github.com/revfactory/harness
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 是什么

Harness 是 Revfactory 用 HTML 写的 **Claude Code 插件**，它在 L3 元工厂层（Meta-Factory Layer），做的是"工厂的工厂"——不是自己干活的 agent，而是根据你对项目的描述，自动生成一整套 agent 团队和它们使用的技能。

日常类比：你要开一家餐厅，普通 Claude Code 像一个全能厨师，什么都会做但什么都一般；Harness 像一个餐厅策划师，你说"我要开日料店"，它就帮你设计厨师团队：寿司师傅、拉面师傅、服务员、质检员，还给他们每人写一本操作手册。之后 Claude Code 就按这个团队分工来工作。

## 核心概念

### 1. 6 种团队架构模式

Harness 不是随意分配任务，而是从 6 种预定义的架构模式中挑选最适合你项目的那一种：

| 模式 | 适用场景 | 生活类比 |
|------|----------|----------|
| Pipeline（流水线） | 任务有先后顺序 | 工厂装配线，上一步做完交给下一步 |
| Fan-out/Fan-in（扇出扇入） | 多个独立任务可并行 | 一个经理把活分给几个人同时干，最后汇总 |
| Expert Pool（专家池） | 需要按问题类型选对人 | 医院的分诊台，不同症状找不同科室 |
| Producer-Reviewer（生产者-评审者） | 写完后需要质量把关 | 文章写完要编辑审稿 |
| Supervisor（监督者） | 一个主 agent 分配动态任务 | 项目经理根据情况灵活派活 |
| Hierarchical Delegation（层级委派） | 多层递归分解任务 | 公司从 CEO 到 VP 到总监层层下达 |

### 2. Agent Teams 与 Subagents 两种执行模式

Harness 生成团队后，Claude Code 可以用两种方式执行：

- **Agent Teams**（默认）：像真实的团队合作，agent 之间用 TeamCreate + SendMessage + TaskCreate 协作，适合 2 个以上 agent 需要互相配合的场景
- **Subagents**：直接调用 Agent 工具，适合一次性任务，不需要 agent 之间沟通

### 3. 六阶段流水线

```
Phase 1: 领域分析 → Phase 2: 团队架构设计 → Phase 3: Agent 定义生成
Phase 4: 技能生成 → Phase 5: 集成编排 → Phase 6: 验证测试
```

每个阶段自动生成文件，输出到项目的 `.claude/agents/` 和 `.claude/skills/` 目录下。

## 代码示例

### 示例 1：安装并触发 Harness

安装只需要一行 Claude Code 命令：

```
/plugin marketplace add revfactory/harness
/plugin install harness@harness-marketplace
```

装好后，在 Claude Code 里输入自然语言描述你的项目：

```
Build a harness for this project
```

Claude Code 就会进入 Harness 的六阶段流水线，自动生成团队架构。

### 示例 2：构建一个代码审查团队

假设你在做一个 Python 项目，想让多个 agent 并行审查不同类型的代码问题：

```
Build a harness for comprehensive code review.
I want parallel agents checking architecture,
security vulnerabilities, performance bottlenecks,
and code style — then merging all findings
into a single report.
```

Harness 会分析你的项目，选择 Fan-out/Fan-in 模式（因为 4 个审查任务相互独立可并行），然后生成如下文件结构：

```
your-project/
├── .claude/
│   ├── agents/
│   │   ├── architect.md          # 架构审查 agent
│   │   ├── security.md           # 安全审查 agent
│   │   ├── performance.md        # 性能审查 agent
│   │   └── stylist.md            # 代码风格审查 agent
│   └── skills/
│       ├── review/
│       │   └── SKILL.md          # 统一评审协调技能
│       ├── arch-check/
│       │   └── SKILL.md          # 架构检查技能
│       ├── sec-check/
│       │   └── SKILL.md          # 安全检查技能
│       └── perf-check/
│           └── SKILL.md          # 性能检查技能
```

每个 `.md` 文件定义了该 agent 的职责、触发条件、输入输出格式和协作协议。

### 示例 3：输出文件的内容结构

生成的 agent 定义文件（如 `agents/qa.md`）长这样：

```yaml
# agents/qa.md
name: qa
description: 负责全面测试和质量保证的 agent
team_create:
  name: qa-team
  members:
    - test-designer
    - bug-finder
    - regression-checker
orchestration:
  pattern: producer-reviewer
  data_passing:
    - test_plan -> bug-finder
    - findings -> regression-checker
error_handling:
  fallback: notify-supervisor
  retry_limit: 3
```

生成的技能文件（如 `skills/qa/SKILL.md`）则包含 Progressive Disclosure 设计——把信息分层，只在需要时加载详细信息，避免一次性塞满上下文窗口。

## 为什么重要

### 1. 复杂度越高的项目，收益越大

Harness 官方做了一组 A/B 实验（15 个软件工程任务），结果如下：

| 指标 | 不使用 Harness | 使用 Harness | 提升 |
|------|---------------|-------------|------|
| 平均质量评分 | 49.5 | 79.3 | +60% |
| 胜率 | — | 15/15 | 100% |
| 输出方差 | — | — | -32% |

任务越难，提升越大：基础任务 +23.8，高级任务 +29.6，专家级任务 +36.2。这说明 Harness 的价值不在于让简单任务更快，而在于让困难任务做对。

### 2. 它处于 Claude Code 生态的"元层"

理解 Harness 的定位很重要，它和周围工具的关系：

- **Archon**：同属 L3 层但隔壁房间。Archon 生成确定性的运行时配置，Harness 生成团队架构。两者互补，可以组合使用
- **meta-harness**：Harness 的 Codex 版本，跨运行时可用
- **ECC**：在 Harness 之上，用于跨 harness 标准化技能和规则
- **LangGraph**：不同赛道。LangGraph 侧重长时间运行的状态恢复编排，Harness 侧重 Claude Code 原生的快速团队设计

### 3. 一键产出可维护的团队

没有 Harness 时，手动设计 agent 团队需要：了解 6 种架构模式、知道每种模式何时适用、写每个 agent 的定义文件、设计 agent 之间的数据传递协议。Harness 把这一切变成一句话——你说清楚领域，它搞定剩下所有。

## 关键要点总结

1. Harness 是"工厂的工厂"，生成 agent 团队和技能，不直接干活
2. 6 种架构模式覆盖常见协作场景，它会自动选最合适的
3. 输出是标准的 Claude Code agent 定义文件和技能文件，可直接运行
4. A/B 实验显示 +60% 质量提升，任务越难提升越大
5. 支持 Agent Teams（多 agent 协作）和 Subagents（单次任务）两种模式
6. 安装只需两行命令，触发只需一句"Build a harness for this project"

## 思考题

你觉得在什么样的项目里，用 Harness 的收益最大？反过来，什么情况下你可能不需要它？
