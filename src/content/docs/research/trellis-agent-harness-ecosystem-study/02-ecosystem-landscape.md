# 02. 生态全景与发展现状

## 1. 核心判断

截至 2026-07，Coding Agent 工程正在从“模型能不能写代码”转向“系统能不能让模型长期、可控、可验证地写代码”。

领域演进可以粗略分成三步：

```text
Prompt Engineering
  关注一句话怎么说
        |
        v
Context Engineering
  关注模型现在能看到什么
        |
        v
Harness Engineering
  关注上下文、状态、工具、角色、门禁和恢复如何组成系统
```

三者不是互相替代：

- Prompt 仍是局部行为接口。
- Context 决定 Agent 当前能否作出正确判断。
- Harness 决定长任务如何持续推进、失败后如何恢复、结果如何验收。

## 2. 为什么这个领域在 2025-2026 爆发

17 个语料仓中，除 BMAD 外几乎都创建于 2025 年下半年或 2026 年。共同驱动力不是某个新模型，而是 Coding Agent 普及后暴露出的系统性问题：

1. **Context Rot**：窗口越长，关键约束越容易被淹没。
2. **Session Amnesia**：新会话不知道上次做了什么。
3. **Requirement Drift**：实现逐渐偏离最初意图。
4. **Self-review Bias**：写代码的 Agent 容易高估自己的结果。
5. **Parallel Conflict**：多 Agent 同时改一个工作区会互相覆盖。
6. **Platform Fragmentation**：每个平台有不同的 skills、agents、hooks 和命令格式。
7. **Prompt-only Enforcement**：写了“必须测试”不等于真的执行了测试。

## 3. 领域技术栈

```text
Layer 6  Human governance
         审批、范围、最终 merge、风险接受

Layer 5  Verification and policy
         tests、lint、review、drift、architecture gate、evidence

Layer 4  Workflow and orchestration
         phase、task、subagent、worktree、queue、retry、finish

Layer 3  Context and memory
         spec、plan、journal、session、retrieval、code graph

Layer 2  Platform adapters
         Claude/Codex/Cursor/OpenCode 的配置与 hook 投影

Layer 1  Coding agent runtime
         文件、Shell、Git、MCP、编辑器、模型循环

Layer 0  Foundation model
         Claude、GPT、Gemini、本地模型
```

Trellis 主要覆盖 Layer 2-5；OpenLore 重点覆盖 Layer 3 和 5；Spec Kit/OpenSpec 重点覆盖 Layer 3-4；claude-mem/memU/Acontext 重点覆盖 Layer 3。

## 4. 五条主要路线

### 路线 A：阶段式 SDD

代表：

- GitHub Spec Kit
- BMAD
- GSD Core
- PRPs Agentic Engineering

典型流程：

```text
Intent -> Clarify -> Spec -> Plan -> Tasks -> Implement -> Verify
```

优势：

- 工件明确。
- 适合复杂需求和新项目。
- 容易形成评审点。

代价：

- 对小改动可能过重。
- 阶段和文档过多会制造“完成表格”而非真实交付。
- 如果阶段只由提示词约束，仍可能跳步。

### 路线 B：流动 Artifact Graph

代表：OpenSpec。

它不把流程写死成单一瀑布，而是把 proposal、specs、design、tasks 定义为有依赖关系的 artifact graph：

```text
artifact A complete
      |
      v
artifact B becomes ready
```

优势：

- 工件依赖可验证。
- 流程可通过 schema 定制。
- 适合 brownfield 与跨仓规划。

代价：

- artifact 完成仍以文件存在为主，文件质量需要额外验证。
- schema、store、workset 等概念增加学习成本。

### 路线 C：Skills 方法论

代表：

- Superpowers
- Compound Engineering
- Agent OS

核心不是一个独立状态机，而是一组可组合的高质量技能：

- brainstorming
- planning
- TDD
- review
- debugging
- compounding

优势：

- 易嵌入现有 Coding Agent。
- 单个 Skill 可以独立复用。
- 渐进采用成本低。

代价：

- 强制性依赖宿主是否正确触发 Skill。
- 跨 Skill 状态与整体恢复通常弱于专用任务系统。

