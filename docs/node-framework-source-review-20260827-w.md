# Node framework source review (writer W)

> 用途：记录 NestJS、Koa 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL W
- evidence：GitHub metadata、npm registry `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、HTTP 服务、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/nestjs`、`research-worktrees/koa`，不进入 Git

## NestJS

- canonical source：`https://github.com/nestjs/nest`
- GitHub Release：`v11.2.3`
- revision：`2b36ee5fea13dedcedfd9815a9c193b2d21130c1`
- package：`@nestjs/core@11.2.3`（npm `gitHead` 与上述 revision 一致）
- inspected：
  - `packages/core/package.json`
  - `packages/core/nest-factory.ts`
  - `packages/core/scanner.ts`
  - `packages/core/injector/instance-loader.ts`
  - `packages/core/injector/injector.ts`
  - `packages/core/injector/instance-wrapper.ts`
  - `packages/core/injector/module.ts`
  - `packages/core/router/router-execution-context.ts`
  - `packages/core/interceptors/interceptors-consumer.ts`
  - `packages/common/constants.ts`
  - `packages/common/interfaces/scope-options.interface.ts`
  - `packages/platform-express/package.json`
  - `packages/platform-fastify/package.json`
  - `packages/platform-fastify/adapters/fastify-adapter.ts`
  - `tsconfig.json`
- observed：
  - `NestFactory.create()` 在未传入 HTTP adapter 时加载 `@nestjs/platform-express` 的 `ExpressAdapter`；
  - 启动链为 `DependenciesScanner.scan()` → `InstanceLoader.createInstancesOfDependencies()` → `applyApplicationProviders()`；
  - 构造注入读取 `design:paramtypes`，并用 `self:paramtypes` 覆盖；仓库 tsconfig 仍开 `experimentalDecorators` 与 `emitDecoratorMetadata`；
  - `Scope.REQUEST` 使 `isDependencyTreeStatic()` 为 false，并沿依赖树上浮；
  - 跨模块解析要求目标 token 同时位于 imported module 的 `exports` 与 `providers`；
  - 请求链为 guard → interceptor 包裹 → pipe → handler；
  - `@nestjs/core` 声明 Node `>= 20`；`platform-express@11.2.3` 依赖 Express `5.2.1`，`platform-fastify@11.2.3` 依赖 Fastify `5.11.3`；
  - 源码树 `package.json` 的 `gitHead` 字段仍是旧提交 `bcb4747f...`，以 npm registry 为准；
  - 审阅当日 npm `latest` 已是 `12.0.0`（`gitHead` `6494a6c2...`，对应 tag `v12.0.0`），当时没有 GitHub Release 页，本页不绑定 v12。

## Koa

- canonical source：`https://github.com/koajs/koa`
- GitHub Release：`v3.2.1`
- revision：`6984592d41946ed746f15afcb05554e073f64dad`
- package：`koa@3.2.1`（npm `gitHead` 与上述 revision 一致）
- inspected：
  - `package.json`
  - `lib/application.js`
  - `lib/context.js`
  - `lib/request.js`
  - `lib/response.js`
  - `docs/migration-v2-to-v3.md`
  - `__tests__/application/respond.test.js`
- observed：
  - CommonJS 入口为 `lib/application.js`，ESM 入口为 `dist/koa.mjs`；
  - `use()` 只接受 function；默认 `compose` 来自 `koa-compose@^4.1.0`，可被 `options.compose` 替换；
  - `handleRequest()` 先把 `res.statusCode` 设为 404，再跑合成后的中间件并 `respond()`；
  - `createContext()` 每请求设置 `ctx.state = {}`；`asyncLocalStorage` 默认关闭；
  - `respond()` 对 stream / Blob / `ReadableStream` / `Response` 使用 `Stream.pipeline`，仅在存在 `error` 监听器时调用 `ctx.onerror`；
  - `ctx.throw()` 委托 `http-errors` 的 `createError(...args)`；v3 迁移文档记录 generator 删除、`ctx.back()` 与 `URLSearchParams`；
  - `engines.node` 为 `>= 18`；固定树 `lib/` 合计 2062 行，其中 `application.js` 344 行。
