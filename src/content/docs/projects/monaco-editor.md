---
title: monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
来源: 'https://github.com/microsoft/monaco-editor'
日期: 2026-05-30
分类: projects / 前端
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/microsoft/monaco-editor
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 13f0c872dcf352815cc28d92dfff496c9839ea5c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.56.0
---

## 是什么

Monaco Editor 是 Microsoft 把 **VS Code 的代码编辑器抽成网页 SDK** 后的包装包。日常类比：不是仿制发动机，而是把同一颗引擎装进可以挂到任意 DOM 节点的外壳。

你写：

```js
import * as monaco from 'monaco-editor'
monaco.editor.create(document.getElementById('container'), {
  value: 'function hello() { return 42; }',
  language: 'typescript',
})
```

`create` 来自 vscode standalone API：先 `StandaloneServices.initialize`，再实例化 `StandaloneEditor`。页面上出现的是带模型、选区、补全/hover 挂点的编辑器，不是高级 textarea。GitHub Codespaces、StackBlitz 一类产品用的就是这层。固定 0.56.0 的包装仓只 re-export `monaco-editor-core` 的 `editor.api`，内核实现绑在 `vscodeRef` `f487add...`。

## 为什么重要

不理解这层包装，下面这些事会对不上：

- 为什么网页里写 TypeScript 能看到诊断，却仍不是完整桌面 LSP
- 为什么同一套 `ITextModel` / Provider 协议能同时服务 VS Code 与浏览器
- 为什么默认 `import 'monaco-editor'` 会带上整组 feature 与四个语言 worker
- 为什么不配 `MonacoEnvironment.getWorker` / `getWorkerUrl`（或 bundler 的 `?worker`）会直接抛错，而不是“降级成 textarea”

## 核心要点

0.56.0 的主链可以拆成四步：

1. **真理源是 model，不是 DOM**：`TextModel` 用 `uri` 标识、`_versionId` 从 1 递增。缓冲区是 `PieceTreeTextBuffer`。补全、hover、worker 同步都按 URI；过期结果靠版本/token 丢弃。

2. **包装仓默认全量注册**：`src/index.ts` side-effect 导入全部 `src/features/register.all`（find、suggest、hover、folding、gpu…）以及 css / html / json / typescript 语言服务。每个 feature 只是一行对 `monaco-editor-core` 贡献点的 import。

3. **语言服务跑在 Web Worker**：`createWebWorker` 优先问 `MonacoEnvironment.getWorker` / `getWorkerUrl`，否则用调用方 `createWorker`（TS 用 `new URL('./ts.worker?esm', import.meta.url)`）。未配置就抛错。这是内置语言服务，不是完整 LSP。

4. **超大文件有显式降级**：`largeFileOptimizations` 默认开。超过 20MB 或 30 万行关闭 tokenization；超过 50MB 停止向 worker 同步；256M 字符视为 heap 危险操作。单行 ≥10000 字符走 `isDominatedByLongLines`。旧文写的 10MB 阈值已过时。

## 实践示例

### 案例 1：最小嵌入

```js
import * as monaco from 'monaco-editor'
monaco.editor.create(document.getElementById('root'), {
  value: '// 写点什么',
  language: 'javascript',
  theme: 'vs-dark',
})
```

**逐部分**：`create(container, options)` 读取容器尺寸并挂上 standalone 编辑器；`language` 决定启用哪套内置 worker（未配 environment 会失败）；`theme` 只改配色，不改文本模型。

### 案例 2：读真值必须走 model

```js
const editor = monaco.editor.create(el, { value: '', language: 'json' })
editor.onDidChangeModelContent(() => {
  console.log(editor.getValue())
})
```

DOM 只渲染可见行。`getValue()` 从 PieceTree 拼出完整文本；事件也挂在 model 上，避免 IME 中间态误触发。

### 案例 3：注册补全 Provider

```js
monaco.languages.registerCompletionItemProvider('markdown', {
  triggerCharacters: ['/'],
  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position)
    return {
      suggestions: [{
        label: 'TODO',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: 'TODO: ${1:描述}',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                 startColumn: word.startColumn, endColumn: word.endColumn },
      }],
    }
  },
})
```

这是与桌面 VS Code 同形的扩展点。多个 Provider 的结果由 suggest UI 合并。要接外部语言服务器，0.56.0 默认入口还导出同仓 `@vscode/monaco-lsp-client`（`lsp`），不再只有仓外的 monaco-languageclient。

## 踩过的坑

1. **不配 worker 入口会失败**：`createWebWorker` 在没有 `MonacoEnvironment` 且没有 `createWorker` 时抛错。webpack 可用仓内 `monaco-editor-webpack-plugin@7.1.1`；Vite 用 `?worker`。AMD worker 入口已标 deprecated，仍被该 plugin 使用。

