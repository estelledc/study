---
title: "Ruflo — 让 Claude Code 拥有神经系统：多智能体编排平台"
来源: https://github.com/ruvnet/ruflo
日期: 2026-06-13
分类_原始: AI 工具
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Ruflo — 让 Claude Code 拥有神经系统

## 一、从日常类比开始

想象你有一支装修队。

只雇一个工人（Claude Code 单独使用），他能帮你刷墙、铺地板、装灯具。但他一个人做所有事，做完了还要告诉你"我干完了，接下来做什么"——你既是工人又是项目经理。

Ruflo 做了什么？它给这个工人装上了神经系统：

- 它不是一个工人，而是一群各有专长的工人——有人专门刷墙，有人专门铺地板，有人专门质检
- 他们之间能自动沟通："我把墙刷好了，地板师傅可以进场了"
- 他们还记得之前的经验："上次这个颜色没刷匀，这次注意"
- 如果某个工人偷懒了，其他人会发现并上报

Ruflo 的本质：**给 Claude Code 加了一个多智能体协作层，让 AI 不再单打独斗，而是组成团队一起干活。**

---

## 二、Ruflo 是什么

Ruflo（原名 Claude Flow）是一个由 rUv 开发的开源多智能体编排平台，运行在 Claude Code 之上。

它的口号是："Multi-agent AI harness for Claude Code and Codex."

一句话解释：你告诉 Ruflo 要做什么，它自动拆分任务、分配给不同的 AI 智能体，协调它们一起完成，还能从每次协作中学习改进。

### 核心数据

| 指标 | 数值 |
|------|------|
| 内置智能体 | 100+ 个（编码、测试、安全、文档、架构等） |
| 插件数量 | 33 个官方插件 + 21 个 npm 插件 |
| 支持的 LLM | Claude、GPT、Gemini、Cohere、Ollama（5 家） |
| 通信协议 | MCP（Model Context Protocol） |
| 许可 | MIT |
| 底层引擎 | Rust 基于 Cognitum.One 架构 |

---

## 三、核心概念

### 3.1 智能体（Agents）—— 团队的每个成员

Ruflo 里有 100 多个专门化的 AI 智能体，每个都有自己的角色。比如：

- `coder` 智能体：专门写代码
- `tester` 智能体：专门找 bug
- `reviewer` 智能体：专门审查代码质量
- `architect` 智能体：专门做架构设计

类比：一个足球队里有前锋、后卫、守门员，各司其职。

### 3.2 蜂群协作（Swarm Coordination）—— 团队的协作方式

智能体不会各自为战，它们通过蜂群模式协作。有三种组织方式：

- **层级模式（Queen-led）**：有一个"女王智能体"负责分配任务，像公司里的项目经理
- **网状模式（Mesh）**：所有智能体对等通信，像松散的协作团队
- **自适应模式（Adaptive）**：根据任务自动选择最佳协作方式，最灵活

类比：层级模式像军队，网状模式像开源社区，自适应模式像急诊室（根据病情自动决定谁负责什么）。

### 3.3 记忆系统（Memory & Learning）—— 团队的经验库

Ruflo 的记忆系统比 Claude Code 自带的会话记忆强大得多：

- **AgentDB**：向量数据库，用来存储智能体的经验
- **HNSW 索引**：让记忆检索速度比暴力搜索快 1.9 到 4.7 倍
- **SONA 神经网络**：智能体能从过去的成功经验中学习，越来越聪明
- **ReasoningBank**：存储推理模式，遇到类似问题时自动调用

类比：团队里有个共享笔记本，每次完成任务后把经验和教训记下来，下次遇到类似情况就翻笔记。

### 3.4 联邦通信（Federation）—— 跨团队的秘密通话

不同机器、不同组织上的 Ruflo 实例可以安全地让智能体互相通信。它用零信任模型：

- 每次通信前自动脱敏（去掉邮箱、密钥等个人信息）
- 用 mTLS + ed25519 验证身份，不需要共享 API 密钥
- 智能体的可信度会持续评分——表现好的获得更多权限，表现差的自动降级

类比：两个公司之间需要交换文件，但不直接共享内部资料。先自动去掉敏感信息，验证对方身份，然后安全传输。

