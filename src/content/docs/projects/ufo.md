---
title: ufo — 给人读的 URL 工具箱
description: unjs 的零依赖 URL 解析/拼接/query 工具，绑定 1.6.4 静态源码。
来源: https://github.com/unjs/ufo
日期: 2026-08-27
分类: URL / Query
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/ufo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.6.4
---

## 是什么

ufo 是一份零运行时依赖的 URL 工具箱：解析、拼接、query、编码和协议检查都在同一套函数里。日常类比：它不像浏览器 `URL` 那样要求你先有一份“合法绝对地址”，而更像一把可以拆开相对路径、`?query` 和 `#hash` 的瑞士军刀。

```ts
import { joinURL, withQuery, parseURL } from "ufo"

joinURL("https://api.example.com", "users", "1")
// "https://api.example.com/users/1"

withQuery("/search?q=a", { page: 2 })
// "/search?q=a&page=2"

parseURL("http://foo.com/foo?test=123#token")
// { protocol: "http:", host: "foo.com", pathname: "/foo", search: "?test=123", hash: "#token", auth: "" }
```

固定 `1.6.4` 的 `package.json` 标 `sideEffects: false`，发布物只有 `dist`；条件导出同时给 ESM / CJS。`$URL` / `createURL` 在源码里标了 `@deprecated`，注释指向原生 `URL` 或 `parseURL`。

## 为什么重要

不理解 ufo 的边界，下面这些事会对不上：

- 为什么相对路径、`//cdn.example.com` 和 `javascript:` 不能拿同一套 `new URL()` 心智去套
- 为什么 `withQuery(url, { token: undefined })` 会删掉旧 `token`，而 `null` 会留下只有 key 的 `?token`
- 为什么 `joinURL` 不消化 `../`，却另有 `joinRelativeURL`
- 为什么从 `/legacy` 剥 base 时，源码要折叠前导斜杠，而不是直接 `slice`

## 核心要点

固定版本可以拆成五层：

1. **先拆再组**：`parseURL` 用正则拆 `protocol` / `auth` / `host` / `pathname` / `search` / `hash`。没有协议时走 `parsePath`；传入 `defaultProto` 才会补协议再解析。`blob:` / `data:` / `javascript:` / `vbscript:` 走单独分支，整段后半放进 `pathname`。

2. **query 是对象，不是 `URLSearchParams`**：`parseQuery` 去掉可选的前导 `?`，用 `Object.create(null)` 收款；同名 key 第二次出现就升级成数组。`__proto__` 和 `constructor` 被直接跳过。`stringifyQuery` 丢掉 `undefined`，其余交给 `encodeQueryItem`。

3. **编码按区段分工**：query 值把空格收成 `+`、`+` 收成 `%2B`；非 string 的 number / boolean 先 `String`，其它对象走 `JSON.stringify`。路径用 `encodePath`，host 走 punycode `toASCII`。

4. **拼接有两条合同**：`joinURL` 只剥前导 `./` 或 `/` 再粘，注释写明 `..` 尚未处理。`joinRelativeURL` 才按段消化 `.` / `..`，并保住协议段不被 `..` 弹出。`resolveURL` 则在 `parseURL` 结果上追加 path、覆盖 hash、合并 search。

5. **base 剥离防协议相对注入**：`withoutBase("/legacy//evil.com", "/legacy")` 会先 `replace(/^\/+/, "")` 再补回单斜杠，避免得到 `//evil.com`。

## 实践示例

### 案例 1：给已有 URL 合并 query

```ts
import { withQuery } from "ufo"

withQuery("/items?sort=name", { page: 2, sort: undefined })
// "/items?page=2"
```

`withQuery` 先 `parseURL`，再把旧 `search` 与新对象展开合并。新对象里的 `undefined` 覆盖旧值后，`stringifyQuery` 把它滤掉，于是 `sort` 消失。若写成 `{ sort: null }`，结果是 `/items?sort&page=2`。

### 案例 2：重复 key 变成数组

```ts
import { parseQuery } from "ufo"

parseQuery("tags=js&tags=web")
// { tags: ["js", "web"] }
```

这是 ufo 唯一的数组约定：重复 key。它没有 bracket / comma / index 这些格式开关。空数组在 `encodeQueryItem` 里会 `join` 成空串，再被 `stringifyQuery` 的 `filter(Boolean)` 丢掉，所以 `{ "b[]": [] }` 不会出现在输出里。

