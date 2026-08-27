# Cache source review (writer BZ)

> 用途：记录 Keyv、node-cache 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL BZ
- evidence：GitHub metadata、npm dist-tags、固定提交静态源码与类型阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Keyv

- canonical source：`https://github.com/jaredwray/keyv`
- revision：`e3f8f0099ea36bcd0b1ffcb62e7577c2c805281f`
- package：`keyv@5.6.0`
- provenance：
  - npm `dist-tags.latest` = `5.6.0`（2026-01-21）；registry 未提供 `gitHead`
  - GitHub tag `2026-01-20` 指向同一提交；`packages/keyv/package.json` 自报 `5.6.0`
  - GitHub latest release 是 `v6.0.0-rc.1`，本页不绑定预发布
- inspected：
  - `packages/keyv/package.json`
  - `packages/keyv/src/index.ts`
  - `packages/keyv/src/generic-store.ts`
  - `packages/keyv/src/hooks-manager.ts`
  - `packages/keyv/src/capabilities.ts`
  - `packages/serialize/src/index.ts`
- observed：
  - default store is `Map`; a valid adapter is `Map` or `{get,set,delete,clear}`
  - stored payload is `{ value, expires }` serialized by `@keyv/serialize`
  - TTL is milliseconds; `ttl === 0` is treated as no expiry
  - default namespace is `keyv` and `useKeyPrefix` defaults true, producing `namespace:key`
  - expiry is lazy on get / getMany / iterator; `has()` on a Map store also reads expiry
  - `throwOnErrors` defaults false; `get` swallows store errors unless enabled
  - `Symbol` values throw before serialize
  - iterator attachment is limited to `Map` or adapters whose `opts.dialect` / `opts.url` match an allowlist

## node-cache

- canonical source：`https://github.com/node-cache/node-cache`
- revision：`b64434a8303c5881145c68754b674478e714ca3a`
- package：`node-cache@5.1.2`
- provenance：
  - npm `dist-tags.latest` = `5.1.2`；`gitHead` 与 GitHub tag `v5.1.2` 一致
  - published 2020-07-01；engines `node >= 8.0.0`
- inspected：
  - `package.json`
  - `_src/index.coffee`
  - `_src/lib/node_cache.coffee`
  - `index.d.ts`
- observed：
  - process-local `EventEmitter` store in `@data`; no adapter layer
  - TTL is seconds; `stdTTL` 0 means infinity; wrap stores absolute `t` in milliseconds
  - `useClones` defaults true and clones on wrap/unwrap via the `clone` dependency
  - `checkperiod` defaults 600s and uses `setTimeout` + `unref`
  - `maxKeys` overflow throws `ECACHEFULL` before checking whether the key already exists
  - `keys()` lists `Object.keys(@data)` without expiry filtering; `has()` / `get()` call `_check`
  - `take()` is get-then-del
  - `forceString` condition is `forceString and not typeof value is "string"`; CoffeeScript `not` binds tighter than `is`
  - `index.d.ts` comments that `ttl(key, 0)` is similar to `del`, but `_src` treats `ttl === 0` as infinite lifetime
