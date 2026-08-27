# Content-cache source review (writer IO)

> 用途：记录 cacache、make-fetch-happen 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer IO
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、未发网络请求、未测 bundle 或性能
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：`cache-manager`、`quick-lru`、`unstorage`、`lru-cache`、`keyv`、`node-cache`、`marked`、`markdown-it`、`knex`、`ioredis`、`redis`、`BullMQ`

## cacache

- canonical source：`https://github.com/npm/cacache`
- revision：`5c0b5782af33e828eaa63a401d89bb9200b557cb`
- package：`cacache@21.0.1`（源码 tag `v21.0.1`）
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`（21.0.0 / 21.0.1）
  - `LICENSE.md`
  - `lib/index.js`
  - `lib/put.js`
  - `lib/get.js`
  - `lib/rm.js`
  - `lib/entry-index.js`
  - `lib/content/write.js`
  - `lib/content/read.js`
  - `lib/content/path.js`
  - `lib/util/hash-to-segments.js`
  - `lib/util/cache-dir.js`
  - `lib/util/tmp.js`
  - `lib/memoization.js`
  - `lib/verify.js`
- observed：
  - tag `v21.0.1`、`package.json` version 与 npm `gitHead` 同指 `5c0b5782af33e828eaa63a401d89bb9200b557cb`；
  - `cache-version` 为 `content: "2"`、`index: "5"`，目录分别是 `content-v2/` 与 `index-v5/`；
  - `put` 默认 `algorithms: ['sha512']`：先 `content/write` 再 `index.insert`；
  - 内容路径是 `content-v2/<algo>/<2hex>/<2hex>/<rest>`；写盘走 `tmp/` + `moveFile(..., { overwrite: false })`，同 digest 已存在则当作去重；
  - 索引按 key 的 sha256 分段落到 bucket，行格式为 `sha1(json)\tjson`，`appendFile` 追加；`find` 取同 key 最后一条；`integrity === null` 视为删除；
  - `get` 先 `index.find` 再 `content/read`，`ssri.checkData` 失败抛 `EINTEGRITY`；单次整读上限 `64 * 1024 * 1024`；
  - `memoize` 默认关闭；打开后走进程内 `LRUCache`（max 500、maxSize 50MB、ttl 3 分钟）；
  - `verify` 是 mark-and-sweep：活内容按索引 integrity 标记，损坏或无引用的 content 删除，再重建 bucket，并写 `_lastverified`；
  - 21.0.1 在 cache 根写入 `CACHEDIR.TAG`；`mkdir` 使用 `owner: 'inherit'`；
  - `engines.node` 为 `^22.22.2 || ^24.15.0 || >=26.0.0`；许可 ISC。
- provenance：
  - GitHub latest release 名 `v21.0.1`，`target_commitish` 与 npm `gitHead` 一致；
  - 本审查绑定可达源码 tag，未把 README 的吞吐宣传写成测量结果。

## make-fetch-happen

- canonical source：`https://github.com/npm/make-fetch-happen`
- revision：`36435b4fd8e68ff77fda4ac515d3dea198da2cb9`
- package：`make-fetch-happen@16.0.1`（源码 tag `v16.0.1`）
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`（16.0.0 / 16.0.1）
  - `LICENSE`
  - `lib/index.js`
  - `lib/options.js`
  - `lib/fetch.js`
  - `lib/remote.js`
  - `lib/pipeline.js`
  - `lib/cache/index.js`
  - `lib/cache/entry.js`
  - `lib/cache/policy.js`
  - `lib/cache/key.js`
  - `lib/cache/errors.js`
- observed：
  - tag `v16.0.1`、`package.json` version 与 npm `gitHead` 同指 `36435b4fd8e68ff77fda4ac515d3dea198da2cb9`；
  - 入口把 opts 交给 `configureOptions`，再构造 `minipass-fetch` 的 `Request` 后进入 `lib/fetch.js`；
  - `CachePolicy.storable` 要求 `cachePath`、`cache !== 'no-store'`、方法为 GET/HEAD，再问 `http-cache-semantics`（`shared: false`、`ignoreCargoCult: true`）；
  - 默认可缓存模式是 `default`；若请求已带条件头，会被改成 `no-store`；`cacheManager` 仅在未设 `cachePath` 时回填；
  - 缓存键为 `make-fetch-happen:request-cache:` + `url.format`（去掉 auth / fragment，保留 search）；
  - miss 走 `remote` 后 `CacheEntry.store`；hit / force-cache / only-if-cached 直接 `respond`；stale 或 `no-cache` 走 `revalidate`；
  - 只把 GET 的 200/301/308 且 `policy.storable()` 的响应写入 cacache；200 要等 body `resume` 才 `put.stream`；301/308 只 `index.insert(..., null)`；
  - 304 刷新 index metadata、复用原 integrity；网络失败且没有 `must-revalidate` 时回退 stale；
  - 非 GET/HEAD 且状态 200–399 会 `rm.entry(..., { removeFully: true })`；
  - 默认 `retry: { retries: 0 }`；POST 与 stream body 不重试；408/420/429/5xx 以及部分套接字错误才进入 retry；
  - 跨主机 redirect 删除 `authorization` / `cookie`；303 或 POST+301/302 改 GET；
  - 依赖 `cacache@^21.0.0`；`engines.node` 与 cacache 21 相同。
- provenance split：
  - GitHub Releases 的 latest 仍指向 `v15.0.6` / `a5a170ca2ee94d542f9ebfecd1094ed8cb667fb0`；
  - npm `make-fetch-happen@16.0.1` 与可达 tag `v16.0.1` 对齐；本审查绑定后者，不把 latest release UI 当成 16.0.1。
