---
title: node-cache — 进程内带秒级 TTL 的对象缓存
description: 单进程 EventEmitter 缓存，默认 clone，TTL 以秒计，checkperiod 扫过期
来源: https://github.com/node-cache/node-cache
日期: 2026-08-27
分类: 基础设施
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/node-cache/node-cache
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b64434a8303c5881145c68754b674478e714ca3a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.1.2
---

## 是什么

node-cache 是一个 **只活在当前 Node 进程里的对象表**。日常类比：办公室白板——谁在这间屋里都能用笔写、用板擦掉；换一个房间（另一个进程）就是另一块空板。

```js
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 30, checkperiod: 60 });

cache.set("otp", "493821");
cache.get("otp"); // "493821"，直到绝对过期时间或被 take/del
```

固定 `5.1.2` 把每条记录包成 `{ t, v }`：`t` 是毫秒时间戳，`v` 是值。对外 TTL 却按**秒**计算。默认 `useClones: true`，写入和读出都走 `clone` 依赖，避免调用方改到内部引用。

## 为什么重要

不理解 node-cache，下面这些事都没法解释：

- 为什么多实例部署时“缓存命中”对不上——每份进程各有一份 `@data`
- 为什么默认拿到的是拷贝，改返回对象不会写回缓存
- 为什么 `keys()` 里还能看见已经过期的名字，但 `has()` 已经是 `false`
- 为什么它解决不了跨进程共享，那是 [[redis]] / [[keyv]] adapter 的工作

## 核心要点

固定 CoffeeScript 主链可以看成四件事：

1. **容器**：`@data` 是普通对象。key 只接受 `string` 或 `number`，否则抛 `EKEYTYPE`。
2. **寿命**：`stdTTL` 默认 `0` 表示无限。`set(key, value, ttl)` 把秒换成 `Date.now() + ttl * 1000`。`ttl === 0` 在 wrap 里写成 `t = 0`（无限）。
3. **过期**：`get` / `has` / `ttl` 会走 `_check`。另外有一个默认 600 秒的 `checkperiod`，用 `setTimeout` + `unref` 扫全表。`deleteOnExpire` 默认 true。
4. **容量与事件**：`maxKeys: -1` 表示不限制；满了就抛 `ECACHEFULL`。`set` / `del` / `expired` / `flush` 走 EventEmitter。

`take(key)` 是“读一次就作废”：先 `get` 再 `del`。适合 OTP、一次性票据。

## 实践示例

### 案例 1：30 秒后作废的验证码

```js
const cache = new NodeCache({ stdTTL: 30 });
cache.set("otp:ada", "104928");
cache.getTtl("otp:ada"); // 绝对过期时间（毫秒），不是剩余秒数
```

`getTtl` 返回的是 wrap 里的 `t`，单位是毫秒时间戳。`t === 0` 表示永不过期。不要把它当成“还剩多少秒”。

### 案例 2：读走即删

```js
const token = cache.take("otp:ada");
cache.has("otp:ada"); // false
```

第二次 `take` 得到 `undefined`。这是源码里的 get-then-del，不是原子分布式锁。

### 案例 3：关掉 clone 以保住引用

```js
const cache = new NodeCache({ useClones: false });
const profile = { name: "ada" };
cache.set("u", profile);
profile.name = "grace";
cache.get("u").name; // "grace"——内外是同一份对象
```

默认 `useClones: true` 时，外面改 `profile` 不会污染缓存，读出来也是新拷贝。追求吞吐时文档鼓励关掉，但共享可变对象会变成隐式总线。

## 踩过的坑

