---
title: rfdc — 先造拷贝函数再走路的深克隆
description: 工厂返回 clone，默认不跟环也不抄原型，Date/Map/Set 走精确 constructor
来源: https://github.com/davidmarkclements/rfdc
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/davidmarkclements/rfdc
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 29ea53f8ccc618495b40cfafba475952b62be847
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.4.1
---

## 是什么

rfdc 是 **Really Fast Deep Clone** 的工厂。日常类比：复印店先问你要不要跟环形箭头、要不要把柜门上贴的标签也印进去，然后才给你一台固定设置的复印机。

```js
const clone = require("rfdc")()
clone({ a: 1, b: { c: 2 } })
```

固定 `1.4.1` 里，`require("rfdc")` 本身不拷贝；它返回 clone 函数。`require("rfdc/default")` 才是已经按默认选项做好的那一台。

## 为什么重要

不看工厂和四条分支，容易把“深拷贝”写成一句口号：

- 为什么 `Object.create({ a: 1 })` 默认拷出来是 `{}`
- 为什么环默认会炸，打开 `circles` 又变慢
- 为什么 `new Date()` / `Map` / `Set` 能保住类型，`/foo/` 却变成 `{}`
- 为什么自定义 class 要自己登记，子类不会跟着父类 handler 走

一句话：它是 **按选项编译出来的递归拷贝器**，不是 `structuredClone` 的别名。

## 核心要点

固定 1.4.1 的主链可以拆成五步：

1. **先选实现**：`rfdc(opts)` 若 `circles` 就进 `rfdcCircles`，否则走普通路径；再按 `proto` 在 `clone` / `cloneProto` 里二选一。
2. **叶子直接返回**：`typeof !== "object"` 或 `null` 原样回去。函数因此是引用，不是新闭包。
3. **数组另走 `cloneArray`**：用 `Object.keys` 取下标，再按同一套对象规则递归。
4. **constructor 表**：默认登记 `Date`、`Map`、`Set`。`constructorHandlers` 后写覆盖。匹配必须是 **同一个 constructor**，不是 `instanceof`。
5. **视图和环**：`ArrayBuffer.isView` 走 `copyBuffer`（`Buffer.from` 或 `new ctor(buffer.slice(), byteOffset, length)`）。开了 `circles` 才用 `refs` / `refsNew` 栈回边。

默认 `clone` 用 `hasOwnProperty`，继承属性不进新对象。`proto: true` 把可枚举原型字段抄到对象自己身上，并不挂回原型链。

## 实践示例

### 案例 1：默认工厂 vs 预置入口

```js
const rfdc = require("rfdc")
const clone = rfdc()
const ready = require("rfdc/default")

clone({ a: 1 })
ready({ a: 1 })
```

`default.js` 只是 `require("./index.js")()`。测试把两者对 `Object.create({ a: 1 })` 的结果当成同一条默认合同。

### 案例 2：环必须显式打开

```js
const clone = require("rfdc")({ circles: true })
const o = { nest: { a: 1 } }
o.nest.self = o
const c = clone(o)
c.nest.self === c
```

`refs` 记下源对象，`refsNew` 记下已经造好的副本。默认选项没有这两座栈，readme 写明行为接近 `JSON.stringify` 遇环抛错。本轮没有实际跑这条抛错路径。

### 案例 3：RegExp 要自己登记

```js
const clone = require("rfdc")({
  constructorHandlers: [
    [RegExp, (o) => new RegExp(o)],
  ],
})
clone({ r: /foo/ }).r.test("foo")
```

没有 handler 时，`/foo/` 的 constructor 对不上表，又不是 typed array，最后被当成普通对象掏自有字段，得到 `{}`。子类不会复用父类那一行。

## 踩过的坑

1. **把 `rfdc` 当直接 clone**：漏一层调用，拿到的是工厂。
2. **以为默认会抄原型**：`Object.create({ a: 1 })` 默认是 `{}`；要抄字段请设 `proto: true`。
3. **把 `Error` / `RegExp` 当成保住类型**：它们走“像 `JSON.parse(JSON.stringify(o))`”的兜底。
4. **给基类登记就指望子类生效**：查找是 `Map.get(cur.constructor)`，子类要另写一行。
5. **把 readme 里的毫秒数写成选型结论**：那些数字来自作者机器上的 `npm run bench`，本轮未复测。

## 适用 vs 不适用场景

**适用**：

- Node 服务要把 JSON 形状的对象、数组、`Date` / `Map` / `Set` / Buffer 拷走
- 可以接受工厂先配置、再反复调用
- 需要给 `ObjectId`、`RegExp` 补精确 constructor handler

**不适用**：

- 要合并默认值而不是切断引用——那是 [[defu]]
- 必须保留环，又不能付 `circles` 的跟踪成本
- 需要浏览器 `structuredClone` 那套平台类型（本轮未对照实现）

## 固定版本边界

- 本文绑定 `davidmarkclements/rfdc@29ea53f8...`，lightweight tag `1.4.1`（无 `v` 前缀）与 npm `rfdc@1.4.1` 的 `gitHead` 相同。
- GitHub 另有 `v1.4.0` → `228fc35b...`，比本提交落后 2 个 commit：constructorHandlers 类型和 version bump。
- 无运行时依赖，无 `engines` 字段，导出是 CJS `index.js` 与 `./default`。
- 本文未跑 tap / standard / benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **选项在工厂里固化**——`circles` / `proto` 不是每次调用再选
2. **默认合同更像 JSON 加白名单**——Date/Map/Set/Buffer 是登记出来的，不是万能
3. **环是付费功能**——不跟踪就不要喂环
4. **原型字段默认扔掉**——`proto: true` 也只是抄到对象自身

## 应用型自测

1. `require("rfdc")({ proto: false })(Object.create({ a: 1 })).a` 是什么？
2. 默认 clone 遇到自己指向自己的对象，会不会自动保环？
3. 只给 `Foo` 写 handler 时，`class Bar extends Foo {}` 的实例会走这条 handler 吗？

检查点：

1. `undefined`。默认不抄继承属性。
2. 不会。要设 `circles: true`。
3. 不会。只认精确 constructor。

## 延伸阅读

- 固定源码：[davidmarkclements/rfdc](https://github.com/davidmarkclements/rfdc) —— 本文绑定提交 `29ea53f8ccc618495b40cfafba475952b62be847`
- [[defu]] —— 同主题的另一半：合并默认值，不切断引用
- [[immer]] —— 也产出新对象，但入口是草稿更新

## 关联

- [[defu]] —— 递归 defaults，不是 clone
- [[immer]] —— 不可变更新，不是通用深拷贝
- [[ofetch]] —— 需要拷请求快照时，克隆合同要另选库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[defu]] —— defu — 最左优先的递归默认值合并

- [[defu]] —— defu — 最左优先的递归默认值合并
