# ORM query builder source review D

> 用途：记录 Prisma、Kysely 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer D
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、migrate、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Prisma

- canonical source：`https://github.com/prisma/orm`
- historical URL：`https://github.com/prisma/prisma` 301 到 `prisma/orm`
- revision：`e92bc46e8fff73e3985f86f23393b7e3f0e90010`
- package：`prisma@7.10.0` / `@prisma/client@7.10.0`
- inspected：
  - `ARCHITECTURE.md`
  - `packages/client/src/runtime/getPrismaClient.ts`
  - `packages/client/src/runtime/RequestHandler.ts`
  - `packages/client/src/runtime/DataLoader.ts`
  - `packages/client/src/runtime/core/init/getEngineInstance.ts`
  - `packages/client/src/runtime/core/engines/client/ClientEngine.ts`
  - `packages/client/src/runtime/core/engines/client/LocalExecutor.ts`
  - `packages/client/src/runtime/core/engines/client/query-plan-cache.ts`
  - `packages/client/src/scripts/default-index.ts`
  - `packages/client-generator-ts/src/generator.ts`
  - `packages/config/src/defineConfig.ts`
  - `packages/config/src/PrismaConfig.ts`
  - `packages/cli/src/config.ts`
  - `packages/cli/src/init/ppg-output.ts`
  - `packages/migrate/src/commands/MigrateDev.ts`
  - `packages/prisma7/package.json`
- observed：
  - `PrismaClient` 构造函数必须提供 `adapter` 或 `accelerateUrl`；缺省会抛 `P2038`；
  - `getEngineInstance()` 只构造 `ClientEngine`；本地路径用 WASM `QueryCompiler` 生成 query plan，再由 `LocalExecutor` / `QueryInterpreter` 执行；
  - `RequestHandler` 用 `DataLoader` 把同一 tick 的请求 batch 到 `requestBatch`；
  - query plan cache 默认上限 1000，`0` 关闭；`createMany` / `createManyAndReturn` 不进 cache；
  - `prisma-client` generator 必须声明 `output`；`@prisma/client` 未 generate 时是 stub；
  - `defineConfig()` 把 datasource URL、schema 路径和 migrations 放到 `prisma.config.*`；
  - `migrate dev` / `deploy` 从 config 读 datasource URL；
  - 声明 Node `^20.19 || ^22.12 || >=24.0`；transaction 默认 `maxWait=2000`、`timeout=5000`。
- provenance conflict：
  - npm `prisma` 的 `latest` 是 `8.0.0-rc.12`，`@prisma/client` 的 `latest` 仍是 `7.10.0`；
  - GitHub Releases `latest` 指向 `v0.17.0`，不是当前稳定线；
  - 7.10.0 引入 `@prisma/prisma7`，用于与 Prisma 8 并存，不把 8.0 RC 当作本页适用版本。

## Kysely

- canonical source：`https://github.com/kysely-org/kysely`
- revision：`f24018c789c3cf7ad03ccc672ada63a1ded87f88`
- package：`kysely@0.29.5`
- inspected：
  - `package.json`
  - `src/kysely.ts`
  - `src/query-creator.ts`
  - `src/query-finalizer.ts`
  - `src/query-executor/default-query-executor.ts`
  - `src/query-executor/query-executor-base.ts`
  - `src/query-builder/select-query-builder.ts`
  - `src/util/column-type.ts`
  - `src/util/executable.ts`
  - `src/plugin/kysely-plugin.ts`
  - `src/dialect/dialect.ts`
  - `src/dialect/postgres/postgres-dialect.ts`
  - `src/migration/migrator.ts`
- observed：
  - 运行时 0 dependencies；`engines.node` 为 `>=22.0.0`；TypeScript `<5.4` 只导出过期 stub；
  - 构造时 `dialect` 分别创建 driver、compiler、adapter，再组成 `DefaultQueryExecutor`；
  - 查询链是 builder → `transformQuery` → `compileQuery` → `executeQuery` → `transformResult`；
  - `execute()` 返回全部 rows；`executeTakeFirst()` 取第一行；`executeTakeFirstOrThrow()` 默认抛 `NoResultError`；
  - `Generated<S>` 是 `ColumnType<S, S | undefined, S>` 的快捷方式；
  - 内置 `kysely/migration` 的 `Migrator` 默认表是 `kysely_migration` / `kysely_migration_lock`；
  - 一等 dialect 含 postgres、mysql、sqlite、mssql、pglite；
  - 官方 helpers / readonly / plugin 是可选出口，不是默认查询路径。
- provenance：
  - GitHub tag `v0.29.5`、annotated tag 与 npm `kysely@0.29.5` 都指向同一提交；
  - `v0.30.0-beta.1` 存在，本页不绑定。
