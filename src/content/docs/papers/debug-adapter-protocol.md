---
title: Debug Adapter Protocol — 让编辑器共享同一套「调试遥控器」的通用协议
来源: https://microsoft.github.io/debug-adapter-protocol/
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 是什么

**Debug Adapter Protocol（DAP，调试适配器协议）** 是 Microsoft 维护的一份开放规范（当前稳定版本 **1.71.0**），定义了**开发工具（客户端）** 与**调试后端（Debug Adapter）** 之间如何通过 **JSON 消息** 交换调试指令与状态。它与 2016 年发布的 **Language Server Protocol（LSP）** 是同一思路的姊妹协议：LSP 统一「补全/跳转/诊断」，DAP 统一「断点/单步/变量/调用栈」。

日常类比：你去不同品牌的电视（Sony、Samsung、小米），每台遥控器按键布局都不一样——换台、音量、输入源各有一套。DAP 相当于**通用红外遥控协议**：VS Code、Neovim、JetBrains、Zed 都是「万能遥控器外壳」，Python Debugger、Delve（Go）、lldb-vscode、Java Debug Adapter 都是「被控的电视机」。遥控器只发标准指令（下一步、暂停、设断点），电视机内部的芯片怎么解码由各家自己实现；**写一次 Debug Adapter，所有支持 DAP 的编辑器都能调试**。

技术定义：DAP 在 **Base Protocol**（带 `Content-Length` 头的帧格式，与 LSP 几乎相同）之上定义三类消息——**Request**（客户端 → 适配器，需回复）、**Response**（对 Request 的回复）、**Event**（适配器 → 客户端，异步通知，如 `stopped`、`terminated`）。规范不要求调试器原生支持 DAP；现实中几乎总是通过一个**中间层 Debug Adapter** 把 GDB、lldb、JDI、Delve API 等「方言」翻译成 DAP「普通话」。

## 为什么重要

不理解 DAP，下面这些事都没法解释：

- 为什么 VS Code 里调试 Python、Go、Rust、Java 的 UI 长得几乎一样——底层都是同一套 DAP 客户端，不是每个语言重写一套调试面板
- 为什么 Neovim 的 `nvim-dap` 能复用 VS Code 生态的 `debugpy`、`delve` 适配器——协议相同，只是客户端不同
- 为什么新语言想接入主流 IDE，往往先写 **Debug Adapter** 而不是给每个编辑器写插件——适配器可跨工具复用
- 为什么 DAP 刻意保持 **v1 永不破坏兼容**——靠 **Capabilities（能力标志）** 协商新特性，而不是升主版本号

## 架构一览

```
┌─────────────────────────────────────────────────────────┐
│  开发工具（DAP Client / Host）                            │
│  VS Code · Neovim+nvim-dap · Cursor · JetBrains · Zed    │
│  通用调试 UI：断点栏、变量树、调用栈、调试控制台、线程列表   │
└───────────────────────────┬─────────────────────────────┘
                            │ JSON Request / Response / Event
                            │ 传输：stdio（常见）或 TCP socket
┌───────────────────────────▼─────────────────────────────┐
│  Debug Adapter（中间层）                                  │
│  debugpy · delve/dap · lldb-vscode · Java Debug Adapter │
│  把 DAP 命令映射到具体调试器 API                          │
└───────────────────────────┬─────────────────────────────┘
                            │ 原生调试接口
┌───────────────────────────▼─────────────────────────────┐
│  调试器 / Runtime                                         │
│  GDB · lldb · JVM JDWP · Python sys.settrace · Delve …   │
└─────────────────────────────────────────────────────────┘
```

**关键设计选择**：标准化的是 **wire protocol（线上协议）**，不是 C++/Java 的 client library。适配器可以用最适合该调试器的语言实现（Python 写 `debugpy`、Go 写 Delve DAP、Node.js 写 `@vscode/debugadapter`）。

## 核心概念

### 1. Base Protocol（传输 + 帧格式）

与 LSP 一样，每条消息由 **ASCII 报文头** + **UTF-8 JSON body** 组成：

```
Content-Length: 119\r\n
\r\n
{"seq":153,"type":"request","command":"next","arguments":{"threadId":3}}
```

| 字段 | 含义 |
|------|------|
| `Content-Length` | body 字节数（必填，目前唯一支持的 header） |
| `seq` | 单调递增序号，用于关联 request 与 response |
| `type` | `request` / `response` / `event` |

