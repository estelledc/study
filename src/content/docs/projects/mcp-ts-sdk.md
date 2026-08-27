---
title: MCP TS SDK — Model Context Protocol TypeScript 实现
来源: https://github.com/modelcontextprotocol/typescript-sdk
日期: 2026-05-29
分类: AI / Agent
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/modelcontextprotocol/typescript-sdk
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2d889f2b329e46680ec9bdd565de4616c497825a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.30.0
---

## 是什么

MCP TS SDK 是 **Model Context Protocol（MCP）的官方 TypeScript 实现**——给 LLM 应用一个标准化的“接外部工具/数据”接口。日常类比：以前每家 AI 应用接 GitHub / Notion / Postgres 都要自己写 connector，MCP 像 USB 标准——任何 MCP server 都能接任何 MCP client。

你写一个 MCP server 暴露“查数据库”的能力，任何支持 MCP 的客户端都能直接用，不用为每家重写一遍。固定 1.30.0 的协议最新版本号是 `2025-11-25`，并向后兼容到 `2024-10-07` 共五个日期版本——协议用日期做版本，SDK 和协议分开演进。

## 为什么重要

不理解 MCP 这层“进程间协议”，下面这些事都说不清：

- 为什么 N 家工具 × M 家 LLM 应用本来要写 N×M 个适配器，MCP 让它变成 N+M
- 为什么框架内的 tool 抽象（如 LangChain Tool）出不了自家进程，而 MCP server 天生跨语言、跨进程
- 为什么本地工具用 stdio 子进程、远程服务用 Streamable HTTP——同一协议两种运输层
- 为什么 tools / resources / prompts 要分成三类原语，而不是合并成一种“函数调用”

## 核心要点

固定 1.30.0 的 SDK 可以拆成三层：

1. **协议层**：client 与 server 之间跑 JSON-RPC 消息，初始化时协商日期版本（最新 `2025-11-25`，支持列表含 `2025-06-18`、`2025-03-26`、`2024-11-05`、`2024-10-07`）。协议中立于语言，TS SDK 是其中一个实现。

2. **三类原语**：server 可以注册三类能力，语义刻意分开——
   - **Tools**：可执行的动作（跑 SQL / 建 issue），有副作用；
   - **Resources**：可读取的数据（文件 / 列表），读语义；
   - **Prompts**：可参数化的 prompt 模板，给用户主动选用。
   注册入口是 `registerTool` / `registerResource`（支持 `ResourceTemplate` URI 模板）/ `registerPrompt`，各接一个 `{ title, description, inputSchema, outputSchema, annotations }` 配置对象。旧的位置参数写法 `server.tool(...)` / `server.resource(...)` / `server.prompt(...)` 在该版本已全部标记 deprecated。

3. **运输层**：本地集成用 stdio（客户端把 server 当子进程 spawn，stdin/stdout 走 JSON-RPC）；远程用 Streamable HTTP；`SSEClientTransport` 已标记 deprecated，仅为迁移期保留。测试可用 in-memory transport 直连 client 与 server。

schema 这条线：入参/出参用 zod 描述（peer 依赖 `zod ^3.25 || ^4.0`），SDK 转成 JSON Schema 发给客户端；`outputSchema` 与返回值里的 `structuredContent` 配对，让客户端能校验结构化结果。

## 实践示例

### 案例 1：用 registerTool 写一个最小 MCP server

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'bmi-server', version: '1.0.0' })

server.registerTool(
  'calculate-bmi',
  {
    title: 'BMI Calculator',
    description: 'Calculate Body Mass Index',
    inputSchema: { weightKg: z.number(), heightM: z.number() },
    outputSchema: { bmi: z.number() }
  },
  async ({ weightKg, heightM }) => {
    const output = { bmi: weightKg / (heightM * heightM) }
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output
    }
  }
)

await server.connect(new StdioServerTransport())
```

**逐部分**：`registerTool` 的第二个参数是配置对象——`inputSchema` 用 zod 字段表描述并转成 JSON Schema 给客户端；`outputSchema` 声明了结构化结果，所以返回值必须同时给 `content`（文本流）和 `structuredContent`（可校验对象）；`StdioServerTransport` 让这个进程等着被客户端 spawn。

### 案例 2：用 ResourceTemplate 暴露参数化资源

```typescript
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'

server.registerResource(
  'user-profile',
  new ResourceTemplate('users://{userId}/profile', { list: undefined }),
  { title: 'User Profile', description: '按用户 ID 读取档案' },
  async (uri, { userId }) => ({
    contents: [{ uri: uri.href, text: `profile of ${userId}` }]
  })
)
```

**逐部分**：资源走“读”语义——URI 模板 `users://{userId}/profile` 声明参数位；客户端读某个具体 URI 时回调拿到解析出的 `userId`。工具做动作、资源给数据，两类原语给 LLM 的决策信号不同。

### 案例 3：本地 stdio vs 远程 Streamable HTTP

```typescript
// 本地：客户端 spawn 子进程（案例 1 的写法）
await server.connect(new StdioServerTransport())

// 远程：同一个 server 换运输层挂到 HTTP 服务上
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
```

**逐部分**：server 的能力注册代码完全不变，换 transport 就换了部署形态——这正是“协议与运输层分离”的意义。远程路径上该版本还带 Express 适配器与 `hostHeaderValidation` 等中间件；旧的 SSE 运输层已 deprecated，新服务直接用 Streamable HTTP。

