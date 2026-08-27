---
title: page.js — Express 风格的微型客户端路由器
description: 介绍 page.js 1.11.6 如何用 path-to-regexp、Context 与 click/popstate 把路径登记成中间件链。
来源: https://github.com/visionmedia/page.js
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/visionmedia/page.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4f9991658f9b9e3de9b6059bade93693af24d6bd
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.11.6
---

## 是什么

page.js 是一个 Express 风格的微型浏览器路由器。日常类比：把「路径 → 处理函数」写成门口接待名单；点站内链接时先拦住默认跳转，按名单把客人领到对应房间，而不是整栋楼重新进门。

你写：

```js
var page = require('page');

page('/', index);
page('/user/:id', loadUser, showUser);
page('*', notfound);
page();
```

`page()` 无参等于 `start()`：挂上 click / popstate，再按当前地址做第一次 `replace`。固定 1.11.6 的 `package.json` 以 `index.js` 为 Node 入口、`page.js` 为 browser 包、`page.mjs` 为 ESM，并依赖 `path-to-regexp@~1.2.1`。

## 为什么重要

不理解 page.js 的重载、中间件链和「未处理就整页跳转」，就解释不了下面几件事：

- 为什么同一个 `page` 函数既能登记路由，又能 `show`、重定向或启动
- 为什么 `/user/:id` 能拿到 `ctx.params.id`，而 `*` 能接住其余路径
- 为什么漏写 `page('*', notfound)` 时，未知地址会离开 SPA
- 为什么 `start({ dispatch: false })` 之后 `stop()` 好像没解绑

## 核心要点

固定 1.11.6 的主链可以拆成五步：

1. **一个函数多种用法**：`page(fn)` 当成 `*` 中间件；`page(path, fn, ...)` 登记；两个字符串走 `redirect`；一个字符串走 `show`；对象或空参走 `start`。

2. **Route 交给 path-to-regexp**：`*` 先改写成 `(.*)`，再 `pathtoRegexp(path, keys, { strict })`。匹配成功才调用 handler，否则 `next()`。

3. **Context 拆路径**：`canonicalPath` 保留完整地址；`path` 去掉 base / `#!`；`querystring`、`pathname`、`hash`、`params` 分开放。`show` 默认 `pushState`，`replace` 走 `replaceState`。

4. **dispatch 先出后进**：若有上一页 `prev`，先跑 `exits`，再跑 `callbacks`。进入过程中若 `ctx.path !== page.current`，当前进入链立刻停。

5. **点击拦截有白名单**：同左键、同 origin、无 `download` / `rel=external` / `target`、不是同路径纯 hash，才 `preventDefault` 并 `show(orig)`。

## 实践示例

### 案例 1：登记、中间件和兜底是同一条 callbacks 队列

```js
page('/user/:id', function load(ctx, next) {
  ctx.state.user = { id: ctx.params.id };
  next();
}, function show(ctx) {
  render(ctx.state.user);
});
page('*', function notfound() {
  render('404');
});
page();
```

`load` 必须调用 `next()`，`show` 才会跑。没有 `*` 时，`unhandled` 会 `stop()` 并把 `location.href` 设成 `canonicalPath`。

### 案例 2：`show` 推历史，`replace` 覆盖当前条

```js
page.show('/user/1');
page.replace('/user/1?tab=bio');
page.back('/users');
```

`Context.pushState` 会 `page.len++` 再 `history.pushState`。`back` 只在 `len > 0` 时调用 `history.back()`；否则延迟 `show` 到给定回退路径或 base。

### 案例 3：hashbang 与 History 读的不是同一段 URL

```js
page.start({ hashbang: true });
```

`start` 在 `#!` 存在时取 `hash.substr(2) + search`；普通 History 模式取 `pathname + search + hash`。`file:` 协议下若没设 base，`_getBase` 会用当前 `pathname`。

## 踩过的坑

1. **把未匹配当成静默 404**：默认 `unhandled` 会整页跳转。要留在 SPA 里必须自己登记 `page('*', ...)`。

2. **以为 `start({ dispatch: false })` 只是跳过首屏**：它在 `configure` 之后直接 return，不会把 `_running` 设为 true，随后 `stop()` 是空操作，监听仍在。

3. **把 npm 包名 `page` 当成笔记 slug**：本站 `logseq` 已用双括号 page 表示笔记页概念，本页 slug 是 `pagejs`。

4. **把 `path-to-regexp` 当成 page.js 自己的匹配器**：1.11.6 运行时依赖 `path-to-regexp@~1.2.1`，`:id` 与可选段语义以该版本为准。

5. **把 README 的体积或兼容矩阵当成本轮测量**：本轮未安装依赖、未跑测试、未测 bundle。

## 适用 vs 不适用场景

**适用**：

- 想用接近 [[express]] 的 `path + next` 写法做小型 SPA
- 需要自动拦截站内 `<a>`，并用 History 或 `#!` 更新地址
- 能接受把路径匹配外包给 `path-to-regexp@~1.2.1`

**不适用**：

- 要类型化路由树、search schema 或文件路由——看 [[tanstack-router]]
- 要实例化路由器、命名路由、before/leave 钩子和 `data-navigo` 链接——看 [[navigo]]
- 不能接受 1.11.6 已是源码仓最新 tag、且 `origin/master` 停在同一提交

## 固定版本边界

- 本文绑定 `visionmedia/page.js@4f9991658f9b9e3de9b6059bade93693af24d6bd`，tag `v1.11.6`，`package.json` / npm `page@1.11.6` 的 `gitHead` 与该提交一致。
- `sameOrigin` 为 IE11 把默认 80/443 端口比成空字符串留了特殊分支。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **`page()` 是调度器，不是单一 API**——登记、导航、重定向和启动挤在同一个函数里。
2. **进入链可被当前路径变化打断**——`dispatch` 以 `page.current` 为准，不是把整条 callbacks 跑完。
3. **未处理等于离开 SPA**——这是默认策略，不是漏写文档。
4. **启动选项会影响 `stop()` 能不能卸监听**——`_running` 只在真正 dispatch 时点亮。

## 应用型自测

1. `page('/a', '/b')` 会立刻 `show('/b')`，还是登记一条重定向路由？
2. 没有任何路由匹配时，page.js 会不会继续留在当前文档？
3. `page.start({ dispatch: false })` 之后调用 `page.stop()`，click 监听会被摘掉吗？

检查点：

1. 登记。`page(from, to)` 在两个参数都是字符串时走 `redirect`，用 `replace(to)` 作为该路径的 handler。
2. 不会。`unhandled` 会 `stop()` 并设置 `location.href`。
3. 不会。`dispatch: false` 不把 `_running` 设为 true，`stop()` 直接 return。

## 延伸阅读

- 文档：[visionmedia/page.js README](https://github.com/visionmedia/page.js)
- 固定源码：[visionmedia/page.js](https://github.com/visionmedia/page.js) —— 本文绑定提交 `4f9991658f9b9e3de9b6059bade93693af24d6bd`
- 对照：[[navigo]] —— 自写匹配器 + 钩子管道，不依赖 path-to-regexp
- 对照：[[tanstack-router]] —— 类型化路由树，而不是运行时字符串中间件

## 关联

- [[navigo]] —— 同主题的实例化路由器，钩子和 `data-navigo` 链接
- [[tanstack-router]] —— 编译期路径合同
- [[express]] —— page.js 中间件签名的服务端对照
- [[koa]] —— 另一条 `next` 中间件链，但是服务端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
