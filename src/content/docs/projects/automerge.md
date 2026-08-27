---
title: Automerge — 让两份 JSON 自动合并的 CRDT 库
来源: https://github.com/automerge/automerge
日期: 2026-08-27
分类: 协同编辑
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/automerge/automerge
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8d7b12f8da553afbb325e37a6c66942b8dd4d994
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.4.1
---

## 是什么

Automerge 是一套 **JSON-like CRDT**：你把它当普通对象改，任意两份离线副本都能 `merge` 成同一份历史。日常类比：两人各自改同一本笔记，回家叠在一起，结构会收敛；同一键并发赋值时，表面只露出一个值，冲突仍可查。

固定提交里，内核是 Rust crate `automerge@0.11.0`，经 WASM 暴露；JS 包装是 `@automerge/automerge@3.4.1`。文档对象是不可变 POJO 视图，改动必须走 `change` 闭包：

```js
import * as A from "@automerge/automerge"

let doc = A.from({ todos: [] })
doc = A.change(doc, d => { d.todos.push("write") })
const bytes = A.save(doc)
const merged = A.merge(doc, A.clone(otherDoc))
```

`from` / `change` / `save` / `merge` / `clone` 都在 `javascript/src/implementation.ts`。旧笔记里的 `new automerge.Text(...)` 在 3.4.1 **没有对应导出**；普通 JS 字符串会按 `"text"` 写入。

## 为什么重要

不按固定 3.4.1 读，下面这些旧印象会对不上：

- 为什么 local-first 可以把服务器降成中继：合并发生在端侧
- 为什么 `merge` 之后再 `change` 会抛 “out of date”——两边都被冻住，必须 `clone`
- 为什么 `d.title = "final"` 不是标量覆盖：`import_value` 把 `string` 标成 `"text"`，走 `putObject`
- 为什么同一 map 键并发 `put` 仍可能有冲突：`getConflicts` 能看到被藏起来的值
- 为什么 `@automerge/automerge-repo` 不能当成本仓 API——它是独立仓库

## 核心架构与流程

固定 `js/automerge-3.4.1` 可以拆成五步：

1. **不可变文档 + 代理写**：`change` 用 `rootProxy` 包一层，闭包里的赋值变成 pending ops，再 `commit`。嵌套 `change` 直接抛错。没有新 op 时返回原文档。

2. **OpId = (counter, actor 下标)**：Rust `OpId` 是每个 actor 递增的 counter，不是应用层可见的 Lamport 字符串。默认随机 actor；`clone` 会换新 actor，避免序号撞车。`time` 默认是 Unix 秒，注释写明不参与冲突裁决。

3. **合并是补缺的 change**：`merge(local, remote)` 调用 `getChangesAdded` 再 `applyChanges`。两端随后都不能再变，症状是 “Attempting to change an out of date document”。

4. **字符串分两条路**：普通 `string` → `"text"` 对象；`ImmutableString` → `"str"` 标量。读回时 text 变成 JS 字符串，str 仍是 `ImmutableString`。`undefined` 赋值会抛错。

5. **同步是有状态协议**：`initSyncState` → `generateSyncMessage` → `receiveSyncMessage`。Rust `sync` 用 Bloom filter 描述对方已有 heads；JS 只看到 `Uint8Array` 消息。

## 实践示例

### 案例 1：两份副本改完再合

```js
import * as A from "@automerge/automerge"

let alice = A.from({ title: "draft", tags: ["a"] })
let bob = A.clone(alice)
alice = A.change(alice, d => { d.title = "final"; d.tags.push("b") })
bob = A.change(bob, d => { d.tags.unshift("z"); d.tags.push("c") })
const merged = A.merge(alice, A.clone(bob))
```

列表并发插入都会留下，顺序由 OpId 全序决定，**不要**把某次运行的 `['z','a','b','c']` 写成公理。`title` 是 text 对象上的赋值。合完后 `alice` 已过期，继续改要 `A.clone(merged)`。

### 案例 2：增量而不是整本 save

```js
const changes = A.getChanges(oldDoc, newDoc)
const [updated] = A.applyChanges(localDoc, changes)
```

`getChanges` 取 `newDoc` 相对 `oldDoc` heads 的缺省 change；若 `oldDoc` 有 `newDoc` 没有的 change 会崩。`applyChanges` 返回 `[Doc]`。有状态同步用 `generateSyncMessage` / `receiveSyncMessage`，后者第三返回值固定为 `null`，回包要再调一次 `generateSyncMessage`。

### 案例 3：同一键的并发赋值

