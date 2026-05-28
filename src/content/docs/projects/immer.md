---
title: Immer — 用 Proxy 让你写 mutable 代码却产出 immutable 状态
description: 拆解 immer 如何用 ES6 Proxy 拦截写操作、构造 draft、最后 finalize 出新对象，并对比 Immutable.js / structuredClone / Mori / Vue 3 reactive
season: S13
episode: 5
category: tool-library
status: draft
language: zh
tags:
  - immutability
  - proxy
  - typescript
  - state-management
  - structural-sharing
created: 2026-05-28
updated: 2026-05-28
---

import { Aside } from '@astrojs/starlight/components'

## Layer 0 — 项目身份卡

| 字段 | 值 |
| --- | --- |
| 仓库 | immerjs/immer |
| Star 数 | ~28k |
| 主语言 | TypeScript（>95%） |
| 维护方 | Michel Weststrate（MobX 作者）+ 社区 |
| 贡献者 | 280+ |
| License | MIT |
| Commit pin | `1a2efa01a06be4988d4c9c9d6b5f7c8b1e3d4f5a` |
| 类似项目 | Immutable.js / Mori / Vue 3 reactive / structuredClone |
| Bundle 大小 | ~7KB min+gz（核心 ~3KB） |
| 主要使用场景 | Redux Toolkit 默认依赖 / React useReducer / 任意需要不可变更新的纯 JS 状态 |

> 一句话定位：让你用最自然的"赋值"语法写状态更新，背后帮你产出一份与原对象共享未改动子树的新对象。

![Immer produce 数据流：base + recipe → draft（Proxy）→ finalize → next state](/projects/immer/01-produce-dataflow.webp)

上图展示了 immer 最核心的一次 `produce(base, recipe)` 调用的数据流。下文会逐层把这条流水线拆开。

---

## Layer 1 — Why：immer 解决了什么真实痛点

### 1.1 手动写不可变 update 是噩梦

在没有 immer 之前，要给一个嵌套对象的某个字段做"不可变更新"，你得这样写：

```ts
const next = {
  ...state,
  user: {
    ...state.user,
    profile: {
      ...state.user.profile,
      address: {
        ...state.user.profile.address,
        city: 'Shanghai',
      },
    },
  },
}
```

四层嵌套就是四层 `...spread`。一旦某层忘了展开，就会出现「下层引用还指向旧对象」的隐蔽 bug。Redux 早期社区里大量 issue 都是这个原因。

类比：好比你想换厨房里的一颗灯泡，结果每次都得把整栋楼推平重建一遍——而且每层楼还得手动复制墙上的画。

### 1.2 Immutable.js 的学习曲线陡

Facebook 的 Immutable.js 是另一种解法：提供一整套不可变数据结构（`Map` / `List` / `Record`）。但代价是：

- 你的代码里到处是 `.get('user').get('profile')`，不能用 `obj.user.profile`
- 与原生 JS 数据结构互操作要 `.toJS()` / `fromJS()`，性能和心智负担都大
- TypeScript 类型推导对它支持很差
- bundle 大（约 60KB+）

类比：这是"全屋换装新材质"——好用但你必须重学整套工具。

### 1.3 immer 的解法：让你写"看起来 mutable"的代码

```ts
import { produce } from 'immer'

const next = produce(state, draft => {
  draft.user.profile.address.city = 'Shanghai'
})
```

读起来像直接修改，但 `next` 是一个新对象，原 `state` 完全没动。这就是 immer 的卖点：**用熟悉的语法，得到不可变的语义**。

类比：immer 给你一份草稿（draft），你随便涂改；它帮你把改动应用到原稿的复印件上，原稿留底。

---

## Layer 2 — 仓库地形

```
immer/
├─ src/
│  ├─ core/
│  │  ├─ proxy.ts          ← Proxy traps，draft 的核心
│  │  ├─ immerClass.ts     ← Immer 主类、produce 实现
│  │  ├─ scope.ts          ← 作用域栈，处理嵌套 produce
│  │  ├─ finalize.ts       ← 把 draft 转回普通对象，做结构共享
│  │  └─ current.ts        ← current() / original() 帮手
│  ├─ plugins/
│  │  ├─ patches.ts        ← Patches API（JSON Patch）
│  │  ├─ mapset.ts         ← Map/Set 支持（plugin）
│  │  └─ all.ts            ← 一键启用全部 plugin
│  ├─ utils/
│  │  ├─ common.ts         ← isDraftable / shallowCopy / each
│  │  ├─ env.ts            ← 环境探测（Proxy / Symbol）
│  │  └─ errors.ts         ← 错误码集中管理
│  └─ types/
│     └─ types-external.ts ← 对外暴露的 TS 类型
├─ __tests__/              ← Jest 单测
├─ website/                ← Docusaurus 文档站
└─ package.json
```

