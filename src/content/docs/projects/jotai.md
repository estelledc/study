---
title: jotai — atomic 状态管理 + Daishi Kato 第三套
description: jotai 是 pmndrs 出品的 atomic 状态管理库，Daishi Kato 在 zustand / valtio 之后给出的第三套答案：把"最小订阅单元"做到 atom 级别，用 read/write 函数 + 自动 dependency tracking 替代 store + selector / Proxy mutate 这两条路径。
sidebar:
  order: 60
  label: jotai
---

> 状元篇 / 工具库类 B 底线 / Season 13 - S13-2 紧凑接手
>
> 学这个项目的目的：理解 atomic 状态管理为什么能成为继 Redux 全局 store、zustand 单一 store + selector、valtio Proxy mutate 之后的第三条主流路径，以及 Daishi Kato 同一个人为什么会陆续给出三套思路完全不同的答案。

## 概览

一句话：jotai 把"组件订阅哪部分状态"这个问题的答案做到了原子粒度——你不再订阅"store 的某个 slice"，而是直接订阅一个 `Atom<T>`，atom 之间的依赖关系由 `get` 函数在 `read` 回调里自动追踪。

放进上下文：

- pmndrs（poimandres）是一个开源组织，旗下有 zustand、valtio、jotai、react-three-fiber、drei 等
- Daishi Kato（@dai_shi）是 zustand / valtio / jotai 三套库的核心作者，每一套都是对"React 状态管理"这个问题的不同切片
- jotai 的灵感来自 Recoil（Facebook 出品，atom + selector 概念），但比 Recoil 更小、更专注、不绑定 Concurrent Mode 的实验特性
- 名字 jotai 源自日语「状態」（じょうたい，jōtai），意思就是"状态"

为什么值得专门学：

1. atomic 模型是一种"反直觉但更精确"的订阅粒度，理解它会反过来加深对 Redux selector / zustand subscribe / valtio Proxy 的理解
2. 源码很小（vanilla 部分核心文件不到 500 行），适合作为"读完整心脏"的精读目标
3. 它的 dependency tracking 实现是"运行时 + dirty mark"的典型范例，和 React Hooks 的 deps 数组 / MobX 的自动追踪 / Vue ref 的依赖收集形成有趣的对照

## Layer 0 — 项目身份卡

| 字段 | 值 |
|---|---|
| 仓库 | github.com/jotaijs/jotai |
| Star 量级 | 19k+（截止 2026/05） |
| 参考 commit | `a3ae40ac3ceda041526fff52db08d2258dae25d0`（master HEAD） |
| 主语言 | TypeScript（types-first 设计） |
| 维护方 | pmndrs 组织 + Daishi Kato 主导 |
| 贡献者 | 200+，活跃 reviewers ~5 人 |
| License | MIT |
| 类似项目 | Recoil（Facebook，atom + selector）、zustand（单 store + selector）、valtio（Proxy mutate）、nanostores（atom 但更轻）、Redux Toolkit（全局 store + slice） |
| Bundle 大小 | ~3.5KB minified+gzipped（vanilla core），utils 按需引入 |

## Layer 1 — 为什么需要 jotai

设计取舍可以摆成一张表：

| 库 | 状态形态 | 订阅单元 | 写入方式 | dependency 追踪 |
|---|---|---|---|---|
| Redux | 单一全局 store（plain object） | reducer + selector | dispatch action → reducer | 手写 selector，靠 reselect memo |
| zustand | 单一 store（Daishi Kato 第一套） | useStore(selector) | set / get 函数 | 手写 selector |
| valtio | Proxy 包裹的 mutable 对象（第二套） | useSnapshot(proxyObj) | 直接 mutate 字段 | Proxy trap 自动收集 |
| jotai | 多个独立 atom（第三套） | useAtom(atom) | atom 自带 write 函数 | read 函数里 get(otherAtom) 自动追踪 |
| Recoil | atom + selector | useRecoilValue / useRecoilState | useSetRecoilState | get 函数追踪，但绑 Concurrent |

第一性视角看：

- "状态分布在哪里" 这个轴上，Redux / zustand 选了"集中"，valtio / jotai / Recoil 选了"分散"
- "怎么定义 derived state" 这个轴上，Redux 用 selector + reselect，zustand 用 selector，valtio 用 derive(proxy)，jotai 用 `atom((get) => ...)`，Recoil 用 selector
- "组件订阅粒度" 这个轴上，Redux/zustand 是 selector 返回值，valtio 是 Proxy snapshot，jotai 是单个 atom

