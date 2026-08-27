# Command palette source review

> 用途：记录 cmdk、kbar 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL BS
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、Playwright、Jest、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## cmdk

- canonical source：`https://github.com/pacocoursey/cmdk`
- reachable GitHub identity：`https://github.com/dip/cmdk`（`gh api repos/pacocoursey/cmdk` 解析到同一仓库）
- revision：`fb4ea04e9ec211777fbb39c6104e3c5f2ee107d2`
- package：`cmdk@1.1.1`（monorepo `cmdk/package.json`）
- inspected：
  - `cmdk/package.json`
  - `cmdk/src/index.tsx`
  - `cmdk/src/command-score.ts`
  - `ARCHITECTURE.md`
  - `test/basic.test.ts`
  - `test/item.test.ts`
  - `test/dialog.test.ts`
  - `test/keybind.test.ts`
- observed：
  - compound components keep items in the React tree; filtered items return `null` and leave the DOM;
  - default filter is inlined `command-score`; a score of `0` hides the item;
  - `shouldFilter === false` skips scoring/sorting and leaves visibility to the caller;
  - search sorting mutates DOM order with `appendChild` inside the list sizer / group;
  - `Command.Dialog` is a thin Radix Dialog portal; open/close is caller-owned;
  - default `vimBindings` map Ctrl+N/J/P/K; IME composition (`isComposing` or `keyCode === 229`) blocks those binds;
  - first enabled visible item is selected after search/filter; `loop` is opt-in;
  - peer range is React 18/19; runtime deps are Radix compose-refs, dialog, id and primitive.
- provenance notes：
  - Git tag `v1.1.1` and package version `1.1.1` share `fb4ea04e...`;
  - npm `cmdk@1.1.1` does not publish `gitHead`;
  - published `repository.url` still names `pacocoursey/cmdk` while GitHub serves `dip/cmdk`.

## kbar

- canonical source：`https://github.com/timc1/kbar`
- revision：`26ec0f49f92ab34fa6ab59392782d56020f28098`
- package：`kbar@1.0.0`
- inspected：
  - `package.json`
  - `src/index.tsx`
  - `src/useStore.tsx`
  - `src/useMatches.tsx`
  - `src/KBarContextProvider.tsx`
  - `src/InternalEvents.tsx`
  - `src/KBarSearch.tsx`
  - `src/KBarResults.tsx`
  - `src/action/ActionImpl.ts`
  - `src/action/ActionInterface.ts`
  - `src/action/Command.ts`
  - `src/action/HistoryImpl.ts`
  - `src/types.ts`
  - `src/useRegisterActions.tsx`
  - `src/__tests__/useMatches.test.tsx`
- observed：
  - actions are data objects with required parent-before-child registration;
  - empty search lists root actions; non-empty search flattens descendants and queries Fuse;
  - Fuse keys/weights are `name` 0.5, `keywords` 0.3, `subtitle` 0.2, `threshold` 0.2, `useTokenSearch` + `tokenMatch: "all"`;
  - comments still mention commandScore, but 1.0.0 converts Fuse scores as `1 / (score + 1)` and adds `action.priority`;
  - default toggle is `$mod+k`; Escape animates out and resets `currentRootActionId`;
  - selecting an action with `perform` runs `Command.perform` and toggles closed; a parent without `perform` only changes the root;
  - `enableHistory` is opt-in; a `perform` return function becomes the negate record for Cmd+Z / Cmd+Shift+Z;
  - results virtualize with `@tanstack/react-virtual`; portal comes from Radix;
  - peer range is React 17/18/19; tag, package version and npm `gitHead` all identify `26ec0f49...`.
