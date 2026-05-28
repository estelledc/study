---
title: "Effect-TS — 函数式错误 + 资源管理的另一个未来"
description: 把 Promise 升级成 Effect 类型，把 throw 换成可追踪 cause，把 try/finally 换成自动资源清理
sidebar:
  order: 30
  label: "Effect-TS/effect"
---

> Effect-TS/effect v3.21.2（2026-05），MIT。
>
> Effect 是 TypeScript 生态里**最有野心的尝试**——把整个 JS 程序的副作用、错误、依赖、并发
> 都重新设计在一个统一的类型上：`Effect<R, E, A>`。
> R = 依赖、E = 可能的错误、A = 成功值。
>
> 它不是库——它是**另一种写 TS 的方式**。
> 学习曲线极陡，但学完后你看 Promise / try-catch 的眼神都会变。
>
> Season 5 收尾——验证与可靠性的极致案例。

## 一句话定位

**Effect = 一个把副作用、错误、依赖三件事都在类型层面表达的运行时。**
你写 `Effect<Database, NotFoundError | NetworkError, User>`，TS 编译期就告诉你这段代码
**需要哪些依赖、可能哪些错误、产出什么类型**。代码的可靠性从"运行时检查"前移到"编译时保证"。

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
// 类型自动推断为：Effect<Database | Cache, DbError | CacheError, User>
```

这个类型告诉你：
- **R = Database | Cache**——这个函数需要 Database 和 Cache 两个 service
- **E = DbError | CacheError**——可能抛这两种错（被消费者必须处理）
- **A = User**——成功时返回 User

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
Effect 团队和 fp-ts 团队合并了。

**为什么不是 Result 类型（neverthrow / true-myth）**：
Result/Either 解决了"错误类型化"，但**只解决一件事**。Effect 解决错误 + 依赖 + 资源 + 并发——
**对完整应用的全套答案**。

**Effect 的代价**：
- **学习曲线极陡**——要理解 Fiber、Layer、Scope、Schedule、Cause 等十几个概念
- **生态新**——很多库还没 Effect 适配
- **团队投入大**——选 Effect 是技术栈决策，不是引一个库
- **代码风格独特**——团队成员要培训

## 仓库地形

```
effect/
└── packages/
    ├── effect/                          ← ★ 主包
    │   └── src/
    │       ├── Effect.ts                ← 14815 行：核心 API
    │       ├── Layer.ts                 ← 1280 行：依赖注入
    │       ├── Fiber.ts                 ← 744 行：fiber 原语
    │       ├── Stream.ts                ← 6468 行：响应式数据流
    │       ├── Schema.ts                ← 10914 行：schema 系统（同 zod）
    │       ├── Context.ts               ← 依赖容器
    │       ├── Cause.ts                 ← 错误原因（错误链）
    │       ├── Channel.ts               ← Stream 底层抽象
    │       ├── Schedule.ts              ← 重试 / 节流策略
    │       ├── Cache.ts                 ← 内置缓存
    │       ├── Config.ts                ← 配置管理
    │       ├── Logger.ts                ← 日志
    │       ├── Tracer.ts                ← 分布式追踪
    │       └── ...                      ← 总共 177 个文件
    ├── platform/                        ← 跨 runtime 适配（Node / Bun / browser）
    ├── platform-node/
    ├── platform-bun/
    ├── platform-browser/
    ├── schema/                          ← Schema 单独包
    ├── sql-pg / sql-mysql / sql-mssql / ← SQL adapter
    ├── cluster/                         ← 分布式
    └── experimental/                    ← 实验性
