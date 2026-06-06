---
title: Claude Code — Anthropic 终端编程助手
来源: https://github.com/anthropics/claude-code
日期: 2026-05-29
子分类: 智能体与 LLM
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Claude Code 是 **Anthropic 2024 年推出的终端 AI 编程助手**——你在 shell 里描述需求，它直接读你的代码、改文件、跑测试。

日常类比：

- [[github-copilot]] 是坐你旁边的同事，时不时给你"下一句怎么写"的提示
- Claude Code 是命令行里的实习生——你说"帮我把这个文件重构成 X"，它去做，做完报告给你

你写：

```bash
$ cd ~/my-project
$ claude
> 帮我加一个 dark mode toggle
```

它读你的 React 代码 → 找到放置 toggle 的位置 → 改文件 → 跑测试 → 报告"已添加 dark mode，所有测试通过"。

整个过程**没让你打开 IDE，也没让你写一行代码**。

## 为什么重要

不只是"又一个 AI 写代码工具"，它代表了几件大事：

- **Anthropic 自己开发自己用（dogfooding）**——做模型的人用自己的模型做产品，反馈最直接
- **和 [[cursor]] / Cline / OpenHands 一起，形成"coding agent"赛道**——AI 不再是"补全工具"，是"会做完整任务的 agent"
- **MCP（Model Context Protocol）原生支持**——AI 工具之间的"USB 接口"，Claude Code 是第一个把它做成核心能力的产品
- **Claude Sonnet 4 / Opus 4 的 native UI**——模型最新能力（thinking、prompt caching、长上下文）第一时间能用上

## 核心要点

Claude Code 的核心循环可以拆成 **4 步**：

1. **读代码**：你提需求 → 它扫描相关文件，把关键内容塞进上下文。类比：实习生先看你的代码再动手，不是闭眼乱写。

2. **思考**：模型决定怎么改——是新加文件，还是改现有的，还是先跑测试看现状。

3. **改 + 跑**：调用工具（Read / Write / Edit / Bash）真的改文件、真的跑命令。**不是给建议，是直接做**。

4. **反思**：跑完看结果——测试挂了？编译报错？它自己读错误，再改一轮。

这个 "读 → 思考 → 改 → 跑 → 反思" 的循环叫 **agent loop**。它一直转，直到任务完成或它自己判断卡住。

另外两个支柱：

- **File-aware**：直接读写项目内任意文件，不像 ChatGPT 要你复制粘贴
- **MCP servers**：能接外部工具——装个 Supabase MCP server，它就能直接查你的数据库；装个 Figma MCP，它能读你的设计稿

## 实践案例

### 案例 1：在终端里启动，让它改 React

```bash
$ cd ~/my-react-app
$ claude
> 加一个 dark mode toggle，按钮放在 header 右边
```

它会：

1. 读 `src/components/Header.tsx`
2. 看你已有的样式系统（Tailwind？CSS Modules？）
3. 改 Header、加 ThemeContext、写持久化逻辑
4. 跑 `npm test`
5. 报告："已加在 Header 右边，存到 localStorage，所有测试通过"

整个过程**你只发了一句话**。

### 案例 2：进入 plan 模式先列步骤

直接动手有时太激进。`/plan` 让它**先列计划，等你批准再执行**：

```
> /plan 把所有 class component 改成 hooks

[Claude 列出 12 个文件清单 + 改动顺序 + 风险点]
> 同意，执行
```

这是 agent 工具的"安全锁"——给你一次机会在它真的改文件前喊停。

### 案例 3：装 MCP server 扩展能力

```bash
# 装 Supabase MCP server
$ claude mcp add supabase

# 之后在对话里
> 查一下 users 表里最近一周注册的用户数
```

Claude Code 会通过 MCP 协议调 Supabase API、跑 SQL、把结果展示给你。**它没自己学 Supabase——它通过标准协议接 Supabase 的"插头"**。

## 踩过的坑

1. **Token 消耗大**：一次大型 refactor 可能烧几十万 token（折合几美元到十几美元）。Anthropic API 按 token 计费，**重度使用前先算预算**。一次性让它"重构整个项目"是常见的烧钱方式。

2. **大文件超 context**：单个文件 > 200K token（差不多 50 万字）就塞不下了。**写代码时拆分文件、写 docs 时拆章节**——这反过来逼你养成"小文件"习惯。或者明确告诉它"分段处理，先看前 500 行"。

3. **Permission 模式要选对**：每个 bash 命令默认会问你"是否允许"，烦但安全。`--dangerously-skip-permissions` 自动放行，快但危险。**生产代码用默认，玩 sandbox 项目可以放飞**。

