---
title: Gatsby — 用 GraphQL 数据层在构建期生成 React 站点
description: Pinned Gatsby v5 builds a GraphQL node layer, then generates React pages as SSG, DSG, or SSR.
来源: https://github.com/gatsbyjs/gatsby
日期: 2026-08-27
分类: Meta 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/gatsbyjs/gatsby
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 81c3b47cc8debb7f22cef971910ed368cfcada36
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.16.1
---

## 是什么

Gatsby 5.16.1 是一个把插件源数据先收成 GraphQL 节点、再按页面查询结果生成 React 站点的元框架。日常类比：它更像夜间印刷厂，而不是 Remix 那种每个请求现炒的窗口——`gatsby build` 先把稿件（nodes）齐套、拼版（schema / pages / queries），再印出 `public/` 里的静态页；只有导出了 `serverData` 或打开 defer 的页，才会额外打一套运行时引擎。

你写：

```js
// gatsby-node.js
exports.createPages = async ({ actions, graphql }) => {
  const { data } = await graphql(`{ allMdx { nodes { slug } } }`);
  for (const node of data.allMdx.nodes) {
    actions.createPage({
      path: `/blog/${node.slug}/`,
      component: require.resolve("./src/templates/post.js"),
      context: { slug: node.slug },
    });
  }
};
```

固定版本的 `bootstrap` 会在 `createPages` 之前先 `sourceNodes` 和 `buildSchema`，所以这段 GraphQL 查的是已经物化的节点，不是请求时现去拉远程。

## 为什么重要

不读 5.16.1 的 bootstrap / build 主链，很容易把 Gatsby 说成“另一个 Next.js”：

- 为什么默认产物是静态文件，但仓库里仍有 SSR / DSG
- 为什么 `gatsby develop` 能 Query on Demand，而 `gatsby build` 会删掉这个环境变量
- 为什么不是每页都会打 Rendering Engines
- 为什么 `/404.html`、`/500.html` 不能 defer

## 构建架构与流程

`packages/gatsby/src/bootstrap/index.ts` 的主链是：

```text
initialize
  → customizeSchema
  → sourceNodes
  → buildSchema
  → createPages
  → extractQueries
  → writeOutRedirects
  → postBootstrap
```

`gatsby build` 在 bootstrap 之后继续：

1. **`onPreBuild`**：插件最后一次在打包前改状态。
2. **webpack JS/CSS**：`buildProductionBundle` 打浏览器包。
3. **HTML renderer**：另打一份给页面渲染用的 bundle。
4. **page config**：执行模板 `config()`，决定 `defer`。
5. **Rendering Engines**：仅当出现非 SSG 页或 `serverData` / `config` 特征时，才打 GraphQL engine 与 page SSR bundle。
6. **查询**：`calculateDirtyQueries` 之后只跑 `getPageMode(query) === "SSG"` 的 page query。
7. **HTML**：写出页面并清理过期产物。

页面模式在 `page-mode.ts`：模板导出 `serverData` → `SSR`；`config().defer` 或 `page.defer` → `DSG`；否则 `SSG`。状态页强制 SSG。

## 实践案例

### 案例 1：默认 SSG 页面查询

```js
import { graphql } from "gatsby";

export const query = graphql`
  query PostPage($slug: String!) {
    mdx(slug: { eq: $slug }) {
      frontmatter { title }
      body
    }
  }
`;

export default function Post({ data }) {
  return <article><h1>{data.mdx.frontmatter.title}</h1></article>;
}
```

`extractQueries` 在构建期抽出这份 query。`gatsby build` 只物化 SSG 页的 page query；SSR/DSG 把查询留给 engine。

### 案例 2：导出 serverData 变成 SSR

```js
export async function getServerData({ params }) {
  const res = await fetch(`https://api.example.com/p/${params.id}`);
  return { props: { item: await res.json() } };
}

