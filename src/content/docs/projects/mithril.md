---
title: Mithril — 把视图、重绘、路由和 XHR 收进一个 m
description: 对照 Mithril 2.3.8 如何把 hyperscript、mount/redraw、hash 路由和 XHR 收进同一个 m。
来源: https://github.com/MithrilJS/mithril.js
日期: 2026-08-27
分类: UI 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/MithrilJS/mithril.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0984c9865caa5496fca80236b20e73c8e019e7b2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.3.8
---

## 是什么

Mithril 是一个把 hyperscript、挂载重绘、客户端路由和 XHR 收进同一个 `m` 的浏览器 UI 库。日常类比：不是只卖灶台的厨房，而是灶台、传菜铃、路线牌和订货单订在同一块板上——你按铃，整桌按订阅名单重上一次菜。

固定 2.3.8 的入口是 `index.js`：`m()` 转去 hyperscript，同时挂上 `mount` / `redraw` / `route` / `render` / `request`。

```js
import m from "mithril";

const Counter = {
  oninit(vnode) {
    vnode.state.count = 0;
  },
  view(vnode) {
    return m("button", {
      onclick() { vnode.state.count += 1; },
    }, vnode.state.count);
  },
};

m.mount(document.body, Counter);
```

`m("button.primary#ok", attrs, children)` 会把选择器编译成 tag / id / class。组件是带 `view` 的对象、构造器，或返回这种状态对象的函数。

## 为什么重要

不读 Mithril 的装配方式，下面这些事都会说错：

- 为什么 `m.mount(root, m(Comp))` 会抛“expects a component, not a vnode”
- 为什么点一次按钮视图会自己刷新，而 `m.render` 不会
- 为什么 `m.request` 默认会触发 `redraw`，`background: true` 却不会
- 为什么默认 URL 是 `#!/path`，不是 History 根路径

## 核心要点

Mithril 2.3.8 可以看成四条并列管子，而不是“先框架再插件”：

1. **hyperscript**：选择器缓存后写入 vnode；`class` 会被抄到 `className`。片段 tag 是 `"[`。孩子必须全带 key 或全不带。

2. **`m.mount` + `redraw`**：根和组件成对放进订阅表。`redraw()` 用 `requestAnimationFrame` 合并；`redraw.sync()` 立刻遍历订阅并 `render`。

3. **事件默认重绘**：`render` 包一层 `EventDict`。处理函数返回后，除非 `event.redraw === false`，否则调用当前 redraw。返回 Promise 还会在 resolve 后再 redraw 一次；返回 `false` 会 `preventDefault` + `stopPropagation`。

4. **`m.route` / `m.request`**：路由默认前缀 `#!`，路由表 key 必须以 `/` 开头，可用 `onmatch` 返回组件或 `route.SKIP`。`m.request` 走 `XMLHttpRequest`，默认 JSON GET；`.then` 被包一层，全部完成时调用 `redraw`，除非 `background: true`。

## 实践示例

### 案例 1：挂组件，不要挂 vnode

```js
m.mount(document.getElementById("app"), Counter);     // 正确：组件
m.mount(document.getElementById("app"), m(Counter));  // 抛 TypeError
```

`mount` 先按根节点查订阅；再挂时会先 `render(root, [])` 卸旧树。它要的是以后每次 redraw 都能重新 `Vnode(component)` 的工厂，不是已经做好的 vnode。

### 案例 2：路由前缀和 `onmatch`

```js
m.route(document.getElementById("app"), "/home", {
  "/home": Home,
  "/item/:id": {
    onmatch(params) {
      return Item; // 或 return m.route.SKIP 试下一条
    },
  },
});

m.route.set("/item/:id", { id: "42" });
```

`m.route.prefix` 默认 `#!`。前缀不是 `#` 时才会去拼 `search` / `pathname`。`onmatch` 在 Promise 微任务里跑；失败且当前不是默认路由时，会 `replace` 回 fallback。

### 案例 3：请求完成才 redraw，后台请求除外

