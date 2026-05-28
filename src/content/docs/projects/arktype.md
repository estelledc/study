---
title: arktype TypeScript 字符串 DSL 模式校验
来源: https://github.com/arktypeio/arktype + arktype.io 官方文档
---

# arktype — 用 TypeScript 字符串字面量类型做 schema

## 一句话总结

arktype 是 David Blass 2022 年开源的 TypeScript schema 库，2024 年 v2.0 GA。它和 zod / valibot / yup 都不一样——这三家用 method chain（zod）/ function pipe（valibot）/ method chain（yup）来描述 schema，arktype 则用 **TypeScript 字符串字面量类型**：

```ts
import {type} from "arktype";
const User = type({
  email: "string.email",        // 字符串本身就是 schema
  age: "number > 0 < 120",      // 区间用 DSL 语法
  role: "'admin' | 'user' | 'guest'"  // 联合类型字面量
});
```

技术核心：编译期用 TypeScript 模板字面量类型（template literal types）+ const generics 解析这些字符串，得到精确的 TS 类型；运行期把字符串解析成 AST + 校验函数。

类型推导**极强**：`type({email: "string.email"})` 推出来就是 `{email: string}`；`type("'admin' | 'user'")` 推出来就是 `'admin' | 'user'`，不是 `string`。zod 的 `.email()` 永远是 `string`，arktype 能保留更精确的 brand。

但学习曲线陡：DSL 语法独特，新人第一次看 `"number > 0"` 一头雾水（这是 schema 不是表达式）。

定位：小众但锐利。适合资深 TS 用户、对类型推导精度有极致要求的项目。不适合新手团队、不适合需要丰富生态集成的场景。

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `arktype` |
| 当前主版本 | 2.x（v2.0 GA 2024-10） |
| 首版 | 2022-04（v0.1） |
| License | MIT |
| 主仓库 | arktypeio/arktype |
| 维护 | David Blass（@ssalbdivad）+ ~30 contributors |
| TypeScript 要求 | ≥ 5.1（template literal types + const generics） |
| Bundle 大小 | ~30 KB min+gzip |
| Tree-shake | 中（runtime parser 必须包含） |
| 子包数 | 1 主包 + ark/schema 内部 |
| 内部依赖 | 0 runtime |
| Resolver | `@hookform/resolvers/arktype` |
| 与 standardSchema | v2.0 实现，TanStack Form 直接接受 |
| Weekly downloads | ~80k（2024） |
| GitHub stars | 5k+ |
| 商业版 | 无 |
| 文档站 | arktype.io |
| 主要用户 | 资深 TS 团队、追求类型精度的项目 |

## Layer 1 — 核心抽象

```ts
import {type} from "arktype";

// 字符串 DSL（最常用）
const User = type({
  email: "string.email",
  age: "number > 0",
  role: "'admin' | 'user'"
});

// 元组形式（更显式）
const User2 = type({
  email: ["string", "==", "string.email"],
  age: ["number", ">", 0]
});

// 字面量推导
const Role = type("'admin' | 'user' | 'guest'");
type RoleType = typeof Role.infer; // 'admin' | 'user' | 'guest'

// 校验
const result = User({email: "x@y.com", age: 25, role: "admin"});
// 类型 narrowing: 如果 result 不是 {email, age, role} 就是 ArkErrors
if (result instanceof type.errors) {
  console.log(result.summary);
} else {
  // result 类型已 narrow 为 {email: string, age: number, role: 'admin' | 'user'}
  console.log(result.email);
}
```

四要素：

1. **字符串 DSL**：`"string"` / `"number"` / `"string.email"` / `"number > 0"` / `"'a' | 'b'"`
2. **type({...})**：用对象写嵌套 schema
3. **type.infer**：从 schema 提取 TS 类型（vs zod 的 z.infer）
4. **直接调用 schema(value)**：返回 narrowed type 或 ArkErrors

vs zod 的对比要点：

- zod 用 `z.object({...})` + `.email()` method chain；arktype 用对象 + 字符串
- zod 的 `safeParse` 返回 `{success, data, error}` 包装；arktype 直接返回 narrowed value 或 errors
- zod 用 `z.infer<typeof X>`；arktype 用 `typeof X.infer`，更简洁

## Layer 2 — DSL 语法

arktype 字符串 DSL 内置词汇：

