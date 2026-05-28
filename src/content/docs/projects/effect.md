---
title: "Effect-TS — 函数式错误 + 资源管理的另一个未来"
description: 把 Promise 升级成 Effect 类型，把 throw 换成可追踪 cause，把 try/finally 换成自动资源清理
sidebar:
  order: 30
  label: "Effect-TS/effect"
---

> Effect-TS/effect v3.21.2（2026-05），MIT。
> 项目类型：**v1.1 分支 B 工具库**（生态大但 API 表面相对收敛）。
>
> Effect 是 TypeScript 生态里**最有野心的尝试**——把整个 JS 程序的副作用、错误、依赖、并发
> 都重新设计在一个统一的类型上：`Effect<A, E, R>`。
> A = 成功值、E = 可能错误、R = 依赖。
>
> 它不是库——它是**另一种写 TS 的方式**。
> 学习曲线极陡，但学完后你看 Promise / try-catch 的眼神都会变。
>
> Season 5 收尾——验证与可靠性的极致案例。

## 一句话定位

**Effect = 一个把副作用、错误、依赖三件事都在类型层面表达的运行时。**
你写 `Effect<User, NotFoundError | NetworkError, Database>`，TS 编译期就告诉你这段代码
**产出什么类型、可能哪些错误、需要哪些依赖**。代码的可靠性从"运行时检查"前移到"编译时保证"。

> 注意参数顺序：源码里的签名是 `Effect<out A, out E = never, out R = never>`，
> A 在前。早期文档常写 `Effect<R, E, A>`（旧顺序），新版本统一为 A/E/R。
> 锚定：[Effect.ts:111](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Effect.ts#L111)。

## Why（为什么是它而不是 Promise + try/catch）

JS/TS 当前的"副作用 + 错误"模型：

```typescript
async function getUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`)   // 可能 NetworkError
  if (!res.ok) throw new NotFoundError()         // 可能 NotFoundError
  const data = await res.json()                  // 可能 ParseError
  if (!isValidUser(data)) throw new ValidationError()
  return data
}
```

**问题清单**：

1. **类型上看不出会抛什么错**——`Promise<User>` 没说错误类型
2. **try/catch 是动态的**——你 catch 一个 Error，类型是 `unknown`
3. **依赖注入靠 import**——`fetch` 写死，测试要 mock 全局
4. **资源清理靠 try/finally**——容易忘
5. **并发原语贫乏**——Promise.all 一个失败全部停，Promise.allSettled 错误处理冗长
6. **取消（cancellation）几乎没有**——AbortController 是补丁，不是范式

Effect 的回答：**把这些都做在一个类型里**。

```typescript
import { Effect, Layer } from 'effect'

const getUser = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Database
    const cache = yield* Cache
    const cached = yield* cache.get(id)
    if (cached) return cached
    const user = yield* db.findUser(id)
    yield* cache.set(id, user)
    return user
  })
