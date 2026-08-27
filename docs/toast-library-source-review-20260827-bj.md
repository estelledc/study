# Toast library source review

> 用途：记录 Sonner、react-hot-toast 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：BJ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 Playwright/Jest、size-limit、bundle 或浏览器手势测试
- worktrees：本机 `research-worktrees/`，不进入 Git

## Sonner

- canonical source：`https://github.com/emilkowalski/sonner`
- revision：`6739aca5f668a33a4fd1d2fd9f758dff95c57466`
- package：`sonner@2.0.8`
- inspected：
  - `package.json`
  - `src/index.tsx`
  - `src/state.ts`
  - `src/types.ts`
  - `src/hooks.tsx`
  - `src/assets.tsx`
  - `test/tests/basic.spec.ts`
- observed：
  - `toast` publishes through a process-wide `Observer`; `Toaster` and `useSonner` subscribe and replay still-active toasts;
  - same-id updates merge while the toast is active; a dismissed id starts a new toast and does not inherit old props;
  - a pending `requestAnimationFrame` dismissal is cancelled when the same id is created again;
  - defaults are 3 visible toasts, 4000 ms lifetime, 14 px gap, 45 px swipe threshold and 200 ms unmount delay;
  - history keeps at most 100 entries and only drops dismissed toasts;
  - promise settlement treats React elements, failed `Response` and `Error` values as distinct UI outcomes, and exposes `unwrap()`.
- provenance conflict：
  - npm reports `sonner@2.0.8` as latest with `gitHead=ecce1841c55e4a72dfe139a8992b56498660125e`;
  - that object is reachable, but its `package.json` reports `2.0.7`;
  - GitHub tag `v2.0.8` points to `6739aca5...`, whose `package.json` reports `2.0.8`;
  - this review therefore binds the internally consistent tag/package/revision.

## react-hot-toast

- canonical source：`https://github.com/timolins/react-hot-toast`
- revision：`3a870ed99ff43848c5ad66ce56ee346dbbf3633e`
- package：`react-hot-toast@2.6.0`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/core/toast.ts`
  - `src/core/store.ts`
  - `src/core/use-toaster.ts`
  - `src/core/types.ts`
  - `src/core/utils.ts`
  - `src/headless/index.ts`
  - `src/components/toaster.tsx`
  - `src/components/toast-bar.tsx`
  - `test/toast.test.tsx`
- observed：
  - each `toasterId` has its own reducer state; the default bucket is `default`;
  - ADD slices to `toastLimit` 20; UPSERT updates an existing id or adds a new toast;
  - default durations are blank/error/custom 4000 ms, success 2000 ms and loading `Infinity`;
  - dismiss flips `visible`/`dismissed`; remove happens after `removeDelay` (default 1000 ms) unless `toast.remove` is used;
  - `toast.promise` returns the underlying Promise and reuses the loading id; missing success/error copy dismisses instead;
  - styled `Toaster` depends on `goober`; `./headless` exports the store and hooks without `ToastBar`.
- provenance note：
  - GitHub annotated tag `v2.6.0` peels to `3a870ed9...`;
  - npm `2.6.0` publishes no `gitHead`;
  - tag, package version and reachable commit are internally consistent.
