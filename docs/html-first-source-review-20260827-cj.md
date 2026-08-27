# HTML-first source review

> 用途：记录 htmx、Alpine.js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer CJ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target note：原计划迁移现有 slug；仓库中不存在 `htmx` / `alpinejs` 页，且二者不在开放 PR 中，因此本轮新建两页而不是改用 qwik/remix 等 fallback

## htmx

- canonical source：`https://github.com/bigskysoftware/htmx`
- revision：`bdc7d7d3e25d0390c7ee11049806e8279b075598`
- package：`htmx.org@2.0.10`
- inspected：
  - `package.json`
  - `src/htmx.js`
  - `src/htmx.esm.d.ts`
- observed：
  - implementation is a single IIFE in `src/htmx.js`; public `htmx.version` is `2.0.10`;
  - verbs are `get/post/put/delete/patch`;
  - default triggers are `submit` on `form`, `click` on submit/button inputs, `change` on other inputs, otherwise `click`;
  - default swap style is `innerHTML`; non-boosted requests default the target to the triggering element, boosted links/forms default to `document.body`;
  - `methodsThatUseUrlParams` is `['get', 'delete']`;
  - `selfRequestsOnly` defaults to true and `verifyPath` compares `url.origin`;
  - default `responseHandling` is 204 no-swap, `[23]..` swap, `[45]..` no-swap plus error;
  - requests use `XMLHttpRequest` and send `HX-Request`, `HX-Current-URL`, trigger/target headers, plus `HX-Boosted` when boosted;
  - `hx-sync` can `drop` / `abort` / `replace` / `queue`; an in-flight xhr defaults to queue strategy `last`;
  - ready path merges `meta[name="htmx-config"]`, injects indicator CSS, and `processNode`s `document.body`.
- provenance note：
  - npm `htmx.org@2.0.10` reports `gitHead=bdc7d7d3e25d0390c7ee11049806e8279b075598`;
  - GitHub tag `v2.0.10` dereferences to the same commit, whose `package.json` reports `2.0.10`;
  - npm dist-tag `next` points at `4.0.0-beta6`; this review binds the stable 2.0.10 line only.

## Alpine.js

- canonical source：`https://github.com/alpinejs/alpine`
- revision：`518a7f4c525e56085bb48fbe11c60a1f87100b6a`
- package：`alpinejs@3.16.3`
- inspected：
  - `package.json`
  - `packages/alpinejs/package.json`
  - `packages/alpinejs/src/index.js`
  - `packages/alpinejs/src/alpine.js`
  - `packages/alpinejs/src/lifecycle.js`
  - `packages/alpinejs/src/directives.js`
  - `packages/alpinejs/src/evaluator.js`
  - `packages/alpinejs/src/reactivity.js`
  - `packages/alpinejs/src/store.js`
  - `packages/alpinejs/src/directives/x-data.js`
  - `packages/alpinejs/src/directives/x-model.js`
  - `packages/alpinejs/src/directives/x-for.js`
  - `packages/alpinejs/src/directives/x-on.js`
  - `packages/alpinejs/src/directives/index.js`
  - `packages/alpinejs/builds/cdn.js`
- observed：
  - core depends on `@vue/reactivity@~3.5.40`; `index.js` wraps Vue `effect` so Alpine's scheduler still receives a runner;
  - CDN build assigns `window.Alpine` and `queueMicrotask(() => Alpine.start())`; the module entry does not auto-start;
  - `start()` warns on a second call and when `document.body` is missing, then emits `alpine:init` / `alpine:initializing` / `alpine:initialized`;
  - `[x-data]` is the root selector; empty `x-data` evaluates as `{}` and is wrapped by `reactive()`;
  - directive order is `ignore, ref, id, data, anchor, bind, init, for, model, modelable, transition, show, if, DEFAULT, teleport`;
  - evaluator compiles memoized `AsyncFunction` bodies that run `with (scope)`; `if (` / `let` / `const` expressions are wrapped in an async IIFE;
  - `x-model` listens to `input` unless `.change` / `.lazy` / `.blur` / `.enter` are present;
  - `x-for` keeps a `Map` keyed by `:key`, normalizes numbers/Set/Map, and uses a structural-priority effect;
  - missing plugin directives `collapse` / `intersect` / `trap` / `mask` only warn; `start()` also warns if `x-dialog` / `x-anchor` / `x-sort` appear without their plugins.
- provenance note：
  - npm `alpinejs@3.16.3` reports `gitHead=518a7f4c525e56085bb48fbe11c60a1f87100b6a`;
  - GitHub tag `v3.16.3` dereferences to the same commit, whose `packages/alpinejs/package.json` reports `3.16.3`;
  - sibling workspace packages are not all 3.16.3 (`@alpinejs/history` is `3.0.0-alpha.0`, `@alpinejs/navigate` is `3.10.2`); this review binds the core package only.
