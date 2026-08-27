---
title: superjson — 把 JSON 不够用的值写进 meta 注解
description: 用 json 加 meta values 携带 Date、Map、Set 和 class，而不是改 JSON 语法本身。
来源: https://github.com/ravionhq/superjson
日期: 2026-08-27
分类: 基础设施 / 序列化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ravionhq/superjson
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4e708c11b8ae510008c42fbc445ff0e0e683417e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.2.5
---

## 是什么

superjson 是一份**仍然输出 JSON** 的值编解码器。日常类比：快递单本身还是标准表格（`json`），不能填进格子的东西写在背面批注（`meta.values`）——收件方先看表格，再按批注把 `Date`、`Map`、`Set` 或注册过的 class 还原。

```ts
import { serialize, deserialize } from "superjson"
const payload = serialize({ when: new Date("2026-08-27T00:00:00.000Z") })
// payload.json.when 是 ISO 字符串；payload.meta.values 标明这条是 Date
const again = deserialize(payload)
```

`stringify` / `parse` 只是在这对外再包一层 `JSON.stringify` / `JSON.parse`。固定源码同时提供默认单例和可自带 registry 的 `new SuperJSON()`。

## 为什么重要

不理解这层「JSON 本体 + 路径注解」，下面这些事会对不上：

- 为什么 [[trpc]] transformer 能过 `Date` / `undefined`，却仍是 HTTP JSON
- 为什么同一份对象出现两次时，默认会保留两份值，只有 `dedupe: true` 才把后到的写成 `null`
- 为什么自定义 class 必须先 `registerClass`，而且还原时**不会跑构造函数**
- 为什么 `__proto__` 这类键不是被静默丢掉，而是直接抛错

一句话：它补的是 JSON 的类型空洞，不是另发明一种二进制格式。

## 核心要点

1. **主链是 walker → annotation → 再应用**：`serialize()` 深度走树，把能变的值换成 JSON 友好形态，并在 `meta.values` 记下类型；`deserialize()` 再按路径 `untransform`。写出 `meta` 时会带 `meta.v = 1`，旧 payload 的 `v < 1` 走 legacy 路径解析。

2. **内置类型是白名单，不是「凡是对象都懂」**：`undefined`、`bigint`、合法 `Date`、`Error`、`RegExp`、`Set`、`Map`、`NaN` / `±Infinity` / `-0`、`URL` 和 typed array 有规则。`DataView` 与 `ArrayBuffer` 不在这份名单里；无效 `Date` 也不当 Date。

3. **注册表挂在实例上**：class / symbol / custom transformer 都查对应 registry。静态 `SuperJSON.serialize` 绑定默认单例，所以 `new SuperJSON().registerClass(Foo)` 不会影响 `serialize(foo)`。class 还原是 `Object.assign(Object.create(prototype), props)`。

4. **安全与别名是显式合同**：walker 碰到 `__proto__` / `constructor` / `prototype` 键就抛错。循环引用写成 `null`。`dedupe: true` 时，后续相同引用也变成 `null`，再靠 `meta.referentialEqualities` 接回去。

## 实践示例

### 案例 1：默认单例 vs 自管实例

```ts
import SuperJSON, { serialize } from "superjson"
class Money { constructor(public cents: number) {} }
const local = new SuperJSON()
local.registerClass(Money)
const encoded = local.serialize(new Money(199))
serialize(new Money(199)) // 默认单例没登记 Money，只会当普通对象走
```

**逐部分解释**：

1. 实例 `serialize` 才能看到这份 `classRegistry`
2. 还原用原型贴属性，`new Money(...)` 不会被调用
3. 需要限制字段时用 `registerClass(Money, { allowProps: ["cents"] })`

### 案例 2：`parse` 会改写 JSON.parse 的结果

```ts
import { stringify, parse } from "superjson"
const text = stringify({ flag: undefined })
const value = parse(text)
```

**逐部分解释**：

1. `undefined` 先变成 JSON 里的 `null`，注解写成 `'undefined'`
2. `parse` 以 `inPlace: true` 调用 `deserialize`，不再 `copy-anything`
3. 自己先 `JSON.parse` 再 `deserialize` 且不传 `inPlace` 时，才会得到拷贝

