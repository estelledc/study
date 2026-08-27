---
title: Lit — 用 tagged template 驱动 Custom Element 更新
description: 介绍 lit 3.3.3 如何把 ReactiveElement 的微任务批处理接到 lit-html 的 TemplateResult
来源: https://github.com/lit/lit
日期: 2026-08-27
分类: UI 框架
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lit/lit
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.3.3
---

## 是什么

`lit` 是一个把 **响应式 Custom Element** 和 **lit-html 模板** 绑在一起的门面包。日常类比：元件自己是标准 Web Component；每次属性变化只重填模板里预先挖好的洞，而不是重建一棵虚拟 DOM。

你写：

```js
import { LitElement, html, css } from "lit";

class CounterEl extends LitElement {
  static properties = { n: { type: Number } };
  static styles = css`button { font: inherit; }`;
  constructor() {
    super();
    this.n = 0;
  }
  render() {
    return html`<button @click=${() => this.n++}>${this.n}</button>`;
  }
}
customElements.define("counter-el", CounterEl);
```

固定提交里 `packages/lit/src/index.ts` 先预取 `@lit/reactive-element` 与 `lit-html`，再 re-export `lit-element` 和 `is-server`。同提交的工作区版本是 `lit@3.3.3`、`lit-html@3.3.3`、`lit-element@4.2.2`、`@lit/reactive-element@2.1.2`。

## 为什么重要

不理解这三层分工，就解释不了：

- 为什么改属性不会立刻画 DOM，却会在下一个微任务里批量更新
- 为什么在 `render()` 里赋值通常不会再排一轮
- 为什么默认内容跑进 Shadow Root，样式用 `static styles` 而不是全局 CSS
- 为什么 `html\`...\`` 本身几乎不做事，真正的缓存键是那份 `TemplateStringsArray`

## 核心要点

更新链可以拆成六步：

1. **属性写入**：生成的 accessor 调用 `requestUpdate(name, oldValue)`。默认 `hasChanged` 是 `notEqual`，即 `!Object.is`。`state: true` 的字段不进 `observedAttributes`。

2. **微任务批处理**：若当前没有 pending update，就 `await` 上一次 `__updatePromise` 再继续。同一轮里多次赋值会合成一次 `performUpdate`。

3. **生命周期闸门**：`shouldUpdate` 默认 `true` → `willUpdate` → controller `hostUpdate` → `update`。`shouldUpdate` 返回 false 时直接 `__markUpdated`，不渲染。

4. **LitElement.update**：先 `this.render()` 拿到模板值，再 `super.update` 做 attribute reflection，最后 `lit-html` 的 `render(value, this.renderRoot, this.renderOptions)`。

5. **默认 Shadow Root**：`createRenderRoot` 使用 `shadowRootOptions = {mode: 'open'}` 并 `adoptStyles`。要渲染到 light DOM，覆盖该方法返回 `this`。

6. **模板 parts**：`html` 只返回 `{ _$litType$, strings, values }`。准备好的模板缓存在以 `TemplateStringsArray` 为键的 `WeakMap` 里。容器上的 `_$litPart$` 记住根 `ChildPart`。`noChange` 表示“这格别写”；`nothing` 清空子节点或去掉 attribute。

`update` / `render` 期间 `isUpdatePending` 仍为 true，所以里面再设属性**不会**立刻再排一轮；`__markUpdated` 之后的写入才会。异常会跳过 `firstUpdated` / `updated`。

## 实践示例

### 案例 1：属性类型与 Boolean 出现即真

```js
class FlagEl extends LitElement {
  static properties = {
    on: { type: Boolean, reflect: true },
    count: { type: Number },
  };
  render() {
    return html`<span>${this.on} ${this.count}</span>`;
  }
}
```

默认 converter：Boolean 看 attribute **是否存在**（`value !== null`）；Number 用 `Number(value)`；Object/Array 走 `JSON.parse`，失败则 `null`。`reflect` 默认是 `false`，这里显式打开才会写回 attribute。

### 案例 2：独立使用 lit-html

```js
import { html, render, nothing } from "lit";
const root = document.getElementById("app");
render(html`<p>hi</p>`, root);
render(nothing, root); // 清空 ChildPart，不是卸掉 custom element
```

`render` 第一次会在容器（或 `renderBefore`）上挂 `_$litPart$`。后续调用只更新这个 part。RenderOptions 只在第一次被记住。

