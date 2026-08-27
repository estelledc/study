# Zod / Valtio source review

> 用途：记录 PARALLEL writer K 在 2026-08-27 对 `zod`、`valtio` 两页做 STATIC_REVIEW 所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- writer：K
- review date：2026-08-27
- evidence：固定提交静态源码、测试与仓内文档阅读
- review_mode：`STATIC_REVIEW`
- verification_status：`UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、benchmark、bundler 或 TypeScript 编译
- worktrees：本机 `research-worktrees/`，不进入 Git
- 未改 forbidden slugs：`zustand`、`jotai`、`xstate`、`redux`、`drizzle-orm`、`react-hook-form`、`tanstack-form`、`mcp-ts-sdk`、`ollama`、`aichat`、`shell-gpt`

## Zod

- canonical source：`https://github.com/colinhacks/zod`
- published identity：GitHub release `v4.4.3`
- revision：`1fb56a5c18c27102dbc92260a4007c7732a0ccca`
- package：`packages/zod` → `zod@4.4.3`
- accessed_at：2026-08-27
- inspected：
  - `packages/zod/package.json`
  - `packages/zod/src/v4/core/parse.ts`
  - `packages/zod/src/v4/core/core.ts`
  - `packages/zod/src/v4/core/schemas.ts`
  - `packages/zod/src/v4/classic/schemas.ts`
  - `packages/zod/src/v4/classic/tests/object.test.ts`
  - `packages/zod/src/v4/classic/tests/codec.test.ts`
- observed：
  - classic `parse` / `safeParse` / async 对应项都委托 `schema._zod.run`；
  - 同步 API 遇到 Promise 抛 `$ZodAsyncError`，提示改用 `parseAsync`；
  - `z.object` 默认 strip 未知 key；loose / strict / catchall 改变输出或 issue；
  - classic 实例同时挂 `encode` / `decode` 与 safe/async 变体；`encode` 把 `direction` 设为 `backward`；
  - 对象测试覆盖 JIT/jitless 与 `__proto__` 防护；
  - 默认入口、`mini`、`v3`、`v4`、`v4/core` 与 locale 子路径同时存在。
- provenance note：访问当日 `main` HEAD 新于本 tag，且仍有自称 `4.4.3` 的后续提交；没有更新的正式 GitHub release。本文绑定官方 tag，不猜测未发布版本。上一轮页面曾绑定后置提交 `912f0f51...`。

## Valtio

- canonical source：`https://github.com/pmndrs/valtio`
- published identity：GitHub release `v2.3.2`
- revision：`15c64d4d7a7a9bd55d750fa6a317b440978a2b25`
- package：`valtio@2.3.2`
- accessed_at：2026-08-27
- inspected：
  - `package.json`
  - `src/vanilla.ts`
  - `src/react.ts`
  - `src/index.ts`
  - `src/vanilla/utils.ts`
  - `src/vanilla/utils/subscribeKey.ts`
  - `src/vanilla/utils/proxyMap.ts`
  - `src/vanilla/utils/watch.ts`
  - `docs/guides/migrating-to-v2.mdx`
  - `docs/how-tos/some-gotchas.mdx`
  - `README.md`
- observed：
  - `proxy()` 用 `Proxy.set` / `deleteProperty` 发通知，比较函数默认 `Object.is`；
  - v2 `proxy(obj)` 就地改写传入对象，不再先深拷贝；
  - `snapshot()` 按版本缓存；属性不可写，但已移除 `Object.preventExtensions`；
  - `useSnapshot` 经 `useSyncExternalStore` + `subscribe` + `proxy-compare` 做路径级重渲染；
  - `subscribe` 默认 microtask 批量，`notifyInSync` / `{ sync: true }` 关闭批量；
  - 默认 `canProxy` 排除带 `Symbol.iterator` 的非数组对象，以及 Date/Promise/WeakMap 等；
  - `proxyMap` / `proxySet` 在快照上 mutate 会抛错；
  - `watch` 仍导出，但源码标 deprecated 并指向 `valtio-reactive`；
  - React peer `>=18` 且 optional；非 React 应从 `valtio/vanilla` 导入。
