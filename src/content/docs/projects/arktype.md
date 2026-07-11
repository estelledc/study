---
title: arktype — schema 长得像 TypeScript 类型本身
来源: 'https://github.com/arktypeio/arktype'
日期: 2026-05-30
分类: 工具库
难度: 中级
---

## 是什么

arktype 是一个 TypeScript 运行时类型校验库。日常类比：和过海关一样，旅客（数据）要按规则被检查；zod 这种库是"先填一张多页表格再过关"，arktype 则是"在护照页背面写一句话——长得就像目的地国家的语言"。

它和 zod / valibot 最大不同：用**字符串字面量**描述 schema，写出来几乎就是 TS 类型本身的样子。

```ts
import { type } from "arktype"
const User = type({
  email: "string.email",
  age: "0 < number < 120",
  role: "'admin' | 'user'",
})
```

编译期靠 TypeScript template literal types 解析这串字符；运行期把字符串编译成校验闭包。结果是：schema 长得像 TS 类型，IDE 推出来的也是精确的 TS 类型。

## 为什么重要

不理解 arktype，下面这些事都没法解释：

- 为什么 zod 写久了会觉得 `.string().email().min(5)` 这种 method chain 像噪音
- 为什么 schema 一多，校验写法和 TypeScript 类型容易分成两套心智；arktype 想让两边尽量长得一样
- 为什么 TanStack Form / tRPC v11 / Hono 能"自动接受"任何符合 standardSchema 的库——arktype 是 v2.0 第一批实现
- 为什么有些团队不用事实标准 zod，反而选小众库——技术正确不等于商业成功

## 核心要点

arktype 的设计可以拆成 **三步**：

1. **schema 即字符串**：`"number > 0"` 不是表达式，而是 schema 文本。类比就像写正则——`/^\d+$/` 是字符串，但 IDE 把它当语法处理。

2. **编译期 + 运行期双解析**：编译期用 template literal types 把字符串递归拆开得到精确 TS 类型；运行期 tokenize 再生成校验闭包。两套解析器对齐同一份语法。

3. **结果即 narrow**：调用 `User(input)` 直接返回值或 `type.errors` 实例，`instanceof type.errors` 就是 narrowing 关键字。无需 zod 的 `{success, data, error}` 三件套包装。

三步绑在一起就是 arktype 的 unique value——schema 写法极简、类型推导极精确、错误信息自动派生。

## 实践案例

### 案例 1：定义 User schema

```ts
import { type } from "arktype"

const User = type({
  email: "string.email",
  age: "0 < number < 120",
  role: "'admin' | 'user'",
  tags: "string[]",
})

type UserT = typeof User.infer
// { email: string; age: number; role: 'admin' | 'user'; tags: string[] }
```

**逐部分解释**：

- `"string.email"` — 字符串内置子类型，校验是合法 email 格式
- `"0 < number < 120"` — 链式区间，DSL 内置语法直接表达 0 到 120 之间的范围（不含边界）
- `"'admin' | 'user'"` — 字符串字面量联合，TS 推出的类型仍是 union 而非 string
- `typeof User.infer` — 等价于 zod 的 `z.infer<typeof User>`，但写法更紧凑

### 案例 2：校验数据 + narrowing

```ts
const input: unknown = { email: "x@y.com", age: 25, role: "boss", tags: [] }
const result = User(input)
if (result instanceof type.errors) {
  console.error(result.summary)
  // "role must be 'admin' or 'user' (was 'boss')"
} else {
  console.log(result.email) // 类型已 narrow 为 UserT
}
```

`result instanceof type.errors` 是 arktype 的 narrowing 用法。比 zod 的 `result.success ? result.data : result.error` 三步少一层包装，但代价是：第一次见的人会以为 `result` 不会是 `type.errors`。

### 案例 3：跨前后端共享 schema

```ts
// shared/schemas.ts
import { type } from "arktype"
export const LoginSchema = type({
  email: "string.email",
  password: "string > 8",
})
export type LoginValues = typeof LoginSchema.infer

// 服务端（Hono / tRPC v11，通过 standardSchema 直接接受）
app.post("/login", LoginSchema, async (c) => { /* c.req.valid 已 narrow */ })

// 客户端（TanStack Form / RHF resolver）
useForm({ validators: { onSubmit: LoginSchema } })
```