```

**心脏文件**：

1. `packages/effect/src/Effect.ts` (14815 行)——所有 Effect API 的入口
2. `packages/effect/src/Fiber.ts` (744 行)——fiber 是 Effect 的"线程"
3. `packages/effect/src/Layer.ts` (1280 行)——依赖注入

**注意**：14815 行 `Effect.ts` 不是该 hard read 的。这一篇笔记重点是
**理解概念 + 设计判断**，不是精读代码。

## 核心机制 · Layer 3 精读

### 机制 1 · `Effect<R, E, A>` 类型

```typescript
type Effect<Requirements, Error, Success>
```

**这是 Effect 的核心抽象**。任何"会做事"的函数都返回 Effect：

```typescript
// 不再是
function getUser(id: string): Promise<User>

// 而是
function getUser(id: string): Effect<Database, DbError, User>
```

**编译期保证**：

- `Database` 在 R 中——这个函数运行时必须有 Database 实例
- `DbError` 在 E 中——调用方必须处理 DbError
- `User` 在 A 中——成功时返回 User

**runtime 保证**：

- 这个 Effect **不会立即执行**——它是个**值**，描述"将要做什么"
- 你必须 `Effect.runPromise(...)` 或 `Effect.runSync(...)` 才执行

→ 这就是**纯函数式**：把"执行"和"描述"分开。
你的整个程序构建一个巨大的 Effect 值（不会有副作用），最后**只在程序入口**运行一次。

### 机制 2 · 错误是值，不是 throw

```typescript
const program = Effect.gen(function* () {
  const user = yield* getUser('1')        // 可能 DbError
  return user.name
})
// 类型：Effect<Database, DbError, string>

// 处理错误：类型驱动
const safe = program.pipe(
  Effect.catchTag('DbError', (err) => Effect.succeed('Anonymous'))
)
// 类型：Effect<Database, never, string>     ← 错误已被处理
```

**关键**：错误类型是 union（`DbError | NotFoundError | ...`），处理一个就从 union 里去掉。
TS 能精确追踪"还没处理什么错误"。

→ 这和 Rust 的 `Result<T, E>` 同思路。但 Rust 是语言级支持，Effect 把它做在 TS 库里——
**通过类型系统模拟出代数效应（algebraic effects）**。

### 机制 3 · Cause —— 错误的完整原因

普通 JS：

```typescript
try {
  await doStuff()
} catch (err) {
  console.error(err)   // 一个 Error，可能丢失上下文
}
```

Effect：

```typescript
Effect.runPromise(program).catch((cause: Cause<DbError>) => {
  // cause 是结构化的：
  // - Fail: 业务错误（DbError）
  // - Die: 编程错误（throw 进来的非 Error）
  // - Interrupt: 取消
  // - Sequential: 多个错误顺序发生
  // - Parallel: 多个错误并发发生
})
```

**Cause** 不是 Error——它是**所有可能"失败方式"的代数和**。

→ 处理"两个并发任务都失败"的传统代码极丑。Effect 的 `Cause.parallel`
让你能描述"两个错都重要，都要 log"。

### 机制 4 · Fiber —— 协作式调度的"绿色线程"

```typescript
const fiber = yield* Effect.fork(longRunning)  // 不阻塞，启个 fiber
yield* Effect.sleep('1 second')
yield* Fiber.interrupt(fiber)                  // 取消那个 fiber
```

**Fiber** 是 Effect 的执行单位——比 Promise 更细粒度，比 OS 线程更轻量。

特性：
- **可中断**：`Fiber.interrupt(f)` 会把信号传到 fiber 内的所有阻塞点
- **结构化并发**：父 fiber 取消时，子 fiber 自动取消
- **资源清理**：fiber 退出时自动跑 finalizer

→ 这是**Erlang 进程 / Go goroutine 的精神**带到 TS。
不要再用 Promise + AbortController 这种补丁。

### 机制 5 · Layer —— 类型安全的依赖注入

```typescript
const DatabaseLive = Layer.succeed(
  Database,
  {
    findUser: (id: string) => Effect.tryPromise(() => pgClient.query(...))
  }
)

