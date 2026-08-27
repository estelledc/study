---
title: TanStack Router — 把 URL 当类型，编译器替你守路由
来源: 'https://github.com/TanStack/router'
日期: 2026-05-30
分类: projects
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/TanStack/router
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a5a5bacc8fdf30b7823caf0a94908c3e0db27aa2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.170.32
---

## 是什么

TanStack Router 是一个 **TypeScript 路由库**：路径、params、search 和 loader data 都挂在路由树类型上。日常类比：React Router 的 `href` 要等 typegen 填 `Register`；这里 `createRoute({ path: '/posts/$postId' })` 自己就能推出 params 形状。

你写：

```tsx
import { createRoute, createRouter, RouterProvider } from "@tanstack/react-router";

const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/posts/$postId",
  loader: ({ params }) => fetchPost(params.postId),
  component: PostPage,
});

const router = createRouter({ routeTree: rootRoute.addChildren([postRoute]) });
<RouterProvider router={router} />
```

固定 1.170.32 的 `createRouter` 构造 React `Router`，它继承 `@tanstack/router-core` 的 `RouterCore`。`RouterCore` 构造函数本身标为 deprecated，应走 `createRouter`。

## 为什么重要

不理解固定源码，会把旧博客写成当前合同：

- 为什么 `<Link to="/posts/$postId">` 能补全路径，而普通 `string` 变量会让类型塌陷
- 为什么 `validateSearch` 看到 Promise 会直接抛 `SearchParamError`
- 为什么同提交里 plugin 是 `1.168.35`、ssr-query 是 `1.167.1`，不能把 `1.170.32` 套到整个 monorepo
- 为什么旧包名 `@tanstack/react-router-with-query` 不再是本 pin 的集成入口

## 核心要点

1. **`RouterCore` 持有类型化路由树**：`routeTree` 展开成 `routesById` / `routesByPath` 与 processed tree。运行时匹配路径，类型层推断 `Link` / `useParams` / `useSearch`。

2. **search 是同步 schema**：`validateSearch` 接受 Standard Schema `'~standard'`、带 `parse` 的对象，或裸函数。`'~standard'.validate` 若返回 Promise，运行时抛 `SearchParamError('Async validation not supported')`。IO 校验必须放到 `beforeLoad`。

3. **codegen 靠 module augmentation**：`FileRoutesByPath` 与 `Register` 在 core 里是空接口。`@tanstack/router-plugin` 默认生成 `./src/routeTree.gen.ts`；generator 快照写入 `declare module '@tanstack/react-router'`。同提交 plugin 版本是 `1.168.35`，不是 `1.170.32`。

4. **默认等待与 preload 是数字，不是口号**：`defaultPreloadDelay=50`、`defaultPendingMs=1000`、`defaultPendingMinMs=500`、`notFoundMode='fuzzy'`、`caseSensitive=false`。这些是构造时写入的默认值，不是测量结论。

5. **Query 集成换了包名**：本 pin 提供 `@tanstack/react-router-ssr-query@1.167.1`。旧文里的 `@tanstack/react-router-with-query` 不是这次检查到的包。

## 实践示例

### 案例 1：路径只写一次，引用处被类型守住

```tsx
const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/posts/$postId",
  loader: ({ params }) => fetchPost(params.postId),
});
```

`<Link to="/posts/$postId" params={{ postId: "1" }} />` 里漏 `postId` 或把 path 改成 `/blog/$slug`，只要 `to` 仍是字符串字面量，TypeScript 应能列出旧引用。把 path 存进 `string` 变量后，保护当场消失。

### 案例 2：search 同步校验，异步会被扔掉

```tsx
const route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/posts/$postId",
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab;
    if (tab !== "overview" && tab !== "comments") {
      throw new Error("bad tab");
    }
    return { tab };
  },
});
```

函数抛错或 Standard Schema 产出 `issues`，都会变成 `SearchParamError`。需要查权限或数据库时，应使用 `beforeLoad`，不要把 Promise 塞进 `validateSearch`。

### 案例 3：loader 只保证“路由数据”，不保证 Query 缓存

```tsx
createRoute({
  getParentRoute: () => rootRoute,
  path: "/posts/$postId",
  loader: ({ params }) => fetchPost(params.postId),
});
```

