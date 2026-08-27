# HTTP router source review HC

> 用途：记录 itty-router、find-my-way 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer HC
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test / bun test / borp / tstyche，未起 HTTP server，未测 bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/itty-router` 与 `research-worktrees/find-my-way`，不进入 Git
- avoided：未占用已开 PR 的 `h3` / `listhen` / `radix3` / `rou3`，也未改 `express` 既有页

## itty-router

- canonical source：`https://github.com/kwhitley/itty-router`
- revision：`ec4264f429c04e5f2a40a5b5466b9414254601d1`
- git tag：annotated `v5.0.24` → 上述提交
- package：仓内 `package.json` 为 `5.0.24`
- npm mapping：`itty-router@5.0.24` 的 `gitHead` 是父提交 `dbf8bffa255cb44ab8ee782fa55672501c1050e4`（仓内当时仍写 `5.0.23`）；tag 相对它只改 `package.json` 版本号，`src/` 无 diff
- inspected：
  - `package.json`
  - `src/IttyRouter.ts`
  - `src/Router.ts`
  - `src/AutoRouter.ts`
  - `src/withParams.ts`
  - `src/cors.ts`
  - `src/error.ts`
  - `src/createResponse.ts`
  - `src/json.ts`
  - `src/StatusError.ts`
  - `src/index.ts`
  - `src/Router.spec.ts`
- observed：
  - `IttyRouter` / `Router` 用 `Proxy` 的 `get` 把任意 method 名大写后推进 `routes`；匹配是对 `routes` 数组做线性扫描，不是 radix tree；
  - 路径编译顺序：去重斜杠 → `:name+` 贪婪 → `:name` 命名（字符类用替换串里的 `$1` 前缀）→ 转义 `.` → 可选通配 `*` → 末尾 `/*$`；
  - `fetch` 先用 `URLSearchParams` 填 `request.query`（重复 key 收成数组），再按 method/`ALL` + `pathname.match(regex)` 取第一条命中；
  - handler 返回非 `null`/`undefined` 即停；`IttyRouter` 没有 before/catch/finally，未命中时 `fetch` 落到 `undefined`；
  - `Router` 增加 `before`（首个非空返回就跳出）、`catch`、`finally`（`??` 保留原响应）；无 `catch` 时错误原样抛出；
  - `AutoRouter` 在 `before` 前置 `withParams`，`catch` 固定为 `error`，`finally` 先补 `missing`（默认 `error(404)`）再 `format`（默认 `json`）；
  - `cors().preflight` 对 `OPTIONS` 直接 204 且不调用后续 handler；`corsify` 在已有 `access-control-allow-origin` 或 status 101 时原样返回。

## find-my-way

- canonical source：`https://github.com/delvedor/find-my-way`
- revision：`31aa3ae9c26a898d3f478c6bbfcd079ab85d1b99`
- git tag：`v9.9.0`
- package：`find-my-way@9.9.0`
- npm gitHead：与 revision 一致
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `lib/node.js`
  - `lib/handler-storage.js`
  - `lib/constrainer.js`
  - `lib/http-methods.js`
  - `lib/url-sanitizer.js`
  - `README.md`（options / path formats；未采信 benchmark 数字）
- observed：
  - 每个 HTTP method 一棵 radix tree；`GET` 另缓存 `_treeGET`。`HEAD` 不会自动改派成 `GET`；
  - `on()` 校验 path 以 `/` 或 `*` 开头；`:param?` 必须是最后一段，并拆成两条路由注册；`*` 必须是最后一个字符；
  - 同 method + 规范化 pattern + constraints 再注册会抛错；`all()` 把 `lib/http-methods.js` 整表（Node 22.9.0 快照，含 `HEAD`）各注册一次；
  - `lookup` 先 `deriveConstraints` 再 `find`；未命中且无 `defaultRoute` 时写 `res.statusCode = 404` 并 `end()`；
  - `find` 先按 `/` 判断绝对 URL，再 `safeDecodeURI`；`maxParamLength` 默认 100；
  - `getNextNode` 优先静态子节点，再 parametric（regex / 带 staticSuffix 的排前面），wildcard 进 brother stack 回溯；
  - `engines.node` 为 `>=20`；运行时依赖 `fast-querystring`、`safe-regex2`、`fast-deep-equal`。
