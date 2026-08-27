# Node ORM source review (writer T)

> 用途：记录 TypeORM、Sequelize 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer T
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未连接数据库，未运行上游 test、migration、`sync()` / `synchronize()`、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target originally assigned：mongoose + typeorm
- fallback used：sequelize + typeorm

## 选题与排除

- Study 清单没有 `mongoose` 项目页（`src/content/docs/projects/` 与 `data/project-standard-audit.json` 均无该 slug），不能在不新增 962nd 项目的前提下迁移 mongoose。
- 调用方禁止改写 `prisma` / `kysely` / `drizzle`；Open PR #62、#57 也已占用这些 slug。
- 同主题 Atlas 组内 `postgres-js` / `duckdb-wasm` 已被 PR #56 占用。
- 因此回退到仍空闲的 Node ORM 对：`typeorm` + `sequelize`。

## TypeORM

- canonical source：`https://github.com/typeorm/typeorm`
- revision：`8748b1be17bf93fc9b62b3444e411e9055e9e017`
- package：`typeorm@1.1.0`
- provenance：
  - annotated tag `1.1.0` → tag object `ee1f114ee34352272118b8e6b8fe7d4732c8a532` → peeled commit `8748b1be...`
  - that commit `package.json` reports `1.1.0`
  - npm `typeorm@1.1.0` exposes no `gitHead`; bind the reachable peeled tag
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`（1.1.0 / 1.0.0 段）
  - `src/index.ts`
  - `src/globals.ts`
  - `src/data-source/DataSource.ts`
  - `src/data-source/BaseDataSourceOptions.ts`
  - `src/data-source/DataSourceOptions.ts`
  - `src/driver/DriverFactory.ts`
  - `src/decorator/entity/Entity.ts`
  - `src/decorator/columns/Column.ts`
  - `src/repository/Repository.ts`
  - `src/repository/BaseEntity.ts`
  - `src/util/OrmUtils.ts`（`normalizeWhereCriteria`）
  - `src/query-builder/QueryBuilder.ts`（空 WHERE 拒绝）
  - `src/commands/MigrationGenerateCommand.ts`
  - `src/commands/InitCommand.ts`
- observed：
  - `src/index.ts` side-effect imports `reflect-metadata`
  - `Entity()` 把 table metadata 推进 `getMetadataArgsStorage()`；该 storage 存在 platform global
  - `DataSource` 构造即 `DriverFactory.create()`；`initialize()` 顺序为 connect → buildMetadatas → afterConnect → 可选 dropSchema → 可选 migrationsRun → 可选 synchronize
  - `synchronize` / `migrationsRun` / `dropSchema` 均为 opt-in
  - `DriverFactory` type 枚举无 `"sqlite"`；桌面 SQLite 为 `better-sqlite3` 或 `sqljs`
  - `invalidWhereValuesBehavior` 未配置时，plain-object where 的 `null` / `undefined` 默认 throw
  - 写 query type 若 where 渲染为空或 `1=1`，抛 `Empty criteria(s) are not allowed...`
  - `BaseEntity.save()` 转调 `getRepository().save(this)`
  - CLI `migration:generate <path>` 要求 `-d/--dataSource`
  - `engines.node` 为 `^20.19.0 || ^22.13.0 || >=24.11.0`；1.0.0 起 ES2023，去掉 Node 16/18
  - `packages/codemod` 存在，未运行

## Sequelize

- canonical source：`https://github.com/sequelize/sequelize`
- revision：`cb7f99ad05de56137672ab95586359ff6ceba004`
- package：`sequelize@6.37.8`
- provenance：
  - lightweight tag `v6.37.8` 与 npm `gitHead` 均为 `cb7f99ad...`
  - 该提交根 `package.json.version` 为 `0.0.0-development`（发布占位）；对外版本以 npm / tag 名为准
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/sequelize.js`
  - `src/model.js`（`init` / `findAll` / `create`）
  - `src/hooks.js`
  - `src/transaction.js`
  - `src/operators.ts`
- observed：
  - dialect switch 包含 mariadb、mssql、mysql、oracle、postgres、sqlite、db2、snowflake；default 错误文案漏 snowflake
  - `define()` 创建 `class extends Model {}` 再 `init()`
  - `Model.init` 默认 `timestamps: true`、`freezeTableName: false`、`paranoid: false`、`whereMergeStrategy: 'overwrite'`
  - 未给 `tableName` 时用 `freezeTableName ? name : underscoredIf(pluralize(name))`
  - `operatorsAliases` 为 object 或 boolean 时走 deprecation helpers
  - `transaction(fn)` 自动 commit/rollback；无回调只返回 `Transaction`
  - `beforeSave` hook 代理 `beforeUpdate` + `beforeCreate`
  - `engines.node` 为 `>=10.0.0`
  - npm `@sequelize/core@7.0.0-alpha.48` 不在本审查绑定范围

## 未执行

- 未 `npm install` / `pnpm install` 任一上游
- 未连接 Postgres / SQLite / 其他 dialect
- 未跑 TypeORM CLI、Sequelize `sync()`、上游 mocha
- 未测量 bundle、cold start 或查询吞吐
