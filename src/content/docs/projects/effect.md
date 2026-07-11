---
title: Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
来源: 'Effect-TS/effect, MIT, v3.21+, github.com/Effect-TS/effect'
日期: 2026-05-29
分类: TypeScript 运行时
难度: 高级
---

## 是什么

Effect 是一个 **TypeScript 库**，把"一段代码做了什么"在类型上写得更清楚。日常类比：像快递面单——传统 `Promise<User>` 只写了"包裹是 User"，Effect 的 `Effect<User, NotFoundError, Database>` 把"装的是什么、可能出什么差错、要走哪个仓库"三件事都印在面单上。

你写：

```typescript
const getUser = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Database
    return yield* db.findUser(id)
  })
// 类型自动推断：Effect<User, NotFoundError, Database>
```

编译器替你算出：成功时是 `User`、可能失败成 `NotFoundError`、运行时需要一个 `Database` 服务。整个程序的副作用都被钉死在类型上。

## 为什么重要

不理解 Effect，下面这些事都没法解释：

- 为什么 `Promise<User>` 在类型上**看不出会抛什么错**——10 年了 JS 一直没修
- 为什么有人说"Result 类型解决了一半问题"——它只管错误，没管依赖、资源、并发
- 为什么 Scala 的 ZIO 和 Haskell 的 IO monad 看起来像同一个东西换皮——它们都来自代数效应
- 为什么 TypeScript 项目想做"全栈类型安全"绕不开生成器（generator）函数

## 核心要点

Effect 把传统 JS 异步编程做不好的事，集中在 **三件事** 上重新设计：

1. **三参类型 `Effect<A, E, R>`**：A 是成功值、E 是错误类型、R 是运行时依赖。类比"会自我介绍的快递面单"——一眼看清结果、风险、需求。

2. **lazy 求值**：Effect 是个**值**，不是马上跑的任务。必须 `runPromise` 才执行。类比"菜谱 vs 做菜"——Promise 是已经下锅的菜，Effect 是写在纸上的菜谱。

3. **结构化资源 + 并发**：通过 `Scope` 自动管资源、通过 `Fiber` 管并发取消。类比"租房有押金合同"——离开时房东（Scope）一定会把水电关掉，不靠你记得。

## 实践案例

### 案例 1：把 try/catch 升级成类型化错误

```typescript
import { Effect } from 'effect'

class NotFoundError { readonly _tag = 'NotFoundError' }

const findById = (id: string): Effect.Effect<string, NotFoundError> =>
  id === '1' ? Effect.succeed('Jason') : Effect.fail(new NotFoundError())
```

**逐部分解释**：

- `Effect.succeed('Jason')` 等同 `Promise.resolve`，但类型上明确"不会失败"
- `Effect.fail(...)` 是**业务预期错误**——调用方编译期就被强制处理
- `_tag` 字段是辨识联合（discriminated union）的口令，TS 用它做穷尽性检查

### 案例 2：依赖注入直接写在类型里

```typescript
class Database extends Context.Tag('Database')<Database, {
  findUser: (id: string) => Effect.Effect<string, NotFoundError>
}>() {}

const program = Effect.gen(function* () {
  const db = yield* Database
  return yield* db.findUser('1')
})
// 类型推断：Effect<string, NotFoundError, Database>
```

**关键点**：你没传 db 进来，编译器自己看出"这段代码要在有 Database 的环境跑"。运行时忘了 `Effect.provide(DatabaseLive)` → TS 直接报错。

### 案例 3：用 `acquireRelease` 替换 try/finally

```typescript
const openLog = Effect.acquireRelease(
  Effect.tryPromise(() => fs.open('/tmp/app.log', 'a')),
  (fh) => Effect.promise(() => fh.close())
)
```

不管中间是失败、被中断还是正常返回，`fh.close()` 都会跑。比 `try/finally` 强在：跨 await/yield 边界、跨 fiber 都能正确清理，传统 try/finally 只在同步词法块里好用。

## 踩过的坑

1. **A/E/R 顺序记反**：早期文档写 `<R, E, A>`（来自 Scala ZIO 传统），新版本改成 `<A, E, R>`——读旧博客看到老顺序不要慌。