export default function Product({ serverData }) {
  return <h1>{serverData.item.name}</h1>;
}
```

`SET_COMPONENT_FEATURES` 看到 `serverData` 后，`shouldGenerateEngines()` 才会在 build 命令下为真。没有这类页时，构建不会打引擎。

### 案例 3：config() 把单页改成 DSG

```js
export async function config() {
  return ({ params }) => ({ defer: params.slug !== "hello-world" });
}
```

`resolvePageMode` 读这份函数：`defer: true` 为 `DSG`，`false` 仍是 `SSG`。`/404.html` 与 `/500.html` 即使写了 defer 也会被打回 SSG。

## 踩过的坑

1. **把 develop 的 Query on Demand 当成生产行为**：`initialize.ts` 只在 `develop` 保留 `GATSBY_QUERY_ON_DEMAND`；build 会删掉它。
2. **以为每页都有 SSR engine**：引擎开关由 `CREATE_PAGE` / `SET_COMPONENT_FEATURES` 事件置位，全站纯 SSG 不会打。
3. **状态页想懒渲染**：源码明确忽略 404/500 的非 SSG 模式。
4. **adapter 在 develop 里恢复缓存**：`initAdapterManager` 只在 `gatsby_executing_command === "build"` 时跑。
5. **用过期的“Gatsby 只能静态”教程解释 5.x**：固定版本同时有 SSG / DSG / SSR，只是默认偏构建期。

## 适用 vs 不适用场景

**适用**：

- 内容来源多、适合先源成节点再 GraphQL 查询的文档/营销站
- 大部分页面可以构建期生成，少量页才需要 SSR/DSG
- 团队接受 webpack + Redux 内部状态机，而不是请求时 loader

**不适用**：

- 每个交互都要按 Request 跑 action / revalidation——对照 [[remix]]
- 不能接受 `node: >=18 <26` 或 React 18/19 peer
- 需要本文给出构建耗时、TBT 或托管账单结论——未运行 build

## 固定版本边界

- 本文绑定 `gatsbyjs/gatsby@81c3b47cc8debb7f22cef971910ed368cfcada36`，tag / npm `gatsby@5.16.1` / `gitHead` 一致。
- `engines.node` 为 `>=18.0.0 <26`；React peer 为 `^18 || ^19`。
- 稀疏克隆只覆盖 `packages/gatsby` 及相关核心包，未展开全部 plugin 仓。
- 未安装依赖、未跑 `gatsby build` / develop / engine，状态保持 `UNVERIFIED`。

## 学到什么

1. **数据层发生的时间决定框架气质**——Gatsby 把取数放在 bootstrap，Remix 放在 Request。
2. **模式是特征检测出来的**——`serverData` / `defer` 才会触发引擎，不是全局开关。
3. **develop ≠ build**——QoD、adapter cache、query 集合都按 `gatsby_executing_command` 分叉。
4. **状态页是特殊契约**——错误页不能按普通 DSG/SSR 推理。

## 应用型自测

1. 全站模板都没有 `serverData` / `config`，也没有 `page.defer`。`gatsby build` 会打 Rendering Engines 吗？
2. `gatsby build` 时环境里预先 export 了 `GATSBY_QUERY_ON_DEMAND=true`，固定 5.16.1 会保留它吗？
3. 某模板 `config()` 对 `/404.html` 返回 `{ defer: true }`，最终 page mode 是什么？

检查点：

1. 不会。`shouldGenerateEngines()` 需要先观察到非 SSG 特征。
2. 不会。非 `develop` 命令会 `delete process.env.GATSBY_QUERY_ON_DEMAND`。
3. 仍是 `SSG`；状态页强制覆盖。

## 延伸阅读

- 固定源码：[gatsbyjs/gatsby](https://github.com/gatsbyjs/gatsby) —— 提交 `81c3b47cc8debb7f22cef971910ed368cfcada36`
- 文档：[gatsbyjs.com/docs](https://www.gatsbyjs.com/docs)
- [[remix]] —— 请求时 loader/action 对照
- [[next-js]] —— React 元框架另一条产品线
- [[graphql-yoga]] —— 同生态的 GraphQL 运行时对照

## 关联

- [[remix]] —— 同主题的请求时数据层
- [[next-js]] —— React 全栈对照
- [[astro]] —— 内容站、更少客户端运行时
- [[webpack]] —— 生产 JS/CSS 打包器
- [[graphql-yoga]] —— GraphQL 服务端对照
