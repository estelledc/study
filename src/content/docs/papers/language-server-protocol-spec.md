---
title: Language Server Protocol — 让编辑器共享同一套「语言大脑」的 USB 协议
来源: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

## 是什么

**Language Server Protocol（LSP，语言服务器协议）** 是 Microsoft 牵头维护的一份开放规范，定义了**编辑器/IDE（客户端）** 与**语言分析服务（服务端）** 之间如何通过 **JSON-RPC 2.0** 交换消息。当前稳定版本为 **3.17**（2022-05-10 发布）。

日常类比：你去不同国家的医院看病，以前每家医院有自己的病历格式——北京一套、东京一套、柏林一套，换医院就得重新建档。LSP 相当于**国际通用的电子病历接口**：VS Code、Neovim、Helix、Zed、Emacs 都是「医院前台」，Rust Analyzer、Pyright、gopls、clangd 都是「专科医生」。前台只负责展示和收集症状（光标位置、打开的文档），医生只负责诊断（补全、跳转、诊断），双方说同一种「病历语言」，所以**写一次语言服务，所有编辑器都能用**。

技术定义：LSP 在 JSON-RPC 之上定义三类消息——**Request**（要回复）、**Response**（回复结果）、**Notification**（单向通知，无 id）。消息按功能分成 **Lifecycle**（初始化）、**Document Synchronization**（文档同步）、**Language Features**（补全/跳转/诊断等）、**Workspace Features**（全项目符号搜索）、**Window Features**（进度条/日志）几大章。规范用 TypeScript interface 描述所有数据结构，但**不要求**实现语言必须是 TypeScript。

## 为什么重要

不理解 LSP，下面这些事都没法解释：

- 为什么 VS Code 装一个 Rust 插件后，Neovim 用 `rust-analyzer` 也能得到几乎相同的体验——底层是同一套协议，不是同一套代码
- 为什么 `gopls`、`pyright`、`typescript-language-server` 都能独立进程运行——编辑器通过 stdio / socket 跟子进程说话，崩溃不会拖垮整个 IDE
- 为什么 Cursor / Zed 能「复用 VS Code 生态的语言服务」——它们实现的是 LSP **客户端**，不是重新实现每种语言的编译器前端
- 为什么 MCP 规范里常提到 LSP——MCP 的设计直接借鉴了 LSP 的 **capability negotiation**（能力协商）模式

## 核心概念

LSP 3.17 规范可以拆成 **五层**，由下往上：

### 1. Base Protocol（传输 + 帧格式）

JSON-RPC 消息前面必须带 **LSP 报文头**（类似 HTTP header）：

```
Content-Length: 119\r\n
\r\n
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
```

- `Content-Length`：后面 JSON body 的字节数（UTF-8）
- 默认 `Content-Type`：`application/vscode-jsonrpc; charset=utf-8`
- 传输通道常见为 **stdio**（子进程）、**socket**、**named pipe**；规范**不支持 JSON-RPC batch**（不能一次发多个 request）

三种消息形态：

| 类型 | 有 `id`？ | 需要回复？ | 典型用途 |
|------|-----------|------------|----------|
| Request | 是 | 是 | `textDocument/completion` |
| Response | 是（匹配 request） | — | 返回补全列表 |
| Notification | 否 | 否 | `textDocument/didChange` |

### 2. 基本数据结构

规范里几乎所有语言功能都围绕 **`[TextDocumentIdentifier, Position]`** 这一元组：

```typescript
// 规范中的 Position：0-based，line 是行号，character 是 UTF-16 码元偏移
interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface TextDocumentItem {
  uri: string;      // 如 file:///path/to/main.rs
  languageId: string; // 如 "rust"
  version: number;    // 文档版本，每次变更递增
  text: string;       // 全文（didOpen 时发送）
}
```

**注意**：`character` 是 **UTF-16 code unit** 偏移，不是字节数也不是 Unicode 码点数。处理 emoji 或多字节字符时，客户端和服务端必须一致，否则跳转/补全会错位。

### 3. Lifecycle（生命周期）

连接建立后的固定顺序：

```
Client                          Server
  |---- initialize (request) ---->|
  |<---- InitializeResult --------|  （含 server capabilities）
  |---- initialized (notify) ---->|
  |---- 其他 request/notify ----->|
```

- **`initialize`**：交换 `ClientCapabilities` 与 `ServerCapabilities`，协商双方支持哪些功能
- **`initialized`**：客户端通知「我准备好了」；服务端可在此后 **动态注册** 能力（`client/registerCapability`）
- **`shutdown` / `exit`**：优雅关闭

服务端在 `initialize` 响应里声明例如 `completionProvider`、`definitionProvider`；客户端在请求里声明例如 `textDocument.completion.contextSupport`。

### 4. Document Synchronization（文档同步）

客户端**必须**实现（不可 opt-out）的三条通知：