// 类型自动推断为：Effect<User, DbError | CacheError, Database | Cache>
```

这个类型告诉你：
- **A = User**——成功时返回 User
- **E = DbError | CacheError**——可能抛这两种错（被消费者必须处理）
- **R = Database | Cache**——这个函数运行时必须有 Database 和 Cache 两个 service

| 维度 | Promise + try/catch | Either + Result | **Effect** |
|---|---|---|---|
| 错误类型 | `Error \| unknown` | `Either<E, A>` 静态 | **静态 + 可组合** |
| 依赖 | 隐式（import） | 隐式 | **`R` 类型显式** |
| 资源管理 | try/finally | 手动 | **scope-bound** |
| 并发 | Promise.all | 手动 | **Fiber + 结构化并发** |
| 取消 | AbortController | 手动 | **内置** |
| 重试 | 自己写 | 自己写 | **`retry(schedule)`** |

**为什么不是 Promise**：Promise 是 2015 年的产物，**只解决了异步顺序**。错误、依赖、取消、资源——
JS 一直没有标准答案。

**为什么不是 fp-ts**：fp-ts 是 Effect 的前身（同作者 Giulio Canti）。
fp-ts 是**纯类型系统**——`Either / Task / IO / TaskEither`。
Effect 是 fp-ts 的合并 + 工程化——**一个 Effect 类型涵盖所有**。
fp-ts 团队和 Effect 团队合并了。

**为什么不是 Result 类型（neverthrow / true-myth）**：
Result/Either 解决了"错误类型化"，但**只解决一件事**。Effect 解决错误 + 依赖 + 资源 + 并发——
**对完整应用的全套答案**。

**Effect 的代价**：
- **学习曲线极陡**——要理解 Fiber、Layer、Scope、Schedule、Cause 等十几个概念
- **生态新**——很多库还没 Effect 适配
- **团队投入大**——选 Effect 是技术栈决策，不是引一个库
- **代码风格独特**——团队成员要培训

## 一图看懂 · Effect vs Promise 的三个差异

![Effect vs Promise — 三件事的哲学差异](/projects/effect/01-effect-vs-promise.webp)

**怎么读这张图**（核心是右栏比左栏多了什么）：

- 左栏 Promise 把所有"会失败的方式"压扁到 `throw + try/catch`，调用方拿到的是 `unknown`，
  TS 没法静态告诉你"这里要处理 NotFoundError 还是 ParseError"
- 右栏 Effect 把这件事拆成 `Effect<A, E, R>` 三个类型参数，每个参数对应一个工程问题：
  - **A** 是"成功时拿到什么"——和 Promise 没差
  - **E** 是"失败时可能是哪些类型"——这是 Promise 缺失的轴
  - **R** 是"运行需要外部提供什么 service"——把 DI 提到类型层
- 底部三个 Diff Axis 总结**三件不同**：类型表达 / 求值时机（eager vs lazy）/ 失败模型
- 求值时机这一轴最容易被忽视——Promise 一出生就开跑，Effect 是个**值**，
  必须 `runPromise` 才执行；这导致整个 dev tool / 调试范式都不一样

> 怀疑 1：图里把 Effect 描成"什么都好"，但右栏的 `Effect.gen + yield*` 语法
> 是 generator-based，**每次组合都要付出 generator 的开销**。微基准上 Promise 仍然更快，
> Effect 团队的回答是"runtime 优化能抹平 90%"——这是个**有待验证**的承诺，
> 在热路径（如每秒 10w QPS 的 hot loop）上不要轻信。

## 仓库地形（v1.1 分支 B 工具库）

```
effect/
└── packages/
    ├── effect/                          ← ★ 主包
    │   └── src/
    │       ├── Effect.ts                ← 14815 行：核心 API（命名空间 + dispatcher）
    │       ├── Cause.ts                 ← 1555 行：错误代数（Empty/Fail/Die/Interrupt/Seq/Par）
    │       ├── Runtime.ts               ←  383 行：把 Effect 跑起来的执行环境
    │       ├── Layer.ts                 ← 1280 行：依赖注入（Layer<ROut, E, RIn>）
    │       ├── Fiber.ts                 ←  744 行：fiber 原语（结构化并发）
    │       ├── Scope.ts                 ←  204 行：资源生命周期容器
    │       ├── Stream.ts                ← 6468 行：响应式数据流
    │       ├── Schema.ts                ← 10914 行：schema 系统（同 zod）
    │       ├── Context.ts               ← 依赖容器（Tag）
    │       ├── Schedule.ts              ← 重试 / 节流策略
    │       └── ...                      ← 总共 177 个文件
    ├── platform/                        ← 跨 runtime 适配（Node / Bun / browser）
    ├── platform-node/
    ├── platform-bun/
    ├── platform-browser/
    ├── ai/                              ← LLM 适配（OpenAI / Anthropic）
    ├── sql / sql-pg / sql-mysql2 / ...  ← SQL adapter
    ├── cluster/                         ← 分布式
    └── experimental/                    ← 实验性