jotai 的赌注：**把订阅单元做到最小**（一个 atom = 一个 useState 那么大），换来：
1. 不再需要写 selector，因为每个 atom 已经是最细粒度
2. derived atom 和普通 atom 在使用上完全对称，组件不感知是不是派生
3. dependency graph 是动态的（`get` 在 read 里调用，可以条件分支），比静态 selector 更灵活

代价：
1. 你需要把 state 拆成很多 atom，对"模型设计"要求更高
2. atom 的 identity 是引用，不能在 render 里 new atom（会触发新订阅）
3. Provider scoping、SSR hydration、跨 atom 事务这些场景需要额外 utils

## Layer 2 — 仓库地形

精读心脏文件（按重要性排序）：

```
src/vanilla/
  atom.ts          # Atom / WritableAtom 类型 + atom() 工厂函数
  store.ts         # createStore：readAtomState / writeAtomState / dependency graph
  typeUtils.ts     # 一堆 type-level helper
src/react/
  useAtom.ts       # useAtom / useAtomValue / useSetAtom
  Provider.tsx     # 可选 Provider（默认有 default store）
  useHydrateAtoms.ts  # SSR / RSC 场景下注水
src/utils/
  atomFamily.ts    # 给 atom 加参数（按 key 缓存）
  atomWithStorage.ts  # 持久化到 localStorage
  atomWithReducer.ts  # Redux 风格 reducer
  loadable.ts      # 包装 async atom
  splitAtom.ts     # array atom 拆成 atom of atom
src/index.ts       # public re-exports
```

观察点：

- `vanilla` 和 `react` 严格分层。vanilla 不依赖 React，可以单独跑在 Node / 测试 / 其他 framework 适配层
- `utils` 全部建立在 vanilla atom 之上，等于"用 atom 拼出来的 atom"。学完 vanilla 之后这些 utils 自己看 100 行就能懂
- 没有 reducer / middleware / devtools 层耦合到核心，devtools 在独立包 `jotai-devtools`

参考依赖图（已在 Layer 4 引用）：

![atom dependency graph](/projects/jotai/01-atom-graph.webp)

## Layer 3 — 三段精读

> 三段都基于 commit `a3ae40ac3ceda041526fff52db08d2258dae25d0` 锚定。每段保持"代码 → 旁注 → 怀疑"的节奏。

### 3a) `Atom<T>` 与 `WritableAtom<T, Args, Result>` 类型设计

