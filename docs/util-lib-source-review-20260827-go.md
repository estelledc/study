# JS util-lib source review (writer GO)

> 用途：记录 es-toolkit、radash 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GO
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、benchmark 或 lodash 对照套件
- worktrees：本机 `research-worktrees/`，不进入 Git
- target assigned：es-toolkit + radash
- fallback used：none（两库均不在 Study 961/963 清单中；本轮按调用方指定新增两页，不改写既有笔记）

## 选题

- 两者都是现代 TypeScript 工具函数集，对照点是「分类子路径 + lodash compat」对「单桶具名导出 + 异步控制流」。
- 未新增第三页，也未回退到已有 `immer` / `date-fns` 页。

## es-toolkit

- canonical source：`https://github.com/toss/es-toolkit`
- revision：`5dc4477f838b8cee2b6b09af4f373be2b3aaaa54`
- git tag：`v1.51.0`（lightweight tag，直接指向该提交）
- package：`es-toolkit@1.51.0`（仓内 `package.json` 同版本）
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/function/index.ts`
  - `src/function/debounce.ts`
  - `src/function/throttle.ts`
  - `src/array/chunk.ts`
  - `src/object/pick.ts`
  - `src/object/merge.ts`
  - `src/object/toMerged.ts`
  - `src/predicate/isNotNil.ts`
  - `src/promise/delay.ts`
  - `src/promise/limitAsync.ts`
  - `src/error/AbortError.ts`
  - `src/compat/index.ts`
  - `src/compat/compat.ts`
  - `src/compat/array/chunk.ts`
  - `src/fp/index.ts`
- observed：
  - `exports` 提供 `.` 与 `./array`、`./compat`、`./fp`、`./function` 等子路径；`sideEffects` 为 `false`；
  - 主入口 `src/index.ts` 再导出 array/error/function/math/object/predicate/promise/string/util，并显式导出 `limitAsync`；不导出 `compat` / `fp` / `map` / `bigint` / `set` / `server` / `types`；
  - 现代 `chunk` 在 `size` 不是正整数时抛错；`es-toolkit/compat` 的 `chunk` 把 `size` 收成 `floor` 后的非负整数，`0` / 非 array-like 返回 `[]`；
  - 现代 `debounce` 默认 `edges` 视为 trailing；可用 `AbortSignal`；返回函数带 `schedule` / `cancel` / `flush`，调用本身返回 `void`；
  - `throttle` 建立在 `debounce` 上，默认 `edges` 为 `['leading', 'trailing']`；
  - `pick` 只用 `Object.hasOwn` 复制自有属性；`merge` 就地改 target，`toMerged` 先深拷再合并；
  - `isNotNil` 是 `x != null` 类型守卫；`delay` 在 abort 时 `reject(new AbortError())`；`limitAsync` 用 `Semaphore` 限并发；
  - README / `src/index.ts` 写有 2–3× 与「最多小 97%」的对照句，本文未测，不当成运行事实。
- provenance：
  - GitHub tag `v1.51.0` → `5dc4477f838b8cee2b6b09af4f373be2b3aaaa54`；
  - npm `es-toolkit@1.51.0` 未发布 `gitHead`；身份靠 tag + 仓内版本号。

## radash

- canonical source：`https://github.com/sodiray/radash`
- revision：`4cab1900d08e0997abc4f17aec3cbfe18958d766`
- git tag：`v12.1.1`（lightweight tag，直接指向该提交）
- package：`radash@12.1.1`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/array.ts`
  - `src/async.ts`
  - `src/object.ts`
  - `src/curry.ts`
  - `src/typed.ts`
- observed：
  - 单一入口：`exports.import` / `require` 指向 `dist/esm/index.mjs` 与 `dist/cjs/index.cjs`；`sideEffects` 为 `false`；没有分类子路径；
  - `src/index.ts` 从 array/async/curry/number/object/random/series/string/typed 具名再导出；`tryit` 同时以 `try` 和 `tryit` 导出；
  - `map` 对每个 mapper `await`，是顺序异步，不是 `Promise.all`；并发要走 `parallel(limit, array, func)`；
  - `tryit(fn)(...args)` 返回 `[Error, undefined] | [undefined, result]`，Promise 会再包一层；
  - `get(value, path, defaultValue)` 只拆字符串路径（`foo.bar[0]`）；README kitchen sink 里的函数路径与源码不符；
  - `debounce({ delay }, func)` 选项在前；`cancel()` 把 `active` 置 false、不清 timer；取消后的调用会立刻执行 `func`；
  - `clone` 是浅拷：primitive 原样返回，函数 `bind({})`，其余 `new constructor()` 再抄 `getOwnPropertyNames`；
  - `assign` 只对子对象递归，右边覆盖左边；`fork` 返回 `[pass, fail]`；`max`/`min` 在带 getter 时返回原元素。
- provenance：
  - GitHub 当前身份是 `sodiray/radash`；`rayepps/radash` 重定向到同一仓库；
  - 仓内 `package.json` 的 `repository.url` 仍写 `https://github.com/rayepps/radash`；
  - npm `radash@12.1.1` 的 `gitHead` 与 tag `v12.1.1` 同为 `4cab1900d08e0997abc4f17aec3cbfe18958d766`。
