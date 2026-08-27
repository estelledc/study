# Cookie-helper source review (writer JF)

> 用途：记录 cookies-next、nookies 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：JF
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、Next.js、浏览器 cookie、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## cookies-next

- canonical source：`https://github.com/andreizanik/cookies-next`
- revision：`c390d3599e29494753a7457f0414595872fe18f1`
- package：`cookies-next@6.1.1`
- inspected：
  - `package.json`
  - `README.md`
  - `LICENSE`
  - `src/index.ts`
  - `src/common/types.ts`
  - `src/common/utils.ts`
  - `src/server/index.ts`
  - `src/client/cookie-functions.ts`
  - `src/client/hooks.ts`
  - `src/client/context.tsx`
  - `src/client/index.ts`
  - `src/server/server.test.ts`
  - `src/client/client.test.ts`
- observed：
  - annotated tag `v6.1.1` peels to this commit; npm `cookies-next@6.1.1` `gitHead` agrees;
  - `exports` expose `.` / `./client` / `./server`; runtime dependency is `cookie@^1.0.1`; peer is `next>=15` and `react>=16.8`;
  - root helpers dispatch on option shape via `isClientSide`（无 `req` / `res` / `cookies` 函数即当客户端），不是看 `typeof window`；
  - server helpers duck-type Next cookie store（`getAll` + `set`）或 `cookies()`；普通 HTTP 路径写 cookie 要求同时有 `req` 与 `res`；
  - `stringify` 对非字符串做 `JSON.stringify`，`getCookie` 只做 percent-decode，不 `JSON.parse`；
  - `deleteCookie` 是 `setCookie(key, '', { maxAge: -1 })`；默认 `path: '/'`；
  - 静态 hooks 在 mount 前返回空函数；reactive hooks 必须包 `CookiesNextProvider`，轮询默认关闭。
- provenance split：无。tag 剥皮提交与 npm `gitHead` 一致。

## nookies

- canonical source：`https://github.com/maticzav/nookies`
- revision：`f3b87f876ea342fb287ccbb11f44631db4f91462`
- package：`nookies@2.5.2`（源码仓 `packages/nookies/package.json` 仍写 `0.0.0-semantic-release`）
- inspected：
  - `package.json`
  - `packages/nookies/package.json`
  - `README.md`
  - `packages/nookies/src/index.ts`
  - `packages/nookies/src/utils.ts`
  - `examples/javascript/pages/create.js`
  - `examples/typescript/pages/create.tsx`
- observed：
  - lightweight tag `v2.5.2` 直接指向此提交；npm `nookies@2.5.2` 无 `gitHead`；
  - 发布物依赖 `cookie@^0.4.1` 与 `set-cookie-parser@^2.4.6`；源码仓无独立 LICENSE 文件，`package.json` 声明 MIT；
  - 公开 API 是 `parseCookies` / `setCookie` / `destroyCookie`，默认导出 `{ get, set, destroy }`；
  - `parseCookies` 只读 `ctx.req.headers.cookie` 或浏览器 `document.cookie`，不读 `req.cookies`，也不回看本次 `Set-Cookie`；
  - 服务端 `setCookie` 需要 `res.getHeader` / `res.setHeader`；`res.finished` 时警告并放弃写入；用 `set-cookie-parser` 去重后再写回数组；
  - `createCookie` 比较用 sameSite：`true` → `strict`，`undefined` / `false` → `lax`；
  - 浏览器设置 `httpOnly` 会抛错；`destroyCookie` 转发为 `maxAge: -1` 的空值 `setCookie`；
  - 类型与 README 面向 Pages Router / Express，本 revision 无 App Router / `next/headers` 入口。
- provenance split：npm 发布物未带 `gitHead`；本页绑定可达源码 tag，不猜测 tarball 对应的另一棵发布树。
