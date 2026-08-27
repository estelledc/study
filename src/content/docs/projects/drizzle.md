---
title: Drizzle ORM — 轻量 SQL-like ORM
来源: https://github.com/drizzle-team/drizzle-orm
日期: 2026-05-29
分类: ORM
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/drizzle-team/drizzle-orm
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 273c78071d4841b497f5144734b38294df7ec64b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.45.2
---

## 是什么

Drizzle ORM 是一份 TypeScript 写的 SQL 层：schema 用普通 TS 对象声明，查询用链式 builder 拼成 SQL AST，再交给各 driver 执行。日常类比：它给你一本可组合的菜谱，而不是一排成品按钮——你看得见 `SELECT` / `WHERE` / `JOIN`，也要自己对 SQL 形状负责。

```ts
import { drizzle } from "drizzle-orm/node-postgres"
import { eq } from "drizzle-orm"
import { users } from "./schema"

const db = drizzle(pool)
const rows = await db.select().from(users).where(eq(users.active, true))
```

固定 `0.45.2` 的 `drizzle-orm` 包声明 `sideEffects: false`、零运行时依赖；PostgreSQL / MySQL / SQLite / SingleStore / Gel 等方言各自一份 core，driver 走独立入口。

## 为什么重要

不理解 Drizzle 的分层，下面这些事会对不上：

- 为什么改表结构不必跑客户端 codegen，但 migration SQL 仍要单独生成
- 为什么 `db.query.users.findMany({ with: { posts: true } })` 只有把 `schema` 传进 `drizzle()` 才存在
- 为什么换 Cloudflare D1 或 `postgres` 客户端时，query 代码能复用，import 路径却必须换
- 为什么 README 写的 bundle 体积不能直接当成你项目里的产物大小

## 核心要点

固定版本可以拆成四层：

1. **Schema 就是 TS 对象**：`pgTable('users', { id: serial('id').primaryKey(), email: text('email').notNull() })` 返回带列属性的 table。`serial()` 构造时已经把 `notNull` 和 `hasDefault` 设为 true；`$inferSelect` / `$inferInsert` 从同一份 table 推出读写类型。

2. **SQL builder 对应子句**：`db.select().from(users).where(eq(users.id, 1))` 每一步往 config 里塞子句。`eq` 通过 `bindIfParam` 把右侧值收成 `Param`，序列化时走占位符，不是字符串拼接。

3. **Then 触发执行**：select/insert/update 都是 `QueryPromise`。`await` 才让 dialect 把 AST 编成 SQL，再交给 session/driver。没有隐藏的 query engine 进程。

4. **关系查询是第二条入口**：传入 `schema` 后，`PgDatabase` 按表名挂 `db.query[tableName]`。`findMany` / `findFirst` 走 `RelationalQueryBuilder`，用 `with` 描述嵌套，而不是手写 `leftJoin`。没传 schema 时，类型会提示 generic 缺失。

## 实践示例

### 案例 1：用 pg-core 定义表

```ts
import { pgTable, serial, text } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  bio: text("bio"),
})

type User = typeof users.$inferSelect
// { id: number; email: string; bio: string | null }
```

**逐部分解释**：`pgTable` 把列 builder `build` 到 table 上；未标 `notNull` 的 `text` 在 select 类型里是 `string | null`。列名既可以写在 `serial('id')` 里，也可以留给 table 的 key 去 `setName`。

### 案例 2：SQL-like 查询

```ts
import { eq } from "drizzle-orm"

const list = await db.select().from(users).where(eq(users.id, 1))
```

空 `select()` 选出该表全部列。`where` 接收 `SQL` 节点；`1` 被绑成参数。需要表达式时用 `` sql<string>`lower(${users.email})` ``。

### 案例 3：关系查询与 drizzle-kit

```ts
const db = drizzle(pool, { schema })
const withPosts = await db.query.users.findMany({ with: { posts: true } })
```

`findFirst` 会把 `limit: 1` 写进同一套 relational config。配套 CLI 在同仓 `drizzle-kit@0.31.10`：`generate` 从 schema 差出 SQL 文件，`migrate` 按方言连接后应用，`push` 直接改库。`studio` 在本机起 HTTPS 服务（默认 `0.0.0.0:4983`），终端打印的入口是 `https://local.drizzle.studio`。Gel 方言在 `generate` / `migrate` / `studio` 上会直接退出。

