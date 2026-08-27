---
title: db0 — 用一份 SQL 门面接多种 JS 数据库
description: 介绍 db0 怎样用 connector、sql 模板和方言能力表，把多种 SQL 后端收成同一套 exec/prepare/sql API。
来源: https://github.com/unjs/db0
日期: 2026-08-27
分类: ORM / DB 客户端
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/db0
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d49c507c0a4b4e82e9909f3f7b598a31565665e9
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.4.0
---

## 是什么

db0 是 UnJS 的轻量 SQL 连接层：业务代码只看见 `exec` / `prepare` / `sql`，真正说话的是你传入的 connector。日常类比：餐厅只对一张点菜单，后厨可以是本机 SQLite、Postgres 或 Cloudflare D1。

```ts
import { createDatabase } from "db0"
import sqlite from "db0/connectors/node-sqlite"

const db = createDatabase(sqlite({ name: ":memory:" }))
const { rows } = await db.sql`select ${1} as one`
await db.dispose()
```

固定 0.4.0 核心包声明 `sideEffects: false`、零运行时依赖；各 connector 与 drizzle / kysely / prisma 集成走独立子路径。

## 为什么重要

不理解 db0 的门面和 connector 分界，就解释不了：

- 为什么换数据库时 query 代码能复用，import 路径却必须换
- 为什么 `` db.sql`select ${id}` `` 和 `` db.sql`from {${table}}` `` 不是同一种插值
- 为什么 D1 上 `BEGIN` 会失败，而同是 sqlite 方言的 `node-sqlite` 却声称支持事务
- 为什么默认别名 `sqlite` 并不是 better-sqlite3

## 核心要点

固定 0.4.0 的主链可以拆成五步：

1. **先拿 connector，再 `createDatabase`**：工厂只接收 connector 对象，不按名字实例化。`db0/connectors/*` 各自 `default export` 一个工厂；`connectors` 表只提供入口路径和别名。

2. **三套入口**：`exec(sql)` 跑原始字符串；`prepare(sql)` 返回可 `bind` / `all` / `run` / `get` 的 statement；`` db.sql`...` `` 先经 `sqlTemplate` 再按语句形状分派。

3. **模板有静态和参数两条轨道**：普通 `${value}` 编成 `?` 并进入参数数组；`{${ident}}` 两侧花括号则把值直接拼进 SQL。postgresql connector 再用 `normalizeParams` 把 SQL 代码里的 `?` 改成 `$1` `$2`。

4. **`sql` 的读/写分派是正则**：trim 后以 `select` 开头，或（postgresql / sqlite 且匹配 ` returning `）时走 `prepare().all()`；其余走 `run()`。`WITH ... SELECT` 不会被当成 select。

5. **方言能力是只读表**：sqlite / libsql 默认无 boolean / array / date / uuid；D1 额外把 `transactions` 盖成 false。集成层（尤其 prisma adapter）会读这张表。

## 实践示例

### 案例 1：默认 sqlite 别名其实是 node:sqlite

```ts
import sqlite from "db0/connectors/node-sqlite"

const db = createDatabase(sqlite({ name: ":memory:" }))
await db.exec("create table users (id integer primary key, email text)")
```

`name: ":memory:"` 打开内存库；否则默认文件是 `.data/${name || "db"}.sqlite`。`node:sqlite` 不可用时抛错，提示 Node >= 22.5 或 Deno >= 2.2。别名 `sqlite` 指向这一份，不是 `db0/connectors/better-sqlite3`。

### 案例 2：参数与标识符分开

```ts
const table = "users"
const email = "a@b.com"
await db.sql`insert into {${table}} (email) values (${email})`
const found = await db.sql`select * from {${table}} where email = ${email}`
```

第一句 insert 走 `run()`；第二句因为以 `select` 开头走 `all()`，返回 `{ rows, success: true }`。`table` 被静态拼进语句，`email` 才是绑定参数。

### 案例 3：Postgres 占位符改写

```ts
import postgresql from "db0/connectors/postgresql"

const db = createDatabase(postgresql({ url: process.env.DATABASE_URL, lib: pg }))
await db.sql`select * from users where id = ${1}`
```

模板仍产出 `?`；`normalizeParams` 把它改成 `$1`。查询里再手写 `$2` 会抛 “cannot mix `?` placeholders with numbered `$n` parameters”。`jsonb ? text` 这类运算符也不能靠 `?` 占位，源码要求改写成函数调用。

