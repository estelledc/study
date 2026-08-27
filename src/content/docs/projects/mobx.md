---
title: MobX — 让 state 像电子表格一样自动重算
来源: https://github.com/mobxjs/mobx
日期: 2026-05-30
分类: projects
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

MobX 是一个 JavaScript 反应式状态库：你像改普通对象那样写字段，派生值和 UI 在下次被拉到时按依赖重算。日常类比：电子表格——改 A1，所有读过 A1 的公式格变脏，但只有真的再打开那一格时才重算。

你写：

```js
import { makeAutoObservable, autorun } from "mobx";

const counter = makeAutoObservable({ n: 0 });
autorun(() => {
  console.log("n =", counter.n);
});
counter.n++; // 在 action / autoAction 边界内才会被默认严格模式接受
```

固定 `mobx@7.0.3` 的默认 `enforceActions` 是 `true`（observed），`allowStateChanges` 默认 `false`。有观察者的字段在开发模式里若在 action 外修改，会警告。

## 为什么重要

不理解 MobX，下面这些事都没法解释：

- 为什么不用手写依赖数组，render 期间读到的字段却能在下次写入时触发更新
- 为什么 v7 默认不允许“随手改被观察字段”，必须走进 action / autoAction / `runInAction`
- 为什么没人订阅的 `computed` 不会长期缓存
- 为什么 `observer` 组件漏包时只是不刷新，而不是编译失败

## 核心要点

固定版本的反应式核可以拆成五步：

1. **Atom**：每个 observable 字段挂一个 `Atom`。读时 `reportObserved()`，写时 `reportChanged()` → `startBatch` / `propagateChanged` / `endBatch`。

2. **Derivation**：`computed` 和 `Reaction`（`autorun`、`reaction`、observer 的 render）都是 derivation。它们维护 `NOT_TRACKING` / `UP_TO_DATE` / `POSSIBLY_STALE` / `STALE` 四态：上游变了先标脏，被读到再决定是否重算。

3. **全局指针 `trackingDerivation`**：`trackDerivedFunction` 跑 derivation 前把“当前谁在算”写入 `globalState.trackingDerivation`；Atom 被读时把对方登记进 `observers_`。函数结束指针清掉。这就是隐式依赖收集。

4. **批量边界**：`action` / `runInAction` / `autoAction` 用 `startBatch`/`endBatch` 合并通知。`makeAutoObservable` 把原型上的普通方法标成 `autoAction`，generator 标成 `flow`，getter 标成 `computed`，其余自有字段标成 `observable`。

5. **React 订阅**：固定 `mobx-react-lite@5.0.3` 的 `observer` 用 `Reaction.track` 包 render，再用 `useSyncExternalStore` 订阅 `stateVersion`。漏包 `observer` 不会在编译期失败，只是读过的 Atom 没有对应 Reaction。

## 实践示例

### 案例 1：类字段在构造时一次性标注

```ts
import { makeAutoObservable } from "mobx";

class Counter {
  n = 0;
  constructor() {
    makeAutoObservable(this);
  }
  inc() {
    this.n++;
  }
  get double() {
    return this.n * 2;
  }
}
```

`makeAutoObservable` 只处理调用当下 `ownKeys(target)` 与原型上已有的键，并缓存在原型的 `Symbol("mobx-keys")` 上。开发模式禁止用于“已有父类”的 class，也禁止对已经是 observable 的对象再调一次。构造之后才挂上去的字段不会自动变成 Atom。

### 案例 2：React 里用 observer 建立 Reaction

```tsx
import { observer } from "mobx-react-lite";

const View = observer(function View() {
  return <div>{counter.double}</div>;
});
```

`observer` 内部是 `useObserver`：先挂 `useSyncExternalStore`，再 `reaction.track(render)`。只有这次 render 真正读到的 observable / computed 会成为依赖。静态渲染模式（SSR 开关）下它会直接跑原组件，不再建 Reaction。

### 案例 3：await 之后必须重新进入 action

```ts
import { runInAction, flow } from "mobx";

async function loadUser(store) {
  const data = await fetch("/api/me").then((r) => r.json());
  runInAction(() => {
    store.name = data.name;
  });
}

const load = flow(function* (store) {
  const data = yield fetch("/api/me").then((r) => r.json());
  store.name = data.name; // flow 把 generator 的续步包进新的 action
});
```

`autorun(async () => { await fetch(); store.foo })` 里，await 之后已经不在原来的 `trackingDerivation` 里，读不会建依赖，写也不在同一个 action 批次。`flow` 把每次 `yield` 后续步包成新的 action。