## 踩过的坑

1. **把 RQB 当成默认 API**：`db.query` 只在构造时拿到 relational schema 才会按表挂 builder；只传 client、不传 `schema` 时这条路不存在。
2. **换 driver 只改连接串**：`drizzle-orm/node-postgres`、`drizzle-orm/postgres-js`、`drizzle-orm/d1`、`drizzle-orm/neon-http` 等各自 `construct` session。schema/query 可复用，入口模块不能混。
3. **把 Studio 写成必须登录官方云控制台**：固定 kit 起的是本地服务，UI 域名是 `local.drizzle.studio`；这与「远程托管数据库浏览器」不是同一条合同。
4. **把 README 的 ~7.4kb 或「零依赖」写成你的产物保证**：`package.json` 标了 `sideEffects: false`，最终体积仍取决于 import、bundler 和选中的 driver。
5. **以为 0.45.2 就是仓库最新标签**：同仓已有 `v1.0.0-rc.4` 预发布标签；本文不绑定 RC 行为。

## 适用 vs 不适用场景

**适用**：

- 希望 schema 留在 TypeScript、查询形状接近 SQL 的 TS 服务
- 需要同一套 schema 接到多种 JS 运行时 driver（Node pool、serverless HTTP、D1 等）
- 能接受 migration 由 kit 生成 SQL、运行时不再做 codegen

**不适用**：

- 团队不打算读 SQL，只要对象 API 屏蔽方言差异
- 需要 Gel 的 kit generate/migrate/studio——固定版本这三条命令会拒绝
- 要把未实测的 bundle / 编译时长写成选型结论
- 准备跟 1.0 RC 走，却仍按 0.45.2 文档推理

## 固定版本边界

- 本文绑定 `drizzle-team/drizzle-orm@273c7807...`，`drizzle-orm` 包版本 `0.45.2`；npm latest 同号，未暴露 `gitHead`。
- 同提交里 `drizzle-kit` 是 `0.31.10`（MIT），ORM 本体是 Apache-2.0。
- 仓库另有 `v1.0.0-rc.4`（2026-06-27，prerelease）；升级前需重新固定 revision。
- 本文未安装依赖、未连数据库、未跑 kit/studio、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **「无 codegen」只覆盖客户端**——类型从 mapped type 推，migration SQL 仍是独立产物。
2. **两条查询入口合同不同**——SQL builder 始终可用；RQB 依赖构造期 schema。
3. **driver 是模块边界，不是配置开关**——换运行时先换 import。
4. **CLI 与 ORM 版本要一起读**——kit 命令、Studio 入口和方言拒绝列表都以固定提交为准。

## 应用型自测

1. `drizzle(pool)` 之后，`db.query.users.findMany()` 一定可用吗？
2. `eq(users.id, 1)` 会把 `1` 嵌进 SQL 字符串吗？
3. 固定 kit 的 `studio` 是不是必须连 drizzle.team 云端才能看表？

检查点：

1. 不一定。没把 `schema` 传给 `drizzle()` 时，`query` 不会按表挂上 RQB。
2. 不会。`eq` 把右侧收成参数化 `Param`。
3. 不是。kit 起本地 HTTPS 服务，打印的是 `https://local.drizzle.studio`。

## 延伸阅读

- 文档：[orm.drizzle.team](https://orm.drizzle.team/)
- 固定源码：[drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) —— 本文绑定提交 `273c78071d4841b497f5144734b38294df7ec64b`
- [[postgres-js]] —— 常见的轻量 pg 客户端，对应 `drizzle-orm/postgres-js`
- [[prisma]] —— DSL + 客户端 codegen 的对照路线
- [[kysely]] —— 更贴近裸 SQL 的 TS builder，不管 schema-as-code

## 关联

- [[prisma]] —— schema-first + generate 的对照
- [[kysely]] —— 纯 query builder，不内置 schema 运行时
- [[typeorm]] —— Decorator / Active Record 一派
- [[postgresql]] —— `pg-core` 的主力方言
- [[postgres-js]] —— 常与 Drizzle 搭配的 Node pg 客户端

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
