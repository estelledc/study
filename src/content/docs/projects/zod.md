---
title: "Zod — schema 既是类型，也是验证器"
description: 一份代码同时承担编译期类型定义和运行期校验，TS 5 时代的"single source of truth"
sidebar:
  order: 15
  label: "colinhacks/zod"
---

> colinhacks/zod v4.4.3（2026-05），MIT。
> 4KB（mini）/ 13KB（full）gzip。
>
> Zod 不是验证库——验证只是它的**副产品**。它的核心是
> "**让一段 TypeScript 同时是类型定义和运行时验证器**"，
> 让"类型注解"和"参数校验"这两件事不再分离。
>
> 这是 Season 2「类型当设计工具」的开篇。

## 一句话定位

**Zod = 一组带类型参数的 schema 类 + 一个 `infer<T>` 提取器。**
你写 `z.object({ name: z.string() })`，编译期能用
`z.infer<typeof schema>` 拿到 `{ name: string }`，运行期能用
`schema.parse(input)` 校验任意 unknown 数据。

## Why（为什么是它而不是 yup / io-ts / class-validator / Ajv）

之前一段时间所有 TS 项目的"通病"：

```typescript
// 类型定义（编译期）
type User = { name: string; age: number }

// JSON Schema（运行期）
const userSchema = { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } }, required: ['name', 'age'] }

// 调用 ajv 校验
ajv.validate(userSchema, input)
```

**两份定义，永远在漂移**。改了 type 忘了改 schema，跑得过编译跑不过校验。
反过来一样。

各家解药：

| 库 | 思路 | 痛点 |
|---|---|---|
| **yup** | schema-first，但类型推导弱 | `.shape()` 后类型经常退化成 `any`；Promise-only API |
| **io-ts** | codec-first，类型完整但要 fp-ts | 学习曲线陡；用户写出来更像 Haskell |
| **joi** | server-first，HAPI 时代遗产 | TS 类型几乎没有 |
| **class-validator** | 装饰器 + 反射 | 必须 `class`；要 reflect-metadata；`@IsString()` 重复信息 |
| **TS + Ajv** | 类型 + JSON Schema 分开 | 还是两份 |
| **Zod** | schema 上挂泛型，`infer<T>` 推 | 深嵌套时 TS 编译器吃力 |

**为什么不是 yup**：yup 的 `.shape({ name: yup.string() })` 推出来的类型经常是 `string | undefined`
（即使你没标 optional），需要手动 `.required()` 矫正。Zod 的类型默认就是必选，optional
要你显式写 `.optional()`——**和 TS 的"必选默认"语义一致**。

**为什么不是 io-ts**：io-ts 是 Haskell 风的 codec 模式（`t.type({...})` + `T.TypeOf<typeof x>`），
表达力比 zod 强（更优雅地处理 codec 的双向编解码），但要求你用 fp-ts 全家桶——
`Either<Errors, A>` 模式对 Java 背景的人友好，对前端开发者陡。Zod 选了"throw 或 SafeParse 二选一"
更符合 JS 直觉。

**为什么不是 class-validator**：装饰器 + reflect-metadata 让 schema 必须挂在 class 上，
和 React 函数组件、纯数据接口模型不友好。**Zod 的 schema 是值，不是 class**——
可以传参、组合、动态生成。

## 仓库地形

```
zod/
├── packages/
│   └── zod/
│       └── src/
│           ├── index.ts
│           ├── v3/                  ← 旧版本（仍在维护）
│           ├── v4/                  ← ★ 当前主线
│           │   ├── core/            ← ★★★ 核心引擎
│           │   │   ├── schemas.ts   ← ★★★ 4730 行：所有 $Zod* 类
│           │   │   ├── api.ts       ← 1823 行：z.string() / z.object() 工厂
│           │   │   ├── parse.ts     ← 195 行：解析管道入口（最值得读）
│           │   │   ├── checks.ts    ← refine / min / max
│           │   │   ├── core.ts      ← 153 行：infer<T> / output<T> 类型
│           │   │   ├── errors.ts    ← issue 类型 + 格式化
│           │   │   └── util.ts
│           │   ├── classic/         ← 用户面 API（.parse / .optional / .refine）
│           │   ├── mini/            ← Tree-shaking 友好的极简变体
│           │   └── locales/         ← i18n 错误消息
│           └── tests/
└── play.ts                          ← 沙箱测试入口
```

