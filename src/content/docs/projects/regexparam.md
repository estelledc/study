---
title: regexparam — 把路由字符串编译成 RegExp 和 keys
description: 介绍 regexparam 如何把路径模式编译成 keys 与 RegExp，并用 inject 回填参数
来源: https://github.com/lukeed/regexparam
日期: 2026-08-27
分类: 路由
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lukeed/regexparam
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d05da2631beb7c5620774dae207cb09c7cbf24cc
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.0
---

## 是什么

regexparam 是一个把路径模式编译成 `{ keys, pattern }` 的微型路由工具。日常类比：它不保存整张装配图，只给你一把按斜杠切开的尺子（正则）和一张空位名单（keys）；量完尺寸后，你自己把读数填进对象。

你写：

```js
import { parse, inject } from 'regexparam';

var foo = parse('/books/:genre/:title?');
foo.keys; // ['genre', 'title']
foo.pattern.test('/books/horror'); // true

inject('/users/:id', { id: 'lukeed' }); // '/users/lukeed'
```

固定 3.0.0 的作者源在 `src/index.js`。npm 包的 `exports` 指向构建后的 `dist/`，源码仓里没有这份目录。

## 为什么重要

不理解 regexparam 的“斜杠分段 + keys 数组”，就解释不了下面几件事：

- 为什么 `parse('books/:title')` 和 `parse('/books/:title')` 编出同一条正则，测试时却必须带前导 `/`
- 为什么传入 `RegExp` 时 `keys` 永远是 `false`
- 为什么缺了必填参数，`inject` 不会抛错，而是把 `:id` 留在字符串里
- 为什么它和 [[url-pattern]] 对大小写、可选语法、通配键名的合同相反

## 核心要点

固定 3.0.0 的主链可以拆成五步：

1. **两条入口**：`parse(input, loose)` 负责编译；`inject(route, values)` 负责回填。源码没有路由器、没有中间件。

2. **按 `/` 切开再拼正则**：空的首段（也就是前导 `/`）会被丢掉，每个静态段再补回 `/`。所以 `'books'` 和 `'/books'` 编出同样的 `^/books/?$`。

3. **三种动态段**：`:` 取到 `?` 或 `.` 之前的名字，写成 `([^/]+?)`；单独的 `?` 再包一层可选非捕获组；`*` / `*?` 写成 `/(.*)` 或 `(?:/(.*))?`，对应 key 是 `'*'`。

4. **结尾与大小写**：默认后缀是 `/?$`；`loose === true` 改成 `(?=$|/)`，允许后面还有路径。字符串模式一律带 `i` 标志。已经是 `RegExp` 的输入原样返回，`loose` 被忽略，`keys` 为 `false`。

5. **`inject` 是字符串替换，不走 AST**：正则 `/(\/|^)([:*][^/]*?)(\?)?(?=[/.]|$)/g` 找到 `:name` 或 `*`。有值就写成 `/value`；缺可选或通配就删掉；缺必填则保留 `/:name`。

## 实践示例

### 案例 1：可选参数留下 key，值可能是 `null`

```js
var foo = parse('/books/:genre/:title?');
foo.pattern.test('/books/horror');            // true
foo.pattern.test('/books/horror/goosebumps'); // true

var m = foo.pattern.exec('/books/horror');
// foo.keys === ['genre', 'title']
// m[1] === 'horror', m[2] === undefined
```

库本身不返回参数对象。README 里的 `exec` 示例是调用方自己按 `keys` 填；缺省捕获通常被写成 `null`。

### 案例 2：后缀参数和 loose 匹配

```js
var bar = parse('/movies/:title.(mp4|mov)');
bar.pattern.test('/movies/narnia.mp4'); // true
bar.pattern.test('/movies/narnia');     // false

parse('/users').pattern.test('/users/lukeed');      // false
parse('/users', true).pattern.test('/users/lukeed'); // true
```

`.` 后的静态后缀会按原样拼进正则。`loose` 只改结尾断言，不改 keys。

### 案例 3：inject 缺值时的三种结局

