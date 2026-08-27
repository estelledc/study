---
title: postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
来源: https://github.com/porsager/postgres
日期: 2026-05-30
分类: 数据库
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/porsager/postgres
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e7dfa14519f363229ccc3ead7b1b2f2051937efb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.4.9
---

## 是什么

postgres.js（npm 包名 `postgres`）是一个以 tagged template 为唯一查询入口的 PostgreSQL 客户端。日常类比：像把乘客和货物分到两条轨道上的火车站——SQL 文本走货运轨，`${value}` 永远只当参数，不会被拼进语句。

你写：

```js
const rows = await sql`select * from users where id = ${id}`;
```

JS 引擎把 `id` 单独交给 tag 函数；固定 3.4.9 再把它编成 `$n` 占位符，走 Parse/Bind/Execute，而不是字符串拼接。零运行时依赖，条件导出覆盖 Node CJS、ESM、Bun 与 Cloudflare `workerd`。

## 为什么重要

不理解 postgres.js，下面这些事都没法解释：

- 为什么 `` sql`...${x}` ``、`sql('users')` 和 `sql({name})` 是三种完全不同的对象
- 为什么默认把 `undefined` 当成错误，而不是悄悄绑成 `NULL`
- 为什么事务回调里的 `sql` 必须钉在同一条连接上
- 为什么 LISTEN 和逻辑复制各自再开一个 `max: 1` 的专用实例

## 核心要点

主链可以拆成五步：

1. **工厂返回 `sql`**：`Postgres()` 按 `max` 预建连接（默认 10，Cloudflare 为 3），并用 `connecting / reserved / closed / ended / open / busy / full` 七个队列描述状态；唯一迁移点是 `move(c, queue)`。

2. **三种调用形态**：带 `strings.raw` 的反引号生成 `Query`；单字符串生成 `Identifier`；对象或数组生成 `Builder`。后两种继承 `NotTagged`，`await` 会抛 `NOT_TAGGED_CALL`。

3. **惰性执行**：`Query` 是 Promise 子类，只在 `then` / `catch` / `finally` / `execute` / `forEach` 时进入连接池。`handleValue()` 遇到 `undefined` 且未配置 `transform.undefined` 就抛 `UNDEFINED_VALUE`。

4. **协议与 pipeline**：默认 `prepare: true`、`max_pipeline: 100`。一条连接可在未回包时继续塞查询；写缓冲到 1024 字节或显式 flush 才 `socket.write`。

5. **会话型旁路**：`listen()` 另建 `max: 1` 且禁用 idle/lifetime 的实例；`subscribe()` 再开复制连接，执行 `CREATE_REPLICATION_SLOT ... TEMPORARY LOGICAL pgoutput`。

## 实践示例

### 案例 1：工厂与 tagged 查询

```js
import postgres from "postgres";

const sql = postgres("postgres://user:pw@localhost:5432/db");
const id = 1;
const rows = await sql`select ${id} as one, now() as ts`;
await sql.end();
```

`postgres(url)` 返回的 `sql` 既是 tag 也是连接池入口。`${id}` 进入参数数组；`sql.end()` 会一并结束 listen/subscribe 专用实例。

### 案例 2：事务与 savepoint

```js
await sql.begin(async (sql) => {
  await sql`insert into orders (uid, amount) values (${uid}, ${amt})`;
  await sql.savepoint(async (sql) => {
    await sql`update users set balance = balance - ${amt} where id = ${uid}`;
  });
});
```

外层 `begin` 用 `unsafe('begin ...')` 占住一条 reserved 连接；回调里的 `sql` 只暴露 `savepoint` / `prepare`，不再带池级 `begin`。`savepoint()` 发的是 `SAVEPOINT`，失败则 `ROLLBACK TO`。回调返回查询数组时，这些查询会在同一连接上 pipeline。

### 案例 3：LISTEN / NOTIFY

```js
await sql.listen("order_created", (payload) => {
  console.log("new order:", payload);
});
await sql.notify("order_created", JSON.stringify({ id: 42 }));
```

`listen` 对频道名做 identifier 转义后发 `LISTEN`；断线会按已登记频道重听。`notify` 走普通池连接执行 `select pg_notify($1, $2)`。

## 踩过的坑

1. **普通函数调用不是查询**：`sql('select 1')` 得到 Identifier。要跑原始字符串必须 `sql.unsafe(...)`。

