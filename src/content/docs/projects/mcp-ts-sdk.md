---
title: "MCP TypeScript SDK — 让 AI 调外部世界的最小契约"
description: 一个跨厂商的协议设计：tools / resources / prompts 三类原语 + JSON-RPC 传输 + 严格 schema
sidebar:
  order: 24
  label: "modelcontextprotocol/typescript-sdk"
---

> @modelcontextprotocol/sdk v2.0.0-alpha.0（2026-05），MIT。
> Anthropic 主导设计但**故意做成开放协议**——OpenAI / Google / Cursor / VSCode / 各家
> agentic 工具都在实现 MCP。
>
> **协议设计本身比代码更值得读**——
> 它解决的是"如何让 AI 调外部世界，且不被某个厂商锁定"。
> 这是 Season 4 第二篇。

## 一句话定位

**MCP（Model Context Protocol）= AI agent 和外部工具/数据源之间的标准协议。**
SDK = 帮你把现有 service 包装成 MCP server / client 的实现库。
Schema-first + JSON-RPC + 三类原语（tools / resources / prompts）。

## Why（为什么是它而不是 OpenAI Function Calling / Anthropic Tool Use / 自己写 HTTP）

LLM 工具集成的演化：

```
2023: 各家 function calling
   OpenAI: function_call 字段
   Anthropic: tool_use 块
   Google: function_call
   各自定义、互不兼容

2024: 各家做 plugin store
   ChatGPT plugins (now 退役)
   Claude tools
   Cursor 插件
   各自封闭、迁移成本高

2025: MCP 出现
   定义统一协议
   服务方一次实现，多家 client 通用
   Cursor / Continue / Claude Code / VSCode Copilot 都支持
```

**MCP 解决的核心问题**：**避免重复实现**。

```
没有 MCP                        有 MCP
─────────────                  ──────────
Claude tool   ──┐              ┌── Claude
GPT function ──┤── 你的 service ─┼── GPT
Cursor plugin ─┤              ├── Cursor
VSCode ext  ──┘              └── VSCode

每家适配一次                    一个 MCP server，全家通用
```

| 方案 | 跨厂商 | 协议标准 | 工具/资源分离 | 安全模型 |
|---|---|---|---|---|
| OpenAI Function | ✗ | 闭源 | 只有 tool | 客户端控制 |
| Anthropic Tool Use | ✗ | 公开 API 但厂商专属 | 只有 tool | 客户端控制 |
| 自己写 HTTP API | ✗ | 自定义 | 无标准 | 自己设计 |
| **MCP** | ✓ | **开放规范** | **3 类原语** | **协议级支持** |

**MCP 的判断分水岭**：
1. 把"工具调用"（actions）和"上下文资源"（context）**分开**——tool ≠ resource
2. 给 prompt 一个一等公民地位（prompts 也是协议元素）
3. 用 **JSON-RPC 2.0** 而不是 REST / GraphQL——成熟简单
4. 强制 **Schema 验证**——参数类型必须对得上
5. 多种传输（stdio / streamable HTTP / SSE）—— 不限制部署形态

**为什么不是 LangChain Tool**：LangChain 的 tool 是 **代码内部抽象**——
跨进程跨语言调用需要自己写胶水。MCP 是**进程间协议**——天生跨语言。

**为什么不是 OpenAPI/Swagger**：OpenAPI 描述 REST API，MCP 描述 **AI 可见的工具集合**。
OpenAPI 生成的是文档 + client SDK，MCP 描述的是"哪个 tool 在什么情况调用"——
用途不同。

**MCP 的代价**：
- 设计较新（2025），生态在演化（v1 → v2 alpha）
- 协议复杂度比简单 HTTP 高
- 需要选择合适的 transport（不熟悉 stdio / SSE 的开发者要学）

## 仓库地形

```
mcp-ts-sdk/
├── packages/
│   ├── core/                       ← 共享类型 + 协议基础
│   ├── client/                     ← MCP client SDK（给 agent 用）
│   ├── server/                     ← ★ MCP server SDK（给服务方用）
│   │   └── src/server/
│   │       ├── mcp.ts              ← 1397 行：★★★ McpServer 类
│   │       ├── server.ts           ← 672 行：底层 Server
│   │       ├── streamableHttp.ts   ← 1038 行：HTTP transport
│   │       └── stdio.ts            ← stdio transport
│   ├── middleware/                 ← 服务端中间件
│   ├── codemod/                    ← v1 → v2 升级工具
│   └── (...其他)
├── docs/
├── examples/                       ← 各种示例
└── common/                         ← 共享工具
```

