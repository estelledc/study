---
title: Valibot — 拆成乐高的 TypeScript 校验库
来源: https://github.com/open-circle/valibot
日期: 2026-05-30
分类: 前端工程
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/open-circle/valibot
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: 32247b362e7f80bc7c0b6c1cf180049ee4f8b884
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
  applicable_version: 1.4.2
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

每个 schema、action 和 method 都有独立 export，`sideEffects: false` 让 bundler 有机会移除未使用模块。实际产物是否更小仍取决于 import 写法、bundler 和配置，不能由 API 外观直接保证。

## 为什么重要

不理解 valibot，下面这些事都没法解释：

- 为什么 schema、validation action、transformation 和 parse method 被拆成独立模块
- 为什么 `safeParse` 同时返回 `typed` 和 `success`，而且两者含义不同
- 为什么 object 默认剥离未知字段，另有 loose/strict/rest 四种选择
- 为什么"API 设计影响 bundle 体积"是 TypeScript 时代库设计的新硬约束

## 核心要点

Valibot 的设计可以拆成四个机制：

1. **schema 是带 `~run` 的普通对象**：`v.string()`、`v.object()` 返回描述和执行合同，不依赖 class method chain。`~standard` getter 还暴露 Standard Schema 协议。

2. **action 按顺序进入 pipe**：validation 可以累积 issue；已有 issue 后再遇到 schema 或 transformation，pipe 会停止并把 dataset 标为 untyped。`abortEarly` 与 `abortPipeEarly` 控制不同层级的提前退出。

3. **parse 结果有两个状态维度**：`success` 表示是否没有 issue，`typed` 表示输出是否仍符合 schema 的类型合同。失败时仍可能有中间 `output`，不能当作可信业务值继续使用。

4. **object 策略明确**：`object` 默认只输出声明字段；`looseObject` 保留未知项；`strictObject` 对未知项报 issue；`objectWithRest` 用 rest schema 校验它们。

## 实践示例

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

三步：① `await req.json()` 拿到原始对象；② `safeParse` 返回 `{typed, success, output, issues}`；③ 只有 `success` 时才进入业务逻辑。bundle 与 cold start 收益需要在目标部署上实测。

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

### 案例 4：观察 pipe 的中间结果

```ts
const Amount = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.transform(Number),
  v.number(),
)

const result = v.safeParse(Amount, " 42 ")
if (result.success) console.log(result.output) // 42
```

顺序是合同的一部分：先 trim 再检查空值，再转换为 number，最后用 number schema 确认输出类型。把 transformation 提前或删掉末端 schema 都会改变失败语义。

## 踩过的坑

1. **从 Zod 迁过来不是改 import 那么简单**：链式 `.email().min(8)` 要全部改成 `v.pipe(v.string(), v.email(), v.minLength(8))`，每个字段多一层包装，团队需要 1-2 周适应期。

2. **JSON Schema 不是核心包自动附赠**：固定仓库提供官方 `@valibot/to-json-schema`，但转换覆盖度与下游接受程度仍要按实际 schema 验证。

3. **忽略 i18n 配置范围**：固定仓库已有官方 `@valibot/i18n`，包含 `zh-CN` / `zh-TW` 等翻译；仍需决定全局、schema 或单次 parse 的 message 优先级。

4. **把 `typed` 当 `success`**：validation issue 可能存在但输出仍保持类型；业务边界必须以 `success` 判断是否接受。

## 适用 vs 不适用场景

**适用**：
- Cloudflare Worker / Lambda / Vercel Edge 等 bundle 敏感的 serverless
- 静态站点或库代码，且已经验证目标 bundler 能移除未使用模块
- 新项目从零起、没有 Zod 历史包袱
- 库作者想内部用校验但不想强加 Zod 给下游

**不适用**：
- 已有大量 Zod schema 的存量项目（迁移成本 > 收益）
- 重度依赖 OpenAPI / JSON Schema 且团队已绑死 Zod 工具链（虽有 `@valibot/to-json-schema`，默认示例仍多是 Zod）
- 需要复杂类型 DSL 推导（用 [[arktype]]）
- bundle 不是瓶颈、团队更重视既有适配器和迁移成本

## 固定版本边界

- 本文绑定 `open-circle/valibot@32247b36...`，核心包版本为 `1.4.2`。
- 旧 `fabian-hiller/valibot` URL 已重定向到当前组织，canonical source 已更新。
- 固定 monorepo 还包含官方 `@valibot/i18n` 与 `@valibot/to-json-schema`。
- `sideEffects: false` 与模块化源文件支持 tree shaking，但本文未运行 bundle 或 cold-start benchmark。
- 本文未安装依赖或运行上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **API 形状决定 bundle 形状**：method chain 让 class 整体进 bundle；modular function 让 tree-shake 真生效。这是结构性决策，事后无法补救。
2. **dataset 把类型状态与业务成功分开**：`typed` 不能替代 `success`，中间输出不能越过 issue gate。
3. **pipe 顺序决定语义**：validation、transformation 和下一层 schema 的排列会改变输出和失败方式。
4. **模块化也增加选择成本**：对象策略、abort 配置、i18n 和转换包需要团队显式定约。

## 应用型自测

1. `safeParse` 返回 `typed: true, success: false`。能否把 `output` 直接写入数据库？
2. `v.object({ id: v.string() })` 收到额外 `admin` 字段，默认输出会保留吗？
3. 只看到 Valibot 源码是独立模块，能否直接宣称生产 bundle 一定小多少 KB？

检查点：

1. 不能。存在 issue 就未通过业务合同，`typed` 只描述类型状态。
2. 不会。默认 object 只保留声明字段；其他策略要显式选择。
3. 不能。还要绑定 import、bundler、minifier 和应用图做实际产物比较。

## 延伸阅读

- 官方文档：[valibot.dev](https://valibot.dev/)（每个 schema 都有 playground）
- 固定源码：[open-circle/valibot](https://github.com/open-circle/valibot) —— 本文绑定提交 `32247b362e7f80bc7c0b6c1cf180049ee4f8b884`
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
- [[conform]] —— Conform — 让浏览器原生 form 也能 type-safe 校验
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[zod]] —— Zod — TypeScript-first schema 验证
