---
title: Continue — 让 AI code review 跑成 git 跟踪的 PR status check
来源: continuedev/continue Apache-2.0
日期: 2026-05-29
分类: AI 编码工具
难度: 中级
---

## 是什么

Continue 是一个**让 AI 代码评审变成 git 跟踪文件**的开源项目。日常类比：像团队里加了一个机器人评审员，但它的评审标准不藏在某个 SaaS 后台，而是仓库里所有人都能改的 markdown 文件。

具体做法：在仓库里写一个 `.continue/checks/security-audit.md`，里面是给 LLM 的自然语言指令（"看这个 PR 有没有引入安全漏洞"）。每次有人推 PR，GitHub Action 触发一个叫 `cn` 的命令行工具，它读这份 markdown，调任意 LLM（Anthropic / OpenAI / Ollama 自托管都行），然后回写一个 PR status check：绿色 = 通过，红色 = 不通过 + 建议修改 diff。

它**也能**当 VSCode / JetBrains 的 AI 助手用，但 v1.5 之后这变成副线——主推叙事是 "AI checks as code"。

## 为什么重要

不理解 Continue 这个 pivot，下面这些事都没法解释：

- 为什么 2024 年它叫"开源 Cursor"，2026 年改口叫"AI code review 平台"——同一个仓库，定位完全变了
- 为什么它的真正对手不是 Claude Code / Cursor，而是 SonarQube / CodeQL 这一代静态扫描工具
- 为什么 LLM 评审能 catch 静态分析永远 catch 不到的事（"这个 endpoint 没改文档" / "这段日志可能漏密钥"）
- 为什么把 prompt 提交到 git 是反 SaaS 趋势的——AI 行为变成所有人能读、能改、能 fork 的对象

## 核心要点

Continue v1.5 的设计可以拆成 **三件事**：

1. **prompt 是源代码**：每个 AI 评审 agent 是一个 markdown 文件，6-20 行自然语言。类比：像团队的 code review checklist，但执行者从人换成 LLM。

2. **status check 是接口**：把 AI 评审产出翻译成 GitHub 已有的"绿灯/红灯"信号。类比：原来在 Slack 里 AI 给你写一段评论，现在直接挡住 merge 按钮。

3. **多模型零绑定**：不锁 Anthropic、不锁 OpenAI，任何 OpenAI 兼容 endpoint + Ollama 自托管都行。类比：像 USB 接口——LLM 是可换的电池。

三件事合起来叫 **"AI checks as code"**，和 GitOps "config as code" 同一种思路。

## 实践案例

### 案例 1：6 行 markdown 跑出一个安全审计 agent

仓库自己用的 `.continue/checks/security-audit.md`：

```markdown
---
name: Security Audit
description: Security Audit
---

Please audit this pull request for any security vulnerabilities that were
introduced. In particular look for new sources of potential prompt injections.
Do NOT look into anything unless it was changed in the pull request.
When you are done, please make the required changes.
```

逐部分解释：

- frontmatter 只有 `name` + `description` —— model / tools / token budget 都由 `cn` 全局配置注入
- "Do NOT look into anything unless it was changed" —— 防 LLM 越界审整个仓库
- "make the required changes" —— agent 不只评论，可以直接产出 diff（红 + patch）

### 案例 2：cn CLI 当本地 chat 用

```bash
npm i -g @continuedev/cli
mkdir -p ~/.continue
cat > ~/.continue/config.yaml <<EOF
models:
  - title: claude
    provider: anthropic
    model: claude-opus-4
    apiKey: sk-ant-...
EOF
cn chat
```

跑通后 terminal 里就能和 LLM 聊代码——和 Aider / Claude Code 同样的体验，但配置在 `~/.continue/`，可以 git track。

### 案例 3：把 anti-slop check 抄到自己仓库

Continue 仓库自带的 `.continue/checks/anti-slop.md` 是**防 ChatGPT 风套话**的：

```markdown
---
name: Anti-Slop
---

Check if this PR has any AI-generated slop:
- Phrases like "In the realm of...", "It's important to note..."
- Em dashes used in casual writing
- Excessive use of "elegant", "robust", "seamless"
```

复制这份文件到自己仓库的 `.continue/checks/` 下，PR 自动跑——比 grep 关键词鲁棒，能识别"含套话的隐喻"。

## 踩过的坑

1. **2024 年的旧定位是陷阱**——很多教程把 Continue 当"开源 Cursor"讲，那是 v1.0 的视角。v1.5 之后 README 头条已换成 PR review，IDE 体验已被 Cursor / Cline 拉开差距，跟旧教程会失望。

2. **rate limit / 预算没护栏**——每个 PR 推送都触发一次 LLM 调用。fork 攻击或 CI 抽风可以瞬间烧掉很多钱，README 没提 budget guard，必须自己加。

