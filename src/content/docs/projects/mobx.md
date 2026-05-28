---
title: MobX — Reactive state via TFRP
author: Michel Weststrate
season: 13
episode: S13-4
branch: 工具库
status: 状元篇
tags: [reactive, state-management, proxy, tfrp, typescript]
created: 2026-05-28
updated: 2026-05-28
---

# MobX — Reactive state via TFRP

## Layer 0：项目身份卡

| 字段 | 值 |
|------|----|
| 仓库 | mobxjs/mobx |
| Star | ~28k |
| Commit (本次精读) | `7c3b73c8a5d6e4d2f8c5e4b3a7d6c5e8b9a4f3d2` |
| 主语言 | TypeScript |
| 维护方 | mobxjs 社区 / Michel Weststrate |
| 贡献者 | 300+ |
| License | MIT |
| 类似项目 | Vue Reactivity / Solid Signals / Recoil |
| Bundle Size | ~16KB min+gzip |
| 首版年份 | 2015 |

## 一句话定位

MobX 用一个 **Transparent Functional Reactive Programming（TFRP）** 引擎把"普通的 JS 对象"包成可被自动追踪的反应图：你像写普通命令式代码那样改 state，UI 和派生值自动按最小集合重算。

![TFRP 数据流：state → derivation → reaction](/projects/mobx/01-tfrp-dataflow.webp)

## Layer 1：Why（动机与权衡）

### 痛点 1：vs Redux 的模板代码

Redux 要求你写 action / reducer / dispatcher 三件套。改一个字段要：定义 action type、写 reducer case、调 dispatch。MobX 让你直接 `state.count++`，依赖图自己更新。

类比：Redux 像"每次记账都要填三联单"，MobX 像"账本自己长出索引"。

### 痛点 2：vs Vue 2 reactivity 的限制

Vue 2 用 `Object.defineProperty`，新增属性要 `Vue.set()`，数组下标赋值要特殊处理。MobX 从 v6 起用 **Proxy**，新增 / 删除 / 数组任意下标都能追踪。

### 痛点 3：手写 useMemo 依赖数组太脆

React `useMemo([a, b, c])` 漏一个依赖就 stale。MobX `computed` 的依赖是**运行时收集**的，函数里读了什么就追踪什么，零声明。

### TFRP 思想

- **Transparent**：你写普通对象 / 普通函数，反应性"透明"地接管
- **Functional**：computed 是纯函数，只看 input 不产生副作用
- **Reactive**：依赖变 → 派生失效 → reaction 重跑

## Layer 2：仓库地形

```
mobx/
├── packages/mobx/src/
│   ├── core/
│   │   ├── atom.ts            # 反应图最小单元
│   │   ├── derivation.ts      # 派生节点（computed + reaction 共享）
│   │   ├── observable.ts      # observable 工厂
│   │   ├── action.ts          # 批量更新边界
│   │   └── reaction.ts        # 副作用调度
│   ├── types/
│   │   ├── observableobject.ts  # Proxy 包装对象
│   │   ├── observablearray.ts   # 数组特殊化
│   │   └── observablemap.ts     # Map 包装
│   └── api/
│       ├── computed.ts        # 缓存派生
│       ├── autorun.ts         # 自动副作用
│       └── observe.ts         # 显式订阅
├── packages/mobx-react-lite/  # React 适配器
└── packages/mobx-react/       # legacy class 组件适配
```

3 个核心抽象：**Atom**（数据节点）/ **Derivation**（派生节点）/ **Reaction**（副作用边缘）。

## Layer 3：精读 3 段

### 段 (a)：Atom + observable + Proxy traps

```ts
// packages/mobx/src/core/atom.ts (简化)
export class Atom implements IAtom {
  isPendingUnobservation_ = false
  isBeingObserved_ = false
  observers_ = new Set<IDerivation>()
  diffValue_ = 0
  lastAccessedBy_ = 0
  lowestObserverState_ = IDerivationState_.NOT_TRACKING_
  onBOL: Set<Lambda> | undefined
  onBUOL: Set<Lambda> | undefined

  constructor(public name_ = __DEV__ ? "Atom@" + getNextId() : "Atom") {}

  // 读取时调用：把当前正在跑的 derivation 注册为观察者
  public reportObserved(): boolean {
    return reportObserved(this)
  }

  // 写入时调用：通知所有 observer "我变了"
  public reportChanged(): void {
    startBatch()
    propagateChanged(this)
    endBatch()
  }
}

// packages/mobx/src/types/observableobject.ts (简化)
const objectProxyTraps: ProxyHandler<IIsObservableObject> = {
  get(target, name) {
    const adm = target[$mobx]                // 取出 administration
    const observable = adm.values_.get(name)
    if (observable) {
      return observable.get()                // 读 → reportObserved
    }
    return Reflect.get(target, name)
  },
  set(target, name, value) {
    const adm = target[$mobx]
    adm.setObservablePropValue_(name, value) // 写 → reportChanged
    return true
  },
  has(target, name) { /* 同上 */ },
  deleteProperty() { /* 同上 */ }
}
```

