---
title: Stencil — 把 TSX 编成 Custom Element 的编译器
description: 把 TSX 编成 Custom Element 的编译器，产物可在任意框架里当 Web Component 用。
来源: https://github.com/stenciljs/core
日期: 2026-08-27
分类: UI 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/stenciljs/core
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7a8cc6e60b7c92cffd907569886c97202153d6a0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.44.2
---

## 是什么

Stencil 是一个**把带装饰器的 TSX 组件编译成标准 Custom Element** 的编译器，运行时再按输出目标选择“懒加载实现类”或“同步构造”。日常类比：它不是又一个只能在自己花园里活的框架，而是一座零件厂——出厂标签写的是浏览器认识的 `<my-button>`，React / Vue / 无框架页面都能把这个标签嵌进去。

固定 4.44.2 的包名是 `@stencil/core`，规范仓库是 `stenciljs/core`（`ionic-team/stencil` 会重定向过来）。你写：

```tsx
import { Component, Prop, h } from "@stencil/core";

@Component({
  tag: "my-counter",
  shadow: true,
})
export class MyCounter {
  @Prop() start: number = 0;
  render() {
    return <button>{this.start}</button>;
  }
}
```

`tag` 必须带连字符，才能注册成 custom element。`shadow: true` 走原生 Shadow DOM；`scoped: true` 是不建 shadow root 的样式隔离。

## 为什么重要

不理解 Stencil 的“编译器 + 宿主元素/实现类分离”，下面这些会混在一起：

- 为什么同一份源码能产出网站（`www`）、npm 组件库（`dist` / `dist-custom-elements`）和 SSR hydrate 脚本
- 为什么懒加载组件第一次出现在 DOM 里还看不到类实现——`connectedCallback` 之后才 `import()`
- 为什么 `@Prop` 默认不能在组件内部改，却又能反射成 attribute
- 为什么 Ionic 的 UI 零件能同时给 Angular / React / Vue 用——底层是 custom element，不是某个框架的组件模型

## 核心要点

固定 4.44.2 的主链可以拆成四步：

1. **`createCompiler`**：`getConfig` 校验用户配置，挂上内存 fs 与 `Cache`，`patchTypescript`，然后暴露 `build` / `createWatcher` / `destroy`。

2. **多输出目标**：`generateOutputTargets` 先并行写 collection、`dist-custom-elements`、hydrate script、lazy-loader、lazy bundle；再跑 copy、`www`、docs、types、custom。`www` 等 lazy 写完，才能把懒加载入口内联进 `index.html`。

3. **懒加载运行时**：`connectedCallback` → `initializeComponent` → `loadModule` → 首次给构造函数 `proxyComponent`（给 `@Prop` / `@State` 装 getter/setter）→ `new Cstr(hostRef)`。宿主 DOM 节点和懒加载实例靠 `hostRef` 同步。

4. **失败重试**：`import()` 失败会清掉 `hasInitializedComponent`，`$loadRetryCount$` 加一；之后重连最多再试 `MAX_LAZY_LOAD_RETRIES = 3` 次，间隔下限 `LAZY_LOAD_RETRY_INTERVAL_MS = 1000`。

同步 custom-elements 输出则跳过 `loadModule`，直接用 `elm.constructor`。客户端水合看宿主属性 `s-id`（`HYDRATE_ID`）。

## 实践示例

### 案例 1：最小组件 + 不可变 Prop

```tsx
@Component({ tag: "user-badge", shadow: true })
export class UserBadge {
  @Prop() name: string;
  render() {
    return <span>{this.name}</span>;
  }
}
```

**逐部分**：`tag: "user-badge"` 满足 custom element 必须含 `-` 的规则；`@Prop()` 默认从组件内部不可变，调用方改 attribute / property 才会进来；`reflect` 默认 `false`，不会自动写回 attribute。

### 案例 2：配置两类常见输出

```ts
export const config: Config = {
  namespace: "widgets",
  outputTargets: [
    { type: "dist" },
    { type: "dist-custom-elements" },
    { type: "www", serviceWorker: null },
  ],
};
```

**逐部分**：`dist` 走懒加载库形态；`dist-custom-elements` 更接近“每个组件一个可直接 `customElements.define` 的模块”；`www` 依赖 lazy 产物。具体目录与 loader 文件名以该次 `build` 为准，本文未执行编译。

### 案例 3：可变 Prop 与表单关联

```tsx
import { Component, Prop, AttachInternals } from "@stencil/core";

@Component({ tag: "qty-field", formAssociated: true })
export class QtyField {
  @Prop({ mutable: true, reflect: true }) value: number = 1;
  @AttachInternals() internals: ElementInternals;
}
```

