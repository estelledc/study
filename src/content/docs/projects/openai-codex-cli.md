---
title: OpenAI Codex CLI — 终端里的本地编程代理
来源: 'OpenAI, "Codex CLI", https://developers.openai.com/codex/cli'
日期: 2026-06-13
分类: CLI
子分类: 命令行工具
provenance: pipeline-v3
---

## 是什么

OpenAI Codex CLI 是 OpenAI 开源的**本地编程代理**：你在终端里用自然语言描述任务，它会在当前目录里读代码、改文件、跑命令，直到认为任务完成。实现语言是 Rust，主打启动快、占用低。

日常类比：

> 你雇了一位**坐在你电脑旁边的初级工程师**。
> 你说「给登录接口加单元测试」，他会自己打开项目、翻文件、写测试、跑 `npm test`，每改一步都先问你「我可以执行这条命令吗？」——除非你明确放权。
> 和 ChatGPT 网页版最大的区别是：**手长在本地文件系统和 shell 上**，不是只吐一段代码让你自己粘贴。

Codex 家族其实有三张脸，别混：

| 形态 | 入口 | 适合谁 |
|------|------|--------|
| **Codex CLI** | 终端 `codex` | 想在现有工作流里用代理、要脚本化/CI |
| **Codex App** | 桌面应用 `codex app` | 喜欢图形界面、多项目切换 |
| **Codex Cloud** | 浏览器 / `codex cloud` | 任务丢到云端环境，本地 `codex apply` 拉 diff |

本篇只聚焦 **CLI**。

## 为什么重要

2025 年起，「AI 写代码」从聊天框迁到了**代理（agent）**范式：模型不只要生成文本，还要**规划 → 调工具 → 看结果 → 再规划**。Codex CLI 是 OpenAI 在这条线上的官方终端产品，和 Cursor Agent、Claude Code、Gemini CLI 同一赛道。

值得学它的原因：

