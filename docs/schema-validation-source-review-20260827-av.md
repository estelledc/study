# Schema validation source review (writer AV)

> 用途：记录 Yup、Valibot 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL AV
- evidence：固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、benchmark、bundler 或 TypeScript 编译
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未改任何开放 PR 已占用页面，也未改 `zod`

## Yup

- canonical source：`https://github.com/jquense/yup`
- revision：`b413bf65ecdbea965a8e22060a16b5caa9b2c39b`
- package：`yup@1.7.1`
- provenance：
  - npm `yup@1.7.1` 的 `gitHead` 等于上述提交，且该提交在 canonical remote 可达，提交说明为 `Publish v1.7.1`
  - GitHub 目前没有 `v1.7.1` tag；最近带 tag 且 npm `gitHead` 一致的是 `v1.7.0` / `12a82604a75a460452882f2c00bd3a593c9b2103`
  - 本文绑定可达的 npm publish 提交，不伪造缺失 tag
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/schema.ts`
  - `src/object.ts`
  - `src/string.ts`
  - `src/types.ts`
  - `src/ValidationError.ts`
  - `src/standardSchema.ts`
  - `src/Condition.ts`
  - `src/util/createValidation.ts`
- observed：
  - schema 是 class；默认 `clone()` 后改 spec，`withMutation` 才就地改
  - 默认 `coerce: true`、`optional: true`、`abortEarly: true`、`nullable: false`、`strip: false`
  - 非 `strict` 时 `_validate` 先 `_cast` 再跑 internal tests 与 user tests
  - `validate()` 始终返回 Promise；`validateSync()` 走 `sync: true`，遇到 Promise test 会抛错
  - `abortEarly` 为真时失败走 `panic`，为假时走 `next` 收集
  - `object` 默认保留未知 key；`stripUnknown` / `noUnknown` 才剥离或报错；`exact()` 只验收形状不剥离
  - `~standard.validate` 固定调用 `validate(..., { abortEarly: false })`
  - 运行时依赖 `property-expr`、`tiny-case`、`toposort`、`type-fest`

## Valibot

- canonical source：`https://github.com/open-circle/valibot`
- revision：`0dc26ea88cf07a414653375f0da43f97e0eed607`
- package：`valibot@1.4.2`
- provenance：
  - GitHub tag `v1.4.2` 与 npm `valibot@1.4.2` 的 `gitHead` 都指向该提交
  - 旧页绑定的 `32247b362e7f80bc7c0b6c1cf180049ee4f8b884` 仍自称 `1.4.2`，但是 2026-07-08 的 JSDoc 拼写修复，不是 npm / tag 发布点
  - 发布 tag 里 `SafeParseResult` 注释仍写 `Whether is's typed`
- inspected：
  - `library/package.json`
  - `library/src/methods/safeParse/safeParse.ts`
  - `library/src/methods/safeParse/types.ts`
  - `library/src/schemas/object/object.ts`
  - `library/src/methods/pipe/pipe.ts`
  - `packages/i18n/package.json`
  - `packages/to-json-schema/package.json`
- observed：
  - schema / action 是带 `~run` 的普通对象；`sideEffects: false`
  - `safeParse` 返回 `typed`、`success`、`output`、`issues`；`success` 只看有没有 issue
  - 默认 `object` 只输出声明字段；`looseObject` / `strictObject` / `objectWithRest` 是另外的 schema
  - pipe 遇到已有 issue 后再碰到 schema 或 transformation 会标 untyped 并停止；`abortEarly` 与 `abortPipeEarly` 控制不同提前退出
  - 同一 monorepo 提交里 `@valibot/i18n` 为 `1.2.0`，`@valibot/to-json-schema` 为 `1.7.1`，版本号不与核心包对齐