```js
const users = { list: [] };

const List = {
  oninit() {
    m.request({ method: "GET", url: "/api/users" }).then((data) => {
      users.list = data;
    });
  },
  view() {
    return users.list.map((u) => m("div", { key: u.id }, u.name));
  },
};
```

默认 `responseType` 为 `json`，普通对象 body 会 `JSON.stringify` 并补 JSON Content-Type。`background: true` 返回原 Promise，不包 completion redraw。这不是 Fetch API。

## 踩过的坑

1. **给 `m.mount` 传 vnode**：源码明确检查 `view` 或函数；`m(Comp)` 已经是 vnode。

2. **只调用 `m.render` 却期待自动刷新**：`render` 是一次 patch。自动订阅来自 `mount` / `route`。

3. **片段里有的孩子有 key、有的没有**：`Vnode.normalizeChildren` 会抛 TypeError。

4. **以为 npm `gitHead` 就是 2.3.8 源码**：`mithril@2.3.8` 的 `gitHead` 指向父提交 `170e8dc...`，那里 `package.json` 仍是 `2.3.7`。带版本号的是 tag `v2.3.8` / `0984c986...`。

5. **把 README 的 gzip 体积或“很快”写成测量结论**：本文未跑 bundle 或 benchmark。

## 适用 vs 不适用场景

**适用**：

- 希望一个文件级 API 同时覆盖视图、重绘、hash 路由和 JSON XHR
- 能接受 hyperscript / 选择器字符串，而不是 JSX 工厂拆包
- 组件是 `view` 对象或闭包，不依赖 hooks 运行时

**不适用**：

- 需要 Fetch、流式 body 或与 ofetch/ky 同一套 abort/retry 合同
- 必须用 History 根路径，却没改 `m.route.prefix`
- 要把 React/Preact 组件生态当原生产品接入
- 混合 key 的宽松列表渲染

## 固定版本边界

- 本文绑定 `MithrilJS/mithril.js@0984c986...`，GitHub tag 与 `package.json` 均为 `2.3.8`。
- npm latest 也标 2.3.8，但其 `gitHead` 是父提交 `170e8dc...`（仍自报 2.3.7）。升级或核对 provenance 时不要只信 `gitHead`。
- `m.request` 依赖 `window.XMLHttpRequest`；`m.route` 依赖 `window` 的 location/history。
- 本文未安装依赖、运行 ospec、发请求或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **自动重绘是订阅，不是渲染器魔法**——只有 `mount`/`route` 登记过的根会随 `redraw` 更新。
2. **事件处理函数是 redraw 的默认触发点**——要关闭它必须显式 `event.redraw = false`。
3. **一体式小框架把 XHR/路由做成同类导出**——边界清晰，但替换其中一段就要理解 completion 和 prefix。
4. **发布 tag 和 npm `gitHead` 可以差一步**——以能对上版本号的可达提交为准。

## 应用型自测

1. `m.mount(root, m(Counter))` 在 2.3.8 会成功吗？
2. 未改 `m.route.prefix` 时，`/home` 对应的默认地址是什么？
3. `m.request({ url: "/x", background: true })` 完成时会不会走默认 `redraw`？

检查点：

1. 不会。`mount` 要组件，传入 vnode 会 TypeError。
2. `#!/home`。默认前缀是 `#!`。
3. 不会。`background: true` 跳过 completion 包装。

## 延伸阅读

- 固定源码：[MithrilJS/mithril.js](https://github.com/MithrilJS/mithril.js) —— 本文绑定提交 `0984c9865caa5496fca80236b20e73c8e019e7b2`
- 文档：[mithril.js.org](https://mithril.js.org)
- [[inferno]] —— 同一批静态审查里、把工厂和路由/XHR 拆开的 React 形状运行时
- [[preact]] —— hooks + React 包名习惯
- [[react]] —— 对照“视图运行时不内置 XHR/路由”

## 关联

- [[inferno]] —— vnode flags 与包拆分，对照一体式 `m`
- [[preact]] —— 更接近 React 组件模型
- [[react]] —— 路由和数据获取通常是外部库
- [[vue]] —— 模板/响应式对照；本页不把 Vue 当已验证竞品跑分

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