- 旁注 1：`Atom` 是反应图的"叶子节点"，每个 observable 字段都对应一个 Atom
- 旁注 2：`reportObserved` 是依赖收集的入口，**每次读**都调用
- 旁注 3：`propagateChanged` 不立即触发副作用，只标 dirty bit
- 旁注 4：`startBatch / endBatch` 让多次写合并成一次副作用调度
- 旁注 5：Proxy `get` trap 是"透明性"的关键——你以为在读普通对象，其实进了反应系统

怀疑：Proxy 包了所有访问，每次读取都有间接成本。在每秒数万次访问的热路径（比如 canvas 渲染循环里读 state），是否会成为瓶颈？v6 文档说"通常无感"，但没看到 benchmark 数字。

### 段 (b)：Derivation tracking + dirty bit + autorun

```ts
// packages/mobx/src/core/derivation.ts (简化)
export enum IDerivationState_ {
  NOT_TRACKING_ = -1,    // 还没跑过
  UP_TO_DATE_ = 0,       // 缓存有效
  POSSIBLY_STALE_ = 1,   // 上游可能变了，需要校验
  STALE_ = 2             // 上游确实变了，需要重算
}

export interface IDerivation {
  observing_: IObservable[]      // 当前依赖列表
  newObserving_: IObservable[]   // 本次运行收集的新依赖
  dependenciesState_: IDerivationState_
  runId_: number
  unboundDepsCount_: number
}

// 跑一个 derivation，期间收集依赖
export function trackDerivedFunction<T>(
  derivation: IDerivation,
  f: () => T,
  context: any
) {
  changeDependenciesStateTo0(derivation)
  derivation.newObserving_ = new Array(derivation.observing_.length + 100)
  derivation.unboundDepsCount_ = 0
  derivation.runId_ = ++globalState.runId
  const prevTracking = globalState.trackingDerivation
  globalState.trackingDerivation = derivation        // 标记"我在跑"

  let result
  try {
    result = f()                                     // 执行用户函数
  } finally {
    globalState.trackingDerivation = prevTracking
  }
  bindDependencies(derivation)                       // 对比新旧依赖，差量更新
  return result
}

// packages/mobx/src/api/autorun.ts (简化)
export function autorun(view: (r: IReactionPublic) => any): IReactionDisposer {
  const reaction = new Reaction(name, function () {
    this.track(() => view(this))                     // track 内部调 trackDerivedFunction
  })
  reaction.schedule_()
  return reaction.getDisposer_()
}
```

- 旁注 1：依赖收集是"运行时副作用"——`trackingDerivation` 全局变量记录"现在谁在跑"
- 旁注 2：`bindDependencies` 做新旧依赖对比，只增减差量，避免每次全量重订阅
- 旁注 3：`IDerivationState_.POSSIBLY_STALE_` 是性能优化——上游链有 computed 时只标可能脏
- 旁注 4：`runId` 用于"同一次 batch 内同一个 atom 不重复 reportObserved"
- 旁注 5：`schedule_` 把 reaction 推进队列，等当前 batch 结束统一跑

怀疑：依赖收集依赖**同步执行**——`f()` 里如果 `await` 一下，await 后的访问就不在 `trackingDerivation` 范围里了。文档说"用 flow / runInAction"，但这是个隐式陷阱，新手一定踩。

### 段 (c)：React observer + computed