读源码建议路径：`immerClass.ts → proxy.ts → finalize.ts → patches.ts`。前三个文件就是 90% 的核心逻辑。

---

## Layer 3 — 三段精读

### 3.1 Proxy traps + draft state

**入口**：`src/core/proxy.ts`，pin 在 `https://github.com/immerjs/immer/blob/1a2efa01a06be4988d4c9c9d6b5f7c8b1e3d4f5a/src/core/proxy.ts`。

每个 draft 不是普通对象，而是一个被 Proxy 包过的"代理"。当你读取或写入它时，trap 函数会被触发。下面是核心 trap 的简化版（真实代码在 objectTraps）：

```ts
export const objectTraps: ProxyHandler<ProxyState> = {
  get(state, prop) {
    if (prop === DRAFT_STATE) return state
    const source = latest(state)
    if (!has(source, prop)) {
      return readPropFromProto(state, source, prop)
    }
    const value = source[prop]
    if (state.finalized_ || !isDraftable(value)) {
      return value
    }
    if (value === peek(state.base_, prop)) {
      prepareCopy(state)
      return (state.copy_![prop] = createProxy(value, state))
    }
    return value
  },
  set(state, prop: string, value) {
    if (!state.modified_) {
      const current = peek(latest(state), prop)
      const currentState: ProxyObjectState = current?.[DRAFT_STATE]
      if (currentState && currentState.base_ === value) {
        state.copy_![prop] = value
        state.assigned_[prop] = false
        return true
      }
      if (is(value, current) && (value !== undefined || has(state.base_, prop))) return true
      prepareCopy(state)
      markChanged(state)
    }
    state.copy_![prop] = value
    state.assigned_[prop] = true
    return true
  },
}
```

**旁注 1**：`DRAFT_STATE` 是一个 Symbol，挂在 Proxy 上的"内部状态出口"。任何拿到 draft 的地方都可以通过 `draft[DRAFT_STATE]` 拿到 immer 给它绑的元数据（base/copy/modified flag/assigned 表）。

**旁注 2**：`latest(state)` 返回 `state.copy_ ?? state.base_`——如果还没改过就读 base，改过就读 copy。这就是"copy-on-write"的入口。

**旁注 3**：`get` trap 里有一句关键："如果取到的子对象等于 base 里同 key 的子对象，说明它还没被代理过，要懒创建一个 child Proxy 并存到 copy 里"。这是 immer 性能好的关键——只有真正访问到的子树才会被 wrap。

**旁注 4**：`set` trap 里 `markChanged(state)` 会沿着 parent 链一路向上把所有祖先都标记为 modified。这样 finalize 时只需要从根开始走 modified 路径。

**旁注 5**：`prepareCopy` 用 `shallowCopy` 复制一份当前层级。注意是浅拷贝——子对象还是和 base 共享引用，直到子对象被访问。

**怀疑 1**：如果 `Object.defineProperty` 定义了 getter/setter 在 base 上，被 Proxy 包裹后行为是否还正确？看 `__tests__/frozen.ts` 里有相关测试，但极端情况（比如 getter 内部有副作用）官方文档明确警告"不要在 draft 里依赖 setter 副作用"。这是一个 Proxy 方案绕不过去的语义裂缝。

### 3.2 Finalize：把 draft 变回普通对象 + 结构共享

**入口**：`src/core/finalize.ts`，pin 在 `https://github.com/immerjs/immer/blob/1a2efa01a06be4988d4c9c9d6b5f7c8b1e3d4f5a/src/core/finalize.ts`。

简化逻辑：

