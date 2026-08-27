---
title: sql.js — 把 SQLite 编译进 JavaScript 进程
description: 介绍如何用 Emscripten 把 SQLite 编成 WASM，并在虚拟文件上提供 Database 与 Statement API。
来源: https://github.com/sql-js/sql.js
日期: 2026-08-27
分类: ORM / DB 客户端
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sql-js/sql.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9c4e167ec37129192d166ab9223faa9a4bd07c58
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.14.2
---

## 是什么

sql.js 用 Emscripten 把 SQLite 编成 WebAssembly（并保留 asm.js 构建），让浏览器或 Node 在进程内打开一个内存数据库。日常类比：把整本账本和计算器塞进标签页——能算、能导出字节，但默认不写磁盘。

```js
const initSqlJs = require("sql.js")
const SQL = await initSqlJs({ locateFile: (file) => `/sql/${file}` })
const db = new SQL.Database()
db.run("create table t(x); insert into t values (1);")
const rows = db.exec("select x from t")
db.close()
```

`exec` 返回 `[{ columns, values }]`。固定 1.14.2 的默认入口是 `dist/sql-wasm.js`；浏览器条件导出走 `dist/sql-wasm-browser.js`。

## 为什么重要

不理解 sql.js 的加载和内存文件，就解释不了：

- 为什么第一次 `initSqlJs()` 是 Promise，第二次却直接复用同一模块
- 为什么 `run(sql)` 能一次执行多条语句，`run(sql, params)` 却不能
- 为什么 `export()` 之后 PRAGMA 会回到默认值
- 为什么必须 `stmt.free()` / `db.close()`，否则内存会一直涨

## 核心要点

固定 1.14.2 的主链可以拆成五步：

1. **手工模块化加载**：`shell-pre.js` 把 `initSqlJs` 做成单例 Promise，避开 emcc `MODULARIZE` 的旧问题。WASM 需要 `locateFile` 指出 `.wasm` 路径；Node 可省略。

2. **虚拟文件当库**：`new Database(data?)` 打开 `dbfile_<random>`。传入 `Uint8Array` 就 `FS.createDataFile`；否则是空库。打开后注册官方 contrib 扩展函数。

3. **三条执行入口**：无参数 `run()` 走 `sqlite3_exec`（可多语句）；带参数 `run(sql, params)` 只能单语句。`exec()` 用 `prepare_v2` + `pzTail` 拆多语句，收集每条有行的结果。`prepare()` 交出 `Statement`，自己 `bind` / `step` / `get` / `free`。

4. **栈要成对归还**：`exec()` 在 `finally` 里 `_free` SQL 指针并 `stackRestore`。1.14.2 的 #630 / #631 就是修成功和失败路径上的 WASM 栈泄漏。

5. **导出等于关开一次**：`export()` 先释放语句和 `create_function` 指针，`close_v2` 后读文件，再 reopen 并重新注册扩展。文档写明 pragma 会回到默认。

## 实践示例

### 案例 1：加载模块与打开内存库