**心脏文件**：`src/v4/core/parse.ts`（195 行）+ `src/v4/core/core.ts`（153 行）。
两个文件加起来不到 350 行，但解析 + 类型推导的全部秘密都在里面。
**4730 行的 schemas.ts 是手册，不是心脏**。

## 核心机制 · Layer 3 精读

### 机制 1 · `infer<T>` 的整个魔法（30 行内）

`src/v4/core/core.ts:117-120`：

```typescript
export type input<T> = T extends { _zod: { input: any } } ? T["_zod"]["input"] : unknown;
export type output<T> = T extends { _zod: { output: any } } ? T["_zod"]["output"] : unknown;

export type { output as infer };
```

这就是全部。`z.infer<typeof schema>` 等价于 `schema["_zod"]["output"]`。

那 `_zod.output` 是什么？看基类（`src/v4/core/schemas.ts:179-184`）：

```typescript
export interface $ZodType<
  O = unknown,             // ← Output 类型参数
  I = unknown,             // ← Input 类型参数
  Internals extends $ZodTypeInternals<O, I> = $ZodTypeInternals<O, I>,
> {
  _zod: Internals;
  "~standard": $ZodStandardSchema<this>;
}
```

每个 schema 实例都有一个**编译期的虚拟字段** `_zod.output`，类型在
construct schema 时就被泛型固定。

举例（伪代码）：

```typescript
z.string()          // → $ZodType<string, string>      (_zod.output = string)
z.number()          // → $ZodType<number, number>
z.string().optional()
                    // → $ZodType<string | undefined, string | undefined>
z.object({
  name: z.string(),
  age: z.number()
})                  // → $ZodType<{name: string, age: number}, ...>
```

**`infer<T>` 是免费的**。它不是 schema 实例存了一份类型在某个字段里——
**`_zod.output` 在运行时是 undefined**（schema 对象上根本没这个属性）。
它只在**类型层面**存在，是个"幽灵字段"，TS 编译器看得见，
JS 引擎看不见。

→ 这是 TS 类型系统当作设计工具的极致案例：**类型零成本，但表达力满格**。

### 机制 2 · 解析管道——只用 `_zod.run()` 一个方法

`src/v4/core/parse.ts:16-31`（完整 `_parse` 实现）：

```typescript
export const _parse: (_Err: $ZodErrorClass) => $Parse =
  (_Err) => (schema, value, _ctx, _params) => {
    const ctx: schemas.ParseContextInternal = _ctx
      ? { ..._ctx, async: false }
      : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);   // ← ★
    if (result instanceof Promise) {
      throw new core.$ZodAsyncError();                            // ← sync 模式遇到 async 直接报错
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(
        result.issues.map((iss) =>
          util.finalizeIssue(iss, ctx, core.config())
        )
      );
      util.captureStackTrace(e, _params?.callee);
      throw e;
    }
    return result.value as core.output<typeof schema>;
  };

export const parse: $Parse = /* @__PURE__*/ _parse(errors.$ZodRealError);
```

整个解析就一行核心：`schema._zod.run({ value, issues: [] }, ctx)`。

`run` 把 `{ value, issues }` payload 丢进 schema 内部的执行链：
- `value` 一路被各个 check / transform 修改
- `issues` 一路被错误收集器追加

**一个统一的 payload 模型**，所有 schema（string / object / union / pipe）共享。

→ vs yup：yup 的每个 type 都有自己的 validate 方法签名，错误收集逻辑分散。
Zod 把"解析"抽象成"对 payload 的 transformation"，所有 schema 都是同一个接口。
**这就是为什么 zod 能做 pipe / refine / transform 的灵活组合——它们都只是 payload transformer**。

### 机制 3 · 类型在编译期"流过"管道

`src/v4/core/api.ts:1529-1542`（pipe 工厂的简化版）：

```typescript
export function _pipe<
  const A extends schemas.$ZodType,
  B extends schemas.$ZodType<unknown, core.output<A>>     // ← B 的 input 必须等于 A 的 output
    = schemas.$ZodType<unknown, core.output<A>>,
>(
  Class: util.SchemaClass<schemas.$ZodPipe>,
  in_: A,
  out: B | schemas.$ZodType<unknown, core.output<A>>
): schemas.$ZodPipe<A, B> {
  return new Class({ type: "pipe", in: in_, out }) as any;
}
```