### 基础类型
- `"string"` / `"number"` / `"boolean"` / `"bigint"` / `"symbol"` / `"unknown"` / `"any"` / `"never"` / `"null"` / `"undefined"` / `"object"` / `"function"`
- `"Date"` / `"Error"` / `"RegExp"` / `"URL"` / `"Map"` / `"Set"` / `"WeakMap"` / `"WeakSet"`

### 字面量
- `"'admin'"`（字符串字面量）
- `"42"`（数字字面量）
- `"true"`（布尔字面量）

### 联合 / 交叉
- `"string | number"`（联合）
- `"'a' | 'b' | 'c'"`（字面量联合）
- `"object & {id: string}"`（交叉，少用）

### 范围 / 比较
- `"number > 0"` / `"number < 100"` / `"0 < number < 100"`（数值范围）
- `"string > 5"`（字符串长度 > 5）
- `"string.email"`（字符串 + email 校验）
- `"string.uuid"` / `"string.url"` / `"string.ip"` / `"string.json"`

### 数组 / 元组
- `"number[]"`（数组）
- `"string > 0[]"`（每个元素长度 > 0）
- `["number", "string"]`（元组）

### 对象 / 嵌套
- `type({email: "string.email", age: "number > 0"})`（嵌套对象）
- `type({"name?": "string"})`（可选字段，用 `?` 后缀）

### 自定义校验
- `type({"email": "string", "age": ["number", "=>", (n) => n > 18 || type.error("must be ≥ 18")]})`

DSL 表达力边界：能表达 95% 的常见 schema；剩下 5%（多字段交叉、动态依赖）回退到 morph / narrow 函数。

## Layer 3 — 精读 3 段

### 段 a — TS 模板字面量类型解析 DSL

arktype 在编译期用 TS template literal types 把 `"number > 0"` 解析成精确类型：

```ts
// 伪代码（实际 ark/schema 内部）
type Parse<S extends string> =
  S extends `${infer Base} > ${infer Min}`
    ? {kind: "constraint", base: Parse<Base>, min: ParseLiteral<Min>}
    : S extends "number" ? number
    : S extends "string" ? string
    : ... ;

type Result = Parse<"number > 0">; // {kind: "constraint", base: number, min: 0}
```

旁注：

1. 编译期解析依赖 TS 5.1+ 的 template literal types + const generics
2. 解析失败时给出 readable error（"unexpected token at position 5"）
3. parse 结果通过 `infer` 转成实际 TS 类型，给 `type.infer<typeof X>` 用
4. 这是 arktype 与 zod / valibot 的根本不同——其他人在编译期没解析，运行期才校验
5. 工程结果：IDE 输 schema 字符串时，每个字符都有补全（"string." 之后建议 "email" / "uuid" / "url"）
6. 模板字面量类型的递归深度有上限（默认 1000 层），复杂 schema 会触发 "Type instantiation is excessively deep"

> 怀疑：模板字面量类型解析的成本极高（TypeScript 编译速度变慢）。在大型项目（1000+ schema）arktype 编译时长是否超出可接受范围？社区有 issue 说 type instantiation depth 超限的报告。

### 段 b — runtime 校验器生成

DSL 字符串运行时也要解析（编译期解析只生成 TS 类型）：

```ts
// 伪代码
function parseDsl(dsl: string): Validator {
  const ast = tokenize(dsl); // [{kind: "type", name: "number"}, {kind: "op", op: ">"}, {kind: "lit", val: 0}]
  return compileToValidator(ast);
}
```

旁注：

1. 运行时 parser 只在 schema 创建时跑一次（不是每次校验）
2. 生成的 validator 是闭包函数，调用极快
3. arktype 内部用 ark/schema 做 AST + IR → JIT validator
4. 缓存：相同 DSL 字符串生成的 validator 共享
5. 性能 benchmark（社区数据）：arktype 比 zod 快 2-3x（valibot 持平）
6. cold start 时多 5-10ms 的解析成本，对 long-running 服务可忽略

> 怀疑：DSL 运行时解析虽然只跑一次，但 cold start 仍多 5-10ms。serverless 场景累积值得吗？还是 arktype 的性能优势只在长跑应用？

### 段 c — 错误信息系统

arktype 错误信息天然 readable：

```ts
const result = User({email: "x", age: -5, role: "boss"});
// result.summary:
// - email must be a valid email (was 'x')
// - age must be more than 0 (was -5)
// - role must be one of 'admin', 'user' (was 'boss')
```

旁注：