文件：[atom.ts L37-90](https://github.com/jotaijs/jotai/blob/a3ae40ac3ceda041526fff52db08d2258dae25d0/src/vanilla/atom.ts#L37-L90)

精读片段（基于 master，简化保留要害）：

```ts
type Read<Value, SetSelf = never> = (
  get: Getter,
  options: {
    readonly signal: AbortSignal
    readonly setSelf: (...args: Parameters<SetSelf extends (...args: any[]) => any ? SetSelf : never>) => void
  },
) => Value

type Write<Args extends unknown[], Result> = (
  get: Getter,
  set: Setter,
  ...args: Args
) => Result

export interface Atom<Value> {
  toString: () => string
  read: Read<Value>
  unstable_is?: (a: Atom<unknown>) => boolean
  debugLabel?: string
  debugPrivate?: boolean
}

export interface WritableAtom<Value, Args extends unknown[], Result>
  extends Atom<Value> {
  read: Read<Value, SetAtom<Args, Result>>
  write: Write<Args, Result>
  onMount?: <S extends SetAtom<Args, Result>>(setAtom: S) => OnUnmount | void
}

type PrimitiveAtom<Value> = WritableAtom<Value, [SetStateAction<Value>], void>

export function atom<Value, Args extends unknown[], Result>(
  read: Value | Read<Value, SetAtom<Args, Result>>,
  write?: Write<Args, Result>,
): Atom<Value> | WritableAtom<Value, Args, Result> {
  const config = {} as WritableAtom<Value, Args, Result> & { init?: Value | undefined }
  if (typeof read === 'function') {
    config.read = read as Read<Value, SetAtom<Args, Result>>
  } else {
    config.init = read
    config.read = defaultRead
    config.write = defaultWrite as unknown as Write<Args, Result>
  }
  if (write) {
    config.write = write
  }
  return config
}
```

旁注：

1. `Atom<Value>` 只有一个必需字段：`read`。所谓"原子"本质上就是一个返回 Value 的 read 函数 + 一个引用 identity（对象本身就是 key）
2. `WritableAtom` 在 `Atom` 上加 `write`。`PrimitiveAtom` 是最常见的形态，`write` 接受 `SetStateAction`（兼容 React useState 写法 `set(prev => prev + 1)`）
3. `atom(initialValue)` 走 else 分支，构造一个 `PrimitiveAtom`，自带 defaultRead / defaultWrite
4. `atom((get) => get(a) + get(b))` 走 if 分支，是只读 derived atom——没有 write，所以 `useAtom` 返回的 setter 类型是 never
5. `atom(readFn, writeFn)` 是完全自定义 atom——可以 read 派生、write 触发副作用（写其他 atom、调 API）
6. `onMount` 钩子：atom 第一次被订阅时触发，返回 onUnmount。这里是 jotai 处理"atom-scoped effect"的入口（subscribe websocket、订阅外部 store 等）

第一处怀疑：
> Q: atom 的 identity 是引用，那在组件里 `const a = atom(0)` 写在 render 里会怎样？
>
> A: 每次 render 创建新 atom，订阅链路也跟着新建，等于每次 render 状态都被重置。jotai 要求 atom 写在组件外，或用 `useMemo`、`atomFamily`。这是 atomic 模型的硬约束，不是 bug。

第二处怀疑：
> Q: `unstable_is` 是干什么的？
>
> A: 用于自定义 atom 的"identity 比较"，比如 atomFamily 内部根据 param key 缓存 atom 时需要判定"这两个 atom 算同一个"。用 `unstable_` 前缀说明 API 不稳定。

### 3b) Store 的 readAtomState：dependency graph 与 dirty mark

文件：[store.ts L520-620](https://github.com/jotaijs/jotai/blob/a3ae40ac3ceda041526fff52db08d2258dae25d0/src/vanilla/store.ts#L520-L620)

精读思路（基于 master 的 readAtomState 简化版）：

```ts
type AtomState<Value = AnyValue> = {
  // dependency map: key=被依赖的 atom, value=那个 atom 当时的 epoch
  d: Map<AnyAtom, number>
  // mounted state（如果 atom 当前被订阅）
  m?: Mounted
  // 当前值或错误
  v?: Value
  e?: AnyError
  // epoch：每次值变化 +1，作为缓存比较 key
  n: number
}

function readAtomState<Value>(atom: Atom<Value>): AtomState<Value> {
  const atomState = ensureAtomState(atom)
  // 命中缓存：所有 dependency 的 epoch 都没变 → 直接返回
  if (atomState.v !== undefined && !isAtomStateDirty(atomState)) {
    return atomState
  }
  // 重新计算
  const prevDeps = atomState.d
  const nextDeps = new Map<AnyAtom, number>()
  const getter: Getter = <V>(otherAtom: Atom<V>) => {
    const otherState = readAtomState(otherAtom)
    nextDeps.set(otherAtom, otherState.n)
    return returnAtomValue(otherState)
  }
  try {
    const value = atom.read(getter, { signal: controller.signal, setSelf })
    setAtomStateValueOrPromise(atomState, value)
  } catch (error) {
    atomState.e = error
  }
  atomState.d = nextDeps
  // 卸载不再依赖的 atom
  for (const [dep, _] of prevDeps) {
    if (!nextDeps.has(dep)) {
      unmountAtom(dep)
    }
  }
  // 挂载新增依赖
  for (const [dep, _] of nextDeps) {
    if (!prevDeps.has(dep)) {
      mountAtom(dep)
    }
  }
  atomState.n++
  return atomState
}
```

旁注：

1. `AtomState.d` 是 dependency map，key 是 atom 引用，value 是那个 atom 当时的 epoch（n）。这是 jotai 做"脏检查"的核心数据结构
2. `isAtomStateDirty` 遍历 `d`，看每个 dep 当前 epoch 是否大于记录的 epoch。如果都没变，缓存命中
3. 每次 read 都会**重新构造** dependency map（nextDeps），这就是"动态依赖追踪"——你可以在 read 里 `if (get(featureFlag)) get(a) else get(b)`，依赖会跟着分支变
4. `prevDeps` vs `nextDeps` 的 diff 用于做 mount/unmount。被新加的依赖触发 mountAtom（递归挂载），不再依赖的触发 unmountAtom（可能触发 onUnmount）
5. epoch（n）是核心 invariant：值变化时 +1，下游 atom 比较 epoch 决定要不要 invalidate
6. `setSelf` 是 read 回调里能拿到的"写自己的 atom"的能力，用于 `onMount` 场景（不在这段，但提一下）

第三处怀疑：
> Q: derive cycle 怎么办？atom A 依赖 atom B，atom B 又依赖 atom A？
>
> A: 当前实现没有显式 cycle detection。如果你写了循环依赖，readAtomState 会无限递归直到栈溢出。这是被反复讨论但没修的"已知坑"，因为运行时检测有性能代价。issue 里的官方建议是：自己审计，或用 unstable_ 钩子打断。

第四处怀疑：
> Q: epoch 用 number 会溢出吗？
>
> A: JavaScript Number 安全整数到 2^53，一个 atom 每秒变化 1 次也要 2.85 亿年才溢出。实务上不需要管。

### 3c) atomFamily / atomWithStorage 高阶 atom

文件：[atomFamily.ts L1-80](https://github.com/jotaijs/jotai/blob/a3ae40ac3ceda041526fff52db08d2258dae25d0/src/vanilla/utils/atomFamily.ts#L1-L80)

精读片段：

```ts
type AtomFamily<Param, AtomType> = {
  (param: Param): AtomType
  remove: (param: Param) => void
  setShouldRemove: (shouldRemove: ShouldRemove<Param> | null) => void
}

export function atomFamily<Param, AtomType extends Atom<unknown>>(
  initializeAtom: (param: Param) => AtomType,
  areEqual?: (a: Param, b: Param) => boolean,
): AtomFamily<Param, AtomType> {
  let shouldRemove: ShouldRemove<Param> | null = null
  const atoms: Map<Param, [AtomType, number]> = new Map()
  const createAtom = (param: Param) => {
    let item: [AtomType, number] | undefined
    if (areEqual === undefined) {
      item = atoms.get(param)
    } else {
      // O(n) 自定义比较
      for (const [key, value] of atoms) {
        if (areEqual(key, param)) {
          item = value
          break
        }
      }
    }
    if (item !== undefined) {
      if (shouldRemove?.(item[1], param)) {
        createAtom.remove(param)
      } else {
        return item[0]
      }
    }
    const newAtom = initializeAtom(param)
    atoms.set(param, [newAtom, Date.now()])
    return newAtom
  }
  createAtom.remove = (param: Param) => { /* ... */ }
  createAtom.setShouldRemove = (fn) => { shouldRemove = fn }
  return createAtom
}
```

旁注：

1. atomFamily 的核心是一个 `Map<Param, Atom>`，把 param 映射到 atom。第一次 `userAtom(123)` 创建并缓存，第二次 `userAtom(123)` 返回同一个 atom 引用
2. `areEqual` 是为了支持 object param（默认 Map 用 === 比较，object 永远不命中）。代价是 O(n) 查找
3. `shouldRemove` + `setShouldRemove` 是手动 GC 钩子——比如"30 分钟没用的 user atom 清掉"
4. 这就是为什么 atom 一定要 stable identity——atomFamily 全靠 Map 的引用相等
5. 对照 Recoil 的 atomFamily：Recoil 的 param 必须 serializable，jotai 不要求（用 Map）。代价是 jotai 不能跨 SSR 边界自动恢复，Recoil 可以

跨文件互相印证：[atomWithStorage.ts](https://github.com/jotaijs/jotai/blob/a3ae40ac3ceda041526fff52db08d2258dae25d0/src/vanilla/utils/atomWithStorage.ts) 的实现就是用 `atom(read, write)` + onMount 订阅 storage 事件。读完 vanilla 之后这一类 utils 都可以"看名字猜实现"再对照源码验证。

## Layer 4 — 改一处：动手验证 dependency tracking

最小复现步骤（不依赖任何业务上下文）：

```bash
mkdir jotai-play && cd jotai-play
npm init -y
npm install jotai react react-dom typescript
```

写一段 vanilla（不需要 React）：

```ts
import { atom, createStore } from 'jotai/vanilla'

const countA = atom(1)
const countB = atom(2)
const sum = atom((get) => get(countA) + get(countB))
const conditionalAtom = atom((get) => {
  const useA = get(countA) > 0
  return useA ? get(countA) : get(countB)
})

const store = createStore()
console.log(store.get(sum))  // 3
store.set(countA, 10)
console.log(store.get(sum))  // 12

// 订阅
const unsub = store.sub(sum, () => {
  console.log('sum changed:', store.get(sum))
})
store.set(countB, 100)  // 触发，sum 变成 110

// 验证动态依赖
const unsub2 = store.sub(conditionalAtom, () => {
  console.log('conditional:', store.get(conditionalAtom))
})
store.set(countA, -5)  // useA 变成 false，依赖切到 countB
store.set(countA, 999)  // 现在改 countA 不会触发，因为已经不依赖了
store.set(countB, 7)    // 这次会触发
```

观察预期：

1. `sum` 在 `countA` 或 `countB` 变化时都触发
2. `conditionalAtom` 在条件切换后，依赖会**动态变化**——这是静态 selector 做不到的
3. 如果你 console.log 在 read 函数里，能看到 read 在订阅 + 依赖变化时被调用

如果观察不到 #2，去 store.ts 加个 `console.log(prevDeps, nextDeps)` 看 diff，dependency 重建过程一目了然。

## Layer 5 — 横向对比

| 维度 | jotai | zustand | valtio | Recoil | Redux Toolkit |
|---|---|---|---|---|---|
| 状态形态 | 多个 atom（分散） | 单一 store | Proxy 包裹的 mutable obj | atom + selector（分散） | 单一 store + slice |
| 订阅粒度 | atom 级（最细） | selector 返回值 | snapshot 字段（Proxy trap 自动） | atom/selector | selector 返回值 |
| 写入风格 | atom.write 函数 | set / get | 直接 mutate | useSetRecoilState | dispatch action |
| 派生状态 | atom((get)=>...) | 手写 selector | derive(proxy) | selector | reselect |
| 依赖追踪 | 运行时 + dirty mark | 不追踪，selector 返回值比较 | Proxy trap 自动收集 | 静态依赖（v0 实验过 dynamic） | 不追踪 |
| Bundle 大小 | ~3.5KB | ~1KB | ~3KB | ~22KB | ~10KB（含 reducer） |
| SSR 友好度 | 中（需 useHydrateAtoms） | 高 | 中（snapshot 跨边界要序列化） | 中（实验性） | 高 |
| 心智模型成本 | atom 拆得对很重要 | selector 写得好就行 | 写得像 vanilla JS | 学 atom + selector 双概念 | reducer / action / slice |
| 适用规模 | 中小 → 中大 | 中小 → 中 | 中小 | 大（FB 系应用） | 大（企业级） |
| 同作者 | Daishi Kato | Daishi Kato | Daishi Kato | FB 团队 | Redux 团队 |

为什么 Daishi Kato 同一个人会做三套：

- zustand：解决"Redux 太重，但我还是要单一 store + selector"
- valtio：解决"想直接 mutate，不写 setter"
- jotai：解决"selector 是补丁，订阅粒度应该是状态本身"

三套不是替代关系，是同一个问题的三种切法。理解了 jotai 反而会更清楚 zustand / valtio 的取舍。

## Layer 6 — 三段消化

### 今天就能用

1. 学完 Layer 3 的三段精读后，能跟人讲清楚"jotai 的 atom 是什么、为什么 atom 必须写在组件外"
2. 把 Layer 4 的 vanilla 例子跑通，能解释 dependency 动态变化的现象
3. 在自己的 React 小项目里把一个 useState + 多个 useState 派生 useMemo 的场景，重写成 atom + derived atom，体感"selector 没了"
4. 读 atomFamily.ts 全文（80 行），能讲清楚为什么需要 `areEqual` 参数

### 下个月能用

1. 读完 store.ts 全文（~700 行），能画出 mountAtom / unmountAtom / readAtomState / writeAtomState 的调用关系图
2. 在中等项目里用 jotai 做状态层，覆盖 SSR 注水（useHydrateAtoms）+ atomWithStorage 持久化 + atomFamily 列表
3. 读 jotai 的 RFC 和 issue（#XXX 系列关于 cycle detection / Suspense 集成 / RSC 集成）几个长讨论，能跟得上社区争论
4. 试着给 jotai 写一个自定义 util atom（比如 atomWithDebounce），跑通后对照社区已有的实现
5. 把 zustand 一个真实项目的 store 用 atom 重写，对照两份代码自己写比较记录

### 不要用的部分

1. 不要在 render 函数里 `atom()`——会每次重建订阅
2. 不要在 atom 之间写循环依赖——当前没有 cycle detection，会栈溢出
3. 不要把 jotai 当 Redux 用（写一个巨大的 atom，所有状态塞里面）——失去 atom 粒度的全部好处
4. 不要在没读完 vanilla 的情况下直接用 jotai-redux / jotai-zustand 这种 bridge 包——bridge 包通常是"两边都没学透就想偷懒"的产物，会同时承担两边的心智成本

## Layer 7 — 怀疑清单（≥ 3 条）

1. **SSR hydration 状态丢失**：服务端 createStore 的状态怎么序列化、怎么传到客户端、怎么避免水合不一致？查 useHydrateAtoms 的实现（react/useHydrateAtoms.ts），但 RSC（React Server Components）下行为还在演进，stable API 可能跟着 React 19+ 调整。
2. **derive cycle 没检测**：A 依赖 B、B 依赖 A 当前会栈溢出。社区 issue 长期讨论，没合并，因为运行时检测代价大，dev-only 检测要不要做也有分歧。自己写 atom 时只能靠纪律。
3. **useAtom 在 React 18 Concurrent 下的撕裂（tearing）**：jotai 用 useSyncExternalStore（React 18 引入）保证一致性，但 Suspense + Concurrent 边界下 atom 的 promise 状态如何被 transition 影响，文档没说清，需要读 react/useAtomValue.ts 和 store.ts 的 promise 处理路径才能搞懂。
4. **atom identity vs 热更新**：vite HMR 下，模块重新执行会导致 `atom(0)` 创建新引用，订阅链路全部丢失。社区有 jotai/babel 插件给 atom 自动加 debugLabel + identity 保留，但不是默认行为。
5. **atomFamily 的内存泄漏**：默认无限缓存，需要手动 setShouldRemove。在长生命周期应用 + 大 param 空间（比如 userId）下，必须配合 GC 策略，否则 Map 一直涨。

每一条怀疑都是后续可以单独开一篇精读 / 实验的子题。

## 限制（≥ 4 条）

1. **生态规模**：jotai 周下载量约 zustand 的 1/3 ~ 1/2，第三方 utils（jotai-immer / jotai-tanstack-query / jotai-effect 等）没 zustand 那么多，遇坑要自己读源码或 issue。
2. **学习曲线非线性**：第一周用着觉得"就是更好的 useState"很顺，第二周遇到 SSR / atomFamily / 跨 atom 事务时会遇到一波集中的概念冲击，需要回头读 vanilla 源码。
3. **devtools 不内建**：要装 jotai-devtools 独立包，且 UI 比 Redux DevTools 简陋很多，复杂应用调 dependency graph 主要靠 console.log + debugLabel。
4. **TS 类型推断有时绕**：`WritableAtom<Value, Args, Result>` 三个泛型，写自定义 atom 时常常需要手动标注，错误信息可能很长。
5. **跨 store 不容易**：默认有一个 default store，多 store 场景需要 Provider 和手动管理，比 zustand 多 store（创建多个 store 实例就行）麻烦。
6. **没有内建 middleware 概念**：要做 logging / persist / undo redo，要么自己 wrap atom（atomWithReducer / atomWithStorage 这种思路），要么用社区包，没有 Redux middleware 那么标准化。

## 元数据

- 本笔记参考 commit：`a3ae40ac3ceda041526fff52db08d2258dae25d0`
- 精读文件：`src/vanilla/atom.ts`、`src/vanilla/store.ts`、`src/vanilla/utils/atomFamily.ts`
- 精读字段聚焦：`Atom<T>`、`WritableAtom<T, Args, Result>`、`AtomState`、`readAtomState`、`atomFamily`
- 类似项目对照（Layer 5 表）：zustand / valtio / Recoil / Redux Toolkit / nanostores
- 状态：状元篇初稿 / 工具库类 B 底线 ≥ 400 行 / Season 13 - S13-2 紧凑接手
- 后续可深挖（来自 Layer 7 怀疑）：
  - SSR/RSC 注水路径全图
  - cycle detection 历史 issue 串读
  - useSyncExternalStore + Suspense 撕裂边界
  - atomFamily 内存策略对比 LRU 实现
- 精读节奏：Layer 0-2（概览/为什么/地形）→ Layer 3 三段（精读心脏）→ Layer 4（动手）→ Layer 5（横向对比）→ Layer 6-7（消化 + 怀疑）→ 限制
- 适合先读完才看本笔记的前置：useState / useReducer / useContext / 一段 Redux 教程 / zustand 简单上手过
- 适合本笔记之后立刻读：valtio 源码（Daishi Kato 同人第二套，Proxy 路径）形成对照组