```

**心脏文件清单（工具库 = 2-3 个；这里取 4 个，因为 Cause 和 Layer 互不可少）**：

1. `packages/effect/src/Effect.ts`（14815 行）—— 所有 Effect API 的入口
   永久链接：[Effect.ts:111](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Effect.ts#L111)
2. `packages/effect/src/Cause.ts`（1555 行）—— 错误为什么是代数和而不是单个 Error
   永久链接：[Cause.ts:254](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Cause.ts#L254)
3. `packages/effect/src/Runtime.ts`（383 行）—— Effect 描述的"执行器"，整个程序唯一的入口
4. `packages/effect/src/Layer.ts`（1280 行）—— 类型安全 DI 的实现

**注意**：14815 行的 `Effect.ts` **不是该 hard read** 的。它是一个**命名空间** + **dispatcher**——
所有具名 API（`succeed` / `fail` / `gen` / `runPromise` ...）的 re-export 和类型签名都在这里。
真正的 implementation 散在 `internal/core.ts` / `internal/fiberRuntime.ts` 里。
这一篇笔记重点是**理解概念 + 设计判断**，不是逐行精读。

> 怀疑 2：把"Effect 是工具库"这件事打个问号——Effect 自己有 sql / cluster / ai / experimental 等
> 18 个子包，已经远超"工具库"的传统定义（zustand / swr 都是单仓单包）。
> 我把它归到分支 B 是因为**核心 API 表面（Effect / Cause / Layer / Fiber 四件套）足够收敛**，
> 子包是按"垂直场景"扩展，不是把核心抽象层层加厚。但如果你只看 `packages/` 树状图，
> 它更像一个 monorepo 框架——分类标签的边界本来就是模糊的。

## 核心机制 · Layer 3 精读（≥ 3 段）

工具库的 L3 标准：≥ 3 段，每段 30+ 行真实代码 + ≥ 5 旁注 + 1 怀疑。
下面三段对齐**心脏**：(1) Effect 类型 / (2) Cause 错误代数 / (3) Layer DI + Scope 资源管理。

### 段 1 · `Effect<A, E, R>` 三参类型（vs `Promise<A>`）

源码锚定：[Effect.ts:107-117](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Effect.ts#L107-L117)。
原文 30+ 行 TS：

```typescript
// 源码核心声明（见上方 permalink）：
// export interface Effect<out A, out E = never, out R = never>
//   extends Effect.Variance<A, E, R>, Pipeable {
//   readonly [Unify.typeSymbol]?: unknown
//   readonly [Unify.unifySymbol]?: EffectUnify<this>
//   readonly [Unify.ignoreSymbol]?: EffectUnifyIgnore
//   [Symbol.iterator](): EffectGenerator<Effect<A, E, R>>
// }

// 用法 1: 最小 Effect —— 等同于 Promise.resolve(42)
import { Effect } from 'effect'

const ok: Effect.Effect<number, never, never> = Effect.succeed(42)
// E = never  -> 一定不会失败
// R = never  -> 不需要任何依赖

// 用法 2: 带错误类型 —— 等同于 throw NotFoundError
class NotFoundError {
  readonly _tag = 'NotFoundError'
}

const findById = (id: string): Effect.Effect<string, NotFoundError, never> =>
  id === '1' ? Effect.succeed('Jason') : Effect.fail(new NotFoundError())

// 用法 3: 带依赖类型 —— 把 Database 提到类型层
class Database extends Context.Tag('Database')<
  Database,
  { findUser: (id: string) => Effect.Effect<string, NotFoundError, never> }
>() {}

const program = Effect.gen(function* () {
  const db = yield* Database              // 从 Context 取依赖
  const name = yield* db.findUser('1')    // E 自动 union 到 NotFoundError
  return `Hello ${name}`
})
// program 类型推断: Effect<string, NotFoundError, Database>

// 用法 4: 必须显式 run 才执行（lazy）
// 注意：Effect 是个值，下面这行**什么也不会发生**
const _ignored = Effect.succeed(42).pipe(Effect.tap(() => {
  console.log('only fires when run')
}))

