---
title: Wouter — 用 hooks 和 regexparam 拼起来的最小 React 路由器
description: 介绍 wouter 3.9.0 如何用 location hook、regexparam 匹配和 Switch 首个命中组织 React / Preact 路由。
来源: https://github.com/molefrog/wouter
日期: 2026-08-27
分类: 路由库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/molefrog/wouter
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9f7645688909605e47fb49455c885ca6f26d5762
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.9.0
---

## 是什么

Wouter 是一个面向 React（另有 Preact 包）的小型客户端路由器。日常类比：不像火车站总控台那样先铺完整线路图，它更像口袋指南针——你只问“现在在哪、这一步往哪走”，匹配和跳转都挂在 hooks 上。

你写：

```jsx
import { Route, Switch, Link } from "wouter";

export function App() {
  return (
    <Switch>
      <Route path="/users/:id">{(params) => <User id={params.id} />}</Route>
      <Route path="/">Home</Route>
    </Switch>
  );
}
```

`<Route>` 用当前 location 做一次 `matchRoute`；不匹配就返回 `null`。`<Switch>` 按子节点顺序取**第一个**命中。固定 3.9.0 的默认 location hook 是 `useBrowserLocation`，路径解析默认走依赖 `regexparam` 的 `parse`，不是仓库根上的测试依赖 `path-to-regexp`。

## 为什么重要

不理解 wouter 把“读 URL”和“匹配路径”拆开，就解释不了下面几件事：

- 为什么换 hash 路由只要给 `<Router hook={useHashLocation}>`，不必重写 `Route`
- 为什么嵌套路由靠 `nest` 再挂一层 `base`，而不是再编译一棵文件路由树
- 为什么 `<Link to="~/login">` 能跳出当前 `base`
- 为什么空的 `setSearchParams` 仍会在地址栏留下 `?`

相对 [[tanstack-router]] 的类型化路由树，wouter 把合同压到 hook + 组件；相对 [[navaid]]，它把同一套匹配嵌进 React 渲染，而不是全局 `listen()`。

## 核心要点

固定 3.9.0 的主链可以拆成五步：

1. **默认路由器是一份可覆盖对象**：`defaultRouter` 带 `hook`、`searchHook`、`parser`、`base`、`ssrPath` / `ssrSearch`、`hrefs`、`aroundNav`。`<Router>` 把这些选项放进 context；若传入自定义 `hook`，继承源改成 `defaultRouter`，不继续叠父级定制。

2. **读位置是 subscribe，不是自己轮询**：`useBrowserLocation` 用 `useSyncExternalStore` 订 `popstate` / `pushState` / `replaceState` / `hashchange`。模块加载时若 `window[Symbol.for("wouter_v3")]` 尚未设置，会给 `history.pushState` / `replaceState` 打补丁并派发同名 `Event`。

3. **匹配是 `regexparam` 或裸正则**：`matchRoute(parser, route, path, loose)` 见到 `RegExp` 就跳过 parse；否则 `parser(route || "*", loose)`。命中后把 named keys 和捕获数组合并成 params 对象。`nest` 打开 loose 模式，第三返回值 `$base` 交给嵌套 `<Router base>`。

4. **Switch 只评一次**：`flattenChildren` 摊平 Fragment 后，第一个带真值 `path` 且 `matchRoute` 成功的元素会被 `cloneElement(..., { match })`。子 `Route` 收到 `match` 就不再自己算。

5. **Link 的 `~` 表示绝对应用路径**：`hrefs` 默认原样返回。`to` 以 `~` 开头时去掉波浪线，不再拼 `router.base`。`className` 若是函数，参数是“当前相对 path 是否等于 target”。

## 实践示例

### 案例 1：同一套 Route，换 location hook

```jsx
import { Router, Route } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { memoryLocation } from "wouter/memory-location";

<Router hook={useHashLocation}>
  <Route path="/about">About</Route>
</Router>

const memory = memoryLocation({ path: "/preview", record: true });
<Router hook={memory.hook} searchHook={memory.searchHook}>
  <Route path="/preview">Preview</Route>
</Router>
```

`useHashLocation.hrefs` 会把链接写成 `#/about`。`memoryLocation` 用 `mitt` 发 `navigate`；`record: true` 才保留可 `reset` 的数组。固定 3.9.0 的 memory hook **没有** `state` 字段。

### 案例 2：`nest` 把剩余路径交给子路由器

```jsx
<Route path="/app" nest>
  <Route path="/settings">Settings</Route>
</Route>
```

