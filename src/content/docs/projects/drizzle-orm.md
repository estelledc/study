---
title: drizzle-orm
来源: 'https://github.com/drizzle-team/drizzle-orm'
日期: '2026-06-13'
子分类: Web 后端
分类: 后端 API
难度: '中级'
provenance: 'pipeline-v3'
season: 6
---

## 日常类比：外卖平台的「菜单 + 查单 + 改店规」

想象你经营一家外卖平台，后台要操作三张核心表：`users`（顾客）、`orders`（订单）、`order_items`（菜品明细）。

真实世界里你会：

- **先定菜单规格**——每道菜叫什么、多少钱、是否可售 → 对应 **schema 定义**
- **再按条件查单**——「今天未完成的订单」「某用户最近 10 单」→ 对应 **查询构建**
- **店铺升级要留档**——加一列「配送备注」、改价格字段类型 → 对应 **migration 迁移**

**Drizzle ORM**（[drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)）就是这套流程的 TypeScript 版调度员：你在普通 `.ts` 文件里描述表结构和查询意图，它翻译成**参数化 SQL**发给 PostgreSQL / MySQL / SQLite 等，并把返回行映射成带类型的对象。

和 [[prisma]] 的「点菜按钮」不同，Drizzle 更像**自己写厨房工单**——`select().from(orders).where(eq(orders.status, 'pending'))` 读起来几乎就是 SQL。懂 SQL 的人上手快；不熟 SQL 的人会觉得 Prisma 的 JSON 式 API 更顺，这是审美差异，不是对错。

---

## 是什么

Drizzle 是一套用 TypeScript 定义数据库表结构、用链式 API 拼 SQL、全程类型推导的轻量 ORM。特点可以压成三句：

1. **无 codegen 客户端**——改 schema 后不用跑 `prisma generate`，类型从 TS 直接推断。
2. **SQL 可见**——query builder 每一节链式调用对应 SQL 的一个子句，日志里看到什么就是什么。
3. **体积小**——核心包 KB 级，适合 Cloudflare Workers、Vercel Edge、Bun 等对 bundle 和冷启动敏感的环境。

配套 CLI **drizzle-kit** 负责 migration：`generate` 从 schema diff 出 SQL 文件，`migrate` 应用到库，`push` 适合本地原型快速对齐。

---

## 解决什么问题

Node.js 访问数据库的长期痛点里，Drizzle 切的是「**TypeScript 全栈 + Serverless + 团队会 SQL**」这条缝：

| 痛点 | Drizzle 的回应 |
| --- | --- |
| ORM 太重、冷启动慢、塞不进 Edge | 零原生二进制，Workers / Edge 可跑 |
| Prisma 每次改 schema 要 `generate` | `$inferSelect` / `$inferInsert` 从 schema 直接推断 |
| Raw SQL 无类型、列名拼错运行时才发现 | `users.email` 是类型化列引用，编译期报错 |
| TypeORM 装饰器 + 隐式 SQL 难调试 | builder 与 SQL 子句 1:1 |
| Knex 有 builder 但 schema 与类型脱节 | schema 即类型唯一真相源 |

Drizzle **不替代** DBA 写复杂存储过程，也**不承诺**让完全不懂 SQL 的人无痛上手。2026 年语境里，Prisma 7 已用 TS/WASM 替换 Rust query engine，体积和冷启动差距在缩小——但 Drizzle 仍是无 codegen、SQL 一一对应的轻量选项；选型时「团队会不会 SQL」往往比 benchmark 差几十毫秒更决定性。

---

## 与 Prisma / TypeORM / Knex 的对比

| 工具 | 哲学 | Schema 在哪 | Query 风格 |
| --- | --- | --- | --- |
| **Prisma** | Schema-first + 生成客户端 | `.prisma` DSL | `prisma.user.findMany({ include })` |
| **Drizzle** | SQL-first + TS 推断 | TS `pgTable(...)` | `db.select().from(users).where(...)` |
| **TypeORM** | 企业级 ORM | `@Entity` 装饰器类 | Repository / QueryBuilder |
| **Knex** | 查询构建器（非完整 ORM） | 无内建 schema | `knex('users').where({ id: 1 })` |

