---
title: Remix — 按 Web Request 跑 loader/action 的 React 全栈框架
description: Pinned Remix v2 routes Web Request through nested loaders, actions, and React Router.
来源: https://github.com/remix-run/remix
日期: 2026-08-27
分类: Meta 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/remix-run/remix
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8307662161457e1ad710bde0a52de7b7f800abbc
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.17.5
---

## 是什么

Remix 2.17.5 是一套把 React 路由模块接到 Web `Request` / `Response` 上的全栈约定。日常类比：每个 URL 像一条公交线路，站点（嵌套路由）各自有进站清单（`loader`）和乘客改签窗口（`action`）；调度中心是 `@remix-run/server-runtime` 的 `createRequestHandler`，不是那个会立刻抛错的 `remix` 包名。

你写：

```tsx
import { useLoaderData } from "@remix-run/react";

export async function loader() {
  return { posts: await db.posts.findMany() };
}

export default function Posts() {
  const { posts } = useLoaderData<typeof loader>();
  return <ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

固定版本里 `packages/remix/index.ts` 会抛 `RemixPackageNotUsedError`，要求改从 `@remix-run/node`、`@remix-run/react` 等包导入。

## 为什么重要

不按 2.17.5 源码读，下面这些事会写成过时印象：

- 为什么 `import { json } from "remix"` 现在根本跑不起来
- 为什么 `json()` / `defer()` 被标成 deprecated，却还不是默认行为
- 为什么开了 Single Fetch 后，客户端看到的重定向状态是 `202` 而不是 `302`
- 为什么 POST 会被 `Origin` 和 `Host` / `x-forwarded-host` 对不上直接掐掉

## 请求处理架构与流程

`createRequestHandler` 先把 `ServerBuild.routes` 编成 React Router `StaticHandler`，再按 URL 分流：

```text
Request
  → derive(routes, StaticHandler)
  → /__manifest          （仅 future.v3_lazyRouteDiscovery）
  → ?_data=routeId       （旧 data request）
  → *.data               （future.v3_singleFetch）
  → resource route       （无 default 且无 ErrorBoundary）
  → document request     （HTML + loader/action）
```

1. **编译期**：`@remix-run/dev` 的 Vite plugin 读 `app/routes` 扁平约定（`$param`、`(optional)`、`[escape]`），产出 `ServerBuild`。
2. **匹配**：`matchServerRoutes` 得到嵌套 match；document 路径交给 `staticHandler.query`。
3. **数据**：默认仍走每路由 `?_data`。`future.v3_singleFetch` 默认 `false`；打开后用 `turbo-stream` 编码，`Content-Type` 为 `text/x-script`。
4. **变更**：`POST` / `PUT` / `PATCH` / `DELETE` 先跑 `throwIfPotentialCSRFAttack`。
5. **UI**：`@remix-run/react` 的 `Form` / `Link` 是 `react-router-dom` 包装，额外写 `data-discover`。

## 实践案例

### 案例 1：loader 返回对象，而不是默认 json()

```tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export async function loader({ params }: LoaderFunctionArgs) {
  const post = await db.post.findUnique({ where: { slug: params.slug } });
  if (!post) throw new Response("Not Found", { status: 404 });
  return { post };
}

export default function Post() {
  const { post } = useLoaderData<typeof loader>();
  return <article><h1>{post.title}</h1></article>;
}
```

`json()` 在固定源码里仍可用，但 `responses.ts` 标明它会在 React Router v7 移除；Single Fetch 路径鼓励直接返回对象，需要状态码/头时用 `data()`。

### 案例 2：Form 提交走进 action

```tsx
import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { Form } from "@remix-run/react";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  await sendEmail({
    name: String(formData.get("name") ?? ""),
    message: String(formData.get("message") ?? ""),
  });
  return redirect("/thanks");
}

