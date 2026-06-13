---
title: Aider — 终端 AI 结对编程 CLI
来源: https://github.com/Aider-AI/aider
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：坐在你旁边的「会改代码的搭档」

想象你在写一份重要文档，旁边坐着一位资深同事。你指着屏幕说：「帮我把第三章改成表格形式，顺便检查一下引用格式。」同事不会替你重写整本书——他**只动你点名的章节**，改完还会在版本历史里留一条清晰的 commit，方便你 `git diff` 或一键撤销。

**Aider 就是终端里的这位搭档。** 你在项目目录里启动它，用自然语言描述需求；它连接 Claude、GPT、DeepSeek 等 LLM，**直接编辑本地 Git 仓库里的文件**，并自动提交变更。没有 IDE 插件、没有浏览器标签页——只有 shell、代码和对话。官方 slogan 是 *AI pair programming in your terminal*；GitHub 仓库 [Aider-AI/aider](https://github.com/Aider-AI/aider) 是 Python 实现的开源项目（PyPI 包名 `aider-chat`），在终端工作流、Git 原生集成和「只改该改的文件」这几件事上做得非常专注。

---

## 这个项目解决什么问题

### 痛点 1：AI 聊天和实际改代码之间隔着复制粘贴

网页版 ChatGPT 能给出建议，但你要自己打开编辑器、找文件、粘贴 diff、跑测试。Aider 把「对话 → 编辑 → 提交」收成一条链路：模型输出的是对你仓库里**真实路径**的修改，终端里就能看到 unified diff，确认后写入磁盘。

### 痛点 2：大仓库里 LLM 容易「迷路」

把整个 monorepo 塞进 context 既贵又乱。Aider 会构建 **Repo Map（仓库地图）**——用 tree-sitter 解析代码结构，把类、函数、文件关系压缩成摘要，让模型在大型项目里也能定位该改哪里。你只需用 `/add` 明确「允许编辑的文件」，相关上下文会自动从地图里拉进来。

### 痛点 3：AI 改坏了不好回滚

Aider **默认每次成功编辑后自动 `git commit`**，并生成描述性提交信息。不满意就用 `/undo` 撤销上一次 aider 提交，或用熟悉的 Git 工具审查历史。这和「AI 直接覆盖文件、没有版本线」的工具形成鲜明对比。

### 痛点 4：只想问问题，不想动代码

不是每次对话都要改文件。Aider 提供 **chat mode**：`/ask` 只读问答、`/code` 进入编辑模式、`/architect` 用「架构师 + 编辑者」双模型分工。同一 session 里可以切换模型（`/model`）和模式，而不必重启进程。

---

## 核心概念拆解

### 1. Chat Session 与「加入聊天的文件」

启动时可以带文件参数：`aider src/auth.py tests/test_auth.py`。这些文件进入 **chat session**，模型可见全文并有权编辑。原则：**只 add 需要改的文件**——加太多会浪费 token、增加混淆。未 add 的文件仍可通过 Repo Map 提供结构信息。

### 2. Repo Map

启动时终端会显示类似 `Repo-map: using 1024 tokens` 的提示。地图是 Aider 对全仓库的压缩索引，帮助模型理解「`UserService` 在哪个文件」「谁调用了这个函数」。可用 `/map` 查看、`/map-refresh` 强制刷新。

### 3. Main Model 与 Weak Model

Aider 可同时配置**主模型**（负责复杂编辑）和**弱模型**（处理简单任务如 commit message、部分辅助推理），在成本与质量之间折中。命令行 `--model` 指定主模型，`/weak-model` 在会话中切换弱模型。

### 4. Edit Format（编辑格式）

不同 LLM 对「如何表达补丁」能力不同。Aider 支持多种 **edit format**（如 diff、whole file、architect 模式下的分工格式），可通过 `--edit-format` 或 `.aider.conf.yml` 配置，影响准确率和 token 消耗。

### 5. 自动 Git 集成

在 Git 仓库内运行时，Aider 会检测 `.git`，在每次应用 AI 编辑后 commit。可用 `--no-auto-commits` 关闭，或用 `/commit` 手动提交你在 chat 外做的改动。`/diff` 查看自上次消息以来的变更。

### 6. 斜杠命令（Slash Commands）

会话内以 `/` 开头的指令控制行为，例如 `/add`、`/drop`、`/lint`、`/test`、`/run`、`/web`（抓取网页转 markdown 进上下文）、`/voice`（语音输入）。完整列表见 [官方命令文档](https://aider.chat/docs/usage/commands.html)。

### 7. 配置文件 `.aider.conf.yml`

Aider 按顺序查找：Git 根目录 → 当前工作目录 → `~/.aider.conf.yml`。可固定默认模型、是否 auto-lint、test 命令、edit format 等，避免每次敲一长串 flags。

### 8. Architect 模式

`/architect` 启用**双模型工作流**：一个模型像架构师一样规划改动，另一个模型像编辑者一样落地到文件。适合跨多文件、需要先设计再实现的重构，比单模型直接改更稳。

### 9. Watch Files 与 AI 注释

`aider --watch-files` 会监视源文件；以 `# ...` 或 `// ...` 开头/结尾且含 **AI** 字样的行会被当作给 Aider 的指令（`AI!` 会触发读取文件中所有 AI 注释）。适合在 IDE 里写注释、在终端让 Aider 执行。

### 10. 与 IDE 的关系

Aider **不绑定编辑器**：[[vscode]]、Neovim、JetBrains 随便用。常见用法是开两个窗格——一边编辑器，一边 `aider` 终端。也有 `--browser` 实验性 Web UI，但核心体验仍是 CLI。

---

## 安装与首次运行

官方推荐 Python 3.9–3.12 与 Git。安装方式（任选其一）：

```bash
# 方式 A：官方安装脚本（会处理依赖）
python -m pip install aider-install
aider-install

# 方式 B：pipx 隔离安装（Linux/macOS 常用）
pipx install aider-chat

# 方式 C：Homebrew（macOS）
brew install aider
```

进入**已是 Git 仓库**的项目目录，设置 API Key 并启动（Key 也可写在环境变量或 `.aider.conf.yml` 中）：

```bash
cd ~/projects/my-app

# Claude Sonnet 示例
export ANTHROPIC_API_KEY=sk-ant-...
aider --model sonnet

# 或 OpenAI
export OPENAI_API_KEY=sk-...
aider --model gpt-4o

# 启动时就把待编辑文件加入 session
aider --model sonnet src/api/routes.py tests/test_routes.py
```

首次运行会提示安装可选 extras（help、browser、playwright 等），按需选择即可。

---

## 代码示例 1：从零让 Aider 写一个 Python 脚本

下面是一次完整交互的简化再现。在空仓库或练习目录中：

```bash
git init factorial-demo && cd factorial-demo
aider --model sonnet factorial.py
```

在 `>` 提示符下输入：

```text
> 写一个 Python 程序：询问用户输入一个非负整数 n，计算 n! 并打印。
> 如果输入非法（负数或非整数）要友好提示。顺便加一个 if __name__ == "__main__" 入口。
```

Aider 会展示对 `factorial.py` 的 diff，确认后写入并 **auto-commit**。终端输出类似：

```text
Commit 3a1f2b8 feat: Add factorial CLI with input validation
Added factorial.py to the chat.
```

本地验证：

```bash
python factorial.py
# 输入 5 → 120

git log --oneline -1   # 看到 aider 的提交
aider> /undo           # 若不满意，在 aider 里撤销该 commit
```

这个例子体现 Aider 的基本循环：**自然语言需求 → diff 预览 → 写盘 → git commit**。

---

## 代码示例 2：在现有项目中加功能并跑测试

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
# 若测试失败，Aider 会把 stderr 放进上下文并尝试修复

> /lint
# 对 chat 中的文件跑 linter 并自动修
```

若测试命令常要用，可写入 `~/.aider.conf.yml`：

```yaml
# ~/.aider.conf.yml 片段
model: sonnet
auto-test: true
test-cmd: pytest -q
auto-lint: true
lint-cmd: ruff check --fix
```

这样每次 AI 改完代码后会**自动跑测试和 lint**，失败则进入修复循环——类似「搭档改完代码顺手帮你跑一遍 CI」。

---

## 常用斜杠命令速查

| 命令 | 作用 |
|------|------|
| `/add <file>` | 把文件加入可编辑 session |
| `/drop <file>` | 移出 session，节省 token |
| `/ask` | 只问不改 |
| `/code` | 请求改代码 |
| `/architect` | 双模型规划+编辑 |
| `/model <name>` | 切换主模型 |
| `/tokens` | 查看当前 context 用量 |
| `/undo` | 撤销上一次 aider 的 git commit |
| `/diff` | 查看变更 diff |
| `/run <cmd>` | 执行 shell，输出可选入 chat |
| `/web <url>` | 抓取网页作参考 |
| `/save <file>` | 导出可重建 session 的命令列表 |
| `/load <file>` | 批量执行 slash 命令 |

---

## 与其他工具怎么选

| 维度 | Aider | IDE 内置 AI（Copilot 等） | Cursor / Windsurf |
|------|-------|---------------------------|-------------------|
| 运行位置 | 终端 CLI | 编辑器内 | 独立 IDE |
| Git 集成 | 自动 commit，/undo | 视产品而定 | 内置 VCS |
| 仓库规模 | Repo Map 压缩全库 | 通常当前文件/打开文件 | 全库索引 |
| 适合谁 | 终端党、脚本化、多编辑器 | 日常补全 | AI-first 开发 |

Aider **不提供**行内 ghost text 补全；它的强项是**多文件编辑、Git 可追溯、可脚本化**（如 `aider --message "fix bug #42" --exit` 非交互跑一轮）。若你主要生活在 shell、tmux 或远程 SSH 环境，Aider 往往比「再开一个重型 IDE」更轻。

---

## 成本、隐私与本地模型

- **云模型**：按 token 计费；简单任务可 `/model` 切到更便宜的模型，复杂重构再用 Sonnet/GPT-4o。Anthropic 用户可开 `--cache-prompts` 降低重复 context 成本。
- **本地模型**：Aider 支持 Ollama、LM Studio 等 OpenAI 兼容端点，适合不能把代码送出内网的场景：

```bash
aider --model ollama_chat/qwen2.5-coder:7b \
  --openai-api-base http://127.0.0.1:11434/v1 \
  --openai-api-key dummy
```

- **隐私**：代码会发往你所选 LLM 提供商；敏感项目用本地模型或自建 API，并阅读各厂商数据政策。

---

## 实践建议（零基础上手）

1. **一定要在 Git 仓库里用**——否则失去 auto-commit / undo 这条安全网；新项目先 `git init`。
2. **少 add、精 add**——只加待改文件；让 Repo Map 承担「了解其余代码」的工作。
3. **小步提交**——一次对话一个清晰目标，便于 `/undo` 和 code review。
4. **配置写进 `.aider.conf.yml`**——模型、lint、test 命令固定下来，团队可共享模板。
5. **善用 `/ask` 再 `/code`**——先只读搞清结构，再动手改，减少误改。
6. **大重构用 `/architect`**——规划与执行分离，降低「一次 diff 改崩全文件」的风险。
7. **结合 CI 习惯**——设置 `auto-test` / `auto-lint`，让 AI 编辑和工程质量门禁绑在一起。

---

## 进一步阅读

- 官网与文档：[aider.chat](https://aider.chat/)
- GitHub：[Aider-AI/aider](https://github.com/Aider-AI/aider)
- 安装详解：[Installation](https://aider.chat/docs/install.html)
- 用法指南：[Usage](https://aider.chat/docs/usage.html)
- 配置选项：[Options reference](https://aider.chat/docs/config/options.html)
- LLM 连接：[Connecting to LLMs](https://aider.chat/docs/llms.html)

---

## 小结

Aider 把「AI 结对编程」收敛成一件终端里就能完成的事：**你说话，它改 Git 跟踪的文件，并留下可审查的 commit 历史。** 核心抓手是 Chat Session 中的文件列表、Repo Map 的全局视野，以及 slash 命令对模式/模型/测试/lint 的精细控制。对于习惯命令行、重视版本可追溯、希望在任意编辑器旁边挂一个 AI 搭档的开发者，Aider 是值得从零掌握的基础工具之一。
