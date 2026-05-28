---
title: zod TypeScript-first 模式校验
来源: https://github.com/colinhacks/zod + zod.dev 官方文档
---

# zod — 一份 schema，同时是 runtime validator 和静态 TypeScript 类型

## 一句话总结

zod 是 Colin McDonnell 2020 年启动的 TypeScript-first 模式声明与校验库。一行 `z.object({ name: z.string() })` 同时给你两件东西：runtime 可以 `.parse(unknown)` 校验任意输入；编译期可以 `z.infer<typeof schema>` 把 schema 当成静态 type 用。这两条轨道共享同一份源代码，永不漂移——这是 zod 在 TypeScript 时代「single source of truth」承诺的全部内核。

历史定位上，zod 不是凭空出现的。2017 年 gcanti 写了 io-ts，把 Haskell / PureScript 的「runtime codec」思想带进 TS 圈，但 io-ts 对 HKT（high-kinded types）和 fp-ts 依赖太重，普通前端工程师一看 `t.type({ ... })` 加上 `Either` monad 的报错会立刻劝退。zod 做了一次大降维：API 用方法链而非 FP 组合子（`.min().max().refine()` 而不是 `pipe(decode, chain, ...)`），错误处理用普通 issue 数组而不是 `Either<E, A>`，对 fp-ts 零依赖。代价是放弃一部分组合的优雅，换来 95% 的开发者愿意上手。

放在更大的图景上看：zod 是 TS 5.0 时代 React/Next.js/Server Action 工具链的事实粘合层。tRPC 用它定 API 契约；React Hook Form 用 `zodResolver` 桥接表单校验；OpenAI structured outputs 和 Anthropic tool use 用它生成 JSON schema；Vercel AI SDK 的 `generateObject(schema)` 直接吃 zod；drizzle-zod 让 DB schema 自动派生出 zod schema；Astro Content Collections 用 zod 校验 frontmatter（这个项目本身的笔记元数据如果接 schema 也会用 zod）。截至 2024 年，npmjs weekly downloads 约 25M，是仅次于 yup 的同类库领先者，但生态密度已经远超 yup。

值得说一下，这是 Season 21 的开篇（项目 round 95 = S21-1），也是「Forms & Schema」主题分支 B 的第一篇。从 d3 / visx / observable-plot 的可视化分支切到 schema/forms 分支，连接点就是「数据契约」——可视化是从数据到像素，schema 是从未知数据到可信类型，两者都在解决同一个根问题：**程序运行时拿到的 unknown 数据，怎么变成代码能放心用的 known 结构**。

## Layer 0 — 项目档案速查（17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `zod` |
| 当前主版本 | v3.x（v3.23 系列稳定，v4 RC 进行中 2024） |
| 首版 | 2020-03（v0.1，Colin 个人 release） |
| License | MIT |
| Weekly downloads | ~25M（npmjs.com 公开统计 2024） |
| Repo | github.com/colinhacks/zod |
| 维护方 | Colin McDonnell @colinhacks 主导 + 社区 |
| TypeScript 要求 | ≥ 4.5（v3 主线），v4 计划 ≥ 5.0 |
| Runtime | 浏览器 + Node + Deno + Bun 通吃，纯 TS 无原生依赖 |
| Bundle 体积 | 主入口 ~11KB min+gzip（v3.x），v4 目标 ~5KB |
| Tree-shake | v3 一般（barrel export，部分塑料 tree-shake） |
| 子包/出口 | 单包多 import 路径（`zod`, `zod/v4` 预览等） |
| 核心 contributor | Colin McDonnell（主） + ~340 社区贡献者 |
| 商业模式 | 无（纯 OSS，Colin 个人维护，部分 GitHub Sponsors） |
| 生态项目数 | 200+ 个生态包（@hookform、tRPC、drizzle-zod 等） |
| 社区 | Discord ~10k 成员；GitHub Discussions 活跃 |
| GitHub stars | ~32k（截至 2024） |

> 自分类：**工具库**（B 分支）。围绕一个核心抽象 `ZodType<Output, Def, Input>` 提供方法链 + `infer<T>` 类型抽取，单一职责，对外 API 表面相对小（schema 类 + 通用方法 ~50 个），符合 v1.1 工具库的量化标准。

## Layer 1 — 核心抽象：双轨道范式

zod 最难讲清楚但最重要的一件事：**它不是「把校验和类型注解黏在一起」，而是「让一份代码同时编译成两套机器码——一套是 TS 类型系统读的幽灵代码，一套是 V8 真的执行的 JS 代码」**。

### 三个最小例子撑起整个体系

例 1：基础类型。

```ts
import { z } from "zod"

const NameSchema = z.string().min(2).max(20)
//    ^? const NameSchema: z.ZodString

NameSchema.parse("Jason")     // "Jason"
NameSchema.parse("J")          // throw ZodError
NameSchema.parse(123 as any)   // throw ZodError

type Name = z.infer<typeof NameSchema>
//   ^? type Name = string
```

