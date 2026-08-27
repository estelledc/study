# JS SQL runtime source review

> 用途：记录 postgres.js 与 duckdb-wasm 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL I
- evidence：GitHub metadata、npm provenance 与固定提交静态源码阅读
- not executed：未安装两仓依赖，未连接 PostgreSQL，未实例化 WASM，未发送 HTTP Range，未运行上游 test / karma / benchmark
- worktrees：本机 `research-worktrees/postgres-js` 与 `research-worktrees/duckdb-wasm`，不进入 Git

## postgres.js

- canonical source：`https://github.com/porsager/postgres`
- revision：`e7dfa14519f363229ccc3ead7b1b2f2051937efb`
- package：`postgres@3.4.9`
- npm gitHead：与 revision 一致
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/query.js`
  - `src/queue.js`
  - `src/connection.js`
  - `src/types.js`
  - `src/errors.js`
  - `src/subscribe.js`
  - `README.md`（Numbers / transactions / listen 合同）
- observed：
  - tagged template 生成 `Query`；单字符串生成 `Identifier`；对象生成 `Builder`；后两者 `await` 抛 `NOT_TAGGED_CALL`；
  - `Query` 是惰性 Promise，默认 `undefined` 抛 `UNDEFINED_VALUE`；
  - 连接池用七队列 + `move()`，默认 `max=10`（Cloudflare 3）、`max_pipeline=100`、`prepare=true`；
  - `begin()` reserve 一条连接，回调 `sql.savepoint()` 发 SAVEPOINT，回调 `sql` 不带池级 `begin`；
  - `listen()` 另建 `max:1` 实例；`subscribe()` 创建 `TEMPORARY LOGICAL pgoutput` 槽；
  - 默认 number parser 不含 oid 20 / 1700，`bigint` 与 `numeric` 默认保持字符串。

## duckdb-wasm

- canonical source：`https://github.com/duckdb/duckdb-wasm`
- revision：`fa1d47b38ed0821cecab0bdc331c48abd0f2cc65`
- GitHub release：`v1.33.0`
- npm mapping：同一 gitHead 发布为 `@duckdb/duckdb-wasm@1.32.1-dev1.0`；不存在 `1.33.0`；仓内 `packages/duckdb-wasm/package.json` version 仍为 `1.11.0`
- inspected：
  - `packages/duckdb-wasm/package.json`
  - `packages/duckdb-wasm/src/index.ts`
  - `packages/duckdb-wasm/src/platform.ts`
  - `packages/duckdb-wasm/src/version.ts`
  - `packages/duckdb-wasm/src/parallel/async_bindings.ts`
  - `packages/duckdb-wasm/src/parallel/async_connection.ts`
  - `packages/duckdb-wasm/src/parallel/worker_dispatcher.ts`
  - `packages/duckdb-wasm/src/bindings/connection.ts`
  - `packages/duckdb-wasm/src/bindings/config.ts`
  - `packages/duckdb-wasm/src/bindings/runtime.ts`
  - `packages/duckdb-wasm/src/bindings/runtime_browser.ts`
  - `packages/duckdb-wasm/src/utils/opfs_util.ts`
  - `packages/duckdb-wasm/test/opfs.test.ts`
  - `lib/src/config.cc`
  - `lib/src/io/web_filesystem.cc`
  - `lib/cmake/duckdb.cmake`
- observed：
  - `selectBundle` 按 exception/SIMD/threads/COI 在 mvp/eh/coi 中选择；`getJsDelivrBundles()` 不含 coi；
  - `AsyncDuckDB` 经 Worker 消息跑查询，`query()` 把 IPC 文件式缓冲收成 Arrow Table；
  - HTTP/S3 打开与读取使用同步 XHR Range；`allow_full_http_reads` 默认 true；
  - OPFS 主路径是 `open({ path: 'opfs://...' })` + `FileSystemSyncAccessHandle`，并给 `.wal` 预开句柄；
  - `createScalarFunction` 只在同步 `DuckDBConnection`；
  - 未把后继 npm `1.33.1-dev*` 绑进本页。
