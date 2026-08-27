# SQL engine source review (writer GS)

> 用途：记录 `db0` 与 `sql.js` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gs` 标记 2026-08-27 平行 writer GS，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL GS
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未连接数据库，未实例化 WASM / asm.js，未跑 vitest / make / emcc，未测 bundle 或性能
- worktrees：本机 `research-worktrees/db0` 与 `research-worktrees/sqljs`，不进入 Git
- slugs：`db0`、`sql.js`（与 npm 包名一致；`sql.js` 中的点是合法 slug）
- not this pair：未写 knex / better-sqlite3 页面（knex 已在开放 PR #115）

## db0

- canonical source：`https://github.com/unjs/db0`
- tag：`v0.4.0`（annotated tag `04ce6d032cd3a7eed410251c9c3e2155dd5d894e` 剥皮到下列提交）
- revision：`d49c507c0a4b4e82e9909f3f7b598a31565665e9`
- package：`db0@0.4.0`（MIT，`sideEffects: false`，`type: module`）
- npm：`db0@0.4.0` latest，无 `gitHead`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/database.ts`
  - `src/template.ts`
  - `src/types.ts`
  - `src/capabilities.ts`
  - `src/_connectors.ts`
  - `src/connectors/node-sqlite.ts`
  - `src/connectors/postgresql.ts`
  - `src/connectors/cloudflare-d1.ts`
  - `src/connectors/_internal/postgresql.ts`
  - `src/connectors/_internal/statement.ts`
  - `src/connectors/_internal/utils.ts`
  - `src/integrations/drizzle/index.ts`
  - `src/integrations/kysely/index.ts`
  - `src/integrations/prisma/index.ts`
  - `src/tracing.ts`
  - `test/template.test.ts`
- observed：
  - `createDatabase(connector)` 返回 `exec` / `prepare` / `sql` / `dispose` / `Symbol.asyncDispose`；核心包无运行时依赖；
  - `sqlTemplate` 默认把插值编成 `?`；`{${ident}}` 两侧花括号则静态拼进 SQL，不进参数数组；
  - `db.sql` 在 trim 后 `/^select/i` 或（postgresql/sqlite 且含 ` returning `）时走 `prepare().all()`，否则走 `run()`；
  - postgresql connector 用 `normalizeParams` 把 SQL 代码里的 `?` 改成 `$n`，拒绝与手写 `$n` 混用；字符串、注释、dollar-quote 内的 `?` 不改；
  - 四方言能力表：sqlite/libsql 无 boolean/array/date/uuid；D1 用 `capabilityOverrides.transactions=false`；
  - `sqlite` 别名指向 `node-sqlite`（`node:sqlite`，要求 Node >= 22.5 或 Deno >= 2.2），不是 better-sqlite3；
  - 集成入口：`db0/integrations/drizzle` 默认 SQLite；`kysely()` 按 dialect 换 compiler/adapter；`prisma()` 是单连接 FIFO mutex 的 driver adapter。

## sql.js

- canonical source：`https://github.com/sql-js/sql.js`
- tag：`v1.14.2`（annotated tag `419e98431ea7b339e411eada7dc2c1fb98eb0847` 剥皮到下列提交）
- revision：`9c4e167ec37129192d166ab9223faa9a4bd07c58`
- package：`sql.js@1.14.2`（MIT；SQLite 本体是公有领域）
- npm mapping：`sql.js@1.14.2` 的 `gitHead` 是父提交 `1d5db4546e5feb944a3415739eb2a54103b54882`（`ci: use npm 11 for OIDC trusted publishing`）；tag 剥皮提交只多一条 `ci: debug npm publish http log`，未改 `src/`
- makefile：`SQLITE_AMALGAMATION = sqlite-amalgamation-3490100`（SQLite 3.49.1），`SQLITE_THREADSAFE=0`，`SQLITE_OMIT_LOAD_EXTENSION`，`STACK_SIZE=5MB`
- inspected：
  - `package.json`
  - `README.md`
  - `LICENSE`
  - `Makefile`
  - `src/api.js`
  - `src/shell-pre.js`
  - `src/shell-post.js`
  - `src/worker.js`
  - `src/exported_runtime_methods.json`
  - `test/test_issue630.js`
- observed：
  - `initSqlJs` 是手工模块化的单例 Promise；再次调用返回同一模块；
  - `new SQL.Database(data?)` 在 Emscripten FS 上打开 `dbfile_<random>`；传入 `Uint8Array` 则 `FS.createDataFile`；
  - 无 params 的 `run()` 走 `sqlite3_exec`（可多语句）；有 params 则 `prepare` + `step` + `free`，不能多语句；
  - `exec()` 用 `sqlite3_prepare_v2` + `pzTail` 循环；`stackSave` / `stackRestore` 与 `_free(originalSqlPtr)` 在 `finally`（#630/#631 栈泄漏修复）；
  - `export()` 先 free 语句和 JS 函数指针，`sqlite3_close_v2` 后读文件，再 reopen 并重新 `registerExtensionFunctions`；pragma 回到默认；
  - `create_function` 用 `func.length` 当 arity；`updateHook` 映射 INSERT/UPDATE/DELETE；
  - Worker 只暴露 `open` / `exec` / `each` / `export` / `close` / `getRowsModified`；
  - 条件导出：`browser` → `dist/sql-wasm-browser.js`，默认 → `dist/sql-wasm.js`。
