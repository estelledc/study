---
title: Kysely — TypeScript SQL 查询构建器
来源: https://github.com/kysely-org/kysely
日期: 2026-05-29
子分类: ORM / 查询构建器
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Kysely 是一个 **TypeScript 优先的 SQL 查询构建器**，核心承诺一句话：**"我就想写 SQL，但要类型自动检查"**。

日常类比：

- [[prisma]] / [[drizzle]] 这种 ORM 像**给你做好的菜**——你说"来一盘宫保鸡丁"，厨房自己处理切配、爆炒、装盘。你不知道菜怎么做的，但拿到能吃。
- Kysely 像一台**改装后的电锅**——你还是要自己下米、加水、按开关（也就是写 SQL），但每加一种食材，电锅自己核对："这是大米还是面条？水位够吗？"——食材类型不对它当场报警。

你在 IDE 里写：

```typescript
db.selectFrom('users').select(['id', 'email']).where('id', '=', 1).executeTakeFirst()
```

TypeScript 编译期就告诉你：返回类型是 `{ id: number; email: string } | undefined`——你拼错列名、where 类型不对，编译期立刻爆红。

## 为什么重要

理解 Kysely 的位置，要看 TypeScript ORM 光谱上的几个点：

- **比 [[prisma]] 简单**——Prisma 要写 `.prisma` DSL 文件、跑 `prisma generate` 生成代码、引入 Rust binary 引擎。Kysely 没有这些，纯 TypeScript，`import` 就能用。
- **比 [[drizzle]] 更贴近原生 SQL**——Drizzle 有 schema-as-code 和 relation API，往 ORM 方向再走半步。Kysely 的链式调用 1:1 对应 SQL 关键字（`selectFrom` / `innerJoin` / `where` / `groupBy`），写 builder 几乎等于写 SQL。
- **0 dependencies、包体积超小**（约 30KB）——Edge runtime（Cloudflare Workers / Vercel Edge）友好，冷启动快。
- **类型自动推导**——你写 `select(['id', 'name'])`，TypeScript 自己推出 row 类型是 `{ id: number; name: string }`，不用手动声明。
- **多 dialect 支持**——PostgreSQL / MySQL / SQLite / MS SQL Server，加上社区维护的 PlanetScale / Neon / Cloudflare D1 / Bun SQLite。换 dialect 等于换一个 adapter。

## 核心要点

Kysely 的世界观可以拆成 **三块拼图**：

1. **TypeScript Database 类型**（你的 schema 长什么样）

   你**手写**一份 `Database` interface 告诉 Kysely "我有哪些表、每张表有哪些列、列是什么类型"。也可以用第三方工具 [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen) 从已有 db 反向生成。

2. **Query builder 链**（你怎么写 query）

   链式调用：`db.selectFrom().select().where().orderBy().execute()`。每一步返回**新 builder**（不可变），类型在链上**累积**。

3. **编译时类型推导**（IDE 帮你 catch 错误）

   TypeScript 用模板字面量类型 + 条件类型，把 `'users.email'` 字符串拆成表名 + 列名，再去 `Database['users']['email']` 查类型。`select` 选了哪些字段，就决定了最终 row 长什么样。

整套机制**不依赖 codegen、不依赖 runtime engine、不依赖 DSL**——纯类型系统就能完成。

## 实践案例

### 案例 1：定义 Database 类型

```typescript
import { Kysely, Generated, ColumnType, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

interface Database {
  users: {
    id: Generated<number>           // 自增主键，insert 不用传
    email: string
    name: string | null
    created_at: ColumnType<Date, string | undefined, never>
    // 三栏：select 出来 / insert 时 / update 时 各自的类型
  }
  posts: {
    id: Generated<number>
    title: string
    author_id: number
  }
}

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
})
```

`Generated<T>` 和 `ColumnType<S, I, U>` 是 Kysely 的两个标记类型——告诉编译器"这一列在 select / insert / update 三种场景下类型不同"。

### 案例 2：select + where（自动推 row 类型）

```typescript
const user = await db
  .selectFrom('users')
  .select(['id', 'email'])
  .where('id', '=', 1)
  .executeTakeFirst()

// user 的类型自动推出来：{ id: number; email: string } | undefined
```

注意几件事：

- `.select(['id', 'email'])` 只选两列，最终 row 就**只有这两个字段**——不是把整张表都返回。
- `.where('id', '=', 1)` 的 `1` 必须是 number——你传 `'1'` 字符串，编译期立刻报错。
- `.executeTakeFirst()` 表示"取第一条或 undefined"；`.executeTakeFirstOrThrow()` 取不到就抛异常；`.execute()` 返回数组。

