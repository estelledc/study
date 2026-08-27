---
title: Navaid — 用 regexparam 和 history 补丁做成的无框架浏览器路由器
description: 介绍 navaid 1.2.0 如何用 format/on/run/listen 四步，在无框架页面里做路径匹配和 history 同步。
来源: https://github.com/lukeed/navaid
日期: 2026-08-27
分类: 路由库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lukeed/navaid
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9989c05ece026f2786f3582bb35ea4dc86afc574
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.0
---

## 是什么

Navaid 是一个无框架的浏览器端路由器。日常类比：它不像 [[wouter]] 那样把指南针塞进 React 组件，而像给浏览器装一块公共路牌——谁点了站内链接、谁改了 `history`，它都听见，然后按登记顺序叫第一个对得上的处理函数。

你写：

```js
import navaid from "navaid";

const router = navaid("/app", (uri) => {
  console.log("no match", uri);
});

router
  .on("/", () => showHome())
  .on("/users/:id", (params) => showUser(params.id))
  .listen();
```

`navaid(base, on404)` 返回同一对象上的 `format` / `on` / `run` / `route` / `listen`。固定 1.2.0 的 `src/index.js` 大约九十行；模式串交给依赖 `regexparam@^1.0.2`，不是 `path-to-regexp`。

## 为什么重要

不理解 navaid 的“先格式化、再线性匹配、再决定听不听 history”，就解释不了：

- 为什么 `on404` 对 `/other-app/x` 根本不会跑
- 为什么两个实例能挂不同 `base`，却共用同一套被补丁过的 `history`
- 为什么只调用 `run("/users/1")` 不会改地址栏
- 为什么可选参数没写时拿到的是 `null` 而不是 `undefined`

它是客户端路由里偏“事件总线”的一端；[[wouter]] 是偏“渲染期 hooks”的一端。

## 核心要点

固定 1.2.0 的主链可以拆成五步：

1. **构造时先编译 `base` 正则**：`base` 被收成 `'/' + trim(slashes)`。根路径用 `/^\/+/`，否则用 `^\\base(?=/|$)\\/?`（忽略大小写）。`format(uri)` 不匹配 `base` 时返回 `false`，匹配则剥掉前缀并保证以 `/` 开头。

2. **`on(pattern, fn)` 只登记，不执行**：`convert(pat)` 得到 `{ pattern, keys }`，再把 `fn` 挂到同一对象上推进 `routes`。支持静态、`:id`、可选 `:id?` 和 `*` 通配（通配键名由 regexparam 填成 `wild`）。

3. **`run(uri)` 线性首个命中就返回**：`uri` 默认 `location.pathname`，先 `format`，再去掉 `?` / `#`。命中后用 `arr[++i] || null` 填 params，调用 `fn`，然后 `return $`。源码里有 `// todo loop?`：外层循环变量 `i` 被内层改写，所以设计上也不准备继续匹配下一条。

4. **`route(uri, replace)` 只改 history**：若 `uri` 以 `/` 开头且不属于 `base`，会先补上 `base`。`uri === curr` 或 `replace === true` 时走 `replaceState`，否则 `pushState`。它不直接调处理函数。

5. **`listen()` 才把世界接上**：`wrap('push')` / `wrap('replace')` 在 `history.push` / `history.replace` 还是假值时，把对应 `*State` 包一层并 `dispatchEvent`。同时监听 `popstate` / `pushstate` / `replacestate` / `click`。点击代理要求同 host、无 `target`、非修饰键；`href` 以 `#` 开头的不拦截。`unlisten` 只在 `listen()` 之后才挂上。

## 实践示例

### 案例 1：`run` 不改 URL，`route` 不跑 handler

```js
const r = navaid();
r.on("/users/:id", (params) => render(params));

r.run("/users/ada");   // 调用 handler，地址栏不动
r.route("/users/ada"); // 改 history；若未 listen，不会自动 run
```

要把两次合成一次用户可感知的跳转，需要先 `listen()`，让补丁后的 `pushState` 再触发 `run()`。

### 案例 2：`base` 把 404 关在自己的院子里

```js
const app = navaid("/app", (uri) => show404(uri));
app.on("/", home).listen();
```

