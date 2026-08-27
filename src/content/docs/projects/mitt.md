---
title: mitt — 用一张 Map 做完 pub/sub
description: 函数式 factory 返回 all/on/off/emit；wildcard 在同名 handler 之后跑，不提供 once 或多参数。
来源: https://github.com/developit/mitt
日期: 2026-08-27
分类: 基础设施 / 事件总线
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/developit/mitt
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b240473b5707857ba2c6a8e6d707c28d1e39da49
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.1
---

## 是什么

mitt 是一份**函数式**的事件总线。日常类比：它不是“会响铃的对象”，而是给你一本可以外借的通讯录（`Map`）。你把名字写进去，喊名字时它按名单打电话；想听所有电话，就再登记一个叫 `*` 的总机。

```ts
import mitt from "mitt"

type Events = { foo: { id: string }; bar?: undefined }
const emitter = mitt<Events>()
emitter.on("foo", (e) => console.log(e.id))
emitter.on("*", (type, e) => console.log(type, e))
emitter.emit("foo", { id: "1" })
```

`mitt()` 返回 `{ all, on, off, emit }`，方法不靠 `this`。也可以把已有 `Map` 传进去，让几处代码共用同一张表。

## 为什么重要

不读固定 3.0.1 源码，下面这些合同很容易被 “迷你 EventEmitter” 宣传带偏：

- 为什么它看起来像 Node `EventEmitter`，却没有 `once`、没有 `this` context、也不能 `emit('foo', a, b)`
- 为什么 `constructor`、大小写不同的字符串、`symbol` 都能当事件名
- 为什么 `off('foo')` 之后 `all.has('foo')` 仍是 `true`
- 为什么派发期间再 `on` / `off`，本轮已经排队的 handler 不受影响

一句话：它把 pub/sub 收成一张 `Map` 和三次数组操作，而不是 class 协议。

## 核心要点

1. **存储就是公开的 `Map`**：未传入时 `all = new Map()`；传入则复用。`emitter.all.clear()` 能一次清掉全部 type，包括 `*`。

2. **`on` 只 append**：已有数组就 `push`，没有就 `set(type, [handler])`。同一函数登记两次会叫两次。事件名不折叠大小写。

3. **`off` 分两种**：给 handler 时，`splice(indexOf(handler) >>> 0, 1)` 只删第一次匹配；找不到时 `>>> 0` 变成超大下标，数组不变。不给 handler 时，把该 type 写成 `[]`，**不删 key**。

4. **`emit` 先拍照**：`handlers.slice().map(...)` 后再取 `'*'`。wildcard 的参数是 `(type, evt)`。源码注释写明不支持把 `'*'` 当普通事件手动连发。

## 实践示例

### 案例 1：共用一张外部 Map

```ts
import mitt from "mitt"

const all = new Map()
const a = mitt(all)
const b = mitt(all)
const seen: string[] = []
a.on("ping", () => seen.push("a"))
b.emit("ping", undefined)
```

**逐部分解释**：

1. `a` 和 `b` 的 `all` 是同一引用
2. `b.emit` 能叫到 `a.on` 登记的函数
3. 这不是跨实例广播协议，只是共享存储

### 案例 2：wildcard 永远晚于同名 handler

```ts
const order: string[] = []
emitter.on("*", () => order.push("*"))
emitter.on("foo", () => order.push("foo"))
emitter.emit("foo", { id: "1" })
// order === ["foo", "*"]
```

**逐部分解释**：

1. 先跑 `foo` 列表的快照
2. 再跑 `*` 列表的快照
3. wildcard 能看见事件名，同名 handler 看不见

### 案例 3：`off('foo')` 留下空数组

```ts
emitter.on("foo", () => {})
emitter.off("foo")
emitter.all.get("foo") // []
emitter.all.has("foo") // true
emitter.all.clear()
emitter.all.has("foo") // false
```

**逐部分解释**：

1. 无 handler 的 `off` 不是 `delete`
2. 之后再 `on('foo')` 会 `push` 到这张空数组
3. 真要清空整本通讯录，用 `all.clear()`

## 踩过的坑

1. **把 mitt 当 Node EventEmitter 用**：没有 `once`，没有 `emit(type, a, b)`，也没有 listener context。
2. **以为 `off(fn)` 会去掉所有重复登记**：只去掉第一次 `indexOf` 命中。
3. **用 `off('foo')` 判断“已经没这个事件”**：key 还在，只是数组被掏空。
4. **把 README 的 200b / IE9 写成当前事实**：本轮未测量 bundle，也未跑兼容性矩阵。

## 适用 vs 不适用场景

**适用**：

- 浏览器或任意 JS 运行时里要一个无依赖、无 `this` 的 pub/sub
- 需要监听“所有事件”的调试或桥接层
- 愿意自己用 `Map` 做持久化或跨模块共享

**不适用**：

- 需要 `once`、自定义 `this`、多参数 emit，或 Node 风格的 `eventNames` / `listenerCount` → 看 [[eventemitter3]]
- 需要在无人监听 `error` 时自动抛错，或 `prependListener` / `maxListeners`
- 想要经过测量的体积或性能数字——本页没有这些数

## 固定版本边界

- 本文绑定 `developit/mitt@b240473b...`，tag `3.0.1` 与 npm `gitHead` 一致。
- package 无 `engines`；发布物含 CJS / ESM / UMD 与 `index.d.ts`。
- 本文只做静态阅读，没有安装依赖或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **最小事件总线可以是一张 Map**——不必先发明 class 和原型链。
2. **派发要先拷贝名单**——否则 handler 里 `off` 会改正在遍历的数组。
3. **通配符是第二条管道**——它看见 `(type, evt)`，并且总是后跑。
4. **清空语义要看实现**——`off(type)` 与 `all.clear()` 不是同一件事。

## 应用型自测

1. 同一函数 `on('foo', fn)` 两次，再 `emit('foo')`，`fn` 会被叫几次？
2. `off('foo')` 之后，`emitter.all.has('foo')` 是 `true` 还是 `false`？
3. 同时登记 `foo` 与 `*`，`emit('foo', e)` 时 wildcard 的第一个参数是什么？

检查点：

1. 两次。`on` 允许重复登记。
2. `true`。key 留下，值变成 `[]`。
3. `'foo'`。wildcard 收到 `(type, evt)`。

## 延伸阅读

- 仓库：[github.com/developit/mitt](https://github.com/developit/mitt)
- 固定源码：本文绑定提交 `b240473b5707857ba2c6a8e6d707c28d1e39da49`
- [[eventemitter3]] —— 同一问题的 Node 兼容 class 实现
- Node.js `events` —— mitt 故意不覆盖的那组 API

## 关联

- [[eventemitter3]] —— class、`once`、context 与多参数 emit
- [[xstate]] —— 需要状态机时，事件总线只是入口
- [[zustand]] —— UI 状态订阅，不是通用 pub/sub
- [[simple-peer]] —— 握手流程常用 EventEmitter 风格
- [[discord-js]] —— 网关事件的大型 EventEmitter 客户端
