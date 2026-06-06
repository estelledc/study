---
title: Zod — TypeScript-first schema 验证
来源: https://github.com/colinhacks/zod
日期: 2026-05-29
子分类: 表单与校验
分类: 后端 API
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

Zod 是用 TypeScript 写的**数据形状校验器**。你定义一个 schema 描述数据应该长什么样，运行时校验通过的数据自动获得对应的 TypeScript 静态类型。

日常类比：像快递包裹的安检。进门时按 schema 验形状（盒子尺寸、重量、内含物品）；通过的箱子自动贴上「已确认是某型号」标签——下游处理代码看到标签就知道盒子里有什么，不用再次开箱检查。

你写：

```ts
import { z } from "zod"
const User = z.object({
  email: z.string().email(),
  age: z.number().min(18),
})
```

一行代码同时给你两件东西：runtime 上 `User.parse(unknown)` 校验任意输入；编译期 `z.infer<typeof User>` 把 schema 当成静态 type 用。这两条信息共享同一份源代码，不会漂移。

## 为什么重要

不理解 zod 在 TS 生态的位置，下面这些事会让你困惑：

- 为什么 [[trpc]] 用它定 API 契约——schema = 客户端 + 服务端的统一类型源
- 为什么 [[next-js]] Server Actions、Astro Content Collections 默认用它做输入校验
- 为什么它把 Yup / Joi / class-validator 这些「TS 之前」的方案挤下去——schema 不再需要单独维护一份 type
- 为什么 v4（2024 RC）值得关注——bundle 砍半、运行时性能 2-3 倍，是工具库为 LLM 时代重做基础设施的典型动作

一句话：zod 是 TS 时代的「数据契约层」，从前端 form 到 LLM 输出都靠它。

## 核心要点

zod 的核心可以拆成 **三件事**：

1. **schema 即 type**：`z.string()` 既是运行时验证器又能 `z.infer<typeof X>` 拿 TS 类型。一份代码两条轨道，不可能漂移。

2. **parse vs safeParse**：前者抛 `ZodError` 异常（适合明确知道数据合法的内部场景），后者返回 `{ success, data | error }` 辨识联合（适合用户输入 / API 边界，让 TypeScript 自动 narrow）。

3. **refine / transform / pipe**：refine 加自定义校验但不改类型；transform 改 output 类型把 input 映射成新值；pipe 把两个 schema 串起来（先转换再二次校验）。

## 实践案例

### 案例 1：最简 schema + parse

```ts
import { z } from "zod"

const User = z.object({
  email: z.string().email(),
  age: z.number().min(18),
})

User.parse({ email: "a@b.c", age: 20 })   // 通过
User.parse({ email: "x", age: 20 })        // throw ZodError（email 不合法）
User.parse({ email: "a@b.c", age: 10 })    // throw ZodError（age 不够 18）
```

`.parse` 抛异常的行为简单直接。不希望异常上抛时换 `.safeParse`：

```ts
const result = User.safeParse(req.body)
if (!result.success) {
  return res.status(400).json({ errors: result.error.issues })
}
const user = result.data  // 这里 user 类型为 User，已校验通过
```

`safeParse` 返回辨识联合，TypeScript narrow 后 `result.data` 自动有类型。

### 案例 2：从 schema 推 TS 类型

```ts
const User = z.object({
  email: z.string().email(),
  age: z.number().min(18),
  role: z.enum(["admin", "user", "guest"]),
  tags: z.array(z.string()).optional(),
})

type User = z.infer<typeof User>
// {
//   email: string;
//   age: number;
//   role: "admin" | "user" | "guest";
//   tags?: string[] | undefined;
// }
```

`type User` 不是手写的，是从 `User` schema 「推出来」的。schema 改字段，类型自动跟随；不可能像传统手写 type 那样和真实校验对不上。

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

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(Login),
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

`zodResolver` 把 zod 的 issue 数组翻译成 RHF 的 errors 字典。一份 schema 同时跑客户端 form 校验、服务端 API 校验、TS 类型推导。

## 踩过的坑

1. **`z.infer` 推断深度有限**：嵌套超过 5 层、字段超过 50 个的对象 schema，TypeScript 推导会显著变慢甚至触发 `Type instantiation is excessively deep` 报错。缓解：把大 schema 拆成多个小 schema，或在中间用 `as` 强转一次。v4 据称优化了推导链路。