4. **不要让它跑 destructive 命令**：`rm -rf` / `git push --force` / 改 `/etc/` 这种。它**理论上**会问你，但保险起见在 settings.json 里加 `deny` 规则。曾经有人让它"清理项目"，它真的 `rm -rf` 了根目录。

## 历史

- **2024-Q4**：Anthropic 内部 dogfooding 阶段——员工自己用，验证"模型自己做的工具用着顺不顺手"
- **2025-Q1**：Beta 公测——开放给外部用户，CLI 单一形态
- **2025-Q2**：加 plan mode + MCP 标准化——从"能改代码"升级到"能规划 + 能接外部"
- **2025-Q3**：GA + VS Code extension 发布——从纯 CLI 扩展到 IDE，覆盖更多用户场景

之后 1 年（2025-Q4 → 2026-Q2）持续叠加：subagent / hook / skill / plugin marketplace——每个都是"让用户能更深度自定义"的扩展点。

## 适用 vs 不适用场景

**适用**：

- 终端用户、习惯 shell 的开发者——CLI 比 IDE 更顺手
- 需要"完整任务"——重构、加功能、跑测试、写 PR description
- 团队想要可分享的工作流——hook / skill / plugin 三层抽象支持团队级定制
- 信任 Anthropic 模型路线，想第一时间用最新能力

**不适用**：

- 想要 IDE 内联补全（tab completion）——[[github-copilot]] / Cursor 更适合
- 完全脱离 Anthropic 的偏好（数据合规、隐私）——选开源（Cline / OpenCode）
- 简单 chat / 写邮件——claude.ai 网页版就够，不需要 CLI
- 不愿意学 hook / skill / plugin 抽象——Aider 一个 conventions.md 更简单

## 学到什么

1. **AI 编程从"补全"走到"agent"**——这是 2024-2025 最重要的范式转变，Claude Code 是最干净的例子
2. **CLI 优先 vs IDE 优先**是产品判断，不是技术问题——CLI 能脚本化、能 SSH 远程、能进 CI；IDE 视觉直观、内联体验好
3. **扩展机制分层**——skill（按需加载知识）/ hook（拦截事件）/ plugin（打包分发）三层，门槛递增
4. **MCP 是 AI 工具的"USB"**——标准协议让任何工具都能被 AI 调用，Claude Code 是 MCP 最早的大规模实践

## 延伸阅读

- 官方文档：[docs.claude.com/claude-code](https://docs.claude.com/claude-code)（安装 + 快速上手 + 配置参考）
- 开源对照：[sst/opencode](https://github.com/sst/opencode)——Apache-2.0 TypeScript 实现，能读完整 source
- ReAct 论文：[arxiv.org/abs/2210.03629](https://arxiv.org/abs/2210.03629)——agent loop 的范式起源
- [[mcp]] —— Model Context Protocol，Claude Code 的"外接工具"协议
- [[cursor]] —— IDE-first 路线的 coding agent 对照

## 关联

- [[github-copilot]] —— IDE 内联补全的代表，和 Claude Code 是不同形态的 AI 编程工具
- [[cursor]] —— fork VSCode 做 AI 集成，IDE-first 路线
- [[mcp]] —— 让 AI 能调用任意外部工具的标准协议
- [[react-paper]] —— think-act-observe 循环的论文起源，Claude Code 是它的产品化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anthropic-cookbook]] —— Anthropic Cookbook — Claude API 实战示例
- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[bat]] —— bat — 现代 cat 替代
- [[claude-agent-sdk]] —— Claude Agent SDK — 把 Claude Code 装进 npm 包
- [[continue]] —— Continue — 让 AI code review 跑成 git 跟踪的 PR status check
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[eza]] —— eza — 现代 ls 替代（exa 的社区接管 fork）
- [[fx]] —— fx — JSON 的交互式查看器（jq 的 TUI 表亲）
- [[jq]] —— jq — JSON 的 sed/awk
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[litellm-proxy]] —— LiteLLM Proxy — 自托管的 LLM 统一网关
- [[lsd]] —— lsd — 现代 ls 替代（LSDeluxe，主题化 + 图标，不押 git）
- [[mcp-ts-sdk]] —— MCP TS SDK — Model Context Protocol TypeScript 实现
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[sillito-questions]] —— Sillito 44 问题 — 程序员改代码时到底在问什么
- [[skcc-skill-compiler]] —— SkCC — 给 LLM agent 写一个真正的 skill 编译器
- [[vllm]] —— vLLM — 高吞吐 LLM 推理引擎
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳
- [[vscodium]] —— VSCodium — 去微软遥测的 VS Code 干净构建
- [[yq]] —— yq — YAML 的 jq（也吃 XML/TOML/properties）

