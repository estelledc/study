---
title: unctx — 把当前实例藏进调用栈的组合上下文
description: 固定版本用同步注入、可选 ALS 或编译期 await 改写来恢复上下文
来源: https://github.com/unjs/unctx
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/unctx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6586739a70bd43a67437f72f00c186dd762b5125
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.1
---

## 是什么

unctx 是一个**让 `useX()` 在调用栈里拿到当前实例**的 JS 库。日常类比：图书馆临时把「正在读的那本书」放到柜台上；里面的人不用把书传来传去，伸手就能拿到。走出这段同步代码，柜台就空了。

固定 3.0.1 的 npm 包名是 `unctx`，运行时没有 production 依赖。库作者通常这样写：

```ts
import { createContext } from "unctx"

const ctx = createContext<{ id: string }>()
export const useAwesome = ctx.use

ctx.call({ id: "1" }, () => {
  useAwesome() // { id: "1" }
})
```

用户代码只调用 `useAwesome()`，不接参数。没有上下文时 `use()` 抛错；宽松一点用 `tryUse()`，得到 `null`。

## 为什么重要

不读固定源码，容易把 unctx 说成「Vue 的 provide/inject」或「开了就永远跨 await」：

- 为什么普通 `call()` 在**第一个 await 之后**就丢上下文
- 为什么 `asyncContext: true` 不是默认，缺 `AsyncLocalStorage` 时只警告
- 为什么 `withAsyncContext` 没经过打包插件时只 `console.warn`，函数本身不变
- 为什么默认 transform 不改 `callAsync`，要自己加进 `asyncFunctions`

一句话：unctx 的合同是**同步注入 + 可选 ALS + 可选 await 改写**，三层不要混成一句「自动有上下文」。

## 核心要点

固定 3.0.1 可以把主链拆成四条入口：

1. **同步 `call(instance, cb)`**：写入 `currentInstance`，跑 `cb`，`finally` 在非 singleton 时清掉。不同引用再嵌套 `call` 会抛 `Context conflict`。
2. **`use` / `tryUse`**：先看 ALS store（若启用），再看 `currentInstance`。`use` 遇到 `undefined` 抛 `Context is not available`；`tryUse` 用 `?? null`。
3. **原生异步**：`asyncContext: true` 才 new `AsyncLocalStorage`。实现来自选项、`globalThis.AsyncLocalStorage` 或 `process.getBuiltinModule("node:async_hooks")`。object 实例先包 `WeakRef`；没有 `WeakRef` 的运行时回落强引用。
4. **编译期异步**：`callAsync` 把 leave handler 登记到 `globalThis.__unctx_async_handlers__`。`unctx/plugin` 默认只改名为 `withAsyncContext` 的函数参数，在每个 `await` 外包 `executeAsync`。

`set` / `unset` 是 singleton。`set` 之后可用同一个引用 `call`，换引用仍冲突。`getContext` / `useContext` 走 `globalThis.__unctx__`，用来避开多副本各建一套上下文。

## 实践示例

### 案例 1：同步 call，await 之后柜台是空的

```ts
const ctx = createContext<string>()
await ctx.call("A", async () => {
  ctx.use()          // "A"
  await Promise.resolve()
  ctx.tryUse()       // null —— 固定测试就这样写
})
```

这不是 bug。同步槽位在 `call` 返回到事件循环前就会清掉，避免并发请求共用一个实例。

### 案例 2：要跨 await，显式打开 ALS

```ts
import { AsyncLocalStorage } from "node:async_hooks"
import { createContext } from "unctx"

const ctx = createContext({
  asyncContext: true,
  AsyncLocalStorage,
})

ctx.call("123", () => {
  setTimeout(() => ctx.use(), 100) // ALS 仍然拿得到 "123"
})
```

不传 `AsyncLocalStorage`、运行时也探测不到时，源码只 `console.warn`，不会假装已经跨了异步边界。