这段代码读起来像迷宫，但解开就是一行：

> **B 的 input 类型必须是 A 的 output 类型。**

用法：

```typescript
const schema = z.pipe(
  z.string(),                           // out = string
  z.string().transform(s => parseInt(s)) // in = string ✓, out = number
)
// → z.infer<typeof schema> 推出 number
```

如果第二段的 input 类型不匹配，**编译期就会报错**。

→ 这是"类型当设计工具"的真意。TS 不只是给你警告，TS 是设计契约的执行者。
你写错管道，编译器拒绝。

### 机制 4 · transform vs refine 的类型差异

`src/v4/core/api.ts:1430-1442`（transform，单向类型转换）：

```typescript
export function _transform<I = unknown, O = I>(
  Class: util.SchemaClass<schemas.$ZodTransform>,
  fn: (input: I, ctx?: schemas.ParsePayload) => O
): schemas.$ZodTransform<Awaited<O>, I> {              // ← Output 是 Awaited<O>，Input 是 I
  return new Class({
    type: "transform",
    transform: fn as any,
  }) as any;
}
```

`refine` 不一样（同上 api.ts 内）——它**只能改 issues，不能改类型**：

```typescript
schema.refine(x => x > 0, "must be positive")
// → 同类型，多一个验证
schema.transform(x => String(x))
// → 类型从 number 变成 string
```

→ 把"验证"和"转换"分两个 API，是 Zod vs yup 的关键差异。
yup 的 `.test()` 既能验证又能改值，类型推导经常爆炸。
Zod 把两件事**用不同的 API 物理隔离**——类型上的清晰，是 API 设计的清晰。

### 机制 5 · JIT 快路径——对象验证的性能秘密

`src/v4/core/schemas.ts:2000-2127` 区域（节选）：

```typescript
const fastEnabled = jit && allowsEval.value;
let fastpass: ((payload, ctx) => any) | undefined;

inst._zod.parse = (payload, ctx) => {
  const input = payload.value;
  if (!isObject(input)) {
    payload.issues.push({ expected: "object", code: "invalid_type", input, inst });
    return payload;
  }

  if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
    if (!fastpass) fastpass = generateFastpass(def.shape);     // ← 第一次跑时编译
    payload = fastpass(payload, ctx);
    return payload;
  }
  return superParse(payload, ctx);    // ← 退化路径：递归调用每个字段的 .run()
};
```

`generateFastpass` 用 `Function` 构造器**生成一段写死字段名的代码**，
跳过递归开销，性能比通用解析快 5-10x。

但这段代码暗含一个**安全/兼容判断**：

```typescript
const allowsEval = lazyValue(() => {
  try {
    new Function("");
    return true;
  } catch {
    return false;     // CSP 严格策略 / Cloudflare Workers 等会禁
  }
});
```

不是简单地 `eval()`——是先**探测环境是否允许**，然后才走快路径。
否则退化到递归路径。

→ 这是面向未来工程师的范例：**写库要为限制环境（CSP、Edge runtime、ReactNative）做退化设计**，
不是"我快就行你管那么多"。

### 机制 6 · 错误是一等公民，不是字符串

`src/v4/core/errors.ts:10-150`（节选）：

```typescript
export interface $ZodIssueInvalidType<Input = unknown> extends $ZodIssueBase {
  readonly code: "invalid_type";
  readonly expected: $ZodInvalidTypeExpected;       // "string" | "number" | "object" | ...
  readonly input?: Input;
}

export interface $ZodIssueTooSmall<Input = unknown> extends $ZodIssueBase {
  readonly code: "too_small";
  readonly origin: "number" | "int" | "bigint" | "date" | "string" | "array" | "set" | "file";
  readonly minimum: number | bigint;
  readonly inclusive?: boolean;
  readonly exact?: boolean;                          // ← .min(5) vs .length(5) 区分
  readonly input?: Input;
}
```

每种 issue 是**带判别字段（discriminated union）的 interface**——
`switch (issue.code)` 时 TS 自动收窄类型。

```typescript
const result = schema.safeParse(input)
if (!result.success) {
  for (const issue of result.error.issues) {
    if (issue.code === 'too_small' && issue.origin === 'string') {
      // ↑ 这里 issue.minimum 自动被收窄为 number
      console.log(`太短，至少 ${issue.minimum} 个字符`)
    }
  }
}
```

