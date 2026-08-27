---
title: redux-observable — 用 RxJS epic 接 Redux 5 的副作用中间件
description: 固定 3.0.0-rc.3 的 run、reducer-先行与 ofType 边界。
来源: https://github.com/redux-observable/redux-observable
日期: 2026-08-27
分类: 状态管理
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/redux-observable/redux-observable
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a544c2d6aa99b8546e089da94bbf5bbef69d08cd
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.0-rc.3
---

## 是什么

redux-observable 是 Redux 中间件：把每一次已处理的 action 推进一条 [[rxjs]] 流，由 epic 再产出要 `dispatch` 的新 action。日常类比：像邮局分拣台——柜员（reducer）先盖章入库，分拣员（epic）再根据运单决定要不要续寄；续寄的包裹必须还是同一套运单格式。

你写：

```ts
import { createEpicMiddleware, combineEpics, ofType } from "redux-observable";
import { createStore, applyMiddleware } from "redux";
import { map, catchError } from "rxjs/operators";
import { of } from "rxjs";

const pingEpic = (action$) =>
  action$.pipe(
    ofType("PING"),
    map(() => ({ type: "PONG" })),
    catchError(() => of({ type: "PING_FAILED" })),
  );

const epicMiddleware = createEpicMiddleware();
const store = createStore(reducer, applyMiddleware(epicMiddleware));
epicMiddleware.run(combineEpics(pingEpic));
```

固定 3.0.0-rc.3 的 peer 是 `redux@>=5 <6` 与 `rxjs@>=7 <8`。根 epic 不再传给 `createEpicMiddleware`，必须在 store 建好后 `run`。

## 为什么重要

不理解这条中间件，下面这些事都没法解释：

- 为什么 epic 里读到的 `state$` 已经是本次 action 之后的 state
- 为什么 `createEpicMiddleware(rootEpic)` 会在非生产环境直接抛错
- 为什么 `ofType` 对普通对象可能过滤失败
- 为什么连续 `run` 两次不会自动停掉上一个 root epic

## 核心要点

主链可以拆成五步：

1. **建中间件**：`createEpicMiddleware({ dependencies })` 造一条独立的 `QueueScheduler`，避免和业务代码抢同一条 Rx 队列。
2. **接入 store**：中间件闭包拿到 `store`，再构造 `action$` 与带 `.value` 的 `StateObservable`。
3. **先下游、后入流**：`next(action)` 先走完后续中间件和 reducer；然后 `stateSubject$.next(store.getState())`，再 `actionSubject$.next(action)`。
4. **跑 epic**：`epic$.pipe(map, mergeMap)` 订阅 root epic 的输出，结果直接 `store.dispatch`。`mergeMap` 不会因下一次 `run` 取消上一次。
5. **组合与过滤**：`combineEpics` 用 `merge` 并行；`ofType` 先 `isAction`，再比 `action.type`。

`Epic` 类型要求输出 action 仍属于输入 action 集合：`Output extends Input`。`state$` 只在 `!==` 时通知，并在订阅时先推当前 `.value`。

## 实践示例

### 案例 1：必须先 createStore，再 run

```ts
const epicMiddleware = createEpicMiddleware({ dependencies: { api } });
const store = createStore(rootReducer, applyMiddleware(epicMiddleware));
epicMiddleware.run(rootEpic);
```

把 `rootEpic` 传进 `createEpicMiddleware(...)` 在非生产环境会抛 `TypeError`。`run` 若发生在 `applyMiddleware` 之前，只会警告，epic 还没接到 store。

### 案例 2：epic 看到的是 reducer 之后的 state

```ts
const debugEpic = (action$, state$) =>
  action$.pipe(
    ofType("INCREMENT"),
    map(() => ({ type: "LOG", n: state$.value })),
  );
```

因为 `next(action)` 在入流之前，`state$.value` 已含本次 `INCREMENT`。若要“触发前的快照”，必须自己在 epic 外保存。

### 案例 3：ofType 依赖 Redux 5 的 isAction

