---
title: Valibot — 拆成乐高的 TypeScript 校验库
来源: 'https://github.com/fabian-hiller/valibot + https://valibot.dev'
日期: 2026-05-30
分类: 前端工程
难度: 初级
---

## 是什么

Valibot 是一个**让你按需挑零件的 TypeScript 校验库**。日常类比：[[zod]] 像一整套已组装好的瑞士军刀（不管用不用，都得带在身上）；valibot 像一袋散装乐高（用哪块拿哪块，不用的留在袋里）。

你写校验代码大概长这样：

```ts
import * as v from "valibot";

const Login = v.object({
  email: v.pipe(v.string(), v.email("邮箱格式错")),
  password: v.pipe(v.string(), v.minLength(8, "至少 8 位")),
});

const result = v.safeParse(Login, { email: "a@b.com", password: "12345678" });
```

只 import 了 `object / string / email / minLength / pipe / safeParse` 这几个函数，bundler 打包时其它 100 多个 schema 一概不进。这就是 valibot 和 Zod 工程上**最大的区别**。

## 为什么重要

不理解 valibot，下面这些事都没法解释：

- 为什么 Cloudflare Worker / 边缘函数项目的 README 越来越多写 "use valibot, not zod"
- 为什么功能相近、生态更弱的库，也能从早期每周几十万涨到百万级下载
- 为什么 [[trpc]]、[[react-hook-form]]、[[tanstack-form]] 都顺手加了 valibotResolver
- 为什么"API 设计影响 bundle 体积"是 TypeScript 时代库设计的新硬约束

## 核心要点

valibot 的设计可以拆成 **三句话**：

1. **schema 是函数返回值，不是 class 实例**：`v.string()` 返回一个普通对象，里面记录了"我是 string 类型 + 这些 action"。类比：菜谱里的"一勺盐"是文字描述，不是一勺真盐。

2. **action 串成 pipe**：`v.pipe(v.string(), v.email(), v.minLength(5))` 把基础 schema 和一连串校验动作排成队，校验时按顺序过。类比：工厂流水线，原料从头进，每一站加工一下。

3. **每个零件独立 export**：`string` / `email` / `pipe` 都是各自的 named export。bundler 看到你只 import 了几个，就把别的全部 dead-code-eliminate。这是 tree-shake 起作用的前提。

合在一起：**modular function API + pipe 组合 = 比 Zod 小 5-10 倍的 bundle**。

## 实践案例

### 案例 1：表单校验（前端）

```ts
import * as v from "valibot";
import { useForm } from "react-hook-form";
import { valibotResolver } from "@hookform/resolvers/valibot";

const Schema = v.object({
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.minValue(18)),
});
type Form = v.InferOutput<typeof Schema>;

const { register, handleSubmit } = useForm<Form>({
  resolver: valibotResolver(Schema),
});
```

`InferOutput` 把 schema 反推成 TS 类型 `{email: string; age: number}`，省掉手写 interface。`valibotResolver` 把 valibot 的 issue 翻译成 RHF 认识的错误格式。

### 案例 2：服务端入参校验（Worker）

```ts
import * as v from "valibot";

const Body = v.object({ id: v.string(), qty: v.pipe(v.number(), v.minValue(1)) });

export default {
  async fetch(req: Request) {
    const r = v.safeParse(Body, await req.json());
    if (!r.success) return new Response(JSON.stringify(r.issues), { status: 400 });
    return new Response("ok " + r.output.id);
  },
};
```

三步：① `await req.json()` 拿到原始对象；② `safeParse` 永远不抛，返回 `{success, output, issues}`；③ 失败就 400 回 issues。Worker / Lambda 这种 cold start 敏感场景，少打包约十几 KB，启动延迟可观察地下降。

### 案例 3：[[trpc]] 输入校验

```ts
import * as v from "valibot";
import { router, publicProcedure } from "./trpc";

export const app = router({
  login: publicProcedure
    .input(v.object({ email: v.pipe(v.string(), v.email()), pwd: v.string() }))
    .mutation(async ({ input }) => ({ token: "..." })),
});
```

三步：① 用 `v.object` 写输入 schema；② 塞进 `.input(...)`；③ `mutation` 里的 `input` 已是推好的类型。tRPC 10.43 起原生认 valibot，前后端共享同一份 schema 文件即可。

## 踩过的坑

