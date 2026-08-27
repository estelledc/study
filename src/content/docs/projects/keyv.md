---
title: Keyv — 带 TTL 的多后端 KV 抽象
description: adapter-first 的 Node KV 层，默认 Map，值以 {value, expires} 序列化
来源: https://github.com/jaredwray/keyv
日期: 2026-08-27
分类: 基础设施
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jaredwray/keyv
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e3f8f0099ea36bcd0b1ffcb62e7577c2c805281f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.6.0
---

## 是什么

Keyv 是一个 **adapter-first 的 Node.js 键值层**。日常类比：它不是仓库本身，而是仓库门口的统一柜台——你只对柜台说 `get` / `set`，后面接 Map、Redis 还是 SQLite，由 store 决定。

```js
import Keyv from "keyv";

const cache = new Keyv({ ttl: 60_000 });
await cache.set("session:1", { user: "ada" });
const session = await cache.get("session:1");
```

固定 `5.6.0` 默认 store 是 `Map`。写入时先把值包成 `{ value, expires }`，再交给 `@keyv/serialize`。TTL 以毫秒计；未设 TTL 则 `expires` 为 `undefined`。

## 为什么重要

不理解 Keyv，下面这些事都没法解释：

- 为什么同一套 `get` / `set` 能换 Redis / SQLite / Mongo，而不改业务调用
- 为什么默认 key 会变成 `keyv:session:1`，而不是你传入的裸字符串
- 为什么过期项常常在下一次读取时才消失，而不是有一个后台扫表
- 为什么它和进程内 [[node-cache]] 不是同一类东西：一个抽象存储，一个本地对象表

## 核心要点

固定源码把路径拆成五步：

1. **构造**：第一个参数可以是 adapter，也可以是 options。合法 store 必须是 `Map`，或同时具备 `get` / `set` / `delete` / `clear`。
2. **前缀**：`namespace` 默认 `"keyv"`，`useKeyPrefix` 默认 `true`，于是 key 写成 `namespace:key`。
3. **序列化**：`serializeData` 先可选压缩 `value`，再调用 `@keyv/serialize`；`Symbol` 在这一步之前直接抛错。
4. **读写**：`set` 把 TTL 写成绝对 `expires`；`ttl === 0` 会被改成“无过期”。`get` 反序列化后若过期就 `delete` 并返回 `undefined`。
5. **错误与钩子**：`throwOnErrors` 默认 `false`，`get` 会吞掉 store 异常。`hooks` 提供 `preSet` / `postGet` 等同步触发点，不是 EventEmitter 那套 `on("error")`。

Iterator 只在 store 是 `Map`，或 adapter 的 `opts.dialect` / `opts.url` 命中 sqlite / redis / valkey 等 allowlist 时才会挂上。

## 实践示例

### 案例 1：默认内存店只活一分钟

```js
const cache = new Keyv({ ttl: 60_000 });
await cache.set("otp", "493821");
await cache.get("otp"); // "493821"，直到 Date.now() 超过 expires
```

实例 TTL 是默认值。单次 `set(key, value, 5_000)` 会覆盖这次调用的寿命；传入 `0` 则按源码改成无过期，而不是立刻失效。

### 案例 2：换 adapter 但不改业务调用

```js
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";

const cache = new Keyv(new KeyvRedis("redis://127.0.0.1:6379"), {
  namespace: "api",
});
await cache.set("user:42", { role: "admin" });
```

柜台还是 `cache.get`。前缀变成 `api:user:42`。官方 monorepo 还带 sqlite / postgres / mysql / mongo / memcache / valkey / etcd / dynamo；本页未运行这些 adapter。

### 案例 3：读取原始信封

```js
const raw = await cache.getRaw("user:42");
// { value: { role: "admin" }, expires: 1770000000000 } 或 undefined
```

普通 `get` 只回 `value`。`getRaw` / `{ raw: true }` 留下 `expires`，适合自己算剩余寿命。过期时两者都先删再回 `undefined`。

## 踩过的坑

