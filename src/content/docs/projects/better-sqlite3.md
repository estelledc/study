---
title: better-sqlite3 — 同步调用 SQLite 的 Node 原生绑定
来源: 'https://github.com/WiseLibs/better-sqlite3'
日期: 2026-08-27
分类: DB 客户端
难度: 初级
description: 用同步 prepare/run/get 调用 SQLite，事务函数不能返回 Promise。
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/WiseLibs/better-sqlite3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: dbc2ea1165fef1f599b9be12faea33fa5e9d7ffb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 13.0.3
---

## 是什么

better-sqlite3 是 Node 里一套**同步**的 SQLite 绑定。日常类比：像柜台上的窗口办事员——你把一张写好的单子递进去，当场拿到回执，窗口不会说“等会儿短信通知你”。

你写：

```js
const Database = require("better-sqlite3");
const db = new Database("notes.db");
const row = db.prepare("SELECT name FROM cats WHERE id = ?").get(1);
```

固定 13.0.3 的默认入口先加载 native addon，再构造 `Database`。查询、写入和大多数事务都在当前调用栈里结束，不会返回 Promise。

## 为什么重要

不理解这条同步合同，下面这些事都没法解释：

- 为什么同一份 SQL 要先 `prepare`，再反复 `run` / `get` / `all`
- 为什么 `db.transaction(async () => { await ... })` 会在第一次 `await` 前就提交或直接报错
- 为什么 `lastInsertRowid` 默认是 Number，大整数却可能丢精度
- 为什么它和 [[knex]]、[[postgres-js]] 看起来都在“写 SQL”，执行模型却完全不同

## 核心要点

主链可以拆成五步：

1. **打开连接**：路径、`":memory:"` 或 `serialize()` 得到的 `Buffer`。默认 `timeout` 是 5000 毫秒，用来等锁；`readonly` 不能和匿名内存库一起用。

2. **加载 native addon**：先找 `prebuilds/<platform>-<arch>.node`，没有再回退到 `build/Release`。`engines.node` 写的是 `>=22`。

3. **prepare 一条语句**：C++ `Statement` 只接受**一条** SQL。多条语句、空语句都会在 JS 测试里变成 `RangeError`。

4. **执行**：`run()` 返回 `{ changes, lastInsertRowid }`；读行用 `get` / `all` / `iterate`。参数按位置 `?` 或命名 `@name` 绑定。

5. **事务函数**：`db.transaction(fn)` 返回一个新函数。外层走 `BEGIN`/`COMMIT`，嵌套走内部 savepoint。`fn` 若返回 thenable，会抛 `TypeError`。

## 实践示例

### 案例 1：打开文件并插入一行

```js
const Database = require("better-sqlite3");
const db = new Database("pets.db");

db.exec("CREATE TABLE IF NOT EXISTS cats (id INTEGER PRIMARY KEY, name TEXT)");
const insert = db.prepare("INSERT INTO cats (name) VALUES (?)");
const info = insert.run("Mochi");
```

`exec` 适合没有绑定参数的 DDL。`run()` 的 `info.changes` 是这次改了几行，`info.lastInsertRowid` 是新行的 rowid。

### 案例 2：事务函数一次插入多行

```js
const insert = db.prepare("INSERT INTO cats (name) VALUES (@name)");
const insertMany = db.transaction((cats) => {
  for (const cat of cats) insert.run(cat);
});

insertMany([{ name: "Mochi" }, { name: "Sable" }]);
insertMany.immediate([{ name: "Nori" }]);
```

默认版本执行 `BEGIN`。`.immediate` / `.exclusive` / `.deferred` 只换 `BEGIN` 的模式。内层再调另一个事务函数时，源码改用内部 savepoint，而不是再开一层 `BEGIN`。

### 案例 3：决定整数要不要用 BigInt

```js
db.defaultSafeIntegers(true);
const row = db.prepare("SELECT id FROM cats WHERE name = ?").get("Mochi");
```