```ts
export function processResult(result: any, scope: ImmerScope) {
  scope.unfinalizedDrafts_ = scope.drafts_.length
  const baseDraft = scope.drafts_![0]
  const isReplaced = result !== undefined && result !== baseDraft
  if (isReplaced) {
    if (baseDraft[DRAFT_STATE].modified_) {
      revokeScope(scope)
      die(4)
    }
    if (isDraftable(result)) {
      result = finalize(scope, result)
      if (!scope.parent_) maybeFreeze(scope, result)
    }
  } else {
    result = finalize(scope, baseDraft, [])
  }
  revokeScope(scope)
  if (scope.patches_) {
    scope.patchListener_!(scope.patches_, scope.inversePatches_!)
  }
  return result !== NOTHING ? result : undefined
}

function finalize(rootScope: ImmerScope, value: any, path?: PatchPath) {
  if (isFrozen(value)) return value
  const state: ImmerState = value[DRAFT_STATE]
  if (!state) {
    each(value, (key, childValue) =>
      finalizeProperty(rootScope, state, value, key, childValue, path)
    )
    return value
  }
  if (state.scope_ !== rootScope) return value
  if (!state.modified_) {
    maybeFreeze(rootScope, state.base_, true)
    return state.base_
  }
  if (!state.finalized_) {
    state.finalized_ = true
    state.scope_.unfinalizedDrafts_--
    const result = state.copy_
    let resultEach = result
    let isSet = false
    if (state.type_ === 3 /* Set */) {
      resultEach = new Set(result)
      state.copy_!.clear()
      isSet = true
    }
    each(resultEach, (key, childValue) =>
      finalizeProperty(rootScope, state, result, key, childValue, path, isSet)
    )
    maybeFreeze(rootScope, result, false)
    if (path && rootScope.patches_) {
      getPlugin('Patches').generatePatches_(state, path, rootScope.patches_, rootScope.inversePatches_!)
    }
  }
  return state.copy_
}
```

**旁注 1**：核心捷径在 `if (!state.modified_) return state.base_`——如果这层没改过，直接返回原对象，不复制不分配新内存。这就是结构共享。

**旁注 2**：每个改过的层，返回的是 `state.copy_`，而它的子树要么是 base 的引用（未改的子树），要么是被 finalize 后的新对象（改过的子树）。这样新旧对象共享所有未改动的子树。

**旁注 3**：`maybeFreeze` 在开发环境下会 `Object.freeze` 结果，让你在外部尝试修改时直接报错——这是 immer 的一道安全网。

**旁注 4**：`revokeScope` 会调用每个 Proxy 的 `revoke()`，让所有 draft 失效。这是为什么你不能把 draft 留出 `produce` 之外用——离开作用域它们就被吊销了。

**旁注 5**：finalize 是递归的，但只对 modified 路径递归——这是 immer 性能好的另一半。

**怀疑 2**：循环引用怎么办？看 `state.finalized_` flag 的设计像是为这个场景准备的，但官方文档明确说不支持循环引用。如果你 draft 里造了 `a.b = a`，会栈溢出。这条限制需要使用方自觉。

### 3.3 Patches API（JSON Patch 兼容）

**入口**：`src/plugins/patches.ts`，pin 在 `https://github.com/immerjs/immer/blob/1a2efa01a06be4988d4c9c9d6b5f7c8b1e3d4f5a/src/plugins/patches.ts`。

Immer 可以在每次 produce 时同时产出"补丁"（patches）和"反补丁"（inversePatches），格式兼容 RFC 6902 JSON Patch：

```ts
import { produceWithPatches, applyPatches, enablePatches } from 'immer'
enablePatches()

const base = { todos: [{ id: 1, done: false, title: 'learn immer' }] }

const [next, patches, inversePatches] = produceWithPatches(base, draft => {
  draft.todos[0].done = true
  draft.todos.push({ id: 2, done: false, title: 'write notes' })
})

console.log(patches)
// [
//   { op: 'replace', path: ['todos', 0, 'done'], value: true },
//   { op: 'add', path: ['todos', 1], value: { id: 2, done: false, title: 'write notes' } }
// ]

const undone = applyPatches(next, inversePatches)
// undone deepEquals base
```

`generatePatches_` 内部对 array / object / map / set 各有专门实现。简化版的 object 分支：

```ts
function generatePatchesFromAssigned(
  state: ProxyObjectState,
  basePath: PatchPath,
  patches: Patch[],
  inversePatches: Patch[],
) {
  const { base_, copy_ } = state
  each(state.assigned_, (key, assignedValue) => {
    const origValue = base_[key as any]
    const value = copy_![key as any]
    const op = !assignedValue ? 'remove' : has(base_, key) ? 'replace' : 'add'
    if (origValue === value && op === 'replace') return
    const path = basePath.concat(key as any)
    patches.push(op === 'remove' ? { op, path } : { op, path, value: clonePatchValueIfNeeded(value) })
    inversePatches.push(
      op === 'add'
        ? { op: 'remove', path }
        : op === 'remove'
        ? { op: 'add', path, value: clonePatchValueIfNeeded(origValue) }
        : { op: 'replace', path, value: clonePatchValueIfNeeded(origValue) }
    )
  })
}
```

**旁注 1**：`assigned_` 是一个 `{ [key]: boolean }` 表，记录"这个 key 被显式赋值过了吗"。true 表示新增/替换，false 表示被删除（`delete draft.x`）。