2. **以为 Effect 立刻执行**：`Effect.tap(() => console.log('hi'))` 单独写**什么也不会发生**，必须 `runPromise` 才跑。新人最常见的"我代码没生效" bug。

3. **半 Effect 半 Promise 最痛**：用 `Effect.tryPromise` 把老 Promise 包进来，包多了类型推断慢、bundle 涨、调试栈断。要么全切要么不切。

4. **Cause 嵌套 log 看不懂**：一次并发双失败 + finalizer 又炸，cause 字符串嵌套三层，新人盯着 `Parallel(Fail(...), Sequential(Die(...), ...))` 头大。生产 log 要专门处理。

## 适用 vs 不适用场景

**适用**：

- 长生命周期后端服务（订单、支付、agent 工作流）
- 需要 mock 测试的核心逻辑（Layer 让 mock 是类型安全的）
- 高并发场景（结构化并发 + 自动取消）
- 团队愿意投入培训、有人当 Effect champion 答疑

**不适用**：

- 简单 CRUD / 表单提交 / 静态站点（Promise 够用，Effect 是过度设计）
- 前端关键路径（核心包 50KB+，generator 运行时无法 tree-shake 干净）
- 团队没函数式编程经验且没培训预算
- 每秒 10w+ QPS 的热路径（每次 `Effect.gen` 创建 generator 实例，性能不够）

## 历史小故事（可跳过）

- **2017 年**：Giulio Canti 写出 fp-ts，把 Haskell 的 `Either / Task / IO` 搬进 TypeScript。纯函数式爱好者在用。
- **2020 年**：Michael Arnaldi 启动 Effect-TS 项目，灵感来自 Scala 的 ZIO——把 fp-ts 那一堆类型合并成一个 `Effect<A, E, R>`。
- **2023 年**：fp-ts 团队和 Effect 团队合并，宣布 fp-ts v3 不再独立发布、精神延续到 Effect。
- **2024 年**：Effect v3 发布，参数顺序统一改成 `<A, E, R>`，API 进入相对稳定期。
- **2026 年**：核心仓库 14k+ star、5000+ release、30+ 子包（sql / cluster / ai / platform）。生态从"小众玩具"进入"敢用在生产"阶段。

## 学到什么

1. **类型系统能装的东西远不止"成功值"**——错误、依赖、资源都可以爬上类型轴
2. **lazy 是范式分水岭**——Promise 是动作，Effect 是描述。整个 dev tool / 调试范式都不一样
3. **结构化并发不是噱头**——一个 fiber 失败带走它的全部子任务、自动跑 finalizer，比手写 `Promise.all + AbortController` 健壮一截
4. **生态成本是真成本**——选 Effect 是技术栈决策，不是引一个库；要对团队学习曲线、IDE hover 体验、tsc 编译速度都做心理准备

## 延伸阅读

- 官方文档：[Effect.website](https://effect.website)（**先读这个再读源码**）
- 视频教程：[Effect Days 2024 — Michael Arnaldi 主旨演讲](https://www.youtube.com/@effect-ts)（讲为什么要造 Effect）
- 论文：[Plotkin & Pretnar — Handling Algebraic Effects](https://homepages.inf.ed.ac.uk/gdp/publications/handlers.pdf)（Effect 的理论根，代数效应原始论文）
- [[effect-handlers]] —— 代数效应的语言级实现，Effect 是它在 JS 的库级模拟
- [[hindley-milner]] —— Effect 类型推断背后的统一算法
- [[zod]] —— Effect 生态里的 Schema 子包思想类似，可对照看

## 关联

- [[effect-handlers]] —— 代数效应是 Effect 的精神先祖；JS 没原生 effects，Effect 用 generator 模拟
- [[hindley-milner]] —— Effect 的类型推断借助统一算法，generator 是 do-notation 的廉价替代
- [[fastapi]] —— Python 用类型注解推 API 形态，Effect 是 TS 把这思路推到极致
- [[zod]] —— Effect 自带的 Schema 子包和 zod 同生态位
- [[hono]] —— 后端框架，Effect 常被用来重写 Hono/Express 上的核心服务
- [[playwright]] —— 测试场景里 Effect 的 Layer mock 比 jest.mock 更类型安全
- [[trpc]] —— 端到端类型安全工具，Effect 是它的"重武器"对照

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
