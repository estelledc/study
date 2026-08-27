# AdonisJS / Sails source review

> 用途：记录 AdonisJS、Sails 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DL
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、ace/sails CLI、dev server、数据库或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- pages：仓库原先没有这两篇项目页；本轮新增 `adonisjs`、`sails`，不是改写既有正文

## AdonisJS

- canonical source：`https://github.com/adonisjs/core`
- revision：`0348a3b448fe91194d8ccf62d481b38ac9189176`
- git tag：`v7.5.0`（annotated tag `70d52f09...` 剥到上述 commit）
- package：`@adonisjs/core@7.5.0`
- inspected：
  - `package.json`
  - `index.ts`
  - `src/ignitor/main.ts`
  - `src/ignitor/http.ts`
  - `src/ignitor/ace.ts`
  - `providers/app_provider.ts`
  - `providers/vinejs_provider.ts`
  - `modules/http/main.ts`
  - `modules/http/request_validator.ts`
  - `modules/ace/create_kernel.ts`
  - `commands/serve.ts`
  - `services/app.ts`
  - `services/server.ts`
  - `services/router.ts`
- observed：
  - package is ESM (`"type": "module"`) and requires Node `>=24.0.0`;
  - `Ignitor` creates `Application` from `@adonisjs/application` and exposes HTTP / Ace / test processes;
  - HTTP start is `createApp('web')` → `init` → `boot` → `start` → `container.make('server')` → `server.boot()` → `http.createServer(server.handle)` → listen;
  - default listen host/port are `0.0.0.0` / `3333` unless `HOST` / `PORT` are set;
  - `Server` and `Router` live in `@adonisjs/http-server`; core only binds them in `AppServiceProvider`;
  - `node ace serve` loads `@adonisjs/assembler` `DevServer` and does not call `Ignitor.httpServer()` itself;
  - Lucid ORM, auth, session and Vite are not members of this package;
  - VineJS is an optional peer; core adds `RequestValidator` and `request.validateUsing()`;
  - published bin is `adonis-kit` (command indexer), not the app `ace` binary.
- provenance：
  - Git tag `v7.5.0` and `package.json` version `7.5.0` identify `0348a3b4...`;
  - npm `@adonisjs/core@7.5.0` `gitHead` is the parent `2c8ece56923a8721c4f35c5352539eefbe7bee95` (`chore(deps): bump actions/checkout`);
  - that parent is reachable; the release commit is its child. This note binds the tagged release commit.

## Sails

- canonical source：`https://github.com/balderdashy/sails`
- revision：`7b76422cc27823df033572bdda5c4910a68b697f`
- git tag：`v1.5.18`（annotated tag `d9bc0a4d...` 剥到上述 commit）
- package：`sails@1.5.18`
- inspected：
  - `package.json`
  - `lib/index.js`
  - `bin/sails-lift.js`
  - `lib/app/lift.js`
  - `lib/app/load.js`
  - `lib/app/private/initialize.js`
  - `lib/app/configuration/default-hooks.js`
  - `lib/hooks/http/index.js`
  - `lib/hooks/http/get-configured-http-middleware-fns.js`
  - `lib/hooks/blueprints/index.js`
  - `lib/hooks/userhooks/index.js`
  - `lib/router/index.js`
- observed：
  - `require('sails')` exports a singleton `Sails` instance; `sails lift` calls `.lift()` which is `load` then `initialize`;
  - `load()` runs config → hooks → action modules → registry → router;
  - `initialize()` runs bootstrap, emits `ready`, then each hook `handleLift()`; HTTP listen happens there;
  - bundled hooks include http, session, policies, blueprints, views, security; `orm`, `sockets` and `grunt` are posterity comments, not core members;
  - Waterline / `sails-hook-orm` and `sails-hook-sockets` are app dependencies, not production deps of this package;
  - default body parser is `skipper`; HTTP stack is Express `4.22.2`;
  - blueprint defaults are `rest: true`, `shortcuts: true`, `actions: false`; model routes register only if `sails.hooks.orm` exists;
  - CSRF defaults to false; `package.json` engines still claim Node `>= 0.10.0`.
- provenance：
  - Git tag `v1.5.18`, commit message, `package.json` and npm `gitHead` all identify `7b76422c...`.
