# Immer / Immutable.js source review

> 用途：记录 PARALLEL writer AX 在 2026-08-27 对 `immer`、`immutable-js` 两页做 STATIC_REVIEW 所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- writer：AX
- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- review_mode：`STATIC_REVIEW`
- verification_status：`UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、benchmark、bundler 或 TypeScript 编译
- worktrees：本机 `research-worktrees/`，不进入 Git
- 未改 open PR slugs：`zustand`、`jotai`、`valtio`、`mobx`、`xstate`、`zod` 及其他 2026-08-27 已开 PR 目标页

## Immer

- canonical source：`https://github.com/immerjs/immer`
- published identity：GitHub release / tag `v11.1.18`
- revision：`b00474e3755954f6b27a392dcb4bce97254c100c`
- package：`immer@11.1.18`
- accessed_at：2026-08-27
- inspected：
  - `package.json`
  - `src/immer.ts`
  - `src/core/immerClass.ts`
  - `src/core/proxy.ts`
  - `src/core/finalize.ts`
  - `src/core/scope.ts`
  - `src/utils/plugins.ts`
  - `src/utils/common.ts`
  - `src/utils/errors.ts`
  - `src/plugins/patches.ts`
  - `src/plugins/mapset.ts`
  - `src/plugins/arrayMethods.ts`
  - `__tests__/base.js`
- observed：
  - 默认 `Immer` 实例导出 `produce` / `produceWithPatches` / `applyPatches` / `createDraft` / `finishDraft`；
  - 默认可代理 plain object 与 array；Map/Set 虽被 `isDraftable` 认作可起草，但 `createProxy` 会要求已加载 `enableMapSet()`；
  - `enablePatches()` 与 `enableArrayMethods()` 同样是可选插件；未加载时 `getPlugin` 抛错；
  - `autoFreeze_` 默认 `true`；模块注释写明生产环境也默认冻结；
  - `useStrictShallowCopy_` 默认 `false`（不复制 getter/setter/不可枚举描述符）；
  - `useStrictIteration_` 字段默认 `false`，尽管部分注释写成“默认开启严格迭代”；
  - recipe 若返回新值同时又改过 draft，`processResult` 会 `die(4)`；返回 `undefined` 则 finalize 该 draft；
  - `produce` 同步调用 recipe 后立刻 `revokeScope`；错误表提到把 draft 交给异步流程会拿到已撤销 proxy；
  - 错误表含 “Immer forbids circular references”，但本 revision 的 `src/` 未见 `die(5)` 调用，不能据此声称运行时一定拦截循环引用；
  - `enableArrayMethods()` 让 mutating 方法直接改 `copy_`；文档写明回调拿到的是 base 值而不是 draft。
- provenance note：
  - npm `immer@11.1.18` 的 `gitHead`、GitHub tag `v11.1.18` 与本提交均为 `b00474e3755954f6b27a392dcb4bce97254c100c`；
  - 该提交工作区 `package.json` 仍写 `10.0.3-beta`，`release` 脚本是 `semantic-release --branches main`；
  - 因此 published identity 以 npm/tag 为准，不把 git 内占位版本当成已发布号。

## Immutable.js

- canonical source：`https://github.com/immutable-js/immutable-js`
- published identity：GitHub release / tag `v5.1.9`
- revision：`329f7a680efa262c310b938a343295880eefe4fc`
- package：`immutable@5.1.9`
- accessed_at：2026-08-27
- inspected：
  - `package.json`
  - `src/Immutable.js`
  - `src/Map.js`
  - `src/List.js`
  - `src/fromJS.js`
  - `src/is.ts`
  - `src/Hash.ts`
  - `src/TrieUtils.ts`
  - `src/Record.js`
  - `src/methods/withMutations.js`
  - `src/methods/asMutable.js`
  - `__tests__/Map.ts`
- observed：
  - 公共入口导出 `Map` / `List` / `Set` / `OrderedMap` / `OrderedSet` / `Stack` / `Record` / `Seq` / `Range` / `Repeat` 以及 `fromJS`、`is`、`hash` 与一组 functional 读写 API；
  - `TrieUtils` 使用 `SHIFT = 5`、`SIZE = 32` 的 trie 节点；`Map` 以 `BitmapIndexedNode` / `HashArrayMapNode` / `ArrayMapNode` 实现 persistent map；
  - `List` 用同样的 32 路节点加 `_origin` / `_capacity` / `_tail` 做索引集合；
  - `withMutations` 经 `asMutable()` 分配 `OwnerID`，回调内可就地改；若 `wasAltered()` 则为结果 `__ensureOwner` 回原 owner，否则返回原集合；
  - `fromJS` 默认 converter：indexed → `List`，keyed → `Map`，其余可迭代 → `Set`；遇到循环结构抛 `TypeError`；
  - `is()` 把 `NaN` 视为相等，且 `-0` 与 `0` 相等，再走 `valueOf` / `equals`；注释明确它与 `Object.is` 以及 ES6 Map/Set 键相等都不同；
  - `Record` 的 default values 必须是 plain object，不能是另一个 Record 或 Immutable Collection。
- provenance note：
  - tag、`package.json` 与 npm `gitHead` 均指向 `329f7a680efa262c310b938a343295880eefe4fc` / `5.1.9`；
  - 访问当日另有 prerelease `v6.0.0-beta.1`，以及 3.x 安全回移 `v3.8.4`（CVE-2026-59879 / CVE-2026-59880）；本文不绑定这两条线；
  - npm `immutable@3.8.4` 的 `gitHead` 与 GitHub tag 对象不是同一 SHA，3.x 线若要单独成文需重新核 provenance。
