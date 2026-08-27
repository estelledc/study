# Fetch wrapper source review (writer FM)

> 用途：记录 `redaxios` 与 `unfetch` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fm` 标记 2026-08-27 平行 writer FM，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FM
- assigned target：`ofetch` + `redaxios`
- why fallback：`ofetch` 已被开放 PR #86（axios + ofetch）占用；仓库原先没有 `redaxios` 页。按 leftover 规则保留未占用的 `redaxios`，配对同作者的 fetch ponyfill `unfetch`。
- forbidden overlap：未改 `ofetch`、`axios`、`ky`、`got`、`wretch`、`undici`、`node-fetch`、`superagent` 正文
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行 karmatic / jest / tsc，未发送网络请求，未测 bundle 或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git

## redaxios

- canonical source：`https://github.com/developit/redaxios`
- tag：`0.5.1`（lightweight tag）
- revision：`ad40de9175109bbe144fd2ab81a001132f437184`
- package：`redaxios@0.5.1`（Apache-2.0）
- npm：`redaxios@0.5.1` latest，`gitHead` 与 tag 同指此提交
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.js`
  - `mod.ts`
  - `test/index.test.js`
- observed：
  - 默认导出是 `create()` 的结果；`create(defaults)` 再挂 `get` / `delete` / `head` / `options` / `post` / `put` / `patch`、`all`、`spread`、`defaults`、`create`；
  - `deepMerge` 合并 defaults 与本次 config；`headers` 键会被 lowerCase；
  - 普通对象 body 走 `JSON.stringify` 并补 `content-type: application/json`；带 `append` 的 FormData 或带 `text` 的 Blob 原样直传；
  - `auth` 原样写入 `authorization`，不是 Axios 的 `username:password` → Basic 编码；
  - `baseURL` 用 `/^(?!.*\/\/)\/?/` 只改“看起来不像带协议”的 URL；`params` 默认 `URLSearchParams`，可换 `paramsSerializer`；
  - 实际 fetch 是 `options.fetch || fetch`；`withCredentials` 为真才设 `credentials: 'include'`，否则不传该字段；
  - 非 `stream` 路径先 `res[responseType || 'text']()`，再无条件 `JSON.parse`；解析失败则保留上一层结果（`catch(Object)`）；
  - 默认成功判定是 `res.ok`（Fetch 的 200–299），不是 JSDoc 写的 200–399；失败 `Promise.reject(response)`，拒绝值就是响应对象；
  - `CancelToken` 只是 `AbortController` 或 `Object` 的别名，请求调用没有把 `signal` 交给 fetch。
- provenance：
  - GitHub lightweight tag `0.5.1`、npm `redaxios@0.5.1` `gitHead` 与检出提交三者一致。

## unfetch

- canonical source：`https://github.com/developit/unfetch`
- tag：`5.0.0`（lightweight tag）
- revision：`e8f8baa5c1aaf4f70afcfcc6bfa8b592fae6c861`
- package：`unfetch@5.0.0`（MIT）
- companion workspace：`packages/isomorphic-unfetch` 自称 `4.0.0`，依赖 `unfetch@^4.2.0` 与 `node-fetch@^3.2.0`，不是本页绑定对象
- npm：`unfetch@5.0.0` latest，`gitHead` 与 tag 同指此提交
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.mjs`
  - `src/index.d.ts`
  - `polyfill/polyfill.mjs`
  - `packages/isomorphic-unfetch/package.json`
  - `packages/isomorphic-unfetch/index.js`
  - `packages/isomorphic-unfetch/index.mjs`
  - `packages/isomorphic-unfetch/browser.js`
  - `test/index.test.mjs`
- observed：
  - 核心实现是 `XMLHttpRequest`，不是对 `window.fetch` 的包装；ponyfill 导入永远走 XHR，即使全局已有 Fetch；
  - polyfill 入口是 `if (!self.fetch) self.fetch = unfetch`，只在缺失时安装；
  - 响应只提供 `ok` / `status` / `statusText` / `url` / `text` / `json` / `blob` / `clone` 与精简 `headers`；`arrayBuffer`、`body`、`signal`、`redirect` 等被类型标成不支持；
  - `ok` 用 `((status / 100) | 0) == 2`；HTTP 4xx/5xx 仍 resolve，只有 `onerror` reject；
  - `credentials == "include"` 才设 `xhr.withCredentials`；`"same-origin"` 不是实现值；
  - `clone` 是同一工厂函数再跑一遍，读的仍是那份 XHR；
  - 响应头名从 `getAllResponseHeaders()` 用 `^(.+?):` 抽取，取值再走 `getResponseHeader`；
  - isomorphic 包在 Node 里把 `//host` 改写成 `https://host` 后动态 `import("node-fetch")`，并可能写入 `global.fetch`。
- provenance：
  - GitHub lightweight tag `5.0.0`、npm `unfetch@5.0.0` `gitHead` 与检出提交三者一致；
  - 同提交里的 `isomorphic-unfetch@4.0.0` 未绑定，其 npm 依赖也不是 5.0.0。