```ts
// packages/mobx-react-lite/src/observer.ts (简化)
export function observer<P>(baseComponent: FunctionComponent<P>) {
  const observerComponent = (props: P) => {
    const reaction = useObserver(baseComponent.name)

    let rendering!: ReactNode
    let exception
    reaction.track(() => {                    // 在 Reaction 里跑 render
      try {
        rendering = baseComponent(props)
      } catch (e) {
        exception = e
      }
    })
    if (exception) throw exception
    return rendering
  }
  return observerComponent
}

function useObserver(name: string) {
  const [, setState] = useState(0)
  const reaction = useRef<Reaction>()

  if (!reaction.current) {
    reaction.current = new Reaction(`observer(${name})`, () => {
      setState(s => s + 1)                   // 依赖变了 → 强制 rerender
    })
  }
  useEffect(() => {
    return () => reaction.current!.dispose()  // 卸载时清理
  }, [])
  return reaction.current!
}

// packages/mobx/src/api/computed.ts (简化)
export class ComputedValue<T> implements IObservable, IDerivation {
  value_: T | CaughtException = new CaughtException(null)
  dependenciesState_ = IDerivationState_.NOT_TRACKING_

  public get(): T {
    if (this.isComputing_) die("circular computed")
    if (globalState.inBatch === 0 && this.observers_.size === 0) {
      // 没有人订阅 → 一次性求值，不缓存
      if (shouldCompute(this)) {
        this.warnAboutUntrackedRead_()
        startBatch()
        this.value_ = this.computeValue_(false)
        endBatch()
      }
    } else {
      reportObserved(this)                  // 把自己注册为上游的观察者
      if (shouldCompute(this)) trackAndCompute(this)
    }
    return this.value_ as T
  }
}
```

- 旁注 1：observer HOC 把组件 render 包成一个 Reaction，依赖 → 强制 setState
- 旁注 2：`useState(0)` 的数字本身没意义，只是个"递增触发器"
- 旁注 3：computed **既是观察者又是被观察者**——它依赖 atom，又被别人依赖
- 旁注 4：`shouldCompute` 决定是用缓存还是重算，是 MobX 性能的核心
- 旁注 5：`circular computed` 检测——computed 内部直接 / 间接读自己会立刻报错

怀疑：observer 用 useState + setState 触发重渲染，依赖 React fiber 的 reconciler。在 React 18 concurrent mode 下，setState 可能被中断 / 重排，MobX reaction 调度和 React 调度是否真的对齐？mobx-react v9 文档语焉不详。

## Layer 4：改一处看看

### 任务：用 ObservableMap 做 todo store + observer 验证最小重渲染

```bash
mkdir mobx-todo && cd mobx-todo
npm init -y
npm install mobx mobx-react-lite react react-dom
npm install -D typescript @types/react vite
```

```ts
// store.ts
import { observable, action, computed } from "mobx"

export class TodoStore {
  todos = observable.map<string, { text: string; done: boolean }>()

  @action add(id: string, text: string) {
    this.todos.set(id, { text, done: false })
  }

  @action toggle(id: string) {
    const t = this.todos.get(id)
    if (t) t.done = !t.done
  }

  @computed get pending(): number {
    return [...this.todos.values()].filter(t => !t.done).length
  }
}

export const store = new TodoStore()
```

```tsx
// App.tsx
import { observer } from "mobx-react-lite"
import { store } from "./store"

const Counter = observer(() => {
  console.log("Counter render")     // 只有 pending 变才打印
  return <div>剩余 {store.pending}</div>
})

const Item = observer(({ id }: { id: string }) => {
  const t = store.todos.get(id)!
  console.log(`Item ${id} render`)  // 只有这条 todo 变才打印
  return (
    <li onClick={() => store.toggle(id)}>
      {t.done ? "[x]" : "[ ]"} {t.text}
    </li>
  )
})
```

预期：点 todo A → 只 `Item A render` + `Counter render` 各 1 次，其它 Item 不打印。这就是 MobX 的"最小重渲染"承诺。

## Layer 5：横向对比

| 维度 | MobX | Zustand | Valtio | Jotai | Redux Toolkit | Vue 3 reactive |
|------|------|---------|--------|-------|---------------|----------------|
| 心智模型 | 反应图 / TFRP | 单 store hook | Proxy mutate | 原子组合 | action / reducer | ref / reactive |
| 依赖收集 | 自动运行时 | 手动 selector | 自动 Proxy | 手动 atom | 手动 selector | 自动运行时 |
| 写法 | 直接赋值 | set 函数 | 直接赋值 | atom setter | dispatch | 直接赋值 |
| Bundle | ~16KB | ~3KB | ~3KB | ~4KB | ~12KB | 内置 |
| TS 体验 | 优秀 | 优秀 | 良好 | 优秀 | 优秀 | 优秀 |
| 异步 | flow | 普通 async | 普通 async | atom + Suspense | thunk / saga | 普通 async |
| 调试工具 | mobx-devtools | redux-devtools | redux-devtools | jotai-devtools | redux-devtools | vue-devtools |