**心脏文件**：

1. `packages/server/src/server/mcp.ts:63`——`McpServer` 类，server 端的主入口
2. `packages/server/src/server/mcp.examples.ts`——可执行示例（用作文档源）
3. **MCP 规范文档**（[modelcontextprotocol.io](https://modelcontextprotocol.io)）——
   不只读 SDK 代码，要先理解协议本身

## 核心机制 · Layer 3 精读

### 机制 1 · 三类原语 — tools / resources / prompts

MCP 协议定义 server 可以暴露三类东西：

```typescript
// packages/server/src/server/mcp.ts:69-72
private _registeredResources: { [uri: string]: RegisteredResource } = {};
private _registeredResourceTemplates: {...} = {};
private _registeredTools: { [name: string]: RegisteredTool } = {};
private _registeredPrompts: { [name: string]: RegisteredPrompt } = {};
```

每类的语义：

- **tools**：可执行的动作（"创建 issue"、"查询数据库"、"发送邮件"）。**有副作用**。
- **resources**：可读取的数据（"GitHub PR 列表"、"日志文件"、"配置"）。**只读，幂等**。
- **prompts**：可参数化的 prompt 模板（"代码审查 prompt"、"PR 描述 prompt"）。**给用户/agent 选择性使用**。

**为什么要分三类**：

LLM 用工具的心智不一样：
- tool 是 "我决定执行"——LLM 主动调用
- resource 是 "我可能需要参考"——LLM 决定读哪个 / 全部预读
- prompt 是 "用户/agent 主动选择的模板"——人在循环

如果你只有"tool"一种原语（OpenAI function calling），就要把"读 GitHub PR 列表"
也叫 tool。**搜索 vs 读 是不同语义**——LLM 知道前者是"action"、后者是"reference"，决策更准。

→ 这是**协议级别的语义建模**，比 ad-hoc API 表达力强一个层级。

### 机制 2 · `McpServer` 类的简洁 API

`packages/server/src/server/mcp.ts:63-110`：

```typescript
export class McpServer {
  public readonly server: Server                         // ← 底层 Server
  private _registeredResources: { [uri: string]: ... } = {}
  private _registeredTools: { [name: string]: ... } = {}
  private _registeredPrompts: { [name: string]: ... } = {}

  constructor(serverInfo: Implementation, options?: ServerOptions) {
    this.server = new Server(serverInfo, options)
  }

  async connect(transport: Transport): Promise<void> {
    return await this.server.connect(transport)
  }

  async close(): Promise<void> {
    await this.server.close()
  }
  // ... registerTool / registerResource / registerPrompt 方法
}
```

用户写法（`mcp.examples.ts`）：

```typescript
const server = new McpServer({ name: 'my-server', version: '1.0.0' })
const transport = new StdioServerTransport()
await server.connect(transport)
```

**3 行启动 server**。背后 stdio transport 处理 JSON-RPC over stdin/stdout——
完美适配 spawn 一个子进程的模式。Claude Code 启动 MCP server 就是用这种方式。

### 机制 3 · 双层抽象 — McpServer + Server

注意 `McpServer.server` 是底层 `Server` 实例。两层关系：

- **`Server`**（底层）：管 JSON-RPC 协议、消息路由、capabilities 协商
- **`McpServer`**（上层）：管 tool / resource / prompt 注册的便利 API

为什么要分两层：

```typescript
// 用 McpServer（高级）
mcpServer.registerTool('greet', schema, async ({ name }) => `Hello ${name}!`)

// 用 Server（底层，需要自己处理 protocol）
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'greet') {
    return { content: [{ type: 'text', text: `Hello ${req.params.args.name}!` }] }
  }
})
```

低层给你完全控制，高层给你便利。**90% 用例用高层就够**——但留逃生通道。
这是**好库的标志**——封装但不囚禁。

### 机制 4 · 多种 transport 的统一接口

`packages/server/src/server/streamableHttp.ts` 1038 行实现 streamable HTTP：

```typescript
// 用 stdio（最简单，subprocess 模式）
const transport = new StdioServerTransport()

// 用 streamable HTTP（适合远程 / 浏览器）
const transport = new StreamableHTTPServerTransport({ ... })

// 自定义 WebSocket / Unix socket / 任何
class MyTransport implements Transport { ... }
```

每个 Transport 实现同一个接口 → `Server.connect(transport)` 不关心底层。

**为什么这么重要**：MCP server 可以本地（subprocess）跑，也可以云上（HTTP）跑。
用户在自己机器上跑的 server 通过 stdio 接到 Claude Code；
共享的服务方部署到云端，Claude Code 通过 HTTP 接。
**同一份 server 代码，两种部署形态**。

→ 这是**抽象的力量**：把"协议"和"传输"解耦。
HTTP / stdio / SSE / 未来的 QUIC——都能复用同一份业务逻辑。

### 机制 5 · Schema-first 的设计

注册一个 tool：

```typescript
mcpServer.registerTool(
  'addItem',
  {
    description: 'Add an item to the cart',
    inputSchema: {                          // ← JSON Schema
      type: 'object',
      properties: {
        name: { type: 'string' },
        quantity: { type: 'number' }
      },
      required: ['name', 'quantity']
    }
  },
  async ({ name, quantity }) => {           // ← runtime 校验通过的参数
    return { content: [{ type: 'text', text: `Added ${quantity} ${name}` }] }
  }
)
```

**关键**：`inputSchema` 是 JSON Schema，传给 client（agent）让它知道**怎么调用**。
agent 看到这个 schema 后生成正确的参数；server 收到调用后**严格校验**。

→ 这和 [zod 笔记](/study/projects/zod/) 是一脉相承的："schema 同时是规格 + 校验"。
MCP 把这个原则推到协议层。

实际上 SDK 提供 `fromJsonSchema.ts` 让你可以从 zod schema 生成 JSON Schema——
**双向的工具链整合**。

### 机制 6 · v1 → v2 重构与 codemod

`packages/codemod/`——为升级提供自动化迁移工具。

这是 **协议设计的成熟标志**——
v1 → v2 不可避免的 breaking changes，团队提供 codemod 而不是甩用户。

→ 对开源项目的判断：**谁在管 migration path，谁就在认真**。

## 横向对比

### vs OpenAI Function Calling — 单点 vs 协议

```typescript
// OpenAI
const completion = await openai.chat.completions.create({
  messages: [...],
  tools: [{ type: 'function', function: { name: 'addItem', ... } }]
})

// MCP
mcpServer.registerTool('addItem', { inputSchema }, async (args) => { ... })
// 自动暴露给所有 MCP client
```

OpenAI function calling 让 you 一次性定义所有工具到一个 API call 里。
MCP 让你定义工具到一个**独立 server**——多个 client 都可以调。

→ 一个集中、一个分布式。**MCP 的分布式更适合复杂工作流**。

### vs Anthropic Tool Use — 同源思路 + 标准化

Anthropic 自己的 tool use API 和 MCP **本来就是同一团队**——
不奇怪 MCP 设计风格和 tool use 一致。

差异：tool use 是 Anthropic API 内嵌；MCP 是协议+SDK，可被任意 LLM client 用。

### vs LangChain Tools — 框架内 vs 跨进程

LangChain 在 Python 内定义 tool：

```python
@tool
def add_item(name: str, quantity: int) -> str:
  ...
```

你的 LangChain agent 能直接调用。但**只在 LangChain 进程内**——
其他工具想调用，要写 HTTP API。

MCP 一开始就是**进程间协议**——你 register 的 tool 任何 MCP client 都能调，
跨语言（Python server + TS client 完全 OK）。

### vs CRDT / IPC 协议 — 应用领域不同

MCP 不是通用 IPC。它**专门为 LLM 工具集成**设计：
- 三类原语反映 LLM 心智
- schema 强制是为了 LLM 准确调用
- prompts 是 LLM 协作场景特有

如果你的需求是**通用进程间通信**，MCP 不合适——用 gRPC / 普通 HTTP 即可。

## Hands-on（10 分钟内能跑）

```bash
mkdir mcp-demo && cd mcp-demo
npm init -y
npm install @modelcontextprotocol/sdk
```

写 `server.ts`：

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({
  name: 'demo-server',
  version: '1.0.0'
})

server.registerTool(
  'greet',
  {
    description: '向某人打招呼',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    }
  },
  async ({ name }) => ({
    content: [{ type: 'text', text: `Hello, ${name}!` }]
  })
)

