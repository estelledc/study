---
title: "MobX — 让 state 像电子表格一样自动重算"
来源: 'https://mobx.js.org + https://github.com/mobxjs/mobx 仓库 + Weststrate "The fundamental principles behind MobX" 博客'
日期: 2026-05-30
子分类: projects
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

MobX 是一个 **JavaScript 反应式状态库**：你像写普通对象那样改 state，**UI 和派生值自动重算**。日常类比：像 **电子表格（Excel）**——你改 A1 单元格，所有"=A1+B1"的公式格自动跟着变，没人写过"订阅 A1 变化"，但它就是会更新。

它由荷兰人 Michel Weststrate 在 2015 年从 Mendix 内部项目里抽出来开源，是 React 生态里和 Redux 长期并立的两大 state 方案之一。核心特点：

- **隐式追踪**：你读了什么字段它自己记住，不用写依赖数组、不用写 selector
- **Proxy 拦截**：用 ES6 Proxy 包普通对象，所以你写 `state.count++` 就触发更新
- **最小重算**：只有真正读过 A1 的公式才会因为 A1 变化而重算，UI 同理

```js
import { makeAutoObservable, autorun } from 'mobx'
const counter = makeAutoObservable({ n: 0 })
autorun(() => console.log('n =', counter.n))
counter.n++   // 自动打印 "n = 1"
```

## 为什么重要

不理解 MobX，下面这些事就讲不清楚：

- 为什么 Vue 3 的 reactivity 看起来跟 MobX 几乎一样——它们是同一种思路的两个实现
- 为什么 Redux 那么严格而 MobX 那么"懒"，但两者都能跑大型应用
- 为什么 React 团队推 useSyncExternalStore 之后 MobX 反而活得更好
- "运行时依赖收集"这种隐式魔法，是当今前端反应式的核心引擎

## 核心要点

MobX 的工作流可以拆成 **三层节点 + 一根全局指针**：

1. **Atom（数据节点）**：每个 observable 字段挂一个 Atom。Atom 干两件事——读时调 `reportObserved` 把"现在谁在读我"登记下来；写时调 `reportChanged` 通知所有登记过的人"我变了"。

2. **Derivation（派生节点）**：`computed`（缓存的派生值）和 `reaction`（副作用，比如组件 render）都属于 derivation。它们订阅 Atom，被订阅的 Atom 变了，自己就标 dirty 等下次 pull。

3. **全局指针 `trackingDerivation`**：MobX 在跑 derivation 函数前，把"我"存进这个全局变量；函数里任何 Atom 被读，就读到这个全局指针，把"我"加进自己的观察者列表。函数跑完，指针清掉。

类比：每个公式格执行时举牌"我在算"，单元格被读到时记下举牌的人；单元格变了，照着名单挨个通知。

```ts
// 简化伪码
let trackingDerivation = null
class Atom {
  observers = new Set()
  reportObserved() { if (trackingDerivation) this.observers.add(trackingDerivation) }
  reportChanged() { for (const d of this.observers) d.markStale() }
}
function track(derivation, fn) {
  trackingDerivation = derivation
  try { return fn() } finally { trackingDerivation = null }
}
```

四个 API 串起来：`observable` 造 Atom，`computed` 造缓存型 derivation，`autorun / reaction` 造副作用 derivation，`action` 标"我这段是批量写，全部写完再统一通知 observer"。

## 实践案例

### 案例 1：最小的反应式 store

```ts
import { makeAutoObservable } from 'mobx'

class Counter {
  n = 0
  constructor() { makeAutoObservable(this) }
  inc() { this.n++ }
  get double() { return this.n * 2 }   // 自动变 computed
}
```

`makeAutoObservable` 看到普通字段就标 observable，看到 getter 就标 computed，看到方法就标 action。**不用写装饰器、不用写 useState**。

### 案例 2：React 里订阅 store

```tsx
import { observer } from 'mobx-react-lite'
const View = observer(() => <div>{counter.double}</div>)
```

`observer` 把组件 render 包成一个 reaction：render 期间读到的 observable 自动建立订阅，下次它们变了就强制重渲染。**只渲染真正读过的字段所属的组件**——这是 MobX 对 Redux 最大的卖点。

### 案例 3：批量写避免抖动

```ts
import { runInAction } from 'mobx'
runInAction(() => {
  user.name = 'Alice'
  user.age = 30
  user.email = 'a@b.com'
})
// observer 只 rerender 一次，不是三次
```

`action` / `runInAction` 是"批量边界"——里面写多少次 observable，外面看到的只是一次合并通知。这是性能命门。

## 踩过的坑

1. **async 里 await 后的访问不被追踪**：`autorun(async () => { await fetchUser(); state.foo })` 中 `state.foo` **不在** `trackingDerivation` 范围里，因为 await 后已经是新的微任务。解法：把后半段包进 `runInAction` 或用 `flow` generator。**新手第一个 bug 就在这**。