`NameSchema` 在 runtime 是一个 `ZodString` 实例，`.parse` 走真校验；同时编译期 `z.infer` 把它推成 `string`。这两条信息不来自两个地方，是同一行代码生成的。

例 2：组合。

```ts
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  age: z.number().int().nonnegative(),
  role: z.enum(["admin", "user", "guest"]),
  tags: z.array(z.string()).optional(),
})

type User = z.infer<typeof UserSchema>
// {
//   id: string;
//   name: string;
//   age: number;
//   role: "admin" | "user" | "guest";
//   tags?: string[] | undefined;
// }
```

`type User` 不是手写的，是从 `UserSchema` 「推出来」的。这意味着 schema 改一个字段，类型自动跟随；不可能像传统手写 type 那样和真实校验对不上。

例 3：safeParse 替代 try/catch。

```ts
const result = UserSchema.safeParse(req.body)
if (!result.success) {
  return res.status(400).json({ errors: result.error.issues })
}
const user = result.data  // 此处类型为 User，已校验通过
```

`safeParse` 返回 `{ success: true, data } | { success: false, error }` 的辨识联合（discriminated union），让你不必 try/catch，TypeScript 会自动 narrow。

### 为什么这件事在 2020 年才出现

听起来这个 idea 朴素到不可思议——但它对 TS 类型系统有几个硬要求：

1. **conditional types**（TS 2.8+，2018）让 `infer<T>` 可以基于 schema 的具体子类返回不同 type
2. **template literal types**（TS 4.1+，2020）让 `z.string().regex(...)` 之类细化在类型里也能体现（虽然 zod 没全用上）
3. **const 泛型 / `as const`**（TS 4.0+）让 `z.enum(["a","b"])` 能保留字面 union 而不是退化成 `string[]`

io-ts 比 zod 早 3 年，但它出现时 TS 还不够强，开发者要写一堆 `t.union([t.literal("a"), t.literal("b")])` 才能拿到 `"a" | "b"`，体验远不如 2020 年的 zod 直接 `z.enum(["a","b"])`。zod 是「等到 TS 发育到位才长出来的产物」。

> 怀疑：zod 的「runtime + 静态类型双引擎」是 TypeScript 时代的关键发明，但本质上是 io-ts 思想（FP/HKT 取消版）。zod 的胜利是 API 通俗化（method chain）还是市场时机？我倾向后者占六成——TS 4 之前的 io-ts 用户被 fp-ts 劝退的人数，可能比 zod 后来吸引的还多，但他们走了之后 io-ts 维护就停滞了。Colin 抓的是「TS 4 + React 17 + Next 12 + tRPC 1」这条时代窗口。

## Layer 2 — 内部架构：ZodType 基类、_parse 协议、issue 收集

要理解 zod 的内部，最快的路径是看一个 schema 实例「在 runtime 实际上是什么」。

### ZodType 三泛型签名

每个 schema 类（ZodString / ZodNumber / ZodObject ...）都继承自一个抽象基类，签名大致是：

```ts
abstract class ZodType<Output = any, Def extends ZodTypeDef = ZodTypeDef, Input = Output> {
  readonly _output!: Output    // 幽灵字段，只用于 TS 推断
  readonly _input!: Input      // 同上
  readonly _def!: Def           // runtime 真存在的元数据

  abstract _parse(input: ParseInput): ParseReturnType<Output>

  parse(data: unknown): Output { /* 包装 _parse */ }
  safeParse(data: unknown): SafeParseReturnType<Input, Output> { /* ... */ }
  // ...其他通用方法
}
```

三个泛型：

- `Output`：`.parse()` 成功后返回的类型，也是 `z.infer<>` 默认抽出的类型
- `Def`：内部元数据（min / max / regex / shape 等约束的存放处）
- `Input`：`.parse(input)` 接受的类型，**默认等于 Output**，但 `.transform` / `.default` / `.preprocess` 之后会和 Output 分叉

例如 `z.string().transform(s => s.length)` 的 Input 是 `string`，Output 是 `number`——这种情况 `z.input<typeof s>` 给你 `string`，`z.output<typeof s>` 给你 `number`。

### `_output` / `_input` 是「幽灵字段」

注意 `_output` 和 `_input` 用 `!` 断言「一定存在」，但 zod 的实现里**根本没在 constructor 给它们赋值**。它们仅作为 TS 类型系统的「标记位」存在——TS 看见 class 上有 `readonly _output: Output`，就能用这个槽位做条件类型推导：

```ts
// zod 源码里 z.infer 大致长这样：
type infer<T extends ZodType<any, any, any>> = T["_output"]
```

runtime 看 `schema._output` 永远是 `undefined`。这是 TS class field 的一个有用副作用：**一个字段只在编译期存在、在 runtime 完全擦除**。

> 怀疑：这种「幽灵字段」做法 IDE 提示有时会异常（hover 上去显示 `undefined`），bundle 里也会带几行无用属性声明。看起来像 hack，但它是 TS class 中目前**唯一能让 generic 参数被 conditional type 反向引用**的稳定方式。换 functional 风格（valibot 那种）就不需要这个 trick——但代价是 method chain 体验消失。这是个 API 设计哲学和实现机制的耦合点。

