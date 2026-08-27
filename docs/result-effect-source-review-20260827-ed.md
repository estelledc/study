# Result / Effect source review (writer ED)

> 用途：记录 Effect、neverthrow 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。
>
> 选题：zod leftover。schema 组已有 Zod / Valibot / ArkType；本轮补 Result 与 Effect 对照，不改 `zod` 正文。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer ED
- evidence：GitHub metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、TypeScript 编译、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- out of scope：`effect@4.0.0-beta.*` / `effect@4.0.0-rc.*`；未改开放 PR 已占用的 `zod` / `yup` / `valibot` / `io-ts` / `arktype` / `typia`

## Effect

- canonical source：`https://github.com/Effect-TS/effect`
- revision：`417e0faa80e471d77fc4a67452e68b09ae0ee861`
- package：`effect@3.22.1`
- provenance：
  - GitHub annotated tag `effect@3.22.1` 剥开后指向该提交；
  - npm `effect@3.22.1` 当前不暴露 `gitHead`，不以 registry 反推 revision；
  - 未绑定 `latest` 的 4.0 beta/rc 线。
- inspected：
  - `packages/effect/package.json`
  - `packages/effect/src/Effect.ts`
  - `packages/effect/src/internal/core.ts`
  - `packages/effect/src/internal/fiberRuntime.ts`
  - `packages/effect/src/Context.ts`
  - `packages/effect/src/Schema.ts`
  - `packages/effect/schema-vs-zod.md`
- observed：
  - `Effect<A, E = never, R = never>` 是描述值，不是立刻执行的 Promise；`succeed` 构造 `OP_SUCCESS` instruction；
  - `Effect.gen` 把 generator 包进 `fromIterator`，调用时仍返回 Effect；
  - `Effect.fail` 走 typed `Cause.Fail`；`Effect.die` 走 defect，成功/失败类型为 `Effect<never>`；
  - `Effect.runPromise` 只接受 `Effect<A, E, never>`，可选 `AbortSignal`；未 provide 的 `R` 不能跑；
  - `Effect.acquireRelease` 把 `Scope` 加进 `R`，release 收到 `Exit`；
  - `Context.Tag("id")<Self, Shape>()` 声明服务标签；
  - `effect/Schema` 在本包：`decodeUnknown` 返回 `Effect`，`decodeUnknownEither` 要求 schema `R = never` 并返回 `Either`；
  - `Schema.standardSchemaV1`（since 3.13.0）用 `~standard.validate` 接 Standard Schema；
  - 仓内 `schema-vs-zod.md` 把 Zod 对照写成 decode/encode、Either 与 combinator，不是运行证据。

## neverthrow

- canonical source：`https://github.com/supermacro/neverthrow`
- revision：`1d4cc19ed2e6ba882e296385fe0175d642ec8c5d`
- package：`neverthrow@8.2.0`
- provenance：
  - GitHub annotated tag `v8.2.0` 剥开后指向该提交；
  - npm `neverthrow@8.2.0` 的 `gitHead` 一致；
  - `engines.node` 为 `>=18`。
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/result.ts`
  - `src/result-async.ts`
  - `src/_internals/utils.ts`
- observed：
  - `Result<T, E>` 是 `Ok` / `Err` 两个 class，不是带 `_tag` 的字面量联合；
  - `ok` / `err` 构造实例；`isOk` / `isErr` 做类型收窄；
  - `andThen` 在 Ok 上调用后续 `Result`，在 Err 上原样返回；
  - `andTee` / `orTee` 吞掉回调抛出的异常，仍返回当前 Result；
  - `Result.combine` 遇到第一个 Err 就停；`combineWithAllErrors` 收集全部 Err；
  - `safeTry` 对 generator `next()`：同步返回 `n.value`，异步则包成 `ResultAsync`；
  - `ResultAsync` 实现 `PromiseLike<Result<T, E>>`；`fromSafePromise` 不 catch；`fromPromise` 必须给 `errorFn`；
  - `_unsafeUnwrap` 在 Err 上抛自定义 NeverThrow 错误，注释写明只给测试环境。
