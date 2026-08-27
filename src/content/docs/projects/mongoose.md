---
title: Mongoose — 给 MongoDB 文档加 Schema 的 ODM
来源: https://github.com/Automattic/mongoose
日期: 2026-08-27
分类: ORM
难度: 中级
description: MongoDB document ODM。Schema 编译成 Model；save 默认校验，update 查询默认不校验。
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/Automattic/mongoose
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a4b8a603793247f236d76a7f6aa0d0ea5cfd24dd
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.9.4
---

## 是什么

Mongoose 是 MongoDB 的 **ODM**（Object Document Mapper）。日常类比：MongoDB 像没有固定货架的仓库，Mongoose 先画一张货架图（Schema），再按图验收、装箱和贴标签。

你写：

```js
import mongoose from "mongoose";

const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, required: true },
  age: Number,
}));
```

固定 `9.9.4` 是 CommonJS 包，入口 `index.js` → `lib/mongoose.js`。`mongoose.model()` 把 Schema 编译成 Model；`new User()` 得到 Document。它依赖官方驱动 `mongodb@~7.5`，自己负责 schema、校验、hook 和查询封装。

## 为什么重要

不读固定 9.9.4 源码，下面这些合同很容易被 v6/v7 教程带偏：

- 为什么 `doc.save()` 默认会跑 validator，而 `Model.updateOne()` 默认不会
- 为什么 `mongoose.connect(uri, cb)` 会直接抛错，而不是“兼容一下旧回调”
- 为什么还没 `await connect()` 也能 `find()`——默认 `bufferCommands` 在排队
- 为什么它和 [[mikro-orm]] / [[prisma]] 不是同一类对象：它映射的是文档，不是关系表上的 Identity Map

## 核心要点

固定版本的主链可以拆成五步：

1. **连接**：`mongoose.connect(uri)` 只接受 Promise；传入 callback 抛 `MongooseError`。它打开默认 `Connection`，选项转交给驱动 `MongoClient`。

2. **Schema → Model**：`Schema` 默认 `strict: true`、`validateBeforeSave: true`、`bufferCommands: true`、`versionKey: '__v'`。`mongoose.model(name, schema)` 调用 `Model.compile()`，挂上 methods、statics 和 Kareem hook。

3. **`Document#save`**：默认先 `$validate()`；新文档 `insertOne`，已有文档用 `$__delta()` 算变更再 `updateOne`。版本键不匹配会变成 `VersionError`。

4. **Query 更新**：`updateOne` / `findOneAndUpdate` 会 **cast** 更新对象，但 `runValidators` 默认 `false`。只有显式打开，或 `mongoose.set('runValidators', true)` 后，才跑 `updateValidators()`，且只检查 update 里出现的 path。

5. **Hook 分两路**：document hook 覆盖 `save` / `validate` / `remove` 等；query hook 覆盖 `find` / `updateOne` 等。同名 hook 要用 `{ document: true }` 或 `{ query: true }` 消歧。

## 实践示例

### 案例 1：save 会校验，updateOne 默认不会

```js
const user = new User({ email: "a@x.com", age: 20 });
await user.save(); // 默认 validateBeforeSave: true

await User.updateOne({ email: "a@x.com" }, { age: -1 });
// 默认不跑 validator；age: -1 只要能 cast 成 Number 就会写出

await User.updateOne({ email: "a@x.com" }, { age: -1 }, { runValidators: true });
```

`required` 在 update validator 里也不会检查“没出现在 update 里的字段”。要把校验当合同，写路径应走 `save()`，或显式打开 `runValidators`。

### 案例 2：连接前的缓冲不是“已经连上了”

```js
const pending = User.find({ age: { $gte: 18 } }).exec();
await mongoose.connect(process.env.MONGO_URL);
const rows = await pending;
```

默认 `bufferCommands: true`，`bufferTimeoutMS` 为 10000。关掉缓冲且尚未连接时，collection 包装器会抛错，而不是默默丢查询。

### 案例 3：v9 不再接受 null filter 或 callback

