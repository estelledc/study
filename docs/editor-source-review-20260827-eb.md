# Rich-text leftover source review (writer EB)

> 用途：记录 Draft.js、Editor.js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EB
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、IME、协同、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## 选题与 Froala 放弃

- 指定目标是 leftover 富文本对 `draft-js` + `quill`；`quill` 已被 writer CV 占用（开放 PR #146）。
- 下一目标 `draft-js` + `froala`。`froala/wysiwyg-editor@v5.4.0` 解出 `4ecf3d72...`，树内只有 `js/*.min.js`、CSS 与 i18n，没有可读内核源码。
- npm `froala-editor@5.4.0` 的 `gitHead=5a0bb5d8...` 指向 `froala/wysiwyg-editor-release`，license 是商业定价页，不是可复查源码合同。
- 按 fallback（排除 tiptap / slate / lexical / monaco）改走开源块编辑器 `codex-team/editor.js`，与 Draft.js 的字符偏移不可变文档形成对照。

## Draft.js

- canonical source：`https://github.com/facebookarchive/draft-js`
- revision：`f55fa0f8da080fea74ae3fa98860c41db85cbeea`
- git tag：`v0.11.7`
- package：`draft-js@0.11.7`
- inspected：
  - `package.json`
  - `src/Draft.js`
  - `src/model/immutable/EditorState.js`
  - `src/model/immutable/ContentState.js`
  - `src/model/immutable/DefaultDraftBlockRenderMap.js`
  - `src/model/modifier/DraftModifier.js`
  - `src/model/modifier/RichTextEditorUtil.js`
  - `src/model/entity/DraftEntity.js`
  - `src/component/base/DraftEditor.react.js`
- observed：
  - public surface re-exports `Editor`, `EditorState`, `ContentState`, `Modifier`, `RichUtils`, `convertFromRaw` / `convertToRaw` and `convertFromHTML`;
  - `EditorState` is an Immutable `Record` holding `currentContent`, `selection`, undo/redo stacks, decorator, `treeMap`, `directionMap`, `forceSelection`, `inCompositionMode`, `inlineStyleOverride` and `nativelyRenderedContent`;
  - `EditorState.push` is a no-op when content identity is unchanged; `allowUndo === false` writes content without stacking; otherwise the previous content is pushed when selection differs from `selectionAfter` or `mustBecomeBoundary` is true, and `redoStack` is cleared;
  - `ContentState.createFromText` splits on `/\r\n?|\n/g` and creates `unstyled` blocks; `createEntity` still mutates the module-level `DraftEntity` map and returns `this`;
  - `DefaultDraftBlockRenderMap` maps `unstyled` to `div` (aliased `p`), `atomic` to `figure`, and wraps list / code-block nodes;
  - `DraftEditor` is a controlled React component: `contentEditable={!readOnly}`, default `keyBindingFn=getDefaultKeyBinding`, `spellCheck=false`, `stripPastedStyles=false`; updates leave through `onChange`;
  - `RichUtils.handleKeyCommand` handles bold / italic / underline / code plus backspace / delete families and returns `null` for unknown commands;
  - peer range is React / ReactDOM `>=0.14.0`; runtime depends on `immutable@~3.7.4`.
- provenance：
  - GitHub tag `v0.11.7` and npm `draft-js@0.11.7` `gitHead` both identify `f55fa0f8...`;
  - the live GitHub identity is `facebookarchive/draft-js`; package `repository` still says `facebook/draft-js`.

## Editor.js

- canonical source：`https://github.com/codex-team/editor.js`
- revision：`4ea9eb389847181ceb757735f8bd45cc8c2f1673`
- git tag：`v2.31.6`
- package：`@editorjs/editorjs@2.31.6`
- inspected：
  - `package.json`
  - `src/codex.ts`
  - `src/components/core.ts`
  - `src/components/modules/index.ts`
  - `src/components/modules/tools.ts`
  - `src/components/modules/renderer.ts`
  - `src/components/modules/saver.ts`
  - `src/components/modules/blockManager.ts`
  - `src/components/modules/readonly.ts`
  - `src/components/modules/modificationsObserver.ts`
  - `src/components/constants.ts`
- observed：
  - `EditorJS` constructs `Core`, exposes `isReady`, then `exportAPI` sets the instance prototype to `API.methods` and installs shorthands `clear` / `render` / `focus` / `on` / `off` / `emit` / `save`;
  - boot is `configuration` → `validate` → `init` (construct + wire modules) → `start` (`Tools`, `UI`, `BlockManager`, `Paste`, `BlockSelection`, `RectangleSelection`, `CrossBlockSelection`, `ReadOnly`) → `Renderer.render` → `UI.checkEmptiness` → `ModificationsObserver.enable` → optional autofocus;
  - string `holder` must exist in the document at construct time; default holder is `'editorjs'`; `defaultBlock` is `'paragraph'`; `minHeight` defaults to `300`; default sanitizer is `{ p: true, b: true, a: true }`; empty `data` becomes one default block;
  - internal tools merge in `convertTo`, `link`, `bold`, `italic`, `paragraph` (`@editorjs/paragraph`), `stub`, `moveUp`, `delete` and `moveDown`;
  - missing or throwing tools are rewritten to `stub` with `savedData`; `save()` awaits each `block.save` / `validate`, sanitizes, skips invalid blocks, and returns `{ time, blocks, version }`;
  - read-only construction throws `CriticalError` if any block tool reports `isReadOnlySupported === false`;
  - `ModificationsObserver` batches `onChange` for `400` ms.
- provenance：
  - GitHub tag `v2.31.6` dereferences to `4ea9eb38...`; package.json reports `2.31.6`;
  - npm `@editorjs/editorjs@2.31.6` is latest and does not publish `gitHead`; identity is tag + package version + commit SHA.
