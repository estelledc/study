# HTTP server source review

> 用途：记录 restify、polka 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DR
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试/文档阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- evidence state：`STATIC_REVIEW` / `UNVERIFIED`
- excluded pair：未改 `express` / `fastify` / `hono` / `elysia` / `koa` / `nestjs`

## restify

- canonical source：`https://github.com/restify/node-restify`
- revision：`784dd4182137850b95988ab478e7c206e1df98c1`
- package：`restify@12.0.0`
- engines：`node >=22.0.0`
- provenance：GitHub tag `v12.0.0`、npm `latest` 与 npm `gitHead` 均指向同一提交
- inspected：
  - `package.json`
  - `lib/index.js`
  - `lib/server.js`
  - `lib/router.js`
  - `lib/routerRegistryRadix.js`
  - `lib/chain.js`
  - `lib/request.js`
  - `lib/response.js`
  - `lib/formatters/index.js`
  - `lib/formatters/json.js`
  - `lib/plugins/index.js`
  - `lib/plugins/bodyParser.js`
  - `lib/plugins/query.js`
  - `lib/plugins/jsonBodyParser.js`
  - `test/server.test.js`
- observed：
  - `createServer()` defaults `name` to `"restify"`, installs a pino logger, and constructs a `Router` backed by `find-my-way@^9.6.0`;
  - request lifecycle is `first` → `_setupRequest` → `pre` → route lookup → `use` → route handlers; `use()` runs only after a route matches;
  - `first` handlers are synchronous and may return `false` to abort before restify decorates the request;
  - `handleUncaughtExceptions` defaults false and, when true, uses the deprecated `domain` module unless a custom function is supplied;
  - `onceNext` defaults false; `strictNext` defaults false and forces `onceNext`;
  - `strictFormatters` defaults true; built-in formatters are JSON (`q=0.4`), text (`q=0.3`), octet-stream (`q=0.2`) and JSONP (`q=0.1`);
  - missing route: other methods on the same path become `MethodNotAllowedError` plus `Allow`; otherwise `ResourceNotFoundError`;
  - `next(false)` stops the chain; `next('string')` in 12.0.0 is an `InternalServerError` 500, not a named-route jump;
  - callback handlers must accept `(req, res, next)`; async handlers must accept at most `(req, res)`;
  - plugins are opt-in; `queryParser` only maps into `req.params` when `mapParams === true`; without the plugin, `req.query` is the raw query string;
  - `bodyParser` does not parse HEAD, and does not parse GET unless `requestBodyOnGet` is true; `mapParams` defaults false;
  - if the handler chain finishes without writing a response, restify sends `InternalServerError`.

## polka

- canonical source：`https://github.com/lukeed/polka`
- revision：`302d74a2cbb66d9a20cdbe0c08bbd68ffba3ae46`
- package：`polka@0.5.2`
- provenance：
  - GitHub annotated tag `v0.5.2` peels to this commit;
  - npm `polka@0.5.2` does not publish `gitHead`;
  - npm `next` is `1.0.0-next.28` (`gitHead=895ffb96945c4d40e62205bfc6897f5bfc76700e`); this review binds the latest stable tag, not the next line.
- inspected：
  - `packages/polka/package.json`
  - `packages/polka/index.js`
  - `packages/polka/readme.md`
  - `packages/url/index.js`
  - `tests/polka.js`
- observed：
  - `polka()` returns a `Polka` that extends `trouter`; public files are the package-root `*.js` copies;
  - `listen()` creates `http.createServer()` only if `options.server` is missing, attaches `handler`, and returns the Polka instance rather than a Promise;
  - `handler` parses with `@polka/url`, finds a Trouter match, concatenates global `wares` plus first-segment `bwares`, then route handlers or a sub-app;
  - query uses Node `querystring.parse` on `@polka/url`'s `query` string, not `qs`;
  - a lone route handler with an empty middleware array is called as `(req, res)` without `next`;
  - `next(err)` exits to `onError`; default `onError` sets `statusCode = err.code || err.status || 500` and ends with `err` when `err.length` is truthy, otherwise `err.message` or `http.STATUS_CODES[code]`;
  - default `onNoMatch` is `onError.bind(null, { code: 404 })`;
  - `use(fn)` / `use('/', ...fns)` are global; `use('/base', polkaApp)` mounts a sub-app on the first path segment and forbids parent routes that share that segment;
  - the loop stops when `res.finished` is true; there is no body parser and no `res.send`.