```js
await mongoose.connect(uri);          // 不能传 callback
await User.findOne({ email: "a@x.com" });
// await User.findOne(null)          // Query.merge(null) 后 _validateOp 抛 ObjectParameterError
```

`findOne()` 不传参数仍可能发出空过滤；`findOne(null)` 在固定版本是错误，不是“查全部”。

## 踩过的坑

1. **把 `updateOne` 当成“会跑 Schema 的 save”**：默认只 cast，不 validate。
2. **继续写 callback / `next()` pre hook**：v9 对这些入口直接抛错。
3. **把缓冲当连接成功**：排队成功不等于 MongoDB 已就绪；超时后仍会失败。
4. **对子文档调用 `save()` 指望单独落库**：子文档 `save()` 只跑 hook，持久化要靠父文档。
5. **把 `strictQuery: false` 忘掉**：未知 query key 默认不会被丢掉，可能让过滤条件静默失效或过宽。

## 适用 vs 不适用场景

**适用**：

- Node 服务把 [[mongodb]] 当主库，需要 schema、validator 和 document hook
- 已有 Mongoose Model，并接受 v9 的 Promise-only API 与驱动 `mongodb@~7.5`
- 以 `save()` 为写路径，或明确管理 `runValidators`

**不适用**：

- 关系库 + Identity Map / Unit of Work → [[mikro-orm]] 或 [[typeorm]]
- 只要类型安全 SQL，不要文档 hydrate → [[kysely]] / [[drizzle]] / [[prisma]]
- 不能升级到 Node `>=20.19.0`，或还依赖 callback 中间件
- 需要本页未验证的连接池/吞吐数字——那些是驱动默认值，不是本页证据

## 固定版本边界

- 本文绑定 `Automattic/mongoose@a4b8a603...`，tag 与 npm `mongoose@9.9.4` 的 `gitHead` 一致。
- `engines.node` 为 `>=20.19.0`；依赖 `mongodb@~7.5`、`kareem@3.3.0`、`mquery@6.0.0`。
- 包是 CommonJS，没有 `exports` 字段；类型在 `types/index.d.ts`。
- 未安装依赖、连接 MongoDB 或运行测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **ODM 的写路径有两条合同**——Document `save` 和 Query `update*` 默认不是同一套校验。
2. **默认值就是 API**——`bufferCommands`、`strict`、`runValidators` 都会改变“我以为已经发生的事”。
3. **大版本会删控制流**——callback 不是风格问题，是固定 9.9.4 的硬错误。
4. **子文档不是独立聚合根**——hook 跑过不等于写库。

## 应用型自测

1. `User.updateOne({ _id }, { age: -1 })` 在未设 `runValidators` 时，会按 Schema 拒绝负数吗？
2. `mongoose.connect(uri, () => {})` 在固定 9.9.4 会成功连接吗？
3. 子文档调用 `save()`，MongoDB 里的父文档一定更新吗？

检查点：

1. 不会。Query 更新默认 `runValidators: false`，只做 cast。
2. 不会。`connect` 看到 callback 直接抛错。
3. 不一定。子文档 `save()` 只跑 hook，不单独 `insertOne` / `updateOne`。

## 延伸阅读

- 官方文档：[mongoosejs.com](https://mongoosejs.com)
- 固定源码：[Automattic/mongoose](https://github.com/Automattic/mongoose) —— 本文绑定 `a4b8a603793247f236d76a7f6aa0d0ea5cfd24dd`
- 审查记录：仓库内 `docs/node-orm-source-review-20260827-dd.md`
- [[mikro-orm]] —— 同主题的 Data Mapper / Identity Map 对照
- [[mongodb]] —— Mongoose 下面的文档数据库

## 关联

- [[mikro-orm]] —— Data Mapper + Unit of Work，和 document `save()` 不是一条链
- [[mongodb]] —— 被封装的数据库与官方驱动
- [[prisma]] —— 无状态 client，不维护 document identity
- [[zod]] —— 外部输入校验；Mongoose validator 不能替代它
- [[typeorm]] —— 装饰器 ORM，主场是关系表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
