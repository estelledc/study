---
title: OpenCode — 终端里的开源 AI 编程助手
来源: 'https://github.com/sst/opencode'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

OpenCode 是一个开源 AI coding agent：你在终端、桌面应用或 IDE 里和它对话，它帮你读代码、改代码、解释项目、跑命令。
日常类比：它像坐在你旁边的结对同学，只是这个同学直接住在终端里，能翻文件、看 Git 状态、按你的规则动手。

最小使用感大概是这样：

```bash
cd /path/to/project
opencode
/init
```

这三行不是"安装教程"，而是理解它的入口：先进入一个真实项目，再启动 OpenCode，最后让它生成或更新 `AGENTS.md`，把项目习惯写下来。

所以 OpenCode 不只是聊天窗口。它更像一个会读项目上下文的工作台：同一个界面里有模型、工具、权限、会话和项目规则。

## 为什么重要

不理解 OpenCode，下面这些事会很难解释：

- 为什么有人宁愿在终端里用 AI，而不是切到网页聊天框来回复制代码
- 为什么同一个 AI 助手要分 Plan 和 Build 两种模式：一个先想清楚，一个再动手改
- 为什么多模型切换是工程能力，不只是"换个更聪明的模型"
- 为什么 `AGENTS.md` 这种项目说明文件，会直接影响 AI 改代码的质量

对于初学者，它的重要点不在"替你写完所有代码"，而在把一次编程任务拆成可观察的步骤。
你能看到它问什么、查什么、改什么、验证什么，这比只看最终答案更容易学会工作流。

## 核心要点

1. **终端优先**：类比厨房里的案板，所有菜都在一个地方切。OpenCode 把聊天、文件、命令、Git 状态放回项目目录，减少复制粘贴造成的上下文丢失。

2. **模式分工**：类比装修前先画图，再拿锤子施工。Plan 模式默认偏只读，适合分析和设计；Build 模式有完整工具权限，适合按计划改文件和跑验证。

3. **提供商抽象**：类比同一个充电器可以接不同插头。OpenCode 通过 provider 配置接入很多 LLM 服务，也能配置本地模型、代理地址、模型白名单和黑名单。

这三个点合在一起，就是它和普通聊天机器人的差别：它不只回答问题，还把"回答后怎么落地"纳入工具系统。

## 实践案例

### 案例 1：先让 OpenCode 认识项目

官方入门文档给的初始化动作是：

```bash
cd /path/to/project
opencode
/init
```

逐部分解释：

- `cd /path/to/project`：先站到项目根目录，OpenCode 才知道当前仓库是谁
- `opencode`：打开终端交互界面，之后的消息都围绕这个项目展开
- `/init`：让它分析项目并生成 `AGENTS.md`，后续回答会参考这里的结构和习惯

这个案例适合第一次接手陌生仓库。它不是让 AI 直接改代码，而是先把"项目地图"建起来。

### 案例 2：用 Plan 模式设计功能，再切回 Build

官方教程建议复杂需求先用 Plan：

```text
<TAB>
When a user deletes a note, flag it as deleted in the database.
Then create a screen that shows all recently deleted notes.
<TAB>
Sounds good! Go ahead and make the changes.
```

逐部分解释：

- 第一个 `<TAB>`：切到 Plan，让 OpenCode 先分析，不急着写文件
- 中间的需求：明确数据行为和界面行为，像给初级开发同学派任务
- 第二个 `<TAB>`：回到 Build，允许它按确认后的方案改代码

这个案例解决的是"AI 太快动手"的问题。先计划再实现，能把误改范围压小。

### 案例 3：开 Web 界面或 ACP 服务，把 OpenCode 接进别的工具

CLI 文档里有两个很工程化的入口：

```bash
OPENCODE_SERVER_PASSWORD=secret opencode web --port 4096
opencode acp --cwd /path/to/project
```

逐部分解释：

- `opencode web`：启动一个本地 HTTP 服务，让浏览器访问 OpenCode
- `OPENCODE_SERVER_PASSWORD`：给 Web 入口加基础认证，避免本机服务裸奔
- `opencode acp`：启动 Agent Client Protocol 服务，方便其他编辑器或客户端用标准协议通信