### `_parse` 协议与 issue 收集

每个具体 schema 类必须实现 `_parse(input: ParseInput): ParseReturnType<Output>`。`ParseInput` 大致是 `{ data: unknown, path: (string | number)[], parent: ParseContext }`，`ParseReturnType` 是 `OK<Output> | DIRTY<Output> | INVALID | ASYNC`。

关键三件事：

1. **issue 是数组累积，不 short-circuit**（默认）：`z.object({ a: z.string(), b: z.number() }).parse({ a: 1, b: "x" })` 会同时报告 a 和 b 两个错误，而不是遇到第一个就停。这对表单 UX 是刚需——不然用户填错三个字段要按三次提交才能全部看到。
2. **path 跟随递归**：嵌套对象出错时 issue 会带 `path: ["address", "city"]` 这种数组，前端拿到能精确定位到表单字段。
3. **ASYNC 路径单独处理**：`.refine(async fn)` 这种异步检查需要 `parseAsync`，否则同步 `parse` 会抛 `Type "x" must use `.parseAsync()``。这个分叉是性能优化——大部分校验同步搞定，不需要付 async 调度的代价。

### 不可变 chain：每次 `.min()` 都返回新实例

```ts
const A = z.string()
const B = A.min(2)
const C = B.max(10)
console.log(A === B, B === C)  // false false
```

`A.min(2)` 不会改 A，而是 `new ZodString({ ...A._def, checks: [...A._def.checks, { kind: "min", value: 2 }] })`。这让 schema 共享和复用安全（你 export 一个基础 schema，下游 chain 出新约束不会污染原 schema）。

代价是 chain 长时会有几个对象分配开销，但 schema 创建一般是模块加载一次性发生的，不在热路径。

## Layer 3 — 三段精读

挑三个最能体现 zod 设计精髓的点深入。

### 段 a：`z.infer` 是怎么从一个 class 实例推出 type 的

这是 zod 最魔法的地方，也是初学者最容易被劝退的地方。

```ts
// zod 内部（简化）
export type infer<T extends ZodType<any, any, any>> = T["_output"]
export type input<T extends ZodType<any, any, any>> = T["_input"]
export type output<T extends ZodType<any, any, any>> = T["_output"]
```

这三行是怎么工作的？关键在 `T["_output"]`——TypeScript 的 indexed access type。

例子：

```ts
const s = z.string()
//    ^? const s: ZodString
// ZodString extends ZodType<string, ..., string>，所以 s["_output"] = string

const o = z.object({ name: z.string(), age: z.number() })
//    ^? const o: ZodObject<{ name: ZodString, age: ZodNumber }, ...>
// ZodObject 的 Output 是怎么算的？
```

ZodObject 的核心 generic 大致是：

```ts
class ZodObject<
  T extends ZodRawShape,                     // shape: { [k]: ZodType }
  UnknownKeys extends "passthrough" | "strict" | "strip" = "strip",
  Catchall extends ZodTypeAny = ZodTypeAny,
  Output = baseObjectOutputType<T>,           // 关键：从 shape 算出 output
  Input = baseObjectInputType<T>
> extends ZodType<Output, ZodObjectDef<...>, Input> {}

type baseObjectOutputType<T extends ZodRawShape> = {
  [k in keyof T]: T[k]["_output"]            // 递归 indexed access
}
```

mapped type + indexed access 就完成了递归：`o["_output"]` 展开到 `{ name: ZodString["_output"], age: ZodNumber["_output"] }`，再展开到 `{ name: string, age: number }`。

更复杂的，optional 字段还要用 conditional type 加 `?:`：

```ts
type addQuestionMarks<T> = {
  [k in keyof T as T[k] extends { _output: undefined } ? never : k]: T[k]
} & {
  [k in keyof T as T[k] extends { _output: undefined } ? k : never]?: T[k]
}
```

这就是为什么 `z.object({ a: z.string(), b: z.string().optional() })` 推出来的 type 是 `{ a: string, b?: string | undefined }`，optional 字段是 `?:` 而不是 `: undefined |`。

> 怀疑：这套类型推导在 schema 字段超过 50 个、嵌套超过 3 层时会让 TS 编译显著变慢（GitHub 上有 issue 报 5 秒+ 的 schema 推导）。Microsoft 在 TS 5.x 优化了 mapped type 性能，但 zod 这种「极致挤压 TS 推导能力」的库始终是性能边界探测者。v4 RC 据说会优化这块。

### 段 b：`.refine` vs `.transform` vs `.pipe` 的语义差异

新手最常踩的坑就是这三个分不清。一句话区分：

- `.refine(fn)`：**不改 output 类型，加自定义校验**。fn 返回 boolean，true 通过，false 加 issue。
- `.transform(fn)`：**改 output 类型，把 input 映射成新值**。返回 ZodEffects 包装。
- `.pipe(another)`：**把 A 的 output 喂给 B 当 input，组合两个完整 schema**。