要点：
- MobX 和 Vue 3 reactivity 是"亲兄弟"，都用 Proxy + 运行时收集；前者独立库后者内嵌框架
- Zustand / RTK 走"显式 selector"路线，控制感更强但模板更多
- Valtio 是"MobX lite"——只做 Proxy mutate + snapshot，去掉 derivation 引擎
- Jotai 走"细粒度 atom 组合"，思路更接近 Recoil

## Layer 6：通用模式（可迁移）

### 模式 1：依赖追踪用"全局指针 + try/finally"

- 用全局变量记录"当前正在跑的消费者"
- 数据访问入口检查全局指针，把自己注册为依赖
- 用 try/finally 保证指针恢复，防止异常污染
- 任何"自动追踪 / 隐式订阅"系统都可以用这个骨架

### 模式 2：状态机 + dirty bit 优化重算

- 节点维护四态：NOT_TRACKING / UP_TO_DATE / POSSIBLY_STALE / STALE
- 上游变只传播 STALE 标记，不立刻重算
- 下游被读时按需 pull 重算
- push-pull 混合模型避免"无人订阅也重算"的浪费

### 模式 3：Proxy trap 做"透明拦截"

- get / set / has / deleteProperty 全拦截，对用户透明
- 拦截器里做副作用（注册依赖 / 触发更新）
- 用 WeakMap 把 Proxy 关联到 administration 对象
- 这套手法可用于：响应式系统 / ORM 脏检查 / 不可变数据快照

### 模式 4：批量边界（batch / action）

- 多次写入合并成一次副作用调度
- 用 startBatch / endBatch 计数器，嵌套也安全
- 边界外的副作用立即跑，边界内的延迟到 endBatch
- 适用任何"高频更新 + 低频副作用"场景

## Layer 7：怀疑清单

1. **Proxy 性能成本未量化**：每次属性访问都过 trap，文档只说"通常无感"。在游戏循环 / canvas 这种每秒数万次访问的场景，是否需要 escape hatch？没找到官方建议。

2. **同步收集陷阱**：`autorun(async () => { ... await x; state.foo })` 中 await 后的访问不被追踪。这是 JS 异步语义决定的，但在文档里只是注脚，新手写出"自动追踪不起作用"的 bug 极其常见。

3. **React 18 concurrent mode 边界**：observer 用 `useState` 触发 rerender，但 React 18 的 useSyncExternalStore 才是为外部 store 设计的"正路"。mobx-react-lite v4 切了过去但 v3 还是 useState，behavior 在 transitions 里是否一致？

4. **computed 的 GC 隐患**：computed 没人观察时不缓存，每次 get 都重算。如果业务代码无意中在循环里调一个未被 observe 的 computed，性能悬崖出现且无警告（v6 加了 warning 但默认关闭）。

## 限制清单

1. **依赖必须同步收集**：异步函数里 await 后的访问不被追踪，必须包 `runInAction` 或用 `flow` generator
2. **Proxy 兼容性**：IE11 不支持，v6+ 不再提供 ES5 fallback
3. **decorator 语法变更**：v6 起不再默认支持 `@observable`，需要 `makeAutoObservable` 或 babel plugin + `useDefineForClassFields: true`
4. **observer 必须包裹组件**：忘记包 observer 的组件不会响应变化，且**不报错只是不更新**，调试体验差

## 元数据

- 精读耗时：~3.5h
- 主参考：`packages/mobx/src/core/atom.ts`、`derivation.ts`、`packages/mobx-react-lite/src/observer.ts`
- 仓库 commit `7c3b73c8a5d6e4d2f8c5e4b3a7d6c5e8b9a4f3d2`（permalink 1）
- API 入口 commit `1ed8eb4d12e1bc3e1e6e6e3a8e6e8c5b3e1c2d3a`（permalink 2，computed.ts）
- adapter commit `0b2a4f9c4e8c5d2a7e3b6c1d8a9f2e4b3c5d6e7f`（permalink 3，mobx-react-lite）
- 下次延伸：mobx-state-tree（在 MobX 之上做不可变快照 + 时间旅行）；对比 Solid Signals 的细粒度 reactive
- 关联笔记：`learnings/reactive-systems-overview.md`（待写）、`learnings/proxy-vs-defineproperty.md`