### 案例 3：等这一轮画完

```js
el.n = 1;
el.n = 2;
await el.updateComplete; // 一次 performUpdate 之后的 Promise
```

`updateComplete` 就是内部 `__updatePromise`。若 `updated()` 里又改了属性，这次 Promise 会以 `false` 结束，表示后面还有一轮。

## 踩过的坑

1. **把 `html` 当成立刻建 DOM**：tag 函数是 lazy 的，只装箱。真正写 DOM 发生在 `LitElement.update` 或独立 `render()`。

2. **class field 盖住 accessor**：固定 ReactiveElement 在首次更新前若发现实例自有属性盖住原型 accessor，会在 dev mode **抛错**。要用 `static properties` / `@property`，不要在子类字段里重声明同名响应式属性。

3. **`@click=${this.requestUpdate}`**：`requestUpdate` 的第一个参数若是 Event，dev mode 会警告。应写 `() => this.requestUpdate()`。

4. **`nothing` 和假值不是一回事**：子节点里 `null`/`''`/`nothing` 都不渲染；attribute 里只有 `nothing` 会**移除**属性，`null`/`undefined` 写成空字符串。

5. **默认开 Shadow DOM**：全局 CSS 进不了内部。要么写 `static styles`，要么覆盖 `createRenderRoot`。

## 适用 vs 不适用场景

**适用**：

- 要发布可在任意框架里使用的 Custom Element
- 需要浏览器原生的属性 / attribute 反射和表单关联
- 模板结构稳定、主要更新表达式洞的 UI

**不适用**：

- 只要函数组件 + hooks、不打算注册 custom element
- 必须和 React 合成事件 / Fiber 优先级对齐
- 模板字符串每次都新建（cache 键失效，parts 无法复用）
- 不能接受固定 3.3.3 这条 monorepo 版本组合

## 固定版本边界

- 本文绑定 `lit/lit@20afabd3...`。annotated tag `lit@3.3.3` 剥开后与 npm `gitHead` 都是该提交。
- 同提交工作区：`lit@3.3.3`、`lit-html@3.3.3`、`lit-element@4.2.2`、`@lit/reactive-element@2.1.2`。
- `lit` 的依赖范围是 `@lit/reactive-element ^2.1.0`、`lit-element ^4.2.0`、`lit-html ^3.3.0`。
- 默认 `shadowRootOptions.mode = 'open'`；默认属性 `attribute: true`、`reflect: false`、`useDefault: false`。
- 本文未安装依赖、未跑上游测试、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **门面包不等于实现包**——`import from "lit"` 只是把 ReactiveElement、LitElement、lit-html 焊在一起
2. **微任务 await 上一次 Promise** 就是批处理：同一轮赋值合成一次 `performUpdate`
3. **模板缓存键是 TemplateStringsArray**——同源字面量才能复用 parts
4. **`noChange` / `nothing` 是不同哨兵**——一个跳过写入，一个清空或删 attribute

## 应用型自测

1. `LitElement.update` 是先 `super.update` 再 `render()`，还是反过来？
2. 默认 `hasChanged` 对 `NaN` → `NaN` 会请求更新吗？
3. 在 `render()` 里给另一个响应式属性赋值，这一轮结束前会再进一次 `performUpdate` 吗？

检查点：

1. 先 `this.render()`，再 `super.update`（反射），最后 `lit-html render`。
2. 不会。默认 `notEqual` 使用 `Object.is`，`NaN` 与 `NaN` 视为相同。
3. 不会。`update`/`render` 期间 `isUpdatePending` 仍为 true，要等 `__markUpdated` 之后的写入才排下一轮。

## 延伸阅读

- 固定源码：[lit/lit](https://github.com/lit/lit) —— 本文绑定提交 `20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6`
- 组件生命周期：[Reactive updates](https://lit.dev/docs/components/lifecycle/)
- [[preact]] —— 同步 VNode diff；和 template parts 对照
- [[react]] —— 合成事件与 Fiber，和 Custom Element 更新模型对照

## 关联

- [[preact]] —— 轻量 UI 的另一条路：VNode + 可选 React compat
- [[react]] —— 组件心智相近，宿主是虚拟树而不是 Custom Element
- [[vue]] —— 编译模板 + 响应式；Lit 把模板留在运行时 tagged template
- [[vite]] —— 常见的 Lit 开发服务器与产物打包入口

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
