---
title: eventemitter3 — 把 Node 事件口收成可带 context 的 class
description: 单监听器存 EE 对象、多个改数组；once 在调用前摘掉，removeListener 会删掉所有匹配项。
来源: https://github.com/primus/eventemitter3
日期: 2026-08-27
分类: 基础设施 / 事件总线
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/primus/eventemitter3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b0144e940ace8add8f335a8adfbed9284eb419f3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.4
---

## 是什么

eventemitter3 是一份**刻意贴近 Node `EventEmitter`** 的 class。日常类比：它是会按名单喊人的班长。名单不放在普通对象上，以免踩到 `toString` 这类祖传字段；每个人进名单时还记下“替谁喊”（`context`）和“只喊一次吗”（`once`）。

```js
import EventEmitter from "eventemitter3"

const ee = new EventEmitter()
const ctx = { name: "desk" }
ee.on("ready", function (n) {
  console.log(this.name, n)
}, ctx)
ee.emit("ready", 1)
```

固定 5.0.4 同时提供 CJS `index.js` 与 ESM `index.mjs`；后者只是再导出前者。类型允许把事件图写成对象，值为参数元组或 handler 签名。

## 为什么重要

不读固定源码，下面这些“兼容 Node”的说法会对不上：

- 为什么它能当 drop-in，却没有 `newListener`、`prependListener`、`setMaxListeners`，也不会在没人听 `error` 时抛错
- 为什么 `on(fn, context)` 能替代 `fn.bind`，以及默认 `this` 到底是谁
- 为什么 `removeListener(event, fn)` 会去掉**所有**相同函数，而不是只去掉第一个
- 为什么单个监听器不是数组，一旦有第二个才升级成数组

一句话：它兼容日常 `on` / `once` / `emit` / `off`，但存储和删除规则是自己的。

## 核心要点

1. **存储避开 `Object.prototype`**：`Events` 在支持时 `Object.create(null)`。若实例仍能读到 `__proto__`，就给事件名加 `'~'` 前缀。静态字段 `EventEmitter.prefixed` 暴露当前策略。

2. **监听器是 `EE` 记录**：`{ fn, context, once }`。没有该事件时直接存对象，并 `_eventsCount++`；已有单个对象再来一个，就改成数组。`fn` 不是函数会抛 `TypeError`。

3. **`emit` 先摘 `once` 再调用**：返回值表示当时有没有监听器。0–5 个额外参数走 `call`，更多参数才 `apply`。默认 context 是 emitter 自己。

4. **删除按匹配集，不是按次数**：`removeListener(event)` 清空该事件。带 `fn` 时，所有 fn/context/once 对得上的记录都会走；`off` 是它的别名。

## 实践示例

### 案例 1：context 取代 bind

```js
const ee = new EventEmitter()
const view = { label: "panel" }
function paint(color) {
  return this.label + ":" + color
}
ee.on("paint", paint, view)
ee.emit("paint", "red")
ee.removeListener("paint", paint, view)
```

**逐部分解释**：

1. 第三个参数写入 `EE.context`
2. `emit` 用 `fn.call(context, ...)`
3. 删除时也要带同一 context，否则可能留下别的登记

### 案例 2：`once` 在调用前就摘掉

```js
const ee = new EventEmitter()
let n = 0
ee.once("tick", function () {
  n += 1
  ee.emit("tick")
})
ee.emit("tick")
```

**逐部分解释**：

1. 进入 handler 前 `removeListener(..., once=true)` 已执行
2. handler 里再 `emit` 找不到监听器，返回 `false`
3. `n` 只会加一次

### 案例 3：同函数登记两次，一次 `off` 全删

```js
const ee = new EventEmitter()
const fn = () => {}
ee.on("foo", fn)
ee.on("foo", fn)
ee.listeners("foo").length // 2
ee.off("foo", fn)
ee.listenerCount("foo") // 0
```

**逐部分解释**：

1. 两个 `EE` 记录的 `fn` 相同
2. `removeListener` 扫描数组，匹配项全部丢弃
3. 这和 [[mitt]] 的“只 splice 第一次”相反

## 踩过的坑

1. **指望无人监听的 `error` 会抛错**：固定实现直接 `return false`，没有 Node 那条自动 throw。
2. **以为 `off(fn)` 只去掉一个副本**：所有匹配的 `fn`（再加可选 context/once）一起消失。
3. **用 `fn.bind(ctx)` 再 `off(fn)`**：登记的是 bind 出来的新函数，原 `fn` 对不上。应走第三参数 `context`。
4. **把 README 的 “fastest” 写成测量结论**：本轮未跑 `benchmarks/`，也未对比 Node 核心 `events`。

## 适用 vs 不适用场景

**适用**：

- 已经按 Node `EventEmitter` 写 `on` / `once` / `emit`，需要浏览器或无 Domain 环境
- 想用 context 参数避免 `bind`，并接受“删除按匹配集”
- 需要 `eventNames` / `listeners` / `listenerCount`

**不适用**：

- 只要一张 `Map` 加 wildcard `*`，不要 class 和 `this` → 看 [[mitt]]
- 依赖 `newListener` 元事件、`prependListener` 或 `setMaxListeners`
- 需要经过复现的性能数字——本页没有

## 固定版本边界

- 本文绑定 `primus/eventemitter3@b0144e94...`，tag `5.0.4` 与 npm `gitHead` 一致。
- package 无 `engines`；`index.mjs` 再导出 `index.js`。
- 与 Node 核心的差异以 README 与源码为准：无 Domain、无 `error` 自动抛、无元事件、无 max/prepend API。
- 本文只做静态阅读，没有安装依赖或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **兼容 API 不等于同一套存储**——单个 `EE` 对象与数组是两种形态。
2. **`once` 必须先摘后叫**——否则嵌套 `emit` 会把一次性监听变成多次。
3. **context 是一等参数**——它同时参与调用和删除。
4. **删除策略要写进合同**——“所有匹配”和“第一次匹配”会改变重复登记的寿命。

## 应用型自测

1. `ee.emit('ghost')` 在没有监听器时返回什么？会不会抛错？
2. 同一个 `fn` `on` 两次后调用 `off(event, fn)`，还剩几个监听器？
3. `once` handler 里再次 `emit` 同一事件，handler 会再跑吗？

检查点：

1. 返回 `false`，不抛错。
2. 0 个。匹配的 `fn` 全部删除。
3. 不会。调用前已被 `removeListener(..., true)` 摘掉。

## 延伸阅读

- 仓库：[github.com/primus/eventemitter3](https://github.com/primus/eventemitter3)
- 固定源码：本文绑定提交 `b0144e940ace8add8f335a8adfbed9284eb419f3`
- Node.js `events` 文档：对照被故意拿掉的 API
- [[mitt]] —— 函数式、Map、wildcard 的另一端

## 关联

- [[mitt]] —— 无 class、无 once、有 `*`
- [[simple-peer]] —— 握手状态机常用这组 `on`/`emit`
- [[discord-js]] —— 大型网关客户端的 EventEmitter 风格
- [[matrix-js-sdk]] —— 用事件把 SDK 和 UI 解开
- [[xstate]] —— 事件要进状态机，而不是停在总线