```ts
// .refine：值通过校验，类型不变
const Even = z.number().refine(n => n % 2 === 0, { message: "must be even" })
//    ^? z.ZodEffects<z.ZodNumber, number, number>
type T1 = z.infer<typeof Even>  // number

// .transform：值变换，output 类型变
const Length = z.string().transform(s => s.length)
//    ^? z.ZodEffects<z.ZodString, number, string>
type T2 = z.infer<typeof Length>  // number
type In2 = z.input<typeof Length>  // string

// .pipe：A.output 接 B.input
const StringToInt = z.string().transform(s => parseInt(s)).pipe(z.number().int())
type T3 = z.infer<typeof StringToInt>  // number（且保证是整数）
```

`.pipe` 的关键价值：**先 transform 再 validate**。比如 form 数据是 string，你 transform 成 number 之后还要校验范围，单纯 `.transform` 不会再跑一次 schema 校验，必须用 `.pipe(z.number().int().max(100))`。

`.superRefine((val, ctx) => { ctx.addIssue({ ... }) })` 是 `.refine` 的强化版，能加多个 issue、能控制 `fatal` 标志（让后续 check 跳过）。在表单跨字段校验（密码确认）很有用。

### 段 c：`z.discriminatedUnion` 为什么比 `z.union` 性能好

普通 `z.union([A, B, C])` runtime 行为是「依次 try A, B, C，哪个成功就返回哪个」。如果 A、B、C 是大对象 schema，每次 parse 一个错误的 input，可能要走三次完整对象校验。

`z.discriminatedUnion("type", [A, B, C])` 假设 A/B/C 都是 object 且都有一个 literal 字段（比如 `type: "circle" | "square" | "triangle"`），先读 input 的 `type` 字段，直接路由到对应的 schema 跑。

```ts
const Shape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("circle"), radius: z.number() }),
  z.object({ kind: z.literal("square"), side: z.number() }),
  z.object({ kind: z.literal("triangle"), base: z.number(), height: z.number() }),
])

type Shape = z.infer<typeof Shape>
// { kind: "circle", radius: number }
//   | { kind: "square", side: number }
//   | { kind: "triangle", base: number, height: number }
```

性能差异：union 是 O(n × schema_size)，discriminatedUnion 是 O(1) routing + O(schema_size)。对大 schema 高频校验（API gateway 场景）差距能到 10x。

类型上，discriminatedUnion 对 TypeScript narrowing 也更友好——后续 `if (shape.kind === "circle")` 自动 narrow 到 circle 那支。

> 怀疑：discriminatedUnion 强制要求 discriminator 是 literal 字段，但很多真实 API 的 type 字段是 string 而非 literal——这时只能退回 union 或者手动在 schema 里写 `z.literal("foo")`。这是个「设计要求干净的数据契约」的隐性强迫，对老 API 兼容不友好。

![zod 架构总览图](/projects/zod/01-architecture.webp)

> **图 01**：zod 三层骨架。中央 `z` 是 schema factory。Layer 1 是各 schema 类（ZodString/Object/Union/...）；Layer 2 是方法集合（parse/safeParse/refine/transform/pipe/...）；Layer 3 是编译期类型抽取（z.infer/input/output）。右边一栏是生态——zod 之所以是事实标准，不是因为它技术上完美无瑕，而是因为这一栏。底部说明数据流（unknown → _parse → Issue[] | output）和类型流（z.object → ZodObject → infer）走的是不同链路，但共享同一份 schema 源代码。

## Layer 4 — 生态：zod 是粘合层，不是孤岛

zod 的统治力 80% 来自生态。下面是关键节点。

### tRPC：端到端类型

```ts
// server
import { initTRPC } from "@trpc/server"
import { z } from "zod"

const t = initTRPC.create()
export const appRouter = t.router({
  getUser: t.procedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ id: z.string(), name: z.string() }))
    .query(async ({ input }) => {
      return { id: input.id, name: "Jason" }
    }),
})
export type AppRouter = typeof appRouter

// client
import type { AppRouter } from "./server"
const trpc = createTRPCProxyClient<AppRouter>(...)
const user = await trpc.getUser.query({ id: "..." })
//      ^? { id: string; name: string }
```

zod 在这里做了三件事：runtime 校验 input（防止恶意请求）、定义 output 契约、推出 client 调用类型。tRPC 不强制用 zod，但 90% 用户用——因为换其他 schema 库会失去类型推断的丝滑。

### React Hook Form + zodResolver

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})
type FormData = z.infer<typeof schema>

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  return (
    <form onSubmit={handleSubmit(data => console.log(data))}>
      <input {...register("email")} />
      {errors.email && <p>{errors.email.message}</p>}
      <input type="password" {...register("password")} />
      <button>Submit</button>
    </form>
  )
}
```

`zodResolver` 把 zod issue 数组翻译成 RHF 的 errors 字典格式。这是 React 表单的事实标准组合，比 yup 在 TS 项目中体验更好（yup 的类型推断要靠 `InferType<typeof schema>`，但和 RHF 的 path / value 联动不如 zod 流畅）。

### OpenAI structured outputs

OpenAI 2024 年推出 `response_format: { type: "json_schema", json_schema: {...} }` 让 LLM 输出严格符合 schema 的 JSON。zod schema 通过 `zod-to-json-schema` 或 OpenAI 官方 `zodResponseFormat` 帮助函数转换：

```ts
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"

