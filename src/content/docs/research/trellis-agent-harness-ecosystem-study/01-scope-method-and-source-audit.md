---
title: "01. 研究范围、方法与来源审计"
sidebar:
  hidden: true
---
# 01. 研究范围、方法与来源审计

## 1. 研究问题

本轮研究回答五类问题：

1. Trellis 属于什么技术类别，不属于什么类别？
2. Coding Agent Harness / SDD / Context Engineering 生态有哪些主要路线？
3. 每个代表项目的架构、工件、状态、执行与验证机制是什么？
4. 哪些差异只是命名不同，哪些差异会真正改变可靠性和适用场景？
5. 如果要设计或选择一套工程工作流，应该复用哪些机制，避开什么风险？

## 2. 术语边界

### Coding Agent

**Coding Agent（编码代理）** 是真正读取仓库、修改文件、运行命令和与模型循环交互的执行环境，例如 Claude Code、Codex、Cursor、OpenCode。

类比：Coding Agent 是“会操作电脑的工程师”。

### Agent Harness

**Agent Harness（代理运行支架）** 是包围模型和 Coding Agent 的工程控制层，通常包含：

- 上下文装配
- 工具和权限
- 循环与状态
- 任务和角色
- 验证和审批
- 持久化与恢复
- 运行监控

类比：Harness 是工程师所在团队的 SOP、任务系统、代码规范、CI 和交接制度。

### Spec-Driven Development

**SDD（规范驱动开发）** 把可版本化的规范放在代码实现之前，并让规划、实现、验证与规范产生可追踪关系。

不同项目对“spec”的定义不同：

| 路线 | spec 的含义 |
|---|---|
| Spec Kit | 用户场景、需求、计划和任务组成的可执行开发输入 |
| OpenSpec | 变更容器中的 artifact graph，最终合并回长期 specs |
| Trellis | 项目规范库 + 每任务 PRD/设计/实施计划 |
| SpexCode | 描述当前意图、直接绑定代码文件/符号的 living spec |

### Context Engineering

**Context Engineering（上下文工程）** 不是把更多内容塞进窗口，而是决定：

- 什么信息需要持久化？
- 当前角色需要哪一小部分？
- 何时注入？
- 用推送、主动读取还是检索？
- 如何判断信息已过期？

### Memory

本研究把 Memory 分成四类，避免把所有“存文件”都称作记忆：

| 类型 | 示例 | 作用 |
|---|---|---|
| 工作记忆 | `task_plan.md`、`STATE.md` | 当前任务进度与下一步 |
| 项目知识 | `.trellis/spec/`、living specs | 长期规则和系统意图 |
| 情景记忆 | 会话 observation、journal | 过去发生了什么 |
| 结构记忆 | 代码图、调用图、ADR 图 | 系统结构与影响关系 |

## 3. 纳入标准

项目满足以下至少一项才进入 17 仓深度语料：

1. Trellis 仓内的竞品研究直接引用。
2. 与 Trellis 同层，提供可审计的规范、状态、上下文或验证实现。
3. 代表一个不可被其他入选项目替代的架构方向。
4. 是领域中高影响、持续活跃的基础方法或实现。
5. 虽然较新，但提供确定性门禁、spec/code 绑定等独特机制。

同时要求：

- 有公开源码。
- 默认分支可 clone。
- 能识别许可证或明确标注“需复核”。
- 不是仅复制另一项目提示词的低信号仓库。

## 4. 为什么没有 fork 所有搜索结果

“搜索到”不等于“相关可参考”。GitHub 的 `spec-driven-development` 搜索返回大量：

- 只改名称或翻译的派生仓。
- 没有运行时代码的提示词集合。
- 面向小说、Kaggle 或特定业务的垂直模板。
- 已归档的旧版本。
- 与 Trellis 不同层的 Coding Agent 客户端。

本轮将候选分为三圈：

| 圈层 | 处理 |
|---|---|
| 深度语料 | 17 个项目全部 fork + 受控 clone + 源码分析 |
| 生态外围 | 记录定位，不重复 clone 大型 Coding Agent |
| 低信号/重复 | 保留搜索事实，不当成独立技术路线 |

### 生态外围而非同层竞品

`Aider-AI/aider`、`cline/cline`、`RooCodeInc/Roo-Code`、`continuedev/continue`、`anomalyco/opencode`、`anthropics/claude-code` 是重要承载平台或执行代理。Trellis 会适配它们，但研究 Harness 不需要重新深挖每个完整客户端。

### 发现但未进入深度语料

