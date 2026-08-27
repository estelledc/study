# React client-state source review (writer A)

> 用途：记录 Zustand、Jotai 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer A
- evidence：GitHub release/tag metadata、npm latest 版本号、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：`react-hook-form`、`tanstack-form`、`mcp-ts-sdk`、`ollama`、`aichat`、`shell-gpt`

## Zustand

- canonical source：`https://github.com/pmndrs/zustand`
- revision：`2115efb9e270e73ad1d3472dfe0e0c7b8c6abcd4`
- package：`zustand@5.0.15`
- tag：`v5.0.15`（annotated object 指向上述 commit）
- inspected：
  - `package.json`
  - `src/vanilla.ts`
  - `src/react.ts`
  - `src/index.ts`
  - `src/middleware.ts`
  - `src/middleware/persist.ts`
  - `src/middleware/ssrSafe.ts`
  - `src/middleware/subscribeWithSelector.ts`
  - `src/middleware/immer.ts`
  - `src/vanilla/shallow.ts`
  - `src/react/shallow.ts`
  - `src/traditional.ts`
  - `tests/vanilla/basic.test.ts`
  - `tests/persistSync.test.tsx`
- observed：
  - no production `dependencies`; `react`、`immer` 与 `use-sync-external-store` 都是 optional peer；
  - vanilla `createStore` 用 `Object.is` 跳过同引用更新；`replace` 为真或下一状态非对象/`null` 时整段替换，否则 `Object.assign({}, state, nextState)`；
  - React `create` 把 store API 挂到 hook 上，`useStore` 默认 identity selector，经 `React.useSyncExternalStore` 订阅；
  - `useShallow` 在 selector 外包一层，浅相等时回传上一引用；
  - `persist` 默认 `createJSONStorage(() => window.localStorage)`，hydration merge 是浅 spread；`skipHydration` 推迟到 `persist.rehydrate()`；
  - `ssrSafe` 以 `unstable_ssrSafe` 导出，SSR 期间 `set` 会抛错；
  - `createWithEqualityFn` 位于 `traditional.ts`，才依赖 `use-sync-external-store/shim/with-selector`。
- provenance：
  - GitHub latest release 与 npm latest 均为 `5.0.15`；
  - 已发布 tarball 未带 `gitHead`；本审查绑定可达且内部一致的 GitHub tag commit，不猜测 npm 打包提交。

## Jotai

- canonical source：`https://github.com/pmndrs/jotai`
- revision：`3e0b9ffad54b2fbedf2165a82d06ae6bcf1ebd67`
- package：`jotai@2.20.3`
- tag：`v2.20.3`（annotated object 指向上述 commit）
- inspected：
  - `package.json`
  - `src/vanilla.ts`
  - `src/vanilla/atom.ts`
  - `src/vanilla/store.ts`
  - `src/vanilla/internals.ts`
  - `src/react.ts`
  - `src/react/Provider.ts`
  - `src/react/useAtom.ts`
  - `src/react/useAtomValue.ts`
  - `src/react/useSetAtom.ts`
  - `src/vanilla/utils/atomFamily.ts`
  - `src/vanilla/utils/atomWithStorage.ts`
- observed：
  - no production `dependencies`；`react` 与 Babel 插件依赖都是 optional peer；
  - `atom()` 返回带稳定对象 identity 的 config；primitive 走 `init` + `defaultRead`/`defaultWrite`；
  - store 用 WeakMap 记 atom state；`read` 里的 `get` 把依赖记入 `atomState.d`，写后按 dependents 失效；
  - 异步 `read` 可返回 Promise，并拿到 `AbortSignal`；替换未完成 Promise 会 abort 上一轮；
  - 无 `<Provider>` 时 `useStore` 回落到 `getDefaultStore()`；传入或自建 `store` 才隔离；
  - `useAtom` 只是 `useAtomValue` + `useSetAtom`；Promise 值走 `React.use` 或抛 Promise 的 shim，需 Suspense；
  - `jotai/utils` 的 `atomFamily` 已标 deprecated，将在 v3 移除并迁到 `jotai-family`。
- provenance：
  - GitHub latest *stable* release 与 npm latest 均为 `2.20.3`；
  - 同仓另有 `v3.0.0-alpha.0/1`，不纳入本页；
  - 已发布 tarball 未带 `gitHead`；本审查绑定可达且内部一致的 GitHub tag commit。
