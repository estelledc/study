---
title: "Drizzle ORM — TS-first SQL builder 与"反 DSL 派"的胜利"
description: schema 用纯 TS 写、类型从 schema 推、SQL builder 直接生成 query——一条不绕过 SQL 的 ORM 路线
sidebar:
  order: 21
  label: "drizzle-orm"
---

> drizzle-team/drizzle-orm v0.45.x，commit `48e5406027103a9fca6eb66417187c4a8b5c6aa3`（2026-05-28 读），Apache-2.0。
>
> Drizzle 解决的是 Prisma 解决不了的问题：**Prisma 让你写一份 `.prisma` DSL，然后跑 `prisma generate` 出 client**——
> 这意味着你的 schema 和你的 TS 代码是两个世界，还得跑一个代码生成步骤；
> 你看 SQL 时是从 client 推 SQL，看错误时是从 SQL 推 client，类型只覆盖 happy path。
>
> Drizzle 的判断：**schema 用 TS 写**（`pgTable('users', { id: serial(...).primaryKey(), name: text(...) })`），
> **类型从 schema 直接推导**（`InferSelectModel<typeof users>`），
> **query 是一个 fluent builder 直接对应 SQL**（`db.select().from(users).where(...)`）——
> 不再有"DSL → 生成代码 → 用代码"这个三明治。
>
> Season 6 第一篇 · v1.1 项目类型分支 D（框架/SDK）。
>
> ~28k stars，TypeScript 100%，零 codegen，dialect 三套（pg-core / mysql-core / sqlite-core）。

## 一句话定位

**Drizzle = 一个把 SQL schema 写成 TS 对象 + 把 query 写成 fluent builder + 把类型完全从 schema 推导出来的 ORM。**
没有 DSL，没有 codegen 步骤，没有 magic active record 抽象——它就是一个高级版的 SQL builder + 类型系统。

![Drizzle 架构图：schema → 类型推导 → query builder → dialect → SQL](/projects/drizzle/01-architecture.webp)

## 核心信息表

| 字段 | 值 |
|---|---|
| 仓库 | [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) |
| star / fork | ~28k / ~700（2026-05 读） |
| 最近活跃 | 2026-05 主线持续更新（PR 持续合并） |
| 读时 commit | `48e5406027103a9fca6eb66417187c4a8b5c6aa3` |
| 主语言 | TypeScript（核心 100% TS，零运行时依赖） |
| 维护方 | drizzle-team（Andrii Sherman / Alex Blokh + 社区） |
| 主要贡献者 | AndriiSherman / AlexBlokh / dankochetov |
| License | Apache-2.0 |
| Workspace | drizzle-orm / drizzle-kit（migrator CLI）/ drizzle-zod / drizzle-valibot / drizzle-arktype / drizzle-seed |
| 类似项目 | Prisma · Kysely · TypeORM · MikroORM · Sequelize · Knex |

## 项目类型自标 · v1.1 分支 D 框架/SDK

- **类型**：框架/SDK（提供 abstraction：schema / query builder / migrator + extension points：custom dialect / custom column type / custom logger）
- **心脏物**：`Table` 基类 + 各 dialect 的 `*Table` + `Dialect.sqlToQuery` + `*Database` 类
- **extension points**：
  - **custom dialect**（实现 `PgDialect`/`MySqlDialect`/`SQLiteDialect` 子类——drizzle 自带 `gel` 就是这条路径）
  - **custom column type**（继承 `PgColumn` + `PgColumnBuilder`，实现 `getSQLType()` / `mapToDriverValue` / `mapFromDriverValue`）
  - **custom logger**（实现 `Logger.logQuery(query, params)`）
  - **RQB v2**（relational query builder，`db.query.users.findMany({ with: { posts: true } })`——独立 builder 实现）
  - **migrator hooks**（drizzle-kit 是独立 CLI，但 runtime `migrate()` API 可被嵌入）
- **混合特征**：少量"运行时"特征（每种数据库 driver 是 runtime 的薄壳，比如 `pg-core/session.ts` 是抽象，`node-postgres/session.ts` 是 pg 库的 adapter）但核心仍是 abstraction，不是编译器。

## Why（为什么是它而不是 Prisma / Kysely / TypeORM）

ORM 在 TS 世界有三条历史路线：

```
2011: TypeORM         active record / data mapper, OO 派, decorator-driven
2018: Prisma          .prisma DSL + codegen, "DSL 派"
2021: Kysely          纯 TS query builder, 不管 schema, "SQL builder 派"
2022: Drizzle         schema 也用 TS + builder + 推导, "schema-as-code 派"
```

**核心痛点**：

