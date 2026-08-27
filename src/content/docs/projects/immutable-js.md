---
title: Immutable.js — 用持久化集合代替就地修改
description: 用持久化 Map/List 等集合做结构共享，而不是给普通对象套 Proxy。
来源: https://github.com/immutable-js/immutable-js
日期: 2026-08-27
分类: 状态管理
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/immutable-js/immutable-js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 329f7a680efa262c310b938a343295880eefe4fc
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.1.9
---

## 是什么

Immutable.js 提供一套自己的持久化集合，而不是给普通对象套代理。你拿到的是 `Map` / `List` / `Set` 这类值对象：每次 `set` 返回新集合，没改到的 trie 节点继续共享。日常类比：书架按 32 格分柜；换一本书只重做经过的柜子，其他柜子原样复用。

```ts
import { Map } from "immutable"

const prev = Map({ city: "Paris" })
const next = prev.set("city", "Shanghai")
```

`prev` 仍是 `"Paris"`。固定 `5.1.9` 还导出 `OrderedMap`、`OrderedSet`、`Stack`、`Record`、惰性 `Seq`，以及 `fromJS` / `is` / `hash` 和一组 functional 读写函数。

## 为什么重要

不理解这套集合合同，就容易把它和 [[immer]] 或普通 spread 混为一谈：

- 为什么嵌套普通对象不会自动变成不可变
- 为什么 `withMutations` 看起来能就地改，结束却仍交出持久化结果
- 为什么 `Immutable.is` 认为 `-0` 等于 `0`，却又把两个 `Date` 当成同一时刻
- 为什么 5.x 稳定线旁边还同时存在 3.x 安全回移和 6.x beta

## 核心要点

固定 5.1.9 的主链可以看成四层：

1. **集合身份**：`Map` / `List` / `Set` 等是独立类型。`Map({ a: 1 })` 把对象的 key 收成 map；嵌套值仍是你传入的原值，除非走 `fromJS`。

2. **32 路持久化 trie**：`TrieUtils` 里 `SHIFT = 5`、`SIZE = 32`。`Map` 用 `ArrayMapNode` → `BitmapIndexedNode` → `HashArrayMapNode` 按 hash 分片；`List` 用同样宽度的节点加 `_origin` / `_capacity` / `_tail` 做索引。

3. **所有权与短暂可变**：`asMutable()` 分配新的 `OwnerID`。带 owner 的节点更新可以改自己；`withMutations(fn)` 跑完后若 `wasAltered()`，再 `__ensureOwner` 回到原来的 owner，否则直接返回原集合。

4. **相等与转换**：`is()` 先按 `===` / `NaN`，再 `valueOf`，再 `equals`。`fromJS` 把 array-like 收成 `List`、plain object 收成 `Map`、其他可迭代收成 `Set`，并拒绝循环结构。

## 实践示例

### 案例 1：`set` 共享未改节点

```ts
import { Map } from "immutable"

const users = Map({ alice: Map({ city: "Paris" }), bob: Map({ city: "Lyon" }) })
const next = users.setIn(["alice", "city"], "Shanghai")
```

`next.get("bob")` 与 `users.get("bob")` 仍是同一引用。`setIn` 只重建 alice 这条路径。若内层仍是普通对象而不是 `Map`，`setIn` 不会按 HAMT 语义替你改写它。

### 案例 2：`withMutations` 是短暂 owner，不是永久可变

```ts
const next = users.withMutations(map => {
  map.set("alice", Map({ city: "Shanghai" }))
  map.remove("bob")
})
```

回调里的 `map` 带着临时 `OwnerID`，连续几次更新可以改同一份节点。函数返回后结果重新变成不可变集合；丢掉返回值就等于没更新。

### 案例 3：`fromJS` 与 `is` 的边界

```ts
import { fromJS, is } from "immutable"

const tree = fromJS({ todos: [{ id: 1, done: false }] })
tree.getIn(["todos", 0, "done"]) // false，内层已是 Map/List

is(0, -0)          // true；Object.is(0, -0) 为 false
is(NaN, NaN)       // true
```

