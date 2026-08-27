---
title: runtypes — check 放行原物，parse 才重新装箱
description: 用固定 7.0.5 源码说明 runtypes 的 check/parse 分叉，以及 Object.exact 如何拒绝多余字段。
来源: 'https://github.com/runtypes/runtypes'
日期: 2026-08-27
分类: schema / 运行时类型
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/runtypes/runtypes
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5cabab81fc9266dfeffd3d236677fdf2cd80eaac
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.5
---

## 是什么

runtypes 是一套**把 TypeScript 类型规格写成可组合运行时检查器**的库。日常类比：安检分两个通道——`check` 只看你是不是这批人，原包直接放行；`parse` 会按清单重新装箱，没写在清单上的东西默认不带出闸机。

7.0.5 的核心是 `Runtype` 类。结构体用大写的 `Object`（不是旧教程里的 `Record`——`Record` 现在是字典）：

```ts
import { Number, Object, String } from "runtypes"

const User = Object({
  email: String,
  age: Number,
})
type User = Static<typeof User>
```

`User.check(data)` 通过就返回**原来的那个值**并带上静态类型；失败抛 `ValidationError`。不想抛就用 `inspect` 拿 `{ success, ... }`，或 `guard` 拿 boolean。

## 为什么重要

不理解 7.x 的 check / parse 分叉，下面这些事会整段抄错：

- 为什么 `Object({ x: String }).check({ x: "a", y: 1 })` 能过，而 `.exact().check(...)` 不能
- 为什么 `parse` 得到的是新对象、未知 key 不见了，但 `check` 仍拿得到原对象上的多余字段
- 为什么 `withParser` 只在 parse 通道生效，约束函数却总吃 parsed 值
- 为什么 `Optional` 不是“这个值可以是 undefined”的 runtype，而是 Object 字段的语境修饰符

它和 [[io-ts]] 的对照也很硬：io-ts 用 Either 且 `exact` 只剥离；runtypes 用 throw/Result，并且 `exact()` 才会因为多余字段失败。

## 核心要点

固定 `7.0.5` 的执行可以看成一条分叉管线（`src/Runtype.ts` + `src/Object.ts`）：

1. **所有入口汇到 `inspect`**：内部走私有校验函数，对象还有 `visited` memo 防循环。`inspect` 不抛。`check`/`assert` 设 `parse: false`；`parse` 设 `parse: true`。
2. **Object 默认不是 exact**：未知 enumerable key 记成成功。`check` 返回原值 `x`（多余字段还在）；`parse` 返回新拼的 `parsed`（只装声明过的字段，多余字段丢掉）。
3. **`exact()` 才拒绝多余字段**：拷贝一份 runtype 并把 `isExact = true`。多出来的 key 变成 `PROPERTY_PRESENT`，整对象 `CONTENT_INCORRECT`。测试里 `guard({ x, y })` 对 exact 对象为 false。
4. **Parser 与 Constraint 不对称**：`withParser` 只在 `parsing === true` 时跑用户函数；`withConstraint` / `withGuard` / `withAssertion` 的注释写明：即使你在 `check`，约束拿到的也是 **parsed** 值。因此 `Object.check` 仍可能先按 parse 语义丢掉多余字段再跑约束。

`Number` 与 io-ts 稳定层一样：`typeof === 'number'`，NaN 会通过。失败时 `ValidationError.failure` 带着 `Failcode` 和嵌套 `details`。

## 实践示例

### 案例 1：check 抛错，inspect 不抛

```ts
import { Number, Object, String } from "runtypes"

const User = Object({ name: String, age: Number })
User.check({ name: "Jack", age: 10 }) // 返回原对象
try {
  User.check({ name: "Jack", age: "10" })
} catch (e) {
  // ValidationError: Expected { name: string; age: number; }, but was incompatible
  // e.failure.details.age.code === "TYPE_INCORRECT"
}
const inspected = User.inspect({ name: "Jack", age: "10" })
// inspected.success === false
```

**逐部分**：`check` 只是 `inspect({ parse: false })` 后在失败时 `throw new ValidationError(result)`。结构化错误在 `failure`，不在自己拼的字符串里。

### 案例 2：同一份 Object，三条多余字段策略

```ts
const Loose = Object({ x: String })
const Exact = Loose.exact()
const input = { x: "hello", y: "world" }

Loose.guard(input)                 // true
Loose.check(input) === input       // true，y 还在
Loose.parse(input)                 // { x: "hello" }，新对象，y 被丢掉
Exact.guard(input)                 // false，PROPERTY_PRESENT
```

**逐部分**：默认 Object 把未知 key 标成功，然后按 `parsing` 决定交原值还是交 `parsed`。`exact()` 在未知 key 上直接失败。这和 [[io-ts]] 的 `t.exact`（成功并剥 key）不是同一件事。

### 案例 3：Optional 字段 vs undefinedable 值