```typescript
// Prisma —— DSL + codegen
// schema.prisma
model User {
  id    Int    @id @default(autoincrement())
  name  String
  posts Post[]
}
// 然后跑 npx prisma generate → 生成 node_modules/.prisma/client
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const users = await prisma.user.findMany({ include: { posts: true } })
// 问题：schema 是 DSL，不是 TS；types 是 generated，每次改 schema 要重跑 generate；
// SQL 不可见，性能 tuning 要看 explain；client bundle 大（~10MB）

// Kysely —— SQL builder，不管 schema
interface Database {
  user: { id: number; name: string }
  post: { id: number; user_id: number; title: string }
}
const db = new Kysely<Database>(...)
const users = await db.selectFrom('user').selectAll().execute()
// 问题：schema 你自己手写 interface，没 migration 工具，没 relation 系统

// Drizzle —— schema 也是 TS，类型从 schema 推
import { pgTable, serial, text } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-postgres'

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
})
// 类型自动推导出来：
// type User = typeof users.$inferSelect  → { id: number; name: string }
const db = drizzle(pool)
const all = await db.select().from(users)
// SQL: select "id", "name" from "users"
```

| 框架 | schema 在哪 | 类型来源 | SQL 可见性 | bundle | codegen |
|---|---|---|---|---|---|
| **TypeORM** | decorator on class | OO + reflect-metadata | 半透明 | ~600KB | 否 |
| **Prisma** | `.prisma` DSL 文件 | `prisma generate` 生成 | 不可见 | ~10MB | **是** |
| **Kysely** | 你手写 interface | 手写 interface | 完全可见 | ~30KB | 否 |
| **Drizzle** | TS 对象 | 从 schema `$infer*` 推导 | **完全可见** | ~50KB | **否** |
| **MikroORM** | decorator + entity manager | OO | 半透明 | ~800KB | 部分 |

Drizzle 站位：**没 DSL（vs Prisma）+ 有 schema（vs Kysely）+ 没 OO 包袱（vs TypeORM）**。

它放弃了：
- Prisma 那种"漂亮的 DSL 视觉效果"（schema.prisma 高亮非常好看）
- TypeORM 那种"Java/C# 程序员一眼就懂"的 entity class 心智
- "ORM 应该自动 cache / lazy load / change tracking"的传统 ORM 信念

它换来了：
- **schema 就是 TS 代码**——你 `import { users } from './schema'`，IDE 直接跳转
- **类型完全静态**——`db.select({ name: users.name }).from(users)` 错了一个字段，编译期红
- **SQL 1:1 可见**——`db.select().from(users)` 你能口算出 `select * from users`
- **bundle 极小** —— core 50KB（vs Prisma 10MB），可以塞 edge runtime

> **怀疑 1**：drizzle 把"schema 是 TS"作为核心卖点，但 TS 写 schema 比 `.prisma` DSL 啰嗦得多
> （`serial('id').primaryKey()` vs `Int @id @default(autoincrement())`）。
> 当 schema 涨到 100 张表时，`schema.ts` 是不是会比 `schema.prisma` 难读很多？
> 看了一下 drizzle 文档示例，他们建议拆成 `schema/users.ts` `schema/posts.ts`——
> 这其实把"DSL 文件"变成"多个 TS 文件"，本质问题（schema 量大时的可读性）没解决，只是分散。

## Layer 2 · 仓库地形

### 顶层（drizzle-orm 单 package 视角）

```
drizzle-orm/                                ← 我们读的核心 package
├── src/
│   ├── pg-core/                            ← Postgres dialect 实现
│   │   ├── columns/                        ← 内置 column 类型（serial / text / jsonb / ...）
│   │   ├── query-builders/                 ← select / insert / update / delete / query (RQB)
│   │   ├── table.ts                        ← PgTable + pgTableWithSchema 工厂
│   │   ├── dialect.ts                      ← SQL 序列化器（1445 行 ★ 心脏）
│   │   ├── db.ts                           ← PgDatabase 类（695 行）
│   │   └── session.ts                      ← session/transaction 抽象
│   ├── mysql-core/                         ← MySQL dialect（同构 pg-core）
│   ├── sqlite-core/                        ← SQLite dialect（同构）
│   ├── gel-core/                           ← Gel（ex EdgeDB）dialect
│   ├── relations.ts                        ← RQB v2 relations 定义
│   ├── sql/                                ← SQL 类（核心 AST）
│   ├── column.ts / column-builder.ts       ← Column 抽象基类
│   ├── table.ts                            ← Table 抽象基类（所有 dialect 继承）
│   ├── entity.ts                           ← entityKind + is() 运行时类型识别
│   ├── operations.ts                       ← $inferSelect / $inferInsert 等类型 helper
│   └── (各 driver adapter)/                ← node-postgres / postgres-js / mysql2 / better-sqlite3 / ...
└── package.json
```

旁边还有：

```
drizzle-kit/         ← 独立 CLI，做 migration 生成（读 schema TS → diff db → 生成 SQL）
drizzle-zod/         ← schema → zod schema 自动生成
drizzle-valibot/     ← schema → valibot
drizzle-arktype/     ← schema → arktype
drizzle-seed/        ← seed 数据生成
integration-tests/   ← 大量真实 db 集成测试
```

### 心脏文件清单（≥ 3）