```ts
action$.pipe(ofType("LOAD"));
store.dispatch({ type: "LOAD" });
store.dispatch({ kind: "LOAD" } as any);
```

第二下没有 `type` 字段时，`isAction` 为假，`ofType` 直接丢掉。不要以为任意对象都能当 action。

## 踩过的坑

1. **把 v2 的构造函数签名搬过来**：3.x 只接受 `options`，root epic 改走 `run`。
2. **把 `run` 当成可替换的 switch**：`epic$` 走 `mergeMap`，两次 `run` 会并行各订一份。
3. **在 epic 里再 dispatch 同一个 `ofType` 而不收口**：输出会再次进入中间件，容易打环。
4. **以为 `combineEpics` 会取消兄弟 epic**：它是 `merge`，彼此不退订。
5. **把 Redux 4 / RxJS 6 的旧 peer 当成仍有效**：本标签要求 Redux 5 与 RxJS 7。

## 适用 vs 不适用场景

**适用**：

- 已经用 Redux 5，并且副作用天然是可取消的流
- 多个 epic 要共享 `action$` / `state$` / `dependencies`
- 团队已经熟悉 [[rxjs]] 的 `switchMap` / `catchError`

**不适用**：

- 还在 Redux 4——那是 `redux-observable@2.0.0` 的 peer，不是本页
- 只要同步 store，不需要 action 流——看 [[zustand]] / [[valtio]]
- 想把副作用画成状态图——看 [[xstate]]
- 不能接受 npm latest 仍是 RC：3.0.0-rc.3 尚未标稳定版

## 固定版本边界

- 本文绑定 `redux-observable/redux-observable@a544c2d6...`，tag `v3.0.0-rc.3` 与 npm latest `gitHead` 一致。
- 访问当日 `main` HEAD `847e7e08...` 新于本 tag，是文档现代化 PR，未当作发布合同。
- 上一份非 RC 标签是 `v2.0.0`（commit `57368e9b...`，peer `redux@>=4 <5`），API 与本页不同。
- 本文未安装依赖、未跑 vitest、未接真实 store，状态保持 `UNVERIFIED`。

## 学到什么

1. **中间件顺序即时间顺序**——reducer 先写，epic 后看，这是源码里写死的。
2. **run 是启动阀，不是替换阀**——`mergeMap` 让多次 `run` 叠在一起。
3. **类型边界就是 action 边界**——epic 吐出的必须还能再被本 store 吃掉。
4. **过滤函数会先问“这是不是 action”**——`ofType` 不是单纯的字符串 includes。

## 应用型自测

1. 非生产环境把 root epic 传给 `createEpicMiddleware(rootEpic)`，会怎样？
2. epic 处理 `SET` 时读 `state$.value`，看到的是 reducer 之前还是之后？
3. 对同一中间件连续 `run(epicA)`、`run(epicB)`，`epicA` 会自动退订吗？

检查点：

1. 抛 `TypeError`，提示改用 `epicMiddleware.run`。
2. 之后。`next(action)` 先执行。
3. 不会。`epic$` 使用 `mergeMap`。

## 延伸阅读

- 文档：[redux-observable.js.org](https://redux-observable.js.org/)
- 固定源码：[redux-observable/redux-observable](https://github.com/redux-observable/redux-observable) —— 本文绑定提交 `a544c2d6aa99b8546e089da94bbf5bbef69d08cd`
- [[rxjs]] —— `action$`、调度器和操作符的真正实现
- 迁移说明：仓库内 `MIGRATION.html` 对应的 `run` 安装方式
- [[xstate]] —— 若取消语义要用状态图而不是 epic

## 关联

- [[rxjs]] —— 强制 peer；没有它就没有 epic
- [[react]] —— 常见 UI 宿主，不负责取消 HTTP
- [[zustand]] —— 更短的同步 store 路径
- [[xstate]] —— 显式机器 vs action 流
- [[mobx]] —— 隐式追踪，不走 action 中间件
