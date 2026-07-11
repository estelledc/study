---
title: valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
来源: 'https://github.com/pmndrs/valtio'
日期: 2026-05-30
分类: projects / 前端状态
难度: 中级
---

## 是什么

valtio 是 React（也兼容纯 JS）的状态管理库。一句话定义：**用一层 JS Proxy 把状态对象包成"会喊"的对象——你直接 `state.count++` 就能让组件重渲染**，不用写 `set(s => ({ count: s.count + 1 }))` 那种 callback 仪式。

日常类比：像在房间里装了**红外感应灯**。你不用按开关（不用调 `set`），只要走过去（直接改属性），灯就自己亮（订阅者收到通知）；同时每盏灯只盯着自己那块地（每个组件只在它读过的字段变了才重渲染）。

valtio 的核心 vanilla.ts 459 行 + react.ts 174 行，外部依赖只有一个 `proxy-compare`。它的存在证明：状态管理库可以**直接利用 JS 语言能力（Proxy）而不是发明新 API**。

## 为什么重要

不理解 valtio 的思路，下面这些问题会一直绕不清：

- 为什么 zustand 要写 `set` 函数、Redux 要 dispatch action，这些"仪式"到底是必要的还是历史包袱
- 为什么 MobX 写 `obj.x++` 也能响应式但被嫌"重"，valtio 同样写法却被认为"轻"
- 为什么 React 18 的 `useSyncExternalStore` 让一票第三方状态库百花齐放
- 为什么"嵌套对象状态"在不同库里成本差这么远（valtio 少一层 produce 仪式，zustand 常要配 immer）

## 核心要点

valtio 的全部魔法可以拆成 **三层叠加**：

1. **Proxy.set trap 把赋值变成事件**——`Proxy.set` 是拦截赋值的钩子。你写 `state.x = 1`，它先用 `Object.is`（严格相等）比对新旧值，相同就短路；不同则记下事件并通知订阅者。类比：邮筒里塞信，邮递员立刻知道。

2. **版本号 + 快照缓存**——每次有效 mutate 让全局版本号 `++`；React 侧 `useSnapshot` 拿一个不可变快照，**同版本返回同一引用**。类比：小区公告栏的"第 N 次更新"，同一版印的传单都长一样，组件靠这个判断"要不要重画"。

3. **proxy-compare 路径跟踪**——React 渲染时再套一层 proxy，记录"这个组件读了 `snap.user.name`"。下次 mutate 后比对：只要它读过的路径没变，就跳过重渲染。类比：每个组件随身带个清单，只盯着清单上的字段。

三层加起来：**写法朴素 + 订阅精细 + 引用稳定**，这是 valtio 区别于其他库的核心。理解了这三层，剩下 proxyMap / subscribeKey / devtools 都是"上层应用"，套路同。

## 实践案例

### 案例 1：最简计数器（零仪式）

```tsx
import { proxy } from 'valtio'
import { useSnapshot } from 'valtio/react'

const state = proxy({ count: 0 })

function Counter() {
  const snap = useSnapshot(state)
  return <button onClick={() => state.count++}>{snap.count}</button>
}
```

**逐部分解释**：

- `proxy({ count: 0 })`：把普通对象包成"会喊"的状态，放在模块级，别放进组件函数里
- `useSnapshot(state)`：拿到只读快照 `snap`，组件用它读数；同版本引用稳定
- 点击时写 `state.count++`（改原 proxy），读用 `snap.count`——两份句柄，读写分开

### 案例 2：嵌套对象（购物车）

```tsx
const cart = proxy({
  items: [{ id: 1, name: 'A', qty: 1 }],
  total: 0,
})

function inc(id: number) {
  const it = cart.items.find(i => i.id === id)!
  it.qty++
  cart.total = cart.items.reduce((s, i) => s + i.qty, 0)
}
```

**逐部分解释**：

1. `find` 拿到深层 item——嵌套对象也被自动包成 proxy，不用手写深拷贝
2. `it.qty++` 直接改深层字段；不必 `{...cart, items: [...]}`
3. 手写 `cart.total = reduce(...)` 同步总价（也可用 `subscribe` 派生，不必每次手算）
4. 只读 `snap.total` 的组件会重渲染——因为 `total` 也被改了

### 案例 3：组件外订阅（同步 localStorage）

```ts
import { subscribe, subscribeKey } from 'valtio'

subscribe(cart, () => {
  localStorage.setItem('cart', JSON.stringify(cart))
})

subscribeKey(cart, 'total', (total) => console.log('新总价', total))
```

**逐部分解释**：

- `subscribe(cart, cb)`：任何 `cart.*` 改动都跑 callback，写在 React 组件外也行
- `JSON.stringify(cart)`：把当前购物车落盘；不需要 `useEffect`
- `subscribeKey(cart, 'total', ...)`：只盯一个 key，字段没变就不喊——减薄版订阅

## 踩过的坑

1. **解构再 mutate 会丢通知**——`const { user } = state; user.name = 'x'`：dev 模式抛 prop listener 错，prod 模式静默不通知。规则：永远在 `state.user.name = 'x'` 这种"从根开始"的链式上写。

