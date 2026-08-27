---
title: rou3 — 带方法维的后继路径路由器
description: 固定 0.9.2 用独立函数加方法维，命中物在 data 下，createRouter 不接收 options
来源: https://github.com/h3js/rou3
日期: 2026-08-27
分类: Web 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/h3js/rou3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 68f6d87de9533b1bb3e06d95c53184a41f4a515c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.9.2
---

## 是什么

rou3 是 [[radix3]] 同一 Git 谱系上的后继路由器：路径仍走 radix 树，但方法、匹配结果和编译出口都换成了新合同。日常类比：旧目录只问“门牌号”，新目录先问“你办什么业务（GET/POST）”，再按门牌往下走。

你写：

```js
import { createRouter, addRoute, findRoute } from "rou3";

const router = createRouter();
addRoute(router, "GET", "/path", { payload: "this path" });
addRoute(router, "POST", "/path/:name", { payload: "named route" });

findRoute(router, "GET", "/path");
// { data: { payload: "this path" }, ... }
```

固定 `0.9.2` 里，导出的 `createRouter()` **不接收 options**。注册和查找是 `addRoute` / `findRoute` 这类独立函数。命中物是 `{ data, params }`，不是把 payload 摊到顶层。

## 为什么重要

不理解 rou3 和 radix3 的断点，就解释不了下面几件事：

- 为什么 README 示例写 `createRouter(/* options */)`，源码却是零参数
- 为什么 `findRoute` 的返回值里 payload 在 `.data` 下，静态命中甚至还带着 `paramsRegexp`
- 为什么同节点上的 `GET /users/:id` 会让无方法的 `/users/*` 对 GET 消失
- 为什么 `findAllRoutes` 的顺序是合同，编译器必须吐出同一顺序

## 核心要点

主链可以拆成五步：

1. **上下文**：`createRouter()` 给出 `{ root, static }`。`static` 是 `NullProtoObj`，避免 `__proto__` 段污染。

2. **注册**：`addRoute(ctx, method, path, data)` 先 `method.toUpperCase()`，缺 `/` 就补上。`{...}` 分组和 `:name?` / `:name+` / `:name*` 先展开再递归插入。无参数路径写入 `ctx.static`。

3. **单次查找**：`findRoute` 默认剥尾斜杠。先查静态表；再走树，顺序是静态 child → param → wildcard。方法桶先 `methods[method]`，没有再回落 `methods[""]`。同节点多条目按“正则约束 + 必填末段”加权，平手取先注册。

4. **多层查找**：`findAllRoutes` 按 wildcard → param → static → 终点收集，约定**少具体到多具体**。可选语法的展开项按“实际命中的那条”加权，整条 pattern 的宽窄不是排序键。

5. **编译出口**：`rou3/compiler` 的 `compileRouter` 用 `new Function` JIT；数据过多时改走单数组参数，以免超过引擎形参上限。`compileRouterToString` 要求 data 可 JSON 序列化，或自己提供 `serialize`。

## 实践示例

### 案例 1：返回形是 `{ data }`，不是展开 payload

```js
import { createRouter, addRoute, findRoute } from "rou3";

const router = createRouter();
addRoute(router, "GET", "/test", { path: "/test" });

findRoute(router, "GET", "/test");
// 测试用 toMatchObject({ data: { path: "/test" } })
```

README 把静态命中写成 `{ payload: "this path" }`，与 `src/operations/find.ts` 和 `test/find.test.ts` 不符。先读 `.data`。

### 案例 2：同节点上，带方法的路由挡住无方法路由

```js
addRoute(router, "", "/users/*", { basicAuth: true });
addRoute(router, "GET", "/users/:id", { handler: true });

findAllRoutes(router, "GET", "/users/42").map((m) => m.data);
// [{ handler: true }]  —— 门闸消失
```

`:id` 和 `*` 落在同一 param 节点。查找先取 `methods.GET`，不再看 `methods[""]`。元数据若按“路径字符串”当 key，会以为还有两份。

### 案例 3：默认不解析 `..`，编译器要 eval

```js
findRoute(router, "GET", "/foo/bar/../baz");            // 按字面三段走
findRoute(router, "GET", "/foo/bar/../baz", { normalize: true }); // 变成 /foo/baz

import { compileRouter } from "rou3/compiler";
const match = compileRouter(router); // 依赖 new Function
```

