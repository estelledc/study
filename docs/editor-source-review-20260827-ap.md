# Browser code editor source review

> 用途：记录 monaco-editor、CodeMirror 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：AP
- evidence：GitHub / npm / haverbeke.berlin metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、worker、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## monaco-editor

- canonical source：`https://github.com/microsoft/monaco-editor`
- revision：`13f0c872dcf352815cc28d92dfff496c9839ea5c`
- package：`monaco-editor@0.56.0`
- vscodeRef：`f487add297079a02eb836810185b165e50cadabc`（`package.json` 字段，2026-06-25 vscode commit）
- companion package：`monaco-editor-core@0.56.0-dev-20260625`（devDependency，编辑器内核从该 vscode 提交抽出）
- inspected：
  - `package.json`
  - `README.md`
  - `docs/integrate-esm.md`
  - `src/index.ts`
  - `src/editor.ts`
  - `src/features/register.all.ts`
  - `src/features/codeEditor/register.js`
  - `src/features/longLinesHelper/register.js`
  - `src/internal/common/workers.ts`
  - `src/languages/features/register.all.ts`
  - `src/languages/features/typescript/workerManager.ts`
  - `src/languages/features/typescript/ts.worker.ts`
  - `src/languages/features/typescript/register.ts`
  - `src/deprecated/editor/editor.worker.ts`
  - `monaco-lsp-client/package.json`
  - `webpack-plugin/package.json`
  - vscode `@f487add...`：`src/vs/editor/standalone/browser/standaloneEditor.ts`
  - vscode `@f487add...`：`src/vs/editor/standalone/browser/standaloneCodeEditor.ts`（`createTextModel`）
  - vscode `@f487add...`：`src/vs/editor/common/model/textModel.ts`
  - vscode `@f487add...`：`src/vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBuffer.ts`
  - vscode `@f487add...`：`src/vs/editor/common/cursor/cursorTypeOperations.ts`
  - vscode `@f487add...`：`src/vs/editor/common/config/editorOptions.ts`（`stopRenderingLineAfter`）
- observed：
  - npm / GitHub tag `v0.56.0` 都指向 `13f0c872...`，该提交 `package.json` 自报 `0.56.0`；npm 未提供 `gitHead`；
  - `src/editor.ts` 只 re-export `monaco-editor-core/esm/vs/editor/editor.api`；默认入口 `src/index.ts` 再 side-effect 导入 `monaco-editor-core`、全部 `src/features/register.all` 与 css/html/json/typescript 语言服务；
  - `monaco.editor.create(dom, options)` 来自 vscode standalone API：`StandaloneServices.initialize` 后 `createInstance(StandaloneEditor, domElement, options)`；
  - 文本真理源是 `TextModel`：`uri` 标识模型，`_versionId` 从 1 起、每次编辑 `_increaseVersionId()`；缓冲区是 `PieceTreeTextBuffer`；
  - 语言服务 worker 走 `createWebWorker`：优先 `MonacoEnvironment.getWorker` / `getWorkerUrl`，否则用调用方 `createWorker`（TS worker 用 `new URL('./ts.worker?esm', import.meta.url)`）；未配置时抛必须定义 environment 的错误；
  - 内置语言服务仍是 css / html / json / typescript 四套；`WorkerManager` 用单调 token 丢弃过期的 extraLibs 更新，并用 `withSyncedResources` 按 model URI 同步；
  - 超大文件阈值（`largeFileOptimizations` 默认开启）为 20MB 或 30 万行关闭 tokenization，50MB 停止向 worker 同步，256M 字符视为 heap 危险操作；单行 ≥10000 字符走 `isDominatedByLongLines`；
  - AMD worker 入口标 `@deprecated`，仍被 webpack plugin 使用；同仓 `monaco-lsp-client` 发布名为 `@vscode/monaco-lsp-client@0.1.0`，默认入口以 `lsp` 再导出；
  - `monaco-editor-webpack-plugin@7.1.1` 仍在仓内，文档称 community authored。
- provenance note：
  - 公开 API 与 PieceTree / version / standalone `create` 的实现不在 monaco-editor 包装仓，而在 `vscodeRef`；本审查同时阅读包装仓与该 vscode 提交的编辑器子树，不把未绑定的 vscode `main` 当成 0.56.0。

## CodeMirror

- canonical source：`https://code.haverbeke.berlin/codemirror/state`
- kernel revision：`cce2dd5aa4982596b5fb9a27f54a396dfe4f87b5`
- packages：
  - `@codemirror/state@6.7.1` → `cce2dd5aa4982596b5fb9a27f54a396dfe4f87b5`
  - `@codemirror/view@6.43.9` → `d4e1656e1a0060f562695df93cb1775c0cdee24f`
  - `@codemirror/language@6.12.4` → `89974ce5d39539ce6c5cfea5278443fa9381cbf2`
  - `@codemirror/commands@6.11.0` → `03580e550d63668ecae7148db9a05c274cd6fa01`
  - `@codemirror/autocomplete@6.20.3` → `66587500a48805a4f43c7f5216ffce131b52dec2`
- inspected：
  - `state/package.json`、`src/state.ts`、`src/facet.ts`、`src/transaction.ts`、`src/text.ts`、`test/test-facet.ts`
  - `view/package.json`、`src/editorview.ts`、`src/extension.ts`
  - `language/package.json`、`src/language.ts`
  - `commands/package.json`、`src/history.ts`
  - `autocomplete/package.json`
- observed：
  - `EditorState` 是不可变结构；更新必须 `update(...)` 产生 `Transaction`，再构造新 state，禁止直接改属性；
  - `EditorState.create` 把 `doc` 按 `lineSeparator` facet（默认 `/\r\n?|\n/`）切成 `Text`，选择区缺省为位置 0 的单光标；
  - `Facet` / `FacetProvider` 用模块级 `nextID++` 分配 id；`combine` 缺省时输出输入数组，`compare` / `compareInput` 缺省 `===`；`tabSize` 取第一个值，默认 4；
  - `Facet.compute(deps, get)` 只在声明的 `"doc"` / `"selection"` / field / facet 变化时重算；
  - `EditorView` 只绘制 viewport（加边距）；`contentDOM` 被观察，直接改 DOM 会被回滚，应 `dispatch` transaction；
  - `ViewUpdate` 聚合本次 transactions 的 `ChangeSet`，暴露 `docChanged`、`selectionSet`、`viewportChanged`；`ViewPlugin` 在同一条 update 流水线收到该对象；
  - `@codemirror/language` 把 Lezer `Tree` 放进 `Language.state` 这个 `StateField`；文档变化时用 tree fragments 增量重解析，未完成的解析只推进到旧 tree 终点与 viewport 的较大者；
  - `history()` 默认 `minDepth: 100`、`newGroupDelay: 500`，相邻且碰到已有变更范围的事务会合并；`Transaction.addToHistory === false` 不入栈。
- provenance note：
  - 2026-04-15 GitHub `codemirror/*` 仓库 archived，最后提交为 forwarding link；GitHub `codemirror/state@main` 停在 `@codemirror/state@6.6.0` / `9c801279...`，npm 当前 `gitHead` 在 GitHub 不可达；
  - 本审查绑定 haverbeke.berlin 上与 npm latest `gitHead` 一致的提交；autocomplete 的 forge HEAD (`75a3b6a1...`) 新于 npm `6.20.3` 的 `66587500...`，已 checkout 到 npm 提交，未把未发布 HEAD 写成 6.20.3。