三种消息形态：

| 类型 | 方向 | 需要回复？ | 典型例子 |
|------|------|------------|----------|
| Request | Client → Adapter | 是 | `initialize`, `launch`, `setBreakpoints`, `next` |
| Response | Adapter → Client | — | `InitializeResponse`, `SetBreakpointsResponse` |
| Event | Adapter → Client | 否 | `stopped`, `initialized`, `terminated`, `output` |

### 2. Capabilities（能力协商）

DAP 自诞生起一直是 **protocol version 1**，新功能通过 **capabilities 标志** 扩展，而不是 bump 主版本。会话开始时 Client 发 `initialize` request，双方交换各自支持的能力：

- Client 侧：`supportsRunInTerminalRequest`、`supportsVariablePaging` 等（前缀常为 `supports`）
- Adapter 侧：`supportsConditionalBreakpoints`、`supportsEvaluateForHovers`、`supportsStepBack` 等

**规则**：某个 capability 字段**不存在** = 不支持；不必显式返回 `false`。

### 3. 会话生命周期（Launch Sequencing）

一次完整调试会话的典型顺序（规范强制部分步骤的先后关系）：

```
Client                          Debug Adapter
  |                                   |
  |-------- initialize -------------->|
  |<------- InitializeResponse -------|  （交换 capabilities）
  |                                   |
  |-------- launch / attach --------->|  （启动或附着被调试程序）
  |                                   |
  |<------- initialized event --------|  （适配器：可以收断点配置了）
  |-------- setBreakpoints ---------->|
  |-------- setExceptionBreakpoints ->|
  |-------- configurationDone ------->|
  |<------- launch/attach Response ----|  （此时程序真正跑起来）
  |                                   |
  |<------- stopped event ------------|  （命中断点 / 异常 / 用户暂停）
  |-------- threads ----------------->|
  |-------- stackTrace -------------->|
  |-------- scopes ------------------>|
  |-------- variables --------------->|
  |                                   |
  |-------- continue / next --------->|
  |                                   |
  |-------- disconnect / terminate -->|
  |<------- terminated event ---------|
```

两种启动模式：

| 模式 | 谁启动被调试程序 | 典型 Request |
|------|------------------|--------------|
| **launch** | Debug Adapter 负责拉起进程 | `launch` + `program`/`args` 等（由扩展 schema 定义，规范不固定字段） |
| **attach** | 用户先手动启动，Adapter 附着 | `attach` + `processId` 等 |

**configurationDone** 是容易忽略的关键点：在 Adapter 发出 `initialized` event 之前，Client 不应发送断点配置；配置序列结束后发 `configurationDone`，Adapter 才应完成 `launch`/`attach` 的响应。

### 4. 停止态与对象引用（Object References）

程序暂停时，Client 按「瀑布」拉取调试状态：

```
threads → stackTrace → scopes → variables → variables（递归子字段）
```

`scopes`、`variables` 等复杂结构不直接嵌在父对象里，而是通过 **`variablesReference`（正整数句柄）** 延迟获取。规范约定：

- 与**当前暂停态**绑定的引用（栈帧、作用域变量）在 **continue 之后失效**；Adapter 可在恢复执行时把引用计数器重置为 1
- `evaluate`、调试控制台 `output` 事件里的变量引用应尽可能**跨暂停态保留**，方便用户事后检查

`threadId` 等标识符**没有**这种短生命周期限制，否则 `pause` 请求无法作用于运行中的线程。

### 5. 断点语义

`setBreakpoints` 对**单个源文件**发送**全量**断点列表（非增量）。Adapter 通常实现为：清空该文件旧断点 → 设置 request 中的新列表 → 在 response 里返回**实际生效**的断点（位置可能被调试器微调）。

若暂时无法验证断点，应设 `verified: false`；之后状态变化用 **`breakpoint` event** 通知 Client 更新 UI。

### 6. 连接模式

| 模式 | 说明 |
|------|------|
| **Single Session** | Client 把 Adapter 当子进程拉起，经 **stdin/stdout** 通信；会话结束终止进程；多会话 = 多个 Adapter 进程 |
| **Multi Session** | Adapter 常驻监听端口；每个调试会话建立独立 TCP 连接 |

Adapter 如何被启动**不在** DAP 规范内，由各工具的 `launch.json` / `dap.configurations` 等扩展机制约定。

## 代码示例

