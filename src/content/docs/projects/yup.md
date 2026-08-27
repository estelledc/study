---
title: Yup — 先转型再验收的对象 schema
description: 先把输入转成可验收形状，再按 schema 检查的对象校验库。
来源: https://github.com/jquense/yup
日期: 2026-08-27
分类: 前端工程
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jquense/yup
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b413bf65ecdbea965a8e22060a16b5caa9b2c39b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.7.1
---

## 是什么

Yup 是一个**先把输入转成自己能认的形状，再按说明书验收**的 JavaScript / TypeScript schema 库。日常类比：像海关报关。窗口先把你递上去的材料改写成他们的表格（`cast`），再按栏位规则盖章（`validate`）。多带的私人物品默认还在箱子里，除非你明确要求开箱清理。

```ts
import { object, string, number } from "yup";

const User = object({
  email: string().email().required(),
  age: number().min(18).required(),
});

await User.validate({ email: "a@b.com", age: "20" });
```

`number()` 默认会尝试把 `"20"` 转成数字，然后才跑 `min(18)`。不想自动转型时要显式 `strict()`。类型侧用 `InferType<typeof User>` 取出输出类型，别名是 `Asserts`。

## 为什么重要

不理解 yup 的“转型 / 验收”分家，下面这些事会对不上：

- 为什么表单库长期用它：字符串输入先被收成业务类型，再报栏位错误
- 为什么 `validate()` 永远是 Promise，却另有 `validateSync()`
- 为什么默认对象会留下额外字段，和 [[zod]] / [[valibot]] 的默认剥离正好相反
- 为什么 `required()` 不是单独一条魔法，而是“不能 null + 不能 undefined”

它不是“更老的 Zod”。固定源码里它是 class + 方法链，并且把 cast 写进默认校验路径。

## 核心要点

可以拆成四条合同：

1. **schema 默认不可变**：`clone()` 复制 spec、tests 和 transforms；`withMutation` 才允许一段构建过程就地改。`addMethod` 则直接挂到构造函数 prototype，会影响后续所有实例。

2. **非 strict 先 cast 再测**：`_validate` 默认调用 `_cast`，把 transforms 依次套上；`undefined` 会换成 `getDefault()`。`strict` 才跳过这步。string 的默认 transform 会在 `coerce` 打开且类型不对时走 `toString()`，但数组和 `[object Object]` 不会被硬转。

3. **失败控制流分两条**：`validate()` 把 issue 收进 Promise 拒绝；`validateSync()` 同步抛 `ValidationError`。默认 `abortEarly: true`，单条 test 失败就 `panic`；改成 `false` 才继续收集。`~standard.validate` 固定用 `abortEarly: false`。

4. **对象默认留未知 key**：`stripUnknown()` / `noUnknown(true)` 才会剥离或报错；`exact()` 只检查形状、不改输出。嵌套字段校验时会被标成 `strict: true`，因为父级已经 cast 过。

## 实践示例

### 案例 1：表单字符串先转后验

```ts
import { object, string, number } from "yup";

const Profile = object({
  name: string().trim().min(1).required(),
  age: number().min(18).required(),
});

const value = await Profile.validate(
  { name: " Ada ", age: "21", extra: true },
);
```

三步：① `string` / `number` 先按默认 coerce 收输入；② `required()` 同时禁止 `null` 与 `undefined`，string 还会再测长度不是 0；③ `extra` 仍在结果里，除非调用方加了 `stripUnknown`。

### 案例 2：同步验收和异步 test 不能混

```ts
const Sync = string().min(3);
Sync.validateSync("ada");

const Remote = string().test("exists", "missing", async (id) => id === "known");
await Remote.validate("known");
```

`validateSync` 若碰到返回 Promise 的 test，固定源码会抛错，而不是偷偷等。需要异步规则就走 `validate()`。

### 案例 3：`when()` 按兄弟字段换 schema

```ts
const Pair = object({
  kind: string().oneOf(["user", "admin"]).required(),
  token: string().when("kind", {
    is: "admin",
    then: (schema) => schema.required(),
    otherwise: (schema) => schema.optional(),
  }),
});
```

