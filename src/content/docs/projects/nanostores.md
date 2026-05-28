---
title: nanostores — 框架无关的 atomic 状态库（< 1 KB）
description: nanostores 是 Andrey Sitnik（PostCSS / Browserslist 作者）做的极小状态管理库，押注"state 不该绑定 React"——一个 ~265 字节的 atom 核心，再用独立适配器把同一个 store 接到 React / Vue / Svelte / Preact / Solid / Lit / vanilla JS。
sidebar:
  order: 61
  label: nanostores
---

> 状元篇 / 工具库类 B 底线 / Season 13 接续 jotai 的 atomic state 主题
>
> 学这个项目的目的：理解"atom 思想 + 框架适配器分离"为什么是 [jotai](/projects/jotai/) 之外的另一种 atomic state 切法——
> jotai 把 atom 绑死在 React 内（vanilla 是后来才剥出来的），nanostores 反过来：核心永远不知道 React 的存在，
> 让 React/Vue/Svelte 共用同一份 store 文件。

## 概览

一句话：nanostores 把 atom 抽象做到极小（核心 < 1 KB minified+brotlied），
然后用一组**互相独立的 npm 包**（`@nanostores/react` / `@nanostores/vue` / `@nanostores/svelte` / ...）把同一个 store 接到不同前端框架。
你写一份 `$users = atom([])`，React 组件用 `useStore($users)`、Vue 组件也用 `useStore($users)`、Svelte 模板里直接 `$$users` —— 都是同一个 store 实例。

放进上下文：

