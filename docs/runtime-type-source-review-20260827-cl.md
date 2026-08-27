# Runtime type source review (writer CL)

> 用途：记录 io-ts、runtypes 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、TypeScript 编译、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## io-ts

- canonical source：`https://github.com/gcanti/io-ts`
- revision：`864a3a2f03c5d7b974afeb1da0faf46c21758779`
- package：`io-ts@2.2.22`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/Type.ts`
  - `src/PathReporter.ts`
  - `src/Decoder.ts`
  - `test/2.1.x/exact.ts`
- observed：
  - the stable public API is the `Type<A, O, I>` class in `src/index.ts`; `decode` calls `validate` with a default context and returns `Either<Errors, A>` via `fp-ts`; it does not throw;
  - `Type.pipe` decodes left-to-right and encodes right-to-left, short-circuiting on the first `Left`;
  - `t.type` / `t.interface` validate known properties only and keep extra enumerable keys on the output object;
  - `t.strict` is `exact(type(props))`; `exact` strips unknown keys after a successful inner decode and does not fail because extras exist;
  - classic `t.number` accepts any `typeof === 'number'` value, including `NaN` and infinities;
  - `PathReporter.report` folds an `Either` into human-readable strings; success reports `['No errors!']`;
  - `2.2+` experimental modules (`Decoder`, `Encoder`, `Codec`, `Schema`, `src/Type.ts`) are documented as independent and backward-incompatible; the experimental `Type.number` rejects `NaN`;
  - `fp-ts` `^2.5.0` is a required peer dependency; this revision has no `engines` field.
- provenance note：
  - npm `io-ts@2.2.22` reports `gitHead=864a3a2f03c5d7b974afeb1da0faf46c21758779`;
  - GitHub tag `2.2.22` (unprefixed) dereferences to the same commit, whose `package.json` reports `2.2.22` and whose message is `version 2.2.22`;
  - the latest GitHub release at review time is also `2.2.22` (published 2024-12-10).

## runtypes

- canonical source：`https://github.com/runtypes/runtypes`
- revision：`5cabab81fc9266dfeffd3d236677fdf2cd80eaac`
- package：`runtypes@7.0.5`
- inspected：
  - `package.json`
  - `package.build.json`
  - `src/index.ts`
  - `src/Runtype.ts`
  - `src/Object.ts`
  - `src/Parser.ts`
  - `src/Number.ts`
  - `src/result/ValidationError.ts`
  - `src/utils/Contract.ts`
  - `src/Object.test.ts`
- observed：
  - the published identity lives in `package.build.json` (`runtypes@7.0.5`); the workspace root `package.json` is `private: true` and lists no runtime dependencies;
  - `Runtype.inspect` never throws and returns `Success | Failure`; `check` / `assert` call `inspect({ parse: false })` and throw `ValidationError`; `parse` uses `inspect({ parse: true })`;
  - `Object` default `isExact` is `false`; `check` returns the original value (extras kept); `parse` returns a newly assembled object of specified fields (extras dropped); `exact()` fails extras with `PROPERTY_PRESENT`;
  - `withParser` only applies the user function when `parsing` is true; constraint helpers always receive the parsed value even during `check`;
  - `Number` accepts any `typeof === 'number'` value, including `NaN`;
  - `Optional` is a property modifier for `Object` fields, not a runtype that allows `undefined` values; `undefinedable` / `nullable` / `nullishable` are the value-level unions;
  - `Contract.enforce` parses arguments and return values and rethrows structured `ARGUMENTS_INCORRECT` / `RETURN_INCORRECT` failures.
- provenance note：
  - npm `runtypes@7.0.5` does not expose `gitHead`;
  - GitHub annotated tag `v7.0.5` peels to commit `5cabab81fc9266dfeffd3d236677fdf2cd80eaac` (`chore: bump version to 7.0.5 (#505)`);
  - the latest GitHub release at review time is `v7.0.5` (published 2026-08-14).