2. **`undefined` 默认拒绝**：和 `pg` 把 `undefined` 转 `null` 不同。要绑 `null` 必须显式 `transform: { undefined: null }`。

3. **`bigint` / `numeric` 默认是字符串**：内置 number parser 只覆盖 oid 21/23/26/700/701。`count(*)` 这类 `bigint` 要数值需注册 `postgres.BigInt`；`numeric` 没有内置高精度类型。

4. **事务回调里的 `sql` 没有池级 `begin`**：嵌套回滚靠 `savepoint()`。再调用外层池的 `begin()` 会另占一条连接，不是子事务。

5. **默认复制槽是 TEMPORARY**：`subscribe()` 断线重连后从新槽继续，窗口内的变更会丢。生产 CDC 需要自己管理持久 slot 与 LSN。

## 适用 vs 不适用场景

**适用**：

- 想直接写 SQL、又要把参数和文本在语法层分开的 Node / Bun / Workers 服务
- 中小项目用 LISTEN/NOTIFY 当进程内消息，而不是再挂一套 broker
- 一次性脚本、迁移和报表：工厂即连接池，不用手动 checkout

**不适用**：

- 需要从 schema 推导返回类型 → 看 [[drizzle]] 或 [[kysely]]
- 已经深度绑在 `pg-pool` / `pg-cursor` 工具链上的旧系统
- 不能丢事件的 CDC → 默认临时 slot 不够，要自己管复制进度
- 把作者 README 的“最快”当合同 → 本文没有跑对比 benchmark

## 固定版本边界

- 本文绑定 `porsager/postgres@e7dfa145...`，npm `postgres@3.4.9` 的 `gitHead` 与该提交一致。
- 条件导出：`bun` / `import` → `src/index.js`；`workerd` → `cf/src/index.js`；默认 CJS → `cjs/src/index.js`。`engines.node` 为 `>=12`。
- 默认 `max=10`（Cloudflare 3）、`max_pipeline=100`、`prepare=true`、`connect_timeout=30`、`keep_alive=60`、`fetch_types=true`。
- 许可为 Unlicense。本文未连接数据库、未跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **语法边界比文档警告稳**——tag 函数让参数无法回到 SQL 字符串通道。
2. **一个 `sql` 名字不够**——Query / Identifier / Builder 的分派是新手最容易踩的合同。
3. **连接池是状态机**——pipeline、reserve 和事务都靠把连接在队列之间搬动。
4. **旁路协议另开连接**——LISTEN 与逻辑复制不能和普通查询共享同一条忙连接。

## 应用型自测

1. `await sql('select 1')` 会发出查询吗？
2. `` await sql`insert into t values (${undefined})` `` 在默认 `transform` 下会怎样？
3. 事务回调里再调用池对象的 `sql.begin()`，会得到嵌套 SAVEPOINT 吗？

检查点：

1. 不会。单字符串走 Identifier，`await` 抛 `NOT_TAGGED_CALL`。
2. 抛 `UNDEFINED_VALUE`；只有显式设置 `transform.undefined` 才会替换。
3. 不会。回调里的 `sql` 只提供 `savepoint()`；池级 `begin()` 会另占连接。

## 延伸阅读

- 仓库 README：[porsager/postgres](https://github.com/porsager/postgres)
- 固定源码：[porsager/postgres](https://github.com/porsager/postgres) —— 本文绑定提交 `e7dfa14519f363229ccc3ead7b1b2f2051937efb`
- 协议参考：[PostgreSQL Frontend/Backend Protocol](https://www.postgresql.org/docs/current/protocol.html)
- [[postgresql]] —— 服务端协议与类型系统
- [[drizzle]] —— 常用它当 SQL-first ORM 的底层 driver

## 关联

- [[postgresql]] —— 客户端的全部协议假设都来自 PG
- [[prisma]] —— 重 schema / migration 的另一条答案
- [[drizzle]] —— SQL-first ORM，底层常接 postgres.js
- [[kysely]] —— type-safe query builder
- [[redis]] —— LISTEN/NOTIFY 在轻量 pub/sub 上的常见对照
- [[bun]] —— 条件导出矩阵中的一环

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
- [[cockroach]] —— CockroachDB — 全球分布式 SQL
- [[drizzle]] —— Drizzle ORM — 轻量 SQL-like ORM
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列
- [[supabase]] —— Supabase — Firebase 的开源替代
