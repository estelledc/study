---
title: TypeBox — 用 TypeScript 工厂写出 JSON Schema
description: 用 TypeScript 工厂生成 JSON Schema，并可选 JIT 编译校验器。
来源: https://github.com/sinclairzx81/typebox
日期: 2026-08-27
分类: 验证 / 类型
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sinclairzx81/typebox
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 51e4b0281f0c073ce408eae31c730862480f9de7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.3.19
---

## 是什么

TypeBox 是一个 **JSON Schema 类型工厂**：`Type.Object({...})` 在运行时造出一份可交给任何 JSON Schema 校验器的对象，同时让 TypeScript 用 `Type.Static` 推出静态类型。日常类比：像 CAD 出图——图纸本身就是规范文件，不是另存一份「给人看的」再抄一份「给机器看的」。

1.x 的 npm 包名是 `typebox`（ESM only），不是 0.x 的 `@sinclair/typebox`。0.x 仍作为 LTS 维护在另一个仓库。

```ts
import Type from "typebox"

const User = Type.Object({
  email: Type.String({ format: "email" }),
  age: Type.Number(),
})
type User = Type.Static<typeof User>
```

`Type.Object` 写出 `{ type: 'object', properties, required }`，并打上 `~kind: 'Object'`。它**不会**自动加 `additionalProperties: false`；未知 key 是否合法，要调用方自己写进 options。

## 为什么重要

不理解 TypeBox 1.x 的分层，下面这些事会让你困惑：

- 为什么 [[elysia]] / Fastify type provider 喜欢它：同一份对象既能推 TS 类型，又能当 JSON Schema 交给文档和校验器
- 为什么 `import Type from 'typebox'` 和旧代码 `from '@sinclair/typebox'` 不是换个名字
- 为什么 `Schema.Compile` 的 `Parse` 和 `Value.Parse` 不是同一条管线
- 为什么 Cloudflare Worker 一类禁 `eval` 的环境还能跑——编译器会退回动态 `CheckSchema`

一句话：TypeBox 把「TS 类型工厂」和「JSON Schema 运行时」接在同一份对象上，但校验入口有两条。

## 核心要点

固定源码里，TypeBox 1.3.19 可以拆成四层：

1. **类型工厂产出 schema 对象**：`Type.Object` / `Type.String` 等返回带 `~kind` 的 JSON Schema 片段。`Type.Static` 是同一命名空间上的类型导出。`Type.Script` 另有一个微型 TS 引擎，能把类型字符串编成 schema。

2. **`Schema.Compile` 是 JIT 校验器**：`new Validator` 先 `Build`，再 `Evaluate()`。`Environment.CanEvaluate()` 为真时用 `Function` 生成检查函数；否则退回 `Engine.CheckSchema`。`Validator.IsAccelerated()` 报告实际走了哪条。

3. **两条 Parse 合同不同**：`Validator.Parse` 只 `Check`，失败抛 `ParseError`，成功原样返回。`Value.Parse` 在 `Check` 已通过时直接返回原值；失败时若 `correctiveParse` 打开，才走 Clone → Default → Convert → Clean → Assert。

4. **format 有默认表，但未注册名会放行**：`Format.Reset()` 在模块加载时登记 `email` / `uuid` 等。`Format.Test` 对**未登记**的 format 名返回 `true`。这和 Ajv「未知 format 在 strict 下失败」相反。

## 实践示例

### 案例 1：工厂对象同时当类型

```ts
import Type from "typebox"

const Vector = Type.Object({
  x: Type.Number(),
  y: Type.Number(),
  z: Type.Number(),
})
type Vector = Type.Static<typeof Vector>
```

**逐部分解释**：

1. 运行时 `Vector` 是 JSON Schema 对象，可直接交给 [[ajv]] 或 TypeBox 自己的 compiler
2. `Type.Static` 推出 `{ x: number; y: number; z: number }`
3. 默认**允许**多余 key；要拒绝需传入 `{ additionalProperties: false }`

### 案例 2：`Schema.Compile` 的 Check / Parse

```ts
import Type from "typebox"
import Schema from "typebox/schema"

const Vector = Schema.Compile(Type.Object({
  x: Type.Number(),
  y: Type.Number(),
  z: Type.Number(),
}))
Vector.Check({ x: 1, y: 0, z: 0 }) // true
Vector.Parse({ x: 1, y: 0 })       // throw ParseError
```