1. **TTL 单位是秒，内部时间戳是毫秒**：`set("k", 1, 30)` 是 30 秒。把 30000 当毫秒传进去，会变成大约 8.3 小时。
2. **满员时连更新老 key 也会炸**：`set` 先判断 `stats.keys >= maxKeys`，再看 key 是否已存在。缓存满时改旧值也会抛 `ECACHEFULL`。
3. **`keys()` 不过滤过期项**：它直接 `Object.keys(@data)`。过期但还没被 `_check` / `checkperiod` 扫到的名字仍在列表里。
4. **类型注释和源码对 `ttl(key, 0)` 说法不一致**：`index.d.ts` 写“类似 `del`”；`_src` 把 `0` 当无限寿命。以 CoffeeScript 实现为准。
5. **`forceString` 条件在 CoffeeScript 里很可能走不到**：源码写的是 `forceString and not typeof value is "string"`。`not` 比 `is` 更紧，静态阅读下该分支不会去做 `JSON.stringify`。

## 适用 vs 不适用场景

**适用**：

- 单进程请求级 memo、feature flag、短 TTL 计数
- 需要 `take()` 这种一次性读取
- 能接受重启即空、多实例各算各的

**不适用**：

- 多个 Node 进程要看见同一份缓存——换 [[redis]] 或 [[keyv]] + 外部 adapter
- 需要 LRU 淘汰而不是“到点删除 / 手动 del”
- 要把函数、循环结构或超大对象当一等缓存值，还默认开着 clone
- 把 2020 年的 `5.1.2` 当成仍在高频发版的现代库；升级前要重新核验维护状态

## 固定版本边界

- 本文绑定 `node-cache/node-cache@b64434a8...`，tag 与 npm `gitHead` 均为 `5.1.2`。
- npm 发布时间是 2020-07-01；`engines` 写 `node >= 8.0.0`。
- Git 源码主体是 CoffeeScript（`_src/lib/node_cache.coffee`）；发布包入口是编译后的 `index.js`。
- `enableLegacyCallbacks` 会包装旧回调 API，并打印 v6 将移除的警告。
- 本文未运行 mocha / tsc，也未测量 clone 成本，状态保持 `UNVERIFIED`。

## 学到什么

1. **进程内缓存的边界就是进程**——白板换房间就空了，不能拿它当共享 session 店。
2. **默认 clone 是安全，也是税**——改返回值不影响库存；关掉之后引用即总线。
3. **列表和存在性不是同一条路**——`keys()` 看对象键，`has()` 看 `_check`。
4. **容量检查发生在“是不是新 key”之前**——满员时更新也会失败，这和 Map.set 直觉相反。

## 应用型自测

1. `new NodeCache({ stdTTL: 10 })` 后 `set("k", 1)`，内部 `t` 的单位是秒还是毫秒时间戳？
2. `maxKeys: 1` 且已有 `"a"`。再 `set("a", 2)` 会更新还是抛 `ECACHEFULL`？
3. 一条 key 刚过期、`checkperiod` 还没跑。`keys()` 和 `has(key)` 各返回什么？

检查点：

1. 毫秒时间戳。wrap 用 `Date.now() + ttl * 1000`。
2. 抛 `ECACHEFULL`。容量判断在“是否已存在”之前。
3. `keys()` 仍可能包含该名字；`has` 走 `_check`，默认会删并返回 `false`。

## 延伸阅读

- 固定源码：[node-cache/node-cache](https://github.com/node-cache/node-cache) —— 本文绑定提交 `b64434a8303c5881145c68754b674478e714ca3a`
- README：仓库根目录说明 TTL、clone 与 events（E0 自述，需对照 `_src`）
- [[keyv]] —— 可换后端的 KV 柜台，TTL 用毫秒
- [[memcached]] —— 网络缓存服务；node-cache 只模仿“本地那张表”
- [[redis]] —— 需要跨进程共享时的常见下一跳

## 关联

- [[keyv]] —— 对照：adapter + 毫秒 TTL vs 进程内秒级对象表
- [[unstorage]] —— 另一套跨运行时 KV，不是进程内 clone 缓存
- [[memcached]] —— 分布式内存缓存；API 口感接近，部署完全不同
- [[redis]] —— 多进程共享与持久化不在 node-cache 合同内
