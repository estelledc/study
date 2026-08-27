---
title: Slonik — 用 sql token 与基数断言包住 pg.Client 的查询层
description: 介绍 slonik 49.10.9 如何用异步连接池、sql.unsafe/sql.type 和 one/many 断言组织 PostgreSQL 查询。
来源: https://github.com/gajus/slonik
日期: 2026-08-27
分类: 数据库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/gajus/slonik
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0d9da1dcf8e4e85c3318c3bdfe69d5af10232f70
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 49.10.9
---

## 是什么

Slonik 是一个把 PostgreSQL 查询收成 token 对象的 Node 客户端。日常类比：前台不再让你直接拨 [[node-postgres]] 的电话线，而是先把 SQL 和参数封成不可变信封，再按“必须一行 / 可以没有 / 必须多行”的窗口把结果拆开。

你写：

```js
import { createPool, sql } from "slonik";

const pool = await createPool(process.env.DATABASE_URL);
const row = await pool.one(sql.unsafe`
  select ${1}::int as n
`);
await pool.end();
```

固定 49.10.9 里，`createPool` 是 async：默认用 `@slonik/pg-driver` 去 `new pg.Client`，但连接池是 Slonik 自己的，不复用 `pg-pool`。

## 为什么重要

不理解 token、查询方法和自有池，就解释不了下面几件事：

- 为什么 `sql` 不能再当 tagged template 直接调用
- 为什么 `pool.one` 在 0 行或 2 行时会抛不同的错
- 为什么 `sql.type(schema)` 本身不会校验行，还要自己挂 interceptor
- 为什么事务回调里再用另一个 pool 连接会被拦住

## 核心要点

固定 49.10.9 的主链可以拆成五步：

1. **异步工厂**：`createPool(uri, options)` 解析配置 → `createPgDriverFactory()`（可替换）→ `createConnectionPool` → `warmup()` → `bindPool`。默认 `maxPoolSize=10`、`minPoolSize=0`、`idleTimeout=5000`、`connectionTimeout=5000`、`statementTimeout=60000`。

2. **`sql` 是方法包，不是函数**：查询入口是 `sql.unsafe`、`sql.type(parser)`、`sql.prepared(name, parser)`；可嵌套的是 `sql.fragment`。调用时必须带 `parts.raw` 冻结数组，否则 `InvalidInputError`。

3. **占位符先内部化**：绑定值写成 `$slonik_N`，避免嵌套 fragment 误伤 `$1` 字面量。`executeQuery` 执行前一次性换成 `$N`。空 SQL 或只剩 `$1` 都会拒绝。

4. **查询方法做基数断言**：`one` 要求恰好一行，否则 `NotFoundError` / `DataIntegrityError`；`maybeOne` 允许多余 0 行但拒绝 2 行；`many` 拒绝 0 行。这些检查在核心 `executeQuery` 里，不依赖 zod。

5. **事务钉在同一连接**：`START TRANSACTION` / `COMMIT` / `ROLLBACK`。嵌套用 `SAVEPOINT slonik_savepoint_N`。默认 `dangerouslyAllowForeignConnections=false`，AsyncLocalStorage 里的 `transactionId` 对不上就抛 `UnexpectedForeignConnectionError`。40xxx 回滚码可按 `transactionRetryLimit`（默认 5）重试。

## 实践示例

### 案例 1：`createPool` 与 `sql.unsafe`

```js
import { createPool, sql } from "slonik";

const pool = await createPool("postgres://user:pw@localhost/db");
const rows = await pool.any(sql.unsafe`
  select ${"Ada"}::text as name
`);
await pool.end();
```

`any` 不做“至少一行”断言。`sql.unsafe` 的 parser 是共享的 `z.unknown()`，只表示“这是一条可执行 Query token”。

### 案例 2：`one` 的一行合同

```js
const user = await pool.one(sql.unsafe`
  select id, name from users where id = ${id}
`);
```

0 行 → `NotFoundError`；多于 1 行 → `DataIntegrityError`。`oneFirst` 还要求恰好一列。

### 案例 3：事务与 savepoint

```js
await pool.transaction(async (trx) => {
  await trx.query(sql.unsafe`insert into orders (uid) values (${uid})`);
  await trx.transaction(async (nested) => {
    await nested.query(sql.unsafe`update users set n = n + 1 where id = ${uid}`);
  });
});
```

外层发 `START TRANSACTION`；内层发 `SAVEPOINT slonik_savepoint_1`。失败则 `ROLLBACK TO` 对应 savepoint。回调里拿到的连接在 `release` 后会变成“Cannot use released connection”。

## 踩过的坑