`.` / `..` 不是默认合同。编译后的 matcher 与 `findRoute` / `findAllRoutes` 共用同一套顺序约定。

## 踩过的坑

1. **把 README 的 options / 展开返回值当源码**：`createRouter` 零参数；命中物在 `.data`。

2. **方法不大写**：`addRoute` 会 `toUpperCase()`，查找用小写 `"get"` 对不上，除非你也传入会被改写的注册值。文档要求 UPPERCASE。

3. **路径不以 `/` 开头**：注册会补；查找侧测试一律带 `/`。混用相对段容易和静态表 key 对不齐。

4. **用 `findRoute` 做层合并**：单次查找只给最具体的一条。中间件 / ISR 规则要 `findAllRoutes`，并接受“可选语法可能让更宽的 pattern 排到后面”。

5. **在无 eval 环境调用 `compileRouter`**：JIT 路径就是 `new Function`。要可序列化字符串才走 `compileRouterToString`。

## 适用 vs 不适用场景

**适用**：

- 需要 GET/POST 分桶，或空 method 当“方法无关”回落
- 需要 URLPattern 风格的 `:id(\\d+)`、`*.png`、`:name?`
- 接受 `{ data, params }`，并可能再用编译器换吞吐

**不适用**：

- 还在 radix3 的 `insert/lookup` 对象 API 上
- 运行时禁止 `new Function`，又想用 JIT `compileRouter`
- 要用本轮未跑的 bench 数字对比 radix3

## 固定版本边界

- 本文绑定 `h3js/rou3@68f6d87d...`。annotated tag `v0.9.2` 剥皮后即此提交，`package.json` 为 `rou3@0.9.2`。
- npm `rou3@0.9.2` 没有 `gitHead`；身份是 tag + 包版本 + SHA。
- `unjs/radix3` 与 `unjs/rou3` 的 GitHub 入口都解析到本仓；1.x tag 属于旧包 [[radix3]]，不要和 `0.9.2` 混绑。
- 未安装依赖、未跑 vitest / `compileRouter` / bench，状态保持 `UNVERIFIED`。

## 学到什么

1. **后继包换的是合同，不只是仓库名**——方法维、返回形、零参数 `createRouter` 都和 1.1.2 不同。
2. **同节点 ≠ 同路径集合**——`:id` 和 `*` 共享 bucket，但正则约束可以让匹配集不相交。
3. **`findAllRoutes` 的顺序是写进测试的合同**，给 merge/fold 用，不是实现细节。
4. **规范化、尾斜杠、eval 都是显式开关或运行时前提**，默认查找既不解析 `..`，也不保留尾 `/`。

## 应用型自测

1. `findRoute(router, "GET", "/path")` 的 payload 在顶层还是 `.data`？`createRouter` 接不接 `strictTrailingSlash`？
2. 同节点先注册无方法 `/users/*`，再注册 `GET /users/:id`，对 `GET /users/42` 还能看到门闸吗？
3. 默认 `findRoute` 会不会解析 `/foo/bar/../baz`？`compileRouter` 依赖哪一种动态代码？

检查点：

1. 在 `.data`。`createRouter()` 零参数，没有 radix3 那套 options。
2. 看不到。`methods.GET` 挡住 `methods[""]`。
3. 不会，除非 `{ normalize: true }`。JIT 依赖 `new Function`。

## 延伸阅读

- 官方源码：[h3js/rou3](https://github.com/h3js/rou3) —— 本文绑定提交 `68f6d87de9533b1bb3e06d95c53184a41f4a515c`
- 对照入口：`src/operations/find.ts`、`src/operations/add.ts`、`src/compiler.ts`
- 前身 API：[[radix3]]
- 上层框架对照：[[hono]]、[[elysia]]

## 关联

- [[radix3]] —— 同一仓的 1.1.2 对象 API：`insert` / `lookup` / 无方法维
- [[hono]] —— 框架级 SmartRouter，不把 rou3 当默认实现
- [[elysia]] —— 同样把路由编译进热路径，但是框架而不是独立 trie

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[radix3]] —— radix3 — 无方法维的 Radix Tree 路由器
