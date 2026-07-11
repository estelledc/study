---
title: Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
来源: 'https://github.com/immerjs/immer'
日期: 2026-05-30
分类: projects
难度: 初级
---

## 是什么

Immer 是一个**只有几 KB** 的 JS 库，让你用**最熟悉的赋值语法**（`obj.x.y = 1`）写状态更新，但最终拿到一份**新对象，原对象一字未改**。日常类比：像复印店——你拿一份"草稿"在上面随便涂改，店员最后给你一份**只把你涂过的那几行重印、其余页直接夹回原件复印**的新版本。

它的核心 API 只有一个：

```ts
import { produce } from 'immer'

const next = produce(state, draft => {
  draft.user.profile.address.city = 'Shanghai'
})
```

读起来像直接修改，但 `next` 是新对象，`state` 完全没动。Redux Toolkit 把它列为默认依赖，所以只要你写过现代 Redux，几乎一定隐式用过它。

## 为什么重要

不理解 immer，下面这些事都没法解释：

- 为什么 Redux Toolkit 的 reducer 写起来像直接 mutate state，**却没有 bug**
- 为什么社区一夜之间从"四层 `...spread`"风格转向"看起来 mutable"的写法
- 为什么 MobX 作者写完响应式库还要再造一个不可变库（思路相反，目标互补）
- 为什么 TypeScript 在 immer 里能正确推出 `draft` 类型——这是 Proxy + 泛型的精巧合作

## 核心要点

immer 的工作可以拆成 **三步**：

1. **包代理**：`produce` 拿到 base 后，**不**深拷贝它，而是用 Proxy 把它的最外层包一层。日常类比：像给一本书外面加一层透明书皮——书还是原书，但所有翻页动作经过书皮才到书。

2. **懒拷贝（copy-on-write）**：你访问哪个子对象，才**临时**给那个子对象再包一层 Proxy；你写哪个字段，才**浅拷贝**那一层并把改动写进去。没碰到的子树原封不动。

3. **finalize 走改动路径**：`produce` 回调结束时，从根开始只走"被标记改过"的子树，把改过的层换成新对象，未改的层**直接用原引用**塞回去。这样新旧对象**共享所有没动的子树**——这叫"结构共享"。

三步加起来就是一次 `produce(state, recipe)` 调用。

## 实践案例

### 案例 1：四层嵌套，一行就改完

不用 immer 时你得这样写：

```ts
const next = {
  ...state,
  user: { ...state.user, profile: { ...state.user.profile,
    address: { ...state.user.profile.address, city: 'Shanghai' } } }
}
```

用 immer：

```ts
const next = produce(state, draft => {
  draft.user.profile.address.city = 'Shanghai'
})
```

**逐部分解释**：`draft` 看起来就是 state，但其实是 Proxy；写 `.city = 'Shanghai'` 时，set trap 会沿着 user → profile → address 一路把祖先标记为改过；finalize 时只浅拷贝这条路径，其他兄弟节点（如 `state.posts`）和 `next.posts` 仍是同一个引用。

### 案例 2：数组操作直接 push / splice

```ts
const state = { todos: [{ id: 1, done: false }] }

const next = produce(state, draft => {
  draft.todos.push({ id: 2, done: false })
  draft.todos[0].done = true
})
```

`Array.prototype.push` 在 mutable 编程里天天写，但传统不可变写法要 `[...arr, newItem]`。immer 让 push 也"看起来可改、实际不变"——内部用 Proxy 拦截了数组的 set。`next.todos !== state.todos`，但 `next` 之外没动的字段全部和 `state` 共享引用。

### 案例 3：produceWithPatches 做 undo/redo

```ts
import { produceWithPatches, applyPatches, enablePatches } from 'immer'
enablePatches()

const base = { todos: [{ id: 1, title: 'learn', done: false }] }
const [next, patches, inverse] = produceWithPatches(base, draft => {
  draft.todos[0].done = true
})
// patches: [{ op: 'replace', path: ['todos', 0, 'done'], value: true }]
// inverse: [{ op: 'replace', path: ['todos', 0, 'done'], value: false }]
const back = applyPatches(next, inverse)  // back deepEquals base
```

`patches` 兼容 RFC 6902 JSON Patch，单机 undo/redo 几乎免费——只要把每次的 inverse 压栈即可。

## 踩过的坑

