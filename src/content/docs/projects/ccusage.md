---
title: ccusage — 本地 Coding CLI 用量与成本「账单解析器」
来源: 'ryoppippi, "ccusage", https://github.com/ryoppippi/ccusage'
日期: 2026-06-13
子分类: 命令行工具
分类: CLI
provenance: pipeline-v3
---

## 是什么

**ccusage**（coding CLI usage 的缩写）是一个**完全本地运行**的命令行工具：它读取 Claude Code、Codex、OpenCode、Gemini CLI 等编程代理在你电脑上自动写下的 JSONL / 会话日志，把 token 用量和**估算美元成本**汇总成可读表格或 JSON。

日常类比：

> 手机运营商不会在你每次刷视频时弹窗报账，但月底会出一份**流量详单**——哪天用了多少 GB、哪个 App 最费流量、合计多少钱。
> 你用 Coding CLI 写代码时，代理同样在本地悄悄记「输入/输出 token、模型名、缓存命中」；ccusage 就是那份**详单解析器**。
> 数据不上传云端，只在你的机器上读文件、算数、打印表格。

项目由 [@ryoppippi](https://github.com/ryoppippi) 维护，GitHub 约 1.5 万 star，npm 包名 `ccusage`，文档站 [ccusage.com](https://ccusage.com/)。实现以 Rust 为主，体积极小，推荐用 `bunx ccusage` 免安装直接跑。

## 为什么重要

2025–2026 年，开发者日常工具从「网页聊天」变成**终端里的编程代理**。Claude Code、Codex、Cursor Agent 等按 token 计费或受订阅额度约束，但**原生 UI 很少告诉你**：

- 今天已经烧了多少 Opus / Sonnet？
- 上周 refactor 大仓库的那次 session 单独花了多少钱？
- Claude Max 的 **5 小时滚动窗口**还剩多少额度？
- 同一台机器上 Codex 和 Claude Code 加起来本月多少？

ccusage 的价值在于：

| 痛点 | ccusage 怎么做 |
|------|----------------|
| 用量分散在多个 CLI | 默认**自动检测**已安装代理，一张表汇总 |
| 只有 token 没有钱 | 按 LiteLLM 定价表**估算 USD**（可 `--offline`） |
| 想按项目/会话复盘 | `session`、`--instances`、`--project` 多维切片 |
| 要接脚本或仪表盘 | `--json` 导出结构化数据 |
| Claude 限流窗口难感知 | `blocks` 子命令对齐 **5 小时 billing window** |

**隐私边界**：只读本地日志，不把对话内容发到 ccusage 服务器。成本是**估算值**，与官方账单可能有偏差，适合趋势监控而非财务对账。

## 安装与第一次运行

无需全局安装，任选包运行器：

```bash
# 推荐：bunx 会缓存包，第二次起更快
bunx ccusage

# 其他方式
npx ccusage@latest
pnpm dlx ccusage
nix run github:ryoppippi/ccusage -- daily
```

前提：至少用过一种受支持的 Coding CLI，且本地已有 usage 日志。若表格为空，先确认对应数据目录存在（见下文「数据从哪来」）。

## 核心概念

### 1. 数据源（Agent / Source）

ccusage 不 hook 网络请求，只扫描各 CLI 的**默认数据目录**。常用路径：

| Agent | 命令前缀 | 典型数据位置 |
|-------|----------|--------------|
| Claude Code | `ccusage claude` | `~/.config/claude/projects/` 或 `~/.claude/projects/` |
| Codex | `ccusage codex` | `${CODEX_HOME:-~/.codex}` |
| OpenCode | `ccusage opencode` | `${OPENCODE_DATA_DIR:-~/.local/share/opencode}` |
| Gemini CLI | `ccusage gemini` | `${GEMINI_DATA_DIR:-~/.gemini/tmp}` |
| GitHub Copilot CLI | `ccusage copilot` | `~/.copilot/otel/*.jsonl` |

完整列表见 [ccusage.com/guide](https://ccusage.com/guide/)。环境变量可指向自定义路径，多个目录可用逗号分隔。

### 2. 报告维度（Report Views）

同一批原始日志，可按不同「切片方式」聚合：

- **daily / weekly / monthly**：按日历日期、周、月汇总——适合看趋势、做预算。
- **session**：按**单次对话**汇总——适合复盘「哪次 debug 最费 token」。
- **blocks**（Claude Code 专用）：按 Anthropic **5 小时滚动计费窗口**——对齐 Max / Pro 限流体感。
- **statusline**（Beta）：输出一行紧凑摘要，供 Claude Code **status bar hook** 调用。

默认 `ccusage` = `ccusage daily`，且**包含所有已检测到的 Agent**。要只看某一个：`ccusage claude daily`。

### 3. Token 与成本模型

表格列通常包括：

- **Input / Output**：发给模型 / 模型返回的 token 数。
- **Cache Create / Cache Read**（宽终端）：Prompt Cache 写入与命中——命中通常更便宜，是 Claude 长上下文场景的省钱关键。
- **Cost (USD)**：根据模型单价推算，非官方发票。

`--breakdown` 可展开**按模型**的成本明细；`--mode display`（Claude）等源专属 flag 影响 Claude 侧 token 分类方式。

### 4. 过滤、时区与输出形态

- `--since YYYYMMDD` / `--until YYYYMMDD`：日期范围。
- `--timezone UTC`：按指定时区切日——跨时区团队对齐「今天」的定义。
- `--json`：机器可读，便于 jq / Python 二次分析。
- `--compact`：窄表，适合截图分享。
- `--offline`：用内置缓存定价，无网络也能估算 Claude 模型成本。

终端宽度 &lt; 100 字符时自动隐藏次要列；可用 `--color` / `--no-color` 控制着色。

### 5. Claude 项目维度（Instances）

Claude Code 按仓库/项目写不同子目录。`--instances` 按**项目实例**分组；`--project <name>` 过滤单一项目——适合 monorepo 或同时维护多个客户代码库时，看清「哪个项目最吃 token」。

## 实践案例

### 案例 1：每日巡检——本月 Claude + Codex 各花多少

适合：个人开发者想控制订阅预算，每天早上扫一眼。

```bash
# 看 6 月整月，所有已检测 CLI 的日汇总
bunx ccusage monthly --since 20260601 --until 20260630

# 只要 Claude Code，并按模型拆成本
bunx ccusage claude daily --breakdown --since 20260601

# 只要 Codex
bunx ccusage codex daily --since 20260601
```

读表时重点看：**Cost 列突增的日期**是否对应大 refactor、长 session 或未换 Sonnet；**Cache Read** 比例高说明 prompt caching 在起作用。

### 案例 2：导出 JSON，用 jq 找「最贵的前 5 个 session」

适合：写周报、或把数据喂给自建 Grafana / Obsidian 数据view。

```bash
bunx ccusage session --json > /tmp/ccusage-sessions.json

# 示例：按 cost 降序取前 5（字段名以实际 JSON 为准，可用 jq 'keys' 探测）
jq '[.[] | select(.cost != null)] | sort_by(-.cost) | .[0:5]' /tmp/ccusage-sessions.json
```

也可走管道一次性统计：

```bash
bunx ccusage daily --json --since 20260601 | jq '[.[] | .cost] | add'
```

团队规范：CI 不必跑 ccusage，但可在**每月 1 号 cron** 跑 `monthly --json` 归档到 git-ignored 目录，对比环比。

### 案例 3：Claude Max 用户——盯 5 小时 block 剩余额度

Claude 订阅对用量按**滚动 5 小时窗口**限流，不是自然日。ccusage 的 `blocks` 子命令专门对齐这一计费语义：

```bash
bunx ccusage blocks
bunx ccusage claude blocks --timezone Asia/Shanghai
```

输出会标出当前 active block 内的用量与窗口边界。配合 **statusline** 可在 Claude Code 底部状态栏实时看到 burn rate（Beta，需在 Claude hooks 配置里调用 `ccusage statusline`）。

### 案例 4：多项目 Claude Code——谁最费 Opus

```bash
# 列出各 project instance 的日用量
bunx ccusage claude daily --instances --since 20260601

# 只看名为 my-api 的项目
bunx ccusage claude daily --instances --project my-api --json
```

发现某个 side project 意外全是 Opus 时，可以回到 Claude Code 用 `/model` 切 Sonnet，或缩短 AGENTS.md 注入的上下文。

## 配置与扩展

ccusage 支持 JSON **配置文件**设置默认时区、颜色、数据源路径等（详见官方 Configuration 页）。优先级大致为：**CLI 参数 &gt; 配置文件 &gt; 自动检测默认值**。

其他能力：

- **MCP Server**：ccusage 可暴露为 Model Context Protocol 服务，让别的代理查询本地用量（集成场景）。
- **Nix Flake**：`nix run github:ryoppippi/ccusage` 可复现构建，定价文件嵌入 flake，沙箱构建无需联网拉价目表。

## 常见问题

**Q：表格是空的？**  
先确认对应 CLI 至少成功跑过一次；检查 `~/.config/claude/projects/`、`~/.codex` 等是否存在 JSONL。自定义路径用 `CLAUDE_CONFIG_DIR`、`CODEX_HOME` 等环境变量。

**Q：成本和 Anthropic 发票对不上？**  
正常。ccusage 按公开定价估算，不含税费、促销、Team 座位分摊；Web Search 等**非 LLM 工具调用**也可能不在 token 日志里。

**Q：和 Claude Code 内置 `/cost` 有什么区别？**  
内置命令看**当前会话**；ccusage 跨会话、跨日期、**跨多个 CLI** 做离线聚合，更适合长期统计。

**Q：Windows 能用吗？**  
可以。WSL 下路径与 Linux 一致；原生 Windows 需注意各 CLI 的数据目录位置，必要时用环境变量指向 `%USERPROFILE%` 下实际路径。

## 常用命令速查

| 目的 | 命令 |
|------|------|
| 今日默认总览 | `bunx ccusage` |
| 周/月趋势 | `bunx ccusage weekly` / `monthly` |
| 单 CLI | `bunx ccusage claude daily` |
| 按会话 | `bunx ccusage session` |
| Claude 5h 窗口 | `bunx ccusage blocks` |
| 导出 JSON | `bunx ccusage daily --json` |
| 日期过滤 | `--since 20260601 --until 20260613` |
| 离线估价 | `--offline` |
| 帮助 | `bunx ccusage --help` |

## 延伸阅读

- 官方文档：[ccusage.com/guide](https://ccusage.com/guide/)
- 仓库：[github.com/ryoppippi/ccusage](https://github.com/ryoppippi/ccusage)
- npm：[npmjs.com/package/ccusage](https://www.npmjs.com/package/ccusage)
- 相关工具：Claude Code 内置 `/cost`；OpenAI Codex 侧可配合 `codex` 自有日志目录用 `ccusage codex` 统一查看

---

**一句话总结**：ccusage 把「Coding CLI 在本地留下的 token 日志」变成**可读的账单式报表**——不上传对话、不替官方开票，但足够让你知道**钱和时间花在了哪几次 session、哪几个模型、哪几个项目**上。
