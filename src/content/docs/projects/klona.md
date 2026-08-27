---
title: klona — 按入口挑选深拷贝能力，而不是一个万能 clone
description: 固定 2.0.6 把 json/lite/default/full 四条递归拷贝写成不同入口
来源: https://github.com/lukeed/klona
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lukeed/klona
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6ad153073b7529769010ddbde1938372e1702f5b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.6
---

## 是什么

klona 是一组按入口分层的深拷贝函数。日常类比：不是一台什么都复印的机器，而是四台专用机——`klona/json` 只复印 JSON 能表达的结构，默认入口再加 Map/Set/二进制，`klona/full` 连 symbol 和非枚举属性一起搬。

```js
import { klona } from "klona"

const copy = klona({ nested: { n: 1 } })
copy.nested.n = 2
// 原对象仍是 1
```

固定 `2.0.6` 声明 `node >= 8`，零生产依赖。四个导出是 `klona/json`、`klona/lite`、`klona`、`klona/full`；类型声明都是同一句 `klona<T>(input: T): T`。

## 为什么重要

不按入口读源码，下面这些合同很容易被“深拷贝”四个字抹平：

- 为什么 `klona/json` 拷完 `Date` 之后，改副本时间也会改到原对象
- 为什么 lite/default 会执行 `new x.constructor()`，`full` 却不调用构造函数
- 为什么 `__proto__` 自有键还在，却没有污染 `Object.prototype`
- 为什么环状对象没有安全副本

## 核心要点

四条实现都是同步递归，没有环检测：

1. **`klona/json`**：只处理 `Array` 和 `toString === '[object Object]'` 的普通对象。原始值、`Date`、`Map`、`Set` 原样返回同一引用。对象键若是 `__proto__`，用 `defineProperty` 写成自有属性。

2. **`klona/lite`**：非 object 直接返回。普通对象若 `constructor !== Object` 且 constructor 是函数，先 `new x.constructor()` 再抄自有可枚举键；否则建 `{}`。另外复制 `Date`（`new Date(+x)`）和 `RegExp`（`source` / `flags` / `lastIndex`）。

3. **默认 `klona`**：在 lite 之上再复制 `Set`、`Map`（key 和 value 都递归）、`DataView`（先拷 `buffer`）、`ArrayBuffer.slice(0)`，以及 `toString` 以 `Array]` 结尾的 TypedArray（`new x.constructor(x)`，避免 `Buffer.slice` 只出视图）。

4. **`klona/full`**：`Object.create(x.__proto__ || null)` 保住原型，再遍历 `getOwnPropertySymbols` 与 `getOwnPropertyNames`。描述符带 getter/setter、不可枚举、或键是 `__proto__` 时走 `defineProperty`。这条路径不调用 class constructor。

`typeof x !== 'object'` 的函数、以及对不上分支的 `WeakMap` 等，都返回原引用。

## 实践示例

### 案例 1：选入口

```js
import { klona as jsonClone } from "klona/json"
import { klona } from "klona"

const stamp = { when: new Date() }
jsonClone(stamp).when === stamp.when // true，同一 Date
klona(stamp).when === stamp.when     // false，新 Date
```

数据只来自 `JSON.parse` 时，`klona/json` 够用。对象里一旦有 Date / Map / typed array，就要换更大的入口。

### 案例 2：自定义 class

```js
class Box {
  constructor(n) { this.n = n }
}
const copy = klona(new Box(1))
copy instanceof Box // lite/default：true，因为 new Box()
```

lite/default 会先跑一遍 constructor（默认参数、副作用都算）。`klona/full` 改用 `Object.create(原型)` 再抄描述符，不 new。constructor 有 I/O 或“只允许 new 一次”的逻辑时，这两条路结果不同。

### 案例 3：`__proto__` 自有键

```js
const input = JSON.parse('{"__proto__":{"a0":true}}')
const output = klona(input)
Object.prototype.a0 // 不是 true
JSON.stringify(output) // 仍含 "__proto__"
```

污染测试要求副本安全，同时 JSON 形态还在。这和 [[destr]] 直接丢掉该键不是同一份合同。

## 踩过的坑

1. **默认入口拷 JSON 就够了**：`klona/json` 遇到 `Date` 不会建新实例。
2. **把 `Object.create(null)` 当成字典克隆**：json/lite/default 会得到普通 `{}`；要保留 null prototype 得用 `full`。
3. **假设能拷环**：四条实现都是无表递归，环会炸栈。
4. **constructor 有副作用还用 lite/default**：`new x.constructor()` 会再执行一遍。
5. **把 readme 的 gzip 体积和 ops/sec 写成当前事实**：固定树有 `/bench`，本文未跑。

## 适用 vs 不适用场景

**适用**：

- 要把一份 POJO / JSON 树变成可独立修改的副本
- 愿意按数据形状挑选 json / lite / default / full
- 能接受“对不上的类型返回原引用”

**不适用**：

- 输入可能有环
- 必须保留 null prototype、symbol、不可枚举属性，却只引入了默认入口
- 需要不可变更新语义——那是 [[immer]] 的草稿模型，不是 clone
- 要把未实测的体积或速度写成选型结论

## 固定版本边界

- 本文绑定 `lukeed/klona@6ad15307...`，包版本 `2.0.6`；npm `gitHead` 与 annotated tag `v2.0.6` 剥开后的提交一致。
- `engines.node` 为 `>= 8`。构建器是 `bundt`；源码在 `src/*.js`，发布物在 `dist/` / `json/` / `lite/` / `full/`。
- 本文未安装依赖、未跑 uvu / bench、未测 gzip，状态保持 `UNVERIFIED`。

## 学到什么

1. **深拷贝的能力边界写在 import 路径上，不写在一个万能函数里。**
2. **“安全”在这里是避免赋值污染原型，不是删除 `__proto__` 键。**
3. **class 副本有两条路：再 new 一次，或 `Object.create` 后抄描述符。**
4. **没写的类型（函数、WeakMap、环）不是“也能拷”，而是原引用或爆炸。**

## 应用型自测

1. `import { klona } from "klona/json"` 之后，`klona({ d: new Date() }).d` 是新 Date 吗？
2. `klona/full` 复制 `class Foo {}` 的实例时，会调用 `Foo` 构造函数吗？
3. 默认 `klona` 碰到对象里的 `__proto__` 自有键，会不会把它删掉？

检查点：

1. 不是。json 入口对 `Date` 返回原引用。
2. 不会。`full` 用 `Object.create(原型)` 再抄描述符。
3. 不会。它用 `defineProperty` 写成自有属性，JSON 形态仍在。

## 延伸阅读

- 固定源码：[lukeed/klona](https://github.com/lukeed/klona) —— 本文绑定提交 `6ad153073b7529769010ddbde1938372e1702f5b`
- 同作者的读写对照：[lukeed/dset](https://github.com/lukeed/dset)、[lukeed/dequal](https://github.com/lukeed/dequal)（未固定 revision）
- [[destr]] —— parse 出对象之后，若要独立副本再交给 klona
- [[immer]] —— 不整树拷贝，用草稿提交变更

## 关联

- [[destr]] —— JSON 入口；和 klona 组成 parse-clone 对
- [[immer]] —— 不可变更新，不是递归 clone
- [[ofetch]] —— 解析响应用 destr，不负责深拷贝
- [[zod]] —— 校验形状，不复制值
- [[valtio]] —— 代理快照，另一条“得到独立结构”的路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[destr]] —— destr — 先认签名再决定要不要 JSON.parse
