---
title: ArkType — schema 长得像 TypeScript 类型本身
description: 用接近 TypeScript 的 definition 生成节点图，再遍历数据做校验与转换。
来源: 'https://github.com/arktypeio/arktype'
日期: 2026-08-27
分类: schema
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/arktypeio/arktype
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 03b1f015d9b7c5af5dac2caed1aeedefaf705ab3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.2.3
---

## 是什么

ArkType 是一个 TypeScript 运行时类型校验库。日常类比：过海关时，旅客（数据）要按规则被检查；[[zod]] 像“先填一张多页表格再过关”，ArkType 则是“在护照背面写一句话——长得就像目的地国家的语言”。

它最醒目的能力是字符串 DSL，但 definition 不只接受字符串：对象、tuple、已有 schema node、Standard Schema、`RegExp`，以及返回 root 的 thunk 都会进入同一 parser。

```ts
import { type } from "arktype"
const User = type({
  email: "string.email",
  age: "0 < number < 120",
  role: "'admin' | 'user'",
})
```

编译期靠 TypeScript 检查 definition 并推导输出；运行期把 definition 归约成 `@ark/schema` 节点，再通过 traversal 校验或转换。真正执行的是节点图，不是每次重新解释那句字符串。

## 为什么重要

不理解 ArkType，下面这些事会对不上：

- 为什么 definition 错误能在 TypeScript 编译期出现，运行时仍要再 parse 一次
- 为什么 schema 创建后会编译 traversal，而不是每次从头读字符串
- 为什么成功值可能已被 morph 改过，失败值却是 `ArkErrors`
- 为什么框架可以只认 Standard Schema，而不写 ArkType 专用适配器

## 核心要点

固定 `2.2.3` 可以拆成四步：

1. **definition parser**：`type` 绑定在内置 `ark` scope 上。字符串走 token/AST parser（无 contextual args 时按 scope 名缓存）；对象、tuple、`RegExp`、thunk、已有 root 和带 `~standard` 的对象各走自己的分支。

2. **scope 与 node reduction**：关键字、alias、generic 和 definition 被归约为 root / constraint / structure node。交、并、范围和对象结构在这里组合和化简。

3. **compiled traversal**：node 为 `allows` / `apply` 生成策略。默认 `clone` 是 `deepClone`；`optimistic` 路径在 `allows` 通过且存在 morph 时，对 object/function 先 clone 再跑 morph。未声明 key 默认 `onUndeclaredKey: "ignore"`，不会自动剥掉。

4. **output 或 ArkErrors**：调用 type 返回输出或 `ArkErrors`。`type.errors` 的运行时附件就是 `ArkErrors` 类；`assert` 失败走 `errors.throw()`。root 的 `~standard` 同时提供 validate 与 JSON Schema。

## 实践示例

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
```

**逐部分解释**：

- `"string.email"` — 内置字符串子类型
- `"0 < number < 120"` — 链式开区间，不含边界
- `"'admin' | 'user'"` — 字面量联合，推导仍是 union
- `typeof User.infer` — 从 schema 取出输出类型

### 案例 2：校验数据 + narrowing

```ts
const input: unknown = { email: "x@y.com", age: 25, role: "boss", tags: [] }
const result = User(input)
if (result instanceof type.errors) {
  console.error(result.summary)
} else {
  console.log(result.email)
}
```

`instanceof type.errors` 是固定源码里的控制流边界。成功值类型已是 `UserT`，但原始 `input` 未必没被转换。

### 案例 3：通过 Standard Schema 共享 schema

```ts
import { type } from "arktype"
import type { StandardSchemaV1 } from "@standard-schema/spec"

const Login = type({ email: "string.email", password: "string > 8" })
const standard: StandardSchemaV1 = Login
const result = standard["~standard"].validate({
  email: "a@example.com",
  password: "long-enough",
})
```

框架只依赖 `~standard.validate` 的 value / issues 合同。是否被某个框架接受，仍要核对该框架的当前版本。

## 踩过的坑

1. **DSL 是 schema 不是表达式**：`"number > 0"` 看起来像 JS 比较，其实是 schema 文本。
2. **把 definition 等同于字符串**：对象、tuple、RegExp、thunk、scope alias 和已有 schema 都是合法入口。
3. **忽略 morph 的复制语义**：默认会 `deepClone` 再跑 morph；成功值是输出合同，不是“原对象没动”。
4. **未知 key 默认留下**：`onUndeclaredKey` 默认 `ignore`。不要用 Zod 的默认 strip 来猜 ArkType。
5. **用数量猜编译性能**：TypeScript 版本、definition 形状和编辑器都会影响类型检查，不能写死阈值。

## 适用 vs 不适用场景

**适用**：

- 想让 schema 写法贴近 TypeScript 类型，并保留 literal union
- 能对目标 TypeScript 版本和真实 definition 做基准
- 下游已经认 Standard Schema（TanStack Form / tRPC v11 / Hono 等，仍要核对其当前版本）

**不适用**：

- TypeScript 版本不满足当前包要求
- 必须多语言错误信息、且不能先发英文再翻译
- 极度 bundle 敏感但没有在目标 bundler 实测

## 固定版本边界

- 本文绑定 `arktypeio/arktype@03b1f015...`，`arktype` 包版本 `2.2.3`。
- GitHub tag `arktype@2.2.3` 指向该提交；npm `arktype@2.2.3` 当前不暴露 `gitHead`，因此没有交叉伪造成“npm 发布点”。
- monorepo 把 `arktype`、`@ark/schema`、`@ark/util` 等拆成独立包。
- 本文未安装依赖、运行上游测试或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **字符串 DSL 只是入口**：真正运行的是 scope 上的节点图和 compiled traversal。
2. **成功值不等于输入原件**：morph 和默认 `deepClone` 会改变输出身份。
3. **协议比专用适配器稳**：`~standard` 让框架面向统一 validate/issue 合同。
4. **默认对象策略必须读配置**：未知 key 留下还是删除，是 `onUndeclaredKey`，不是“大家都 strip”。

## 应用型自测

1. `type({ age: "number" })(input)` 的返回值不是 `type.errors`。这是否证明原始 `input` 一定没被转换？
2. 一个 definition 是现成的 Standard Schema 对象或 `RegExp`，ArkType 能否接收？
3. 看到对象默认“很宽松”，能否断言未知字段一定被删掉？

检查点：

1. 不能。schema 可能包含 morph；默认还会 clone object/function。
2. 可以。固定 definition parser 对 `~standard` 和 `RegExp` 都有分支。
3. 不能。默认 `onUndeclaredKey: "ignore"`，未知 key 会留下。

## 延伸阅读

- 官方文档：[arktype.io](https://arktype.io)
- 固定源码：[arktypeio/arktype](https://github.com/arktypeio/arktype) —— 本文绑定提交 `03b1f015d9b7c5af5dac2caed1aeedefaf705ab3`
- Standard Schema：[standardschema.dev](https://standardschema.dev)
- [[zod]] —— method chain 流派的对照
- [[typia]] —— 另一条“类型先写、编译期生成校验”的路线

## 关联

- [[zod]] —— method chain vs 字符串 DSL
- [[valibot]] —— 模块化对象 + pipe
- [[typia]] —— 从 TypeScript 类型生成校验函数
- [[tanstack-form]] —— 通过 Standard Schema 直接接受 arktype schema
- [[trpc]] —— v11+ 可消费 standardSchema
- [[hono]] —— 支持 standardSchema 的 body 校验

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