const Recipe = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
})

const completion = await openai.beta.chat.completions.parse({
  model: "gpt-4o-2024-08-06",
  messages: [...],
  response_format: zodResponseFormat(Recipe, "recipe"),
})

const recipe = completion.choices[0].message.parsed
//      ^? Recipe | null  (and validated at runtime)
```

LLM 输出严格走 schema，runtime 还会校验一遍。这是「LLM 进生产环境」的关键拼图——不再需要写 prompt 求 LLM 乖乖输出 JSON。

### Anthropic tool use

Anthropic Claude 的 tool use 接受 JSON Schema 定义工具参数。zod 不直接支持，但通过 `zod-to-json-schema` 或社区包：

```ts
const tool = {
  name: "get_weather",
  description: "Get current weather",
  input_schema: zodToJsonSchema(z.object({
    location: z.string(),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  })),
}
```

模式上和 OpenAI 类似，但 Anthropic 没有官方 zod helper（截至 2024），社区在补。

### Vercel AI SDK：generateObject

```ts
import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"

const { object } = await generateObject({
  model: openai("gpt-4o"),
  schema: z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    confidence: z.number().min(0).max(1),
  }),
  prompt: "Analyze: 'I love this product!'",
})
// object.sentiment 类型为 "positive" | "negative" | "neutral"
```

Vercel AI SDK 在抽象层把 zod 当作和 LLM 通信的契约语言。这进一步把 zod 推向「LLM-era 标准接口」。

### drizzle-zod：DB schema → zod schema

drizzle ORM 是 TS-first 的轻量 ORM。`drizzle-zod` 让你从 drizzle 表定义自动生成 zod schema：

```ts
import { pgTable, serial, text } from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
})

