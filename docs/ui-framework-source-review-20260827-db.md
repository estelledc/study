# UI framework source review (writer DB)

> 用途：记录 Inferno、Mithril 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DB
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、XHR、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Inferno

- canonical source：`https://github.com/infernojs/inferno`
- revision：`f1a7fa2f1d6823989b30ffda410b340eb5ed3963`
- package：`inferno@9.1.0`
- inspected：
  - `package.json`
  - `packages/inferno/package.json`
  - `packages/inferno/src/index.ts`
  - `packages/inferno/src/core/implementation.ts`
  - `packages/inferno/src/core/component.ts`
  - `packages/inferno/src/core/types.ts`
  - `packages/inferno/src/DOM/rendering.ts`
  - `packages/inferno/src/DOM/utils/componentUtil.ts`
  - `packages/inferno/src/DOM/patching.ts`
  - `packages/inferno/src/DOM/events/linkEvent.ts`
  - `packages/inferno/src/DOM/events/delegation.ts`
  - `packages/inferno-vnode-flags/src/index.ts`
  - `packages/inferno-create-element/src/index.ts`
  - `packages/inferno-hydrate/src/index.ts`
  - `packages/inferno-server/src/index.ts`
- observed：
  - tag `v9.1.0`, GitHub commit and npm `gitHead` all identify `f1a7fa2f...`;
  - core `inferno` exports `render` / `Component` / `createVNode` / `createComponentVNode` / `linkEvent` / `rerender`, not `createElement` or React-style hooks;
  - `createElement` lives in `inferno-create-element` and compiles string types to `createVNode`, other types to `createComponentVNode`;
  - development `render()` rejects `document.body` and stores the current root on `parentDOM.$V`;
  - class `setState` is blocked while `$BS` is true (constructor); otherwise it merges `$PS` and flushes via microtask `rerender` unless the queue can apply immediately;
  - functional components get lifecycle through `ref` / `defaultHooks` (`onComponentDidMount`, `onComponentShouldUpdate`, …), not hooks;
  - a fixed set of pointer/keyboard/focus events is delegated on `document` via `dom.$EV`.
- provenance conflict：none for 9.1.0.

## Mithril

- canonical source：`https://github.com/MithrilJS/mithril.js`
- revision：`0984c9865caa5496fca80236b20e73c8e019e7b2`
- package：`mithril@2.3.8`
- inspected：
  - `package.json`
  - `index.js`
  - `browser.js`
  - `hyperscript.js`
  - `render/hyperscript.js`
  - `render/vnode.js`
  - `render/render.js`
  - `api/mount-redraw.js`
  - `api/router.js`
  - `request/request.js`
  - `request.js`
  - `route.js`
  - `mount-redraw.js`
- observed：
  - `index.js` assembles one `m` export: hyperscript, `mount`/`redraw`, `route`, `render`, `request`, and pathname/query helpers;
  - `m.mount` requires a component (`view` or function), not a vnode, and registers the root in a subscription list that `redraw` flushes via `requestAnimationFrame`;
  - event handlers recorded during `render` call `redraw` unless `event.redraw === false`; returning `false` also prevents default and stops propagation;
  - `m.request` uses `XMLHttpRequest`, defaults to JSON GET, and wraps `.then` so completion calls `redraw` unless `background: true`;
  - `m.route.prefix` defaults to `#!`; routes must start with `/`; mixed keyed/unkeyed fragment children throw.
- provenance conflict：
  - npm `mithril@2.3.8` reports `gitHead=170e8dc50299b54fb032797c3cffc347936c207e`;
  - that object is reachable and is the parent of GitHub tag `v2.3.8`;
  - `170e8dc...` still has `package.json` version `2.3.7` and message `refactor execSelector`;
  - tag `v2.3.8` / `0984c986...` is the release-artifacts commit whose `package.json` reports `2.3.8`;
  - this review therefore binds the internally consistent and tagged `v2.3.8` revision.
