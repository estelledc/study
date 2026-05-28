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

| 字段 | 值 |
|---|---|
| Star | 41.5k |
| Fork | 1.7k |
| 最近活跃 | 2026-05-28（每周 commit） |
| 当前 commit | `bbc68f9` (2026-05-28 读取) |
| 主语言 | TypeScript（≥ 99%） |
| 维护方 | Colin McDonnell @colinhacks 个人主导 + 社区 |
| License | MIT |
| 类似项目 | yup / io-ts / class-validator / Ajv / Valibot / ArkType |
| 项目类型 | **工具库**（small-surface API library） |
| 心脏文件 | `parse.ts` (195) + `core.ts` (153) + `schemas.ts` 基类段 |

> 项目类型 self-classify：**工具库**。围绕一个核心抽象 `$ZodType`
> 提供 `.parse() / .safeParse() / .infer<T>` 三件套，单一职责，
> 适用 v1.1 分支 B 的量化指标（行数 ≥ 400 / Figure ≥ 1 /
> permalink ≥ 3 / 怀疑 ≥ 3）。

![Zod 双层流图](/projects/zod/01-zod-type-flow.webp)

> **图 01**：Zod 的双层流——一份 schema 源代码同时驱动两条独立轨道。
> 蓝色轨（A. 编译期）：`_zod` 上的幽灵字段 → `infer<T>` 条件类型 → 静态 type，
> 编译完全消失，0 运行时成本。绿色轨（B. 运行期）：`input → _zod.run() → checks 链
> → issues → output`，4-13KB gzip 进 bundle。两轨用同一份 schema 定义，
> 永不漂移——这是 Zod 的核心 insight，也是和 yup / Ajv 的根本区别。

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

> Colin McDonnell 在 v4 release notes 里写："The core abstraction shifted
> from `ZodType<Output>` to `$ZodType<Output, Input>`，承认 input 与 output
> 可以不同（transform / pipe 之后）"——这是 v4 vs v3 最重要的设计转折。

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
│           │   │   ├── checks.ts    ← 1293 行：refine / min / max
│           │   │   ├── core.ts      ← 153 行：infer<T> / output<T> 类型
│           │   │   ├── errors.ts    ← 455 行：issue 类型 + 格式化
│           │   │   └── util.ts
│           │   ├── classic/         ← 用户面 API（.parse / .optional / .refine）
│           │   ├── mini/            ← Tree-shaking 友好的极简变体
│           │   └── locales/         ← i18n 错误消息
│           └── tests/
└── play.ts                          ← 沙箱测试入口
```

**心脏文件**：`src/v4/core/parse.ts`（195 行）+ `src/v4/core/core.ts`（153 行）。
两个文件加起来不到 350 行，但解析 + 类型推导的全部秘密都在里面。
**4730 行的 schemas.ts 是手册，不是心脏**——但其中第 179-320 行的基类
`$ZodType` 构造函数 + `runChecks` 循环是必读补充。

commit 热点（`git log --format='' --name-only | sort | uniq -c | sort -rn`）：

| commit 数 | 文件 | 角色 |
|---|---|---|
| 高频 | `packages/zod/src/v4/core/schemas.ts` | 所有 schema 类 |
| 高频 | `packages/zod/src/v4/core/api.ts` | 用户面工厂函数 |
| 高频 | `packages/zod/src/v4/core/checks.ts` | refinement/check 实现 |
| 中频 | `packages/zod/src/v4/core/parse.ts` | 解析入口 |
| 中频 | `packages/zod/src/v4/core/errors.ts` | issue 类型 + 格式化 |

热点结论：**变化最频繁的是 `schemas.ts` / `api.ts` / `checks.ts`**——
这三个文件加起来超过 7800 行，是项目"长肥肉"的部分；
而真正的 invariant（`parse.ts` / `core.ts`）几乎从不变。
**核心抽象稳定，外延快速增长**——这是健康工具库的特征。

## 核心机制 · Layer 3 精读

> 以下所有 GitHub permalink 锚定 commit `bbc68f9`（2026-05-28 读取）。
> 替换为最新 commit 即可获取最新行号。

### 机制 1 · `infer<T>` 的整个魔法（30 行内）

[`src/v4/core/core.ts:117-120`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/core.ts#L117-L120)：

```typescript
export type input<T> = T extends { _zod: { input: any } } ? T["_zod"]["input"] : unknown;
export type output<T> = T extends { _zod: { output: any } } ? T["_zod"]["output"] : unknown;

