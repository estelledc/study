---
title: unstorage — 跨运行时的 KV 门面，不是万能存储
description: 固定版本把 key 收成冒号路径，再按最长 mount 前缀交给 driver
来源: https://github.com/unjs/unstorage
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/unstorage
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e2febded37759ec796e7d0233d4eb68c92423cc2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.17.5
---

## 是什么

unstorage 是一份 **KV 门面**：业务只对 `getItem` / `setItem` 说话，底下哪个 driver 干活由 mount 表决定。日常类比：酒店前台——你报房间号，前台按楼层把请求分给不同仓库，你不用自己跑去地下室或云端货架。

固定 1.17.5 的 npm 包名是 `unstorage`。不传 driver 时，根挂的是内存 `Map`：

```ts
import { createStorage } from "unstorage"

const storage = createStorage()
await storage.setItem("user:42", { name: "Ada" })
await storage.getItem("user:42")
```

driver 走独立子路径，例如 `unstorage/drivers/redis`、`unstorage/drivers/lru-cache`。核心包自己还依赖 `destr`、`h3`、`lru-cache`、`ofetch` 等；不是“零依赖薄封装”。

## 为什么重要

不读固定源码，旧印象会把 unstorage 说成“7 个 method + 35 个 magically 安静的 backend”：

- 为什么 `foo/bar` 和 `foo:bar` 会落到同一条路径
- 为什么 `mount("cache", …)` 之后 `setItem("cache:user")` 不再走默认 memory
- 为什么 `Buffer` 走 `setItem` 会 **throw**，不是被 JSON 悄悄吃掉
- 为什么缺 `setItem` 的 driver 写成只读静默，而不是配置错误立刻炸

一句话：门面负责 **规范化 key + 最长前缀路由 + 序列化**，backend 各自实现宽严不同的子集。

## 核心要点

固定 1.17.5 的主链可以拆成五步：

1. **默认根**：`createStorage()` 把 `""` 挂到 `memory()`。`hasItem` / `getItem` / `getKeys` 是 driver 必填；`setItem`、`removeItem`、`clear`、`watch`、raw/batch 都是可选。
2. **key 规范化**：`normalizeKey` 先丢掉 `?` 查询串，再把 `/` 与 `\` 收成 `:`，折叠连续冒号，去掉首尾冒号。`normalizeBaseKey("cache")` 变成 `cache:`。
3. **最长前缀**：mountpoint 按长度降序排。`getMount` 找第一个 `key.startsWith(base)`。同一 base 再 `mount` 会 throw。
4. **写路径**：`value === undefined` 改走 `removeItem`。否则 `stringify`：primitive 用 `String()`，纯对象/数组走 `JSON.stringify`，有 `toJSON` 则递归，否则抛 `[unstorage] Cannot stringify value!`。缺 `setItem` 直接 return。
5. **读路径**：`getItem` 一律 `destr`。raw 通道优先 `getItemRaw`，否则把 `base64:` 前缀解回去。meta 存在 `key + "$"`。

`prefixStorage` 只是给方法加前缀，不是新的 backend。HTTP server 是 h3 handler：GET 读、PUT 写、DELETE 删；路径以 `:` 或 `/` 结尾时当 base key 列目录。

## 实践示例

### 案例 1：默认内存，再挂一层 LRU

```ts
import { createStorage } from "unstorage"
import lruCacheDriver from "unstorage/drivers/lru-cache"

const storage = createStorage()
storage.mount("hot", lruCacheDriver({ max: 500 }))

await storage.setItem("hot:session", { id: 1 })
await storage.setItem("cold:log", "keep in Map")
```

`hot:session` 的相对 key 是 `session`，交给 `lru-cache` 驱动（源码默认 `max: 1000`，这里覆盖成 500）。`cold:log` 仍在根上的 `Map`。

### 案例 2：对象能写，二进制要走 raw

```ts
await storage.setItem("user:1", { ok: true })
await storage.setItemRaw("blob:1", new Uint8Array([1, 2, 3]))
```

普通 `setItem` 不会“吞掉” `Uint8Array`——`stringify` 会 throw。raw 路径在没有 `setItemRaw` 时写成 `base64:` 前缀字符串。

### 案例 3：前缀包装清一组 key

```ts
import { prefixStorage } from "unstorage"