| 路径 | 行数 | 职责 |
|---|---|---|
| `drizzle-orm/src/pg-core/dialect.ts` | 1445 | **核心**：把 query builder 的 AST 序列化成 SQL + 参数。看懂这个文件等于看懂 drizzle 怎么生成 SQL。 |
| `drizzle-orm/src/pg-core/query-builders/select.ts` | 1346 | select builder 的 fluent 链式实现（`.from()` `.where()` `.leftJoin()` `.groupBy()` `.orderBy()` `.limit()`），处理类型推导 |
| `drizzle-orm/src/pg-core/db.ts` | 695 | `PgDatabase` 类——`db.select() / db.insert() / db.delete()` / transaction / batch / RQB v2 入口 |
| `drizzle-orm/src/pg-core/columns/common.ts` | 353 | `PgColumn` / `PgColumnBuilder` 基类——所有内置 column 和自定义 column 都继承这两个 |
| `drizzle-orm/src/pg-core/table.ts` | 252 | `pgTableWithSchema` 工厂——把 `{ id: serial(...), name: text(...) }` 转成带类型的 PgTableWithColumns |

### Extension points（这是分支 D 必填）

| extension | 入口路径 | 例子 |
|---|---|---|
| **custom dialect** | 继承 `PgDialect` 或同级 base，覆盖 `sqlToQuery()` | drizzle 自带 `gel-core/dialect.ts`（pg 的子类，加 Gel 特殊语法） |
| **custom column type** | 继承 `PgColumnBuilder` + `PgColumn`，实现 `getSQLType()` / mapping | 文档示例：`pgvector` 类型、自定义 enum |
| **custom logger** | 实现 `Logger` interface（`logQuery(query, params)`） | 内置 `DefaultLogger` 在 `drizzle-orm/src/logger.ts` |
| **RQB v2 relations** | `defineRelations` API + `db.query.tableName.findMany({...})` | `drizzle-orm/src/relations.ts` |
| **session driver** | 实现 `PgSession` 子类，处理 `prepareQuery` / `execute` / `transaction` | `node-postgres/session.ts` / `neon-http/session.ts` |

### commit 热点（最近 3 个月趋势）

```bash
git log --since="2026-02-01" --pretty=format:"%h %s" -- drizzle-orm/src/pg-core | head -30
# 大致分布：
# - dialect.ts：CTE / arrays / window functions 优化
# - query-builders/query.ts (RQB v2)：relations 类型推导优化
# - columns/numeric.ts / json.ts：driver value mapping bug fix
```

> **怀疑 2**：dialect.ts 1445 行单文件——所有 SQL 拼接逻辑都在 `buildSelectQuery` `buildInsertQuery` 等
> 一组方法里。有 `if (is(field, ...))` 大量分支判断 column 类型。
> 这种"巨型 dialect 类 + dispatch 分支"模式典型 trade-off：
> 单点改容易（所有 SQL 决策都在这一个类里），但分支爆炸时可读性下降。
> 对比 Kysely 用 visitor pattern 切分 expression compiler——drizzle 的选择是"一个大类装下"。
> 这是审美选择，不是错误，但当 dialect 数量从 4 涨到 8（pg / mysql / sqlite / gel / planetscale-special / ...）时
> 是否还撑得住？我没看到他们的回答。

## Layer 3 · 三段精读

### 第一段：schema 定义 + 类型推导

drizzle 最聪明的部分是**类型完全从 schema 对象推导**——你写一次 schema，
`InsertModel` `SelectModel` `UpdateModel` 自动出来。这一段看 `pgTableWithSchema` 怎么做的。