```ts
const Form = Object({
  nickname: String.optional(),          // 缺这个 key 可以
  title: String.undefinedable(),        // key 在，值可以是 undefined
})
Form.guard({})                          // true（nickname 缺席）
Form.guard({ title: undefined })        // title 通道走 Union(String, Literal(undefined))
```

**逐部分**：`optional()` 返回的是 `Optional` 修饰符，源码注释写明它不是 runtype，只在 Object 字段里有意义。想让值本身是 `undefined`，要用 `undefinedable()`。`default(value)` 也只在 parse 时补默认值。

## 踩过的坑

1. **把 6.x 的 `Record({ x: String })` 抄到 7.x**：7.0.5 里结构体是 `Object`，`Record` 是 key/value 字典。抄旧教程会直接类型/运行失败。
2. **以为 `exact` 只是 strip**：runtypes 的 `exact()` 是失败，不是剥掉。要剥掉用默认 Object 的 `parse`。
3. **在 `check` 路径上指望 `withParser`**：Parser 看到 `parsing === false` 就原样返回内层结果。变形只发生在 `parse`、以及 Contract 边界等“隐含 parse”的地方。
4. **把 `Optional` 当成 `T | undefined`**：缺 key 和“key 在但值是 undefined”是两条规则；后者要 `undefinedable`。
5. **约束函数看到的对象比 `check` 返回值更“干净”**：注释写了 Object 在 check 返回原值、在约束前却按 parse 语义组装。不要用约束去断言“原对象上一定还有额外字段”。

## 适用 vs 不适用场景

**适用**：

- 想要 throw / type guard / 不抛 Result 三种入口，而且能分清“原值放行”和“重新装箱”
- 必须在运行时拒绝未知字段——`Object(...).exact()` 就是这条语义
- 需要 `Contract` / `AsyncContract` 在函数参数和返回值边界强制 parse
- 不想引入 fp-ts 或 schema 框架

**不适用**：

- 需要同一份 codec 做 decode + encode 往返——稳定 runtypes 主链是校验/parse，不是 io-ts 那种 `encode`
- 已经绑定 Either 管线——[[io-ts]] 更同构
- 需要 Standard Schema 直接插进 TanStack Form / 新版 resolver——本修订未见 `~standard`
- 必须拒绝 NaN：`Number` 只看 `typeof`

## 固定版本边界

- 本文绑定 `runtypes/runtypes@5cabab81fc9266dfeffd3d236677fdf2cd80eaac`。GitHub annotated tag `v7.0.5` 剥开后指向该提交（`chore: bump version to 7.0.5 (#505)`）；npm `runtypes@7.0.5` 未暴露 `gitHead`，以 tag 剥开的 commit 为锚。
- 发布身份写在 `package.build.json` 的 `7.0.5`；仓库根 `package.json` 是 private workspace，没有 runtime dependency、也没有 `engines`。
- 7.x 结构体 API 是 `Object`；`Record` 表示字典。`Optional` 只修饰字段。
- 本文未安装 pnpm 依赖、未跑上游测试或构建脚本，状态保持 `UNVERIFIED`。

## 学到什么

1. **“通过校验”和“得到干净对象”可以是两个 API**——check 保身份，parse 保形状
2. **exact 在不同库里不是同一个词**：io-ts 剥 key，runtypes 拒 key
3. **修饰符不是类型**：`optional` 改的是字段出现规则，不是值域
4. **隐藏的 parse 会改变约束输入**——读 `withConstraint` 的注释比读方法名更重要

## 应用型自测

1. `Object({ x: String }).check({ x: "a", y: 1 })` 得到的对象还含 `y` 吗？`parse` 呢？
2. 给上面的 Object 接 `.exact()` 再 `guard({ x: "a", y: 1 })`，结果是 true 吗？
3. `String.optional()` 能单独拿去 `check(undefined)` 当 runtype 用吗？

检查点：

1. `check` 返回原对象，`y` 还在；`parse` 返回新对象，通常只含 `x`。
2. 不是。exact 对多余字段走 `PROPERTY_PRESENT`，`guard` 为 false。
3. 按源码合同，`Optional` 不是 runtype，只在 Object 字段里有意义；值级的 undefined 用 `undefinedable()`。

## 延伸阅读

- 固定源码：[runtypes/runtypes](https://github.com/runtypes/runtypes) —— 本文绑定提交 `5cabab81fc9266dfeffd3d236677fdf2cd80eaac`
- 仓库 README 的 `Object` / `Union` / `Tuple` 组合示例（7.x 命名）
- [[io-ts]] —— Either + encode/decode；`exact` 是 strip 不是 reject
- [[zod]] —— `safeParse` 对象 + 默认 strip 未知 key

## 关联

- [[io-ts]] —— fp-ts 编解码对照页
- [[zod]] —— schema-first、throw/`safeParse`
- [[valibot]] —— 模块化 issue 列表
- [[arktype]] —— 字符串 DSL + traversal
- [[effect]] —— 后续 Effect Schema 常被并列，但不在本页绑定范围内

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