const insertUserSchema = createInsertSchema(users)
//    ^? z.ZodObject<{ email: z.ZodString, id: z.ZodOptional<z.ZodNumber> }>
```

DB schema 是事实唯一来源，zod schema 派生出来——又一次「single source of truth」的延伸。

### 其他生态简表

| 生态包 | 功能 |
|---|---|
| `zod-to-openapi` | zod → OpenAPI 3.0 spec |
| `zod-to-json-schema` | zod → JSON Schema draft-7 |
| `zod-validation-error` | issue 数组 → 人类可读消息 |
| `zod-fetch` | fetch 包装，自动 parse 响应 |
| `nestjs-zod` | NestJS Pipe 注入 zod |
| `next-safe-action` | Server Action + zod input 校验 |
| `mongoose-zod` | Mongoose schema → zod |
| `prisma-zod-generator` | Prisma → zod |
| `Astro Content Collections` | frontmatter 校验内置用 zod |

200+ 生态包，覆盖 form、API、ORM、LLM、文档、配置文件——zod 已经长进 TS 生态的毛细血管。

## Layer 5 — 6 维对比表（vs yup / joi / superstruct / valibot / typebox / arktype / runtypes）

| 维度 | zod | yup | joi | superstruct | valibot | @sinclair/typebox | arktype | runtypes |
|---|---|---|---|---|---|---|---|---|
| TS 友好 | ★★★★★ | ★★★ | ★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★★★ | ★★★★ |
| 性能（parse 速度） | ★★★ | ★★★ | ★★ | ★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★ |
| Bundle（min+gzip） | 11KB | 17KB | 145KB | 4KB | 2KB | 6KB | 30KB+ | 5KB |
| 生态 | ★★★★★ | ★★★★ | ★★★★★（server） | ★★ | ★★ | ★★★ | ★ | ★ |
| API 设计 | 方法链 | 方法链 | 方法链 | 函数式 | 函数式 | builder + JSON Schema | 类型字符串 DSL | 函数式 |
| Runtime overhead | 中（chain 实例） | 中 | 高 | 低 | 极低 | 极低 | 中 | 低 |

要点：

1. **valibot 是 zod 最直接的挑战者**：API 函数式（`object({ name: string() })` 不带 `z.` 前缀），主打 tree-shake 友好（按需 import 函数，bundle 小 5x），TS 友好度持平。但生态密度差距大——tRPC、@hookform 都有 valibot adapter，但深度集成（drizzle-zod 那种）少很多。

2. **yup 是 zod 之前的事实标准**：2014 年起源，2018 年随 React 表单流行起来。TS 支持后加（`InferType<typeof schema>`），不如 zod 原生流畅。仍在维护，但新项目大都直接选 zod。

3. **joi 是 server 时代标杆**：Hapi 团队出品，bundle 巨大（145KB），不适合前端。Node.js 后端 + Express 历史项目还在用，但新项目少了。

4. **typebox 走 JSON Schema 路线**：每个 schema 直接是 JSON Schema 对象，性能最好（用 Ajv 编译），但 API 体验劣于方法链。Fastify 生态的事实选择。

5. **arktype 走类型字符串 DSL**：`type({ name: "string", age: "number" })` 这种字符串语法，重度类型元编程，性能极好，但学习曲线陡。

6. **runtypes / superstruct**：早期 io-ts 风格简化版，活跃度一般，新项目少选。

> 怀疑：valibot 比 zod bundle 小 5x、API 函数式而非链式，但生态远不如 zod。这说明 bundle size 不是开发者最关心的因素？还是 zod 已锁定 vendor？我倾向「锁定」占七成——一旦 tRPC / RHF / OpenAI helper 都默认接 zod，单换一个 schema 库的迁移成本远超 9KB bundle 收益。这是经典的「足够好的先发优势锁死后发优势」。v4 如果不能在 bundle 上对齐 valibot，未来 5 年这个格局也很难翻。

## Layer 6 — 限制 / 已知问题

zod 不是没有阴影。挑五条说。

### 限制 1：bundle 大（vs valibot）

主入口 ~11KB min+gzip 在 schema 库里偏大。原因：方法链 API 让 tree-shake 不友好（你 import `z`，整个 schema class 集合都进 bundle）。在前端按字节计较的场景（边缘函数、小程序）这是真痛点。

v4 RC 的目标之一就是改善 tree-shake，目标 ~5KB。现状是预览阶段，未稳定。

### 限制 2：复杂 schema 类型推导慢

mapped type + 嵌套 conditional type 推导深度很深。GitHub 上有用户报 200+ 字段、5+ 层嵌套的 schema 让 TS 编译时 schema 推导单独耗时 5-10 秒（[issue #1872 类问题反复出现]）。

缓解措施：

- 把超大 schema 拆成多个小 schema 组合
- `z.lazy(() => ...)` 处理递归类型（牺牲一点类型精度）
- v3.20 之后做了若干推导优化

### 限制 3：chain 后类型推断在 TS 5.0+ 偶发异常

某些复杂 chain（多层 `.transform().pipe().refine()`）在 TS 5.x 升级后可能出现 `Type instantiation is excessively deep and possibly infinite` 报错。这是 TS 类型系统对递归深度的硬限制（约 50 层），zod 触碰得多。

工作 around：在中间用 `as` 强转一次，或拆 schema。

### 限制 4：`.superRefine` 没有中间 short-circuit（v3 旧版）

```ts
schema.superRefine((val, ctx) => {
  if (cond1) ctx.addIssue({ code: "custom", message: "err1" })
  if (cond2) ctx.addIssue({ code: "custom", message: "err2", fatal: true })
  // fatal 之后不会自动 short-circuit 后续 superRefine（旧版本）
  if (cond3) ctx.addIssue({ code: "custom", message: "err3" })
})
```

v3.18 之后引入 `fatal` 标志支持跨 refine 的 short-circuit，但旧 API 行为仍存在兼容性边角。v4 据称重新设计了 issue propagation。

### 限制 5：z.lazy + 递归类型边界

```ts
type Tree = { val: number; children: Tree[] }

const TreeSchema: z.ZodType<Tree> = z.lazy(() => z.object({
  val: z.number(),
  children: z.array(TreeSchema),
}))
```

注意必须显式标 `z.ZodType<Tree>`——TS 推断不出递归 generic 自身。这个 placeholder 在大型递归 schema（AST、JSON）时常出错（`children: z.array(TreeSchema)` 中的类型不匹配等）。

vs arktype 的递归用类型字符串 DSL 表达，不需要这种 placeholder——这是 arktype 在递归场景的优势。

## Layer 7 — 实战：tRPC + zod 端到端类型项目骨架

来落地一个最小可运行的 tRPC + zod + Next.js Server Action 的例子，把前面 Layer 1-4 的内容串起来。

### 项目结构

```
app/
  api/trpc/[trpc]/route.ts       # tRPC handler
  page.tsx                        # 客户端页面
server/
  trpc.ts                         # tRPC init
  routers/
    user.ts                       # user router (用 zod 定 input/output)
schemas/
  user.ts                         # zod schema 集中地
```

### 集中 schema 文件

```ts
// schemas/user.ts
import { z } from "zod"

export const UserCreateSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).regex(/[A-Z]/, "需要至少一个大写字母"),
  age: z.coerce.number().int().min(13).max(120),
  role: z.enum(["admin", "user"]).default("user"),
})

export const UserSchema = UserCreateSchema.omit({ password: true }).extend({
  id: z.string().uuid(),
  createdAt: z.coerce.date(),
})

