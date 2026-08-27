# Markdown parser source review

> 用途：记录 micromark、markdown-wasm 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DV
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与类型声明阅读
- not executed：未安装两仓依赖，未运行上游 test、CommonMark fixture、WASM build、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## micromark

- canonical source：`https://github.com/micromark/micromark`
- revision：`3fae15528f69dfaf2a8865a7f7d92bfb4abd7bc9`
- git tag：`4.0.2`（lightweight tag，对象类型为 commit）
- package：`micromark@4.0.2`
- inspected：
  - `package.json`
  - `packages/micromark/package.json`
  - `packages/micromark/readme.md`
  - `packages/micromark/dev/index.js`
  - `packages/micromark/dev/stream.js`
  - `packages/micromark/dev/lib/parse.js`
  - `packages/micromark/dev/lib/create-tokenizer.js`
  - `packages/micromark/dev/lib/constructs.js`
  - `packages/micromark/dev/lib/preprocess.js`
  - `packages/micromark/dev/lib/postprocess.js`
  - `packages/micromark/dev/lib/compile.js`
  - `packages/micromark/dev/lib/initialize/document.js`
- observed：
  - published package is ESM-only; main export overloads `micromark(value[, encoding][, options])` as `compile(options)(postprocess(parse(options).document().write(preprocess()(value, encoding, true))))`;
  - `parse()` merges `defaultConstructs` with `settings.extensions` via `combineExtensions`, then exposes `document` / `content` / `flow` / `string` / `text` tokenizer factories;
  - constructs themselves live in `micromark-core-commonmark` and are keyed by character codes; GFM / MDX / math are not members of this workspace;
  - tokenizer effects are `attempt` / `check` / `interrupt` / `consume` / `enter` / `exit`; events are concrete enter/exit tokens with positional info;
  - `preprocess()` decodes `Uint8Array` with `TextDecoder`, skips a leading BOM, and normalizes `\0` / tab / CR / LF into chunks;
  - `postprocess()` loops `subtokenize(events)` until the event list is stable;
  - HTML compile is built in so CommonMark fixtures can be checked, but `compile.js` states markdown cannot be truly streaming and buffers events before output;
  - `stream()` is a minimal duplex: `write()` only tokenizes; `end()` is the first time `compile(postprocess(...))` emits `data`;
  - default `allowDangerousHtml` is false: HTML is still tokenized, then shown as text unless the flag is set;
  - default `allowDangerousProtocol` is false: image `src` allowlist is `https?`, link `href` allowlist is `https?|ircs?|mailto|xmpp`;
  - workspace `devDependencies` pin `commonmark.json` at `^0.31.0`; this review did not run that suite;
  - readme compatibility line for `micromark@4` is Node.js 16+.
- provenance：
  - npm `micromark@4.0.2` `gitHead` is `3fae15528f69dfaf2a8865a7f7d92bfb4abd7bc9`;
  - GitHub tag `4.0.2` points at the same commit;
  - this review binds that reachable revision and does not invent later unpublished commits.

## markdown-wasm

- canonical source：`https://github.com/rsms/markdown-wasm`
- revision：`0aa6c8ff6c717859599b32fb203166c1d73d838e`
- git tag：`v1.2.0`（lightweight tag，对象类型为 commit）
- package：`markdown-wasm@1.2.0`
- inspected：
  - `package.json`
  - `README.md`
  - `markdown.d.ts`
  - `src/md.js`
  - `src/md.c`
  - `src/fmt_html.c`
  - `src/fmt_html.h`
  - `src/common.h`
  - `src/md4c.h`
- observed：
  - published surface is `parse(source, options?)` plus `ready` and `ParseFlags`; Node entry is `dist/markdown.node.js`, browser UMD is `dist/markdown.js`, ESM is `dist/markdown.es.js`;
  - WASM module is compiled from vendored `src/md4c.c` plus `fmt_html.c`; `fmt_json.c` exists but is commented out of `md.c` and is not a public API;
  - `ParseFlags.DEFAULT` is `COLLAPSE_WHITESPACE | PERMISSIVE_ATX_HEADERS | PERMISSIVE_URL_AUTO_LINKS | STRIKETHROUGH | TABLES | TASK_LISTS` (GitHub-style, not strict CommonMark-only);
  - JS `parse()` copies source into WASM heap, calls `_parseUTF8`, then UTF-8-decodes a shared `outbuf` unless `bytes` / deprecated `asMemoryView` is set;
  - C `parseUTF8` resets one reusable output buffer and documents that it must not be used across overlapping host calls; `bytes=true` therefore aliases memory that the next `parse()` overwrites;
  - `fmt_html()` builds an `MD_PARSER` and calls `md_parse`; parse failure is treated as an extreme/OOM case and surfaced as `ERR_MD_PARSE`;
  - `allowJSURIs` only gates `<a href>` values that case-insensitively start with `javascript:`; `render_open_img_span` writes `src` without that check;
  - `onCodeBlock` is an Emscripten function pointer; a non-null return is inserted verbatim, so the callback owns HTML escaping;
  - ESM / browser consumers must await `ready` / `markdown.ready` before `parse()`; the Node CJS file embeds compressed WASM;
  - `master` is one readme-only commit ahead of `v1.2.0`; this review binds the tag, not master.
- provenance：
  - npm `markdown-wasm@1.2.0` `gitHead` is `0aa6c8ff6c717859599b32fb203166c1d73d838e`;
  - GitHub tag `v1.2.0` points at the same commit;
  - this review binds that reachable revision.
