---
title: Kysely — TypeScript SQL 查询构建器
来源: https://github.com/kysely-org/kysely
日期: 2026-05-29
分类: ORM / 查询构建器
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/kysely-org/kysely
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f24018c789c3cf7ad03ccc672ada63a1ded87f88
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.29.5
---

## 是什么

Kysely 是一个 TypeScript 优先的 SQL 查询构建器。日常类比：它不替你炒菜，只给你一套带量杯的锅铲——你还是在写 `select` / `where` / `join`，但列名和值类型会在编译期被 `Database` 接口核对。

```ts
const user = await db
  .selectFrom("users")
  .select(["id", "email"])
  .where("id", "=", 1)
  .executeTakeFirst();
```

`execute()` 返回全部 rows；`executeTakeFirst()` 只取第一行；`executeTakeFirstOrThrow()` 空结果时默认抛 `NoResultError`。0.29.5 运行时 0 dependencies，声明 Node `>=22`。

## 为什么重要

不理解 Kysely 把“类型”和“执行”拆开，就解释不了：

- 为什么没有 `schema.prisma` 也能得到 `{ id: number; email: string } | undefined`
- 为什么 `compile()` 可以只出 SQL、不碰数据库
- 为什么内置 `Migrator` 仍然不会根据 interface 自动 diff 出 ALTER
- 为什么 TypeScript 4.x 项目装上 0.29.5 只会看到过期 stub

## 核心要点

固定 0.29.5 的主链可以拆成五步：

1. **手写 `Database` 接口**：表名是 key，列用 `string` / `Generated<T>` / `ColumnType<S, I, U>` 描述 select / insert / update 三种形状。

2. **dialect 装配执行器**：构造 `Kysely` 时，`dialect.createDriver()`、`createQueryCompiler()`、`createAdapter()` 组成 `DefaultQueryExecutor`。一等 dialect 有 postgres、mysql、sqlite、mssql、pglite。

3. **不可变 builder**：`selectFrom` / `insertInto` / `updateTable` / `deleteFrom` / `mergeInto` 每一步返回新对象，类型沿链累积。

4. **编译**：`toOperationNode()` 先跑 plugin 的 `transformQuery`（必须保持 node kind），再 `compileQuery` 得到 `{ sql, parameters }`。

5. **执行**：`executeQuery` 向 driver 要连接、跑 SQL，再跑 `transformResult`。`AbortSignal` 可选；默认 `inflightQueryAbortStrategy` 是 `ignore query`。

## 实践示例

### 案例 1：Database 类型 + dialect

```ts
import { Kysely, Generated, ColumnType, PostgresDialect } from "kysely";
import { Pool } from "pg";

interface Database {
  users: {
    id: Generated<number>;
    email: string;
    name: string | null;
    created_at: ColumnType<Date, string | undefined, never>;
  };
}

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
});
```

`Generated<S>` 等于 `ColumnType<S, S | undefined, S>`：insert 可省略，update 仍是 `S`。`pool` 也可以是 `async () => new Pool(...)`，第一次用到才创建。

### 案例 2：compile 与 execute 分开

```ts
const qb = db
  .selectFrom("users")
  .select(["id", "email"])
  .where("id", "=", 1);

const compiled = qb.compile();
// compiled.sql / compiled.parameters 已是 dialect SQL

const user = await qb.executeTakeFirst();
```

类型安全停在编译期。同事改了真实列类型但没改 interface，TS 不会报警。

### 案例 3：一等 Migrator，不是 schema diff

```ts
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { promises as fs } from "node:fs";
import path from "node:path";

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: "migrations",
  }),
});

await migrator.migrateToLatest();
```

默认记录表是 `kysely_migration`，锁表是 `kysely_migration_lock`。`up` / `down` 是你自己写的 Kysely 语句；它不会读取 `Database` 接口去生成 SQL。

## 踩过的坑

1. **把“没有 Prisma migrate”说成“没有 migration”**：0.29.5 在 `kysely/migration` 提供 `Migrator` 与 `FileMigrationProvider`。缺的是自动 schema diff，不是迁移运行器。

2. **忽略 Node / TypeScript 下限**：`engines.node` 是 `>=22.0.0`；`<5.4` 的 TypeScript 只会解析到 `outdated-typescript.d.ts`。

3. **信任手写 interface 等于库状态**：Kysely 不 generate 客户端。interface 过期时，编译期绿灯、运行时列类型仍可能对不上。

4. **plugin 改 query 种类**：`transformQuery` 必须返回同一 `kind`，否则执行器直接抛错。

5. **把 `v0.30.0-beta` 当 0.29.5 合同**：beta tag 已存在；本页只绑定 `v0.29.5`。

## 适用 vs 不适用场景

**适用**：

- 已有 SQL 库，想要类型安全但不想引入 codegen 客户端
- 需要 `compile()` 先审查 SQL，再决定是否执行
- Node 22+，并接受自己维护 `Database` 接口或外部 codegen

**不适用**：

- 想从一份 DSL 同时得到 migrate SQL 和生成客户端 → 看 [[prisma]]
- TypeScript 低于 5.4，或必须跑在 Node 20
- MongoDB：0.29.5 的 dialect 都是 SQL
- 需要本页未测量的“30KB / 更快冷启动”结论

## 固定版本边界

- 本文绑定 `kysely-org/kysely@f24018c7...`，tag 与 package 均为 `0.29.5`。
- 运行时 0 dependencies；官方 helpers、`readonly` 与 plugin 是可选出口。
- 一等 dialect：PostgreSQL、MySQL、SQLite、MS SQL Server、PGlite。社区 adapter 不在本提交保证范围内。
- 本文未安装 `pg` / `better-sqlite3`、未跑上游 mocha / tsd、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **builder 可以 1:1 贴近 SQL**——代价是关系嵌套、schema 演化都要自己接。
2. **类型安全不是运行时校验**——`Database` 接口是编译期契约，不是 introspection 结果。
3. **迁移运行器 ≠ schema 源头**——`Migrator` 执行你写的 `up` / `down`，不替你算 diff。
4. **dialect 是四件套**——driver、compiler、adapter、introspector 可以替换，查询 API 保持同一套。

## 应用型自测

1. `executeTakeFirst()` 在 0 行结果时返回什么？和 `executeTakeFirstOrThrow()` 差在哪？
2. 不提供 `down()` 的 migration，往下回滚时会怎样？
3. plugin 把 `SelectQueryNode` 变成另一种 `kind`，执行前会怎样？

检查点：

1. 返回 `undefined`；OrThrow 默认抛 `NoResultError`。
2. 这条 migration 在 down 方向被跳过。
3. `transformQuery` 抛错，因为 kind 必须保持不变。

## 延伸阅读

- 文档：[kysely.dev/docs/intro](https://kysely.dev/docs/intro)
- 固定源码：[kysely-org/kysely](https://github.com/kysely-org/kysely) —— 本文绑定提交 `f24018c789c3cf7ad03ccc672ada63a1ded87f88`
- [[prisma]] —— schema-first ORM 对照

## 关联

- [[prisma]] —— schema + codegen 对照；Kysely 把 schema 真相留在 TypeScript 接口
- [[typescript]] —— 0.29.5 要求 TS 5.4+ 才能看到真实类型
- [[postgresql]] —— `PostgresDialect` 使用 `pg` Pool

## 反向链接
