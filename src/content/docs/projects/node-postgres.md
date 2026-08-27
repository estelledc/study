---
title: node-postgres — 用 Client 与 Pool 直接说话的 Node PostgreSQL 驱动
description: 介绍 pg 8.23.0 如何把 Client.query、连接池 checkout 和扩展查询协议收成同一套 API。
来源: https://github.com/brianc/node-postgres
日期: 2026-08-27
分类: 数据库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/brianc/node-postgres
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: df274d1ba9ad9d11a8f1079314faeafde7208207
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.23.0
---

## 是什么

node-postgres（npm 包名 `pg`）是 Node 上最常用的 PostgreSQL 驱动。日常类比：它给你两样东西——一根只能接一次的电话线（`Client`），和一个前台按空闲分线的总机（`Pool`）。你自己写 SQL 文本和参数数组，它负责握手、认证和把结果行解析回来。

你写：

```js
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query("select $1::int as n", [1]);
await pool.end();
```

固定 8.23.0 把 `Client` 绑进同仓的 `pg-pool`。ESM 入口只是把 CJS 再导出一遍；`pg.native` 要等你另外装 `pg-native`。

## 为什么重要

不理解 Client 与 Pool 的分工，下面这些事都没法解释：

- 为什么同一个 `Client` 连过之后不能再 `connect()`
- 为什么 `pool.query` 每次都 checkout / release，事务却必须自己拿住 client
- 为什么 `undefined` 会被编成 SQL `NULL`，而 [[postgres-js]] / [[slonik]] 默认拒绝
- 为什么同一条连接上连续 `query()` 在 pg@9 会被弃用，除非打开 `pipeline`

## 核心要点

固定 8.23.0 的主链可以拆成五步：

1. **入口是 `PG` 实例**：`lib/index.js` 导出 `Client`、`Pool`、`Query`、`types`、`DatabaseError` 和 `escapeIdentifier` / `escapeLiteral`。`NODE_PG_FORCE_NATIVE` 为真时整份 API 换成 native 构造器。

2. **Client 一次性连接**：`connect()` 在 `_connecting` / `_connected` 时直接拒绝复用。Unix socket 走 `host/.s.PGSQL.port`；TCP 再按 `sslnegotiation` 决定要不要先发 SSLRequest。

3. **`query()` 三种输入**：字符串、`{ text, values, name }` 或带 `submit` 的 Query 对象。没有 callback 就返回 Promise，并在 catch 里重抓堆栈。有参数、`name`、`queryMode: 'extended'` 或 `rows` 时走 Parse/Bind/Execute；否则发 simple query。

4. **排队不是默认流水线**：查询推进 `_queryQueue`。未开 `pipeline` 时，队列里已有查询会触发 pg@9 弃用警告。`pipeline: true` 才允许未回包继续往 socket 塞下一条。

5. **Pool 是 checkout 状态机**：默认 `max=10`、`min=0`。未传 `idleTimeoutMillis` 时，池实现自己用 `10000`，不会去读 `pg.defaults` 里的 `30000`。`pool.query` 只是借一条 client、跑完就 `release`；对同一 client 连发 `BEGIN` 再还回去，事务会丢。

## 实践示例

### 案例 1：Pool 一次性查询

```js
import { Pool } from "pg";

const pool = new Pool({ connectionString: "postgres://user:pw@localhost/db" });
const result = await pool.query("select now() as ts");
await pool.end();
```

`Pool.query` 内部 `connect` → `client.query` → `release`。第一参数如果是函数，会马上报不支持。

### 案例 2：事务必须占住同一条 Client

```js
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("insert into t(n) values ($1)", [1]);
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
}
```

`release()` 只能叫一次，再叫会抛错。把错误传给 `release(err)` 会把这条连接从池里摘掉。

### 案例 3：命名预备语句

```js
await client.query({
  name: "get_user",
  text: "select id, name from users where id = $1",
  values: [42],
});
```

同名但 `text` 不同会报 `Prepared statements must be unique`。`values` 必须是数组。

## 踩过的坑

1. **把 `pool.query` 当会话**：每次查询可能换一条连接。`SET`、临时表和事务都要先 `pool.connect()`。

