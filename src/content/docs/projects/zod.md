---
title: Zod — TypeScript-first schema 验证
来源: https://github.com/colinhacks/zod
日期: 2026-05-29
分类: 验证 / 类型
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/colinhacks/zod
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: 912f0f51b0ced654d0069741e7160834dca742ee
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
  applicable_version: 4.4.3
---

## 是什么

Zod 是用 TypeScript 写的**数据形状校验器**。你定义一份 schema（数据该长什么样的说明书），运行时按它检查输入；通过的数据自动带上对应的 TypeScript 静态类型。

日常类比：像快递安检。进门按说明书验形状；通过的箱子贴上「已确认型号」标签——下游看到标签就知道里面是什么，不用再开箱。

```ts
import { z } from "zod"
const User = z.object({
  email: z.string().email(),
  age: z.number().min(18),
})
```

同一份代码给两件事：运行时 `User.parse(unknown)` 校验任意输入；编译期 `z.infer<typeof User>`（从 schema「推」出类型）当静态 type 用。两边共享源码，不会各写各的、慢慢对不上。

## 为什么重要

不理解 zod 在 TS 生态的位置，下面这些事会让你困惑：

- 为什么 [[trpc]] 常用它定 API 契约——一份 schema 同时当客户端与服务端的类型源
- 为什么 [[next-js]] Server Actions、Astro Content Collections 常接它做输入校验（框架支持，不是唯一强制默认）
- 为什么在 TS 项目里它常比 Yup / Joi / class-validator 更省事——不必再手写一份平行的 type
- 为什么 v4 不能只当 v3 的版本号升级——固定源码已经拆出 classic、mini、core 与 codec 等不同入口和能力层

一句话：zod 是 TS 时代常见的「数据契约层」，从前端 form 到 LLM 输出都有人用它。

## 核心要点

Zod v4 的核心可以拆成四层：

1. **schema 同时承载 runtime 与 static type**：`z.string()` 是运行时 schema，`z.infer` 从它提取输出类型。TypeScript 类型会在编译后消失，真正拦住外部数据的是 runtime parse。

2. **所有入口汇合到 core runner**：classic schema 的 `parse` / `safeParse` 最终调用 `_zod.run`。`parse` 有 issue 时抛 `ZodError`；`safeParse` 返回成功/失败联合。两者校验语义相同，差别是错误控制流。

3. **同步与异步是显式边界**：同步 runner 遇到 Promise 会抛 `$ZodAsyncError`。包含 async refine/transform 时必须使用 `parseAsync` 或 `safeParseAsync`，不能期待同步 API 自动等待。

4. **对象与组合策略会改变输出**：`z.object` 默认移除未知 key，`looseObject` 保留，`strictObject` 报 issue，`catchall` 用额外 schema 校验。`refine`、`transform`、`pipe` 的顺序还会改变被检查的值。

## 实践示例

### 案例 1：最简 schema + parse

```ts
import { z } from "zod"
const User = z.object({
  email: z.string().email(),
  age: z.number().min(18),
})
User.parse({ email: "a@b.c", age: 20 }) // 通过
User.parse({ email: "x", age: 20 })      // throw ZodError
```

**逐部分解释**：

1. `z.object({...})` 声明「必须是对象，且有这些字段」
2. `.email()` / `.min(18)` 是字段级规则
3. 不想抛异常时用 `safeParse`：失败读 `result.error.issues`，成功则 `result.data` 已是校验后的类型

### 案例 2：从 schema 推 TS 类型

```ts
const User = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
  tags: z.array(z.string()).optional(),
})
type User = z.infer<typeof User>
```

**逐部分解释**：

1. `z.infer<typeof User>` 让 TypeScript 从 schema 推出 type，不是手写第二份
2. `z.enum` 推出字面量联合 `"admin" | "user"`
3. schema 改字段，类型跟着变——校验与类型不会漂移

### 案例 3：React Hook Form 集成

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
const Login = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})
type LoginInput = z.infer<typeof Login>
const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
  resolver: zodResolver(Login),
})
```

**逐部分解释**：

1. `zodResolver` 把 zod 的 issue 列表翻译成表单 `errors`
2. 同一份 schema 可同时服务客户端 form 与服务端 API
3. `LoginInput` 仍由 `z.infer` 推出，表单泛型与校验同源

### 案例 4：验证对象输出和异步边界

```ts
const User = z.object({ name: z.string() })
console.log(User.parse({ name: "Ada", admin: true }))
// { name: "Ada" }：默认移除未知 key

