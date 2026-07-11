---
title: MCP TS SDK — Model Context Protocol TypeScript 实现
来源: https://github.com/modelcontextprotocol/typescript-sdk
日期: 2026-05-29
分类: AI / Agent
难度: 中级
---

## 是什么

MCP TS SDK 是 **Anthropic 2024 年提出的 Model Context Protocol（MCP）的 TypeScript 实现**——给 LLM 应用一个标准化的"接外部工具/数据"接口。

日常类比：

- 以前每家 AI 应用接 GitHub / Notion / Postgres 都要自己写 connector
- MCP 像 USB 标准——任何 MCP 服务器都能接任何 MCP 客户端

你写一个 MCP server 暴露"查数据库"的能力。[[claude-code]] / Claude Desktop / Cursor / Continue 任何支持 MCP 的客户端都能直接用，不用为每家重写一遍。

## 为什么重要

不只是"又一个工具集成方案"，它代表了 LLM 工具生态的标准化：

- **Anthropic 客户端全线采用**——[[claude-code]] / Claude Desktop 等通过 MCP 挂载外部工具；Messages API 自己的 `tool_use` 是另一条路径，不要混为一谈
- **开放协议，多家跟进**——2025 年 OpenAI / Microsoft / Google 陆续加入 MCP 生态，从"Anthropic 私货"变成行业事实标准
- **解决 N×M 适配地狱**——以前 N 家工具 × M 家 LLM 要写 N×M 个适配器，MCP 让它变成 N+M
- **TypeScript SDK 是 reference impl**——其他语言（Python / Go / Rust）的 SDK 都参考 TS 版本

## 核心要点

MCP 的设计可以拆成 **3 层**：

1. **Server**：暴露能力的一方。提供资源、工具、prompts 模板。启动方式两种：stdio（本地子进程，主流）/ HTTP（远程服务）。

2. **Client**：使用能力的一方，通常是 LLM 应用。一个 client 可以同时连多个 server——比如 Claude Desktop 同时接 GitHub MCP + Postgres MCP + Filesystem MCP。

3. **三类原语**：协议定义 server 可以暴露三类东西：
   - **Resources**：可读取的数据（GitHub PR 列表 / 日志文件 / 配置）。**只读，幂等**。
   - **Tools**：可执行的动作（创建 issue / 跑 SQL / 发邮件）。**有副作用**。
   - **Prompts**：可参数化的 prompt 模板（代码审查 prompt / PR 描述 prompt）。**给用户主动选择用**。

为什么要把 resources 和 tools 分开：LLM 决策时"我要查一下"（resource）和"我要执行"（tool）的心智不一样。合并成一种就丢了这个语义信号。

## 实践案例

### 案例 1：写一个最小 MCP server

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'my-server', version: '1.0.0' })

server.tool(
  'search',
  { query: z.string() },
  async ({ query }) => ({
    content: [{ type: 'text', text: `搜索结果：${query}` }]
  })
)

await server.connect(new StdioServerTransport())
```

逐部分解释：`McpServer` 注册名叫 `search` 的 tool；`z.string()` 描述入参并转成 JSON Schema 给客户端；`StdioServerTransport` 用标准输入输出跑 JSON-RPC——启动后进程挂起等消息，不要往 stdout 打普通日志。

### 案例 2：在 Claude Desktop 里挂上去

`~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "my": {
      "command": "node",
      "args": ["/abs/path/to/server.js"]
    }
  }
}
```

逐部分解释：`command` + `args` 告诉客户端如何 spawn 子进程；重启后 Desktop 调 `tools/list` 发现 `search`，对话里由模型决定何时调用。路径必须是绝对路径，相对路径常启动失败。

### 案例 3：用现成的 server 接数据库

不用自己写——直接装官方 server：

```bash
npm install -g @modelcontextprotocol/server-postgres
```

配置：

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres",
               "postgres://user:pass@localhost/db"]
    }
  }
}
```

逐部分解释：`-y` 让 npx 免确认拉取包；最后一个参数是连接串。之后说"查最近 7 天注册用户数"，客户端会让模型选 tool 跑 SQL——**你没写业务代码就给 LLM 加了数据库能力**。

## 踩过的坑

1. **stdio transport 调试难**：server 通过 stdout 发 JSON-RPC，**不能用 `console.log`**——任何写到 stdout 的非 JSON 都会污染协议，client 直接断连。调试日志一律用 `console.error`（走 stderr）。