1. **把 TTL 当成秒**：Keyv 用毫秒。把 `ttl: 30` 当成 30 秒，实际大约 30 毫秒后就会在下次读取时消失。
2. **以为默认 key 就是你传入的字符串**：`useKeyPrefix` 开着时，真实 key 是 `keyv:...`。直接去 Redis CLI 搜裸 key 会以为没写入。
3. **把 `ttl: 0` 当成立刻删除**：固定实现把它改成 `undefined`，表示永不过期。
4. **默认 `get` 失败是静默的**：store 抛错时，除非 `throwOnErrors: true`，否则 `get` 走 `undefined` / miss。
5. **`has()` 在原生 adapter 上可能不看过期**：非 `Map` 且 store 自己实现了 `has` 时，Keyv 直接转交，不复用自己的 `expires` 判断。

## 适用 vs 不适用场景

**适用**：

- 需要同一套 KV API 切换内存与外部后端
- 缓存、session、feature flag 这类“值 + 可选寿命”
- 想把压缩、自定义 serialize、hooks 留在柜台层

**不适用**：

- 只要当前进程里一份对象表，并需要秒级 TTL、clone、`take()`——那是 [[node-cache]]
- 需要跨进程队列、延迟任务或 worker 抢占——那是 [[bullmq]] 一类，不是 KV
- 不能接受 JSON 序列化边界（函数、`Symbol`、循环引用）
- 必须绑定尚未发布的 6.x RC；本页停在可达的 `5.6.0`

## 固定版本边界

- 本文绑定 `jaredwray/keyv@e3f8f009...`，`packages/keyv` 自报 `5.6.0`。
- npm latest 是 `5.6.0`；registry 未提供 `gitHead`，对齐依据是 GitHub tag `2026-01-20` 与包内版本号。
- GitHub latest release 已是 `v6.0.0-rc.1`，升级前要重新建立 provenance。
- 条件 exports 同时提供 CJS (`dist/index.cjs`) 与 ESM (`dist/index.js`)。
- 本文未安装依赖、运行上游测试或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **柜台与仓库要分开**——业务只认 `get` / `set`，过期、前缀、序列化属于柜台。
2. **默认前缀是合同，不是装饰**——忘了 `namespace:` 就会在后端里“找不到自己刚写入的 key”。
3. **TTL 单位必须读源码**——毫秒、`0` 表示无限、惰性删除，都不能从 Memcached 口感外推。
4. **静默失败不是成功**——默认 `get` 把 store 异常收成 miss，排障时要打开 `throwOnErrors` 或监听 `error`。

## 应用型自测

1. `new Keyv({ namespace: "api" })` 之后 `set("user", 1)`，Map 里真正的 key 是什么？
2. `await cache.set("k", "v", 0)` 会不会在下一毫秒的 `get` 里变成 `undefined`？
3. 自定义 store 的 `get` 抛错，且未设 `throwOnErrors`。`cache.get("k")` 会抛还是回 `undefined`？

检查点：

1. `api:user`。默认 `useKeyPrefix` 为 true。
2. 不会。`ttl === 0` 被改成无过期。
3. 回 `undefined`。固定 `get` 在 `throwOnErrors` 关闭时吞掉 store 异常。

## 延伸阅读

- 固定源码：[jaredwray/keyv](https://github.com/jaredwray/keyv) —— 本文绑定提交 `e3f8f0099ea36bcd0b1ffcb62e7577c2c805281f`
- 文档：[keyv.js.org](https://keyv.js.org/)（API 速查，不替代固定提交）
- [[node-cache]] —— 进程内秒级 TTL 对象表，没有 adapter 层
- [[unstorage]] —— 另一套跨运行时 KV 门面，更偏 driver / mount
- [[redis]] —— 常见外部后端，不是 Keyv 本身

## 关联

- [[node-cache]] —— 对照：本地对象缓存 vs 可换仓的 KV 柜台
- [[unstorage]] —— 同类抽象，driver 与 namespace 路由不同
- [[memcached]] —— 网络缓存服务；Keyv 只是可选客户端适配
- [[redis]] —— 官方 `@keyv/redis` 的典型后端
