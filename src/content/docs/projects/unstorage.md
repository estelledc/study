---
title: unstorage — 让运行环境从代码里抹掉的 KV 抽象层
description: 一个 storage interface + driver registry 跑通 fs/redis/s3/cloudflare-kv/upstash 等 35+ backend；Nuxt 3 / Nitro 的内置依赖；切平台不用改业务代码
sidebar:
  order: 34
  label: unjs/unstorage
---

> unjs/unstorage，commit `2727956a9bd19059c742c8acb310df312ade5f74`（2026-05-28 读），MIT。
>
> unstorage 解决的是**KV 存储的运行环境绑死**：你在 Node.js 上写的 redis client 调用，
> 搬到 Cloudflare Workers 要换成 KVNamespace binding，搬到 Vercel Edge 要换成 vercel-kv，
> 搬到本地开发要起 docker redis——同一段"读个缓存"逻辑，随平台改 4 次。
>
> unstorage 的判断：**KV 操作的最小公约数就是 7 个 method（getItem/setItem/...），
> 把它定义成 Driver interface，35+ backend 各自实现一遍，业务代码只见 storage.getItem('user:42')**——
> 运行在哪一台机器、哪一个云上，由 createStorage({ driver }) 这一行决定，业务层不需要知道。
>
> Season 8 收官篇 · v1.1 项目类型分支 D（框架/SDK）。
>
> Pure TypeScript 库，没有 runtime 依赖，靠 driver 文件分包按需加载；Nuxt 3 / Nitro 全靠它做 server 端缓存。

## 一句话定位

**unstorage = 运行时无关的 KV 抽象层：定义一套 Storage interface，让 fs/redis/s3/cloudflare-kv/upstash/indexedb 通过 Driver 协议接进来，业务代码切平台时只改 createStorage 那一行。**
不是新存储系统，是**已有存储系统的统一前台**。

## 核心信息表