server.registerResource(
  'config://current',
  {
    description: '当前配置'
  },
  async () => ({
    contents: [{
      uri: 'config://current',
      text: JSON.stringify({ env: 'dev' }, null, 2)
    }]
  })
)

const transport = new StdioServerTransport()
await server.connect(transport)
```

```bash
# 直接跑（用 stdio 时它在等 JSON-RPC 输入）
npx tsx server.ts
```

接到 Claude Code：

```json
// ~/.claude/settings.json (or .mcp.json in project)
{
  "mcpServers": {
    "demo": {
      "command": "npx",
      "args": ["tsx", "/abs/path/to/server.ts"]
    }
  }
}
```

打开 Claude Code，输入"用 demo 服务器向 Jason 打招呼"——
Claude 会发现 demo 服务器有 greet tool，自己调用，返回结果。

### 改一处的实验（必做）

把 `inputSchema.required` 里的 `name` 去掉，再让 Claude 调用 greet 不传 name——
观察 server 还能不能正常响应（应该能，但 `name` 是 undefined）。

第二个实验：写一个 resource，让它返回 `process.env`：

```typescript
server.registerResource(
  'env://current',
  { description: '当前环境变量' },
  async () => ({
    contents: [{
      uri: 'env://current',
      text: JSON.stringify(process.env, null, 2)
    }]
  })
)
```

让 Claude 读这个 resource——理解 LLM 是怎么用 resource（不主动 fetch，会在需要时引用）。

## 与你工作的连接

**能立刻迁移**：

- 把项目里的 internal CLI / API 包装成 MCP server——立即被所有 MCP client 用
- 团队工具：DB query / monitoring / log search 写成 MCP server，开发者用 Claude Code 调用
- 把 [tRPC 笔记](/study/projects/trpc/) 里的内部 API 暴露成 MCP（双层）

**下个月可能用到**：

- 给客户/同事写 MCP server——"接到 Claude Code 就能用"是有竞争力的卖点
- 把 LLM playground 替换成 MCP client——能调你的整个工具集

**不要用 MCP 的部分**：

- **公开 REST API**——MCP 不替代 OpenAPI；普通 HTTP 仍是首选
- **大流量、低延迟数据传输**——MCP 不是 CDN，传协议头开销不小
- **不希望 AI 自动调用的危险操作**——MCP 是为 AI 设计的，给人用反而麻烦

## 读完你能做之前做不了的事

- **判断**：看到一个 LLM 工具时，能问"它支不支持 MCP"——这是协议成熟度的指标
- **设计**：写 LLM 应用时，思考 "我应该把工具做成 in-process function 还是 MCP server"
- **解释**：被问"MCP 是什么"时，能用三段式（三原语 + JSON-RPC + 多 transport）
- **下钻**：看懂 LSP（语言服务器协议）的设计——MCP 和 LSP 是同源思路
- **对照**：识别"我这个工具有没有跨厂商价值"——值不值得做成 MCP

## 自检 · 5 个问题

1. MCP 的三类原语（tools / resources / prompts）。设计时为什么要把"读取数据"（resources）和"执行动作"（tools）分开？
   合并成一种会有什么问题？
2. McpServer 是 Server 的便利包装——但保留了 `.server` 直接访问。
   这种"封装但不囚禁"的设计还出现在哪些库里？
3. MCP 用 JSON-RPC 而不是 REST。两者各自的优劣？为什么 LLM 工具场景选 JSON-RPC？
4. 协议级别的 schema 强制（JSON Schema in inputSchema）。
   如果 LLM 调用时 schema 不对会怎样？SDK 是抛错还是降级？
5. v1 → v2 提供 codemod。判断一个开源项目"是否值得长期投资"时，可以从 codemod / migration guide 看出什么？

## 延伸阅读

读完这篇笔记后下一步：

1. **MCP 官方规范**（[modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)）——
   读完协议本身，再看 SDK 实现
2. `packages/server/src/server/mcp.ts:63-1397`——完整的 McpServer 实现
3. `packages/server/src/server/streamableHttp.ts`——HTTP transport 实现，
   理解协议如何抽象传输
4. **LSP 协议**（[microsoft.github.io/language-server-protocol](https://microsoft.github.io/language-server-protocol/)）——
   MCP 借鉴了大量 LSP 设计
5. **anthropic-cookbook MCP 例子**——典型 use case 完整代码
6. **mcp-servers** 仓库（modelcontextprotocol/servers）——大量真实 server 范例

---

**笔记完成**：2026-05-27（v2.0.0-alpha.0）
**研究方法**：本地克隆 + 阅读 mcp.ts 类设计 + 读 examples + 协议规范理解
**心脏文件**：`packages/server/src/server/mcp.ts:63-1397` + MCP 规范文档
