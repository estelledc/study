---
title: SolidJS — 细粒度响应式 UI 框架
来源: https://github.com/solidjs/solid
日期: 2026-08-27
分类: UI 框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/solidjs/solid
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a252c783b709e84e1e650a774d6cb52af7624ce7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.9.15
---

## 是什么

SolidJS 是一个用 JSX 写 UI、但把更新落到信号订阅而不是「整函数重跑」的库。日常类比：[[react]] 像每改一个菜名就重印整张菜单；Solid 只改那一行字——菜单函数本身不再执行。

```jsx
import { createSignal } from "solid-js";

function Hello() {
  const [name, setName] = createSignal("Ada");
  return <h1>你好，{name()}</h1>;
}
```

固定 1.9.15 的客户端 `createComponent` 在生产路径里执行 `untrack(() => Comp(props))`：`Hello` 当 setup 跑一次。`name()` 登记订阅；`setName` 走 `writeSignal`，默认 `===` 比较后把观察者标脏。

DOM 插入不在 `solid-js` 核心：`render` / `hydrate` / `<Dynamic>` / `<Portal>` 在 `solid-js/web`，底层是 `dom-expressions`。Node 默认 `main`/`module` 指向 `dist/server.*`。

## 为什么重要

不读这一版源码，这些说法会过期或说反：

- 为什么「组件函数只跑一次」对客户端成立，对 SSR `createComponent` 却不是同一条路径
- 为什么 `enableScheduling()` 不是默认并发——`Scheduler` 初始为 `null`，更新同步冲刷
- 为什么 1.9.15 的 `lazy()` 失败不再把 Suspense 挂死
- 为什么在 [[astro]] 里用 Solid 岛时，peer 写成 `solid-js ^1.9.13`

Solid 仍是理解「信号派」的钥匙；固定版本把调度、SSR 分发和错误边界写成了可核对的合同。

## 核心要点

1. **写信号 → 队列 → 计算重跑**。`writeSignal` 用默认 `equalFn`（`===`）决定是否通知。纯计算（`createMemo` / `createComputed`）进 `Updates`；不纯 effect 进 `Effects`。`runUserEffects` 先跑 `createRenderEffect`（`user` 为假），再跑 `createEffect`（`user: true`）。编译后的 JSX 文本绑定走 render effect，不是 VDOM diff。

2. **列表调和仍在**。「没有 diff」不成立：`For` 用 `mapArray` 按 item `===` 调和；`Index` 用 `indexArray` 固定下标、行内再开 signal。改对象身份会让 `For` 拆行重建。

3. **props 必须保持 getter**。顶层 `const { x } = props` 会丢掉响应式。`mergeProps` 后写覆盖、跳过 `undefined`，函数源会包成 memo。`splitProps` 在 `$PROXY` 路径按**第一组**认领重复 key（1.9.15 与非 proxy 路径对齐）。

4. **SSR 与客户端不是同一 runtime**。服务端 `createComponent` 直接 `Comp(props)`，没有 `untrack`；`startTransition` / `enableScheduling` 是空操作。`lazy()` 在 1.9.15 拒绝时会通知 Suspense/ErrorBoundary，并清掉缓存 promise，允许下次 `preload()` 重试。

## 实践示例

### 案例 1：计数器订阅的是 `count()`，不是组件重跑

```jsx
import { createSignal } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <button onClick={() => setCount((n) => n + 1)}>
      {count()}
    </button>
  );
}
```

`createSignal` 返回 `[Accessor, Setter]`。setter 收到函数一律当 `(prev) => next`；要存函数值必须再包一层。`{count}` 不调用 accessor，不会订阅，页面上只会看到函数本身。

### 案例 2：条件渲染用 `Show`，不要在函数体里 `if (count() > 5)`

```jsx
import { createSignal, Show } from "solid-js";

function Panel() {
  const [count, setCount] = createSignal(0);
  return (
    <button onClick={() => setCount((n) => n + 1)}>
      <Show when={count() > 5} fallback="还没到">
        超过 5
      </Show>
    </button>
  );
}
```

`Show` 的 condition memo 用真值相等（`!a === !b`）。组件函数不会因 `count` 变化重跑，函数体里的 `if` 只反映第一次的分支。`keyed` 才把 child 参数从 guarded accessor 换成原始值。

### 案例 3：`splitProps` 重复 key 归第一组

```jsx
import { splitProps } from "solid-js";

function Box(props) {
  const [visual, rest] = splitProps(props, ["class"], ["class", "id"]);
  return <div class={visual.class} id={rest.id} />;
}
```

固定 1.9.15 里，`class` 只进入第一组 `visual`；第二组拿不到它。这是为了让 `$PROXY` 路径与普通对象路径一致。跨组重复声明时按这个合同读，不要假设后面的组能再拿到同名属性。

## 踩过的坑

