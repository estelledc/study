# SQL-client source review (writer IT)

> 用途：记录 node-postgres、slonik 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer IT
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未连接 PostgreSQL，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target originally assigned：postgres.js + slonik
- fallback used：node-postgres + slonik

## 选题与排除

- `postgres-js` 已由 PARALLEL I / PR #56 绑定 `porsager/postgres@e7dfa145...` / `3.4.9`，不能再占同一 slug。
- 调用方禁止 `knex`、`db0`、`sql.js`、`better-sqlite3`、`kysely`、`prisma`、`drizzle`；开放 PR #115、#264 也已占用 better-sqlite3 / knex / db0 / sql.js。
- 禁止 `marked`、`markdown-it`、`ioredis`、`redis`、`BullMQ`。
- lane 字母 HM–ID 已保留，本轮使用 IT。
- 因此回退到仍空闲的 SQL 客户端对：`node-postgres`（`pg@8.23.0`）+ `slonik`（`49.10.9`）。slonik 默认 driver 直接 `import { Client } from "pg"`，两页构成底层 Client/Pool 与高层 sql token / 基数断言的对照。

## node-postgres

- canonical source：`https://github.com/brianc/node-postgres`
- revision：`df274d1ba9ad9d11a8f1079314faeafde7208207`
- package：`pg@8.23.0`
- provenance：
  - annotated tag `pg@8.23.0` → tag object `f6ae396d9e638a182bd61998f0ea1850d475dd57` → peeled commit `df274d1ba9...`
  - npm `pg@8.23.0` `gitHead` 与 peeled commit 一致
  - 该提交信息为 monorepo `Publish`，同时发布 `pg@8.23.0`、`pg-pool@3.14.0`、`pg-protocol@1.16.0` 等
- inspected：
  - `packages/pg/package.json`
  - `packages/pg/lib/index.js`
  - `packages/pg/lib/client.js`
  - `packages/pg/lib/query.js`
  - `packages/pg/lib/defaults.js`
  - `packages/pg/lib/utils.js`（`prepareValue` / `escapeIdentifier` / `escapeLiteral`）
  - `packages/pg/esm/index.mjs`
  - `packages/pg-pool/index.js`
- observed：
  - `module.exports` 是 `PG` 实例：`Client`、`Pool`（`poolFactory` 把 Client 绑进 `pg-pool`）、`Query`、`types`、`DatabaseError`、`escapeIdentifier` / `escapeLiteral`
  - ESM 入口只是 CJS 再导出；`native` 是惰性 getter，缺 `pg-native` 时为 `null`
  - `Client` 连过一次后再 `connect()` 抛 `Client has already been connected. You cannot reuse a client.`
  - `query()` 接受字符串、config 或带 `submit` 的 Query；无 callback 时返回 Promise，并在 catch 里 `Error.captureStackTrace`
  - 有参数或 `name` / `queryMode: 'extended'` / `rows` 时走 Parse/Bind/Execute；纯文本走 simple query
  - 同一 Client 上排队查询在非 `pipeline` 时发出 pg@9 弃用警告；`pipeline: true` 才允许未回包继续发送
  - `prepareValue` 把 `null` 与 `undefined` 都编成 SQL `NULL`
  - `Pool` 默认 `max=10`、`min=0`；未设 `idleTimeoutMillis` 时池内默认 `10000`（`pg.defaults.idleTimeoutMillis` 的 `30000` 不会自动灌进 Pool）
  - `Pool.query` 是 checkout → `client.query` → `release`；第一参数不能是函数
  - 双次 `release()` 抛错；`password` / `ssl.key` 设为不可枚举
  - `engines.node` 为 `>= 16.0.0`；许可 MIT
- not claimed：未测 native libpq、Cloudflare `pg-cloudflare`、真实 SCRAM、或 query pipeline 吞吐

## slonik

- canonical source：`https://github.com/gajus/slonik`
- revision：`0d9da1dcf8e4e85c3318c3bdfe69d5af10232f70`
- package：`slonik@49.10.9`
- provenance：
  - annotated tag `slonik@49.10.9` → tag object `8d8f4513641693918ae69fb54ef310f66c6242f0` → peeled commit `0d9da1dc...`
  - 提交信息为 `Version Packages (#819)`
  - npm `slonik@49.10.9` 无 `gitHead`；绑定可达 peeled tag，不伪造 npm publish tree
- inspected：
  - `packages/slonik/package.json`
  - `packages/slonik/src/index.ts`
  - `packages/slonik/src/factories/createPool.ts`
  - `packages/slonik/src/factories/createClientConfiguration.ts`
  - `packages/slonik/src/factories/createPoolConfiguration.ts`
  - `packages/slonik/src/factories/createConnectionPool.ts`
  - `packages/slonik/src/factories/createTypeParserPreset.ts`
  - `packages/slonik/src/factories/typeParsers/createBigintTypeParser.ts`
  - `packages/slonik/src/factories/typeParsers/createNumericTypeParser.ts`
  - `packages/slonik/src/binders/bindPool.ts`
  - `packages/slonik/src/routines/executeQuery.ts`
  - `packages/slonik/src/connectionMethods/{query,one,transaction,nestedTransaction,exists}.ts`
  - `packages/sql-tag/src/factories/createSqlTag.ts`
  - `packages/sql-tag/src/utilities/formatSlonikPlaceholder.ts`
  - `packages/sql-tag/src/types.ts`
  - `packages/pg-driver/src/factories/createPgDriverFactory.ts`
  - `packages/slonik/README.md`（result parser interceptor 段）
- observed：
  - `createPool` 是 async：建 driver → 自有连接池 → `warmup()` → `bindPool`
  - 默认 `createPgDriverFactory()`，内部 `import { Client } from "pg"`，不用 `pg-pool`
  - 默认 `maxPoolSize=10`、`minPoolSize=0`、`idleTimeout=5000`、`connectionTimeout=5000`、`statementTimeout=60000`、`queryRetryLimit=5`、`transactionRetryLimit=5`、`resetConnection` 发 `DISCARD ALL`
  - 导出的 `sql` 不是可调用 tag；查询必须 `sql.unsafe` / `sql.type` / `sql.prepared`，片段用 `sql.fragment`
  - tag 函数检查 `parts.raw` 冻结，否则 `InvalidInputError`；`undefined` 绑定抛错
  - 内部占位符是 `$slonik_N`，`executeQuery` 一次性换成 `$N`
  - `one` / `many` / `maybeOne` 等在 `executeQuery` 里做行数/列数断言，分别抛 `NotFoundError` 或 `DataIntegrityError`
  - `sql.type(schema)` 只把 Standard Schema 挂到 token 的 `parser`，经 `resultParser` 交给 interceptor；核心路径不自动 `~standard.validate`
  - 事务发 `START TRANSACTION` / `COMMIT` / `ROLLBACK`；嵌套发 `SAVEPOINT slonik_savepoint_N`；默认禁止跨连接使用同一 `transactionId`
  - 默认 type parser：`int8` → `BigInt`，`numeric` → `Number.parseFloat`
  - `engines.node` 为 `>=24`；许可 BSD-3-Clause
- not claimed：未跑 interceptor 校验、未测 OpenTelemetry span、未连库验证 retry / SSL