`Compile` 接受 TypeBox 类型或普通 JSON Schema。`Parse` 不会做 Default/Convert；它只是 Check 失败就抛。

### 案例 3：不要把 Value.Parse 当成 Compile.Parse

```ts
import Type from "typebox"
import Value from "typebox/value"

const Age = Type.Number()
Value.Parse(Age, 1) // Check 通过，返回原值 1
```

`Value.Parse` 在已经合法时不会克隆。只有 Check 失败且 `correctiveParse` 开启，才会走进修复管线。把「Parse」理解成「总会得到一份干净副本」会错。

## 踩过的坑

1. **继续 `npm i @sinclair/typebox` 当 1.x**：固定仓库写明 1.x 是 `typebox`、ESM only；0.x LTS 在 `sinclair-typebox`。下游框架可能仍停在 0.x。
2. **以为 Object 默认剥未知 key**：工厂不写 `additionalProperties`。这和 [[zod]] 默认 strip 相反。
3. **把 README 的 TB1X vs AJV8 表抄进结论**：那些数字来自项目 README，本轮没有复跑。
4. **在禁 `eval` 环境假定一定 JIT**：`CanEvaluate()` 依赖 `Function` 与 `useAcceleration`；失败时 `IsAccelerated()` 为 false，语义仍应靠 Check，而不是性能数字。

## 适用 vs 不适用场景

**适用**：
- 需要 JSON Schema 文档 / OpenAPI，又想从 TS 工厂推出类型
- 已经或准备把 schema 交给 [[ajv]]、框架 type provider 或 TypeBox 自己的 compiler
- 能接受 1.x ESM-only，并分清 `Schema.Parse` 与 `Value.Parse`

**不适用**：
- 必须 CommonJS / 0.x 生态位——应看 LTS 仓，而不是把 1.x API 抄回去
- 想要 Zod 式默认 strip + 方法链，又不想手写 `additionalProperties`
- 需要「未注册 format 必须失败」——TypeBox 的 `Format.Test` 对未知名返回 true

## 固定版本边界

- 本文绑定 `sinclairzx81/typebox@51e4b028...`，`tasks.ts` 版本为 `1.3.19`。
- 1.x 包名 `typebox`，ESM only；0.x 是另一代 API。
- README 含编译/校验对照表，本文不引用具体 ops 数字。
- 本文只做源码静态审查，没有安装依赖、运行测试或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **「一份对象三处用」**成立的前提是：工厂输出真的是 JSON Schema，而不是另一种私有 IR
2. **编译器和值管线是两个入口**，同名 `Parse` 不能互换
3. **包名换代是硬边界**：`@sinclair/typebox` 的记忆不能直接套 1.x
4. **未知 format 放行**是 TypeBox 的显式合同，选型时要当安全问题看

## 应用型自测

1. `Type.Object({ name: Type.String() })` 校验 `{ name: "Ada", admin: true }` 时，默认会因为多余 key 失败吗？
2. `Schema.Compile(T).Parse(value)` 失败后，会先 Convert 再重试吗？
3. `Format.Test("not-a-real-format", "x")` 在未登记该名时返回什么？

检查点：

1. 不会。工厂默认不写 `additionalProperties`。
2. 不会。`Validator.Parse` 只 Check，失败即抛。
3. `true`。未登记 format 被当作通过。

## 延伸阅读

- 官方文档：[sinclairzx81.github.io/typebox](https://sinclairzx81.github.io/typebox/)
- 仓库：[github.com/sinclairzx81/typebox](https://github.com/sinclairzx81/typebox)
- 固定源码：提交 `51e4b0281f0c073ce408eae31c730862480f9de7`
- 共享审查记录：`docs/json-schema-source-review-20260827-bh.md`
- [[ajv]] —— 对照：消费 JSON Schema 的编译器
- [[elysia]] —— 常见下游，历史讨论多围绕 TypeBox
- [[zod]] —— 对照：TS-first，不把 JSON Schema 当源对象

## 关联

- [[ajv]] —— 同一 JSON Schema 字节可以被 Ajv 再编译一次
- [[elysia]] —— schema-first 框架常举 TypeBox 为例
- [[fastify]] —— `@fastify/type-provider-typebox` 是常见对接
- [[zod]] —— 对照：默认 strip，且不是 JSON Schema 工厂
- [[arktype]] —— 对照：definition 更像 TypeScript 类型字面量
- [[valibot]] —— 对照：模块化 TS 校验，JSON Schema 是伴生包

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
