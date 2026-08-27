# Metaframework source review (writer DP)

> 用途：记录 AnalogJS、SolidStart 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer DP
- evidence：GitHub metadata、npm latest 对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、e2e、Nitro preset、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- page status：仓库原先没有 `analogjs` / `solid-start` slug，本轮新建两页，而不是改写既有正文
- forbidden overlap：未修改 remix、gatsby、nuxt、sveltekit、astro、solid、next-js、qwik 既有正文

## AnalogJS

- canonical source：`https://github.com/analogjs/analog`
- revision：`0896a7eaaa2acf26443ca184bc1dd9aa1a06f4d6`
- release：lightweight tag `v2.7.1` 直接指向该提交（"chore: release 2.7.1 [skip ci]"）
- packages：`@analogjs/platform@2.7.1`、`@analogjs/router@2.7.1`、`@analogjs/vite-plugin-nitro@2.7.1`、`@analogjs/vite-plugin-angular@2.7.1`、`@analogjs/content@2.7.1`
- inspected：
  - 根 `package.json`、`packages/platform/src/lib/platform-plugin.ts`
  - `packages/platform/src/lib/router-plugin.ts`
  - `packages/router/src/lib/routes.ts`、`routes.spec.ts`
  - `packages/router/src/lib/route-config.ts`、`inject-load.ts`、`provide-file-router.ts`
  - `packages/router/server/src/render.ts`、`server-fn/server-fn.ts`
  - `packages/vite-plugin-nitro/src/lib/vite-plugin-nitro.ts`
  - `packages/vite-plugin-nitro/src/lib/utils/get-page-handlers.ts`
  - `packages/create-analog/template-latest/vite.config.ts`、`src/main.server.ts`
  - `apps/analog-app/src/app/pages/(home).page.ts`、`(home).server.ts`
- observed：
  - `platformPlugin()` 默认 `ssr: true`，按 Nitro → router/content globs → Angular compiler 组装；
  - 页面主约定是 `src/app/pages/**/*.page.ts`，同时保留 `app/routes/**/*.ts`；layout 是“带孩子的父文件”，没有 `layout.ts` 文件名；
  - `[id]` → `:id`，`[...slug]` → `**`，`(group)` 从 URL 剥掉；
  - 页面数据在并列 `*.server.ts` 的 `load`/`action`，由 Nitro 挂到 `/_analog/pages/...`，`toRouteConfig()` 注入 `resolve.load` 再 HTTP GET；`injectLoad()` 读 `route.data['load']`；
  - SSR 入口模板为 `export default render(App, config)`；流式要 `renderStream` + `experimental.streaming` 且 Angular major ≥ 21；
  - 服务器包名是 `@analogjs/vite-plugin-nitro`（`nitropack ^2.13.1`），不是 `@analogjs/nitro`；
  - `serverFn` 走 `/_analog/fn/:id`，带 `input` 时必须 POST；
  - 根 `engines.node` 为 `^22.22.3 || ^24.15.0 || ^26.0.0`；`@analogjs/router` 对 `@angular/core` peer 为 `^17`–`^22`。
- provenance note：
  - npm `@analogjs/platform@2.7.1` / `@analogjs/router@2.7.1` 的 `gitHead` 与 tag 提交一致；
  - 上游同时发布 `v3.0.0-alpha.*`，本页不绑定 3.x；
  - 默认分支现为 `beta`，本文只跟 `v2.7.1` 解引用提交。

## SolidStart

- canonical source：`https://github.com/solidjs/solid-start`
- revision：`5d23efbcbb47997a70978be8b0e468df50d774a8`
- release：annotated tag `@solidjs/start@2.0.4` 解引用到该提交（"chore: release (#2310)"）
- package：`packages/start` 的 `@solidjs/start@2.0.4`；`engines.node >=24`；peer `vite ^8 || ^9`，可选 `@solidjs/router >=0.16.0 <2.0.0-0`
- inspected：
  - 根 `package.json`、`packages/start/package.json`、`CHANGELOG.md`
  - `packages/start/src/config/index.ts`、`fs-router.ts`
  - `packages/start/src/server/handler.ts`、`routes.ts`、`StartServer.tsx`
  - `packages/start/src/fns/handler.ts`、`client.ts`、`server.ts`、`registration.ts`
  - `packages/start/src/directives/compile.ts`、`router.tsx`、`middleware/index.ts`
  - `apps/fixtures/basic/vite.config.ts`、`src/app.tsx`、`src/entry-server.tsx`
  - `apps/fixtures/notes/src/lib/api.ts`
- observed：
  - v2 用 Vite Environment API 替换 Vinxi；包依赖是 h3、srvx、radix3、seroval、vite-plugin-solid；Nitro 只出现在 fixture 的 `vite.config.ts`；
  - `solidStart()` 必须找到 `{appRoot}/app.{tsx,jsx}`；默认 `ssr: true`、`serialization.mode: "json"`；
  - `createHandler` 先匹配 `/_server`，再 `matchAPIRoute`，最后 `createPageEvent` 渲染；默认 mode 为 `"stream"`；
  - `"use server"` 编成 `createServerReference`；客户端 POST `{BASE_URL}_server`；无 request event 时 throw；
  - `query` / `action` / `preload` 来自 `@solidjs/router`；Start 提供 RPC 与 single-flight 重跑；
  - API 路由禁止 optional param；非 GET 必须返回值；
  - SPA（`ssr: false`）改 alias 到 `server/spa` / `client/spa`。
- provenance note：
  - npm `@solidjs/start@2.0.4` 无 `gitHead`，不以 registry 反推提交；
  - 绑定依据是 GitHub annotated tag 解引用到 `5d23efbc...`。