### 路线 D：文件化工作记忆

代表：

- Planning with Files
- GSD 的 `.planning/`
- Trellis 的 `.trellis/tasks/` 与 workspace journals

核心原则：

```text
上下文窗口 = RAM
仓库文件 = Disk
```

优势：

- 可恢复、可审计、可被 Git 管理。
- 不依赖专用向量数据库。
- 人和 Agent 可共同阅读。

代价：

- 文件写了不代表会被重新读取。
- 并发写、过期和重复记录仍需机制治理。

### 路线 E：记忆与确定性治理

代表：

- Acontext：把学习结果写成 Skill 文件。
- memU：Markdown recall files + embedding retrieval。
- claude-mem：hooks + worker + observations + hybrid search。
- SpexCode：Git 版本 + spec/code drift + eval。
- OpenLore：静态代码图 + deterministic verdict。

这条路线反映了生态下一阶段的重点：从“保存更多信息”转向“控制信息质量、来源、有效期和行为约束”。

## 5. 17 项目定位快照

数据快照：2026-07-16。Stars 只是关注度，不是质量评分。

| 项目 | Stars | 主定位 | 控制手段 | 当前状态 |
|---|---:|---|---|---|
| Trellis | 12.7K | 团队级跨平台 Harness | task + hooks + skills + channel + mem | 高速活跃 |
| Spec Kit | 121.7K | 完整 SDD toolkit | constitution + spec + plan + task | 高速活跃 |
| OpenSpec | 61.1K | 轻量、流动 SDD | artifact graph + delta/archive | 高速活跃 |
| BMAD | 50.6K | 角色化全生命周期方法 | modules + agents + workflows | 高速活跃 |
| Superpowers | 255.8K | 强纪律 skills 方法论 | mandatory skills + TDD + reviews | 高速活跃 |
| Planning with Files | 25.4K | 持久工作记忆 | 3 files + hooks + gate + ledger | 活跃 |
| GSD Core | 6.7K | 长任务 Context Engineering | phase loop + fresh subagents | 高速活跃，RC 分支 |
| Agent OS | 5.0K | 项目标准提取/注入 | standards index + shaping | 较轻、更新较慢 |
| Spec Workflow MCP | 4.2K | MCP SDD + 审批 UI | MCP tools + dashboard gate | 作者暂时休整 |
| Compound Engineering | 23.2K | 知识复利工程方法 | plan/work/review/compound | 高速活跃 |
| PRPs Agentic Eng | 2.2K | 一次成功的上下文包 | PRP + validation loops | 活跃 |
| Context Engineering Intro | 13.7K | PRP 教学模板 | INITIAL -> PRP -> execute | 稳定、更新较慢 |
| Acontext | 3.5K | Skill 形态的 Agent memory | distill + skill agent | 活跃，v0.x |
| memU | 14.0K | 跨 Agent 文件记忆 | recall files + embeddings | 高速活跃，Beta |
| claude-mem | 87.4K | 自动会话记忆压缩 | hooks + worker + SQLite/Chroma | 高速活跃 |
| SpexCode | 61 | spec/code/eval 闭环 | Git + linter + worktrees | 很新、快速变化 |
| OpenLore | 198 | 确定性架构记忆与治理 | static graph + MCP verdicts | 新、机制密集 |

## 6. 生态已收敛的共识

### 共识 1：仓库文件是跨会话最稳的共同接口

几乎所有项目都把关键事实写入仓库：

- Markdown 易读。
- Git 可版本化。
- 不绑定某个模型。
- 不要求每次都重放对话。

### 共识 2：长任务需要新鲜上下文

Superpowers、GSD、BMAD、Trellis、Compound Engineering 都倾向：

- 主会话负责协调。
- 子 Agent 负责独立任务。
- 实现和检查使用不同角色。
- 不把整段历史复制给每个子 Agent。

### 共识 3：规划必须带验证

单纯“列任务”不足以约束 Agent。成熟方案要求：

- 可执行命令。
- 测试文件或场景。
- 接受标准。
- 独立 reviewer。
- 失败后回路。

### 共识 4：多平台逐渐围绕相同原语收敛

主流宿主逐步提供：

