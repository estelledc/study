---
title: Typia — 从 TypeScript 类型编译出校验函数
description: 编译期把 TypeScript 类型变成专用校验函数，运行时不再解释一份 schema。
来源: https://github.com/samchon/typia
日期: 2026-08-27
分类: schema
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/samchon/typia
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 00872d2952ecdb06c548c83fb4f2a376256b7d9a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 14.0.4
---

## 是什么

Typia 是一个 **TypeScript transformer**：你先写普通类型，编译器再生成只服务这个类型的校验函数。日常类比：[[zod]] / [[arktype]] 像随身带着一份说明书，每次对照着查；Typia 像把说明书提前印成专用模具——运行时只按模具卡一下，不再读说明书。

```ts
import typia, { tags } from "typia"

interface User {
  email: string & tags.Format<"email">
  age: number & tags.ExclusiveMinimum<18>
}

const user = typia.assert<User>(input)
```

没有单独的 schema 对象。约束写在类型上，`tags` 来自 `@typia/interface`，再由 `typia` 重新导出。若没用 `ttsc` / `ttsx` / `@ttsc/unplugin` 编译，这些函数不会“退化成慢路径”，而是直接抛 `no transform has been configured`。

## 为什么重要

不理解 Typia 的编译期合同，下面这些事会对不上：

- 为什么源码里 `assert` / `is` / `validate` 的 JS 实现全是抛错，却能在文档里当校验器讲
- 为什么换 `tsc`、`tsx` 或 SWC 后，原来能跑的一行突然炸
- 为什么它能同时接 JSON / protobuf / HTTP / LLM 这些命名空间，却仍不要求你先写一份 Zod schema
- 为什么 `createValidate()` 可以当作 Standard Schema 交给框架

## 核心要点

固定 `14.0.4` 可以拆成四条合同：

1. **类型是源真相，schema 是生成物**：公开 API 吃的是 generic `T`，不是 builder chain。`assert` 遇第一处失败抛 `TypeGuardError`（含 `path` / `expected` / `value`）；`is` 只给 boolean type guard；`validate` 收集全部 `IValidation.errors`，从不抛。`assertEquals` / `equals` / `validateEquals` 还会拒绝类型里没写的多余属性。

2. **没有 transform 就没有运行时**：`packages/typia/src/module.ts` 里上述函数的实现都调用 `NoTransformConfigurationError`。`transform.ts` 只是 `ttsc` 插件描述符，真正的 native 入口是 `native/cmd/ttsc-typia`。stock `tsc`、`ts-node`、`tsx`、Babel、SWC 不会自动加载它；`ttsc>=0.19.2` 是 optional peer。

3. **工厂函数把生成结果留下来**：`createAssert` / `createIs` / `createValidate` 等返回可反复调用的函数，避免每次调用都“再编译一次”。`createValidate` / `createValidateEquals` 的类型合同同时实现 `StandardSchemaV1`；`_createStandardSchema` 把成功变成 `{ value }`，失败变成 `{ issues }`，`vendor` 固定为 `"typia"`。

4. **同一套类型还能生成别的制品**：`json.schema` / `json.assertParse`、`protobuf.assertDecode`、`http.assertQuery`、`llm.application`、`random` 都是同一 transform 合同上的命名空间。本文只静态阅读这些入口，没有运行它们。

## 实践示例

### 案例 1：类型 + tags 做运行时断言

```ts
import typia, { tags } from "typia"

interface Account {
  email: string & tags.Format<"email">
  age: number & tags.Minimum<18>
}

export function accept(input: unknown): Account {
  return typia.assert<Account>(input)
}
```

`tags.Format<"email">` 和 `tags.Minimum<18>` 是类型级约束，不是运行时装饰器。只有经过 typia transform 的编译产物才会变成具体检查。

### 案例 2：收集全部错误，并交给 Standard Schema

```ts
import typia from "typia"

interface Account {
  email: string
  age: number
}

const validate = typia.createValidate<Account>()
const result = validate({ email: "a@b.com", age: "x" })
if (!result.success) {
  console.error(result.errors)
}

const standard = validate["~standard"].validate({ email: "a@b.com", age: 20 })
```