### 3.5 目标规划器（Goal Planner / GOAP）—— 从意图到行动的翻译器

你只需要用自然语言描述目标，Ruflo 的 GOAP A* 规划器会自动：

- 提取成功标准
- 找出隐含的前提条件
- 规划出一条最短的行动路径
- 当某步失败了，自动重新规划而不是从头重来

类比：你说"我要做一顿晚餐"，规划器自动拆解成"买食材 -> 洗菜 -> 切菜 -> 炒菜 -> 摆盘"，如果"买食材"发现没盐了，自动插入"先买盐"的步骤。

### 3.6 插件系统（Plugin Marketplace）—— 团队的扩展技能包

Ruflo 通过插件体系扩展能力。33 个官方插件覆盖了：

- **核心编排**：swarm、autopilot、后台任务调度
- **记忆与知识**：向量搜索、知识图谱
- **智能与学习**：行为模式、本地 LLM 路由
- **代码质量**：测试生成、浏览器自动化、Git diff 分析
- **安全合规**：漏洞扫描、提示注入防护
- **架构方法**：领域驱动设计、5 阶段开发法
- **运维监控**：数据库迁移、结构化日志、成本追踪

---

## 四、安装与使用

### 4.1 两种方式

| | 方式 A：CLI 安装（推荐） | 方式 B：Claude Code 插件（轻量） |
|---|---|---|
| 安装命令 | `npx ruflo@latest init` | `/plugin install ruflo-core@ruflo` |
| 给你的能力 | 全部：98 个智能体、60+ 命令、30 个技能、MCP 服务器、hook 系统 | 只有斜杠命令和几个智能体定义 |
| 文件影响 | 在仓库里创建 `.claude/`、`.claude-flow/`、`CLAUDE.md` 等 | 零文件改动 |
| 适合场景 | 生产使用，所有功能完整可用 | 想先试试，不承诺全面使用 |

### 4.2 CLI 快速安装

```bash
# 交互式引导（推荐新手）
npx ruflo@latest init wizard

# 快速非交互式安装
npx ruflo@latest init

# 或者全局安装
npm install -g ruflo@latest
```

安装完成后，Ruflo 会自动安装 hook 系统，后续你在 Claude Code 里说的话会自动被路由到合适的智能体。

### 4.3 注册 MCP 服务器（完整使用必须）

```bash
claude mcp add ruflo -- npx ruflo@latest mcp start
```

这步让 Claude Code 能调用 Ruflo 提供的 MCP 工具（如 `memory_store`、`swarm_init`、`agent_spawn` 等）。

---

## 五、代码示例

### 示例 1：联邦通信 — 让两个团队的智能体安全协作

假设你（Team A）和另一个团队（Team B）需要共享一些分析结果，但不想泄露客户隐私数据。

```bash
# Team A：初始化联邦网络，生成密钥对
npx ruflo@latest federation init

# Team A：加入 Team B 的联邦端点
npx ruflo@latest federation join wss://team-b.example.com:8443

# Team A：发送任务 — 个人信息会自动脱敏后再发出
npx ruflo@latest federation send --to team-b \
  --type task-request \
  --message "Analyze transaction patterns for account anomalies"

# 查看协作状态和可信度评分
npx ruflo@latest federation status
```

这背后发生了什么：

1. `federation init` 生成 ed25519 密钥对，建立你的联邦身份
2. `federation join` 用 mTLS 协议与 Team B 建立安全连接
3. `federation send` 发送消息前，14 种检测管道自动扫描并移除邮箱、密钥等 PII 数据
4. 消息经过加密通道传输，Team B 的智能体接收后验证你的身份
5. `federation status` 查看对方的可信度评分（基于成功率、在线率、安全性等）

### 示例 2：目标规划 — 用自然语言驱动智能体团队