```js
const SQL = await initSqlJs({
  locateFile: (file) => `https://sql.js.org/dist/${file}`,
})
const db = new SQL.Database()
```

`initSqlJs` 再次调用返回同一个 Promise。`locateFile` 只影响 WASM 资源，不改变 API。

### 案例 2：参数化查询与必须 free

```js
const stmt = db.prepare("select * from hello where a=:aval and b=:bval")
const row = stmt.getAsObject({ ":aval": 1, ":bval": "world" })
stmt.bind([0, "hello"])
while (stmt.step()) console.log(stmt.get())
stmt.free()
```

命名参数的 `:` / `@` / `$` 算在名字里。`bind` 会先 `reset`。不 `free` 会漏 WASM 堆；关掉 `Database` 会一并释放仍登记的 statement。

### 案例 3：JS 函数进 SQL

```js
db.create_function("add_js", (a, b) => a + b)
db.run("insert into hello values (add_js(7, 3), add_js('Hello ', 'world'))")
const bytes = db.export()
```

`create_function` 用 `func.length` 当 SQLite arity。`export()` 得到 `Uint8Array`，但会重开连接。

## 踩过的坑

1. **带 params 的 `run`/`exec` 当多语句脚本**：有数组参数时不能用分号拼多条；对象参数在 `exec` 上可以跨语句共享名字。
2. **忘记 `free` / `close`**：README 写明不关闭会让内存一直涨。Worker 的 `close` 也只是把这份内存库拆掉。
3. **把 `export()` 当成只读快照 API**：它 close + reopen，pragma 和已登记 JS 函数都要重来。
4. **把 npm `gitHead` 当成 tag 剥皮提交**：`sql.js@1.14.2` 的 npm `gitHead` 是父提交 `1d5db454...`；本页绑定 tag 剥皮 `9c4e167e...`，两者只差一条 CI 日志提交。
5. **把内存库当成持久 SQLite 文件**：默认在 Emscripten FS 里；要落盘得自己保存 `export()` 的字节。

## 适用 vs 不适用场景

**适用**：

- 浏览器或纯 JS 环境里需要完整 SQL，并能接受整库进内存
- 教学、演示、导入已有 `.sqlite` 字节再查询
- 需要 `create_function` / `create_aggregate` 把 JS 函数挂进 SQL

**不适用**：

- 服务端要直接读写大文件、要原生速度 → 源码 README 指向原生绑定，本页未测对比
- 只要统一多种已有 driver 的 SQL 门面 → 看 [[db0]]
- 需要分析型、远程 Parquet / Arrow → 看已对齐的 [[duckdb-wasm]]
- 不能加载独立 `.wasm` 且也不接受 asm.js 构建

## 固定版本边界

- 本文绑定 `sql-js/sql.js@9c4e167ec37129192d166ab9223faa9a4bd07c58`，annotated tag `v1.14.2`。包版本 `1.14.2`。
- npm `sql.js@1.14.2` 的 `gitHead` 是 `1d5db4546e5feb944a3415739eb2a54103b54882`（祖先，CI 发布配置）；tag 提交只多 `ci: debug npm publish http log`。
- Makefile 固定 `sqlite-amalgamation-3490100`，编译开关含 `SQLITE_THREADSAFE=0`、`SQLITE_OMIT_LOAD_EXTENSION`、`SQLITE_ENABLE_FTS3`、`STACK_SIZE=5MB`。
- 许可：包装器 MIT；SQLite 公有领域。本文未跑 make / emcc / 上游 test，状态保持 `UNVERIFIED`。

## 学到什么

1. **WASM 数据库仍是文件**——只是文件在 Emscripten FS 里。
2. **`run` 和 `exec` 的多语句能力不对称**——参数一出现，路径就换成 prepare。
3. **栈和语句都是显式资源**——#630 说明成功路径也会漏 `stackRestore`。
4. **导出不是无副作用读取**——close/reopen 会丢掉连接级状态。

## 应用型自测

1. `db.run("select 1; select 2", [1])` 在 1.14.2 能当两条语句执行吗？
2. `export()` 之后，此前 `PRAGMA foreign_keys=ON` 还在吗？
3. `create_function("add", (a, b=0) => a+b)` 的 SQLite 参数个数按什么算？

检查点：

1. 不能。带 params 的 `run` 只 `prepare` 第一条语句。
2. 不在。`export` 会 close 再 open，pragma 回到默认。
3. 按 `func.length`。默认参数会缩小 arity。

## 延伸阅读

- 文档：[sql.js.org/documentation](https://sql.js.org/documentation/)
- 固定源码：[sql-js/sql.js](https://github.com/sql-js/sql.js) —— 本文绑定提交 `9c4e167ec37129192d166ab9223faa9a4bd07c58`
- [[db0]] —— 连接层，不内置这份 WASM 引擎
- [[duckdb-wasm]] —— 另一条把分析引擎编进浏览器的路线
- [[sqlite]] —— 被编译进去的那份引擎家族

## 关联

- [[db0]] —— JS SQL 门面；sql.js 是可被连接的引擎之一，但 0.4.0 没有一等 sql.js connector
- [[duckdb-wasm]] —— Worker + Arrow 的分析引擎对照
- [[sqlite]] —— 3.49.1 amalgamation 的来源
- [[postgresql]] —— 服务端对照：sql.js 没有网络协议，只有内存文件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