1. **用 React 的「重渲染」读 Solid**：客户端生产路径组件函数不重跑。派生与 DOM 更新发生在 memo / effect 里。SSR 路径不同，不能把客户端句子抄到 server bundle。

2. **解构 props**：`const { x } = props` 得到一次快照。要写 `props.x`，或 `splitProps` / `mergeProps`。

3. **把 `<Dynamic>` 当成 core 导出**：它在 `solid-js/web`。从 `solid-js` 默认入口拿不到。

4. **假设默认就是 concurrent**：只有调用 `enableScheduling()` 才把 `Scheduler` 换成 `requestCallback`。测试里常见 `enableScheduling(null)` 关回同步。

5. **把 1.9.13 tag 当成 npm latest**：npm `1.9.15` 对应版本 bump 提交 `a252c783...`；GitHub 在审查时没有 `v1.9.15` tag。

## 适用 vs 不适用场景

**适用**：

- 需要细粒度订阅的交互界面，并且团队接受「setup 一次」心智
- 作为 [[astro]] 岛——同 pin 的 `@astrojs/solid-js` peer 正好是 `^1.9.13`
- 想对照 Vue `ref` / Svelte `$state` / Angular `signal` 的信号模型

**不适用**：

- 必须直接复用 React 生态（RHF、多数 headless UI）——Solid 有自己的端口，数量少很多
- 把「无 diff、无 runtime 结构」写成绝对句——`For`/`Index` 有调和，信号图和 transition `tValue` 都在
- 需要已发布 Git tag 与 npm 版本严格三方一致，又不能接受「无 `v1.9.15` tag」这条 provenance 缺口
- 静态营销页且没有任何客户端状态——用 [[astro]] 不加水合即可

## 固定版本边界

- 本文绑定 `solidjs/solid@a252c783b...`，`packages/solid/package.json` 为 `1.9.15`。
- npm latest 同为 `1.9.15`，但未暴露 `gitHead`；canonical 仓库没有 `v1.9.14` / `v1.9.15` tag。最近稳定 tag 是 `v1.9.13`（剥皮 `3be495ce...`）。
- 核心依赖是 `csstype`、`seroval`、`seroval-plugins`；DOM API 在 `solid-js/web`。
- 1.9.15 changelog 还提到 `createSelector` 的 transition 行为与 `enableExternalSource` 在 transition 后重新订阅；本文未展开这两条。
- 未安装依赖、未跑上游测试或 JS Framework Benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **JSX 不是 React**——同样的尖括号，编译器可以生成「一次 setup + 精确订阅」。
2. **默认同步，并发是开关**——`enableScheduling` 改变的是队列如何被推迟，不是信号语义本身。
3. **SSR 分发必须单独读**——server entry、transition stub 和 `lazy` 错误路径与浏览器 bundle 不一致。
4. **版本锚点可以缺 tag**——包版本与 bump commit 一致仍可绑定，但必须把缺失 tag 写进边界，不能补一个不存在的 `v1.9.15`。

## 应用型自测

1. 客户端生产路径里，`setCount(1)` 会让组件函数 `Counter` 再执行一次吗？
2. `splitProps(props, ["class"], ["class", "id"])` 之后，第二组还能读到 `class` 吗？
3. 未调用 `enableScheduling()` 时，一次 `setCount` 会等到 `requestIdleCallback` 才冲刷 effect 吗？

检查点：

1. 不会。生产路径是 `untrack(() => Comp(props))`，重跑的是订阅了 `count` 的计算，不是 `Counter` 本身。
2. 不能。1.9.15 规定重复 key 归第一组。
3. 不会。默认 `Scheduler` 为 `null`，`completeUpdates` 同步跑完 `Updates` 与 `Effects`。

## 延伸阅读

- 官方文档：[solidjs.com](https://www.solidjs.com)
- 固定源码：[solidjs/solid](https://github.com/solidjs/solid) —— 本文绑定提交 `a252c783b709e84e1e650a774d6cb52af7624ce7`
- [[astro]] —— 同批次对照的 metaframework；Solid 在那里是可选岛
- [[react]] —— 相同 JSX、相反执行模型
- [[vue]] —— `ref` / 依赖追踪的另一条工业实现

## 关联

- [[react]] —— 重渲染 vs 细粒度订阅
- [[vue]] —— 信号心智的近亲
- [[astro]] —— `@astrojs/solid-js` 把本库嵌进岛
- [[vite]] —— Solid 编译插件通常挂在 Vite 上；本 pin 未审查 SolidStart
- [[mobx]] —— 寄生在重渲染框架上的信号派
- [[tanstack-query]] —— 有 `@tanstack/solid-query` 端口，不在本次源码范围

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[parnas-information-hiding-1972]] —— Parnas 信息隐藏 1972 — 模块化设计原则
- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[qwik]] —— Qwik — Resumable UI 框架
- [[svelte]] —— Svelte — 编译时 UI 框架
