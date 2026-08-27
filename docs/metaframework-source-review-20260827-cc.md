# Metaframework source review (writer CC)

> 用途：记录 Remix、Gatsby 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：CC
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、dev server、生产构建、SSR/DSG engine 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- clone strategy：blob-filtered sparse checkout；Remix 约 25MB，Gatsby 核心包约 67MB，未整仓克隆

## Remix

- canonical source：`https://github.com/remix-run/remix`
- revision：`8307662161457e1ad710bde0a52de7b7f800abbc`
- package：`remix@2.17.5` / `@remix-run/server-runtime@2.17.5` / `@remix-run/react@2.17.5`
- tag：`remix@2.17.5`（annotated tag 剥到上述 commit）
- inspected：
  - `packages/remix/package.json`
  - `packages/remix/index.ts`
  - `packages/remix-server-runtime/package.json`
  - `packages/remix-server-runtime/server.ts`
  - `packages/remix-server-runtime/single-fetch.ts`
  - `packages/remix-server-runtime/actions.ts`
  - `packages/remix-server-runtime/responses.ts`
  - `packages/remix-server-runtime/routes.ts`
  - `packages/remix-react/index.tsx`
  - `packages/remix-react/components.tsx`
  - `packages/remix-dev/config.ts`
  - `packages/remix-dev/config/flat-routes.ts`
  - `packages/remix-dev/vite/plugin.ts`
- observed：
  - the published `remix` package throws `RemixPackageNotUsedError` and tells callers to import `@remix-run/*` instead;
  - `createRequestHandler` derives routes and a React Router `StaticHandler`, then dispatches `?_data` requests, `.data` single-fetch, resource routes, or document requests;
  - `future.v3_singleFetch` defaults to `false`; when enabled, data responses use `turbo-stream` with `Content-Type: text/x-script`, and client-visible redirects use status `202`;
  - mutation document/single-fetch actions call `throwIfPotentialCSRFAttack`, comparing `Origin` with `x-forwarded-host` or `Host`;
  - `json()` / `defer()` are marked deprecated in favor of raw objects plus `data()` once single fetch is on;
  - `@remix-run/react` `Form` / `Link` wrap `react-router-dom` and add `data-discover`;
  - flat routes use `$param`, `(optional)`, and `[escape]` tokens under `app/routes`;
  - engines require `node: >=18.0.0`; server-runtime depends on `@remix-run/router@1.23.3` and `turbo-stream@2.4.1`.
- provenance：
  - GitHub annotated tag `remix@2.17.5` peels to `8307662161457e1ad710bde0a52de7b7f800abbc`;
  - npm `remix@2.17.5` and `@remix-run/node@2.17.5` do not expose `gitHead`;
  - this review therefore binds the reachable GitHub tag / package version pair.

## Gatsby

- canonical source：`https://github.com/gatsbyjs/gatsby`
- revision：`81c3b47cc8debb7f22cef971910ed368cfcada36`
- package：`gatsby@5.16.1`
- tag：`gatsby@5.16.1`（annotated tag 剥到上述 commit，与 npm `gitHead` 一致）
- inspected：
  - `packages/gatsby/package.json`
  - `packages/gatsby/src/bootstrap/index.ts`
  - `packages/gatsby/src/services/initialize.ts`
  - `packages/gatsby/src/services/source-nodes.ts`
  - `packages/gatsby/src/services/create-pages.ts`
  - `packages/gatsby/src/commands/build.ts`
  - `packages/gatsby/src/utils/page-mode.ts`
  - `packages/gatsby/src/utils/engines-helpers.ts`
- observed：
  - `bootstrap` is `initialize` → `customizeSchema` → `sourceNodes` → `buildSchema` → `createPages` → `extractQueries` → `writeOutRedirects` → `postBootstrap`;
  - `gatsby build` then runs `onPreBuild`, writes requires, builds the production webpack JS/CSS bundle, builds an HTML renderer, optionally builds rendering engines, and runs only SSG dirty queries before HTML generation;
  - page mode is `SSR` when the template exports `serverData`, `DSG` when `config().defer` or `page.defer` is true, otherwise `SSG`; `/404.html` and `/500.html` are forced to SSG;
  - rendering engines are generated only during `gatsby build` after a non-SSG page or `serverData`/`config` feature is observed;
  - `GATSBY_QUERY_ON_DEMAND` is deleted unless the executing command is `develop`;
  - adapters restore cache only when `gatsby_executing_command === "build"`;
  - engines require `node: >=18.0.0 <26`; React peer is `^18 || ^19`.
- provenance：
  - GitHub tag `gatsby@5.16.1`, npm `gitHead`, and `packages/gatsby/package.json` version all identify `81c3b47cc8debb7f22cef971910ed368cfcada36`.
