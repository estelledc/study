---
title: query-string — 可配置的查询串解析与序列化
description: sindresorhus 的查询串 parse/stringify 库，绑定 9.5.0 静态源码。
来源: https://github.com/sindresorhus/query-string
日期: 2026-08-27
分类: URL / Query
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/query-string
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: aae373a54526c7b297f60e4d7b77eb0709d2ae9c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.5.0
---

## 是什么

query-string 是一份只做“问号后面那一段”的库：parse、stringify，以及从完整 URL 里抽出 / 写回 query。日常类比：它不是整张地图，而是一把能按多种方言读路标的尺子——同一组 `foo=1,2,3` 可以当字符串，也可以当数组。

```js
import queryString from "query-string"

queryString.parse("foo=bar&foo=baz")
// { foo: ["bar", "baz"] }

queryString.stringify({ foo: ["bar", "baz"] })
// "foo=bar&foo=baz"

queryString.parseUrl("https://foo.bar?a=1#hash")
// { url: "https://foo.bar", query: { a: "1" } }
```

固定 `9.5.0` 是纯 ESM（`type: module`），入口 `index.js` 再导出 `./base.js`。运行时依赖三项：`decode-uri-component`、`filter-obj`、`split-on-first`。`engines.node` 写 `>=18`。

## 为什么重要

不理解它的默认值和格式开关，下面这些事会对不上：

- 为什么 `foo`（没有 `=`）解析成 `null`，而不是空字符串
- 为什么默认 parse 会按 key 排序，输出对象的插入顺序不是你在 URL 里看到的顺序
- 为什么 `foo[]=1&foo[]=2` 默认不会变成数组，除非把 `arrayFormat` 设成 `bracket`
- 为什么 `stringifyUrl` 会先吃 URL 自带的 query，再用传入对象覆盖

## 核心要点

固定 `base.js` 可以拆成四段：

1. **parse 默认值**：`decode: true`、`sort: true`、`arrayFormat: 'none'`、`arrayFormatSeparator: ','`、`parseNumbers: false`、`parseBooleans: false`、`types: Object.create(null)`。输入会去掉前导 `?#&`。结果对象也是 `Object.create(null)`。

2. **缺等号就是 `null`**：源码按 [W3C URL 草稿](http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters) 把“只有 key”收成 `null`。`+` 在 `decode: true` 时先被换成空格，再交给 `decode-uri-component`。

3. **数组是显式方言**：`none` 靠重复 key；`bracket` 认 `foo[]`；`index` 认 `foo[0]` 并先收成对象再按数字键排序；`comma` / `separator` 在单个值里按分隔符切开；`bracket-separator` 是 `foo[]=1|2`；`colon-list-separator` 认 `foo:list=`。`arrayFormatSeparator` 必须是单字符，否则 `TypeError`。

4. **stringify 默认严格编码**：`encode: true`、`strict: true`。strict 路径在 `encodeURIComponent` 之后再把 `!'()*` 编成 `%XX`。`undefined` 整项丢掉；`null` 输出裸 key。`skipNull` / `skipEmptyString` 可在进编码器前过滤。`replacer(key, value)` 返回 `undefined` 就跳过。

`parseUrl` 用 `split-on-first` 切开 `#`，再 `extract` 问号后的部分。`stringifyUrl` 把 URL 里已有 query 与 `object.query` 合并（后者覆盖）。`pick` / `exclude` 建立在 `filter-obj` 的 `includeKeys` 上。

## 实践示例

### 案例 1：默认 parse 与“只有 key”

```js
import queryString from "query-string"

queryString.parse("?foo=bar&baz")
// { baz: null, foo: "bar" }   // 默认 sort:true，baz 在 foo 前
```

`baz` 没有 `=`，值是 `null`。若你需要保持 URL 里的出现顺序，要显式 `{ sort: false }`。

### 案例 2：同组数，三种写法

```js
queryString.stringify({ foo: [1, 2, 3] })
// "foo=1&foo=2&foo=3"

queryString.stringify({ foo: [1, 2, 3] }, { arrayFormat: "bracket" })
// "foo[]=1&foo[]=2&foo[]=3"

queryString.stringify({ foo: [1, 2, 3] }, { arrayFormat: "comma" })
// "foo=1,2,3"
```

parse 时必须用**同一** `arrayFormat`，否则 `foo[]=1` 的 key 会原样留下来，值仍是字符串。`types` 里的 `string[]` / `number[]` 在 `arrayFormat: 'none'` 时被忽略。