- `AGENTS.md` / `CLAUDE.md`
- Agent Skills
- 子 Agent
- hooks
- MCP
- worktree 或隔离执行

差异越来越多体现在文件格式和事件名，而不是能力类别。

### 共识 5：默认应保护用户已有内容

Trellis、Compound Engineering、Spec Kit 等都出现：

- managed blocks
- hash manifest
- 原子写
- 用户修改检测
- 不覆盖 symlink 或 unmanaged path

这说明“安装/更新 Harness”本身已经成为需要认真设计的迁移系统。

## 7. 尚未收敛的争议

### 争议 1：刚性阶段还是流动工件

| 刚性阶段 | 流动工件 |
|---|---|
| 易理解、易审计 | 易回退、易迭代 |
| 防跳步 | 降低瀑布感 |
| 小任务偏重 | 可能缺少强门禁 |

Spec Kit/BMAD 偏左，OpenSpec 偏右，Trellis 位于中间：有阶段，但允许轻量任务只写 PRD。

### 争议 2：Agent 选择上下文还是程序编译上下文

| Agent 选择 | 程序选择 |
|---|---|
| 灵活，适应未知问题 | 可重复、可测试 |
| 可能漏读或过读 | 需要事先建模依赖 |

Trellis 的 JSONL manifest 是“人工/Agent 策展 + 程序注入”；OpenLore/SpexCode 更强调确定性关系。

### 争议 3：全文文件还是向量检索

- Acontext 主张 progressive disclosure，不使用 embedding top-k。
- memU 主张一次 embedding 查询返回 segment/file/resource 三层。
- claude-mem 采用 SQLite + Chroma hybrid。
- Trellis `mem` 当前使用本地 session 解析和关键词密度排序。

没有一个方案对所有记忆类型都最优。

### 争议 4：Prompt gate 是否足够

强措辞如“MUST”“不可跳过”依赖模型服从；真正的 gate 需要代码能返回非零、阻止状态迁移或阻止 merge。

生态正在从：

```text
请务必测试
```

转向：

```text
没有测试证据 -> 状态不能完成 / hook 阻止提交
```

## 8. 当前最重要的发展方向

1. **Deterministic Context Compilation**：上下文选择从启发式转向可重复算法。
2. **Spec/Code Drift**：规范不再只是生成前材料，而是持续检查对象。
3. **Evidence-carrying Completion**：完成状态必须携带命令、结果和外部证据。
4. **Cross-agent Memory**：记忆从单一 Claude 插件转向多个 Agent 共享。
5. **Worker Isolation**：并行 Agent 逐步依赖 worktree 或独立 workspace。
6. **Trust and Safety**：路径穿越、symlink、并发锁、外部提示注入成为一等问题。
7. **Token-aware Architecture**：技能列表、MCP schema、长文档和重复上下文开始有明确预算。
8. **Human Attention Design**：让人审批需求、风险和 merge，而不是逐行看每次 Agent 操作。

## 9. 对 Trellis 的生态定位

Trellis 的覆盖面比单一 SDD 工具更广，但比完整 Coding Agent 更窄：

```text
OpenSpec / Spec Kit
  规范工件更专注
        \
         \
          Trellis
         /  \
Skills 方法   Memory/Channel
Superpowers   claude-mem / orchestration runtime
```

它的机会：

- 用一个项目模型统一团队规范、任务、记忆和平台。
- 把 Harness 从个人 dotfiles 提升到可评审的仓库资产。

它的风险：

- 同时维护太多平台，兼容性成本高。
- Markdown、Python runtime、TypeScript CLI 和各平台模板之间存在多源真相风险。
- 功能面扩大到 channel/mem 后，产品边界可能变模糊。
- 部分强制仍是 prompt 级，不是确定性 runtime gate。

## 关键思考点

1. SDD 是 Harness 的必要组成，还是一个可插拔模块？
2. “跨平台一致”应该保证工件一致，还是保证行为完全一致？
3. 当模型足够强时，刚性流程的边际价值会下降，还是验证价值会更高？
4. 记忆系统应该存“原始经历”“提炼结论”还是“可执行技能”？
5. 人的最佳介入点是需求、计划、失败、review 还是 merge？
