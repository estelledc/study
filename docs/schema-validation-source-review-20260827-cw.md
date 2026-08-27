# Schema validation source review (writer CW)

> 用途：记录 ArkType、Typia 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL CW
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、benchmark、bundler、TypeScript 编译或 ttsc transform
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未改开放 PR 已占用页面，也未改 `zod` / `yup` / `valibot` / `io-ts`

## ArkType

- canonical source：`https://github.com/arktypeio/arktype`
- revision：`03b1f015d9b7c5af5dac2caed1aeedefaf705ab3`
- package：`arktype@2.2.3`
- provenance：
  - GitHub tag `arktype@2.2.3` 解引用到上述提交，提交说明为 `release: arktype 2.2.3 + dependents (#1635)`
  - `ark/type/package.json` 自报 `2.2.3`
  - npm `arktype@2.2.3` 当前不暴露 `gitHead`；未伪造 npm 发布点，绑定可达的 GitHub 发布 tag
- inspected：
  - `ark/type/package.json`
  - `ark/type/index.ts`
  - `ark/type/type.ts`
  - `ark/type/keywords/keywords.ts`
  - `ark/type/parser/definition.ts`
  - `ark/type/parser/string.ts`
  - `ark/type/scope.ts`
  - `ark/schema/roots/root.ts`
  - `ark/schema/node.ts`
  - `ark/schema/kinds.ts`
  - `ark/schema/shared/traversal.ts`
  - `ark/schema/shared/errors.ts`
  - `ark/type/__tests__/standardSchema.test.ts`
  - `ark/type/__tests__/type.test.ts`
- observed：
  - `type` 是绑定在内置 `ark` scope 上的 parser；`type.errors` 运行时附件是 `ArkErrors` 类
  - definition 可以是字符串、对象字面量、tuple、已有 root node、带 `~standard` 的 Standard Schema、`RegExp` 或返回 root 的 thunk
  - 无 contextual args 的字符串 definition 会按 scope 名缓存
  - 默认配置 `clone: deepClone`、`onUndeclaredKey: "ignore"`、`onFail: null`、`numberAllowsNaN: false`
  - `optimistic` apply 路径在 `allows` 通过且存在 morph 时，对 object/function 先 `clone` 再跑 morph
  - 调用 type 返回校验/转换输出或 `ArkErrors`；`assert` 失败走 `errors.throw()`
  - root 的 `~standard` 同时提供 Standard Schema `validate` 与 Standard JSON Schema `jsonSchema.input/output`

## Typia

- canonical source：`https://github.com/samchon/typia`
- revision：`00872d2952ecdb06c548c83fb4f2a376256b7d9a`
- package：`typia@14.0.4`
- provenance：
  - GitHub annotated tag `v14.0.4` 解引用到该提交，提交说明为 `chore: release v14.0.4`
  - `packages/typia/package.json` 与 `packages/interface/package.json` 均自报 `14.0.4`
  - npm `typia@14.0.4` 当前不暴露 `gitHead`；未伪造 npm 发布点，绑定可达的 GitHub 发布 tag
- inspected：
  - `package.json`
  - `packages/typia/package.json`
  - `packages/interface/package.json`
  - `packages/typia/src/index.ts`
  - `packages/typia/src/module.ts`
  - `packages/typia/src/transform.ts`
  - `packages/typia/src/transformers/NoTransformConfigurationError.ts`
  - `packages/typia/src/internal/_createStandardSchema.ts`
  - `packages/typia/src/json.ts`
  - `packages/typia/src/re-exports.ts`
  - `packages/interface/src/tags/index.ts`
  - `packages/interface/src/tags/Format.ts`
- observed：
  - 公开 `assert` / `is` / `validate` / `assertEquals` 及 `create*` 工厂的 JS 实现都会调用 `NoTransformConfigurationError`
  - 真正校验代码由 `ttsc` / `ttsx` / `@ttsc/unplugin` 在编译期生成；stock `tsc`、`ts-node`、`tsx`、Babel、SWC 不会自动加载 transform
  - `createTtscPlugin` 通过消费项目的 `require` 定位 `typia/package.json`，再指向 `native/cmd/ttsc-typia`
  - `createValidate` / `createValidateEquals` 的类型合同同时实现 `StandardSchemaV1`；`_createStandardSchema` 把 `IValidation` 转成 `{ value }` 或 `{ issues }`，`vendor: "typia"`
  - 约束写在 TypeScript 类型上，经 `@typia/interface` 的 `tags` 运行时值再导出（如 `tags.Format<"email">`）
  - 同提交还导出 `json` / `protobuf` / `llm` / `http` / `random` / `plain` / `notations` / `functional` 命名空间；未运行这些路径
  - `typia` 对 `ttsc>=0.19.2` 是 optional peer；未安装 transform 时调用会抛错而不是静默跳过
