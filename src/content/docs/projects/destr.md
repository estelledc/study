---
title: destr — 先认签名再决定要不要 JSON.parse
description: 固定 2.0.5 把非 JSON 回退、短字面量和原型污染探测写进同一条 destr()
来源: https://github.com/unjs/destr
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/destr
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7bb3c39ef5f8c84219be08ebc11b3c4f4a4c828f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.5
---

## 是什么

destr 是一个给不可信字符串用的 JSON 入口。日常类比：它不像 `JSON.parse` 那样一上来就开刀——先看这串像不像 JSON，不像就原样还给你；像了再 parse，并挡住 `__proto__` 这类会改原型的键。

```ts
import { destr, safeDestr } from "destr"

destr("{ \"ok\": true }") // { ok: true }
destr("not-json")         // "not-json"
safeDestr("not-json")     // throws SyntaxError
```

固定 `2.0.5` 零生产依赖，`sideEffects: false`。ESM 走构建产物 `dist/`；仓库里的 CJS 入口 `lib/index.cjs` 再 `require("../dist/index.cjs")`，并给函数挂上 `destr` / `safeDestr` 两个属性。

## 为什么重要

不读这条主链，下面这些事会对不上：

- 为什么 `destr("TRUE")` 是 `true`，而 `JSON.parse("TRUE")` 会抛错
- 为什么默认模式把坏 JSON 当普通字符串，`safeDestr` 却必须失败
- 为什么 `{ "constructor": "value" }` 能留下，带 `prototype` 的 `constructor` 会被丢掉
- 为什么 TypeScript 泛型 `destr<T>()` 不是运行时 schema

## 核心要点

固定版本可以拆成五步：

1. **非 string 直接返回**：对象、数组、数字、`null`、`undefined` 都原样回去，不尝试序列化。

2. **无反斜杠的整段引号走快路径**：原串（未 trim）首尾都是 `"` 且中间没有 `\\` 时，`slice(1, -1)` 剥引号，不调用 `JSON.parse`。`' "Hello" '` 因为开头是空格，不会走这条路。

3. **短字面量查表**：`trim()` 之后长度 ≤ 9，用小写匹配 `true` / `false` / `null` / `undefined` / `nan` / `infinity` / `-infinity`。

4. **签名正则决定要不要 parse**：`JsonSigRx` 打在未 trim 的原串上。要么以空白加 `"[{` 开头，要么整串是最多 16 位整数的数字形态（可带小数和指数）。对不上且非 strict 时，返回原串。

5. **污染键与失败策略分叉**：源串命中 `__proto__` 或 `constructor` 探测正则时，默认 `JSON.parse` 加 reviver，丢掉危险键并 `console.warn`；`safeDestr` 把 `strict` 钉成 `true`，改为抛 `Possible prototype pollution`。普通 `JSON.parse` 异常在默认模式回传原串，strict 再抛出。

## 实践示例

### 案例 1：请求体可能不是 JSON

```ts
const body = destr(await response.text())
```

空串、纯文本、坏 JSON 都不会抛；只有看起来像 JSON 的字符串才会变成对象。可信边界需要“不是 JSON 就失败”时，换 `safeDestr`。

### 案例 2：短字面量和数字边界

```ts
destr("  true ")  // true
destr("9e2")      // 900
destr("9007199254740991") // 9007199254740991
```

`9e2` 能过数字签名再交给 `JSON.parse`。整数部分超过 16 位的整串对不上 `JsonSigRx`，默认模式会把那串数字当普通字符串留下。

### 案例 3：污染键

```ts
destr('{ "__proto__": { "polluted": true } }')
// {}，并打印 Dropping "__proto__" key...

destr('{ "constructor": "value" }')
// { constructor: "value" }
```

reviver 只在键是 `__proto__`，或键是 `constructor` 且值是带 `prototype` 的对象时丢掉该键。`safeDestr` 对这几类输入直接抛错，不会走 reviver。

## 踩过的坑

1. **把 destr 当 schema validation**：泛型 `T` 只是类型断言；字段、枚举和业务约束仍要 [[zod]] / [[valibot]]。
2. **在必须失败的边界用默认模式**：`destr("[foo")` 返回 `"[foo"`；网关和配置加载应显式 `safeDestr`。
3. **以为快路径会解码转义**：`'"a\\nb"'` 不含快路径（有反斜杠），会走 `JSON.parse`；无反斜杠的 `"hello"` 只是剥引号。
4. **把 README 的“更快”写成你的产物保证**：固定树有 bench 脚本，本文未跑，也不绑定吞吐数字。
5. **把仓库 CJS 入口当成源码即可运行**：`lib/index.cjs` 依赖构建后的 `dist/`，git 标签树里没有这份产物。

## 适用 vs 不适用场景

**适用**：

- 请求体、环境变量、缓存里“可能是 JSON，也可能是普通字符串”
- 需要挡住 `__proto__` / 危险 `constructor` 的轻量入口
- 能接受默认模式失败时回传原串

**不适用**：

- 输入必须是合法 JSON，失败要立刻中断——请用 `safeDestr` 或原生 `JSON.parse`
- 需要校验对象形状，而不是“能不能 parse”
- 要把未实测的速度或体积写成选型结论

## 固定版本边界

- 本文绑定 `unjs/destr@7bb3c39e...`，包版本 `2.0.5`；npm `gitHead` 与 annotated tag `v2.0.5` 剥开后的提交一致。
- 源码是单文件 `src/index.ts`；Deno 示例 `deno.ts` 只是演示入口，不是第二套实现。
- 本文未安装依赖、未跑 vitest / bench、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **“安全 parse”先过滤签名，再决定调不调 `JSON.parse`。**
2. **默认友好和 strict 失败是同一条函数上的开关，不是两个解析器。**
3. **丢掉污染键不等于验证业务字段。**
4. **数字签名有位数上限；超长整数字符串不会自动变成 number。**

## 应用型自测

1. `destr("TRUE")` 的结果是布尔值还是字符串？
2. `safeDestr('{ "__proto__": {} }')` 会返回空对象吗？
3. 默认模式下 `destr("90071992547409911")`（17 位数字）会得到 number 吗？

检查点：

1. 布尔 `true`。trim 后走短字面量表，大小写不敏感。
2. 不会。strict 在探测到污染键时抛 `Possible prototype pollution`。
3. 不会。对不上最多 16 位的数字签名，默认回传原串。

## 延伸阅读

- 固定源码：[unjs/destr](https://github.com/unjs/destr) —— 本文绑定提交 `7bb3c39ef5f8c84219be08ebc11b3c4f4a4c828f`
- 注释指向的同类实现：[fastify/secure-json-parse](https://github.com/fastify/secure-json-parse)、[hapijs/bourne](https://github.com/hapijs/bourne)（未固定 revision）
- [[ofetch]] —— 固定版本默认用 destr 解析 JSON 响应
- [[klona]] —— 同主题的深拷贝对照：parse 之后如何得到独立副本

## 关联

- [[ofetch]] —— 响应解析默认依赖 destr
- [[klona]] —— 对象复制，不负责 parse
- [[zod]] —— 运行时形状校验，不是 JSON 入口
- [[valibot]] —— 另一条 schema 路线
- [[immer]] —— 用草稿改对象，不是安全 parse

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[klona]] —— klona — 按入口挑选深拷贝能力，而不是一个万能 clone
- [[ofetch]] —— ofetch — 以 Fetch 为底座的跨运行时请求包装