export type { output as infer };
```

这就是全部。`z.infer<typeof schema>` 等价于 `schema["_zod"]["output"]`。

那 `_zod.output` 是什么？看基类（[`src/v4/core/schemas.ts:179-186`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/schemas.ts#L179-L186)）：

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

**怀疑 1**：为什么用 `T extends { _zod: { output: any } } ? ... : unknown` 的条件类型，
而不是 `T["_zod"]["output"]` 直接访问？

我的猜测：直接访问会让 `infer<string>`（传非 schema）报硬编译错；
条件类型让 fallback 到 `unknown`，对调用方更宽容（保护 `infer<typeof someUnknownVariable>`
之类的链路不在不相关的地方爆炸）。**但这是猜测，没找到 issue 验证**。

### 机制 2 · 解析管道——只用 `_zod.run()` 一个方法

[`src/v4/core/parse.ts:16-31`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/parse.ts#L16-L31)（完整 `_parse` 实现）：

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
- `ctx.async = false` 是显式 contract——sync 路径遇到 Promise **直接抛**，不静默 await

**一个统一的 payload 模型**，所有 schema（string / object / union / pipe）共享。

→ vs yup：yup 的每个 type 都有自己的 validate 方法签名，错误收集逻辑分散。
Zod 把"解析"抽象成"对 payload 的 transformation"，所有 schema 都是同一个接口。
**这就是为什么 zod 能做 pipe / refine / transform 的灵活组合——它们都只是 payload transformer**。

**怀疑 2**：为什么 sync 模式遇到 Promise 不自动 await，而是抛 `$ZodAsyncError`？

我的判断：因为 `parse()` 的返回类型是 `T`，不是 `T | Promise<T>`。
如果自动 await，调用方拿到的不会是真值，而是个未解决的 Promise——
TypeScript 类型签名会撒谎。Zod 的选择是**类型不撒谎，明确报错让调用方改用 `parseAsync`**。
这是"API 类型即设计契约"的硬执行。

### 机制 3 · runChecks 循环——基类的统一执行

[`src/v4/core/schemas.ts:217-260`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/schemas.ts#L217-L260)
（基类 `$ZodType` 的 runChecks 闭包，节选）：

```typescript
const runChecks = (
  payload: ParsePayload,
  checks: checks.$ZodCheck<never>[],
  ctx?: ParseContextInternal | undefined
): util.MaybeAsync<ParsePayload> => {
  let isAborted = util.aborted(payload);
  let asyncResult!: Promise<unknown> | undefined;
  for (const ch of checks) {
    if (ch._zod.def.when) {
      if (util.explicitlyAborted(payload)) continue;
      const shouldRun = ch._zod.def.when(payload);
      if (!shouldRun) continue;
    } else if (isAborted) {
      continue;
    }
    const currLen = payload.issues.length;
    const _ = ch._zod.check(payload as any) as any as ParsePayload;

    if (_ instanceof Promise && ctx?.async === false) {
      throw new core.$ZodAsyncError();
    }
    if (asyncResult || _ instanceof Promise) {
      asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
        await _;
        const nextLen = payload.issues.length;
        if (nextLen === currLen) return;
        if (!isAborted) isAborted = util.aborted(payload, currLen);
      });
    } else {
      const nextLen = payload.issues.length;
      if (nextLen === currLen) continue;
      if (!isAborted) isAborted = util.aborted(payload, currLen);
    }
  }
  if (asyncResult) {
    return asyncResult.then(() => payload);
  }
  return payload;
};
```

旁注：

- **for 循环顺序敏感**：checks 按注册顺序执行，前面的 abort 会让后面的 skip。
  这就是为什么 `.string().min(3).email()` 和 `.string().email().min(3)` 在错误信息上不同。
- **`when` 是条件 check**：如 `.optional()` 会注册一个 `when: (p) => p.value !== undefined`。
  这让 schema 能在 runtime 决定要不要跑某个 check，而不只是静态注册。
- **issue 长度差异检测 abort**：`currLen` vs `nextLen` 是判断这个 check 有没有产生新错误的廉价方式——
  不用每个 check 自己 return success/failure，避免双重错误处理路径。
- **async 染色传播**：一旦某个 check 返回 Promise，后面所有 check 都进入 promise chain；
  但中间的同步 check 还是同步执行——**sync/async 不是二选一，是混合执行**。
- **错误收集不抛**：注意整个循环里没有 throw（除了 $ZodAsyncError 这种 contract 错），
  所有错误都进 `payload.issues`。是否抛是上层 `parse()` 决定的，不是 check 决定的。

→ vs joi：joi 的 check 链每个都自己 throw，需要全局 try/catch；
Zod 的"错误是数据，不是异常"决策从这一层就贯穿到底。

**怀疑 3**：`isAborted = util.aborted(payload, currLen)` 这个 abort 标记
看起来可以用一个 mutable flag 取代 issue 长度比较。
为什么作者选了"diff issue 长度"而不是"check 自己 return aborted"？

我的猜测：为了 forward-compat——以后加新的 check 只要往 issues push，
不用学新的 abort 协议。**但这是猜测**，没在 commit history 里找到验证。

### 机制 4 · 类型在编译期"流过"管道

[`src/v4/core/api.ts:1529-1542`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/api.ts#L1529-L1542)（pipe 工厂的简化版）：

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

运行期对应在 [`src/v4/core/schemas.ts:4014-4045`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/schemas.ts#L4014-L4045)：

```typescript
export const $ZodPipe: core.$constructor<$ZodPipe> = /*@__PURE__*/ core.$constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right) => handlePipeResult(right, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left) => handlePipeResult(left, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});

