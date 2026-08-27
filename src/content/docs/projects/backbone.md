---
title: Backbone — 用 Events、Model、View 搭页面的最小骨架
description: 介绍 Backbone 1.6.1 如何把 Events、Model.set/save 和 History.start 默认值拆开
来源: 'https://github.com/jashkenas/backbone'
日期: 2026-08-27
分类: UI 框架
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jashkenas/backbone
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: da75718e896e52e84aa1f0411ba67fafcdcf6af3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.6.1
---

## 是什么

Backbone 是一套很小的页面骨架：给数据对象事件、给列表集合、给 DOM 一块 View，再用 Router 听 URL。日常类比：它不盖整栋楼，只提供房间名牌和门铃——Model 是名牌上的数据，`trigger('change')` 是门铃，View 听到再自己去改门牌。

固定 1.6.1 的主文件是 `backbone.js`。`Backbone.VERSION` 与 `package.json` 都是 `1.6.1`。运行时依赖 `underscore >= 1.8.3`；`$` 来自 jQuery / Zepto / ender 或你自己赋的 `Backbone.$`。

你写：

```js
const Note = Backbone.Model.extend({
  defaults: { title: "", done: false },
});

const note = new Note({ title: "买牛奶" });
note.on("change:done", (model) => {
  console.log(model.get("done"));
});
note.set({ done: true });
```

`set` 只有值真的变了（`!_.isEqual`）且不是 `silent` 时，才发 `change:done` 和 `change`。

## 为什么重要

不理解这几条默认合同，就解释不了：

- 为什么 `set` 不校验，`save` 却默认校验
- 为什么 `Collection.add` 不合并，`set` 却默认 `merge: true`
- 为什么 `View.render` 不会把节点挂到 document
- 为什么 `history.start()` 默认走 hash，不走 pushState

它是理解 [[ember]] 之前那种“自己把事件和 REST 焊起来”的基线。

## 核心要点

固定提交的主链可以拆成五块：

1. **Events**：纯 mixin，也被 `_.extend` 到 `Backbone` 自身。`on` / `off` / `once` / `trigger` 管自己；`listenTo` / `stopListening` 管听别人，方便 `View.remove` 一次性拆线。`bind` / `unbind` 只是别名。

2. **Model**：构造时 `defaults` 与传入属性合并，再 `set`。默认 `idAttribute` 是 `'id'`，`cid` 形如 `c1`。`get` 读 `this.attributes`。`_validate` 在 `!options.validate || !this.validate` 时直接通过——所以普通 `set` 默认不跑 `validate`。

3. **Collection**：`set` 的默认选项是 `{add: true, remove: true, merge: true}`。`add` 会强制 `merge: false`。`get` 按 id、`modelId(attrs)` 或 `cid` 查 `_byId`。

4. **View**：构造时挑走 `model` / `collection` / `el` / `id` / `attributes` / `className` / `tagName` / `events`。默认 `tagName` 是 `div`。没有 `el` 就先造一个元素，但默认 `render` 只 `return this`，不写页面。

5. **Router / History / sync**：`Router` 把 `routes` 从后往前绑定。`History.start` 默认 `root: '/'`，`hashChange` 除非显式 `false` 都想开，`pushState` 只有传入真值且浏览器支持才用。`sync` 把 create/update/patch/delete/read 映到 POST/PUT/PATCH/DELETE/GET；`emulateHTTP` / `emulateJSON` 默认 `false`。

## 实践示例

### 案例 1：save 才会默认校验

```js
const Note = Backbone.Model.extend({
  urlRoot: "/notes",
  validate(attrs) {
    if (!attrs.title) return "title required";
  },
});

const note = new Note({ title: "ok" });
note.set({ title: "" });                 // 默认不 validate
note.set({ title: "" }, { validate: true }); // 失败返回 false，并 trigger('invalid')
note.save({ title: "" });                // 默认 {validate: true, parse: true}
```

`save` 源码会 `_.extend({validate: true, parse: true}, options)`。`set` 不会。

### 案例 2：Collection.set 合并，add 不合并

```js
const notes = new Backbone.Collection();
const a = new Backbone.Model({ id: 1, title: "A" });
notes.add(a);
notes.add({ id: 1, title: "B" }); // merge: false，已有 id 时不会把 title 写成 B
notes.set([{ id: 1, title: "B" }]); // 默认 merge: true，已有 model 会被 set 进新属性
```