`format('/other/x')` 得到 `false`，`run` 整段跳过，`on404` 不会被叫。这让多个 Navaid 可以同时挂在不同前缀上；它们**不会**互相处理对方的 404。

### 案例 3：可选段缺失时是 `null`

```js
navaid()
  .on("/users/:id/books/:title?", console.log)
  .run("/users/ada/books");
```

regexparam 仍会交出 `title` 这个 key；`arr[++i] || null` 把空捕获写成 `null`。通配 `/files/*` 的剩余段进 `params.wild`。

## 踩过的坑

1. **以为 `listen()` 只订 `popstate`**：没有补丁的 `pushState` 本来不冒泡。navaid 用 `history.push = 'push'` 当“已包装”标记，再改写 `history.pushState`。
2. **第二个 `navaid().listen()` 以为会装一套新 history**：`wrap` 见到 `history.push` 已有值就直接返回。全局补丁是一份，路由表是每实例一份。
3. **把 `on404` 理解成“任意未处理 URL”**：只有通过 `format` 的 URI 才会走到 404。
4. **期望一条 URL 触发多个 `on`**：首个 `exec` 成功就 `return`。
5. **把 README 的 865 bytes 当成本轮测量**：那是文档数字。本轮未跑 `builder.js`，未测 gzip。

## 适用 vs 不适用场景

**适用**：

- 无框架或多框架页面，只要路径 → 函数
- 需要按 `base` 挂多个互不抢 404 的实例
- 能接受线性正则匹配和全局 `history` 补丁

**不适用**：

- 要在 React 树里按组件匹配、嵌套 `base`——看 [[wouter]]
- 要编译期 path 类型和 loader——看 [[tanstack-router]]
- 服务端 HTTP 路由或文件系统路由——看 [[hono]] / [[next-js]]
- 不能接受依赖 `regexparam@1` 与“只匹配第一条”

## 固定版本边界

- 本文绑定 `lukeed/navaid@9989c05ece026f2786f3582bb35ea4dc86afc574`。GitHub annotated tag `v1.2.0` 剥皮后、`package.json` 的 `1.2.0` 与 npm `navaid@1.2.0` 的 `gitHead` 都指向该提交。
- `engines.node` 为 `>= 6`。发布物走 `builder.js` 产出的 `dist/`；源码入口是 `src/index.js`。
- 运行时依赖只有 `regexparam@^1.0.2`。
- 本文未安装依赖、运行 `uvu` 测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **`format` 是总闸门**——进不了 `base` 的 URL，既不匹配也不 404。
2. **`run` 和 `route` 故意不同步**——一个执行表，一个改 history；`listen` 才把两边接起来。
3. **history 补丁是进程级单例**——用 `history.push` 当旗标，避免重复包装。
4. **线性表加“todo loop?”是合同，不是漏写的功能**——第一条命中即停。

## 应用型自测

1. `navaid('/app', on404).run('/other/x')` 会调用 `on404` 吗？
2. 只执行 `route('/users/1')`、从未 `listen()`，对应的 `on` 处理函数会跑吗？
3. `wrap('push')` 用 `history` 的哪个属性判断“已经补丁过”？

检查点：

1. 不会。`format` 返回 `false`，`run` 直接结束。
2. 不会。`route` 只调用 `history.pushState` / `replaceState`。
3. `history.push`。它先被设成字符串 `'push'`，再包装 `pushState`。

## 延伸阅读

- 文档：[github.com/lukeed/navaid](https://github.com/lukeed/navaid)
- 固定源码：[lukeed/navaid](https://github.com/lukeed/navaid) —— 本文绑定提交 `9989c05ece026f2786f3582bb35ea4dc86afc574`
- [[wouter]] —— 同一 regexparam 家族，但是 React hooks
- [[hono]] —— 服务端 `fetch` 路由器，不是浏览器 history

## 关联

- [[wouter]] —— hooks / Switch / nest 对照
- [[tanstack-router]] —— 类型化路由树对照
- [[hono]] —— 服务端路由对照
- [[react]] —— navaid 不依赖 React，可在任意 DOM 页使用
- [[next-js]] —— 框架文件系统路由，不是 90 行工厂

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
