---
title: idb — 把 IndexedDB 请求收成 Promise 和 Proxy
来源: 'https://github.com/jakearchibald/idb'
日期: 2026-08-27
分类: 前端工程化
难度: 入门
description: "介绍 idb 8.0.3 如何用 wrap/Proxy 把 IDBRequest 收成 Promise，并给单次读写提供一笔事务捷径。"
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jakearchibald/idb
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 77dd8bebf3669bbce9628e470a021ff63eb4acaf
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.3
---

## 是什么

idb 是 Jake Archibald 写的 IndexedDB 薄包装。日常类比：仓库还是原来那间 IndexedDB，idb 只给每张工单（`IDBRequest`）换成能 `await` 的回执，并在门上加一层 Proxy，让你少写事件监听。

你写：

```js
import { openDB } from "idb";

const db = await openDB("study", 1, {
  upgrade(database) {
    database.createObjectStore("notes");
  },
});

await db.put("notes", { body: "hello" }, "intro");
const note = await db.get("notes", "intro");
```

`openDB` / `deleteDB` / `wrap` / `unwrap` 是公开入口。固定 8.0.3 没有 runtime 依赖；条件导出区分 ESM 与 CJS。

## 为什么重要

不理解“请求变 Promise、对象变 Proxy”这条链，就解释不了：

- 为什么 `db.get` 看起来像直接读库，实际每次都新开一笔事务
- 为什么 `tx.store` 有时是 object store，有时是 `undefined`
- 为什么 cursor 的 `continue()` 会返回下一枚 cursor 的 Promise，而原生 API 是同一条 request 再响一次
- 为什么 8.x 不再谈 IE / 旧 EdgeHTML

## 核心要点

固定 8.0.3 的主链可以拆成四步：

1. **`openDB(name, version, callbacks)`**：调用 `indexedDB.open`。有 `upgrade` 才听 `upgradeneeded`。不传 version 时，升级回调不会跑；库若不存在，版本变成 `1`。

2. **`wrap` 分流**：`IDBRequest` 变成 Promise；`IDBDatabase` / store / index / cursor / transaction 变成带同一套 trap 的 Proxy。结果会进 WeakMap 缓存，保证对象相等。

3. **事务补丁**：`tx.done` 等 `complete` / `error` / `abort`。`tx.store` 只在这笔事务恰好覆盖一个 store 时存在。

4. **捷径与迭代**：`db.get` / `db.put` 这类方法各开一笔 one-shot 事务；写操作还要等 `tx.done`。`iterate` / `Symbol.asyncIterator` 打开 cursor；你不调用前进方法时，迭代器自己 `continue()`。

## 实践示例

### 案例 1：升级时建 store，读时用捷径

```js
const db = await openDB("cards", 1, {
  upgrade(database) {
    database.createObjectStore("deck", { keyPath: "id" });
  },
});

await db.add("deck", { id: "a", suit: "spades" });
const card = await db.get("deck", "a");
```

**逐部分**：`upgrade` 拿到的 `database` 已经是 wrap 过的。`add` / `get` 不是原生 `IDBDatabase` 方法，而是 extras 给 Proxy 补的捷径，每次自己 `transaction(store, mode)`。

### 案例 2：多步写入必须自己拿事务

```js
const tx = db.transaction("deck", "readwrite");
await tx.store.put({ id: "b", suit: "hearts" });
await tx.store.delete("a");
await tx.done;
```

**逐部分**：连续 `db.put` + `db.delete` 会变成两笔事务，中间状态可能被别的连接看见。`tx.store` 能用，是因为 `transaction` 只点了 `"deck"` 这一个名字。

### 案例 3：把原生连接包进 idb

```js
const raw = indexedDB.open("legacy");
const db = await wrap(raw);
const unwrapped = unwrap(db);
```

**逐部分**：`wrap` 对 request 返回 Promise，对已打开的 `IDBDatabase` 返回 Proxy。`unwrap` 从反向 WeakMap 取回原对象；没被 wrap 过的值会得到 `undefined`。

## 踩过的坑

1. **把 `db.put` 当成长事务**：每个捷径都是短事务。要原子地改两条记录，必须自己 `transaction()`。

2. **对多 store 事务读 `tx.store`**：两个及以上 store 时 `store` 是 `undefined`，要 `tx.objectStore('name')`。

3. **在 `readonly` 事务上调用 `put`**：类型定义里写方法会变成 `undefined`；运行时也没有 idb 再包一层写权限。

4. **不传 version 还指望 `upgrade` 建表**：测试表明这时 upgrade 不会跑。库已存在就沿用旧 schema。

## 适用 vs 不适用场景

**适用**：

- 页面已经按 IndexedDB 的 store / index / 版本在思考
- 需要 `await` 请求和 `tx.done`，而不是 `onsuccess`
- 需要 TypeScript `DBSchema` 把 store 名和值类型绑死

**不适用**：

- 只要 `getItem` / `setItem`、愿意自动降级——用 [[localforage]]
- 需要 CouchDB 复制或文档冲突——用 [[pouchdb]]
- 目标环境没有 `IDBCursor.request`（含 IE 与旧 EdgeHTML）
- 不能接受“捷径 = 一笔新事务”这条隐藏合同

## 固定版本边界

- 本文绑定 `jakearchibald/idb@77dd8beb...`，即 tag `v8.0.3`，package `8.0.3`。
- npm 未发布 `gitHead`；身份靠 tag、`package.json` 版本和提交 SHA。
- 无 runtime `dependencies`。8.x 去掉独立 async-iterator 构建，并要求 `cursor.request`。
- 本文未安装依赖、未跑上游测试、未打开浏览器 IndexedDB，状态保持 `UNVERIFIED`。

## 学到什么

1. **可用性包装可以几乎不改协议**：idb 没有新的存储模型，只改等待方式和类型
2. **捷径会偷偷缩短事务寿命**：少写代码不等于同一笔事务
3. **Proxy 缓存是为了对象相等**：同一 `IDBTransaction` 多次 `wrap` 应得到同一个代理
4. **打开 API 的缺省参数会跳过迁移**：不传 version 就是“不要 upgrade”

## 应用型自测

1. `openDB('app')` 且该库从未存在时，`upgrade` 会不会跑？数据库 version 是多少？
2. `db.transaction(['a', 'b'], 'readwrite').store` 是什么？
3. `await db.put('notes', value, key)` 成功返回后，是否还可能有未完成的事务？

检查点：

1. 不会跑 upgrade；新库 version 为 `1`。
2. `undefined`。只有单 store 事务才有 `store`。
3. 不会。写捷径会等待请求结果和 `tx.done` 都完成。

## 延伸阅读

- 固定源码：[jakearchibald/idb](https://github.com/jakearchibald/idb) —— 本文绑定提交 `77dd8bebf3669bbce9628e470a021ff63eb4acaf`
- 仓库 README：[IndexedDB with usability](https://github.com/jakearchibald/idb#readme)
- [[localforage]] —— 三后端 KV 门面，不暴露事务
- [[pouchdb]] —— 复制协议，不是 IDB 语法糖
- [[unstorage]] —— 跨运行时 KV，IndexedDB 只是其中一个 driver

## 关联

- [[localforage]] —— localStorage 口令 + 驱动降级
- [[pouchdb]] —— 浏览器里的 CouchDB
- [[unstorage]] —— 统一 KV driver
- [[automerge]] —— CRDT；IndexedDB 只是一种 persistence adapter

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[localforage]] —— localforage — 用 localStorage 口令调度三种浏览器仓库
