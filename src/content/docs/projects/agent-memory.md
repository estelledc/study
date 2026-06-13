---
title: 'agentmemory — 给 AI 编程助手装上「跨会话长期记忆」'
来源: 'https://github.com/rohitg00/agentmemory'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 日常类比：便签 vs 档案室

你带一个新同事修代码。第一天你讲了半小时：鉴权用 JWT、测试在 `test/auth.test.ts`、别用 `jsonwebtoken` 要用 `jose`。第二天他像失忆一样又问一遍。你会怎么办？

- **便签式记忆**：`CLAUDE.md`、Cursor Notepad、`.cursorrules` —— 像贴在显示器边的便利贴，手写、容量有限（官方 README 说大约 200 行就会过时），每次会话往往**整份塞进上下文**。
- **agentmemory**：像公司档案室 + 智能检索员。助手干活时**静默记录**（读了什么文件、跑了什么命令、踩了什么坑），压缩成可搜索条目；新会话开始时只**检索最相关的几条**注入，而不是把全部历史复述一遍。

一句话：**内置记忆是静态便签；agentmemory 是可搜索、可衰减、可跨 Agent 共享的记忆引擎。**

## 是什么

[agentmemory](https://github.com/rohitg00/agentmemory) 是面向 **AI 编程 Agent** 的持久化记忆系统，由 Rohit G. 维护，基于 [iii engine](https://github.com/iii-hq/iii) 构建。它通过 **Hooks 自动捕获**、**MCP / REST API 读写**、**混合检索** 三条腿，让 Claude Code、Cursor、Codex、OpenCode、Aider 等工具共享同一套记忆。

典型卖点（来自官方 benchmark 自述，需自行复现验证）：

| 维度 | 内置记忆（如 CLAUDE.md） | agentmemory |
|------|-------------------------|-------------|
| 规模 | ~200 行上限 | 理论上无上限（SQLite 本地存储） |
| 检索 | 全文加载进上下文 | BM25 + 向量 + 知识图谱，RRF 融合 |
| Token 成本 | 240 条观察可达 22K+ tokens | 默认约 2000 token 预算注入 |
| 跨 Agent | 各工具各一份文件 | 一个 memory server，MCP/REST 共用 |
| 外部依赖 | 无 | 无（SQLite + iii-engine，无需 Postgres/Redis） |

## 为什么需要它

编程 Agent 的上下文窗口再大，**会话结束就清零**。你会反复：

1. 解释项目架构和目录约定  
2. 重复「上次我们为什么选 A 不选 B」  
3. 重新发现同一个 N+1 查询或同一个 flaky test  

agentmemory 试图把「解释成本」从每次 5 分钟压到接近零：**Session 1 做过的事，Session 2 通过检索自动浮现。**

## 核心概念

### 1. 记忆流水线（Memory Pipeline）

官方 README 描述的标准路径：

```text
PostToolUse hook
  → SHA-256 去重（5 分钟窗口）
  → 隐私过滤（剥离 API Key、密钥）
  → 存原始 observation
  → LLM 压缩 → 结构化事实 + 概念 + 叙述
  → 向量嵌入 → 写入 BM25 + 向量索引

SessionEnd / Stop
  → 会话摘要
  → 可选：知识图谱抽取、slot reflection

SessionStart
  → 加载项目 profile
  → 混合检索（BM25 + vector + graph）
  → 按 token 预算（默认 ~2000）注入对话
```

你要记住的不是某一行配置，而是**「捕获 → 压缩 → 索引 → 按需召回」** 四段式闭环。

### 2. 四层记忆巩固（4-Tier Consolidation）

类比人脑睡眠巩固：

| 层级 | 内容 | 类比 |
|------|------|------|
| Working | 工具调用的原始观察 | 短期记忆 |
| Episodic | 会话级摘要 | 「发生了什么」 |
| Semantic | 抽取的事实与模式 | 「我知道什么」 |
| Procedural | 工作流与决策模式 | 「怎么做」 |

记忆会**随时间衰减**（艾宾浩斯曲线），常访问的加强，陈旧的自动淘汰，矛盾条目可被检测与合并。

### 3. 三重混合检索（Hybrid Search）

| 通道 | 作用 | 典型场景 |
|------|------|----------|
| BM25 | 关键词 + 词干 + 同义词扩展 | 「auth middleware」精确命中 |
| Vector | 嵌入余弦相似度 | 「数据库变慢」命中「N+1 查询修复」 |
| Graph | 实体图遍历 | 「和 JWT 相关的文件/决策」 |

三路结果用 **RRF（Reciprocal Rank Fusion, k=60）** 融合，并限制单会话最多贡献 3 条，避免一次检索被同一 session 霸榜。

### 4. 三种接入面

| 接入方式 | 谁用 | 说明 |
|----------|------|------|
| **Hooks** | Claude Code / Codex / OpenCode 等 | 零手动：工具前后自动 observe |
| **MCP** | Cursor、Cline、Claude Desktop 等 | `@agentmemory/mcp` shim，连上 server 后 53 个 tool |
| **REST** | Aider、自定义脚本 | `http://localhost:3111/agentmemory/*` |

**重要细节**：`@agentmemory/mcp` 是薄 shim。只有 `AGENTMEMORY_URL` 指向**正在运行的 server** 时才有完整 53 tools；否则退化为 7 个本地 tool（`memory_save`、`memory_smart_search` 等）。很多人 Cursor 里「只有 7 个工具」就是这个原因。

### 5. 端口与进程

| 端口 | 用途 |
|------|------|
| `3111` | REST API + MCP HTTP + `/agentmemory/health` |
| `3113` | 实时 Viewer（观察流、会话回放、图谱可视化） |
| `49134` | iii WebSocket（`mem::remember` 等函数直连） |

## 快速上手

### 安装与演示

```bash
# 终端 1：启动 memory server
npx @agentmemory/agentmemory

# 终端 2：灌入示例数据并看语义检索
npx @agentmemory/agentmemory demo

# 健康检查
curl http://localhost:3111/agentmemory/health

# 浏览器打开实时面板
open http://localhost:3113
```

`demo` 会种子 3 个虚构会话（JWT 鉴权、N+1 修复、限流），并演示搜「database performance optimization」能否召回「N+1 query fix」——纯关键词 grep 做不到这种跨表述匹配。

### 接到 Cursor（MCP）

在 `~/.cursor/mcp.json` 的 `mcpServers` 里合并：

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}
```

或用 CLI 一键写入：

```bash
agentmemory connect cursor
```

**前提**：另一个终端里 `agentmemory` 已在跑，否则 shim 只有 7 tools。

## 代码示例

### 示例 1：REST API — 手动写入与混合搜索

适合 Aider、CI 脚本、或任何能发 HTTP 的 Agent：

```bash
# 写入一条长期记忆（决策、模式、踩坑）
curl -s -X POST http://localhost:3111/agentmemory/remember \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "my-api",
    "content": "Auth uses jose JWT middleware in src/middleware/auth.ts; tests in test/auth.test.ts",
    "tags": ["auth", "decision"]
  }'

