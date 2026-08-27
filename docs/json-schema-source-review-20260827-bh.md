# JSON Schema source review (writer BH)

> 用途：记录 Ajv、TypeBox 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL BH
- evidence：GitHub metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、JSON Schema Test Suite、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- 未写入 README 中的吞吐/编译 ops 表，也未把静态阅读提升为 `ACTUAL_RUN`

## Ajv

- canonical source：`https://github.com/ajv-validator/ajv`
- revision：`0fba0b8e649909613cfce0999b149cd08f4a4987`
- tag：`v8.20.0`（GitHub tag object 直接指向该 commit）
- package：`ajv@8.20.0`
- inspected：
  - `package.json`
  - `lib/ajv.ts`
  - `lib/2020.ts`
  - `lib/core.ts`
  - `lib/compile/index.ts`
  - `lib/compile/validate/index.ts`
  - `lib/vocabularies/applicator/additionalProperties.ts`
  - `lib/vocabularies/format/format.ts`
  - `lib/standalone/index.ts`
- observed：
  - default `Ajv` class installs draft-07 vocabularies and meta schema `http://json-schema.org/draft-07/schema`;
  - `Ajv2020` is a separate entry that forces `dynamicRef`, `next` and `unevaluated`;
  - `compile()` adds the schema to a cache then emits a `ValidateFunction` through `compileSchema` / `validateFunctionCode`;
  - `validate(schema, data)` compiles an object schema or looks up a string key/ref, then stores sync errors on the instance;
  - `removeAdditional` can delete extra keys before or instead of reporting `additionalProperties`;
  - the instance `formats` map starts empty; `format` looks up `self.formats` and can fail unknown formats when `strictSchema` is not false;
  - standalone module export requires `code.source`.

## TypeBox

- canonical source：`https://github.com/sinclairzx81/typebox`
- revision：`51e4b0281f0c073ce408eae31c730862480f9de7`
- tag：`1.3.19`（GitHub tag object 直接指向该 commit）
- package：`typebox@1.3.19`（`tasks.ts` `Version = '1.3.19'`；1.x npm 名是 `typebox`，不是 `@sinclair/typebox`）
- inspected：
  - `tasks.ts`
  - `readme.md`
  - `src/index.ts`
  - `src/typebox.ts`
  - `src/type/types/object.ts`
  - `src/schema/compile.ts`
  - `src/schema/build.ts`
  - `src/schema/check.ts`
  - `src/value/parse/parse.ts`
  - `src/value/check/check.ts`
  - `src/system/environment/evaluate.ts`
  - `src/format/_registry.ts`
- observed：
  - `Type.Object` writes a JSON Schema object plus `~kind: 'Object'` and a `required` array derived from properties;
  - `Type.Static` is a type-level export on the same namespace;
  - `Schema.Compile` builds a `Validator` whose `Evaluate()` uses `Function` JIT when `Environment.CanEvaluate()` is true, otherwise a dynamic `CheckSchema` fallback;
  - `Validator.Parse` only `Check`s then throws `ParseError`; it does not run the Value corrective pipeline;
  - `Value.Parse` returns the original value when `Check` succeeds; otherwise it either throws or, if `correctiveParse` is on, clones then Default/Convert/Clean/Assert;
  - `Format.Reset()` registers email/uuid and related formats at module load; `Format.Test` returns true for unregistered format names;
  - `Type.Object` does not emit `additionalProperties` unless the caller passes that option.
