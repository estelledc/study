# Rich-text editor source review

> 用途：记录 Lexical、ProseMirror 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：CU
- target pair：slate + lexical；`src/content/docs/projects/` 无 `slate` / `slate-js` 页，开放 PR 也未占用这两 slug，因此 fallback 为既有富文本双子 `lexical` + `prosemirror`（排除已开放的 monaco/codemirror）
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器套件、IME、协同、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Lexical

- canonical source：`https://github.com/facebook/lexical`
- revision：`ffe90924bd55b5d450c88de0f9f1c8b228c4a221`
- package：`lexical@0.49.0`、`@lexical/react@0.49.0`
- inspected：
  - `packages/lexical/package.json`
  - `packages/lexical/src/LexicalEditor.ts`
  - `packages/lexical/src/LexicalEditorState.ts`
  - `packages/lexical/src/LexicalUpdates.ts`
  - `packages/lexical/src/LexicalReconciler.ts`
  - `packages/lexical/src/LexicalNode.ts`
  - `packages/lexical/src/nodes/LexicalElementNode.ts`
  - `packages/lexical-react/package.json`
  - `packages/lexical-react/src/LexicalComposer.tsx`
  - `packages/lexical-react/src/LexicalRichTextPlugin.tsx`
  - `packages/lexical-react/src/LexicalHistoryPlugin.ts`
  - `packages/lexical-react/src/shared/useHistory.ts`
- observed：
  - `EditorState` stores an immutable-facing snapshot: `_nodeMap` plus `_selection`; `isEmpty()` is `_nodeMap.size === 1 && _selection === null`;
  - `editor.update()` clones a pending state with `cloneEditorState` / `cloneMap`, runs the updater, then node transforms and detached-node GC; commit is a microtask unless `discrete` or a composition-key change forces `_flushSync`;
  - nested `update()` calls while `_updating` are queued in `editor._updates`;
  - `LexicalNode.getWritable()` copy-on-writes via `_cloneNotNeeded`: the first write clones and marks dirty, later writes in the same update reuse the clone;
  - reconciler consumes `_dirtyLeaves` / `_dirtyElements`; `FULL_RECONCILE` treats every node as dirty;
  - `$` helpers require an active `editor.update` / `editor.read` / `editorState.read` context; default `editor.read()` mode is `'force-commit'` and flushes pending updates;
  - `createEditor` always registers `RootNode`、`TextNode`、`LineBreakNode`、`TabNode`、`ParagraphNode` and `ArtificialNode__DO_NOT_USE`;
  - `LexicalComposer` reads `initialConfig` once; omitting `editorState` seeds an empty `ParagraphNode`; `null` skips seeding for an external owner; `setEditorState` rejects `EditorState.isEmpty()`;
  - `HistoryPlugin` default `delay` is 1000 ms; `@lexical/react@0.49.0` peers `react` / `react-dom` `>=18`;
  - `RichTextPlugin` is documented as a legacy plugin beside the extension composer path.
- provenance note：
  - GitHub annotated tag `v0.49.0` dereferences to commit `ffe90924bd55b5d450c88de0f9f1c8b228c4a221`, whose `packages/lexical/package.json` and `packages/lexical-react/package.json` report `0.49.0`;
  - npm `lexical@0.49.0` and `@lexical/react@0.49.0` do not expose `gitHead`;
  - nightly tags `v0.49.1-nightly.*` exist after this release; this review binds the stable `v0.49.0` commit.

## ProseMirror

- canonical source：`https://github.com/ProseMirror/prosemirror-state`
- revision：`d6fdcd19c4f7f68206b0a8d49649860365672585`
- package：`prosemirror-state@1.4.4`
- companion packages inspected at independently pinned revisions：
  - `prosemirror-model@1.25.11` → `https://code.haverbeke.berlin/prosemirror/prosemirror-model` @ `09098e3b00a2e36843040bcde1b7af9adf76816e`
  - `prosemirror-transform@1.12.0` → `https://github.com/ProseMirror/prosemirror-transform` @ `fb70a533004d205819a99dc092ba88b9ca3ad075`
  - `prosemirror-view@1.42.3` → `https://code.haverbeke.berlin/prosemirror/prosemirror-view` @ `20dc0a911a79f8fc6640dbbea5e7d68d3c4784b7`
- inspected：
  - `prosemirror-state/package.json`
  - `prosemirror-state/src/state.ts`
  - `prosemirror-state/src/transaction.ts`
  - `prosemirror-state/src/plugin.ts`
  - `prosemirror-model/src/schema.ts`
  - `prosemirror-model/src/content.ts`
  - `prosemirror-transform/src/step.ts`
  - `prosemirror-transform/src/replace_step.ts`
  - `prosemirror-view/src/index.ts`
  - `prosemirror-view/src/domobserver.ts`
- observed：
  - `EditorState` is persistent: `apply` / `applyTransaction` compute a new instance; plugins may `filterTransaction` and loop `appendTransaction` until none append;
  - two plugins with the same key throw `Adding different instances of a keyed plugin`;
  - `Transaction` extends `Transform` and also carries mapped selection, stored marks and metadata;
  - `Step` requires `apply` / `invert` / `map` / `toJSON`; `ReplaceStep.invert` swaps the replaced slice, and `map` returns `null` when both ends are `deletedAcross`;
  - schema `content` strings are compiled by `ContentMatch.parse` through NFA then DFA; `+` versus `*` changes whether the empty match is a valid end;
  - `EditorView` installs `MutationObserver` via `DOMObserver` to translate browser DOM edits back into transactions; a Firefox space-eaten workaround remains in this view revision.
- provenance note：
  - npm `prosemirror-state@1.4.4` `gitHead` equals GitHub tag `1.4.4` commit `d6fdcd19...`;
  - npm `prosemirror-transform@1.12.0` `gitHead` equals GitHub tag `1.12.0` commit `fb70a533...`;
  - npm latest `prosemirror-model@1.25.11` and `prosemirror-view@1.42.3` list `code.haverbeke.berlin` remotes; their `gitHead` values are not reachable on GitHub;
  - GitHub `ProseMirror/prosemirror-model` latest tag is `1.25.4`, `ProseMirror/prosemirror-view` latest tag is `1.41.7`;
  - this review binds the GitHub-reachable editor-state kernel `1.4.4` as the page revision, and names the companion haverbeke.berlin revisions used for schema and view facts.
