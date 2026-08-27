# Lightweight UI source review

> 用途：记录 Preact、Lit 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer CB
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Preact

- canonical source：`https://github.com/preactjs/preact`
- revision：`389c7bcc5140566f3fbae73cf17edf4ab44f4d96`
- package：`preact@10.29.8`
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/render.js`
  - `src/create-element.js`
  - `src/component.js`
  - `src/diff/index.js`
  - `src/diff/children.js`
  - `src/diff/props.js`
  - `src/options.js`
  - `hooks/src/index.js`
  - `compat/src/index.js`
  - `compat/src/render.js`
- observed：
  - public API re-exports `h` as an alias of `createElement`; `render()` wraps the tree in a `Fragment` and stores it on `parentDom._children`;
  - if `parentDom == document`, render retargets to `document.documentElement`;
  - `setState` / hook updates go through `enqueueRender`, which defaults to `Promise.then` microtask batching (`options.debounceRendering` can replace it) and sorts the queue by vnode `_depth`;
  - function components that call `setState` during render may loop up to 25 times in the same diff;
  - `setProperty` binds `on*` props with `addEventListener` plus a shared event proxy and a per-instance event clock; core does not remap `onChange` to `onInput`;
  - `preact/compat` remaps `onChange` → `onInput` for `input`/`textarea` except `file`/`checkbox`/`radio`, reports `version = '18.3.1'`, and adds `persist` / `nativeEvent` via `options.event`;
  - `useState` is implemented as `useReducer`; `useLayoutEffect` runs in the commit callback queue; `useEffect` is flushed after paint via `requestAnimationFrame` plus a 35 ms timeout;
  - `useId` returns `P{mask0}-{mask1}` using a root `_mask` counter.
- provenance note：
  - GitHub tag `10.29.8` (not `v10.29.8`) points to `389c7bcc5140566f3fbae73cf17edf4ab44f4d96`, whose `package.json` reports `10.29.8`;
  - npm `preact@10.29.8` publishes no `gitHead`; this review binds the reachable tag commit;
  - npm also advertises `11.0.0-beta.2` / `11.0.0-rc.1`; those lines are out of scope.

## Lit

- canonical source：`https://github.com/lit/lit`
- revision：`20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6`
- packages：`lit@3.3.3`、`lit-html@3.3.3`、`lit-element@4.2.2`、`@lit/reactive-element@2.1.2`
- inspected：
  - `packages/lit/package.json`
  - `packages/lit/src/index.ts`
  - `packages/lit-element/package.json`
  - `packages/lit-element/src/lit-element.ts`
  - `packages/reactive-element/package.json`
  - `packages/reactive-element/src/reactive-element.ts`
  - `packages/lit-html/package.json`
  - `packages/lit-html/src/lit-html.ts`
- observed：
  - the `lit` package is a facade: it pre-imports `@lit/reactive-element` and `lit-html`, then re-exports `lit-element/lit-element.js` plus `lit-html/is-server.js`;
  - `LitElement.update` calls `this.render()` first, then `super.update` (attribute reflection), then `lit-html` `render()` into `this.renderRoot`;
  - `ReactiveElement.requestUpdate` records changed properties with `hasChanged` defaulting to `Object.is` via `notEqual`, then batches work by awaiting the previous `__updatePromise`;
  - `performUpdate` runs `shouldUpdate` (default `true`) → `willUpdate` → controller `hostUpdate` → `update`; exceptions skip `firstUpdated`/`updated`;
  - setting properties inside `update`/`render` does not schedule another pass until `__markUpdated` clears `isUpdatePending`;
  - `createRenderRoot` defaults to an open shadow root (`shadowRootOptions = {mode: 'open'}`) and adopts `static styles`;
  - `html` is lazy: it returns `{ _$litType$, strings, values }` and caches prepared templates in a `WeakMap` keyed by `TemplateStringsArray`;
  - `render()` stores a `ChildPart` on the container as `_$litPart$`; `noChange` skips a write, `nothing` clears child content or removes an attribute.
- provenance note：
  - annotated GitHub tag `lit@3.3.3` peels to `20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6` ("Version Packages (#5337)");
  - npm `lit@3.3.3` `gitHead` is the same commit;
  - workspace `package.json` files at that commit report `lit@3.3.3`, `lit-html@3.3.3`, `lit-element@4.2.2`, `@lit/reactive-element@2.1.2`.
