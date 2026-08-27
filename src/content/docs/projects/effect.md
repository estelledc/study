---
title: Effect — 给 TypeScript 装上会跟踪错误和依赖的副作用引擎
description: Typed Effect<A, E, R> values, fibers, and Schema decoding on a pinned 3.22.1 revision.
来源: https://github.com/Effect-TS/effect
日期: 2026-05-29
分类: TypeScript 运行时
难度: 高级
difficulty: advanced
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/Effect-TS/effect
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 417e0faa80e471d77fc4a67452e68b09ae0ee861
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.22.1
---

## 是什么

Effect 是一个 TypeScript 库，把一段计算写成**还没跑的描述**。日常类比：快递面单。`Promise<User>` 只写“箱子里是 User”；`Effect<User, NotFound, Database>` 把成功值、预期失败、运行时依赖三件事都印在面单上。

你写：

```ts
import { Effect } from "effect"

const getUser = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Database
    return yield* db.findUser(id)
  })
```

固定 `effect@3.22.1` 里，这仍是一个 `Effect` 值。`Effect.gen` 只是把 generator 包进 iterator instruction；必须 `Effect.runPromise`（且 `R` 已是 `never`）才会真正执行。

## 为什么重要

不理解 Effect，下面这些事会对不上固定源码：

- 为什么 `Promise<User>` 在类型上看不见会失败成什么
- 为什么 [[neverthrow]] 的 `Result<T, E>` 只覆盖错误通道，不管依赖、Scope 和 Fiber
- 为什么 Zod leftover 会落到 `effect/Schema`：同一仓里 schema decode 返回 `Effect` 或 `Either`，还能接 Standard Schema
- 为什么没 `provide` 完服务就 `runPromise`，类型过不去

## 核心要点

固定 3.22.1 的主链可以拆成五步：

1. **构造描述，不执行**：`Effect.succeed` 生成 `OP_SUCCESS` instruction。`Effect.fail` 走 typed `Cause.Fail`；`Effect.die` 走 defect，结果类型是 `Effect<never>`。

2. **三参顺序是 `<A, E, R>`**：成功值、预期错误、环境。旧文里的 `<R, E, A>` 是更早的 ZIO 习惯，不是本页绑定版本。

3. **运行入口收窄环境**：`Effect.runPromise(effect, options?)` 只接受 `Effect<A, E, never>`，可选 `AbortSignal`。还缺服务时要先 `provide` / `provideService`。

4. **资源挂在 Scope 上**：`Effect.acquireRelease(acquire, release)` 把 `Scope` 并进 `R`；release 收到 `Exit`，不靠词法 `try/finally`。

5. **Schema 在本包**：`Schema.decodeUnknown` 返回 `Effect<A, ParseError, R>`；`decodeUnknownEither` 要求 schema 的 `R` 为 `never`。`Schema.standardSchemaV1`（3.13.0 起）提供 `~standard.validate`。仓内 `schema-vs-zod.md` 是对照说明，不是本轮运行证据。

## 实践示例

### 案例 1：typed fail 与 defect 不是一条通道

```ts
import { Effect } from "effect"

class NotFound { readonly _tag = "NotFound" }

const find = (id: string) =>
  id === "1" ? Effect.succeed("Ada") : Effect.fail(new NotFound())

// Effect.runPromise(find("x")) 会 reject；要看完整 Cause 用 runPromiseExit
```

`fail` 的 `E` 会出现在类型里。`die` 表示缺陷，不进入 `E`。把业务 404 写成 `die`，调用方无法在类型上穷尽处理。

### 案例 2：Tag 写出依赖，再 provide 才能跑

```ts
import { Context, Effect, Layer } from "effect"

class Database extends Context.Tag("Database")<Database, {
  findUser: (id: string) => Effect.Effect<string, never>
}>() {}

const program = Effect.gen(function* () {
  const db = yield* Database
  return yield* db.findUser("1")
})

const live = Layer.succeed(Database, { findUser: () => Effect.succeed("Ada") })
const runnable = Effect.provide(program, live)
```

`runnable` 的 `R` 被消成 `never` 后，才能交给 `runPromise`。忘了 provide，不是运行时报“缺 Database”，而是类型阶段过不去。

### 案例 3：Schema decode 相对 Zod leftover

```ts
import { Effect, Schema } from "effect"

const User = Schema.Struct({ name: Schema.String })
const either = Schema.decodeUnknownEither(User)({ name: "Ada" })
const effect = Schema.decodeUnknown(User)({ name: "Ada" })
```