export default function Contact() {
  return (
    <Form method="post">
      <input name="name" required />
      <textarea name="message" required />
      <button type="submit">发送</button>
    </Form>
  );
}
```

无 JS 时这是浏览器原生 POST。有 JS 时由 React Router `Form` 升级成客户端导航。服务端仍会做 Origin 校验。

### 案例 3：嵌套扁平路由并行取数

```text
app/routes/products.tsx
app/routes/products._index.tsx
app/routes/products.$id.tsx
```

访问 `/products/42` 时，layout 与详情的 loader 由 `StaticHandler` 一起解析。Single Fetch 打开后，`getSingleFetchDataStrategy` 对选中的 match 做 `Promise.all(match.resolve())`。

## 踩过的坑

1. **继续依赖 `remix` 包名**：固定 2.17.5 的 `remix` 入口只负责抛错。
2. **把 Single Fetch 当成默认**：`config.ts` 里 `v3_singleFetch` 只有显式 `true` 才启用；未设置时只打 future-flag 警告。
3. **反向代理丢掉 Host**：mutation 的 CSRF 检查需要 `Origin` 对得上 `x-forwarded-host` 或 `Host`。
4. **把 `useLoaderData` 理解成“没有 loading”**：导航中仍有 React Router 的 `useNavigation`；另有 `clientLoader`。
5. **新项目直接开 `@remix-run/*` 当长期主线**：同仓已在发 Remix 3 beta；2.17.5 是可复查的 v2 终点，不是 v3 合同。

## 适用 vs 不适用场景

**适用**：

- 需要按 URL 嵌套并行取数、表单走 Web 标准的 React 站点
- 已有 Node / Cloudflare / Deno adapter，要自己托管 Request handler
- 团队能接受 future flag 与 React Router 对齐，而不是再学一套自研数据层

**不适用**：

- 只要构建期静态页、没有运行时 Request handler——对照 [[gatsby]]
- 已经绑定 React Router v7 framework mode，不必再钉 v2 包名
- 需要在本文声称的冷启动、TPS 或包体积数字——本页没有测量

## 固定版本边界

- 本文绑定 `remix-run/remix@8307662161457e1ad710bde0a52de7b7f800abbc`，tag / 包版本为 `2.17.5`。
- npm 未提供 `gitHead`；revision 以 GitHub annotated tag 剥出的 commit 为准。
- `@remix-run/server-runtime` 依赖 `@remix-run/router@1.23.3` 与 `turbo-stream@2.4.1`；`engines.node` 为 `>=18.0.0`。
- 未安装依赖、未跑上游测试或 dev/build，状态保持 `UNVERIFIED`。

## 学到什么

1. **包名不等于运行时**——教学示例必须从真正被 handler 导入的包读起。
2. **默认合同写在 future flag 上**——v3 行为要显式打开，不能靠“社区传言已经默认”。
3. **文档请求和数据请求是两条管道**——`?_data`、`.data` 与 HTML 文档不要混成同一种 fetch。
4. **安全边界在 adapter 之外**——Origin/Host 比对是 runtime 的硬停止，不是框架文档里的可选项。

## 应用型自测

1. 新项目写了 `import { json } from "remix"`。固定 2.17.5 会怎样？
2. 未设置任何 `future` 时，客户端导航还会请求 `*.data` 吗？
3. 反向代理只转发 `X-Forwarded-Proto`、不转发 Host，POST action 会怎样？

检查点：

1. `remix` 包抛 `RemixPackageNotUsedError`，应改 `@remix-run/node` 等入口。
2. 不会。`v3_singleFetch` 默认 false，仍走 `?_data`。
3. `throwIfPotentialCSRFAttack` 在缺少可比对 Host 时中止 action。

## 延伸阅读

- 固定源码：[remix-run/remix](https://github.com/remix-run/remix) —— 提交 `8307662161457e1ad710bde0a52de7b7f800abbc`
- 文档：[remix.run/docs](https://remix.run/docs)
- [[react-router]] —— 运行时 `StaticHandler` / `Form` 的底层
- [[gatsby]] —— 构建期 GraphQL 数据层对照
- [[next-js]] —— 另一条 React 全栈约定

## 关联

- [[react-router]] —— Remix 2.17.5 把路由执行交给它
- [[gatsby]] —— 同主题的构建期数据层
- [[next-js]] —— React 元框架对照
- [[vite]] —— `@remix-run/dev` 的编译宿主
- [[astro]] —— 内容优先、少运行时 handler 的另一端