const Exists = z.string().refine(async (id) => id === "known")
await Exists.parseAsync("known")
```

这个例子同时暴露两个常被忽略的合同：解析可能返回与输入不同的对象；async refinement 必须走 async API。

## 踩过的坑

1. **把 `safeParse` 理解成永不抛**：普通 validation issue 会进入返回值，但 async schema 走同步 API仍会抛异步边界错误。
2. **忽略未知 key 策略**：默认 strip 可能让输入字段静默消失；需要保留或拒绝时应显式选择 loose/strict/catchall。
3. **混淆 input 与 output**：transform/codec 让输入输出类型不同，`z.infer` 默认关注 output；边界代码要明确自己需要 `z.input` 还是 `z.output`。
4. **只测一个执行路径**：对象解析有 JIT/jitless 路径，固定测试专门比较 key 顺序和 `__proto__` 防护；安全敏感升级应覆盖两者。

## 适用 vs 不适用场景

**适用**：
- TS 项目的运行时输入校验（API、form、LLM 输出、配置）
- 需要「schema = 类型源头」的场景
- 团队愿意围绕 Zod v4 的错误、异步和对象输出语义建立测试

**不适用**：
- 极致 bundle 敏感但尚未做目标 bundler 实测 → 应先比较 Zod Mini、[[valibot]] 等实际产物
- 极致吞吐但尚未使用真实 schema 与数据 benchmark → 不应只看项目 README 排名
- 非 TS 项目 → zod 核心价值在 `z.infer`；纯 JS 用 yup / joi 往往够用

## 固定版本边界

- 本文绑定 `colinhacks/zod@912f0f51...`，`packages/zod` 版本为 `4.4.3`。
- 固定包同时导出默认入口、`mini`、`v3`、`v4`、`v4/core` 和 locale 子路径。
- `sideEffects: false` 为 tree shaking 提供条件，但最终 bundle 仍取决于 import、bundler 与配置。
- 本文只做源码/测试静态审查，没有安装依赖、运行上游测试或 bundle benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **「schema 既是类型又是 runtime」**是 TS 时代的实用范式——一份源码同时服务编译器与运行时
2. **API 好口决定采用率**：方法链让多数开发者愿意上手，往往比纯性能或理论优雅更重要
3. **生态锁定真实存在**：[[trpc]] / RHF / drizzle-zod 接上之后，换库成本常高于纸面对比
4. **单一真相源有代价**：schema 一变，前后端 / form / LLM 边界都可能要一起改与重测

## 应用型自测

1. `safeParse()` 使用了 async refinement。失败一定会落在 `{ success: false }` 里吗？
2. API 输入包含 `{ name: "Ada", admin: true }`，schema 是 `z.object({ name: z.string() })`。默认输出还有 `admin` 吗？
3. 一个 transform 把字符串转成数字。函数边界该只写 `z.infer`，还是区分 input/output？

检查点：

1. 不一定。同步 API 遇到 Promise 会抛异步错误，应使用 `safeParseAsync()`。
2. 没有。默认 object 会移除未知 key；保留或拒绝需要显式策略。
3. 应区分。外部输入和校验后的输出是两种类型，不能用一个别名掩盖转换边界。

## 延伸阅读

- 官方文档：[zod.dev](https://zod.dev)
- 仓库：[github.com/colinhacks/zod](https://github.com/colinhacks/zod)
- 固定源码：[colinhacks/zod](https://github.com/colinhacks/zod) —— 本文绑定提交 `912f0f51b0ced654d0069741e7160834dca742ee`
- [[trpc]] —— 端到端类型契约的最大下游之一
- [[valibot]] —— 更小 bundle 的模块化替代
- [[react-hook-form]] —— 表单侧常见集成点
- [[next-js]] —— Server Actions / 路由里常见的输入校验搭配

## 关联

- [[trpc]] —— procedure input/output 常用 zod 定契约
- [[next-js]] —— Server Actions / API 边界常接 zod
- [[react-hook-form]] —— `@hookform/resolvers/zod` 把 schema 接到表单
- [[valibot]] —— 同赛道、更强调按需导入的校验库
- [[arktype]] —— schema 写法更贴近 TypeScript 类型本身
- [[d3]] —— 对照：zod 把 unknown 变成 known；d3 把 known 数据变成像素

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[conform]] —— Conform — 让浏览器原生 form 也能 type-safe 校验
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[i18next]] —— i18next — 让一份 JS 代码同时讲几十种语言
- [[mcp-ts-sdk]] —— MCP TS SDK — Model Context Protocol TypeScript 实现
- [[mikro-orm]] —— MikroORM — Data Mapper Identity Map ORM
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[typeorm]] —— TypeORM — Decorator-based ORM
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[vercel-ai]] —— Vercel AI SDK — 多 LLM Provider 统一 SDK
- [[wretch]] —— wretch — 把 fetch 写成一条链
