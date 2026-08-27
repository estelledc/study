# HTTP listen source review (writer GE)

> 用途：记录 h3、listhen 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GE
- evidence：GitHub tag metadata、npm package metadata、固定提交静态源码与类型阅读
- not executed：未安装两仓依赖，未运行上游 test、HTTP listen、tunnel、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- fallback unused：canonical `h3js/h3@1.15.11` 与 `unjs/listhen@1.10.1` 的 tag、package 与提交一致，且 listhen 依赖 `h3@^1.15.11`，未改用其他 HTTP-listen 配对

## h3

- canonical source：`https://github.com/h3js/h3`
- revision：`7b9f41fda6038d26a367c2a26a07ed83ee1dbaac`
- package：`h3@1.15.11`
- dist-tag：`1x=1.15.11`；npm `latest` 当时是 `2.0.1-rc.29`（另一条重写线，本轮不绑定）
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/app.ts`
  - `src/router.ts`
  - `src/error.ts`
  - `src/event/event.ts`
  - `src/event/utils.ts`
  - `src/adapters/node.ts`
  - `src/adapters/web.ts`
  - `src/adapters/plain.ts`
  - `src/utils/request.ts`
  - `src/utils/body.ts`
  - `src/utils/response.ts`
- observed：
  - `createApp()` 维护 layer stack；`app.handler` 按前缀与可选 `match` 依次调用，返回值非 `undefined` 或 `event.handled` 时停止，否则 404；
  - 字符串按 HTML MIME 发出，对象/布尔/数字走 JSON，`null` 走 204，`Error` 再包成 `H3Error`；
  - `createRouter()` 默认非抢占：未匹配 method/path 返回 `undefined`，让后续 layer 继续；`preemptive` 才抛 404/405；
  - 路由表用 `radix3`；先查当前 method 再 `all`，再 `matchAll().reverse()` 找被同 path 阴影挡住的 method；
  - `H3Event` 包装 Node `req`/`res`；`toNodeListener` 是稳定 Node 入口；`toWebHandler` 标 experimental，仍经 `node-mock-http` shim；
  - `readRawBody` 只允许 PATCH/POST/PUT/DELETE；`readBody` 对 JSON 用 `destr`，也对 `application/x-www-form-urlencoded` 解析；
  - 入站 path 只解码路径段、保留 query，并把 `%25` 保护成不二次解码。
- provenance：
  - annotated tag `v1.15.11` 剥开后、npm `gitHead` 与 `package.json` 版本均指向 `7b9f41fda6038d26a367c2a26a07ed83ee1dbaac`；
  - 仓库从 `unjs/h3` 迁到 `h3js/h3`，两边同 tag 同 SHA；
  - 本轮明确不绑定 `latest` 的 2.x RC。

## listhen

- canonical source：`https://github.com/unjs/listhen`
- revision：`2466b698997f6d5006c22f36ab54379df277cf5f`
- package：`listhen@1.10.1`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/listen.ts`
  - `src/types.ts`
  - `src/cli.ts`
  - `src/server/index.ts`
  - `src/server/dev.ts`
  - `src/server/watcher.ts`
  - `src/server/_resolver.ts`
  - `src/_utils.ts`
  - `src/_cert.ts`
- observed：
  - `listen()` 接收 Node `RequestListener`，不是 h3 `App`；配对方式是 `listen(toNodeListener(app))`；
  - 默认端口 `PORT || 3000`；非生产用 `get-port-please` 在 `[3000, 3100]` 找空闲端口，生产 `random: false`；
  - `public` 默认：localhost → false，anyhost → true，`--host` → true，否则跟 `isProd`；Docker/WSL 默认 hostname 为空串（全接口）；
  - `https: true` 且未给 cert/key/pfx 时用 node-forge 自签，默认 `validityDays=1`、domains 为 localhost/127.0.0.1/::1；
  - `autoClose` 默认挂 `exit`/`SIGINT`/`SIGTERM`/`SIGHUP`；关闭走 `http-shutdown`；
  - CLI/`createDevServer` 动态 `import` 调用方或自身的 `h3`，用 jiti 加载入口，导出解析顺序为 `handler || handle || app || default || module`，若存在 `.handler` 再剥一层（h3 App），最后 `fromNodeMiddleware`；
  - watcher 先试 `@parcel/watcher`，失败再 `@parcel/watcher-wasm`；只监视 `.js/.mjs/.cjs/.ts/.mts/.cts`。
- provenance：
  - annotated tag `v1.10.1` 剥开后与 `package.json` 版本同指 `2466b698997f6d5006c22f36ab54379df277cf5f`；
  - npm 未发布 `gitHead`；身份靠 tag + package version + commit SHA；
  - 运行时依赖 `h3@^1.15.11`，与本轮 h3 绑定一致。