// Effect.runPromise 是兑现的入口
await Effect.runPromise(Effect.succeed(42))  // -> 42
```

**旁注（≥ 5 条）**：

1. **A/E/R 顺序**：源码 `<out A, out E = never, out R = never>`，A 在前。早期 docs 写 `<R, E, A>`
   是因为遵循 ZIO（Scala）传统，**新版本统一翻成 A/E/R**——你看到旧博客里 `<R, E, A>` 不要慌，
   那是 v1.x 时代的产物。
2. **`out` 协变标记**：三个参数都是 `out`，意味着 `Effect<Cat, never, never>` 可以赋值给
   `Effect<Animal, never, never>`——和 Promise 的 covariance 一致。
3. **`never` 默认值**：E 和 R 默认 `never`，所以 `Effect<number>` 等价 `Effect<number, never, never>`，
   表达"不会失败、不需依赖"。
4. **`[Symbol.iterator]`**：Effect 实现了 iterator 协议——这是 `Effect.gen(function* () { yield* ... })`
   能工作的原因，**generator 是 do-notation 的廉价模拟**。
5. **lazy 语义**：和 Promise 最大的范式差。Promise 一构造就开始跑，Effect 是个**纯描述**，
   `runPromise` 才把它推进 Runtime——这导致**调试时不能直接看一个变量值，必须 run 才知道**。
6. **`Pipeable` 接口**：Effect 实例都带 `.pipe(...)` 方法，链式组合不需要全局 `pipe()` helper。

**怀疑 3**：lazy 这件事在生产里可能**反而是负担**——
Promise 出来这么多年，整个生态（DevTools、async stack trace、profiler、APM）
都假设"async 边界 = 立即执行"。Effect 把执行推迟到 runPromise，
**async stack trace 在 Chrome DevTools 里会断**（fiber 不在 V8 的 microtask 队列里）。
官方有 `Effect.withSpan` 接 OpenTelemetry，但**默认 DevTools 体验是退化的**。

### 段 2 · `Cause<E>` —— 错误为什么必须是代数和

源码锚定：
- `Cause` 类型定义：[Cause.ts:254-263](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Cause.ts#L254-L263)
- 六个变体定义：[Cause.ts:455-562](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Cause.ts#L455-L562)

原文 30+ 行 TS：

```typescript
// 源码（节选自 Cause.ts:254）：
// export type Cause<E> =
//   | Empty
//   | Fail<E>
//   | Die
//   | Interrupt
//   | Sequential<E>
//   | Parallel<E>

// 六个变体的语义：
// - Empty:       没失败（可能因为被中断了）
// - Fail<E>:     业务错误（你 Effect.fail 进去的）
// - Die:         编程错误（throw 进 Effect 的非 Error / 非预期）
// - Interrupt:   fiber 被中断了
// - Sequential:  顺序发生的两个错（main + finalizer）
// - Parallel:    并发发生的两个错（Effect.all concurrent 时双失败）

// 实际场景：runPromise 失败后拿到的是 Cause，不是 Error
import { Effect, Cause } from 'effect'

const program = Effect.fail('biz error')

await Effect.runPromiseExit(program).then((exit) => {
  if (exit._tag === 'Failure') {
    const cause: Cause.Cause<string> = exit.cause
    // 用 reduce 处理所有变体（穷尽性 union）
    const message = Cause.match(cause, {
      onEmpty: 'no error',
      onFail: (e) => `biz: ${e}`,
      onDie: (defect) => `defect: ${String(defect)}`,
      onInterrupt: (fiberId) => `interrupted by fiber ${fiberId}`,
      onSequential: (l, r) => `seq(${l}, ${r})`,
      onParallel: (l, r) => `par(${l}, ${r})`,
    })
    console.log(message)
  }
})