默认关闭时，整数（含 `lastInsertRowid`）是 JavaScript Number。打开后走 BigInt。超出 64-bit 有符号范围的 BigInt 绑定会 `RangeError`，这是源码文档写明的边界，不是“更大就能存”。

## 踩过的坑

1. **把 `prepare` 当成脚本执行器**：一条字符串里放两条 SQL 会被拒绝。要跑多条无参数语句用 `exec`。

2. **把事务函数写成 async**：源码在 `commit` 前检查返回值；看到 `.then` 就抛错。SQLite 也不适合把事务跨到下一个事件循环。

3. **默认整数不是 BigInt**：超过 `Number.MAX_SAFE_INTEGER` 的 rowid / INTEGER 会先丢精度，再被你当成“数据库错了”。

4. **手动 `BEGIN` 和 `.transaction()` 混用**：文档写明不支持在事务函数里再手写 `COMMIT` / `ROLLBACK`。

5. **目录不存在**：非内存路径会先检查 `path.dirname`；父目录没有就抛 TypeError，不会替你建文件夹。

## 适用 vs 不适用场景

**适用**：

- 单进程 Node 服务、CLI、本地工具，SQL 由自己写
- 需要同步控制流：打开连接后立刻 `prepare` / `run`
- 想用 [[knex]] 的 `client: 'better-sqlite3'` 当底层驱动

**不适用**：

- 需要在浏览器里跑 SQLite
- 要把事务或查询跨 `await`、worker 或远程连接池
- 运行时低于 Node 22
- 想靠静态阅读证明“一定比 node-sqlite3 快”——本文没有跑 benchmark

## 固定版本边界

- 本文绑定 `WiseLibs/better-sqlite3@dbc2ea1165...`，包版本 `13.0.3`。
- annotated tag `v13.0.3` 的 tag object 是 `0747dc94...`，指向上述 commit。
- 条件导出按平台选择 prebuild 入口；默认入口仍走 `lib/index.js`。
- 本文未编译 addon、未执行 SQL、未跑上游 mocha，状态保持 `UNVERIFIED`。

## 学到什么

1. **同步 API 是合同，不是风格**：窗口办完才散场；Promise 会拆开这笔合同。
2. **prepare 管的是一条语句**：复用的是编译结果，不是整份脚本。
3. **事务函数用 savepoint 做嵌套**：看起来像递归调用，底层不是第二层 `BEGIN`。
4. **整数宽度必须显式选择**：Number 与 BigInt 是两条路，默认走 Number。

## 应用型自测

1. `db.prepare("SELECT 1; SELECT 2")` 会得到两个 Statement 吗？
2. `db.transaction(async () => { await sleep(10); })()` 会保持事务到 `sleep` 结束吗？
3. 未调用 `defaultSafeIntegers()` 时，`run()` 的 `lastInsertRowid` 一定是 BigInt 吗？

检查点：

1. 不会。固定测试对多语句 `prepare` 期望 `RangeError`。
2. 不会。返回 thenable 会抛 `TypeError`；即便不抛，提交也发生在函数返回时。
3. 不是。默认是 JavaScript Number。

## 延伸阅读

- 固定源码：[WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) —— 本文绑定提交 `dbc2ea1165fef1f599b9be12faea33fa5e9d7ffb`
- API 说明：仓库 `docs/api.md`、`docs/integer.md`
- [[knex]] —— 查询构建器，固定 3.3.0 有 `better-sqlite3` dialect
- [[sqlite]] —— SQLite 引擎本身
- [[postgres-js]] —— 对照：异步、模板字符串、连的是 Postgres

## 关联

- [[knex]] —— 同一主题的查询构建器；可把本库当 sqlite 驱动
- [[sqlite]] —— 文件数据库引擎，本库是它的 Node 绑定
- [[postgres-js]] —— 另一类 SQL helper：tagged template + 连接池
- [[prisma]] —— schema-first ORM，执行模型与同步绑定不同
- [[drizzle]] —— schema-as-code ORM，需要自己选 driver

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