1. 错误信息从 DSL 字符串直接生成（"must be {dsl} (was {actual})"）
2. zod / valibot 的错误信息要在 schema 后单独配置 message
3. arktype 的 `type.error("custom msg")` 用于 narrate 而非 path
4. 对 i18n 不友好（消息硬编码英文）
5. summary 适合直接给用户展示，无需后处理
6. 错误对象是 ArkErrors 实例，可遍历得到每个字段的错误

> 怀疑：硬编码英文错误信息在多语言项目里是 deal-breaker。arktype 怎么解决？社区有人提 PR 加 i18n 但合并慢。这是 v2.0 后续迭代必须修的优先级。

![arktype 与 zod / valibot 语法对比](/study/projects/arktype/01-syntax-comparison.webp)

## Layer 4 — 与 RHF / TanStack Form 集成

### React Hook Form

```ts
import {useForm} from "react-hook-form";
import {arktypeResolver} from "@hookform/resolvers/arktype";
import {type} from "arktype";

const Schema = type({email: "string.email", password: "string > 8"});

const {register, handleSubmit} = useForm({
  resolver: arktypeResolver(Schema)
});
```

resolver 包封装：把 ArkErrors 转成 RHF 的 FieldError 树。

### TanStack Form

通过 standardSchema 接口，直接传：

```ts
const form = useForm({
  defaultValues: {...},
  validators: {onSubmit: Schema}  // arktype v2.0 实现 standardSchema
});
```

无需额外 resolver，因为 TanStack Form v0.x 直接消费 standardSchema 接口。

### tRPC

tRPC v11+ 接受 standardSchema：

```ts
.input(type({email: "string.email"}))
.mutation(async ({input}) => { /* input 类型已 narrow */ })
```

### Hono / Elysia / 其他 web 框架

通过 standardSchema 接口逐步铺开。Hono 已支持，Elysia 在路上。

## Layer 5 — 6 维对比表

| 维度 | arktype | zod | valibot | yup | typebox | superstruct |
|---|---|---|---|---|---|---|
| 类型推导精度 | ★★★★★ | ★★★★ | ★★★★ | ★★★ | ★★★★★ | ★★★★ |
| 代码量（同 schema） | 极少 | 中 | 中 | 中 | 多 | 中 |
| 学习曲线 | 陡（DSL） | 平 | 中 | 平 | 中 | 中 |
| 错误信息 | 自动生成 | 手动配置 | 手动配置 | 手动配置 | JSON Schema | FP 风格 |
| TS 版本要求 | ≥ 5.1 | ≥ 4.5 | ≥ 5.0 | 任意 | ≥ 4.5 | ≥ 4.5 |
| 生态 | ★★ | ★★★★★ | ★★★ | ★★★★ | ★★ | ★★ |

每个对手简评：

- **zod**：事实标准，生态压倒优势。但类型推导精度低于 arktype（loses literal info）
- **valibot**：bundle 优势（< 1KB tree-shake），与 arktype 同档小众
- **yup**：Formik 时代标配，TS 友好度低，新项目少用
- **typebox**：JSON Schema first，OpenAPI 场景强，与 arktype 在 TS 推导精度上同档
- **superstruct**：FP 风格，与 arktype 同样小众

选型建议：

- 资深 TS 团队、追求类型精度 → arktype 或 typebox
- 主流项目、需要丰富生态 → zod
- bundle 敏感（移动端 / 边缘函数） → valibot
- 历史项目、Formik 生态 → yup

## Layer 6 — 限制

1. **学习曲线陡**：DSL 语法独特，从 zod 迁过来心智完全重置
2. **复杂逻辑表达力受限**：DSL 处理简单 schema 极简洁，但多字段交叉校验（"password 必须等于 confirmPassword"）DSL 表达不优雅，要回退到 morph / narrow 函数
3. **调试需要看生成的 AST**：错误时显示的 IR 对新人不友好，arktype.io 文档需补
4. **生态远不如 zod**：drizzle-arktype 不存在；OpenAI SDK 无原生支持；多数模板项目默认 zod
5. **TS 5.1+ 要求**：老项目（TS 4.x）不能用，限制了采用范围
6. **i18n 错误信息硬编码英文**：多语言项目需手动包装
7. **bus factor = 1**：David Blass 一个人主导，commit graph 90%+ 来自他

## 怀疑总集

