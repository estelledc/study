---
title: Objection — 建立在 Knex 上的 SQL 友好 ORM
来源: 'https://github.com/Vincit/objection.js'
日期: 2026-08-27
分类: ORM
难度: 中级
description: query() 先拼 QueryBuilder，等到 then 才克隆执行；图操作和校验都挂在这条链上。
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/Vincit/objection.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 76fb48ee56d37f68849009e78964a235ea7e1e17
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.5
---

## 是什么

Objection 是一个**把模型方法叠在 Knex QueryBuilder 上**的 Node ORM。日常类比：Knex 是点餐平板，Objection 是会认“这桌还有哪些菜、哪些配菜必须一起上”的领位员——菜单仍按 SQL 拼，上菜顺序和缺菜检查由模型层负责。

你写：

```js
const { Model } = require("objection");

class Cat extends Model {
  static get tableName() { return "cats"; }
}

Model.knex(knex);
const row = await Cat.query().findById(1).throwIfNotFound();
```

`Cat.query()` 只创建 `QueryBuilder`。`await` 走到 `then()` → `execute()`，这时才会克隆 builder、跑 hook、再交给 knex。

## 为什么重要

不理解这条“模型入口 / builder 执行”边界，下面这些事都没法解释：

- 为什么 `const q = Cat.query().where("age", ">", 2)` 本身不会访问数据库
- 为什么换 Postgres / SQLite 往往只换 knex `client`，却必须另外安装驱动
- 为什么 `insertGraph` 能一次写入对象图，而普通 `insert` 只写当前表
- 为什么它和 [[bookshelf]] 都坐在 knex 上，模型合同却完全不同

## 核心要点

固定 3.1.5 的主链：

1. **绑定 knex**：`Model.knex(instance)` 把连接写进不可枚举的 `$$knex`。`bindKnex` / `bindTransaction` 再派生绑定后的子类。

2. **惰性 builder**：`Model.query(trx)` 做 `QueryBuilder.forClass(this).transacting(trx)`，并调用 `onCreateQuery`。`then` / `catch` 才进入 `execute()`。

3. **一次写入**：`writeOperation` 只允许同一 builder 调用一次 `insert` / `update` / `patch` / `delete` / `relate` / `unrelate` / increment / decrement。

4. **图与 eager**：`withGraphFetched` 走 `WhereInEagerAlgorithm`；`withGraphJoined` 走 join。`insertGraph` / `upsertGraph` 用 `GraphOptions` 决定 relate / unrelate / insertMissing。

5. **校验分两套 Ajv**：完整对象用 `useDefaults: true`；`patch` 用 `useDefaults: false`，避免缺字段被默认值补齐。

## 实践示例

### 案例 1：查询链要等 then 才执行

```js
const builder = Cat.query().select("name").where("age", ">", 2);
const knexQuery = builder.toKnexQuery();
const rows = await builder;
```

`toKnexQuery()` 只编译。`await builder` 才会 `clone()` 后执行。测试可以先断言 SQL 形状。

### 案例 2：事务绑定模型类

```js
const { transaction } = require("objection");

await transaction(Cat, async (BoundCat, trx) => {
  await BoundCat.query().insert({ name: "Mochi" });
  await BoundCat.query().patch({ age: 1 }).where({ name: "Mochi" });
  return trx;
});
```

`transaction(Model, cb)` 会先 `bindTransaction(trx)`，再把绑定后的类和 `trx` 传给回调。只把普通 `Cat.query()` 写进回调、却不使用绑定类，不能假定走同一连接。

### 案例 3：patch 不会走默认值 Ajv

```js
class Cat extends Model {
  static get jsonSchema() {
    return {
      type: "object",
      required: ["name"],
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
        lives: { type: "integer", default: 9 }
      }
    };
  }
}

await Cat.query().patch({ name: "Sable" }).where({ id: 1 });
```

`AjvValidator` 为 patch 单独编译 `useDefaults: false` 的校验器。这里不会因为缺 `lives` 而写回默认 `9`。

## 踩过的坑

1. **以为 `Cat.query()` 已经查了库**：它只是 builder。没有 `then` / `await` / `execute`，knex 不会拿到连接。

2. **同一 builder 上再调一次 insert**：固定实现会 `reject("Double call to a write method")`。要写两次就建两条 query。

3. **把 `throwIfNotFound` 理解成“只检查 null”**：空数组、`undefined` 和 `0` 也会抛 `NotFoundError`。

4. **把 WhereIn eager 当成无限 IN**：SQLite 默认一批 999，MSSQL 2000，Oracle 1000；更大图要看 `maxBatchSize`。

5. **以为 objection 自带 knex**：`peerDependencies` 是 `knex >= 1.0.1`。驱动和 knex 都要调用方自己装。

## 适用 vs 不适用场景

**适用**：

- 已经选定 knex，还想要模型、关系表达式和对象图写入
- 需要 JSON Schema 校验，并且要区分 insert 与 patch
- 查询仍希望接近 SQL，而不是 schema-first codegen

**不适用**：

- 只要同步 SQLite 句柄 → 直接看底层驱动，而不是再叠一层 ORM
- 要把列类型推到编译期 → 看 [[kysely]] / [[drizzle]]
- 需要 Backbone 风格事件和 `save()` 实例方法 → 看 [[bookshelf]]
- 把 3.1.5 的 batch 大小或校验耗时写成通用性能结论——本文没有测量

## 固定版本边界

- 本文绑定 `Vincit/objection.js@76fb48ee...`，包版本 `3.1.5`，`engines.node` 为 `>=14.0.0`。
- npm `gitHead` 与 GitHub tag `3.1.5` 指向同一提交。
- 依赖 `ajv`、`ajv-formats`、`db-errors`；knex 与数据库驱动都不在本包依赖里。
- 本文未安装依赖、未执行 SQL 或上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **模型方法是入口，builder 才是菜单**：`query()` 不碰连接。
2. **写操作不可叠加**：一条链只能选一种写入语义。
3. **图写入和普通 insert 不是同一条路**：`GraphOptions` 决定缺 id 时插入还是 associate。
4. **patch 的 schema 合同更窄**：默认值只服务于完整对象。

## 应用型自测

1. `const q = Cat.query().select("id")` 执行完这一行，`execute()` 会不会已经跑过？
2. 同一 builder 上先 `insert()` 再 `patch()`，固定 3.1.5 会怎样？
3. `throwIfNotFound()` 遇到更新影响 0 行时会不会当作成功？

检查点：

1. 不会。`then()` 才调用 `execute()`。
2. 第二次写入会被 `writeOperation` reject。
3. 不会；结果为 `0` 时同样抛 `NotFoundError`。

## 延伸阅读

- 固定源码：[Vincit/objection.js](https://github.com/Vincit/objection.js) —— 本文绑定提交 `76fb48ee56d37f68849009e78964a235ea7e1e17`
- [[bookshelf]] —— 另一条 knex 上的模型层，事件和 `save()` 合同不同
- [[kysely]] —— 不提供模型图，类型走 TypeScript
- [[drizzle]] —— schema-as-code，仍要自备 driver
- [[sequelize]] —— 不依赖 knex 的老牌 Active Record

## 关联

- [[bookshelf]] —— 同样建立在 knex 上的 ORM，实例/事件模型不同
- [[kysely]] —— 类型优先的 SQL builder
- [[drizzle]] —— 轻量 ORM / builder，定位相邻
- [[sequelize]] —— 不经过 knex 的模型层
- [[typeorm]] —— decorator / Active Record 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