// 双失败场景：finalizer 也炸了
const buggy = Effect.fail('main').pipe(
  Effect.ensuring(Effect.die('finalizer also exploded'))
)
// 这里 cause 会是 Sequential(Fail('main'), Die('finalizer also exploded'))
// —— 两个错都被保留，没有一个被另一个吞掉
```

**旁注（≥ 5 条）**：

1. **Fail vs Die 的区分是 Effect 范式的精髓**——业务错误（你预期的、要让调用方处理的）
   和 defect（你没预期的 bug）**应该走两条路**。Promise 把它们都塞进 `catch` 里，
   导致"我到底是该重试还是该报警"这件事**只能靠运行时判断**。
2. **Sequential / Parallel 是结构化并发的产物**——一个 fiber 失败、它的 finalizer 又失败，
   传统 async 里第二个错会**完全吞掉**第一个。Cause 用 Sequential 把两个都串起来。
3. **Empty 不是 bug**——一个被中断的 fiber 可能"还没失败就被取消了"，Cause 必须能表达
   "我没失败，但我也没成功"。Promise 的 `Promise.reject(undefined)` 是个能塞 undefined 的退化版。
4. **Die 接 unknown 不是 Error**——因为 JS 允许你 `throw "oops"`、`throw 42`，
   非 Error 的 throw 也要能装进来；`Die.defect: unknown` 就是这个口子。
5. **`_tag` 字段是 discriminated union 的关键**——Effect 全栈用 `_tag` 做穷尽性，
   TS 4.9+ 的 `satisfies` 能在编译期验证 `Cause.match` 没漏分支。
6. **`Cause.fail` ≠ `Effect.fail`**——前者构造 `Cause<E>` 值（一般在测试里用），
   后者构造 `Effect<never, E, never>`。锚定：[Cause.ts:591](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Cause.ts#L591)。

**怀疑（段 2 内）**：Sequential / Parallel 在调试时是**好事还是坏事**有争议。
好处是"两个错都不丢"。坏处是**报错文案膨胀**——一个并发任务失败，你的 Sentry log 里
出现 `Parallel(Fail('A'), Sequential(Fail('B'), Die(TypeError)))` 这种嵌套字符串，
新人看了头大。Effect 团队的回答是"`Cause.pretty` 能格式化"，
但**生产 log pipeline 怎么处理嵌套 cause** 没有标准答案。

### 段 3 · Layer DI + Scope 资源管理（替换 try-finally）

源码锚定：
- Layer 类型：[Layer.ts:65](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Layer.ts#L65)
- Scope 接口：[Scope.ts:51](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Scope.ts#L51)
- acquireRelease：[Effect.ts:5453](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Effect.ts#L5453)

原文 30+ 行 TS：

```typescript
// 源码核心声明：
// export interface Layer<in ROut, out E = never, out RIn = never>
//   extends Layer.Variance<ROut, E, RIn>, Pipeable {}
// export interface Scope extends Pipeable { ... addFinalizer(...): ... }

import { Effect, Layer, Context, Scope } from 'effect'
import * as fs from 'node:fs/promises'

// 1. 定义服务接口（在 Context 注册一个 Tag）
class FileLog extends Context.Tag('FileLog')<
  FileLog,
  { write: (line: string) => Effect.Effect<void> }
>() {}

// 2. 不要这样写（传统 try-finally）：
async function bad() {
  const fh = await fs.open('/tmp/app.log', 'a')
  try {
    await fh.write('line\n')
  } finally {
    await fh.close()                  // 容易忘 / 嵌套时混乱
  }
}

// 3. Effect 写法：acquireRelease 把"获取/释放"绑成一个 Scoped Effect
const openLog = Effect.acquireRelease(
  Effect.tryPromise(() => fs.open('/tmp/app.log', 'a')),
  (fh) => Effect.promise(() => fh.close())          // 永远会跑（即使中间出错）
)
// openLog 的类型: Effect<FileHandle, UnknownException, Scope>
// R 里多了 Scope —— 必须在某个 Scope 内运行才能得到资源

// 4. 把 acquireRelease 包成 Layer，让它能被 Effect.provide
const FileLogLive = Layer.scoped(
  FileLog,
  Effect.gen(function* () {
    const fh = yield* openLog                       // 注册到当前 Scope
    return { write: (line) => Effect.promise(() => fh.write(line + '\n')) }
  })
)

// 5. 业务代码不需要知道 close —— Scope 关闭时自动 finalizer
const app = Effect.gen(function* () {
  const log = yield* FileLog
  yield* log.write('hello')
  yield* log.write('world')
  // 函数结束 -> Scope 关闭 -> fh.close() 自动跑
})