`createValidate` 既返回 `IValidation`，又挂了 `~standard`。框架只需要认 value / issues，不必依赖 Typia 专用 resolver。

### 案例 3：从 JSON 字符串直接得到类型

```ts
import typia from "typia"

interface Account {
  email: string
  age: number
}

const account = typia.json.assertParse<Account>(raw)
```

这不是 `JSON.parse` 后再手写检查。transform 会生成 parse + assert 的专用函数；失败仍走 `TypeGuardError`。

## 踩过的坑

1. **以为没配插件也能跑**：未配置 transform 时，调用立刻抛错，不会悄悄改用反射。
2. **用 `tsc` / `tsx` / SWC 直接出包**：固定错误信息点名这些工具不会自动加载 typia transform。
3. **漏写 generic**：`createValidate()` 没有 `T` 时，类型合同是 `never`；必须写成 `createValidate<Account>()`。
4. **把 README 的倍数当成自己的结果**：官方文档写了相对 `class-validator` / `class-transformer` 的加速数字。本文未跑 benchmark，不能把那些数字写成当前环境事实。
5. **以为 `is` 的浅层亲戚也保证整棵树**：`shallow` 默认只下探深度 `2`，再往下只要求是 `object`；`true` 不等于完整符合 `T`。

## 适用 vs 不适用场景

**适用**：

- 团队已经用 TypeScript 类型当合同，不想再维护一份平行 schema
- 构建链可以改成 `ttsc`、`ttsx` 或 `@ttsc/unplugin`
- 需要同一套类型同时生成校验、JSON schema 或 protobuf 编解码

**不适用**：

- 只能用 stock `tsc` / Babel / SWC，且不能加 typia 的 transform
- 运行时才知道 schema 形状，无法在编译期看到具体 `T`
- 必须先有一份可动态拼装的 schema 对象（那是 Zod / ArkType / Valibot 的领地）

## 固定版本边界

- 本文绑定 `samchon/typia@00872d29...`，`typia` 与 `@typia/interface` 均为 `14.0.4`。
- GitHub annotated tag `v14.0.4` 指向该提交；npm `typia@14.0.4` 当前不暴露 `gitHead`。
- 未安装 `ttsc`、未执行 transform、未跑上游测试或性能数字，状态保持 `UNVERIFIED`。

## 学到什么

1. **类型可以当编译期 schema**：校验函数是生成物，不是手写说明书。
2. **缺插件等于缺实现**：公开 JS 入口是 fail-closed 的哨兵，不是慢速后备。
3. **`createValidate` 桥接了两种世界**：自己用 `IValidation`，框架用 Standard Schema。
4. **多余字段是另一条 API**：默认 `assert` 允许额外属性，要拒绝时走 `assertEquals` 家族。

## 应用型自测

1. 在没配 `ttsc` 的项目里调用 `typia.is<User>(data)`，会得到 `false` 还是抛错？
2. `createValidate<User>()` 的返回值除了 `(input) => IValidation`，还实现了什么协议？
3. `typia.assert<User>(input)` 通过，是否证明 `input` 没有多余字段？

检查点：

1. 抛错。固定实现调用 `NoTransformConfigurationError`，不会改走运行时解释。
2. `StandardSchemaV1`。`~standard.vendor` 为 `"typia"`。
3. 不能。拒绝多余字段要走 `assertEquals` / `validateEquals` / `equals`。

## 延伸阅读

- 官方文档：[typia.io/docs](https://typia.io/docs)
- 固定源码：[samchon/typia](https://github.com/samchon/typia) —— 本文绑定提交 `00872d2952ecdb06c548c83fb4f2a376256b7d9a`
- Standard Schema：[standardschema.dev](https://standardschema.dev)
- [[arktype]] —— 运行时节点图，对照“类型先写、编译期生成”
- [[zod]] —— schema 先写、类型后推的主流对照

## 关联

- [[arktype]] —— 字符串 / 对象 definition → 节点遍历
- [[zod]] —— method chain schema
- [[valibot]] —— 模块化 schema + pipe
- [[trpc]] —— 可消费 Standard Schema 的输入校验
- [[tanstack-form]] —— 通过 `~standard` 接校验器
