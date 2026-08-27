# Browser diagnostics source review (writer N)

> 用途：记录 browser-use、why-did-you-render 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer N
- evidence：GitHub metadata、PyPI / npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器、LLM、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## browser-use

- canonical source：`https://github.com/browser-use/browser-use`
- revision：`eb4126921bea3373f91afc49fb4b59d6eda7fed6`
- package：`browser-use==0.13.8`（GitHub lightweight tag `0.13.8` 与 PyPI latest 一致）
- inspected：
  - `pyproject.toml`
  - `README.md`
  - `browser_use/__init__.py`
  - `browser_use/agent/service.py`
  - `browser_use/tools/service.py`
  - `browser_use/tools/registry/service.py`
  - `browser_use/tools/views.py`
  - `browser_use/dom/service.py`
  - `browser_use/dom/views.py`
  - `browser_use/dom/serializer/serializer.py`
  - `browser_use/browser/__init__.py`
  - `browser_use/browser/session.py`
- observed：
  - public exports are lazy; `Controller` is an alias of `Tools`; default `llm=None` constructs `ChatBrowserUse()`;
  - `Agent.step()` is captcha wait → `_prepare_context` → `_get_next_action` → `_execute_actions` → `_post_process`;
  - `Agent.run()` default `max_steps=500`; `max_actions_per_step` default 5; screenshots are requested every step even when `use_vision=False`;
  - browser I/O is event-bus + `cdp-use` `CDPClient`, not a Playwright driver in this revision;
  - DOM serialization assigns 1-based `selector_index` and emits `[index]<tag ... />`, with iframe hidden-content hints;
  - click is index-only unless `Tools.set_coordinate_clicking(True)` is enabled for selected model name patterns;
  - `DomService` still documents a TODO that a new websocket may start per step;
  - pinned extras include `browser-harness==0.1.9` and optional `browser-use-core==0.13.3`.
- provenance note：
  - `origin/main` at review time was `28670f720f63cc5f525a2acd6d6072867689ab68` (dependency bumps after the 0.13.8 tag);
  - this review binds the reachable, internally consistent 0.13.8 tag/package/revision.

## why-did-you-render

- canonical source：`https://github.com/welldone-software/why-did-you-render`
- revision：`752cfdb4d5c5eba5a8774fb19a978a7ac0a0d5de`
- package：`@welldone-software/why-did-you-render@10.0.1`
- inspected：
  - `package.json`
  - `README.md`
  - `jsx-runtime.js`
  - `jsx-dev-runtime.js`
  - `src/whyDidYouRender.js`
  - `src/index.js`
  - `src/normalizeOptions.js`
  - `src/shouldTrack.js`
  - `src/getUpdateInfo.js`
  - `src/findObjectsDifferences.js`
  - `src/calculateDeepEqualDiffs.js`
  - `src/defaultNotifier.js`
  - `src/patches/patchFunctionalOrStrComponent.js`
  - `src/patches/patchMemoComponent.js`
  - `src/patches/patchClassComponent.js`
  - `src/utils.js`
  - `tests/strictMode.test.js`
- observed：
  - peer dependency is `react@^19`; README states React Compiler was not tested and is believed completely incompatible;
  - `whyDidYouRender(React)` is idempotent via `React.__IS_WDYR__` and can revert `createElement` / `createFactory` / `cloneElement` plus patched hooks;
  - development JSX transform is the `jsx-dev-runtime.js` `jsxDEV` wrapper; `jsx-runtime.js` re-exports `react/jsx-runtime` unchanged;
  - defaults include `trackHooks: true`, `logOwnerReasons: true`, `trackAllPureComponents: false`;
  - default notifier suppresses updates whose diffs contain a `different` value unless `logOnDifferentValues` is set;
  - object keys are compared shallowly at the top level, then each value is deep-diffed; functions compare `name`, with `useMemo`/`useCallback` deps stored in a WeakMap;
  - class components skip odd StrictMode renders (`renderNumber % 2 === 1`); functional wrappers always compare on subsequent renders.
- provenance conflict：
  - GitHub annotated tag `v10.0.1` peels to `752cfdb4d5c5eba5a8774fb19a978a7ac0a0d5de`;
  - npm `10.0.1` reports `gitHead=5623596ee8833f8352c6bf7a713619a1bcd57c6c` (badge-only follow-up);
  - `master` later contains `3ec3512d750c49448fe2241e26d05db9e42f0c21` while `package.json` still says `10.0.1`;
  - this review binds the reachable GitHub release tag commit and discloses the npm/master drift.
