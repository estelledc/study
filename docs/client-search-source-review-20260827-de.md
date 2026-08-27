# Client-search source review (writer DE)

> 用途：记录 MiniSearch、Fuse.js 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DE
- evidence：GitHub tag metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、demo 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：`meilisearch`、`typesense`

## MiniSearch

- canonical source：`https://github.com/lucaong/minisearch`
- revision：`3d239d1c3ae7aef1bf5d8945dd7b5f0709f646f5`
- git tag：`v7.2.0`
- package：`minisearch@7.2.0`
- inspected：
  - `package.json`
  - `README.md`
  - `DESIGN_DOCUMENT.md`
  - `src/index.ts`
  - `src/MiniSearch.ts`
  - `src/SearchableMap/SearchableMap.ts`
  - `src/SearchableMap/fuzzySearch.ts`
- observed：
  - no production `dependencies`; `exports` expose `.` and `./SearchableMap`;
  - `fields` is mandatory; default `idField` is `id`;
  - default `tokenize` is `text.split(/[\n\r\p{Z}\p{P}]+/u)`; default `processTerm` is `toLowerCase()`;
  - inverted index is a `SearchableMap` radix tree; prefix and fuzzy walk that tree;
  - default search is exact terms only (`prefix: false`, `fuzzy: false`); `maxFuzzy` is `6`;
  - scoring is BM25+ with `{ k: 1.2, b: 0.7, d: 0.5 }`; default combine is OR;
  - empty string search returns no hits; `MiniSearch.wildcard` matches all stored docs;
  - `remove` needs the original document; `replace` is `discard` + `add` and relies on vacuum;
  - `autoSuggest` defaults to AND, and only prefixes the last token;
  - `loadJSON` requires the same options used when serializing.
- provenance：
  - GitHub tag `v7.2.0` identifies this reachable revision;
  - npm `minisearch@7.2.0` publishes no `gitHead`; identity is tag + package version + commit SHA.

## Fuse.js

- canonical source：`https://github.com/krisk/Fuse`
- revision：`45bac9fe2e71fe8c680c861a35a8b226c4ae6d5a`
- git tag：`v7.5.0`（annotated object 指向上述 commit）
- package：`fuse.js@7.5.0`
- inspected：
  - `package.json`
  - `src/entry.ts`
  - `src/core/index.ts`
  - `src/core/config.ts`
  - `src/core/register.ts`
  - `src/core/computeScore.ts`
  - `src/tools/KeyStore.ts`
  - `src/tools/FuseIndex.ts`
  - `src/tools/fieldNorm.ts`
  - `src/tools/MaxHeap.ts`
  - `src/search/bitap/search.ts`
  - `src/search/bitap/index.ts`
  - `src/search/bitap/constants.ts`
- observed：
  - no production `dependencies`; Node engines `>=10`;
  - default searcher is Bitap; it scans indexed field strings rather than an inverted term index;
  - defaults: `threshold=0.6`, `location=0`, `distance=100`, `shouldSort=true`, `includeScore=false`, `useTokenSearch=false`, `useExtendedSearch=false`;
  - score `0` is a perfect match; default sort is ascending score then `idx`;
  - empty/whitespace string query returns all documents (optionally sliced by `limit`);
  - Bitap patterns longer than `MAX_BITS=32` are chunked; `minMatchCharLength` can turn a hit into `isMatch=false` when highlight indices are empty;
  - `KeyStore` normalises key weights so they sum to `1`; scoring reads those normalised weights;
  - field-length norm is `1/sqrt(wordCount)` with ASCII whitespace + NBSP as separators;
  - `useTokenSearch` / `useExtendedSearch` throw when the corresponding build flag is off; `Fuse.match` rejects `useTokenSearch`;
  - `limit` plus `shouldSort` uses `MaxHeap` and an `idx` tie-break so top-N matches a full sort then slice.
- provenance：
  - GitHub annotated tag `v7.5.0` points to `45bac9fe...`;
  - npm `fuse.js@7.5.0` `gitHead` is `457fe762...`, one docs-only commit after the tag (`docs/getting-started.md`); `src/` is identical;
  - this note binds the reachable GitHub tag commit, not the later docs bump.
