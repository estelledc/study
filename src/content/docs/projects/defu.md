---
title: defu — 最左优先的递归默认值合并
description: 从空对象 reduce，nullish 跳过，数组按用户项在前拼接
来源: https://github.com/unjs/defu
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/defu
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 80c0146afb11ebd86183a579ec469f3abd976695
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.1.7
---

## 是什么

defu 是一个 **递归补默认值** 的小库。日常类比：你先摊开工厂说明书，再把用户勾过的格子盖上去；没勾的格子留下说明书，勾成空的格子也当没勾。

```js
import { defu } from "defu"
const options = defu({ a: { b: 2 } }, { a: { b: 1, c: 3 } })
// { a: { b: 2, c: 3 } }
```

固定 `6.1.7` 里，最左边的对象赢。它不是深拷贝库：合并结果是新对象，但 `Date`、class 实例和函数按引用留下。

## 为什么重要

不看 `_defu` 和 `createDefu`，容易把“defaults-deep”印象整份搬过来：

- 为什么 `defu({ a: null }, { a: 1 })` 得到 `1`，而不是保留 `null`
- 为什么两个数组会拼成一条，而且用户数组在前
- 为什么 `new Date()` / `new Foo()` 不会再往里挖字段
- 为什么 ESM 要写 `import { defu }`，旧的 `defu.fn` 已经不是源码入口

一句话：它是 **最左优先、跳过空值、只递归普通对象** 的默认值合并器。

## 核心要点

固定 6.1.7 的主链可以拆成五步：

1. **从空对象收参**：`createDefu` 做 `arguments.reduce((p, c) => _defu(p, c, "", merger), {})`。非普通对象参数被当成 `{}`。
2. **先摊 defaults**：`_defu(source, defaults)` 先 `{ ...defaults }`，再遍历 source 自己的 key。
3. **空值让路**：source 上的 `null` / `undefined` 直接 `continue`，defaults 留下。
4. **数组拼接、对象下钻**：两边都是数组就 `[...source, ...defaults]`；两边都是 plain object 再递归，并把 `namespace` 写成 `foo.bar`。
5. **其余整值替换**：`Date`、自定义 class、函数、RegExp 都不递归，source 赢。

`Object.keys` 还会跳过 `__proto__` 和 `constructor`。`isPlainObject` 认 `Object.create(null)` 和 `[object Module]`，不认带 iterator 或普通 `toStringTag` 的值。

## 实践示例

### 案例 1：用户配置盖过多层默认

```js
import { defu } from "defu"
const options = defu(
  { port: 3000 },
  { host: "127.0.0.1", port: 8080 },
  { host: "0.0.0.0", env: "dev" },
)
// { port: 3000, host: "127.0.0.1", env: "dev" }
```

三个对象从左往右折进去。第一份已经写了 `port`，后面两份再也改不掉。

### 案例 2：数组是拼接，不是覆盖

```js
import { defu } from "defu"
defu({ plugins: ["mine"] }, { plugins: ["core"] })
// { plugins: ["mine", "core"] }
```

v6 起顺序是用户在前、默认在后。想改成覆盖或去重，要用 `createDefu` 自己写 merger。

### 案例 3：函数 merger 只在默认值存在时开火

```js
import { defuFn, defuArrayFn } from "defu"

defuFn({ count: (n) => n + 20 }, { count: 10 })
// { count: 30 }

defuArrayFn({ count: () => 20 }, { count: 10 })
// { count: () => 20 }
```

`defuFn` 看见 source 是函数、defaults 已有该 key，就把默认值喂进去。`defuArrayFn` 还要求 defaults 那边已经是数组；`count: 10` 不满足，函数原样留下。

## 踩过的坑

1. **把 `null` 当成“明确关掉”**：source 的 `null` 会被跳过，默认值回来。要保留空值请换别的库。
2. **把数组合并想成 lodash `defaultsDeep`**：lodash 覆盖数组；defu 拼接，而且 v6 把用户项放前面。
3. **对 class 实例做字段合并**：`isPlainObject` 为假，整颗实例被 source 换掉。
4. **继续写 `defu.fn(...)`**：v6 源码改成具名导出 `defuFn` / `defuArrayFn`。CJS 类型命名空间还挂着旧名字，那是包装，不是 `src/defu.ts` 的主入口。
5. **把 npm latest 的 `gitHead` 当身份**：`defu@6.1.7` 没有 `gitHead`，只以 annotated tag 剥皮提交为准。

## 适用 vs 不适用场景

**适用**：

- 配置对象要多层默认，用户字段优先
- 插件名、ignore 列表需要“用户项 + 默认项”拼在一起
- 需要 `createDefu` 按 namespace 改某几个 key

**不适用**：

- 要一份与输入切断引用的深拷贝——那是 [[rfdc]]
- 必须保留 `null` 表示“关掉这项”
- 要把 `Date` / class 字段再往里合并

## 固定版本边界

- 本文绑定 `unjs/defu@80c0146a...`，即 annotated tag `v6.1.7` 的剥皮提交；仓内 `package.json` 也是 `6.1.7`。
- npm `defu@6.1.7` 未发布 `gitHead`。发布树里的 `lib/defu.cjs` 转去 `dist/`，本提交没有 `dist/`，正文读的是 `src/`。
- v6.1.5 changelog 写过 defaults 侧 `__proto__` 污染修复；本提交仍跳过 `__proto__` / `constructor`。
- 本文未安装依赖、未跑 vitest / oxlint，状态保持 `UNVERIFIED`。

## 学到什么

1. **优先级来自 fold 方向**——空对象起步，最左的 source 最后说了算
2. **空值和缺省不是一回事**——`null` 在这里等于“用默认”
3. **数组合同是拼接**——覆盖要自己写 merger
4. **递归范围比“看起来像对象”更窄**——plain object 才下钻

## 应用型自测

1. `defu({ a: null }, { a: 1, b: 2 })` 的 `a` 是什么？
2. `defu({ list: ["x"] }, { list: ["y"] })` 得到哪一个数组？
3. ESM 源码里自定义函数合并应该 import 哪个名字？

检查点：

1. `1`。source 的 `null` 被跳过。
2. `["x", "y"]`。用户项在前。
3. `defuFn`（或 `createDefu`），不是源码里的 `defu.fn`。

## 延伸阅读

- 固定源码：[unjs/defu](https://github.com/unjs/defu) —— 本文绑定提交 `80c0146afb11ebd86183a579ec469f3abd976695`
- [[rfdc]] —— 同主题的另一半：拷贝，不合并
- [[ofetch]] —— 同属 unjs；请求 options 合并是另一条链

## 关联

- [[rfdc]] —— 深拷贝工厂，不负责默认值
- [[ofetch]] —— 跨运行时 fetch 包装，配置合并场景相邻
- [[immer]] —— 产出新对象，但走的是草稿更新而不是 defaults fold

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[rfdc]] —— rfdc — 先造拷贝函数再走路的深克隆

- [[rfdc]] —— rfdc — 先造拷贝函数再走路的深克隆