| 方法 | 方向 | 含义 |
|------|------|------|
| `textDocument/didOpen` | C→S | 打开文档，附带全文 |
| `textDocument/didChange` | C→S | 文档变更（**Full** 或 **Incremental** 同步） |
| `textDocument/didClose` | C→S | 关闭文档 |

服务端要么**三者全支持**，要么**三者全不支持**——不能只做 `didOpen` 不做 `didChange`。

增量同步示例（客户端只发变更片段）：

```json
{
  "jsonrpc": "2.0",
  "method": "textDocument/didChange",
  "params": {
    "textDocument": { "uri": "file:///proj/main.ts", "version": 2 },
    "contentChanges": [
      {
        "range": {
          "start": { "line": 10, "character": 4 },
          "end": { "line": 10, "character": 4 }
        },
        "text": "console.log('hi');\n"
      }
    ]
  }
}
```

### 5. Language Features（语言功能）

在 `[document, position]` 上执行的核心能力，3.17 规范包括但不限于：

- **Syntactic**：`completion`、`signatureHelp`、`hover`、`documentHighlight`
- **Navigation**：`definition`、`typeDefinition`、`implementation`、`references`
- **Semantic**：`documentSymbol`、`codeAction`、`codeLens`、`documentLink`
- **Diagnostic**：`publishDiagnostics`（notification，服务端主动推）
- **Formatting**：`formatting`、`rangeFormatting`、`onTypeFormatting`
- **Refactoring**：`rename`、`prepareRename`
- **3.17 新增**：`inlayHint`（类型/参数名内联提示）、`typeHierarchy`、`inlineValue` 等

Workspace 级功能如 `workspace/symbol`（全项目搜索符号）、`workspace/executeCommand`（执行重构命令）在单独章节定义。

### 6. Capabilities（能力协商）

LSP 的核心设计哲学：**不假设对方支持一切**。双方只在 `initialize` 时交换能力表；若客户端没声明 `textDocument.completion.contextSupport`，服务端就不该依赖 `CompletionContext` 字段。

动态注册示例（服务端在 `initialized` 之后注册 `willSaveWaitUntil`）：

```json
{
  "jsonrpc": "2.0",
  "method": "client/registerCapability",
  "params": {
    "registrations": [{
      "id": "79eee87c-c409-4664-8102-e03263673f6f",
      "method": "textDocument/willSaveWaitUntil",
      "registerOptions": {
        "documentSelector": [{ "language": "typescript" }]
      }
    }]
  }
}
```

## 实践案例

### 案例 1：客户端发起「跳转到定义」

用户在第 3 行第 12 列点击「Go to Definition」，客户端发送：

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "textDocument/definition",
  "params": {
    "textDocument": {
      "uri": "file:///home/user/src/main.cpp"
    },
    "position": {
      "line": 3,
      "character": 12
    }
  }
}
```

服务端返回 `Location` 或 `LocationLink[]`（3.14+，需客户端声明 `linkSupport`）：

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "result": [{
    "uri": "file:///home/user/include/util.hpp",
    "range": {
      "start": { "line": 15, "character": 0 },
      "end": { "line": 15, "character": 20 }
    }
  }]
}
```

LSP **故意不传输 AST 或类型图**——只传编辑器能直接用的 URI + Range。语言领域的复杂结构留在服务端进程内部，协议保持「薄」。

### 案例 2：用 TypeScript 写一个最小 Language Server

下面是一个能响应 `initialize` 和 `textDocument/completion` 的极简骨架（基于官方 `vscode-languageserver` 库）：

```typescript
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false }
    }
  };
});

connection.onCompletion((): CompletionItem[] => {
  return [
    {
      label: 'helloLsp',
      kind: CompletionItemKind.Function,
      detail: 'Demo completion from minimal LSP server'
    }
  ];
});

documents.listen(connection);
connection.listen();
```

编辑器用 stdio 启动这个进程后，库会自动处理 `Content-Length` 帧、`didOpen`/`didChange` 同步、以及 capability 握手——手写时最容易错的就是**帧格式**和**UTF-16 偏移**。

### 案例 3：诊断推送（publishDiagnostics）

与 request/response 不同，诊断是服务端**主动推送**的 notification：

```json
{
  "jsonrpc": "2.0",
  "method": "textDocument/publishDiagnostics",
  "params": {
    "uri": "file:///proj/app.py",
    "diagnostics": [{
      "range": {
        "start": { "line": 4, "character": 0 },
        "end": { "line": 4, "character": 10 }
      },
      "severity": 1,
      "code": "E0001",
      "source": "pyright",
      "message": "Undefined name 'foo'"
    }]
  }
}
```

客户端收到后在 gutter 画红波浪线。每次分析完成可全量替换该文档的 diagnostics 列表。

## 踩过的坑