### 案例 3：Insert + Returning

```typescript
const newUser = await db
  .insertInto('users')
  .values({ email: 'a@b.com', name: 'Alice' })
  .returning('id')
  .executeTakeFirstOrThrow()

// newUser 的类型：{ id: number }
```

`.returning('id')` 是 PostgreSQL / SQLite 的特性（MySQL 不支持，要用 last insert id）——告诉数据库"插入后顺便把 id 还给我"。Kysely 把这种 dialect 差异封装在 adapter 层，但你写 query 时还是要知道哪些 dialect 支持。

## 踩过的坑

1. **必须自己保持 Database 类型与真实 db 同步**——不像 Prisma 跑 `prisma generate` 自动对齐，Kysely 信任你写的 interface。同事改了 db 但没改 interface？编译期看不出来，运行时拿到 `email: number`（实际 db 改成 int 了）但 TS 说是 `string`——类型谎言。补救：用 `kysely-codegen` 定期从 db 反向生成，或者在 API 边界用 `zod` 做 runtime 校验。

2. **大型查询编译慢**——`selectFrom().innerJoin().innerJoin().select([20 列])...` 这种链如果跨 5+ 表、20+ 列，TypeScript 类型推导要展开几十层条件类型，`tsc` 变慢、IDE 卡顿、错误信息巨大。这是模板类型路线的固有代价（Drizzle 同样有）。缓解办法：把大 query 拆成小函数，或在中间用 `as` 类型断言切断推导链。

3. **不带 migration 工具**——Kysely 不内置 schema 演化方案。你要自己装第三方包：`kysely-migrator` / `kysely-migration-cli` / 或直接用 `umzug` 自己写。Drizzle 的 `drizzle-kit` 和 Prisma 的 `prisma migrate` 是开箱即用的，Kysely 不是——这是它"做最窄一件事"哲学的代价。

4. **与 Prisma / Drizzle 互不兼容**——三个项目的 schema 表达方式完全不同（DSL / TS object / TS interface），从 Prisma 迁到 Kysely 要重写全部 query 代码。如果项目深度用了 Prisma 的 `include: { posts: true }` 嵌套结果，迁到 Kysely 还要把"自动嵌套"改成"手动 reduce"，工作量很大。

## 适用 vs 不适用场景

**适用**：

- 已有 db / legacy schema，想上 type-safe 但不想引入 Prisma 那一套
- Edge runtime（Cloudflare Workers / Vercel Edge）冷启动敏感
- 团队 SQL 功底强，喜欢"看见每一条 SQL"
- 性能敏感场景（30KB bundle vs Prisma 10MB）

**不适用**：

- 从零起步、想要 schema + migration + 关系一站式 → 选 Drizzle
- 团队 SQL 弱、想要 DSL 直观 API → 选 Prisma
- 项目里要写大量复杂 join / CTE / window function 嵌套 → builder 链会变难读，混合 raw SQL 反而清晰
- MongoDB → Kysely 只做 SQL 数据库

## 学到什么

1. **builder 派 vs ORM 派**——Kysely 选了"builder 1:1 SQL"路线，比 ORM 透明、比 raw SQL 安全，是中间地带
2. **TypeScript 模板类型能做的事比想象多**——把字符串字面量当编程语言用，编译期就能完成 SQL 类型推导
3. **"做最窄的一件事"是有代价的**——Kysely 不做 schema / migration / relation，市场份额被一站式的 Drizzle / Prisma 抢走，但保留了"轻、快、透明"的核心优势
4. **类型安全不等于运行时安全**——Kysely 只在编译期校验，db 真实状态偏离 interface 时 TS 不会救你

## 延伸阅读

- 官网入门：[Kysely 官方文档](https://kysely.dev/docs/intro)（30 分钟从安装到第一个 query）
- 类型推导原理：[Type-safety 章节](https://kysely.dev/docs/category/typesafety)（看 Generated / ColumnType / Selection 怎么工作）
- 反向生成 schema：[kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen)（从已有 db 生成 Database interface）

## 关联

- [[prisma]] —— ORM 派代表，Kysely 的"远邻"，对比看出 builder vs DSL 两种哲学
- [[drizzle]] —— 同样 TypeScript-first builder，但带 schema-as-code 和 relation API，Kysely 的"近邻竞争对手"
- [[typescript]] —— Kysely 的整套类型推导依赖 TS 4.x 的模板字面量类型
- [[postgresql]] —— Kysely 主推的 dialect，returning / advisory lock 等特性都是 PG 起家
