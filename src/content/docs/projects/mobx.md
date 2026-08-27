---
title: MobX — 让 state 像电子表格一样自动重算
来源: https://github.com/mobxjs/mobx
日期: 2026-08-27
分类: 状态管理
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mobxjs/mobx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5dbb04a15f7eb0ef6b844904c43955357a9bbdfc
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.3
---

## 是什么

MobX 是一份 **Proxy 反应式运行时**：你改普通字段，读过这些字段的派生值和 UI 被标脏，下次被拉到时才重算。日常类比：电子表格——改 A1，引用 A1 的格子变黄，你点开那一格才重算，不是整本立刻重算。

固定 7.0.3 只走 Proxy。开发态启动时检查全局有没有 `Symbol` / `Map` / `Set` / `Proxy`。React 绑定是另一个包：`mobx-react-lite@5.0.3`，peer 是 `mobx ^7` 和 `react ^18 || ^19`。

```ts
import { makeAutoObservable } from 'mobx'

class Counter {
  n = 0
  constructor() { makeAutoObservable(this) }
  inc() { this.n++ }
  get double() { return this.n * 2 }
}
```

`makeAutoObservable` 把数据字段标成 observable，getter 标成 computed，原型方法标成 autoAction。

## 为什么重要

不读固定 7.0.3 源码，旧教程会把这些合同讲错：

- 为什么「写 `state.count++` 就更新」其实靠全局指针 `trackingDerivation`，不是编译器插桩
- 为什么默认改**已被观察**的字段不包 action，开发态会警告
- 为什么 `observer(memo(Comp))` 会直接抛错——`observer` 自己已经 `memo`
- 为什么 React 16 / 非 Proxy 环境不再是当前绑定面

## 核心要点

固定版本的主链可以拆成五步：

1. **Atom**：每个可观察字段挂一个 Atom。读时 `reportObserved()`，写时 `reportChanged()`（包在 batch 里通知观察者）。

2. **全局指针**：`trackDerivedFunction` 把当前 derivation 写进 `globalState.trackingDerivation`，函数结束再绑依赖。Atom 被读到，就把「正在算的人」记进 `observers_`。

3. **四态 dirty**：`NOT_TRACKING` / `UP_TO_DATE` / `POSSIBLY_STALE` / `STALE`。深层 computed 先标 `POSSIBLY_STALE`，真正被读时再 pull，避免无人看也重算。

4. **action 是批量边界**：`executeAction` 开 batch、暂时 `untracked`，并允许改 state。默认 `enforceActions = true`、`allowStateChanges = false`；DEV 下改已有 observer 的值不走 action 会警告。

5. **React `observer`**：内部 `useObserver` 用 `Reaction.track` 包 render，再用 `useSyncExternalStore` 订一份 `stateVersion`。泄漏的 Reaction 交给 `FinalizationRegistry`。`useObserver` 不再对外导出。

## 实践示例

### 案例 1：makeAutoObservable 只认构造时的键

```ts
import { makeAutoObservable } from 'mobx'

class Bag {
  items = []
  constructor() {
    makeAutoObservable(this)
    this.hidden = 1 // 后挂的字段没有 Atom
  }
}
```

源码用 `ownKeys(target)` 加原型键做标注。后加的 `hidden` 不会被追踪。类如果已有超类，开发态直接 `die`。

### 案例 2：observer 订的是 render 读过的字段

```tsx
import { observer } from 'mobx-react-lite'

const View = observer(function View({ counter }: { counter: Counter }) {
  return <div>{counter.double}</div>
})
```

`observer` 会 `memo` 一层。再写 `observer(memo(View))` 抛错。`forwardRef` 组件可以再包 `observer`：它会拆开 `render`，先 `forwardRef` 再 `memo`。

### 案例 3：组件内本地 store

```tsx
import { observer, useLocalObservable } from 'mobx-react-lite'

const Editor = observer(function Editor() {
  const draft = useLocalObservable(() => ({ text: '', set(v: string) { this.text = v } }))
  return <input value={draft.text} onChange={(e) => draft.set(e.target.value)} />
})
```

