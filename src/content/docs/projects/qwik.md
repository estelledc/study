---
title: Qwik — 用 resume 代替 hydrate 的编译器 UI
来源: https://github.com/QwikDev/qwik
日期: 2026-05-29
分类: UI 框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/QwikDev/qwik
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 971465f941e44e5adf2b2c2e44566b590d0990d8
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.20.0
---

## 是什么

Qwik 是一套**把组件和事件处理函数编译成可延迟加载的 QRL（Qwik URL）**、再用 HTML 属性与一份 JSON 快照把应用“暂停/恢复”的 UI 框架。日常类比：打开一本厚书时，不是先把全书背进脑子（hydrate），而是书签已经夹在每一页——翻到哪一页，才把那一页的字读进来。

固定 1.20.0 的公开包名仍是 `@builder.io/qwik` / `@builder.io/qwik-city`。你写：

```tsx
import { component$, useSignal } from "@builder.io/qwik";

export const Counter = component$(() => {
  const count = useSignal(0);
  return (
    <button onClick$={() => count.value++}>
      Count: {count.value}
    </button>
  );
});
```

`$` 后缀不是装饰，是给 Optimizer 的边界标记：`component$` 等于 `componentQrl($(renderFn))`，`onClick$` 同样被抽成独立 QRL。首屏 HTML 上看到的是 `on:click="...#symbol"`，不是旧文里的 `q:click`。

## 为什么重要

不理解 Qwik 的 resume 合同，下面这些事都会讲错：

- 为什么“客户端不必重跑整棵 component tree 才能绑事件”——事件 URL 已经写在 DOM 上
- 为什么 `$` 少写一个，懒加载边界就消失，处理函数可能被打进当前 chunk
- 为什么 `useTask$` 和 `useVisibleTask$` 不是 `useEffect` 的两个别名
- 为什么 Qwik City 的 `routeLoader$` 必须从当前路由的 `layout.tsx` / `index.tsx` 导出，否则组件读不到值

## 核心要点

固定 1.20.0 的主链可以拆成五步：

1. **Optimizer 抽 QRL**：任何 `foo$(firstArg)` 经 `implicit$FirstArg` 变成 `foo($(firstArg))`。`$()` 是懒加载引用，运行时是 chunk URL + `#symbol`。

2. **序列化进 HTML**：SSR/pause 把监听器写成 `on:<event>`（窗口/文档是 `on-window:` / `on-document:`），容器带 `q:container="paused"`、`q:base`、`q:manifest-hash`；对象图放进 `script[type="qwik/json"]`。

3. **qwikloader 恢复执行**：文档级捕获监听。用户点按钮时，loader 读 `on:click`，按 `q:base` 拼 URL，`import()` 后取 hash symbol；以 `#` 开头的同步 QRL 则走 `qFuncs_<q:instance>[n]`。

4. **细粒度状态**：`useSignal` 用 `useConstant` 把 signal 钉在组件顺序作用域里，函数初值只算一次。只有读过 `.value` 的地方参与更新。

5. **任务分两条时间轴**：`useTask$` 在当前渲染（含 SSR）里 `waitAndRun`；`useVisibleTask$` 默认 `strategy: "intersection-observer"`，注册 `qvisible`。客户端首次创建时还会 `$resolveLazy$` 并 `notifyTask`。

## 实践示例

### 案例 1：计数器如何变成 `on:click` URL

上面的 `Counter` 编译后，button 上是类似 `on:click="./chunk.js#onClick_xxx"` 的属性。`qwikloader` 的 `dispatch` 读这个属性，按行拆多条 QRL，再动态 import。SSR 单测把同类属性写成 `on:click="/runtimeQRL#_"`，用来锁定属性名。

**逐部分**：`component$` 切整个渲染函数；`onClick$` 再切 handler；`useSignal(0)` 的值进入 pause 快照，resume 时不必重跑 `component$` 才能拿到 `count`。

### 案例 2：Qwik City 的 `routeLoader$`

```tsx
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

export const useArticles = routeLoader$(async () => {
  return [{ title: "Ada" }];
});

export default component$(() => {
  const articles = useArticles();
  return <ul>{articles.value.map((a) => <li>{a.title}</li>)}</ul>;
});
```

**逐部分**：`routeLoader$` 必须从该路由的 `layout.tsx` / `index.tsx` 导出。请求处理在 `actionsMiddleware` 里跑 loader，结果写入 request loader 表；组件通过 `RouteStateContext` 按 id 取。漏导出时，固定实现会抛“was invoked in a route where it was not declared”。

### 案例 3：`useTask$` 对 `useVisibleTask$`