读 [`drizzle-orm/src/pg-core/table.ts`](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/pg-core/table.ts#L71-L128)：

```typescript
// path: drizzle-orm/src/pg-core/table.ts:71
export function pgTableWithSchema<
  TTableName extends string,
  TSchemaName extends string | undefined,
  TColumnsMap extends Record<string, PgColumnBuilderBase>,    // ← 关键：generic 接收 column builder map
>(
  name: TTableName,
  columns: TColumnsMap | ((columnTypes: PgColumnsBuilders) => TColumnsMap),
  extraConfig: ((self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>) => ...) | undefined,
  schema: TSchemaName,
  baseName = name,
): PgTableWithColumns<{
  name: TTableName;                                           // ← 表名作为 literal type 保留
  schema: TSchemaName;
  columns: BuildColumns<TTableName, TColumnsMap, 'pg'>;       // ← 关键：column types 经过 BuildColumns 变换
  dialect: 'pg';
}> {
  const rawTable = new PgTable<{ ... }>(name, schema, baseName);

  // 1. 解析 columns（支持函数或对象两种写法）
  const parsedColumns: TColumnsMap = typeof columns === 'function'
    ? columns(getPgColumnBuilders())
    : columns;

  // 2. 把每个 builder build 成 column 实例
  const builtColumns = Object.fromEntries(
    Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
      const colBuilder = colBuilderBase as PgColumnBuilder;
      colBuilder.setName(name);                               // ← 把 key 当 column name 注入
      const column = colBuilder.build(rawTable);              // ← 真正实例化 PgColumn
      rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
      return [name, column];
    }),
  ) as unknown as BuildColumns<TTableName, TColumnsMap, 'pg'>; // ← 这里强转成"经过类型变换"的 map

  // 3. ExtraConfig（用于 indexes / checks 等不挂在 column 上的约束）
  const builtColumnsForExtraConfig = ...;

  const table = Object.assign(rawTable, builtColumns);        // ← 把 columns 平铺到 table 上
  table[Table.Symbol.Columns] = builtColumns;
  // ...
  return table as PgTableWithColumns<{...}>;
}
```

旁注：
1. **generic 三层嵌套**：`TTableName extends string` 让 `'users'` 作为 literal type 保留，不退化成 `string`——这样后续 `users._.name` 类型是 `'users'` 而不是 `string`。
2. **`Object.fromEntries + as unknown as` 强转**：这是 drizzle 类型推导的核心 trick——运行时是普通对象操作，类型层面用 `BuildColumns` mapped type 把 `Record<string, PgColumnBuilder>` 变成 `Record<string, PgColumn>` 同时保留 column 的所有 generic 信息。
3. **`Object.assign(rawTable, builtColumns)` 平铺**：让你能写 `users.name` 而不是 `users.columns.name`——这是符合人体工学的设计选择，但代价是 column 名不能和 `PgTable` 的 method 名冲突（如果你有列叫 `enableRLS` 就完蛋）。
4. **`InlineForeignKeys` symbol**：drizzle 大量用 `Symbol.for('drizzle:...')` 隐藏内部状态，避免污染 column object 的 public surface（用户 `Object.keys(users)` 只看到列名）。
5. **`setName(name)` 后置注入**：column builder 创建时不知道自己叫什么，是被加进 schema 时才被赋名——这让 `serial('id')` 的 'id' 参数其实是冗余的（drizzle 0.46 之后会移除？文档里没说）。

类型推导的关键在 [`drizzle-orm/src/operations.ts`](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/operations.ts) 里的 `$inferSelect` / `$inferInsert`：

```typescript
// 简化版 —— 实际定义有 generic constraint
type InferSelectModel<T extends Table> = {
  [K in keyof T['_']['columns']]: T['_']['columns'][K]['_']['data']
}

// 用法
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  bio: text('bio'),
})

type User = typeof users.$inferSelect
//   ^? { id: number; name: string; bio: string | null }
//        notNull()=true 让 string 不带 null；没 notNull 的 bio 自动带 null
```

`notNull()` 在 column builder 上不仅是运行时调用，更是**类型层面**改变了那个 column 的 generic 参数——这是 builder pattern 在 TS 里被推到极致的样子。

> **怀疑 3**：`PgColumnBuilder.notNull()` 返回 `this` 类型 with modified generic——但当你写
> `text('bio').notNull().default('hello')` 时，`default()` 调用之后类型还能正确传递吗？
> 我看了 columns/common.ts 353 行确认 `default()` 也是返回 `this & { _: { hasDefault: true } }`，
> 所以链式 6-7 个调用都能保留类型。但**编译时间**呢？大 schema（100+ 表 × 每表 5-10 列 × 每列 3-5 个 builder 调用）
> 会不会让 tsc 跑 30 秒？drizzle 文档里没量化。

### 第二段：query builder + Drizzle relations

drizzle 给你两套 query 风格：

1. **SQL-like builder**（`db.select().from().where()`）—— 1:1 对应 SQL，看 builder 就能口算 SQL。
2. **RQB v2**（`db.query.users.findMany({ with: { posts: true } })`）—— Prisma-like，藏 SQL，给 relation 写 happy path。

第一种是看 [`drizzle-orm/src/pg-core/query-builders/select.ts`](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/pg-core/query-builders/select.ts) 1346 行的核心。简化骨架：

```typescript
// path: drizzle-orm/src/pg-core/query-builders/select.ts (简化)
export class PgSelect<...> extends PgSelectQueryBuilder {
  private config: PgSelectConfig                              // ← 内部状态：fields, from, where, joins, orderBy, ...

  from<TFrom extends PgTable>(source: TFrom): PgSelectWithJoins<...> {
    this.config.table = source                                // ← 改 config，返回 this（with 改过的类型）
    return this as any
  }

  where(where: SQL | undefined): PgSelectWithWhere<...> {
    this.config.where = this.config.where
      ? and(this.config.where, where)                        // ← 多次 .where() 自动 AND
      : where
    return this as any
  }

  leftJoin<TJoinedTable extends PgTable>(
    table: TJoinedTable,
    on: SQL,
  ): PgSelectWithJoins<...> {
    this.config.joins.push({ table, on, joinType: 'left' })
    return this as any                                        // ← 类型上 joinedTable 加进 result type
  }

  // 真正执行：toSQL() → driver.execute()
  async execute(): Promise<...> {
    const { sql, params } = this.dialect.sqlToQuery(this.getSQL())
    return this.session.execute(sql, params)
  }
}
```

每次 `.where()` `.leftJoin()` `.orderBy()` 调用都做两件事：

1. **运行时**：往 `config` 对象里塞数据。
2. **类型层面**：返回的 `this` 类型经过 mapped type 变换（如 `leftJoin` 让 result 多一个 nullable 的 joined table column 集合）。

实际用：

```typescript
import { eq, and, sql } from 'drizzle-orm'
import { users, posts } from './schema'

// 读 + join
const result = await db
  .select({
    userId: users.id,
    userName: users.name,
    postTitle: posts.title,                                   // ← left join 后 posts 列自动是 nullable
  })
  .from(users)
  .leftJoin(posts, eq(posts.userId, users.id))
  .where(and(
    eq(users.active, true),
    sql`${users.createdAt} > now() - interval '7 days'`,      // ← 转义口子：sql 模板字面量直接写 SQL
  ))
  .orderBy(users.createdAt)
  .limit(20)

// 类型推导：result: Array<{ userId: number; userName: string; postTitle: string | null }>
// ←  postTitle 是 string | null 因为 leftJoin
```

旁注：
1. **`eq` / `and` / `or` 是函数**——返回 `SQL` 类型对象（一个 AST 节点），不是字符串。这是 drizzle 防 SQL 注入的根基：用户代码永远写不出原始 SQL 字符串。
2. **`sql` 模板字面量**是逃生口——当 builder 表达不了你的需求（比如 PG 特定的 `interval` 语法、CTE、window function 复杂场景）时，你写 `sql\`select count(*) over (partition by ${users.id})\``，drizzle 会把 `${users.id}` 当参数化占位符处理，不是字符串拼接。
3. **类型层面的 join nullable**：`leftJoin` 让 joined table 的所有 column 在 result 里变 `string | null`——这是 mapped type 在 join config 上做条件判断实现的。看着简单，背后是非平凡 TS 类型操作。
4. **多次 `.where()` 自动 AND**：drizzle 的 API 决策——你 `.where(a).where(b)` 等价于 `.where(and(a, b))`。Kysely 是同样选择，Prisma 没这个问题（它 where 是 object）。
5. **`execute()` 是 await 入口**——但 drizzle 的 builder 也实现了 `then`，所以你可以直接 `await db.select()...` 不写 `.execute()`。这是 thenable 模式（Knex / Kysely 同款）。

第二种 RQB v2：

```typescript
// 在 schema.ts 定义 relations
import { defineRelations } from 'drizzle-orm'
export const relations = defineRelations({ users, posts }, (r) => ({
  users: {
    posts: r.many.posts({ from: r.users.id, to: r.posts.userId }),
  },
  posts: {
    author: r.one.users({ from: r.posts.userId, to: r.users.id }),
  },
}))

// 用：
const data = await db.query.users.findMany({
  with: { posts: true },                                      // ← Prisma-like 嵌套 fetch
  where: { active: true },
  limit: 10,
})
// data: Array<{ id, name, ..., posts: Array<{ id, title, ... }> }>
```

RQB v2 在 [`drizzle-orm/src/relations.ts`](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/relations.ts) 实现。它内部把 `findMany({ with: { posts: true } })` 编译成一条带 `json_agg()` / `json_build_object()` 的复合 SQL（不是 N+1 查询）——这是 drizzle 跟 Prisma 性能对比时常打的牌。

### 第三段：prepared statement + transaction

drizzle 提供两个性能关键 API：`prepare()` 和 `transaction()`。

prepared statement 在 [`drizzle-orm/src/pg-core/session.ts`](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/pg-core/session.ts) 定义：

```typescript
// 用法
import { sql } from 'drizzle-orm'

const getUserById = db
  .select()
  .from(users)
  .where(eq(users.id, sql.placeholder('id')))                 // ← placeholder 是 prepared 占位符
  .prepare('get_user_by_id')                                  // ← 给这个 query 起个名字

// 后续多次调用复用 plan
const u1 = await getUserById.execute({ id: 1 })
const u2 = await getUserById.execute({ id: 2 })

// 等价 SQL（PG 层）：
// PREPARE get_user_by_id(int) AS select * from users where id = $1
// EXECUTE get_user_by_id(1)
// EXECUTE get_user_by_id(2)
```

旁注：
1. **`sql.placeholder('id')`** 在 query 序列化阶段保留为占位符，不立即填值——这是和普通 query 的核心区别。普通 query 用 `eq(users.id, 1)`，1 在 builder 阶段就固化了；placeholder 把这个值延迟到 execute()。
2. **prepared 在 PG 层是 server-side plan cache**——重复 query 不重新 parse + plan，性能提升大约 1.5-3x（看 query 复杂度）。drizzle 把这个能力 1:1 暴露给用户。
3. **运行时 type safety**：`prepare()` 返回的对象类型是 `PgPreparedQuery<{ id: number }>`，execute 时 `{ id: 1 }` 类型不对会编译报错。
4. **session adapter**：`drizzle-orm/src/node-postgres/session.ts`（pg 库）和 `drizzle-orm/src/postgres-js/session.ts`（postgres.js 库）实现差异在这里——postgres.js 原生支持 prepared，pg 库要走 unnamed prepared。drizzle 在 session 层屏蔽这种差异。
5. **prepared 不能动态拼 query**——这是 SQL 本身的限制，不是 drizzle 的。如果你要动态决定 `where` 的 column，prepared 不适用，要用普通 query。

transaction：

```typescript
await db.transaction(async (tx) => {
  const newUser = await tx.insert(users)
    .values({ name: 'alice' })
    .returning()                                              // ← PG 特有 RETURNING

  await tx.insert(posts)
    .values({ userId: newUser[0].id, title: 'hello' })

  // 嵌套 savepoint
  await tx.transaction(async (sp) => {
    await sp.update(users).set({ name: 'bob' }).where(eq(users.id, newUser[0].id))
    if (someCondition) sp.rollback()                          // ← throw 一个 rollback 错误
  })

  // 整个 outer 抛错就 ROLLBACK，否则 COMMIT
})
```

drizzle 在 session 层把 PG 的 BEGIN / COMMIT / ROLLBACK + SAVEPOINT 全包了。
**关键设计**：`tx` 是和 `db` 同 shape 的对象（同样有 `.select()` `.insert()` 等），但 session 被换成了 transaction session——所以你写 transaction-aware code 不用改 query 写法，只是参数从 `db` 换成 `tx`。

> **怀疑 4**：drizzle transaction API 把 PG/MySQL/SQLite 三家的 transaction 语义抽象成"接受 callback 的 transaction()"。
> 但三家有差异：
> - PG 默认 `READ COMMITTED`，可以 `BEGIN ISOLATION LEVEL SERIALIZABLE`
> - MySQL InnoDB 默认 `REPEATABLE READ`
> - SQLite 默认 `DEFERRED`，可以 `IMMEDIATE` / `EXCLUSIVE`
>
> drizzle 的 `db.transaction(fn, { isolationLevel: ... })` 提供了配置入口，但**回滚行为差异**呢？
> SQLite 不支持 SAVEPOINT 命名嵌套（要用 RELEASE / ROLLBACK TO），PG/MySQL 支持。
> 这种差异 drizzle 怎么对齐——还是直接让用户感知 dialect？我没找到答案。

## Layer 4 · 改一处实验：写一个 custom column type

drizzle 的 extension point 之一是自定义 column——我们写一个 `lowerCaseText` 类型，
读出来时强制 lowercase，写进去时也 lowercase。这练习 column 的 mapping 全流程。

```typescript
// my-lower-text.ts
import { customType } from 'drizzle-orm/pg-core'

export const lowerCaseText = customType<{
  data: string                                                // ← TS 层面看到的类型
  driverData: string                                          // ← 数据库 driver 接收的类型
}>({
  dataType() {
    return 'text'                                             // ← 实际 DDL 类型
  },
  toDriver(value: string): string {
    return value.toLowerCase()                                // ← 写入前 transform
  },
  fromDriver(value: string): string {
    return value.toLowerCase()                                // ← 读出来后 transform（防御性，万一 db 里有非 lowercase）
  },
})

// 用：
import { pgTable, serial } from 'drizzle-orm/pg-core'
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: lowerCaseText('email').notNull().unique(),           // ← 自定义类型，仍能 chain notNull / unique
})

// 写入
await db.insert(users).values({ email: 'Alice@Example.COM' })
// 实际入库：alice@example.com

// 读出
const list = await db.select().from(users)
// list[0].email === 'alice@example.com'
```

drizzle 的 `customType` 在 [`drizzle-orm/src/pg-core/columns/custom.ts`](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/pg-core/columns/custom.ts) 实现。它是一个工厂函数，返回的对象同时是 column builder（可以链式）+ 携带 mapping 函数。

这个练习的价值：
- 你**真的写了一个 plug-in**——不是改 drizzle 源码，是在用户空间扩展。
- 你看到了 column 的"双向 mapping"模型——`toDriver` / `fromDriver` 是 ORM 通用模式（Prisma 是 codegen 时插钩子，不开放；TypeORM 用 transformer 装饰器；drizzle 是函数对象）。
- 你看到了 customType 仍能 chain `.notNull().unique()`——因为它返回的 builder 继承自 `PgColumnBuilder`，所有 base method 都在。

如果走更进阶——**写一个 custom dialect**（让 drizzle 跑在某种新数据库上），需要继承 `PgDialect`（或更抽象的 base），覆盖 `sqlToQuery()` 把 SQL AST 序列化成你那家数据库认识的方言。这个工作量是**几千行**，drizzle 自己的 `gel-core/dialect.ts` 就是范例（基于 pg-core 但加了 Gel 特殊语法）。

## Layer 5 · 横向对比

| 维度 | Drizzle (this) | Prisma (DSL 派) | Kysely (SQL builder 派) | TypeORM (OO 派) |
|---|---|---|---|---|
| **schema 在哪** | TS 对象 | `.prisma` DSL 文件 | 你手写 interface | decorator on class |
| **类型来源** | `$inferSelect` / `$inferInsert` 推导 | `prisma generate` 生成代码 | 手写 interface | reflect-metadata + decorator |
| **codegen** | 无（drizzle-kit 只生成 migration SQL，不生成 client） | **强依赖**（每次 schema 改要 generate） | 无 | 部分（migration） |
| **bundle** | ~50KB | ~10MB | ~30KB | ~600KB |
| **runtime** | Node / Bun / Deno / Edge / Cloudflare | Node 主，edge 部分支持 | 任何 | Node 主 |
| **SQL 可见性** | 完全可见，1:1 对应 builder | 不可见（除非 `$queryRaw`） | 完全可见 | 半透明 |
| **API 风格** | builder（select / insert / update / delete）+ RQB | object-oriented `findMany / create / update` | builder 1:1 SQL | OO + repository / query builder |
| **relation 处理** | RQB v2（`with: {posts: true}`） | `include: { posts: true }` | 不内置（你自己 join） | OO `@OneToMany` 关联 lazy load |
| **migration** | drizzle-kit 独立 CLI（schema diff → SQL） | prisma migrate（含 dev / deploy / reset） | 无（用 knex 或别的） | typeorm migration（class-based） |
| **prepared statement** | 显式 `.prepare()` API | 内部自动 | 显式 `.compile()` | repository 不直接暴露 |
| **transaction** | `db.transaction(async tx => ...)` callback | `prisma.$transaction([...])` 数组或 callback | callback | `manager.transaction()` 或 decorator |
| **学习曲线** | 中（TS 类型 + builder + 一点 SQL 知识） | 低（DSL 直观，但 generated client 神秘感强） | 中高（要懂 SQL） | 高（OO + decorator + 配置）|
| **debug 友好度** | 高（看 builder = 看 SQL） | 低（generated client 是黑盒） | 高 | 中（lazy load 的"幽灵 query"难追） |
| **生态成熟度** | 中（2022 起，2024 后增速大） | 高（2018 起，最大社区） | 中 | 高（2016 起，但增速放缓） |

谁该选谁：

- **要快速 prototype，不在乎 SQL 可见性，schema 能用 DSL**：Prisma。
- **schema 已经在 db 里（legacy），只想要 type-safe query builder**：Kysely。
- **想要"schema 在 TS + 看得见 SQL + 好 type 推导 + 边缘 runtime"全占**：Drizzle。
- **企业 OO 派，习惯 entity / repository pattern**：TypeORM 或 MikroORM。

drizzle 不解决的：
- 不替你做 connection pool（你给 drizzle 一个 pool / connection，它不管 lifecycle）
- 不替你做 query cache（你要装 `cache` 这个子 package 或自己接 Redis）
- 不替你做 schema validation at boundary（API input 验证）——但 drizzle-zod 把 schema 转 zod，可以接 API layer

## Layer 6 · 三段总结

### schema-as-code 的胜利

- drizzle 最大的判断是"schema 是 TS 对象"——这让 schema 跟代码同库同 commit、跳转 IDE 直达、没 codegen 步骤。
- TS 强大的 mapped type + builder pattern + literal type generic 让"从 schema 推全部类型"成为可能——这事在 5 年前没法做到（TS 4.x 之前 mapped type 推导能力不够）。
- 这条路线的"代价"是 schema 视觉冗余（vs `.prisma`），但收益是消去 generate 步骤 + 全 IDE 体验——drizzle 团队的判断是收益更大。
- 替代道路（Kysely）选择不管 schema 让用户手写 interface——更轻但没 migration / relation 系统。drizzle 是"全栈派"。

### dialect 抽象 + 多 driver adapter

- 三大 dialect（pg-core / mysql-core / sqlite-core）+ 共享的 base class 套路——`Table` `Column` `Dialect` `Database` `Session` 都有 base + dialect-specific 子类。
- driver adapter（node-postgres / postgres-js / mysql2 / better-sqlite3 / neon-http / ...）在 dialect 之下——session 层把 driver 差异屏蔽。
- 这种"双层抽象"（dialect SQL 方言 + driver adapter 协议）让 drizzle 能很快支持新 runtime（Cloudflare D1 / Neon HTTP / Bun SQL 都是新增 driver adapter，没改 dialect）。
- **trade-off**：dialect 类巨大（pg-core dialect.ts 1445 行），所有 SQL 决策集中在一个类里——单点改容易，但分支爆炸时可读性下降。这是看得见的技术债，drizzle 还没拆。

### query builder 的 thenable + AST + sql 模板字面量

- builder 实现了 `then`，所以 `await db.select()...` 直接出结果——thenable 模式让 API 极简。
- 内部用 SQL AST（`SQL` 类）而不是字符串拼接——这是防注入的根基，也是支持参数化 + 多 dialect 序列化的前提。
- `sql` 模板字面量是逃生口——builder 表达不了的，你写 `sql\`...\``，drizzle 把 `${expr}` 占位符化处理，不是字符串拼接。这是"框架做主流路径，逃生口给非主流"的典型设计。
- RQB v2 把 nested fetch（`with: { posts: true }`）编译成单条 SQL（用 `json_agg`）——避免 N+1，但意味着 RQB v2 编译器（relations.ts）本身复杂度高。

## Layer 7 · 自检 + 怀疑

写完后我自己问自己：

1. **drizzle 在大 schema（200+ 表）下的 tsc 编译时间**？文档没量化，社区有零星抱怨"tsc 慢"——但具体多慢、能优化到多少？我不知道。要写一个 200 表的 toy schema 实测才有答案。
2. **drizzle-kit 的 schema diff 算法**——它怎么判断"加了一列"vs"改了类型"vs"重命名"？rename 探测在 SQL migration 工具里是经典难题（pgloader / Atlas / Liquibase 各有不同启发式）。drizzle-kit 的策略是？
3. **RQB v2 的 query plan**——`db.query.users.findMany({ with: { posts: { with: { comments: true } } } })`（三层嵌套）会编译成什么 SQL？是一个超大 `json_agg`，还是分多次？性能在 PG / MySQL 上分别如何？
4. **prepared statement 在 connection pool 下的行为**——PG prepared 是 per-connection 的，连接被回收时 prepared plan 就没了。drizzle 的 `.prepare()` 怎么处理这个？是不是每次拿新连接要重新 prepare？

这些都是要去仓库 issue / 实测才能答的——本笔记标记为 Layer 7 怀疑，等之后回来补。

## 限制 · drizzle 不解决的事

- **runtime data validation**：drizzle 不替你校验"用户传进来的数据符合 schema"——你要装 drizzle-zod 把 schema 转 zod 用在 API 边界。
- **connection pool / lifecycle**：你给 drizzle 一个 pool / connection 它就用，pool 满了 / 连接断了它不管。
- **query cache**：drizzle 0.45 才加的 `cache` 子 package（in-memory + Redis / Upstash adapter）但默认不开。
- **observability**：除了 Logger 接口，drizzle 不内置 metrics / tracing——你接 OTel 要在 driver 或 logger 层自己包。
- **schema migration 的语义合并**：drizzle-kit 生成 SQL，但**冲突解决**（多个 PR 各加一个 migration）要你自己理顺 migration 文件顺序——这事 ORM 工具普遍头疼。
- **多 schema / sharding**：drizzle 支持 `schema` 参数（`pgTable('users', {...}, undefined, 'public')`）但不替你做 cross-schema query / sharding routing。

## 附录 A · 宣传 vs 现实

| 宣传 | 现实 |
|---|---|
| "Headless TypeScript ORM" | 准确——它就是 schema + builder + 类型，没 magic。 |
| "Best for serverless / edge" | 准确——bundle 50KB（vs Prisma 10MB）确实塞得进 Cloudflare Workers / Vercel Edge。 |
| "1:1 with SQL" | 大体准确——builder 看了能口算 SQL；但 RQB v2 有点偏离这个原则（`with: {...}` 编译成 json_agg 大查询，不直观）。 |
| "Zero codegen" | 部分准确——drizzle-orm runtime 是 zero codegen，但 drizzle-kit 仍要生成 migration SQL 文件（这事不可避免）。 |
| "Type-safe everything" | 准确度高——schema 推全部类型；但有边角（dynamic SQL `sql\`...\`` 模板里嵌入的 expression 类型不一定全推过去）。 |

## 附录 B · permalink 锚点汇总

读这篇笔记时锚定的 commit：`48e5406027103a9fca6eb66417187c4a8b5c6aa3`

主要锚点：
- table 工厂：[pg-core/table.ts:71](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/pg-core/table.ts#L71-L128)
- column base：[pg-core/columns/common.ts](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/pg-core/columns/common.ts)
- select builder：[pg-core/query-builders/select.ts](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/pg-core/query-builders/select.ts)
- dialect SQL 序列化器：[pg-core/dialect.ts](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/pg-core/dialect.ts)
- session 抽象：[pg-core/session.ts](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/pg-core/session.ts)
- relations / RQB v2：[src/relations.ts](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/relations.ts)
- entity kind 运行时类型识别：[src/entity.ts](https://github.com/drizzle-team/drizzle-orm/blob/48e5406027103a9fca6eb66417187c4a8b5c6aa3/drizzle-orm/src/entity.ts)

## 元数据

- 项目类型 self-classify：分支 D 框架/SDK
- 写作日期：2026-05-28
- 启用工具：Read / Bash / Write / Edit
- Figure：`figures/drizzle/01-architecture.webp`（schema → 类型推导 → query builder → dialect → SQL）
- 量化指标对照（v1.1 框架/SDK 底线）：行数 ≥ 500 ✓ / Figure ≥ 1 ✓ / GitHub permalink ≥ 4 ✓ / 显式怀疑 ≥ 3 ✓ / path:line 引用 ≥ 1 ✓
