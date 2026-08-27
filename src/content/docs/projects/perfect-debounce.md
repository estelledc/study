---
title: perfect-debounce — 把多次调用收成一份 Promise
description: UnJS 的 Promise debounce：同窗调用共享一次执行结果，并区分 in-flight 补跑与 lodash 式 trailing。
来源: https://github.com/unjs/perfect-debounce
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/perfect-debounce
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d3f83001dad6faa2090bd1aadab7312843fe6b79
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.0
---

## 是什么

perfect-debounce 是 UnJS 的一个单函数库：把“短时间内连点多次”收成一次异步执行，并把所有等待者接到**同一份 Promise**。日常类比：电梯门要再等 25ms 才关；这期间进来的人共用这一趟，不会每人叫一辆电梯。

```ts
import { debounce } from "perfect-debounce"

const save = debounce(async (text: string) => persist(text), 100)
const a = save("hello")
const b = save("hello!")
// a 与 b 是同一趟：都等到最后一次参数跑完
```

固定 `2.1.0` 只导出 `debounce`，没有 throttle。默认等待 25ms，`trailing: true`，`leading: false`。包是 ESM、`sideEffects: false`、零运行时依赖。

## 为什么重要

不读这份实现，下面这些事会对不上：

- 为什么连打 5 次得到的是 5 个相同结果，而不是 5 次独立调用
- 为什么 `trailing: false` 并不等于 lodash 的“不要尾随触发”
- 为什么函数还在跑时，新的调用既不排队成第二次，也不立刻开新 timer
- 为什么 `cancel()` 之后，已经发出去的 Promise 可能永远不 settle
- 为什么它和 [[throttle-debounce]] 不能按同名 API 互换

## 核心要点

固定版本可以拆成四层：

1. **调用方拿到 Promise，不是同步返回值**：`debounce(fn, wait?, options?)` 返回的函数本身再返回 `Promise<ReturnT>`。同一次等待窗口里，后到的调用把 `resolve` 推进 `resolveList`，timer 到点后大家拿到同一次 `applyFn` 的结果。

2. **进行中的 Promise 会挡住新的执行**：`applyFn` 把 `currentPromise` 设成 `fn.apply(...)`。只要它还在，后续调用直接 `return currentPromise`，同时把参数记到 `trailingArgs`。这是 README 说的“避免重复调用”。

3. **`trailing` 管的是补跑，不是安静期那一下**：默认 `trailing: true`。`currentPromise.finally` 里若还有 `trailingArgs` 且 timer 已空，会再跑一次。把 `trailing` 设成 `false` 只关掉这步补跑；安静期结束时，`leading: false` 仍然会用最后一次闭包里的 `args` 调用 `applyFn`。

4. **控制方法合同很窄**：`isPending()` 是 `!!timeout`，不管 Promise 还在不在跑。`cancel()` 清 timer、`resolveList` 和 `trailingArgs`。`flush()` 是箭头函数，且只在“有 trailing 参数、没有 currentPromise”时立刻 `applyFn`。

## 实践示例

### 案例 1：同窗多次调用共享最后一次结果

```ts
const run = debounce(async (n: number) => n, 100)
const results = await Promise.all([1, 2, 3, 4, 5].map((n) => run(n)))
// 固定测试：results 全是 5，fn 只跑 1 次
```

**逐部分解释**：每次 `run` 都 `clearTimeout` 再设 100ms。timer 触发时用的是最后一次调用闭包里的 `args`，再把这个 Promise 分给 `resolveList` 里所有人。

### 案例 2：leading 先跑第一次，后面的人复用那一趟

```ts
const run = debounce(async (n: number) => n, 100, { leading: true })
const results = await Promise.all([1, 2, 3, 4].map((n) => run(n)))
// 固定测试：results 全是 1，fn 只跑 1 次
```

第一次没有 timer，`shouldCallNow` 为真，立刻 `applyFn`。窗口内后来的人进 `resolveList`；timer 到点后分发的是 `leadingValue`，不是新的 `applyFn`。

