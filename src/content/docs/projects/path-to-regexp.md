---
title: path-to-regexp — 把路径模板编成正则再匹配或反编译
description: 介绍 path-to-regexp 8.4.2 如何把 :param、*wildcard 与花括号可选段编成正则，并反向 compile 回路径。
来源: https://github.com/pillarjs/path-to-regexp
日期: 2026-08-27
分类: 路由匹配
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pillarjs/path-to-regexp
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cbf30259e6d34d6135f9e7dbaa3371e7188f9936
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.4.2
---

## 是什么

path-to-regexp 是一个把路径模板编成正则、再用来匹配或反编译的小库。日常类比：它不负责整张路线图，只做“一块路牌怎么读”——`:name` 吃到下一段分隔符，`*splat` 可以跨多段，`{/:id}` 整组可有可无。

你写：

```js
const { match, compile } = require("path-to-regexp");

const fn = match("/users/:id");
fn("/users/42");
// => { path: "/users/42", params: { id: "42" } }

const toPath = compile("/users/:id");
toPath({ id: "42" }); // => "/users/42"
```

固定 8.4.2 的作者源在 `src/index.ts`，发布入口是 `dist/index.js`。仓库 `package.json` 没有运行时依赖。

## 为什么重要

不读固定 8.4.2 的分词与编正则合同，就容易把旧 Express 4 写法直接搬过来：

- 为什么裸 `*` 或 `?` 现在会抛 `PathError`，必须写成 `*splat` 或 `{/:id}`
- 为什么 `/:foo:bar` 这种贴在一起的两个参数会被拒绝
- 为什么 `match` 默认大小写不敏感，却要求整段吃完（`end: true`）
- 为什么 `compile("/*files")` 要的是非空字符串数组，不是单个字符串

## 核心要点

固定 8.4.2 的主链可以拆成五步：

1. **先分词再编正则**：`parse()` 把字符串拆成 `text` / `param` / `wildcard` / `group`，包进 `TokenData`。`pathToRegexp()` 再把花括号组展开成最多 256 种平面组合。

2. **参数吃一段，通配吃多段**：`:id` 默认匹配到下一个 `/`；`*splat` 生成 `([^]+)`，`match()` 再按 delimiter 切成数组。

3. **默认锚定整条路径**：`end` 默认 true，`trailing` 默认 true（可以多一个结尾 `/`），`sensitive` 默认 false。`end: false` 时用 `(?=/|$)` 停在下一段或结尾。

4. **反向 compile**：`compile()` 把参数填回路径。缺必填参数会抛 `Missing parameters`；可选组缺参时整组省略。

5. **库不管路由表**：一次 `match(path)` 只处理一条或一组模板。谁先注册、谁覆盖，要调用方自己排。对照见 [[route-recognizer]]。

## 实践示例

### 案例 1：可选组展开成两种平面路径

```js
const fn = match("/users{/:id}/delete");

fn("/users/delete");
// => { path: "/users/delete", params: {} }

fn("/users/7/delete");
// => { path: "/users/7/delete", params: { id: "7" } }
```

`flatten()` 把 `{/:id}` 展开成“有这一段”和“没有这一段”两条组合，再用 `|` 拼进同一条正则。组合数到 256 会抛 `Too many path combinations`。

### 案例 2：通配参数交出数组

```js
const fn = match("/*splat");
fn("/a/b/c");
// => { path: "/a/b/c", params: { splat: ["a", "b", "c"] } }
```

通配捕获先吃剩余字符，再 `value.split(delimiter).map(decode)`。`compile("/*splat")` 要求 `splat` 是非空字符串数组。

### 案例 3：默认忽略大小写，但必须吃到结尾

```js
const fn = match("/File/:name");
fn("/file/readme");     // 命中，params.name === "readme"
fn("/file/readme.md");  // false，因为默认 end: true
```