function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;        // ← 第一段失败立即中止，不进第二段
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
```

旁注：

- **direction backward 是 codec 模式**：v4 加的，用于 `z.codec(...)` 双向编解码，
  把 output 反向"编码"回 input
- **第一段失败立即 aborted**：`handlePipeResult` 的 short-circuit
  让 pipe 不会 leak 部分结果到第二段
- **fallback 字段透传**：见 schemas.ts:42 的注释——这是为 `$ZodCatch` / `$ZodOptional`
  的协作设计的细微 flag

### 机制 5 · transform vs refine 的类型差异

[`src/v4/core/schemas.ts:3404-3450`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/schemas.ts#L3404-L3450)（transform 真实实现）：

```typescript
export const $ZodTransform: core.$constructor<$ZodTransform> = /*@__PURE__*/ core.$constructor(
  "$ZodTransform",
  (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        throw new core.$ZodEncodeError(inst.constructor.name);    // ← transform 是单向的，不能逆
      }
      const _out = def.transform(payload.value, payload);
      if (ctx.async) {
        const output = _out instanceof Promise ? _out : Promise.resolve(_out);
        return output.then((output) => {
          payload.value = output;
          payload.fallback = true;
          return payload;
        });
      }
      if (_out instanceof Promise) {
        throw new core.$ZodAsyncError();
      }
      payload.value = _out;
      payload.fallback = true;
      return payload;
    };
  }
);
```

旁注：

- **transform 是单向的**：`ctx.direction === 'backward'` 直接抛 `$ZodEncodeError`——
  你不能从 transform 后的 output 还原回 input。需要双向就用 `z.codec()`。
- **`payload.fallback = true`**：transform 后的值被标记为"fallback 候选"，
  这样外层 `$ZodOptional` 在 input 是 undefined 时可以**抛弃** transform 的结果，
  返回 undefined 而不是 transform 在 undefined 上的运算结果。
- **transform 的 output 可以是 Promise**：sync 模式遇到就抛 `$ZodAsyncError`，
  和 `_parse` 主入口的设计一致

`refine` 不一样——它**只能改 issues，不能改类型**：

```typescript
schema.refine(x => x > 0, "must be positive")
// → 同类型，多一个验证
schema.transform(x => String(x))
// → 类型从 number 变成 string
```

→ 把"验证"和"转换"分两个 API，是 Zod vs yup 的关键差异。
yup 的 `.test()` 既能验证又能改值，类型推导经常爆炸。
Zod 把两件事**用不同的 API 物理隔离**——类型上的清晰，是 API 设计的清晰。

### 机制 6 · JIT 快路径——对象验证的性能秘密

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

### 机制 7 · 错误是一等公民，不是字符串

[`src/v4/core/errors.ts`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/errors.ts) 节选：

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

### vs Valibot — 后起的"反对者"

Valibot 是 zod 的"反对者"——更模块化（function-based 而非 class-based），
tree-shaking 更激进，bundle 比 zod-mini 还小。

```typescript
// Valibot
import { object, string, number, parse } from 'valibot'
const Schema = object({ name: string(), age: number() })
parse(Schema, input)
```

差异：

- Valibot 没 `.refine()` / `.transform()` 链式 API；只能用 `pipe(string(), minLength(3), trim())`
- 类型推导用 `Output<typeof Schema>` 而不是 `infer<>`
- 错误模型同样 discriminated union，但更扁平

选 Valibot：极致 bundle / Edge runtime / 不需要复杂 transform 链
选 Zod：DX 优先 / 团队熟悉度 / 生态广（tRPC、react-hook-form、AI SDK 都默认接 zod）

| 维度 | Zod | yup | io-ts | class-validator | Ajv | Valibot |
|---|---|---|---|---|---|---|
| 类型推导 | ★★★★★ | ★★ | ★★★★★ | ★★★ | ★★ | ★★★★★ |
| Bundle (gzip) | 13KB | 16KB | 8KB | 30KB+ | 35KB | 4KB |
| 性能 | ★★★ (JIT) | ★★ | ★★★ | ★ (反射) | ★★★★★ | ★★★ |
| Schema 组合 | ★★★★★ (值) | ★★★ | ★★★★ | ★ (class) | ★★★ | ★★★★ |
| 错误结构 | discriminated union | string | Either | array | array | discriminated union |
| 学习曲线 | 低 | 低 | 高 (fp-ts) | 中 | 中 (JSON Schema) | 中 |

## Hands-on（30 分钟内能跑）

```bash
mkdir zod-demo && cd zod-demo
npm init -y
npm install zod
npm install --save-dev typescript tsx @types/node
npx tsc --init
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