| 维度 | Prisma | Drizzle | TypeORM | Knex |
| --- | --- | --- | --- | --- |
| 类型安全 | 生成 Client，极强 | schema 推断，极强 | 装饰器，关系字段偏松 | 弱 |
| Bundle / 冷启动 | Prisma 7：~1.6MB、80–150ms | ~5–7KB、50–100ms | ~80KB+，偏慢 | 轻量 |
| Edge | 支持但体积仍大 | 原生友好 | 不支持 | 视 driver |
| Migration | Prisma Migrate 最成熟 | drizzle-kit，快速迭代 | 内置 CLI | `knex migrate` |
| 关系查询 | `include` 一行嵌套 | `db.query` + `with` 或手写 join | `relations` + find | 手写 join |
| 学习曲线 | 低 | 中（最好会 SQL） | 中高 | 低（会 SQL 即可） |

很多人把 Drizzle 看成「**有 schema 的 Knex**」：保留 builder 手感，同时让 `orders.status` 成为带类型的列对象。已有 Knex 迁移历史可渐进引入；`drizzle-kit pull` / `introspect` 还能从现有库反推 TS schema。

---

## 核心概念

### 1. Schema 定义（表结构即 TypeScript）

Schema 是**唯一真相源**：migration diff、查询返回类型、insert 约束都从它流出。

```ts
// src/db/schema.ts
import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull().default('pending'),
  totalCents: integer('total_cents').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id),
  sku: text('sku').notNull(),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
})
```

要点：

- `pgTable` / `mysqlTable` / `sqliteTable` 按方言选择，**没有**跨方言统一 `table` 抽象
- `.notNull()` 把 TS 类型从 `string | null` 收窄为 `string`
- `typeof users.$inferSelect` → 查询行类型；`$inferInsert` → 插入时可选/必填字段

```ts
type User = typeof users.$inferSelect
// { id: number; email: string; name: string | null; createdAt: Date }

type NewUser = typeof users.$inferInsert
// { email: string; name?: string | null; id?: number; createdAt?: Date }
```

### 2. 查询构建（Query Builder）

**SQL-like API**——链式调用对应 SQL 子句：

```ts
import { eq, and, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { users, orders } from './schema'

const db = drizzle(pool)

const recentPaid = await db
  .select({
    orderId: orders.id,
    total: orders.totalCents,
    email: users.email,
  })
  .from(orders)
  .innerJoin(users, eq(orders.userId, users.id))
  .where(and(eq(users.id, 42), eq(orders.status, 'paid')))
  .orderBy(desc(orders.createdAt))
  .limit(10)
```

背后流程：

1. `eq(...)` 生成 AST，**参数化**绑定，防 SQL 注入
2. `select({...})` 字面量推导返回类型
3. `await` 时序列化为一条 SQL 执行

**Relational Queries（RQB v2）**——类似 Prisma 的 `include`，用 `db.query` + `with`：

```ts
import { relations } from 'drizzle-orm'
import { eq } from 'drizzle-orm'

// relations 可集中定义（v2 推荐 defineRelations）
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}))

const db = drizzle(pool, { schema: { users, orders, orderItems, ordersRelations } })

const userWithOrders = await db.query.users.findFirst({
  where: { id: 42 },
  with: {
    orders: {
      where: { status: 'pending' },
      with: { items: true },
      limit: 5,
    },
  },
})
```

复杂报表、窗口函数仍建议 SQL-like builder；读多写少、嵌套关系可交给 RQB。

### 3. Migration（drizzle-kit）

运行时 **不** codegen 客户端；结构变更靠 **drizzle-kit**：

```bash
# 改 schema.ts 后生成 SQL 迁移
npx drizzle-kit generate

# 审查 drizzle/0001_xxx.sql 后应用
npx drizzle-kit migrate

# 本地原型快速对齐（生产慎用）
npx drizzle-kit push
```

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

官方文档列出多种 migration 策略：generate + migrate、generate + 运行时 `migrate()`、generate + 外部工具（Atlas）、仅 `push` 做本地迭代等。2026 年 drizzle-kit 在 beta 线持续加强 **commutativity check**（`drizzle-kit check`）和 migration 表版本化，多分支并行开发时 worth 关注。

---

## 实践案例

### 案例 1：事务下单（insert + 明细）

```ts
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { orders, orderItems } from './schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool)

async function placeOrder(
  userId: number,
  items: { sku: string; qty: number; priceCents: number }[],
) {
  const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0)

  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({ userId, status: 'pending', totalCents })
      .returning()

    await tx.insert(orderItems).values(
      items.map((i) => ({
        orderId: order.id,
        sku: i.sku,
        quantity: i.qty,
        unitPriceCents: i.priceCents,
      })),
    )

    return order
  })
}
```