## 踩过的坑

1. **stdio transport 里不能用 `console.log`**：server 靠 stdout 发 JSON-RPC，任何写到 stdout 的普通日志都会污染协议流，客户端直接解析失败。调试日志一律 `console.error`（走 stderr）。

2. **抄到旧签名**：网上教程大量使用 `server.tool(name, schema, cb)` 位置参数写法——固定 1.30.0 里这些 overload 全部 `@deprecated`，新代码用 `registerTool` 配置对象形态，行为边界（如 `taskSupport`）也只在新入口上定义。

3. **schema 写得含糊 LLM 就不会调**：`inputSchema` 的字段名和 `describe()` 是模型决定“调不调、怎么调”的主要信号。`q: z.string()` 不如 `query: z.string().describe('搜索关键词')`。写 schema 要像写 API 文档。

4. **声明了 `outputSchema` 却只返回文本**：`outputSchema` 与 `structuredContent` 是配对合同——只给 `content` 不给 `structuredContent`，客户端侧校验直接失败。

5. **SSE 迁移期的两头兼容**：deprecation 注释明说“部分 server 仍在用 SSE，客户端迁移期可能要同时支持两种 transport”。写新 server 用 Streamable HTTP；写通用 client 要判断对端能力。

## 适用 vs 不适用场景

**适用**：

- 想给多家 LLM 客户端同时提供工具能力——一份 server 通用
- 团队内部工具（DB 查询 / 监控 / 日志搜索）想被 AI 调用——写成 MCP server 分发
- 跨语言场景——协议中立，server 与 client 可以是不同语言的实现
- 需要“工具 / 资源分离”语义，让模型决策信号更清晰

**不适用**：

- 面向人类开发者的公开 REST API——MCP 不替代 OpenAPI，普通 HTTP 仍是首选
- 大流量二进制传输——协议信封是 JSON 文本，不适合视频流 / CDN 场景
- 不希望被 AI 自动调用的危险操作——MCP 就是为模型调用设计的
- 需要跨工具原子事务——协议没有事务/回滚语义，得自己在 server 内拼

## 固定版本边界

- 本文绑定 `modelcontextprotocol/typescript-sdk@2d889f2b...`，tag `1.30.0`、package `1.30.0` 与 npm `gitHead` 三方一致。
- package 声明 Node >=18；peer 依赖 `zod ^3.25 || ^4.0`，可选 `@cfworker/json-schema`；JSON Schema 校验后端提供 ajv 与 cfworker 两个导出。
- 协议最新版本 `2025-11-25`，支持列表向后到 `2024-10-07`；`tool()`/`resource()`/`prompt()` 旧签名与 `SSEClientTransport` 均已 deprecated。
- task 管理（`registerToolTask`）位于 `experimental` 命名空间，普通 `registerTool` 固定 `taskSupport: 'forbidden'`。
- 本文未运行任何 server/client、未做协议一致性测试、未验证具体第三方客户端的能力矩阵，状态保持 `UNVERIFIED`。

## 学到什么

1. **协议 > 库**——框架内 tool 抽象出不了进程；把工具接入做成进程间协议，跨语言与生态复用才成立
2. **用日期给协议编版本**——协议与 SDK 解耦演进，client/server 初始化时协商，兼容窗口一目了然
3. **原语分类就是决策信号**——把“读”（resources）和“做”（tools）分开，模型侧的选择器更准
4. **schema 即接口文档**——LLM 场景里 zod/JSON Schema 的 `describe` 不是注释，是运行时行为的一部分

## 应用型自测

1. 固定 1.30.0 里，新代码注册工具应该用 `server.tool(name, schema, cb)` 吗？
2. 一个注册了 `outputSchema` 的工具，返回值只给 `content` 行不行？
3. stdio transport 的 server 里想打调试日志，应该写到哪个流？

检查点：

1. 不应该。位置参数 overload 已全部 deprecated，用 `registerTool(name, config, cb)` 配置对象形态。
2. 不行。`outputSchema` 与 `structuredContent` 配对，缺后者客户端校验失败。
3. stderr（`console.error`）。stdout 是 JSON-RPC 协议流，写普通日志会污染协议。

## 延伸阅读

- 官方规范：[modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)（先读协议本身再看 SDK）
- 固定源码：[modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) —— 本文绑定提交 `2d889f2b329e46680ec9bdd565de4616c497825a`
- JSON-RPC 2.0 spec：[jsonrpc.org/specification](https://www.jsonrpc.org/specification)（两页纸看完）
- [[claude-agent-sdk]] —— 上层 agent SDK，与 MCP 的“协议层”形成上下分工

## 关联

- [[claude-code]] —— Anthropic 终端 AI 编程助手，支持挂载 MCP server
- [[anthropic-cookbook]] —— Claude API 实战示例集，含 MCP 用法
- [[langchain]] —— 框架内 tool 抽象，对照看出“库 vs 协议”的区别
- [[zod]] —— MCP TS SDK 用 zod 描述 tool schema，运行期校验入参
- [[ollama]] —— 本地模型运行时；agent 栈里协议层与推理层的两块地基

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 让 LLM 用「DOM 索引清单」操作浏览器的 Python agent 框架
- [[claude-agent-sdk]] —— Claude Agent SDK — 把 Claude Code 装进 npm 包
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
