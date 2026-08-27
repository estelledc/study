# Cookie parse pair source review (writer GL)

> 用途：记录 `cookie-es` 与 `set-cookie-parser` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gl` 标记 2026-08-27 平行 writer GL，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL GL
- evidence：GitHub metadata、npm latest 对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行 vitest / mocha / tsd，未发 HTTP 请求，未测 bundle / 性能
- worktrees：本机 `research-worktrees/cookie-es` 与 `research-worktrees/set-cookie-parser`（gitignored），不进入 Git
- slugs：`cookie-es`、`set-cookie-parser`；这两页此前不存在，本轮新建
- forbidden overlap：未修改 ofetch、hono、express 或其他平行 writer 目标页

## cookie-es

- canonical source：`https://github.com/unjs/cookie-es`
- tag：`v3.1.1`（lightweight tag）
- revision：`487c49d4908c0910fc9d36b6751d15af872c1893`
- package：`cookie-es@3.1.1`（MIT，ESM-only，`sideEffects: false`，无 runtime 依赖）
- npm：`cookie-es@3.1.1` latest，`gitHead` 与 tag 一致
- also observed：`HEAD` 在 `f89ede8b...`（deps chore），未绑定
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `src/index.ts`
  - `src/_utils.ts`
  - `src/cookie/parse.ts`
  - `src/cookie/serialize.ts`
  - `src/cookie/types.ts`
  - `src/set-cookie/parse.ts`
  - `src/set-cookie/split.ts`
  - `src/set-cookie/types.ts`
  - `test/cookie-parse.test.ts`
  - `test/cookie-serialize.test.ts`
  - `test/set-cookie-parser.test.ts`
  - `test/split-cookies-string.test.ts`
- observed：
  - Cookie 解析基于 jshttp/cookie v1.1.1（`e264dfa`）；Set-Cookie 解析基于 set-cookie-parser v3.1.0，并加 RFC 6265bis 约束；
  - `parse` / `parseCookie` 扫 `Cookie` 头，默认 first-wins；`allowMultiple` 才把重复名收成数组；结果是 prototype-less `NullObject`；
  - `stringifyCookie` 把对象编成 `Cookie` 头；`serialize` / `serializeCookie` 编 `Set-Cookie`，接受 name+value+options 或 `SetCookie` 对象；
  - 非字符串 value 默认 `JSON.stringify`；`null` / `undefined` 变成空值；
  - serialize 校验 name/value/domain/path；`Partitioned`、`SameSite=None`、`__Secure-` / `__Host-` 前缀要求 `Secure`；`__Host-` 还要求 `Path=/` 且无 `Domain`；
  - `Max-Age` 必须是整数，负值钳到 0，上限 `34560000`（400 天）；
  - `parseSetCookie` 只吃单条字符串，返回对象或 `undefined`；`name in Object.prototype`、空 name+value、name+value > 4096 都拒绝；属性值 > 1024 忽略；
  - Domain 去前导点并小写；未知 `SameSite` 落成 `lax`；未知属性挂到对象上；
  - `splitSetCookieString` 按“逗号后先出现 `=` 而不是 `;`”切开合并头。
- provenance note：
  - npm `gitHead=487c49d4908c0910fc9d36b6751d15af872c1893` 与 GitHub tag `v3.1.1` 同指该提交，仓内 `package.json` 报 `3.1.1`。

## set-cookie-parser

- canonical source：`https://github.com/nfriedly/set-cookie-parser`
- tag：`v3.1.2`
- revision：`60b9d7f2b2a029238676bb0c34cd1a324198c766`
- package：`set-cookie-parser@3.1.2`（MIT，ESM + CJS，`sideEffects: false`，无 runtime 依赖）
- npm：`set-cookie-parser@3.1.2` latest，`gitHead` 与 tag 一致
- also observed：`HEAD` 在 `72162e2`（js-yaml dependabot），未绑定
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `lib/set-cookie.js`
  - `lib/set-cookie.d.ts`
  - `test/set-cookie-parser.js`
  - `test/split-cookies-string.js`
  - `test/fetch.js`
  - `test/warnings.js`
  - `test/cjs.cjs`
- observed：
  - 主入口 `parseSetCookie(input, options)`；默认 `decodeValues: true`、`map: false`、`silent: false`、`split: "auto"`；
  - 输入可以是字符串、字符串数组、带 `headers.getSetCookie()` 的 fetch Response，或 Node `headers["set-cookie"]`；大小写不敏感的慢路径会扫 header 名；
  - 若对象只有 `Cookie` 没有 `Set-Cookie`，默认 `console.warn`；`silent: true` 关掉；
  - `split: "auto"` 只拆字符串、不拆数组；`true` 总拆，`false` 不拆；
  - `parseString` 用 `;` 分段，第一个 `=` 分 name/value；禁止名（`key in {}`）返回 `null`；解码失败 `console.error` 并保留原值；
  - `Expires` 直接 `new Date(value)`，不做有效性检查；`Max-Age` 用 `parseInt`，NaN 丢弃，无 400 天上限；
  - `sameSite` 原样拷贝，不校验、不改大小写；Domain 保留前导点；没有独立 `priority` 分支，未知属性挂到对象上；
  - `map: true` 返回 prototype-less 对象，同名后写覆盖；空输入在 `map:false` 时返回 `[]`；
  - 兼容导出：default、`parse`、`parseString`、`splitCookiesString` 仍在，文档以 `parseSetCookie` 为准。
- provenance note：
  - npm `gitHead=60b9d7f2b2a029238676bb0c34cd1a324198c766` 与 GitHub tag `v3.1.2` 同指该提交（"3.1.2"），仓内 `package.json` 报 `3.1.2`。
  - v3.1.2 修复空 name-value（如 `";"`）不再抛错。
