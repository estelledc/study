---
title: React Router — 把框架能力收进同一个路由包
description: 把 Remix 框架能力收进同一 react-router 包的客户端与全栈路由库
来源: https://github.com/remix-run/react-router
日期: 2026-05-30
分类: projects
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/remix-run/react-router
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2edaca7a4f12a50cad002d55d84f73b0cdd462b6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.3.0
---

## 是什么

React Router 8.3.0 是一个 **React 路由库 + 可选全栈框架入口**：同一份 `react-router` 包既提供浏览器 data router，也导出 SSR、request handler、cookie/session。日常类比：以前柜台（`react-router-dom`）和后厨（Remix server-runtime）是两家店；固定 8.3.0 把菜单印在同一本册子上，你按导出条件取用。

你写：

```tsx
import { createBrowserRouter, RouterProvider } from "react-router";

const router = createBrowserRouter([
  {
    path: "/posts/:postId",
    loader: ({ params }) => fetchPost(params.postId),
    Component: PostPage,
  },
]);

<RouterProvider router={router} />
```

`createBrowserRouter` 用 browser history 调用内部 `createRouter(...).initialize()`。路由器对象必须建在 React 树外，不能放进 component state。

## 为什么重要

不理解固定 8.3.0，下面这些事都会按 v6 文档推错：

- 为什么新项目 `import { Link, Form } from "react-router"`，而 npm 上没有 `react-router-dom@8.3.0`
- 为什么 React peer 是 `>=19.2.7`、Node engines 是 `>=22.22.0`
- 为什么改 `?tab=` 会让其它路由的 loader 默认重跑
- 为什么 `href("/posts/:id", { id })` 只有在 typegen 写入 `Register.pages` 后才变成硬类型

## 核心要点

固定源码的主链可以拆成五步：

1. **路由表 → ranked branches**：`matchRoutes` 先 `flattenAndRankRoutes`，再按排名匹配。动态段带静态后缀的排名在 8.3.0 changelog 里修过，不能拿更早 v7 印象外推。

2. **`createBrowserRouter` 只是 history 适配**：真正状态机是 `createRouter`。默认 `dataStrategy` 为 `defaultDataStrategyWithMiddleware`：没有 middleware 时，对所有 `shouldLoad` match 并行 `resolve()`。

3. **loader 与 action 共用 data strategy**：导航、fetcher、revalidate 都走同一套 match → strategy → `loaderData`/`actionData`/`errors`。`throw redirect()` / `data()` 是一等结果，不是业务层约定。

4. **默认 `shouldRevalidate` 比“路径变了才重拉”更宽**：call-site 布尔优先；4xx/5xx action 默认跳过；forced revalidation、同一 URL、search 变化或新 route instance 默认为 true。search 变化会让其余 loader 默认重跑。

5. **framework 入口在同一包**：`createRequestHandler(build)` 把 `ServerBuild` 编成 `createStaticHandler`，再处理 document / single-fetch。`href()` 读 `Register.pages`；没有 typegen 时类型退化为宽松 `AnyPages`。

## 实践示例

### 案例 1：data router 的 loader 在树外创建

```tsx
import { createBrowserRouter, RouterProvider, useLoaderData } from "react-router";

const router = createBrowserRouter([
  {
    path: "/posts/:postId",
    loader: async ({ params }) => {
      const post = await fetchPost(params.postId);
      if (!post) throw new Response("Not Found", { status: 404 });
      return post;
    },
    Component() {
      const post = useLoaderData();
      return <article>{post.title}</article>;
    },
  },
]);
```

声明式 `<BrowserRouter><Routes>` 仍导出，但没有 loader/action 状态机。要数据 API，必须走 `createBrowserRouter` + `<RouterProvider>`。

### 案例 2：search 变化会重跑其它 loader

```tsx
{
  path: "/posts",
  loader: () => fetchPosts(),
  children: [{ path: ":postId", loader: ({ params }) => fetchPost(params.postId) }],
}
```

从 `/posts/1` 跳到 `/posts/1?tab=comments` 时，默认 `shouldRevalidate` 因 search 变化变为 true。父列表 loader 也会重跑，除非该路由自己返回 `false`。这不是“只有 params 变才重拉”。

### 案例 3：`href` 的类型来自 Register，不是字符串魔法

```tsx
import { Link, href } from "react-router";

<Link to={href("/posts/:postId", { postId: "123" })} />
```

