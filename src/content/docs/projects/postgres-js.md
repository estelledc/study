---
title: postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
来源: 'porsager/postgres on GitHub, https://github.com/porsager/postgres'
日期: 2026-05-30
分类: 数据库
难度: 初级
---

## 是什么

postgres.js（npm 包名 `postgres`）是一个**让你用反引号写 SQL，但参数自动安全绑定**的 Node.js PostgreSQL 客户端。日常类比：像「带防夹手设计的剪刀」——你照常剪东西，但手指放错位置时它机械结构就剪不下去，而不是靠你「记得小心」。

你写：

```js
const id = userInput
const rows = await sql`select * from users where id = ${id}`
```

这一行**不可能**被 SQL 注入——因为反引号语法里 `${id}` 不是字符串拼接，JS 引擎会把 `id` 单独传给标签函数，再由它转成 `$1` 占位符发给 PG。零依赖、内置连接池、跨 Node / Deno / Bun / Cloudflare Workers 都能跑。

## 为什么重要

不理解 postgres.js 的设计，下面这些事都没法解释：

- 为什么不少新项目在继续用 `pg` 与上 Prisma 这种重 ORM 之间，会选 postgres.js 这类 SQL-first 客户端
- 为什么"模板字符串"在它这里不是字符串拼接糖，而是**安全保证的根**
- 为什么作者声称它能比 `pg` 快 2-5x（同样跑 PG，差别从哪来）
- 为什么 LISTEN/NOTIFY 这种冷门特性被它做成一等公民、其他客户端却懒得封

## 核心要点

postgres.js 的设计可以拆成 **三件事**：

1. **tagged template literal 当唯一入口**：调用 `` sql`...${x}` `` 时，JS 引擎把 `x` 单独传进 tag 函数，**字符串和参数永远分两条路走**。类比：双轨火车，乘客（参数）从来不会跑到货运轨道（SQL）上。

2. **8 个 Queue 状态机做连接池**：连接的状态用 `closed / connecting / open / busy / full / reserved / ended` 等队列表示，用一个 `move(c, queue)` 函数当唯一迁移点；`max_pipeline=100` 让一条连接能塞 100 条未回 query。类比：高速收费站——一条道能同时排 100 辆车，不必等一辆走完再放一辆。

3. **LISTEN/NOTIFY 和逻辑复制是一等公民**：`sql.listen('ch', fn)` 直接监听 PG 的 NOTIFY 消息；`sql.subscribe('insert:public.orders', fn)` 直接订阅逻辑复制流。类比：数据库自带的「门铃」和「监控摄像头」，postgres.js 把按钮搬到了客户端。

## 实践案例

### 案例 1：5 行跑通一条 select

```js
import postgres from 'postgres'
const sql = postgres('postgres://user:pw@localhost:5432/db')
const id = 1
const rows = await sql`select ${id} as one, now() as ts`
console.log(rows)  // [ { one: 1, ts: 2026-05-30T... } ]
await sql.end()
```

**逐部分解释**：

- `postgres(url)` 返回一个工厂函数 `sql`，它本身就是连接池入口
- `` sql`...${id}` `` 反引号语法让 `id` 走参数通道，SQL 文本里实际只是 `select $1 as one, now() as ts`
- `await` 直接拿到行数组——不需要单独 `pool.connect() / client.query() / client.release()` 三步

### 案例 2：事务 + 嵌套 savepoint

```js
await sql.begin(async sql => {
  await sql`insert into orders (uid, amount) values (${uid}, ${amt})`
  await sql.savepoint(async sql => {
    await sql`update users set balance = balance - ${amt} where id = ${uid}`
  })
})
```

**逐部分解释**：

- `sql.begin(async sql => ...)` 接管连接、自动发 BEGIN / COMMIT；回调内 throw 会自动 ROLLBACK
- 回调里的 `sql` 是**绑定到同一个连接**的新实例——保证事务里所有 query 走同一 session
- `sql.savepoint` 嵌套时实际发 SAVEPOINT 而不是真的嵌套事务，回调内 throw 只回滚到这个 savepoint

### 案例 3：LISTEN/NOTIFY 当轻量消息总线

```js
const sql = postgres()
await sql.listen('order_created', payload => {
  console.log('new order:', payload)
})
await sql.notify('order_created', JSON.stringify({ id: 42 }))
```

**逐部分解释**：

- `sql.listen` 内部开一个 `max:1` 的常驻连接，只负责接 NOTIFY 消息
- `sql.notify` 走普通连接池发 `NOTIFY channel, payload`
- 比拉一个 Redis pub/sub 简单 10 倍——只要你已经有 PG，零额外服务

## 踩过的坑