1. **从 Zod 迁过来不是改 import 那么简单**：链式 `.email().min(8)` 要全部改成 `v.pipe(v.string(), v.email(), v.minLength(8))`，每个字段多一层包装，团队需要 1-2 周适应期。

2. **JSON Schema 路径仍有摩擦**：官方已有 `@valibot/to-json-schema`，但 OpenAPI / Vercel AI SDK `generateObject` 默认仍走 Zod，对接时常要额外转换或换适配层。

3. **错误信息默认英文**：内置 message 全英文，i18n 没有官方多语言包，社区方案散落，要么手动传 message，要么自己包一层。

4. **生态 inertia 比想象中重**：`drizzle-valibot` 已有官方插件，但 next-auth / clerk 示例与大量存量 Zod schema 仍在，光换校验库不够，相关工具链都得跟着换。

## 适用 vs 不适用场景

**适用**：
- Cloudflare Worker / Lambda / Vercel Edge 等 bundle 敏感的 serverless
- 静态站点（[[astro]] content collection、博客）每页都内联校验逻辑
- 新项目从零起、没有 Zod 历史包袱
- 库作者想内部用校验但不想强加 Zod 给下游

**不适用**：
- 已有大量 Zod schema 的存量项目（迁移成本 > 收益）
- 重度依赖 OpenAPI / JSON Schema 且团队已绑死 Zod 工具链（虽有 `@valibot/to-json-schema`，默认示例仍多是 Zod）
- 需要复杂类型 DSL 推导（用 [[arktype]]）
- bundle 量级在百 KB+ 的大型 SPA（差十几 KB 用户感知接近 0）

## 历史小故事（可跳过）

- **2023-08**：Hiller 在 GitHub 发 v0.1，名字叫 valibot（validation + robot）。bundle ~3 KB 已经比 Zod 小一半。
- **2024-04**：v0.30 引入 Action 概念雏形，把 transform / regex 从 schema 上拆出来。
- **2024-08**：v0.39 起 [[trpc]] 原生支持，valibot 第一次进入主流框架默认 resolver 列表。
- **2024-10**：v0.42 把动作正式分成 Validation / Transformation / Brand 三类。
- **2024-12**：v1.0 API 冻结，承诺 1.x 不破坏，核心 bundle 700 字节，全量 ~13 KB。

整个 v0.x 持续 16 个月，发布节奏激进，每 2-3 周一个 minor。

## 学到什么

1. **API 形状决定 bundle 形状**：method chain 让 class 整体进 bundle；modular function 让 tree-shake 真生效。这是结构性决策，事后无法补救。
2. **细分市场比全面竞争更可行**：valibot 不正面打 Zod，专攻 edge runtime + bundle 敏感场景，靠体积优势吃进边缘部署。
3. **生态 inertia 是后来者最大的对手**：技术更优 ≠ 用户搬家。Zod 千万级 weekly 下载里绝大多数没动机迁。
4. **v1.0 之后的 18 个月才是真考验**：API 冻结后能否吸引重型框架做官方 example，决定它的天花板。

## 延伸阅读

- 官方文档：[valibot.dev](https://valibot.dev/)（每个 schema 都有 playground）
- 创始人 talk：[Fabian Hiller — Why I built valibot](https://www.youtube.com/results?search_query=fabian+hiller+valibot)
- bundle 对比实测：[bundlephobia.com/package/valibot](https://bundlephobia.com/package/valibot)
- [[zod]] —— valibot 的灵感来源 + 主竞品
- [[arktype]] —— 另一条 Zod 替代路线（string DSL）

## 关联

- [[zod]] —— 直接对照物，valibot 几乎所有设计决策都在和它对着来
- [[react-hook-form]] —— 通过 `valibotResolver` 一行接入，体验和 zodResolver 一致
- [[tanstack-form]] —— 同样支持 valibot 作为校验适配器
- [[trpc]] —— 10.43 起原生认 valibot schema 作为 input
- [[arktype]] —— 同样追求"轻 + 强类型"，但走 TS string DSL 极端路线
- [[astro]] —— content collection 默认 Zod，社区有 astro-valibot 替换
- [[effect]] —— Effect Schema 是另一种"函数式 schema"思路，比 valibot 更激进

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[conform]] —— Conform — 让浏览器原生 form 也能 type-safe 校验
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[vue-i18n]] —— vue-i18n — Vue 官方 i18n，切语言整页自己刷新
- [[zod]] —— Zod — TypeScript-first schema 验证

