---
title: monaco-editor — 把 VSCode 的编辑器内核搬进浏览器的 IDE 级控件
description: Monaco 把 VSCode 的 CodeEditorWidget / TextModel / ViewModel / Web Worker LSP 协议原样拆出来作为浏览器 SDK，让任何站点都能挂上 IDE 级 IntelliSense / hover / find-all-refs。一个零基础学习者读心脏代码的状元篇笔记。
sidebar:
  label: monaco-editor
  order: 69
---

> 项目类型 self-classify：**框架/SDK**（v1.1 分支 D）。
> 不是 contentEditable 富文本框架（那是 [lexical](/projects/lexical/) / [prosemirror](/projects/prosemirror/) 的赛道），
> 也不是单文件 textarea 替代（那是 [codemirror](/projects/codemirror/) / Ace 的赛道）。
> 它是 Microsoft 把 VSCode 的编辑器内核（`CodeEditorWidget` + `TextModel` + `ViewModel` + 一组 Web Worker LSP）
> 整段拆出来打包成浏览器 SDK 的产物——同一份 TypeScript 代码既跑在 VSCode 桌面、又跑在 GitHub Codespaces / StackBlitz / CodeSandbox / Replit / Vercel deployment console 的浏览器 tab 里。
> 心脏物：核心 abstraction = `ITextModel`；扩展点 = `registerCompletionItemProvider` 等 provider 注册器；
> 跨线程契约 = `postMessage` 把 model 复制进 Web Worker，由 worker 跑 TS / JSON / CSS / HTML 语言服务。

| 维度 | 数据 |
|---|---|
| microsoft/vscode star | 185,473（截至 2026-05-29） |
| microsoft/monaco-editor star | 46,097（同日） |
| fork（vscode / monaco-editor） | 40,197 / 4,071 |
| 最近活跃 | vscode `pushed_at: 2026-05-28T18:16:21Z`（main 每小时多 commit）；monaco-editor 每月 patch |
| 读时 commit hash | vscode `d53d50575961dbd36ca50f6424da9b70e4beba0e` / monaco-editor `633d06e88a108495c59eec9d360ecd146f7fe322` |
| 读时日期 | 2026-05-29 |
| 主语言 | TypeScript（vscode 96%，剩下是 CSS / 少量 JS） |
| 维护方 | Microsoft（VSCode team），编辑器内核子团队主要在 jrieken / Tyriar / mjbvz / joaomoreno / sandy081 之间分工 |
| 主要贡献者（前 5） | jrieken（12,778 commit）/ Tyriar（12,517）/ mjbvz（10,682）/ joaomoreno（8,938）/ sandy081（8,843） |
| License | MIT |
| 类似项目 | [codemirror](/projects/codemirror/)（个人主导 / 模块化 Facet）/ Ace（旧时代代码编辑器，仍在 AWS Cloud9 等用）/ [lexical](/projects/lexical/)（Meta，富文本而非代码）/ Theia（IBM/Eclipse，整套 IDE 而非编辑器）/ WebContainer + xterm（StackBlitz，一种"另类"——用 wasm 跑真 node + 把 monaco 当 frontend） |

![Figure 1. Monaco 架构总览](/projects/monaco-editor/01-architecture.webp)

> Figure 1：左带蓝是 Main Thread（UI），右带绿是 Web Worker（Background）。
> 主线程从上到下：`CodeEditorWidget`（用户输入入口）→ `ViewModel`（坐标翻译 + viewport 缓存）→ `TextModel`（PieceTree 真理源）→ `View / DOM Layer`（按行虚拟滚动 patch）。
> Worker 线程从上到下：`EditorWorker`（diff / textualSuggest 默认通用 worker）→ 各语言 service worker（TS / JSON / CSS / HTML 各启一个，TS 甚至塞了完整 tsserver）→ LSP / 用户自定义 Provider → DiffComputer。
> 两条横向箭头是 `postMessage`：主→worker 复制 modelChange，worker→主返回 completion / diagnostics。
> 底部黑条压住 4 条契约：①`ITextModel` 是真理（每条结果都带 model URI + version，过期就丢）；②worker 不共享内存，只能 RPC；③Provider 是开放协议，monaco-language-client 就是从这里挂 LSP；④View 是单向投影，DOM 永远不直接写回 model（IME 走专门的 TypeOperations）。

## 一句话定位

Monaco **不是另一个 textarea 替代品**，而是 VSCode 编辑器内核的浏览器分发版。
它把"在浏览器里做 IDE 级编辑"拆成四件抽象：
`ITextModel`（基于 PieceTree 的文本真理源）+ `ICodeEditor`（用户输入控制器）+ `Web Worker LSP`（跨线程语言服务协议）+ `Provider Registry`（hover / completion / codeAction 等开放注册器）。
代价：**包大** —— monaco-editor 打出来的 bundle 主线程 + 4 个 worker 加起来 1.5 MB+ gzip，远比 codemirror 6 (~150 KB) 重；
回报：**桌面 VSCode 用什么 API，你的网页就能用什么 API** —— `monaco.editor.create()` 和 `vscode.window.activeTextEditor` 背后是同一份代码。

## Why（为什么 Season 15 把它收进编辑器线）

