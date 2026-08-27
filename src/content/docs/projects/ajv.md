---
title: Ajv — 把 JSON Schema 编译成校验函数
description: 把 JSON Schema 编译成可缓存 ValidateFunction 的运行时校验器。
来源: https://github.com/ajv-validator/ajv
日期: 2026-08-27
分类: 验证 / 类型
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ajv-validator/ajv
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0fba0b8e649909613cfce0999b149cd08f4a4987
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.20.0
---

## 是什么

Ajv 是一个 **JSON Schema 编译器**：你交给它一份 schema 对象，它先按所选 draft 的 vocabulary 生成一段校验函数，再用这个函数检查数据。日常类比：schema 像建筑规范条文，Ajv 不是每次拿着条文逐条念，而是先把条文翻译成一份可执行的检查清单，再对每栋楼过一遍。

默认入口装的是 draft-07。2020-12 要用单独的 `Ajv2020` 类，它会打开 `dynamicRef`、`next` 和 `unevaluated`。

```js
const Ajv = require("ajv")
const ajv = new Ajv()
const validate = ajv.compile({
  type: "object",
  properties: { email: { type: "string" } },
  required: ["email"],
  additionalProperties: false,
})
validate({ email: "a@b.c" }) // true
```

`compile()` 把 schema 放进实例缓存，再通过 `compileSchema` → `validateFunctionCode` 生成 `ValidateFunction`。同步失败时，issue 写在函数的 `errors` 上，也会被 `validate()` 抄到实例的 `ajv.errors`。

## 为什么重要

不理解 Ajv 的编译边界，下面这些事会让你困惑：

- 为什么 [[fastify]] / OpenAPI 工具链常把 JSON Schema 交给 Ajv，而不是再写一份 [[zod]] 式 TS schema
- 为什么默认 `new Ajv()` 拒绝 2020-12 的 `$dynamicRef` / `unevaluatedProperties`——那是另一个入口
- 为什么 `removeAdditional` 会改输入对象，而 `additionalProperties: false` 默认只报错
- 为什么写了 `format: "email"` 却过不了——实例 `formats` 表一开始是空的

一句话：Ajv 是「已有 JSON Schema」生态的运行时编译器，不是 TypeScript-first 的类型源头。

## 核心要点

固定源码里，Ajv 8.20.0 可以拆成四层：

1. **draft 由入口类决定**：`lib/ajv.ts` 的默认类挂 draft-07 vocabulary 和 meta schema；`lib/2020.ts` 的 `Ajv2020` 另开 2020-12。选错入口，关键词会被当成未知规则。

2. **校验函数是编译产物**：`compile()` 走 `_addSchema` → `_compileSchemaEnv` → `compileSchema`。同一 schema 对象会进 `Map` 缓存。`validate(schema, data)` 对对象 schema 现编，对字符串则 `getSchema` 查 key/ref。

3. **额外字段策略会改数据**：`additionalProperties` 默认按 JSON Schema 语义允许未知 key；写成 `false` 会报 `must NOT have additional properties`。打开 `removeAdditional` 后，编译出的函数会 `delete data[key]`，成功路径上的输入已经不是原来的对象。

4. **format 不是内置邮箱器**：`formats` 用 `Object.create(null)` 起步。`format` 关键词去查这张表；`validateFormats` 默认是 true。没 `addFormat` / `ajv-formats` 时，未知 format 在 `strictSchema` 下会失败，而不是默默跳过。

## 实践示例

### 案例 1：编译一次，重复校验

```js
const Ajv = require("ajv")
const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile({
  type: "object",
  properties: { age: { type: "integer", minimum: 0 } },
  required: ["age"],
})
validate({ age: -1 }) // false
console.log(validate.errors)
```

**逐部分解释**：

1. `compile` 返回的函数可以反复调用；不要每个请求 `new Ajv()`
2. `allErrors: true` 继续收集后续 issue，默认遇到第一个错误就停
3. 同步失败读 `validate.errors`，不要假设它会抛异常

### 案例 2：`removeAdditional` 会改对象

```js
const ajv = new Ajv({ removeAdditional: true })
const validate = ajv.compile({
  type: "object",
  properties: { name: { type: "string" } },
  additionalProperties: false,
})
const input = { name: "Ada", admin: true }
validate(input)
console.log(input) // { name: "Ada" }
```

