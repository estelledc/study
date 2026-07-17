# Schema validation source review

> 用途：记录 Zod、Valibot、ArkType 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-07-17
- evidence：固定提交静态源码与测试阅读
- not executed：未安装三仓依赖，未运行上游 test、benchmark、bundler 或 TypeScript 编译
- worktrees：本机 `research-worktrees/`，不进入 Git

## Zod

- canonical source：`https://github.com/colinhacks/zod`
- revision：`912f0f51b0ced654d0069741e7160834dca742ee`
- package：`zod@4.4.3`
- inspected：
  - `packages/zod/package.json`
  - `packages/zod/src/v4/core/parse.ts`
  - `packages/zod/src/v4/core/schemas.ts`
  - `packages/zod/src/v4/classic/schemas.ts`
  - `packages/zod/src/v4/classic/tests/object.test.ts`
  - `packages/zod/src/v4/classic/tests/async-refinements.test.ts`
- observed：
  - classic methods delegate to the core schema runner;
  - throwing and safe parse APIs share validation semantics but expose different failure contracts;
  - sync APIs fail on asynchronous refinements and require async counterparts;
  - object schemas distinguish strip, loose, strict and catchall behavior;
  - the package exposes classic, mini and core entry points.

## Valibot

- canonical source：`https://github.com/open-circle/valibot`
- revision：`32247b362e7f80bc7c0b6c1cf180049ee4f8b884`
- package：`valibot@1.4.2`
- inspected：
  - `library/package.json`
  - `library/src/methods/safeParse/safeParse.ts`
  - `library/src/schemas/object/object.ts`
  - `library/src/methods/pipe/pipe.ts`
  - `library/src/methods/pipe/pipe.test.ts`
  - `packages/i18n/package.json`
  - `packages/to-json-schema/package.json`
- observed：
  - schemas and actions are plain modular objects with a `~run` contract;
  - `safeParse` reports `typed`, `success`, `output` and `issues`;
  - object schemas strip unknown entries unless another object variant is selected;
  - pipe executes ordered items and has explicit early-abort behavior;
  - i18n and JSON Schema conversion are official companion packages;
  - bundle effects still depend on imports, bundler and build configuration.

## ArkType

- canonical source：`https://github.com/arktypeio/arktype`
- revision：`03b1f015d9b7c5af5dac2caed1aeedefaf705ab3`
- package：`arktype@2.2.3`
- inspected：
  - `ark/type/package.json`
  - `ark/type/keywords/keywords.ts`
  - `ark/type/parser/definition.ts`
  - `ark/type/parser/string.ts`
  - `ark/type/scope.ts`
  - `ark/schema/roots/root.ts`
  - `ark/schema/shared/traversal.ts`
  - `ark/type/__tests__/standardSchema.test.ts`
  - `ark/type/__tests__/type.test.ts`
- observed：
  - `type` is a parser bound to the built-in Ark scope and keyword module;
  - definitions may be strings, object/tuple forms, existing nodes or Standard Schema implementations;
  - runtime parsing reduces definitions into schema nodes that traverse data and may queue morphs;
  - a call returns the validated output or `ArkErrors`;
  - root schemas implement Standard Schema and Standard JSON Schema contracts.