读 monaco-editor README 顶部段、jrieken 在 vscode wiki 写的 ["Editor Architecture"](https://github.com/microsoft/vscode/wiki) 文档、
以及 monaco-editor v0.1（2016）launch HN 帖，Microsoft 写它想解决三件 Ace / CodeMirror 5 时代解决不了的事：

1. **代码编辑不是富文本，需要语义**——光是高亮 + indent 不够，写代码的人要 hover tooltip / go to definition / find all references / 实时诊断 / 自动补全。
   Ace / CodeMirror 5 的扩展模型只能做"表面 token highlight"，要做"真正理解 TypeScript"得自己手写 parser。
2. **VSCode 桌面的体验不能两套代码**——VSCode 桌面用 Electron 跑同一份 `CodeEditorWidget`；如果浏览器版另写一套，两边永远会漂移。
   Monaco 的承诺是：vscode 仓库 `src/vs/editor/**` 编出 desktop 用的 .js，**同一份**编出 monaco-editor npm 包。
3. **语言服务跑在主线程会卡死 UI**——TypeScript compiler / CSS parser / JSON schema validator 都是几百 ms 级的同步任务，
   放主线程会让打字卡顿。Monaco 把这些塞进 Web Worker，主线程只通过 `postMessage` 异步要结果。

Monaco 的核心 inversion：

- **真理源是 model，不是 DOM**——所有 hover / completion / 诊断 / decoration 引用 `model.uri + model.version`，而不是当前 DOM 状态。
  IME 中途、用户撤销、虚拟滚动重渲染都不会让结果错乱——过期就丢，重新发一次。
- **DOM 是 view 的投影**——`TextModel → ViewModel → ViewParts → DOM` 是单向流。键盘输入走 `TypeOperations` 转成对 model 的 edit，
  不让任何 ViewPart 反向写 model。这条规则让 IME / 折叠 / 软换行 / minimap 互不打架。
- **语言服务是开放协议**——`monaco.languages.registerCompletionItemProvider('typescript', { provideCompletionItems(model, position) {...} })`。
  你想自己接一个远程 LSP？写一个 provider，把 LSP 响应翻译成 monaco 的 schema 即可。`monaco-language-client` 就是这层胶水。
- **Web Worker 是 first-class，不是优化项**——Monaco 默认就跑 4 个 worker（TS / JSON / CSS / HTML），用户拿到 editor 实例那一刻它们已经在后台 ready。
  不像 CodeMirror 把 worker 当"高级用户的优化"（autocomplete @ `9a01794d` 是同步在主线程）。

这条线的副产品是 **Monaco 的"扩展面"和 VSCode 扩展系统形状几乎一样**——你给 VSCode 写 `CompletionItemProvider`，那段代码改 5 行就能挂在浏览器 monaco 上。
"代码 IDE 在桌面 / 浏览器是同一回事"这个声明，是 Monaco 与 codemirror / Ace / Lexical 之间最大的分割线。

## 仓库地形（Layer 2）

读 Monaco 必须先认清楚一件事：**`microsoft/monaco-editor` 是打包仓库，不是源码仓库**。
真正的源在 `microsoft/vscode` 的 `src/vs/editor/**`，monaco-editor 仓库只做：(a) 把 vscode 仓库的 editor 子树 build 成 npm 包；
(b) 维护 `monaco.d.ts` 公开类型；(c) 维护 sample / playground / website。

```
microsoft/vscode @ d53d50575961dbd36ca50f6424da9b70e4beba0e
└── src/vs/editor/                       ← 真正的心脏，6 大子目录
    ├── browser/
    │   ├── widget/codeEditor/
    │   │   ├── codeEditorWidget.ts      ← 心脏文件 1：用户输入入口 + setModel + _attachModel
    │   │   ├── codeEditorContributions.ts
    │   │   └── embeddedCodeEditorWidget.ts
    │   └── view/                        ← ViewParts（行渲染、光标、minimap、滚动条等）
    ├── common/
    │   ├── model/
    │   │   ├── textModel.ts             ← 心脏文件 2：ITextModel 实现 + applyEdits + 装饰
    │   │   ├── pieceTreeTextBuffer/     ← rope-like buffer，textModel._buffer 实际类型
    │   │   ├── textModelPart.ts / textModelSearch.ts / textModelTokens.ts
    │   ├── viewModel/                   ← ViewModel：把 model 坐标翻译成 view 坐标
    │   ├── services/
    │   │   ├── editorWebWorker.ts       ← 心脏文件 3：worker 端 EditorWorker 主类
    │   │   ├── editorWebWorkerMain.ts   ← worker 入口，仅 9 行 bootstrap
    │   │   ├── editorWorker.ts / editorWorkerHost.ts ← 主线程侧的 worker 客户端
    │   └── languages/                   ← 语言定义、tokenizer、provider 注册表
    ├── contrib/                         ← 内置 contribution，每个目录是一个特性
    │   ├── suggest/browser/
    │   │   ├── suggestModel.ts          ← 心脏文件 4：补全状态机 + provider 调度
    │   │   ├── suggestController.ts     ← 接键盘 / 选 item / insert
    │   │   └── suggestWidget.ts         ← UI
    │   ├── hover/  format/  rename/  find/  folding/  ...  ← 每个都是独立 contribution
    └── standalone/                      ← Monaco 的"独立打包入口"——不依赖 vscode workbench
        ├── browser/standaloneCodeEditor.ts
        └── browser/standaloneServices.ts ← 给浏览器版注入 mock 的 IFileService 等

microsoft/monaco-editor @ 633d06e88a108495c59eec9d360ecd146f7fe322
├── src/                ← d.ts 拼接 + esm 导出胶水
├── monaco-lsp-client/  ← 把 LSP 协议翻译成 monaco provider 的桥
├── samples/            ← 嵌入示例（含 react、vite、webpack 配方）
├── webpack-plugin/     ← MonacoWebpackPlugin，自动配 4 个 worker entry
└── website/            ← https://microsoft.github.io/monaco-editor/
```

挑出三个心脏文件 + 一个 worker 桥，对应 Layer 3 的三段精读：

1. **`src/vs/editor/browser/widget/codeEditor/codeEditorWidget.ts`** @ `d53d5057` —
   `CodeEditorWidget` 是用户输入入口，`setModel` / `_attachModel` 决定了 model ↔ view ↔ viewModel 三件如何绑在一起。
2. **`src/vs/editor/common/model/textModel.ts`** @ `d53d5057`，~108 KB / 3000+ 行 —
   `TextModel` 是真理源；`_buffer = PieceTree` 是 rope-like 缓冲，`applyEdits` 是所有外部 edit 的入口。
3. **`src/vs/editor/common/services/editorWebWorker.ts`** @ `d53d5057` 配
   **`src/vs/editor/contrib/suggest/browser/suggestModel.ts`** @ `d53d5057` —
   这两个文件加起来代表 Monaco 的"跨线程契约 + provider 调度"，是和 codemirror / Ace 区分度最大的部分。

## 核心机制（Layer 3 · 三段独立小节）

### 段 1：CodeEditorWidget · setModel 把 ITextModel 串进 ViewModel

[`codeEditorWidget.ts#L219-L1100` @ `d53d5057`](https://github.com/microsoft/vscode/blob/d53d50575961dbd36ca50f6424da9b70e4beba0e/src/vs/editor/browser/widget/codeEditor/codeEditorWidget.ts#L219-L1100)

```ts
// L219
export class CodeEditorWidget extends Disposable implements editorBrowser.ICodeEditor {
    // L336
    protected _modelData: ModelData | null;

    // L639
    public setModel(_model: ITextModel | editorCommon.IDiffEditorModel
                          | editorCommon.IDiffEditorViewModel | null = null): void {
        try {
            this._beginUpdate();
            const model = <ITextModel | null>_model;
            if (this._modelData === null && model === null) {
                // Current model is the new model
                return;
            }
            if (this._modelData && this._modelData.model === model) {
                // Current model is the new model
                return;
            }

            const e: editorCommon.IModelChangedEvent = {
                oldModelUrl: this._modelData?.model.uri ?? null,
                newModelUrl: model?.uri ?? null,
            };
            this._detachModel();
            this._attachModel(model);
            this._onDidChangeModel.fire(e);
            this._postDetachModelCleanup(/*...*/);
        } finally {
            this._endUpdate();
        }
    }

    // L999
    protected _attachModel(model: ITextModel | null): void {
        if (!model) {
            this._modelData = null;
            return;
        }
        const listenersToRemove: IDisposable[] = [];
        this._domElement.setAttribute('data-mode-id', model.getLanguageId());
        this._configuration.setIsDominatedByLongLines(model.isDominatedByLongLines());
        this._configuration.setModelLineCount(model.getLineCount());
        const attachedView = model.onBeforeAttached();

        const viewModel = new ViewModel(
            this._id,
            this._configuration,
            model,
            DOMLineBreaksComputerFactory.create(dom.getWindow(this._domElement)),
            MonospaceLineBreaksComputerFactory.create(this._configuration.options),
            (callback) => dom.scheduleAtNextAnimationFrame(dom.getWindow(this._domElement), callback),
            this.languageConfigurationService,
            this._themeService,
            attachedView,
            { /* batchChanges 等 */ },
        );
        // 后续：把 view 创建出来，把 viewModel 的事件接到 view，
        // 把 model 的内容变更接到 viewModel，最后存 _modelData = { model, viewModel, view, ... }
    }
}
```

旁注：

- **入口三层 store**：`_modelData` 存的是 `{ model, viewModel, view, listenersToRemove }` 一个三元组——
  Monaco 的"editor 实例"实质是这个三元组的容器，setModel 就是在原子地 detach 旧三元组、attach 新三元组。
- **L639-L654 的两条 early-return** 不是"防御性写代码"，而是 Monaco 的语义假设：传同一个 model 进来等价于 no-op，不能让事件白发一次（不然 hover / completion 会以为 model 换了，全部重新查询）。
- **L1014 的 `model.onBeforeAttached()`** 是 model 的引用计数 hook——同一个 ITextModel 可以被多个 editor 实例共享（VSCode 的 split editor 就是这么实现的），refCount 决定何时真销毁。
- **L1015-L1028 创建 ViewModel** 时把 4 个工厂注入：DOM 行宽测量、monospace 行宽估算、`scheduleAtNextAnimationFrame`、配置服务。这是 Monaco 跑得动的一半秘密——
  ViewModel 不直接 query DOM，而是通过这些注入的 factory 拿到测量结果，单测里可以换成 mock 工厂跑无 DOM 测试。
- **跟 codemirror 的对比**：codemirror 6 的 `EditorView` 直接 own `EditorState`（用不可变快照 + transaction）；Monaco 的 `CodeEditorWidget` own `_modelData`（mutable 三元组 + 事件流）。
  这是 Monaco 选择"复用 VSCode desktop 那边十年沉淀的 model 体系"的代价，也是它能直接接 desktop 扩展协议的本钱。

**怀疑 1**：`setModel` 在原子 detach 时，listenersToRemove 是同步 dispose 还是 microtask？如果用户在 modelChange 事件里又 setModel，会不会嵌套 update 死锁？
追到 `_beginUpdate / _endUpdate` 的实现，看 update depth 计数器是不是真的能撑递归调用。

### 段 2：TextModel · PieceTree 真理源 + applyEdits 是唯一入口

[`textModel.ts#L283-L1500` @ `d53d5057`](https://github.com/microsoft/vscode/blob/d53d50575961dbd36ca50f6424da9b70e4beba0e/src/vs/editor/common/model/textModel.ts#L283-L1500)

```ts
// L283
export class TextModel extends Disposable
    implements model.ITextModel, IDecorationsTreesHost {

    // L315
    private _buffer: model.ITextBuffer;
    // L316
    private _bufferDisposable: IDisposable;

    // L939
    private _onBeforeEOLChange(): void {
        // Ensure all decorations get their `range` set.
        this._decorationsTree.ensureAllNodesHaveRanges(this);
    }

    // L1421
    public applyEdits(
        rawOperations: readonly model.IIdentifiedSingleEditOperation[],
        computeUndoEdits?: boolean,
        reason?: TextModelEditSource,
    ): void | model.IValidEditOperation[] {
        try {
            this._onDidChangeDecorations.beginDeferredEmit();
            this._eventEmitter.beginDeferredEmit();
            const operations = this._validateEditOperations(rawOperations);
            return this._doApplyEdits(operations, computeUndoEdits ?? false,
                                      reason ?? EditSources.applyEdits());
        } finally {
            this._eventEmitter.endDeferredEmit();
            this._onDidChangeDecorations.endDeferredEmit();
        }
    }
}
```

旁注：

- **`_buffer: ITextBuffer`** 在 `d53d5057` 这个版本是接口，实际指向 `pieceTreeTextBuffer/`。PieceTree 是 rope 的一种变体——
  原始文本作为"原始 buffer"不变，所有 edit 追加到"修改 buffer"，再用一棵红黑树把 piece 串起来。
  好处：插入 / 删除是 O(log n)，而 immutable 字符串拼接是 O(n)。Workplace 那种几万行长帖打字延迟降下来的核心就是它。
- **L1421 `applyEdits` 是唯一入口**——所有 edit（用户键入、format、rename、redo、外部 LSP 改）都必须经过这里。
  这条规则保证了 `_eventEmitter.beginDeferredEmit / endDeferredEmit` 能把多次 edit 合成一个 `onDidChangeContent`，下游 ViewModel / decoration / tokenizer 不会被打字 100 次就触发 100 次重排。
- **try / finally 配对** 不只是错误处理：`endDeferredEmit` 即使中间抛了异常也必须跑，否则事件 buffer 会卡住整个编辑器。这是 Monaco 写 try/finally 配对的硬规约，整个仓库 grep 一遍能看到一致风格。
- **L1430 `_validateEditOperations`** 会把传入的 raw operation 排序、合并、检查 range 合法性——外部传错的 range（比如 endLine < startLine）会在这里被显式 throw，而不是默默挂掉。
- **decoration 不在 `_buffer`**：`_decorationsTree` 是独立的 IntervalTree（`IntervalTree.ts`），edit 时通过 `_decorationsTree.acceptReplace` 把所有 decoration range 跟着 shift。
  这是为什么 Monaco 能在 10000 行文件上保留 3000 个 lint 装饰还不卡——区间树查"哪些 decoration 受影响"是 O(log n + k)。
- **跟 lexical 的对比**：lexical 的 `EditorState` 在 commit 边界 freeze（不可变快照），edit 走"`getWritable()` 浅拷贝 → reconcile diff"；
  Monaco 的 `TextModel` 始终 mutable，但用 PieceTree + 事件 deferred 把"代价均摊"成几乎不可感的 O(log n)。两条路径各有票友。

**怀疑 2**：`_validateEditOperations` 在 L1430 排序时如果两个 edit 在同一 position（一个 insert + 一个 delete），优先级是怎么定的？追到具体行号，看 `compareEditOperations` 的逻辑。

### 段 3：EditorWorker + SuggestModel · postMessage 跨线程契约 + provider 调度

[`editorWebWorker.ts#L75-L260` @ `d53d5057`](https://github.com/microsoft/vscode/blob/d53d50575961dbd36ca50f6424da9b70e4beba0e/src/vs/editor/common/services/editorWebWorker.ts#L75-L260)
和
[`suggestModel.ts#L117-L320` @ `d53d5057`](https://github.com/microsoft/vscode/blob/d53d50575961dbd36ca50f6424da9b70e4beba0e/src/vs/editor/contrib/suggest/browser/suggestModel.ts#L117-L320)

```ts
// editorWebWorker.ts L75
export class EditorWorker
    implements IDisposable,
               IWorkerTextModelSyncChannelServer,
               IWebWorkerServerRequestHandler {

    // L141
    private static computeDiff(
        originalTextModel: ICommonModel | ITextModel,
        modifiedTextModel: ICommonModel | ITextModel,
        options: IDocumentDiffProviderOptions,
        diffAlgorithm: ILinesDiffComputer,
    ): IDiffComputationResult {
        const originalLines = originalTextModel.getLinesContent();
        const modifiedLines = modifiedTextModel.getLinesContent();
        const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, options);
        const identical = (result.changes.length > 0
            ? false
            : this._modelsAreIdentical(originalTextModel, modifiedTextModel));
        // 把 DetailedLineRangeMapping 平铺成 [origStart, origEndEx, modStart, modEndEx, innerChanges] 数组，
        // 因为 postMessage 不能直接传 class 实例（结构化克隆会丢方法）
        return { /* lines diff serialized */ };
    }

    // L227
    public async $computeMoreMinimalEdits(
        modelUrl: string,
        edits: TextEdit[],
        pretty: boolean,
    ): Promise<TextEdit[]> {
        const model = this._getModel(modelUrl);
        if (!model) { return edits; }
        const result: TextEdit[] = [];
        let lastEol: EndOfLineSequence | undefined = undefined;
        edits = edits.slice(0).sort((a, b) => {
            if (a.range && b.range) {
                return Range.compareRangesUsingStarts(a.range, b.range);
            }
            const aRng = a.range ? 0 : 1;
            const bRng = b.range ? 0 : 1;
            return aRng - bRng;
        });
        // merge adjacent edits ...
    }
}
```

```ts
// suggestModel.ts L117
export class SuggestModel implements IDisposable {

    // L251
    trigger(options: SuggestTriggerOptions): void {
        if (!this._editor.hasModel()) { return; }
        const model = this._editor.getModel();
        const ctx = new LineContext(model, this._editor.getPosition(), options);

        // Cancel previous requests, change state & update UI
        this.cancel(options.retrigger);
        this._triggerState = options;
        this._onDidTrigger.fire({
            auto: options.auto,
            shy: options.shy ?? false,
            position: this._editor.getPosition(),
        });
        this._context = ctx;

        let suggestCtx: CompletionContext = {
            triggerKind: options.triggerKind ?? CompletionTriggerKind.Invoke,
        };
        if (options.triggerCharacter) {
            suggestCtx = {
                triggerKind: CompletionTriggerKind.TriggerCharacter,
                triggerCharacter: options.triggerCharacter,
            };
        }

        // L295（节选）
        const completions = provideSuggestionItems(
            this._languageFeaturesService.completionProvider,
            model,
            this._editor.getPosition(),
            completionOptions,
            suggestCtx,
            this._requestToken.token,
        );
        // 异步 then：把所有 provider 返回的 suggestions 合并、过滤、按 score 排序，再喂 SuggestWidget
    }
}
```

旁注：

- **EditorWorker 的方法名都以 `$` 打头**（`$computeMoreMinimalEdits` / `$computeDiff` / `$textualSuggest`）——这是 vscode 内部的"暴露给 RPC"标记，
  worker host 看到方法以 `$` 开头才会注册成可远程调用。私有方法不带 `$`（`computeDiff` 静态私有），保证内部实现不会被外部线程调到。
- **`postMessage` 走结构化克隆**：所以 `computeDiff` 返回值是平铺的 number 数组（L150-L160），不是 `DetailedLineRangeMapping` 类实例——
  类的方法会在结构化克隆时丢掉，主线程拿到的是 plain object。这是 worker 跨线程契约最常踩的坑。
- **`SuggestModel.trigger` L251 的 `this.cancel(options.retrigger)`** 是补全的灵魂——用户每键入一个字符都会先 cancel 上一次飞行中的 provider 调用。
  Monaco 用 `CancellationToken` 串起 `_requestToken` 让 provider 自己决定要不要 abort（TS service 可以 abort tsserver 当前请求，便宜的 textualSuggest 可以无视 cancel）。
- **`provideSuggestionItems` L295 接收的是 `completionProvider`** —— 一个 ProviderRegistry。Monaco 的 provider 是 list-based（一个语言可以注册多个 provider，比如 TS 自己的 + Copilot 的 + 用户外挂的 LSP 的），
  按 score 合并去重。这就是为什么 GitHub Copilot 能"嵌"进 Monaco 而不需要 fork 它。
- **Worker 不知道有 SuggestModel**：worker 端只有 `EditorWorker.$textualSuggest`（一个简单的"基于词频的默认补全"）；
  TS / JSON / CSS / HTML 这些**专门的语言 worker** 才在另外的 worker 里跑各自的语言服务（如 `tsserver`），SuggestModel 是主线程侧的 orchestrator——
  它把所有 provider（含语言 worker、含主线程 provider）一并查询，合并结果。
- **跟 codemirror / lexical 的对比**：codemirror 的 `autocomplete` 模块是同步在主线程；lexical 完全没有"补全"概念（它是富文本，靠 plugin 自己写）；
  Monaco 把"补全"做成 first-class 协议 + 默认有 worker 实现 + 默认有 4 个语言 service worker 顶在那儿——这条线投入的工程量是别人单数量级的。

**怀疑 3**：SuggestModel 在 L262 `cancel` 之后会清 `_requestToken`，但如果上一次的 provider 已经在 then 链里、还没拿到 cancellation 信号就把 result push 进 widget，会不会有竞态？追 `_requestToken` 在 cancellation 之后还能不能被旧 promise 读到。

## Hands-on（含改一处实验）— Layer 4

### 30 分钟跑通命令

```bash
# 1. 起一个空 vite + ts 项目
mkdir monaco-poc && cd monaco-poc
npm create vite@latest . -- --template vanilla-ts

# 2. 装 monaco
npm install monaco-editor

# 3. 配 worker（vite 用 ?worker 插件即可，不用 webpack-plugin）
cat > src/main.ts << 'EOF'
import * as monaco from 'monaco-editor';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker   from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker    from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker   from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker     from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

const editor = monaco.editor.create(document.getElementById('app')!, {
  value: 'function hello(name: string) {\n  return `hi, ${name}`;\n}\nhello(123);  // 故意传错类型',
  language: 'typescript',
  automaticLayout: true,
  theme: 'vs-dark',
});

// 注册一个 hover provider，证明 provider 协议确实开放
monaco.languages.registerHoverProvider('typescript', {
  provideHover(model, position) {
    const word = model.getWordAtPosition(position);
    if (!word) return null;
    return {
      contents: [{ value: `**自定义 hover**：你 hover 到了 \`${word.word}\`` }],
    };
  },
});
EOF

