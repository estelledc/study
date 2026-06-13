---
title: Debug Adapter Protocol Specification — 零基础读懂调试协议规范
来源: https://microsoft.github.io/debug-adapter-protocol/specification
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 是什么

**Debug Adapter Protocol Specification（DAP 规范）** 是 Microsoft 在 [microsoft.github.io/debug-adapter-protocol](https://microsoft.github.io/debug-adapter-protocol/) 上发布的正式技术文档，当前稳定版本为 **1.71.0**。它用 TypeScript 风格的 interface 精确定义了**开发工具（Client）** 与 **Debug Adapter** 之间交换的每一条 JSON 消息：字段名、类型、是否必填、语义约束，以及 Request 与 Event 的合法顺序。

日常类比：你买了一台「万能空调遥控器」（VS Code、Cursor、Neovim），说明书上写着：按「模式」键发 `initialize`，按「温度」键发 `setBreakpoints`，空调（Debug Adapter）必须回 `response` 或主动推 `event`。DAP 规范就是这份**遥控器与空调之间的通信说明书**——不是教你空调压缩机怎么转，而是规定「按下制冷时，遥控器发什么 JSON、空调必须回什么 JSON、什么时候主动响蜂鸣器（`stopped` event）」。各品牌空调内部电路不同（GDB、lldb、JDWP），但对外接口统一，遥控器只学一份说明书。

技术定义：规范分五大部分——**Base Protocol**（传输帧与三种消息基类）、**Events**（Adapter 主动推送）、**Requests**（Client 发起、需回复）、**Reverse Requests**（Adapter 反向请求 Client，如 `runInTerminal`）、**Types**（`Source`、`StackFrame`、`Variable` 等共享数据结构）。机器可读 JSON Schema 见 [debugProtocol.json](https://microsoft.github.io/debug-adapter-protocol/debugProtocol.json)。

## 为什么重要

零基础读规范，能解决这些「只会点 F5 却不知道背后发生了什么」的问题：

- 为什么断点有时变灰——规范要求 `setBreakpoints` 返回 `verified: false` 时 Client 必须提示未生效
- 为什么程序刚启动就停住——Adapter 在 `configurationDone` 完成前不应结束 `launch`/`attach`，但可以在入口发 `stopped`（reason: `entry`）
- 为什么单步后变量树要重新展开——`variablesReference` 在 **continue 之后失效**，这是规范写死的生命周期
- 为什么 Neovim 能复用 VS Code 的 `debugpy`——双方实现的是同一份 Specification，不是同一份二进制

## 规范文档结构

打开 [Specification 页面](https://microsoft.github.io/debug-adapter-protocol/specification)，可按目录分层阅读：

```
Specification
├── Base Protocol          ← 帧格式、ProtocolMessage / Request / Response / Event
├── Events                 ← initialized, stopped, terminated, output, thread …
├── Requests               ← initialize, launch, setBreakpoints, stackTrace …
├── Reverse Requests       ← runInTerminal（Adapter 请 Client 开终端）
└── Types                  ← Source, Breakpoint, StackFrame, Variable, Capabilities …
```

每条 Request/Event 在规范里都有：命令名（`command` / `event` 字段值）、参数结构、响应 `body`、相关 capability 标志。实现适配器时，应把规范当**合同**：Client 按合同发，Adapter 按合同回；缺字段或乱序可能导致 VS Code 静默丢功能。

## 核心概念

### 1. Base Protocol：与 LSP 同款的「信封」

规范规定消息经 **stdin/stdout** 或 **TCP** 传输，每条消息 = ASCII 报头 + UTF-8 JSON：

| 报头字段 | 含义 |
|----------|------|
| `Content-Length` | body 字节数（唯一必填报头） |

body 中所有消息继承 `ProtocolMessage`：

| 字段 | 类型 | 含义 |
|------|------|------|
| `seq` | number | 单调递增序号；Request 的 `seq` 用于匹配 Response 的 `request_seq` |
| `type` | string | `request` / `response` / `event` |

三种形态：

| type | 关键字段 | 方向 | 需回复 |
|------|----------|------|--------|
| request | `command`, `arguments?` | Client → Adapter | 是 |
| response | `request_seq`, `success`, `command`, `body?`, `message?` | Adapter → Client | — |
| event | `event`, `body?` | Adapter → Client | 否 |

### 2. Capabilities：永远 v1 的扩展方式

规范**自诞生起主版本恒为 1**。新功能不靠 bump 版本，靠 `initialize` 交换的 **Capabilities** 布尔标志。字段**不存在**即表示不支持，不必写 `false`。

Client 常见：`supportsRunInTerminalRequest`、`supportsVariablePaging`、`supportsCancelRequest`  
Adapter 常见：`supportsConfigurationDoneRequest`、`supportsConditionalBreakpoints`、`supportsEvaluateForHovers`

### 3. Launch Sequencing：规范强制时序

这是读规范时最容易踩坑的一章。正确顺序：

1. Client → `initialize` → Adapter 回 `InitializeResponse`（含 capabilities）
2. Client → `launch` 或 `attach`（可早于断点配置，但 Adapter **不应**在此时完成响应）
3. Adapter → `initialized` **event**（宣布可以收断点了）
4. Client → `setBreakpoints` / `setFunctionBreakpoints` / `setExceptionBreakpoints`（零条或多条）
5. Client → `configurationDone`
6. Adapter → 完成 `launch`/`attach` 的 **Response**，程序真正跑起来

违反「在 `initialized` 之前不发断点配置」会导致部分 Adapter 丢断点。

### 4. 暂停态瀑布：Types 章的对象引用

程序暂停时，Client 按规范建议的顺序拉状态：

```
threads → stackTrace → scopes → variables → variables（子字段）
```

`StackFrame` 不内嵌变量列表，而通过 `variablesReference`（正整数句柄）延迟获取。规范约定：与**当前暂停态**绑定的引用在 **continue 后失效**；`evaluate` 与 `output` 里的引用应尽量跨暂停保留。

### 5. setBreakpoints：全量语义

对**单个源文件**一次传**全部**断点（非增量）。Adapter 典型实现：清除该文件旧断点 → 应用新列表 → 在 Response 里返回**实际生效**的断点（位置可能被调试器微调）。暂时无法验证时设 `verified: false`，之后用 `breakpoint` **event** 更新 UI。

### 6. Reverse Requests

少数操作必须由 Client 代劳（如在集成终端里启动被调试进程）。Adapter 发 `runInTerminal` **Reverse Request**，Client 执行后回 Response。是否支持由 Client 在 `initialize` 里声明 `supportsRunInTerminalRequest`。

## 代码示例

### 示例 1：按规范手工组帧 — `initialize` 请求

下面是一条符合 Base Protocol 的完整字节流（`\r\n` 为 CRLF）。Client 会话第一条消息通常是 `initialize`：

```text
Content-Length: 156

{
  "seq": 1,
  "type": "request",
  "command": "initialize",
  "arguments": {
    "clientID": "study-note",
    "clientName": "Study DAP Client",
    "adapterID": "example",
    "pathFormat": "path",
    "linesStartAt1": true,
    "columnsStartAt1": true,
    "supportsVariableType": true,
    "supportsRunInTerminalRequest": true
  }
}
```

Adapter 必须回 `InitializeResponse`，并在 `body` 里声明能力，例如：

```json
{
  "seq": 2,
  "type": "response",
  "request_seq": 1,
  "success": true,
  "command": "initialize",
  "body": {
    "supportsConfigurationDoneRequest": true,
    "supportsSetVariable": true,
    "supportsConditionalBreakpoints": true
  }
}
```

随后 Adapter 发 `initialized` event（无 request_seq）：

```json
{
  "seq": 3,
  "type": "event",
  "event": "initialized"
}
```

读规范时对照 [Initialize Request](https://microsoft.github.io/debug-adapter-protocol/specification#Requests_Initialize) 与 [Capabilities](https://microsoft.github.io/debug-adapter-protocol/specification#Types_Capabilities) 两节，可核对每个字段是否实现。

### 示例 2：Python 最小 Debug Adapter — 处理 `stopped` 与 `stackTrace`

用官方 [`debugpy`](https://github.com/microsoft/debugpy) 时，Adapter 已写好；下面展示**自己读规范实现时**要覆盖的最小 Request 处理逻辑（伪代码，突出规范字段）：

```python
import json
import sys

def send(msg: dict) -> None:
    body = json.dumps(msg, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(f"Content-Length: {len(body)}\r\n\r\n".encode("ascii"))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()

seq = 0

def reply(request: dict, body: dict | None = None, success: bool = True) -> None:
    global seq
    seq += 1
    send({
        "seq": seq,
        "type": "response",
        "request_seq": request["seq"],
        "success": success,
        "command": request["command"],
        "body": body or {},
    })

while True:
    headers = {}
    while True:
        line = sys.stdin.buffer.readline().decode("ascii").strip()
        if not line:
            break
        k, v = line.split(": ", 1)
        headers[k] = v
    length = int(headers["Content-Length"])
    msg = json.loads(sys.stdin.buffer.read(length))

    if msg["type"] == "request" and msg["command"] == "initialize":
        reply(msg, {
            "supportsConfigurationDoneRequest": True,
        })
        send({"seq": 1, "type": "event", "event": "initialized"})

    elif msg["command"] == "configurationDone":
        reply(msg)

    elif msg["command"] == "launch":
        # 规范：configurationDone 之后才能完成 launch response
        reply(msg)
        send({
            "seq": 2,
            "type": "event",
            "event": "stopped",
            "body": {"reason": "entry", "threadId": 1},
        })

    elif msg["command"] == "threads":
        reply(msg, {"threads": [{"id": 1, "name": "Main Thread"}]})

    elif msg["command"] == "stackTrace":
        reply(msg, {
            "stackFrames": [{
                "id": 1000,
                "name": "main",
                "line": 1,
                "column": 1,
                "source": {"path": "/tmp/demo.py", "name": "demo.py"},
            }],
            "totalFrames": 1,
        })
```

真实 Adapter 还需实现 `disconnect`、`setBreakpoints`、`scopes`、`variables` 等；[官方 test suite](https://github.com/microsoft/debug-adapter-protocol/tree/main/test-suite) 按规范逐项验收。

### 示例 3：VS Code `launch.json` — Client 如何引用规范外的扩展字段

规范**不固定** `launch`/`attach` 的 `arguments` 字段（因语言而异）。VS Code 通过扩展的 `package.json` 贡献 JSON Schema；`launch.json` 里多出来的键由 Adapter 自行解析，例如调试 Python：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Current File",
      "type": "debugpy",
      "request": "launch",
      "program": "${file}",
      "console": "integratedTerminal",
      "justMyCode": true
    }
  ]
}
```

`type: "debugpy"` 告诉 Client 启动哪个 Adapter 可执行文件；`program`、`justMyCode` 等**不在 DAP 规范正文里**，但会原样放进 `launch` request 的 `arguments`，Adapter 按自己的 schema 读取。读规范时要区分：**wire 协议是统一的，launch 参数 schema 是 per-adapter 的**。

## 规范中的关键 Request / Event 速查

| 名称 | 类型 | 规范章节要点 |
|------|------|----------------|
| `initialize` | Request | 会话第一步；交换 capabilities |
| `launch` / `attach` | Request | 启动模式；arguments 由 Adapter 定义 |
| `configurationDone` | Request | 断点配置结束标志 |
| `setBreakpoints` | Request | 单文件全量断点；返回 verified 状态 |
| `continue` / `next` / `stepIn` / `stepOut` | Request | 均需 `threadId` |
| `threads` | Request | 即使单线程也必须返回至少一个 thread |
| `stackTrace` | Request | `startFrame`/`levels` 支持分页 |
| `scopes` / `variables` | Request | 通过 `variablesReference` 间接访问 |
| `evaluate` | Request | 调试控制台 / hover 求值 |
| `disconnect` / `terminate` | Request | launch 与 attach 结束语义不同 |
| `initialized` | Event | 触发断点配置阶段 |
| `stopped` | Event | `reason`: entry, breakpoint, exception, pause… |
| `output` | Event | stdout/stderr 到调试控制台 |
| `terminated` | Event | 会话结束；可带 `restart` 提示 |

## 与姊妹协议 LSP 的对比

| 维度 | LSP Specification | DAP Specification |
|------|-------------------|-------------------|
| 解决问题 | 编辑期智能（补全、诊断） | 运行期调试（断点、单步、变量） |
| JSON 形态 | JSON-RPC 2.0（`method` + `id`） | 自定义（`command` + `seq`） |
| 传输帧 | Content-Length + JSON | 相同 |
| 版本 | 3.17 等显式版本 | 永久 1.x + capabilities |
| 反向调用 | 较少 | `runInTerminal` 等 Reverse Requests |

同一工具链常成对出现：Python 用 Pylance（LSP）+ debugpy（DAP）；Go 用 gopls（LSP）+ Delve DAP（DAP）。

## 如何系统阅读这份规范

1. **先读 [Overview](https://microsoft.github.io/debug-adapter-protocol/overview)** — 序列图比直接啃 Types 更友好
2. **精读 Base Protocol + Initialize + Launch Sequencing** — 时序错了后面全错
3. **按需查 Events / Requests** — 实现断点只读 `setBreakpoints` 与 `breakpoint` event 两节
4. **对照 [debugProtocol.json](https://microsoft.github.io/debug-adapter-protocol/debugProtocol.json)** — 代码生成、校验测试
5. **跑 [test-suite](https://github.com/microsoft/debug-adapter-protocol/tree/main/test-suite)** — 用机器检查是否合规范

## 常见误区

1. **把 Specification 当成 GDB 手册** — 规范描述的是 Client↔Adapter 消息，不是底层调试器 API
2. **在 `initialized` 之前调用 `setBreakpoints`** — 违反 Launch Sequencing
3. **对 `setBreakpoints` 做增量更新** — 规范要求每文件全量替换
4. **continue 后复用旧的 `variablesReference`** — 暂停态引用已失效
5. **认为 `launch` 参数在规范里有统一列表** — 只有 `command` 统一，`arguments` 由 Adapter 文档定义

## 延伸阅读

- [DAP Overview（架构与生命周期）](https://microsoft.github.io/debug-adapter-protocol/overview)
- [DAP Changelog](https://microsoft.github.io/debug-adapter-protocol/changelog) — 每个 capability 何时加入
- [VS Code Debugger Extension 指南](https://code.visualstudio.com/api/extension-guides/debugger-extension)
- [@vscode/debugadapter npm](https://www.npmjs.com/package/@vscode/debugadapter) — Node.js 实现规范消息的 SDK
- 本库姊妹笔记：[Debug Adapter Protocol 总览](./debug-adapter-protocol.md)、[Language Server Protocol 规范](./language-server-protocol-spec.md)

---

**一句话总结**：DAP Specification 是「调试遥控器」与「调试适配器」之间的合同——用 Content-Length 帧传递 JSON，用 capabilities 扩展功能，用严格的 Launch Sequencing 和 `variablesReference` 生命周期保证所有 IDE 共享同一套调试体验；零基础读者应先掌握时序与三种消息类型，再按实现需求查阅具体 Request/Event 章节。