`fromJS` 碰到循环引用会抛 `TypeError('Cannot convert circular structure to Immutable')`。`is` 还会对实现了 `equals`/`hashCode` 的值对象做结构相等；它不是 `Object.is` 的别名。

## 踩过的坑

1. **只包一层、内层仍可变**：`Map({ user: { city: "Paris" } })` 的 `user` 还是普通对象。要深转换用 `fromJS`，或自己把内层也建成集合。
2. **丢掉 `set` / `withMutations` 的返回值**：持久化 API 不会改调用者；这和 immer 的 draft 赋值相反。
3. **用 `Object.is` 理解 Map 键**：`is()` 合并 `-0`/`0`，并允许 `valueOf` / `equals`。同一时刻的两个 `Date` 会被视为相等。
4. **`Record` 的默认值必须是 plain object**：传入另一个 Record 或 Immutable Collection 会抛错。
5. **版本线并存**：5.1.9 是本页绑定的稳定线；6.x 仍是 beta，3.8.4 是 3.x 安全回移，不能混成“当前 API”。

## 适用 vs 不适用场景

**适用**：

- 状态形状愿意改成 `Map`/`List`，并依赖引用相等做变更检测
- 需要多次更新同一路径，可用 `withMutations` 降低中间分配
- 要 `Record` 这种字段固定的值对象

**不适用**：

- 想继续用普通对象字面量写 reducer——应看 [[immer]]
- 需要就地 Proxy 订阅，而不是新集合——应看 [[valtio]] / [[mobx]]
- 要把 3.x 代码直接当 5.x 用，或把 6.x beta 写成已发布合同
- 想用本文里的 size-limit 数字当实测包体——那是仓库预算，不是本轮测量

## 固定版本边界

- 本文绑定 `immutable-js/immutable-js@329f7a680efa262c310b938a343295880eefe4fc`。tag `v5.1.9`、`package.json` 与 npm `immutable@5.1.9` 的 `gitHead` 一致。
- 访问当日 GitHub 另有 prerelease `v6.0.0-beta.1`，以及 3.x 回移 `v3.8.4`（CVE-2026-59879 / CVE-2026-59880）。npm `3.8.4` 的 `gitHead` 与 tag 对象 SHA 不一致；3.x 不在本页范围。
- `package.json` 声明 `size-limit` 为 20 kB 预算，并列出 Jest / tstyche 测试脚本；本轮未运行、未打包。
- 本文未安装依赖或测量性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **不可变有两条路**——换更新语法（immer）或换数据结构（Immutable.js），合同完全不同。
2. **持久化不是深拷贝**——32 路 trie 只重建路径上的节点。
3. **短暂可变是实现细节**——`OwnerID` 让一批更新共用节点，出口仍然是值对象。
4. **相等算法要按库读**——`is()` 服务的是 hash 集合，不是 JS 语言默认。

## 应用型自测

1. `Map({ user: { city: "Paris" } }).setIn(["user", "city"], "Shanghai")` 一定按 HAMT 改内层对象吗？
2. `list.withMutations(l => { l.push(1); l.push(2) })` 若不接住返回值，原 `list` 会变长吗？
3. `Immutable.is(0, -0)` 与 `Object.is(0, -0)` 是否相同？

检查点：

1. 不一定。内层若仍是普通对象，就不会走 Map 节点更新。
2. 不会。`withMutations` 返回新集合（或原集合），不改调用者。
3. 不同。`is` 为 true，`Object.is` 为 false。

## 延伸阅读

- 官方站点：[immutable-js.com](https://immutable-js.com)
- 固定源码：[immutable-js/immutable-js](https://github.com/immutable-js/immutable-js) —— 本文绑定提交 `329f7a680efa262c310b938a343295880eefe4fc`
- [[immer]] —— 同一问题的 Proxy / copy-on-write 解法
- [[react]] —— 引用相等常被用来跳过渲染

## 关联

- [[immer]] —— 保留 plain object，用 draft 语法更新
- [[react]] —— 常见消费者：props / state 引用比较
- [[mobx]] —— 相反方向：就地改并追踪
- [[valtio]] —— Proxy 快照，不是持久化集合
- [[crdt-json]] —— 协同合并不在 Immutable.js 合同内

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