loader 可以调用任意 cache。要和 TanStack Query 的 SSR dehydrate 对齐，本 pin 检查到的是 `@tanstack/react-router-ssr-query`，不是旧 `with-query` 包名。本文未运行该集成。

## 踩过的坑

1. **`to` / `from` 必须是字面量**：存进变量后退化成 `string`，自动补全和改名清单一起失效。

2. **`validateSearch` 必须同步**：`'~standard'` 路径对 Promise 直接抛 `SearchParamError`。

3. **把 `1.170.32` 套到 plugin / ssr-query**：同提交版本分别是 `1.168.35` 与 `1.167.1`。

4. **继续写 `@tanstack/react-router-with-query`**：本 pin 的包名是 `@tanstack/react-router-ssr-query`。

5. **把 pending/preload 默认值当成性能结论**：`1000` / `50` 是源码默认，不是测量值。

## 适用 vs 不适用场景

**适用**：

- 类型敏感的客户端 SPA，路径以字面量写在仓库里
- 要把 search 当成 schema，而不是 `URLSearchParams` 字符串表
- 已接受 Node `>=20.19`，React 18 或 19

**不适用**：

- 路径必须从远端配置动态灌入——失去字面量后类型保护塌陷
- 校验必须做 IO——会被 `validateSearch` 的同步合同挡住
- 已有 React Router data/framework 应用，只想“换个包名”
- 需要把静态阅读写成已跑通的 Start / SSR 证据

## 固定版本边界

- 本文绑定 `TanStack/router@a5a5bacc...`。`@tanstack/react-router@1.170.32` 与 `@tanstack/router-core@1.171.27` 的 tag 都解引用到该提交。
- npm 未暴露可比 `gitHead`。同提交 companion 版本：plugin `1.168.35`、generator `1.167.33`、ssr-query `1.167.1`。
- React peer 为 `>=18 || >=19`；Node engines 为 `>=20.19`。
- 本文未安装依赖、未跑上游测试、未测 IDE/bundle/SSR，状态保持 `UNVERIFIED`。

## 学到什么

1. **类型可以当 UX**——补全和改名清单来自路由树，不是运行时报错。
2. **schema 协议有三层兜底**——`'~standard'`、`parse`、裸函数；异步一律不收。
3. **monorepo 版本必须按包读**——一次 release 可以发布多组不等号。
4. **集成包会改名**——Query 对齐从 `with-query` 换成了 `ssr-query`。

## 应用型自测

1. `validateSearch` 返回 `Promise.resolve({ tab: "a" })`，固定实现会怎样？
2. 同提交的 `@tanstack/router-plugin` 版本是 `1.170.32` 吗？
3. 本 pin 与 TanStack Query 的官方 companion 包名是什么？

检查点：

1. `'~standard'` 路径抛 `SearchParamError('Async validation not supported')`；裸 Promise 也不是合法同步输出。
2. 不是。同提交 plugin 是 `1.168.35`。
3. `@tanstack/react-router-ssr-query`，不是旧的 `with-query`。

## 延伸阅读

- 官方文档：[tanstack.com/router](https://tanstack.com/router/latest)
- 固定源码：[TanStack/router](https://github.com/TanStack/router) —— 本文绑定提交 `a5a5bacc8fdf30b7823caf0a94908c3e0db27aa2`
- [Standard Schema](https://standardschema.dev/) —— `validateSearch` 的 `'~standard'` 协议
- [[react-router]] —— 对照：Register/typegen vs 路由树字面量
- [[zod]] —— 常见 Standard Schema / `parse` adapter
- [[tanstack-query]] —— 数据缓存层，需另绑 ssr-query 包

## 关联

- [[react-router]] —— 同主题客户端路由，默认 revalidate 与类型来源不同
- [[tanstack-query]] —— loader 可选用的缓存，集成分包已改名
- [[tanstack-form]] —— 同源 Standard Schema 思路
- [[zod]] —— search validator 常见实现
- [[valibot]] —— 更小的 Standard Schema 实现
- [[arktype]] —— 另一套 `'~standard'` 实现
- [[remix]] —— React Router 框架模式的前身叙述
- [[vite]] —— router-plugin 的常见宿主
- [[trpc]] —— “类型即契约”在 RPC 层的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[islands-architecture]] —— Islands Architecture — 静态页面里只让需要交互的小块加载 JS
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[nivo]] —— nivo — React + d3 组件化图表
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
