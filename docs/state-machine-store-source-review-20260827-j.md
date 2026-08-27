# State machine / store source review (writer J)

> 用途：记录 XState、MobX 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。
>
> 选题：目标 slug 为 `xstate` 与 `redux-toolkit`（或 `redux`）。仓库 961 个项目页中不存在 `redux-toolkit` / `redux`，因此按授权 fallback 取状态管理主题组内的另一条 store 路线 `mobx`。未改 `zustand` / `jotai` / `valtio`。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## XState

- canonical source：`https://github.com/statelyai/xstate`
- revision：`21872cdc93a3baddbcf43f1d83553991d39f28ab`
- package：`xstate@5.32.6`（`packages/core`）
- companion at same revision：`@xstate/react@6.1.0`
- inspected：
  - `packages/core/package.json`
  - `packages/core/src/index.ts`
  - `packages/core/src/createMachine.ts`
  - `packages/core/src/createActor.ts`
  - `packages/core/src/setup.ts`
  - `packages/core/src/Mailbox.ts`
  - `packages/core/src/StateMachine.ts`
  - `packages/core/src/stateUtils.ts`
  - `packages/core/src/State.ts`
  - `packages/core/src/actions/assign.ts`
  - `packages/core/src/system.ts`
  - `packages/xstate-react/package.json`
  - `packages/xstate-react/src/index.ts`
  - `packages/xstate-react/src/useActor.ts`
  - `packages/xstate-react/src/useMachine.ts`
- observed：
  - `createMachine` constructs `StateMachine` implementing `ActorLogic`; `createActor` constructs `Actor` with a mailbox and an implicit root system;
  - `setup({ actors, actions, guards, delays }).createMachine(config)` forwards implementations into `createMachine`; the second argument of `createMachine` is documented as DEPRECATED in favor of `setup` or `machine.provide()`;
  - the constructor of `Actor` already calls `logic.getInitialSnapshot()` (or `restoreSnapshot`), so `getSnapshot()` is populated before `start()`;
  - `start()` sets `ProcessingStatus.Running`, runs `logic.start`, notifies observers, then `mailbox.start()`; events enqueued before start flush at that point;
  - `send` relays through the actor system into `_send` → `mailbox.enqueue`; `_process` calls `logic.transition`; unmatched events yield `microstep([])` which returns the current snapshot;
  - `assign` builds `Object.assign({}, snapshot.context, partialUpdate)` and `cloneMachineSnapshot`;
  - `useMachine` is a deprecated alias of `useActor`; `useActor` uses `useSyncExternalStore` and starts the actor in `useEffect`; passing an ActorRef throws in development;
  - child actors reuse the parent system and cannot call `stop()` on themselves.
- provenance note：
  - npm `xstate@5.32.6` does not expose `gitHead` (changeset tarball);
  - GitHub tag `xstate@5.32.6` is a lightweight tag pointing at `21872cdc93a3baddbcf43f1d83553991d39f28ab`, whose `packages/core/package.json` reports `5.32.6`;
  - `xstate@6.0.0-alpha.*` tags exist; this review binds the 5.32.6 stable tag.

## MobX

- canonical source：`https://github.com/mobxjs/mobx`
- revision：`5dbb04a15f7eb0ef6b844904c43955357a9bbdfc`
- packages：`mobx@7.0.3`、`mobx-react-lite@5.0.3`
- inspected：
  - `packages/mobx/package.json`
  - `packages/mobx/src/core/atom.ts`
  - `packages/mobx/src/core/derivation.ts`
  - `packages/mobx/src/core/computedvalue.ts`
  - `packages/mobx/src/core/globalstate.ts`
  - `packages/mobx/src/core/action.ts`
  - `packages/mobx/src/api/configure.ts`
  - `packages/mobx/src/api/makeObservable.ts`
  - `packages/mobx/src/api/flow.ts`
  - `packages/mobx/src/types/autoannotation.ts`
  - `packages/mobx-react-lite/package.json`
  - `packages/mobx-react-lite/src/observer.ts`
  - `packages/mobx-react-lite/src/useObserver.ts`
- observed：
  - `Atom.reportObserved` / `reportChanged` plus `globalState.trackingDerivation` implement implicit dependency collection;
  - derivation states are `NOT_TRACKING` / `UP_TO_DATE` / `POSSIBLY_STALE` / `STALE`; computed values cache while observed or inside a batch and reset when unobserved outside a batch;
  - default `enforceActions` is `true` (observed) and `allowStateChanges` is `false`;
  - `makeAutoObservable` annotates keys present at call time (`ownKeys` plus prototype), caches them on the prototype, rejects subclasses and already-observable objects in development, maps getters to computed, prototype methods to `autoAction`/`flow`, and other fields to observable;
  - `action` / `autoAction` / `runInAction` open a batch and, in development, temporarily allow state changes; `flow` wraps generator continuation steps in new actions;
  - `observer` tracks render with a `Reaction` and subscribes via `useSyncExternalStore`; wrapping an already-`memo`/`observer` component throws;
  - `mobx-react-lite@5.0.3` peers `mobx@^7` and `react@^18 || ^19`.
- provenance note：
  - npm `mobx@7.0.3` reports `gitHead=5dbb04a15f7eb0ef6b844904c43955357a9bbdfc`;
  - GitHub annotated tag `mobx@7.0.3` peels to the same commit; `packages/mobx/package.json` reports `7.0.3`.
