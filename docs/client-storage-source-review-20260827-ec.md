# Client storage source review

> 用途：记录 localforage、idb 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EC
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试/文档阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器 IndexedDB、WebSQL、localStorage、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## localforage

- canonical source：`https://github.com/localForage/localForage`
- revision：`7323475989c0ddc51849d72b4acaec66f2b491c6`
- git tag：`1.10.0`
- package：`localforage@1.10.0`
- inspected：
  - `package.json`
  - `src/localforage.js`
  - `src/drivers/indexeddb.js`
  - `src/drivers/websql.js`
  - `src/drivers/localstorage.js`
  - `src/utils/normalizeKey.js`
  - `src/utils/serializer.js`
  - `src/utils/isIndexedDBValid.js`
  - `src/utils/promise.js`
  - `src/utils/executeCallback.js`
  - `README.md`
- observed：
  - the published module default-exports a singleton `LocalForage` instance; `createInstance(options)` constructs another;
  - built-in drivers are `asyncStorage` (IndexedDB), `webSQLStorage`, `localStorageWrapper`, tried in that order;
  - `DefinedDrivers` / `DriverSupport` are module-level maps shared by every instance;
  - `config()` after the first ready API returns an `Error` object and does not throw; `storeName` strips `\W` to `_`; `version` must be a number;
  - library methods are first wrapped by `ready()`, then replaced by the chosen driver implementation;
  - `normalizeKey` always `String()`s a non-string key and `console.warn`s;
  - missing keys and `undefined` values resolve as `null` so the API matches localStorage;
  - the IndexedDB driver stores `null` as `undefined` (IE 10 cannot persist `null`) and maps it back to `null` on complete;
  - IndexedDB blob support is probed on a dedicated object store, then overridden by a Chrome `<43` / Edge userAgent check;
  - Safari is treated as lacking usable IndexedDB unless `fetch` exists and its `toString()` contains `[native code`;
  - default WebSQL `size` is `4980736`; runtime dependency is `lie@3.1.1`;
  - `dropInstance` is optional; a custom driver missing it gets a rejecting stub.
- provenance：
  - npm `localforage@1.10.0` reports `gitHead=7323475989c0ddc51849d72b4acaec66f2b491c6`;
  - GitHub tag `1.10.0` points to the same commit, whose `package.json` reports `1.10.0`;
  - this review binds that tag/package/revision.

## idb

- canonical source：`https://github.com/jakearchibald/idb`
- revision：`77dd8bebf3669bbce9628e470a021ff63eb4acaf`
- git tag：`v8.0.3`
- package：`idb@8.0.3`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/entry.ts`
  - `src/wrap-idb-value.ts`
  - `src/database-extras.ts`
  - `src/async-iterators.ts`
  - `src/util.ts`
  - `test/open.ts`
  - `CHANGELOG.md`
  - `README.md`
- observed：
  - `src/index.ts` re-exports `openDB` / `deleteDB` / `wrap` / `unwrap`, then side-imports database extras and async iterators;
  - `openDB` calls `indexedDB.open`, promisifies the request, and optionally attaches `upgradeneeded` / `blocked` / `versionchange` / `close`;
  - opening without a version does not run `upgrade`; a never-created database becomes version `1`;
  - `wrap` turns `IDBRequest` into a Promise and wraps `IDBDatabase` / `IDBObjectStore` / `IDBIndex` / `IDBCursor` / `IDBTransaction` with a Proxy;
  - `IDBTransaction` gains `done` (complete/error/abort) and `store` (only when the transaction has a single store);
  - cursor `advance` / `continue` / `continuePrimaryKey` return a new Promise for the next cursor or `null`;
  - database shortcut methods (`get` / `put` / `add` / `delete` / `clear` / `count` and `*FromIndex`) each open a one-shot transaction; writes wait for both the request and `tx.done`;
  - `iterate` / `Symbol.asyncIterator` walk a cursor; if the consumer does not call an advance method, the iterator calls `continue()`;
  - `unwrap` reads `reverseTransformCache`; there are no runtime `dependencies`;
  - 8.x dropped EdgeHTML and browsers without `IDBCursor.request`; IE is not supported;
  - exports map `types` / `module` / `import` to `./build/index.js` and `default` to `./build/index.cjs`.
- provenance：
  - npm `idb@8.0.3` does not publish `gitHead`;
  - GitHub tag `v8.0.3` points to `77dd8bebf3669bbce9628e470a021ff63eb4acaf`, whose `package.json` reports `8.0.3`;
  - this review binds that tag/package/revision.
