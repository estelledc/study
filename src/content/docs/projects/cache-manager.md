---
title: cache-manager — 用 Keyv store 阵列做分层 wrap 的 Node 缓存门面
来源: https://github.com/jaredwray/cacheable
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jaredwray/cacheable
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 069f7340194f29f8ad2310cec4b922c0ad21b4f9
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.2.9
---

## 是什么

cache-manager 是一个 Node.js 缓存门面：业务只调 `get` / `set` / `wrap`，底下可以挂一层或多层 Keyv 兼容 store。日常类比：酒店前台——你只对前台说“这个房间号有没有人”，前台先问一楼值班、再问楼上仓库；同一房间号的并发问询，前台只派人查一次。

你写：

```js
import { createCache } from 'cache-manager';

const cache = createCache({ ttl: 10_000, refreshThreshold: 3_000 });
const value = await cache.wrap('user:1', async () => loadUser(1));
```

不传 `stores` 时，`createCache()` 自己 `new Keyv()`，并关掉 JSON 序列化。固定 7.2.9 的作者源在 `jaredwray/cacheable` 的 `packages/cache-manager`。

## 为什么重要

不理解 store 阵列、`wrap` 合并和“过期刷新”，就解释不了下面几件事：

- 为什么十个请求同时 `wrap` 同一个 key，计算函数只跑一次
- 为什么命中即将过期的值时，调用方先拿到旧值，后台才去刷新
- 为什么 `ttl()` 的数字看起来不像“还剩多少毫秒”
- 为什么 v7 找不到键时是 `undefined`，而 README 若干示例仍写 `null`

## 核心要点

固定 7.2.9 的主链可以拆成五步：

1. **门面而不是自己实现 LRU**：`createCache({ stores })` 接收 Keyv 实例数组；缺省就建一个内存 Keyv，并把 `serialize` / `deserialize` 设成 `undefined`，避免默认 JSON 弄坏 `Uint8Array` / `symbol`。

2. **读走优先级，写广播**：默认 `get` 从前往后问，问到第一个非 `undefined` 就停；`set` / `del` / `clear` 对所有 store `Promise.all`。`nonBlocking` 打开后，读改成 `Promise.race`，写改成不等待。

3. **`wrap` 先合并再计算**：`coalesceAsync(\`${cacheId}::${key}\`)` 让同一实例、同一 key 的并发 miss 共用一次 `fnc()`。`cacheId` 默认是随机串，避免两个门面抢同一把锁。

4. **剩余 TTL 小于阈值就后台刷新**：命中且 `lessThan(remainingTtl, refreshThreshold)` 为真时，另起 `+++${cacheId}__${key}` 合并去跑 `fnc()`，先把旧值还给调用方。`refreshAllStores` 为假时，只写回“从队首到命中那一层”。

5. **旧 store 用适配器**：`KeyvAdapter` 把仍实现 `get` / `set` / `del` / `mget` 的 `CacheManagerStore` 接到 Keyv；适配器里 `null` 也当 miss。

## 实践示例

### 案例 1：默认内存门面，miss 只算一次

```js
const cache = createCache();
const load = async () => ({ id: 1 });

await Promise.all([
  cache.wrap('user:1', load),
  cache.wrap('user:1', load),
]);
```

`wrap.test.ts` 用十路并发确认 `fnc` 只调用一次。合并键带 `cacheId`，所以另一份 `createCache()` 不会误吃这次结果。

### 案例 2：两层 store，后层命中会回填前层

```js
import { Keyv } from 'keyv';
import { createCache } from 'cache-manager';

const near = new Keyv();
const far = new Keyv();
const cache = createCache({ stores: [near, far], ttl: 60_000 });

await far.set('k', 'from-far');
const value = await cache.wrap('k', async () => 'computed');
```

`wrap` 在 `far` 取到值且 `i > 0` 时，会 `set(stores.slice(0, i), ...)` 把值写回更近的层。本次 `fnc` 不会跑。

### 案例 3：阈值刷新先返回旧值

```js
await cache.wrap('k', async () => 0, 500, 250);
// 等待超过 250ms 后再 wrap，仍先得到 0，后台才写入 1
await cache.wrap('k', async () => 1, 500, 250);
```

`remainingTtl` 来自 `raw.expires - Date.now()`。`lessThan` 要求两边都是 number，缺 expires 或没设阈值时不会刷新。

## 踩过的坑

1. **把 `ttl()` 当成剩余寿命**：源码在 `raw.expires` 存在时直接返回这个绝对时间戳。测试按 `Date.now() + ttl` 对齐。没有 expires 时是 `undefined`。