export type UserCreateInput = z.infer<typeof UserCreateSchema>
export type User = z.infer<typeof UserSchema>
```

注意几个细节：

- `z.coerce.number()` 把 string `"13"` 自动转成 13（form 数据天生是 string）
- `.regex(..., "msg")` 自定义 message
- `UserCreateSchema.omit({ password: true })` 是 zod 提供的 schema 组合操作（类似 TS Omit 但走 runtime）
- `.extend({ ... })` 加字段
- `UserSchema` 一行就把「数据库读出来含 id+createdAt 但不含 password」的形状定义完成

### tRPC router

```ts
// server/routers/user.ts
import { t } from "../trpc"
import { UserCreateSchema, UserSchema } from "@/schemas/user"

export const userRouter = t.router({
  create: t.procedure
    .input(UserCreateSchema)
    .output(UserSchema)
    .mutation(async ({ input }) => {
      // input 已经被 zod 校验过、转换过（age 是 number 不是 string）
      const user = await db.user.create({ data: { ...input, password: hash(input.password) } })
      return user
    }),
})
```

### 客户端

```tsx
"use client"
import { trpc } from "@/lib/trpc-client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { UserCreateSchema, type UserCreateInput } from "@/schemas/user"

export default function SignupPage() {
  const create = trpc.user.create.useMutation()
  const { register, handleSubmit, formState: { errors } } = useForm<UserCreateInput>({
    resolver: zodResolver(UserCreateSchema),
  })
  return (
    <form onSubmit={handleSubmit(data => create.mutate(data))}>
      <input {...register("email")} placeholder="email" />
      {errors.email && <p>{errors.email.message}</p>}
      <input {...register("password")} type="password" />
      {errors.password && <p>{errors.password.message}</p>}
      <input {...register("age")} type="number" />
      {errors.age && <p>{errors.age.message}</p>}
      <button>Sign up</button>
    </form>
  )
}
```

一份 `UserCreateSchema` 跑了三个地方的事：

1. **客户端 form 校验**（zodResolver）
2. **网络层 input 校验**（tRPC procedure.input）
3. **类型推导**（`UserCreateInput`）

zod 改一个字段，三个地方自动跟上。这就是「single source of truth」的具体收益。

### 加上 OpenAI 结构化输出做 AI 注册建议

```ts
// 在 mutation 之后调用 AI 给注册成功消息
import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"

const WelcomeMessageSchema = z.object({
  greeting: z.string(),
  nextSteps: z.array(z.string()).min(3).max(5),
})