→ vs yup / Joi：错误是字符串，要 `if (msg.includes("at least"))`——脆弱、不可维护。
Zod 把错误当数据结构对待，**让错误处理代码也类型安全**。

## 横向对比

### vs yup — schema-first 但类型推导差

```typescript
// yup
const schema = yup.object({ name: yup.string(), age: yup.number() })
type User = yup.InferType<typeof schema>
// → { name: string | undefined, age: number | undefined }   ← 不写 .required() 就 undefined
```

Zod 默认必选，optional 显式写。**和 TS 语义一致**。

### vs io-ts — Haskell 风格的优雅与代价

```typescript
// io-ts
const User = t.type({ name: t.string, age: t.number })
type User = t.TypeOf<typeof User>

const result = User.decode(input)  // → Either<t.Errors, User>
if (result._tag === 'Right') { ... }
```

io-ts 用 `Either` 而不是 throw / safeParse，更"函数式纯净"，
但要求开发者懂 `Either` / `pipe(input, decode, fold)` 这套 fp-ts 范式。

Zod 选了"throw 或 result.success 检查"——**对前端开发者更直观**，
代价是不像 io-ts 那么"理论上优雅"。

### vs class-validator — 必须 class 的硬约束

```typescript
class User {
  @IsString() name!: string
  @IsNumber() age!: number
}
const errors = await validate(plainToClass(User, input))
```

class-validator 必须用 class + 装饰器 + reflect-metadata。
Zod 的 schema 是**值**——可以传参、可以从函数返回、可以根据条件动态生成：

```typescript
const userSchema = (allowEmail: boolean) => z.object({
  name: z.string(),
  ...(allowEmail ? { email: z.string().email() } : {})
})
```

这种动态组合在 class-validator 里几乎做不到。

### vs TS + Ajv — 两份 vs 一份

```typescript
// TS + Ajv
type User = { name: string; age: number }
const userSchema: JSONSchemaType<User> = {
  type: 'object',
  properties: { name: { type: 'string' }, age: { type: 'number' } },
  required: ['name', 'age']
}
ajv.compile<User>(userSchema)
```

要写两份。改 type 容易忘改 schema，改 schema 容易忘改 type。
**这正是 Zod 想消灭的痛**。

但 Ajv 在**性能上是天花板**（生成的验证函数比 Zod 快 2-5x），
关键路径（高 QPS API）可能反而想用 Ajv。

→ Zod 的取舍：**为了 DX 牺牲一点性能**。这是判断题，没有标准答案。

## Hands-on（30 分钟内能跑）

```bash
mkdir zod-demo && cd zod-demo
npm init -y
npm install zod
```

写 `index.ts`：

```typescript
import { z } from 'zod'

const UserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
  role: z.enum(['admin', 'user', 'guest']).default('user'),
  preferences: z.object({
    theme: z.enum(['light', 'dark']).default('light')
  }).optional()
})

type User = z.infer<typeof UserSchema>
//   ↑ 鼠标悬停看推断的类型

// 校验：throws on failure
const user = UserSchema.parse({
  name: 'Jason',
  email: 'j@example.com',
  age: 22
})
console.log(user)  // role = 'user'（默认值生效）

// 校验：safe variant
const result = UserSchema.safeParse({ name: 'X', email: 'bad', age: -1 })
if (!result.success) {
  result.error.issues.forEach(i => console.log(i.code, i.path, i.message))
}
```

```bash
npx tsx index.ts
```

### 改一处的实验（必做）

把 `email: z.string().email()` 改成 `email: z.string()`，看 `safeParse` 还报不报错。
然后改回来，再加一句 `.transform(s => s.toLowerCase())`：

```typescript
email: z.string().email().transform(s => s.toLowerCase())
```

跑 `parse({ ..., email: 'J@EXAMPLE.COM' })`——观察输出 `email` 是小写。
**确认 transform 在 validate 之后跑**。

第二个实验：把整个 schema 包一层 pipe：

```typescript
const Stage1 = z.object({ name: z.string(), age: z.string() })  // age 是 string
const Stage2 = z.object({ name: z.string(), age: z.coerce.number() })
const Final = z.pipe(Stage1, Stage2)

Final.parse({ name: 'X', age: '22' })
// → { name: 'X', age: 22 }   age 被强制成 number
```