### 示例 1：手工构造一条 DAP `setBreakpoints` 消息

下面展示 Base Protocol 帧 + JSON body，等价于在 `main.go` 第 10 行设一个断点（Go 适配器常见场景）：

```text
Content-Length: 287

{
  "seq": 4,
  "type": "request",
  "command": "setBreakpoints",
  "arguments": {
    "source": {
      "path": "/home/dev/project/main.go",
      "name": "main.go"
    },
    "lines": [10],
    "breakpoints": [
      {
        "line": 10,
        "condition": "err != nil"
      }
    ],
    "sourceModified": false
  }
}
```

Adapter 的 `SetBreakpointsResponse` 可能返回：

```json
{
  "seq": 5,
  "type": "response",
  "request_seq": 4,
  "success": true,
  "command": "setBreakpoints",
  "body": {
    "breakpoints": [
      {
        "id": 1,
        "verified": true,
        "line": 10,
        "message": ""
      }
    ]
  }
}
```

若第 10 行不可设断点（如无调试信息），则 `verified: false`，`message` 解释原因。

### 示例 2：用 Node.js `@vscode/debugadapter` 实现最小适配器骨架

Microsoft 官方提供多语言 SDK。Node.js 侧可用 `DebugSession` 子类快速搭一个「回声」适配器，演示 Request/Event 处理：

```typescript
import {
  DebugSession,
  InitializedEvent,
  TerminatedEvent,
  StoppedEvent,
  OutputEvent,
  Thread,
} from '@vscode/debugadapter';

class MinimalDebugSession extends DebugSession {
  private static threadId = 1;

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments
  ): void {
    response.body = response.body || {};
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsEvaluateForHovers = true;
    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse
  ): void {
    this.sendResponse(response);
  }

  protected launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: DebugProtocol.LaunchRequestArguments
  ): void {
    this.sendResponse(response);
    this.sendEvent(new OutputEvent('Program started\n', 'stdout'));
    // 模拟立即在入口停住
    this.sendEvent(
      new StoppedEvent('entry', MinimalDebugSession.threadId)
    );
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [new Thread(MinimalDebugSession.threadId, 'main')],
    };
    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): void {
    this.sendResponse(response);
    this.sendEvent(new TerminatedEvent());
  }
}

MinimalDebugSession.run(MinimalDebugSession);
```

配合 VS Code `launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "minimal",
      "request": "launch",
      "name": "Launch Minimal Adapter",
      "program": "${workspaceFolder}/dummy"
    }
  ]
}
```

`type: "minimal"` 由扩展注册，指向上述 Adapter 可执行文件；Client 仍按标准顺序发 `initialize` → `launch` → 等 `initialized` → `configurationDone`。

### 示例 3：Neovim `nvim-dap` 客户端配置（消费方视角）

作为 DAP Client，Neovim 不实现调试器，只发标准 Request。调试 Go 时典型配置：

```lua
local dap = require('dap')

dap.adapters.delve = {
  type = 'server',
  port = '${port}',
  executable = {
    command = 'dlv',
    args = { 'dap', '--listen', '127.0.0.1:${port}', '--log', '--log-output=dap' },
  },
}

dap.configurations.go = {
  {
    type = 'delve',
    name = 'Debug main',
    request = 'launch',
    program = '${workspaceFolder}',
    dlvLoadConfig = {
      followPointers = true,
      maxVariableRecurse = 1,
      maxStringLen = 64,
      maxArrayValues = 64,
      maxStructFields = -1,
    },
  },
}
```

用户在 Neovim 里按 F5，`nvim-dap` 在后台完成：`initialize` → `launch` → 断点同步 → `continue` → 处理 `stopped` event → 拉 `stackTrace`/`variables`。**同一份 Delve DAP 适配器**也可被 VS Code Go 扩展使用。

## 与 LSP 的对比

| 维度 | LSP | DAP |
|------|-----|-----|
| 解决的问题 | 编辑期「语言智能」 | 运行期「交互式调试」 |
| 消息载体 | JSON-RPC 2.0（`method`/`id`） | 自定义 JSON（`command`/`seq`） |
| 传输帧 | `Content-Length` + JSON | 相同 |
| 中间层名称 | Language Server | Debug Adapter |
| 版本策略 | 显式 LSP 3.x 版本 | 永久 v1 + capabilities 标志 |
| 典型 Client | 编辑器代码补全 | 断点、单步、变量、REPL |