- 作者 Andrey Sitnik（GitHub `@ai`）是 [PostCSS](https://github.com/postcss/postcss)、[Autoprefixer](https://github.com/postcss/autoprefixer)、[Browserslist](https://github.com/browserslist/browserslist)、[Size Limit](https://github.com/ai/size-limit) 的作者；他做工具的一贯口味就是"小 + 单一职责 + 无依赖"
- nanostores 由 [Evil Martians](https://evilmartians.com/) 维护（Sitnik 所在公司），README 顶部明示 "Between 294 and 831 bytes (minified and brotlied)"——把 bundle size 当作核心 KPI
- monorepo 但**核心和适配器是分仓库**：`nanostores/nanostores` 是核心 + 几个 vanilla 助手（map / computed / deep-map / lifecycle）；`nanostores/react`、`nanostores/vue`、`nanostores/preact` 等都是独立 repo
- 设计哲学跟 [zustand](/projects/zustand/) / [valtio](/projects/valtio/) / [jotai](/projects/jotai/) 形成有趣对照：那三套都是 React-first（vanilla 是 byproduct），nanostores 反过来——vanilla-first，框架是 byproduct

为什么值得专门学：

1. 同一个"atomic state"问题的另一种切法。jotai 把订阅粒度做小，nanostores 把"框架解耦"做彻底。两者读完会从两个角度照亮"selector 时代为什么过去了"
2. 核心代码极短（atom 实现 97 行，map 23 行，computed 65 行），适合作为"读完整心脏"的精读目标——读完能完整复述全部机制，没有黑盒
3. 它的 `globalThis.nanostoresGlobal.epoch` 共享计数器是一个非常实用的工程 trick，解决"同一个库被打包成多份时怎么共享状态"——这种问题在 micro-frontend / module federation / npm-link / Next.js RSC 场景都会出现

## Layer 0 — 项目身份卡

| 字段 | 值 |
|---|---|
| 仓库 | github.com/nanostores/nanostores |
| Star 量级 | 7.4k+（2026-05 读时） |
| Fork | 151 |
| 最近活跃 | 2026-04-30（pushed_at） |
| 参考 commit | `d703421c90965909b19165d7c5bcdf62db0c5b48`（main HEAD，"Move to pnpm 11 to move CI jobs"） |
| 主语言 | JavaScript（带独立 `.d.ts`，不是 TS 编译产物） |
| 维护方 | Evil Martians 公司 + Andrey Sitnik 主导（792 commits）；活跃 contributor ~5 人（gismya / droganov / eddort / dkzlv / euaaaio） |
| License | MIT |
| 类似项目 | [jotai](/projects/jotai/)（atomic 但绑 React）、[zustand](/projects/zustand/)（单 store + selector）、[valtio](/projects/valtio/)（Proxy mutate）、Redux Toolkit、Svelte writable store、Solid signal |
| Bundle 大小 | core 294 B–831 B (min+brotli)，单独 atom ~265 B；按需引入 |
| 前置兄弟 | `@nanostores/react` 仓库 commit `9ff3cac2225d4c9ead4c6186f253f791c01f590a`；`@nanostores/vue` commit `123606170ca0fa07cf7a3bfc377832730906c1ea`；`@nanostores/preact` commit `4dd89c356299f3b7e5a973a445e06c16678bd32b` |

## Layer 1 — 为什么需要 nanostores

把同时代的几套放成一张表，看哪一根轴是 nanostores 押注的：

| 库 | 状态形态 | 框架耦合 | 心智模型 | bundle 量级 |
|---|---|---|---|---|
| Redux Toolkit | 单一全局 store | 中（react-redux 是必经路径） | reducer + slice + dispatch | ~10 KB |
| zustand | 单一 store + selector | 中（vanilla 可用，但生态主战场是 React） | `useStore(s => s.x)` | ~1 KB |
| valtio | Proxy 包裹的 mutable 对象 | 中（vanilla 可用，但 useSnapshot 是 React-only） | 直接 mutate | ~3 KB |
| jotai | 多个独立 atom | 高（vanilla 是后剥出的子集，主入口是 React） | `atom + useAtom` | ~3.5 KB |
| nanostores | 多个独立 atom | **零**（core 不 import 任何框架） | `atom + useStore`，所有框架同一个 store 文件 | **< 1 KB** |
| Svelte writable | 单 store | 高（绑 Svelte runtime） | `writable(0)` + `$store` 自动订阅 | runtime 内置 |

第一性视角看，nanostores 在两个轴上做了极端选择：

- **bundle 量级**：< 1 KB 不是营销数字，是设计约束——atom 必须能塞进任何 npm 包作为传递依赖而不被骂；这反过来逼 API 极简（atom 只暴露 `get / set / listen / subscribe / notify / off / lc / value / init`，没有 selector，没有 middleware，没有 devtools）
- **框架解耦**：core 的 `atom/index.js` 不 import 任何前端框架；React/Vue/Preact 适配器都是独立仓库、独立 npm 包、独立 release。结果是同一份 `stores/users.ts` 文件可以同时被 React app 和 Astro Vue island 复用——不是理论上能用，是真的同一个 import

它赌的是：**state 不该绑定 React**——React 之于状态管理就像 jQuery 之于 DOM——总会有下一代框架，但你的业务 store 不应该跟着改。jotai 的 `atom + write` API 里 `read(get) => ...` 那个 `get` 是 React-render 时收集依赖的形状；nanostores 的 atom 没有这种 hook 形状，是纯 listener pattern，所以可以在任何环境跑。

代价：

1. 没有 selector，意味着"组件订阅 store 的一部分"这件事要靠**拆 atom**（多个小 atom）或者 `listenKeys(store, ['key1'])` 显式声明。模型设计要求更高
2. 不带 devtools，没有 time-travel；调试靠 `onSet / onNotify` 自己加 console.log
3. 没有 middleware 链——任何"自动 persist / sync URL / log"都得自己用 `onSet` 包一层
4. computed 不是真正的 lazy + 自动 dependency tracking——它要求你**显式列出依赖的 stores**（看 Layer 3b），跟 jotai 的"运行时收集依赖"是两条路

manifesto 引用：[README 第 6-12 行](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/README.md#L6-L12)：

> "A tiny state manager for **React**, **React Native**, **Preact**, **Vue**, **Svelte**, **Solid**, **Lit**, **Angular**, and vanilla JS.
> It uses **many atomic stores** and direct manipulation."
> "Designed to move logic from components to stores."

注意"move logic from components to stores"——这是和 zustand "store as a glorified useState" 哲学的最大区别。Sitnik 的设计意图是：业务逻辑（"添加一个 user"）应该在 store 文件里写成普通函数，组件只读不写；不是组件里 inline `setUsers(...)`。

## Layer 2 — 仓库地形

顶层文件树（基于 commit `d703421c`，参考 [GitHub contents API](https://api.github.com/repos/nanostores/nanostores/contents/)）：

```
nanostores/                 ← 核心仓库（pnpm workspace 但实际只是用来分子目录）
  atom/                     ← 心脏 1：atom 实现（97 行 .js + .d.ts）
  map/                      ← map：object atom + setKey
  deep-map/                 ← deepMap：嵌套 path + getPath/setPath
  computed/                 ← computed：派生 store
  lifecycle/                ← onMount / onStart / onStop / onSet / onNotify 事件 mux
  listen-keys/              ← 只在指定 key 变化时触发
  effect/                   ← side-effect util
  task/                     ← async task helper
  keep-mount/               ← 保持订阅不被释放
  map-creator/              ← parameterized map（类似 jotai 的 atomFamily）
  clean-stores/             ← 测试 helper（导出 Symbol 用作 secret key）
  warn/                     ← dev-only console.warn util
  test/                     ← 测试套件
  index.js / index.d.ts     ← 总 re-export
  package.json              ← exports map：每个子目录是一个 subpath export
```

观察点：

- 没有 `src/` 顶层目录。每个子模块直接在仓库根，对应 `package.json` exports map 的一个 subpath（如 `nanostores/atom`）
- 每个子目录里都是 `index.js`（手写 ESM）+ `index.d.ts`（手写 types，**不是** tsc 生成）。看 atom 子目录：[index.js 97 行](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/atom/index.js) + [index.d.ts](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/atom/index.d.ts)
- 适配器**全在别的仓库**：`@nanostores/react` 在 `nanostores/react`，`@nanostores/vue` 在 `nanostores/vue`，等等。这是有意为之——core 的 release 不应该牵动框架适配器的版本

心脏文件清单（按精读优先级）：

1. [atom/index.js@d703421c](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/atom/index.js#L1-L97) —— 97 行，整个库的物理底座
2. [computed/index.js@d703421c](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/computed/index.js#L1-L65) —— 65 行，理解 epoch 计数器和 batched 模式
3. [@nanostores/react/index.js@9ff3cac2](https://github.com/nanostores/react/blob/9ff3cac2225d4c9ead4c6186f253f791c01f590a/index.js#L1-L34) —— 34 行，理解适配器层只有这么薄

参考架构：

![nanostores 架构：core / lifecycle / 适配器 / 框架四层，箭头从上往下](/projects/nanostores/01-architecture.webp)

> Figure 1: nanostores 四层结构。Layer 1 是 core（atom / map / computed / deep-map），全部不 import 任何前端框架。Layer 2 是 lifecycle 事件 mux（onMount / onSet / onNotify 等），通过"动态替换 store.set / store.listen"的方式给 core 加钩子，而不是 core 内置事件总线。Layer 3 是各 framework 适配器（独立 repo，独立 npm 包），每个适配器只做一件事：把 store.listen 桥接到目标框架的 reactivity primitive（React 用 `useSyncExternalStore`，Vue 用 `shallowRef`，Preact 用 `useEffect + forceRender`）。Layer 4 是宿主框架本身，它只看到一个普通 hook 调用。这张图的关键 take-away：core 永远不知道 React 的存在，所以同一份 store 文件可以跨框架复用。

## Layer 3 — 三段精读

> 三段都基于 nanostores 核心 commit `d703421c90965909b19165d7c5bcdf62db0c5b48`、@nanostores/react commit `9ff3cac2225d4c9ead4c6186f253f791c01f590a`。每段保持"代码 → 旁注 → 怀疑"的节奏。

### 3a) atom 的极小核心：listeners 数组 + listenerQueue 批处理

文件：[atom/index.js#L1-L97](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/atom/index.js#L1-L97)

精读片段（完整、未删节）：

```js
import { clean } from '../clean-stores/index.js'

let listenerQueue = []
let lqIndex = 0
const QUEUE_ITEMS_PER_LISTENER = 4
// Use globalThis.nanostoresGlobal to store epoch so all module instances share
// the same counter. This fixes issues when Nano Store is bundled separately
// in different parts of an application (e.g., tree-shaking separates core
// from React), causing each bundle to have its own epoch instance.
export const nanostoresGlobal = (globalThis.nanostoresGlobal ||= { epoch: 0 })

/* @__NO_SIDE_EFFECTS__ */
export const atom = initialValue => {
  let listeners = []
  let $atom = {
    get() {
      if (!$atom.lc) {
        $atom.listen(() => {})()
      }
      return $atom.value
    },
    init: initialValue,
    lc: 0,
    listen(listener) {
      $atom.lc = listeners.push(listener)
      return () => {
        for (
          let i = lqIndex + QUEUE_ITEMS_PER_LISTENER;
          i < listenerQueue.length;
        ) {
          if (listenerQueue[i] === listener) {
            listenerQueue.splice(i, QUEUE_ITEMS_PER_LISTENER)
          } else {
            i += QUEUE_ITEMS_PER_LISTENER
          }
        }
        let index = listeners.indexOf(listener)
        if (~index) {
          listeners.splice(index, 1)
          if (!--$atom.lc) $atom.off()
        }
      }
    },
    notify(oldValue, changedKey) {
      nanostoresGlobal.epoch++
      let runListenerQueue = !listenerQueue.length
      for (let listener of listeners) {
        listenerQueue.push(listener, $atom.value, oldValue, changedKey)
      }
      if (runListenerQueue) {
        for (
          lqIndex = 0;
          lqIndex < listenerQueue.length;
          lqIndex += QUEUE_ITEMS_PER_LISTENER
        ) {
          listenerQueue[lqIndex](
            listenerQueue[lqIndex + 1],
            listenerQueue[lqIndex + 2],
            listenerQueue[lqIndex + 3]
          )
        }
        listenerQueue.length = 0
      }
    },
    off() {},
    set(newValue) {
      let oldValue = $atom.value
      if (oldValue !== newValue) {
        $atom.value = newValue
        $atom.notify(oldValue)
      }
    },
    subscribe(listener) {
      let unbind = $atom.listen(listener)
      listener($atom.value)
      return unbind
    },
    value: initialValue
  }
  return $atom
}
```

旁注：

1. **整个 atom 就是一个普通对象**——没有 class、没有 Proxy、没有 Symbol（除了 dev-only 的 `clean`）。`atom(0)` 就是返回这个 object literal。引用相等就是 store identity
2. `lc` = listener count。`get()` 里 `if (!$atom.lc) $atom.listen(() => {})()` 是个**自启动 trick**：如果当前 0 listener，就 listen 一下立刻 unsub，目的是触发 `onMount`/`onStart` 钩子（lifecycle 那边监听了 `listen` 调用），这样在没人订阅的情况下 `$atom.get()` 也能拿到正确初始化的值
3. `notify` 不是 forEach 调 listener，而是把要调的 listener 平铺进**全局** `listenerQueue` 数组（4 个位 1 组：listener / newVal / oldVal / changedKey）。这是 nanostores 处理"嵌套 set"问题的核心 trick
4. `runListenerQueue = !listenerQueue.length` 这一行决定"我是 outermost notify 吗"——如果是，下面的 for 循环消化整个 queue；如果不是（说明上层 notify 还没消化完），只 push 不消化。这等于一个**手写的事件循环**，避免栈深度爆炸 + 保证所有 listener 看到的是 set 之后的最终值
5. `QUEUE_ITEMS_PER_LISTENER = 4` 是一个微优化——比起每次 `push({listener, newVal, oldVal, key})` 创建 object，连续 push 4 个 primitive 对 V8 的 hidden class 更友好。这种 byte-counting 偏执是 Sitnik 的 size-limit-driven 风格
6. unsubscribe 时（`return () => {...}`）要做两件事：从 `listeners` 数组里删，**也**要从全局 `listenerQueue` 里删——否则一个 listener 在 notify 进行中 unsubscribe 自己，后面的 queue 还是会调它。`for (let i = lqIndex + 4; ...)` 循环就是干这个的，`lqIndex` 是当前消费指针，所以只清理"还没消费"的部分
7. `globalThis.nanostoresGlobal.epoch` 是跨 bundle 的全局时钟。注释说得很清楚："when Nano Store is bundled separately in different parts of an application (e.g., tree-shaking separates core from React)"——因为适配器是独立 npm 包，bundler 完全可能把 nanostores core 打两份（一份给主 bundle，一份给 React adapter chunk）；每份都有自己的 module-scope 变量，但 `globalThis` 是全局共享，所以 epoch 必须挂在 globalThis 上

第一处怀疑：
> Q: `listeners.indexOf(listener)` 是 O(n)，listener 多了会不会变慢？
>
> A: 会，但 nanostores 的赌注是"每个 store 的 listener 通常 < 10"——因为是 atomic store，订阅的人是少数 useStore 调用，不是全局 store 那种几十个 selector。如果你真的把所有状态塞进一个 atom 然后让 100 个组件订阅，性能就会下降。这反过来强化"拆 atom"的设计意图。

第二处怀疑：
> Q: 为什么 `set` 里只用 `oldValue !== newValue` 比较（reference equality），不做 deep equal？
>
> A: 因为 atom 的语义就是"原子替换"——你要么换一个完全新的值，要么不换。如果你的 store 是 object 想"改字段"，应该用 [`map()`](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/map/index.js)（看 3b）。这是设计层面把"set 用 ===" 当作约束而不是 bug——deep equal 会让 bundle 暴涨且语义不清。

第三处怀疑：
> Q: `off()` 默认是空函数，谁会改它？
>
> A: lifecycle 模块的 `onStop` 和 `onMount` 会重新赋值 `$store.off`：见 [lifecycle/index.js#L52-L62](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/lifecycle/index.js#L52-L62) 的 `onStop`，里面 `$store.off = () => { runListeners(); originOff() }`。这就是 nanostores 的 hook 机制——不是事件总线，是**直接改写 store 的方法**（"动态包装"）。下面的 onMount 也用同样套路。

### 3b) computed：epoch-based 的依赖追踪 + lazy 求值

文件：[computed/index.js#L1-L65](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/computed/index.js#L1-L65)

精读片段（完整）：

```js
import { atom, nanostoresGlobal } from '../atom/index.js'
import { onMount } from '../lifecycle/index.js'
import { warn } from '../warn/index.js'

let computedStore = (stores, cb, batched) => {
  if (!Array.isArray(stores)) stores = [stores]

  let previousArgs
  let currentEpoch
  let set = () => {
    if (currentEpoch === nanostoresGlobal.epoch) return
    currentEpoch = nanostoresGlobal.epoch
    let args = stores.map($store => $store.get())
    if (!previousArgs || args.some((arg, i) => arg !== previousArgs[i])) {
      previousArgs = args
      let value = cb(...args)
      if (value && value.then && value.t) {
        if (process.env.NODE_ENV !== 'production') {
          warn(
            'Use @nanostores/async for async computed. We will remove Promise support in computed() in Nano Stores 2.0'
          )
        }
        value.then(asyncValue => {
          if (previousArgs === args) {
            $computed.set(asyncValue)
          }
        })
      } else {
        $computed.set(value)
        currentEpoch = nanostoresGlobal.epoch
      }
    }
  }
  let $computed = atom(undefined)
  let get = $computed.get
  $computed.get = () => {
    set()
    return get()
  }

  let timer
  let run = batched
    ? () => {
        clearTimeout(timer)
        timer = setTimeout(set)
      }
    : set

  onMount($computed, () => {
    let unbinds = stores.map($store => $store.listen(run))
    set()
    return () => {
      for (let unbind of unbinds) unbind()
    }
  })

  return $computed
}

/* @__NO_SIDE_EFFECTS__ */
export const computed = (stores, fn) => computedStore(stores, fn)

/* @__NO_SIDE_EFFECTS__ */
export const batched = (stores, fn) => computedStore(stores, fn, true)
```

旁注：

1. **依赖必须显式列出**——`computed([$a, $b], (a, b) => ...)`。这是和 [jotai](/projects/jotai/) `atom((get) => get($a) + get($b))` 的根本区别。jotai 的 `get` 是运行时收集，nanostores 是**静态声明**。代价是不能写"if 分支动态依赖"，收益是不需要在 render 期间重建依赖图——更小、更可预测
2. `currentEpoch === nanostoresGlobal.epoch` 是**全局时钟优化**：如果自上次 set 以来 epoch 没变，说明任何 store 都没 notify 过，computed 不可能有新值，直接 return。这是 byte-saving 替代"per-store dirty bit"的 trick
3. `args.some((arg, i) => arg !== previousArgs[i])` 才是真正的"输入变了吗"判定。注意是 reference equality——和 atom.set 的语义一致
4. `let get = $computed.get; $computed.get = () => { set(); return get() }` —— 把原来的 get 保存下来，再覆盖一个先 set 后 get 的版本。这就是 nanostores 风格的"装饰"：直接改 store 上的方法，不引入新 wrapper 对象。学完 atom 之后这种 pattern 出现得到处都是
5. `batched` 模式用 `setTimeout(set)` 把多次依赖变化合成一次 compute——典型场景：`$a` 和 `$b` 在同一 tick 里都改了，非 batched 会触发 2 次 cb，batched 只触发 1 次。代价是异步——`$computed.get()` 立刻读不到最新值
6. `onMount` 里订阅所有依赖、return 清理函数。这就是 nanostores 处理 "computed 没人订阅时不要白白挂着" 的方式——只有当 `$computed.lc > 0` 时才 listen 上游，没人订阅就 unbind 全部
7. `value.then && value.t` 这个判断是探测 [task](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/task/index.js) 包装的 promise（用 `.t` 字段做标记）。注释明示 "We will remove Promise support in computed() in Nano Stores 2.0"——说明 sync computed + 显式 task 是未来方向

第一处怀疑：
> Q: 为什么 set 里有两次 `currentEpoch = nanostoresGlobal.epoch`？第一次在开头，第二次在 `$computed.set(value)` 之后？
>
> A: 因为 `$computed.set(value)` 内部会触发 `notify`，而 notify 会 `nanostoresGlobal.epoch++`（看 atom 那边）。所以 set 完后 epoch 又变了，必须重新对齐——否则下一次同步调用 `$computed.get()` 会以为 epoch 没变就跳过 compute。这是一个被全局时钟方案逼出来的"自校准"。

第二处怀疑：
> Q: `previousArgs === args` 这个判断在 promise.then 回调里看上去多余——`args` 是 set 函数 captured 的局部变量，怎么会变？
>
> A: 不会变，但**可能被覆盖**——如果 set 在第一个 promise resolve 之前被再次调用，`previousArgs` 已经被新的 args 覆盖了。`previousArgs === args` 是判定 "我是不是当前最新一次的计算"——如果不是，丢弃这个 stale 结果。这是异步 race condition 的标准防御。

### 3c) 跨框架适配器：以 @nanostores/react 为例

文件：[@nanostores/react index.js#L1-L34](https://github.com/nanostores/react/blob/9ff3cac2225d4c9ead4c6186f253f791c01f590a/index.js#L1-L34)

精读片段（完整 34 行）：

```js
import { listenKeys } from 'nanostores'
import { useCallback, useRef, useSyncExternalStore } from 'react'

let emit = (snapshotRef, onChange) => value => {
  if (snapshotRef.current === value) return
  snapshotRef.current = value
  onChange()
}

export function test() {
  return 1
}

export function useStore(store, { keys, deps = [store, keys], ssr } = {}) {
  let snapshotRef = useRef()
  snapshotRef.current = store.get()

  let subscribe = useCallback(onChange => {
    emit(snapshotRef, onChange)(store.value)

    return keys?.length > 0
      ? listenKeys(store, keys, emit(snapshotRef, onChange))
      : store.listen(emit(snapshotRef, onChange))
  }, deps)

  let get = () => snapshotRef.current

  let server = get
  if (ssr && 'init' in store) {
    server = ssr === 'initial' ? () => store.init : ssr
  }

  return useSyncExternalStore(subscribe, get, server)
}
```

旁注：

1. **整个 React 集成 = `useSyncExternalStore` + `store.listen`**。React 18 引入的 `useSyncExternalStore` 就是为这种"外部 store 接进 React 并发渲染"场景设计的，nanostores 是它的标准用法
2. `snapshotRef.current = store.get()` 在每次 render 顶部更新——这样 React 的 `getSnapshot` 拿到的是最新值。`useRef` 是为了让 closure 里的 `emit` 能拿到稳定引用
3. `emit` 函数做 "如果新值和当前 snapshot 相等就不通知 React" 的去抖。这处理一种场景：`listenKeys` 在某个 key 变化时会触发，但你订阅的其他 key 可能没变——nanostores core 的 notify 不做 fine-grained equality，由适配器层挡掉
4. `keys` 选项 + `listenKeys` —— 适配器用户可以写 `useStore($user, { keys: ['name'] })`，只在 `$user.name` 变化时 re-render。这是 nanostores 模拟 selector 的方式：不在 store 里做 selector，而在订阅时声明感兴趣的 key
5. `ssr` 选项 —— 服务端渲染时 React 18 要求 `useSyncExternalStore` 提供 `getServerSnapshot`。`ssr === 'initial'` 返回 store.init（最初的 atom 默认值），其他情况调用用户传的 ssr 函数
6. `deps = [store, keys]` —— `subscribe` 是 useCallback，依赖 store + keys 引用。如果同一个组件传不同 store，deps 变 → useCallback 重建 → React 检测到 subscribe 变化 → 重新订阅
7. 整个适配器**只做"桥接"**：不缓存值（snapshot 在 React 自己手里）、不管理订阅生命周期（由 React mount/unmount 触发 subscribe/unsub）、不做 batching（React 18 自动 batch）

对照 Vue 适配器（[@nanostores/vue use-store/index.js#L18-L35](https://github.com/nanostores/vue/blob/123606170ca0fa07cf7a3bfc377832730906c1ea/use-store/index.js#L18-L35)）：

```js
import { getCurrentScope, onScopeDispose, readonly, shallowRef } from 'vue'

export function useStore(store) {
  let state = shallowRef()

  if (typeof window !== 'undefined') {
    let unsubscribe = store.subscribe(value => {
      state.value = value
    })
    getCurrentScope() && onScopeDispose(unsubscribe)
  } else {
    state.value = store.get()
  }

  if (process.env.NODE_ENV !== 'production') {
    registerStore(store)
    return readonly(state)
  }
  return state
}
```

观察：

- 用 `shallowRef`（Vue 的非深度响应 ref）而不是 `ref`——atom 已经是不可变 set，不需要深度追踪
- `store.subscribe` vs React 用 `store.listen`——区别是 subscribe 立刻调一次 listener 和当前值。Vue 这边需要立刻给 `state.value` 一个值，所以用 subscribe
- SSR 路径不一样：Vue 适配器用 `typeof window` 区分客户端/服务端；React 适配器用 `useSyncExternalStore` 第三参数

Preact 适配器（[@nanostores/preact index.js](https://github.com/nanostores/preact/blob/4dd89c356299f3b7e5a973a445e06c16678bd32b/index.js)）走的是第三条路：`useState({})` + `forceRender` + 自己 setTimeout batch。因为 Preact 没有 useSyncExternalStore（早于 React 18 的 API）。三条路径都最终调到同一个 `store.listen`——这是 nanostores 框架解耦真正落地的地方。

第一处怀疑：
> Q: React 适配器为什么不用 `store.subscribe`（自带 listener 立刻调一次），要用 `store.listen` 然后手动 emit 一次？
>
> A: 因为 `store.subscribe(listener)` 会立刻同步调 `listener(store.value)`，但在 React 18 的 `useSyncExternalStore` 里，subscribe 函数是给 React 调的、必须返回 unsubscribe 函数。React 不期望 subscribe 同步触发 onChange——那会引发 inconsistent snapshot 的 warning。所以适配器用 `listen`（不立刻调）+ 自己手动 `emit(snapshotRef, onChange)(store.value)` 触发一次初始 emit，受 emit 里的 `=== snapshotRef.current` 守卫，第一次基本是 no-op。

## Layer 4 — 改一处：跨 React/vanilla 共用同一个 atom

最小复现：30 分钟跑通 + 验证"同一个 store 文件能在两个 framework 用"。

```bash
mkdir nanostores-play && cd nanostores-play
npm init -y
npm install nanostores @nanostores/react react react-dom
npm install -D typescript @types/react @types/react-dom
```

写一个**框架无关的** store 文件（关键：不 import 任何框架）：

```ts
// stores/counter.ts
import { atom, computed } from 'nanostores'

export const $count = atom(0)
export const $double = computed($count, count => count * 2)

// 业务逻辑放 store 文件，不在组件 inline
export function increment() {
  $count.set($count.get() + 1)
}
export function reset() {
  $count.set(0)
}
```

vanilla 用法（pure Node，不开浏览器）：

```ts
// vanilla.ts
import { $count, $double, increment } from './stores/counter'

console.log($count.get())   // 0
console.log($double.get())  // 0
increment()
console.log($count.get())   // 1
console.log($double.get())  // 2

// 订阅
const unsub = $double.listen((v, old) => {
  console.log(`double changed: ${old} -> ${v}`)
})
increment()  // log: double changed: 2 -> 4
unsub()
```

跑：`npx tsx vanilla.ts`，输出应该是 `0 0 1 2 double changed: 2 -> 4`。

React 用法（同一个 `$count`，不改 store 文件）：

```tsx
// App.tsx
import { useStore } from '@nanostores/react'
import { $count, $double, increment, reset } from './stores/counter'

export function App() {
  const count = useStore($count)
  const double = useStore($double)
  return (
    <div>
      <p>count: {count}, double: {double}</p>
      <button onClick={increment}>+1</button>
      <button onClick={reset}>reset</button>
    </div>
  )
}
```

跑 React 时 vanilla 那段也还在工作——你可以在浏览器里打开 React app 的同时，从 Node 引入 store 跑测试（虽然没意义，但说明 store 真的解耦了）。**实际意义**：这个 store 文件可以原样搬到一个 Astro Vue island 里，把 React 那行换成：

```vue
<script setup>
import { useStore } from '@nanostores/vue'
import { $count, increment } from '../stores/counter'
const count = useStore($count)
</script>
<template><button @click="increment">{{ count }}</button></template>
```

业务逻辑零变更——这就是 Layer 5 对比表里 nanostores "跨框架"那一列的实际含义。

具体改一处实验：把 `atom/index.js#L73`（`if (oldValue !== newValue)`）改成 `if (true)`，然后跑测试 `pnpm test`。预期：相同值连续 set 也会 notify，listener 被多调。这能直观感受到 atom set 那行严格相等的去抖作用——当 store 是 primitive 时这是必要优化，当 store 是 object 时这反过来要求你必须返回新对象（map 的 setKey 就是这么设计的）。

## Layer 5 — 横向对比

| 维度 | nanostores | [zustand](/projects/zustand/) | [valtio](/projects/valtio/) | [jotai](/projects/jotai/) | Redux Toolkit | Svelte writable |
|---|---|---|---|---|---|---|
| 状态形态 | 多个 atom（极小） | 单 store + selector | Proxy 包裹 mutable | 多个 atom | 单 store + slice | 单 writable store |
| 框架耦合 | **零**（core 不 import 框架） | 中（react-first，vanilla 是子集） | 中（vanilla 可，但 useSnapshot 是 React） | 高（vanilla 后剥的） | 中 | 高（绑 Svelte runtime） |
| 跨框架复用 | **是**（同一 store 文件给 React/Vue/Svelte） | 否（zustand vanilla 可，但生态都在 React） | 否 | 否 | 否 | 否 |
| 订阅粒度 | atom 级 + listenKeys | selector 返回值 | snapshot 字段（Proxy 自动） | atom 级 | selector | $store 整体 |
| 派生状态 | computed(\[deps\], fn) | 手写 selector | derive(proxy) | atom((get)=>...) | reselect | derived stores |
| 依赖追踪 | **静态**（显式 deps 列表） | 不追踪 | Proxy trap 自动 | 运行时收集（动态） | 不追踪 | 静态（derived 显式 deps） |
| Bundle | 294 B–831 B core | ~1 KB | ~3 KB | ~3.5 KB | ~10 KB | runtime 内置 |
| Devtools | 无（自己用 onSet） | redux-devtools 适配 | valtio-yjs 等 | jotai-devtools | redux-devtools 原生 | svelte-devtools |
| 心智模型 | 拆 atom + 函数业务逻辑 | selector 写好就行 | 像写 vanilla JS | atom 拆得对很重要 | reducer/action/slice | $store 自动订阅语法糖 |
| 适用规模 | 小 → 中（多框架/微前端友好） | 中 → 中大 | 小 → 中 | 中 → 中大 | 大（企业级） | Svelte 项目内 |
| 维护人 | Andrey Sitnik / Evil Martians | Daishi Kato | Daishi Kato | Daishi Kato | Redux 团队 | Svelte 团队 |

为什么 nanostores 和 jotai 是不同的"atomic"：

- jotai 的 atomic 是**订阅粒度** atomic——在 React render 树里把"组件订阅 store 的哪部分"做到 atom 级别
- nanostores 的 atomic 是**模块粒度** atomic——把 store 这个抽象做到不依赖任何框架，每个 atom 是独立、可单独 import、可单独 tree-shake 的小单元
- 所以 jotai 在大型 React 应用里更显效（避免 selector boilerplate），nanostores 在跨框架/微前端/Astro islands/Lit + Vue 混用场景更显效

什么场景选谁：

- **纯 React 中大型 app + 想要 atom 模型** → jotai
- **跨框架 / Astro islands / 微前端** → nanostores
- **小 vanilla JS 工具 + 想加状态层** → nanostores（< 1 KB 最小代价）
- **团队习惯 Redux 的 reducer/action 心智** → Redux Toolkit
- **想直接 mutate 状态** → valtio
- **Svelte-only 项目** → 内置 writable / derived 就够
- **极度 minimal、想要 vanilla + React 二选一** → zustand

## Layer 6 — 三段消化

### 今天就能用

- 学完 Layer 3a 的 atom 实现后，能跟人讲清楚"nanostores 是怎么用一个普通 object + listeners 数组实现 atom 的"——97 行没有黑盒
- 把 Layer 4 的双框架例子跑通，体感一下"同一个 store 文件给两个 framework 用"是怎么回事
- 在自己的 Astro / 微前端项目里，找一个被 React 组件和 Vue/Svelte 组件**共同**需要的状态（比如登录态、主题切换、购物车），重写成 nanostores atom，删掉之前的 prop drilling 或 customEvent 桥
- 复用 `globalThis.nanostoresGlobal` 这个 trick：你写库的时候如果担心被打包多份，把全局状态挂在 `globalThis.<yourLib>` 上比挂在 module-scope 变量上稳

### 下个月能用

- 阅读 [@nanostores/router](https://github.com/nanostores/router) 看路由也能写成 atom——这是把"URL 是状态"具体落地的实现
- 阅读 [@nanostores/persistent](https://github.com/nanostores/persistent) 看用 `onSet + localStorage` 怎么做持久化中间件——验证"middleware 不是 framework 内置功能，是 lifecycle 钩子的应用"
- 在自己的下一个 side project 里把"业务逻辑挪到 store 文件"这条 best practice 真的执行一次：组件只读 + 调函数，不直接 set。对比一下三个月后回来读哪种代码更好懂
- 用 [size-limit](https://github.com/ai/size-limit)（Sitnik 另一个项目）测自己项目的状态库占比，验证 < 1 KB 的实际工程意义

### 不要用的部分

- **不要**强行把 nanostores 套进纯 React 中大型应用（> 50 个 store）——atomic 模型在这种规模上 jotai 更顺，主要是 jotai 的 `useAtom` + `atom((get) => ...)` 在 React 上下文里更自然
- **不要**用 `computed` 写动态依赖（"if 分支选不同 store"）——computed 的依赖是静态列表，写 if 分支会有 bug；这种场景应该用 jotai 或者拆成两个 atom
- **不要**期待 devtools——nanostores 没有 redux-devtools 那种 time-travel + state diff 工具。调试靠 `onSet + console.log`，重型调试需求选 Redux Toolkit
- **不要**把 atom 当全局变量随意 mutate——`$store.value = ...` 在 dev 不会报错但不会 notify。一定走 `set()`。这是模型的硬约束
- **不要**滥用 `$store.get()`——README "Best Practices" 段建议组件外尽量少用 `get()`，因为它会触发 onMount/onStart 副作用（看 3a 的 self-bootstrap trick）。组件里用 `useStore`，组件外用 listen

## Layer 7 — 自检 + 延伸阅读

具体怀疑（追到行号）：

1. atom 的 `notify` 里 `runListenerQueue = !listenerQueue.length`，如果在嵌套 set（A.set 触发 listener 又调 B.set）的场景下，B 的 listener 是在 A 的 set 之前还是之后被调？追到 [atom/index.js#L46-L67](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/atom/index.js#L46-L67)，自己模拟 trace 一遍 listenerQueue 的内容
2. computed 的 `if (currentEpoch === nanostoresGlobal.epoch) return` 在多个 computed 链式依赖时（`$c = computed($a)`, `$d = computed($c)`）会不会出现"$d 没拿到 $c 的最新值"的 race？追到 [computed/index.js#L10-L34](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/computed/index.js#L10-L34)，构造一个最小复现验证
3. @nanostores/react 的 `useSyncExternalStore(subscribe, get, server)` 第二个参数 get 直接返回 `snapshotRef.current`——这个 ref 是 `useRef`，组件 unmount 后还存在吗？React 会调 get 几次？追到 [@nanostores/react index.js#L26](https://github.com/nanostores/react/blob/9ff3cac2225d4c9ead4c6186f253f791c01f590a/index.js#L26) 配合 React 18 useSyncExternalStore 文档
4. `lifecycle/index.js` 里所有 hook（onMount / onStop / onSet / onNotify）都用 "保存 origin + 替换 store 上的方法 + 返回 cleanup 恢复" 这个 pattern，**多个 hook 同时挂载**时谁包谁？追到 [lifecycle/index.js#L11-L34](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/lifecycle/index.js#L11-L34) 看 `events[eventKey + REVERT_MUTATION]` 的复用逻辑
5. `STORE_UNMOUNT_DELAY = 1000` 写在 [lifecycle/index.js#L115](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/lifecycle/index.js#L115)，意思是最后一个订阅者 unsubscribe 后还要延迟 1 秒才真正 unmount。这个 1000 是怎么定的？React StrictMode 双 mount 场景对它有什么影响？翻 issue tracker 找设计讨论

接下来读哪几个文件（按建议顺序）：

| # | 文件 | 回答什么问题 |
|---|---|---|
| 1 | [lifecycle/index.js](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/lifecycle/index.js)（160 行） | hook 系统（onMount/onSet/onStop/onNotify）是怎么不引入 EventEmitter 实现的 |
| 2 | [map/index.js](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/map/index.js)（23 行） | object atom 怎么用 spread + setKey 保持不可变性 |
| 3 | [listen-keys/index.js](https://github.com/nanostores/nanostores/blob/d703421c90965909b19165d7c5bcdf62db0c5b48/listen-keys/index.js) | 适配器层 useStore({ keys: [...] }) 是怎么落地到 listener 过滤的 |
| 4 | [@nanostores/persistent](https://github.com/nanostores/persistent)（独立 repo） | 用 onSet 实现 localStorage 持久化的标准 pattern |
| 5 | [@nanostores/router](https://github.com/nanostores/router)（独立 repo） | "URL 也是 atom" 的实际实现，atom + onMount + popstate |

## 限制 / 局限

- **没有内置 devtools**：调试靠手动 onSet + console.log，状态多了之后 trace 比 Redux DevTools 困难。如果你的团队习惯 time-travel debugger 这是减分项
- **computed 不支持动态依赖**：`computed([$a, $b], (a, b) => a > 0 ? a : b)` 这种条件分支始终订阅 `$a` 和 `$b` 两个；jotai 在 read 函数里 `get` 是动态的，这是 nanostores 静态列表方案的代价
- **嵌套 set 的执行顺序需要靠手写 listenerQueue 维护**：不是显式声明的状态机，而是依赖"outermost notify 消化全部 queue"的隐式约定。debug 嵌套 set 行为时容易踩坑（看 Layer 7 怀疑 1）
- **类型系统是手写 .d.ts 而非 tsc 生成**：意味着 .js 和 .d.ts 在某些边角可能不同步，发版时维护成本高（虽然这是 Sitnik 一贯习惯，size-limit 这么搞 8 年了没出过事，但新人 contributor 容易写错）
- **生态远小于 zustand / Redux Toolkit / jotai**：第三方 middleware/devtools/persistence 都得自己用 lifecycle 实现，社区现成方案不多。Astro 文档把 nanostores 列为推荐 store 库是它最大的生态拐点，但还远没到 Redux 生态那种规模
- **Svelte 适配器是"近似支持"**：Svelte 的 store contract 要求 `subscribe(fn) => fn(value); return unsub`，nanostores 的 subscribe 已经满足这个约定，所以可以 `import { $count } from './stores'` 然后 `{$$count}` 直接用。但 Svelte 自己的 writable 还有 update 函数 + start/stop notifier 这些细节，nanostores 不全等价

## 宣传 vs 现实

| README/blog 宣传 | 代码现实 | 差距 |
|---|---|---|
| "Between 294 and 831 bytes" | 实测 atom 单独大约 265 B (min+brotli)；加上 lifecycle、map、computed 全部包进去接近 800 B | 数字基本对得上，但要"全套使用"接近上限；"core only" 才是 < 300 B |
| "Tree Shakable" | `package.json` 用了 subpath exports，每个子目录是独立 entry，配 `sideEffects: false` 注释 + `@__NO_SIDE_EFFECTS__` JSDoc | 真的能 tree-shake，但前提是你的 bundler（Rollup/Vite/esbuild）支持这些 hint。webpack 4 时代不行 |
| "Designed to move logic from components to stores" | 没有任何代码强制——只是文档"Best Practices"段建议这么写 | 这是**一种风格指南**，不是机制约束。组件里 inline `$count.set($count.get()+1)` 完全合法但和 React useState 没区别 |
| "Many atomic stores and direct manipulation" | atom 真的多得起来；map.setKey 是"直接 manipulation"的形式 | 如果一个团队真的拆出 50+ atom，缺 devtools 会让维护成本上来——和 zustand 的"一个大 store + selector" 是真实的 trade-off，不是营销话术 |
| "Designed for React, Vue, Svelte, ..." | 跨框架是真的；但每个适配器**功能不等价**：React 有 `keys` 选项，Vue 没有；Preact 有自己的 batching，React 靠 useSyncExternalStore | 跨框架"形式"统一，"细节"不统一 |

## 元数据

- 升级日期：2026-05-29（v1.0 撰写）
- 总行数：约 460 行
- 项目类型：B 工具库（v1.1 默认分支）
- 启用工具：curl + cat -n（commit 锚定的源码抓取）、Pillow（架构图生成 → cwebp 压缩）、本地 Read 工具（文件检视）
- 参考 commit：
  - `nanostores/nanostores` @ `d703421c90965909b19165d7c5bcdf62db0c5b48`
  - `nanostores/react` @ `9ff3cac2225d4c9ead4c6186f253f791c01f590a`
  - `nanostores/vue` @ `123606170ca0fa07cf7a3bfc377832730906c1ea`
  - `nanostores/preact` @ `4dd89c356299f3b7e5a973a445e06c16678bd32b`
- 本笔记 figure 来源：架构图基于上述 commit 的源码结构手画（非 README 抄图）
