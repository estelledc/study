# Cookie-jar source review (writer HE)

> 用途：记录 tough-cookie、universal-cookie 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HE
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## tough-cookie

- canonical source：`https://github.com/salesforce/tough-cookie`
- revision：`40708dd809cfb1dd658270dc85597bf9f68a6ccc`
- package：`tough-cookie@6.0.2`（源码 tag `v6.0.2`）
- inspected：
  - `package.json`
  - `README.md`
  - `lib/version.ts`
  - `lib/cookie/index.ts`
  - `lib/cookie/cookie.ts`（`Cookie.parse`、属性循环、`TTL` / `expiryTime`、`toString`）
  - `lib/cookie/cookieJar.ts`（构造默认值、`setCookie` RFC 5.3、`getCookies` 过滤、前缀与 SameSite）
  - `lib/cookie/domainMatch.ts`
  - `lib/pathMatch.ts`
  - `lib/cookie/defaultPath.ts`
  - `lib/cookie/secureContext.ts`
  - `lib/cookie/cookieCompare.ts`
  - `lib/cookie/constants.ts`（`PrefixSecurityEnum`）
  - `lib/memstore.ts`
  - `lib/getPublicSuffix.ts`
- observed：
  - tag `v6.0.2`、`lib/version.ts` 与 npm `gitHead` 同指 `40708dd809cfb1dd658270dc85597bf9f68a6ccc`；
  - `exports` 分 ESM / CJS；`engines.node >= 16`；运行时依赖只有 `tldts`；
  - 默认 `MemoryCookieStore`，`synchronous = true`，索引为 domain → path → key；
  - `setCookie` 按 RFC6265 S5.3：解析、拒绝公共后缀、`domainMatch`、无 `Domain` 则 `hostOnly`、默认 path、HttpOnly / Secure / 前缀 / SameSite；
  - `rejectPublicSuffixes` 默认 true，`prefixSecurity` 默认 `silent`，`allowSecureOnLocal` 默认 true，`sameSiteContext` 默认不强制；
  - `getCookies` 再做 host / path / secure / httpOnly / SameSite level / 过期过滤；排序走更长 path、更早 `creation`、更小 `creationIndex`；
  - `Max-Age` 优先于 `Expires`；`Cookie` 请求头必须先按 `;` 拆开再 `Cookie.parse`。
- provenance：tag / package / npm `gitHead` 一致，无发布树分叉。

## universal-cookie

- canonical source：`https://github.com/ItsBenCodes/cookies`
- revision：`54f246ee61c487792331d42f40f2a34960ba2a5b`
- package：`universal-cookie@8.1.2`（monorepo tag `v8.1.2`）
- inspected：
  - 根 `package.json`、`README.md`
  - `packages/universal-cookie/package.json`
  - `packages/universal-cookie/README.md`
  - `packages/universal-cookie/src/index.ts`
  - `packages/universal-cookie/src/Cookies.ts`
  - `packages/universal-cookie/src/utils.ts`
  - `packages/universal-cookie/src/types.ts`
  - `packages/universal-cookie-express/src/index.ts`
- observed：
  - tag `v8.1.2^{}`、package version 与 npm `gitHead` 同指此提交；
  - 仓库已从 `reactivestack/cookies` 转到 `ItsBenCodes/cookies`；本页绑定当前 owner；
  - 包依赖 `cookie@^1.1.1` 做 parse / serialize，自身不做 RFC jar 匹配；
  - `Cookies` 维护内存 map；浏览器且 `document.cookie` 为字符串时同步写回；
  - `get` / `getAll` 默认先 `update()`，再尝试 `JSON.parse`；识别 Express 的 `j:` 前缀；
  - `set` 对非字符串 `JSON.stringify`；`remove` 写 `maxAge: 0` 且 `expires = new Date(1970, 1, 1, 0, 0, 1)`；
  - 变更监听优先 `window.cookieStore`，否则 300ms 轮询 `document.cookie`；
  - 同仓还有 `react-cookie`、`universal-cookie-express`、`universal-cookie-koa`；Express 中间件把 `maxAge` 从秒换成毫秒。
- provenance：tag / package / npm `gitHead` 一致。README 的 unpkg 示例仍写 `@7`，本轮未核验 UMD 包。
