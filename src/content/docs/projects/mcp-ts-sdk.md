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

## 项目类型 self-classify

按 [状元篇 Checklist v1.1](/study/method/) 五选一：**框架/SDK（分支 D）**。

判定依据：

- 心脏不是"一个工具用法"，而是**`McpServer` 类提供的 abstraction + 三个 extension point**（Tool / Resource / Prompt）。
- 用户写代码方式：调 SDK 注册 handler，让 SDK 主循环跑——典型框架反转控制。
- 不是工具库（surface 不止 3-5 个 API）；不是编译器（没有 phase pipeline，输入输出不是字节流）；
  不是大型应用（不是 user-facing product）；不是测试工具（没有 runner 主循环 + matcher）。

→ 因此 L2 必含 abstraction 定义文件 + extension point 路径，L3 ≥ 3 段，
L4 必须**写 1 个 plugin / extension** 跑 lifecycle。底线：500 行 / 1 figure / 4 permalink / 3 怀疑。

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

**MCP 解决的核心问题**：**避免 N×M 的适配地狱**。

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

## 仓库地形（Layer 2）

```
typescript-sdk/                     ← pnpm monorepo
├── packages/
│   ├── core/                       ← 共享类型 + 协议基础
│   │   └── src/
│   │       ├── types/
│   │       │   ├── schemas.ts      ← 2241 行：★ zod schema 全集（JSON-RPC + 域类型）
│   │       │   ├── constants.ts    ← LATEST_PROTOCOL_VERSION / JSONRPC_VERSION
│   │       │   └── types.ts        ← Infer<typeof Schema> 出来的 TS type
│   │       └── shared/
│   │           ├── protocol.ts     ← 1236 行：★★ Protocol 基类（请求/响应/通知调度）
│   │           ├── transport.ts    ← 134 行：★ Transport 接口（3 方法 + 3 callback）
│   │           └── stdio.ts        ←  51 行：ReadBuffer + serialize/deserialize
│   ├── client/
│   │   └── src/client/
│   │       ├── client.ts           ← 1060 行：Client 类（继承 Protocol）
│   │       ├── stdio.ts            ←  260 行：StdioClientTransport（spawn 子进程）
│   │       ├── sse.ts              ←  319 行：SSEClientTransport（legacy 浏览器/兼容）
│   │       └── streamableHttp.ts   ←  770 行：StreamableHTTPClientTransport（远程）
│   ├── server/
│   │   └── src/server/
│   │       ├── mcp.ts              ← 1397 行：★★★ McpServer（高层 API）
│   │       ├── server.ts           ←  672 行：Server（底层 Protocol 子类）
│   │       ├── stdio.ts            ←  138 行：StdioServerTransport
│   │       └── streamableHttp.ts   ← 1038 行：HTTP transport（含 session / resumption）
│   ├── middleware/                 ← 服务端中间件
│   ├── codemod/                    ← v1 → v2 升级工具
│   └── (...其他)
├── docs/
├── examples/                       ← 各种示例
├── common/                         ← 共享工具
└── pnpm-workspace.yaml             ← monorepo 入口
```

### 心脏文件清单（分支 D 要求：必含 abstraction 定义 + extension point）

按"读哪几个文件可以重写一份最小 SDK"排序：