`href` 用 RFC 3986 path-segment 规则编码：`$ & + , ; = : @` 保持字面量，`/ ? # %`、空白与非 ASCII 仍会转义。splat `*` 按段编码并保留 `/`。没有 typegen 时，TypeScript 不会替你守住路径表。

## 踩过的坑

1. **继续装 `react-router-dom@8`**：固定审查日 npm latest 仍是 `7.18.2`，不存在 `8.3.0`。v8 的 DOM API 在 `react-router` 本包。

2. **把 v6 `useParams<{ id: string }>()` 当类型合同**：params 运行时仍是字符串表；泛型不校验 URL。

3. **以为改 query 只影响当前页**：默认策略下 search 变化会重跑其它 `shouldLoad` loader。

4. **把路由器放进 `useState` / 组件内**：文档与实现都要求在树外创建一次。

5. **把 RSC / unstable_* 写成稳定合同**：8.3.0 changelog 里多条 RSC 能力标为 unstable，本文不提升为已验证行为。

## 适用 vs 不适用场景

**适用**：

- 已接受 React 19.2+ / Node 22.22+ 的新 SPA 或 Remix 血统全栈应用
- 需要 loader/action/Form 渐进增强，而不是自己拼 fetch + 全局 cache
- 要在同一包里同时读浏览器路由和 `createRequestHandler`

**不适用**：

- 仍锁 React 18 的维护项目——固定 peer 是 `>=19.2.7`
- 必须继续使用独立 `react-router-dom@8` 包名的工具链
- 想要编译期路径补全，但不跑 framework typegen，也不接受宽松 `href` 类型
- 需要把静态阅读写成运行过的 SSR/RSC 证据

## 固定版本边界

- 本文绑定 `remix-run/react-router@2edaca7a...`，tag 与 npm 包均为 `react-router@8.3.0`。
- npm 未暴露可比 `gitHead`；`create-react-router@8.3.0` 同指该提交。
- 运行时依赖只有 `cookie-es`；条件导出区分 development/production 与 `react-server`。
- 本文未安装依赖、未跑上游测试、未做 SSR/RSC/bundle 测量，状态保持 `UNVERIFIED`。

## 学到什么

1. **包名合并不等于 API 变简单**——v8 把 Remix 能力收进 `react-router`，但 data router、声明式 router 和 framework handler 仍是三条入口。
2. **默认 revalidate 是产品决策**——search 变化重跑 loader，比“路径没变就复用”更贵，也更接近 document 请求。
3. **类型要靠 Register，不靠字符串字面量**——`href` 在未 typegen 时故意宽松。
4. **peer/engines 是硬边界**——React 19.2.7 与 Node 22.22.0 不能从 v6 文档继承。

## 应用型自测

1. 新项目要 `Link` / `Form`，固定 8.3.0 应该从哪个包 import？
2. 从 `/posts/1` 导航到 `/posts/1?tab=meta`，父路由 loader 默认会不会重跑？
3. 没有跑 typegen 时，`href("/nope/:id", { id: "1" })` 会不会被 TypeScript 拒绝？

检查点：

1. `react-router` 本包。npm 上没有 `react-router-dom@8.3.0`。
2. 会。search 变化使默认 `shouldRevalidate` 为 true。
3. 不会仅因路径不存在而拒绝；未注册 `Register.pages` 时类型是宽松的。

## 延伸阅读

- 固定源码：[remix-run/react-router](https://github.com/remix-run/react-router) —— 本文绑定提交 `2edaca7a4f12a50cad002d55d84f73b0cdd462b6`
- 文档：[reactrouter.com](https://reactrouter.com/)（library / framework 入口需按版本核对）
- [[remix]] —— 框架能力并入 React Router 之前的独立产品页
- [[tanstack-router]] —— 另一条“URL 当类型”的客户端路由合同
- [[next-js]] —— RSC 优先的另一套路由/数据边界

## 关联

- [[remix]] —— 同一作者团队；v8 把 server-runtime 收进本包
- [[tanstack-router]] —— 类型先行的客户端路由对照
- [[tanstack-query]] —— 若不用 loader，常见的客户端缓存层
- [[react]] —— 固定 peer `>=19.2.7`
- [[vite]] —— framework mode 常见打包宿主，不是本包的硬依赖

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[remix]] —— Remix — 拥抱 Web 标准的 React 全栈框架