```bash
# 你只用自然语言描述目标
goal.ruv.io 输入:
"Ship the auth refactor with tests and a PR"

# 智能体收到后，GOAP 规划器自动分解：
# 1. 分析当前认证代码结构
# 2. 规划重构方案（architect 智能体）
# 3. 执行代码修改（coder 智能体）
# 4. 生成测试用例（tester 智能体）
# 5. 运行测试验证（tester 智能体）
# 6. 审查代码质量（reviewer 智能体）
# 7. 创建 Git 提交
# 8. 发起 Pull Request（devops 智能体）

# 如果有某步失败（比如测试未通过），规划器会自动重新 A* 搜索
# 找到最优的补救路径，而不是从头再来
```

goal.ruv.io 提供可视化界面，可以看到：

- 目标分解成的行动树，每个节点显示进度
- 每个智能体的角色、当前步骤、记忆命名空间、token 预算
- 失败的分支高亮显示，支持一键回滚
- 所有历史计划和学习到的经验存入 AgentDB，未来类似任务自动复用

### 示例 3：安装和使用插件

```bash
# 方式 A：通过 Claude Code 斜杠命令安装单个插件
/plugin marketplace add ruvnet/ruflo
/plugin install ruflo-core@ruflo
/plugin install ruflo-swarm@ruflo
/plugin install ruflo-rag-memory@ruflo

# 方式 B：通过 CLI 安装（全局）
npx claude-flow@latest plugins install @claude-flow/plugin-agent-federation

# 安装后，新的斜杠命令就可用了
# 例如使用联邦功能：/federation init
# 使用蜂群协调：/swarm init
# 使用记忆存储：/memory_store
```

---

## 六、Ruflo vs Claude Code 单独使用

| 能力 | Claude Code 单独 | + Ruflo |
|------|------------------|---------|
| 智能体协作 | 孤立运行，无共享上下文 | 蜂群协作，共享记忆和共识 |
| 协调方式 | 你手动编排 | 女王式层级（Raft、拜占庭、Gossip） |
| 记忆 | 仅会话级别 | HNSW 向量记忆，亚毫秒检索 |
| 学习 | 行为固定 | SONA 自我学习，模式匹配 |
| 任务路由 | 你决定交给谁 | 智能路由（89% 准确率） |
| 后台任务 | 无 | 12 个自动触发的后台工作者 |
| LLM 提供商 | 仅 Anthropic | 5 家提供商 + 自动故障转移 |
| 安全 | 标准防护 | CVE 加固 + AIDefence |

---

## 七、架构概览

数据流从上到下：

```
用户 --> Claude Code / CLI
         |
         v
    编排层
    (MCP 服务器, 路由器, 27 个 Hook)
         |
         v
    蜂群协调
    (女王模式, 拓扑结构, 共识协议)
         |
         v
    100+ 专用智能体
    (coder, tester, reviewer, architect, security...)
         |
         v
    记忆与学习
    (AgentDB, HNSW, SONA, ReasoningBank)
         |
         v
    LLM 提供商
    (Claude, GPT, Gemini, Cohere, Ollama)
```

简单说，你的每次对话或指令都会经过这个处理链：被 Hook 捕获 -> 智能路由 -> 蜂群协调 -> 分发给专门的智能体 -> 结果存入记忆系统 -> 通过选定的 LLM 生成回复。

---

## 八、学习总结

Ruflo 解决的核心问题是：当 Claude Code 的能力已经很强时，怎么让它更强？

答案是：**从单兵作战转向团队协作。**

这个思路在 AI 领域被称为"多智能体系统"，是当前的研究热点。Ruflo 的独特之处在于：

1. 不是从零构建，而是站在 Claude Code 的肩膀上做扩展
2. 用插件体系保持了极低的入门门槛 — 先用斜杠命令试试，需要时再全面安装
3. 记忆系统和学习能力让协作成果可以积累，不是每次对话都从零开始
4. 联邦通信解决了跨组织协作的安全问题 — 这在企业场景非常实用

对于零基础的初学者来说，理解 Ruflo 的关键就一句话：**它让 AI 从"一个人在战斗"变成"一群人在协作"。**

下一步可以深入研究的方向：

- `docs/USERGUIDE.md`：完整的命令和配置参考
- `docs/STATUS.md`：了解当前哪些功能已可用
- `goal.ruv.io/agents`：在线体验智能体协作的可视化面板
- `flo.ruv.io`：无需安装的 Web UI 试用入口