### 改一处的实验 A：transform 后置 + 类型变化

把 `email: z.string().email()` 改成 `email: z.string()`，看 `safeParse` 还报不报错。
然后改回来，再加一句 `.transform(s => s.toLowerCase())`：

```typescript
email: z.string().email().transform(s => s.toLowerCase())
```

跑 `parse({ ..., email: 'J@EXAMPLE.COM' })`——观察输出 `email` 是小写。
**确认 transform 在 validate 之后跑**。

### 改一处的实验 B：pipe 双段类型推导

```typescript
const Stage1 = z.object({ name: z.string(), age: z.string() })  // age 是 string
const Stage2 = z.object({ name: z.string(), age: z.coerce.number() })
const Final = z.pipe(Stage1, Stage2)

Final.parse({ name: 'X', age: '22' })
// → { name: 'X', age: 22 }   age 被强制成 number
```

观察类型推导：`z.infer<typeof Final>` 给的是什么？
（答案：`{ name: string, age: number }`——pipe 的 output 是第二段的 output。）

### 改一处的实验 C（必做）：写一个 custom validator

目标：实现一个 `datetimeIso` schema——只接受 ISO 8601 格式的 datetime 字符串，
否则报 `invalid_format` 错误。这是最能体现 zod "schema 是值" 的练习。

```typescript
import { z } from 'zod'

// 用 refine 实现：只验证不转换
const datetimeIso = z.string().refine(
  s => !Number.isNaN(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}T/.test(s),
  { message: '必须是 ISO 8601 datetime（如 2026-05-28T10:00:00Z）' }
)

// 测试
const r1 = datetimeIso.safeParse('2026-05-28T10:00:00Z')
console.log(r1.success)  // true

const r2 = datetimeIso.safeParse('2026-05-28')   // 缺 T 部分
console.log(r2.success)  // false
console.log(r2.error?.issues[0].message)
// → 必须是 ISO 8601 datetime（如 2026-05-28T10:00:00Z）

// 进阶：把它做成 transform，return 一个 Date 对象
const datetimeIsoToDate = z.string()
  .refine(s => !Number.isNaN(Date.parse(s)), '不是合法日期')
  .transform(s => new Date(s))

type Result = z.infer<typeof datetimeIsoToDate>  // → Date
```

