---
title: hookable — 可 await 的顺序 hook 表
description: 固定版本把 hook 登记成数组，callHook 按 thenable 串行往下走
来源: https://github.com/unjs/hookable
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/hookable
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b77477c027039362ee0ec4f39b8998c4f1b21707
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.1.1
---

## 是什么

hookable 是一个**把命名回调收进数组、再按名字调用**的 JS 库。日常类比：前台有一叠便条，每张写着同一件事的处理人；你喊「hello」，前台按叠好的顺序挨个打电话，谁回了 Promise 就等谁讲完再打下一个。

固定 6.1.1 的 npm 包名是 `hookable`，无 production 依赖，单一 ESM 入口。常见写法：

```ts
import { Hookable } from "hookable"

const hooks = new Hookable()
hooks.hook("hello", () => console.log("hi"))
await hooks.callHook("hello")
```

`createHooks()` 只是 `new Hookable()`。只要 `hook` / `callHook`、不要 deprecate 和 spy 时，可以用更瘦的 `HookableCore`。

## 为什么重要

不读固定源码，容易把 hookable 说成「Nuxt 专用」或「并行事件总线」：

- 为什么默认 `callHook` 是**顺序**，并行要另走 `callHookParallel`
- 为什么跨 realm 的 thenable（例如 vm / jiti）也能被等住
- 为什么一个回调抛错会让整个 `callHook` reject，而不是吞进全局 `error` hook
- 为什么 `addHooks({ test: { before } })` 实际登记的名字是 `test:before`

一句话：hookable 的合同是**命名数组 + 串行 thenable**，不是发布订阅的广播网。

## 核心要点

固定 6.1.1 的主链可以拆成五步：

1. **登记**：`hook(name, fn)` 把函数推进 `_hooks[name]`，返回 unregister。空 name 或非函数直接返回空函数。
2. **展平**：`addHooks` 先 `flatHooks`，嵌套对象用 `parent:key` 拼名字。
3. **调用**：`callHook` 把当前数组**拷贝**一份，交给 `serialTaskCaller` → `callHooks`。
4. **thenable 判定**：返回值有 `.then` 就 `Promise.resolve` 再接下一个；同步值继续 for 循环。同步抛错变成 `Promise.reject`。
5. **旁路**：`beforeEach` / `afterEach` 是同步 spy；`callHookParallel` 才 `Promise.all`。

`hookOnce` 会先卸掉包装器，再调用原函数。`mergeHooks` 是独立导出，不是实例方法。构造函数不再接收 logger；弃用提示走 `console.warn`。

## 实践示例

### 案例 1：顺序调用，错误会冒出来

```ts
import { createHooks } from "hookable"

const hooks = createHooks()
hooks.hook("ready", () => { throw new Error("boom") })
await hooks.callHook("ready") // reject，不会被吃掉
```

v5 之前，回调抛错曾被收进全局 `error` hook 并且 `callHook` 仍 resolve。固定 6.1.1 不再这样做。

### 案例 2：嵌套对象一次登记

```ts
const remove = hooks.addHooks({
  test: {
    before: () => {},
    after: () => {},
  },
})
// 实际键是 test:before 与 test:after
remove()
```

`flatHooks` 只把函数写进扁平表；中间对象不会自己变成 hook。

### 案例 3：并行是另一条入口

```ts
await hooks.callHookParallel("ready", payload)
```

空列表直接返回 `undefined`，不会变成空的 `Promise.all`。需要自定义调度时用 `callHookWith(caller, name, args)`。

## 踩过的坑

1. **把 `callHook` 写成并行广播**：默认是串行；并行必须显式 `callHookParallel`。
2. **用 `instanceof Promise` 理解等待条件**：6.1.1 用 thenable 检查，专门覆盖跨 realm Promise。
3. **以为构造函数还能传 consola**：logger 参数已删除。
4. **把 `Hookable.mergeHooks` 当实例方法**：现为独立 `{ mergeHooks }` 导出。
5. **把下载量、bundle 或「比 tapable 快」写进结论**：本轮没有测。

## 适用 vs 不适用场景

**适用**：

- 库作者要给用户挂命名生命周期，并愿意按登记顺序 await
- 需要 unregister、once、deprecate 别名或同步 spy
- 能接受「一个回调失败，整次 `callHook` 失败」

**不适用**：

- 需要保证并行、有预算的 fan-out（那是 `callHookParallel` 或自写 caller）
- 需要跨 await 自动恢复的隐式上下文——那是 [[unctx]]
- 想把静态阅读写成已验证的性能结论

## 固定版本边界

- 本文绑定 `unjs/hookable@b77477c0...`，npm 包 `hookable@6.1.1`。
- GitHub tag `v6.1.1` 与 npm `gitHead` 指向同一提交。
- 无 production 依赖；条件导出只有 `"."`。
- 本文只做源码静态审查，没有安装依赖或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **hook 表是数组，不是总线**——同名回调按 push 顺序走
2. **等待条件是 thenable，不是 Promise 品牌**
3. **失败是调用方的问题**：v5 之后 `callHook` 会 reject
4. **Core 和完整类不是同一张卡片**：只要登记/调用时用 `HookableCore`

## 应用型自测

1. 两个 `ready` 回调都是同步函数时，`callHook("ready")` 一定返回 Promise 吗？
2. 第一个回调 `throw`，后面的回调还会跑吗？
3. `addHooks({ app: { ready } })` 登记的 hook 名是什么？

检查点：

1. 不一定。全是同步且不抛错时，`callHooks` 走完 for 循环后返回 `void`。
2. 不会。同步抛错立刻 `Promise.reject`，后续下标不再进入。
3. `app:ready`。`flatHooks` 用冒号拼接。

## 延伸阅读

- 文档：[unjs.io/packages/hookable](https://unjs.io/packages/hookable)
- 固定源码：[unjs/hookable](https://github.com/unjs/hookable) —— 本文绑定提交 `b77477c027039362ee0ec4f39b8998c4f1b21707`
- [[unctx]] —— 互补的隐式上下文，不是 hook 表
- [[nuxt]] —— 历史上抽出这套 hook 的框架；本页不审查 Nuxt
- [[ofetch]] —— 同属 unjs，但合同是 HTTP wrapper

## 关联

- [[unctx]] —— hook 是「喊名字」，context 是「当前这一层能 use 到什么」
- [[nuxt]] —— 上层框架，不是本库运行时
- [[ofetch]] —— 另一块 unjs 基础设施
- [[unstorage]] —— 同生态的 KV 门面

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[unctx]] —— unctx — 把当前实例藏进调用栈的组合上下文