> 怀疑：arktype 的字符串 DSL 让 TS 错误信息从 "complex type tree" 变成 "clear DSL string"。这是不是真的提升 DX，还是用户更喜欢 IDE 自动补全（method chain 友好）？我猜：DSL 适合资深 TS 用户（懂模板字面量类型），新人仍倾向 method chain。所以 arktype 注定小众。

> 怀疑：David Blass 一个人维护，commit graph 显示 90%+ commits 来自他。bus factor = 1 风险。如果他停止维护，arktype 多快萎缩？v2.0 GA 已稳定，社区可接管，但生态推动需 founder 持续。

## GitHub Permalinks

源码精读入口（链接示意，未实际验证 SHA）：

- type 主入口：`https://github.com/arktypeio/arktype/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/ark/type/index.ts`
- range refinement：`https://github.com/arktypeio/arktype/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/ark/schema/refinements/range.ts`
- DSL parser scope：`https://github.com/arktypeio/arktype/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/ark/type/parser/scope.ts`
- standardSchema 实现：`https://github.com/arktypeio/arktype/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/ark/type/methods/base.ts`

## Layer 7 — 实战

完整 arktype + RHF + Cloudflare Worker 例子：

```ts
import {type} from "arktype";

// 跨端共享 schema
export const LoginSchema = type({
  email: "string.email",
  password: "string > 8"
});

// 类型自动推导（不用 z.infer）
export type LoginValues = typeof LoginSchema.infer;

// React 端
import {useForm} from "react-hook-form";
import {arktypeResolver} from "@hookform/resolvers/arktype";

function LoginForm() {
  const {register, handleSubmit} = useForm<LoginValues>({
    resolver: arktypeResolver(LoginSchema)
  });
  // ... 与 zod 完全一致
}

// Cloudflare Worker
export default {
  async fetch(request: Request) {
    const body = await request.json();
    const result = LoginSchema(body);
    if (result instanceof type.errors) {
      return new Response(JSON.stringify({errors: result.summary}), {status: 400});
    }
    // result 类型已 narrow 为 LoginValues
    return new Response(JSON.stringify({success: true}));
  }
};
```

要点：

1. type.infer 替代 z.infer，TS 5.1+ 推导精度更高
2. arktypeResolver 接口与其他 resolver 一致
3. result instanceof type.errors 是 narrowing 技巧（与 zod 的 result.success 不同）
4. summary 字段直接给用户展示
5. 跨端复用 schema 的能力与 zod 一致——共享一份 LoginSchema，前后端都用

## 学到什么 + 关联

学到的：

1. TypeScript 模板字面量类型在库设计中可以做 "DSL 解析器" ——这是 TS 4.1+ 才解锁的能力
2. 字符串 DSL vs method chain vs function pipe 是 schema 库三大流派，各占细分市场
3. 类型推导精度（preserve literal types）是 TS 时代库设计的核心竞争点
4. founder 主导的小型库 bus factor 风险高，但产品哲学一致性更强
5. 生态 inertia 让"技术正确" ≠ "商业成功" —— zod 仍是事实标准
6. standardSchema 协议是工具库 B 分支的关键——让小众库通过统一接口接入主流框架，绕过生态劣势
7. DSL 设计的 trade-off：表达力极简（90% 场景写得短）vs 灵活性受限（剩 10% 场景要 escape hatch）

关联：

- [[zod]] [[valibot]] — 同领域三大流派
- [[react-hook-form]] [[tanstack-form]] — 通过 resolver / standardSchema 集成
- [[typebox]] — 类型推导精度同档对手，JSON Schema first 路线
- [[trpc]] — v11+ 通过 standardSchema 接受 arktype schema

## 状元篇定位说明

本篇是 Season 21-5 工具库 B 分支的收官状元篇。B 分支聚焦"小众但锐利"的工具库——这些库不是事实标准，但在某个维度（类型精度、bundle 大小、DSL 表达力）做到极致。arktype 是 B 分支的代表：技术上比 zod 更精确，生态上远不及 zod，但靠 standardSchema 协议接入主流框架，找到了自己的生存位。

工具库 B 分支的共同启示：

1. 不是所有工具库都要追求成为事实标准
2. 在某一维度做到极致 + 与主流接口兼容 = 小众但活
3. founder 主导的库哲学一致性强，bus factor 风险大
4. 协议（standardSchema、TC39 提案、JSON Schema）是小众库的救命稻草

下一季 Season 22 工具库 C 分支预告：聚焦"基础设施型"工具库（bundler、test runner、monorepo tool），关注 vite / esbuild / turbopack / nx / turborepo 的设计哲学。