观察：
1. `.refine()` 后类型还是 `string`（refine 不改类型）
2. `.transform()` 后类型变成 `Date`（transform 改类型）
3. `refine + transform` 顺序很重要——先 refine 校验，再 transform 转换；
   反过来 transform 后的 Date 上的 refine 看到的是 Date 不是 string

### 改一处的实验 D（高阶）：自定义 error map

Zod 默认错误信息是英文，可以全局换成中文。

```typescript
import { z } from 'zod'

z.config({
  customError: (issue) => {
    if (issue.code === 'invalid_type') {
      return `期望 ${issue.expected}，实际收到 ${typeof issue.input}`
    }
    if (issue.code === 'too_small') {
      return `太小：至少 ${issue.minimum}，得到 ${issue.input}`
    }
    return undefined  // 走默认
  }
})

const r = z.number().min(10).safeParse(3)
console.log(r.error?.issues[0].message)
// → 太小：至少 10，得到 3
```

这一步让你看到 Zod 的"错误是数据"的实战价值——你不是在改字符串模板，
你是在 pattern-match issue 的判别字段。

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
- **配置文件验证**：JSON / YAML / TOML 配置加载时用 zod parse 一遍，
  有错误立即崩溃带详细 issue path——比"运行时某个字段读到 undefined 才崩"早 N 个数量级

**不要用 Zod 的部分**：

- **超大对象的高 QPS 解析**——用 Ajv，预编译的 validator 比 Zod 快 5x
- **不需要类型推导的纯校验场景**（比如纯 JS 项目）——Joi 更轻
- **CRDT / 协议二进制** schema——用 Protobuf / Avro
- **极致 bundle 敏感的 Edge runtime**——考虑 Valibot（4KB 比 Zod-mini 还小）

## 限制段（独立列出，不抄 README）

- **深嵌套 TS 编译变慢**：`z.object({...深 5 层...})` 的 `infer<>` 会让 tsserver 卡顿。
  Linus 风格的解法：把深层 schema 拆成独立的 const，每层 schema 只写 1 层，
  TS 推完中间 type 再 reuse
- **JIT 在 strict CSP / Edge runtime 下退化**：fastpass 的 5-10x 加速没了，
  落到递归 fallback。生产前确认你的部署环境（Cloudflare Workers / Vercel Edge）
  允不允许 `new Function()`
- **错误信息默认英文**：i18n 要走 `z.config({ customError })`，
  没法 per-schema 局部化
- **运行时反射不存在**：你不能从 zod schema 反向生成 OpenAPI / JSON Schema 而不丢信息
  （v4 加了 `to-json-schema.ts` 但仍有 transform / refine 类信息无法表达）
- **没有 partial type 推导**：如果你只想推 `output` 而不想付 `input` 类型推导成本，
  没有省成本的办法——`infer<T>` 是 `output` 的 alias，但内部还是会走完整的 conditional type
- **bundle 13KB 不算小**：纯校验场景下 Valibot / arktype 都比它小一个数量级，
  Zod 的 13KB 主要付的是 chainable API 的代价

## 宣传 vs 现实清单

| README / 宣传 | 代码现实 |
|---|---|
| "Zero dependencies" | 真的零依赖，但内部 `~standard` 字段隐式要求实现 standard-schema 协议 |
| "TypeScript-first" | v4 的核心抽象是 `$ZodType<O, I>` 双泛型，input/output 可不同——但用户面 `infer<>` 只暴露 output；要 input 类型得手动 `z.input<T>` |
| "Concise API" | `.refine()` / `.transform()` / `.pipe()` 三件事看着像兄弟，类型上完全不同（refine 不改类型，transform 改，pipe 串联） |
| "Composable" | 可组合，但 `.transform()` 后不能再 chain 大部分原 schema 方法（`.min()` 之类）——因为类型已经变了 |
| "Async support" | 同步 schema 调 `.parseAsync()` 没问题；但 sync 路径遇到 async refine 会**抛 $ZodAsyncError**，不静默 await |
| "Errors are typed" | issues 是 discriminated union，但 `.parse()` throw 出来的 ZodError 默认 `instance.message` 还是字符串——要拿结构化数据得 `.issues` |