1. **不支持循环引用**：在 draft 里写 `a.b = a` 会**栈溢出**。immer 没有运行时检测，因为加上检测会拖慢 99% 的正常情况。
2. **class 实例不会自动被代理**：默认只代理 plain object / array / Map / Set。class 必须显式 `[immerable] = true` 才进 draft 体系，否则当成"叶子"原封不动复制。
3. **draft 不能逃出 produce**：`produce` 一返回，所有 Proxy 立刻被 revoke。如果你在外面再访问 draft 引用会抛错。`produce(state, async draft => ...)` 是**禁止写法**——异步回调里 draft 早就废了。
4. **patches 不带因果序号**：单机 undo/redo 没问题，但如果想做多人协同编辑，patches 不解决冲突合并，需要再叠 CRDT 或 OT。

## 适用 vs 不适用场景

**适用**：

- Redux / Zustand / 任意"reducer 改 state"模式——immer 是默认最佳搭档
- 中等深度（≤ 6 层）嵌套对象的局部更新
- 需要 undo/redo 且能接受单机一致性的 UI 应用
- 代码库已是 plain JS object，不想换数据结构层

**不适用**：

- 极高频写场景（游戏循环 / 高频动画 / 单帧上万次 produce）—— Proxy 开销可能成瓶颈，考虑手写 spread 或换 `Immutable.js` 的 HAMT trie
- 大量 class 实例的状态——要么全打 `[immerable]`，要么 immer 不是合适工具
- 分布式协作编辑——patches 不带因果序，要叠 [[crdt-json]]
- 真正需要持久化数据结构（O(log n) 合并 / 大版本树）—— Clojure 风格的 persistent map 更合适

## 历史小故事（可跳过）

- **2017 年**：Michel Weststrate（MobX 作者）开源 immer。灵感来自 Clojure persistent data + ES6 新规范的 Proxy 终于落地到主流浏览器，让"拦截一切读写"成为可能。
- **2018-2019 年**：Redux Toolkit 把 immer 列为默认依赖，社区一夜之间从 spread 地狱解脱出来。
- **2021 年**：v9 大重写，全面 TypeScript 化，把 Patches、MapSet 拆成可选插件——默认 bundle 缩到 ~3KB。
- **设计取舍**：MobX 让你"原地改、自动追踪"；immer 让你"看起来原地改、实际全新对象"。同一个作者，两个相反方向，覆盖了状态管理的两端。

## 学到什么

1. **API 的认知摩擦比性能更值钱**——immer 用一点点运行时开销换"零学习曲线"，赢得了整个 Redux 生态
2. **Proxy + Symbol 内部状态外挂** 是 2026 年 JS 框架的标准模式（Vue 3 reactive / MobX 6 / SolidJS Store / immer）都用同一招
3. **结构共享**让"不可变"不再昂贵——只复制真改的那条路径，其他子树共享引用
4. **插件化 + 默认最小** 是现代 JS 库的事实标准——核心包小、高级特性按需开启

## 延伸阅读

- 官方文档：[immerjs.github.io/immer](https://immerjs.github.io/immer/)（10 分钟通读 produce / patches / class 适配）
- 视频：[Michel Weststrate — Immer, immutability and the wonderful world of Proxies](https://www.youtube.com/watch?v=-gJbS7YjcSo)（作者本人讲设计取舍，30 分钟）
- 源码精读切入点：`src/core/proxy.ts`（Proxy traps）→ `src/core/finalize.ts`（结构共享递归）→ `src/plugins/patches.ts`（JSON Patch 生成）
- [[mobx]] —— 同一作者的反方向库，看完会更理解 immer 的设计选择
- [[salsa-adapton]] —— 另一种"只重算改了的那部分"思路，但用在计算图而非状态树

## 关联

- [[mobx]] —— 同作者；MobX 让你直接 mutate 并自动追踪，immer 让你看起来 mutate 实则不变
- [[react]] —— immer 在 React 状态管理里几乎无处不在（Redux Toolkit / useReducer）
- [[zustand]] —— 默认集成 immer middleware，写 store 时也能 draft.x = y
- [[jotai]] —— 原子化状态库，配合 immer 处理嵌套原子时仍能享受 draft 写法
- [[valtio]] —— Proxy 路线的另一端：直接订阅 mutation，不像 immer 产出新对象
- [[self-adjusting]] —— 思路同源：变化只触发依赖部分的重算/重建
- [[crdt-json]] —— immer 的 patches 不能解决冲突合并，要协同得叠 CRDT

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
