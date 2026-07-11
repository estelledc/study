---
title: unstorage — 让 KV 存储不绑死运行时的统一抽象层
来源: 'https://github.com/unjs/unstorage'
日期: 2026-05-30
分类: projects
难度: 初级
---

## 是什么

unstorage 是一个**让你写一遍读写 KV 的代码、能跑在 Node / 浏览器 / Cloudflare Workers / Vercel Edge / Deno 上**的 JS 库。日常类比：像旅游用的万能插头——墙上插孔每个国家不一样（英标、欧标、美标），但你只插一次万能插头，背后哪种规格由插头决定。

你的业务代码长这样：

```ts
import { createStorage } from 'unstorage'
const storage = createStorage({ driver: redisDriver({ host: 'localhost' }) })
await storage.setItem('user:42', { name: 'Jason' })
```

明天部署到 Cloudflare Workers，你只把 `redisDriver` 换成 `cloudflareKVDriver`——上面那两行 `setItem` 一字不改。**业务层不感知后端**，这是 unstorage 全部的设计目标。

## 为什么重要

不理解 unstorage，下面这些事说不清：

- 为什么 Nuxt 3 / Nitro 的 `useStorage()` 跨平台部署不用改业务代码——它内置 unstorage
- 为什么"35+ driver"里 fs / redis / s3 / cloudflare-kv / upstash / indexeddb 都能塞进同一个 API
- 为什么 unstorage 核心包只有 ~25KB——driver 各自独立 entry，按需加载，没用上的不进 bundle
- 为什么"切平台只改一行"听起来像 Java 1995 的 write-once-run-anywhere——这次它真的做到了，因为它只抽象 KV 不抽象一切

## 核心要点

unstorage 的设计可以拆成 **三件事**：

1. **Driver 接口**：把 KV 操作的最小公约数定义成 7 个 method（`getItem` / `setItem` / `removeItem` / `getKeys` / `getMeta` / `hasItem` / `clear`）。任何后端只要实现这 7 个就接入了。类比：USB 协议——你做 U 盘还是鼠标，只要按 USB 来，电脑都认。

2. **Storage 门面**：`createStorage({ driver })` 返回一个 storage 对象，所有方法都是 async。业务调 `storage.getItem('key')`，门面把请求转给底下的 driver。类比：餐厅前台——你不直接喊后厨，你只对前台说话。

3. **mount 命名空间路由**：`storage.mount('/cache', redisDriver)` + `storage.mount('/sessions', fsDriver)`。同一个 storage 实例，前缀 `/cache/*` 走 Redis，前缀 `/sessions/*` 走文件系统。类比：办公室前台分流来访——找销售去 3 楼，找技术去 5 楼，前台只看名牌。

三件事拼起来：业务代码只对 storage 门面说话，运行时由你 createStorage 那一行决定。

## 实践案例

### 案例 1：Nuxt 3 server route 缓存 API 响应

```ts
// server/api/users/[id].get.ts
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const cache = useStorage('cache')           // Nuxt 内置 unstorage
  const cached = await cache.getItem(`user:${id}`)
  if (cached) return cached
  const user = await fetch(`https://api.example.com/users/${id}`).then(r => r.json())
  await cache.setItem(`user:${id}`, user)
  return user
})
```

**逐部分解释**：`useStorage('cache')` 拿到 Nuxt 给你配好的 storage（开发期默认 fs，生产配 Redis 或 Cloudflare KV）。`cache.getItem` / `setItem` 业务代码完全不变，部署到任何平台都一样。

### 案例 2：多 driver 挂载分流

```ts
import { createStorage } from 'unstorage'
import redisDriver from 'unstorage/drivers/redis'
import fsDriver from 'unstorage/drivers/fs'

const storage = createStorage()
storage.mount('/sessions', redisDriver({ host: 'localhost' }))
storage.mount('/logs', fsDriver({ base: './logs' }))

await storage.setItem('/sessions/abc', { userId: 42 })   // 路由到 Redis
await storage.setItem('/logs/2026-05-30', 'request log') // 路由到文件
```

业务调用看不到分流，但**读 sessions 走 Redis（快）、写 logs 走文件（便宜）**——靠 mount 路由实现。

### 案例 3：浏览器端版本化缓存

```ts
import { createStorage, prefixStorage } from 'unstorage'
import indexedbDriver from 'unstorage/drivers/indexedb'

const root = createStorage({ driver: indexedbDriver({ base: 'app' }) })
const v2 = prefixStorage(root, 'v2:')
await v2.setItem('user:42', { name: 'Jason' })  // 实际 key = v2:user:42

