---
title: Ember.js — 约定式路由和自动追踪的应用框架
description: 介绍 ember-source 7.2.0 如何把 Application boot、StrictResolver 和 tracked render 队列接成一条主链
来源: 'https://github.com/emberjs/ember.js'
日期: 2026-08-27
分类: UI 框架
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/emberjs/ember.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ccfcde92ce1a82a5d9d605d0117261b8341a9777
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.2.0
---

## 是什么

Ember.js 是一套把路由、依赖注入和模板渲染焊在一起的应用框架。日常类比：它不像只给你几块积木的 UI 库，更像一栋已经接好水电的公寓——你按房间名放家具，框架负责开门、送电、通知哪面墙该重刷。

固定源码的对外 npm 包是 `ember-source`，不是名叫 `ember` 的独立发布物。`packages/ember` 只是私有工作区，`version.ts` 在源码里是占位符 `VERSION_GOES_HERE`，真正的 `7.2.0` 写在根 `package.json`。

你写：

```js
import Application from "@ember/application";
import Router from "@ember/routing/router";

Router.map(function () {
  this.route("posts", function () {
    this.route("post", { path: "/:post_id" });
  });
});

export default class App extends Application {
  autoboot = true;
  modules = {
    "router:main": Router,
  };
}
```

固定 7.2.0 默认 `Resolver` 是 `StrictResolver`：必须提供 `Application.modules`，否则 boot 会断言失败。传统 `ember-resolver` 包不在本仓。

## 为什么重要

不理解 Ember 的主链，就解释不了：

- 为什么应用不是 `render(<App />)`，而是 `boot` → instance → `startRouting`
- 为什么 URL 变化会先跑 `beforeModel` / `model` / `afterModel`，再交给 renderer
- 为什么改 `@tracked` 字段不会立刻画 DOM，却会排进 runloop 的 `render` 队列
- 为什么经典 `EmberObject` 和 Octane 的 `@tracked` 能同时存在，却不能互相当同一种状态

## 核心架构与流程

固定提交里的启动与更新可以拆成六步：

1. **Application 继承 Engine**：`autoboot` 默认 `true`。为真时先扩一个默认 `Router`，再等 DOM ready。

2. **变成 ready 的顺序**写在源码注释里：`this.boot()` → 创建或复用 `__deprecatedInstance__` → `instance.boot()` / `_bootSync()` → `App.ready()` → `instance.startRouting()`。`deferReadiness` 必须和 `advanceReadiness` 成对，否则路由永远不开始。

3. **Owner / Registry**：`Engine.buildRegistry` 用 resolver 建 `Registry`，再给每个 instance 一个 fallback registry 和 `owner: this` 的 container。查找名是 `type:name`，例如 `route:posts`、`service:router`。

4. **Router.map**：静态方法只是把 DSL 回调推进数组；真正挂路由时包在隐式 `application` 路由下。DSL 只有 `route` 和 `mount`。Route 钩子名是 `beforeModel`、`model`、`afterModel`、`redirect`、`setupController`、`resetController`。

5. **Renderer**：标签失效后，`scheduleRevalidate` 用 Backburner `scheduleOnce('render', ...)`。runloop 结束时循环检查所有 renderer 的 tag 是否 current；超过 `_RERENDER_LOOP_LIMIT` 抛 `infinite rendering invalidation detected`。

6. **自动追踪**：`@tracked` 的实现在 `@ember/-internals/metal`。读时 `consumeTag`，写时 `dirtyTagFor(this, SELF_TAG)`；数组还会消费 `[]` 标签。原生 getter 会自动追踪遇到的 tracked 字段，不必再标 `@tracked`。在 getter / render 期间写 tracked 数据，源码标明不支持。

组件有三类：无 JS 的 template-only（`this` 为 `null`）、`@glimmer/component`（源码文档称 Octane 默认；本轮 sparse checkout 没有 `@glimmer` 包体）、以及仍支持的经典 `@ember/component`。

## 实践示例

### 案例 1：显式 model 钩子

```js
import Route from "@ember/routing/route";

export default class PostRoute extends Route {
  async model({ post_id }, _transition) {
    const res = await fetch(`/api/posts/${post_id}`);
    if (!res.ok) throw new Error(`post ${post_id} missing`);
    return res.json();
  }

  setupController(controller, model) {
    super.setupController(controller, model);
  }
}
```

固定 7.2.0 仍保留“段名以 `_id` 结尾就自动当 model”的旧路径，但源码把它标成 deprecated。有动态段就应自己写 `model`。`setupController` 默认只在 context 有定义时设置 `controller.model`。

### 案例 2：query params 不刷新 model

```js
import Route from "@ember/routing/route";

export default class PostsRoute extends Route {
  queryParams = {
    page: { refreshModel: false, replace: false, as: "page" },
  };

  async model() {
    return fetch("/api/posts").then((r) => r.json());
  }
}
```

