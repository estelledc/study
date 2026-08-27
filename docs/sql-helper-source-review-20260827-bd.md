# SQL helper source review (writer BD)

> 用途：记录 better-sqlite3、Knex 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL BD
- evidence：GitHub metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未编译 native addon，未运行上游 test、SQL、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## better-sqlite3

- canonical source：`https://github.com/WiseLibs/better-sqlite3`
- revision：`dbc2ea1165fef1f599b9be12faea33fa5e9d7ffb`
- package：`better-sqlite3@13.0.3`
- tag：annotated `v13.0.3` → tag object `0747dc94fb468715974716c6c54106ad6469d31b` → commit above
- inspected：
  - `package.json`
  - `lib/index.js`
  - `lib/database.js`
  - `lib/binding.js`
  - `lib/methods/wrappers.js`
  - `lib/methods/transaction.js`
  - `lib/methods/pragma.js`
  - `docs/api.md`
  - `docs/integer.md`
  - `test/13.database.prepare.js`
  - `test/20.statement.run.js`
  - `test/30.database.transaction.js`
- observed：
  - default entry constructs `Database` through `getBinding` and initializes the native addon once;
  - constructor defaults include `timeout: 5000`, `readonly: false`, and in-memory via `":memory:"` or a serialized `Buffer`;
  - `prepare()` forwards a single SQL string to the C++ statement object and rejects multiple statements;
  - `run` / `get` / `all` / `iterate` live on the native `Statement`; `run()` returns `{ changes, lastInsertRowid }`;
  - `transaction(fn)` returns a sync wrapper; nested calls use savepoint `` `\\t_bs3.\\t` ``; returning a thenable throws;
  - integers default to JavaScript numbers unless `defaultSafeIntegers()` / `safeIntegers()` is enabled;
  - package `engines.node` is `>=22`; prebuild keys cover linux/darwin/win32 x64 and arm64, plus linuxmusl.

## Knex

- canonical source：`https://github.com/knex/knex`
- revision：`e25d54bcb707714a17f5a5744eba5c4246bb4d1d`
- package：`knex@3.3.0`
- tag：lightweight `3.3.0` pointing at the same commit
- inspected：
  - `package.json`
  - `lib/knex-builder/Knex.js`
  - `lib/knex-builder/make-knex.js`
  - `lib/knex-builder/internal/config-resolver.js`
  - `lib/builder-interface-augmenter.js`
  - `lib/query/querybuilder.js`
  - `lib/execution/runner.js`
  - `lib/execution/transaction.js`
  - `lib/client.js`
  - `lib/constants.js`
  - `lib/dialects/index.js`
  - `lib/dialects/better-sqlite3/index.js`
  - `lib/dialects/sqlite3/index.js`
  - `lib/migrations/migrate/Migrator.js`
- observed：
  - `knex(config)` resolves a dialect, constructs a callable function, and attaches query/schema/migrate/seed facades;
  - `knex(tableName)` only builds a `QueryBuilder`; `then()` from the builder interface starts `Runner.run()`;
  - runner acquires one connection, compiles `toSQL()`, and forwards each statement through `client._query()`;
  - supported client names include `better-sqlite3`, `sqlite3`, `postgres`/`pg`, `mysql`, `mysql2`, `mssql`, `oracledb`, `mariadb`, `cockroachdb`, `redshift`, and `pgnative`;
  - dialect modules are lazy-loaded; drivers such as `better-sqlite3` are required at connection time, not bundled;
  - sqlite / better-sqlite3 pool defaults are `min: 1, max: 1`; generic pool defaults are `min: 2, max: 10`;
  - `transaction(container)` returns the dialect transaction promise; omitting the container yields a promise for a ready trx; `doNotRejectOnRollback` defaults to `true`;
  - better-sqlite3 dialect wraps sync `prepare` / `all` / `run` inside async `_query`, and maps `Date` → `valueOf()`, `boolean` → `Number`;
  - `migrate.latest()` lists pending files and may wrap the batch in one transaction when every migration opts into transactions.
