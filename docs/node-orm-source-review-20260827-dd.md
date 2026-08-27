# Node ORM source review (writer DD)

> 用途：记录 mongoose、mikro-orm 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DD
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与升级文档阅读
- not executed：未安装两仓依赖，未连接数据库，未运行上游 test、migration、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## mongoose

- canonical source：`https://github.com/Automattic/mongoose`
- revision：`a4b8a603793247f236d76a7f6aa0d0ea5cfd24dd`
- git tag：`9.9.4`（lightweight tag，直接指向该提交）
- package：`mongoose@9.9.4`
- inspected：
  - `package.json`
  - `index.js`
  - `CHANGELOG.md`
  - `lib/index.js`
  - `lib/mongoose.js`
  - `lib/connection.js`
  - `lib/schema.js`
  - `lib/model.js`
  - `lib/query.js`
  - `lib/collection.js`
  - `lib/constants.js`
  - `lib/helpers/query/castUpdate.js`
  - `lib/helpers/updateValidators.js`
  - `lib/helpers/timestamps/setupTimestamps.js`
  - `lib/helpers/model/applyHooks.js`
  - `lib/drivers/node-mongodb-native/collection.js`
  - `lib/types/subdocument.js`
- observed：
  - CommonJS 入口 `index.js` → `lib/index.js` → `lib/mongoose.js`；无 `exports` 字段；`engines.node` 为 `>=20.19.0`；依赖 `mongodb@~7.5` 与 `kareem@3.3.0`；
  - `connect` / `save` / `Query#exec` 若传入 callback 会抛错；v9 去掉 callback API 与 `pre(next)` 风格；
  - `Schema.defaultOptions` 默认 `strict: true`、`strictQuery: false`、`validateBeforeSave: true`、`bufferCommands: true`、`versionKey: '__v'`、`timestamps` 需显式打开；
  - `Document#save` 默认先 `$validate()`，新文档 `insertOne`，已有文档走 `$__delta()` + `updateOne`，可触发 `VersionError`；
  - `Model.updateOne` / `findOneAndUpdate` 默认 `runValidators: false`；全局可用 `mongoose.set('runValidators')` 覆盖；update validator 只检查 update 里出现的 path；
  - `bufferCommands` 默认排队，`bufferTimeoutMS` 默认 10000；关闭缓冲且未连接时 collection 包装器抛错；
  - `find(null)` / `findOne(null)` 经 `Query.merge(null)` 把 `_conditions` 置空，`_validateOp()` 抛 `ObjectParameterError`；更新数组默认禁止，除非 `updatePipeline`；
  - 子文档 `save()` 只跑 hook，不单独写库。
- provenance：
  - GitHub tag `9.9.4` 与 npm `mongoose@9.9.4` 的 `gitHead` 均为 `a4b8a603...`。

## MikroORM

- canonical source：`https://github.com/mikro-orm/mikro-orm`
- revision：`fb178b49c36586bc82fed16a8809e125a8c64ffe`
- git tag：annotated `v7.1.14` 解引用到父提交 `cd79b2c3c8b44b1ea1094c31ced4fd50cfd639aa`（`chore(release): v7.1.14`）
- package：`@mikro-orm/core@7.1.14`（npm `gitHead` 即本 revision）
- inspected：
  - `package.json`
  - `packages/core/package.json`
  - `packages/core/src/MikroORM.ts`
  - `packages/core/src/EntityManager.ts`
  - `packages/core/src/utils/Configuration.ts`
  - `packages/core/src/utils/RequestContext.ts`
  - `packages/core/src/unit-of-work/IdentityMap.ts`
  - `packages/core/src/unit-of-work/UnitOfWork.ts`
  - `packages/core/src/unit-of-work/ChangeSetComputer.ts`
  - `packages/core/src/metadata/MetadataProvider.ts`
  - `packages/core/src/metadata/EntitySchema.ts`
  - `packages/decorators/package.json`
  - `packages/sql/package.json`
  - `docs/docs/upgrading-v6-to-v7.md`
- observed：
  - 原生 ESM；`engines.node` 为 `>= 22.17.0`；核心包导出 `.` → `./src/index.ts`；
  - `MikroORM.init(options)` 的 `options` 必填；`initSync` 已移除，同步路径是 `new MikroORM(options)`；
  - `allowGlobalContext` 默认 `false`；`orm.em` 标 `global = true`；无 RequestContext / TransactionContext 时 `getContext(true)` 抛 `cannotUseGlobalContext`；
  - `persist` / `remove` 只入 Unit of Work 并返回 `this`，写库发生在 `flush()` → `UnitOfWork.commit()`；`persistAndFlush` / `removeAndFlush` 已删除；
  - 独立 `flush()` 在未处于事务且平台 `implicitTransactions` 为真时包一层 connection transaction；
  - 装饰器迁到 `@mikro-orm/decorators`（`/legacy` 与 `/es`）；运行时默认 metadata provider 是不反射的基类 `MetadataProvider`，不是 `ReflectMetadataProvider`；
  - SQL 底座是 `@mikro-orm/sql` + Kysely；`@mikro-orm/knex` 不再是主链；默认 `loadStrategy: BALANCED`；
  - Filter 仍是默认条件注入；软删除是 `@Filter({ default: true })` 模式，不是独立软删引擎。
- provenance：
  - npm `@mikro-orm/core@7.1.14` 的 `gitHead` 为 `fb178b49...`；
  - 相对 tag 提交只改 package.json / changelog / jsr / yarn.lock，无 `.ts` / `.js` 运行时源码 diff。