### 案例 3：改一条 URL 而不手拆 hash

```js
queryString.stringifyUrl({
  url: "https://ex.com/path?keep=1#frag",
  query: { extra: 2, keep: 0 },
})
// "https://ex.com/path?extra=2&keep=0#frag"
```

`keep` 被对象覆盖；原 hash 仍在。若传入 `fragmentIdentifier`，源码会用 `new URL(url, "https://query-string.invalid")` 来决定要不要编码 `#`。

## 踩过的坑

1. **默认当成“不排序、不改类型”的薄包装**：默认 `sort: true`；`parseNumbers` / `parseBooleans` 默认关，要靠 `types` 做逐 key 强制。
2. **把 README 的“对象会 throw”写成运行时保证**：`base.d.ts` / README 把 `Stringifiable` 限在标量与数组；`stringify` 源码没有单独的 plain-object 拒绝分支。对象会经 `encodeURIComponent` 收成 `[object Object]`。`Symbol` 在 `encodeURIComponent` 上会抛。
3. **`comma` 丢失 `null` 类型**：`foo=1,,2` 这类分隔串再 parse 回来，空段不再记得原来是 `null` 还是 `""`。
4. **空数组 + `bracket-separator`**：`stringify({ foo: [] }, { arrayFormat: "bracket-separator" })` 得到 `foo[]`，与“省略空数组”不是同一条合同。
5. **从 CJS 直接 `require("query-string")`**：固定版本是 ESM-only。

## 适用 vs 不适用场景

**适用**：

- 前后端要跟多种 query 方言对齐（Rails bracket、CSV、index）
- 需要 `parseUrl` / `stringifyUrl` / `pick` / `exclude` 这种 URL 级手术
- 能接受默认排序，或愿意每次传入 `{ sort: false }`

**不适用**：

- 只要拼 `baseURL + path`，query 只是附带——那是 [[ufo]] 的主场
- 要把嵌套对象编成 JSON 放进一个参数（ufo 的 `encodeQueryValue` 会 `JSON.stringify`；这里类型合同不包含 plain object）
- 不能引入那三个运行时依赖
- 要把 README 的 benchmark.js 数字写成你的延迟

## 固定版本边界

- 本文绑定 `sindresorhus/query-string@aae373a5...`，npm `query-string@9.5.0`；`gitHead` 与 GitHub tag `v9.5.0` 同指此提交。
- MIT；入口 `index.js` → `base.js`；依赖 `decode-uri-component@^0.5.0`、`filter-obj@^5.1.0`、`split-on-first@^3.0.0`。
- 未安装依赖、未跑 ava / tsd / benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认值本身就是合同**——`none` + `sort: true` + 缺等号为 `null`。
2. **数组格式必须成对使用**，parse 与 stringify 各写一遍不够，还得同一方言。
3. **URL 级 API 先拆 hash / query 再合并**，`stringifyUrl` 的覆盖顺序是“对象赢”。
4. **文档类型与运行时强制不是一回事**——plain object 的实际行为要看 `encode`，不能只抄 README。

## 应用型自测

1. `queryString.parse("a&b=1")` 里 `a` 的值是什么？
2. 默认 `stringify({ z: 1, a: 2 })` 的 key 顺序是什么？
3. 不改选项时，`parse("foo[]=1&foo[]=2")` 会得到字符串数组吗？

检查点：

1. `null`。没有 `=` 就按 W3C 草稿收成 `null`。
2. `a` 在 `z` 前。默认 `sort` 为 `true`，按 key 字典序。
3. 不会。默认 `arrayFormat: 'none'` 不认 `[]`，key 仍是 `"foo[]"`。

## 延伸阅读

- 文档：[sindresorhus/query-string](https://github.com/sindresorhus/query-string)
- 固定源码：本文绑定提交 `aae373a54526c7b297f60e4d7b77eb0709d2ae9c`
- [[ufo]] —— 整段 URL 工具箱，query 只有重复 key 一种数组
- WHATWG URL Standard —— 原生 `URLSearchParams` 的对照基线

## 关联

- [[ufo]] —— 解析/拼接整段 URL，query 合同更窄
- [[ofetch]] —— HTTP 客户端，query 规范化走 ufo 而不是本库
- [[ky]] —— Fetch 包装，searchParams 走自己的选项
- [[hono]] —— 框架内的 query getter，不是独立 query 方言层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ufo]] —— ufo — 给人读的 URL 工具箱
