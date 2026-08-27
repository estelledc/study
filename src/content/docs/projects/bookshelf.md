---
title: Bookshelf — 建立在 Knex 上的 Backbone 风格 ORM
来源: 'https://github.com/bookshelf/bookshelf'
日期: 2026-08-27
分类: ORM
难度: 中级
description: 构造时先认 knex 函数名，再把 fetch 和 save 做成带事件的实例方法。
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/bookshelf/bookshelf
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 58058a7426f6551c46591f7fbe48ba7d7e88447b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.0
---

## 是什么

Bookshelf 是一个**把 Backbone 式模型事件叠在 Knex 上**的 Node ORM。日常类比：Knex 仍是点餐平板，Bookshelf 是会按桌号认人、并在上菜前后喊一声的服务员——查询还是 knex 发，但 `fetch` / `save` / `destroy` 会触发一串可异步的事件。

你写：

```js
const knex = require("knex")({ client: "sqlite3", connection: { filename: "notes.db" } });
const bookshelf = require("bookshelf")(knex);

const Cat = bookshelf.model("Cat", {
  tableName: "cats"
});

const row = await Cat.where({ id: 1 }).fetch();
```

`bookshelf(knex)` 先检查 `knex.name === 'knex'`，再给 Model / Collection 换上指向这份 knex 的 `_builder`。

## 为什么重要

不理解这条“实例方法 / 事件 / 注册表”边界，下面这些事都没法解释：

- 为什么传入普通 query 对象会立刻抛 `Invalid knex instance`
- 为什么空 `fetch` 默认抛 `NotFoundError`，而不是返回 `null`
- 为什么事务回调里的 `save()` 还要显式带 `{transacting: t}`
- 为什么它和 [[objection]] 都坐在 knex 上，却没有 `Model.query()` 这条链

## 核心要点

固定 1.2.0 的主链：

1. **认 knex**：构造函数要求 `knex && knex.name === 'knex'`。`builderFn` 用 `knex(table)` 或 `knex.queryBuilder()`，并把 knex `query` 事件转发给模型。

2. **注册表**：`bookshelf.model(name, proto)` / `collection()` 防重名；关系目标可以写字符串，由 registry 或 `bookshelf.resolve` 找回类。

3. **fetch 默认要有行**：`requireFetch` 默认 `true`。`sync().first()` 为空就抛 `NotFoundError`，除非 `options.require === false`。`withRelated` 在拿到行之后才走 `EagerRelation`。

4. **save 先判 insert/update**：`isNew()` 是 `this.id == null`。`patch: true` 会强制 `update`；否则看 `options.method` 或 `isNew`。

5. **事件可取消写入**：`triggerThen('saving creating')` / `saving updating` 用 Bluebird `mapSeries`。handler 抛错或 reject，save 中止。

## 实践示例

### 案例 1：空 fetch 默认失败

```js
const missing = await new Cat({ id: 999 }).fetch({ require: false });
const required = await new Cat({ id: 999 }).fetch();
```

第一行得到 `null`。第二行在固定默认下抛 `NotFoundError('EmptyResponse')`。把模型上的 `requireFetch` 设为 `false`，也能改成“找不到就返回 null”。

### 案例 2：事务不会自动包住模型

```js
await bookshelf.transaction(async (t) => {
  const created = await new Cat({ name: "Mochi" }).save(null, { transacting: t });
  await created.save({ age: 1 }, { patch: true, transacting: t });
  return created;
});
```

`bookshelf.transaction` 只是 `knex.transaction.apply(...)`。注释写明：不把 `transaction` 传进 `fetch` / `save` / `destroy`，即使代码写在回调里也不属于这笔事务。

### 案例 3：registry 让关系写成字符串

```js
const Order = bookshelf.model("Order", {
  tableName: "orders",
  customer() { return this.belongsTo("Customer"); }
});

const Customer = bookshelf.model("Customer", {
  tableName: "customers",
  orders() { return this.hasMany("Order"); }
});
```

`_relation` 会 `resolveModel(Target)`。重复 `bookshelf.model("Order", ...)` 会抛 `already defined in the registry`。