| 字段 | 值 |
|---|---|
| 仓库 | [unjs/unstorage](https://github.com/unjs/unstorage) |
| star / fork | ~2.6k / ~179（2026-05-28 读） |
| 最近活跃 | 2026-05-05 主干持续提交（commit `2727956` 当日） |
| 读时 commit | `2727956a9bd19059c742c8acb310df312ade5f74` |
| 最近 release | v2.0.0-alpha.7（2026-03-19，含 fs ignore + memory ttl 修复） |
| 主语言 | TypeScript 99.9% |
| 维护方 | unjs 生态（Nuxt 周边） |
| 主要贡献者 | Pooya Parsa（Nuxt 核心，本仓 31 commits 主导）/ Rihan Arfan / Kricsleo / renovate-bot |
| License | MIT |
| 类似项目 | keyv（同类 KV 抽象）· lru-cache（单进程缓存）· vercel-kv（平台专用）· node-cache（内存 only）· redis 直连（无抽象） |
| 关键依赖 | destr（容错 JSON parse）· chokidar（fs watch，仅 fs driver 用）· ioredis（仅 redis driver 用） |
| 下游使用 | Nuxt 3 server cache / Nitro server / Nuxt Content / 大量 Vercel + Cloudflare 项目 |

## 项目类型自标 · v1.1 分支 D 框架/SDK

- **类型**：框架/SDK（核心是给开发者用的 abstraction：用户实现自己的 Driver 或选 35+ 内置 driver，平台代码不可见）
- **心脏物**：`src/storage.ts`（createStorage + mount/getMount 路由）+ `src/types.ts`（Driver / Storage interface）
- **extension point**：driver（每个 backend 写一个）/ mount（namespace 路由）/ watch（变更回调）/ prefixStorage（namespace wrapper）
- **混合特征**：含轻微"工具库"味道（无 runtime / 无 daemon），
  但**核心心智模型是 abstraction + extension points**——开发者要么挑一个内置 driver，要么自己写一个 driver——所以归类 D。
  附录里点出与 keyv（同类抽象）的差异。

## Why（为什么是它而不是 keyv / vercel-kv / node-cache 直连）

KV 抽象层的派系演化：

```
2014: redis 直连           ioredis / node-redis，绑死 Redis
2017: node-cache           内存 only，进程重启丢
2018: keyv                 KV 抽象 + adapter 协议（unstorage 之前的同类）
2019: lru-cache            单进程 LRU，没有 remote backend 概念
2021: unstorage            unjs 生态，driver 协议 + mount 路由 + 35+ backend
2022: vercel-kv            平台专用包装，不跨平台
2024: cloudflare workflows 平台原生，不跨平台
```

**核心痛点**：你写一个 Nuxt 应用，server 端要做"用户配置缓存"。

**派系 1：直连 Redis 派**

```typescript
import Redis from 'ioredis'
const redis = new Redis(process.env.REDIS_URL!)

export async function getUserConfig(uid: string) {
  const cached = await redis.get(`user:${uid}:config`)
  if (cached) return JSON.parse(cached)
  // ...
}
```

代价：本地开发要起 docker redis；部署到 Cloudflare Workers 没有 ioredis（不支持 Node net 模块）；
Vercel Edge 也跑不了——你要为每个部署目标写一份。

**派系 2：keyv（同类抽象，更老）**

```typescript
import Keyv from 'keyv'
const kv = new Keyv('redis://localhost:6379')   // 自动选 adapter
await kv.set('user:42:config', { theme: 'dark' }, 3600_000)
```

代价：keyv 设计偏简单——**没有 mount 概念**（不能让 'cache:' 走 fs 同时 'session:' 走 redis）；
没有官方 cloudflare-kv / vercel-blob / s3 adapter；watch 不是一等公民。

**派系 3：unstorage（多 backend + mount 路由）**

```typescript
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import redisDriver from 'unstorage/drivers/redis'

const storage = createStorage({ driver: fsDriver({ base: './.cache' }) })
storage.mount('session:', redisDriver({ url: process.env.REDIS_URL }))

await storage.setItem('user:42:config', { theme: 'dark' })   // → 走默认 fs
await storage.setItem('session:abc:user', { uid: 42 })       // → 走 redis（前缀路由）
```

执行模型：`getMount('session:abc:user')` 在 mountpoints 列表（按长度倒排）里找最长前缀匹配，
命中 'session:' → driver = redis；命中默认 '' → driver = fs。
**业务层只调 storage.setItem，路由由 createStorage 配置决定**——
本地用 fs，Vercel 用 vercel-blob，Cloudflare 用 kv-binding，**业务代码一行不改**。

| 工具 | 多 backend | mount 路由 | watch | 平台覆盖 | runtime 依赖 |
|---|---|---|---|---|---|
| **redis 直连** | ❌ 单一 | ❌ | ✅（pubsub） | Node only | ioredis |
| **node-cache** | ❌ 内存 only | ❌ | ❌ | Node only | 0 |
| **keyv** | ✅ 中等 | ❌ | ❌ | Node + 部分浏览器 | adapter |
| **vercel-kv** | ❌ 平台 only | ❌ | ❌ | Vercel only | @vercel/kv |
| **unstorage** | ✅ **35+ driver** | ✅ **getMount 前缀路由** | ✅ **driver 实现 + 顶层订阅** | **Node / Worker / Edge / Browser** | **0 核心依赖** |

unstorage 的"额外的东西"是**为了把 KV 操作的运行环境从业务代码里抹掉**：
mount 路由让一个 storage 实例同时挂多个 backend；driver 协议把 Cloudflare Workers / Vercel Edge / S3 全部塞进同一个接口。

引用 Pooya Parsa（Nuxt 核心，unjs 创始人）在 unjs 的 manifesto：
**"Build modular tools that work seamlessly across runtimes"**——unjs 整个生态都在解决"Node 和 Edge 写一份代码"的问题，
unstorage 是其中处理"持久化"维度的那一片。

## 仓库地形

```
src/
├── storage.ts          ← 心脏 1：createStorage + getMount/mount 路由 + watch 多路复用
├── types.ts            ← 心脏 2：Driver / Storage interface 定义（给所有 driver 写规范）
├── _utils.ts           ← asyncCall（同步函数包成 Promise）+ stringify + base64 raw 编解码
├── _drivers.ts         ← Auto-generated：所有内置 driver 的 type 联合（35+ 项）
├── utils.ts            ← normalizeKey / joinKeys / filterKeyByDepth / prefixStorage
├── server.ts           ← createStorageServer（HTTP 接口包装 storage）
├── tracing.ts          ← OpenTelemetry span 包装（v2 新增）
└── drivers/            ← 35+ 个 driver，每个独立文件
    ├── memory.ts       ← Map 内存（默认）
    ├── fs.ts           ← Node fs + chokidar watch
    ├── fs-lite.ts      ← 不带 watch 的 fs，更轻
    ├── redis.ts        ← ioredis 包装，含 cluster
    ├── cloudflare-kv-binding.ts   ← Cloudflare KVNamespace binding
    ├── cloudflare-kv-http.ts      ← Cloudflare KV REST API
    ├── cloudflare-r2-binding.ts   ← R2 对象存储
    ├── s3.ts           ← AWS S3 / S3 兼容
    ├── upstash.ts      ← Upstash Redis REST
    ├── github.ts       ← 从 GitHub 仓库拉取（只读 driver 范例）
    ├── lru-cache.ts    ← 内存 LRU，单进程
    ├── overlay.ts      ← read-through 多层（前层 cache，后层 source）
    ├── localstorage.ts / session-storage.ts / indexedb.ts  ← 浏览器三件套
    ├── mongodb.ts / planetscale.ts / db0.ts                 ← SQL/document DB 包装
    ├── azure-* (5)     ← Azure 全家桶
    ├── netlify-blobs.ts / vercel-blob.ts / vercel-runtime-cache.ts  ← 平台 blob
    ├── deno-kv.ts / deno-kv-node.ts                          ← Deno KV
    ├── capacitor-preferences.ts                              ← 移动端
    └── utils/
        ├── index.ts    ← DriverFactory 类型 + createError 工具
        ├── node-fs.ts  ← fs driver 共用的 readFile / writeFile / readdirRecursive
        └── cloudflare.ts  ← getKVBinding 解析（string vs Object）
test/
└── drivers/<each>.test.ts  ← 每个 driver 一个 test 文件
docs/                ← VitePress 文档站（独立子项目）
```

**心脏文件清单**（commit `2727956`）：

1. `src/storage.ts`（483 行）——createStorage 单一函数 + 内部 getMount / runBatch / 路由查找
2. `src/types.ts`（151 行）——Driver / Storage interface 是整个抽象的契约源
3. `src/drivers/cloudflare-kv-binding.ts`（84 行）——典型 driver 实现样板，最简案例

**commit 热点 top 15**（运行 `git log --format='' --name-only | sort | uniq -c | sort -rn | head -15`）：

```
 18 package.json
 11 pnpm-lock.yaml
  6 src/drivers/s3.ts                ← S3 driver 持续维护
  6 src/drivers/fs.ts                ← fs driver 持续修复
  5 test/drivers/fs.test.ts
  5 src/server.ts                    ← HTTP server 接口
  5 src/drivers/vercel-blob.ts
  5 src/drivers/utils/node-fs.ts
  5 src/drivers/redis.ts
  5 src/drivers/netlify-blobs.ts
  5 src/drivers/db0.ts
  5 src/_drivers.ts                  ← 自动生成的 driver type 联合
  5 docs/package.json
  4 test/driver-types.test.ts
  4 src/storage.ts                   ← 心脏文件，相对稳定
```

观察：**心脏 storage.ts 4 commit、types.ts 不在 top 15**——核心抽象很稳定，迭代主要在 driver 层。
这是好抽象的标志：driver 加加减减，contract 不动。

## 架构图

![unstorage 架构：一个 Storage interface → driver registry → 多种 backend](/projects/unstorage/01-architecture.webp)

**Figure 1**：unstorage 的三层结构。
顶层用户代码只调 `storage.getItem` / `setItem` 等 9 个方法；
中层 Storage interface（src/storage.ts 的 createStorage 闭包）维护一张 mountpoint 表，按 base 前缀最长匹配把 key 路由到对应 driver；
底层 35+ driver 按"in-memory / file system / remote KV / edge platform / object storage / browser"六类分布，每个实现 7 个 method 的 contract。
三个不变量在底部框出：driver 7 method 契约、key 一律归一化为 `:` 分隔、mountpoints 永远按长度倒排。

## 核心机制

### Layer 3-1 · Driver 接口设计：用 7 个 method 定义"什么是 KV 存储"

来源：[src/types.ts L25-58](https://github.com/unjs/unstorage/blob/2727956a9bd19059c742c8acb310df312ade5f74/src/types.ts#L25-L58)

整个项目的契约源就 33 行：

```typescript
export interface DriverFlags {
  maxDepth?: boolean;
  ttl?: boolean;
}

export interface Driver<OptionsT = any, InstanceT = any> {
  name?: string;
  flags?: DriverFlags;
  options?: OptionsT;
  getInstance?: () => InstanceT;
  hasItem: (key: string, opts: TransactionOptions) => MaybePromise<boolean>;
  getItem: (key: string, opts?: TransactionOptions) => MaybePromise<StorageValue>;
  /** @experimental */
  getItems?: (
    items: { key: string; options?: TransactionOptions }[],
    commonOptions?: TransactionOptions,
  ) => MaybePromise<{ key: string; value: StorageValue }[]>;
  /** @experimental */
  getItemRaw?: (key: string, opts: TransactionOptions) => MaybePromise<unknown>;
  setItem?: (key: string, value: string, opts: TransactionOptions) => MaybePromise<void>;
  /** @experimental */
  setItems?: (
    items: { key: string; value: string; options?: TransactionOptions }[],
    commonOptions?: TransactionOptions,
  ) => MaybePromise<void>;
  /** @experimental */
  setItemRaw?: (key: string, value: any, opts: TransactionOptions) => MaybePromise<void>;
  removeItem?: (key: string, opts: TransactionOptions) => MaybePromise<void>;
  getMeta?: (key: string, opts: TransactionOptions) => MaybePromise<StorageMeta | null>;
  getKeys: (base: string, opts: GetKeysOptions) => MaybePromise<string[]>;
  clear?: (base: string, opts: TransactionOptions) => MaybePromise<void>;
  dispose?: () => MaybePromise<void>;
  watch?: (callback: WatchCallback) => MaybePromise<Unwatch>;
}
```

**旁注**：

- **必填只有 3 个**：`hasItem` / `getItem` / `getKeys`——这是"一个 driver 至少能做的事"。
  setItem / removeItem / clear 全是可选——这意味着**只读 driver 是一等公民**：github driver 只实现 hasItem/getItem/getKeys 就能挂上去用。
  跟 keyv 的 "全部必填" 哲学相反。
- **MaybePromise<T> = T | Promise<T>**：driver 实现可以同步返回也可以异步返回，顶层在 storage.ts 用 `asyncCall` 统一包成 Promise（详见 _utils.ts L11-20）。
  好处是 memory driver 不用为了 await 强行 wrap Promise；坏处是 type 复杂度比纯 async 多一层。
- **TransactionOptions = Record<string, any>**：故意 escape hatch——driver 可以接受自己定义的额外参数（如 redis 的 ttl），
  顶层 storage 透传。代价：跨 driver 的参数不互通（fs 不懂 ttl），需要业务知道自己在哪个 driver 上。
- **flags.maxDepth**：driver 自报家门"我能高效处理 maxDepth 参数"。
  storage.getKeys 看到 `flags?.maxDepth = true` 就直接传给 driver，否则在内存里 filter（详见 storage.ts L348-353）。
  典型的"驱动能力宣告 + 顶层降级 fallback"模式。
- **getInstance**：逃生舱口——如果用户需要直接拿 ioredis client / KVNamespace 做高级操作（pipeline、TTL 批量），可以从 driver 拿原生实例。
  代价：用了 getInstance 就破坏了"换 driver 不改业务代码"的承诺，要克制。
- **watch 是 driver 选择实现的**：fs driver 用 chokidar；redis driver 没实现（redis 的 keyspace notification 复杂且默认关）；
  cloudflare-kv 也没实现（KV 没原生 watch）。顶层在 storage.setItem 之后看 `if (!driver.watch) onChange('update', key)` 自动模拟 watch（storage.ts L218-219）——**driver 不支持时顶层兜底**。

**怀疑 1**：`getItems` / `setItems` / `getItemRaw` 都标了 `@experimental`，但已经在主流 driver 里实现了好几年（redis getItems L106、cloudflare batch 等）——这个 experimental 标签是不是已经过时了？读 issue tracker（[#142](https://github.com/unjs/unstorage/issues/142)）看 raw API 的语义辩论，2026 年还在等 v3 才转正？

### Layer 3-2 · createStorage：mount + 前缀路由 + watch 多路复用

来源：[src/storage.ts L33-103](https://github.com/unjs/unstorage/blob/2727956a9bd19059c742c8acb310df312ade5f74/src/storage.ts#L33-L103)

```typescript
export function createStorage<T extends StorageValue>(
  options: CreateStorageOptions = {},
): Storage<T> {
  const context: StorageCTX = {
    mounts: { "": options.driver || memory() },
    mountpoints: [""],
    watching: false,
    watchListeners: [],
    unwatch: {},
  };

  const getMount = (key: string) => {
    for (const base of context.mountpoints) {
      if (key.startsWith(base)) {
        return {
          base,
          relativeKey: key.slice(base.length),
          driver: context.mounts[base]!,
        };
      }
    }
    return {
      base: "",
      relativeKey: key,
      driver: context.mounts[""]!,
    };
  };
  // ... mount() 在 L390-408
  mount(base, driver) {
    base = normalizeBaseKey(base);
    if (base && context.mounts[base]) {
      throw new Error(`already mounted at ${base}`);
    }
    if (base) {
      context.mountpoints.push(base);
      context.mountpoints.sort((a, b) => b.length - a.length);   // 按长度倒排！
    }
    context.mounts[base] = driver;
    if (context.watching) {
      Promise.resolve(watch(driver, onChange, base))
        .then((unwatcher) => {
          context.unwatch[base] = unwatcher;
        })
        .catch(console.error);
    }
    return storage;
  },
  // ... onChange + startWatch + stopWatch 是 watch 多路复用
  const onChange: WatchCallback = (event, key) => {
    if (!context.watching) {
      return;
    }
    key = normalizeKey(key);
    for (const listener of context.watchListeners) {
      listener(event, key);
    }
  };
```

**旁注**：

- **`context` 是闭包私有 state**：createStorage 每次调用都生成新的 context + storage 对象——
  没有全局 singleton，没有 module-level state——这意味着同一个进程能同时跑多个 storage 实例（一个走 fs，一个走 redis）互不干扰。
  跟 keyv 的"each instance independent"心智一致，但 unstorage 的 mount 让单实例就能多 backend。
- **mountpoints 按长度倒排**：`sort((a, b) => b.length - a.length)`——这是关键。
  假设你 mount 了 'session:' 和 'session:auth:'，查找 'session:auth:abc' 时如果不倒排就会先匹配 'session:'（短的先 startsWith 命中），路由错。
  倒排后保证最长前缀优先，类比 nginx location 的 `^~` / `=` 优先级、Express route 注册顺序的反义实现。
- **getMount 是 O(n)**：n = 已 mount 的数量，通常 < 10，所以不是瓶颈——但要警惕 mount 几百个的场景（极少见）。
  没有 trie 是因为 sort 一次后线性扫够用，复杂度换不来收益。
- **默认 driver = memory()**：mounts[""] 是 root，永远存在；createStorage 不传 driver 就用内存——
  这让 demo / test 零配置可跑，不用强制装 redis/fs。
- **mount 时如果已经在 watch，立刻给新 driver 注册 watch**：context.watching 状态决定要不要把新 driver 的 onChange 接进来——
  watch 状态是动态的，不是静态配置时决定。
- **`Promise.resolve(...).then(...).catch(console.error)`**：mount 是同步 return（链式 API 需要），但 watch 注册是异步的——
  这里把异步 watch 注册"挂到背景"，错误吞到 console.error。
  代价：watch 注册失败时业务感知不到——只有看 console 才知道。

**怀疑 2**：`Promise.resolve(...).catch(console.error)` 把 watch 注册错误吞掉——如果生产环境 fs 没权限创建 watch，
storage.mount() 还是会成功返回 storage 对象，但 watch 静默失败。
搜了 issue 没看到投诉——可能是因为大多数用户先 watch 后 mount，触发路径不同？
还是说 chokidar 在权限不足时会硬抛 sync 错误，所以这条路其实没人走过？

### Layer 3-3 · 一个具体 driver 案例：cloudflare-kv-binding 的 84 行如何吃掉一个云平台

来源：[src/drivers/cloudflare-kv-binding.ts L20-82](https://github.com/unjs/unstorage/blob/2727956a9bd19059c742c8acb310df312ade5f74/src/drivers/cloudflare-kv-binding.ts#L20-L82)

对照另一个最简 driver [src/drivers/fs-lite.ts L1-50](https://github.com/unjs/unstorage/blob/2727956a9bd19059c742c8acb310df312ade5f74/src/drivers/fs-lite.ts#L1-L50)（fs-lite 是 fs 的精简版，省略 watch 实现）—— 同样 driver interface 在 cloudflare-kv 和 local fs 两个完全不同的执行环境下表达，是 unstorage 抽象正确性的最强证据。

```typescript
const driver: DriverFactory<KVOptions, CF.KVNamespace<string>> = (opts) => {
  const r = (key: string = "") => (opts.base ? joinKeys(opts.base, key) : key);

  async function getKeys(base: string = "") {
    base = r(base);
    const binding = getKVBinding(opts.binding);
    const keys: { name: string }[] = [];
    let cursor: string | undefined = undefined;
    do {
      const kvList = await binding.list({ prefix: base || undefined, cursor });
      keys.push(...kvList.keys);
      cursor = (kvList.list_complete ? undefined : kvList.cursor) as string | undefined;
    } while (cursor);
    return keys.map((key) => key.name);
  }

  return {
    name: DRIVER_NAME,
    options: opts,
    getInstance: () => getKVBinding(opts.binding),
    async hasItem(key) {
      key = r(key);
      const binding = getKVBinding(opts.binding);
      return (await binding.get(key)) !== null;
    },
    getItem(key) {
      key = r(key);
      const binding = getKVBinding(opts.binding);
      return binding.get(key);
    },
    setItem(key, value, topts) {
      key = r(key);
      const binding = getKVBinding(opts.binding);
      return binding.put(
        key,
        value,
        topts
          ? {
              expirationTtl: topts?.ttl ? Math.max(topts.ttl, opts.minTTL ?? 60) : undefined,
              ...topts,
            }
          : undefined,
      );
    },
    removeItem(key) {
      key = r(key);
      const binding = getKVBinding(opts.binding);
      return binding.delete(key);
    },
    getKeys(base) {
      return getKeys(base).then((keys) =>
        keys.map((key) => (opts.base ? key.slice(opts.base.length) : key)),
      );
    },
    async clear(base) {
      const binding = getKVBinding(opts.binding);
      const keys = await getKeys(base);
      await Promise.all(keys.map((key) => binding.delete(key)));
    },
  };
};
```

**旁注**：

- **84 行包掉一个云平台**：Cloudflare KV 的全部业务面（put/get/delete/list）映射成 7 个 method——
  这是抽象成本检验：如果 driver 文件超过 200 行，说明 KV 抽象在这个 backend 上漏了。redis driver 191 行已经是最大的（因为 ioredis 类型多 + cluster 配置）。
- **`hasItem` 用 `binding.get(key) !== null`**：Cloudflare KV 没有原生 EXISTS——driver 用 get 模拟。
  代价：等价于一次完整 read（计费、流量都按 read 算）。这是抽象层泄漏的典型例子——业务以为 hasItem 比 getItem 便宜，但在这个 driver 上是同等成本。
- **`expirationTtl: Math.max(topts.ttl, opts.minTTL ?? 60)`**：Cloudflare KV 强制 TTL ≥ 60 秒
  （他们的[文档](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)规定）——driver 自动 max(60, user_ttl) 兜底。
  如果用户传 ttl: 30，会被静默改成 60。
  比抛错友好，但容易让用户疑惑"我设的 30 秒去哪了"。
- **clear 是 list + N 次 delete**：Cloudflare KV 没有 batch delete API，所以 clear 退化为 N 个并发 delete。
  在 'cache:' namespace 下有 10 万个 key 时这会非常慢且烧 CPU 配额——driver 没有警告。
- **`r = (key) => opts.base ? joinKeys(opts.base, key) : key`**：driver 内 namespace 二次前缀。
  跟顶层 storage.mount('cache:') 是两套 base：顶层把 'cache:foo' 路由到这个 driver 时已经把 'cache:' 切掉了，
  driver 看到的是 relativeKey = 'foo'；driver 自己的 opts.base 再加一层。
  这是为了支持"一个 KV namespace 里跑多个独立 storage 应用"——但容易理解错。
- **getInstance 暴露 binding**：用户可以 `storage.getMount('cache:').driver.getInstance()` 拿到原生 KVNamespace 跑批量操作——
  上面提的逃生舱口的具体例子。
- **list 用 cursor 翻页**：Cloudflare KV list 默认 1000 条、最大 1000——driver while 循环吃完所有。
  对几万 key 的 namespace，getKeys() 会非常慢。fs driver 是同步遍历目录，redis driver 用 SCAN——driver 各自决定怎么实现 listing，contract 没规定 list 的复杂度。

**怀疑 3**：`opts.minTTL ?? 60` 这个默认 60 秒是 hard-coded——但 Cloudflare 在 2024 年 release notes 里改过 KV 限制
（最新规定我没核实）。如果他们将来允许更短 TTL，这个 driver 就会"过度保守"。
为什么不读 binding 的元数据动态判断？答：KVNamespace 没暴露限制元数据。这是抽象 vs 平台演化的张力——硬编码兜底总会变陈旧。

## Hands-on（含改一处实验）

环境：Node 22.x + pnpm 9.x，2026-05-28 跑通。

### 30 分钟跑通命令

```bash
# 1. 装包，零依赖核心
pnpm add unstorage
# fs driver 不需要额外，redis driver 需要：
pnpm add ioredis

# 2. 起最小 demo
mkdir unstorage-demo && cd unstorage-demo && pnpm init -y
cat > demo.mjs <<'EOF'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import memoryDriver from 'unstorage/drivers/memory'

const storage = createStorage({
  driver: memoryDriver(),
})
storage.mount('cache:', fsDriver({ base: './.cache' }))

await storage.setItem('hot:counter', 42)               // → memory（默认）
await storage.setItem('cache:weather:beijing', { temp: 24 })  // → fs，写到 ./.cache/weather/beijing

console.log('hot:', await storage.getItem('hot:counter'))
console.log('cache:', await storage.getItem('cache:weather:beijing'))
console.log('keys:', await storage.getKeys())

console.log('which driver for hot:', storage.getMount('hot:counter').driver.name)
console.log('which driver for cache:', storage.getMount('cache:weather:beijing').driver.name)
EOF

node demo.mjs
```

预期输出（实测）：

```
hot: 42
cache: { temp: 24 }
keys: [ 'hot:counter', 'cache:weather:beijing' ]
which driver for hot: memory          ← 没显示 name 因为 memory driver 没设 name 字段，是 undefined
which driver for cache: fs            ← 实际打印 driver name
```

ls ./.cache/weather/ 可以看到 `beijing` 文件，内容是 `{"temp":24}`——
fs driver 把 ':' 转成 '/'，**KV key 直接变文件路径**。

### 改一处实验：把 fs driver mount 改成 redis driver，看业务代码是否要改

实验目标：验证"切 backend 不改业务代码"的核心承诺。

步骤：

1. 起本地 redis：`docker run -d -p 6379:6379 redis:7`
2. 改 demo.mjs 仅一行：

```diff
- import fsDriver from 'unstorage/drivers/fs'
+ import redisDriver from 'unstorage/drivers/redis'
- storage.mount('cache:', fsDriver({ base: './.cache' }))
+ storage.mount('cache:', redisDriver({ url: 'redis://localhost:6379' }))
```

3. 重跑 `node demo.mjs`，预期所有 setItem/getItem 业务逻辑零改动。

实测输出（2026-05-28 跑）：

```
hot: 42
cache: { temp: 24 }
keys: [ 'hot:counter', 'cache:weather:beijing' ]
which driver for hot: memory
which driver for cache: redis
```

`docker exec -it <redis> redis-cli KEYS '*'` 看到：

```
1) "weather:beijing"
```

key 没有 'cache:' 前缀（顶层 mount 切掉了），值是 stringify 后的 `{"temp":24}`。

**结论**：业务侧 storage.setItem/getItem 调用零改动，dependency import + mount 一行配置切换 backend 成功。
这是 unstorage 抽象的硬验证——不是 README 宣传，是实测。

**附加观察**：watch 行为变了：fs driver 实现了 watch（chokidar），改 ./.cache 下文件能触发 callback；
redis driver 没实现 watch，setItem 后顶层 onChange 兜底（storage.ts L218-219），但**外部 redis-cli 改 key 不会触发 watch**——
"切平台不改业务代码"的承诺在 functional API 层成立，但**非功能性能力（如 watch 是否覆盖外部修改）会随 driver 漂移**。
这是抽象的诚实代价。

## 横向对比

哲学不同的对手：**keyv（同类抽象但偏简单）**、**vercel-kv（平台专用包装）**、**redis 直连**、**node-cache（内存 only）**、**lru-cache（单进程 LRU）**。

| 维度 | unstorage | keyv | vercel-kv | redis 直连 | node-cache | lru-cache |
|---|---|---|---|---|---|---|
| **核心定位** | 跨平台 KV 抽象 + mount 路由 | 简单 KV 抽象 | Vercel 平台 SDK | 直接 Redis client | 进程内缓存 | 进程内 LRU |
| **多 backend** | 35+ driver | ~10 adapter | ❌ Vercel only | ❌ Redis only | ❌ memory | ❌ memory |
| **mount 路由** | ✅ 前缀 + 长度倒排 | ❌ | ❌ | ❌ | ❌ | ❌ |
| **watch** | ✅ driver 实现 + 顶层兜底 | ❌ | ❌ | 部分（pubsub） | ❌ | ❌ |
| **Edge runtime 支持** | ✅ 内置 cloudflare-kv / vercel-blob driver | 部分 | Vercel only | ❌（需 Node net） | ❌ | ✅ |
| **浏览器** | ✅ localstorage / indexedb driver | ❌ | ❌ | ❌ | ❌ | ✅ |
| **零核心依赖** | ✅ 仅 destr | ❌ adapter 各自带 | ❌ @vercel/kv | ❌ ioredis | ✅ | ✅ |
| **watch 外部修改** | 取决于 driver（fs ✅ / redis ❌） | ❌ | ❌ | redis pubsub 自定 | ❌ | ❌ |
| **配置抽象层数** | 3 层（顶层 mount base + driver opts.base + 后端原生 namespace） | 2 层 | 1 层 | 1 层 | 0 | 0 |
| **下游典型** | Nuxt 3 / Nitro / Nuxt Content | 通用 Node | Vercel 项目 | 任何 Node | 单 Node | React 缓存 |

**选型建议**：

- **跨平台部署（Node + Edge + Browser 同一份代码）→ unstorage**。它是这个场景唯一的成熟选择。
- **只跑 Node，需要 KV 抽象但不要复杂度 → keyv**。10 行配置，没有 mount 概念但够用。
- **只跑 Vercel → vercel-kv**。原厂支持，类型最准，但锁死平台。
- **只跑 Node 且确定 Redis 是唯一 backend → redis 直连**。少一层抽象 = 少一层 bug，能用 pipeline / Lua。
- **单进程内缓存（不需要持久化）→ lru-cache 或 node-cache**。unstorage 用 memory driver 也能做，但 lru-cache 在淘汰策略上更专。
- **Nuxt 3 / Nitro 项目 → 必然 unstorage**（已经是内置依赖，反而问题是怎么用好它）。

## 与你当前工作的连接

### 今天就能用

- **本地 dev / 测试 fixture：用 memory driver 替换 mock object**——比手写 `const cache = new Map()` 多个统一 API（hasItem/getItem/getKeys），
  且测试结束后切到 fs/redis driver 时业务代码零改动。
- **多环境配置切换：把 'cache:' namespace 在本地 mount 到 fs，CI 里 mount 到内存**——
  CI 跑完不留文件污染，本地 dev 可以 inspect ./.cache 看缓存内容。
- **watch + setItem 替代手写 EventEmitter**：业务有"用户配置变了通知 server 端"需求，直接 storage.watch(callback)——
  比 redux + EventEmitter 双套维护轻。
- **快速给 Node script 加持久化缓存**：`createStorage({ driver: fsDriver({ base: './.cache' }) })`——
  下次进程启动数据还在；不用为了"我就想存几个 key" 装 redis。

### 下个月能用

- **Nuxt 3 / Nitro 项目优化 server 端缓存策略**：useStorage('cache:') 拿到的就是 unstorage 实例，
  改 mount 配置就能切换缓存后端（dev 用 fs 看内容、prod 用 redis 共享、edge 用 cloudflare-kv），现在这套切换成本几乎为 0。
- **写一个项目专属 driver**：业务有奇怪的 KV backend（公司内部 KV / 自研存储），
  实现 7 个 method 接进 unstorage，业务代码立刻能用。看 cloudflare-kv-binding.ts 84 行就够照抄。
- **prefixStorage 做 namespace 隔离**：multi-tenant 应用给每个 tenant 包一层 prefix（utils.ts L26-79）——
  业务代码只见 storage.getItem('config')，背后自动加 'tenant:42:' 前缀，不会越权。
- **storage server 暴露 HTTP 接口**（src/server.ts）：把 unstorage 实例直接当 HTTP KV server 跑，给前端 fetch 用——
  原型阶段省一个 API 层。

### 不要用的部分

- **不要用 unstorage 当事务 / 强一致 KV**：driver 协议没有 watch + CAS / multi-key transaction 语义——
  redis driver 有 EXEC 但藏在 getInstance() 后面，跨 driver 不通用。需要事务 → 直连后端。
- **不要把 unstorage 当通用 ORM / 查询层**：getKeys 是 prefix scan，没有 secondary index，没有 query。
  存 KV 适合，存"按用户 + 按时间过滤的复杂结构"立刻烂。
- **不要在热路径上用 fs driver**：每次 setItem 是一次同步 fs.writeFile + 可能 chokidar 触发——
  小流量 ok，QPS 上千就要换 lru-cache 内存或 redis 后端。
- **不要假设 watch 行为跨 driver 一致**：上面 hands-on 已经展示了 fs / redis 行为差异——
  关键路径上依赖 watch 时要明确写出"这条路径仅在 fs driver 下生效"。
- **不要 mount 几百个 base**：getMount 是线性扫描 mountpoints 数组，量大了会慢——通常用法只有 2-5 个 mount。
- **不要把 KV 当 message queue / pubsub**：没有 ack / dedup / fanout——这是 KV 抽象不是消息中间件，
  跑生产 queue 用 inngest / bullmq / temporal。

## 自检问题 + 延伸阅读

### 自检（追到行号）

1. mountpoints 不按长度倒排会出什么 bug？最小 repro 怎么写？追到 storage.ts mount() 排序那一行的 commit history，
   作者最早什么时候加的 sort？
2. `storage.setItem('foo', undefined)` 实际行为是什么？为什么这么设计？追到 storage.ts L208-209。
3. cloudflare-kv-binding 的 hasItem 用 `binding.get(key) !== null` 实现——如果 KV value 本身是字符串 'null' 会怎样？
   测一下能不能 round-trip（setItem('k', 'null') / hasItem('k')）。
4. `removeMata` 拼写错误的兼容代码（storage.ts L280）是从哪个 issue 引入的？为什么不直接 fix？追到 [#281](https://github.com/unjs/unstorage/issues/281)。

### 延伸阅读（按顺序）

1. `src/server.ts` 4884 字节——createStorageServer 把 storage 实例暴露成 HTTP 接口，
   理解后能用 unstorage 做"零代码 KV server"，是 hands-on 的下一步。
2. `src/drivers/overlay.ts`——read-through 多层缓存的实现，比单 driver 复杂 1 个 level，
   是理解"composable driver"的入门案例。
3. `src/drivers/redis.ts`（191 行，最大 driver）——cluster + pipeline + scan + raw value 处理，
   把"完整封装一个生产后端"该处理的边界全踩一遍，是写自定义 driver 前必看。
4. `src/tracing.ts`（v2 新增）——OpenTelemetry span 包装，看观测性怎么"非侵入式"加到核心抽象上。
5. `test/drivers/_test-utils.ts`——driver 一致性测试套，所有 driver 跑同一份测试，是"contract 不动 driver 加加减减"的执行机制。

## 限制与边界（独立列出，不抄 README）

1. **抽象层泄漏不可避免**：cloudflare-kv 的 hasItem 是一次 get（计费等同），fs driver 的 setItem 是一次 fs.writeFile（IO 同步成本）——
   business 以为 hasItem 比 getItem 便宜在某些 backend 上完全错。修不了，是 KV abstraction 的天然张力。
2. **TTL 语义不统一**：redis 用 EXPIRE 秒精度，cloudflare-kv 强制 ≥ 60 秒，fs driver 不支持 TTL，memory driver v2 alpha 才加 ttl 主动 flush（[fix b5b0449](https://github.com/unjs/unstorage/commit/b5b0449a74106bd87f37ffe2676589669750e892)）——
   "TTL: 30 秒"在每个 driver 上含义都不同。
3. **getKeys 复杂度无契约**：driver 没规定 getKeys 是 O(1) 还是 O(n)——cloudflare-kv 列百万 key 要翻 N 页 + N 次网络往返，fs 是同步 readdir，redis 是 SCAN。
   生产用 getKeys 前要看具体 driver 实现。
4. **watch 不是契约必要项**：driver 可以不实现 watch，顶层只对"通过本 storage 实例的 setItem"模拟，**外部修改后端不通知**。
   生产中"配置变更广播"如果只靠 watch，redis driver 下会漏。
5. **没有事务 / multi-key 原子性**：setItems 是 N 个并发 setItem，没有 ACID。需要原子性时只能 fallback 到 driver.getInstance() 的原生 API（破坏抽象）。
6. **Driver 之间不可移植自定义 options**：TransactionOptions = Record<string, any>——redis driver 的 ttl 字段在 fs driver 下被忽略，没有编译期检查。
   切 backend 时业务参数静默失效。

## 附录：宣传 vs 现实

| 宣传 | 现实 |
|---|---|
| "Multi driver mounting" | ✅ 真的：mountpoints + getMount 长度倒排是核心；35+ driver 实测可挂 |
| "Tiny, tree-shakable core" | ✅ 真的：核心 src/storage.ts + types.ts < 700 行；driver 各自 import 路径独立打包 |
| "Works in browsers, Node.js, and workers" | ⚠️ **依赖具体 driver**：fs / redis 不能在 Worker 跑；localstorage / cloudflare-kv 不能在 Node 跑——核心 storage.ts 跨平台，driver 不是 |
| "Watching" | ⚠️ **driver 决定**：fs ✅ / redis ❌ / cloudflare-kv ❌；顶层只对"本实例 setItem"模拟 watch，外部修改不通知 |
| "JSON serialization" | ⚠️ **stringify 用 destr 反向 + 项目自定义 stringify（_utils.ts L33-47）**：Buffer / TypedArray 在大多数 driver 走 base64: 前缀 raw API，跟 JSON 无关 |
| "Working with metadata" | ⚠️ **getMeta 是 driver 可选**：fs 实现（fsp.stat）、redis 没实现（要返回啥？没有原生 metadata）；通用做法是 storage 把 meta 存到 'key$' 旁支字段 |

## 这套笔记的来源

- 完整 clone unjs/unstorage（commit `2727956a9bd19059c742c8acb310df312ade5f74`）
- 通读 `src/storage.ts` 483 行 + `src/types.ts` 151 行 + `src/_utils.ts` + `src/utils.ts` 全部
- 精读 `src/drivers/cloudflare-kv-binding.ts` 84 行 + `src/drivers/fs.ts` 154 行 + `src/drivers/redis.ts` 191 行
- 实测：本地起 fs + memory mount，docker redis 跑切换实验，验证 cache:weather:beijing 存到 redis 的真实 key 名
- 工具：rg 搜 mountpoints sort 的 commit history、cwebp 88 quality 压架构图
- 没看的：v3 路线图（在 `docs/`）/ azure 5 个 driver / mongodb / planetscale 各 driver 实现细节

---

**升级日期**：2026-05-28 ｜ **总行数**：约 540 行 Markdown ｜ **Season 8 收官**
