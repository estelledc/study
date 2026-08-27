---
title: io-ts — 用 fp-ts Either 做编解码，而不是抛错
description: 用固定 2.2.22 源码说明 io-ts 如何把 decode/encode 做成 Type，以及 exact 为何只剥多余字段。
来源: 'https://github.com/gcanti/io-ts'
日期: 2026-08-27
分类: schema / 运行时类型
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/gcanti/io-ts
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 864a3a2f03c5d7b974afeb1da0faf46c21758779
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.2.22
---

## 是什么

io-ts 是一套**把运行时校验写成双向编解码器**的 TypeScript 库。日常类比：像海关申报——入境（`decode`）按规则把未知行李变成 typed 货物，出境（`encode`）再按同一份规则折回去；验货单不合格时，它把问题装进信封递给你，而不是把柜台砸了。

稳定入口在 `src/index.ts` 的 `Type<A, O, I>`：`A` 是内部类型，`O` 是编码输出，`I` 是解码输入。你写：

```ts
import * as t from "io-ts"

const User = t.type({
  email: t.string,
  age: t.number,
})
type User = t.TypeOf<typeof User>
```

`User.decode(unknown)` 返回 `Either<Errors, User>`，成功是 `Right`，失败是 `Left`。想看人话再用 `PathReporter.report`。它**不抛异常**。peer 依赖是 `fp-ts@^2.5.0`：没有 Either，这套 API 站不住。

## 为什么重要

不理解 io-ts 的编解码合同，下面这些事都会读错：

- 为什么它和 [[zod]] / [[runtypes]] 看起来都在“验对象”，却坚持 Either 而不是 throw / `{ success }`
- 为什么 `t.strict` / `t.exact` 并不拒绝多余字段——固定 2.2.22 里它们是**剥掉**未知 key，解码仍然成功
- 为什么网上同时出现 `t.type` 和 `t.interface`——后者只是前者的别名
- 为什么 2.2 以后还有 `Decoder` / `Codec` / `Schema` 另一套模块，却不能拿稳定 `Type` 的经验直接套上去

一句话：io-ts 把“外部数据 → 内部值 → 再写回去”做成同一份 codec，错误走 fp-ts 控制流。

## 核心要点

固定 `2.2.22` 的稳定主链可以拆成四步：

1. **Type 同时是 Decoder 和 Encoder**：构造函数收下 `is`、`validate`、`encode`。`decode(i)` 只是给 `validate` 补一个默认 context（`[{ key: '', type, actual: i }]`）。
2. **失败是 Left，不是 throw**：`validate` 收集 `ValidationError`（值 + context 路径 + 可选 message）。`PathReporter` 把 `Left` 折成 `Invalid value … supplied to …` 字符串数组；`Right` 报 `['No errors!']`。
3. **对象默认留多余字段**：`t.type` 只验声明过的 key。未知 enumerable key 会留在输出对象上。只有某个已知字段被改写时，实现才会 `{ ...o }` 拷一份再改。
4. **exact / strict 是剥离，不是拒绝**：`t.strict(props)` 等于 `exact(type(props))`。`exact` 先跑内层 codec，成功后再 `stripKeys`。测试里 `{ foo: 'foo', bar: 1 }` 对 `{ foo: string }` 的 exact codec 是成功，结果只剩 `{ foo: 'foo' }`。

`Type.pipe(ab)` 解码从左到右、编码从右到左；左边先 `Left` 就不再往下走。经典 `t.number` 用 `typeof === 'number'`，所以 `NaN` 和无穷大会通过。

## 实践示例

### 案例 1：decode + PathReporter

```ts
import * as t from "io-ts"
import { isLeft } from "fp-ts/lib/Either"
import { PathReporter } from "io-ts/lib/PathReporter"

const User = t.type({ email: t.string, age: t.number })
const result = User.decode({ email: "a@b.c", age: "x" })
if (isLeft(result)) {
  console.log(PathReporter.report(result))
  // ["Invalid value \"x\" supplied to : { email: string, age: number }/age: number"]
}
```

**逐部分**：`decode` 给 age 追加 context `age: number`；`number` 的 `is` 失败就 `failure(value, context)`；`PathReporter` 把 context 拼成 `name/key: type` 路径。这里没有 try/catch。

### 案例 2：多余字段走 type 还是 exact

```ts
const Loose = t.type({ foo: t.string })
const Strict = t.strict({ foo: t.string }) // exact(type({ foo }))

Loose.decode({ foo: "ok", extra: 1 })   // Right，输出仍带 extra
Strict.decode({ foo: "ok", extra: 1 })  // Right，输出只剩 { foo: "ok" }
```

**逐部分**：`type` 不看未知 key；`strict`/`exact` 在内层成功后剥 key，**不会**因为 `extra` 变成 `Left`。若你想“多一个字段就失败”，这不是 exact 的语义。

### 案例 3：pipe 把字符串收成数字再编码回去

```ts
const NumberFromString = new t.Type<number, string, unknown>(
  "NumberFromString",
  t.number.is,
  (u, c) => {
    const s = t.string.validate(u, c)
    if (s._tag === "Left") return s
    const n = Number(s.right)
    return Number.isFinite(n) ? t.success(n) : t.failure(u, c)
  },
  String,
)
```

