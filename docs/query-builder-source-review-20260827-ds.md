# Query builder source review

> 用途：记录 Objection、Bookshelf 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、SQL、migration、bundle 或性能 benchmark
- worktrees：本机 `/tmp/ds-worktrees/`，不进入 Git
- pair：两库都把 Knex QueryBuilder 当成执行底座，但模型合同不同；不占用已开放 PR 中的 knex / kysely slug

## Objection

- canonical source：`https://github.com/Vincit/objection.js`
- revision：`76fb48ee56d37f68849009e78964a235ea7e1e17`
- package：`objection@3.1.5`
- inspected：
  - `package.json`
  - `lib/objection.js`
  - `lib/initialize.js`
  - `lib/transaction.js`
  - `lib/model/Model.js`
  - `lib/model/AjvValidator.js`
  - `lib/queryBuilder/QueryBuilder.js`
  - `lib/queryBuilder/graph/GraphOptions.js`
  - `lib/queryBuilder/operations/eager/WhereInEagerOperation.js`
- observed：
  - public `Model` / `QueryBuilder` wrappers inherit native ES classes so Babel can still use ES5 inheritance;
  - `Model.query(trx)` builds `QueryBuilder.forClass(this).transacting(trx)` and calls `onCreateQuery`;
  - `Model.knex()` stores a non-enumerable `$$knex`; `bindKnex` / `bindTransaction` produce bound subclasses;
  - `QueryBuilder.then` / `catch` call `execute()`, which clones the builder, then `beforeExecute` → `doExecute` → `afterExecute`;
  - `writeOperation` rejects a second write method on the same builder (`insert` / `update` / `patch` / `delete` / `relate` / `unrelate` / increment / decrement);
  - `withGraphFetched` uses `WhereInEagerAlgorithm`; `withGraphJoined` uses `JoinEagerAlgorithm`;
  - WhereIn batch sizes are dialect-dependent (MSSQL 2000, Oracle 1000, SQLite 999, otherwise 10000);
  - `insertGraph` / `upsertGraph` wrap write operations with `GraphOptions` (`relate`, `unrelate`, `insertMissing`, `fetchStrategy`);
  - `throwIfNotFound` treats empty array, `null`, `undefined`, or `0` as missing;
  - `AjvValidator` keeps two Ajv instances: `useDefaults: true` for full objects and `useDefaults: false` for `patch`;
  - `transaction(Model, ..., cb)` binds each class with `bindTransaction(trx)` before invoking the callback;
  - `package.json` reports `engines.node >= 14`, dependencies `ajv` / `ajv-formats` / `db-errors`, and peer `knex >= 1.0.1`.
- provenance note：
  - npm `objection@3.1.5` reports `gitHead=76fb48ee56d37f68849009e78964a235ea7e1e17`;
  - GitHub tag `3.1.5` is the same commit, and `package.json` reports `3.1.5`;
  - this review binds that shared revision.

## Bookshelf

- canonical source：`https://github.com/bookshelf/bookshelf`
- revision：`58058a7426f6551c46591f7fbe48ba7d7e88447b`
- package：`bookshelf@1.2.0`
- inspected：
  - `package.json`
  - `bookshelf.js`
  - `lib/bookshelf.js`
  - `lib/model.js`
  - `lib/base/model.js`
  - `lib/base/events.js`
  - `lib/sync.js`
  - `lib/eager.js`
  - `lib/relation.js`
- observed：
  - `Bookshelf(knex)` throws unless `knex && knex.name === 'knex'`;
  - the instance owns a registry (`model` / `collection`) that `preventOverwrite`s duplicate names and can resolve string relation targets;
  - `builderFn` creates `knex(table)` or `knex.queryBuilder()` and forwards knex `query` events onto the model;
  - `transaction()` is `this.knex.transaction.apply(...)`; callers must pass `{transacting}` into `fetch` / `save` / `destroy`;
  - `Events#triggerThen` uses Bluebird `Promise.mapSeries` so `saving` / `creating` / `updating` handlers can reject the write;
  - `requireFetch` defaults to `true`; empty `fetch` throws `NotFoundError` unless `options.require === false`;
  - `isNew()` is `this.id == null`; `saveMethod` forces `update` when `patch` is set, otherwise uses `options.method` or `isNew`;
  - `save` merges defaults on insert, optionally stamps `hasTimestamps`, then fires `saving creating` or `saving updating`;
  - `fetch({withRelated})` first loads the row via `sync().first()`, then `EagerRelation`;
  - `plugin('pagination'|'visibility'|'registry')` only warns because those plugins moved into core; `processor` / `case-converter` / `virtuals` warn that they were removed;
  - `package.json` reports `engines.node >= 6`, dependencies `bluebird` / `lodash` / `inflection` / `create-error`, and peer `knex >= 0.15.0 < 0.22.0`.
- provenance note：
  - npm `bookshelf@1.2.0` reports `gitHead=54928fec3065442b9ecea7a80995bb782ed84b30` (merge of PR #2079);
  - that commit is reachable, but GitHub tag `1.2.0` peels to `58058a7426f6551c46591f7fbe48ba7d7e88447b` (`Release 1.2.0`);
  - both commits' `package.json` report `1.2.0`; this review binds the reachable tag commit and does not invent a tree for the npm `gitHead`.
