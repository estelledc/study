---
title: Inferno — 用标志位拆开的 React 形状 UI 运行时
description: 对照 Inferno 9.1.0 核心包如何用 vnode 标志位、独立 createElement 和 defaultHooks 实现 React 形状 UI。
来源: https://github.com/infernojs/inferno
日期: 2026-08-27
分类: UI 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/infernojs/inferno
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f1a7fa2f1d6823989b30ffda410b340eb5ed3963
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.1.0
---

## 是什么

Inferno 是一个 React 形状的 UI 运行时：组件单向数据流、类生命周期、受控表单，但核心包只认带标志位的 vnode，不提供 `createElement` 或 `useState`。日常类比：厨房主灶只接受已经切好、贴好标签的食材；配菜（`inferno-create-element`）和上桌（`inferno-server` / `inferno-hydrate`）是旁边的砧板。

固定 9.1.0 里，你通常这样挂树：

```js
import { Component, render } from "inferno";
import { createElement as h } from "inferno-create-element";

class Counter extends Component {
  state = { n: 0 };
  render() {
    return h("button", {
      onClick: () => this.setState({ n: this.state.n + 1 }),
    }, this.state.n);
  }
}

render(h(Counter), document.getElementById("app"));
```

`createElement` 对字符串类型走 `createVNode`，对函数/类走 `createComponentVNode`。JSX 编译器则倾向于直接生成带 `VNodeFlags` 的 `createVNode` 调用。

## 为什么重要

不读 Inferno 的包边界，下面这些事都会说错：

- 为什么 `import { createElement } from "inferno"` 在 9.1.0 不成立
- 为什么函数组件没有 hooks，却仍有 `onComponentDidMount`
- 为什么开发态 `render(vnode, document.body)` 会直接抛错
- 为什么“像 React”不等于可以沿用 React 的事件绑定习惯

## 核心要点

Inferno 9.1.0 的执行链可以拆成五步：

1. **造 vnode**：`createVNode` / `createComponentVNode` 写入 `flags`、`childFlags`、`key`、`ref`。开发态禁止用错工厂。

2. **解析组件种类**：没有 `ComponentKnown` 时，看 `type.prototype.render`（类）或 `type.render`（`forwardRef`），否则当函数组件。

3. **`render` 挂到容器**：根 vnode 存在 `parentDOM.$V`；已有根就 `patch`，传入 `null` 则卸树。开发态拒绝 `document.body`。

4. **类组件改状态**：构造期间 `$BS === true`，`setState` 被拒绝。之后合并 `$PS`；若不在渲染中且队列为空，立即 `applyState`，否则用 `Promise.then` 微任务跑 `rerender`。

5. **函数组件生命周期**：没有 hooks。生命周期挂在 `ref` 或 `type.defaultHooks` 上，例如 `onComponentShouldUpdate(lastProps, nextProps)`。

## 实践示例

### 案例 1：用 `linkEvent` 避免在 render 里绑箭头函数

```js
import { linkEvent, render } from "inferno";
import { createElement as h } from "inferno-create-element";

function onSelect(item, event) {
  console.log(item.id, event.target.tagName);
}

function List({ items }) {
  return h("ul", null, items.map((item) =>
    h("li", { key: item.id, onClick: linkEvent(item, onSelect) }, item.name)
  ));
}

render(h(List, { items }), document.getElementById("app"));
```

`linkEvent(data, callback)` 只在 `callback` 是函数时返回 `{ data, event }`；否则返回 `null`，避免挂上空处理器。这是核心包自己的事件数据通道，不是 React `bind`。

### 案例 2：函数组件用 `defaultHooks` 而不是 hooks

```js
function Box(props) {
  return h("div", null, props.label);
}

Box.defaultHooks = {
  onComponentDidMount() {},
  onComponentShouldUpdate(lastProps, nextProps) {
    return lastProps.label !== nextProps.label;
  },
};
```

`createComponentVNode` 会把 `defaultHooks` 和本次 `ref` 做“只补未设置字段”的合并。调用处仍可覆盖单个 hook。固定核心没有 `useState` / `useEffect`。

### 案例 3：开发态不能渲染到 `document.body`

