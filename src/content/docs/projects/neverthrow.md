---
title: neverthrow — 用 Result 把失败变成返回值
description: Ok/Err classes, safeTry, and ResultAsync on a pinned neverthrow 8.2.0 revision.
来源: https://github.com/supermacro/neverthrow
日期: 2026-08-27
分类: 工具库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/supermacro/neverthrow
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1d4cc19ed2e6ba882e296385fe0175d642ec8c5d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.2.0
---

## 是什么

neverthrow 是一个 TypeScript 库，把“成功或失败”做成**返回值**，而不是 throw。日常类比：体检报告单。单子要么是 Ok（数值），要么是 Err（原因）；下游用 `isOk` / `match` 读单，不必在整栋楼里抓异常。

你写：

```ts
import { ok, err, Result } from "neverthrow"

const parseAge = (raw: string): Result<number, string> => {
  const n = Number(raw)
  return Number.isInteger(n) ? ok(n) : err("not an integer")
}
```

固定 `neverthrow@8.2.0` 里，`Result<T, E>` 是 `Ok` 与 `Err` **两个 class**，不是带 `_tag` 字段的字面量联合。`ok(1)` 得到 `new Ok(1)`。

## 为什么重要

不理解 neverthrow，下面这些对照会串台：

- 为什么有人说“Result 只解决一半”——它没有 [[effect]] 的 `R`、Scope、Fiber
- 为什么 `andTee` 看起来像副作用挂钩，抛错却被吞掉
- 为什么 `fromSafePromise` 和 `fromPromise` 不是同一个 API
- 为什么 Zod leftover 之后还要单独看 Result：schema 解决形状，Result 解决控制流

## 核心要点

固定 8.2.0 的主链可以拆成四步：

1. **构造与收窄**：`ok` / `err` 返回 class 实例。`isOk()` / `isErr()` 是 type guard，读 `value` 或 `error` 之前要先判断。

2. **串起来**：`map` 只改 Ok；`andThen` 在 Ok 上接下一个 `Result`，在 Err 上原样返回。`Result.combine` 遇到**第一个** Err 就停；`combineWithAllErrors` 才收集全部错误。

3. **异步是另一层**：`ResultAsync<T, E>` 实现 `PromiseLike<Result<T, E>>`。`fromSafePromise` 只 `then` 成 Ok，**不 catch**；`fromPromise` 必须传入 `errorFn`。

4. **`safeTry` 模拟 `?`**：同步 generator 取 `next().value`；若 `next()` 是 Promise，则包成 `ResultAsync`。`yield*` 一个 Err 会提前结束。

## 实践示例

### 案例 1：用 match 读单，而不是 unwrap

```ts
import { ok, err } from "neverthrow"

const result = ok(3).andThen((n) => n > 0 ? ok(n * 2) : err("non-positive"))
const text = result.match(
  (n) => `ok ${n}`,
  (e) => `err ${e}`,
)
```

`andThen` 的后续必须返回 `Result`。想在测试里强行取值，才用 `_unsafeUnwrap`；它在 Err 上会抛库自定义错误，源码注释写明只给测试环境。

### 案例 2：Promise 进来必须先选包装

```ts
import { ResultAsync } from "neverthrow"

const trusted = ResultAsync.fromSafePromise(Promise.resolve(1))
const guarded = ResultAsync.fromPromise(
  fetch("/api"),
  (e) => String(e),
)
```

`trusted` 假定 Promise 不会 reject；一旦 reject，这条 `ResultAsync` 会变成 rejected Promise，而不是 `Err`。需要把拒绝收进 `E` 时用 `fromPromise`。

### 案例 3：safeTry 串多个可能失败的步骤

```ts
import { safeTry, ok, err } from "neverthrow"

const run = safeTry(function* () {
  const a = yield* ok(1)
  const b = yield* (a > 0 ? ok(a + 1) : err("bad"))
  return ok(b)
})
```

`yield*` 走 `Ok`/`Err` 的 iterator：Ok 继续拿 `value`，Err 把失败交给 `safeTry`。这是同步控制流，不是 [[effect]] 的 Fiber。

## 踩过的坑

1. **把 Result 当成 `{ success, data }`**：这里是 class。`result.value` 在 Err 上不存在于类型收窄之后。
2. **信任 `andTee` 的回调**：Ok/Err 的 `andTee` / `orTee` 都 `try/catch` 后忽略异常，返回值不变。
3. **`combine` 当“收集全部错误”**：它在第一个 Err 处 `break`。要全部错误用 `combineWithAllErrors`。
4. **`fromSafePromise(fetch(...))`**：网络失败会 reject，不会变成 `Err`。
5. **在生产路径 `_unsafeUnwrap`**：Err 分支会抛，等于绕开 Result。

## 适用 vs 不适用场景

**适用**：

- Node `>=18` 的 TypeScript 项目，想把函数失败写成返回值
- 同步校验 / 解析管道，后续用 `andThen` 拼起来
- 需要 `ResultAsync` 把 Promise 收成 `Result`，并自己提供 `errorFn`

**不适用**：

- 还要跟踪依赖、Scope 和结构化并发——那是 [[effect]]
- 主要问题是输入形状——先看 [[zod]] / [[valibot]]，Result 不验 schema
- 想用 `_tag` 字面量联合做穷尽检查——本库是 class，不是可辨识联合
- 需要本轮未测的 bundle 数字

## 固定版本边界

- 本文绑定 `supermacro/neverthrow@1d4cc19e...`，tag `v8.2.0` 剥开后与 npm `gitHead` 均为该提交。
- package 版本 `8.2.0`，`engines.node` 为 `>=18`。
- 公开入口在 `src/index.ts`：同步 `Result` 与 `ResultAsync` 两套 API。
- `ResultAsync.safeUnwrap` 已标 deprecated，将在 9.0.0 移除。
- 未安装依赖、运行 vitest 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **失败可以是值**：Ok/Err class 把控制流留在返回值上
2. **异步要显式选包装**：不 catch 的 Promise 不是 Result
3. **tee 不是事务**：挂钩抛错被吞掉，主结果不变
4. **Result 不是 Effect**：没有 `R`、没有 Scope，也没有 Fiber

## 应用型自测

1. `Result.combine([ok(1), err("a"), err("b")])` 的错误是 `"a"`、`"b"`，还是两者都在？
2. `ResultAsync.fromSafePromise(Promise.reject(new Error("x")))` 会得到 `Err` 吗？
3. Ok 上的 `andTee(() => { throw new Error("boom") })` 之后，还能 `isOk()` 吗？

检查点：

1. 只有 `"a"`。`combine` 在第一个 Err 停。
2. 不会自动变成 `Err`。`fromSafePromise` 不 catch。
3. 能。`andTee` 吞掉抛错，仍返回原来的 Ok。

## 延伸阅读

- 仓库：[github.com/supermacro/neverthrow](https://github.com/supermacro/neverthrow)
- 固定源码：本文绑定 `1d4cc19ed2e6ba882e296385fe0175d642ec8c5d`
- 审查记录：仓库内 `docs/result-effect-source-review-20260827-ed.md`
- [[effect]] —— 同主题的重型对照：错误 + 依赖 + 资源
- [[zod]] —— schema leftover：形状校验，不是 Result 控制流

## 关联

- [[effect]] —— Result 只管 `T`/`E`；Effect 再加 `R`、Scope、Fiber
- [[zod]] —— 输入形状；通过后再用 neverthrow 表达业务失败
- [[valibot]] —— 模块化 schema 对照
- [[arktype]] —— 另一条 schema 语法
- [[effect-handlers]] —— 语言级效应，对照库级 Result
