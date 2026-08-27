# Hooks / context source review (writer GA)

> 用途：记录 `hookable` 与 `unctx` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ga` 标记 2026-08-27 平行 writer GA，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GA
- evidence：GitHub release/tag metadata、npm latest 版本号、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、bundle、DevTools `createTask`、AsyncLocalStorage 运行时或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- slugs：本轮新增 `hookable` 与 `unctx` 两页；未改 `ofetch`、`unstorage`、`nuxt`

## hookable

- canonical source：`https://github.com/unjs/hookable`
- revision：`b77477c027039362ee0ec4f39b8998c4f1b21707`
- package：`hookable@6.1.1`
- tag：`v6.1.1`（lightweight tag 指向上述 commit）
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/hookable.ts`
  - `src/utils.ts`
  - `src/types.ts`
  - `src/debugger.ts`
  - `test/hookable.test.ts`
- observed：
  - 无 production `dependencies`；单一 ESM export `"."` → `./dist/index.mjs`；
  - `Hookable` 提供 `hook` / `hookOnce` / `addHooks` / `callHook` / `callHookParallel` / `callHookWith` / deprecate / beforeEach / afterEach；
  - `HookableCore` 只保留 `hook` / `removeHook` / `callHook`，没有 deprecate、spy 或 parallel；
  - `createHooks()` 只是 `new Hookable()`；构造函数不再接收 logger；
  - `callHook` 走 `serialTaskCaller` → `callHooks`：同步回调继续循环，thenable（`result && typeof result.then === "function"`）才 `Promise.resolve` 后接下一枚；同步抛错变成 `Promise.reject`；
  - `callHookParallel` 走 `Promise.all`；空 hook 列表直接 `void`；
  - `callHookWith` 把当前 `_hooks[name]` **拷贝**后再交给 caller；
  - `addHooks` 用 `flatHooks` 把嵌套对象展成 `parent:key`；`mergeHooks` 是独立导出，不是实例方法；
  - 空 name 或非函数 `hook()` 返回空 unregister；`hookOnce` 先注销包装器再调用原函数。
- provenance：
  - GitHub latest release 与 npm latest 均为 `6.1.1`；
  - npm `gitHead` 与 tag commit 同为 `b77477c027039362ee0ec4f39b8998c4f1b21707`。

## unctx

- canonical source：`https://github.com/unjs/unctx`
- revision：`6586739a70bd43a67437f72f00c186dd762b5125`
- package：`unctx@3.0.1`
- tag：`v3.0.1`（lightweight tag 指向上述 commit）
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/plugin.ts`
  - `src/transform.ts`
  - `test/index.test.ts`
  - `test/async-context.test.ts`
  - `test/async.test.ts`
  - `test/transform.test.ts`
- observed：
  - 无 production `dependencies`；`magic-string` / `oxc-parser` / `rolldown` / `unplugin` 都是 optional peer，只服务 transform；
  - `createContext()`：`use()` 在实例为 `undefined` 时抛 `Context is not available`；`tryUse()` 用 `?? null`；
  - `call()` 同步注入 `currentInstance`，`finally` 在非 singleton 时清掉；不同引用嵌套 `call` 抛 `Context conflict`；
  - 普通 `call(async () => { await ... })` 在第一个 await 之后 `tryUse()` 为 `null`（测试固定）；
  - `asyncContext: true` 才创建 `AsyncLocalStorage`：优先 `opts.AsyncLocalStorage`，否则 `globalThis.AsyncLocalStorage` 或 `process.getBuiltinModule("node:async_hooks")`；缺失时只 `console.warn`；
  - ALS 把 object 实例包进 `WeakRef`（`__unctx_weak`）；无 `WeakRef` 时回落到强引用 class；
  - `callAsync` 把 leave handler 登记到 `globalThis.__unctx_async_handlers__`；默认 transform 只改 `withAsyncContext`，`callAsync` 需加入 `asyncFunctions`；
  - `withAsyncContext` 在未被 transform 时只 `console.warn` 并原样返回函数；
  - `getContext` / `useContext` 走 `globalThis.__unctx__` 默认 namespace。
- provenance：
  - GitHub latest release 与 npm latest 均为 `3.0.1`；
  - 已发布 tarball 未带 `gitHead`；本审查绑定可达且内部一致的 GitHub tag commit，不猜测 npm 打包提交。
