# unstorage + lru-cache source review (writer GN)

> 用途：记录 `unstorage` 与 `lru-cache` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gn` 标记 2026-08-27 平行 writer GN，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GN
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未连接 Redis / S3 / Cloudflare，未运行上游 test、HTTP server、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`unstorage` 是既有页面迁移；`lru-cache` 是本轮新增页面（`origin/main` 原先没有）。`isaacs/node-lru-cache` 是 GitHub 仓名，页面 slug 仍为 npm 包名 `lru-cache`

## unstorage

- canonical source：`https://github.com/unjs/unstorage`
- tag：`v1.17.5`（annotated tag）
- revision：`e2febded37759ec796e7d0233d4eb68c92423cc2`
- package：`unstorage@1.17.5`（MIT）
- npm：latest 同号，**未暴露 `gitHead`**；身份靠 annotated tag + 包版本 + 提交 SHA
- also observed：`2.0.0-alpha.9` 是 dist-tag `alpha`，未绑定
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/types.ts`
  - `src/storage.ts`
  - `src/_utils.ts`
  - `src/utils.ts`
  - `src/_drivers.ts`
  - `src/server.ts`
  - `src/drivers/utils/index.ts`
  - `src/drivers/memory.ts`
  - `src/drivers/lru-cache.ts`
  - `src/drivers/indexedb.ts`
  - `src/drivers/redis.ts`
- observed：
  - `createStorage()` 默认挂 `memory()`（`Map`）；未传 driver 也能读写；
  - `normalizeKey` 丢掉 `?` 之后、把 `/` 与 `\` 收成 `:`、折叠连续冒号并去掉首尾冒号；`normalizeBaseKey` 再补一个尾部 `:`；
  - mountpoint 按长度降序匹配，最长前缀赢；同一 base 再 mount 会 throw；
  - `setItem` 走 `stringify`：primitive 用 `String()`，纯对象/数组走 `JSON.stringify`，有 `toJSON` 则递归，否则 throw；`undefined` 改走 `removeItem`；
  - `getItem` 一律 `destr`；driver 缺 `setItem` 时写操作静默返回（只读）；
  - meta 存在 `key + "$"`；`prefixStorage` 是方法包装，不是新 driver；
  - `_drivers.ts` 列出 33 个 builtin driver 模块（另有 camelCase 别名）；`lru-cache` 驱动默认 `max: 1000`；
  - 生产依赖含 `destr`、`h3`、`lru-cache`、`ofetch`、`chokidar` 等；driver 客户端多是 optional peer；
  - HTTP server 是 h3 handler：GET 读、PUT 写、DELETE 删，末尾 `:`/`/` 当 base key。

## lru-cache

- canonical source：`https://github.com/isaacs/node-lru-cache`
- tag：`v11.5.2`
- revision：`16b3a916662ab449d496b7b4b4f04132565d1d28`
- package：`lru-cache@11.5.2`（BlueOak-1.0.0）
- npm：`gitHead` 与 tag 同指此提交
- engines：`node: 20 || >=22`
- production dependencies：无
- inspected：
  - `package.json`
  - `src/index.ts`（constructor、`#set`、`#get`、`#has`、`fetch`/`memo`、`dump`/`load`）
  - `src/perf.ts`
  - `src/diagnostics-channel.ts`
- observed：
  - 构造必须给出 `max`、`maxSize`、`ttl` 之一，否则 `TypeError`；只有 TTL、没有 `max`/`maxSize`/`ttlAutopurge` 会 `LRU_CACHE_UNBOUNDED` warning；
  - 内部是 `Map` + 预分配数组 + typed-array 双向链表；`max` 决定预分配宽度；
  - 默认 TTL **不预删**；`has()` 对过期项返回 `false` 但不删；`get()` 默认删过期项，除非 `noDeleteOnStaleGet`；
  - `set(key, undefined)` 等于 `delete`；单条超过 `maxEntrySize` 会删旧值且不写入；
  - 没有 `fetchMethod` 时 `fetch()` 退化成 `get`；`memo()` 没有 `memoMethod` 会 throw；
  - unstorage 的 `lru-cache` driver 把本包装成 KV 后端，默认 `max: 1000`。
