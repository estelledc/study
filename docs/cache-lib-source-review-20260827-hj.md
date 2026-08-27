# Cache library source review (writer HJ)

> 用途：记录 cache-manager、quick-lru 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HJ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded pair partners：未选用 unstorage、lru-cache、keyv、node-cache；正文不把 redis / ioredis / BullMQ 写成对照目标

## cache-manager

- canonical source：`https://github.com/jaredwray/cacheable`
- package directory：`packages/cache-manager`
- revision：`069f7340194f29f8ad2310cec4b922c0ad21b4f9`
- package：`cache-manager@7.2.9`
- inspected：
  - `packages/cache-manager/package.json`
  - `packages/cache-manager/README.md`
  - `packages/cache-manager/src/index.ts`
  - `packages/cache-manager/src/keyv-adapter.ts`
  - `packages/cache-manager/test/wrap.test.ts`
  - `packages/cache-manager/test/ttl.test.ts`
  - `packages/cache-manager/test/get.test.ts`
  - `packages/utils/src/coalesce-async.ts`
  - `packages/utils/src/less-than.ts`
  - `packages/utils/src/run-if-fn.ts`
- observed：
  - date tag `2026-05-27` is the release commit that names `cache-manager@7.2.9`; the `packages/cache-manager` tree is byte-identical at later date tag `2026-06-27`;
  - npm `cache-manager@7.2.9` has no `gitHead`; registry `time["7.2.9"]` is `2026-06-27T18:20:09.842Z`; `latest` is `7.2.9` and `7.2.10` is absent from the version list;
  - this review does not bind `main` or any post-2026-08-04 unpublished line;
  - default `createCache()` builds an in-process `Keyv` and clears `serialize` / `deserialize`;
  - `wrap` coalesces on `` `${cacheId}::${key}` `` via `@cacheable/utils` `coalesceAsync`; refresh uses a separate `+++${cacheId}__${key}` key;
  - `ttl()` returns `raw.expires` (absolute epoch ms) or `undefined`, not remaining lifetime and not `null`;
  - v7 miss is `undefined`; README examples still show `null` in several method sections;
  - `nonBlocking` `get` uses `Promise.race` and can return a fast miss or swallow a raced error;
  - `wrap` itself still walks stores sequentially; `refreshAllStores` only changes which prefix of `stores` is rewritten;
  - `KeyvAdapter` maps a legacy `CacheManagerStore` onto Keyv; `get` treats `null` as miss.
- dependencies disclosed, not reviewed as pair targets：runtime `keyv@^5.6.0` and workspace `@cacheable/utils@2.4.2`.

## quick-lru

- canonical source：`https://github.com/sindresorhus/quick-lru`
- revision：`070bdf331d9e451f75f5335c127255a124d4270d`
- package：`quick-lru@7.3.0`
- inspected：
  - `package.json`
  - `readme.md`
  - `index.js`
  - `index.d.ts`
- observed：
  - annotated tag `v7.3.0` peels to the same commit as npm `gitHead`;
  - `package.json` has no runtime dependencies; `type=module`; `engines.node >= 18`; `sideEffects: false`;
  - `QuickLRU` extends `Map` and stores values as `{value, expiry}` in `#cache` / `#oldCache`;
  - when `#size >= maxSize`, `#oldCache` is evicted and the current map is promoted;
  - live size can sit between `maxSize` and `2 × maxSize`;
  - `get` promotes from `#oldCache`; `peek` / `expiresIn` do not;
  - `expiresIn` does not lazily delete; it may return a negative remaining age;
  - `onEviction` fires for generation eviction, lazy TTL delete, `resize` discards, and `evict()`; not for `delete()` / `clear()`;
  - `evict(count)` always keeps at least one item.