## 踩过的坑

1. **v7 默认严格写**：`enforceActions: true` 时，被观察字段在 action 外修改会在开发模式警告。旧教程里的“随手 `state.n++`”不再是默认合同。

2. **漏包 `observer` 只是不更新**：控制台不一定报错。这是订阅缺失，不是静默吞异常。

3. **无人订阅的 computed 不长期缓存**：源码写明：离开 batch 且没有 observer 时重置，下次访问当第一次算。循环里反复读未观察 computed 会重复执行。

4. **后加字段不会自动变成 Atom**：`makeAutoObservable` 只认调用时已经存在的键。要动态键用 `observable.map`，或先声明 `undefined` 占位。

5. **`observer(React.memo(fn))` 会被拒绝**：`observer` 自己已经套 `memo`，再包一层会抛错。

## 适用 vs 不适用场景

**适用**：

- 字段多、派生关系绕的编辑器、看板、复杂表单本地模型
- 想保留命令式赋值，但需要按实际读取粒度更新 UI
- 已经用 `makeAutoObservable` + action/`flow` 管副作用边界的 React 18/19 项目

**不适用**：

- 需要把所有转移画成可审查状态图——见 [[xstate]]
- 需要不可变 snapshot / 时间旅行作为一等合同——Immer + reducer 更直接
- 团队不能接受隐式依赖收集，或不能在 v7 默认 `enforceActions` 下维护 action 边界
- 还停留在 React 16/17 且依赖旧 `mobx-react-lite` 合同——固定 5.0.3 的 peer 是 React 18 或 19

## 固定版本边界

- 本文绑定 `mobxjs/mobx@5dbb04a1...`。GitHub tag `mobx@7.0.3` 剥开后与 npm `gitHead` 同为该提交；`packages/mobx` 报 `7.0.3`，`packages/mobx-react-lite` 报 `5.0.3`。
- 默认 `enforceActions` 为 `true`（observed），不是 `never`。
- `mobx-react-lite` peer 为 `mobx@^7` 与 `react@^18 || ^19`。
- 本文未安装依赖、运行上游 Jest、浏览器渲染或性能 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **隐式依赖 = 全局指针 + try/finally**——Atom 不需要你申报“我依赖谁”，它只登记当时正在跑的 derivation。
2. **脏标记和取值是两条时间线**——写入先传播 `STALE` / `POSSIBLY_STALE`，真正重算发生在下一次 `get()` / Reaction 跑起来时。
3. **v7 把“能写”收进 action**——默认严格写是源码默认值，不是文档口吻。
4. **React 绑定是外部 store 合同**——`useSyncExternalStore` 负责订阅版本号，`Reaction.track` 负责收集这一帧读过的字段。

## 应用型自测

1. 固定 7.0.3 默认配置下，一个已被 `autorun` 读过的字段在普通函数里直接赋值，开发模式是否一定静默成功？
2. `const x = store.derived` 在没有任何 reaction/observer 订阅 `derived` 时，连续读两次会不会复用上一次缓存？
3. 构造后再执行 `this.extra = 1`，`makeAutoObservable` 已经在 constructor 调过，`extra` 会不会自动变成 observable？

检查点：

1. 不一定静默。默认 `enforceActions: true`，对已观察字段的 action 外写入会在开发模式警告。
2. 不会按“长期缓存”保证。未观察的 computed 在离开 batch 后会重置。
3. 不会。它只标注调用时已经存在的键。

## 延伸阅读

- 文档：[mobx.js.org](https://mobx.js.org/)
- 固定源码：[mobxjs/mobx](https://github.com/mobxjs/mobx) —— 本文绑定提交 `5dbb04a15f7eb0ef6b844904c43955357a9bbdfc`
- 设计说明：[The fundamental principles behind MobX](https://hackernoon.com/the-fundamental-principles-behind-mobx-7a725f71f3e8)
- [[xstate]] —— 显式状态图，和隐式依赖收集对照
- [[immer]] —— 同一作者的不可变草稿路线

## 关联

- [[xstate]] —— 显式画合法转移；MobX 不阻止非法组合，只追踪实际读过的字段
- [[immer]] —— Proxy 用于草稿拷贝，不用于依赖收集
- [[react]] —— `mobx-react-lite` 把 Reaction 接到 `useSyncExternalStore`
- [[tanstack-form]] —— 显式订阅 selector 的表单状态，对照隐式收集

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[plane]] —— Plane — 开源版 Linear/Jira，把任务、冲刺和协同文档放进自己的机器
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[solid]] —— SolidJS — 细粒度响应式 UI 框架
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来
