---
title: url-pattern — 把模式编译成可双向转换的 AST
description: 介绍 url-pattern 如何用 parser combinator 把字符串编译成 AST，再做 match 与 stringify
来源: https://github.com/snd/url-pattern
日期: 2026-08-27
分类: 路由
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/snd/url-pattern
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 195d77082e438bcacaf095ecb812d80eeac456ae
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.0.3
---

## 是什么

url-pattern 是一个把路由或任意字符串模式编译成 AST 的 JavaScript 库。日常类比：先把路牌拆成“固定字、命名空位、可选括号、通配符”四类零件，再决定怎么对照实物或按零件重新拼回去。

你写：

```js
var UrlPattern = require('url-pattern');
var pattern = new UrlPattern('/api/users(/:id)');

pattern.match('/api/users/10'); // { id: '10' }
pattern.match('/api/users');    // {}
pattern.stringify({ id: 20 });  // '/api/users/20'
```

固定 1.0.3 的入口是编译后的 `lib/url-pattern.js`。字符串模式只解析一次，之后 `match` 跑编译好的正则，`stringify` 沿 AST 回写。

## 为什么重要

不理解 url-pattern 的 AST 和“可选括号 / 通配符 `_`”，就解释不了下面几件事：

- 为什么 `/api/users(/:id)` 既能匹配带 id 的路径，也能匹配不带 id 的路径
- 为什么通配结果落在 `_`，而不是 `*`
- 为什么从 `RegExp` 建出来的实例能 `match`，却不能 `stringify`
- 为什么它和 [[regexparam]] 对大小写、前导斜杠的合同不一样

## 核心要点

固定 1.0.3 的主链可以拆成五步：

1. **接收字符串或正则**：构造函数见到另一个 `UrlPattern` 就复制字段；见到 `RegExp` 只保存正则，可选第二参数是捕获名数组；见到字符串才进入解析器。空字符串和带空白的字符串直接抛错。

2. **parser combinator 出 AST**：内部 `P.sequence` / `P.firstChoice` / `P.lazy` 把模式拆成 `static`、`named`、`optional`、`wildcard` 节点。可选段默认用 `(` `)`，命名段以 `:` 开头，通配符默认是 `*`。

3. **AST 编译成锚定正则**：`astNodeToRegexString` 给整树加上 `^` 与 `$`。命名值默认字符集是 `a-zA-Z0-9-_~ %`；通配编译成 `(.*?)`。这套正则**没有** `i` 标志，匹配区分大小写。

4. **`match` 把捕获填回名字**：`regex.exec` 成功后，`names` 与捕获组按位置对齐。重复的命名段会收成数组；通配名固定是 `_`。正则模式若没给名字数组，就返回捕获数组本身。

5. **`stringify` 沿 AST 回写**：必填命名段或通配缺失就抛错；可选段只有在内部已有对应值时才展开。从正则构造的实例会拒绝 stringify。

## 实践示例

### 案例 1：可选括号决定对象里有没有字段

```js
var pattern = new UrlPattern('/api/users(/:id)');
pattern.match('/api/users/10'); // { id: '10' }
pattern.match('/api/users');    // {}
pattern.match('/api/posts/5');  // null
```

可选段编译成 `(?:...)?`。没有 id 时不会留下 `id: undefined`，对象里直接没有这个键。

### 案例 2：通配结果在 `_`，重复命名段变成数组

```js
var version = new UrlPattern('/v:major(.:minor)/*');
version.match('/v1.2/');     // { major: '1', minor: '2', _: '' }
version.match('/v2/users');  // { major: '2', _: 'users' }

var dup = new UrlPattern('/api/users/:ids/posts/:ids');
dup.match('/api/users/10/posts/5'); // { ids: ['10', '5'] }
```

`.` 不在默认值字符集里，所以 `:major.:minor` 会在点号处停下。`keysAndValuesToObject` 见到重复键就把后值推进数组。

### 案例 3：stringify 只展开“有值的可选段”

```js
var pattern = new UrlPattern('/api/users(/:id)');
pattern.stringify();            // '/api/users'
pattern.stringify({ id: 10 });  // '/api/users/10'
```

可选段要先通过 `astNodeContainsSegmentsForProvidedParams`。缺必填键会抛 `no values provided for key`。