const v2 = prefixStorage(storage, "v2")
await v2.setItem("user:1", { name: "Ada" }) // 实际 key = v2:user:1
await v2.clear()
```

`prefixStorage` 改的是调用方看到的 key；`getKeys` 会把前缀剥掉再返回。

## 踩过的坑

1. **把 driver 合同写成固定 7 个 method**：必填只有 `hasItem` / `getItem` / `getKeys`；写、清、watch、raw、batch 都可能不存在。
2. **以为 `/` 和 `:` 是两种命名空间**：门面会把斜杠收成冒号，再按 `cache:` 这种 base 做路由。
3. **把缺凭证理解成“永远返回 null”**：有的 driver 会在第一次 IO 才连；门面自己对只读 driver 的 **写** 才是静默 no-op。
4. **用 `setItem` 缓存 `Buffer`**：会 throw。走 `setItemRaw`。
5. **把 25KB / 35+ driver / “切平台零开销”写成结论**：固定提交有 33 个 builtin 模块，还有真实生产依赖；体积与吞吐本轮未测。
6. **把 `2.0.0-alpha.9` 当成 1.17.5 行为**：alpha 未绑定。

## 适用 vs 不适用场景

**适用**：

- 同一套 KV 调用要换 memory / 文件 / Redis / 边缘 KV，并且接受“最小公约数”
- 需要按前缀把不同 backend 挂到同一个 storage
- 已经在 Nitro / Nuxt 的 `useStorage()` 里，只想看门面合同

**不适用**：

- 需要跨 key 事务、二级索引或查询计划
- 要把未实测的 bundle、QPS 或“比 keyv 快”写成选型结论
- 准备跟 v2 alpha 走，却仍按 1.17.5 推理

## 固定版本边界

- 本文绑定 `unjs/unstorage@e2febded...`，npm 包 `unstorage@1.17.5`。
- GitHub annotated tag `v1.17.5` 指向此提交；npm latest 同号，**未发布 `gitHead`**。
- 同仓 dist-tag `alpha` 指向 `2.0.0-alpha.9`，不在本文范围。
- 本文只做源码静态审查，没有装依赖、连后端或跑 HTTP server，状态保持 `UNVERIFIED`。

## 学到什么

1. **门面先改 key，再找 driver**——斜杠、查询串和 mount 前缀都在进 backend 之前处理完
2. **只读是缺方法，不是抛错**——没有 `setItem` 就当写失败被吞掉
3. **JSON 通道和 raw 通道是两条合同**——不会帮你把 `Uint8Array` 偷偷塞进 `JSON.stringify`
4. **`lru-cache` 在这里是 driver，不是另一个门面**——进程内淘汰策略见 [[lru-cache]]

## 应用型自测

1. `createStorage()` 不传 `driver` 时，第一次 `setItem` 会不会因为“没 backend”失败？
2. `mount("cache", redis)` 之后，`setItem("cache/user", 1)` 走哪边？
3. 对 `new Uint8Array([1])` 调用 `setItem`，固定版本会写成奇怪字符串吗？

检查点：

1. 不会。根挂的是 `memory()`，`Map` 直接收。
2. Redis。`cache/user` 先变成 `cache:user`，最长前缀 `cache:` 赢。
3. 不会。`stringify` 对非纯对象 throw。

## 延伸阅读

- 文档：[unstorage.unjs.io](https://unstorage.unjs.io/)
- 固定源码：[unjs/unstorage](https://github.com/unjs/unstorage) —— 本文绑定提交 `e2febded37759ec796e7d0233d4eb68c92423cc2`
- [[lru-cache]] —— 进程内 LRU；本库 `lru-cache` driver 的默认后端
- [[ofetch]] —— 同属 unjs，HTTP wrapper，不是 KV
- [[redis]] —— `ioredis` driver 常见的生产后端；本页不审查 Redis

## 关联

- [[lru-cache]] —— 进程内淘汰 vs 跨运行时门面
- [[ofetch]] —— 另一块 unjs 基础设施
- [[redis]] —— 常见 driver 后端
- [[nuxt]] —— 上层框架会露出 `useStorage()`；本页不审查 Nuxt
- [[minio]] —— 对象存储，不是这份 KV 抽象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lru-cache]] —— lru-cache — 先定容量，再谈最近最少使用
- [[minio]] —— MinIO — S3 兼容对象存储
- [[redis]] —— Redis — 内存键值数据库