## 踩过的坑

1. **把任意对象当 knex 传入**：固定检查是 `knex.name === 'knex'`。自己包一层代理、改掉 `name`，构造期就会失败。

2. **以为 `save({id: 1, name})` 一定 update**：`isNew()` 看的是 `this.id`。只把 id 放进本次 attrs、实例上还没有 id，仍可能走 insert。

3. **`patch: true` 再写 `method: 'insert'`**：`saveMethod` 直接抛 `Cannot accept incompatible options`。

4. **事务回调里忘记 `transacting`**：外层 Promise 仍可能 resolve，但那些查询走的是 knex 默认连接，不是这笔事务。

5. **继续 `.plugin('pagination')`**：1.2.0 只 `console.warn`，因为 pagination / visibility / registry 已进核心；`processor` / `virtuals` / `case-converter` 则提示迁到独立包。

## 适用 vs 不适用场景

**适用**：

- 已有 knex，并希望用 `fetch` / `save` / 事件做 Active Record
- 需要 registry 解决循环依赖，关系用字符串声明
- 维护仍停在 knex 0.15–0.21 的代码库

**不适用**：

- knex 3.x 或想把列类型推到编译期 → 看 [[kysely]] / [[drizzle]] / [[objection]]
- 需要对象图 `insertGraph` / JSON Schema → 看 [[objection]]
- 只要同步 SQLite 句柄，不需要模型事件
- 把 1.2.0 的事件开销或查询次数写成通用性能结论——本文没有测量

## 固定版本边界

- 本文绑定 `bookshelf/bookshelf@58058a74...`，包版本 `1.2.0`，`engines.node` 为 `>=6`。
- npm `bookshelf@1.2.0` 的 `gitHead` 是可达父提交 `54928fec...`；GitHub tag `1.2.0` 才是 `Release 1.2.0`。本文绑定 tag，不伪造 npm `gitHead` 树。
- `peerDependencies.knex` 为 `>=0.15.0 <0.22.0`。Promise 实现是 Bluebird，不是原生 Promise 封装层。
- 本文未安装依赖、未执行 SQL 或上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **Bookshelf 认的是 knex 函数，不是“长得像 knex 的对象”**：`name` 必须是 `'knex'`。
2. **找不到行是错误还是 null，由 `requireFetch` / `require` 决定**。
3. **事务对象不会隐式传播**：每个写入口都要带上。
4. **事件是写入合同的一部分**：`saving` handler 可以取消 save。

## 应用型自测

1. `require("bookshelf")({ client: "sqlite3" })` 不先 `require("knex")`，固定 1.2.0 会怎样？
2. `new Cat().save({ id: 5, name: "Mochi" })` 在实例还没有 `id` 时，默认走 insert 还是 update？
3. 事务回调里 `await new Cat().save()` 不传 `transacting`，这笔 insert 是否保证可回滚？

检查点：

1. 抛 `Invalid knex instance`。构造函数检查 `knex.name`。
2. insert。`isNew()` 看 `this.id == null`，不是本次 attrs 里有没有 id。
3. 不保证。必须把 `t` 传进 `save` / `fetch` / `destroy`。

## 延伸阅读

- 固定源码：[bookshelf/bookshelf](https://github.com/bookshelf/bookshelf) —— 本文绑定提交 `58058a7426f6551c46591f7fbe48ba7d7e88447b`
- [[objection]] —— 同一 knex 底座上的 QueryBuilder / 图写入路线
- [[kysely]] —— 不提供模型事件，类型走 TypeScript
- [[sequelize]] —— 另一条 Active Record，不经过 knex
- [[typeorm]] —— decorator / Identity Map 路线

## 关联

- [[objection]] —— knex 上的 SQL 友好 ORM，builder 合同不同
- [[kysely]] —— 类型优先的 SQL builder
- [[drizzle]] —— schema-as-code，仍要自备 driver
- [[sequelize]] —— 不经过 knex 的模型层
- [[typeorm]] —— decorator / Active Record 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
