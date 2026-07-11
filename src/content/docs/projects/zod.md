---
title: Zod — TypeScript-first schema 验证
来源: https://github.com/colinhacks/zod
日期: 2026-05-29
分类: 验证 / 类型
难度: 中级
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
- 为什么 v4 值得关注——作者重做核心，bundle 与运行时性能明显提升，面向 LLM 输出校验等新场景

一句话：zod 是 TS 时代常见的「数据契约层」，从前端 form 到 LLM 输出都有人用它。

## 核心要点

zod 的核心可以拆成 **三件事**：

1. **schema 即 type**：`z.string()` 既是运行时验证器，又能 `z.infer` 拿 TS 类型。类比：同一张图纸既指导工厂质检，又自动生成零件规格表。

2. **parse vs safeParse**：`parse` 失败就抛 `ZodError`（校验失败报告，适合内部已信任的数据）；`safeParse` 返回 `{ success, data | error }` 这种「成功/失败二选一」结构（适合用户输入 / API 边界，TS 会帮你收窄类型）。类比：前者是安检直接拦人，后者是给你一张通过/退回单。

3. **refine / transform / pipe**：refine 加自定义规则但不改类型；transform 改输出值与类型；pipe 把两个 schema 串起来（先转换再二次校验）。类比：先称重、再换包装、再贴新标签——顺序不同，结果不同。

## 实践案例

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

## 踩过的坑

1. **`z.infer` 推断深度有限**：嵌套 >5 层或字段 >50 时，TS 可能变慢甚至报 `Type instantiation is excessively deep`。拆成小 schema，或中间用类型断言打断推导链。
2. **`z.lazy()` 递归必须手写类型**：`const Tree: z.ZodType<Tree> = z.lazy(() => z.object({ val: z.number(), children: z.array(Tree) }))`——漏掉 `z.ZodType<Tree>` 常得到 `any`。
3. **`refine` 与 `transform` 顺序敏感**：先 refine 再 transform 校验的是原值；反过来校验的是转换后的值。需要「先转再验」用 `.pipe`，例如 `z.string().transform(s => parseInt(s)).pipe(z.number().int().max(100))`。
4. **Server Action 里别直接抛 ZodError**：跨网络序列化可能丢掉 `issues` 结构。边界用 `safeParse`，把 issues 转成普通对象再返回。

## 适用 vs 不适用场景

**适用**：
- TS 项目的运行时输入校验（API、form、LLM 输出、配置）
- 需要「schema = 类型源头」的场景
- 中等规模契约（字段 <50、嵌套 <5 层）

**不适用**：
- 极致 bundle 敏感（边缘函数、小程序）→ 考虑 [[valibot]]
- 极致吞吐（每秒百万级 parse）→ 考虑 typebox + Ajv
- 非 TS 项目 → zod 核心价值在 `z.infer`；纯 JS 用 yup / joi 往往够用

## 历史小故事（可跳过）

- 2020：Colin McDonnell 发布 zod，目标是「TypeScript-first」的 schema 库
- 2021–2023：被 tRPC、React Hook Form resolvers 等广泛接入，成为 TS 校验默认选项之一
- 2024：v4 进入公开预览 / RC，重写核心以缩小 bundle、加快解析
- 2025 起：v4 进入稳定发布线，文档与生态逐步迁移

## 学到什么

1. **「schema 既是类型又是 runtime」**是 TS 时代的实用范式——一份源码同时服务编译器与运行时
2. **API 好口决定采用率**：方法链让多数开发者愿意上手，往往比纯性能或理论优雅更重要
3. **生态锁定真实存在**：[[trpc]] / RHF / drizzle-zod 接上之后，换库成本常高于纸面对比
4. **单一真相源有代价**：schema 一变，前后端 / form / LLM 边界都可能要一起改与重测

## 延伸阅读

- 官方文档：[zod.dev](https://zod.dev)
- 仓库：[github.com/colinhacks/zod](https://github.com/colinhacks/zod)
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
