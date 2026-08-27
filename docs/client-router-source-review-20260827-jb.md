# Client-router source review (writer JB)

> 用途：记录 page.js、Navigo 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：JB
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- slug note：仓库已有 `logseq.md` 使用 `[[page]]` 指笔记页概念，本轮 page.js 笔记使用 slug `pagejs`，避免劫持既有链接

## page.js

- canonical source：`https://github.com/visionmedia/page.js`
- revision：`4f9991658f9b9e3de9b6059bade93693af24d6bd`
- package：`page@1.11.6`（源码 tag `v1.11.6`）
- inspected：
  - `package.json`
  - `Readme.md`
  - `index.js`（`Page`、`createPage`、`page` 重载、`Context`、`Route`、`clickHandler`、`dispatch`、`unhandled`、`start`/`stop`）
  - `page.js` / `page.mjs`（browser / ESM 构建入口）
- observed：
  - tag `v1.11.6^{}`、`package.json` version 与 npm `gitHead` 指向同一提交；`origin/master` 也停在此提交；
  - `main=index.js`，`browser=page.js`，`module=page.mjs`；运行时依赖 `path-to-regexp@~1.2.1`；
  - `page()` 按参数分流：函数当 `*` 中间件、`path+fn` 注册、两字符串重定向、单字符串 `show`、对象/空参 `start`；
  - `Route` 把 `*` 写成 `(.*)`，再用 `path-to-regexp` 生成正则；匹配成功才调用 handler，否则 `next()`；
  - `dispatch` 先跑 `exits`（上一页 `prev`），再跑 `callbacks`；若 `ctx.path !== page.current` 则中止进入；
  - 未处理路由默认 `stop()` 并把 `location.href` 设成 `canonicalPath`（整页跳转）；
  - `start({ dispatch: false })` 只 `configure` 监听，不把 `_running` 设为 true，因此后续 `stop()` 是空操作；
  - `clickHandler` 忽略非左键、修饰键、`download`、`rel=external`、带 `target`、跨源和同路径纯 hash。
- provenance：npm `page@1.11.6` 的 `gitHead` 与 tag `v1.11.6` 剥皮提交一致。

## Navigo

- canonical source：`https://github.com/krasimir/navigo`
- revision：`8784291784b898f486f565e7d3d5cf44297d250e`
- package：`navigo@8.11.1`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/Q.ts`
  - `src/utils.ts`
  - `src/constants.ts`
  - `src/lifecycles.ts`
  - `src/middlewares/matchPathToRegisteredRoutes.ts`
  - `src/middlewares/processMatches.ts`
  - `src/middlewares/updateBrowserURL.ts`
  - `src/middlewares/checkForBeforeHook.ts`
  - `src/middlewares/checkForLeaveHook.ts`
  - `src/middlewares/checkForAlreadyHook.ts`
  - `src/middlewares/checkForForceOp.ts`
  - `src/middlewares/callHandler.ts`
  - `src/middlewares/setLocationPath.ts`
  - `src/middlewares/waitingList.ts`
- observed：
  - 仓库没有 `8.11.1` / `v8.11.1` tag；最新 git tag 是 `8.1.0`。本轮绑定 npm `navigo@8.11.1` 的可达 `gitHead`，该提交的 `package.json` 自报 `8.11.1`，且落在 `origin/master`；
  - `master` 上此提交之后只剩文档/README 合并，`package.json` 仍为 `8.11.1`；
  - 默认 `strategy: "ONE"`、`hash: false`、`linksSelector: "[data-navigo]"`；构造时自动 `listen()` + `updatePageLinks()`；
  - 自写路径匹配：`:name` / `*name` → `([^/]+)`，`*` → `?(?:.*)`，`/?` → `/?([^/]+|)`；
  - `resolve` / `navigate` 用 `Q` 串中间件；`__dirty` + `__waiting` 把并发调用排成队列；
  - `navigate` 默认 `history.pushState`；hash 模式写 `#/path`。`#283` 在此提交修成：仅非 hash 模式才用清空再写回 `location.hash` 的方式滚到锚点，避免 hash 路由被多记一条 history；
  - `before` / `leave` 回调传入 `done`；`done(false)` 会 `__markAsClean` 并中止后续；
  - `already` 在同 route + 同 url + 同 queryString 时触发，并 `done(false)` 跳过 handler；
  - `force: true` 只 `_setCurrent` 后立刻结束 pipeline，不匹配、不改 URL。
- provenance：绑定 npm `gitHead`，并披露缺失同名 git tag。