2. **`undefined` 会变成 `NULL`**：`prepareValue` 把 `null` 和 `undefined` 都编成 SQL 空值。漏传字段不会像 [[slonik]] 那样立刻炸掉。

3. **Client 不能重连**：连过的实例再 `connect()` 会抛错。断线后要 `new Client`，不要复活旧对象。

4. **默认 `int8` 是字符串**：`count(*)` 走 oid 20，默认 parser 保持字符串。只有给 `pg.defaults.parseInt8` 赋值才会改成 number。

5. **`escapeLiteral` 不是参数通道**：它按 libpq 规则给字面量加引号；值仍应走 `$1`。`escapeIdentifier` 只处理标识符。

## 适用 vs 不适用场景

**适用**：

- 需要直接控制连接、预备语句和协议细节的 Node 服务
- 给 [[slonik]]、[[kysely]] 或自研查询层当 driver
- 同时要 callback 与 Promise，并能接受 CJS 主实现

**不适用**：

- 想在语法层禁止字符串拼接 → 看 [[postgres-js]] 或 [[slonik]] 的 tagged token
- 需要 `one()` / `many()` 这种基数断言 → [[slonik]]
- 浏览器或 Workers 里没有 Node `net` → 另找平台 adapter，本文未验证 `pg-cloudflare`
- 把 README 的“最快”当合同 → 本文没有跑对比 benchmark

## 固定版本边界

- 本文绑定 `brianc/node-postgres@df274d1ba9ad9d11a8f1079314faeafde7208207`。annotated tag `pg@8.23.0` 与 npm `pg@8.23.0` 的 `gitHead` 指向同一提交。
- 同提交还发布 `pg-pool@3.14.0`、`pg-protocol@1.16.0`；`pg-types` 仍是依赖 `2.2.0`。
- `exports`：`import` → `esm/index.mjs`，`require` → `lib/index.js`。`engines.node` 为 `>= 16.0.0`。
- 默认 `max=10`；池未配置时 `idleTimeoutMillis=10000`。许可为 MIT。
- 本文未连接数据库、未加载 `pg-native`、未跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **Client 是会话，Pool 是出纳**——事务、会话参数和预备语句都钉在 Client 上。
2. **参数数组和转义函数不是同一条路**——`$n` 走 Bind；`escapeLiteral` 只是字面量工具。
3. **`undefined` 的默认合同因库而异**——`pg` 当 `NULL`，tagged 客户端常常直接拒绝。
4. **排队不等于 pipeline**——默认队列会在 pg@9 消失；要叠包必须显式 `pipeline`。

## 应用型自测

1. 对已经 `connect()` 过的 `Client` 再调用一次 `connect()`，会怎样？
2. `await pool.query("begin")` 之后再 `await pool.query("insert ...")`，插入一定在同一事务里吗？
3. `client.query("select $1", [undefined])` 会不会因为 `undefined` 抛错？

检查点：

1. 抛错。注释写明 Client 不能复用。
2. 不一定。`pool.query` 每次可能换一条连接。
3. 不会。`prepareValue` 把 `undefined` 编成 `NULL`。

## 延伸阅读

- 仓库 README：[brianc/node-postgres](https://github.com/brianc/node-postgres)
- 固定源码：[brianc/node-postgres](https://github.com/brianc/node-postgres) —— 本文绑定提交 `df274d1ba9ad9d11a8f1079314faeafde7208207`
- 协议参考：[PostgreSQL Frontend/Backend Protocol](https://www.postgresql.org/docs/current/protocol.html)
- [[postgresql]] —— 服务端协议与类型系统
- [[slonik]] —— 在 `pg.Client` 之上做 token、基数断言和自有连接池

## 关联

- [[postgresql]] —— 全部协议假设都来自 PG
- [[slonik]] —— 默认 driver 就是这份 `Client`
- [[postgres-js]] —— 另一条 tagged-template、自研 wire 的路线
- [[kysely]] —— 类型查询构建器，常接 `pg`
- [[prisma]] —— schema-first ORM，不再直接暴露 `Client.query`