`either` 是同步 `Either`；`effect` 仍是可组合的 Effect。这和 [[zod]] 的 `parse` / `safeParse` 对象不同：这里失败类型是 `ParseError`，成功通道还可以继续 `flatMap` 进 Layer / Fiber。双向 encode、以及 `standardSchemaV1` 适配器，都在本包，不需要另装 `@effect/schema`。

## 踩过的坑

1. **以为写出 `Effect.gen` 就已经跑了**：generator 被 `fromIterator` 包起来；没有 runner 就没有副作用。
2. **`runPromise` 吃带 `R` 的程序**：签名是 `Effect<A, E, never>`。Scope 也算 `R`，`acquireRelease` 后还要 `scoped` / runtime 提供 Scope。
3. **把 `fail` 和 `die` 当同义词**：一个进错误通道，一个是缺陷。日志里的 `Cause` 树会把两者叠在一起。
4. **把 `tryPromise` 的无 catch 重载当成 typed E**：不传 `catch` 时错误是 `Cause.UnknownException`。
5. **把 npm latest 的 4.0 rc 当成 3.22.1**：`dist-tags.beta` / `rc` 指向 4.0 线，本页未绑定。

## 适用 vs 不适用场景

**适用**：

- 需要把错误、依赖和资源寿命一起写进类型
- 愿意用 Layer / Tag 做可替换实现
- 要在同一套 Effect 里接 Schema decode，而不是另起一套 Result 管道

**不适用**：

- 只要同步 `Result<T, E>`——[[neverthrow]] 更小，也没有 Fiber / Scope
- 只做表单或 API 边界校验，且团队已经以 [[zod]] 为契约源
- 需要本轮未测的 bundle / QPS 结论——固定源码没有给出可引用数字
- 想跟 4.0 beta/rc API，那是另一条 revision

## 固定版本边界

- 本文绑定 `Effect-TS/effect@417e0faa...`，GitHub tag `effect@3.22.1` 剥开后指向该提交。
- npm `effect@3.22.1` 当前不暴露 `gitHead`，不以 registry 反推。
- package 自报 “missing standard library”；依赖 `@standard-schema/spec` 与 `fast-check`。未声明 `engines`。
- `effect@4.0.0-beta.*` / `rc` 不在适用版本内。
- 未安装依赖、运行上游 vitest / tstyche 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **Effect 是值**：成功、失败、依赖都可以先描述后执行
2. **`R` 是运行许可**：`runPromise` 只收已经 provide 完的程序
3. **fail 与 die 分通道**：业务错误和缺陷不能混写成同一种 throw
4. **Schema 是 leftover，不是另一套 Zod**：decode 进 Effect/Either，还能挂 Standard Schema

## 应用型自测

1. 只写了 `Effect.succeed(1)`，没有 runner。控制台会打印 1 吗？
2. `acquireRelease` 之后的程序，能否直接交给 `Effect.runPromise`？
3. `Schema.decodeUnknownEither` 能接受一个还需要服务的 schema（`R` 不是 `never`）吗？

检查点：

1. 不会。它只是 instruction。
2. 默认不能。`Scope` 还在 `R` 里。
3. 不能。该 API 要求 schema 的 `R` 为 `never`。

## 延伸阅读

- 官方文档：[effect.website](https://effect.website)
- 固定源码：[Effect-TS/effect](https://github.com/Effect-TS/effect) —— 本文绑定 `417e0faa80e471d77fc4a67452e68b09ae0ee861`
- 审查记录：仓库内 `docs/result-effect-source-review-20260827-ed.md`
- [[neverthrow]] —— 只覆盖 Result 通道的轻量对照
- [[zod]] —— schema leftover 的另一侧：parse / safeParse

## 关联

- [[neverthrow]] —— Result 解决错误返回值；Effect 再加依赖、资源和并发
- [[zod]] —— 运行时 schema；Effect Schema 用 Effect/Either 接 decode
- [[valibot]] —— 模块化 schema，另一条校验对照
- [[arktype]] —— 更贴近 TypeScript 语法的 schema
- [[effect-handlers]] —— 代数效应的语言级来源
- [[xstate]] —— 状态机对照；Effect 的 actor/fiber 是另一条并发模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[frank-effects]] —— Frank — 让 effect handler 写得就像普通函数
- [[granule]] —— Granule — 让类型系统同时数次数、看安全级、追副作用
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[lacuna-program-holes]] —— LACUNA — 把 AI agent 的行动变成编译器先检查的程序洞
- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[inngest]] —— Inngest — 让 async 函数自动从断点恢复的工作流引擎
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来
