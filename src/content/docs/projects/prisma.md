---
title: Prisma — 类型安全 ORM
来源: https://github.com/prisma/orm
日期: 2026-05-29
分类: ORM
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/prisma/orm
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e92bc46e8fff73e3985f86f23393b7e3f0e90010
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.10.0
---

## 是什么

Prisma 是一套用 schema 描述数据模型、再生成 TypeScript 客户端的 ORM。日常类比：先写一份菜单（`schema.prisma`），再让厨房按菜单出点餐口（generated client）。7.10.0 的点餐口不再自己握数据库门钥匙：你必须交给它一份 driver adapter，或走 Prisma Accelerate。

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findUnique({
  where: { email: "a@b.com" },
  include: { posts: true },
});
```

`include` / `select` 仍是客户端 API；它们会先被编成 query plan，再交给本地 interpreter 或 Accelerate。未 generate 时，`@prisma/client` 只是会抛错的 stub。

## 为什么重要

不理解 Prisma 7 的构造与执行合同，下面这些事都会按 5.x / 6.x 印象写错：

- 为什么 `new PrismaClient()` 不再够用，缺 `adapter` 会报 `P2038`
- 为什么 datasource URL 从 schema 挪到 `prisma.config.ts`
- 为什么 `prisma-client` generator 必须写 `output`，导入路径不再默认是 `@prisma/client`
- 为什么“Rust query engine 直连数据库”不再是 7.10.0 的默认本地路径

## 核心要点

Prisma 7.10.0 的主链可以拆成五步：

1. **声明模型**：`schema.prisma` 仍写 `model` / `@id` / `@relation`。`datasource` 只声明 provider；URL 由 `defineConfig({ datasource: { url } })` 提供。

2. **生成客户端**：`prisma generate` 走 `prisma-client` 时必须给 `output`。生成物是一份带类型的 `PrismaClient`，不是手写 class。

3. **构造运行时**：`new PrismaClient({ adapter })` 或 `{ accelerateUrl }`。`getEngineInstance()` 只创建 `ClientEngine`。

4. **编译 query plan**：普通查询先参数化，再经 WASM `QueryCompiler` 得到 plan。默认 cache 上限 1000；`createMany` / `createManyAndReturn` 不进 cache。`queryPlanCacheMaxSize: 0` 关闭 cache。

5. **执行与组装**：本地路径由 `LocalExecutor` + `QueryInterpreter` 跑 plan；Accelerate 走 `RemoteExecutor`。同一 tick 的请求可由 `DataLoader` 合成 `requestBatch`。

## 实践示例

### 案例 1：config + 显式 output

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}
```

```ts
// prisma.config.ts
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
```

`prisma-client` 不写 `output` 会直接失败。`migrate dev` / `migrate deploy` 也从这份 config 读 URL，不是从 schema 里的 `url = env("DATABASE_URL")`。

