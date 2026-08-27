# Cookie-helper source review (writer IM)

> 用途：记录 js-cookie、cookies 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IM
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark，未发送 HTTP 请求
- worktrees：本机 `research-worktrees/`，不进入 Git
- not selected：`tough-cookie` / `universal-cookie`（开放 PR #272）、`cookie-es` / `set-cookie-parser`（开放 PR #258）

## js-cookie

- canonical source：`https://github.com/js-cookie/js-cookie`
- revision：`d7a10966e3f2cbcbfa96e34e7544d23aab9e3372`
- package：`js-cookie@3.0.8`（源码 tag `v3.0.8`）
- inspected：
  - `package.json`
  - `README.md`
  - `SERVER_SIDE.md`
  - `index.js`
  - `src/api.mjs`
  - `src/converter.mjs`
  - `src/assign.mjs`
- observed：
  - source tag `v3.0.8^{}` is `d7a10966e3f2cbcbfa96e34e7544d23aab9e3372`;
  - npm `js-cookie@3.0.8` reports `gitHead=248e685e20c7aa9553453f0084f14a62173462d2`, the parent of the tag commit;
  - the tag commit only bumps `package.json` / `package-lock.json`; `src/` is identical;
  - git tree at this tag has no `dist/`; npm `exports` point at `dist/js.cookie.mjs` and `dist/js.cookie.js`;
  - `set` / `get` no-op when `document` is undefined;
  - default attributes are `{ path: '/' }`; `expires` numbers are days via `* 864e5`;
  - `remove` is `set` with `expires: -1`;
  - `withAttributes` / `withConverter` return new `init(...)` instances; attributes and converter are frozen;
  - `assign` skips `__proto__`; converter write re-allows a subset of RFC cookie characters.
- provenance split：this review binds the reachable source tag peeled commit, not the npm `gitHead`.

## cookies

- canonical source：`https://github.com/pillarjs/cookies`
- revision：`b58c7207bb80a900f8db527bc847b4e0a8d49009`
- package：`cookies@0.9.1`
- inspected：
  - `package.json`
  - `README.md`
  - `HISTORY.md`
  - `index.js`
  - `test/cookie.js`
- observed：
  - tag `0.9.1` and npm `gitHead` identify the same commit;
  - published files are `index.js` plus docs; dependencies are `depd@~2.0.0` and `keygrip@~1.1.0`;
  - `engines.node` is `>= 0.8`;
  - constructor stores `request` / `response` and optional `keys` / `secure`;
  - `get` compiles a cached name regexp and optionally checks `name.sig` via `keys.index`;
  - index `0` returns the value, `>0` refreshes the signature, `<0` expires `.sig` and returns nothing;
  - `set` appends `Set-Cookie`; empty value sets `expires` to `new Date(0)`;
  - `maxAge` is milliseconds; defaults include `httpOnly=true` and `path=/`;
  - `sameSite === true` serializes as `strict`;
  - explicit `secure: true` on an unencrypted request throws;
  - `Cookies.express` / `Cookies.connect` attach one jar to `req.cookies` and `res.cookies`.