# 混合语义 + 关键词搜索
curl -s -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "my-api",
    "query": "how does token validation work",
    "limit": 5
  }'

# 新会话开始时拉取注入用上下文块
curl -s -X POST http://localhost:3111/agentmemory/context \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "my-api",
    "query": "rate limiting on API",
    "maxTokens": 2000
  }'
```

若设置了 `AGENTMEMORY_SECRET`，上述请求需加 `Authorization: Bearer <token>`。

### 示例 2：Python + iii-sdk — 直连引擎函数

agentmemory 把核心操作注册为 iii 函数（`mem::remember`、`mem::smart-search`、`mem::context` 等），任意语言只要装 iii-sdk 即可走 WebSocket，不必为每种语言写 REST 客户端：

```python
from iii import register_worker

iii = register_worker("ws://localhost:49134")
iii.connect()

# 语义检索：等价于 REST 的 smart-search
result = iii.trigger({
    "function_id": "mem::smart-search",
    "payload": {
        "project": "demo",
        "query": "how do tokens refresh",
        "limit": 5,
    },
})
print(result)

# 显式记住一条洞察（Agent 也可通过 MCP 的 memory_save 做同样的事）
iii.trigger({
    "function_id": "mem::remember",
    "payload": {
        "project": "demo",
        "content": "Chose jose over jsonwebtoken for Edge runtime compatibility",
    },
})
```

官方示例目录：`examples/python/`。

### 示例 3：MCP 工具面（Agent 侧）

连上完整 server 后，Agent 可调用（节选）：

| Tool | 用途 |
|------|------|
| `memory_save` | 保存决策/模式 |
| `memory_smart_search` | 混合检索 |
| `memory_recall` | 搜历史 observation |
| `memory_profile` | 项目级概念与文件画像 |
| `memory_graph_query` | 知识图谱遍历 |

Claude Code 还可装 plugin + 15 个 slash skills（`/recall`、`/remember`、`/handoff` 等），让模型知道**何时**该调这些 tool。

## Hooks：零手动捕获

以 Claude Code 为例，plugin 注册约 12 个生命周期 hook：

| Hook | 捕获什么 |
|------|----------|
| `SessionStart` | 项目路径、session id → 触发 context 注入 |
| `UserPromptSubmit` | 用户提示（经隐私过滤） |
| `PreToolUse` | 即将访问的文件 + enrich |
| `PostToolUse` | 工具名、输入、输出 |
| `PostToolUseFailure` | 错误上下文 |
| `Stop` / `SessionEnd` | 会话摘要、图谱抽取 |

你不需要每次说「请记住」——**修 bug 的过程本身就会变成可检索记忆。**

## 嵌入与本地优先

推荐免费本地方案：

```bash
npm install @xenova/transformers
```

默认模型 `all-MiniLM-L6-v2`，离线可用；官方称相对纯 BM25 有约 +8pp recall。也支持 OpenAI、Gemini、Voyage、Cohere、OpenRouter 等云端嵌入。

## 与竞品 / 内置方案怎么选

| 方案 | 适合 | 不适合 |
|------|------|--------|
| CLAUDE.md / rules | 稳定、少变的团队约定 | 大量会话沉淀、语义检索 |
| mem0 / 云 API | 已有向量库基础设施 | 想零外部依赖、完全本地 |
| Letta | 需要完整 Agent 运行时 | 只想给现有 Cursor/Claude 加记忆 |
| **agentmemory** | 多 Agent、要 hooks 自动捕获、要 viewer 调试 | 不愿常驻本地 server 进程 |

agentmemory 还强调与 [codegraph](https://github.com/colbymchenry/codegraph)、Understand Anything 等「代码/文档图谱」项目配对：**它记「做过什么」；图谱项目补「结构是什么」。**

## 踩坑清单

1. **只有 7 个 MCP tool**：没起 `agentmemory` server，或 `AGENTMEMORY_URL` 没指对。  
2. **Cursor 沙箱访问不了 localhost**：Flatpak/Snap 等需 `AGENTMEMORY_FORCE_PROXY=1` 并改 URL 为宿主机可达地址。  
3. **Claude Code 只靠 import-jsonl**：`cleanupPeriodDays` 默认 30 天会删旧 JSONL；应装 hooks 或定期 import。  
4. **升级后 hook 路径失效**：手动配 hook 时路径带版本号；用 `agentmemory connect claude-code --with-hooks` 或官方 plugin 路径。  
5. **隐私**：虽有自动脱敏，仍避免把生产密钥写进会被 observe 的 prompt；可用 `<private>` 标签或治理删除 API。  
6. **Windows**：需单独装 `iii-engine` v0.11.2 二进制或 Docker；`agentmemory connect` 部分能力受限。

## 运维与部署

- 本地：`npm i -g @agentmemory/agentmemory` → `agentmemory` / `agentmemory doctor`  
- 一键模板：Fly.io、Railway、Render、Coolify（见 `deploy/`）  
- 数据默认 SQLite，可 export/import JSON 备份  
- Viewer `:3113` 在容器部署时通常只绑 loopback，需 SSH 隧道访问  

## 学习路径建议

1. **先跑 demo**：建立「语义检索 ≠ grep」的直觉。  
2. **开 Viewer**：看一条 memory 从 observation 到压缩的链路。  
3. **接一个 Agent**：Cursor MCP 或 Claude Code plugin 二选一。  
4. **故意开第二次会话**：问「我们 auth 怎么做的」，验证是否免复述。  
5. **读 benchmark 复现**：`eval/README.md`、`benchmark/LONGMEMEVAL.md` 用数据而非 star 数做判断。

## 小结

agentmemory 解决的不是「让 LLM 更聪明」，而是**把跨会话的知识外置成可检索、可衰减、可审计的存储**。Hooks 负责无人值守地写入；混合检索负责少 token 地读出；MCP/REST/iii 负责接入你已经在用的任何编程 Agent。

若你厌倦了每个周一重新给 AI 讲一遍项目史，它值得用 30 秒 demo 验证一次——然后再决定要不要把 `CLAUDE.md` 从「全文背诵」降级成「稳定公约 + agentmemory 动态档案」。
