---
title: Knex — 跨方言的 SQL 查询构建器
来源: 'https://github.com/knex/knex'
日期: 2026-08-27
分类: ORM
难度: 中级
description: 先拼 QueryBuilder，then() 才向连接池要连接并编译 SQL。
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/knex/knex
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e25d54bcb707714a17f5a5744eba5c4246bb4d1d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.3.0
---

## 是什么

Knex 是一个**先拼查询、再执行**的 SQL 构建器。日常类比：像点餐平板——你在屏幕上点“哪张桌子、哪几道菜”，平板只记菜单；真正下厨发生在你按“下单”（`then` / `await`）之后。

你写：

```js
const knex = require("knex")({
  client: "better-sqlite3",
  connection: { filename: "notes.db" },
  useNullAsDefault: true
});

const rows = await knex("cats").select("name").where("id", 1);
```

`knex(config)` 先解析 dialect，再返回一个**可调用函数**。`knex("cats")` 只创建 `QueryBuilder`；`await` 触发的是 builder 上的 `then()`，它会 new 一个 `Runner` 去借连接、编译 SQL、执行。

## 为什么重要

不理解这条“拼菜单 / 下单”边界，下面这些事都没法解释：

- 为什么 `const q = knex("cats").select()` 本身不会访问数据库
- 为什么换 `client` 往往不用改业务链，却必须另外安装 `pg` / `better-sqlite3` 这些驱动
- 为什么 `knex.transaction(trx => ...)` 和 `const trx = await knex.transaction()` 拿到的东西不一样
- 为什么它和 [[kysely]]、[[drizzle]]、[[prisma]] 都能写 SQL，却不是同一层抽象

## 核心要点

固定 3.3.0 的主链：

1. **解析配置**：字符串连接串或 `{ client, connection }`。`client` 必须落在允许名单里，大小写敏感；`pg` / `postgresql` 会映射到 `postgres`，`sqlite` 映射到 `sqlite3`。

2. **做成可调用对象**：`makeKnex` 给函数挂上 `schema`、`migrate`、`seed`、`raw`、`transaction`。根对象上的 `select` / `where` 只是先 `queryBuilder()` 再转发。

3. **惰性 builder**：`toSQL()` 只编译。真正执行来自 builder interface 的 `then()` → `client.runner(builder).run()`。

4. **Runner 借一条连接**：同一 builder 上的多条语句共用这次借到的连接。通用池默认 `min: 2, max: 10`；sqlite / better-sqlite3 dialect 把池收成 `min: 1, max: 1`。

5. **方言懒加载**：`better-sqlite3` dialect 继承 sqlite3 客户端，在 `_query` 里 `prepare` 后看 `statement.reader` 决定 `all` 还是 `run`。驱动包不在 knex 依赖里，连不上时提示 `npm install better-sqlite3`。

## 实践示例

### 案例 1：先看 SQL，再决定要不要执行

```js
const builder = knex("cats").select("name").where("age", ">", 2);
const { sql, bindings } = builder.toSQL();
const rows = await builder;
```

`toSQL()` 不借连接。`await builder` 等价于调用 `then()`。这让测试可以断言 SQL 形状，而不必先起真实数据库。

### 案例 2：两种 transaction 入口

```js
await knex.transaction(async (trx) => {
  await trx("cats").insert({ name: "Mochi" });
  await trx("cats").update({ age: 1 }).where({ name: "Mochi" });
});

const trx = await knex.transaction();
try {
  await trx("cats").insert({ name: "Sable" });
  await trx.commit();
} catch (err) {
  await trx.rollback();
  throw err;
}
```

传入 container 时，返回值是“整段事务结束”的 Promise。不传 container 时，返回值是“事务已经 begin、可以把 trx 先拿去用”的 Promise。固定实现里 `doNotRejectOnRollback` 默认是 `true`：你主动 rollback 时，外层 Promise 不会仅仅因为 rollback 而 reject。

### 案例 3：better-sqlite3 dialect 怎么消化绑定

```js
await knex("events").insert({
  created_at: new Date("2026-08-27T00:00:00Z"),
  ok: true
});
```

