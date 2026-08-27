# Single-binary bundler source review (writer IY)

> 用途：记录 ncc、pkg 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer IY
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、pkg-fetch 下载或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## ncc

- canonical source：`https://github.com/vercel/ncc`
- revision：`cb1f1f058bfa7de4cb63f2411e14a724e714e260`
- git tag：`0.45.0`（lightweight tag，直接指向该提交）
- package：`@vercel/ncc@0.45.0`
- inspected：
  - `package.json`
  - `publish/package.json`
  - `readme.md`
  - `scripts/build.js`
  - `src/index.js`
  - `src/cli.js`
  - `src/typescript.js`
  - `src/@@notfound.js`
  - `src/utils/has-type-module.js`
  - `src/utils/ncc-cache-dir.js`
  - `src/utils/shebang.js`
  - `src/utils/get-package-base.js`
  - `src/loaders/relocate-loader.js`
  - `src/loaders/notfound-loader.js`
  - `src/loaders/empty-loader.js`
- observed：
  - source `package.json` version is `0.0.0-development`; published identity is npm `@vercel/ncc@0.45.0` plus tag `0.45.0`;
  - tag, npm `gitHead` and local checkout identify the same commit;
  - `main` / `bin` point at `dist/ncc/{index,cli}.js`; `files` is only `dist`;
  - `ncc()` builds a webpack 5.94.0 compiler against MemoryFS; relocator is `@vercel/webpack-asset-relocator-loader@1.10.3`;
  - ESM vs CJS is decided by `.mjs`, `.cjs`, or walking parents for `"type":"module"`;
  - default webpack `target` is `node14`; a custom `--target` must start with `es`;
  - unresolved modules become runtime errors via `@@notfound.js` + `notfound-loader`;
  - minify is a post-webpack terser pass with `compress:false` and kept class/function names;
  - `v8cache` is forced off for ESM; CJS defines `import.meta.url` via `pathToFileURL(__filename)`;
  - filesystem cache defaults to `$XDG_CACHE_HOME/ncc/<sha1(cwd)>` using `crypto.hash`;
  - `empty-loader` stubs `uglify-js` / `uglify-es`; TypeScript prefers a local user install then the built-in copy.
- provenance：
  - npm `@vercel/ncc@0.45.0` `gitHead` equals tag `0.45.0`;
  - source tree version field is `0.0.0-development` (semantic-release), not `0.45.0`.

## pkg

- canonical source：`https://github.com/yao-pkg/pkg`
- revision：`8d3d7af9fe9cbb02ec60c78c4c71de343e259c0a`
- git tag：`v6.22.0`（annotated tag；剥皮提交即上列 SHA）
- package：`@yao-pkg/pkg@6.22.0`
- inspected：
  - `package.json`
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `lib/index.ts`
  - `lib/bin.ts`
  - `lib/help.ts`
  - `lib/config.ts`
  - `lib/walker.ts`
  - `lib/producer.ts`
  - `lib/sea.ts`
  - `lib/compress_type.ts`
  - `prelude/bootstrap.js`（结构，未逐行复述）
- observed：
  - this is the maintained fork of archived `vercel/pkg`; npm name is `@yao-pkg/pkg`, engines `node >= 22.0.0`;
  - `exec()` resolves config once, runs `runPreBuild`, then either `--sea` or the traditional fetch → walk → refine → transform → pack → produce loop;
  - no CLI targets plus auto-derived output expands to `linux` / `macos` / `win` at the host `node<major>`;
  - traditional mode fetches a patched Node base via `@yao-pkg/pkg-fetch@3.6.5` and injects PAYLOAD/PRELUDE/BAKERY placeholders;
  - `--sea` without package.json is simple SEA (single file, no walker, no `--compress`);
  - `--sea` with package.json is enhanced SEA (walker + `@roberts_lando/vfs` + `postject`); targets must be Node >= 22;
  - compress enum is None / GZip / Brotli / Zstd; Zstd needs host `zlib.zstdCompressSync` (Node >= 22.15);
  - traditional mode can emit V8 bytecode (`STORE_BLOB`); enhanced SEA keeps source and native ESM.
- provenance split：
  - tag `v6.22.0^{}` is `8d3d7af9fe9cbb02ec60c78c4c71de343e259c0a` (`Release 6.22.0`);
  - npm `@yao-pkg/pkg@6.22.0` reports `gitHead=c1e10f542a00843d758325027ae81b69b5bcf51f` (parent of the release commit);
  - archived `vercel/pkg@5.8.1` / npm `pkg@5.8.1` still points at `5dc987b90ffd191263eb0202833dc382cea0d47d`; this note binds the living fork, not that tree.
