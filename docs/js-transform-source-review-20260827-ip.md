# JS/TS transform source review (writer IP)

> 用途：记录 oxc-parser、SWC 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer IP
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、bundle、Wasm plugin 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未改 `oxc` / `oxlint` / `oxc-transform` / `rolldown` 正文；未选用 ts-blank-space、jiti、importx、tsx、ts-node、sucrase、marked、markdown-it、knex、ioredis、redis、BullMQ

## oxc-parser

- canonical source：`https://github.com/oxc-project/oxc`
- revision：`4e258430cdb290598d9f2aeb2d13be598ec9e8e9`
- git tag：`crates_v0.147.0`
- package：`oxc-parser@0.147.0`（`napi/parser`）
- inspected：
  - `napi/parser/package.json`
  - `napi/parser/README.md`
  - `napi/parser/src-js/index.js`
  - `napi/parser/src-js/index.d.ts`
  - `napi/parser/src-js/wrap.js`
  - `napi/parser/src-js/visit/index.js`
  - `napi/parser/src/lib.rs`
  - `napi/parser/src/types.rs`
  - `napi/parser/example.js`
- observed：
  - npm `latest` is `0.147.0`; package has no `gitHead`; identity is tag + package version + commit SHA;
  - Node engines are `^20.19.0 || >=22.12.0`; published `type` is `module`;
  - public JS API is `parseSync` / `parse`, plus `Visitor`, `visitorKeys`, `rawTransferSupported`;
  - `parse()` runs Rust parse on another thread, then deserializes ESTree JSON on the calling thread; comments say deserialization typically outweighs parse by 3–20×;
  - default path: NAPI `parse_sync` → `program.to_estree_json_with_fixes` → JS `wrap` → `jsonParseAst` applies BigInt/RegExp fixes;
  - `ParseResult` getters take ownership (`mem::take`); JS `wrap` caches after first read;
  - `showSemanticErrors` defaults false and runs `SemanticBuilder` only when true;
  - language comes from `lang` or filename extension; `sourceType` may be script/module/commonjs/unambiguous;
  - raw transfer / lazy deserialization are experimental and only compiled on 64-bit little-endian;
  - this note reviews the Node parser package, not `oxc_transformer` / `oxc-transform`.
- provenance：
  - Git tag `crates_v0.147.0` and npm `oxc-parser@0.147.0` identify this reachable revision;
  - the same SHA is already bound by the `oxc` compiler-suite note; this page is the NAPI package contract.

## SWC

- canonical source：`https://github.com/swc-project/swc`
- revision：`490c7d88ad15cf84ee410c69e19eef86f445d45b`
- git tag：`v1.16.1`（annotated tag object `234b572dda726db358937457e4df05ab31e8434c`，剥皮提交如上）
- package：`@swc/core@1.16.1`；同提交 `swc_core` crate 报 `77.0.2`
- inspected：
  - `packages/core/package.json`
  - `packages/core/src/index.ts`
  - `crates/swc_core/Cargo.toml`
  - `crates/swc/src/lib.rs`（`transform` / `process_js_with_custom_pass` / `minify` / `load_swcrc` / `parse_swcrc`）
- observed：
  - npm `latest` is `1.16.1`; package has no `gitHead`; Node engines are `>=10`;
  - JS facade exports a default `Compiler` plus `transform` / `transformSync` / `parse` / `minify` / `print` / `bundle`;
  - native NAPI binding is required first; load failure sets `@swc/wasm` fallback; `SWC_BINARY_PATH` can override the `.node` file;
  - `parse` JS API is marked deprecated in favor of Rust; `plugins()` JS helper is deprecated in favor of Wasm plugins;
  - `transform` accepts a source string or a `Program`; a leftover `options.plugin` function parses first, then calls `plugin(m)`, then transforms;
  - options are `JSON.stringify`’d into a Buffer before crossing NAPI;
  - Rust `process_js_with_custom_pass` may bail if `.swcrc` ignores the file; custom_before_pass is documented to run after decorators (if configured), `resolver`, and TypeScript stripping;
  - `.swcrc` parser allows comments, trailing commas, and a leading BOM;
  - this note does not measure transform/minify speed or compare output size to Terser.
- provenance：
  - Git tag `v1.16.1` peels to this reachable commit; npm `@swc/core@1.16.1` reports the same package version.