## 踩过的坑

1. **把它当成 WHATWG `URLPattern`**：这是 `snd/url-pattern`，不是浏览器 URL Pattern API，也不解析 query。README 建议在 `?` 处切开，路径用本库、查询用别的库。

2. **以为通配键叫 `*`**：AST 里通配的名字是 `_`。`stringify` 也读 `params._`。

3. **对正则实例调用 `stringify`**：源码直接抛 `can't stringify patterns generated from a regex`。

4. **把 npm `1.0.3` 当成 GitHub tag**：`gitHead` `195d77082e438bcacaf095ecb812d80eeac456ae` 在仓库里可达，但 GitHub 最新源码 tag 仍是 `1.0.1`。

5. **按 [[regexparam]] 的大小写 / 前导斜杠习惯来用**：本库正则没有 `i` 标志，也不会自动补 `/`。`/USERS` 对不上 `/users`。

## 适用 vs 不适用场景

**适用**：

- 需要同一份模式既 `match` 又 `stringify`
- 模式里有嵌套可选括号，或要把 host / path 写在同一条规则里
- 可以接受 CoffeeScript 编译产物、Node `>= 0.12` 和 2016 年冻结的 1.0.3

**不适用**：

- 只要“路径 → keys + RegExp”、再自己拼参数对象——看 [[regexparam]]
- 需要框架级路由、中间件和 schema——看 [[express]] / [[fastify]] / [[koa]]
- 需要类型化 URL 和 `<Link>`——看 [[tanstack-router]]
- 不能接受“最新 tag 与 npm latest 不是同一枚标签”的 provenance

## 固定版本边界

- 本文绑定 `snd/url-pattern@195d77082e438bcacaf095ecb812d80eeac456ae`。npm `url-pattern@1.0.3` 的 `gitHead` 即此提交；仓库没有 `1.0.3` tag，`1.0.1` 指向 `41ddfece274a6fb840a97d04e3ae047e6414b861`。
- `package.json` 无运行时依赖，`main` 为 `lib/url-pattern`，`engines.node >= 0.12.0`。作者源在 `src/url-pattern.coffee`。
- 默认选项：`escapeChar=\\`、`segmentNameStartChar=:`、`optionalSegmentStartChar=(`、`wildcardChar=*`。
- 本文未安装依赖、运行上游测试或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **模式先变成 AST，再变成正则**——`match` 和 `stringify` 读的是同一棵树，不是两套语法。
2. **可选与通配是节点类型，不是正则糖**——括号决定对象里有没有键，`*` 决定 `_`。
3. **正则入口放弃回写**——没有 AST 就不能 stringify。
4. **发布标签可以缺席**——要绑 npm latest，先核 `gitHead` 是否真的在 canonical remote。

## 应用型自测

1. `new UrlPattern('/api/*').match('/api/users/5')` 的通配字段叫什么？
2. `new UrlPattern(/^\/api\/(.*)$/).stringify({ _: 'users' })` 会得到 `'/api/users'` 吗？
3. `new UrlPattern('/users/:id').match('/USERS/10')` 在默认选项下会成功吗？

检查点：

1. `_`。通配名由 `astNodeToNames` 写成 `'_'`。
2. 不会。正则实例的 `stringify` 直接抛错。
3. 不会。编译结果没有 `i` 标志，`/USERS` 对不上 `/users`。

## 延伸阅读

- 文档：[snd/url-pattern README](https://github.com/snd/url-pattern)
- 固定源码：[snd/url-pattern](https://github.com/snd/url-pattern) —— 本文绑定提交 `195d77082e438bcacaf095ecb812d80eeac456ae`
- [[regexparam]] —— 只编译路径字符串、不保存 AST 的对照
- [[express]] —— 框架路由会再包一层匹配器

## 关联

- [[regexparam]] —— slash 分段编译 + `inject`，不保留 AST
- [[express]] —— 应用层路由，匹配器是依赖而不是页面主题
- [[fastify]] —— 另一条框架路由主链
- [[koa]] —— 中间件框架，路由通常外挂
- [[tanstack-router]] —— 把路径升级成类型，而不是运行时 AST
- [[msw]] —— handler 里的 URL 匹配是另一层合同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