| 项目 | 未纳入原因 |
|---|---|
| `gsd-build/get-shit-done` | 已归档；使用活跃后继 `open-gsd/gsd-core` |
| `gsd-build/gsd-2` | 规模大且与当前 GSD Core 路线重叠；作为迁移背景 |
| `Pimzino/claude-code-spec-workflow` | 已由其更完整的 MCP/仪表盘后继覆盖 |
| `specd-sdd/SpecD` | 确定性 context compiler 很有价值，但当前单维护者、低采用，列为前沿观察 |
| `ruchit07/specloom` | 机制独特但低采用，与 SpexCode/OpenLore 的确定性方向重叠 |
| `k8nstantin/OpenPraxis` | 更接近完整 Agent 工厂与成本平台，超出项目内 Harness 主线 |
| `sengac/fspec` | Gherkin/TDD 工厂方向，当前采用信号较弱 |
| `Engineering4AI/awesome-spec-driven-development` | 索引，不是可分析的实现 |
| `NeoLabHQ/context-engineering-kit` | 高质量技能集合，但主要综合 Spec Kit/OpenSpec/BMAD，机制覆盖重复 |

这不是对项目质量的否定，而是避免把相同思想重复计算成多个技术路线。

## 5. 研究方法

### 阶段 A：广度发现

使用：

- GitHub CLI 仓库搜索与 API 元数据
- Exa 技术搜索
- Trellis 自己保存的竞品研究
- X/Twitter 与 Reddit 的社区讨论
- 官方文档与 npm/PyPI 元数据

搜索主题：

- `agent harness`
- `spec-driven development`
- `context engineering`
- `persistent planning`
- `coding agent memory`
- `spec code drift`

### 阶段 B：版本冻结

所有入选仓库：

1. fork 到 `estelledc`。
2. clone 个人 fork。
3. `origin` 指向个人 fork。
4. `upstream` 指向原项目。
5. 记录默认分支与精确 commit。

### 阶段 C：统一源码观察

每个项目都按同一维度分析：

| 维度 | 观察问题 |
|---|---|
| 定位 | 它解决什么问题，位于哪一层 |
| 工件 | 长期事实写在哪里 |
| 状态 | 下一步由什么确定 |
| 上下文 | 谁选择内容，何时注入 |
| 执行 | 主会话、子 Agent、worktree 如何协作 |
| 验证 | 只是提示，还是有代码门禁 |
| 平台 | 单平台、模板复制还是适配器 |
| 扩展 | 如何加角色、流程、schema、工具 |
| 安全 | 如何保护用户文件、路径、并发和外部输入 |
| 证据 | 测试、CI、benchmark 与源码是否支持宣称 |

### 阶段 D：跨项目归纳

先描述事实，再做两次归纳：

1. **同构识别**：不同命名背后是否是同一机制。
2. **真实差异**：状态是否可执行、上下文是否确定性、门禁是否能阻止错误。

## 6. 来源等级

| 等级 | 来源 | 可支持什么 |
|---|---|---|
| A | pinned commit 源码、测试、配置 | 架构与已实现行为 |
| B | 官方 README、官方文档、release、包清单 | 定位、使用方式、维护状态 |
| C | 作者实名技术讨论 | 设计动机，需与源码交叉验证 |
| D | 社区讨论、介绍文章 | 痛点、采用反馈、候选发现 |
| X | 与源码冲突、无证据二手文 | 只作为错误信息案例 |

## 7. 来源审计实例

### 可信且有价值

- Trellis 官方架构文档把项目定义为“Team-level Agent Harness with built-in LLM wiki”，与 `.trellis/`、CLI 和 hooks 源码一致。
- Reddit 的 Trellis 长文明确披露作者身份，其“按需注入而非全部记住”动机与 hook 实现一致，可用于解释设计动机。
- GitHub API 的创建时间、push 时间、Stars、许可证用于生态快照。

### 明显不可信

搜索结果中的 AINews 文章把 Trellis 描述为：

- Python-first 通用 Agent 框架
- Agent/Tool/Harness 三抽象
- DAG 工作流引擎
- Kubernetes 与 OpenTelemetry 运行平台

当前源码显示 Trellis 的主体是 TypeScript CLI/Core + 分发到项目的 Python scripts，核心对象是编码工作流、平台模板、任务和上下文，不存在该文章声称的通用 Tool Registry/Kubernetes 架构。因此该文章被标记为 X 级，不进入结论。

这个案例说明：**项目名、热门概念和自动生成资讯很容易拼出“听起来合理但不存在”的架构。**

## 8. 本轮限制

1. 没有安装或执行 17 个外部项目的依赖，避免运行未经审查的安装脚本。
2. 没有做真实团队长期实验，因此无法证明流程一定提升交付质量。
3. Stars 只能表示关注度，不能表示生产成熟度。
4. README 的 benchmark 数字只记录为项目宣称，除非仓内有可复核方法和测试。
5. sparse clone 只展开架构、源码、测试和核心文档；大媒体、网站构建产物与完整历史按需取回。

## 关键思考点

1. 如果一个流程只有 Markdown 指令，没有可执行状态，它算 Harness 还是提示词合集？
2. “模型主动选择相关文件”和“代码确定性编译上下文”分别会失败在哪里？
3. 一个项目的 README、spec 和实现冲突时，哪一层才是源真相？
4. Stars 很高但没有运行时门禁的项目，与低 Stars 但有确定性验证的项目，应该如何比较？
5. 多平台支持的价值，是否足以抵消模板漂移和兼容性成本？