// 6. 跑起来
await Effect.runPromise(
  app.pipe(Effect.provide(FileLogLive))             // ← 注入
)
// 类型: Effect<void, UnknownException, never>
//      —— R 已经是 never，所有依赖都被 provide 解决了
```

**旁注（≥ 5 条）**：

1. **Layer 的三参数 `<ROut, E, RIn>` 是 Effect 三参的镜像**——
   ROut = 这个 Layer 提供什么 service / E = 构建过程可能失败 / RIn = 构建需要哪些前置 service。
   于是 `Layer<Database, ConnectError, Config>` 的字面意思是
   "用 Config 来构造 Database，可能 fail with ConnectError"。
2. **Scope 不是手动管理**——你几乎从不直接写 `Scope.make()`，而是通过 `Layer.scoped`
   或 `Effect.acquireRelease` 间接绑定。这是 Effect 的**控制反转**：你声明"用什么资源"，
   Effect 决定"什么时候关"。
3. **finalizer 在 fail / interrupt 都会跑**——这是替换 try-finally 的关键。
   `try { } finally { }` 在 async 里碰到 unhandled rejection 不可靠，
   `acquireRelease` 因为接管了 fiber 的取消传播，**保证** finalizer 跑（除非 process 直接 SIGKILL）。
4. **Layer 是可组合的**：`Layer.merge(A, B)` / `Layer.provide(A, B)`（A 用 B 构建）。
   这让"DI 容器"变成一个**值表达式**，而不是配置文件——
   测试时你 `Layer.merge(DatabaseTest, CacheTest)` 替换生产 Layer 即可。
5. **vs NestJS DI**：NestJS 用反射 + 装饰器，**运行时**才知道循环依赖；Layer 是**编译时**——
   忘了 provide，TS 报"Effect 的 R 还有未消除的 service"。
6. **vs `using` 声明（TC39 stage 3）**：JS 原生 `using fh = await fs.open(...)` 也能 RAII 风格清理资源，
   但**只在同步词法块**内有效，**跨 await/yield 边界不行**；Effect 的 Scope 跨 fiber、跨 await 都有效。

**怀疑（段 3 内）**：`Layer.scoped` 这套抽象**需要团队全员理解 Scope/Fiber/Cause**，
新人没理解透就维护代码 → 写出"我以为 Layer 是个 factory"的反模式（每次调用重新构造资源、
finalizer 永远跑不到）。**学习曲线陡和资源泄漏的概率成反比**。
小团队选 Effect 前，**先问"我们有 1 个人愿意当 Effect champion 持续答疑吗"**。

## 改一处（Hands-on · v1.1 分支 B 必做）

**目标**：把一段传统 `try-finally` 重构成 `Effect.acquireRelease`，看资源清理保证。

```bash
mkdir effect-scope-demo && cd effect-scope-demo
npm init -y
npm install effect tsx
```

写 `before.ts`（传统写法）：

```typescript
import * as fs from 'node:fs/promises'

async function appendThenFail() {
  const fh = await fs.open('/tmp/effect-demo.log', 'a')
  try {
    await fh.write('line A\n')
    throw new Error('boom in middle')   // 故意失败
    await fh.write('line B\n')
  } finally {
    console.log('[before] closing fh')
    await fh.close()
  }
}

await appendThenFail().catch((e) => console.error('[before] caught:', e.message))
```

写 `after.ts`（Effect 写法）：

```typescript
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'

const openFile = (path: string) =>
  Effect.acquireRelease(
    Effect.tryPromise(() => fs.open(path, 'a')),
    (fh) => Effect.promise(async () => {
      console.log('[after] closing fh')
      await fh.close()
    })
  )

const program = Effect.gen(function* () {
  const fh = yield* openFile('/tmp/effect-demo.log')
  yield* Effect.promise(() => fh.write('line A\n'))
  yield* Effect.fail(new Error('boom in middle'))    // 故意失败
  yield* Effect.promise(() => fh.write('line B\n'))  // 不会跑
})

// scoped 把 program 内创建的 Scope 收尾
await Effect.runPromiseExit(Effect.scoped(program)).then((exit) => {
  console.log('[after] exit:', exit._tag)
})
```

跑两个：

```bash
npx tsx before.ts
# [before] closing fh
# [before] caught: boom in middle

