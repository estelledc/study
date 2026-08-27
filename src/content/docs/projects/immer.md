---
title: Immer — 用 Proxy 写出可变语法、产出不可变状态
description: 用 Proxy 写出可变语法，产出带结构共享的不可变状态。
来源: https://github.com/immerjs/immer
日期: 2026-05-30
分类: 状态管理
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/immerjs/immer
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b00474e3755954f6b27a392dcb4bce97254c100c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.1.18
---

## 是什么

Immer 让你用赋值、`push` 这类可变语法写状态更新，但最终得到一份新对象，原对象保持不动。日常类比：你在透明书皮上涂改；店员只重印被涂过的那几页，没动的页仍夹回原书。

```ts
import { produce } from "immer"

const next = produce(state, draft => {
  draft.user.profile.address.city = "Shanghai"
})
```

固定 `11.1.18` 的默认 `produce` 只给 plain object 与 array 套 Proxy。`Map` / `Set`、JSON Patch 与数组方法优化分别由 `enableMapSet`、`enablePatches`、`enableArrayMethods` 按需加载。

## 为什么重要

不读固定源码，下面这些说法很容易写错：

- 为什么 Redux Toolkit 的 reducer 能“看起来 mutate”，却仍交出新引用
- 为什么 `produce(new Map(), …)` 在没调用 `enableMapSet()` 时会直接失败
- 为什么 recipe 既 `return` 新值又改 draft 会抛错
- 为什么异步回调里继续碰 `draft` 会遇到已撤销的 Proxy

## 核心要点

一次 `produce(base, recipe)` 可以拆成四步：

1. **建 scope 与根 Proxy**：`enterScope` 后，`createProxy` 给 draftable 的根值套 `Proxy.revocable`。target 实际是内部 state，不是原对象。

2. **读时才下钻、写时才浅拷**：get trap 碰到 draftable 子值才再包一层；set / delete 才 `shallowCopy` 当前层并沿父链 `markChanged`。没碰到的子树继续共享原引用。

3. **finalize 只走改过的路径**：recipe 返回 `undefined` 时，从根 draft 递归；未改节点退回 `base_`，改过的节点留下 `copy_`。recipe 返回另一个值则整树替换。

4. **撤销 Proxy**：`processResult` 结束后 `revokeScope`。draft 不能带出这次调用。

## 实践示例

### 案例 1：嵌套赋值只复制路径

```ts
const next = produce(state, draft => {
  draft.user.profile.address.city = "Shanghai"
})
```

`next.user` 是新对象；`next.posts` 若没被写过，仍与 `state.posts` 同一引用。这是结构共享，不是深拷贝整棵树。

### 案例 2：返回值与 draft 互斥

```ts
const replaced = produce(state, draft => {
  return { ...state, ready: true } // 整树替换
})
```

固定实现里，recipe 若返回新值同时又改过 draft，会走 `die(4)`。要么改 draft 并省略 return，要么 return 替换值且不要改 draft。`nothing` 用来把结果收成 `undefined`。

### 案例 3：Patches 是插件，不是默认

```ts
import { enablePatches, produceWithPatches, applyPatches } from "immer"
enablePatches()

const [next, patches, inverse] = produceWithPatches(base, draft => {
  draft.todos[0].done = true
})
const back = applyPatches(next, inverse)
```

`produceWithPatches` 通过 patch listener 取插件；没先 `enablePatches()` 会在 `getPlugin("Patches")` 失败。patches 形状接近 JSON Patch，但是单机 undo 材料，不带因果序。

## 踩过的坑

1. **把 Map/Set 当成默认能力**：`isDraftable` 对 `Map`/`Set` 为真，但代理实现在 `enableMapSet()`。未加载插件时 `produce` 会要求插件。
2. **异步 recipe**：`produce` 同步等 recipe 返回后立刻 revoke。把 draft 交给 `async` / `then` 会碰到“revoked proxy”错误。
3. **`enableArrayMethods()` 的回调拿到 base**：开启后 `sort` / `filter` 等走优化路径；回调参数不是 draft。在回调里改元素不会按 draft 语义记账。
4. **默认冻结**：`autoFreeze_` 默认 `true`，注释写明生产环境也默认冻结。后续若再 mutate `next`，应先确认自己关过 `setAutoFreeze`。
5. **循环引用**：错误表有 “forbids circular references”，但本 revision 的 `src/` 未见对应 `die(5)` 调用。不要把“表里有这句话”写成“运行时一定拦住”。

## 适用 vs 不适用场景

**适用**：

- reducer / store updater 以 plain object 与 array 为主
- 需要结构共享，且能接受 Proxy 与默认 freeze
- 单机 undo/redo，并愿意显式打开 patches 插件

**不适用**：

- 状态主体是 `Map`/`Set` 或 class 实例，却不想维护插件与 `[immerable]`
- 需要把 draft 带进异步边界
- 要用多人协同合并——patches 不解决冲突
- 已经选择 [[immutable-js]] 这类持久化集合，不想再包一层 Proxy

## 固定版本边界

- 本文绑定 `immerjs/immer@b00474e3755954f6b27a392dcb4bce97254c100c`。GitHub tag `v11.1.18` 与 npm `immer@11.1.18` 的 `gitHead` 都指向它。
- 该提交工作区 `package.json` 仍写 `10.0.3-beta`，发布脚本是 `semantic-release`；published 版本以 npm/tag 为准。
- `useStrictIteration_` 字段默认 `false`，与部分源码注释“默认开启”不一致；以字段初值为准。
- 本文未安装依赖、运行上游 vitest、测量 bundle 或对比性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **可变语法可以只是陷阱，不是真 mutate**——Proxy 把“看起来赋值”变成 copy-on-write。
2. **默认可起草的集合比口头传说更窄**——object/array 在核心路径；Map/Set/patches/数组优化都是插件。
3. **返回值与 draft 是两条互斥出口**——同时用会失败，不是“谁覆盖谁”。
4. **published 版本可能不写在 git `package.json` 里**——semantic-release 仓要以 tag / npm `gitHead` 对 revision。

## 应用型自测

1. 未调用任何 `enable*` 时，`produce(new Map(), draft => draft.set("a", 1))` 会成功吗？
2. recipe 里先改 `draft.count++`，再 `return { count: 0 }`，固定 11.1.18 会怎样？
3. `produce(state, async draft => { draft.x = 1 })` 返回的 Promise resolve 之后，还能安全读那个 `draft` 吗？

检查点：

1. 不会；Map 代理要先 `enableMapSet()`。
2. 抛错：不能既改 draft 又返回替换值。
3. 不能。recipe 返回 Promise 后 scope 已 revoke。

## 延伸阅读

- 官方文档：[immerjs.github.io/immer](https://immerjs.github.io/immer/)
- 固定源码：[immerjs/immer](https://github.com/immerjs/immer) —— 本文绑定提交 `b00474e3755954f6b27a392dcb4bce97254c100c`
- [[immutable-js]] —— 持久化 HAMT / List，对照“换数据结构”还是“换更新语法”
- [[mobx]] —— 同一作者的另一方向：就地改并追踪依赖

## 关联

- [[immutable-js]] —— 持久化集合；immer 保持 plain JS 形状
- [[mobx]] —— 同作者；响应式 mutate vs 产出新树
- [[react]] —— 常见于 `useReducer` / Redux Toolkit 一类更新
- [[zustand]] —— 可用 immer middleware 写 draft
- [[valtio]] —— 另一条 Proxy 路线，订阅 mutation 而不是产出新对象
- [[crdt-json]] —— patches 不够做协同合并时的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
