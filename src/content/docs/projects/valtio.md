---
title: valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
来源: 'https://github.com/pmndrs/valtio'
日期: 2026-05-30
分类: projects / 前端状态
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pmndrs/valtio
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 15c64d4d7a7a9bd55d750fa6a317b440978a2b25
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.3.2
---

## 是什么

valtio 是一个面向 React 和纯 JS 的状态库。一句话定义：**用 JS Proxy 包住普通对象，直接 `state.count++` 就会通知订阅者**；React 侧再拿一份只读快照做渲染。

日常类比：像在房间里装了红外感应灯。你不用按开关（不用写 `set`），只要走过去（直接改属性），灯就自己亮；每盏灯只盯自己那块地（组件只在读过的路径变了才重渲染）。

```ts
import { proxy, useSnapshot } from 'valtio'

const state = proxy({ count: 0 })
function Counter() {
  const snap = useSnapshot(state)
  return <button onClick={() => state.count++}>{snap.count}</button>
}
```

固定提交里 `src/vanilla.ts` 459 行、`src/react.ts` 174 行；运行时依赖只有 `proxy-compare`。React 是可选 peer，纯 JS 可以从 `valtio/vanilla` 只取 `proxy` / `subscribe` / `snapshot`。

## 为什么重要

不理解 valtio 的读写分层，下面这些问题会一直绕不清：

- 为什么组件里读 `snap.count`、写却必须回到 `state.count++`
- 为什么嵌套对象可以直接 `item.qty++`，而原生 `Map` / `Set` 要换 `proxyMap` / `proxySet`
- 为什么 React 18 的 `useSyncExternalStore` 能让第三方状态库共用同一套并发订阅合同
- 为什么 v2 不再在库内自动解开 Promise，而要把 `use()` 留给调用方

## 核心要点

valtio v2 的执行可以拆成四层：

1. **写侧 Proxy.set / deleteProperty**：`proxy()` 给对象装陷阱。`set` 先用 `Object.is`（可替换）比较新旧值，相同就短路；不同则记下 `set`/`delete` 操作并通知监听者。v2 的 `proxy(obj)` 会就地改传入对象，不再深拷贝一份再代理。

2. **版本号 + 快照缓存**：每次有效 mutate 让内部 `versionHolder` 递增。`snapshot()` 按版本从 `snapCache` 取只读快照；同版本返回同一缓存。属性用 `defineProperty` 做成不可写，但固定源码已去掉 `Object.preventExtensions`。

3. **读侧 proxy-compare**：`useSnapshot` 用 `useSyncExternalStore` 订阅 vanilla `subscribe`，再把快照包进第二层 Proxy，记录这次渲染读过哪些路径。下次只有这些路径变了才换引用。

4. **可代理集合是显式边界**：默认 `canProxy` 排除带 `Symbol.iterator` 的非数组对象，以及 `Date` / `Promise` / `WeakMap` / `Error` / `RegExp` 等。`Map`/`Set` 要用 `proxyMap` / `proxySet`；`watch` 仍在仓内，但源码已标 deprecated，指向 `valtio-reactive`。

## 实践示例

### 案例 1：最简计数器（读写分开）

```tsx
import { proxy, useSnapshot } from 'valtio'

const state = proxy({ count: 0 })

function Counter() {
  const snap = useSnapshot(state)
  return <button onClick={() => state.count++}>{snap.count}</button>
}
```

**逐部分解释**：

- `proxy({ count: 0 })` 必须放在模块级或稳定引用里，不能每次 render 新建
- 渲染读 `snap.count`；事件里写 `state.count++`
- `useSnapshot` 默认把 `subscribe` 回调排到 microtask；受控 input 若丢光标，可传 `{ sync: true }`

### 案例 2：嵌套对象（购物车）

```ts
const cart = proxy({
  items: [{ id: 1, name: 'A', qty: 1 }],
  total: 0,
})

function inc(id: number) {
  const it = cart.items.find((i) => i.id === id)!
  it.qty++
  cart.total = cart.items.reduce((s, i) => s + i.qty, 0)
}
```

**逐部分解释**：

1. 嵌套普通对象会被再次 `proxy()`，所以 `it.qty++` 能通知到根
2. 不必手写 `{...cart, items: [...]}` 那种浅拷贝
3. 只读 `snap.total` 的组件会因 `total` 被改而重渲染；只读 `snap.items[0].name` 的组件不会只因 `qty` 变而重渲染

### 案例 3：组件外订阅

```ts
import { subscribe } from 'valtio'
import { subscribeKey } from 'valtio/utils'

subscribe(cart, () => {
  localStorage.setItem('cart', JSON.stringify(cart))
})
subscribeKey(cart, 'total', (total) => {
  console.log('新总价', total)
})
```

**逐部分解释**：

