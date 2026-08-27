# Form library source review

> 用途：记录 react-hook-form、TanStack Form 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## react-hook-form

- canonical source：`https://github.com/react-hook-form/react-hook-form`
- revision：`33860b43d5c52f39b7280a012b5876e6ad3e905c`
- package：`react-hook-form@7.86.0`
- inspected：
  - `package.json`
  - `src/useForm.ts`
  - `src/logic/createFormControl.ts`
  - `src/logic/getProxyFormState.ts`
  - `src/constants.ts`
  - `src/useWatch.ts`
  - `src/useController.ts`
- observed：
  - field values live in the mutable `_formValues` object inside `createFormControl`, not in React state; `useForm` keeps only a `formState` snapshot in `useState`;
  - `register` returns `{ name, onChange, onBlur, ref }` where `onBlur` is the same unified handler as `onChange`, which distinguishes blur via `event.type`;
  - `getProxyFormState` records read formState keys with `Object.defineProperty` getters at the top-level-key granularity (`errors`, `isDirty`, ...), not per nested field path; `_subscribe` gates root re-renders by those recorded keys;
  - default options are `mode: onSubmit`, `reValidateMode: onChange`, `shouldFocusError: true`; `shouldUnregister` is falsy by default so unmounted fields keep their values;
  - `handleSubmit` clones `_formValues`, runs the resolver schema or built-in validation, strips disabled field values from the payload, then updates `isSubmitted`/`isSubmitSuccessful`/`submitCount`, and re-throws an exception thrown by the valid callback;
  - `watch()` with no arguments subscribes the whole form, `watch(name)` marks the name as watched for root re-renders, and `useWatch` keeps the subscription local to the calling component with an optional `compute` projection;
  - `useController` builds on `useWatch` plus `useFormState`, giving controlled components a component-level subscription;
  - this revision also ships `createFormControl`/`formControl` for hook-external control, a public `subscribe` API, and bfcache resync via `useResyncOnReconnect`.
- provenance note：
  - npm reports `react-hook-form@7.86.0` with `gitHead=1d402175ece7dce6130164ba78d8d598d4d576f2`;
  - GitHub tag `v7.86.0` dereferences to `33860b43d5c52f39b7280a012b5876e6ad3e905c`, whose `package.json` reports `7.86.0`;
  - the tag commit is an ancestor of the npm `gitHead`, and their tree diff is a single `CHANGELOG.md` addition, so the bound tag revision and the published package share identical source code;
  - this review binds the tag revision.

## TanStack Form

- canonical source：`https://github.com/TanStack/form`
- revision：`b865ef335a69aa08a2f160895258f13e03773467`
- packages：`@tanstack/form-core@1.33.5`、`@tanstack/react-form@1.33.5`
- inspected：
  - `packages/form-core/package.json`
  - `packages/form-core/src/FormApi.ts`
  - `packages/form-core/src/FieldApi.ts`
  - `packages/form-core/src/standardSchemaValidator.ts`
  - `packages/react-form/package.json`
  - `packages/react-form/src/useForm.tsx`
  - `packages/react-form/src/useField.tsx`
  - `packages/react-form/src/index.ts`
  - `packages/solid-form/src/createForm.tsx`
- observed：
  - `@tanstack/form-core` depends only on `@tanstack/store`、`@tanstack/pacer-lite`、`@tanstack/devtools-event-client`，没有框架依赖；
  - `FormApi` builds a `createStore` base store plus derived stores from `@tanstack/store`; framework adapters subscribe through selectors (`useSelector` in `@tanstack/react-store`);
  - the React adapter creates `FormApi` inside `useState`, extends it with `Field`、`FormGroup`、`Subscribe` components, calls `formApi.update(opts)` every render and `formApi.mount()` in a layout effect;
  - selector subscription at this revision is the standalone `useStore(form.store, selector)` re-export or `<form.Subscribe selector>`; there is no `form.useStore` method;
  - `field.handleChange` calls `setValue`, which forwards to `form.setFieldValue` and then runs `validate('change')`; `handleBlur` exists separately; the user wires `value`/`onChange`/`onBlur` explicitly in the render prop;
  - validators are grouped by cause (`onMount`/`onChange`/`onBlur`/`onSubmit`/`onDynamic` plus async variants with `asyncDebounceMs`), and any object exposing the `'~standard'` Standard Schema v1 property (`version: 1`、`vendor`、`validate`) is accepted directly as a validator;
  - `_handleSubmit` increments `submissionAttempts`, batch-marks all fields touched, early-returns on `canSubmit` only for the first attempt, then runs `validateAllFields('submit')`, form-level `validate('submit')` and the `onSubmit` callback, emitting devtools events through `formEventClient`;
  - the monorepo at this revision ships framework adapters `angular-form`、`lit-form`、`preact-form`、`react-form`、`solid-form`、`svelte-form`、`vue-form`，plus devtools packages and React meta-framework integrations (`react-form-nextjs`、`react-form-remix`、`react-form-start`)。
- provenance note：
  - npm `@tanstack/form-core@1.33.5` and `@tanstack/react-form@1.33.5` do not expose `gitHead`;
  - GitHub per-package tags `@tanstack/form-core@1.33.5` and `@tanstack/react-form@1.33.5` both dereference to `b865ef335a69aa08a2f160895258f13e03773467`（"ci: Version Packages (#2319)"），whose workspace `package.json` files report `1.33.5`;
  - `@tanstack/*-form@2.0.0-alpha.2` tags dated 2026-08-21 exist, so a v2 alpha line is in progress upstream; this review binds the 1.33.5 stable release commit.