```tsx
useTask$(({ track }) => {
  const n = track(count);
  // SSR 和客户端当前渲染都会跑
});

useVisibleTask$(() => {
  const id = setInterval(() => count.value++, 500);
  return () => clearInterval(id);
}); // 默认等元素进入视口（qvisible）
```

`useTask$` 的 `eagerness` 只在服务端路径上额外注册客户端监听；默认任务本身已经在当前渲染执行。可见任务默认不是 `document-ready`。

## 踩过的坑

1. **把属性名写成 `q:click`**：固定 1.20.0 的事件前缀是 `on:`（`EventPrefix`）。按旧教程找 `q:click` 会对不上 DOM。
2. **漏写 `$`**：Optimizer 只抽 `$` / `foo$` 的第一参。少写则 QRL 边界不存在，函数留在当前模块。
3. **把 `useVisibleTask$` 当普通 `useEffect`**：默认跟视口交叉；`document-ready` / `document-idle` 才对应 `qinit` / `qidle`。客户端首次创建还会立即 `notifyTask`，和“只在看见时跑一次”的直觉不完全一样。
4. **复用 loader 却不从路由文件再导出**：库里的 `routeLoader$` 必须在当前 `layout.tsx` / `index.tsx` 重导出，否则上下文里没有这个 id。
5. **把 2.0 beta 包名当成 1.20.0 合同**：`@qwik.dev/core@2.0.0-beta.x` 是另一条线；本文绑定的导入仍是 `@builder.io/qwik`。

## 适用 vs 不适用场景

**适用**：

- 内容站、营销页、编辑器预览——首屏 HTML 已在，交互点稀疏
- 需要把“下载哪段 JS”推迟到真实事件的站点
- 能接受 `$` 语法与 Qwik City 文件路由约定，Node 满足 `>=16.8.0 <18.0.0 || >=18.11`

**不适用**：

- 几乎每个控件都会立刻交互的重型 SPA——QRL 切分变成组织成本
- 必须直接复用大量 React 组件树，又不接受桥接层
- 团队要把 `@qwik.dev/core` 2.0 beta 的 API 写进 1.20.0 笔记
- 需要本文未测量的“比 React 小 100 倍”这类结论

## 固定版本边界

- 本文绑定 `QwikDev/qwik@971465f9...`，即 annotated tag `@builder.io/qwik@1.20.0` 的 peeled commit；同提交上 `@builder.io/qwik-city` 也是 `1.20.0`。
- npm `@builder.io/qwik@1.20.0` 未提供 `gitHead`；以 GitHub tag peel 为准。
- npm 上 `@qwik.dev/core` 的 latest 是 `2.0.0-beta.42`，不在本文适用版本内。
- 引擎：`node >=16.8.0 <18.0.0 || >=18.11`。许可为 MIT。
- 本文未安装依赖、未跑 Optimizer/测试/bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **hydrate 不是恢复 UI 的唯一合同**——把监听器写成 URL、把对象图写成 JSON，客户端可以先不重跑 render
2. **编译期标记换运行时探测**：`$` 侵入语法，换来 chunk 边界确定
3. **默认策略必须读源码**：`useVisibleTask$` 的默认不是 document load
4. **框架约定是运行时的一部分**：loader 不重导出就没有值，不是类型问题

## 应用型自测

1. 固定 1.20.0 把 click handler 序列化成 `q:click` 还是 `on:click`？
2. `useVisibleTask$` 不传 `strategy` 时，qwikloader 监听的是哪个自定义事件？
3. 把 `routeLoader$` 写在 `lib/articles.ts` 却不从路由 `index.tsx` 导出，组件里调用会怎样？

检查点：

1. `on:click`。`qwikloader` 拼的是 `on` + infix + `:` + event。
2. `qvisible`（`intersection-observer` → `useOn('qvisible', ...)`）。
3. 抛错：该 id 不在 `RouteStateContext` 里。

## 延伸阅读

- 概念：[qwik.dev/docs/concepts/resumable](https://qwik.dev/docs/concepts/resumable/)
- 固定源码：[QwikDev/qwik](https://github.com/QwikDev/qwik) —— 本文绑定提交 `971465f941e44e5adf2b2c2e44566b590d0990d8`
- [[stencil]] —— 另一条“编译期切 Web 组件”的路线，产物是 Custom Element
- [[solid]] —— 同样用 signal，但仍走客户端挂载/水合
- [[react]] —— hydrate 模型的对照组

## 关联

- [[stencil]] —— 编译器产出标准 custom element；Qwik 产出可 resume 的 QRL HTML
- [[solid]] —— signal 同路，恢复模型不同
- [[svelte]] —— 编译期决定更新，但不是 resumable
- [[vite]] —— Qwik City 开发/构建默认建立在 Vite 上
- [[react]] —— 全树水合对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