2. **`editor.dispose()` 不等于释放 model**：编辑器可以共享 model；只 dispose widget 时 URI 仍被占用。SPA 切页要同时 `model.dispose()`。

3. **超大文件阈值已变**：tokenization 降级是 20MB / 30 万行，不是旧笔记里的 10MB。单行 1 万字符走另一条 long-line 路径。

4. **默认入口不是“最小核”**：`import 'monaco-editor'` 会注册整组 feature。要瘦身必须按文档自己选 feature / language，并实测产物；本文未测 bundle。

## 适用 vs 不适用场景

**适用**：
- 浏览器里要 IDE 级编辑（补全、hover、诊断、多光标）
- 希望和 VS Code 共享 Provider / model 协议
- 能接受默认全量 feature，并配置 worker 打包

**不适用**：
- 富文本（标题、图片、块）→ [[lexical]] / [[prosemirror]]
- 只要语法高亮、不要编辑 → [[shiki]] / highlight.js
- 极致小体积且尚未做目标 bundler 实测 → 先比 [[codemirror]] 的按需扩展，不要引用未绑定的 KB 数字
- 需要完整工作区 LSP 却只当内置 TS/JSON/CSS/HTML worker 已经够用

## 固定版本边界

- 本文绑定 `microsoft/monaco-editor@13f0c872...`，即 tag `v0.56.0`；`package.json` 自报 `0.56.0`，`vscodeRef` 为 `f487add297079a02eb836810185b165e50cadabc`。
- 内核来自 `monaco-editor-core@0.56.0-dev-20260625`；公开 API 在 core 的 `editor.api`，PieceTree / version / standalone `create` 在该 vscode 提交。
- 默认入口导出 `css` / `html` / `json` / `typescript` 与 `lsp`（`@vscode/monaco-lsp-client@0.1.0`）。
- 本文未安装依赖、未跑 worker/smoke、未测 bundle 或性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **包装仓和内核仓要分开读**——npm 包名是 monaco-editor，编辑器合同在 vscodeRef
2. **URI + version 是跨线程结果的过期协议**，比“等 promise 回来再写 DOM”更简单
3. **默认全量 side-effect 注册**让开箱体验完整，也让“最小安装”变成打包问题
4. **降级阈值会随 vscode 提交移动**——不能把旧 blog 的 10MB 写成当前事实

## 应用型自测

1. 只调用 `editor.dispose()`，页面上的 model URI 一定被释放吗？
2. 一个 25MB 的文件，在默认 `largeFileOptimizations` 下还会做 tokenization 吗？
3. 不设置 `MonacoEnvironment`、也不传 `createWorker` 时，TS 语言服务会静默降级到主线程吗？

检查点：

1. 不一定。model 可被共享，需要单独 `model.dispose()` 才释放 URI。
2. 不会。超过 20MB 或 30 万行会关闭 tokenization。
3. 不会。`createWebWorker` 直接抛错，要求定义 `getWorker` / `getWorkerUrl` 或提供 `createWorker`。

## 延伸阅读

- 官方 playground：[microsoft.github.io/monaco-editor](https://microsoft.github.io/monaco-editor/)
- 固定包装仓：[microsoft/monaco-editor](https://github.com/microsoft/monaco-editor) —— 本文绑定 `13f0c872dcf352815cc28d92dfff496c9839ea5c`
- 固定内核：[microsoft/vscode](https://github.com/microsoft/vscode) —— `vscodeRef` `f487add297079a02eb836810185b165e50cadabc`
- ESM 集成说明：仓内 `docs/integrate-esm.md`
- [[codemirror]] —— 同领域的不可变 state + 按需扩展对照

## 关联

- [[codemirror]] —— 小核心 + Facet，与 Monaco 的 vscode 整块包装对照
- [[lexical]] —— 富文本，不是代码模型
- [[prosemirror]] —— 结构化文档，不是纯文本 + 语法服务
- [[markdown-it]] —— 常和 Monaco 搭配做预览
- [[typescript-compiler]] —— TS worker 内嵌的是 TypeScript 语言服务，不是完整 tsserver 工作区

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[code-server]] —— code-server — 浏览器里的 VS Code
- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[lapce]] —— Lapce — 把编辑器搬到 GPU 上的 Rust 实验
- [[notepad-plus-plus]] —— Notepad++ — 比记事本多两个加号的 Windows 编辑器
- [[openvscode-server]] —— OpenVSCode Server：把上游 VS Code 跑进浏览器
- [[shiki]] —— shiki — 把 VS Code 那套染色搬到网页上
- [[theia]] —— Eclipse Theia — 可定制的云端与桌面 IDE 框架
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳
- [[vscodium]] —— VSCodium — 去微软遥测的 VS Code 干净构建