### 案例 3：flush 与 cancel

```ts
const fn = debounce(async (n: number) => n * 2, 100)
fn(1); fn(2); fn(3)
const flushed = await fn.flush() // 6，且 fn 只以 3 调用一次
fn(9)
fn.cancel()
// cancel 后 timer 没了；已挂起却未进 resolveList 的调用不会再跑
```

`flush` 先清 timer。若此刻已有 `currentPromise`，它直接返回 `undefined`，不会插队。

## 踩过的坑

1. **按 lodash.debounce 去想 `trailing`**：这里的 `trailing: false` 不禁止“等安静了再跑最后一次”，只禁止“上一次 Promise 还没结束时记下参数、结束后再补跑”。
2. **把 `isPending()` 当成“函数还在执行”**：timer 已触发、`fn` 仍在 await 时，`isPending()` 是 `false`。
3. **`cancel()` 当 abort**：它不 reject 已发出的 Promise，只是不再 resolve 它们。调用方若一直 `await`，会挂住。
4. **以为有 throttle**：固定版本没有这个导出。要限频而不是合并成一趟，看 [[throttle-debounce]]。
5. **把 README 的 bundle / 下载量写成你的产物保证**：本文不绑定体积或安装量。

## 适用 vs 不适用场景

**适用**：

- 需要把搜索框、autosave、按钮连点收成一次异步工作，并且调用方都要拿到那一次的返回值
- 已经接受 ESM，不需要 CJS / UMD 入口
- 能接受“进行中的调用会吞掉窗口内的新执行”

**不适用**：

- 要在间隔内周期性触发（throttle），而不是合并成一次
- 要同步函数、要保留每一次调用的独立返回值
- 要把未实测的耗时或包体积写成选型结论
- 调用方不能容忍 `cancel()` 造成的未结算 Promise

## 固定版本边界

- 本文绑定 `unjs/perfect-debounce@d3f83001...`，包版本 `2.1.0`。annotated tag `v2.1.0` 剥开后与 npm `gitHead` 相同。
- `origin/main` 在此提交之后还有依赖更新，不在本文范围内。
- 源码声明基于 [sindresorhus/p-debounce](https://github.com/sindresorhus/p-debounce)；本页不审查那个仓库。
- 本文未安装依赖、未跑 vitest、未测 timer 精度或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **Promise debounce 的合同是“共享结果”，不是“少调用几次同步函数”**。
2. **进行中的 Promise 是第二道闸**——timer 只是第一道。
3. **选项名字不能跨库搬**——这里的 `trailing` 对齐的是 in-flight 补跑。
4. **取消路径必须交代 Promise 的命运**——`cancel` 清队列，不 complement reject。

## 应用型自测

1. 默认选项下连续 `debounced(1)` … `debounced(5)`，五个 Promise 会得到不同值吗？
2. `trailing: false` 时，安静期结束还会不会调用 `fn`？
3. `fn` 还在 await、timer 已经触发之后，`isPending()` 是 true 吗？

检查点：

1. 不会。同窗调用共享最后一次执行的结果。
2. 会。`trailing: false` 只关掉 in-flight 结束后的补跑。
3. 不是。`isPending()` 只看 timer。

## 延伸阅读

- 文档：[unjs.io/packages/perfect-debounce](https://unjs.io/packages/perfect-debounce)
- 固定源码：[unjs/perfect-debounce](https://github.com/unjs/perfect-debounce) —— 本文绑定提交 `d3f83001dad6faa2090bd1aadab7312843fe6b79`
- [[throttle-debounce]] —— 同步、参数顺序相反、debounce 建立在 throttle 上
- [[ofetch]] —— 同属 UnJS；本页不审查它的请求重试

## 关联

- [[throttle-debounce]] —— 同步 throttle/debounce，API 形状不同
- [[ofetch]] —— UnJS 家族里的 HTTP 包装，合同无关

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
