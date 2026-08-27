# Classic framework source review

> 用途：记录 Ember、Backbone 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DA
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Ember

- canonical source：`https://github.com/emberjs/ember.js`
- revision：`ccfcde92ce1a82a5d9d605d0117261b8341a9777`
- package：`ember-source@7.2.0`
- inspected：
  - `package.json`
  - `packages/ember/package.json`
  - `packages/ember/version.ts`
  - `packages/@ember/application/index.ts`
  - `packages/@ember/application/instance.ts`
  - `packages/@ember/engine/index.ts`
  - `packages/@ember/engine/lib/strict-resolver.ts`
  - `packages/@ember/owner/index.ts`
  - `packages/@ember/routing/router.ts`
  - `packages/@ember/routing/route.ts`
  - `packages/@ember/routing/lib/dsl.ts`
  - `packages/@ember/-internals/glimmer/lib/component.ts`
  - `packages/@ember/-internals/glimmer/lib/renderer.ts`
  - `packages/@ember/-internals/metal/lib/tracked.ts`
  - `packages/@ember/runloop/index.ts`
  - `packages/@ember/object/index.ts`
- observed：
  - published package is `ember-source@7.2.0`; `packages/ember` is a private workspace whose `version.ts` is a build-time placeholder `VERSION_GOES_HERE`;
  - `Application` extends `Engine`; `autoboot` defaults to `true` and then `boot` → instance `_bootSync` → `ready()` → `startRouting()`;
  - default `Resolver` is `StrictResolver` and asserts that `Application.modules` is set;
  - `Router.map` queues DSL callbacks under an implicit `application` route; Route hooks include `beforeModel`, `model`, `afterModel`, `redirect`, `setupController`, `resetController`;
  - implicit `*_id` model lookup is marked deprecated; query param keys are `refreshModel`, `replace`, `as`;
  - renderer invalidation schedules Backburner `render`; `_RERENDER_LOOP_LIMIT` throws `infinite rendering invalidation detected`;
  - `@tracked` consume/dirty tags in `@ember/-internals/metal`; native getters autotrack; setting tracked data during render is unsupported;
  - classic `Component` from `@ember/component` remains supported; source docs name `@glimmer/component` as the Octane default (implementation not in this sparse checkout);
  - runloop queues include `actions`, `routerTransitions`, `render`, `afterRender`, `destroy`.
- provenance note：
  - GitHub tag `v7.2.0-ember-source` is a lightweight tag pointing to `ccfcde92ce1a82a5d9d605d0117261b8341a9777`;
  - npm `ember-source@7.2.0` `gitHead` is the same commit, and root `package.json` reports `7.2.0`;
  - npm also advertises `7.3.0-beta.1` / `7.4.0-alpha.*`; those lines are out of scope.

## Backbone

- canonical source：`https://github.com/jashkenas/backbone`
- revision：`da75718e896e52e84aa1f0411ba67fafcdcf6af3`
- package：`backbone@1.6.1`
- inspected：
  - `package.json`
  - `backbone.js`
  - `modules/debug-info.js`
  - `modules/package.json`
- observed：
  - `Backbone.VERSION` and `package.json` both report `1.6.1`; runtime depends on `underscore >= 1.8.3` and optional `Backbone.$`;
  - `Events` is a mixin also copied onto `Backbone`; public methods are `on`/`off`/`once`/`trigger`/`listenTo`/`listenToOnce`/`stopListening`;
  - `Model.set` validates only when `options.validate` is true; it emits `change:<attr>` / `change` only for unequal values and not when `silent`;
  - `save` merges `{validate: true, parse: true}`; default `idAttribute` is `'id'`;
  - `Collection.set` defaults `{add: true, remove: true, merge: true}`; `add` forces `merge: false`;
  - `View.render` returns `this` and does not write the document; default `tagName` is `div`;
  - `History.start` defaults `root: '/'`, enables hashChange unless `hashChange === false`, and uses pushState only when both wanted and available;
  - `sync` maps create/update/patch/delete/read to POST/PUT/PATCH/DELETE/GET; `emulateHTTP` / `emulateJSON` default false.
- provenance note：
  - annotated GitHub tag `1.6.1` peels to `da75718e896e52e84aa1f0411ba67fafcdcf6af3` ("Merge branch 'prepare-1.6.1'");
  - that commit's `package.json` and `Backbone.VERSION` both report `1.6.1`;
  - npm `backbone@1.6.1` publishes `gitHead` `665cb53c306579abd6dc5801ee19bf6c03e7d73e`, which is not reachable on the canonical GitHub remote;
  - this review binds the reachable peeled tag commit and does not invent a mapping for the missing npm `gitHead`.