const main = program.pipe(
  Effect.provide(DatabaseLive)            // ← 注入 Database
)
// 类型：Effect<never, DbError, User>     ← R 中已不再有 Database
```

**关键**：注入后，类型 `R` 减少。**TS 编译期跟踪**"还有哪些依赖没注入"。
所有依赖注入完才能 run。

→ 这把"DI 容器"做到类型层面。Spring DI / NestJS DI 是运行时反射，
Effect 是**编译期检查**——忘了注入直接报类型错。

### 机制 6 · Schema —— 同 zod 但更深度集成

```typescript
import { Schema } from 'effect'

const User = Schema.Struct({
  id: Schema.String,
  age: Schema.Number.pipe(Schema.greaterThan(0))
})

type User = Schema.Schema.Type<typeof User>

const decode = Schema.decode(User)
const result = yield* decode(rawData)    // Effect<never, ParseError, User>
```

和 zod 不同：**`decode` 返回 Effect**，可以和其他 Effect 组合。

→ 这是 Effect 的"全套吞噬"——它不仅做副作用、还做 schema、缓存、配置、日志、追踪。
**一旦你信仰 Effect，整个工具链都换**。

### 机制 7 · Stream —— Observable 的更强版

```typescript
const stream = Stream.fromIterable([1, 2, 3]).pipe(
  Stream.mapEffect(n => Effect.succeed(n * 2)),
  Stream.tap(n => Console.log(`Got ${n}`))
)
```

Stream 是 Effect 化的 Observable / async iterator——**可取消、有错误类型、可重试、有 backpressure**。

→ 比 RxJS 更类型安全，比 async iterator 更强大。
代价是又一组概念要学。

## 横向对比

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

### vs Mastra / LangChain（同样想做 framework） — 不同领域

Mastra / LangChain 想做 LLM 应用框架。
Effect 想做**通用应用框架**——不只是 LLM。

但 Effect 也有 AI 工具集成（[effect-ai](https://github.com/Effect-TS/effect/tree/main/packages/ai)）——
**Effect 信仰者用 Effect 做 LLM 也是合理选择**。

## Hands-on（10 分钟内能跑）

```bash
mkdir effect-demo && cd effect-demo
npm init -y
npm install effect
```

写 `index.ts`：

```typescript
import { Effect, Console } from 'effect'

// 1. 简单 Effect
const program = Effect.succeed(42).pipe(
  Effect.tap(n => Console.log(`Got ${n}`)),
  Effect.map(n => n * 2)
)
const result = await Effect.runPromise(program)
console.log('Result:', result)
// 输出：Got 42 / Result: 84

// 2. 错误处理
class NotFoundError extends Error {
  readonly _tag = 'NotFoundError'
}

const findUser = (id: string) => {
  if (id === '1') return Effect.succeed({ id: '1', name: 'Jason' })
  return Effect.fail(new NotFoundError())
}

const safe = findUser('999').pipe(
  Effect.catchTag('NotFoundError', () => Effect.succeed({ id: '?', name: 'Anonymous' }))
)
const user = await Effect.runPromise(safe)
console.log(user)

// 3. 并发
const slow = (n: number) =>
  Effect.gen(function* () {
    yield* Effect.sleep('100 millis')
    return n
  })

const concurrent = Effect.all(
  [slow(1), slow(2), slow(3)],
  { concurrency: 'unbounded' }
)
const results = await Effect.runPromise(concurrent)
console.log(results)  // [1, 2, 3] 但只花 ~100ms（并发跑）
```

```bash
npx tsx index.ts
```

### 改一处的实验（必做）

体验取消机制：

```typescript
const longTask = Effect.gen(function* () {
  yield* Console.log('Starting...')
  yield* Effect.sleep('5 seconds')
  yield* Console.log('Done')
  return 'result'
})

const program = Effect.race(
  longTask,
  Effect.gen(function* () {
    yield* Effect.sleep('1 second')
    return Effect.fail('Timeout!')
  }).pipe(Effect.flatten)
)

