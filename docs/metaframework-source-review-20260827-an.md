# Metaframework source review (writer AN)

> 用途：记录 Nuxt、SvelteKit 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：AN
- evidence：固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行 `nuxi` / `svelte-kit`、上游 test、dev server、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/nuxt`、`research-worktrees/sveltekit`，不进入 Git
- 避开开放 PR slug：未改 astro、next-js、solid、remix 及其他已开 PR 占用页

## Nuxt

- canonical source：`https://github.com/nuxt/nuxt`
- revision：`e2d3a3945a3459c0e3a869de85c0b53c6c214432`
- package：`nuxt@4.5.2`（同提交 `@nuxt/nitro-server@4.5.2`）
- provenance：GitHub lightweight tag `v4.5.2` 直接指向该 commit；npm `nuxt@4.5.2` 无 `gitHead`，以仓库 tag + `packages/nuxt/package.json` version 对齐
- engines：`node ^22.19.0 || ^24.11.0 || >=26.0.0`
- inspected：
  - `packages/nuxt/package.json`
  - `packages/schema/src/config/common.ts`
  - `packages/nuxt/src/pages/utils.ts`
  - `packages/nuxt/src/imports/module.ts`
  - `packages/nuxt/src/imports/presets.ts`
  - `packages/nuxt/src/app/composables/fetch.ts`
  - `packages/nuxt/src/app/composables/asyncData.ts`
  - `packages/nuxt/src/app/composables/ssr.ts`
  - `packages/nuxt/src/core/server.ts`
  - `packages/nitro-server/package.json`
  - `packages/nitro-server/src/index.ts`
- observed：
  - 未显式配置时，`srcDir` 优先解析非空 `app/`，否则退回 `rootDir`；空 `app/` 且根上已有 `app.vue` 或 `pages/` 等也会退回根目录；
  - `serverDir` 相对 `rootDir`，默认 `server/`，不跟随 `srcDir`；
  - 页面路由由 `resolvePagesRoutes` 扫描 layer `appPages`，经 `unrouting` 输出 Vue Router 4 树；
  - auto-import 默认扫描 `composables/`、`utils/`、`shared/utils`、`shared/types`，并注入 Vue reactivity 与 `useFetch`/`$fetch` preset；
  - `useFetch` 是 `createUseFetch` 的默认实例，服务端对本站相对 URL 改用 `useRequestFetch()` → `event.$fetch`；
  - 默认 `getCachedData` 在 hydrating 时读 `payload.data[key]`，`refresh:manual` / `refresh:hook` 不走 static 短路；
  - 默认 server builder 为 `@nuxt/nitro-server`，依赖 `nitropack@^2.13.4` 与 `h3@^1.15.11`；具体 preset 名单不在本仓实现。

## SvelteKit

- canonical source：`https://github.com/sveltejs/kit`
- revision：`39e8e1fbd4feba7f22dd46bfdf7335362c38de16`
- package：`@sveltejs/kit@2.70.3`
- provenance：annotated tag `@sveltejs/kit@2.70.3` 剥开后指向该 commit；npm 无 `gitHead`，以 tag object + `packages/kit/package.json` version 对齐
- engines：`node >=18.13`
- inspected：
  - `packages/kit/package.json`
  - `packages/kit/src/runtime/server/respond.js`
  - `packages/kit/src/runtime/server/page/load_data.js`
  - `packages/kit/src/runtime/server/page/actions.js`
  - `packages/kit/src/utils/exports.js`
  - `packages/kit/src/utils/exports.spec.js`
  - `packages/kit/src/core/adapt/index.js`
- observed：
  - `respond()` 处理 data/resolution/remote 后缀，并对带 form content-type 的跨站 POST/PUT/PATCH/DELETE 做 Origin CSRF 检查；
  - 页面方法集合为 `GET` / `HEAD` / `POST`；
  - `actions` 只能从 `+page.server` 导出；写进 `+page.ts` 会被导出校验拒绝；
  - `load_server_data` 跟踪 url/params/depends/parent；universal `load` 收到 server `data`；
  - form action 只要 POST 且要求 form-encoded，否则 415；命名 action 来自 `?/` 搜索参数；`default` 与命名 action 互斥；
  - `fail()` 必须 `return`，`throw fail()` 会被改写成错误；`return redirect()` / `return error()` 在 DEV 非法；
  - `adapt()` 只调用 `config.kit.adapter.adapt(builder)`；各平台 adapter 是独立包；
  - 固定提交已有 remote function 入口，本轮未展开其序列化合同；亦未绑定 `version-3` / `3.0.0-next`。
