# OpenAPI client source review

> 用途：记录 openapi-typescript、swagger-js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL BY
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、未执行 CLI 或真实 HTTP、未测量 bundle
- worktrees：`/tmp/research-worktrees/`，不进入 Git

## openapi-typescript

- canonical source：`https://github.com/openapi-ts/openapi-typescript`
- revision：`5709d33a5977c4908b9e331f01cd0f9e181b1c37`
- package：`openapi-typescript@7.13.0`（monorepo path `packages/openapi-typescript`）
- provenance：GitHub annotated tag `openapi-typescript@7.13.0` 剥开后指向该 commit；npm 未发布 `gitHead`，因此不以 registry 反推 revision
- inspected：
  - `packages/openapi-typescript/package.json`
  - `packages/openapi-typescript/src/index.ts`
  - `packages/openapi-typescript/src/types.ts`
  - `packages/openapi-typescript/src/lib/redoc.ts`
  - `packages/openapi-typescript/src/transform/index.ts`
  - `packages/openapi-typescript/src/transform/path-item-object.ts`
  - `packages/openapi-typescript/src/transform/operation-object.ts`
  - `packages/openapi-typescript/bin/cli.js`
- observed：
  - `openapiTS()` validates and bundles via Redocly, then returns TypeScript AST nodes rather than a string or HTTP client;
  - Swagger 2.x (`swagger` field) and OpenAPI major versions outside `[3, 4)` are rejected before transform;
  - default Redocly config extends `minimal` and raises `operation-operationId-unique` to error;
  - bundle keeps `$ref` (`dereference: false`); transform later resolves refs from the bundled document;
  - `paths` / `webhooks` / `components` / `$defs` are emitted, plus an `operations` table for operations that have `operationId`;
  - defaults keep empty objects as `Record<string, never>`, `additionalProperties` off, and `defaultNonNullable` on.

## swagger-js

- canonical source：`https://github.com/swagger-api/swagger-js`
- current GitHub identity：`swagger-api/swagger-client` (redirect)
- revision：`c605554cd713fe6d84152510fafe4c9169088b71`
- package：`swagger-client@3.38.0`
- provenance：GitHub tag `v3.38.0` 与 npm `gitHead` 指向同一 commit
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.js`
  - `src/constants.js`
  - `src/interfaces.js`
  - `src/execute/index.js`
  - `src/http/index.js`
- observed：
  - constructor returns a Promise and attaches the instance as `prom.client`;
  - resolve strategies run OpenAPI 3.2 ApiDOM, 3.1 ApiDOM, 3.0, Swagger 2.0, then generic;
  - unless `disableInterfaces`, resolved clients gain `apis[tag][operationId]`;
  - `applyDefaults()` mutates spec: OpenAPI 2 fills host/schemes/basePath, OpenAPI 3 empty servers become `{ url: "/" }`;
  - `execute()` builds a request then calls `http()`; object/array bodies are JSON.stringified;
  - default `http()` uses runtime `fetch`, throws on `!res.ok`, and requires Node `>=22`.
