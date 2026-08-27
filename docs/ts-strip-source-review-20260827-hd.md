# TS-strip source review (writer HD)

> 用途：记录 ts-blank-space、oxc-transform 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer HD
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、Node loader、NAPI binding 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## ts-blank-space

- canonical source：`https://github.com/bloomberg/ts-blank-space`
- revision：`74579cee118bb5f257fab7372f869cc107032316`
- git tag：`v0.9.0`
- package：`ts-blank-space@0.9.0`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/blank-string.ts`
  - `loader/hooks.js`
  - `loader/register.js`
  - `docs/unsupported_syntax.md`
- observed：
  - `package.json` is `type=module` with `exports["."]=./out/index.js` and `exports["./register"]=./loader/register.js`;
  - engines are `node >= 18.0.0`; dependency range is `typescript@5.1.6 - 6.0.x`;
  - default export parses with official `createSourceFile(..., ScriptKind.TS)` then `blankSourceFile`;
  - `BlankString` re-slices the original text and replaces type spans with spaces, keeping `\n` / `\r`;
  - ASI hazards insert `;`; multiline arrow generics/return types may move `(` / `)`;
  - `enum` / instantiated `namespace` / `import =` / `export =` / parameter properties / prefix `<T>x` call `onError` and stay in the output;
  - Node loader treats `.ts` / `.mts` as ESM, blanks them, appends `//# sourceURL=`, and retries failed `.js` / `.mjs` as `.ts` / `.mts`.
- provenance：
  - Git tag `v0.9.0` peeled commit, npm `gitHead`, and package version identify the same reachable revision.

## oxc-transform

- canonical source：`https://github.com/oxc-project/oxc`
- revision：`4e258430cdb290598d9f2aeb2d13be598ec9e8e9`
- git tag：`crates_v0.147.0`
- package：`oxc-transform@0.147.0`（仓库路径 `napi/transform`）
- inspected：
  - `napi/transform/package.json`
  - `napi/transform/index.d.ts`
  - `napi/transform/index.js`
  - `napi/transform/src/lib.rs`
  - `napi/transform/src/transformer.rs`
  - `napi/transform/src/isolated_declaration.rs`
  - `crates/oxc_transformer/src/lib.rs`
  - `crates/oxc_transformer/src/typescript/mod.rs`
  - `crates/oxc_transformer/src/typescript/options.rs`
  - `crates/oxc_transformer/src/typescript/annotations.rs`
- observed：
  - Node package version, crate tag and workspace compiler crates report `0.147.0`;
  - engines are `node ^20.19.0 || >=22.12.0`;
  - public API is `transformSync` / `transform` plus `isolatedDeclarationSync` / `isolatedDeclaration`;
  - documented evaluation order is parse → optional isolated declarations → typescript/decorator/plugins/jsx/target → inject → define → codegen;
  - omitting `jsx` enables the automatic JSX runtime; omitting `target` keeps `esnext` and does no lowering;
  - TypeScript preset deletes annotations then codegens, so line/column are not preserved;
  - enums, namespaces and constructor parameter properties are rewritten, not left as type-only text;
  - recoverable parse errors may still yield code; a failed compiler setup returns empty `code` plus `errors`;
  - `moduleRunnerTransform` is marked deprecated and Vite-only.
- provenance：
  - Git tag `crates_v0.147.0` and npm `oxc-transform@0.147.0` identify this reachable revision;
  - npm does not publish `gitHead`; identity is tag + package version + commit SHA.
  - 本页只审查 Node `oxc-transform` 合同，不替代 [[oxc]] 的 compiler facade 页，也不覆盖 [[oxlint]]。