2. **按 README 示例判断 miss**：v7 把“没数据”从 `null` 改成 `undefined` 以对齐 Keyv；`get.test.ts` / `wrap.test.ts` 也按 `undefined` 断言。若干 README 段落仍写 `null`。

3. **以为 `nonBlocking` 让 `wrap` 也抢最快层**：`wrap` 的查找循环始终顺序 `await`；`nonBlocking` 只影响它内部调用的 `set`。`get` 在 `nonBlocking` 下用 `Promise.race`：更快的 `undefined` 或立刻抛错，都可以让你看不到更慢那一层的命中。

4. **把 npm 上的更新 tag 当成可绑定源**：本页绑定 date tag `2026-05-27` 的 `packages/cache-manager` 树。npm `7.2.9` 无 `gitHead`；版本表没有 `7.2.10`。本轮未 clone `main`，也未安装依赖。

5. **把默认 Keyv 当成带容量上限的 LRU**：缺省 store 不淘汰条目。要限容量应换带上限的 Keyv store，或看进程内的 [[quick-lru]]。

## 适用 vs 不适用场景

**适用**：

- 需要 `wrap` 把“算一次、读多次”写成同一条 API，并接受 Keyv store 合同
- 要一层内存加一层远端 store，且能接受回填与后台刷新语义
- 打包器能消费 `exports` 里的 ESM / CJS 双构建

**不适用**：

- 只要一个同步、有硬上限的进程内 Map——直接看 [[quick-lru]]
- 不能接受 miss 为 `undefined`、或必须把 `ttl()` 理解成剩余毫秒
- 需要本轮未核验的远端 store 客户端或队列中间件
- 不能接受源码在 monorepo、npm 包又没有 `gitHead` 的 provenance

## 固定版本边界

- 本文绑定 `jaredwray/cacheable@069f7340194f29f8ad2310cec4b922c0ad21b4f9`，date tag `2026-05-27`，`packages/cache-manager/package.json` 版本为 `7.2.9`。
- 该目录在后续 date tag `2026-06-27` 上内容相同；npm 记录 `7.2.9` 发布于 `2026-06-27T18:20:09.842Z`，`latest` 仍为 `7.2.9`。
- 运行时依赖声明为 `keyv@^5.6.0` 与 workspace `@cacheable/utils`（同提交上为 `2.4.2`）。本页不把它们写成对照项目。
- `wrap` 的合并实现来自同 monorepo 的 `coalesceAsync`，注释指向 promise-coalesce。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **门面负责合并与分层，store 负责存**——`createCache` 不实现淘汰算法。
2. **`wrap` 的并发安全靠字符串键**——`cacheId` 把实例隔开，刷新用另一把 `+++` 键。
3. **文档和类型会落后于 v7 的 `undefined`**——以 `src/index.ts` 和测试为准。
4. **`nonBlocking` 是“谁先结束听谁的”，不是“谁有值听谁的”**。

## 应用型自测

1. 不传 `stores` 的 `createCache()`，底层是不是带 `maxSize` 的 LRU？
2. `await cache.ttl(key)` 在 key 仍有效时，返回的是剩余毫秒还是过期时间戳？
3. 十个请求同时 `wrap` 同一个 key，计算函数会跑几次？

检查点：

1. 不是。默认是关掉序列化的内存 Keyv，没有容量上限。
2. 是 `raw.expires` 这个绝对时间戳；没有 expires 则 `undefined`。
3. 一次。它们共用 `` `${cacheId}::${key}` `` 这条 coalesce 键。

## 延伸阅读

- 文档：[cache-manager README](https://github.com/jaredwray/cacheable/tree/main/packages/cache-manager)
- 固定源码：[jaredwray/cacheable](https://github.com/jaredwray/cacheable) —— 本文绑定提交 `069f7340194f29f8ad2310cec4b922c0ad21b4f9`
- [[quick-lru]] —— 进程内同步 LRU，对照“门面 vs 淘汰算法”
- [[nestjs]] —— 后端框架里常见的缓存模块消费方

## 关联

- [[quick-lru]] —— 同步双 Map LRU，不提供 store 阵列或 `wrap`
- [[memcached]] —— 独立进程的经典内存缓存，不是这个 JS 门面
- [[nestjs]] —— 企业级 Node 框架，常把缓存门面接到模块里

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[quick-lru]] —— quick-lru — 用新旧两份 Map 近似 LRU 的同步缓存