2. **snapshot 是只读的**——在 `useSnapshot` 返回值上写赋值会被冻结报错。要改必须回到原 proxy。容易忘：组件里写 `snap.x = 1` 直觉上像在改 state，其实是在改快照。

3. **不能代理 Map/Set/Date/Promise/类实例**——`canProxy` 黑名单。响应式集合得用 valtio 提供的 `proxyMap` / `proxySet`（不是原生 Map 的完整替代，`for...of` 顺序等细节不一致）。

4. **父组件每次 render 重建 proxy 会让组件不响应**——`function App() { const state = proxy({}); ... }`：每次 render 是新 proxy，旧的 mutate 通知不到当前组件。proxy 必须放组件外（模块级）或 useRef 锁住。

## 适用 vs 不适用场景

**适用**：

- 业务对象嵌套深（购物车、表单、富文档树）——直接 mutate 比层层拷贝省事
- 想要"零心智 API"——小团队或不熟 reducer / selector 时上手快
- 组件外大量副作用（同步存储 / 发请求 / 拉外部 SDK）——subscribe 写在哪都行
- React 18+ 项目——`useSyncExternalStore` 已就位，并发安全

**不适用**：

- 衍生值占比高（大量 select / compute）→ [[jotai]] 原子化更合身
- 要能 `grep 'set('` 审计所有写入入口 → [[zustand]] 更合规
- 需要 time-travel / 严格审计的大型业务 → Redux Toolkit 的 action 日志更稳
- 跨框架（React + Vue + 纯 JS）→ [[nanostores]] 更轻更通用

## 历史小故事（可跳过）

- **2020 年前后**：React 状态库已经卷到第三波——Redux 太重、context 性能差、zustand 刚起。Daishi Kato（dai-shi）发起 valtio，挂在 pmndrs（Poimandres）组织下，与 zustand / jotai / react-three-fiber 同门。
- **2021-2022 年**：valtio v1.x 验证 Proxy 思路可行，但要靠自定义 useSubscription 处理 tearing/并发。
- **2022 年**：React 18 落地 `useSyncExternalStore`——把"小状态库怎么和并发渲染共存"标准化。valtio 改用它后，react.ts 缩到 174 行，订阅核心 30 行不到。
- **2024-2026 年**：迭代到 v2.x，主要在精细化 proxy-compare、SSR/Suspense 适配、把"自动追踪 effect"（旧 watch.ts）剥离到 valtio-reactive 子项目。
- 同期 zustand / jotai 也都迁到 useSyncExternalStore，三个库形成"显式 set / 原子化 / proxy mutate"的三脚架。

## 学到什么

1. **能用 JS 语言能力（Proxy / Reflect / WeakMap）就别造新 API**——valtio 没造一个新概念，全在用 JS 标配；"心智成本"和"造的新词数"成正比。
2. **响应式系统的精度，靠的是"读"和"写"两侧都被劫持**——valtio 写侧用自家 Proxy，读侧用 proxy-compare 第二层 Proxy。两层独立、配合精细。
3. **mutate-anywhere 的代价是"哪里改了"难追**——动态性赢了写法，输了可观测性，没法一次解决；项目大了"哪里改了 user.name"会变成痛点。
4. **React 18 的 useSyncExternalStore 是生态胜利**——它让 valtio / zustand / jotai 都能站在同一标准上做差异化创新，第三方状态库不再各自踩 tearing 坑。

## 延伸阅读

- 官方仓库 README：[pmndrs/valtio](https://github.com/pmndrs/valtio)（含示例索引和 codesandbox 链接）
- 作者 Daishi Kato 博文：[How Valtio Proxy State Works](https://blog.axlight.com/posts/how-valtio-proxy-state-works/)（拆解 vanilla 部分）
- 官方文档：[valtio.dev](https://valtio.dev/)（含 useSnapshot / proxyMap / devtools 用法）
- proxy-compare 库：[dai-shi/proxy-compare](https://github.com/dai-shi/proxy-compare)（valtio 的精细订阅依靠它）
- React 18 RFC：[useSyncExternalStore](https://github.com/reactwg/react-18/discussions/86)（理解 valtio 为什么从 v1 到 v2 急剧瘦身）
- [[zustand]] —— 同门 set-fn 派状态库，对比理解"显式 vs 隐式"权衡

## 关联

- [[zustand]] —— 同 pmndrs 出品；显式 `set(s => ...)` 仪式 vs valtio 直接 mutate，是同一团队的两种哲学
- [[jotai]] —— 同 pmndrs 出品；原子化（atom 粒度订阅）vs valtio 整体 proxy（路径粒度订阅），适合"衍生值多"场景
- [[mobx]] —— 思路最像 valtio（Proxy + 自动追踪），但带 OOP/装饰器范式，bundle ~16KB；valtio 是它的轻量化函数式表达
- [[nanostores]] —— 极简 set/get 状态库，跨框架；valtio 反过来是"重写法、轻心智"的极端
- [[immer]] —— 用 produce + draft 模拟"直接改"；valtio 用 Proxy 真的让你直接改，省了 producer 一层
- [[redux]] —— 显式 action + reducer 链路最长；valtio 几乎反着走，但都解的是同一类问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[jotai]] —— Jotai — 原子化 React 状态管理
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[zustand]] —— Zustand — 极简 React 状态管理