await Effect.runPromise(program).catch(err => console.log('Caught:', err))
// 输出：Starting... / Caught: Timeout!
// longTask 自动被取消，不会跑完 5 秒
```

→ 用 Promise + AbortController 实现同样逻辑要 30+ 行。
Effect 内置原语解决。

第二个实验：Layer 注入：

```typescript
import { Effect, Context, Layer } from 'effect'

class Greeter extends Context.Tag('Greeter')<Greeter, {
  greet: (name: string) => Effect.Effect<never, never, string>
}>() {}

const program = Effect.gen(function* () {
  const greeter = yield* Greeter
  return yield* greeter.greet('World')
})

const GreeterLive = Layer.succeed(Greeter, {
  greet: (name) => Effect.succeed(`Hello, ${name}!`)
})

const result = await Effect.runPromise(program.pipe(Effect.provide(GreeterLive)))
console.log(result)  // Hello, World!
```

观察**没注入会怎样**——把 `Effect.provide(GreeterLive)` 拿掉，TS 立即编译报错。
**这就是类型安全的 DI**。

## 与你工作的连接

**能立刻迁移**：

- 复杂业务流（订单 / 支付 / 用户管理）—— Effect 比 Promise + try/catch 写得清楚
- 测试场景：用 Layer mock service，不需要 jest.mock
- 高并发：结构化并发 + 自动取消是杀手锏

**下个月可能用到**：

- 给 LLM agent 工作流用 Effect ——可取消 / 错误分类 / 重试是 LLM 应用刚需
- 把核心服务从 Express + Promise 重写成 Effect + Hono

**不要用 Effect 的部分**：

- **简单 CRUD / 表单 / 静态站点**——Promise 够用，引 Effect 是过度设计
- **团队没 FP 经验 + 没培训预算**—— learning cost 大
- **对 bundle size 敏感**——Effect 核心 ~50KB，对前端关键路径偏重

## 读完你能做之前做不了的事

- **判断**：选语言/范式时，能在"实用主义 (Promise) vs 严谨 (Effect)" 之间做明智选择
- **设计**：写复杂系统时，第一直觉问"我的错误能不能类型化"
- **解释**：被问"代数效应是什么"时，能用 Effect 当 TS 实现的例子
- **下钻**：看懂 Haskell 的 monad / Scala 的 ZIO / Rust 的 ?——它们和 Effect 同思路
- **对照**：识别"我这个应用有没有 Effect 该用的痛点"——还是 Promise 就够

## 自检 · 5 个问题

1. Effect<R, E, A> 把"会失败"和"会成功"都类型化。这种"显式"的代价是什么？什么时候反而拖累生产力？
2. Effect 是 lazy（不立即执行）vs Promise 是 eager。这个差异对调试和 dev tools 有什么影响？
3. Layer 让依赖注入类型安全。在大型应用里 Layer 链很深，TS 编译会变慢——怎么权衡？
4. Effect 不只做错误处理，还吞噬了 schema / cache / log / tracer。这种"大而全"的产品判断在哪些场景反而是坏？
5. 团队从 Promise 迁移到 Effect，**怎么设计渐进路径**？不可能一夜全切。

## 延伸阅读

读完这篇笔记后下一步：

1. [Effect.website](https://effect.website)——官方文档（**先读这个再读源码**）
2. `packages/effect/src/Fiber.ts`（744 行）——fiber 原语完整实现
3. `packages/effect/src/Layer.ts`（1280 行）——依赖注入完整实现
4. **fp-ts 文档**——理解 Effect 的前世
5. **Scala ZIO** / **Haskell IO monad**——同思想的不同语言实现
6. **algebraic effects** 论文（Plotkin / Pretnar）——Effect 的理论根

---

**笔记完成**：2026-05-28（v3.21.2）
**研究方法**：本地克隆 + 阅读 packages/effect/src 模块清单 + 设计哲学分析
**心脏文件**：理解 `Effect<R, E, A>` 三参数的语义 + Fiber + Layer 三件套