1. **`sql\`select 1\`` 不是合法调用**：49.x 的 `sql` 是对象。要查询用 `sql.unsafe` 或 `sql.type`；`sql.fragment` 只用于嵌进另一条 token。

2. **`undefined` 在组 SQL 时就炸**：和 [[node-postgres]] 把 `undefined` 当 `NULL` 相反。要空值必须显式传 `null`。

3. **`sql.type(zodObject)` 不会自动校验**：token 只携带 Standard Schema。核心把 `parser` 放进 `executionContext.resultParser`；README 推荐的 interceptor 才调用 `~standard.validate`。没挂 interceptor 时不会出现 `SchemaValidationError`。

4. **默认 `int8` / `numeric` 会被改写**：预设 parser 把 `int8` 收成 `BigInt`，`numeric` 收成 `Number.parseFloat`。这和 `pg` 默认保持字符串不同，也有精度风险。

5. **`exists()` 已标 deprecate**：它只是包一层 `SELECT EXISTS(...)`，仍走 `ONE_ROW` 断言。

## 适用 vs 不适用场景

**适用**：

- 已经用 `pg`，但想把“一行 / 多行 / 可能没有”写成方法合同
- 需要把 SQL 片段拼起来，同时把值留在参数数组里
- 能接受 Node `>=24`，并自己决定是否挂 result-parser interceptor

**不适用**：

- 还在 Node 16/18/22 → `engines.node` 是 `>=24`
- 想零依赖、自研 wire、浏览器 / Workers → 看 [[postgres-js]]
- 只要最薄的 `Client.query` / `Pool.connect` → 直接用 [[node-postgres]]
- 把 zod 校验当成默认运行时保证 → 固定 49.10.9 的核心路径并不执行 schema

## 固定版本边界

- 本文绑定 `gajus/slonik@0d9da1dcf8e4e85c3318c3bdfe69d5af10232f70`，annotated tag `slonik@49.10.9` 剥到此提交。npm `slonik@49.10.9` 没有 `gitHead`，未猜测 publish tree。
- 依赖同版本 `@slonik/pg-driver` / `@slonik/sql-tag` / `@slonik/errors`；driver 显式 `import { Client } from "pg"`。
- 默认 `queryRetryLimit=5`、`transactionRetryLimit=5`、`resetConnection` 执行 `DISCARD ALL`。`maximumPoolSize` 是 `maxPoolSize` 的弃用别名。
- `engines.node` 为 `>=24`。许可为 BSD-3-Clause。
- 本文未连接数据库、未安装依赖、未跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **49.x 的 `sql` 是工具箱**——可执行查询和可嵌套片段被拆开，避免把 fragment 直接丢进连接。
2. **基数断言是核心合同**——`one` / `many` / `maybeOne` 在收行之后、interceptor 变换之前检查。
3. **schema 只是行李牌**——`parser` 存在 token 上，要不要验由 interceptor 决定。
4. **池和 driver 是两层**——Slonik 自己管获取/归还；默认底层仍是 `pg.Client`。

## 应用型自测

1. `sql\`select 1\`` 在 49.10.9 能发给 `pool.query` 吗？
2. `pool.one(sql.unsafe\`select * from t\`)` 在表里有两行时抛什么？
3. 只写 `sql.type(z.object({ id: z.number() }))\`select id from t\``、不挂 interceptor，核心会做 zod 校验吗？

检查点：

1. 不能。`sql` 不是 tag 函数；要 `sql.unsafe` 或 `sql.type`。
2. `DataIntegrityError`（多行）。0 行才是 `NotFoundError`。
3. 不会。核心只把 parser 放进 context，不调用 `~standard.validate`。

## 延伸阅读

- 仓库 README：[gajus/slonik](https://github.com/gajus/slonik)
- 固定源码：[gajus/slonik](https://github.com/gajus/slonik) —— 本文绑定提交 `0d9da1dcf8e4e85c3318c3bdfe69d5af10232f70`
- [[node-postgres]] —— 默认 driver 使用的 `Client`
- [[postgres-js]] —— 另一条 tagged-template 客户端，不经过 `pg`
- [[zod]] —— `sql.type` 常用的 Standard Schema 实现，但不是自动执行器

## 关联

- [[node-postgres]] —— `@slonik/pg-driver` 的底层 `Client`
- [[postgres-js]] —— 不经过 `pg` 的 tagged 对照
- [[postgresql]] —— 服务端协议、savepoint 与 40xxx 回滚码
- [[zod]] —— README 推荐的 result-parser 示例
- [[kysely]] —— 另一条类型查询层，通常也接 `pg`