2. **忘记包 observer 不报错只是不更新**：组件没包 `observer`，store 改了它就是不刷新，控制台不报错，盯着代码看半天找不到原因。MobX 没法在编译期检查这个。

3. **computed 没人订阅时不缓存**：`store.derivedThing` 在不被 observe 的地方读，每次都重算。在循环里调 untracked computed 会变成 N 次完整执行，且没有 warning（v6 加了开关但默认关）。

4. **Proxy 不能"把对象传出去再观察新字段"**：`makeAutoObservable` 只把构造时存在的字段做 Atom，后加的字段没被追踪。要么先列全字段（哪怕值是 `undefined`），要么用 `observable.map`。

## 适用 vs 不适用场景

**适用**：

- 复杂编辑器 / 表单 / 看板这种 state 字段几十上百、依赖关系绕的中大型 app
- 想保留"普通命令式 JS"心智但又要响应式的 React 项目
- 高频局部更新（实时数据流、绘图工具）——最小重渲染省掉大量 reconcile

**不适用**：

- 极小 app —— Zustand/Jotai 3-4KB，写起来更直白
- 需要严格时间旅行 / 不可变快照 —— 选 Redux Toolkit 或 mobx-state-tree
- 团队没人懂"运行时依赖收集"心智 —— 隐式追踪 + 不报错的陷阱很难排
- 服务端渲染对 hydration 极敏感 —— Proxy 跨进程序列化要额外胶水

## 历史小故事（可跳过）

- **2014 年**：Weststrate 在 Mendix（荷兰低代码平台）内部用 `Object.defineProperty` 写了 mobservable，给可视化建模工具做反应式
- **2015 年**：开源到 GitHub，配 React 在 Reactiveconf 演讲爆火
- **2016 年**：改名 MobX 1.0，社区涌入大量从 Redux 迁过来的人，理由都是"模板代码太多"
- **2018-2020 年**：v4 / v5 引入 Proxy 模式（v4 保留 ES5 fallback 给 IE11，v5 砍掉）
- **2020 年**：v6 砍掉装饰器强依赖，主推 `makeAutoObservable`——TypeScript 装饰器规范一直没定稿，逼它换路线
- **当前**：MobX 仍是 React state 三大方案之一（另外两个 Redux Toolkit / Zustand），但轻量场景被 Zustand 抢走，重型场景守得住

## 学到什么

1. **依赖追踪用全局指针 + try/finally**——这是反应式系统的通用骨架，Vue 3 reactivity / Solid signals / Preact signals 都是同一招。学会了 MobX 等于学会了一类系统。
2. **状态机 + dirty bit 优化重算**——节点维护四态（NOT_TRACKING / UP_TO_DATE / POSSIBLY_STALE / STALE），上游变只传播标记不立刻重算，下游被读时按需 pull。push-pull 混合避免"无人订阅也重算"的浪费。
3. **批量边界是性能命门**——任何"高频写 + 低频副作用"系统都该有这层。React 的 batched updates、Vue 的 nextTick、MobX 的 action 都是同一思路。
4. **隐式 vs 显式是工程哲学之争**——Redux 显式赢在可审计、MobX 隐式赢在表达力。没有银弹，按团队和项目复杂度选。

## 延伸阅读

- 官方文档：[mobx.js.org](https://mobx.js.org/)（含 React Integration / 调试指南 / 常见误区）
- 主仓库：[github.com/mobxjs/mobx](https://github.com/mobxjs/mobx)（核心在 `packages/mobx/src/core/`，`atom.ts` + `derivation.ts` 加起来约 800 行）
- 设计哲学：[Weststrate — The fundamental principles behind MobX](https://hackernoon.com/the-fundamental-principles-behind-mobx-7a725f71f3e8)（作者自述为什么这么设计）
- [[immer]] —— 同样 Proxy-based，但走"不可变快照"路线，常和 Redux Toolkit 搭配
- [[valtio]] —— "MobX lite"，只做 Proxy mutate + snapshot，去掉 derivation 引擎
- [[solid]] —— 编译期把 reactive 拍平到细粒度 signal，比 MobX 更细但放弃 React 兼容

## 关联

- [[immer]] —— Proxy + 不可变快照，和 MobX 是 Proxy 反应式的两条路线
- [[valtio]] —— 同作者后续作品，把 MobX 思路砍成最小核
- [[solid]] —— 用编译期魔法把"运行时收集"拍平到代码生成
- [[react-hook-form]] —— 表单库，常和 MobX 在同一项目里管不同状态
- [[plane]] —— 项目管理 SaaS，前端用 MobX 管复杂 board state
- [[tanstack-form]] —— 类型驱动的表单库，对比 MobX 显式 vs 隐式哲学