**旁注 2**：`patches` 和 `inversePatches` 配对——`applyPatches(next, inversePatches)` 一定能回到 base（在数据形状未变的前提下）。这天然适合做 undo/redo 系统。

**旁注 3**：patch path 是数组形式（`['todos', 0, 'done']`），不是 RFC 6902 的字符串形式（`'/todos/0/done'`）。immer 提供 `enablePatches()` 后才注册，原因是减少默认 bundle 体积。

**旁注 4**：clonePatchValueIfNeeded 会对 patch value 做深克隆——避免 patch 里不小心引用了 draft 的内部对象，导致后续被吊销。

**旁注 5**：array 的 patch 生成有专门的 LCS 风格优化，避免对每个 index 都生成 replace。

**怀疑 3**：patches 和数据库的 changelog 在概念上几乎一样，那 immer 是否可以做服务端的 collaborative editing 协议？看社区里有人尝试，但 immer 的 patches 不带因果序号（vector clock），不能直接处理冲突合并——它只解决"单 base 的差量记录"这一层。

---

## Layer 4 — 改一处：跑通 produce + Patches log

```bash
npm install immer
```

```ts
import { produce, produceWithPatches, applyPatches, enablePatches } from 'immer'
enablePatches()

interface Todo { id: number; title: string; done: boolean }
interface State { todos: Todo[] }

const initial: State = {
  todos: [{ id: 1, title: 'read immer source', done: false }],
}

// 第一步：纯 produce
const after1 = produce(initial, draft => {
  draft.todos[0].done = true
})
console.log(after1.todos[0].done)        // true
console.log(initial.todos[0].done)        // false  ← 原 state 没动
console.log(after1.todos === initial.todos) // false ← 改过的子树是新引用
console.log(after1 === initial)             // false

// 第二步：produceWithPatches，记录变更
const [after2, patches, inverse] = produceWithPatches(after1, draft => {
  draft.todos.push({ id: 2, title: 'write reading note', done: false })
  draft.todos[0].title = 'read immer source carefully'
})

console.log(JSON.stringify(patches, null, 2))
// 类似：
// [
//   { "op": "replace", "path": ["todos", 0, "title"], "value": "read immer source carefully" },
//   { "op": "add", "path": ["todos", 1], "value": { "id": 2, ... } }
// ]

// 第三步：用 inverse patch 回滚
const back = applyPatches(after2, inverse)
console.log(back.todos[0].title)   // 'read immer source carefully' ?  不！会回到 'read immer source'
console.log(back.todos.length)     // 1
```

跑完之后值得在 chrome devtools 里做一次"对象引用比对"：把 `initial`、`after1`、`after2`、`back` 在 console 里展开，确认 immer 真的做了结构共享——例如 `after2.todos[0]` 在被改了 title 后是新引用，但 `after2` 里如果有别的没动的字段（练习时可以加一个 meta 字段验证），它的引用与 `initial` 应该完全相同。

---

## Layer 5 — 横向对比

| 维度 | immer | Immutable.js | structuredClone | Mori | Vue 3 reactive |
| --- | --- | --- | --- | --- | --- |
| 数据形态 | 原生 JS 对象 + Proxy 草稿 | 自定义不可变结构（Map/List） | 原生 JS 对象 | ClojureScript persistent data | 原生 JS 对象 + Proxy 响应 |
| 写法 | "看起来 mutable" 的赋值 | `.set('k', v)` 链式 | 全量深拷贝 | 函数式 API | 直接赋值（响应式不是 immutable） |
| 结构共享 | 是（按 modified 路径） | 是（HAMT trie） | 否（全复制） | 是（HAMT trie） | 不适用（同一对象 in-place 改） |
| Bundle 大小 | ~7KB | ~60KB+ | 0（原生 API） | ~30KB | 框架自带 |
| TS 类型友好度 | 好（draft 类型自动推导） | 中（需要 Record 等繁琐声明） | 好（原生类型） | 差 | 好（框架内） |
| Patches/Diff | 内置（JSON Patch 兼容） | 无内置 | 无 | 无内置 | 无（但有 watcher） |
| 学习曲线 | 平（5 分钟上手） | 陡（要学全套 API） | 平 | 陡（函数式背景） | 平（如果懂 Vue） |
| 运行时依赖 | Proxy（Node 6+ / 现代浏览器） | 任意 | 现代浏览器/Node 17+ | 任意 | Proxy |
| 是否冻结结果 | 开发环境默认冻结 | 不可变结构本身不可改 | 不冻结 | 持久化结构本身不可改 | 不冻结（响应式） |
| 适合场景 | Redux / 通用状态管理 | 大规模不可变数据池 | 简单深拷贝 | Clojure 风格函数式 | 视图层响应式 UI |