一份 schema 同时给前端表单校验、后端 body 校验、TS 类型推导用。这是 schema 库共同的 sweet spot，但 arktype 在类型精度上保留了 literal union。

## 踩过的坑

1. **DSL 语法是 schema 不是表达式**：第一次看到 `"number > 0"` 会以为像 JS 在算 `number > 0`，其实这是 schema 文本——心智要重置才能从 zod 迁过来。
2. **多字段交叉校验不优雅**：写"password 必须等于 confirmPassword"，DSL 字符串力不从心，要回退到 `morph / narrow` 回调函数，写起来就和 zod 的 `.refine()` 差不多。
3. **编译时长会被拖慢**：template literal types 递归解析，schema 多了容易触发 TypeScript 的 "Type instantiation is excessively deep"。1000+ schema 的项目编译速度需要专门 benchmark。
4. **错误信息硬编码英文**：`result.summary` 给的是英文消息，i18n 项目要在外面套一层映射；社区有 PR 加翻译但合并慢。

## 适用 vs 不适用场景

**适用**：

- 资深 TS 团队，对类型推导精度有要求（保留 literal union 不退化成 string）
- 中小型项目（< 1000 schema），不会触发 template literal types 深度上限
- 需要接 TanStack Form / tRPC v11 / Hono 等支持 standardSchema 的新栈
- 已习惯写 [[zod]] 但想试更简洁 syntax 的迁移者

**不适用**：

- 老项目 TS 4.x（arktype 要求 ≥ 5.1）→ 维持 [[zod]]
- 新人团队、需要丰富生态（drizzle 集成、React Hook Form 模板项目默认 zod）
- 极度 bundle 敏感的 edge / 移动端场景 → [[valibot]] 更小（< 1KB tree-shake）
- 错误信息必须多语言、不能英文先发出去再翻译的场景

## 历史小故事（可跳过）

- **2022-04**：David Blass 单人发起 v0.1，最早名字叫"@re-/type"，定位是"chain-free schema with full TS inference"。
- **2023**：内部重构 ark/schema，引入 IR + JIT validator（schema 创建时编译成闭包，校验时直接调函数）。
- **2024-04**：v2.0 beta，开始实现 standardSchema 协议草案。
- **2024-10**：v2.0 GA。同期 valibot 也开始铺路 standardSchema，两家从不同方向（精度 vs bundle）共同挑战 zod 的事实标准位置。

## 学到什么

1. **TypeScript template literal types**（4.1+ 解锁）能把字符串解析进类型系统——arktype 是把这个能力用到极致的库
2. **同构 syntax** 是工具库重要竞争维度：schema 长得像目标语言类型，IDE 体验直觉
3. **协议比生态更稳**：standardSchema 让小众库绕过生态劣势，靠协议接入主流框架
4. **founder 主导小型库** 哲学一致性强、迭代快，但 bus factor=1 是真实风险

## 延伸阅读

- 官方文档：[arktype.io](https://arktype.io)（DSL 语法速查 + API 参考）
- standardSchema 提案：[standardschema.dev](https://standardschema.dev)（理解为什么 v2.0 GA 时机重要）
- 性能 benchmark：[moltar/typescript-runtime-type-benchmarks](https://github.com/moltar/typescript-runtime-type-benchmarks)（arktype vs zod vs valibot）
- 视频：搜索 "arktype is wild" 系列 demo（10 分钟现场写 schema 看 IDE 推导）
- [[zod]] —— 事实标准，理解 arktype 必先理解它的 method chain 流派

## 关联

- [[zod]] —— 事实标准，arktype 的对照对象；method chain vs 字符串 DSL 是核心分歧
- [[valibot]] —— 同期挑战者，走 bundle 极小路线；arktype 走类型精度路线
- [[react-hook-form]] —— 通过 `@hookform/resolvers/arktype` 接入
- [[tanstack-form]] —— 通过 standardSchema 协议直接接受 arktype schema
- [[trpc]] —— v11+ 接受任何 standardSchema 实现作为 input validator
- [[hono]] —— web 框架，已支持 standardSchema 的 body 校验
- [[effect]] —— 同样以 TS 类型精度为卖点的另一条路线（更重，含完整 effect system）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[hono]] —— Hono — 多运行时 Web 框架
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[vue-i18n]] —— vue-i18n — Vue 官方 i18n，切语言整页自己刷新
- [[zod]] —— Zod — TypeScript-first schema 验证