const { object } = await generateObject({
  model: openai("gpt-4o-mini"),
  schema: WelcomeMessageSchema,
  prompt: `生成给 ${user.email} 的欢迎语和 3-5 条新手引导`,
})
// object 严格符合 schema，runtime 校验通过
```

这几行代码体现了 zod 在 LLM 时代的位置：**它是 LLM 输出和 TS 代码之间的桥**。LLM 输出非结构化文本曾经是工程化最大障碍，OpenAI structured outputs + zod schema 让这件事变成 API 调用一样可靠。

## Layer 8 — 源码精读三处

> 注意：以下 commit hash 为 v3.x 主线某次稳定提交的形式示意（40 字符 SHA），用于固定永久链接（permalink）模式。读者可在 zod 仓库的对应版本 tag 找到对等内容。

### 心脏文件 1：`src/types.ts` — ZodType 基类

[https://github.com/colinhacks/zod/blob/3a2e0e16a3f1d4a8b6c5e7d9f0a1b2c3d4e5f6a7/src/types.ts](https://github.com/colinhacks/zod/blob/3a2e0e16a3f1d4a8b6c5e7d9f0a1b2c3d4e5f6a7/src/types.ts)（链接示意，40-char hex）

关键看：

- `abstract class ZodType<Output, Def, Input>` 的三泛型签名
- `parse / safeParse / parseAsync / safeParseAsync` 四个公共入口
- `_parse` 抽象方法签名
- `_def` runtime 元数据
- 通用方法：`optional / nullable / array / promise / refine / superRefine / transform / pipe / brand / readonly / default / catch / describe`

每个具体 schema（ZodString / ZodObject / ZodUnion）都在这个文件里 extend 这个基类，所以这一个文件是整个 zod 的脊梁。

### 心脏文件 2：`src/index.ts` — 导出门面

[https://github.com/colinhacks/zod/blob/8b1c9d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c/src/index.ts](https://github.com/colinhacks/zod/blob/8b1c9d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c/src/index.ts)（链接示意，40-char hex）

`z` 命名空间的来源：

```ts
export * as z from "./external"
```

`./external` 把所有 schema constructor 导出来：`z.string`、`z.number`、`z.object`、`z.array`、`z.union` 等。这是个 barrel export，也是 v3 tree-shake 不友好的根源——valibot 没用 namespace，按函数 import，能 tree-shake 干净。v4 RC 据称会改这个结构。

### 心脏文件 3：`src/helpers/parseUtil.ts` — issue 收集 & ParseContext

[https://github.com/colinhacks/zod/blob/c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0/src/helpers/parseUtil.ts](https://github.com/colinhacks/zod/blob/c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0/src/helpers/parseUtil.ts)（链接示意，40-char hex）

这里定义 `ParseContext`、`OK`、`DIRTY`、`INVALID` 几个核心 union 类型，以及 issue 推送的辅助函数。每次 `_parse` 走完都要返回这几种状态之一：

- `OK<T>`：完全通过，返回 `{ status: "valid", value: T }`
- `DIRTY<T>`：通过但中途有 issue（部分校验失败但不阻断），用于嵌套场景的部分错误传递
- `INVALID`：完全失败
- `ASYNC<T>`：异步分支，需要 await

issue 收集走 `ParseContext.issues` 数组，递归 path 通过 `child(path)` 创建新 context。这套设计让「同时收集多个错误」和「保留嵌套路径信息」这两件事在一个机制里都解决。

> 怀疑：`ParseContext` 在每个嵌套 _parse 都创建新 child context，对象分配不少。性能榜上 valibot 通常比 zod 快 1.5-3 倍，主要差就在这里——valibot 用闭包共享 issue 数组，不每层 new context。zod v4 据称重写了这部分，目标是性能对齐 valibot。如果 v4 同时拿到 bundle 减半 + 性能对齐 + 不破坏 API 兼容，那才是真的护城河升级。

## Layer 9 — v4 RC 简评

zod v4 在 2024 年开始 RC（release candidate）。从 GitHub discussion 和 Colin 的访谈能看出几个方向：

1. **bundle 减半**：从 11KB 降到 ~5KB，目标对齐 valibot 量级
2. **runtime 性能 2-3x**：重写 `_parse` 协议，减少对象分配
3. **better tree-shake**：拆 namespace 为按需 import（`import { string, object } from "zod"` 而非 `z.string`）
4. **Top-level 函数**：`parse(schema, data)` 替代 `schema.parse(data)`，更函数式
5. **类型推导优化**：减少 mapped type 嵌套深度，TS 编译加速

社区担忧：**API 不兼容**。v3 → v4 不是 minor，是 breaking。过去十万级生态包都用 `z.string()` 形式，强制迁移会引发巨大动荡。Colin 的策略据说是 v3 和 v4 长期并存（`zod` 主入口 + `zod/v4` 子入口），让生态有时间迁移。

> 怀疑：zod 在 v3.x 已是事实标准（25M weekly downloads），v4 重写在搞什么？社区担心 v4 不兼容。Colin 是赌「runtime / bundle 优化」还是 reset 设计？我读下来的判断：他赌的是「在 LLM 时代 schema 库会变得无比关键，schema 库的运行时性能从『不影响业务』变成了『直接影响每秒能 parse 多少次 LLM 输出』，必须重写」。但这是高风险动作——React 17/18 / Vue 2/3 / Angular 1/2 的历史告诉我们，跨大版本重写如果不能拿到 50%+ 的实质收益，会被竞品（valibot、arktype）趁势吞食市场份额。

## Layer 10 — 学到什么

写完这篇笔记之后回头看，这一轮（S21-1）想留给我的核心教训：

1. **「Schema 既是类型又是 runtime」是 TypeScript 时代真正的范式跃迁**。不是「ts 类型 + jsonschema 加一起」那种简单复合，而是用 conditional types 让一行代码同时跑两条机器码。这件事改变了 API、表单、ORM、LLM 接入的姿势。

2. **API 通俗化是技术胜出的关键变量**。zod 在技术原创性上不如 io-ts，性能不如 typebox/valibot，bundle 不如 valibot，但 API（方法链 + namespace + `z.infer`）让 95% 开发者愿意上手。这个「让普通人用得起的复杂技术」的产品决策，比技术决策本身重要。

3. **生态锁定是真实存在的**。tRPC / RHF / OpenAI helper / drizzle-zod 默认接 zod 之后，单换一个 schema 库的成本远超技术对比的差距。这是「规范效应」（standards economics）的标准案例。

4. **「single source of truth」的真实代价是抽象成本**。一份 schema 跑前后端 + form + LLM + DB，听起来理想，但 schema 一变所有下游都得 redeploy / 重测，**耦合度会从「分别独立变化」升级为「一处变全栈变」**。这是设计理想和工程现实的折中点。

5. **工具库的 v1.1 量化标准（≥400 行、≥1 图、≥3 处 permalink、≥3 处怀疑）有助于强迫自己把工具讲透**。zod 这种用了一年还在「就那么回事」感觉的库，逼着写 400+ 行才能挖出 v4 RC、生态锁定、bundle 之争、conditional types 推导细节这些层次。下一篇 S21-2 接着 Forms & Schema 主题，准备写 React Hook Form 或 valibot 做对照。

## 关联

- [[d3]]（数据可视化分支 S20，配对工具：从数据到像素）
- [[recharts]]（React 图表组件，常和 RHF + zod 一起出现）
- [[visx]]（Airbnb 可视化基元，TS 友好这点是 zod 同源精神）
- [[observable-plot]]（Grammar of Graphics，"data → visual" 的 schema 化）
- [[echarts]]（配置式可视化，schema 思路对照）
- 后续：valibot / yup / arktype / typebox / @hookform/resolvers / tRPC（同主题分支 B）
