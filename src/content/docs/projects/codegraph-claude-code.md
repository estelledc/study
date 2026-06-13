---
title: CodeGraph — 面向 AI 编程代理的预索引代码知识图谱
来源: https://github.com/colbymchenry/codegraph
日期: 2026-06-13
子分类: 开发者工具
分类: CLI
provenance: pipeline-v3
---

## 是什么

[CodeGraph](https://github.com/colbymchenry/codegraph)（npm 包名 `@colbymchenry/codegraph`）是一套**本地优先**的代码智能工具：用 [tree-sitter](https://tree-sitter.github.io/) 把仓库解析成符号与调用关系，存入 SQLite 知识图谱，再通过 **MCP（Model Context Protocol）** 暴露给 Claude Code、Cursor、Codex CLI、OpenCode 等 AI 编程代理。

日常类比：

> 把陌生城市交给一位只会「挨家敲门问路」的导游，和交给一位**手里已有完整地铁线路图 + 商铺名录**的导游，体验完全不同。
>
> 没有 CodeGraph 时，代理往往靠 `grep`、`glob`、`Read` 在文件海里摸索——每敲一扇门都消耗 token 和工具调用次数。CodeGraph 相当于**提前把整座「代码城市」画成可查询的地图**：问「登录请求怎么走到数据库」，代理直接查图，而不是从 `src/` 根目录开始地毯式搜索。

项目由 Colby McHenry 维护，MIT 许可，2026 年 1 月发布 1.0。官方宣称在 7 个真实开源仓库上，相较纯 grep/Read 探索，**中位数约少 58% 工具调用、少 47% token、快 22%**（Claude Opus 4.8，2026-06-02 复测）。

## 为什么重要

2025–2026 年 AI 编程的主流范式是 **agent**：模型反复「规划 → 调工具 → 看结果」。探索型任务的成本大头往往在**发现代码在哪**，而不是理解已读到的片段。

CodeGraph 针对的正是这一瓶颈：

| 痛点 | CodeGraph 的做法 |
|------|------------------|
| 大仓库里 grep 命中太多 | FTS5 全库符号名搜索 + 图遍历 |
| 调用链要多次 Read 拼接 | `codegraph_explore` 一次返回相关源码与关系图 |
| 改函数不知道谁会坏 | `codegraph_callers` / `impact` 做影响半径分析 |
| 索引过期 | 原生文件监听（FSEvents / inotify）+ 2s 防抖增量同步 |
| 代码隐私 | **100% 本地**，数据不进云端，无需 API Key |

与同名但不同的 [codegraph-ai/CodeGraph](https://github.com/codegraph-ai/CodeGraph)（偏 VS Code 扩展、38+ 语言）相比，**colbymchenry 版**明确面向 Claude Code / Cursor / Codex 的 MCP 集成，并有公开 benchmark。

## 核心概念

### 1. 知识图谱（Knowledge Graph）

节点是**符号**（函数、类、方法、路由等），边是**关系**（calls、imports、extends、implements、references 等）。例如：

```
[Router.get('/users')] --references--> [listUsers handler]
[listUsers] --calls--> [UserService.findAll]
[UserService.findAll] --calls--> [db.query]
```

代理问「`/users` 接口最终查哪张表」，沿边走几跳即可，不必全文搜索 `users`。

### 2. 三层流水线

官方架构可概括为：

1. **Extraction**：tree-sitter 解析 AST，按语言 query 抽符号与边（20+ 语言）。
2. **Storage**：写入项目目录 `.codegraph/codegraph.db`（SQLite + FTS5）。
3. **Resolution**：把「未解析的调用名」绑定到定义；并识别 Django/Express/NestJS 等 **17 种 Web 框架路由**，把 URL 模式连到 handler。

### 3. MCP Server

代理不直接读数据库，而是启动 `codegraph serve --mcp`，通过标准 MCP 工具调用图谱。`codegraph install` 会把该 server 写入各代理的配置（如 Claude 的 `~/.claude.json`、Cursor 的 MCP 配置）。

### 4. 自动同步与「陈旧」提示

保存文件后，监听器在防抖窗口（默认 2s）后增量重索引。若代理在同步完成前查询到**待更新文件**，响应会带 `⚠️` 横幅，提示对该文件直接用 Read——避免静默返回过期内容。

### 5. 与 Explore 子代理的关系

Claude Code 等在无索引时常 spawn **Explore 子代理**批量 grep/Read。CodeGraph 的设计意图是：**主会话直接调 MCP**，用 1–3 次结构化查询替代十几轮文件扫描。若仍把探索丢给子代理去 Read 文件，索引优势会被抵消。

## 安装与接入代理

**方式 A：一键安装脚本（无需预装 Node）**

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh

# 新开终端后，接入已安装的 AI 代理
codegraph install
```

**方式 B：npm 全局安装**

```bash
npm i -g @colbymchenry/codegraph
codegraph install
```

**方式 C：零安装体验**

```bash
npx @colbymchenry/codegraph
```

`install` 会检测本机已装的 Claude Code、Cursor、Codex CLI 等，写入 MCP 配置，并在 `CLAUDE.md` / `AGENTS.md` 等指令文件里插入简短使用说明。卸载用 `codegraph uninstall`。

**在项目里建索引：**

```bash
cd your-project
codegraph init    # 创建 .codegraph/ 并全量建图
```

之后文件变更会自动同步，一般**不必**手动 `codegraph sync`。

**非交互式 / CI 示例：**

```bash
codegraph install --target=cursor,claude --yes
codegraph init --quiet
```

## MCP 工具怎么选

默认向代理暴露四个工具（其余可通过环境变量 `CODEGRAPH_MCP_TOOLS` 打开）：

| 工具 | 适用场景 |
|------|----------|
| `codegraph_explore` | **首选**。「X 怎么工作」「从 A 到 B 的调用链」「这块模块有哪些入口」 |
| `codegraph_node` | 单个符号全文 + 调用方；或像 Read 一样按路径读整文件（支持 offset/limit） |
| `codegraph_search` | 按名字定位符号 |
| `codegraph_callers` | 谁调用了这个函数（含回调注册点） |

心智模型：**先 explore，定位不准再 search，改代码前用 callers/impact 看爆炸半径**。

若项目没有 `.codegraph/` 目录，MCP server 会声明自己未激活，**不注册任何工具**——代理回退到内置 grep/Read，索引完全可选。

## 代码示例

### 示例 1：手动配置 Claude Code MCP（不用 install 时）

编辑 `~/.claude.json`（路径因版本而异）：

```json
{
  "mcpServers": {
    "codegraph": {
      "type": "stdio",
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    }
  }
}
```

可选：在 `~/.claude/settings.json` 里为 CodeGraph 工具加 auto-allow，减少每次点批准：

```json
{
  "permissions": {
    "allow": [
      "mcp__codegraph__codegraph_explore",
      "mcp__codegraph__codegraph_search",
      "mcp__codegraph__codegraph_callers",
      "mcp__codegraph__codegraph_node"
    ]
  }
}
```

配置完成后重启 Claude Code / Cursor，并在目标仓库执行过 `codegraph init`。

### 示例 2：终端 CLI 探索（与 MCP 同源）

不打开 IDE 也能查图——适合脚本或人类预习：

```bash
# 全库搜索符号
codegraph query UserService --limit 10

# 一条命令回答架构问题（等同 MCP 的 codegraph_explore）
codegraph explore "how does login reach the database"

# 改代码前：谁依赖这个函数
codegraph callers authenticateUser

# 影响分析（CLI 版；MCP 默认未列出但可用）
codegraph impact UserService.update --depth 2
```

### 示例 3：CI 里只跑受影响的测试

`codegraph affected` 沿 import 图找「改了这些源文件后，哪些测试文件可能受影响」：

```bash
#!/usr/bin/env bash
set -euo pipefail

AFFECTED=$(git diff --name-only origin/main...HEAD \
  | codegraph affected --stdin --quiet)

if [ -n "$AFFECTED" ]; then
  echo "Running tests for: $AFFECTED"
  npx vitest run $AFFECTED
else
  echo "No test files affected by graph traversal."
fi
```

### 示例 4：在自有 Node 应用里嵌入 API

除 CLI/MCP 外，包可编程调用（需 Node 22.5+ 与 `node:sqlite`）：

```typescript
import CodeGraph from '@colbymchenry/codegraph';

const cg = await CodeGraph.init('/path/to/project');

await cg.indexAll({
  onProgress: (p) => console.log(`${p.phase}: ${p.current}/${p.total}`),
});

const hits = cg.searchNodes('UserService');
const callers = cg.getCallers(hits[0].node.id);
const impact = cg.getImpactRadius(hits[0].node.id, 2);

cg.watch();   // 开启与 MCP 相同的文件监听
// ... 业务逻辑 ...
cg.close();
```

适合在 Electron 主进程、内部开发者门户等场景内置「代码地图」，而不走子进程 MCP。

## 工作原理一览

```
┌─────────────────────────────────────────┐
│  Claude Code / Cursor / Codex CLI       │
│  「请求怎么进数据库？」                  │
│       → codegraph_explore（主会话）      │
└──────────────────┬──────────────────────┘
                   │ MCP stdio
                   ▼
┌─────────────────────────────────────────┐
│  codegraph serve --mcp                  │
│  explore · search · callers · node      │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│  .codegraph/codegraph.db (SQLite)       │
│  symbols · edges · FTS5 · routes      │
└─────────────────────────────────────────┘
```

索引构建：tree-sitter 解析 → 抽节点/边 → 解析引用 → 可选框架路由增强 → 写入 DB。运行时：监听文件变更 → 防抖 → 增量 re-index。

## 能力边界与诚实预期

**擅长：**

- 结构型问题：调用链、模块边界、路由到 handler、改动的直接影响
- 中大型单仓（官方测过 VS Code ~10k 文件、Django ~3k 文件）
- 跨语言启发式边：Swift ↔ ObjC、React Native bridge、Expo Modules 等（边带 `provenance: heuristic` 标记）

**不擅长 / 需注意：**

- **动态派发**：`eval`、极度反射、运行时字符串拼方法名——静态图必然漏边
- **未索引仓库**：无 `.codegraph/` 时工具不可用
- **沙箱环境**：若禁用文件监听（`CODEGRAPH_NO_DAEMON=1`），需手动 `codegraph sync`
- **与子代理混用**：若指令仍要求「先 spawn Explore 再 Read」，benchmark 优势会消失

官方 benchmark 使用 `claude -p` headless、每仓库 4 次取中位数；你的仓库结构、模型版本、提问方式不同，节省比例会有波动，但「少做无效 grep」的方向一致。

## 常用命令速查

```bash
codegraph init [path]          # 初始化并建图
codegraph status               # 索引统计与健康
codegraph sync                 # 手动增量同步（少数场景）
codegraph upgrade --check      # 检查更新
codegraph uninit               # 删除项目索引（不卸载 MCP）
codegraph uninstall            # 从各代理移除 MCP 配置
```

## 与相关技术的关系

- **tree-sitter**：确定性 AST 解析，比正则 grep 更适合抽符号。
- **MCP**：与 [[mcp-ts-sdk]] 同一协议族；CodeGraph 是「代码图谱」类 MCP server 的代表实现之一。
- **语义搜索 / RAG**：CodeGraph 偏**符号与调用图**，不是 embedding 向量库；二者可互补（图找结构，向量找相似片段）。
- **IDE 自带索引**：Language Server 服务编辑器补全；CodeGraph 服务**无状态的 LLM 代理**，且输出为 agent 友好的大块上下文。

## 延伸阅读

- 官方文档与网站：<https://colbymchenry.github.io/codegraph/>
- npm：<https://www.npmjs.com/package/@colbymchenry/codegraph>
- 索引与自动同步深读：[Indexing a Project](https://colbymchenry.github.io/codegraph/guides/indexing/)
- MCP 协议背景：本库笔记 [[mcp-ts-sdk]]
- 在 Cursor 中使用：配置 MCP 后于 Agent 模式直接提问结构问题，并确认项目根目录存在 `.codegraph/`

## 小结

CodeGraph 把「理解代码库」从**在线搜索问题**变成**离线索引 + 在线查询**：本地 tree-sitter 建图，SQLite 存储，MCP 喂给 Claude Code / Cursor / Codex。零基础上手路径是 `install` → `init` → 重启代理 → 用自然语言问架构；进阶可接 `affected` 做 CI 测试裁剪，或用 TypeScript API 嵌入自有工具链。记住一句话：**让代理查地图，而不是在文件海里敲门问路。**