该 dialect 在 `_formatBindings` 里把 `Date` 变成 `valueOf()`（毫秒数），把 `boolean` 变成 `0/1`。这是 knex 层的转换，不是 SQLite 自己的类型系统。整数是否走 BigInt，还要看底层 [[better-sqlite3]] 的 `safeIntegers` 选项。

## 踩过的坑

1. **以为 `knex("users")` 已经查了库**：它只是 builder。没有 `then` / `await` / `asCallback`，Runner 不会启动。

2. **以为 knex 自带驱动**：`package.json` 没有 `pg` 或 `better-sqlite3`。`Client#initializeDriver` 失败时会明确要求你先安装对应包。

3. **忽略 sqlite 的两条警告**：没写 `connection.filename`、没设 `useNullAsDefault` 时，sqlite dialect 会打 logger warning。`INSERT` 默认值语义和 Postgres 不同。

4. **把 rollback 默认理解成失败**：`doNotRejectOnRollback` 默认 `true`。需要“rollback 也当失败”时必须显式改配置。

5. **`.onConflict()` 后忘记收尾**：未完成的 onConflict 子句会把 `then()` 换成抛错函数，提示必须接 `.ignore()` 或 `.merge()`。

## 适用 vs 不适用场景

**适用**：

- 一份查询代码要在 Postgres / MySQL / SQLite 之间换 dialect
- 需要 `schema` builder 和 `migrate.latest()` 这种文件迁移
- 想继续手写接近 SQL 的链式 API，而不是 schema-first codegen

**不适用**：

- 只要一个同步 SQLite 句柄 → 直接用 [[better-sqlite3]]
- 要把 TypeScript 列类型推到编译期 → 看 [[kysely]] / [[drizzle]]
- 只要 Postgres 且想用 tagged template → 看 [[postgres-js]]
- 把 knex 3.3.0 的池大小、隔离级别或迁移耗时写成通用性能结论——本文没有测量

## 固定版本边界

- 本文绑定 `knex/knex@e25d54bc...`，包版本 `3.3.0`，`engines.node` 为 `>=16`。
- 支持的 `client` 字符串以 `lib/constants.js` 的 `SUPPORTED_CLIENTS` 为准；未知值会抛错。
- 获取连接的默认超时是 60000 毫秒，除非配置了更小的 `acquireConnectionTimeout` / `acquireTimeoutMillis`。
- 本文未安装驱动、未跑迁移、未连接数据库，状态保持 `UNVERIFIED`。

## 学到什么

1. **构建器不是执行器**：菜单可以反复改；下单才碰连接。
2. **方言是插件，驱动是邻居**：换 `client` 只换编译器和连接适配，不把数据库驱动打进 knex。
3. **事务有“整段托管”和“先拿 trx”两种入口**：看有没有传入 container。
4. **sqlite 池默认是 1**：这是 dialect 覆盖，不是通用 `min: 2, max: 10`。

## 应用型自测

1. `const q = knex("cats").select("id")` 执行完这一行，Runner 会不会已经 `acquireConnection`？
2. `await knex.transaction()` 不传入回调，得到的是“事务已结束”还是“trx 已就绪”？
3. `client: "better-sqlite3"` 是否等于 knex 已经内置了 better-sqlite3 二进制？

检查点：

1. 不会。`then()` 才调用 `Runner.run()`。
2. trx 已就绪。没有 container 时，源码用 `resolve` 当 container。
3. 不是。dialect 在拿连接时 `require("better-sqlite3")`。

## 延伸阅读

- 固定源码：[knex/knex](https://github.com/knex/knex) —— 本文绑定提交 `e25d54bcb707714a17f5a5744eba5c4246bb4d1d`
- [[better-sqlite3]] —— 同步 SQLite 绑定，也是 knex 的一个 dialect
- [[kysely]] —— 另一条 TypeScript query builder 路线
- [[drizzle]] —— schema-as-code，仍要自备 driver
- [[prisma]] —— schema 文件 + codegen，不再手写 builder 链

## 关联

- [[better-sqlite3]] —— knex sqlite 方言之一的底层驱动
- [[kysely]] —— 类型优先的 SQL builder
- [[drizzle]] —— 轻量 ORM / builder，定位相邻
- [[postgres-js]] —— 不走 builder，直接写 SQL 字符串
- [[sequelize]] —— 更老的 Node ORM，模型层更重
- [[typeorm]] —— decorator / Active Record 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
