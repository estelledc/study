---
title: "Aider — 终端 AI 结对编程 CLI"
来源: https://github.com/Aider-AI/aider
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

## 是什么

Aider 是一个**终端里的 AI 结对编程工具**——在项目目录里启动它，用自然语言描述需求，它连接 Claude / GPT / DeepSeek 等 LLM，**直接编辑本地 Git 仓库里的文件**并自动提交。没有 IDE 插件、没有浏览器标签页——只有 shell、代码和对话。

日常类比：想象你写一份重要文档，旁边坐着一位资深同事。你指着屏幕说「帮我把第三章改成表格形式，顺便检查引用格式」。同事不会替你重写整本书——**他只动你点名的章节**，改完还在版本历史里留一条清晰的 commit，方便你 `git diff` 或一键撤销。Aider 就是终端里的这位搭档。

GitHub 仓库 [Aider-AI/aider](https://github.com/Aider-AI/aider) 是 Python 实现的开源项目（PyPI 包名 `aider-chat`，Apache 2.0 协议），作者 Paul Gauthier（前 Groupon CTO）。截至 2026 年 6 月，仓库 45k+ stars、4400+ forks、93+ 个正式 release、PyPI 累计安装 680 万次。官方 slogan：*AI pair programming in your terminal*。

## 为什么重要

1. **AI 聊天和实际改代码之间不再有「复制粘贴断层」**：网页版 ChatGPT 给建议，你还要自己打开编辑器、找文件、粘贴 diff、跑测试。Aider 把对话、编辑、提交收成一条链路——模型输出的是对你仓库里真实文件的修改，终端就能看到 unified diff，确认后写入磁盘并自动 commit。
2. **大仓库里 LLM 不会「迷路」**：把整个 monorepo 塞进 context 既贵又乱。Aider 用 tree-sitter 构建 **Repo Map**——把类、函数、文件关系压缩成摘要（默认约 1k token），让模型在大型项目里也能定位该改哪里。
3. **AI 改坏了随时回滚**：每次成功编辑后自动 `git commit` 并生成描述性提交信息。不满意就用 `/undo` 撤销，或用熟悉的 Git 工具审查历史。这和「AI 直接覆盖文件、没有版本线」的工具形成鲜明对比。
4. **架构师与编辑者分工，质量翻倍**：Architect 模式用一个模型（如 o1-preview）规划方案，另一个模型（如 Sonnet）写 diff——在 aider 的 code editing benchmark 上，o1-preview + DeepSeek 组合达到 **85.0% 正确率**，远超单模型 solo 的 71.4-77.4%。
5. **不绑定模型供应商**：支持 Anthropic、OpenAI、DeepSeek、Gemini、Grok，以及 Ollama / LM Studio 本地模型——今天 Sonnet 太贵就切 DeepSeek，敏感代码用本地模型，完全自由。

## 核心要点

记 **6 个核心概念**：

### 1. Chat Session 与「加入聊天的文件」

启动时带文件参数：`aider src/auth.py tests/test_auth.py`。这些文件进入 chat session，模型可见全文并有权编辑。原则：**只 add 需要改的文件**——加太多浪费 token、增加混淆。未 add 的文件仍可通过 Repo Map 提供结构信息。会话中通过 `/add`、`/drop` 动态调整。

### 2. Repo Map（仓库地图）

Aider 启动时会构建整个代码库的压缩索引——用 tree-sitter 解析 100+ 种语言（Python、JS/TS、Rust、Go、C++ 等），把类、函数、类型签名和调用关系编码成 token 高效的摘要。底层用图排序算法（类 PageRank）：文件是节点、依赖是边，被引用最多的符号优先进入地图。可用 `/map` 查看、`--map-tokens 2000` 调大小。

### 3. Edit Format（编辑格式）

不同 LLM 对「如何表达补丁」能力不同。Aider 支持多种编辑格式，可通过 `--edit-format` 或 `.aider.conf.yml` 切换：

- **whole**：LLM 重写整个文件（最笨但最稳，适合 o1 系列）
- **diff**：search/replace 块，用 `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE` 标记（最常用）
- **udiff**：简化 unified diff，解决 GPT-4 Turbo 偷懒用 `# ...` 省略代码的问题
- **editor-diff / editor-whole**：Architect 模式下编辑者专用的精简版

### 4. Architect 模式（双模型流水线）

`/architect` 启用：一个强推理模型（如 o1-preview、Claude Opus）像架构师一样规划改动方案，另一个强编辑模型（如 Claude Sonnet、DeepSeek）像编辑者一样把方案落地为精确的 diff。推理和编辑解耦后各司其职，benchmark 得分大幅提升，且因为编辑者可用便宜模型，**总体成本可降低一半**。

### 5. Main Model 与 Weak Model

Aider 可同时配置主模型（负责复杂编辑）和弱模型（处理简单任务如 commit message、部分辅助推理），在成本与质量之间折中。`--model` 指定主模型，`/weak-model` 切换弱模型。

### 6. 自动 Git 集成

在 Git 仓库内运行时自动检测 `.git`。每次应用 AI 编辑后 commit 并生成描述性提交信息。`--no-auto-commits` 关闭自动提交，`/commit` 手动提交你在 chat 外做的改动，`/undo` 撤销上一次 aider 提交，`/diff` 查看自上次消息以来的变更。

## 实践案例

### 案例 1：从零让 Aider 写一个 Python 脚本

在空仓库中，一行命令即可开始：

```bash
git init factorial-demo && cd factorial-demo
aider --model sonnet factorial.py
```

在 `>` 提示符下输入：

```text
> 写一个 Python 程序：询问用户输入一个非负整数 n，计算 n! 并打印。
> 如果输入非法（负数或非整数）要友好提示。顺便加一个 if __name__ == "__main__" 入口。
```

Aider 展示 diff，确认后写入并 auto-commit：

```text
Commit 3a1f2b8 feat: Add factorial CLI with input validation
```

验证：

```bash
python factorial.py    # 输入 5 → 120
git log --oneline -1   # 看到 aider 的提交
# 在 aider 会话里: > /undo   ← 撤销本次 commit
```

### 案例 2：在现有项目中加功能并跑测试

假设已有 Flask 项目，需要给 `/health` 增加 JSON 字段。只把相关文件加入 chat：

```bash
cd ~/projects/my-api
aider app/routes.py tests/test_health.py
```

```text
> /ask 先看一下：现在 /health 返回什么结构？别改文件。
# 模型只读分析…

> /code 给 /health 响应加上 "version": "1.2.0" 和 ISO8601 的 "timestamp"。
> 同步更新 tests/test_health.py 里的断言。

> /test pytest tests/test_health.py -q
# 若测试失败，Aider 把 stderr 放进上下文并尝试修复

> /lint
# 对 chat 中的文件跑 linter 并自动修
```

配合配置文件 `~/.aider.conf.yml`，改完自动跑测试和 lint：

```yaml
# ~/.aider.conf.yml
model: sonnet
auto-test: true
test-cmd: pytest -q
auto-lint: true
lint-cmd: ruff check --fix
```

### 案例 3：用 Architect 模式做大重构

```bash
aider --architect --model o1-preview --editor-model sonnet
```

```text
> 把 user_service.py 里的所有 SQL 查询迁移到新的 repository 层。
> 保持接口不变，所有现有测试不能 break。
```

Aider 会先让 o1-preview 规划迁移步骤，再让 Sonnet 按方案逐个文件编辑——比单模型直接改大文件更稳，且成本低。

### 案例 4：本地模型，代码不出内网

```bash
aider --model ollama_chat/qwen2.5-coder:7b \
  --openai-api-base http://127.0.0.1:11434/v1 \
  --openai-api-key dummy
```

适合敏感项目、离线环境、或想试试本地小模型能做什么的场景。

## 踩过的坑

1. **不在 Git 仓库里用等于自废武功**：auto-commit、`/undo`、`/diff` 全部依赖 `.git`。新项目一定先 `git init`。
2. **add 太多文件会耗尽 token**：session 中的文件全文占用 context，每个文件都算一份。只 add 你要改的，让 Repo Map 负责让模型「了解其余代码」。
3. **不同模型对编辑格式适配差异大**：o1 系列用 `whole` 最稳，Sonnet 用 `diff` 效率最高。如果发现模型频繁「改不对文件」或「生成错误的 search 块」，先换 `--edit-format` 试试。
4. **Architect 模式需要两个模型的 API Key 都可用**：如果只配了一个 provider，`/architect` 会失败。可以主模型和编辑者都用同一 provider 的不同模型（如 o1-preview + gpt-4o）。
5. **Watch Files 的 AI 注释语法容易写错**：以 `# ...` 或 `// ...` 开头/结尾且含 **AI** 字样的行会被当作指令。特别标记 `AI!` 会强制读取文件里所有 AI 注释。在 IDE 里写注释让 Aider 执行时，注意注释格式。
6. **非交互模式传参注意引号**：`aider --message "fix bug #42" --exit` 中 `#42` 在某些 shell 里会被当成注释。正确写法：`--message 'fix bug #42'` 或用反斜杠转义。

## 适用 vs 不适用场景

**适用**：

- 终端党（tmux、SSH 远程开发、无桌面环境）
- 需要可审查 Git 历史的 AI 编辑流程
- 想在 Claude / GPT / DeepSeek / 本地模型间自由切换
- 多编辑器用户（VS Code + Neovim 混用，Aider 在终端独立运行）
- 脚本化 / 非交互 AI 编辑（`aider --message "..." --exit`）
- 大仓库但每次只改少数文件的场景
- 架构师+编辑者分离的高质量重构

**不适用**：

- 需要行内 ghost text 补全 → Copilot / Cursor
- 想要一体化 AI-first IDE → Cursor / Windsurf
- 非 Git 项目（不上版本管理的临时脚本）
- 需要同时编辑 20+ 个文件的大规模改动（context 窗口会成为瓶颈）

与其他工具的对比：

| 维度 | Aider | Cursor / Copilot | Claude Code |
|------|-------|------------------|-------------|
| 运行位置 | 终端 CLI | IDE 内 / 独立 IDE | CLI (Node.js) |
| 模型选择 | 任意 provider | 锁定厂商 | 仅 Anthropic |
| Git 集成 | 自动 commit + /undo | 视产品而定 | 自动 commit |
| 费用模式 | 按 token 计费 | 固定订阅 | 按 token 计费 |
| 安装体积 | ~400 MB | ~300 MB | ~100 MB |
| 开源协议 | Apache 2.0 | 闭源 | 闭源 |

## 历史小故事

- **2023 年 5 月**：Paul Gauthier 发布 Aider 第一个版本。核心想法很简单：让 LLM 在终端里改代码，改完自动 git commit。
- **2023 年下半年**：Repo Map 引入，Aider 从「改单文件」进化到「理解全仓库结构」。tree-sitter 解析 + 图排序算法成为 Aider 的技术护城河。
- **2024 年 9 月**：Architect/Editor 双模型模式发布——这是 Aider 最具创新性的功能。o1-preview + DeepSeek 组合在 code editing benchmark 上拿到 85.0% 正确率（SOTA），直接把单模型 solo 的 71-77% 甩开一个身位。
- **2025 年**：Aider 自举加速——Aider 自身代码的 60-88% 由 Aider 自己编写。支持的语言从几十种扩展到 100+，包括 Fortran、Haskell、Julia、Zig、MATLAB。
- **2026 年**：v0.86.x，支持 Claude 4.7 Sonnet、GPT-5、DeepSeek V4 等最新模型，新增 `--browser` 实验性 Web UI 和 Python 3.14 实验性支持。

短短 3 年，从一个人的 side project 成长为终端 AI 编程的事实标准之一，尤其受资深工程师青睐——他们看重干净的 Git 历史和不受供应商绑定的自由。

## 学到什么

1. **终端的力量不在界面在组合性**：Aider 不比你「开浏览器聊天、切回 IDE 改代码」快多少，但它能和 tmux、shell 脚本、CI pipeline 无缝组合——`aider --message "fix bug #42" --exit` 可以直接嵌在 GitHub Actions 里。
2. **编辑格式是 LLM 编程的「方言」**：不同模型对 diff/whole/udiff 的擅长程度差异极大。Aider 把一个工程问题（模型输出格式不稳定）用「多格式适配」优雅解决——这比强制所有模型适应同一种格式更务实。
3. **Architect/Editor 分工 = 推理与执行解耦**：这不只是省钱（编辑者用便宜模型），更是让两个模型各干各擅长的事。在软件工程中这是常识（架构师不写每一行代码），但在 AI 编程领域，Aider 第一个把这个模式做成了可用的产品功能。
4. **Repo Map 是「压缩上下文」的艺术**：不是把整个仓库喂给 LLM，而是用 tree-sitter + PageRank 提取最相关的结构。核心技术就一个公式：token 预算有限时，优先给模型看被引用最多的符号。
5. **版本控制是 AI 编程的安全网**：`/undo` 看起来简单，但背后是对 git 的深度集成——每次编辑一条 commit、撤销就是 reset。这让「AI 可能改错」从不可接受变成了常规操作。
6. **模型无关性是长期竞争力**：今天 Sonnet 最好用 DeepSeek 最便宜，明天可能有新的黑马。不绑定供应商意味着你永远可以用当前最佳性价比的组合。

## 延伸阅读

- 官网与文档：[aider.chat](https://aider.chat/)
- GitHub 仓库：[Aider-AI/aider](https://github.com/Aider-AI/aider)
- 安装指南：[Installation](https://aider.chat/docs/install.html)
- 用法指南：[Usage](https://aider.chat/docs/usage.html)
- Edit Format 详解：[Edit Formats](https://aider.chat/docs/more/edit-formats.html)
- Architect 模式原理解析：[Separating code reasoning and editing](https://aider.chat/2024/09/26/architect.html)
- Repo Map 技术细节：[Repository map](https://aider.chat/docs/repomap.html)
- LLM 连接配置：[Connecting to LLMs](https://aider.chat/docs/llms.html)
- 基准测试与排行榜：[Aider LLM Leaderboards](https://aider.chat/docs/leaderboards/)

## 关联

- [[claude-code]] —— 同为终端 AI 编程工具，但仅限 Anthropic 模型，侧重 agent 工作流
- [[cursor]] —— GUI 端 AI-first IDE，与 Aider 互补（一个终端、一个 GUI）
- [[gh-copilot]] —— 行内补全型 AI 助手，不处理多文件编辑
- [[ollama]] —— Aider 最常用的本地模型后端，让代码不出内网
- [[git]] —— Aider 深度依赖 Git 的版本追溯能力，是其区别于其他 AI 编程工具的核心特征
