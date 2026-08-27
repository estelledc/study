---
title: nanostores — 框架无关的原子 store
来源: https://github.com/nanostores/nanostores
日期: 2026-08-27
分类: 状态管理
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/nanostores/nanostores
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 400cbb3e8faa03e166d2b0cfef17528d547eb7d6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.5.2
---

## 是什么

nanostores 是一份 **vanilla 原子 store**：核心不知道 React。日常类比：总水管只负责水压，React / Vue / Svelte 龙头各自另装。你在一份文件里写：

```js
import { atom } from 'nanostores'
export const $count = atom(0)
export const increment = () => $count.set($count.get() + 1)
```

固定 1.5.2 的 `atom` 用 `Object.is` 决定要不要 `notify`。React 侧要另装 `@nanostores/react`，用 `useStore($count)`。那个适配器是独立仓库，不在本页 revision 里。

## 为什么重要

不读固定 1.5.2 源码，旧印象会把这几件事讲反：

- `atom.set` **会**做 `Object.is`，不是「每次新对象都必通知」之外还忽略同引用
- `computed` 的依赖是**函数第一个参数里的 store 列表**，不是第一次执行时偷偷收集
- 没有 listener 时调用 `get()` 会临时挂上又摘掉 listener，从而触发 `onMount`
- 体积数字来自他们自己的 size-limit，不是本页测过的 gzip

## 核心要点

固定版本可以看成四层：

1. **`atom`**：`value` / `init` / `listen` / `subscribe` / `set` / `notify`。`listen` 不立刻回调；`subscribe` 会先推当前值。`lc` 是 listener 计数，降到 0 调 `off()`。

2. **共享 epoch**：`notify` 先 `nanostoresGlobal.epoch++`。这个对象挂在 `globalThis`，避免同一应用打进两份核心时序号对不上。

3. **`map` / `computed`**：`map.setKey` 浅拷贝后改一键；传入 `undefined` 且键存在则 `delete`。`computed(stores, cb)` 把 `stores` 显式 `listen`；`batched` 把重算丢进 `setTimeout`。

4. **生命周期**：`onMount` 在第一次 `listen` 时跑 initialize；最后一位退订后等 `STORE_UNMOUNT_DELAY`（1000 ms）才 destroy。`deepMap` 开发态警告迁到 `@nanostores/deepmap`，计划 2.0 删除。

## 实践示例

### 案例 1：同值不通知，新对象才通知

```js
import { atom } from 'nanostores'

const $n = atom(1)
$n.listen(() => console.log('tick'))
$n.set(1)                 // Object.is 相同，不 notify
$n.set(2)                 // notify
const $user = atom({ id: 1 })
$user.set({ id: 1 })      // 新引用，会 notify
```

要比字段就用 `map.setKey`：它只在 `eqKey`（默认也是 `Object.is`）认为那一键变了才拷贝并通知。

### 案例 2：显式依赖的 computed

```js
import { atom, computed } from 'nanostores'

const $id = atom(1)
const $label = computed($id, (id) => `user-${id}`)
```

第二个参数**不会**在运行时再发现别的 atom。条件分支里新读的 store，必须写进第一个参数，或改用 `batched([...stores], fn)`。`cb` 若返回带 `.then` 和 `.t` 的 Promise，开发态会警告：2.0 将去掉这层，改走 `@nanostores/async`。

### 案例 3：React 只订一片 key

```jsx
import { map } from 'nanostores'
import { useStore } from '@nanostores/react'

export const $form = map({ name: '', age: 0 })

export function NameField() {
  const name = useStore($form, { keys: ['name'] })
  return name
}
```

`useStore` 内部是 `useSyncExternalStore`。传了 `keys` 就改走 `listenKeys`：`changed` 落在集合里才回调。`ssr: 'initial'` 时服务端快照用 `store.init`。适配器 peer 是 `nanostores ^1.2.0` 与 `react >= 18`。

## 踩过的坑

1. **组件里只写 `$store.get()`**：拿到的是当下值。没有 `useStore` / `listen`，之后的 `set` 不会让组件重绘。`get()` 在 `lc === 0` 时还会短暂挂 listener，副作用是可能触发 `onMount`。
2. **把业务写进组件**：官方形状是 store 文件导出 action，组件只订。混进组件就丢掉跨框架复用。
3. **当 `computed` 会隐式追踪**：1.5.2 要你列出 store。这和 [[jotai]] / [[mobx]] 的「执行时登记」不是同一合同。
4. **把 `deepMap` 当稳定入口**：源码已警告迁出，2.0 删除。

## 适用 vs 不适用场景

**适用**：

- 设计系统、island、micro-frontend 要跨框架共用一份 store
- 想把核心压到「一个 atom 函数」再按需加 map / computed
- React 18+ 且接受独立安装 `@nanostores/react`

**不适用**：

- 只要 React、已经习惯一个集中 store → [[zustand]]
- 需要隐式依赖图或直接 `state.x++` → [[jotai]] / [[mobx]] / [[valtio]]
- 大型协议、时间旅行、中间件链 → 不是本库合同
- 把 README / size-limit 字节区间写成实测包体

## 固定版本边界

- 本文绑定 `nanostores/nanostores@400cbb3e8faa03e166d2b0cfef17528d547eb7d6`，npm / tag 均为 `1.5.2`。
- 无生产 `dependencies`。`engines` 为 Node `^20.0.0 || >=22.0.0`。
- size-limit 配置写 Atom `372 B`、`map+computed` `912 B`；本页未跑 size-limit。
- React 绑定来自独立仓 `@nanostores/react@1.1.0`（`f2a32b4a13fbe80aa1dace347b4f5b71d08244f4`），不写入本页 `immutable_revision`。
- 本文未安装依赖、运行测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **框架无关要在第一天拆仓**——核心 export 里没有 React；hook 在另一个 repo。
2. **相等性是写进 atom 的字段**——默认 `eq = Object.is`，不是「永远通知」。
3. **派生依赖可以是显式名单**——`computed(stores, fn)` 把图交给调用方，而不是第一次执行。
4. **多副本问题用一枚全局计数器补**——`nanostoresGlobal.epoch` 对齐通知序号，不合并两份 atom 实例。

## 应用型自测

1. `$n` 当前是 `1`，再 `set(1)`。已注册的 `listen` 会不会跑？
2. `computed` 的回调里读了一个没写进第一个参数的 atom。那个 atom `set` 之后，computed 会不会重算？
3. 组件只调用 `$form.get()`，从不 `useStore`。随后 `setKey` 会让组件重绘吗？

检查点：

1. 不会。`Object.is` 相同就跳过 `notify`。
2. 不会。`computed` 只 `listen` 你列出来的 store。
3. 不会。UI 必须走适配器或自己 `listen`/`subscribe`。

## 延伸阅读

- 固定源码：[nanostores/nanostores](https://github.com/nanostores/nanostores) —— 本文绑定提交 `400cbb3e8faa03e166d2b0cfef17528d547eb7d6`
- React 适配器：[nanostores/react](https://github.com/nanostores/react)
- [[jotai]] —— 同样拆原子，但依赖由 `get()` 执行时登记
- [[zustand]] —— 一份 store + selector，对照多 atom

## 关联

- [[jotai]] —— React-first 原子；对照显式 store 列表
- [[zustand]] —— 集中 store；对照「一原子一订阅」
- [[valtio]] —— Proxy mutate；对照不可变 `set`
- [[mobx]] —— 隐式追踪；对照 nanostores 的显式名单
- [[svelte]] —— `$` 前缀和独立 store 模块影响了命名习惯

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