## 读完你能做之前做不了的事

- **判断**：看到一段"`if (typeof x === 'string') { ... }`"链式检查时，
  能立刻识别出"这应该是个 zod schema"
- **设计**：在 monorepo 里把 zod schema 放在 `packages/contracts`，
  前后端共享一份定义——你能解释这件事的价值
- **解释**：被问到"TS 的 type 是不是只在编译期有用"时，能用 zod 当反例：
  **类型可以是设计工具，不只是注解**
- **下钻**：看懂 tRPC 的 `Procedure.input(schema)` 内部怎么把 zod 类型传到 client 的
- **对照**：识别"我这是不是在重新发明 zod"——哪怕只用了 schema-first 思路的一小部分
- **取舍**：被问到"为什么不用 Ajv"时能给出"Zod 牺牲性能换 DX"的具体数字（5x slower / 2-5x bundle）
  而不是空话

## 自检 · 5 个怀疑问题（追到行号）

1. [`core.ts:118`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/core.ts#L118)
   的 `output<T> = T extends { _zod: { output: any } } ? T["_zod"]["output"] : unknown`
   为什么用条件类型而不是 `T["_zod"]["output"]` 直接访问？哪种情况会触发 `unknown` 分支？
2. [`parse.ts:19-21`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/parse.ts#L19-L21)
   在 sync 模式下遇到 `result instanceof Promise` 直接抛 `$ZodAsyncError`。
   为什么不让 sync 自动 await？这反映了什么 API 设计原则？
3. [`api.ts:1529-1542`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/api.ts#L1529-L1542)
   的 pipe 函数有 `B extends schemas.$ZodType<unknown, core.output<A>>`。
   把这个约束去掉会发生什么？写一段会编译失败的 pipe 调用证明给自己看。
4. JIT 快路径（schemas.ts:2000+）用 `new Function(...)` 生成代码。
   在哪些环境下这条路径会被禁用？写一个能让它退化的最小例子（CSP header 或 Cloudflare Worker）。
5. Zod 的错误是 discriminated union（`code: 'too_small' | 'invalid_type' | ...`），
   yup 的错误是字符串。**为什么这个差异在大型项目里复利效应明显**？
   想出 3 个具体场景说明 string error 在 100k LOC 项目里会爆。

## 延伸阅读

读完 `parse.ts` 后下一步：

1. [`schemas.ts:179-320`](https://github.com/colinhacks/zod/blob/bbc68f9/packages/zod/src/v4/core/schemas.ts#L179-L320)——基类
   `$ZodType` 的构造函数 + `runChecks` 循环，看 `_zod.run` 的注册时机
2. `schemas.ts:2000-2127`——JIT fastpath 的完整实现（含 `generateFastpass`）
3. `src/v4/classic/external.ts`——用户面 API 怎么把 core 的 `_zod.parse` 包成 `.parse()` 方法
4. **standard-schema** 规范（`https://standardschema.dev/`）——Zod / Valibot / ArkType 都实现的统一接口，
   读完就懂为什么 `~standard` 字段会出现在基类
5. **valibot 项目源码**——zod 的"反对者"（更小、更模块化），对比设计判断
6. v4 release notes [Zod 4](https://zod.dev/v4)——理解 `$ZodType<O, I>` 双泛型 vs v3 单泛型的迁移动机

---

**笔记完成**：2026-05-28（v4.4.3，commit `bbc68f9`）
**项目类型**：工具库（v1.1 分支 B）
**研究方法**：本地克隆 + 子代理深读 + 对照 yup / io-ts / class-validator / Valibot
**心脏文件**：`src/v4/core/parse.ts`（195 行）+ `src/v4/core/core.ts`（153 行）+ `schemas.ts:179-320` 基类段
**量化达标**：行数 700+ / Figure 1 张 / GitHub permalink 7+ / 显式怀疑 3+ / `path:line` 引用 ≥ 1
**升级理由**：v1.0 笔记缺 path:line 锚点 + 改一处实验只有 1 个 + 没有限制段和宣传 vs 现实附录，
对照 v1.1 工具库标尺补齐
