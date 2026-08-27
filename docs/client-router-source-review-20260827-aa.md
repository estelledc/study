# Client router source review AA

> 用途：记录 React Router、TanStack Router 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer AA
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、dev server、SSR、RSC、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target pair：`react-router`（仓库内原先无此 slug，本轮新建）与 `tanstack-router`
- forbidden overlap：未修改 A–Z 已占用或开放 PR 中的 slug（含 `zustand`、`jotai`、`tanstack-query`、`swr`、`react-hook-form`、`tanstack-form`、`mcp-ts-sdk`、`ollama`、`aichat`、`shell-gpt`、`haystack`、`langfuse`）

## React Router

- canonical source：`https://github.com/remix-run/react-router`
- revision：`2edaca7a4f12a50cad002d55d84f73b0cdd462b6`
- release tag / package：`react-router@8.3.0` / `react-router@8.3.0`
- inspected：
  - `packages/react-router/package.json`
  - `packages/react-router/index.ts`
  - `packages/react-router/lib/router/router.ts`
  - `packages/react-router/lib/router/utils.ts`
  - `packages/react-router/lib/dom/lib.tsx`
  - `packages/react-router/lib/href.ts`
  - `packages/react-router/lib/types/register.ts`
  - `packages/react-router/lib/server-runtime/server.ts`
  - `packages/react-router/CHANGELOG.md`
- observed：
  - 固定 8.3.0 把 data router、DOM Link/Form、SSR、server-runtime、cookie/session 收进同一个 `react-router` 包；条件导出含 `"."`、`"./dom"` 与 `react-server`；
  - `createBrowserRouter` 用 browser history 调用内部 `createRouter(...).initialize()`，默认 `dataStrategy` 为 `defaultDataStrategyWithMiddleware`：无 middleware 时并行 `resolve()` 所有 `shouldLoad` match，有则先走 client middleware pipeline；
  - `matchRoutes` 先 `flattenAndRankRoutes` 再按排名分支匹配；
  - 默认 `shouldRevalidate`：call-site 布尔优先；4xx/5xx action 跳过；forced revalidation / 同 URL / search 变化 / 新 route instance 为 true，否则 false；search 变化会让其余 loader 默认重跑；
  - `href()` 读取 `Register.pages` 做路径字面量与 params 形状；未做 typegen 时退化为宽松 `AnyPages`；path 编码按 RFC 3986 path-segment，而不是 `encodeURIComponent`；
  - `createRequestHandler(build)` 把 framework `ServerBuild` 编成 `createStaticHandler`，并走 single-fetch / turbo-stream 文档与 data 请求；
  - 声明式 `BrowserRouter` / `Routes` / `Route` 仍从同一包导出；
  - `peerDependencies.react` 为 `>=19.2.7`，`engines.node` 为 `>=22.22.0`，运行时依赖只有 `cookie-es`。
- provenance：
  - GitHub lightweight tag `react-router@8.3.0` 与 `create-react-router@8.3.0` 同指 `2edaca7a4f12a50cad002d55d84f73b0cdd462b6`；
  - npm `react-router@8.3.0` 版本一致，但 metadata 不暴露可比的 `gitHead`；
  - npm `react-router-dom` 在查询时 latest 仍为 `7.18.2`，不存在 `8.3.0` 包版本；v8 DOM API 在 `react-router` 本包。

## TanStack Router

- canonical source：`https://github.com/TanStack/router`
- revision：`a5a5bacc8fdf30b7823caf0a94908c3e0db27aa2`
- packages：`@tanstack/react-router@1.170.32`、`@tanstack/router-core@1.171.27`
- companion packages at the same commit（版本号不同）：`@tanstack/router-plugin@1.168.35`、`@tanstack/router-generator@1.167.33`、`@tanstack/react-router-ssr-query@1.167.1`
- inspected：
  - `packages/react-router/package.json`
  - `packages/react-router/src/router.ts`
  - `packages/react-router/src/route.tsx`
  - `packages/react-router/src/index.tsx`
  - `packages/router-core/package.json`
  - `packages/router-core/src/router.ts`
  - `packages/router-core/src/route.ts`
  - `packages/router-core/src/fileRoute.ts`
  - `packages/router-core/src/validators.ts`
  - `packages/router-core/src/link.ts`
  - `packages/router-plugin/package.json`
  - `packages/router-plugin/skills/router-plugin/SKILL.md`
  - `packages/router-generator/tests/generator/virtual/routeTree.snapshot.ts`
  - `packages/react-router-ssr-query/package.json`
- observed：
  - React adapter 的 `createRouter` 构造 `Router`，后者继承 `RouterCore` 并注入 store factory；`RouterCore` 构造函数本身标为 deprecated；
  - `RouterCore` 默认：`defaultPreloadDelay=50`、`defaultPendingMs=1000`、`defaultPendingMinMs=500`、`notFoundMode='fuzzy'`、`caseSensitive=false`、`stringifySearch/parseSearch` 走默认 search parser；
  - `validateSearch` 接受 `'~standard'`、`.parse` 或函数；`'~standard'.validate` 若返回 Promise，运行时抛 `SearchParamError('Async validation not supported')`；
  - `FileRoutesByPath` 与 `Register` 是给 codegen / module augmentation 用的空接口；generator 快照写入 `declare module '@tanstack/react-router'`；plugin 默认生成 `./src/routeTree.gen.ts`；
  - 同提交的 Query 集成包名是 `@tanstack/react-router-ssr-query@1.167.1`，不是旧文里的 `@tanstack/react-router-with-query`；
  - `engines.node` 为 `>=20.19`；React peer 为 `>=18 || >=19`。
- provenance：
  - annotated tags `@tanstack/react-router@1.170.32` 与 `@tanstack/router-core@1.171.27` 都解引用到 `a5a5bacc8fdf30b7823caf0a94908c3e0db27aa2`；
  - npm 这两个包的 metadata 不暴露可比的 `gitHead`；
  - 同提交里 plugin / generator / ssr-query 的 package 版本号低于 react-router，不能把 `1.170.32` 外推到整个 monorepo。