```js
let a = A.init("aaaa")
a = A.change(a, d => { d.pets = [{ name: "Lassie" }] })
let b = A.merge(A.init("bbbb"), A.clone(a))
a = A.change(a, d => { d.pets[0].name = "Babe" })
b = A.change(b, d => { d.pets[0].name = "Beethoven" })
const c = A.merge(a, A.clone(b))
A.getConflicts(c.pets[0], "name")
```

文档注释写明：Automerge 会确定性挑一个值展示，`getConflicts` 才能看到另一份。这不是“没有冲突”，是“不弹窗、可查询”。

## 踩过的坑

1. **`merge` 后继续改同一引用**：两端被冻住，必须 `clone`。
2. **闭包里嵌套 `change`**：`_is_proxy` 为真就抛 “cannot be nested”。
3. **写成 `undefined`**：`import_value` 拒绝，提示改 `null` 或 `delete`。
4. **把普通字符串当 LWW 标量**：要标量用 `ImmutableString`；协同编辑用 `updateText` / `splice`。
5. **把 automerge-repo 抄进本页当固定 API**：存储 / 网络适配器在别的仓，3.4.1 本仓只提供文档与 sync 原语。

## 适用 vs 不适用场景

**适用**：

- 端侧合并的笔记 / 看板 / 白板，服务器只转发 change 或 sync 消息
- 需要 `getHistory` / `view(heads)` / `changeAt` 这类历史切口
- 同一 map 键允许展示值 + `getConflicts`，而不是中心锁

**不适用**：

- 银行余额、库存扣减等必须唯一仲裁的强一致
- 不能加载 WASM 的运行时：默认入口走 `automerge-wasm`；`./slim` 需要自己 `initializeWasm`
- 把 `@automerge/automerge-repo` 或某次 bundle 体积当成这页的合同
- 需要把静态阅读写成“已在目标设备跑通”——本文没有这样做

## 固定版本边界

- 本文绑定 `automerge/automerge@8d7b12f8da553afbb325e37a6c66942b8dd4d994`。lightweight tag `js/automerge-3.4.1` 与 npm `@automerge/automerge@3.4.1` 的 `gitHead` 同指此提交。
- 同提交 Rust crate 版本为 `0.11.0`，`rust-version = "1.90.0"`。C / CLI / hexane 未展开。
- 3.4.1 另有 `saveBundle` / `getFragments` / `addCommits`；只确认导出存在，未运行。
- 未安装依赖、未编译 WASM、未跑上游测试或 sync 假阳性用例，状态保持 `UNVERIFIED`。

## 学到什么

1. **CRDT 文档在 JS 里仍是不可变快照**——闭包里的可变代理只是写 ops 的语法糖。
2. **合并会冻住参数**——`clone` 既复制内存也换 actor。
3. **“自动合并”不等于“没有冲突”**——map 键并发 `put` 要靠 `getConflicts`。
4. **字符串默认是 text 对象**——和 `ImmutableString` 标量是两条类型通道。

## 应用型自测

1. `A.merge(alice, bob)` 之后还能对 `alice` 再 `A.change` 吗？
2. `d.title = "final"` 在 3.4.1 会写成哪种 datatype？
3. `receiveSyncMessage` 的第三个返回值现在是回包消息吗？

检查点：

1. 不能。两边都会变成 outdated，要先 `clone`。
2. `"text"`。`import_value` 对 `typeof === "string"` 走 `putObject`，不是 `"str"`。
3. 不是。固定实现第三项恒为 `null`，回包要再调 `generateSyncMessage`。

## 延伸阅读

- 文档：[automerge.org/docs](https://automerge.org/docs/hello/)
- 固定源码：[automerge/automerge](https://github.com/automerge/automerge) —— 本文绑定提交 `8d7b12f8da553afbb325e37a6c66942b8dd4d994`
- 二进制格式说明：[automerge-binary-format-spec](https://automerge.org/automerge-binary-format-spec)
- [[yjs]] —— 同主题链表 / YATA 对照
- [[crdt-json-2017]] —— 嵌套 JSON CRDT 的论文根

## 关联

- [[yjs]] —— 共享类型 + update 字节，而不是不可变文档快照
- [[crdt-json-2017]] —— Automerge 早期理论根
- [[crdt-shapiro-2011]] —— CRDT 概念奠基
- [[sharedb]] —— OT 路线的对照
- [[logoot-2010]] —— 早期文本位置标识

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anytype-ts]] —— Anytype — 本地优先块编辑器
- [[collabora-online]] —— Collabora Online — 浏览器里直接编辑 Office 文档的开源后端
- [[etherpad-lite]] —— Etherpad — 经典协作文本编辑器
- [[liveblocks]] —— Liveblocks — 多人协作的托管基础设施
- [[partykit]] —— PartyKit — Cloudflare Durable Objects 上的实时协作 framework
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
- [[sharedb]] —— ShareDB — 基于 OT 的实时数据库