```js
inject('/users/:id', { id: 'lukeed' }); // '/users/lukeed'
inject('/hello/:world', { abc: 123 });  // '/hello/:world'
inject('/posts/:slug/*', { slug: 'hello' }); // '/posts/hello'
inject('/:foo/:bar?/:baz?', { foo: 'aaa', baz: 'ccc' }); // '/aaa/ccc'
```

必填缺值保留模式文本；可选和 `*` 缺值直接去掉。`values` 必须是对象，否则读取属性会抛 `TypeError`。

## 踩过的坑

1. **用编译前的习惯去 `test`**：`'books'` 能编译，但 `pattern.test('books')` 为 false。测试路径必须带前导 `/`。

2. **把 `keys: false` 当成空数组**：`parse(/foo/)` 对传入正则零修改。要自己用命名捕获或按下标取组。

3. **以为 `inject` 会校验必填项**：缺 `:id` 不会抛“missing param”，输出里仍留着 `:id`。

4. **按 [[url-pattern]] 去读通配键**：这里通配键是 `'*'`，不是 `_`。可选语法是 `:title?` / `*?`，不是 `(...)`。

5. **把 README 的 399B 当成本轮测量**：`package.json` / README 写过体积，本轮未打包、未测 gzip。源码仓也没有 `dist/`。

## 适用 vs 不适用场景

**适用**：

- 只要路径 → `{ keys, pattern }`，参数对象由调用方组装
- 需要 `:id?`、`:title.mp4`、`*` / `*?` 这组有限算子
- 打包器能消费 `exports` 里的 ESM / CJS，并能接受 `dist/` 不在 git 里

**不适用**：

- 需要同一份模式既匹配又带 AST 的 stringify、嵌套可选括号——看 [[url-pattern]]
- 需要完整 HTTP 路由器——看 [[express]] / [[fastify]]，或上游 README 提到的 trouter
- 需要类型化路由树——看 [[tanstack-router]]
- 目标运行时低于 `engines.node >= 8`

## 固定版本边界

- 本文绑定 `lukeed/regexparam@d05da2631beb7c5620774dae207cb09c7cbf24cc`。tag `v3.0.0` 与 npm `regexparam@3.0.0` 的 `gitHead` 指向同一提交。
- `exports` 为 `import → ./dist/index.mjs`、`require → ./dist/index.js`；审查读的是 `src/index.js`。
- 字符串模式始终带 `i` 标志；`loose` 只影响字符串入口。
- README 与 GitHub 描述里的体积数字未经本轮测量。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **编译器和参数对象是两层**——`parse` 只给尺子和名单，填表是调用方的事。
2. **前导斜杠的合同不对称**——编译时会补，匹配时必须已经有。
3. **`inject` 是替换不是校验**——缺必填就原样留下 `:name`。
4. **和 url-pattern 的差异是语法，不是“谁更完整”**——`?` / `*` / `i` 对 `(...)` / `_` / 大小写敏感。

## 应用型自测

1. `parse('/users').pattern.test('/Users')` 会成功吗？
2. `parse(/foo/)` 返回的 `keys` 是 `[]` 还是 `false`？
3. `inject('/hello/:world', { abc: 123 })` 的返回值是什么？

检查点：

1. 会。字符串模式带 `i` 标志。
2. `false`。正则入口不解析名字。
3. `'/hello/:world'`。缺必填值时保留模式文本。

## 延伸阅读

- 文档：[lukeed/regexparam README](https://github.com/lukeed/regexparam)
- 固定源码：[lukeed/regexparam](https://github.com/lukeed/regexparam) —— 本文绑定提交 `d05da2631beb7c5620774dae207cb09c7cbf24cc`
- [[url-pattern]] —— AST + 双向转换的对照
- [[express]] —— 应用层路由如何消费匹配器

## 关联

- [[url-pattern]] —— 保留 AST，可选括号和 `_` 通配
- [[express]] —— 框架路由主链
- [[fastify]] —— 另一条框架路由主链
- [[koa]] —— 中间件框架，路由通常外挂
- [[nestjs]] —— 装饰器路由，匹配器不在本页范围
- [[tanstack-router]] —— 编译期路径类型，而不是运行时 keys
- [[msw]] —— handler URL 匹配是另一层合同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