### 案例 2：adapter 是默认入口

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: ["query"],
  transactionOptions: { maxWait: 2000, timeout: 5000 },
});
```

注释里的 `maxWait` / `timeout` 就是构造函数默认值。要走云端连接池，用 `accelerateUrl`，且不能同时传 `adapter`。

### 案例 3：改 schema 后仍要 generate

```bash
npx prisma migrate dev --name add_bio
npx prisma generate
```

migrate 负责 SQL 与 `_prisma_migrations`；generate 负责类型和 runtime 副本。只跑其中一个，会出现“库已改、客户端还是旧形状”。

## 踩过的坑

1. **把旧 `new PrismaClient()` 当 7.10.0 合同**：固定源码在缺 adapter / Accelerate URL 时抛 `PrismaClientInitializationError`（`P2038`）。

2. **继续从 `@prisma/client` 当生成入口**：未 generate 的包导出是 stub；7.10.0 推荐导入 `./generated/prisma/client`。

3. **以为 `include` 一定拆成多条 SQL**：客户端仍接受 `include` / `select`，但它们先变成 query plan。是否 JOIN、是否多语句，取决于 compiler 与 adapter 的 `supportsRelationJoins`，要用 `log: ['query']` 看当次 plan。

4. **把 npm `prisma@latest` 当成稳定 7**：审查当日 `prisma` 的 latest 是 `8.0.0-rc.12`，`@prisma/client` latest 仍是 `7.10.0`。7.10.0 另提供 `@prisma/prisma7`，用来和 Prisma 8 并存，不是把 RC 写成当前事实。

5. **把 GitHub “latest release” 当成 7.10.0**：API 把 `v0.17.0` 标成 latest；本页绑定的是非预发布 tag `7.10.0`。

## 适用 vs 不适用场景

**适用**：

- 需要 schema、migrate、生成客户端和 Studio 同一工具链
- 应用进程用 `@prisma/adapter-pg` 等 driver adapter 直连
- 或显式选择 Prisma Accelerate，不在进程内持有连接

**不适用**：

- 不能接受“构造时必须给 adapter / Accelerate URL”
- 要把每条 SQL 写成可见的 builder 链 → 看 [[kysely]]
- 需要跨 datasource 的单笔 transaction：7.10.0 客户端 API 没有这条保证
- 准备把 8.0 RC 或 `v0.17.0` 当成本页结论

## 固定版本边界

- 本文绑定 `prisma/orm@e92bc46e...`，tag / package 为 `7.10.0`。
- `https://github.com/prisma/prisma` 301 到 `prisma/orm`；npm 元数据仍写旧仓库路径。
- 声明 Node `^20.19 || ^22.12 || >=24.0`。
- npm `prisma` latest 与 `@prisma/client` latest、GitHub latest release 三者不一致；升级前需重新建立 provenance。
- 本文未安装依赖、运行 migrate / generate、连接数据库或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **生成物不是连接器**——schema 负责形状，adapter / Accelerate 负责怎么连上库。
2. **配置文件成了 URL 的家**——migrate 与 generate 都读 `prisma.config.*`，不能只改 schema。
3. **默认引擎路径已经换**——7.10.0 本地主链是 WASM compiler + JS interpreter，不是“每次查询都拉起独立 Rust binary”。
4. **latest 标签会撒谎**——CLI、client、GitHub latest 可以指向三条线，笔记必须钉到可复查提交。

## 应用型自测

1. 固定 7.10.0 里写 `new PrismaClient()` 且不传 `adapter` / `accelerateUrl`，会怎样？
2. `prisma-client` generator 不写 `output`，`prisma generate` 会成功吗？
3. `queryPlanCacheMaxSize: 0` 之后，`findUnique` 还会写进 plan cache 吗？

检查点：

1. 抛初始化错误 `P2038`，要求传入 adapter。
2. 不会；generator 要求显式 output。
3. 不会；`0` 会关掉 `QueryPlanCache`。

## 延伸阅读

- 文档：[prisma.io/docs](https://www.prisma.io/docs)
- 固定源码：[prisma/orm](https://github.com/prisma/orm) —— 本文绑定提交 `e92bc46e8fff73e3985f86f23393b7e3f0e90010`
- [[kysely]] —— 同主题对照：可见 SQL builder，没有 codegen 客户端

## 关联

- [[kysely]] —— query builder 对照；看见 SQL 与 schema-first 是两条合同
- [[postgres]] —— 7.10.0 示例与 `@prisma/adapter-pg` 的主路径
- [[graphql]] —— 早期 schema DSL 仍能在 `?` / `[]` 语法里看到影响

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[cal-com]] —— cal.com — 自己能托管的开源 Calendly
- [[drizzle]] —— Drizzle ORM — 轻量 SQL-like ORM
- [[edgedb]] —— EdgeDB / Gel — 在 Postgres 上长出图风查询语言，让类型系统替你做 ORM
- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[kysely]] —— Kysely — TypeScript SQL 查询构建器
- [[mikro-orm]] —— MikroORM — Data Mapper Identity Map ORM
- [[next-js]] —— Next.js — React 全栈框架
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[sequelize]] —— Sequelize — 老牌 Node ORM
- [[typeorm]] —— TypeORM — Decorator-based ORM
- [[unstorage]] —— unstorage — 让 KV 存储不绑死运行时的统一抽象层
