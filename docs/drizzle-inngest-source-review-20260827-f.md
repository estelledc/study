# Drizzle ORM + Inngest source review (writer F)

> 用途：记录 `drizzle` 与 `inngest` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-f` 标记 2026-08-27 平行 writer F，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未连接数据库，未运行 drizzle-kit / studio，未启动 Inngest Dev Server 或自托管栈，未发送事件，未测 bundle / 延迟 / 吞吐
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：仓库笔记 slug 仍为 `drizzle` 与 `inngest`；`drizzle-orm` 是 npm / GitHub 包名，不是新页面

## Drizzle ORM

- canonical source：`https://github.com/drizzle-team/drizzle-orm`
- tag：`0.45.2`（lightweight tag）
- revision：`273c78071d4841b497f5144734b38294df7ec64b`
- packages：`drizzle-orm@0.45.2`（Apache-2.0）、同提交 `drizzle-kit@0.31.10`（MIT）
- npm：`drizzle-orm@0.45.2` latest，无 `gitHead`
- also observed：`v1.0.0-rc.4` → `748058e837d9c4247330e3d45580cbdae52bffda`（prerelease，未绑定）
- inspected：
  - `drizzle-orm/package.json`
  - `drizzle-orm/src/pg-core/table.ts`
  - `drizzle-orm/src/pg-core/columns/serial.ts`
  - `drizzle-orm/src/pg-core/db.ts`
  - `drizzle-orm/src/pg-core/query-builders/select.ts`
  - `drizzle-orm/src/pg-core/query-builders/query.ts`
  - `drizzle-orm/src/node-postgres/driver.ts`
  - `drizzle-orm/src/sql/expressions/conditions.ts`
  - `drizzle-orm/src/table.ts`
  - `drizzle-kit/package.json`
  - `drizzle-kit/src/cli/index.ts`
  - `drizzle-kit/src/cli/schema.ts`
- observed：
  - schema 由 `pgTable` 把 column builder `build` 到 table；`$inferSelect` / `$inferInsert` 挂在 `Table`；
  - `serial()` 构造期即 `notNull` + `hasDefault`；
  - `eq` 经 `bindIfParam` 生成参数化 `SQL`；
  - SQL builder 与 `db.query` RQB 是两条入口，后者要求构造时传入 relational `schema`；
  - driver 按子路径分发（`node-postgres` / `d1` / `postgres-js` 等）；
  - kit `studio` 启动本地 HTTPS 服务并打印 `https://local.drizzle.studio`；Gel 的 generate/migrate/studio 拒绝执行。

## Inngest

- canonical source：`https://github.com/inngest/inngest`
- tag：`v1.44.0`（lightweight tag）
- revision：`a54673a45b00ea10917620ab3e05a21d04579db7`
- companion SDK：`https://github.com/inngest/inngest-js` tag `inngest@4.18.1` → annotated peel `bf41c415939804c8a947d1d14aec22b2c3ea16e8`（与 npm `inngest@4.18.1` `gitHead` 一致）
- license：平台 SSPL + delayed Apache-2.0；SDK Apache-2.0
- inspected：
  - `README.md`、`LICENSE.md`
  - `pkg/consts/consts.go`
  - `pkg/enums/opcode.go`
  - `pkg/execution/state/opcode.go`
  - `pkg/execution/executor/executor.go`
  - `packages/inngest/package.json`（JS SDK）
  - `packages/inngest/src/components/Inngest.ts`
  - `packages/inngest/src/components/InngestStepTools.ts`
  - `packages/inngest/src/components/execution/engine.ts`
  - `packages/inngest/src/types.ts`
  - `packages/inngest/src/test/functions/send-event/index.ts`
- observed：
  - 架构拆成 Event API → stream → Runner → Queue → Executor → state store；默认用 HTTPS 回拨应用 serve 端点；
  - opcode iota 从 `OpcodeNone` 到 `OpcodeDeferAbort` 共 17 项；另有 AI gateway、wait-for-signal、defer、discovery；
  - step 输入/输出上限各 4MB；默认 1000 step、4 次重试、sleep/wait 最长 366 天；
  - TS SDK `createFunction(options, handler)` 两参数，`triggers` 在 options 内；
  - step id 经 SHA-1 hex 作为 state key；改 id 即换钥匙。