// 下次升级 v3，旧版本一键清除：
await prefixStorage(root, 'v1:').clear()
```

`prefixStorage` 包了一层前缀 wrapper，业务代码不写 `'v2:'`，但底层每个 key 都带上版本前缀。版本切换时清旧数据只调 `clear()`。

## 踩过的坑

1. **driver 配错失败安静**：Redis 认证错 / S3 credentials 缺 / Cloudflare KV binding 没声明，调用时不会立即抛错，常表现为 `getItem` 永远返回 `null`。先用 `setItem` 写一条测试 key 触发异常才能发现。

2. **key 分隔符歧义**：unstorage 把 `'foo:bar'` 和 `'foo/bar'` 都视作 namespace 路径。如果你 `mount('/cache', ...)` 又写 `setItem('cache:user:42')`，会被路由到 `/cache` 而不是落到默认 driver——业务以为是平铺 key 时容易撞车。

3. **JSON 自动序列化吞掉 binary**：默认 `setItem` 走 `JSON.stringify`，传 `Buffer` / `Uint8Array` / 自定义类会被吞掉或序列化成奇怪字符串。binary 必须用 `setItemRaw` / `getItemRaw` 走 raw 通道——不少人在图片缓存场景栽过这条。

4. **watch() 在大数据集会塌**：fs driver 用 chokidar 监整个目录，redis driver 走 keyspace notifications。key 数 > 10k 或更新频繁时 callback 排队，主流程被拖慢。watch 适合本地热更新场景，**不适合**当业务事件总线用。

## 适用 vs 不适用场景

**适用**：
- 同一份代码要跨多个 JS 运行时部署（Node / Workers / Edge / 浏览器）
- 开发期用本地 fs，生产换 Redis / Cloudflare KV，不想改业务代码
- 多 backend 分流（sessions 走 Redis、static 走 S3、logs 走 fs）
- Nuxt 3 / Nitro 项目（已经内置，直接用 `useStorage`）

**不适用**：
- 需要复杂查询（范围扫描、二级索引、聚合）→ 直接用对应数据库（[[postgresql]] / [[mongodb]]）
- 需要事务跨多 key → KV 抽象不保证多 key 原子性，去找 [[redis]] 原生 MULTI 或关系库
- 单机超高频读写（每秒 10 万次以上）→ 抽象层有 overhead，直接调 driver 客户端
- 需要消息队列语义（订阅、消费、ack）→ 用 [[kafka]] 之类专门工具

## 历史小故事（可跳过）

- **2022 年**：Pooya Parsa（Nuxt 核心维护者）从 Nitro 项目里抽出 unstorage 作为独立 npm 包发布。设计灵感来自 keyv（同类 KV 抽象），但 keyv 强调 TTL 缓存，unstorage 更看重 driver 多样性 + namespace 路由。
- **2023 年**：随 Nuxt 3 GA 和 edge runtime（Vercel / Cloudflare）兴起，unstorage 成为"切平台不改代码"的标配中间层，driver 数量快速涨到 30+。
- **2024 年**：v1 稳定，HTTP Storage 内置 server 让跨进程共享 storage 成为可能。
- **2026 年**：v2 alpha 系列迭代中（fs ignore、memory ttl 修复），读时 commit `2727956`（2026-05-28）。

## 学到什么

1. **抽象只覆盖最小公约数才能跨运行时**：unstorage 不抽象事务、不抽象查询，只抽象 7 个 KV method——少即是多，覆盖面反而更广
2. **Driver 模式 = 协议 + 适配器**：定一个接口让生态各自实现，比试图"一个 client 打天下"更可持续，35+ driver 都是社区贡献
3. **mount 比纯前缀更灵活**：同一个 storage 实例可以背靠多个 backend，业务代码不需要管哪个 key 在哪台机器上
4. **零基础学习者视角**：先理解"为什么要抽象"（跨平台部署痛点）再看 API，比一上来背 method 列表有用得多

## 延伸阅读

- [unstorage 官方文档](https://unstorage.unjs.io/)（driver 列表 + mount 用法 + 自写 driver 教程）
- [unjs/unstorage GitHub](https://github.com/unjs/unstorage)（源码 + issue 区有大量 driver 配置案例）
- [Nitro storage layer 文档](https://nitro.unjs.io/guide/storage)（看 unstorage 在框架里怎么被消费）
- [keyv 项目](https://github.com/jaredwray/keyv)（同类 KV 抽象，对比设计差异）
- [[redis]] —— unstorage 最常用 driver 后端之一
- [[nuxt]] —— Nuxt 3 server cache 内置 unstorage

## 关联

- [[nuxt]] —— Nuxt 3 / Nitro 用 unstorage 做 server cache，`useStorage()` 就是它
- [[redis]] —— unstorage 最常用的生产 driver 后端
- [[mongodb]] —— 需要复杂查询时该升级到的方向，unstorage 不覆盖
- [[postgresql]] —— 需要事务和关系建模时的替代
- [[kafka]] —— 需要消息流语义时的替代，unstorage 的 watch 不替代它
- [[prisma]] —— 数据建模与 ORM，配 unstorage 做缓存层很常见
- [[drizzle]] —— 同 Prisma 的另一选择，与 unstorage 解耦

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[minio]] —— MinIO — S3 兼容对象存储
- [[redis]] —— Redis — 内存键值数据库