`refreshModel: false` 时改 `page` 不会重跑 `model`。`replace: true` 才会用 `replaceWith` 改历史。这些键来自 `Route` 源码，不是约定俗成的口头语。

### 案例 3：tracked 字段排进 render 队列

```js
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";

export default class Counter {
  @tracked count = 0;

  @action
  increment() {
    this.count++;
  }
}
```

公开文档路径是 `@glimmer/tracking`；固定实现会在 set 时弄脏 tag，renderer 再把重绘排到 `render` 队列。经典 class 里必须写成 `tracked()` 函数调用，不能当裸装饰器。

## 踩过的坑

1. **把默认 resolver 当成旧的模块名猜测**：7.2.0 默认 `StrictResolver`，只认你放进 `Application.modules` 的 ES 模块。

2. **以为动态段 `_id` 仍会自动 fetch**：隐式 model 钩子已 deprecated，应显式写 `model`。

3. **在 getter 里写 `@tracked`**：`@cached` / tracked 注释写明，设置 tracked 只能在初始化或用户动作里做。

4. **覆盖 Router 的 `didTransition` / `willTransition`**：源码直接 assert，要求改听 `RouterService` 的 `routeDidChange` / `routeWillChange`。

5. **把 Ember Data 的 `this.store` 当成 ember-source 内置**：`Route._store` 标了 deprecated，应自己 `@service store`；store 实现不在本仓。

## 适用 vs 不适用场景

**适用**：

- 需要约定式路由、DI 和模板更新成为同一条应用主链
- URL、model 钩子和 outlet 渲染必须同步
- 能接受 Octane 的 `@tracked` + 仍存在的经典对象模型

**不适用**：

- 只要函数组件、自己接管路由，例如 [[react]] / [[vue]] 那种库
- 不能提供 `Application.modules` 或同等 resolver
- 要把隐式 `*_id` model 或 Router 生命周期覆盖当稳定合同
- 不能接受固定 `ember-source@7.2.0` 这条线

## 固定版本边界

- 本文绑定 `emberjs/ember.js@ccfcde92ce1a82a5d9d605d0117261b8341a9777`。GitHub tag `v7.2.0-ember-source` 与 npm `ember-source@7.2.0` 的 `gitHead` 都指向该提交。
- 根 `package.json` 版本是 `7.2.0`；源码 `VERSION` 常量要等构建替换，本轮未读 `dist/`。
- 默认 runloop 队列：`actions`、`routerTransitions`、`render`、`afterRender`、`destroy`。
- 未安装依赖、未跑上游测试、未测 bundle，状态保持 `UNVERIFIED`。
- npm 另有 `7.3.0-beta.1` / `7.4.0-alpha.*`，不在本轮。

## 学到什么

1. **Ember 的单位是 Application，不是组件树**——先 boot 再 startRouting，renderer 只是后面的队列
2. **默认 resolver 已经变严**——7.2.0 要 `modules` 映射，不再靠猜文件名
3. **`@tracked` 和 EmberObject 是两套账**——要桥经典 computed，得看 `@dependentKeyCompat`，不能当同一种状态
4. **路由钩子名字要以源码为准**——`beforeModel` / `model` / `afterModel` / `redirect` / `setupController`

## 应用型自测

1. `autoboot === true` 时，`didBecomeReady` 会不会先 `ready()` 再 `startRouting()`？
2. 没有设置 `Application.modules`，默认 `StrictResolver` 能不能解析 `route:posts`？
3. 在 `@tracked` getter 里给另一个 tracked 字段赋值，固定源码是否支持？

检查点：

1. 会。源码顺序是 instance `_bootSync()` → `this.ready()` → `instance.startRouting()`。
2. 不能。`StrictResolver.create` 会断言 `namespace.modules` 必须存在。
3. 不支持。tracked / cached 注释要求只在初始化或用户动作里写 tracked 数据。

## 延伸阅读

- 固定源码：[emberjs/ember.js](https://github.com/emberjs/ember.js) —— 本文绑定提交 `ccfcde92ce1a82a5d9d605d0117261b8341a9777`
- 发布说明：[v7.2.0-ember-source](https://github.com/emberjs/ember.js/releases/tag/v7.2.0-ember-source)
- [[backbone]] —— 更小的 Events / Model / View 骨架，没有 Application boot 链
- [[react]] —— 组件树自己挂路由；没有 Ember 这种默认 resolver
- [[vue]] —— 渐进式 UI；路由和 DI 都是可选插件

## 关联

- [[backbone]] —— 经典 MVC 骨架；Ember 把路由和 owner 收进框架
- [[react]] —— 描述 UI 的库，不是约定式应用框架
- [[vue]] —— 模板 + 响应式；没有 Ember 默认的 StrictResolver
- [[vite]] —— 常见的现代前端打包入口，不是 Ember CLI

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
