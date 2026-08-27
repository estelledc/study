---
title: Pinia — Vue 官方商店：一份根状态树上的懒创建 store
description: Vue 官方商店：根状态树上按 id 懒创建 store
来源: https://github.com/vuejs/pinia
日期: 2026-08-27
分类: 状态管理
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vuejs/pinia
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5d6ac5b86491041aa83a663a9a31189c707aff08
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.3
---

## 是什么

Pinia 是 Vue 官方的**客户端商店**：一份根状态树，上面挂着按 id 懒创建的 store。日常类比：像一栋公寓的总电表箱——`createPinia()` 先装箱子，`defineStore('cart', …)` 只是画好某户线路图，第一次 `useCartStore()` 才真正合闸。

```ts
import { createPinia, defineStore } from 'pinia'
import { createApp } from 'vue'

const useCounter = defineStore('counter', {
  state: () => ({ n: 0 }),
  getters: { doubled: (s) => s.n * 2 },
  actions: { inc() { this.n++ } },
})

const app = createApp({})
app.use(createPinia())
```

组件里调用 `useCounter()` 拿到的是同一个响应式对象：改 `store.n` 或调 `store.inc()`，读过它的视图会跟着更新。固定 4.0.3 不再声明 Vue 2 peer；`packages/pinia/package.json` 要求 `vue@^3.5.11`。

## 为什么重要

不理解 Pinia 的根树 + 懒创建，下面这些事会对不上：

- 为什么 Vue 3 文档把 Pinia 写成官方商店，而不是继续扩 Vuex 模块协议
- 为什么 Options store 和 Setup store 看起来像两套 API，运行时却汇合到同一个 `createSetupStore`
- 为什么 SSR 能把 `pinia.state.value` 整棵序列化再灌回去，但 setup store 里返回的 router 必须 `skipHydrate`
- 为什么解构 `const { n } = store` 会丢掉响应性，而 `storeToRefs(store)` 不会

一句话：Pinia 把「Vue 响应式对象」当成商店，而不是另做一套 action/reducer 总线。

## 核心要点

固定源码里，主链可以拆成四步：

1. **`createPinia()` 只建容器**：`effectScope(true)` + `ref({})` 根状态 + `Map` 存活 store + 插件队列。`install` 时 `setActivePinia`、`provide(piniaSymbol)`，并把 `app.config.globalProperties.$pinia` 挂上；`use(plugin)` 在 `app.use` 之前只入队。

2. **`defineStore` 是工厂，第一次 `useStore()` 才创建**：从 injection / `activePinia` 取实例，没有对应 id 就走 `createOptionsStore` 或 `createSetupStore`，结果缓存进 `pinia._s`。没 `app.use(pinia)` 时，开发构建会抛「getActivePinia() was called but there was no active Pinia」。

3. **Options 编译成 Setup**：`state()` 写入 `pinia.state.value[id]`，getter 变成 `computed` 并以 store 为 `this` 调用，action 原样进入 setup 返回值。Setup store 则把返回的 ref / reactive 同步到根树，函数用内部 `action()` 包一层，好让 `$onAction` 看到 `after` / `onError`（Promise 也会接上）。

4. **补丁、订阅、水合是显式边界**：`$patch` 可接收变更函数或部分对象，先暂停 `$subscribe` 的 watch，再 `mergeReactiveObjects`（Map / Set 会 `set` / `add`），然后手动触发订阅。`$reset` 只对 Options store 调用 `state()` 再 `$patch`；Setup store 在开发构建抛错，生产是空操作。`skipHydrate(obj)` 给对象打符号，水合时跳过。

`storeToRefs` 遍历 `toRaw(store)`：带 `.effect` 的做成可写 computed，ref / reactive 用 `toRef`，方法直接丢掉。

## 实践示例

### 案例 1：Options store 的 state / getter / action

```ts
const useCart = defineStore('cart', {
  state: () => ({ items: [] as string[] }),
  getters: { size: (s) => s.items.length },
  actions: { add(name: string) { this.items.push(name) } },
})
```

**逐部分**：`state` 必须是工厂，每次 `$reset` 才拿得到新对象；getter 读的是解包后的 state；action 里的 `this` 就是那个 reactive store，不是单独的 context。

### 案例 2：Setup store 与 skipHydrate

```ts
import { ref } from 'vue'
import { defineStore, skipHydrate } from 'pinia'

const useSession = defineStore('session', () => {
  const token = ref('')
  const router = skipHydrate({ current: '/' })
  function signIn(value: string) { token.value = value }
  return { token, router, signIn }
})
```

**逐部分**：`token` 是 state，会进 `pinia.state.value.session`；`router` 有 `skipHydrate` 符号，SSR 回灌时 `shouldHydrate` 为假；`signIn` 被标成 action，可被 `$onAction` 拦截。