`useLocalObservable` 是 `useState(() => observable(init(), annotations, { autoBind: true }))`，只建一次，不是每次 render 新建。

## 踩过的坑

1. **async 里 `await` 之后丢掉追踪**：`autorun` / render 跨过 await 后 `trackingDerivation` 已经空了。后半段读写要包 `runInAction` 或改用 `flow`。
2. **忘了 `observer` 不报错、只是不更新**：没有 reaction 订 Atom，改字段就是普通赋值。
3. **把 `useObserver` 当公开 API**：5.0.3 的推荐面是 `observer` / `<Observer>` / `useLocalObservable` / `enableStaticRendering`。
4. **以为还能关 Proxy 或用 legacy decorator**：7.0 删掉 `useProxies`、`{ proxy: false }` 和旧装饰器；`observable.ref` 这类命名空间改成 `observableRef`。

## 适用 vs 不适用场景

**适用**：

- 字段多、派生绕、想保留命令式写法的中大型客户端状态
- 已经能接受「运行时收集依赖」的团队
- React 18/19 函数组件，用 `mobx-react-lite` 即可

**不适用**：

- 需要可审计的唯一写入入口 → 显式 `set` / reducer 更合适
- 还在 React 16/17，或环境没有 Proxy
- 需要时间旅行快照当一等能力 → 本页未覆盖 mobx-state-tree
- 把 changelog 里的 gzip 数字写成当前实测

## 固定版本边界

- 本文绑定 `mobxjs/mobx@5dbb04a15f7eb0ef6b844904c43955357a9bbdfc`，npm / tag 均为 `mobx@7.0.3`，同提交发布 `mobx-react-lite@5.0.3`。
- 无生产 `dependencies`。React 绑定的 peer 是 `mobx ^7` 与 `react ^18 || ^19`。
- 默认 `enforceActions` 为布尔 `true`（对已观察值偏严），不是 `"never"`。
- 本文未安装依赖、运行 Jest 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **反应式收集是一根全局指针**——读的时候登记，写的时候通知，函数式框架里也是这套骨架。
2. **脏标记可以先传播、后计算**——`POSSIBLY_STALE` 是「先问上游 computed 是否真变了」。
3. **React 适配只订一个 version symbol**——真正的依赖图在 `Reaction.track(render)` 里。
4. **公开 API 比内部函数窄**——`useObserver` 还在源码里，但不属于 5.x 绑定面。

## 应用型自测

1. `makeAutoObservable` 之后给实例补一个新字段，autorun 读它会不会自动订阅？
2. 组件已经是 `memo(View)`，再包 `observer` 会怎样？
3. 开发态、字段已被 observer 订阅时，在 action 外写 `counter.n++` 会怎样？

检查点：

1. 不会。标注只覆盖构造时 `ownKeys` 里的键。
2. 抛错。`observer` 拒绝再包一层 `memo` / `observer`。
3. DEV 警告：已观察值必须走 action；生产构建默认不抛。

## 延伸阅读

- 官方文档：[mobx.js.org](https://mobx.js.org/)
- 固定源码：[mobxjs/mobx](https://github.com/mobxjs/mobx) —— 本文绑定提交 `5dbb04a15f7eb0ef6b844904c43955357a9bbdfc`
- [[nanostores]] —— 显式 atom 列表，对照隐式追踪
- [[immer]] —— 同样用 Proxy，但产出不可变快照

## 关联

- [[nanostores]] —— 框架无关的显式 store，对照隐式收集
- [[immer]] —— Proxy 的另一条路：草稿 → 不可变
- [[zustand]] —— 显式 `set`，没有 derivation 引擎
- [[jotai]] —— 原子 + `get()` 记依赖，和 MobX 同属运行时图
- [[react]] —— `useSyncExternalStore` 是 observer 的桥

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[nanostores]] —— nanostores — 框架无关的原子 store
- [[plane]] —— Plane — 开源版 Linear/Jira，把任务、冲刺和协同文档放进自己的机器
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[solid]] —— SolidJS — 细粒度响应式 UI 框架
- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