- **订阅即用**：ChatGPT Plus / Pro / Business 等计划已包含 Codex 额度，不必单独买 API（也可用 API Key，但部分云功能受限）
- **沙箱 + 审批**：默认限制 shell 权限，比「模型随便跑 `rm -rf`」安全一个数量级
- **`codex exec` 可脚本化**：能塞进 CI、pre-commit、内部运维流水线
- **MCP 生态**：通过 Model Context Protocol 接数据库、浏览器、文档站，扩展上下文边界
- **开源可审计**：仓库在 [github.com/openai/codex](https://github.com/openai/codex)，行为比黑盒插件好排查

## 安装与首次登录

支持 macOS、Linux、Windows（Windows 可用原生沙箱或 WSL2）。

**一行安装（macOS / Linux）：**

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

**Windows（PowerShell）：**

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

也可用包管理器：

```bash
npm install -g @openai/codex
# 或 macOS
brew install --cask codex
```

装好后：

```bash
codex --version
codex login          # 浏览器 OAuth 登录 ChatGPT，或 API Key
codex login status   # 退出码 0 = 已登录，适合脚本探测
```

无交互安装（CI 装二进制）可设 `CODEX_NON_INTERACTIVE=1`。

## 核心概念

### 1. 交互式 TUI vs 非交互 `exec`

- **`codex`**：全屏终端 UI（TUI），适合探索性开发——你能实时看到它读了哪些文件、拟执行什么命令，并逐条批准。
- **`codex exec`**（别名 `codex e`）：**无人值守**模式，适合脚本和流水线；结束后把最终说明打到 stdout，可加 `--json` 输出事件流。

### 2. 沙箱（sandbox）三档

模型生成的 shell 命令会经过 OS 级沙箱（macOS Seatbelt、Linux Landlock+seccomp、Windows 受限令牌）：

| 模式 | 含义 |
|------|------|
| `read-only` | 只能读，不能写文件、不能联网（默认偏保守） |
| `workspace-write` | 可在工作区写文件，网络仍受限；**日常本地开发推荐** |
| `danger-full-access` | 几乎不设限，仅应在容器/VM 里用 |

本地顺手组合：

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

### 3. 审批（approval）

`--ask-for-approval` 控制何时暂停等人点头：

- `on-request`：交互式默认，有风险操作才问
- `never`：给 `exec` / CI 用，必须配合严格沙箱
- `untrusted`：更谨慎

切忌在生产机上随便加 `--yolo`（`--dangerously-bypass-approvals-and-sandbox`）。

### 4. 配置：`~/.codex/config.toml`

持久默认值写 TOML，命令行 `-c key=value` 可单次覆盖。常见项：

- 模型与推理强度（会话内也可用 `/model` 切换）
- `sandbox_mode`
- MCP 服务器列表
- **profiles**：`~/.codex/<name>.config.toml` 叠加载入，用 `-p <name>` 切换「工作 / 开源 / 客户项目」配置

### 5. 会话：resume / fork

Codex 在本地保存 transcript。`codex resume` 接着上次聊，`codex fork` 从旧会话分叉新线程——长任务改需求时很有用，不必重讲一遍仓库结构。

### 6. MCP（Model Context Protocol）

`codex mcp add` 注册外部工具（stdio 子进程或 HTTP 服务）。Codex 也能**反向**当 MCP 服务器：`codex mcp-server`，让别的代理把 Codex 当工具调用。

### 7. 项目指令：AGENTS.md

在仓库根放 `AGENTS.md`（概念同 Cursor 的 rules），写清构建命令、测试约定、目录结构。Codex 会把它当**长期上下文**，减少「跑错包管理器」类低级错误。

## 实践案例

### 案例 1：交互式修一个 failing test

```bash
cd ~/projects/my-api
codex --sandbox workspace-write --ask-for-approval on-request \
  "tests/user.test.ts 里 'returns 404 for missing user' 失败了。先读测试和实现，修到 npm test 全绿，不要改公开 API。"
```

典型流程：

1. Codex 用内置工具读文件、搜符号
2. 提议修改 `src/routes/user.ts`，问你批准
3. 提议运行 `npm test -- user.test.ts`，你确认
4. 全绿后总结 diff

TUI 里可用 `/model` 换模型或调 reasoning；贴截图用 `-i screenshot.png`。

### 案例 2：CI 里用 `codex exec` 做自动修复草稿

在 GitHub Actions 或自建 runner 上（务必隔离 runner）：

```bash
#!/usr/bin/env bash
set -euo pipefail

export CODEX_API_KEY="${OPENAI_API_KEY}"   # 若用 API Key 登录

codex exec \
  --sandbox workspace-write \
  --ask-for-approval never \
  --ephemeral \
  --output-last-message /tmp/codex-summary.txt \
  --json \
  "Read the lint errors from 'npm run lint 2>&1' output below and apply minimal fixes only. Do not change behavior.

$(npm run lint 2>&1 || true)"
```

说明：

- `--ephemeral`：不落盘 session 文件，适合一次性 CI job
- `--json`：机器可读事件，便于日志采集
- `--output-last-message`：最后一句话写入文件，方便 PR 评论机器人读取
- 管道内容：`echo "..." | codex exec "Summarize"` 时，stdin 会附在 prompt 后面

更稳妥的做法是**只让 Codex 生成 patch**，由人来 `git apply`，而不是 `never` 审批全自动合并。

### 案例 3：注册 MCP 服务器（Playwright 举例）

```bash
# 假设已配置好 @playwright/mcp
codex mcp add playwright -- npx -y @playwright/mcp@latest

codex mcp list
```

之后在 TUI 里可以让 Codex「打开本地 dev server 并点一遍结账流程」，浏览器操作走 MCP，而不是瞎编 DOM。

### 案例 4：连接 Codex Cloud 任务

```bash
codex cloud list --json
codex apply <TASK_ID>    # 把云端生成的 diff 应用到当前 git 工作区
```

适合：笔记本上发起任务，台式机拉结果；或 PR 里 `@codex` 触发云任务后再本地落地。

## 常用命令速查

```bash
codex                          # 交互 TUI
codex -C /path/to/repo "prompt" # 指定工作目录
codex resume --last            # 继续当前目录最近一次会话
codex exec "..."               # 非交互
codex review                   # 本地代码审查（独立代理）
codex doctor                   # 安装/配置/鉴权自检
codex completion zsh           # 生成 shell 补全
codex update                   # 自更新（release 构建）
codex features list            # 查看 feature flag
```

## 与 Cursor / Claude Code 怎么选

| 维度 | Codex CLI | IDE 内置代理（如 Cursor） |
|------|-----------|---------------------------|
| 界面 | 终端 TUI | 编辑器内嵌 |
| 触发 | shell、CI 脚本 | 选中代码、侧边栏 |
| 多文件编辑 | 强，靠代理循环 | 强，带 diff 预览 |
| 非编码用户 | 门槛高 | 相对低 |

很多团队是**组合使用**：日常在 Cursor 里写，夜间 CI 用 `codex exec` 尝试自动修 lint，或统一用 ChatGPT 订阅额度。

## 踩过的坑

1. **不在 Git 仓库里跑**：默认会检查 Git 根；临时目录要加 `--skip-git-repo-check`。
2. **沙箱太严导致 `npm install` 失败**：需要写 `node_modules` 时用 `workspace-write`，别一直 `read-only`。
3. **API Key 与 ChatGPT 登录能力不一致**：云任务、部分 OAuth 功能要 ChatGPT 账号；纯 API Key 读文档确认限制。
4. **`--full-auto` 已废弃**：官方推荐 `--sandbox workspace-write`，旧脚本会打警告。
5. **Windows 路径**：原生 PowerShell 沙箱已稳定，但 Linux 专属工具链仍建议 WSL2。
6. **机密进 prompt**：代理会读文件、打日志；别把 `.env` 内容贴进任务，用环境变量 + `.gitignore` 隔离。

## 延伸阅读

- 官方 CLI 文档：<https://developers.openai.com/codex/cli>
- 命令行完整参考：<https://developers.openai.com/codex/cli/reference>
- 功能与工作流：<https://developers.openai.com/codex/cli/features>
- 快速开始：<https://developers.openai.com/codex/quickstart>
- 源码：<https://github.com/openai/codex>
- 配置说明：`~/.codex/config.toml` 见官方 Config basics
- 代理行为约定：仓库内 `AGENTS.md` 说明

## 小结

Codex CLI 把「会写代码的大模型」变成**能动手的工作区代理**：`codex` 负责结对编程，`codex exec` 负责自动化，`sandbox` + `approval` 负责安全边界，`MCP` 负责接外部世界。零基础上手路径很直——安装、`codex login`、在项目目录 `codex`，从一个小任务（修测试、加类型、写 README）开始，熟悉批准流程后再放开沙箱或写 CI 脚本。
