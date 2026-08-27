---
title: lru-cache — 先定容量，再谈最近最少使用
description: 固定版本用 Map 加预分配链表做 LRU，TTL 默认不预删
来源: https://github.com/isaacs/node-lru-cache
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/isaacs/node-lru-cache
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 16b3a916662ab449d496b7b4b4f04132565d1d28
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.5.2
---

## 是什么

`lru-cache` 是一份 **有界内存表**：你必须先说清容量（条数、字节或 TTL），它再用“最近用过的留着、最久没碰的挤出去”管理条目。日常类比：冰箱门上的便利贴栏——栏位有限，新纸条贴上来，最旧的那张掉下去；过期牛奶默认还占着格子，除非你伸手去拿。

固定 11.5.2 的 npm 包名就是 `lru-cache`，无 production 依赖，许可 BlueOak-1.0.0。常见写法：

```ts
import { LRUCache } from "lru-cache"

const cache = new LRUCache<string, string>({ max: 500 })
cache.set("user:1", "Ada")
cache.get("user:1")
```

`max`、`maxSize`、`ttl` 必须至少给一个，否则构造直接 `TypeError`。Node 引擎声明是 `20 || >=22`。

## 为什么重要

不读固定源码，容易把它当成“带过期时间的 `Map`”或“会自动清 TTL 的后台定时器”：

- 为什么空选项对象不能 `new LRUCache({})`
- 为什么过期项 `has()` 是 `false`，却可能还占着 `max` 名额
- 为什么 `get()` 默认会删过期项，而 `peek()` 不会改 recency
- 为什么 `fetch()` 没有 `fetchMethod` 时只是 `get` 的别名

一句话：这是 **预分配的 LRU 链表 + 可选 TTL/尺寸**，不是分布式缓存，也不是 unstorage 那种跨 backend 门面。

## 核心要点

固定 11.5.2 的主链可以拆成四层：

1. **有界构造**：`max` 决定预分配的 key/value 数组和 typed-array 前后指针。`max === 0 && ttl === 0 && maxSize === 0` 被拒绝。只有 TTL、没有 `max`/`maxSize`/`ttlAutopurge` 时发出 `LRU_CACHE_UNBOUNDED` 警告。
2. **链表 + Map**：`#keyMap` 找下标，`#next`/`#prev` 维护 MRU 顺序，`#free` 回收被删槽位。满员时 `#evict` 丢掉 head。
3. **TTL 是惰性的**：默认不预删。`has()` 对过期项返回 `false` 但不删除。`get()` 默认 `delete` 并返回 `undefined`，除非 `allowStale` 或 `noDeleteOnStaleGet`。`ttlAutopurge` 才会主动扫。
4. **特殊入口**：`set(key, undefined)` 等于 `delete`。单条超过 `maxEntrySize`（默认等于 `maxSize`）会删旧值且不写入。`fetch()` 只在提供 `fetchMethod` 时走后台 Promise 合并；`memo()` 没有 `memoMethod` 会 throw。

`dump()` / `load()` 用来序列化，过期项也会进 dump。diagnostics channel 是可选观测，不是缓存合同。

## 实践示例

### 案例 1：条数上限，满员挤最旧

```ts
const cache = new LRUCache({ max: 2 })
cache.set("a", 1)
cache.set("b", 2)
cache.get("a")
cache.set("c", 3)
cache.has("b") // false，b 被挤掉
```

`get("a")` 把 `a` 移到尾部，下一次插入牺牲的是最久没碰的 `b`。

### 案例 2：TTL 不会自己扫地

```ts
const cache = new LRUCache({ max: 100, ttl: 50 })
cache.set("token", "x")
// 过了 50ms 之后：
cache.has("token") // false
cache.get("token") // undefined，并且这条被删掉
```

没有 `ttlAutopurge` 时，过期项在被 `get`/`fetch` 碰到之前仍可能占着容量。`has()` 不会帮你回收。

### 案例 3：fetch 只在你给了方法时才像缓存加载器

```ts
const cache = new LRUCache({
  max: 50,
  fetchMethod: async (key) => loadUser(key),
})
const user = await cache.fetch("42")
```

没传 `fetchMethod` 时，`fetch(key)` 等价于 `get(key)`，不会发请求。需要同步计算时用 `memoMethod` + `memo()`。

## 踩过的坑

1. **`new LRUCache()` 或空对象**：缺少 `max` / `maxSize` / `ttl` 会 throw，不是“无限 Map”。
2. **把 TTL 理解成后台 cron**：默认惰性。只设 TTL 还不设 `max` 会警告无界增长。
3. **用 `has()` 判断“还在不在内存”**：过期项对 `has` 是 false，但可能还没从链表摘掉。
4. **`set(key, undefined)` 当写入空值**：固定版本当删除。
5. **把 README 的 benchmark 或“比 node-cache 快”写进结论**：本轮未跑 benchmark。
6. **把它和 [[unstorage]] 当成同一个抽象**：unstorage 是跨 driver 门面；本库是进程内淘汰器。unstorage 的 `lru-cache` driver 默认 `max: 1000` 包的就是它。

## 适用 vs 不适用场景

**适用**：

- Node / 浏览器进程内要硬上限的热数据
- 需要 `dispose` 关闭句柄、或 `fetchMethod` 合并同行请求
- 能接受“过期项可能暂时占坑”

**不适用**：

- 跨进程 / 跨机器共享缓存（那是 Redis 或 unstorage 挂远程 driver）
- 需要严格的“到期立刻消失”而无法接受 `ttlAutopurge` 的成本
- 想把未测吞吐写成选型结论

## 固定版本边界

- 本文绑定 `isaacs/node-lru-cache@16b3a916...`，npm 包 `lru-cache@11.5.2`。
- GitHub tag `v11.5.2` 与 npm `gitHead` 指向同一提交。
- `engines` 为 `20 || >=22`；无 production 依赖。
- 本文只做源码静态审查，没有跑 tap / benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **容量是构造合同，不是可选项**——三者全缺直接 throw
2. **LRU 是链表移动，TTL 是惰性检查**——两套规则叠在同一张表上
3. **`has` 和 `get` 对过期项的副作用不同**
4. **加载器不是内置的**——`fetch` / `memo` 都要你自己给方法

## 应用型自测

1. `new LRUCache({})` 能得到一个无限大的 Map 吗？
2. 一条 TTL 过期后，只调用 `has(key)`，这条还会占 `max` 吗？
3. 没传 `fetchMethod` 时，`cache.fetch("x")` 会去网络吗？

检查点：

1. 不能。构造抛 `At least one of max, maxSize, or ttl is required`。
2. 可能还占着。`has` 返回 false，但不删除；回收发生在 `get` 或驱逐时。
3. 不会。此时 `fetch` 退化成 `get`。

## 延伸阅读

- 文档：[isaacs.github.io/node-lru-cache](https://isaacs.github.io/node-lru-cache/)
- 固定源码：[isaacs/node-lru-cache](https://github.com/isaacs/node-lru-cache) —— 本文绑定提交 `16b3a916662ab449d496b7b4b4f04132565d1d28`
- [[unstorage]] —— 跨运行时 KV 门面；内置 `lru-cache` driver
- [[redis]] —— 进程外键值；不是这份内存表

## 关联

- [[unstorage]] —— 门面 vs 进程内淘汰器
- [[redis]] —— 需要共享或持久时的对照
- [[memcached]] —— 经典外部内存缓存，本页不审查

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[memcached]] —— Memcached — 经典内存缓存
- [[unstorage]] —— unstorage — 跨运行时的 KV 门面，不是万能存储
