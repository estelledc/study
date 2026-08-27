---
title: localforage — 用 localStorage 口令调度三种浏览器仓库
来源: 'https://github.com/localForage/localForage'
日期: 2026-08-27
分类: 前端工程化
难度: 入门
description: "介绍 localforage 1.10.0 如何按 IndexedDB / WebSQL / localStorage 顺序选驱动，并把 undefined 收成 null。"
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/localForage/localForage
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7323475989c0ddc51849d72b4acaec66f2b491c6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.10.0
---

## 是什么

localforage 是一个浏览器离线 KV 库。日常类比：前台只收 `getItem` / `setItem` 这种柜台口令，后厨按菜单依次问 IndexedDB、WebSQL、localStorage，谁还能开门就让谁上工。

你写：

```js
import localforage from "localforage";

await localforage.setItem("profile", { name: "Ada" });
const profile = await localforage.getItem("profile");
```

默认导出是一个现成的 `LocalForage` 单例。需要第二个库名或 store 时用 `createInstance({ name, storeName })`。固定 1.10.0 同时接受 Promise 和 Node 风格 callback。

## 为什么重要

不理解这条“口令相同、后厨可换”的链，就解释不了：

- 为什么同一套 API 在现代浏览器走 IndexedDB，在更老的环境可能落到 localStorage
- 为什么 `setItem('k', undefined)` 读回来是 `null`，不是 `undefined`
- 为什么 `config()` 在第一次读写之后再改，返回的是 Error 对象而不是抛错
- 为什么两个实例共用同一个 `name` 时，会共享同一条 IndexedDB 连接队列

## 核心要点

固定 1.10.0 的主链可以拆成四步：

1. **构造时登记内置驱动**：`asyncStorage`、`webSQLStorage`、`localStorageWrapper` 写进模块级 `DefinedDrivers`，所有实例共用。

2. **`setDriver` 按名单挑第一个可用者**：默认顺序就是上面三个。Safari 只有在原生 `fetch` 存在时才算 IndexedDB 可用；一个都没有则拒绝 `No available storage method found.`。

3. **第一次 `getItem` / `setItem` 先 `ready()`**：stub 会等到驱动 `_initStorage` 完成，再换成真正的驱动方法。`storeName` 里的非单词字符会被收成 `_`。

4. **读写对齐 localStorage 的空值**：键一律 `String()`；缺键和 `undefined` 对外都是 `null`。IndexedDB 驱动写入 `null` 时先改成 `undefined`（IE 10 存不了 `null`），完成后再变回 `null`。

## 实践示例

### 案例 1：给笔记应用单独开一间库房

```js
const notes = localforage.createInstance({
  name: "study",
  storeName: "notes-v1",
});

await notes.setItem("intro", { body: "hello" });
```

**逐部分**：`name` 是 IndexedDB / WebSQL 数据库名，默认 `"localforage"`。`storeName` 是 object store / 表名，默认 `"keyvaluepairs"`。同 `name` 的多个实例会挂到同一条 `dbContexts` 连接上。

### 案例 2：显式只要 IndexedDB

```js
await localforage.setDriver(localforage.INDEXEDDB);
await localforage.ready();
console.log(localforage.driver()); // "asyncStorage"
```

**逐部分**：`INDEXEDDB` 只是驱动名常量。`setDriver` 会过滤 `supports()` 为假的项；名单被滤空后，后续 `ready()` 失败。

### 案例 3：把 Blob 交给当前驱动

```js
const blob = new Blob(["hello"], { type: "text/plain" });
await localforage.setItem("file", blob);
```

**逐部分**：IndexedDB 驱动先探测能否直接存 Blob；失败或命中 Chrome 42 及更早的 UA 判断时，改走 Base64 编码。WebSQL / localStorage 走 `__lfsc__:` 序列化前缀。本轮未在浏览器里验证这条分支。

## 踩过的坑

1. **把 `config()` 失败当成异常**：ready 之后调用返回 `Error`，`if (!localforage.config({...}))` 测不到它。

2. **以为数字键会保持数字**：`normalizeKey(1)` 会警告并存成 `"1"`。

3. **用 `undefined` 表示“有这条记录”**：写入 `undefined` 等于写入空，读回 `null`，和缺键无法区分。

4. **同一 `name` 多个实例各改 version**：它们共享连接；一边升级，另一边的 `_dbInfo.db` 会被一起换掉。

## 适用 vs 不适用场景

**适用**：

- 只要一套 localStorage 口令，把对象、Blob 尽量落到异步仓库
- 需要按浏览器能力自动降级，而不是自己写三段 adapter
- 多个逻辑 store 只要换 `name` / `storeName`

**不适用**：

- 需要对象 store、索引、版本迁移和事务——用 [[idb]]
- 需要和 CouchDB 复制——用 [[pouchdb]]
- 需要跨 Node / Worker / 云 KV 的统一 driver——用 [[unstorage]]
- 不能接受 WebSQL 遗留路径、`lie@3.1.1` 或 2021 年冻结的 1.10.0 合同

## 固定版本边界

- 本文绑定 `localForage/localForage@73234759...`，tag 与 package 均为 `1.10.0`；npm `gitHead` 与 tag 一致。
- 运行时依赖只有 `lie@3.1.1`；没有全局 `Promise` 时会打 polyfill。
- 默认 WebSQL `size` 是 `4980736`。`dropInstance` 是可选驱动方法。
- 本文未安装依赖、未跑上游测试、未打开浏览器仓库，状态保持 `UNVERIFIED`。

## 学到什么

1. **门面 API 可以比后厨窄**：localStorage 口令换来迁移成本低，也丢掉了索引和事务
2. **空值合同要写死**：`undefined`→`null` 是为了对齐旧 API，不是类型系统的诚实
3. **能力探测会带历史补丁**：Safari / Chrome Blob / IE `null` 都写在驱动里
4. **模块级登记表让“实例”共享命运**：驱动支持和同名连接都不跟单个对象走

## 应用型自测

1. `await localforage.setItem('k', undefined)` 之后 `getItem('k')` 得到什么？
2. 第一次 `getItem` 之后再 `config({ name: 'other' })`，会抛异常吗？
3. 只传 `localforage.LOCALSTORAGE` 且 `supports('localStorageWrapper')` 为假时，`ready()` 会怎样？

检查点：

1. `null`。缺键也是 `null`，无法区分“存过 undefined”。
2. 不会抛。ready 后的 `config()` 返回 Error 对象。
3. 驱动名单被滤空，`ready()` 拒绝 `No available storage method found.`。

## 延伸阅读

- 固定源码：[localForage/localForage](https://github.com/localForage/localForage) —— 本文绑定提交 `7323475989c0ddc51849d72b4acaec66f2b491c6`
- 文档：[localforage.github.io/localForage](https://localforage.github.io/localForage/)
- [[idb]] —— 保留 IndexedDB 事务与版本升级，不做三后端降级
- [[pouchdb]] —— 文档复制协议，不是单机 KV 门面
- [[unstorage]] —— 运行时无关的 KV driver，不是浏览器三选一

## 关联

- [[idb]] —— 薄包装 IndexedDB，适合要事务和 schema 的页面
- [[pouchdb]] —— 离线文档库 + CouchDB sync
- [[unstorage]] —— 跨运行时 KV 抽象
- [[yjs]] —— CRDT 文档；本地持久化另接 persistence

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[idb]] —— idb — 把 IndexedDB 请求收成 Promise 和 Proxy