`transaction` 保证「主单 + 明细」同事务提交——不能出现「有订单没菜品」的半成品单。

### 案例 2：原始 SQL 逃生舱

复杂报表（窗口函数、CTE）用 `sql` 模板仍保持参数化：

```ts
import { sql } from 'drizzle-orm'

const topCustomers = await db.execute(sql`
  SELECT u.id, u.email, COUNT(o.id)::int AS order_count
  FROM users u
  JOIN orders o ON o.user_id = u.id
  WHERE o.created_at > NOW() - INTERVAL '30 days'
  GROUP BY u.id, u.email
  ORDER BY order_count DESC
  LIMIT 10
`)
```

Drizzle 的设计是 **80% CRUD 用 builder，20% 复杂 SQL 用 raw**，同一条类型化管道。

---

## 典型项目结构

```
src/
  db/
    schema.ts          # 表定义（可按域拆多文件）
    index.ts           # drizzle(pool) 单例
drizzle/
  0000_init.sql        # kit generate 产出
  meta/
drizzle.config.ts
```

多文件 schema 时，`drizzle.config.ts` 的 `schema` 可指向目录，kit 递归收集所有 export 的表。

---

## 踩过的坑

1. **Dialect import 不能混用**：`drizzle-orm/pg-core` 与 `mysql-core` 换库要换整套 table 定义。
2. **RQB 要配 relations**：`db.query.*` 的 `with` 依赖 `relations()`；只写 `references()` 不够。
3. **`push` 别上生产**：绕过迁移历史，只适合本地原型。
4. **camelCase vs snake_case**：`drizzle({ casing: 'snake_case' })` 可统一 TS 字段名与库列名映射。
5. **大 schema 编译变慢**：大量 `pgTable` + 复杂 relations 会让 `tsc` 变慢——按域拆文件。
6. **driver import 路径**：`node-postgres`、`d1`、`neon-http` 等初始化不同，schema/query 代码可复用，连接层要对照文档。

---

## 适用 vs 不适用

**适用**：

- Next.js / Hono / Elysia 等 TS 后端，部署在 Node 或 Edge
- 团队愿意看 SQL，需要 CTE、窗口函数、部分索引等 Postgres 特性
- 不想在 CI 里跑 `prisma generate`
- Serverless 对 bundle 和冷启动敏感

**不适用**：

- 团队几乎没人写过 SQL → [[prisma]] 更省心
- 大型 TypeORM 单体、重度装饰器 → 迁移成本高于收益
- 只要迁移脚本、应用层另有 ORM → [[knex]] 或纯 SQL 足够

---

## Season 6 上下文：数据层在长任务里的位置

Season 6 聚焦 **数据 + 长任务 + 真实产品**。真实产品里数据库层通常要同时满足：

- **类型安全**：API handler 与 background job 共用 schema 类型
- **可迁移**：schema 变更可审查、可回滚
- **可观测**：慢查询能对上代码里的 builder 链

Drizzle 把 schema 留在普通 TS 文件中，使 **API 路由、Temporal worker、批处理脚本** 可以 `import { orders } from '@/db/schema'` 共享类型，不依赖生成物同步——对「长任务 + 多入口写库」的项目特别实用。

---

## 学到什么

1. **ORM 不一定要 codegen**——TS 类型运算已能承担 schema → 行类型的桥梁。
2. **SQL 可见性是团队选择**——遮 SQL 降低门槛；露 SQL 降低调试成本。
3. **Knex 与 Drizzle 是上下游**——前者补迁移与 builder 经验，后者补 schema 与类型。
4. **Edge 时代体积是功能**——不是「快一点」，而是「能不能部署」。

---

## 延伸阅读

- 官方文档：[orm.drizzle.team](https://orm.drizzle.team/)
- GitHub：[drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)
- Migrations 策略：[orm.drizzle.team/docs/migrations](https://orm.drizzle.team/docs/migrations)
- Relational Queries v2：[orm.drizzle.team/docs/rqb-v2](https://orm.drizzle.team/docs/rqb-v2)

## 关联

- [[prisma]] —— DSL + 生成客户端的标杆 ORM
- [[typeorm]] —— 装饰器 + Repository 传统企业 ORM
- [[kysely]] —— 纯 query builder，无 schema 层
- [[postgresql]] —— Drizzle 最常用的方言
- [[nestjs]] —— 常与 Drizzle 组合的后端框架