- `subscribe` 默认把多次 mutate 收进一次 microtask，再把 ops 交给回调
- `subscribeKey` 仍订阅整个 proxy，但只在指定 key 的 `Object.is` 结果变化时喊
- 非 React 项目应改从 `valtio/vanilla` 导入，避免主入口把 `react` peer 拉进打包器

## 踩过的坑

1. **在快照上写赋值**：`useSnapshot` 返回值是只读快照再包一层比较 Proxy。普通字段不可写；`proxyMap` / `proxySet` 的 mutate 方法会直接抛 `Cannot perform mutations on a snapshot`。
2. **把带迭代器的对象当普通 state**：原生 `Map`/`Set` 过不了默认 `canProxy`，不会自动变响应式。要用 `proxyMap` / `proxySet`，并注意它们不是完整原生集合替代。
3. **每次 render 新建 proxy**：`function App() { const state = proxy({}) }` 会让旧订阅对不上新对象。proxy 要放模块级或用稳定引用锁住。
4. **v2 的 Promise 与不纯 proxy**：库不再内部解开 Promise，React 19 应用 `use()`；传入 `proxy(obj)` 的对象会被就地改写，复用原对象时要先 `deepClone`。

## 适用 vs 不适用场景

**适用**：

- 业务对象嵌套深，希望直接 mutate 而不是层层拷贝
- 需要组件外订阅（存储、请求、外部 SDK）
- React 18+ 项目，可以接受 `useSyncExternalStore` 合同
- 小团队想先用最少 API 把对象状态跑起来

**不适用**：

- 衍生值占比高、需要大量独立 atom / selector → 原子化模型更合身
- 必须 `grep` 到每一个写入入口做审计 → 显式 `set` 或 action 日志更稳
- 跨框架且要避开 React 入口 → 用 `valtio/vanilla`，或改选框架无关库
- 需要库内自动处理 Promise / Suspense → 那是 v1 合同，v2 已拿掉

## 学到什么

1. **能用语言能力就别造新词**：valtio 的核心是 `Proxy`、`WeakMap`、版本号和 `useSyncExternalStore`，不是新状态代数。
2. **响应式精度来自读写两侧都被劫持**：写侧记 ops，读侧记路径；两层 Proxy 职责不同。
3. **mutate-anywhere 换来的是可观测性**：写法短，但「谁改了 `user.name`」更难追。
4. **版本边界比口号重要**：v2 的不纯 `proxy`、显式 Promise 和 deprecated `watch` 都写在固定源码里，不能用 v1 印象替换。

## 应用型自测

1. 组件写了 `const snap = useSnapshot(state)`，然后执行 `snap.count++`。状态会更新吗？
2. `const state = proxy({ cart: new Map() }); state.cart.set('a', 1)`。默认会通知订阅者吗？
3. `useSnapshot(state)` 没有带 `{ sync: true }`。一次点击里连续改两个字段，订阅回调默认什么时候跑？

检查点：

1. 不会按预期更新。快照字段不可写；必须改回原 proxy。
2. 不会按普通对象那样自动代理。`Map` 带迭代器，默认 `canProxy` 为假，应改用 `proxyMap`。
3. 默认进 microtask 批量通知，不是每个赋值同步回调一次。

## 固定版本边界

- 本文绑定 GitHub release `v2.3.2`，提交 `pmndrs/valtio@15c64d4d7a7a9bd55d750fa6a317b440978a2b25`。
- `package.json` 版本为 `2.3.2`；`engines.node` 为 `>=12.20.0`；React peer 为 `>=18`，且为 optional。
- TypeScript 类型入口要求 `>=4.5`。
- 本文只做源码/测试/文档静态审查，没有安装依赖、运行上游测试、bundle 或性能 benchmark，状态保持 `UNVERIFIED`。

## 延伸阅读

- 官方仓库：[pmndrs/valtio](https://github.com/pmndrs/valtio)
- 固定源码：本文绑定提交 `15c64d4d7a7a9bd55d750fa6a317b440978a2b25`
- 官方文档：[valtio.dev](https://valtio.dev/)
- 仓内机制说明：[docs/how-tos/how-valtio-works.mdx](https://github.com/pmndrs/valtio/blob/15c64d4d7a7a9bd55d750fa6a317b440978a2b25/docs/how-tos/how-valtio-works.mdx)
- proxy-compare：[dai-shi/proxy-compare](https://github.com/dai-shi/proxy-compare)
- [[immer]] —— 用 draft 模拟「看起来能改」；valtio 是真的改 proxy
- [[mobx]] —— 同样走 Proxy，但还带 derivation 引擎

## 关联

- [[zustand]] —— 同 pmndrs 出品；显式 `set` 与 valtio 直接 mutate 是两种哲学
- [[jotai]] —— 同门原子化模型，适合衍生值多的界面
- [[mobx]] —— 思路最像：Proxy + 自动追踪
- [[nanostores]] —— 更小、框架无关的 set/get
- [[immer]] —— produce + draft 产出不可变下一份
- [[redux]] —— 显式 action + reducer；valtio 几乎反向走同一类问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
