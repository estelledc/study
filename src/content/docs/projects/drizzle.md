---
title: Drizzle ORM — 轻量 SQL-like ORM
来源: https://github.com/drizzle-team/drizzle-orm
日期: 2026-05-29
分类: ORM
难度: 中级
---

## 是什么

Drizzle 是一个 TypeScript 写的 ORM——你定义 schema、写 query，它帮你生成 SQL 并把结果映射成对象。日常类比：餐厅有两种点单方式——

- [[prisma]] 是**点菜按钮**：你按"红烧肉"那个按钮，后厨怎么做你不管，端上来什么样也只能听服务员的。
- Drizzle 是**菜谱本**：写下"五花肉切块、糖色、加酱油慢炖"——你看得见每一步，自己组合，但要懂一点烹饪。

更直接的对比：

```ts
// Prisma：你不写 SQL
const rows = await prisma.user.findMany({ where: { active: true } })

// Drizzle：你像写 SQL 一样组合（注意别和表名 users 撞名）
const rows = await db.select().from(users).where(eq(users.active, true))
```

两边都给你类型安全，但 Drizzle 让 SQL 留在视野里。

## 为什么重要

不理解 Drizzle 的判断，下面这些事都没法解释：

- **不需要 codegen**：Prisma 每次改 schema 要跑 `prisma generate` 出客户端代码，Drizzle 直接读 TS 类型——启动快、CI 简单、IDE 跳转能跳到 schema 源文件。
- **SQL 风格 API 让懂 SQL 的人零成本**：`select().from().where()` 一眼看出对应 SQL，不用学新概念。
- **体积小，能塞 edge runtime**：Prisma Client 加上 query engine 几 MB，Drizzle 几十 KB——Cloudflare Workers / Vercel Edge / Bun 这些"启动要快、bundle 要小"的环境，Drizzle 是首选。
- **类型 100% 从 schema 推**：你写一遍 schema，`InsertModel` / `SelectModel` / `UpdateModel` 全自动出来——这是 TS mapped type 5 年来的能力升级才让这条路线变可能。

## 核心要点

Drizzle 的设计可以拆成 **三块**：

1. **Schema 用 TS 函数定义**：不像 Prisma 写一个独立 `.prisma` DSL 文件，Drizzle 让你 `pgTable('users', { id: serial('id').primaryKey() })`——schema 就是普通 TS 对象，可以 `import` / 跳转 / 重构。

2. **Query builder 链式调用对应 SQL**：`db.select().from(users).where(eq(users.id, 1))` 这条链每一节都对应 SQL 的一个子句——builder 的形状跟 SQL 1:1 映射，不藏 magic。

3. **Type inference 自动推 row 类型**：每个 query 的返回值类型是 schema 推出来的——加列、改列、删列，所有用到这个表的 query 类型立即变化，编译期提示。

## 实践案例

### 案例 1：定义一张表的 schema

```ts
import { pgTable, serial, text } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  bio: text('bio'),  // 没写 notNull，所以可空
})
```

**逐部分解释**：

- `pgTable(...)` 是工厂函数，返回一个带类型的 table 对象
- `serial('id')` 是 PostgreSQL 的自增整数列；类型 builder 上链 `.primaryKey()` 标主键
- `text(...).notNull()` 让 TS 类型层面把这一列从 `string | null` 变成 `string`——`notNull()` 不只是运行时调用，而是改了 generic 参数

类型自动推出来：

```ts
type User = typeof users.$inferSelect
//   ^? { id: number; email: string; bio: string | null }
```

### 案例 2：写一个 query

```ts
import { eq } from 'drizzle-orm'
import { users } from './schema'

const list = await db.select().from(users).where(eq(users.id, 1))
//    ^? Array<{ id: number; email: string; bio: string | null }>
```

`list` 自动是 `User[]` 类型，没手写一处类型注解。背后发生了什么：

1. `db.select()` 返回一个 builder（fluent 链式起点）
2. `.from(users)` 把 schema 对象塞进 config，类型层面记下"我从 users 表来"
3. `.where(eq(users.id, 1))` 注意 `eq` 是函数不是字符串——返回一个 `SQL` AST 节点，所以参数 `1` 自动参数化（防 SQL 注入）
4. `await` 触发 `execute()`，把 AST 序列化成 `SELECT * FROM users WHERE id = $1` 加参数 `[1]`

### 案例 3：用 drizzle-kit 生成 migration

Drizzle 不在运行时生成代码，但**migration**还是要从 SQL 跑——`drizzle-kit` 是配套的命令行工具：

```bash
# 你改了 schema.ts，加了一列
npx drizzle-kit generate
# → 生成 drizzle/0001_add_bio_column.sql

npx drizzle-kit migrate
# → 把 0001 应用到数据库
```

drizzle-kit 读你的 `schema.ts` + 数据库当前状态，做 diff 算出"该加什么、该改什么"，写成 SQL 文件让你 review 后执行。这一步**不是 codegen 出客户端代码**——它只生成 migration SQL，运行时仍然零生成。

## 踩过的坑