要“按服务器快照对齐”，用 `set`；要“只追加、别改旧对象”，用 `add`。

### 案例 3：View 自己把 HTML 写进 el

```js
const NoteView = Backbone.View.extend({
  tagName: "li",
  events: { "click .toggle": "toggle" },
  render() {
    this.$el.html(`<button class="toggle">${this.model.get("title")}</button>`);
    return this;
  },
  toggle() {
    this.model.set("done", !this.model.get("done"));
  },
});

const view = new NoteView({ model: note });
document.getElementById("list").appendChild(view.render().el);
```

`delegateEvents` 解析 `"click .toggle"`，再 `delegate(eventName, selector, handler)`。`remove` 会卸 DOM 并 `stopListening`。

## 踩过的坑

1. **以为 `set` 总会 `change`**：值没变或 `silent: true` 时不触发；校验失败返回 `false`。

2. **以为 `set` 和 `save` 一样会 validate**：只有 `options.validate` 为真才进 `_validate`。

3. **等着 `render()` 把视图插进页面**：默认实现不碰 document，要把 `this.el` 自己挂上去。

4. **`history.start()` 以为默认 pushState**：必须显式 `pushState: true`，且浏览器真有 `history.pushState`。

5. **重复 `history.start()`**：已经 started 会直接 `throw`。

## 适用 vs 不适用场景

**适用**：

- 需要一个能听 `change` 的数据对象，而不是完整 UI 框架
- 已有 underscore，并能提供 `$` 做 `ajax` / 事件委托
- 想看清 Model ↔ REST 的 `sync` 映射

**不适用**：

- 需要约定式路由、owner 和自动追踪，应看 [[ember]]
- 需要函数组件和虚拟 DOM，应看 [[react]] / [[vue]]
- 不能接受 `underscore` 和可选 jQuery 这一层
- 不能接受固定 1.6.1 的 sync / History 默认值

## 固定版本边界

- 本文绑定 `jashkenas/backbone@da75718e896e52e84aa1f0411ba67fafcdcf6af3`。annotated tag `1.6.1` 剥开后就是该提交；`package.json` 与 `Backbone.VERSION` 均为 `1.6.1`。
- npm `backbone@1.6.1` 的 `gitHead` 是 `665cb53c306579abd6dc5801ee19bf6c03e7d73e`，在 canonical GitHub 上不可达。本轮不猜测、不伪造这段 provenance，只绑可达 tag 提交。
- 依赖：`underscore >= 1.8.3`。`emulateHTTP` / `emulateJSON` 默认 `false`。
- 未安装依赖、未跑 Karma/QUnit、未发网络请求，状态保持 `UNVERIFIED`。

## 学到什么

1. **骨架库把“通知”和“画界面”拆开**——Model 只 `trigger`，View 必须自己写 `render`
2. **同名方法的默认选项不一样**——`set` 不校验，`save` 校验；`add` 不合并，`set` 合并
3. **History 的默认值偏保守**——hashChange 开、pushState 关
4. **npm `gitHead` 不是 revision 证明**——不可达时只能绑 GitHub 剥开后的 tag

## 应用型自测

1. `model.set({ title: model.get("title") })` 会不会再发一次 `change:title`？
2. `collection.add({ id: 1, title: "B" })` 在已有 `id: 1` 时，默认会不会 merge？
3. `Backbone.history.start()` 不传选项时，会不会使用 pushState？

检查点：

1. 不会。`set` 用 `_.isEqual` 判断，值相同不进 `changes`。
2. 不会。`add` 强制 `merge: false`。
3. 不会。`pushState` 只有选项为真且 `history.pushState` 存在才启用。

## 延伸阅读

- 固定源码：[jashkenas/backbone](https://github.com/jashkenas/backbone) —— 本文绑定提交 `da75718e896e52e84aa1f0411ba67fafcdcf6af3`
- 文档站点：[backbonejs.org](https://backbonejs.org)
- [[ember]] —— 把路由、owner 和 renderer 收成应用框架
- [[react]] —— 用组件描述 UI，不再手写 `delegateEvents`

## 关联

- [[ember]] —— 同一时代的“约定大于配置”对照
- [[react]] —— View 层被组件树取代后的对照
- [[vue]] —— 模板自动更新，对照 Backbone 的手工 `render`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