### 案例 3：transform 默认不管 callAsync

```ts
import { unctxPlugin } from "unctx/plugin"

unctxPlugin.vite({
  asyncFunctions: ["withAsyncContext", "callAsync"],
})
```

只装插件、不改 `asyncFunctions` 时，`callAsync` 的回调**不会**被改写。`withAsyncContext` 若没被加上 `,1`（transformed 标记），运行时只警告。

## 踩过的坑

1. **把 `call(async fn)` 当成跨 await 可用**：固定测试证明第一个 await 后 `tryUse()` 为 `null`。
2. **以为 `withAsyncContext` 自己会变魔术**：没 transform 时它原样返回函数。
3. **嵌套 `call` 换一份对象**：即使都在同步栈里，不同引用也会 `Context conflict`。
4. **`set` 之后再 `set` 另一份**：同样冲突；要换实例先 `unset` 或 `set(next, true)`。
5. **把 ALS 的 WeakRef 包层说成「实例永远不会被 GC」**：object 走弱引用，正是为了避免 timer 钉死整份 store。

## 适用 vs 不适用场景

**适用**：

- 库要暴露 `useX()`，调用方不想把实例层层往下传
- Node / 支持 ALS 的运行时，并且你显式打开了 `asyncContext`
- 有打包器，愿意为 `withAsyncContext` 装 optional peer

**不适用**：

- 只想按名字通知一串回调——那是 [[hookable]]
- 浏览器里既没有 ALS，也不做 transform，却要在 `setTimeout` / 第一个 await 之后 `use()`
- 需要把静态阅读写成已验证的内存或并发结论

## 固定版本边界

- 本文绑定 `unjs/unctx@6586739a...`，npm 包 `unctx@3.0.1`。
- GitHub tag `v3.0.1` 与 package 版本一致；npm latest 未带 `gitHead`，不猜测打包提交。
- `unplugin` / `magic-string` / `oxc-parser` / `rolldown` 都是 optional peer。
- 本文只做源码静态审查，没有跑 ALS、插件或 transform，状态保持 `UNVERIFIED`。

## 学到什么

1. **隐式上下文默认只活在同步栈**——await 是边界，不是装饰
2. **ALS 和 AST 改写是两条独立逃生口**，默认都没开
3. **冲突是引用相等，不是「同名就行」**
4. **全局 namespace 解决的是多副本，不是并发请求**

## 应用型自测

1. `ctx.call("A", async () => { await 0; return ctx.tryUse() })` 在未开 ALS、未 transform 时返回什么？
2. `ctx.call(obj, () => ctx.call(otherObj, fn))` 且 `obj !== otherObj` 会怎样？
3. 只配置 `unctxPlugin.vite()`，`ctx.callAsync` 里的 `await` 会被包进 `executeAsync` 吗？

检查点：

1. `null`。同步槽位在 await 前已清。
2. 抛 `Context conflict`。
3. 不会。默认 `asyncFunctions` 只有 `withAsyncContext`。

## 延伸阅读

- 文档：[unjs.io/packages/unctx](https://unjs.io/packages/unctx)
- 固定源码：[unjs/unctx](https://github.com/unjs/unctx) —— 本文绑定提交 `6586739a70bd43a67437f72f00c186dd762b5125`
- [[hookable]] —— 互补的命名 hook 表，不保存「当前实例」
- [[nuxt]] —— 典型消费方；本页不审查 Nuxt composable
- [[rolldown]] —— transform 可选的 oxc 入口之一，不是运行时依赖

## 关联

- [[hookable]] —— 通知 vs 注入：一个喊名字，一个藏当前值
- [[nuxt]] —— 上层框架
- [[ofetch]] / [[unstorage]] —— 同生态其他原语
- [[rolldown]] —— `unctx/transform` 可选用它的 `parseSync`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hookable]] —— hookable — 可 await 的顺序 hook 表