```js
render(h("div", null, "no"), document.body); // 开发构建抛错
render(null, document.getElementById("app")); // 卸掉该容器上一次的根
```

空容器才是合法根。服务端字符串和 hydration 分别在 `inferno-server`、`inferno-hydrate`，不是 `inferno` 核心导出。

## 踩过的坑

1. **把 `inferno` 当成完整 React 子集**：9.1.0 核心没有 `createElement`、没有 hooks；兼容层是另包 `inferno-compat`。

2. **在 constructor 里 `setState`**：`$BS` 仍为 true 时开发态抛错，应直接赋 `this.state`。

3. **复用已挂载 vnode**：`flags` 带 `InUse` 时，`render` / `normalizeRoot` 会 `directClone`。跨树共享同一个对象不是稳定合同。

4. **把 README 的“最快”写成测量结论**：标志位、按需 normalize、文档委托是源码结构；吞吐与包体需要目标环境实测。

5. **把受控 input 行为交给浏览器默认**：核心为 input/select/textarea 准备了专用 wrapper，不是“非受控更接近原生”。

## 适用 vs 不适用场景

**适用**：

- 需要 React 形状的类组件 / 受控表单，但希望编译期把 vnode 形状写成标志位
- 已有 Inferno JSX/SWC/Babel 插件，能直接生成 `createVNode`
- 要把 SSR、hydrate、动画回调拆到独立包

**不适用**：

- 以 `useState` / hooks 生态为默认的新项目
- 必须 `render` 到 `document.body` 的嵌入脚本
- 需要把 React 第三方组件当原生产品跑，却不想引入 `inferno-compat` 的语义差
- 把未绑定 benchmark 的“最快 UI”当作选型依据

## 固定版本边界

- 本文绑定 `infernojs/inferno@f1a7fa2f...`，tag / npm `inferno` 均为 `9.1.0`，`gitHead` 一致。
- 运行时文档要求 Promise、`String/Array.includes`、`startsWith` 与对象展开；本文未在目标浏览器核验。
- 文档委托覆盖 click/dblclick/focus/key/mouse/touch 这一组，不是完整合成事件系统。
- 本文未安装依赖、运行上游测试、渲染页面或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **React 形状 ≠ React 包合同**——同类 API 可以拆到不同 npm 包，导入清单必须按版本读。
2. **标志位是给 patch 看的备忘录**——`VNodeFlags` / `ChildFlags` 让 normalize 可以推迟，而不是每次都重扫孩子。
3. **函数组件生命周期可以不靠 hooks**——`defaultHooks` + `ref` 是另一条显式通道。
4. **根容器是运行时不变量**——开发态禁止 `document.body`，是为了避免整页被框架根独占。

## 应用型自测

1. 开发构建里 `render(vnode, document.body)` 会成功吗？
2. `import { createElement, useState } from "inferno"` 在 9.1.0 核心是否成立？
3. 构造函数里调用 `this.setState({ n: 1 })`，固定实现会排队更新吗？

检查点：

1. 不会；开发态对 `document.body` 抛错，需要空元素容器。
2. 不成立。`createElement` 在 `inferno-create-element`；核心没有 React hooks。
3. 不会。构造期间 `$BS` 为 true，开发态抛错，应直接赋 `this.state`。

## 延伸阅读

- 固定源码：[infernojs/inferno](https://github.com/infernojs/inferno) —— 本文绑定提交 `f1a7fa2f1d6823989b30ffda410b340eb5ed3963`
- 文档：[infernojs.org](https://infernojs.org)
- [[preact]] —— 更贴近 React 包名与 hooks 习惯的轻量实现
- [[react]] —— 对照 fiber / 合成事件 / hooks 主线
- [[mithril]] —— 同一批静态审查里的 hyperscript + 路由/XHR 一体库

## 关联

- [[preact]] —— React 兼容与 hooks 路径不同
- [[react]] —— 类生命周期和受控表单的参照
- [[mithril]] —— 不走 JSX 工厂拆分，把 redraw/route/request 放进同一个 `m`
- [[solid]] —— 细粒度订阅，而不是 vnode flags + patch

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