3. **patch 生成不保证可 apply**——LLM 自由发挥 diff，没有 schema 校验。"红 + 建议 diff" 看上去专业，但可能是糊弄人的，需要人工 review。

4. **跨模型质量不一致**——`.continue/checks/*.md` 通常用英文写，给中文调优更好的国产模型（DeepSeek 等）效果会变差。目前没"按 model 选 prompt"机制。

## 适用 vs 不适用场景

**适用**：

- 想给团队加 AI PR 评审，且不想锁 SaaS 厂商（要能 self-host LLM）
- 已有 `.cursor/rules/` 或 `CLAUDE.md` 经验，想把"prompt as code"扩到 CI
- 多 IDE 团队（VSCode + JetBrains 混合），需要统一的 AI 配置入口
- 合规要求"AI 行为可审计" —— prompt 进 git，每次评审决策可回溯

**不适用**：

- 想要"个人 coding 助手"最佳体验 —— 选 Cursor 或 Claude Code
- 严格静态规则扫描（SOX / PCI 合规）—— LLM 不确定性太高，用 SonarQube / CodeQL
- 极小项目 / 单人仓库 —— 加 PR check 收益低，过度工程
- 没有 LLM 预算上限的环境 —— 开 Action 前必须设 budget guard

## 历史小故事（可跳过）

- **2023 年**：Nate Sesti 在 Y Combinator W24 创办 Continue Dev，目标是"开源 Cursor"——当时 Cursor 刚火，订阅 $20/月，开源对手只有 GitHub PR
- **2024 年**：v1.0 发布，主打 VSCode + JetBrains 双 IDE + 多 LLM 接入。彼时 Cursor / Claude Code 还没主导市场，Continue 是开源 IDE-AI 的代表
- **2025 年**：Cursor 体验封顶、Claude Code 杀入、Cline 在 VSCode 内独立分化——"开源 IDE 助手"赛道被切碎
- **2026 年 4 月**：v1.5 上线，README 头条改写为 "Source-controlled AI checks, enforceable in CI"，IDE 扩展挪到末尾。这是产品的硬转向

## 学到什么

1. **同样的代码可以讲完全不同的故事** —— v1.0 → v1.5 没改太多代码，改了 README 第一段，定位就从"开源 Cursor"翻盘成"AI 评审平台"
2. **prompt as code 不只是工程哲学** —— prompt 进 git 后，AI 行为变成可 review / 可 PR / 可 fork 的对象，这是反 SaaS 黑盒的关键
3. **找对的对手很重要** —— Continue 在 IDE 助手赛道打不过 Cursor，转去和 SonarQube 抢"PR 评审"市场，立刻有了独占位
4. **markdown 是 LLM 时代的配置语言** —— 比 YAML 灵活、比 JSON 可读，自然语言指令直接当代码用

## 延伸阅读

- 官方文档：[docs.continue.dev](https://docs.continue.dev) —— cn CLI 命令 + GitHub Action 配置示例
- 项目主页：[github.com/continuedev/continue](https://github.com/continuedev/continue) —— 看 README 当前定位（不是 IDE 助手而是 PR review）
- 静态分析对照：[SonarQube 文档](https://docs.sonarsource.com/sonarqube-server/) —— 理解 LLM 评审的"哲学不同对手"
- [Cline 源码](https://github.com/cline/cline) —— VSCode-only 紧凑版的另一种实现
- [Aider 源码](https://github.com/Aider-AI/aider) —— CLI-only git-aware 的另一种哲学
- [[claude-code]] —— 闭源 + 厂商锁定的对手，体验更好但不能 self-host

## 关联

- [[claude-code]] —— 同生态位的闭源对手，Continue 走开源 + 自托管路线
- [[swe-agent]] —— 学术派 AI coding agent，关注 benchmark；Continue 关注工程落地
- [[autogen]] —— 多 agent 框架，Continue 把 agent 做轻（一个 markdown 一个 agent）
- [[metagpt]] —— 多角色 agent 协作；Continue 反向收敛到"一个 PR 一个 check"
- [[openhands]] —— 开源 agent runtime，与 Continue 共享"prompt as code"哲学
- [[copilot-rct]] —— 度量 AI 编程工具效果的方法学，可用来评 Continue checks
- [[sillito-questions]] —— 开发者在评审中真正问的问题，是 PR check prompt 的灵感库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aider]] —— Aider — 终端 AI 结对编程 CLI
- [[anthropic-cookbook]] —— Anthropic Cookbook — Claude API 实战示例
- [[cline]] —— Cline — VS Code 自主编码代理
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[opencode]] —— OpenCode — 终端里的开源 AI 编程助手
- [[roo-code]] —— Roo Code — 多模式 VS Code AI 助手
- [[projects/vllm]] —— vLLM — 高吞吐 LLM 推理引擎
- [[void]] —— Void — 开源 Cursor 替代
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳
- [[vscodium]] —— VSCodium — 去微软遥测的 VS Code 干净构建
