# React client-store source review (writer DN)

> 用途：记录 MobX、nanostores 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DN
- requested target：`recoil`、`redux`；仓库无对应项目页，Recoil 上游已归档，因此按授权 fallback 选择现有 React 可用 store 对
- fallback pair：`mobx` + `nanostores`（未改 `zustand` / `jotai` / `valtio` / `pinia`）
- evidence：GitHub tag 元数据、npm latest / `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装上游依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## MobX

- canonical source：`https://github.com/mobxjs/mobx`
- revision：`5dbb04a15f7eb0ef6b844904c43955357a9bbdfc`
- package：`mobx@7.0.3`；同提交 `mobx-react-lite@5.0.3`
- tag：annotated `mobx@7.0.3` 与 `mobx-react-lite@5.0.3` 均解引用到上述 commit
- inspected：
  - `packages/mobx/package.json`
  - `packages/mobx/CHANGELOG.md`
  - `packages/mobx/src/mobx.ts`
  - `packages/mobx/src/core/atom.ts`
  - `packages/mobx/src/core/derivation.ts`
  - `packages/mobx/src/core/action.ts`
  - `packages/mobx/src/core/reaction.ts`
  - `packages/mobx/src/core/globalstate.ts`
  - `packages/mobx/src/api/makeObservable.ts`
  - `packages/mobx/src/api/configure.ts`
  - `packages/mobx/src/types/autoannotation.ts`
  - `packages/mobx-react-lite/package.json`
  - `packages/mobx-react-lite/src/observer.ts`
  - `packages/mobx-react-lite/src/useObserver.ts`
  - `packages/mobx-react-lite/src/useLocalObservable.ts`
- observed：
  - 开发态启动检查要求全局存在 `Symbol` / `Map` / `Set` / `Proxy`；无生产 `dependencies`；
  - 7.0 去掉 ES5 / 非 Proxy 回退，`configure({ useProxies })` 与 `{ proxy: false }` 不再存在；
  - `Atom.reportObserved` 走全局 `trackingDerivation`；`reportChanged` 包在 `startBatch` / `endBatch` 里；
  - derivation 四态：`NOT_TRACKING` / `UP_TO_DATE` / `POSSIBLY_STALE` / `STALE`；`POSSIBLY_STALE` 先 pull computed 再决定是否重算；
  - 默认 `enforceActions = true`、`allowStateChanges = false`；DEV 下改**已有 observer** 的 observable 不走 action 会警告；
  - `makeAutoObservable` 禁止已有超类、禁止对已是 observable 的对象再调；getter → computed，原型方法 → autoAction / flow，其余 → observable；
  - `observer` 内部用 `useObserver`，再 `memo`；已是 `memo` / 再包一层 `observer` 会抛错；`useObserver` 不再属于公开绑定面；
  - `useObserver` 用 `Reaction.track` + `useSyncExternalStore`，泄漏的 Reaction 交给 `FinalizationRegistry`；
  - `useLocalObservable` 是 `useState(() => observable(init(), annotations, { autoBind: true }))`；
  - `mobx-react-lite@5` peer 为 `mobx ^7` 与 `react ^18 || ^19`。
- provenance：
  - npm `mobx@7.0.3` / `mobx-react-lite@5.0.3` 的 `gitHead` 与上述 tag commit 一致。

## nanostores

- canonical source：`https://github.com/nanostores/nanostores`
- revision：`400cbb3e8faa03e166d2b0cfef17528d547eb7d6`
- package：`nanostores@1.5.2`
- tag：annotated `1.5.2` 解引用到上述 commit
- React adapter（独立仓，只用于核对绑定，不作为本页 canonical）：`https://github.com/nanostores/react` / `@nanostores/react@1.1.0` / `f2a32b4a13fbe80aa1dace347b4f5b71d08244f4`
- inspected：
  - `package.json`
  - `index.js`
  - `atom/index.js`
  - `atom/index.test.ts`
  - `map/index.js`
  - `computed/index.js`
  - `deep-map/index.js`
  - `effect/index.js`
  - `lifecycle/index.js`
  - `listen-keys/index.js`
  - `../nanostores-react/package.json`
  - `../nanostores-react/index.js`
- observed：
  - 无生产 `dependencies`；`engines` 为 Node `^20 || >=22`；size-limit 声明 Atom `372 B`、`map+computed` `912 B`（未实测）；
  - `atom.set` 用 `Object.is`（`eq`）跳过同值；`listen` 不立刻回调，`subscribe` 会先推当前值；
  - 无 listener 时 `get()` 会临时 `listen(() => {})()` 以触发 `onMount`，再立刻退订；
  - `notify` 把 listener 推进共享队列；`batch()` 用 `Set` 去重，外层结束才 `drainQueue`；
  - epoch 存在 `globalThis.nanostoresGlobal`，避免多份打包各记各的序号；
  - `map.setKey` 浅拷贝后改一键；`value === undefined` 且键存在则 `delete`；
  - `computed(stores, fn)` 依赖列表是显式参数，不是第一次执行时隐式收集；Promise 返回已警告并将在 2.0 移除；
  - `deepMap` 开发态警告迁到 `@nanostores/deepmap`，2.0 删除；
  - `onMount` 的 destroy 延迟 `STORE_UNMOUNT_DELAY = 1000` ms；
  - `@nanostores/react` 的 `useStore` 走 `useSyncExternalStore`；`keys` 走 `listenKeys`；`ssr: 'initial'` 用 `store.init`。
- provenance：
  - npm `nanostores@1.5.2` `gitHead` 与 tag commit 一致；
  - React 适配器 npm `gitHead` 与其独立仓 tag `1.1.0` 一致，不并入本页 `immutable_revision`。