### 案例 3：相对拼接不要误用 joinURL

```ts
import { joinURL, joinRelativeURL } from "ufo"

joinURL("/app/users", "../settings")
// "/app/users/../settings"

joinRelativeURL("/app/users", "../settings")
// "/app/settings"
```

`joinURL` 的循环里有 `TODO: Handle .. when joining`。需要 `../` 时用 `joinRelativeURL`，或者自己先规范化。

## 踩过的坑

1. **把 `$URL` 当成当前公开合同**：类还在，但源码已标 deprecated。
2. **以为 `false` / `0` 会像 `null` 一样变成裸 key**：`encodeQueryItem` 先把 number / boolean `String` 掉，`false` 变成 `"false"`，`0` 变成 `"0"`；只有之后仍为假值的 `null` / `""` 才输出裸 key。
3. **拿 ufo 去吃 `foo[]=1` 或 `foo=1,2,3`**：它不会按 bracket / comma 还原数组，只会当普通字符串。
4. **用 `withoutBase` 当通用 path relativize**：只有输入确实以 base 开头、且下一个字符是 `/`、`?` 或结束时才剥；`/admin-dashboard` 不会被当成 `/admin` 的子路径。
5. **把 README 里的“URL utils for humans”写成性能或体积保证**：固定包声明零依赖和 `sideEffects: false`，最终产物仍取决于 bundler 与 import。

## 适用 vs 不适用场景

**适用**：

- 在 Node / 边缘运行时拼 `baseURL + path + query`，且经常面对相对路径
- 需要跳过 `javascript:` / `data:` 这类脚本协议，或折叠 `//`
- 能接受“重复 key = 数组、对象 query 变 JSON”这一条窄合同

**不适用**：

- 必须兼容 `qs` / `query-string` 的 bracket、index、comma 数组方言
- 要把嵌套对象编成 `user[name]=Ada` 这种 form 风格
- 还想靠 `$URL` 当长期 API
- 需要把未实测的 parse 吞吐写成选型结论

## 固定版本边界

- 本文绑定 `unjs/ufo@f06c800d...`，npm `ufo@1.6.4`；`gitHead` 与 GitHub tag `v1.6.4` 同指此提交。
- MIT，无运行时依赖；发布入口是 `dist/index.mjs` / `dist/index.cjs`。
- 未安装依赖、未跑 vitest、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **ufo 的主链是 parse → mutate → stringify**，不是包装 `URLSearchParams`。
2. **query 数组只有“重复 key”一种方言**；对象会被 JSON 化，不是嵌套 form。
3. **`joinURL` 与 `joinRelativeURL` 不是别名**——`..` 只在后者被消化。
4. **剥 base 时的斜杠折叠是安全补丁**，不是装饰。

## 应用型自测

1. `withQuery("/x?id=1", { id: undefined })` 的结果是什么？
2. `joinURL("/a/b", "../c")` 会得到 `/a/c` 吗？
3. `parseQuery("__proto__=polluted&ok=1")` 里有没有 `__proto__` 键？

检查点：

1. `"/x"`。`undefined` 覆盖旧值后被 `stringifyQuery` 丢掉。
2. 不会。`joinURL` 会留下 `/a/b/../c`；要 `/a/c` 用 `joinRelativeURL`。
3. 没有。`__proto__` 与 `constructor` 被跳过，只剩 `{ ok: "1" }`。

## 延伸阅读

- 文档与 README：[unjs/ufo](https://github.com/unjs/ufo)
- 固定源码：[unjs/ufo](https://github.com/unjs/ufo) —— 本文绑定提交 `f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6`
- [[query-string]] —— 专门处理查询串方言与 sort / types 的对照
- [[ofetch]] —— 固定版本用 ufo 拼 baseURL 与 query

## 关联

- [[query-string]] —— 查询串专用库，数组格式远多于 ufo
- [[ofetch]] —— 同一 unjs 生态里的 HTTP 包装
- [[ky]] —— 另一条 Fetch 包装线，query 不走 ufo
- [[hono]] —— Web 框架侧也会拆 path / query，但是路由器合同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[query-string]] —— query-string — 可配置的查询串解析与序列化