这个案例说明 OpenCode 不只是一个 TUI。它也能作为本地 agent 服务，被 Web、桌面应用或 IDE 形态复用。

## 踩过的坑

1. **把 Plan 当成 Build 用**：Plan 默认限制写文件和命令，原因是它的目标是分析，不是施工。

2. **没提交 `AGENTS.md`**：官方建议提交项目规则，原因是团队共享规则后，AI 才不会只懂你本机的一次会话。

3. **Windows 直接跑终端体验不好**：官方更推荐 WSL，原因是很多终端能力和类 Unix 工具链在 WSL 里更稳定。

4. **模型不可用时只怪 OpenCode**：很多报错来自 provider、API key、baseURL 或模型列表，原因是 OpenCode 只是调度层，真正调用还依赖外部服务。

## 适用 vs 不适用场景

**适用**：

- 你主要在终端和 Git 仓库里工作，希望 AI 能直接看文件、跑命令、改代码
- 你想把复杂需求先拆成计划，再允许 AI 分步实现
- 你需要在不同模型或 provider 之间切换，而不是锁死在单一服务
- 你愿意维护 `AGENTS.md`、权限和项目规则，让 AI 行为更可预测

**不适用**：

- 你只想问概念题，不需要它接触本地项目
- 你的团队完全禁止 AI 读写仓库文件，连只读分析也不允许
- 你无法配置任何可用模型或 API key，本地也没有能跑的模型
- 你期待它一次性解决所有产品判断，而不是和你一起迭代

## 历史小故事（可跳过）

- OpenCode 最早以"开源 AI coding agent"的形态被开发者认识，重点是把 agent 放回终端工作流。
- README 里展示了命令行安装、桌面应用、内置 agent 和文档入口，说明它从单一 CLI 逐步长成多入口产品。
- 项目当前在 GitHub 上有很高关注度，主页显示 stars 已经远超早期的十几 k 量级。
- 文档结构也在扩展：Usage、Configure、Develop 分层明显，说明社区需求已经从"怎么启动"走向"怎么定制和集成"。
- 它的社区入口包括 GitHub、Discord 和 X，反馈循环不只靠 issue。

## 学到什么

- 好的 AI 编程工具，核心不是"会聊天"，而是把上下文、权限和验证流程接到真实项目里。
- Plan / Build 分工让初学者学会先想后改，减少"AI 写了一堆但我看不懂"的失控感。
- Provider 抽象让模型选择变成配置问题，工具本身可以长期复用。
- `AGENTS.md` 是项目记忆，不是装饰文件；写清楚规则，AI 才更像团队成员。

## 延伸阅读

- 官方文档：[OpenCode Intro](https://opencode.ai/docs) —— 从安装、初始化到常见使用姿势的总入口
- 官方配置：[Agents](https://opencode.ai/docs/agents) —— 理解 Build、Plan、General、Explore、Scout 的分工
- 官方配置：[Providers](https://opencode.ai/docs/providers) —— 理解多模型和 provider 接入
- [[aider]] —— 同样是面向 Git 仓库的 AI 编程助手，适合对比命令行工作流
- [[claude-code]] —— 终端 agent 的重要同类工具，适合比较权限、计划和编辑体验
- [[cline]] —— IDE 侧 agent，适合观察终端和编辑器形态的取舍

## 关联

- [[aider]] —— 都强调在真实仓库中读写代码，而不是只复制粘贴片段
- [[aichat]] —— 都是终端 AI 工具，但 OpenCode 更偏项目级 coding agent
- [[claude-code]] —— 都用 agent 工作流处理代码任务，适合并排学习
- [[cline]] —— 代表 VS Code 插件形态，和 OpenCode 的终端优先形成对照
- [[continue]] —— 代表 IDE 内联补全和聊天，和 OpenCode 的 TUI/服务形态互补
- [[zed]] —— 代表编辑器自身集成 AI，适合比较"编辑器内"和"终端内"两条路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
