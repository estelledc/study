# Rich-text editor source review

> 用途：记录 Tiptap、Quill 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、IME、协同、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Tiptap

- canonical source：`https://github.com/ueberdosis/tiptap`
- revision：`db790a7c5a6009b0a94382e12e1a5e9c642e1660`
- packages：`@tiptap/core@3.30.3`、`@tiptap/react@3.30.3`、`@tiptap/starter-kit@3.30.3`
- inspected：
  - `packages/core/package.json`
  - `packages/core/src/Editor.ts`
  - `packages/core/src/Extension.ts`
  - `packages/core/src/CommandManager.ts`
  - `packages/core/src/index.ts`
  - `packages/starter-kit/src/starter-kit.ts`
  - `packages/react/package.json`
  - `packages/react/src/useEditor.ts`
- observed：
  - `Editor` constructs `ExtensionManager` then `CommandManager` then schema and initial `EditorState`; `mount(element)` creates the `EditorView` and emits `create` on the next timeout tick;
  - when `enableCoreExtensions` is true the core set is Editable, ClipboardTextSerializer, Commands, FocusEvents, Keymap, Tabindex, Drop, Paste, Delete and TextDirection, then user `extensions` are appended;
  - `commands.foo()` dispatches the current `state.tr` immediately unless `preventDispatch` or a custom state is set; `chain()` records callbacks and dispatches only in `run()`; `can()` dry-runs with `dispatch: undefined`;
  - `dispatchTransaction` applies `state.applyTransaction`, emits `beforeTransaction`, returns early if the root transaction was filtered, then `view.updateState` and emits transaction / selection / focus / blur / update;
  - unmounted `editor.view` is a Proxy that stubs `state`, `updateState`, `dispatch`, `composing`, `dragging`, `editable` and `isDestroyed`;
  - `getJSON()` is `state.doc.toJSON()` and `getHTML()` renders the document fragment through the schema;
  - `@tiptap/react` `useEditor` defaults `immediatelyRender` to true, forces false on SSR, and defaults false on Next.js when the option is omitted; `shouldRerenderOnTransaction` defaults to false;
  - `StarterKit.addExtensions()` optionally registers Document, Paragraph, Text, common marks, lists, Heading, Link, UndoRedo, Dropcursor, Gapcursor, HardBreak, HorizontalRule and TrailingNode.
- provenance note：
  - GitHub latest release tag `v3.30.3` dereferences to `db790a7c5a6009b0a94382e12e1a5e9c642e1660`, whose package.json files report `3.30.3`;
  - npm `@tiptap/core` latest is `3.30.5` and exposes no `gitHead`; canonical remote has no `v3.30.5` tag;
  - this review binds the reachable `v3.30.3` tag and does not invent a 3.30.5 revision.

## Quill

- canonical source：`https://github.com/slab/quill`
- revision：`522fd7ee0682498516df7389bacb6f7eb6e92b77`
- package：`quill@2.0.3`
- inspected：
  - `packages/quill/package.json`
  - `packages/quill/src/core.ts`
  - `packages/quill/src/quill.ts`
  - `packages/quill/src/core/quill.ts`
  - `packages/quill/src/core/editor.ts`
  - `packages/quill/src/modules/history.ts`
- observed：
  - the published package lives at `packages/quill` and depends on `quill-delta@^5.1.0`, `parchment@^3.0.0`, `eventemitter3@^5.0.1` and `lodash-es@^4.17.21`;
  - `src/core.ts` registers blot types plus clipboard, history, keyboard, uploader, input and uiNode; `src/quill.ts` additionally registers formats, toolbar, syntax, table and the snow / bubble themes;
  - `Quill.DEFAULTS.modules` enables clipboard, keyboard, history and uploader; `theme` defaults to `'default'` (the base `Theme` class);
  - constructor reads and clears container HTML, mounts a `ScrollBlot` on `ql-editor`, then Editor / Selection / Composition / Theme modules; initial HTML is converted by clipboard and `setContents`, after which `history.clear()` runs;
  - `modify()` drops `USER` edits when the editor is disabled unless `allowReadOnlyEdits` is set; non-empty changes emit `EDITOR_CHANGE` and, unless `SILENT`, `TEXT_CHANGE`;
  - `setContents` deletes the current document, inserts the new Delta, then deletes the trailing `\n` left by an empty editor; `updateContents` calls `editor.applyDelta`;
  - `Editor.applyDelta` batches insert / format / embed-update ops, applies deletes afterwards, then `optimize()`;
  - `History.DEFAULTS` are `delay: 1000`, `maxStack: 100`, `userOnly: false`;
  - `formats: null` keeps the global registry; a `formats` array builds a restricted registry unless a custom `registry` is supplied, in which case `formats` is ignored.
- provenance note：
  - GitHub annotated tag `v2.0.3` dereferences to commit `522fd7ee0682498516df7389bacb6f7eb6e92b77`;
  - npm `quill@2.0.3` reports the same `gitHead`;
  - this review binds that commit.