2. **Tool schema 错 LLM 调不动**：`inputSchema` 用 zod 描述，转成 JSON Schema 给 client。schema 字段语义不清（`"q": z.string()` 不如 `"query": z.string().describe("搜索关键词")`），LLM 看不懂就不会调。**写 schema 要像写 API 文档**。

3. **Resource subscription 实现复杂**：协议支持"资源变更推送"，但要求 server 维护订阅状态、处理断连重连。多数场景用不上，强行实现反而引入 bug——**先做无订阅版本，有需求再加**。

4. **跨 client 兼容性参差**：Claude Desktop / Cursor / Continue 对 MCP 的支持深度不一致——有的不支持 prompts，有的不支持 resourceTemplate，有的对错误返回处理不同。**写 server 前先看目标 client 实现了哪些 capability**。

## 历史小故事（可跳过）

- **2024-11**：Anthropic 公开 MCP 规范 + TypeScript SDK 同步开源——一开始就是"协议 + 参考实现"双轨
- **2025-Q1**：[[claude-code]] / Claude Desktop 全线接入 MCP，成为协议第一批大规模生产用户
- **2025-Q1-Q2**：OpenAI / Microsoft / Google 陆续加入 MCP 生态——从单家协议变成事实标准
- **2025**：核心三类原语 + JSON-RPC 信封相对稳定；task management / elicitation 等高级特性仍在 experimental 命名空间演进

之后 1 年（2025-Q3 → 2026-Q2）持续叠加：streamable HTTP transport / session resumption / OAuth 鉴权——每一个都是把协议从"本地 stdio 玩具"推向"远程生产级"的关键拼图。

## 适用 vs 不适用场景

**适用**：

- 想给多家 LLM 客户端同时提供工具能力——一份 server 通用
- 团队内部工具（DB query / 监控 / 日志搜索）想被 AI 调用——写成 MCP server 挂到所有人的 Claude
- 跨语言场景——Python 写 server，TypeScript 写 client 完全 OK
- 需要"工具/资源分离"语义——LLM 决策更准

**不适用**：

- 公开 REST API——MCP 不替代 OpenAPI；普通 HTTP 仍是首选
- 大流量 / 二进制数据传输——MCP 是 NDJSON 文本协议，不适合 CDN / 视频流
- 不希望 AI 自动调用的危险操作——MCP 是为 AI 设计的，给人用反而麻烦
- 强一致性事务——MCP 没有事务/回滚语义，跨 tool 的 atomic 操作要自己拼

## 学到什么

1. **协议 > 库**——LangChain Tool 是库内抽象，跨进程要写胶水；MCP 是进程间协议，天生跨语言
2. **三类原语反映 LLM 心智**——把"读"和"做"区分开，给模型更清晰的决策信号
3. **JSON-RPC 比 REST 更适合 LLM 工具场景**——JSON-RPC 双向、有标准错误码、信封简单；REST 的资源建模和工具调用语义对不上
4. **开放协议让生态成立**——Anthropic 一家做不动的事，让 OpenAI / Microsoft 加入就成了——但前提是协议设计本身要中立、不绑死自家产品

## 延伸阅读

- 官方规范：[modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)（先读协议本身再看 SDK）
- 现成 server 列表：[github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)（Postgres / GitHub / Filesystem 等几十个）
- JSON-RPC 2.0 spec：[jsonrpc.org/specification](https://www.jsonrpc.org/specification)（两页纸看完）
- [[claude-code]] —— MCP 最早的大规模生产用户
- [[anthropic-cookbook]] —— Anthropic 官方示例，含 MCP 用法

## 关联

- [[claude-code]] —— Anthropic 终端 AI 编程助手，原生支持 MCP server 挂载
- [[anthropic-cookbook]] —— Claude API 实战示例集，含 MCP server 写法
- [[langchain]] —— 框架内 tool 抽象，对照看出"库 vs 协议"的区别
- [[zod]] —— MCP TS SDK 用 zod 描述 tool schema，运行期校验入参

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 让 LLM 用「DOM 索引清单」操作浏览器的 Python agent 框架
- [[claude-agent-sdk]] —— Claude Agent SDK — 把 Claude Code 装进 npm 包
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[zod]] —— Zod — TypeScript-first schema 验证