### 案例 3：storeToRefs 保住响应性

```ts
const store = useCart()
const { items, size } = storeToRefs(store)
store.add('book') // items / size 仍是 ref，模板解包后会更新
```

**逐部分**：直接 `const { items } = store` 取出的是当下值，不再追踪。`storeToRefs` 只导出状态和 getter。

## 踩过的坑

1. **先用 store 再 `app.use(pinia)`**：开发构建直接抛错；组件外调用必须先 `setActivePinia`，SSR 尤其如此。
2. **Setup store 没有 `$reset`**：开发构建抛「does not implement $reset()」。要重置就自己写，或改 Options 语法。
3. **解构丢响应性**：方法可以解构，state / getter 必须 `storeToRefs` 或始终写 `store.n`。
4. **`$patch` 的 Map / Set**：对象补丁对 Map 调 `set`、对 Set 调 `add`，不会整棵替换；水合时 setup store 会先 `clear()` 再合并。
5. **把非 state 对象当 state 序列化**：setup store 返回的 router / 客户端句柄必须 `skipHydrate`，否则 SSR 状态树会带上不可序列化的东西。

## 适用 vs 不适用场景

**适用**：

- Vue 3.5+ 应用，要官方商店而不是自己拼 provide / inject
- 需要 Options 与 Composition 两套写法共享同一份根状态树
- SSR / Nuxt 一类要把 `pinia.state.value` 整棵脱水再水合的场景
- 用 `pinia.use` 给每个 store 加 persist、日志等插件

**不适用**：

- 还停在 Vue 2：固定 4.0.3 的 peer 是 `vue@^3.5.11`，没有 Vue 2 通道
- 想要「先 dispatch，再纯函数算出下一份 state」的显式总线——那是 [[redux-toolkit]] 的合同
- 主要状态其实是服务端缓存：先看 TanStack Query，不要把请求当商店字段
- 只要一个跨框架 atom，核心不能依赖 Vue：那是 nanostores 的切法

## 固定版本边界

- 本文绑定 `vuejs/pinia@5d6ac5b8...`，即 annotated tag `v4.0.3` 剥出的提交；`packages/pinia` 版本为 `4.0.3`。
- npm `pinia@4.0.3` 未暴露 `gitHead`，因此只绑定 GitHub tag 提交，不伪造 npm 与 tag 的第二来源对齐。
- peer：`vue@^3.5.11`；`@vue/devtools-api@^8.1.5` 为必选 peer；`typescript>=5.6.0` 可选。依赖 `nostics`（构建时内联）。
- `$reset`、HMR、devtools 若干诊断只在开发构建生效；生产 Setup store 的 `$reset` 是空函数。
- 本文未安装依赖、未跑上游测试或 SSR，状态保持 `UNVERIFIED`。

## 学到什么

1. **官方商店可以是「响应式对象 + 根树」**，不必先发明 action 类型字符串
2. **懒创建**让 `defineStore` 可以安全 tree-shake，真正的副作用发生在第一次 `useStore`
3. **同一套 setup 运行时**消化了 Options / Setup 两种表面语法，差异只在 `$reset` 和水合
4. **能序列化的才是 state**：`skipHydrate` 把「碰巧返回的对象」和「要脱水的状态」切开

## 应用型自测

1. Options store 的 `$reset` 会重新调用 `state()` 吗？Setup store 呢？
2. `$patch({ items: [...] })` 执行期间，`$subscribe` 的 watch 会立刻为中间赋值触发吗？
3. setup store 返回的 `router` 不想被 SSR 回灌，应该用哪个 API？

检查点：

1. 会。它用 `state()` 的新对象走 `$patch`。Setup store 在开发构建抛错，生产为空操作。
2. 不会。`$patch` 先把 listening 关掉，合并后再手动 `triggerSubscriptions`。
3. `skipHydrate(router)`。`shouldHydrate` 看到该符号就跳过。

## 延伸阅读

- 官方文档：[pinia.vuejs.org](https://pinia.vuejs.org)
- 固定源码：[vuejs/pinia](https://github.com/vuejs/pinia) —— 本文绑定提交 `5d6ac5b86491041aa83a663a9a31189c707aff08`
- [[redux-toolkit]] —— 对照：显式 action + Immer reducer，而不是直接改响应式对象
- Vue 3.5.11 —— Pinia 4 的 peer 下限，固定 `package.json` 如此声明

## 关联

- [[redux-toolkit]] —— 同主题另一端：不可变更新 + thunk，而不是 store.n++
- Vue 3.5 —— `createPinia` 的 install / provide / effectScope 都建立在这份 peer 上
- Zustand —— React 侧同样把 state 和 action 写在一个对象里，但没有 Vue 的根 effectScope
- nanostores —— 框架无关 atom，核心不 import Vue
- TanStack Query —— 服务端缓存不应塞进 Pinia state

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