**逐部分**：`validate` 负责 I→A，`encode` 负责 A→O。`pipe` 可以把这种 codec 接到 `t.type({ age: NumberFromString })` 上：JSON 里的 `"18"` 进来变成 `18`，再 `encode` 回字符串。这是 io-ts 相对“只校验不变形”库的主差异。

## 踩过的坑

1. **把 `t.strict` 当成 reject extras**：固定源码和 `test/2.1.x/exact.ts` 都写明是 strip。多字段会静默丢掉，不是失败。
2. **`t.number` 放行 NaN**：`typeof NaN === 'number'`。实验模块 `src/Type.ts` 的 `number` 才会把 NaN 判失败；两套 API 不能混记。
3. **忘了装 fp-ts**：`package.json` 把 `fp-ts@^2.5.0` 标成 peer。只有 `io-ts` 没有 Either，类型和运行时都会缺。
4. **拿 2.2 实验 Decoder 当稳定 Type**：README 写明实验模块独立且与稳定 API 反向不兼容，并且“high state of flux”。本页不描述那套 Kleisli/`DecodeError` 合同。
5. **`t.partial` 把缺 key 和 `undefined` 当成一回事**：`is` 对缺席或 `undefined` 都放行；这和“字段必须在、但值可空”不是同一条规则。

## 适用 vs 不适用场景

**适用**：

- 已经在用 fp-ts / Either 做控制流，希望校验结果能 `map` / `chain` 进同一套管线
- 需要同一份 codec 既 decode 外部输入、又 encode 回线协议（日期、数字字符串、branded id）
- 能接受“默认保留多余字段、exact 只剥离”的对象语义

**不适用**：

- 想要 throw / `safeParse` 对象、不想引入 fp-ts——看 [[zod]] 或 [[runtypes]]
- 必须在运行时**拒绝**未知 key，而不是剥掉——稳定 `exact` 做不到；不要把文档里的 `{| |}` 记号读成 reject
- 需要 Standard Schema `~standard` 挂到现代表单库——本修订没有这条协议
- 要把实验 `Decoder`/`Codec` 写成当前稳定事实——它们仍标 experimental

## 固定版本边界

- 本文绑定 `gcanti/io-ts@864a3a2f03c5d7b974afeb1da0faf46c21758779`，即 GitHub tag `2.2.22`；npm `io-ts@2.2.22` 的 `gitHead` 与该提交一致。
- peer：`fp-ts@^2.5.0`。package 未声明 `engines`。
- 稳定 API 在 `src/index.ts`；`t.interface` 是 `t.type` 的别名。`2.2+` 实验模块（`Decoder` / `Encoder` / `Codec` / `Schema` / `src/Type.ts`）另行标记，明确与稳定层不兼容。
- 最新 GitHub release 在复核时仍是 `2.2.22`（2024-12-10）。本文不推断“已停止维护”，只固定这一发布点。
- 本文未安装依赖、未运行上游测试或 dtslint，状态保持 `UNVERIFIED`。

## 学到什么

1. **编解码器不是校验器的别名**——同一份 `Type` 要同时回答 I→A 和 A→O，pipe 的方向因此是反的
2. **错误通道是 API 的一部分**——Either 让调用方必须处理 `Left`，而不是靠约定去 catch
3. **“严格对象”至少有两种实现**：剥离未知 key ≠ 拒绝未知 key；io-ts 的 exact 是前者
4. **稳定层和实验层可以住在同一版本号里**——读 2.2 源码时先看文件头的 experimental 警告

## 应用型自测

1. `t.strict({ id: t.string }).decode({ id: "1", extra: true })` 会得到 `Left` 吗？
2. `t.number.decode(Number.NaN)` 在稳定 API 里会失败吗？
3. `User.decode` 失败时，调用方是靠 `try/catch` 拿到错误，还是看 Either 的 `Left`？

检查点：

1. 不会。`strict`/`exact` 剥掉 `extra` 后仍是 `Right({ id: "1" })`。
2. 不会。稳定 `t.number` 只检查 `typeof === 'number'`。
3. 看 `Left`。`decode` 不抛；人读字符串走 `PathReporter.report`。

## 延伸阅读

- 固定源码：[gcanti/io-ts](https://github.com/gcanti/io-ts) —— 本文绑定提交 `864a3a2f03c5d7b974afeb1da0faf46c21758779`
- 稳定 API 说明：仓库根目录 `index.md`（与实验 `Decoder.md` / `Codec.md` 分开）
- [[runtypes]] —— 同主题对照：throw + check/parse 双通道，`exact()` 才是拒绝多余字段
- [[zod]] —— throw / `safeParse` 路线，对象默认剥未知 key

## 关联

- [[runtypes]] —— 另一条运行时类型：命令式 Result，而不是 fp-ts Either
- [[zod]] —— 当代更常见的 schema-first 校验
- [[valibot]] —— 模块化 schema，错误是 issue 列表
- [[arktype]] —— 类型语法接近 TS 本身
- [[effect]] —— 后续 Effect Schema 常被拿来比较，但不在本页绑定范围内

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