1. **`packages/server/src/server/mcp.ts:63-1397`** ——
   `McpServer` 类。框架的核心 abstraction：
   把"协议消息收发"抽象为"注册 tool/resource/prompt 三种 extension"。
   ([commit 5fc42e9](https://github.com/modelcontextprotocol/typescript-sdk/blob/5fc42e9be115a8865cca42541bb50183dc2e8b93/packages/server/src/server/mcp.ts#L63-L110))
2. **`packages/core/src/shared/transport.ts:74-134`** ——
   `Transport` 接口。**最关键的 extension point**——
   实现这 3 个方法（start / send / close）+ 3 个 callback（onclose / onerror / onmessage）
   就有了一种新传输。
   ([commit 5fc42e9](https://github.com/modelcontextprotocol/typescript-sdk/blob/5fc42e9be115a8865cca42541bb50183dc2e8b93/packages/core/src/shared/transport.ts#L74-L134))
3. **`packages/core/src/types/schemas.ts:127-185`** ——
   JSON-RPC 2.0 的 zod schema 定义。
   协议层骨架：`JSONRPCRequest` / `JSONRPCNotification` / `JSONRPCResultResponse` / `JSONRPCErrorResponse` 四元组。
   ([commit 5fc42e9](https://github.com/modelcontextprotocol/typescript-sdk/blob/5fc42e9be115a8865cca42541bb50183dc2e8b93/packages/core/src/types/schemas.ts#L127-L185))
4. **`packages/server/src/server/stdio.ts:19-138`** + `packages/client/src/client/stdio.ts:93-260` ——
   stdio transport 一对（server 端读 process.stdin、client 端 spawn 子进程）。
   一起读才能看清"client spawn server, 双方走 stdin/stdout 收发 JSON-RPC"的完整闭环。
   ([commit 5fc42e9 server](https://github.com/modelcontextprotocol/typescript-sdk/blob/5fc42e9be115a8865cca42541bb50183dc2e8b93/packages/server/src/server/stdio.ts#L19-L138))

### Extension points 一览（分支 D 要求）

| extension | 路径 | 用户写法 | 何时触发 |
|---|---|---|---|
| **Tool** | `mcp.ts` registerTool | `server.registerTool(name, {schema}, async (args) => ...)` | client 发 `tools/call` |
| **Resource** | `mcp.ts` registerResource | `server.registerResource(uri, {meta}, async () => ...)` | client 发 `resources/read` |
| **ResourceTemplate** | `mcp.ts` registerResourceTemplate | URI 含变量的动态 resource | client 发 `resources/read` 命中 template |
| **Prompt** | `mcp.ts` registerPrompt | `server.registerPrompt(name, {schema}, ({args}) => messages)` | client 发 `prompts/get` |
| **Transport** | `core/shared/transport.ts` Transport interface | `class MyTransport implements Transport { ... }` | `server.connect(transport)` |
| **Capability** | `server.ts` registerCapabilities | `server.registerCapabilities({ logging: {} })` | initialize 协商时通告 client |

→ **6 个 extension point**——这就是为什么它是"框架/SDK"而不是"工具库"：
工具库给你 5 个函数让你调；框架给你 6 个挂钩让你填。

![MCP 架构总图](/projects/mcp-ts-sdk/01-mcp-architecture.webp)

> Figure 1：客户端 → JSON-RPC over Transport → 服务端 + 服务端暴露的三类 primitive。
> 蓝/橙/绿三色对应 client / transport / server 三层；
> 红/蓝/绿三色对应 tool / resource / prompt 三类原语。
> 图底标注三个心脏文件 path:line + 4 个判断分水岭。

## 核心机制 · Layer 3 精读（分支 D ≥ 3 段）

> 分支 D 要求三段覆盖：**核心 abstraction** + **middleware/handler 模型** + **lifecycle**。
> 我把它落到这个 SDK 上：(1) 协议 abstraction（三原语 + Server/McpServer 双层）/
> (2) JSON-RPC 传输层（Transport interface + stdio 实现）/ (3) zod schema 与运行期校验。

---

### 机制 1 · 协议 abstraction —— 三类原语 + 双层 Server 设计

MCP 协议在概念层定义 server 可以暴露**三类东西**——tools / resources / prompts。
SDK 在实现层用 4 个 map 把它们装起来：

```typescript
// packages/server/src/server/mcp.ts:63-79
// permalink: https://github.com/modelcontextprotocol/typescript-sdk/blob/5fc42e9be115a8865cca42541bb50183dc2e8b93/packages/server/src/server/mcp.ts#L63-L79
export class McpServer {
    /**
     * The underlying {@linkcode Server} instance, useful for advanced operations like sending notifications.
     */
    public readonly server: Server;

    private _registeredResources: { [uri: string]: RegisteredResource } = {};
    private _registeredResourceTemplates: {
        [name: string]: RegisteredResourceTemplate;
    } = {};
    private _registeredTools: { [name: string]: RegisteredTool } = {};
    private _registeredPrompts: { [name: string]: RegisteredPrompt } = {};
    private _experimental?: { tasks: ExperimentalMcpServerTasks };

    constructor(serverInfo: Implementation, options?: ServerOptions) {
        this.server = new Server(serverInfo, options);
    }
```

**旁注一**：4 个 map（resources / resourceTemplates / tools / prompts）——
**resourceTemplate 是 resource 的子类**：URI 不固定（如 `file:///{path}`），匹配时跑 URI template 解析。
表面三类，实现四类。

**旁注二**：`McpServer` 没继承 `Server` 而是**持有**一个 `Server` 实例（`public readonly server`）。
这是组合优于继承——既能用 McpServer 高层 API，也能 `mcpServer.server.setRequestHandler(...)` 走底层。
**封装但不囚禁**——好框架的标志。

**旁注三**：`_experimental` 字段标记实验特性区。
v2.0.0-alpha 阶段，task management 还在打磨——SDK 自己用命名隔离防止用户依赖未稳定 API。
**这是协议设计的成熟标志，不是代码味道**。

**旁注四**：构造函数只做一件事——`new Server(serverInfo, options)`。
所有 handler 注册推迟到第一次调 `registerTool` 时（lazy initialization，见 `_toolHandlersInitialized` 字段）。
节省 boot：没注册 tool 的 server 永远不会监听 `tools/list`。

**旁注五**：`Implementation` 类型（`{name: string, version: string}`）非常简洁——
协议握手只交换"我是谁、我什么版本"两件事。**协议设计要保持名片简短**。

**怀疑一**：四个 map 都是 `{[key: string]: ...}` 而不是 `Map<string, ...>`。
对查找性能没影响（V8 都做内联优化），但**对反复 delete/再 add 同名 tool 时的内存形状稳定性可能有差**——
[V8 hidden class 文档](https://v8.dev/blog/fast-properties) 说反复 delete property 会逼对象退化为 dictionary mode。
高频热更新场景（开发模式下 tool list 动态变化），用 Map 会更好。
不过框架场景 register-once 居多，差异微乎其微——团队选 plain object 是为了 JSON 友好性。

为什么要分三类原语：

- **tools**：可执行的动作（"创建 issue"、"查询数据库"、"发送邮件"）。**有副作用**。
- **resources**：可读取的数据（"GitHub PR 列表"、"日志文件"、"配置"）。**只读，幂等**。
- **prompts**：可参数化的 prompt 模板（"代码审查 prompt"、"PR 描述 prompt"）。**给用户/agent 选择性使用**。

LLM 用工具的心智不一样：

- tool 是 "我决定执行"——LLM 主动调用
- resource 是 "我可能需要参考"——LLM 决定读哪个 / 全部预读
- prompt 是 "用户/agent 主动选择的模板"——人在循环

如果你只有"tool"一种原语（OpenAI function calling），就要把"读 GitHub PR 列表"
也叫 tool。**搜索 vs 读 是不同语义**——LLM 知道前者是"action"、后者是"reference"，决策更准。

→ 这是**协议级别的语义建模**，比 ad-hoc API 表达力强一个层级。

**双层 Server 的对照**：

```typescript
// 用 McpServer（高级，框架味）
mcpServer.registerTool('greet', { inputSchema: z.object({ name: z.string() }) },
    async ({ name }) => ({ content: [{ type: 'text', text: `Hello ${name}!` }] }))

// 用 Server（底层，自己处理协议）
server.setRequestHandler('tools/call', async (req) => {
    if (req.params.name === 'greet') {
        return { content: [{ type: 'text', text: `Hello ${req.params.arguments.name}!` }] }
    }
    throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'unknown tool')
})
```

90% 用例用高层；底层留给"我要拦截全部 tools/call 做权限检查"这种少数派。
两层都可用 = **逃生通道**。

---

### 机制 2 · JSON-RPC 传输层 —— Transport interface + stdio 实现

**核心 abstraction**：`Transport` interface 把"协议"和"传输"完全解耦。
一份 server 业务代码，可以走 stdio / HTTP / SSE / 你自定义的 WebSocket——
全靠 `server.connect(transport)` 一个调用切换。

interface 定义（极简）：

```typescript
// packages/core/src/shared/transport.ts:74-134
// permalink: https://github.com/modelcontextprotocol/typescript-sdk/blob/5fc42e9be115a8865cca42541bb50183dc2e8b93/packages/core/src/shared/transport.ts#L74-L134
export interface Transport {
    /**
     * Starts processing messages on the transport, including any connection steps that might need to be taken.
     */
    start(): Promise<void>;

    /**
     * Sends a JSON-RPC message (request or response).
     */
    send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void>;

    /**
     * Closes the connection.
     */
    close(): Promise<void>;

    /** Callback for when the connection is closed for any reason. */
    onclose?: (() => void) | undefined;

    /** Callback for when an error occurs. */
    onerror?: ((error: Error) => void) | undefined;

    /** Callback for when a message (request or response) is received over the connection. */
    onmessage?: (<T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void) | undefined;

    /** The session ID generated for this connection. */
    sessionId?: string | undefined;

    /** Sets the protocol version used for the connection. */
    setProtocolVersion?: ((version: string) => void) | undefined;

    /** Sets the supported protocol versions for header validation. */
    setSupportedProtocolVersions?: ((versions: string[]) => void) | undefined;
}
```

**旁注一**：3 个方法（start / send / close）+ 3 个 callback（onclose / onerror / onmessage）
+ 3 个可选属性（sessionId / setProtocolVersion / setSupportedProtocolVersions）。
9 个总成员里只有 `start/send/close/onmessage` 是必填——**最小契约 4 个**。
任何能"开/收/发/关"的东西都能当 transport。

**旁注二**：callback 是属性而不是方法（`onmessage?: (...) => void`）——
表明 SDK 是 **赋值式订阅**（`transport.onmessage = handler`），不是 EventEmitter 风格（`transport.on('message', handler)`）。
**单订阅者模型**：一个 transport 只服务一个 Protocol 实例，避免 fan-out 歧义。

**旁注三**：`sessionId` / `setProtocolVersion` / `setSupportedProtocolVersions` 都是 `?:` 可选。
说明它们是**给 HTTP transport 用的**——stdio 一个连接生命周期 = 一个 session，根本不需要 ID。
**接口设计的取舍**：把跨实现需要但不通用的字段做可选，避免逼 stdio 实现造一堆假数据。

**旁注四**：没有 "connect" 方法——`start()` 含连接逻辑。
把"准备好接收消息"和"发起连接"合并成一个动作——
对 stdio 是注册 stdin listener，对 HTTP 是发 SSE 请求，对 WebSocket 是 ws.open。
**让框架不用管"transport 是同步连还是异步连"**。

**旁注五**：返回的 `JSONRPCMessage` 是**已经 zod 校验过的类型**——
transport 实现负责 deserialize + 校验，Protocol 拿到的就是 type-safe 的 message。
这把"协议合法性"的责任压到边界上，里层逻辑不用再校验一次。

stdio server 端实现（具体落地）：

```typescript
// packages/server/src/server/stdio.ts:19-77
// permalink: https://github.com/modelcontextprotocol/typescript-sdk/blob/5fc42e9be115a8865cca42541bb50183dc2e8b93/packages/server/src/server/stdio.ts#L19-L77
export class StdioServerTransport implements Transport {
    private _readBuffer: ReadBuffer = new ReadBuffer();
    private _started = false;
    private _closed = false;

    constructor(
        private _stdin: Readable = process.stdin,
        private _stdout: Writable = process.stdout
    ) {}

    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;

    _ondata = (chunk: Buffer) => {
        this._readBuffer.append(chunk);
        this.processReadBuffer();
    };

    async start(): Promise<void> {
        if (this._started) {
            throw new Error('StdioServerTransport already started! ...');
        }
        this._started = true;
        this._stdin.on('data', this._ondata);
        this._stdin.on('error', this._onerror);
        this._stdout.on('error', this._onstdouterror);
    }

    private processReadBuffer() {
        while (true) {
            try {
                const message = this._readBuffer.readMessage();
                if (message === null) break;
                this.onmessage?.(message);
            } catch (error) {
                this.onerror?.(error as Error);
            }
        }
    }
```

**旁注六**：`ReadBuffer` 是按行（`\n`）切 JSON——见 `packages/core/src/shared/stdio.ts:14-37`。
**MCP 走的是 NDJSON over stdio**：每行一个 JSON-RPC 消息。
比"长度前缀"协议简单得多，但要求每个消息**不能含字面 `\n`**——
JSON.stringify 默认就不会输出未转义换行，所以稳。

**旁注七**：`processReadBuffer` 是 `while(true)` 循环——一次 data event 可能含多条消息（粘包），
所以要 drain 到 `readMessage() === null` 为止。这是处理流式协议的标准模式。

**怀疑二**：`SyntaxError` 时 `continue` 而不是抛错——
注释说是为了容忍 hot-reload 工具（tsx / nodemon）打到 stdout 的非 JSON 调试输出。
**这是个安全暗坑**：恶意 / 误配的 server 子进程往 stdout 打 banner，client 会"静默忽略"。
对开发体验是好事，但**生产环境应该 fail loud**——目前 SDK 没有"严格模式"开关。
建议自查时给 stdio child process 加 `stdout.on('data', sniff)` 报警——见 [Hands-on 改一处](#hands-on-改一处的实验)。

---

### 机制 3 · zod schema 与运行期校验 —— 跨进程的类型契约

JSON-RPC 2.0 本身只规定外层信封（jsonrpc / id / method / params）。
**MCP 把 zod 当作运行期类型系统**——每条消息进 SDK 时被 schema 校验一次，出错抛 ProtocolError。

JSON-RPC 四元组（信封层）：

```typescript
// packages/core/src/types/schemas.ts:127-187
// permalink: https://github.com/modelcontextprotocol/typescript-sdk/blob/5fc42e9be115a8865cca42541bb50183dc2e8b93/packages/core/src/types/schemas.ts#L127-L187
/**
 * A request that expects a response.
 */
export const JSONRPCRequestSchema = z
    .object({
        jsonrpc: z.literal(JSONRPC_VERSION),    // "2.0" 字面量
        id: RequestIdSchema,                     // string | number
        ...RequestSchema.shape                   // method + params + _meta
    })
    .strict();

/**
 * A notification which does not expect a response.
 */
export const JSONRPCNotificationSchema = z
    .object({
        jsonrpc: z.literal(JSONRPC_VERSION),
        ...NotificationSchema.shape              // 比 Request 少一个 id
    })
    .strict();

/**
 * A successful (non-error) response to a request.
 */
export const JSONRPCResultResponseSchema = z
    .object({
        jsonrpc: z.literal(JSONRPC_VERSION),
        id: RequestIdSchema,
        result: ResultSchema
    })
    .strict();

/**
 * A response to a request that indicates an error occurred.
 */
export const JSONRPCErrorResponseSchema = z
    .object({
        jsonrpc: z.literal(JSONRPC_VERSION),
        id: RequestIdSchema.optional(),
        error: z.object({
            code: z.number().int(),
            message: z.string(),
            data: z.unknown().optional()
        })
    })
    .strict();

export const JSONRPCMessageSchema = z.union([
    JSONRPCRequestSchema,
    JSONRPCNotificationSchema,
    JSONRPCResultResponseSchema,
    JSONRPCErrorResponseSchema
]);
```

**旁注一**：四个 schema 都是 `.strict()`——禁未知字段。
意味着 client 给 server 发 `{"jsonrpc":"2.0","id":1,"method":"tools/call","extra":"x"}` 会被拒。
**这是 MCP 比一般 REST API 更严格的地方**——跨厂商协议要防止"扩展字段 collision"。
未来 MCP 想加新字段，必须升 protocol version、走 capabilities 协商。

**旁注二**：`JSONRPC_VERSION` 是字面量 `"2.0"`（见 `core/src/types/constants.ts:8`），
zod `z.literal` 会把它作为类型 narrow——如果对方传 `"1.0"` 立刻拒。
**协议版本绑死在外层信封**，比放在 `_meta` 里更不容易被遗漏。

**旁注三**：`JSONRPCMessageSchema` 用 `z.union` 把四种合一——
这就是 transport 收到任何字节流后调的 schema。
`deserializeMessage(line)` 一行（`packages/core/src/shared/stdio.ts:44-46`）：

```typescript
export function deserializeMessage(line: string): JSONRPCMessage {
    return JSONRPCMessageSchema.parse(JSON.parse(line));
}
```

`JSON.parse` 给结构，`zod.parse` 给类型——**两步走的 deserialize**。

**旁注四**：用户写 tool 时填的 `inputSchema`——SDK 接受 zod schema 或者 JSON Schema 对象。
SDK 内部用 `standardSchemaToJsonSchema` 把 zod 转成 JSON Schema 发给 client，
client 看到 JSON Schema 知道怎么生成参数；
client 调用 server，server 又用 zod schema 校验入参。
**zod 是 server 的私货，JSON Schema 是协议接口**——双重表达。

**旁注五**：错误码 `code: z.number().int()`——
JSON-RPC 2.0 标准错误码（-32700 Parse error / -32600 Invalid Request / -32601 Method not found / -32602 Invalid params / -32603 Internal error）+ MCP 自定义码（见 `ProtocolErrorCode` 枚举）。
**错误码标准化是协议成熟的标志**——client 可以根据 code 决定"是不是要重试"。

**怀疑三**：`JSONRPCErrorResponseSchema` 的 `id` 是 `optional()`——
JSON-RPC 2.0 spec 说 "If there was an error in detecting the id, the id MUST be Null"，
意思是 id 必须存在但可以是 null。zod 这里用 `.optional()` 允许字段缺失——**严格说不合规**。
不过实际影响小（多数 client 都能容忍 id 缺失），但跨实现互通时可能踩坑。
要不要 PR 改成 `RequestIdSchema.nullable()` 才是 spec 严格写法？
（待查：这个写法是 v1 沿用的兼容性遗留，还是有意为之的容错？）

> **三段精读小结**：
> 机制 1 给"框架要管什么"——4 个 map 注册三类 primitive；
> 机制 2 给"框架不管什么"——Transport interface 把传输隔离掉；
> 机制 3 给"框架怎么保证安全"——zod schema 在协议边界做运行期类型校验。
> **三段共同回答**：MCP 是一个**严格的、可扩展的、传输无关的**进程间协议——这三个特性就是分支 D 框架/SDK 的"价值产出"。

## 横向对比（Layer 5）

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

### vs LSP（Language Server Protocol） — 同源思路，应用域不同

LSP 是 VSCode/Microsoft 出品，定义 editor ↔ language server 的协议。
也用 JSON-RPC 2.0，也用 capabilities 协商，也用 textDocument/* 这种 method 命名空间。

**MCP 是受 LSP 启发但目标域不同**：
LSP 标准化"编辑器和编译器对话"，MCP 标准化"agent 和工具对话"。
两者相同部分（信封 + 协商）证明这种设计模式在跨进程场景反复有效。

### vs gRPC / 普通 HTTP API — 应用领域不同

MCP 不是通用 IPC。它**专门为 LLM 工具集成**设计：

- 三类原语反映 LLM 心智
- schema 强制是为了 LLM 准确调用
- prompts 是 LLM 协作场景特有

如果你的需求是**通用进程间通信**，MCP 不合适——用 gRPC / 普通 HTTP 即可。

## Hands-on（10 分钟内能跑） · Layer 4 改一处

> 分支 D 要求：写 1 个 plugin / middleware / schema extension，跑 example 看 lifecycle 何时触发。
> 这里我做的"改一处"是：注册一个 custom Tool + 一个 custom Resource，
> 然后接到 Claude Desktop / Code，观察从 client → transport → server → handler 的完整 lifecycle。

### Step 1：搭最小 server

```bash
mkdir mcp-demo && cd mcp-demo
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D tsx typescript
```

写 `server.ts`：

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod/v4'

const server = new McpServer({
  name: 'demo-server',
  version: '1.0.0'
})

// Custom Tool: 一个有副作用的动作（这里只是日志，但形式上是 action）
server.registerTool(
  'greet',
  {
    title: 'Greet someone',
    description: '向某人打招呼并记录到 stderr',
    inputSchema: z.object({ name: z.string() }),
    outputSchema: z.object({ greeted: z.string(), at: z.string() })
  },
  async ({ name }) => {
    const at = new Date().toISOString()
    process.stderr.write(`[demo-server] greet called with name=${name} at ${at}\n`)
    const output = { greeted: name, at }
    return {
      content: [{ type: 'text', text: `Hello, ${name}!` }],
      structuredContent: output
    }
  }
)

// Custom Resource: 一个只读的 process info
server.registerResource(
  'proc-info',
  'proc://info',
  {
    title: 'Process info',
    description: '当前 Node 进程的运行信息（pid / uptime / cwd）',
    mimeType: 'application/json'
  },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify({
        pid: process.pid,
        uptime: process.uptime(),
        cwd: process.cwd(),
        node: process.version
      }, null, 2)
    }]
  })
)

const transport = new StdioServerTransport()
await server.connect(transport)
process.stderr.write('[demo-server] connected via stdio\n')
```

```bash
# 直接跑会等 stdin（这是正常的——transport 在阻塞等 JSON-RPC）
# 用 Ctrl+D 或 Ctrl+C 退出
npx tsx server.ts
```

### Step 2：接到 Claude Desktop / Claude Code

`~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）或项目级 `.mcp.json`：

```json
{
  "mcpServers": {
    "demo": {
      "command": "npx",
      "args": ["tsx", "/abs/path/to/mcp-demo/server.ts"]
    }
  }
}
```

重启 Claude Desktop。在对话框输入：

> 用 demo 服务器向 Jason 打招呼，然后读 proc://info 给我看进程信息

Claude 会：

1. 看 demo server 暴露什么 → 调 `tools/list` + `resources/list`
2. 决定调 `greet` tool（参数 `{name: "Jason"}`）→ 走 `tools/call`
3. 决定读 `proc://info` resource → 走 `resources/read`
4. 把两个结果合起来回答你

→ 如果一切正常，你会在 Claude 回答里看到 `Hello, Jason!` + JSON 进程信息，
同时 server 进程的 stderr 会有 `[demo-server] greet called with name=Jason at 2026-...` 日志——
**这就是从 client 决策 → transport 传输 → server handler 执行的完整 lifecycle**。

### Step 3：改一处的实验（必做）

#### 实验 A：把 inputSchema 的 `name` 字段去掉 required

```typescript
inputSchema: z.object({ name: z.string().optional() })
```

让 Claude 调 greet 不传 name——**观察会怎样**。
预期：tool handler 拿到 `{name: undefined}`，模板字符串输出 `"Hello, undefined!"`。
**说明 schema 校验只防"类型错"，不防"语义错"**——
框架不能替你想清楚业务规则。

#### 实验 B：写一个 ResourceTemplate 而不是固定 Resource

```typescript
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'

server.registerResource(
  'file-info',
  new ResourceTemplate('file:///{path}', { list: undefined }),
  { title: 'File metadata', mimeType: 'application/json' },
  async (uri, vars) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify({ requested: vars.path }, null, 2)
    }]
  })
)
```

让 Claude 读 `file:///etc/hosts`——**ResourceTemplate 会把 `{path}` 解析为 `etc/hosts`**。
观察 lifecycle：transport 收到 `resources/read { uri: "file:///etc/hosts" }`，
McpServer 在 `setResourceRequestHandlers` 里**先看固定 resource 字典 → 再扫 template 字典**
（见 `mcp.ts:483-503`），命中 template 后 `template.resourceTemplate.uriTemplate.match(uri.toString())` 抽变量。
**这就是 mcp.ts 里 lazy-init handler 的好处**——你没注册 ResourceTemplate 时，那段路径根本不跑。

#### 实验 C：观察 transport-level 行为（兜底验证）

在 server.ts 顶部加：

```typescript
process.stdin.on('data', (chunk) => {
  process.stderr.write(`[raw stdin] ${chunk.toString().trim()}\n`)
})
```

⚠️ 但这会**抢走 StdioServerTransport 的 data event**（Node stream 默认 fan-out，这里其实不抢，但要留意）。
更好的做法：拦截 `transport.onmessage` 包装一层日志：

```typescript
const origOnMessage = transport.onmessage
transport.onmessage = (msg, extra) => {
  process.stderr.write(`[recv] ${JSON.stringify(msg)}\n`)
  origOnMessage?.(msg, extra)
}
```

接 Claude 调 greet，看 stderr 完整 JSON-RPC 报文——
这是把**机制 2 的 Transport interface 换成自己的"加日志版"**的最小做法，
也是日后写 custom Transport 的脚手架。

### Step 4：lifecycle 检查清单（分支 D 必做）

| 阶段 | 触发 | 在 SDK 哪一层 |
|---|---|---|
| 1. spawn | Claude Desktop 读 config，spawn `npx tsx server.ts` | OS 层（Claude Desktop） |
| 2. 双向 stdio | server 启动，client/server 各自挂 listener | `StdioServerTransport.start()` `mcp.ts:51-62` |
| 3. initialize | client 发 `initialize` 请求，server 回 capabilities | `Server.connect()` `server.ts` |
| 4. list | client 发 `tools/list` + `resources/list` + `prompts/list` | `mcp.ts:setToolRequestHandlers` 等 |
| 5. call/read | client 发 `tools/call` + `resources/read` | `mcp.ts:163` + `mcp.ts:483` |
| 6. 校验+执行 | server 用 zod 校验 args，跑 handler | `validateToolInput` + `executeToolHandler` |
| 7. response | server 序列化结果，stdout 写一行 NDJSON | `serializeMessage` `core/shared/stdio.ts:48` |
| 8. close | Claude Desktop 退出，子进程被 SIGTERM | `StdioServerTransport.close()` |

→ 跑通这 8 步 = **真正用过 MCP 的 lifecycle**，不是看文档脑补。

## 与你工作的连接

**能立刻迁移**：

- 把项目里的 internal CLI / API 包装成 MCP server——立即被所有 MCP client 用
- 团队工具：DB query / monitoring / log search 写成 MCP server，开发者用 Claude Code 调用
- 把 [tRPC 笔记](/study/projects/trpc/) 里的内部 API 暴露成 MCP（双层）
- "工具说明书"问题：tool 描述写不好 LLM 调不准——MCP 把这变成**协议级问题**，逼你认真写 description / schema

**下个月可能用到**：

- 给客户/同事写 MCP server——"接到 Claude Code 就能用"是有竞争力的卖点
- 把 LLM playground 替换成 MCP client——能调你的整个工具集
- 写 custom Transport 跨进程通信（比如把 unix socket 包成 Transport，给同机进程一个零开销 IPC）

**不要用 MCP 的部分**：

- **公开 REST API**——MCP 不替代 OpenAPI；普通 HTTP 仍是首选
- **大流量、低延迟数据传输**——MCP 不是 CDN，传协议头开销不小，NDJSON 也不利于二进制
- **不希望 AI 自动调用的危险操作**——MCP 是为 AI 设计的，给人用反而麻烦
- **强一致性事务**——MCP 没有事务/回滚语义，跨多 tool 的 atomic 操作要自己拼

## 读完你能做之前做不了的事

- **判断**：看到一个 LLM 工具时，能问"它支不支持 MCP"——这是协议成熟度的指标
- **设计**：写 LLM 应用时，思考 "我应该把工具做成 in-process function 还是 MCP server"
- **解释**：被问"MCP 是什么"时，能用三段式（三原语 + JSON-RPC + 多 transport）+ 一句"和 LSP 同源"
- **下钻**：看懂 LSP（语言服务器协议）的设计——MCP 和 LSP 是同源思路
- **对照**：识别"我这个工具有没有跨厂商价值"——值不值得做成 MCP
- **实现**：自己写一个 custom Transport（如 unix socket / WebSocket），跑通双方握手

## 限制 · 宣传 vs 现实

| 宣传 | 现实 |
|---|---|
| "一份代码，所有 LLM 都能用" | client 实现差异大；Claude Desktop / Cursor / VSCode 对 MCP 的支持深度不一致 |
| "schema 强制保证安全" | 只防类型错，不防语义错（实验 A）；权限/认证还是要自己做 |
| "stdio + HTTP 两种部署形态" | stdio 简单但只能本机；HTTP 要处理 session / resumption / 鉴权（streamableHttp.ts 1038 行不是白来的） |
| "v2 即将稳定" | v2.0.0-alpha，breaking changes 还在发生；生产用建议锁版本 + 看 changelog |
| "协议设计已成熟" | 三类原语之外，task management / elicitation / completable 还在 experimental 命名空间 |

## 自检 · 5 个问题

1. MCP 的三类原语（tools / resources / prompts）。设计时为什么要把"读取数据"（resources）和"执行动作"（tools）分开？
   合并成一种会有什么问题？
2. McpServer 是 Server 的便利包装——但保留了 `.server` 直接访问。
   这种"封装但不囚禁"的设计还出现在哪些库里？
3. MCP 用 JSON-RPC 而不是 REST。两者各自的优劣？为什么 LLM 工具场景选 JSON-RPC？
4. 协议级别的 schema 强制（zod 在 deserialize 时跑，inputSchema 在 tools/call 时跑）。
   如果 LLM 调用时 schema 不对会怎样？SDK 是抛错还是降级？
5. v1 → v2 提供 codemod。判断一个开源项目"是否值得长期投资"时，可以从 codemod / migration guide 看出什么？
6. （加分）`Transport` interface 只有 4 个必填成员（start / send / close / onmessage）。
   如果让你给浏览器跨 iframe 通信写一个 `PostMessageTransport`，会怎么实现 `start()` 里 ready 握手？

## 延伸阅读

读完这篇笔记后下一步：

1. **MCP 官方规范**（[modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)）——
   读完协议本身，再看 SDK 实现
2. `packages/server/src/server/mcp.ts:63-1397`——完整的 McpServer 实现
3. `packages/server/src/server/streamableHttp.ts`——HTTP transport 实现，1038 行体现 session / resumption / SSE fallback 复杂度
4. `packages/core/src/shared/protocol.ts:1-1236`——基类 Protocol，理解请求/响应/通知的调度
5. **LSP 协议**（[microsoft.github.io/language-server-protocol](https://microsoft.github.io/language-server-protocol/)）——
   MCP 借鉴了大量 LSP 设计
6. **anthropic-cookbook MCP 例子**——典型 use case 完整代码
7. **mcp-servers** 仓库（modelcontextprotocol/servers）——大量真实 server 范例
8. **JSON-RPC 2.0 spec**（[jsonrpc.org/specification](https://www.jsonrpc.org/specification)）——
   两页纸看完，看完就懂为啥 MCP 选它

---

**笔记完成**：2026-05-28（v2.0.0-alpha.0 / commit 5fc42e9）
**项目类型**：框架/SDK（v1.1 分支 D）
**研究方法**：本地克隆 5fc42e9 + 阅读 mcp.ts / transport.ts / schemas.ts 三心脏 + 跑 examples + 协议规范理解
**心脏文件**：
- `packages/server/src/server/mcp.ts:63-1397` （McpServer 类，框架核心 abstraction）
- `packages/core/src/shared/transport.ts:74-134` （Transport interface，extension point）
- `packages/core/src/types/schemas.ts:127-185` （JSON-RPC 信封 zod schema）
- `packages/server/src/server/stdio.ts:19-138` （stdio 落地实现）

**显式怀疑清单**（分支 D 底线 ≥ 3）：

1. 4 个 registered map 用 plain object 而不是 Map——反复 register/unregister 时可能踩 V8 hidden class 退化
2. ReadBuffer.readMessage 对 SyntaxError `continue`——容忍 dev tooling 噪声但生产场景应 fail loud
3. JSONRPCErrorResponseSchema 的 id 用 `.optional()` 而非 `.nullable()`——和 JSON-RPC 2.0 spec 严格对照存在偏差

**GitHub permalink 清单**（底线 ≥ 4，全部钉到 commit 5fc42e9）：

1. `mcp.ts#L63-L110` McpServer 类
2. `transport.ts#L74-L134` Transport interface
3. `schemas.ts#L127-L187` JSON-RPC 四元组 schema
4. `stdio.ts#L19-L77` StdioServerTransport 实现
