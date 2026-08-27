# Debounce / throttle source review (writer FT)

> 用途：记录 `perfect-debounce` 与 `throttle-debounce` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ft` 标记 2026-08-27 PARALLEL writer FT，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FT
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、未测 timer 精度、bundle 或下载量
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`perfect-debounce`、`throttle-debounce` 为本轮新增页面，不是既有笔记改写

## perfect-debounce

- canonical source：`https://github.com/unjs/perfect-debounce`
- tag：`v2.1.0`（annotated tag object `6721ae3e83ed46b54b931a6211f91c588e9359f8`）
- revision：`d3f83001dad6faa2090bd1aadab7312843fe6b79`
- package：`perfect-debounce@2.1.0`（MIT，零运行时依赖，ESM）
- npm：`perfect-debounce@2.1.0` latest；`gitHead` 与 tag peel 一致
- also observed：`origin/main` 在此提交之后还有依赖更新，未绑定
- inspected：
  - `package.json`
  - `LICENSE`
  - `README.md`
  - `src/index.ts`
  - `test/index.test.ts`
- observed：
  - 只导出 `debounce`，没有 throttle；默认 `wait=25`、`trailing=true`、`leading=false`；
  - 返回带 `cancel` / `flush` / `isPending` 的 Promise 函数；同窗调用共享同一份 resolve 值；
  - `currentPromise` 未结束时后续调用直接拿进行中的 Promise，并把 args 记到 `trailingArgs`；
  - `trailing: false` 只关掉 in-flight 结束后的补跑，不关掉安静期结束时那一次 `applyFn`；
  - `isPending()` 只看 timer（`!!timeout`），不看进行中的 Promise；
  - `cancel()` 清 timer 与 `resolveList`，已发出的 Promise 不会再 resolve；
  - `flush` 是箭头函数，且仅在有 `trailingArgs` 且没有 `currentPromise` 时调用。

## throttle-debounce

- canonical source：`https://github.com/niksy/throttle-debounce`
- bound revision：`bb02ea22128987fdf41e5cc6a817ba2aeeb9f7a2`（npm `throttle-debounce@5.0.2` `gitHead`，`package.json` 版本为 `5.0.2`）
- git tag `v5.0.2`：lightweight tag → `0cb020ff11f0a272493dd1ba4fc972a9fccd81cb`，该提交 `package.json` 仍是 `5.0.1`；tag 是 gitHead 的祖先，中间只改了版本号与 CHANGELOG
- license：`LICENSE.md` 为 MIT（Ivan Nikolić + Cowboy Ben Alman）；GitHub 仓库 license 元数据为 `NOASSERTION`
- engines：`node >=12.22`
- inspected：
  - `package.json`
  - `LICENSE.md`
  - `README.md`
  - `index.js`
  - `debounce.js`
  - `throttle.js`
  - `test/index.js`
- observed：
  - 参数顺序是 `(delay, callback, options)`，与 perfect-debounce / lodash 的 `(fn, wait)` 相反；
  - `debounce` 只是 `throttle(..., { debounceMode: atBegin !== false })`；
  - `debounceMode === undefined` 才是 throttle（用 `elapsed > delay`）；`true` 是开头 debounce，`false` 是结尾 debounce；
  - 默认同步调用 `callback.apply`，不返回 Promise，也不合并调用方的返回值；
  - `noLeading && noTrailing` 时测试断言回调次数为 0；
  - `cancel({ upcomingOnly: true })` 只清 timer、不把 `cancelled` 置永久；默认 `cancel()` 之后后续调用直接 return。