两者常成对出现：Rust 用 `rust-analyzer`（LSP）+ `lldb-vscode`/`codelldb`（DAP）；Python 用 Pylance/Pyright（LSP）+ `debugpy`（DAP）。

## 常见 Request / Event 速查

| 名称 | 类型 | 作用 |
|------|------|------|
| `initialize` | Request | 交换 capabilities，会话第一步 |
| `launch` / `attach` | Request | 启动或附着被调试程序 |
| `configurationDone` | Request | 告诉 Adapter 断点配置已发完 |
| `setBreakpoints` | Request | 某源文件的全量断点 |
| `continue` / `next` / `stepIn` / `stepOut` | Request | 执行控制 |
| `threads` / `stackTrace` / `scopes` / `variables` | Request | 暂停态信息瀑布 |
| `evaluate` | Request | 调试控制台求值 / hover |
| `disconnect` / `terminate` | Request | 结束会话（attach vs launch 语义不同） |
| `initialized` | Event | Adapter 准备好接收断点配置 |
| `stopped` | Event | 程序暂停，带 `reason`（breakpoint、exception、pause…） |
| `output` | Event | 被调试程序 stdout/stderr 到调试控制台 |
| `terminated` | Event | 调试会话结束 |

## 实现与生态

规范页列出了大量现成适配器：**debugpy**（Python）、**Delve DAP**（Go）、**Java Debug Adapter**、**lldb-vscode**、**Mono/Debugger**、**perl-debug-adapter** 等。SDK 包括：

- **Node.js**：[`@vscode/debugadapter`](https://www.npmjs.com/package/@vscode/debugadapter) + [`@vscode/debugadapter-testsupport`](https://www.npmjs.com/package/@vscode/debugadapter-testsupport)
- **Java**：[Eclipse LSP4J Debug](https://github.com/eclipse-lsp4j/lsp4j) 等
- **测试**：官方 [debug adapter test suite](https://github.com/microsoft/debug-adapter-protocol/tree/main/test-suite) 可验证适配器合规性

若你要为新语言添加调试支持，推荐路径：

1. 先用现有 CLI 调试器验证能设断点、单步、看变量
2. 实现薄层 Debug Adapter，优先支持 `initialize`、`launch`、`setBreakpoints`、`configurationDone`、`continue`、`threads`、`stackTrace`、`scopes`、`variables`、`stopped`/`terminated`
3. 用 VS Code 或 `nvim-dap` 做手工测试，再跑官方 test suite
4. 按需声明 capabilities，逐步加条件断点、`evaluate`、多线程、`runInTerminal` 等

## 常见误区

1. **把 DAP 当成调试器本身** — DAP 只是 UI 与调试后端之间的协议；GDB、lldb、JDWP 才是实际执行调试的机制
2. **在 `initialized` 之前发 `setBreakpoints`** — 违反时序，部分 Adapter 会丢断点或行为未定义
3. **假设 `variablesReference` 跨 continue 仍有效** — 暂停态引用在恢复执行后失效，Client 必须重新拉取
4. **认为 `launch` 的参数由规范统一** — `program`、`cwd`、`env` 等由各家 Adapter 的 JSON Schema 定义（通常通过 VS Code `contributes.debuggers` 贡献）
5. **忽略 `verified: false` 断点** — UI 应明确提示灰显断点，而不是假装已生效

## 延伸阅读

- [DAP 官方规范 1.71.0](https://microsoft.github.io/debug-adapter-protocol/specification) — 全部 Request/Event 的 JSON Schema
- [Overview（架构与生命周期）](https://microsoft.github.io/debug-adapter-protocol/overview) — 官方序列图与对象生命周期说明
- [Language Server Protocol 笔记](./language-server-protocol-spec.md) — 姊妹协议，对比阅读效果更好
- [VS Code Debugger Extension 指南](https://code.visualstudio.com/api/extension-guides/debugger-extension) — 如何注册 `type`、写 `launch.json` schema、打包 Adapter
- [nvim-dap 文档](https://github.com/mfussenegger/nvim-dap) — 非 VS Code 客户端实现参考

---

**一句话总结**：DAP 是编辑器和调试器之间的「通用遥控协议」——编辑器只实现一次调试 UI，调试器通过 Adapter 说同一种 JSON 语言；理解 **capabilities 协商**、**launch 时序** 和 **暂停态对象引用**，就掌握了现代 IDE 调试体验的核心骨架。