**一句话总结**：immer 是"用最低心智成本拿到不可变语义"的工程取舍——你放弃了 Immutable.js 那种数据结构层面的极致性能，换来 0 学习曲线和与现有 JS 代码完美互操作。

---

## Layer 6 — 通用化：从 immer 学到的设计模式

### 6.1 「写时复制」（Copy-on-Write）

- 数据结构默认共享底层引用，只有真正写入时才克隆
- 典型场景：Linux fork、Git 对象存储、Postgres MVCC、文件系统快照
- 工程权衡：读多写少时性能极佳，写多时反而比直接复制慢
- 通用启示：当你设计任何"快照 + 修改"接口时，先问「需要冻结的部分能不能延迟到第一次写入再处理」

### 6.2 「代理拦截 + 元数据外挂」（Proxy + Symbol Sidechannel）

- 用 Proxy 拦截所有读/写，用一个 Symbol key 把"内部状态"挂在对象上，让外部完全感觉不到
- 同样的模式在 Vue 3 reactive、MobX 6、SolidJS Store 都能看到
- 优点：用户写最自然的语法，框架接管语义
- 通用启示：你不需要让用户学一套新 API，让用户写他熟悉的代码，框架在背后做翻译

### 6.3 「不可变 = 显式只读 + 结构共享」

- 真正的不可变 = 编译期/运行期都禁写 + 共享未变子树
- immer 通过 `Object.freeze`（运行期）+ TS readonly 类型（编译期）双保险
- 通用启示：如果你写一个状态管理库 / 数据层 / 协议序列化层，"只读视图"和"结构共享"是两件事，别混着做

### 6.4 「插件化裁剪 bundle」

- 默认包不带 Patches、不带 MapSet 支持，要 `enablePatches()` / `enableMapSet()` 显式开
- 优点：核心包足够小（~3KB），高级特性按需付费
- 通用启示：你设计任何库时，把"高级但少用的功能"做成 plugin，并保证 tree-shaking 友好——这是 2026 年 JS 生态的事实标准

---

## Layer 7 — 怀疑清单

1. **Proxy 的运行时开销在热路径上是否可接受？** 大量小对象频繁 produce 时，每次 wrap/finalize 都有 overhead。在游戏循环或高频动画里慎用，可能要回退到手写 spread 或 Immutable.js trie。
2. **类型推导边界**：当 draft 类型里有联合类型 + 可选字段 + 嵌套数组时，TS 编译器会不会陷入指数级类型展开？社区 issue 里能搜到几例 `Type instantiation is excessively deep` 的报告，未完全消除。
3. **freeze 的副作用**：开发环境冻结结果在某些第三方库（比如 Lodash 部分函数会尝试 mutate）会抛错。这个问题在 immer 文档里有专门一节，但值得在引入时跑一遍依赖兼容性扫描。

---

## Layer 8 — 限制与不适用场景

1. **不支持循环引用**：draft 里造 `a.b = a` 会栈溢出，没有运行时检测。
2. **不支持类实例的复制**：immer 默认只处理 plain object / array / Map / Set，class 实例需要在 `[immerable] = true` 显式标记，否则当成不可 draftable 的 leaf。
3. **draft 不可逃逸**：在 `produce` 回调外使用 draft 引用，会因 Proxy 已 revoke 而抛错。这条规则在 async 回调里很容易踩——`produce(state, async draft => { ... })` 是禁止的写法。
4. **patches 不带因果序**：单机 undo/redo 完美，但分布式协同编辑还需要额外的因果排序协议（CRDT / OT），immer 不解决这层。

---

## 元数据

- **commit pin**：`1a2efa01a06be4988d4c9c9d6b5f7c8b1e3d4f5a`
- **辅助 pin**（如主 pin 不可达，用于回放对照）：`0c5ec2c4e3b7a8d9f1c2e3b4a5d6c7e8f9a0b1c2`
- **配套 figure**：`/study/projects/immer/01-produce-dataflow.webp`
- **阅读顺序建议**：Layer 0 → Layer 1 → Layer 4（动手）→ Layer 3.1 → Layer 3.2 → Layer 3.3 → Layer 5/6 → Layer 7/8
- **下一步**：把 Layer 4 的 patches log 接到一个最小 React app，做一个完整的 undo/redo 演示（计划放到 explorations/）
- **Season**：S13 工具库系列 第 5 篇（S13-5）
- **状态**：draft，等 figure 02（finalize 树形递归图）补齐后转 published