1. **SQL 风格曲线陡（vs Prisma）**：Prisma 的 `findMany({ where, include, orderBy })` 看起来像写 JSON，Drizzle 让你写 `select().from().where().orderBy()`——如果你不熟 SQL，前者更顺。这是审美差异，没标准答案。

2. **关系查询要手写 leftJoin / innerJoin**：

   ```ts
   // Prisma：一行 include 自动 join
   await prisma.user.findMany({ include: { posts: true } })

   // Drizzle 经典 builder：要自己写 join
   await db.select().from(users).leftJoin(posts, eq(posts.userId, users.id))
   ```

   Drizzle 后来加了 RQB（relational query builder） `db.query.users.findMany({ with: { posts: true } })` 来追平这个差距，但运行时复杂度更高、SQL 不那么直观。

3. **多 driver 配置略不同**：Drizzle 支持 PostgreSQL / MySQL / SQLite / PlanetScale / Neon / Cloudflare D1 / Bun SQL ……每个 driver 的初始化代码都要换一行 import：

   ```ts
   // node-postgres
   import { drizzle } from 'drizzle-orm/node-postgres'
   const db = drizzle(pool)

   // Cloudflare D1
   import { drizzle } from 'drizzle-orm/d1'
   const db = drizzle(env.DB)
   ```

   schema / query 代码不变，但**配置层换 driver 时容易踩 import 路径**——文档要按 driver 翻一翻。

4. **Studio 需连官方云端**：`drizzle-kit studio` 会连 drizzle.team 云端做可视化；有免费额度，完整能力偏商业化。Prisma Studio 则是免费本地进程——部署/隐私预期不同。

## 适用 vs 不适用场景

**适用**：

- 想要"schema 在 TS 文件 + 看得见 SQL + 类型推导好"全占的 TS 项目
- Edge runtime / serverless 部署（Cloudflare Workers / Vercel Edge / Bun）——bundle size 决定一切
- 团队熟 SQL，喜欢 query 写法跟 SQL 一一对应
- 不想要 codegen 步骤拖慢 CI

**不适用**：

- 团队不熟 SQL、想用 ORM 完全屏蔽 SQL → 选 Prisma
- 已经有 legacy 数据库、不想要 migration 工具 / 关系系统、只要 type-safe builder → 选 Kysely
- 习惯 Java/C# 的 Entity / Repository 心智 → 选 TypeORM 或 MikroORM
- 100+ 表的大型 schema 且 tsc 编译速度敏感——Drizzle 类型推导用了大量 mapped type，编译时间会涨

## 历史小故事（可跳过）

- **2018 年**：Prisma 1.0 用 `.prisma` DSL + codegen 火起来，定义了一代 ORM 的"DSL 派"路线。
- **2021 年**：Kysely 走另一条路——纯 TS query builder，不管 schema，让你手写 interface。"SQL builder 派"。
- **2022 年**：Drizzle 第一个 commit，提出第三条路——schema 用 TS、builder 用 TS、类型从 schema 推。
- **2023-2024 年**：Cloudflare Workers / Vercel Edge / Bun 成熟，bundle size 重要性飙升，Drizzle 成为 edge runtime ORM 首选。
- **2026 年**：Drizzle 在 GitHub ~28k stars，跟 Prisma / TypeORM 三分天下。

## 学到什么

1. **Codegen 不是 ORM 的必需品**——Prisma 把"DSL + generate"作为核心卖点 5 年，Drizzle 证明了"用 TS mapped type 推同样能做到 type-safe"。
2. **schema 在哪里决定一切**——schema 在 DSL 文件 / TS 对象 / 类装饰器，三个选择背后是三种心智，没对错。
3. **SQL 可见性是审美选择**——Prisma 选择遮，Drizzle 选择露，团队习惯决定哪个顺。
4. **bundle size 在 edge runtime 时代是硬指标**——10MB 跟 50KB 不是"快慢"差距，是"能跑跟不能跑"差距。

## 延伸阅读

- 官方文档：[orm.drizzle.team](https://orm.drizzle.team/)（按 driver 分章节）
- 对比：[Drizzle vs Prisma](https://orm.drizzle.team/docs/comparison)
- GitHub：[drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)
- [[kysely]] —— 纯 SQL builder 路线，对比基线

## 关联

- [[prisma]] —— DSL 派 ORM，Drizzle 直接对标
- [[kysely]] —— 不管 schema 的 TS SQL builder
- [[typeorm]] —— Decorator / Active Record 一派
- [[postgresql]] —— Drizzle 主力 dialect 是 pg-core
- [[postgres-js]] —— 常与 Drizzle 搭配的轻量 pg 客户端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[kysely]] —— Kysely — TypeScript SQL 查询构建器
- [[mikro-orm]] —— MikroORM — Data Mapper Identity Map ORM
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[prisma]] —— Prisma — 类型安全 ORM
- [[sequelize]] —— Sequelize — 老牌 Node ORM
- [[typeorm]] —— TypeORM — Decorator-based ORM
- [[unstorage]] —— unstorage — 让 KV 存储不绑死运行时的统一抽象层