`pathToRegexp` 默认 `new RegExp(pattern, "i")`。要前缀匹配得显式 `end: false`。

## 踩过的坑

1. **把 Express 4 的 `*` / `?` / `(regexp)` 当成本版语法**：8.x 要求通配必须有名字，可选改用 `{}`，圆括号等字符被保留。字面量要反斜杠转义。

2. **两个参数紧挨着写**：`/:foo:bar` 会抛 `Missing text before "bar" param`。中间必须有一段 text。

3. **以为 `params` 是普通对象**：`match()` 用 `Object.create(null)` 建参数表，没有 `Object.prototype`。

4. **把 npm 体积上限当成实测**：`package.json` 的 size-limit 写过 `2 kB`，本轮未安装依赖、未跑 `size`。

5. **拿它当路由器**：它只编一条或一组模板。多条路由抢同一个 URL 时，没有静态优先排序。

## 适用 vs 不适用场景

**适用**：

- 已经有自己的路由表，只需要把 `/users/:id` 编成正则或反编译
- 能接受 8.x 的具名通配、花括号可选和保留字符
- 打包器消费 `exports: ./dist/index.js` 的单文件构建

**不适用**：

- 要在多条已注册路由里选出“最静态”的那条——看 [[route-recognizer]]
- 还在 Express 4 的 `*` / `?` / 内嵌正则语法上——不要只改 import
- 需要类型化文件路由或 loader——[[tanstack-router]] 更贴
- 不能接受默认大小写不敏感、或不能接受未测 bundle 体积

## 固定版本边界

- 本文绑定 `pillarjs/path-to-regexp@cbf30259e6d34d6135f9e7dbaa3371e7188f9936`。tag `v8.4.2` 与 npm `path-to-regexp@8.4.2` 的 `gitHead` 指向同一提交。
- `package.json` 无运行时依赖；`exports` / `main` 都是 `./dist/index.js`。
- `PathError` 会附上 `originalPath`，并指向 `https://git.new/pathToRegexpError`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **8.x 先分词，再展开可选组**——正则是平面组合，不是运行时回溯可选语法。
2. **参数和通配是两种捕获**——一段 vs 多段，decode 合同也不同。
3. **默认“整段、可拖尾斜杠、忽略大小写”**——前缀匹配和大小写敏感都要显式改选项。
4. **它不是路由器**——只回答“这条模板能不能吃下这个 path”。

## 应用型自测

1. `match("/*")` 在 8.4.2 能不能当“匹配剩余路径”用？
2. `match("/:foo:bar")` 会得到两个参数，还是直接失败？
3. 不传 options 的 `match("/File/:name")("/file/readme")` 会命中吗？

检查点：

1. 不能。`*` 后面必须有名字，否则 `parse` 抛 `Missing parameter name`。
2. 失败。相邻 param 缺 text，抛 `Missing text before "bar" param`。
3. 会。默认 `sensitive: false`，`/File` 与 `/file` 同一条正则。

## 延伸阅读

- 文档：[pillarjs/path-to-regexp](https://github.com/pillarjs/path-to-regexp)
- 固定源码：[pillarjs/path-to-regexp](https://github.com/pillarjs/path-to-regexp) —— 本文绑定提交 `cbf30259e6d34d6135f9e7dbaa3371e7188f9936`
- [[route-recognizer]] —— 多路由注册后按静态优先选出一条
- [[express]] —— 历史上推广了 path-to-regexp 语法；本页不绑定 Express 运行时
- [[msw]] —— handler 用 path-to-regexp 风格匹配 URL

## 关联

- [[route-recognizer]] —— 路由表 + NFA 对照
- [[express]] —— 常见调用方，但 8.x 已不兼容 Express 4 语法
- [[msw]] —— 测试层复用同一路牌语法
- [[tanstack-router]] —— 类型化路由，不只是字符串编正则
- [[koa]] —— 框架本身不含路由，常另接 path 匹配

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