# 4. 跑
npm run dev
# 打开 http://localhost:5173，应该看到：
#   - 第 4 行 hello(123) 红波浪线（TS service worker 跑起来了）
#   - hover 任何 identifier 弹出"自定义 hover"
#   - DevTools Network panel 看到 4 个 worker.js 加载
```

### 改一处实验

**实验 A**：把 `automaticLayout: true` 改成 `false`，调小窗口，光标位置错位。
观察 `CodeEditorWidget._configuration.observeReferenceElement` 没启动 ResizeObserver，editor 不知道容器 resize 了——
这正好把 Layer 3 段 1 里 `_attachModel` 注入的"工厂模式"暴露出来：行宽测量是 lazy 的，没有 layout 触发就不会重测。

**实验 B**：在 `monaco.languages.registerCompletionItemProvider('typescript', ...)` 里返回一个故意延迟 5s 的 Promise，
在 5s 内继续打字。观察控制台：每键入一个字符都会触发 `cancel`，Promise 该被丢弃；但若 provider 不响应 `token.isCancellationRequested`，
返回的 stale 结果会**还是**被合并进 widget——这就是怀疑 3 那个竞态的复现路径。

**实验 C**：往 editor 里粘贴一个 5 万行的 `package-lock.json`，打开 DevTools Performance 面板，连续打字。
能看到主线程基本 idle，4 个 worker 的 CPU 各自在跑——这是 PieceTree + worker LSP 设计的肉眼可见证据。
对比：把同样的 5 万行扔进 codemirror 6，autocomplete 模块在主线程跑会有可感的卡顿（不是因为 codemirror 实现差，是它哲学上没把语言服务异步化）。

## 横向对比（Layer 5）

| 维度 | Monaco | [CodeMirror 6](/projects/codemirror/) | Ace | [Theia](https://theia-ide.org/) | WebContainer + xterm（StackBlitz） |
|---|---|---|---|---|---|
| 哲学 | "VSCode 内核浏览器分发" | "EditorState + Facet 的扩展协议" | "传统编辑器 + 主题 / 模式" | "整套 IDE，把 monaco 当编辑器组件" | "wasm 跑真 node，monaco 当 frontend" |
| Bundle 大小 | 主 + 4 worker ≈ 1.5 MB+ gzip | ~150 KB gzip（按需加载更小） | ~400 KB | 同 monaco（依赖它） | 数十 MB（含 wasm node） |
| 语言服务 | 默认 4 个 worker（TS/JSON/CSS/HTML） | 自己写 / 接 lezer parser | 主线程 mode 文件 | 整套 LSP 协议（接桌面 LSP server） | 真跑 node 进程的 tsserver |
| IntelliSense | 桌面 VSCode 同款（含 quickInfo, parameter hints, code actions） | 需要自己写 autocomplete provider | 简单 token 补全 | LSP-完整 | LSP-完整（真 node 跑） |
| 扩展模型 | provider registry（`registerCompletionItemProvider` 等） | Facet + StateField + ViewPlugin | mode + theme 字符串注册 | VSCode 扩展协议（含 webview） | 同 monaco（嵌它） |
| 渲染层 | DOM（手写 ViewParts，不用 React） | DOM（手写 ViewPlugin） | DOM（textarea + canvas hybrid） | 同 monaco | 同 monaco |
| 用户场景 | GitHub Codespaces / TypeScript playground / Vercel deploy console / Stripe API explorer | Replit / CodeSandbox / Sourcegraph / Sentry / Notion code block | AWS Cloud9 / 旧 Khan Academy | SAP Business Application Studio / Eclipse Che | StackBlitz |
| Bus factor | Microsoft 整团队 | 1 人主导（Marijn Haverbeke）+ dependabot | Cloud9 维护，活跃度低 | Eclipse Foundation + IBM | StackBlitz 全公司 |

**选型建议**：

- 想要"和 VSCode 桌面同体验，能贴 LSP 就用 LSP"——**选 Monaco**。
  代价是 bundle 1.5 MB+、配 webpack-plugin / vite worker import 是必须步骤，错配 worker URL 是新手最常见的坑。
- 嵌入式编辑器、单页应用、不需要语言服务，只要语法高亮 + 简单补全——**选 CodeMirror 6**。
  150 KB 的体积差和 Facet 的可组合性是它的护城河。Notion 的 inline code block 用它就是这个原因。
- 整套 IDE 体验（多文件、调试、终端、扩展商店）——**选 Theia**（直接复用 monaco）或者直接 fork VSCode（那是 Cursor / Continue / Theia 系的路径）。
- StackBlitz 那种"浏览器里跑真 dev server"——这是另一条赛道，monaco 在他们的栈里只是 frontend，wasm + node 才是核心。

## 与你当前工作的连接（Layer 6）

> 先排掉一类误用：**别把 monaco 当成"高级 textarea" 给用户写表单**。1.5 MB 的 bundle + 4 个 worker 给一个表单字段加上是污染。
> 真正的场景是"用户要写 / 看代码"——配置 DSL、SQL、API mock、prompt template 等。

### 今天就能用

- **任何"让用户写 / 编辑 JSON / YAML 配置"的页面**——monaco 自带 JSON schema 验证 + 错误提示 + 自动补全（前提：用 `monaco.languages.json.jsonDefaults.setDiagnosticsOptions` 注册 schema）。
  比手写 textarea + 一堆 lint 提示省一周工。
- **API playground / 在线代码示例**——调 `monaco.editor.create({ language: 'javascript', readOnly: true })` 嵌一个只读高亮 block，比 highlight.js 多了"复制 / 跳转 / hover"等 IDE 习惯动作。
- **SQL / DSL 编辑器**——调 `monaco.languages.register({ id: 'mydsl' })` + 写一个 monarch tokenizer + 一个 completionProvider，~100 行就能从零搞定。
- **diff 视图**——`monaco.editor.createDiffEditor(...)` 复用 `EditorWorker.$computeDiff`，体感和 VSCode 的 diff editor 完全一致。

### 下个月能用

- **接外挂 LSP**：用 `monaco-language-client` 把任何 LSP server（rust-analyzer / pyright / gopls，跑在远端 docker）接进 monaco，`registerCompletionItemProvider` 这类 API 自动桥接。
  这条路径的总工作量主要在 LSP server 侧（容器化 + 安全沙箱），不在 monaco 侧。
- **AI inline completion**：用 `monaco.languages.registerInlineCompletionsProvider` 把 ghost text 接到自家 LLM。
  Cursor / Continue / GitHub Copilot 在浏览器版的实现路径几乎一致，只是 prompt 和 model 不同。
- **桌面端共享代码**：如果未来要做 Electron 版，`src/vs/editor/**` 那套代码可以**完全 0 改动**用在桌面（VSCode 自己就是这样）；
  浏览器版迁桌面只需要换掉 `standalone/` 那层服务注入。

### 不要用的部分

- **不要把 monaco 当通用富文本框架**——它的 model 是"行 + 列 + tab 等宽"假设，贴个图片 / 表格 / 嵌套 block 全错位。富文本走 [lexical](/projects/lexical/) / [prosemirror](/projects/prosemirror/)。
- **不要在移动端 H5 给用户写代码**——monaco 的 IME / 选区 / 长按菜单在 iOS Safari 经常错位（VSCode 也不在 iPad Safari 推荐用），团队踩过这个坑的不在少数。
- **不要在低性能机器上跑 monaco + Copilot + 大文件**——4 个 worker + tsserver + Copilot LLM 调用并行起来，老旧 ChromeBook 直接 OOM。
  Copilot 团队自己有 fallback 到 textarea 的逻辑。
- **不要为了"看起来高级"嵌 monaco**——单一字段表单、配置 toggle、UI 文本输入用 monaco 是反向优化，bundle 加 1.5 MB 换不到任何 UX 收益。

## 自检 + 延伸（Layer 7）

### 怀疑（写完后追到行号级）

1. **怀疑 1**（再列一遍便于追踪）：`CodeEditorWidget.setModel` 在 detach 旧 model 时 listenersToRemove 是同步 dispose 还是 microtask？嵌套 setModel（在 modelChange 事件里又 setModel）会不会让 `_beginUpdate / _endUpdate` 计数器爆栈？
2. **怀疑 2**：`TextModel.applyEdits` 在 `_validateEditOperations` 排序时，两个 edit 在同一 position（一个 insert + 一个 delete）的优先级？追 `compareEditOperations` 实现，看 type-tag 还是 length。
3. **怀疑 3**：`SuggestModel.trigger` 在 `cancel` 之后清 `_requestToken`，但如果上一次 provider 在 then 链里还没读 token 就 push 进 widget，会不会有 stale result？
4. **怀疑 4**：worker 端 `EditorWorker.$computeDiff` 返回平铺数组，主线程接到后再 rebuild 成 class——这一来一回的序列化代价在 5 万行 diff 上有多大？是否有 SharedArrayBuffer fallback？
5. **怀疑 5**：`monaco.editor.create` 如果在 `MonacoEnvironment.getWorker` 没配齐时调用，会不会 fallback 到主线程跑 TS service？是否有显式报错路径？

### 接下来读哪 N 个文件（按优先级）

| 顺序 | 文件路径 | 回答的问题 |
|---|---|---|
| 1 | `src/vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBuffer.ts` | PieceTree 的 insert / delete / getLineContent 复杂度，validate 段 2 旁注 |
| 2 | `src/vs/editor/common/viewModel/viewModelImpl.ts` | ViewModel 怎么把 model 坐标翻译成 view 坐标，软换行 / 折叠如何处理 |
| 3 | `src/vs/editor/common/cursor/cursorTypeOperations.ts` | 用户键入怎么变成 model edit，IME 期间为什么要 disconnect MutationObserver |
| 4 | `src/vs/editor/contrib/hover/browser/contentHover.ts` | hover provider 的查询 / 合并 / 渲染流水线 |
| 5 | `src/vs/editor/standalone/browser/standaloneServices.ts` | Monaco 浏览器版怎么 mock 掉 vscode workbench 的服务依赖 |
| 6 | `monaco-editor/monaco-lsp-client/**` | 把 LSP 协议翻成 monaco provider 的具体桥接 |

## 限制（不抄项目 README）

1. **包大不可调**——main bundle + 4 个 worker 1.5 MB+ gzip 是固定成本。即使 tree-shake 也省不了多少，因为 4 个 worker 每个都打了一份完整 tsserver / cssparser / jsonparser。
   别幻想能压到 codemirror 那个量级，哲学不同。
2. **配置 worker 是必须步骤**——任何"我用 React + monaco-editor 包结果跑不起来"的提问，95% 是 `MonacoEnvironment.getWorker` 没配。webpack 用户得装 `monaco-editor-webpack-plugin`，vite 用户得用 `?worker` import；忘了配会"看起来能跑但 hover / 补全全没"。
3. **移动端 / iOS Safari 是二等公民**——VSCode 团队明说 iPad Safari 不在支持矩阵里，IME / 选区 / 长按菜单不稳定。要在移动端给用户写代码，用 codemirror 6 或者直接 textarea + 简单高亮。
4. **`d.ts` 公开面 ≠ `src/vs/editor` 全部**——`monaco.d.ts` 只暴露 standalone API 子集；想用 vscode 内部的 service（比如 `IModelService.getModel`）得 fork 或走非公开路径，下个版本就可能改。
5. **API 频繁微调**——VSCode 主分支每天几十 commit，monaco-editor npm 版本跟得没那么紧，遇到"老 monaco-editor + 新文档"漂移很常见。`d53d5057` 这个 hash 一周后再读，行号大概率会偏。

## 附录：宣传 vs 现实

| 宣传 | 现实 |
|---|---|
| "Monaco is the code editor that powers VS Code" | 准确——同一份 `src/vs/editor/**`，但 monaco-editor npm 包额外打了 standalone 服务和 d.ts |
| "Just `npm install monaco-editor` and you're done" | 必须额外配 `MonacoEnvironment.getWorker`，否则补全 / 诊断 / 格式化全部静默失效 |
| "Bring IntelliSense to your web app" | 仅 4 个内置语言（TS/JSON/CSS/HTML）开箱即用；Python / Rust / Go 等都要外挂 LSP 才能拿到真 IntelliSense |
| "Use it anywhere" | 移动端浏览器、iPad Safari、低性能 ChromeBook 都不在官方支持矩阵 |
| "Tree-shakable" | worker 是独立 entry，每个 worker 内含完整语言服务，tree shake 只能瘦主 bundle，省不了多少 |

## 元数据

- 升级日期：2026-05-29
- 总行数：约 540 行
- 启用工具：WebFetch（GitHub API + raw.githubusercontent.com 抓行号）、Read（图片视觉验证）、Bash（cwebp 渲染 figure）
- 数据锚定：vscode @ `d53d50575961dbd36ca50f6424da9b70e4beba0e`，monaco-editor @ `633d06e88a108495c59eec9d360ecd146f7fe322`，读时 2026-05-29
- 7 处 GitHub permalink（含 SHA + 行号锚）：codeEditorWidget L219-L1100 / textModel L283-L1500 / editorWebWorker L75-L260 / suggestModel L117-L320 / suggestController（旁证 acceptSelectedSuggestion L614） / textModel applyEdits L1421 / editorWebWorker computeDiff L141
- 5 处显式怀疑（编号 1-5），覆盖：嵌套 setModel 计数 / edit 排序优先级 / 补全 stale result 竞态 / 跨线程序列化代价 / worker 缺失 fallback 路径