2. **`z.lazy()` 处理递归 schema 容易出错**：

   ```ts
   type Tree = { val: number; children: Tree[] }
   const TreeSchema: z.ZodType<Tree> = z.lazy(() => z.object({
     val: z.number(),
     children: z.array(TreeSchema),
   }))
   ```

   必须显式标注 `z.ZodType<Tree>`——TS 推断不出递归 generic 自身。漏掉这个标注会得到 `any` 或不匹配错误。

3. **`refine` + `transform` 顺序敏感**：先 refine 再 transform，校验跑在原始值上；先 transform 再 refine，校验跑在转换后的值上。两个顺序结果不同。需要「先转换再二次校验」用 `.pipe(anotherSchema)`，比如把 form 里的 string `"42"` 先转成 number 再校验范围：`z.string().transform(s => parseInt(s)).pipe(z.number().int().max(100))`。

4. **React Server Actions 错误序列化**：Server Action 抛 ZodError 跨网络边界时，error 对象里的 `issues` 数组可能在序列化中丢结构（含 Symbol、function 字段时尤甚）。建议边界处用 `safeParse`，把 `issues` 显式转成 plain object 再返回。

## 适用 vs 不适用场景

**适用**：
- TS 项目的运行时输入校验（API、form、LLM 输出、配置文件）
- 需要「schema = 类型源头」的场景（避免类型与校验逻辑分开维护）
- 中等规模的数据契约（字段数 < 50、嵌套 < 5 层）

**不适用**：
- 极致 bundle 敏感场景（边缘函数、小程序）→ 考虑 valibot（按需 import 函数，bundle 小 5x）
- 极致性能场景（每秒百万级 parse）→ 考虑 typebox（编译到 Ajv）
- 非 TS 项目 → zod 的核心价值在 `z.infer` 与 TS 类型联动；纯 JS 项目用 yup / joi 也够

## 学到什么

1. **「schema 既是类型又是 runtime」是 TS 时代真正的范式跃迁**——不是「类型 + JSONSchema」机械相加，而是用 conditional types 让一行代码同时跑两条机器码
2. **API 通俗化决定胜负**：zod 在技术原创性上不如 io-ts，性能不如 typebox / valibot，但方法链 API 让 95% 开发者愿意上手。让普通人用得起的复杂技术，比纯技术决策更重要
3. **生态锁定是真实存在的**：[[trpc]] / RHF / OpenAI helper / drizzle-zod 默认接 zod 之后，单换 schema 库的成本远超技术对比的差距
4. **single source of truth 有代价**：一份 schema 跑前后端 + form + LLM + DB，理想很美；但 schema 一变所有下游都要 redeploy + 重测，耦合度从「独立变化」升级为「一处变全栈变」

## 延伸阅读

- 官方文档：[zod.dev](https://zod.dev)（v3 主线最完整文档，含每个方法的可运行例子）
- 仓库：[github.com/colinhacks/zod](https://github.com/colinhacks/zod)（issue / discussion 信息密度高，v4 进展也在这里）
- [[trpc]] —— zod 的最大下游用户，端到端类型契约
- [[next-js]] —— Server Actions / API routes 默认搭 zod 做输入校验

## 关联

- [[trpc]] —— tRPC 用 zod 定 procedure input/output，是 zod 在「网络边界」的杀手级应用
- [[next-js]] —— Next.js Server Actions / Astro Content Collections 都默认接 zod
- [[d3]] —— 同主题对照「数据契约 → 数据可视化」的两端：zod 把 unknown 数据变成 known 类型，d3 把 known 数据变成像素

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[conform]] —— Conform — 让浏览器原生 form 也能 type-safe 校验
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[i18next]] —— i18next — 让一份 JS 代码同时讲几十种语言
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[mcp-ts-sdk]] —— MCP TS SDK — Model Context Protocol TypeScript 实现
- [[mikro-orm]] —— MikroORM — Data Mapper Identity Map ORM
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[next-js]] —— Next.js — React 全栈框架
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[typeorm]] —— TypeORM — Decorator-based ORM
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[vercel-ai]] —— Vercel AI SDK — 多 LLM Provider 统一 SDK
- [[wretch]] —— wretch — 把 fetch 写成一条链

