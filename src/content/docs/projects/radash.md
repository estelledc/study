---
title: radash — 单桶导出的函数工具集，map 是顺序 await
description: try 返回元组；debounce 选项在前；get 只拆字符串路径
来源: https://github.com/sodiray/radash
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sodiray/radash
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4cab1900d08e0997abc4f17aec3cbfe18958d766
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 12.1.1
---

## 是什么

radash（读 `/raw-dash/`）是一个单入口的 TypeScript 函数工具库。日常类比：一个布袋里装着 `map`、`try`、`fork`、`get`，你一次 `import * as _ from "radash"` 全倒出来，而不是按「数组盒 / 对象盒」分货架。

```ts
import { fork, tryit as try } from "radash"

const [norse, others] = fork(gods, g => g.culture === "norse")
const [err, user] = await try(loadUser)(id)
```

固定 `12.1.1` 只有 `dist/esm` 与 `dist/cjs` 两条 `exports`，`"sideEffects": false`。源码按 `array.ts` / `async.ts` / `object.ts` / `curry.ts` 分文件，但对使用者仍是一个桶。

## 为什么重要

不读 `async.ts` 和 `curry.ts`，README 的厨房水槽会把三件事写错：

- 为什么 `await map(items, async fn)` 是**一条一条等**，不是一起飞
- 为什么 `get(obj, path)` 只接受字符串，README 里的函数路径对不上源码
- 为什么 `debounce({ delay }, fn)` 选项在前，而且 `cancel()` 之后再调用会立刻执行

一句话：它卖的是 **短名字 + 异步控制流**，不是 lodash 兼容层。

## 核心要点

固定 12.1.1 的主链可以拆成五步：

1. **单桶具名导出**：`src/index.ts` 把 array / async / curry / object 等再导出。`tryit` 同时叫 `try` 和 `tryit`。
2. **`map` 顺序等待**：`for (const value of array) { result.push(await asyncMapFunc(value, index++)) }`。要限并发，用 `parallel(limit, array, func)`；它用若干 worker `pop` 任务，结束再按原 index 排序，有错误则抛自研 `AggregateError`。
3. **`tryit` 折错误**：同步走 `try/catch`，Promise 再 `.then/.catch`，形状永远是 `[err, value]`。
4. **`get` / `set` 吃字符串路径**：`path.split(/[\.\[\]]/g)`，例如 `friends[0].name`。`set` 先 `clone` 再改副本。
5. **`debounce({ delay }, func)`**：选项对象在前。`cancel()` 只把 `active` 置 false，**不清 timer**；取消后的新调用走 `else` 分支，立刻执行 `func`。

`clone` 是浅拷：primitive 原样返回，函数 `bind({})`，其余 `new constructor()` 再抄自有属性。`assign` 只对子对象递归，右边覆盖左边。`max` / `min` 带 getter 时返回**原元素**，不是数字。

## 实践示例

### 案例 1：顺序 map，不是并行

```ts
import { map, parallel } from "radash"

await map(ids, async id => fetchUser(id))
await parallel(3, ids, async id => fetchUser(id))
```

`map` 里每一轮 `await`。README 的 `await _.map(gods, async ...)` 看起来像并发，源码不是。要同时跑、又限 3 个，用 `parallel`。

### 案例 2：try 折成元组

```ts
import { tryit } from "radash"

const [err, god] = await tryit(api.gods.findByName)(name)
if (err) return
```

`tryit(fn)` 先返回包装函数，再调用。成功是 `[undefined, value]`，失败是 `[error, undefined]`。

### 案例 3：字符串 get，以及 fork

```ts
import { get, fork } from "radash"

get({ friends: [{ name: "Ra" }] }, "friends[0].name")
// "Ra"

const [hi, lo] = fork(
  [{ rank: 100 }, { rank: 12 }],
  g => g.rank >= 90,
)
```

`fork` 返回 `[condition 为真, 为假]`。`get` 的第二参必须是字符串。

## 踩过的坑

1. **把 `map` 当 `Promise.all`**：它是顺序异步。
2. **照 README 把函数传给 `get`**：固定源码会对 `path` 调用 `.split`，函数没有这个方法。
3. **按 lodash 顺序写 `debounce(fn, 300)`**：这里是 `debounce({ delay: 300 }, fn)`。
4. **以为 `cancel()` 等于清掉待执行**：它禁止后续防抖调度；已排队的 timer 仍在，只是回调里看到 `active === false` 就不再跑；取消后再调用会立即执行。
5. **把 `clone` 当深拷**：嵌套对象还是共享引用。

## 适用 vs 不适用场景

**适用**：

- 想要 `try` / `parallel` / `fork` / `objectify` 这类短控制流名字
- 接受一个桶导入，并自己 tree-shake 具名导出
- 路径取值用字符串，不需要 lodash `get` 的 iteratee 形态

**不适用**：

- 要 lodash 同款 `chunk('', 0)` 语义 → [[es-toolkit]] 的 compat，而不是本库
- 默认并行的 async map
- 需要 `AbortSignal` 取消 debounce / delay → 固定源码没有这条选项

## 固定版本边界

- 本文绑定 `sodiray/radash@4cab1900d08e0997abc4f17aec3cbfe18958d766`。GitHub tag `v12.1.1` 与 npm `radash@12.1.1` 的 `gitHead` 都指向它。
- GitHub 当前仓库是 `sodiray/radash`；`rayepps/radash` 会重定向。仓内 `package.json` 的 `repository.url` 仍写 `rayepps/radash`。
- 未安装依赖、未跑 jest / rollup，状态保持 `UNVERIFIED`。

## 学到什么

1. **异步 map 的默认值是顺序**：名字像 lodash，控制流不是
2. **错误通道可以是元组**：`tryit` 把 throw 折成 `[err, value]`
3. **README 厨房水槽会过期**：以函数签名为准
4. **debounce 的取消语义要读实现**：清标志和清 timer 不是一回事

## 应用型自测

1. `await map([1, 2, 3], async n => n)` 会不会三个 mapper 重叠执行？
2. `get({ a: { b: 1 } }, x => x.a.b)` 在固定源码里会怎样？
3. `debounce({ delay: 200 }, fn)` 调用 `cancel()` 之后立刻再调用，`fn` 会不会马上跑？

检查点：

1. 不会。每次 `await` 之后才进入下一个。
2. 会失败：`path.split` 要求字符串。
3. 会。`active === false` 时走立即执行分支。

## 延伸阅读

- 文档：[radash-docs.vercel.app](https://radash-docs.vercel.app)
- 固定源码：[sodiray/radash](https://github.com/sodiray/radash) —— 本文绑定 `4cab1900d08e0997abc4f17aec3cbfe18958d766`
- [[es-toolkit]] —— 分类子路径 + 可选 lodash compat
- [[immer]] —— 不可变更新，不是通用 util 抽屉

## 关联

- [[es-toolkit]] —— 同赛道；入口拆分和 debounce 合同都不同
- [[immer]] —— 草稿式更新，不提供 `try` / `parallel`
- [[date-fns]] —— 同样强调具名纯函数，但是日期域

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
