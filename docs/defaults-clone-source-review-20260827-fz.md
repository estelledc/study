# defu / rfdc source review (writer FZ)

> 用途：记录 `defu` 与 `rfdc` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fz` 标记 2026-08-27 平行 writer FZ。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FZ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行 vitest / tap / lint、未测 bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/defu` 与 `research-worktrees/rfdc`，不进入 Git
- excluded slugs：未新增 `defaults-deep`、`lodash.defaultsdeep`、`clone-deep`、`fast-copy` 页面；未改 `ofetch`、`immer`

## defu

- canonical source：`https://github.com/unjs/defu`
- revision：`80c0146afb11ebd86183a579ec469f3abd976695`
- git tag：annotated `v6.1.7` 解引用到本提交（tag object `2526138293fdf660f5472082682f0ac89a426d6d`）
- package：仓内 `defu@6.1.7`；npm `defu@6.1.7` latest
- inspected：
  - `package.json`
  - `src/defu.ts`
  - `src/_utils.ts`
  - `src/types.ts`
  - `lib/defu.cjs`
  - `lib/defu.d.cts`
  - `test/defu.test.ts`
  - `test/utils.test.ts`
  - `README.md`
  - `CHANGELOG.md`
- observed：
  - npm 未发布 `gitHead`；身份靠 annotated tag + 仓内 version + 提交 SHA；
  - 源码入口是 `src/defu.ts`；`lib/defu.cjs` 只是 `require("../dist/defu.cjs")` 的包装，`dist/` 不在本提交树里；
  - `createDefu` 从 `{}` 起 `reduce`，每步 `_defu(prev, next)`：先摊 defaults，再把 source 自己的 key 盖上去，最左参数优先；
  - source 的 `null` / `undefined` 被跳过，留下 defaults；
  - 两边都是数组时写成 `[...source, ...defaults]`（v6.0.0 起调转顺序）；
  - 只对 `isPlainObject` 递归；`Date`、自定义 class、RegExp 整值替换；
  - `isPlainObject` 允许 `Object.create(null)` 与 `[object Module]`，拒绝 iterator / 普通 toStringTag；
  - `Object.keys` 遍历，并跳过 `__proto__` 与 `constructor`；v6.1.5 changelog 写明修过 defaults 侧 prototype pollution；
  - ESM 具名导出 `defu` / `createDefu` / `defuFn` / `defuArrayFn`；CJS 类型命名空间仍挂 `fn` / `arrayFn` / `extend`；
  - `defuFn` 仅在 defaults 已有该 key 时调用 source 函数；`defuArrayFn` 还要求 defaults 值是数组。
- provenance：GitHub annotated tag `v6.1.7` 剥皮提交与仓内 `6.1.7` 一致；npm 无 `gitHead`。

## rfdc

- canonical source：`https://github.com/davidmarkclements/rfdc`
- revision：`29ea53f8ccc618495b40cfafba475952b62be847`
- git tag：lightweight `1.4.1`（无 `v` 前缀）指向本提交；另有 `v1.4.0` → `228fc35b...`，落后 2 个提交
- package：仓内与 npm `rfdc@1.4.1` 均为 `1.4.1`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `default.js`
  - `readme.md`
  - `test/index.js`
- observed：
  - npm `gitHead` 与 tag `1.4.1` 相同；相对 `v1.4.0` 多了 constructorHandlers 类型和 version bump；
  - 导出是工厂：`rfdc(opts)` 返回 clone 函数；`rfdc/default` 等于 `rfdc()()`；
  - 默认 `clone` 用 `hasOwnProperty` 跳过继承属性；`proto: true` 把可枚举原型属性抄到对象自身；
  - `circles: true` 用 `refs` / `refsNew` 栈记住已复制对象；默认不跟踪，环会像 `JSON.stringify` 一样炸掉；
  - 内置 handler：`Date`、`Map`、`Set`；`ArrayBuffer.isView` 走 `copyBuffer`（`Buffer.from` 或 typed array 拷构造）；
  - `constructorHandlers` 按 **精确 constructor** 查找，不认子类；
  - 函数按引用留下；`Error` / `RegExp` 没有内置 handler 时变成自有可枚举字段的普通对象；
  - CJS，无 `engines`，无运行时依赖。
- provenance：GitHub lightweight tag `1.4.1` 与 npm `rfdc@1.4.1` `gitHead` 一致。