观察类型推导：`z.infer<typeof Final>` 给的是什么？
（答案：`{ name: string, age: number }`——pipe 的 output 是第二段的 output。）

## 与你工作的连接

**能立刻迁移**：

- 替换所有"运行时检查 + 手写 type"的代码——用 zod 一份定义两边能用
- API 边界（前后端、第三方 API、用户输入）必须 zod，不要信任 unknown
- 表单：`react-hook-form` + `@hookform/resolvers/zod` 是当代 React 表单标配
- LLM 输出：Anthropic / OpenAI 的 structured output 大多接受 zod schema 作为 JSON Schema 的来源

**下个月可能用到**：

- 给 LLM 调用做 **structured output validation**：让 LLM 返回 JSON，用 zod 解析，
  失败就 retry——这比让 LLM 自己保证格式可靠得多
- 做 **migration script**：v1 数据 → v2 schema，用 `z.preprocess` + `transform` 写迁移逻辑
- 给团队定 **API 类型契约**：tRPC 内部就是 zod，但你也可以独立用

**不要用 Zod 的部分**：

- **超大对象的高 QPS 解析**——用 Ajv，预编译的 validator 比 Zod 快 5x
- **不需要类型推导的纯校验场景**（比如纯 JS 项目）——Joi 更轻
- **CRDT / 协议二进制** schema——用 Protobuf / Avro

## 读完你能做之前做不了的事

- **判断**：看到一段"`if (typeof x === 'string') { ... }`"链式检查时，
  能立刻识别出"这应该是个 zod schema"
- **设计**：在 monorepo 里把 zod schema 放在 `packages/contracts`，
  前后端共享一份定义——你能解释这件事的价值
- **解释**：被问到"TS 的 type 是不是只在编译期有用"时，能用 zod 当反例：
  **类型可以是设计工具，不只是注解**
- **下钻**：看懂 tRPC 的 `Procedure.input(schema)` 内部怎么把 zod 类型传到 client 的
- **对照**：识别"我这是不是在重新发明 zod"——哪怕只用了 schema-first 思路的一小部分

## 自检 · 5 个问题

1. `src/v4/core/core.ts:118` 的 `output<T> = T extends { _zod: { output: any } } ? T["_zod"]["output"] : unknown`
   为什么用条件类型而不是 `T["_zod"]["output"]` 直接访问？哪种情况会触发 `unknown` 分支？
2. `src/v4/core/parse.ts:21` 在 sync 模式下遇到 `result instanceof Promise` 直接抛 `$ZodAsyncError`。
   为什么不让 sync 自动 await？这反映了什么 API 设计原则？
3. `src/v4/core/api.ts:1529-1542` 的 pipe 函数有 `B extends schemas.$ZodType<unknown, core.output<A>>`。
   把这个约束去掉会发生什么？
4. JIT 快路径（schemas.ts:2000+）用 `new Function(...)` 生成代码。
   在哪些环境下这条路径会被禁用？写一个能让它退化的最小例子。
5. Zod 的错误是 discriminated union（`code: 'too_small' | 'invalid_type' | ...`），
   yup 的错误是字符串。**为什么这个差异在大型项目里复利效应明显**？

## 延伸阅读

读完 `parse.ts` 后下一步：

1. `src/v4/core/schemas.ts:179-300`——基类 `$ZodType` 的构造函数，看 `_zod.run` 的注册时机
2. `src/v4/core/schemas.ts:2000-2127`——JIT fastpath 的完整实现（含 `generateFastpass`）
3. `src/v4/classic/external.ts`——用户面 API 怎么把 core 的 `_zod.parse` 包成 `.parse()` 方法
4. **standard-schema** 规范（`https://standardschema.dev/`）——Zod / Valibot / ArkType 都实现的统一接口，
   读完就懂为什么 `~standard` 字段会出现在基类
5. **valibot 项目源码**——zod 的"反对者"（更小、更模块化），对比设计判断

---

**笔记完成**：2026-05-27（v4.4.3）
**研究方法**：本地克隆 + Explore 子代理深读 + 对照 yup / io-ts / class-validator
**心脏文件**：`src/v4/core/parse.ts`（195 行）+ `src/v4/core/core.ts`（153 行）