`when` 在 `resolve()` 时读 ref；`then` / `otherwise` 必须至少写一个，并且要返回 schema。条件没命中就沿用原 schema。

### 案例 4：Standard Schema 入口

```ts
const Email = string().email().required();
const result = await Email["~standard"].validate("not-an-email");
```

`~standard` 的 vendor 是 `yup`，version 是 1。失败时把 `ValidationError.inner` 展平成分段 path，而不是沿用 yup 自己的点号路径字符串。

## 踩过的坑

1. **把默认对象当成 strip**：yup 默认保留未知字段；要静默丢掉或拒绝，必须自己选 `stripUnknown` / `noUnknown` / `exact`。
2. **以为 `required()` 只禁空值**：基类是 `nonNullable()` + `defined()`；`string().required()` 还要求长度大于 0，空字符串过不了。
3. **同步 API 里塞 async test**：`options.sync` 为真时，Promise test 直接抛错。
4. **把 GitHub 最新 tag 当成 npm 最新包**：`yup@1.7.1` 的 publish 提交可达，但仓库没有同名 tag。

## 适用 vs 不适用场景

**适用**：
- 浏览器表单：输入几乎都是字符串，需要先 cast 再报栏位
- 已有 Formik / [[react-hook-form]] + yup resolver 的存量项目
- 需要 `when()` 这种按上下文切换规则的对象图

**不适用**：
- 想默认剥离未知字段、并且按模块 tree-shake → 看 [[valibot]]
- 要把 schema 同时当 TypeScript 类型源，并接受 Zod 4 的 runner 分层 → 看 [[zod]]
- 不能安装运行时依赖（yup 还依赖 `property-expr`、`tiny-case`、`toposort`、`type-fest`）

## 固定版本边界

- 本文绑定 `jquense/yup@b413bf65...`，`package.json` 版本为 `1.7.1`。
- npm `gitHead` 与该提交一致；GitHub 没有 `v1.7.1` tag。最近完整三方对齐的是 `v1.7.0` / `12a82604...`。
- 未安装依赖，未跑 vitest 的 sync/async 工程，也未测 bundle。状态保持 `UNVERIFIED`。

## 学到什么

1. **cast 和 validate 不是同一件事**：默认路径会先改值再验收；`strict` 才会只看原始输入。
2. **对象未知 key 策略是显式选择**：保留、剥离、报错在 yup 里要自己打开。
3. **同步与异步是两条门**：Promise test 不能混进 `validateSync`。
4. **发布身份要以 npm `gitHead` 是否可达为准**：缺 tag 时不要假装存在同名 GitHub release。

## 应用型自测

1. `object({ id: string() }).validateSync({ id: "1", admin: true })` 默认结果还有 `admin` 吗？
2. `string().required()` 能接受 `""` 吗？
3. 一个 async `test()` 走 `validateSync`，失败会落进 `ValidationError` 吗？

检查点：

1. 有。默认不剥离未知 key。
2. 不能。string 的 `required` 还要求长度大于 0。
3. 不会按普通 issue 返回。同步路径遇到 Promise test 会抛普通 Error。

## 延伸阅读

- 仓库：[jquense/yup](https://github.com/jquense/yup) —— 本文绑定提交 `b413bf65ecdbea965a8e22060a16b5caa9b2c39b`
- npm：`yup@1.7.1`（`gitHead` 与上项相同，无 GitHub `v1.7.1` tag）
- [[valibot]] —— 模块化、默认剥离未知字段的对照
- [[zod]] —— 另一条 TS-first schema 路线，默认 object 会 strip
- [[react-hook-form]] —— `@hookform/resolvers` 提供 yup resolver

## 关联

- [[valibot]] —— 同一主题的模块化对照：pipe、`typed`/`success`、默认 strip
- [[zod]] —— 同一主题的方法链对照，但默认对象策略相反
- [[react-hook-form]] —— 常见表单接入点
- [[tanstack-form]] —— 另一条可接 schema resolver 的表单库
- [[arktype]] —— schema 写法更靠近 TypeScript 类型本身

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库

- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