npx tsx after.ts
# [after] closing fh
# [after] exit: Failure
```

**观察点**：

1. 两边都把 `fh.close()` 跑到了——**finalizer 等价 try-finally**
2. 但 after 的 `closing fh` log 是 Scope 自己安排的，**业务代码里没有 finally 块**
3. 试着把 after.ts 里的 `Effect.fail` 换成 `Effect.interrupt`——finalizer 仍然跑（中断也是 Cause）
4. 试着多开一个 file（`yield* openFile('/tmp/b.log')`）——**两个 fh 都会自动 close**，
   而且**关闭顺序是 LIFO**（后开的先关），传统 try-finally 嵌套两层就乱

**path:line 锚定一处源码**：
`packages/effect/src/Effect.ts:5453` —— `acquireRelease` 的类型签名告诉你
**结果 R 一定多了 `Scope.Scope`**，没有 Scope 的环境拿不到资源。这是类型驱动的 RAII。

## 横向对比 · Layer 5

### vs Promise + try/catch — 最大的对比

Promise 简单、生态成熟、所有 JS 程序员会用。
Effect 复杂、生态新、要培训。

**Effect 在大型应用赢的场景**：
- 复杂错误处理（多种错、分层、不同响应策略）
- 需要 mock 测试的代码（Layer 让 mock 是类型安全的）
- 高并发（结构化并发 + 取消）
- 长期维护的关键服务

**Promise 在简单场景赢**：
- 写个表单提交
- 内部小工具
- 团队没 FP 经验

### vs fp-ts — 同源演化

fp-ts 是 Effect 之前的尝试。后来 fp-ts 团队加入 Effect，**fp-ts 的精神在 Effect 里延续**。

如果你已经用 fp-ts，迁移 Effect 是同流派演化。
如果你从 zero 开始——选 Effect。

### vs Result libraries（neverthrow / ts-results） — 单点 vs 全套

neverthrow 给你 `Result<T, E>` 替代 Promise，**只解决错误类型化**。
Effect 解决错误 + 依赖 + 资源 + 并发——**完整运行时**。

如果你只要"错误更类型安全"，neverthrow 更轻。
如果你要"重新设计应用骨架"，Effect 更彻底。

### vs RxJS — 异步流的不同流派

RxJS 是 Observable 的 JS 实现。
Effect 的 Stream 是 Observable + 类型安全 + 取消 + 错误类型化。

RxJS 历史包袱大、操作符 100+，Effect Stream 操作符精简、类型友好。

→ 同生态位，Effect 现代化。

### vs ZIO（Scala） / Cats Effect / Haskell IO — 跨语言对照

Effect 不是 JS 的原创——**它是 ZIO 的 TS 移植**（命名都对得上：Effect/ZIO、Layer/ZLayer、Fiber/ZFiber）。
但 ZIO 因为 Scala 有 HKT、有真正的 typeclass，写起来更轻；TS 的 Effect 用大量
[条件类型 + variance hack](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Effect.ts#L111)
模拟出同样的表达力——**类型推断时间会比普通 TS 项目慢一截**。

### vs `using` 声明（TC39 stage 3） — 标准 vs 库

`using` 是 JS 原生的资源管理（`using fh = await fs.open(...)`）。**只在同步词法块内有效**，
跨 await / yield 边界不可靠。Effect 的 Scope 跨 fiber 跨 yield 都有效，但**代价是引一整套 runtime**。
**普通项目用 `using` 就够；要做并发安全的资源池才上 Effect**。

## 与你工作的连接 · Layer 6

**能立刻迁移**：

- 复杂业务流（订单 / 支付 / 用户管理）—— Effect 比 Promise + try/catch 写得清楚
- 测试场景：用 Layer mock service，不需要 jest.mock
- 高并发：结构化并发 + 自动取消是杀手锏

**下个月可能用到**：

- 给长流程 agent 工作流用 Effect ——可取消 / 错误分类 / 重试是 agent 应用刚需
- 把核心服务从 Express + Promise 重写成 Effect + Hono

**不要用 Effect 的部分**：

- **简单 CRUD / 表单 / 静态站点**——Promise 够用，引 Effect 是过度设计
- **团队没 FP 经验 + 没培训预算**—— learning cost 大
- **对 bundle size 敏感**——Effect 核心 ~50KB，对前端关键路径偏重

## 限制与边界

工具库分支 B 的"限制段"必须显式列：

1. **bundle size 50KB+**：tree-shaking 友好，但 generator runtime 不能消除。
   前端关键路径（首屏）禁用，后端 / 长生命周期 worker 才适合。
2. **TS 编译变慢**：项目用 Effect 后，`tsc --noEmit` 在中等仓库可能从 8s 涨到 30s，
   原因是 Effect 大量条件类型 + variance hack。**用 `tsc --incremental` + project references** 缓解。
3. **DevTools 体验退化**：fiber 不在 V8 microtask 队列里，async stack trace 会断；
   要用 `Effect.withSpan` 接 OTel 替代。
4. **没有 algebraic effects 真版本**：JS 没有原生 `handle/perform`，
   Effect 是用 generator + runtime 模拟，**不是语言级**——一旦 ECMAScript 真出 effects 提案，
   Effect 库会重写。
5. **错误信息嵌套**：`Cause.pretty` 输出会嵌套很深，生产 log pipeline 要专门处理。
6. **不适合 hot loop**：每次 `Effect.gen` 创建 generator 实例，**热路径 10w+/s 上不去**。

## 宣传 vs 现实附录

| 宣传 | 现实 |
|---|---|
| "Effect 把 JS 程序的所有副作用都搞定了" | 只对**新写**的代码成立；接老 Promise 代码要 `Effect.tryPromise` 包，wrap 多了 perf 不好 |
| "类型安全的 DI" | 编译期保证，但 IDE 在 `Effect.provide` 链里**类型 hover 体验非常长**，不友好 |
| "替代 RxJS" | Stream 概念上替代，但**生态适配少**——RxJS 在 Angular 是默认，Effect Stream 没那么大社区 |
| "结构化并发开箱即用" | 是真的，但你**必须改写**所有 Promise 代码才能享受；半 Effect 半 Promise 的项目最痛 |

## 读完你能做之前做不了的事

- **判断**：选语言/范式时，能在"实用主义 (Promise) vs 严谨 (Effect)" 之间做明智选择
- **设计**：写复杂系统时，第一直觉问"我的错误能不能类型化"
- **解释**：被问"代数效应是什么"时，能用 Effect 当 TS 实现的例子
- **下钻**：看懂 Haskell 的 monad / Scala 的 ZIO / Rust 的 ?——它们和 Effect 同思路
- **对照**：识别"我这个应用有没有 Effect 该用的痛点"——还是 Promise 就够

## 自检 · 5 个问题（必须自己能回答）

1. `Effect<A, E, R>` 三参顺序为什么是 A/E/R 而不是 R/E/A？查 [Effect.ts:111](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Effect.ts#L111) 看 `<out A, out E = never, out R = never>` 的 `out` 是什么意思。
2. Effect 是 lazy（不立即执行）vs Promise 是 eager。这个差异对 Chrome DevTools 调试和 OTel tracing 各有什么影响？
3. `Cause<E>` 的六个变体，哪两个对**业务-基础设施分层**最关键？为什么 Promise 没区分？
4. `Layer.scoped` 和 `Effect.acquireRelease` 的关系是什么？哪个更高层？为什么 Layer 一定要用 scoped 才能管资源？
5. 团队从 Promise 迁移到 Effect，**怎么设计渐进路径**？不可能一夜全切——`Effect.tryPromise` / `Effect.runPromise` 这两条边界怎么用？

## 延伸阅读

读完这篇笔记后下一步：

1. [Effect.website](https://effect.website)——官方文档（**先读这个再读源码**）
2. [packages/effect/src/Cause.ts:254](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Cause.ts#L254)——Cause 类型 6 个变体的精读
3. [packages/effect/src/Layer.ts:65](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Layer.ts#L65)——Layer 三参签名
4. [packages/effect/src/Scope.ts:51](https://github.com/Effect-TS/effect/blob/e5998a45f69960b38eb2b8cb67cbb07b9e6962c7/packages/effect/src/Scope.ts#L51)——Scope 接口完整声明
5. **fp-ts 文档**——理解 Effect 的前世
6. **Scala ZIO** / **Haskell IO monad**——同思想的不同语言实现
7. **algebraic effects** 论文（Plotkin / Pretnar）——Effect 的理论根

---

**笔记完成**：2026-05-28（v3.21.2 / commit `e5998a4`）
**项目类型**：v1.1 分支 B 工具库（API 表面收敛，子包是垂直扩展）
**研究方法**：本地克隆 + 阅读 packages/effect/src 4 个心脏文件 + 设计哲学分析 + 1 个 Hands-on 对比实验
**心脏文件**：`Effect.ts:111`（核心类型）/ `Cause.ts:254`（错误代数）/ `Layer.ts:65`（DI）/ `Scope.ts:51`（资源）