这个例子暴露合同：校验通过不等于对象没变。需要保留未知字段时，不要开 `removeAdditional`。

### 案例 3：draft-07 与 2020-12 不是同一个类

```js
const Ajv = require("ajv")
const Ajv2020 = require("ajv/dist/2020")
const draft7 = new Ajv()
const draft2020 = new Ajv2020()
```

`unevaluatedProperties` / `$dynamicRef` 属于 2020-12 入口。把 2020 schema 丢给默认 `Ajv`，strict 模式会把未知关键词当错误，而不是「差不多能跑」。

## 踩过的坑

1. **把 `format: "email"` 当成开箱即用**：核心包只提供 format 插槽。没有注册实现时，行为取决于 `validateFormats` 和 `strictSchema`，不是「按 RFC 校验邮箱」。
2. **用 `validate()` 的返回值当唯一错误通道**：`$async` schema 返回 Promise；同步路径把 errors 挂在实例上，并发复用同一个 Ajv 时会被下一次调用覆盖。
3. **standalone 直接 `require` 编译结果**：`lib/standalone/index.ts` 要求实例打开 `code.source`，否则直接抛错。
4. **把 README 的「最快」当本环境事实**：固定源码没有绑定目标 runtime 的 benchmark；吞吐要在真实 schema 上另测。

## 适用 vs 不适用场景

**适用**：
- 手边已经是 JSON Schema / OpenAPI，需要 Node 或浏览器里执行
- 要把校验函数提前编成独立模块（standalone）
- 需要 draft-07 或 2020-12 的 `$ref` / vocabulary 语义，而不是再发明一套 TS DSL

**不适用**：
- 想用一份 TS 表达式同时当类型源头和 runtime——看 [[typebox]] / [[zod]] / [[arktype]]
- 还没决定 draft，却把 2020-12 关键词丢进默认 `Ajv`
- 需要内置 email/uri 且不打算接 `ajv-formats` 或自己 `addFormat`

## 固定版本边界

- 本文绑定 `ajv-validator/ajv@0fba0b8e...`，`package.json` 版本为 `8.20.0`。
- 默认入口是 draft-07；2020-12 是 `Ajv2020`。
- `sideEffects: false` 只给 bundler 条件，不保证最终体积。
- 本文只做源码静态审查，没有安装依赖、运行测试或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **JSON Schema 的运行时成本主要在编译**，不在「再读一遍 schema 文本」
2. **入口类就是 draft 合同**，不能把 2020-12 关键词塞进 draft-07 实例
3. **校验函数可以有副作用**：`removeAdditional`、`useDefaults`、`coerceTypes` 都会改数据
4. **format 是插件位**，不是核心包自带的格式库

## 应用型自测

1. `new Ajv().compile(schema)` 之后，用带 `unevaluatedProperties` 的 2020-12 schema，默认会按 2020 语义执行吗？
2. `{ additionalProperties: false }` 且 `removeAdditional: true` 时，多余 key 是报错还是被删？
3. 只写 `format: "email"`、不 `addFormat`，Ajv 一定会按邮箱规则拒绝非法字符串吗？

检查点：

1. 不会。默认类是 draft-07；2020-12 要 `Ajv2020`。
2. 源码在 `removeAdditional` 为真且 schema 为 false 时直接 `delete`，不走报错分支。
3. 不会。`formats` 初始为空，format 实现要另行注册。

## 延伸阅读

- 官方文档：[ajv.js.org](https://ajv.js.org)
- 仓库：[github.com/ajv-validator/ajv](https://github.com/ajv-validator/ajv)
- 固定源码：提交 `0fba0b8e649909613cfce0999b149cd08f4a4987`
- 共享审查记录：`docs/json-schema-source-review-20260827-bh.md`
- [[typebox]] —— 用 TS 工厂生成 JSON Schema，再自己编校验函数
- [[fastify]] —— schema-first HTTP 层常见下游
- [[zod]] —— 对照：TS-first schema，不是 JSON Schema 编译器

## 关联

- [[typebox]] —— 同一条 JSON Schema 赛道，但从 TypeScript 工厂出发
- [[fastify]] —— 请求 schema 常编译进 Ajv
- [[elysia]] —— 另一条「一份 schema 多处用」的路线，底层更常谈 TypeBox
- [[zod]] —— 对照：不把 JSON Schema 当源真相
- [[arktype]] —— 对照：definition 更像 TypeScript 类型本身

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