1. **必须用反引号**：写成 `sql('select ...')` 会抛 `NOT_TAGGED_CALL`——`sql()` 普通调用只在传单字符串当 Identifier、或对象当 Builder 时合法，否则保命设计强制报错。
2. **undefined 默认抛错而不是绑 null**：这是和 `pg` 最大差异。`pg` 把 undefined 静默转 null（漏传字段直接清库的经典 footgun），postgres.js 默认抛 `UNDEFINED_VALUE`，要改成 null 必须显式 `transform: { undefined: null }`。
3. **bigint / numeric 默认是字符串**：JS Number 只能精确表示到 2^53，PG 的 `bigint` / `numeric` 直接给 Number 会丢精度，所以默认返回字符串。需要数值要 `.as('bigint')` 或自定义 parser。
4. **嵌套 begin 不是真嵌套事务**：内层 `sql.begin` 实际发 SAVEPOINT，error code `25P02`（in_failed_sql_transaction）的处理外层和内层不同，容易写出"以为回滚了其实没回滚"。
5. **TEMPORARY replication slot 断线丢事件**：`sql.subscribe` 默认建临时 slot，断线重连后从最新 LSN 起，断线期间 INSERT 全部丢失。生产 CDC 必须自己 `CREATE_REPLICATION_SLOT`（不带 TEMPORARY）并持久化 LSN。

## 适用 vs 不适用场景

**适用**：
- 写脚本 / 数据迁移 / 报表 / cleanup task——5 行起步、零 boilerplate
- 中小项目里替换 `pg` 直接写 SQL，需要 SQL 表达力但不想上 ORM
- 内部消息总线（LISTEN/NOTIFY）和 CDC（逻辑复制）场景
- 跑在 Cloudflare Workers / Bun / Deno 等多 runtime 的项目

**不适用**：
- 团队对 type safety 敏感、要从 schema 推查询返回类型 → 用 [[drizzle]] 或 [[kysely]]
- multi-tenant SaaS 跨多客户 schema、要重 migration 工具 → 用 [[prisma]]
- 已经深度依赖 `pg` 生态（pg-pool / pg-cursor / pg-format）的旧项目
- 高保障 CDC（不能丢事件）→ 默认 TEMPORARY slot 断线丢事件，要自己管 LSN

## 历史小故事（可跳过）

- **2015 年**：ES2015 把 tagged template literal 写进 JS 标准，`strings.raw` 成为引擎内置字段，但前几年没人在 DB 客户端里把它当安全分隔利用。
- **2019 年**：Rasmus Porsager 在 GitHub 开源 `porsager/postgres`，思路是「反引号是天然的语法分隔，那为什么 PG 客户端还在拼字符串」。
- **2021-2023 年**：Cloudflare Workers / Bun / Edge runtime 流行，单文件零依赖 + 跨 runtime 的特性让它从小众变主流候选。
- **2024-2025 年**：v3 系列稳定；部分托管 PG 文档把它与 `pg`、ORM 并列介绍为可选客户端之一。
- **2026 年**：npm 周下载约 60 万、GitHub 约 8.7k 星；社区常把它当 Node 圈写 PG 的轻量 SQL-first 基线之一。

## 学到什么

1. **语法即安全**：能让"不可能写错"在语法层就拒绝编译，比"文档警告 + 代码评审"靠谱十倍
2. **小 surface 比大功能值钱**：postgres.js 用户面只有一个 `sql` 工厂——单一职责让源码 ~2.6k 行就能覆盖 PG 全协议
3. **pipeline 是性能的免费午餐**：同样的 PG server，client 端把 query 压同一 socket 就能快 2-5x，多数客户端没做
4. **bus factor 是真实风险**：作者 porsager 一人 90%+ commit；选它要接受这个集中度
5. **极简 ≠ 无心智负担**：用反引号 / 普通字符串 / 对象 调 `sql(...)` 触发三种完全不同的行为（Query / Identifier / Builder），新手要花一周才能不踩 NOT_TAGGED_CALL

## 延伸阅读

- 仓库 README：[porsager/postgres on GitHub](https://github.com/porsager/postgres)（README 本身就是最完整的 API 参考）
- 视频讲解：[porsager 在 Node Congress 谈 postgres.js 设计](https://www.youtube.com/results?search_query=porsager+postgres.js)（搜索 "porsager postgres" 可找到几个会议演讲）
- 对比文章：[Drizzle vs postgres.js vs Prisma](https://orm.drizzle.team/docs/get-started-postgresql)（看 ORM 视角怎么评价它）
- 协议参考：[PostgreSQL Frontend/Backend Protocol](https://www.postgresql.org/docs/current/protocol.html)（理解 pipeline 优势的根）
- [[postgresql]] —— postgres.js 服务的数据库本体
- [[drizzle]] —— SQL-first ORM，常和 postgres.js 搭配做 type-safe builder

## 关联

- [[postgresql]] —— 它是 PG 的客户端，所有协议层假设都是 PG 提供的
- [[prisma]] —— ORM 路线代表，和 postgres.js 是同一问题的两条相反答案
- [[drizzle]] —— SQL-first ORM，常用 postgres.js 当底层 driver
- [[kysely]] —— type-safe query builder，另一种避开 ORM 的思路
- [[redis]] —— LISTEN/NOTIFY 替代了它在轻量 pub/sub 场景的位置
- [[bun]] —— 跨 runtime 兼容矩阵中的重要一环
- [[fastify]] —— Node 后端框架，常组合 postgres.js 做最小化技术栈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bun]] —— Bun — JS 全能运行时
- [[cockroach]] —— CockroachDB — 全球分布式 SQL
- [[drizzle]] —— Drizzle ORM — 轻量 SQL-like ORM
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[prisma]] —— Prisma — 类型安全 ORM
- [[redis]] —— Redis — 内存键值数据库
- [[supabase]] —— Supabase — Firebase 的开源替代