## 踩过的坑

1. **把 `WITH` CTE 当成自动返回行**：`db.sql` 只看 trim 后是否以 `select` 开头。`with t as (select 1) select * from t` 会走 `run()`。
2. **把 `{${name}}` 当成防注入**：它是标识符拼接。用户可控的表名/列名不能走这条轨道。
3. **以为 `sqlite` 别名等于 better-sqlite3**：0.4.0 的 `sqlite` / `node-sqlite` 用内置 `node:sqlite`；better-sqlite3 是另一条 connector。
4. **在 D1 上套 kysely/prisma 事务**：D1 connector 写明 `BEGIN`/`COMMIT` 会被拒绝，`capabilityOverrides.transactions` 为 false。
5. **把 README 的 “early stages” 当稳定 ORM**：本页只绑定 0.4.0 的 connector 门面，不把 drizzle / prisma 集成写成一等 schema 工具。

## 适用 vs 不适用场景

**适用**：

- 已经选定具体 driver，只想把 `exec` / `prepare` / tagged SQL 收成同一套门面
- Nitro / UnJS 栈里需要按运行时换 SQLite、Postgres 或 D1
- 能接受自己写 SQL，并用 `{${ident}}` 只拼接受控标识符

**不适用**：

- 想从一份 schema 同时得到类型客户端和 migration → 看已对齐的 [[prisma]] / [[drizzle]]
- 需要编译期核对列名 → 看 [[kysely]]
- 要在浏览器进程里跑完整 SQLite 引擎 → 看 [[sql-js]]
- 要把未测量的包体积或 “lightweight” 写成选型结论

## 固定版本边界

- 本文绑定 `unjs/db0@d49c507c...`，包版本 `0.4.0`；annotated tag `v0.4.0` 剥皮到该提交。npm `db0@0.4.0` 未暴露 `gitHead`。
- 一等方言：`mysql` / `postgresql` / `sqlite` / `libsql`。connector 名含 better-sqlite3、bun-sqlite、cloudflare-d1、hyperdrive、libsql-*、mysql2、neon、node-sqlite、pglite、planetscale、postgresql、sqlite3。
- 核心无运行时依赖；connector 用 `importLib` 动态加载，或接受 `lib` 选项。
- 本文未安装 `pg` / `node:sqlite`、未连库、未跑 vitest，状态保持 `UNVERIFIED`。

## 学到什么

1. **门面不是 ORM**——db0 不推导 schema，只统一执行入口。
2. **模板的花括号是拼接开关**——`{${x}}` 与 `${x}` 的安全边界完全不同。
3. **读路径靠语句形状，不靠意图**——CTE / 存储过程不要假设会返回 `rows`。
4. **方言能力表比名字更准**——同属 sqlite 的 D1 把事务关掉了。

## 应用型自测

1. `` await db.sql`with t as (select 1 as x) select * from t` `` 在 0.4.0 会走 `all()` 还是 `run()`？
2. 别名 `sqlite` 会加载 better-sqlite3 吗？
3. postgresql 查询同时写 `?` 和 `$1`，`normalizeParams` 会怎样？

检查点：

1. 走 `run()`。正则只认 trim 后以 `select` 开头的语句。
2. 不会。`sqlite` 是 `node-sqlite` 的别名。
3. 抛错，因为生成的 `$n` 会和手写编号撞车。

## 延伸阅读

- 文档：[db0.unjs.io](https://db0.unjs.io)
- 固定源码：[unjs/db0](https://github.com/unjs/db0) —— 本文绑定提交 `d49c507c0a4b4e82e9909f3f7b598a31565665e9`
- [[sql-js]] —— 浏览器/进程内 SQLite 引擎，db0 并不内置
- [[kysely]] —— 可用 `db0/integrations/kysely` 接到同一扇门面
- [[drizzle]] —— 默认集成走 SQLite session

## 关联

- [[sql-js]] —— 进程内引擎对照；db0 只连接已有引擎
- [[kysely]] —— type-safe builder，db0 提供 dialect 适配
- [[drizzle]] —— schema-as-code；`db0/integrations/drizzle` 默认 SQLite
- [[prisma]] —— 7.x adapter 入口；db0 的 `prisma()` 是单连接 mutex
- [[postgresql]] —— `normalizeParams` 服务的服务端方言
- [[sqlite]] —— node-sqlite / D1 / libsql 都宣称 sqlite 方言

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