`mutable: true` 才允许实例改自己的 `value`；`formAssociated: true` 时，运行时会代理 `formAssociatedCallback` 等表单生命周期到懒加载实例。

## 踩过的坑

1. **`tag` 不含 `-`**：规范要求 custom element 名带连字符；编译器按 `ComponentOptions.tag` 注册，不能靠类名猜。
2. **在组件里改普通 `@Prop()`**：默认不可变。内部计数要用 `@State()`，或显式 `mutable: true`。
3. **以为懒加载失败就永久死掉**：固定实现会在后续 `connectedCallback` 重试，上限 3 次、间隔至少 1s；不是“一次 import 失败就放弃且无计数”。
4. **把 `www` 和 `dist-custom-elements` 当成同一产物**：前者面向站点并等 lazy 内联，后者面向“直接定义 custom element”的库消费。
5. **仓库仍写成 `ionic-team/stencil` 且当它与 npm `gitHead` 无关**：4.44.2 的规范远程是 `stenciljs/core`，且 npm `gitHead` 与 tag 提交一致。

## 适用 vs 不适用场景

**适用**：

- 要做跨框架设计系统 / 组件库，消费者是 React、Vue、无框架混用
- 需要同一源码打出 npm dist 与可部署 www
- Node `>=16`、npm `>=7.10`，能接受装饰器 + TSX 编译模型

**不适用**：

- 只要一个框架内的页面，没有“导出 Web Component”的需求——Stencil 的编译器与输出目标是额外成本
- 必须把组件状态完全交给 React fiber / Vue 响应式，而不是 custom element 属性
- 需要本文未测量的包体积或首屏对比数字

## 固定版本边界

- 本文绑定 `stenciljs/core@7a8cc6e6...`，即 tag `v4.44.2` / `@stencil/core@4.44.2`。
- npm 同版本 `gitHead` 与该 tag 提交相同。
- 引擎：Node `>=16.0.0`，npm `>=7.10.0`。`package.json` 声明 MIT。
- 输出目标字符串包括 `www`、`dist`、`dist-custom-elements`、`dist-hydrate-script`、`dist-lazy`、`dist-lazy-loader`、`dist-collection` 以及 docs/types。
- 本文未安装依赖、未跑 `stencil build` / 上游测试 / hydrate，状态保持 `UNVERIFIED`。

## 学到什么

1. **框架组件和 Web Component 不是同一层**：Stencil 把框架 DX（TSX、装饰器）编译掉，留下浏览器原语
2. **宿主元素 ≠ 实现类**：懒加载把“标签已经在 DOM 里”和“类代码尚未到来”拆开，用 `hostRef` 接住
3. **输出目标是产品形态，不是目录别名**：`www` 依赖 lazy 完成，顺序写进编译器
4. **默认 Prop 合同偏“外来数据”**：不可变、默认不 reflect，和“组件自己改自己的属性”相反

## 应用型自测

1. 懒加载组件 `import()` 连续失败时，固定 4.44.2 最多再试几次？
2. `@Prop()` 不写选项时，组件内部赋值会按默认合同被当成合法更新吗？
3. `www` 输出为什么要等 lazy output 写完？

检查点：

1. 最多 3 次（`MAX_LAZY_LOAD_RETRIES`），不是无限重试。
2. 不会。默认 Prop 从组件内部不可变，除非 `mutable: true`。
3. `www` 要把 lazy 入口内联进 `index.html`，`generateOutputTargets` 因此先等 lazy 完成。

## 延伸阅读

- 文档：[stenciljs.com/docs](https://stenciljs.com/docs)
- 固定源码：[stenciljs/core](https://github.com/stenciljs/core) —— 本文绑定提交 `7a8cc6e60b7c92cffd907569886c97202153d6a0`
- [[qwik]] —— 同样用编译器切代码，但恢复模型是 QRL + JSON，不是 custom element
- [[ionic-framework]] —— 大量 UI 零件由 Stencil 编成 Web Component
- [[capacitor]] —— 常和 Ionic / Stencil 组件一起进原生壳

## 关联

- [[qwik]] —— 编译器 UI 对照组：resume HTML vs custom element
- [[ionic-framework]] —— Stencil 最知名的下游设计系统
- [[capacitor]] —— Web 组件装进原生 WebView 的壳
- [[react]] / [[vue]] —— 常见的 Stencil 组件消费者，而不是编译目标

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[qwik]] —— Qwik — 用 resume 代替 hydrate 的编译器 UI
