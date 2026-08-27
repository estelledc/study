# Syntax-highlight source review (writer IG)

> 用途：记录 starry-night、sugar-high 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer IG
- evidence：GitHub tag metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：shiki、lowlight、prismjs、highlight.js；intern 已占用 HM–ID；开放 PR #270 已占用 shiki / lowlight

## starry-night

- canonical source：`https://github.com/wooorm/starry-night`
- revision：`c8dcd37f5ff8db0fb732a71965040f7c2bb2a6c3`
- package：`@wooorm/starry-night@3.10.0`
- tag：`3.10.0`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `index.js`
  - `lib/index.js`
  - `lib/common.js`
  - `lib/all.js`
  - `lib/parse.js`
  - `lib/theme.js`
  - `lib/get-oniguruma.fs.js`
  - `lib/get-oniguruma.default.js`
  - `lib/types.d.ts`
  - `lang/source.js.js`（Grammar 形状）
  - `readme.md`
- observed：
  - 包名是 `@wooorm/starry-night`，不是 `starry-night`；`type: module`；生产依赖为 `@types/hast`、`import-meta-resolve`、`vscode-oniguruma`、`vscode-textmate`；
  - `exports` 暴露 `.`、`./*`（grammar）与 `./style/*`；`imports.#get-oniguruma` 在 Node 走 `lib/get-oniguruma.fs.js`，默认走 `lib/get-oniguruma.default.js`；
  - `createStarryNight(grammars, options)` 是 async，因为要 `loadWASM`；返回 `{flagToScope, highlight, missingScopes, register, scopes}`；
  - `highlight(value, scope)` 要求已注册的 TextMate scope（如 `source.js`），返回 hast `Root`，不序列化 HTML；未注册会抛 `Expected grammar ... to be registered`；
  - `flagToScope` 先小写并去首尾空白/尾斜杠，再查 `names`，否则按最后一个 `.ext` 查 `extensions` / `extensionsWithDot`；
  - `common` 预置 34 个 grammar；`all` 预置 694 个；`register` 往同一 `registered` Map 追加后重建 `vscode-textmate` Registry；
  - `parse` 按行调用 `tokenizeLine2`，空行也要 tokenize；用主题 colormap 把 metadata 解成 `pl-*` class；
  - Node 默认 `fs.readFile` 读 `vscode-oniguruma` 的 `onig.wasm`；浏览器默认 `fetch('https://esm.sh/vscode-oniguruma@2/release/onig.wasm')`。
- provenance：
  - GitHub tag `3.10.0`、源码 `package.json` version 与 npm `@wooorm/starry-night@3.10.0` 的 `gitHead` 三方一致。

## sugar-high

- canonical source：`https://github.com/huozhi/sugar-high`
- revision：`6f528911d683004a3c8013781e771d1404a79d81`
- package：`sugar-high@2.1.0`
- tag：`sugar-high@2.1.0`（annotated tag `dc487af0...` 剥皮后指向上述 commit）
- inspected：
  - 根 `package.json`（monorepo）
  - `packages/sugar-high/package.json`
  - `packages/sugar-high/lib/index.js`
  - `packages/sugar-high/lib/core.js`
  - `packages/sugar-high/lib/shared.js`
  - `packages/sugar-high/lib/lang.js`
  - `packages/sugar-high/lib/lang/javascript.js`
  - `packages/sugar-high/lib/lang/typescript.js`
  - `packages/sugar-high/lib/presets/javascript-runtime.js`
- observed：
  - 源码仓是 pnpm monorepo；发布包在 `packages/sugar-high`，无生产依赖，`type: module`；
  - 条件 exports 为 `.`、`./core`、`./lang`、`./lang/*`；
  - 主入口只导出 `highlight`；`lang()` 在 `sugar-high/lang`；`parse` / `render` / `tokenize` 在 `sugar-high/core`；
  - `highlight(code, options)` 用 `languages.find(({ id }) => id === (name || 'javascript'))` 取 config，只认 canonical id；别名必须先 `lang()`；
  - 内置 25 个 language id；`nonJavaScript` 会关掉 `jsx` / `regex` / `templateStrings`；
  - 默认 JS tokenizer 在未传 `typescript` 布尔时用 `isLikelyTypeScript`（分数 ≥ 2）切换 `Keywords_Ts`；`lang: 'typescript'` 强制 `typescript: true`；
  - `assemble` 把 token 切成行；`generate` 产出 `sh__line` / `sh__token--*` 与 `--sh-*` CSS 变量；`toHtml` 转义 `& < > " '`；
  - `markLine` 的 `index` 从 0 起；`cx` 先于 `mark`。
- provenance：
  - 绑定可达的 package tag `sugar-high@2.1.0` 剥皮提交；npm `sugar-high@2.1.0` 未提供 `gitHead`，因此不把 registry 元数据当成同一提交的证明。