1. **stdout 不能打 debug log**：stdio 传输时 stdout 专用于 LSP 帧，任何 `console.log` 到 stdout 都会破坏 `Content-Length` 解析。日志必须走 **stderr**。

2. **UTF-16 character 偏移**：规范写死用 UTF-16 code unit。Rust/Python 里按字节或 Unicode scalar 算列号，和 VS Code 不一致时，补全范围会「偏一格」。

3. **didOpen/didChange/didClose 必须成套**：服务端不能声明只同步 open 不同步 change；客户端也不能声称支持 LSP 却跳过 `didClose`。

4. **capability 是双向契约**：服务端发了客户端不认识的 capability 字段，客户端应**忽略**而非报错；但服务端若用了客户端未声明的可选字段，行为未定义。

5. **不支持 batch**：不能在一个 JSON-RPC batch 里塞多个 request。高并发场景要排队或 multiplex 多个连接。

6. **3.17 的 WorkspaceSymbol 可延迟 resolve**：若服务端返回不带 range 的 `WorkspaceSymbol`，必须等客户端声明 `workspace.symbol.resolveSupport`，否则只能返回完整 `Location`。

## 适用 vs 不适用场景

**适用**：

- 为一种编程语言提供 IDE 级功能，且希望 **VS Code / Neovim / Emacs / Zed 等多客户端复用**
- 语言分析很重（类型检查、索引），需要**独立进程**隔离崩溃和 CPU
- 团队已有编译器/分析器，只想加一层「编辑器适配」而非重写每个 IDE 插件

**不适用**：

- 只做单一编辑器、单一语言的深度集成 → 直接调编辑器原生 API 可能更简单（如 VS Code Extension API）
- 需要**双向流式**大 payload（传整棵 AST）→ LSP 故意保持薄，应走自定义 RPC 或 LSIF
- 亚毫秒级延迟的键入反馈 → JSON-RPC + 进程边界有固定开销；极端场景可能 in-process
- 非文本文档（纯图形、Notebook 单元格语义）→ 需 Notebook Document Sync 扩展，比 plain text 复杂一个数量级

## 历史小故事（可跳过）

- **2016**：Microsoft 在 TypeScript 语言服务经验上提出 LSP，目标统一 VS Code 与其他编辑器的能力接入方式。
- **2016-06-30**：发布 LSP 1.0；随后 Rust（RLS → rust-analyzer）、Go（gopls）、Python（Pylance/Pyright）等社区迅速跟进。
- **2022-05-10**：LSP **3.17** 定稿，新增 Inlay Hint、Type Hierarchy、Inline Value、Notebook 同步增强等。
- **LSIF**（Language Server Index Format）：LSP 负责「在线交互」，LSIF 负责「离线预计算索引」——大仓库 CI 里先跑 LSIF，IDE 再消费，与 LSP 互补。
- **类比链**：LSP 之于编辑器 ≈ **MCP 之于 LLM 客户端**——都是 JSON-RPC + capability negotiation，让「工具」与「宿主」解耦。

## 学到什么

1. **协议故意停留在编辑器抽象层**：传 URI、Range、Diagnostic，不传 AST——降低客户端负担，把复杂度关在 language server 进程里。
2. **能力协商先于功能调用**：`initialize` 是双向契约，不是服务端单方面「报菜单」；动态注册让功能可以按需启用。
3. **文档同步是硬约束**：Language Features 再聪明，如果 `didChange` 版本和全文不一致，补全和诊断全是错的。
4. **Notification 与 Request 分工明确**：诊断、日志、进度用 notification 推；需要结果的操作（completion、definition）用 request。
5. **写一次，到处跑** 的真正成本在「测试矩阵」——同一 server 要对多种 client 的 capability 组合做兼容，而不是协议本身难写。

## 延伸阅读

- 规范全文：[LSP 3.17 Specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
- 官方实现指南：[Implementing Language Server](https://microsoft.github.io/language-server-protocol/overviews/server/)
- 官方客户端指南：[Implementing Language Client](https://microsoft.github.io/language-server-protocol/overviews/client/)
- 参考库：[vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)（Node 服务端/客户端 SDK）
- 规范仓库：[microsoft/language-server-protocol](https://github.com/microsoft/language-server-protocol)
- LSIF 规范：[Language Server Index Format](https://microsoft.github.io/language-server-protocol/specifications/lsif/0.6.0/specification/)

## 关联

- [[tree-sitter-2018]] —— Tree-sitter 提供增量 CST，常与 LSP 配合做语法高亮；LSP 管语义，Tree-sitter 管结构
- [[mcp-spec]] —— MCP 借鉴 LSP 的能力协商与 JSON-RPC 分层，可对比阅读
- [[ast-grep]] —— 基于 Tree-sitter 的结构化搜索，与 LSP 的 refactor 路径不同但场景相邻
- [[standard-ml]] —— 早期 IDE 多为单编辑器深度集成；LSP 代表「语言服务与 UI 分离」的现代路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