loose 匹配 `/app` 时 `$base` 是已吃掉的前缀。外层 `Route` 在命中后渲染 `<Router base={$base}>`，内层看到的相对 path 从 `/settings` 起算。`relativePath` 发现当前 URL 不属于 `base` 时，会返回 `~/...` 这种逃逸形式。

### 案例 3：`useSearchParams` 总会拼上问号

```jsx
const [params, setSearchParams] = useSearchParams();
setSearchParams(new URLSearchParams());
```

固定 3.9.0 的实现是 `navigate(location + "?" + tempSearchParams)`。`URLSearchParams` 空串仍会留下 `?`。本页未跟踪 npm 上名为 `3.10.0`、源码 `package.json` 仍写 `3.9.0` 的后续提交。

## 踩过的坑

1. **把根仓库的 `path-to-regexp` 当成运行时匹配器**：它出现在 monorepo 根 `devDependencies`，给测试用。运行时 `parser` 默认是 `regexparam` 的 `parse`。
2. **给嵌套 `<Router hook={...}>` 以为能叠父级选项**：传入自定义 `hook` 时，继承源改回 `defaultRouter`，父级 `base` / `parser` 不会接着传。
3. **把 `Switch` 当成会渲染多个 Route**：它只返回第一个命中，其余不渲染。
4. **清空 search 时期待 URL 干净**：3.9.0 仍会写下 `?`。
5. **把 README 的 ~1.5KB / size-limit 数字当成本轮测量**：本轮未安装依赖、未跑 `size-limit`、未测 gzip。

## 适用 vs 不适用场景

**适用**：

- React / Preact 应用只要 hooks 路由，不需要编译期路由树
- 需要浏览器、hash、memory 三套 location 可替换
- 能接受运行时字符串匹配，而不是 [[tanstack-router]] 那种 path 字面量类型

**不适用**：

- 路径必须在编译期变成类型——看 [[tanstack-router]]
- 不要 React，只要拦截 `<a>` 和 `history`——看 [[navaid]]
- 需要框架级 loader / SSR 约定——[[remix]] / [[next-js]] 的合同更宽
- 不能接受“源码 tag 3.9.0 与 npm latest 3.10.0 不是同一提交”

## 固定版本边界

- 本文绑定 `molefrog/wouter@9f7645688909605e47fb49455c885ca6f26d5762`，GitHub tag `v3.9.0`，`packages/wouter/package.json` 版本为 `3.9.0`。
- npm `wouter@3.9.0` 的 `gitHead` 是更早的 `e8726aa807a600688709059a524d3461291e30da`（该提交是 tag 的祖先）；npm `wouter@3.10.0` 的 `gitHead` 是 `708c23639d4174ba7deda06c40c8208118899da7`，canonical remote **没有** `v3.10.0` tag，且该提交里包版本仍写 `3.9.0`。
- 运行时依赖是 `regexparam`、`mitt`、`use-sync-external-store`；`peerDependencies.react` 为 `>=16.8.0`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **location 是可替换 hook，匹配是另一层**——换 hash / memory 不必重写 `Route`。
2. **Switch 是线性首个命中，不是路由表编译器**——`match` 属性用来避免子节点再算一遍。
3. **`nest` 用 loose `$base` 叠 Router，而不是文件路由 codegen**。
4. **发布名和源码 tag 可以对不齐**——读 npm `gitHead` 前先核 tag 与 `package.json`。

## 应用型自测

1. 默认 `matchRoute` 在 `path` 为空时会拿什么模式去 parse？
2. `<Link to="~/admin">` 在 `base="/app"` 的 Router 里，拼出的 href 会不会带 `/app`？
3. 固定 3.9.0 里 `setSearchParams(new URLSearchParams())` 之后，navigate 的目标是否仍含 `?`？

检查点：

1. `"*"`。`parser(route || "*", loose)`。
2. 不会。`~` 会切掉前缀，不再拼接 `router.base`。
3. 会。实现是 `location + "?" + tempSearchParams`。

## 延伸阅读

- 文档：[github.com/molefrog/wouter](https://github.com/molefrog/wouter)
- 固定源码：[molefrog/wouter](https://github.com/molefrog/wouter) —— 本文绑定提交 `9f7645688909605e47fb49455c885ca6f26d5762`
- [[navaid]] —— 无 React、靠 `listen()` 补丁和点击代理的对照
- [[tanstack-router]] —— 类型化路由树对照

## 关联

- [[navaid]] —— 同一“小路由器”谱系，但 API 是工厂 + 事件，不是 hooks
- [[tanstack-router]] —— 编译期 path 类型与 loader 对照
- [[react]] —— peer 最低线 16.8 hooks
- [[preact]] —— `wouter-preact` 工作区对照
- [[remix]] —— 框架模式路由，不是 2KB hooks 库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