### 案例 3：Error 默认丢掉 stack

```ts
import SuperJSON from "superjson"
const s = new SuperJSON()
s.allowErrorProps("stack")
const again = s.deserialize(s.serialize(new Error("boom")))
```

**逐部分解释**：

1. 未允许时只带 `name` / `message` / `cause`
2. `stack` 必须先进入 `allowedErrorProps`
3. 反序列化是 `new Error(message, { cause })`，再写回允许字段

## 踩过的坑

1. **把静态 API 和实例 registry 当成同一份表**：页面级 `registerClass` 对 `import { serialize }` 无效。
2. **以为任意 class / DataView 都能往返**：未注册 class 还原会抛；`ArrayBuffer` / `DataView` 没有内置规则。
3. **忽略 `parse` 的 in-place**：把 `JSON.parse` 结果交给 `parse` 语义的路径时，原对象会被改。
4. **把 npm `2.2.6` 当成这份源码**：registry 最新包的 `gitHead` 在 canonical remote 不可达，本文只绑定 `2.2.5`。

## 适用 vs 不适用场景

**适用**：

- 需要在 JSON 通道里携带 `Date` / `Map` / `Set` / `undefined` 的 RPC 或 SSR 脱水，例如 [[trpc]] transformer
- 调用方能接受「先登记 class，再两边共用同一 registry」
- 想继续用标准 `JSON.stringify` 做传输，而不是换二进制格式

**不适用**：

- 需要 `ArrayBuffer` / `DataView` / Temporal 或把 Promise 编进同一条 payload → 看 [[devalue]]
- 不能在两端同步维护 class/symbol/custom 表
- 目标是零拷贝或 schema 驱动的 wire format → 看 [[capnproto]]

## 固定版本边界

- 本文绑定 `ravionhq/superjson@4e708c11...`，package 版本 `2.2.5`，Node `>=16`，双模块入口。
- GitHub 上 `blitz-js/superjson` 与 `flightcontrolhq/superjson` 都指向同一仓库；`package.json` 的 repository 字段仍写旧组织名。
- `superjson@2.2.6` 的 npm `gitHead` 在该 remote 不可达，也没有同名 tag；未提升到 2.2.6。
- 本文只做静态阅读，没有安装依赖或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **补 JSON 不必换语法**——把丢失的类型放进旁路 meta，传输层仍是 JSON。
2. **默认单例是隐式全局**——静态方法和 `new SuperJSON()` 不是同一张注册表。
3. **还原 class 不是 `new`**——只恢复原型和允许属性，构造副作用不会重放。
4. **安全键是硬失败**——`__proto__` 一类字段被当成污染风险，而不是可传输数据。

## 应用型自测

1. 只调用 `SuperJSON.registerClass(Foo)`，再用 `new SuperJSON().deserialize(...)`，能还原 `Foo` 吗？
2. `parse(stringify({ x: undefined })).x` 是 `null` 还是 `undefined`？
3. 未调用 `allowErrorProps("stack")` 时，往返后的 `Error.stack` 还在吗？

检查点：

1. 不能。静态注册写在默认单例上，新实例有自己的 registry。
2. `undefined`。注解会把它从 `null` 还原回去。
3. 不在。默认 payload 不含 `stack`。

## 延伸阅读

- 仓库：[github.com/ravionhq/superjson](https://github.com/ravionhq/superjson)
- 固定源码：本文绑定提交 `4e708c11b8ae510008c42fbc445ff0e0e683417e`
- [[devalue]] —— 扁平数组 / uneval，不靠 json+meta
- [[trpc]] —— 常见的 superjson transformer 下游
- [[capnproto]] —— 对照：换 wire format，而不是给 JSON 加批注

## 关联

- [[devalue]] —— 同一问题的另一条实现：拒绝任意 class，改走索引图
- [[trpc]] —— procedure 输入输出常接 superjson
- [[next-js]] —— RSC/SSR 脱水场景里会碰到同类问题
- [[sveltekit]] —— 官方更靠近 [[devalue]]
- [[capnproto]] —— schema 化二进制对照
- [[zod]] —— 校验输入形状；superjson 不管 schema，只管类型往返

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
