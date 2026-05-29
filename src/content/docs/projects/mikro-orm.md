---
title: MikroORM DataMapper + Unit of Work + Identity Map
来源: https://github.com/mikro-orm/mikro-orm + mikro-orm.io 官方文档
---

# MikroORM — DataMapper + Unit of Work + Identity Map

## 一句话总结（≥ 14 行）

MikroORM 是 Martin Adamek（@B4nan）2018 年开源的 TypeScript Node.js ORM。它在 Prisma 还没流行、TypeORM 装饰器风格走在 NestJS 边上的同一窗口期出现，但选了一条几乎相反的技术路线：**DataMapper + Unit of Work + Identity Map**——这是 Java Hibernate 与 PHP Doctrine 多年沉淀的"持久化上下文"模式，在 Node.js 生态非常少见。

weekly downloads ~200k（2024，比 TypeORM 3M / Sequelize 4M / Prisma 8M 都低 1-2 个数量级），但社区评价很高，与 NestJS 深度集成（`@mikro-orm/nestjs` 是官方推荐之一）。

设计哲学三个支柱：

1. **DataMapper 范式**：entity 是纯数据，仓储 / EntityManager 负责 CRUD；与 Sequelize 的 ActiveRecord 完全相反
2. **Unit of Work + Identity Map**：每个 EntityManager 维护一份 Identity Map，相同 PK 永远共享同一对象引用；改字段不调用 save，flush 时 UoW 自动 diff 出所有变更
3. **三套 metadata 路径**：reflect-metadata（runtime）/ ts-morph（编译期）/ entity-schema（手写）—— 用户按需选

关键差别（vs Prisma / Drizzle / TypeORM）：

- Prisma：返回 plain object，无 identity，改字段必须手写 `update()`
- Drizzle：query builder 风格，根本没有 entity 概念
- TypeORM：有 entity 但**没有** Identity Map，改字段也不自动入 UoW
- MikroORM：改字段就够了，flush 时一次提交所有变更

支持数据库：PostgreSQL / MySQL / MariaDB / SQLite / MS SQL（v6 起）/ MongoDB（独立 driver）。2024 主版本 v6.x。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `@mikro-orm/core` + 各 driver 包（`@mikro-orm/postgresql` 等） |
| 当前主版本 | v6.x（2024，stable） |
| 首版 | 2018-04 / v0.x（社区起步） |
| License | MIT |
| 主仓库 | mikro-orm/mikro-orm |
| 维护 | Martin Adamek（@B4nan，单一核心 + 80+ contributors，bus factor 偏低） |
| TypeScript 要求 | ≥ 4.7（v6） |
| Node 要求 | ≥ 18（v6） |
| Bundle | core ~2 MB + 各 driver 独立包（按需装） |
| 数据库 | PostgreSQL / MySQL / MariaDB / SQLite / MS SQL / MongoDB |
| 范式 | DataMapper + UoW + Identity Map（Hibernate / Doctrine 风格） |
| Migrations | `@mikro-orm/migrations`（基于 umzug，schema-diff 支持） |
| 关系系统 | `@OneToOne` `@OneToMany` `@ManyToOne` `@ManyToMany`（含 owning / inverse 概念） |
| Weekly downloads | ~200k（2024） |
| GitHub stars | 8k+ |
| 集成 | `@mikro-orm/nestjs`（NestJS 官方推荐之一）/ Express / Koa / Fastify |
| 商业版 | 无 |
| 文档站 | mikro-orm.io |
| 同辈 | TypeORM / Prisma / Drizzle / Objection.js |
| Metadata 路径 | reflect-metadata / ts-morph（编译期）/ entity-schema |
| 杀手特性 | UoW + Identity Map（Node.js ORM 中独此一家） |

## Layer 1 — 核心抽象（≥ 30 行）

最小可运行例：

```ts
import { MikroORM, EntityManager, EntitySchema } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from '@mikro-orm/core';

// 1. 定义 entity（DataMapper 风格：class 只描述数据，无 CRUD 方法）
@Entity()
export class User {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @Property({ unique: true }) email!: string;
  @OneToMany(() => Post, post => post.author) posts = new Collection<Post>(this);
}

@Entity()
export class Post {
  @PrimaryKey() id!: number;
  @Property() title!: string;
  @Property({ type: 'text' }) content!: string;
  @ManyToOne(() => User) author!: User;
}

// 2. 初始化（注意：必须 await MikroORM.init()）
const orm = await MikroORM.init({
  driver: PostgreSqlDriver,
  clientUrl: 'postgres://user:pass@localhost:5432/app',
  entities: [User, Post],
  debug: true,
});

// 3. 拿 EntityManager
const em = orm.em.fork();   // 每个 request 一个 fork！见后文怀疑

// 4. CRUD（DataMapper：通过 em，不是 entity.save()）
const u = em.create(User, { name: 'Alice', email: 'a@x.com' });
em.persist(u);          // 纳入 Identity Map，标记为 managed
await em.flush();       // 真正提交 SQL（一次 transaction）

// 5. 改字段（不需要 save / update —— 这是 UoW 的精髓）
const u2 = await em.findOne(User, { email: 'a@x.com' });
u2!.name = 'Alice Renamed';
await em.flush();        // UoW 自动 diff，生成 UPDATE users SET name = ?

// 6. 关系
const p = em.create(Post, { title: 'hi', content: '...', author: u2! });
em.persist(p);
await em.flush();

// 7. Load 关系（populate hint）
const userWithPosts = await em.findOne(User, { id: 1 }, { populate: ['posts'] });
```

要点：

1. `em.create(User, {...})` 不会立刻 INSERT —— 它只是 new 一个实例并放入 Identity Map。
2. `em.persist(u)` 显式标记为 managed（v5+ create 已自动 persist，v4 必须手动）。
3. `em.flush()` 才真正提交 SQL。所有 dirty entity 一次性 INSERT/UPDATE/DELETE，包在一个 transaction 里。
4. 改 entity 字段不需要 `em.update(...)` —— 字段被赋值后，flush 时 UoW 通过对比 Identity Map 中的快照，自动检测出变更。这是 Hibernate / Doctrine 用户的肌肉记忆。
5. `Collection<Post>` 是 MikroORM 自己的 lazy-loaded collection，不是 native array。`posts.add(...)` `posts.remove(...)` `posts.init()`。

## Layer 2 — 内部架构（≥ 25 行）

MikroORM 的内部分四层：

```
┌──────────────────────────────────────────────────────┐
│ EntityManager（用户入口；每 request 一个 fork）       │
│   - create / persist / remove / flush / find...     │
├──────────────────────────────────────────────────────┤
│ UnitOfWork（变更收集 + 排序 + flush）                 │
│   - persistStack / removeStack / changeSets         │
│   - computeChangeSets / commit                      │
├──────────────────────────────────────────────────────┤
│ IdentityMap（PK -> entity 引用，per-EM）              │
│   - getById / store / clear                         │
├──────────────────────────────────────────────────────┤
│ Driver / QueryBuilder（PG / MySQL / SQLite / Mongo） │
│   - 翻译 changeset 到 INSERT / UPDATE / DELETE       │
└──────────────────────────────────────────────────────┘
```

关键内部机制：

1. **proxy entity**：`em.getReference(User, 1)` 返回一个 proxy，访问字段才触发 lazy load；用于关系 hint 的占位。
2. **change tracking by snapshot**：entity 第一次进入 Identity Map 时，深拷贝一份"原始值快照"。flush 时对比当前值 vs 快照得到 dirty 字段集合。这是和 Hibernate 完全一致的策略——比 dirty flag（每个 setter 标 dirty）省事但内存占用翻倍。
3. **flush sequence**（见首图）：computeChangeSets → commitInsertOps → commitUpdateOps → commitDeleteOps → 全部包 BEGIN/COMMIT。
4. **collection 双向同步**：当你 `post.author = user` 时，MikroORM 自动把 post 加进 `user.posts`，反之亦然。这套 owning / inverse 双向同步在 v5 重写过，仍是常见 issue 来源。
5. **per-request fork**：在 web 框架里**绝对不能**共用同一个 `orm.em`——所有 request 共享同一个 Identity Map = entity 跨 request 串味 + 内存泄露。必须 `orm.em.fork()` 每 request 拿独立 EM。`@mikro-orm/nestjs` 通过 RequestContext middleware 自动 fork。

![MikroORM Unit of Work + Identity Map 持久化上下文](/projects/mikro-orm/01-uow.webp)

图：MikroORM 的核心抽象。entity 经过 new → managed → dirty → flush → SQL 五个阶段；Identity Map 保证相同 PK 全 session 共享同一对象引用；UoW 在 flush 时一次性收集所有变更并包 transaction。

## Layer 3 — 精读 3 段（≥ 50 行）

### 段 a — Identity Map：相同 PK 共享同一 instance

链接示意：`https://github.com/mikro-orm/mikro-orm/blob/<40hex>/packages/core/src/unit-of-work/IdentityMap.ts`

Identity Map 的本质是一个 `Map<entity_class_name + PK, entity_ref>`：

```ts
// 简化版（实际实现稍复杂，处理 composite PK + STI）
class IdentityMap {
  private readonly map = new Map<string, AnyEntity>();

  getByHash(hash: string): AnyEntity | undefined {
    return this.map.get(hash);
  }

  store(entity: AnyEntity, hash: string): void {
    this.map.set(hash, entity);
  }

  clear(): void {
    this.map.clear();
  }
}

// 使用方
function find(em: EntityManager, User, pk: number) {
  const hash = `User-${pk}`;
  const cached = em.getUnitOfWork().getIdentityMap().getByHash(hash);
  if (cached) return cached;        // 同一 EM 内第二次查询直接返回引用
  // 否则查 DB
}
```

行为后果（**这是 MikroORM 的杀手特性**）：

```ts
const u1 = await em.findOne(User, { id: 1 });
const u2 = await em.findOne(User, { id: 1 });
console.log(u1 === u2);   // true！同一 instance

// 对比 Prisma：
const u3 = await prisma.user.findUnique({ where: { id: 1 } });
const u4 = await prisma.user.findUnique({ where: { id: 1 } });
console.log(u3 === u4);   // false——每次返回 plain object，无 identity
```

为什么这件事重要：

1. **避免一致性 bug**：u1 和 u2 共享引用，改 u1.name 立刻影响 u2.name；不会出现"刚改完这边没生效"的诡异问题。
2. **避免 N+1 重复**：populate 关系时，如果同一 user 已经在 map 里，关系 join 不会重新 hydrate 一份新对象。
3. **支持脏检测**：UoW 用 Identity Map 中的快照做 diff，因为只有 map 中的 instance 才是"被追踪的实体"。

代价：

1. **不能跨 EM 共享**：fork 出的 EM 各有独立 Identity Map。把 entity 从 EM-A 传给 EM-B 是 undefined behavior（v6 会抛错）。
2. **内存占用**：长生命周期 EM + 大量 entity = Identity Map 一直涨。这就是为什么 web 服务器必须 per-request fork：request 结束 EM 被 GC，map 跟着没。
3. **serverless 友好性差**：lambda 冷启动时 init ORM、热启动时 EM 已经积累大量 entity ——这和 Prisma 的"无状态" connection pool 是两个完全不同的世界。

> 怀疑：UoW + Identity Map 在 Hibernate / Doctrine 是 Java/PHP 经典模式（HTTP request 寿命短，session 短，UoW 收益大）。但 Node.js 异步 + serverless 场景，request 寿命可能更短到 50ms 以下，UoW 的"批量 flush"价值被摊薄。是不是有点用错地方？

### 段 b — Unit of Work：自动收集所有变更，flush 时一次提交

链接示意：`https://github.com/mikro-orm/mikro-orm/blob/<40hex>/packages/core/src/unit-of-work/UnitOfWork.ts`

UoW 核心是三个 stack 加 changeSets 集合：

```ts
class UnitOfWork {
  private readonly persistStack = new Map<string, AnyEntity>();   // 待 INSERT
  private readonly removeStack  = new Map<string, AnyEntity>();   // 待 DELETE
  private readonly identityMap  = new IdentityMap();              // 已 managed
  private readonly originalEntityData = new Map<string, AnyEntity>();   // 快照
  private readonly changeSets = new Map<AnyEntity, ChangeSet>();   // 计算结果

  persist(entity: AnyEntity): void {
    const hash = this.getHash(entity);
    this.persistStack.set(hash, entity);
  }

  computeChangeSets(): void {
    // 1. 遍历 persistStack：全部 ChangeSet.create
    // 2. 遍历 identityMap：对比 originalEntityData，生成 ChangeSet.update（dirty 字段）
    // 3. 遍历 removeStack：全部 ChangeSet.delete
  }

  async commit(): Promise<void> {
    this.computeChangeSets();
    await this.driver.transactional(async (trx) => {
      await this.commitInsertChangeSets(trx);
      await this.commitUpdateChangeSets(trx);
      await this.commitDeleteChangeSets(trx);
    });
    this.persistStack.clear();
    this.removeStack.clear();
    this.refreshSnapshots();    // 把当前值刷成新快照（下次 diff 用）
  }
}
```

DX 后果：

```ts
const em = orm.em.fork();
const u = await em.findOne(User, { id: 1 });
u!.name = 'New';                // 不调任何 method
u!.email = 'new@x.com';
const p = em.create(Post, { title: 't', content: 'c', author: u });
em.persist(p);
const old = await em.findOne(Post, { id: 99 });
em.remove(old!);

await em.flush();
// 实际生成：
// BEGIN;
// INSERT INTO posts (title, content, author_id) VALUES ('t', 'c', 1);
// UPDATE users SET name = 'New', email = 'new@x.com' WHERE id = 1;
// DELETE FROM posts WHERE id = 99;
// COMMIT;
```

要点：

1. **一个 flush = 一个 transaction**。中间任何 SQL 失败，全部回滚。
2. **变更顺序**：UoW 内部按 entity 依赖顺序排序 INSERT（被依赖的先 INSERT），逆序 DELETE。这套依赖图算法在 `commit-order-calculator.ts`。
3. **批量优化**：v5+ 支持 `useBatchInserts: true` 把同一 entity 的多条 INSERT 合并成 batch insert。
4. **乐观锁**：`@Property({ version: true })` 标 version 字段，flush 时自动追加 `WHERE version = ?` 防并发覆盖。

> 怀疑：UoW 的"自动 dirty 检测"听起来很爽，但代价是每个 entity 都要快照 + 每次 flush 都要遍历全 Identity Map 做 diff。当 Identity Map 几千条时，flush 本身的 CPU 开销不可忽视。Prisma "手写 update" 看起来啰嗦，但每次只查一个字段集合，性能可预测得多。

### 段 c — Transactional context：@Transactional / em.transactional()

链接示意：`https://github.com/mikro-orm/mikro-orm/blob/<40hex>/packages/core/src/EntityManager.ts`

EntityManager 在显式 transaction 之外还提供两套 helper：

```ts
// 方式 1：em.transactional()——把回调里的所有变更包进单个 trx
await em.transactional(async (em) => {
  const u = em.create(User, { name: 'A', email: 'a@x.com' });
  em.persist(u);
  const p = em.create(Post, { title: 't', content: 'c', author: u });
  em.persist(p);
  // 不需要手动 flush！transactional() 在回调结束时自动 flush + commit
});
// 任何抛错 → ROLLBACK

// 方式 2：@Transactional() 装饰器（v5+）
class UserService {
  @Transactional()
  async signup(name: string, email: string) {
    const u = this.em.create(User, { name, email });
    this.em.persist(u);
    await this.sendWelcomeEmail(u);   // 也在 trx 里
  }
}
```

实战要点：

1. `em.transactional()` 内部 `em.fork({ flushMode: 'COMMIT' })` 出一个独立子 EM，回调结束自动 flush + commit；这个子 EM 有自己的 Identity Map，不污染外层。
2. `@Transactional()` 配合 NestJS 的 RequestContext，把当前 request 的 EM 注入；和 NestJS 自身的 transaction 装饰器冲突时优先用 MikroORM 的。
3. `flushMode` 三档：`COMMIT`（默认 v5+）/ `AUTO`（每次 query 前 auto-flush）/ `ALWAYS`。Hibernate 默认是 AUTO，MikroORM 改成 COMMIT 是为了避免 query 触发隐式写入。
4. 嵌套事务：MikroORM 默认用 SAVEPOINT 实现 nested trx，PG / MySQL 都支持；MS SQL 行为略不同。

## Layer 4 — 与 Prisma / Drizzle / TypeORM / Sequelize / Kysely 对比

| 维度 | MikroORM | Prisma | Drizzle | TypeORM | Sequelize | Kysely |
|---|---|---|---|---|---|---|
| 范式 | DataMapper + UoW | "Client" 函数式 | Query Builder | DataMapper + ActiveRecord | ActiveRecord | SQL Builder |
| Identity Map | **有** | 无 | 无 | 无 | 无 | 不适用 |
| 自动 dirty tracking | **有** | 无 | 无 | 无 | 无 | 不适用 |
| Schema 定义 | decorator / entity-schema / ts-morph | DSL（`schema.prisma`） | TS object | decorator | `define()` 或 class | TS interface |
| Migration | schema-diff（umzug） | schema-diff（自动生成） | schema-diff（drizzle-kit） | 命令式 | 命令式 | 不内建 |
| TypeScript 推导 | 中（依赖 metadata） | 强（codegen） | **强**（直接从 schema） | 中 | 弱（v6）/ 中（v7） |
| MongoDB 支持 | 有 | 有（独立 schema） | 无 | 有 | 无 | 无 |
| 支持的 DB 数 | 6 | 7 | 多 | 10+ | 8 | 多 |
| Bundle 体积 | core 中 + driver 按需 | 大（Rust binary） | **小** | 中 | 大 | 极小 |
| 适合场景 | DDD / 复杂领域模型 | CRUD + 自动化 | TS-first + Edge | 老 NestJS 项目 | 老 Node 项目 | 想要 SQL 自由度 |
| Weekly downloads | ~200k | ~8M | ~2M | ~3M | ~4M | ~600k |

观察：

1. MikroORM 是 6 个里**唯一**有 Identity Map + UoW 的——这既是杀手特性也是利基。
2. Prisma / Drizzle 是 2024 新项目首选；MikroORM 在 NestJS + DDD 场景里有铁粉。
3. TypeORM 与 MikroORM 都用 decorator，但 TypeORM 没有 UoW，且双范式（DM + AR）让用户困惑。MikroORM 是"纯 DataMapper"。

## Layer 5 — 6 维对比

| 维度 | MikroORM | TypeORM | Prisma | Drizzle | Sequelize |
|---|---|---|---|---|---|
| 学习曲线 | 中高（要懂 DDD / UoW 概念） | 中（decorator + 双范式） | 低 | 低 | 中 |
| 类型安全 | 中 | 中 | 强 | 强 | 弱 |
| 性能（CRUD） | 中（UoW diff 有开销） | 中 | 高 | 高 | 中 |
| 灵活度 | 高（多 metadata 路径） | 中 | 低（DSL 锁定） | 高 | 中 |
| 社区/生态 | 小（200k） | 中（3M） | 大（8M） | 中（2M） | 大（4M） |
| Serverless 友好 | 低（per-request fork + UoW 状态） | 低 | 高 | **高** | 中 |

## Layer 6 — 限制 ≥ 4

1. **bus factor**：项目核心维护几乎是 Martin Adamek 一人。issue / PR review 速度依赖他个人时间。对比 Prisma / Drizzle 的公司化运营，长期演进风险高。
2. **学习曲线陡**：UoW + Identity Map + owning vs inverse + flush mode 这套术语对没碰过 Hibernate / Doctrine 的 Node.js 工程师是全新世界。直接拿来用的人会被"我没改字段它怎么 UPDATE 了？"或反过来"我改了字段它怎么没 UPDATE？" 困住。
3. **per-request fork 是必须**：忘了 fork 直接用 `orm.em` = 内存泄漏 + entity 串味跨 request。这套铺设代价在 Express 里需要 middleware，在 NestJS 里必须装 `@mikro-orm/nestjs`。文档里有警告但新人 90% 第一次会踩。
4. **serverless 体验差**：UoW + Identity Map 在 short-lived lambda 里要么浪费（cold start init 完用一次就丢）要么状态泄漏（warm 实例累积 entity）。这是结构性的——和 Prisma 的"无状态 client"路线根本不同。
5. **TypeScript decorator 困境**：v6 仍依赖 stage 2 decorator（`experimentalDecorators: true`）+ `emitDecoratorMetadata`。TS 5.x 引入的 stage 3 decorator 不兼容旧版，MikroORM 何时迁移没有公开 roadmap。
6. **MongoDB driver 是二等公民**：虽然支持 Mongo，但 UoW + Identity Map 这一套很多概念在 NoSQL 世界对不上号（比如 dirty diff 在 document-based 场景下不是字段级而是文档级）。Mongo 用户体验 < SQL 用户体验。

## 怀疑总集

1. UoW + Identity Map 在 Hibernate / Doctrine 是 Java/PHP 经典模式，但 Node.js 异步 + serverless 场景，session 短，UoW 价值打折——是不是有点用错地方？
2. MikroORM weekly 200k vs TypeORM 3M，差 15x。"DDD 风格 ORM"在 Node.js 是不是过于学术？换句话说，需要 DDD 的项目可能根本不在 Node 生态里。
3. MikroORM 默认 reflect-metadata 但也支持 ts-morph 编译期 metadata（避免 reflect-metadata）。这种"双 metadata 路径"是不是过度设计？给用户三种 metadata 选项（reflect / ts-morph / entity-schema）让选择困难症爆炸。
4. UoW 自动 dirty 检测靠快照 diff，每 entity 翻倍内存。Identity Map 大了之后 flush 的 CPU 开销不可忽视。"自动"省的几行 setter 代码值这个代价吗？
5. per-request fork 这套机制本质是把 Java EE 的 OSIV（Open Session In View）模式硬搬到 Node.js。Node.js 的"无状态 + 函数式"风格和 OSIV 的"长生命周期 session"理念是矛盾的。
6. v5 → v6 升级文档中 collection 行为有微妙变化（owning / inverse 双向同步策略改了）。一个 ORM 在 minor version 改这种语义是不是埋地雷？
7. NestJS 官方 starter 现在四 ORM 并列（TypeORM / Prisma / MikroORM / Sequelize），但实际新项目选 MikroORM 的占比很低。"官方推荐"和"市场份额"脱节是 OSS 常态——不能只看推荐。
8. 支持 6 种数据库听起来全，但 MS SQL 是 v6 才加的，MongoDB driver 概念错位。这个"all driver"承诺是 ORM 大库的 baggage——和 Sequelize 8 dialect / TypeORM 10+ driver 本质一样的"我都支持但每个都半残"问题。

## GitHub permalinks（链接示意）

> 注：以下 SHA `<40hex>` 处实际须用某次具体 commit 的 40 位 hash 替换；本文档不锁定特定版本。

1. `https://github.com/mikro-orm/mikro-orm/blob/<40hex>/packages/core/src/EntityManager.ts` —— EntityManager 主类，所有用户入口
2. `https://github.com/mikro-orm/mikro-orm/blob/<40hex>/packages/core/src/unit-of-work/UnitOfWork.ts` —— UoW 核心：persistStack / changeSets / commit
3. `https://github.com/mikro-orm/mikro-orm/blob/<40hex>/packages/core/src/unit-of-work/IdentityMap.ts` —— Identity Map 实现，PK -> entity 引用
4. `https://github.com/mikro-orm/mikro-orm/blob/<40hex>/packages/core/src/unit-of-work/ChangeSetComputer.ts` —— 快照 diff，生成 ChangeSet
5. `https://github.com/mikro-orm/mikro-orm/blob/<40hex>/packages/core/src/unit-of-work/CommitOrderCalculator.ts` —— 依赖图排序 INSERT/DELETE
6. `https://github.com/mikro-orm/mikro-orm/blob/<40hex>/packages/core/src/decorators/Entity.ts` —— `@Entity()` 装饰器，元数据注册入口

## 实战 Walkthrough（≥ 25 行）

模拟一个"博客系统：用户、文章、标签"的最小 schema：

```ts
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, ManyToMany, Collection } from '@mikro-orm/core';

@Entity()
export class User {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @Property({ unique: true }) email!: string;
  @Property({ version: true }) version!: number;     // 乐观锁
  @OneToMany(() => Post, p => p.author) posts = new Collection<Post>(this);
}

@Entity()
export class Tag {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @ManyToMany(() => Post, post => post.tags) posts = new Collection<Post>(this);
}

@Entity()
export class Post {
  @PrimaryKey() id!: number;
  @Property() title!: string;
  @Property({ type: 'text' }) content!: string;
  @ManyToOne(() => User) author!: User;
  @ManyToMany(() => Tag, tag => tag.posts, { owner: true }) tags = new Collection<Tag>(this);
}
```

注意：

1. `@ManyToMany` 必须显式指定 `owner: true` 一边——这是 owning side / inverse side 概念。owning side 决定 join table 的存在与字段映射；inverse side 只是反向访问。
2. `version` 字段类型可以是 `number` 或 `Date`。`Date` 用 `updatedAt` 模式，`number` 用整数自增。
3. join table 默认按 entity 名 + 字段名生成（`post_tags`），可显式 `pivotTable` 覆盖。

CRUD 完整流：

```ts
// 1. 注册 + fork EM
const orm = await MikroORM.init({ ... });
const em = orm.em.fork();

// 2. 创建关系拓扑
const u = em.create(User, { name: 'Alice', email: 'a@x.com', version: 0 });
const tag1 = em.create(Tag, { name: 'TS' });
const tag2 = em.create(Tag, { name: 'ORM' });
const p = em.create(Post, { title: 'Hi', content: '...', author: u, tags: [tag1, tag2] });
em.persist([u, tag1, tag2, p]);
await em.flush();
// SQL：INSERT users / INSERT tags / INSERT posts / INSERT post_tags 共 4 条 INSERT，包在一个 trx 里

// 3. 查询 + populate
const post = await em.findOne(Post, { id: p.id }, { populate: ['author', 'tags'] });
console.log(post!.author.name);  // 'Alice'，author 已 hydrate
console.log(post!.tags.length);  // 2，tags collection 已 init

// 4. 改字段（不需要 update / save）
post!.title = 'Hi v2';
post!.tags.add(em.create(Tag, { name: 'NestJS' }));
await em.flush();
// SQL：UPDATE posts SET title = 'Hi v2' WHERE id = ? AND version = ?
//      INSERT tags / INSERT post_tags
//      所有变更包在一个 trx

// 5. 删除（级联 join table 由 ON DELETE CASCADE 处理）
em.remove(post!);
await em.flush();
// SQL：DELETE FROM posts WHERE id = ?
```

NestJS 集成：

```ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Post, User, Tag } from './entities';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      driver: PostgreSqlDriver,
      clientUrl: 'postgres://...',
      entities: [User, Post, Tag],
    }),
    MikroOrmModule.forFeature([User, Post, Tag]),
  ]
})
export class AppModule {}

// service 里
@Injectable()
export class PostService {
  constructor(@InjectRepository(Post) private readonly repo: EntityRepository<Post>) {}

  async list() { return this.repo.findAll({ populate: ['author', 'tags'] }); }
  async create(data: { title: string; content: string; authorId: number }) {
    const author = await this.repo.getEntityManager().findOneOrFail(User, data.authorId);
    const post = this.repo.create({ title: data.title, content: data.content, author });
    await this.repo.getEntityManager().persistAndFlush(post);
    return post;
  }
}
```

`@mikro-orm/nestjs` 的 `MikroOrmMiddleware` 会自动 `RequestContext.create(em, ...)` 给每个 request 一个 forked EM。这是关键 baggage——没装中间件直接用 `orm.em` 等于跨 request 共享 Identity Map = bug。

## 学到（≥ 12 行）

1. **DataMapper vs ActiveRecord 不是哲学之争，是项目复杂度之争**：CRUD 简单项目 ActiveRecord 更省事；领域模型复杂、有大量业务规则的项目 DataMapper 更清晰。Sequelize 卡在前者，MikroORM 押后者。
2. **Identity Map 是"对象一致性"原语**：它解决的不是性能问题（虽然顺带省 query），是逻辑一致性问题——避免 u1 和 u2 是同一行但不同对象导致的诡异 bug。
3. **UoW 把"自动 vs 手动"权衡推到极端**：自动到极致——你只改字段，flush 时它知道。这种 magic 在 Hibernate 用了 20 年，在 Node.js 是新东西。
4. **per-request fork 是 ORM with state 的固有税**：任何"有持久化上下文"的 ORM（MikroORM / TypeORM 的 EntityManager / Hibernate 的 Session）都要 per-request fork。无状态 ORM（Prisma / Drizzle）省这个税。
5. **schema-diff migration 已经是 2024 共识**：MikroORM / Prisma / Drizzle 都是 schema-diff；TypeORM / Sequelize 还在命令式（手写 up/down）。这是 ORM 一代分水岭。
6. **NestJS 官方推荐 ≠ 市场份额**：NestJS 现在 4 ORM 并列推荐，但用户实际选择仍然集中在 TypeORM 和 Prisma。"官方推荐"是 lagging indicator，社区 stack overflow 答案密度才是 leading。
7. **bus factor 是 OSS 用 ORM 的隐形风险**：Prisma 有公司、Drizzle 有公司，TypeORM 维护接力松散，Sequelize 是 sequelize org，MikroORM 是 Adamek 个人。选 ORM 不能只看技术，要看维护接力。
8. **metadata 三路径暴露了 TS decorator 历史 baggage**：reflect-metadata（runtime） / ts-morph（编译期） / entity-schema（手写）—— 三选一意味着官方自己不确定哪个是最佳。这种 "all of the above" 是 TS 5+ decorator 转型期的副作用。
9. **owning vs inverse side 是 ManyToMany 的隐形坑**：双向 ManyToMany 必须显式指定一边为 owner。不指定 → 运行时抛错；指定错 → join table 行为反向。和 Hibernate `mappedBy` 一脉相承。
10. **乐观锁 `version` 字段是默认要加的**：高并发场景同行被两 request 同时改，没 version 就丢一边。`@Property({ version: true })` 加 5 个字符防 80% 的并发覆盖。
11. **`em.flush()` 失败语义**：transaction 失败 = 全 rollback；但 EM 中的 entity 状态不会自动 revert（仍是改后的内存值）。这一点容易让人以为 "flush 失败 = 啥都没发生"，实际是"DB 没变，内存变了"——必须显式 `em.clear()` 才能扔掉脏状态。
12. **`flushMode` 默认 COMMIT 不是 AUTO**：MikroORM 故意改了 Hibernate 默认。COMMIT mode 下查询不会触发隐式 flush，行为更可预测。但要注意：先 `em.create(User)` `em.persist(u)` 然后 `em.find(User)` 时，新 user 不会出现在结果——必须先 flush 或切到 AUTO mode。
13. **collection 必须 `init()` 才能用 `.length`**：lazy collection 默认未 init，访问 `.length` 在 v5 静默返回 0。v6 改为抛错，但老代码很多还在 v5 模式踩坑。
14. **ts-morph metadata 编译期方案值得选**：避免 reflect-metadata 包，给前端 / Edge / serverless 项目省 30-50KB bundle。代价是构建期多一步 codegen。

## 关联

- [[typeorm]] —— 同样 decorator，但**没有** Identity Map，改字段不自动入 UoW。MikroORM 是"TypeORM + UoW + IM"的概念升级版
- [[prisma]] —— 无状态 client，与 MikroORM 的"持久化上下文"路线对立
- [[drizzle]] —— TS-first SQL builder，MikroORM 在 Edge / serverless 场景体验远不如它
- [[sequelize]] —— ActiveRecord 范式，与 MikroORM 的 DataMapper 是两条不同道路
- [[kysely]] —— SQL builder，"不要 ORM"的另一个答案；MikroORM 选了相反方向
- [[zod]] —— 现代 input 校验取代 ORM 内置 validate
- [[knex]] —— 同期老牌 SQL builder，MikroORM 不基于它（自带 query builder）

## 附录 A — UoW 在 Doctrine / Hibernate / MikroORM 三个生态的对照

| 生态 | 持久化上下文名 | per-request fork 入口 | dirty 检测策略 | 默认 flush mode |
|---|---|---|---|---|
| Hibernate (Java) | `Session` | OSIV filter / `@RequestScope` | 快照 + 字段访问 | AUTO |
| Doctrine (PHP) | `EntityManager` | DI container per-request | 快照 diff | COMMIT（since 3.0） |
| MikroORM (Node) | `EntityManager` | `orm.em.fork()` / RequestContext | 快照 diff | COMMIT |

观察：

1. 三个生态的核心抽象名字几乎一样（Session / EntityManager / EntityManager），背后都是 Unit of Work 模式。
2. Hibernate 默认 AUTO（query 触发 flush），Doctrine 3.0 + MikroORM 都改成了 COMMIT—— 行业经验是 AUTO 让人困惑。
3. per-request fork 在 PHP 是天然的（每 request 重新 boot），在 Java 靠 OSIV filter，在 Node.js 靠中间件。Node.js 路径最薄、踩坑率最高。

## 附录 B — 为什么 Edge / Serverless 场景 MikroORM 不被选

1. **冷启动时间**：MikroORM init 要扫 entity 元数据 + 建立 driver 连接 + 注册 event listener。冷启动开销 200-500ms（vs Drizzle 30-50ms）。
2. **状态持久化错位**：Edge runtime（Cloudflare Workers / Vercel Edge）每次 invocation 可能在不同实例。Identity Map 在跨实例下毫无意义，UoW 也是。
3. **Bundle 体积**：core 2MB + driver 1MB+ 在 Edge runtime 紧迫的 1MB 限制下根本不够。Drizzle / Kysely 50-200KB 才是 Edge 玩家。
4. **reflect-metadata 依赖**：Edge runtime 默认不打包 reflect-metadata polyfill，要手动配 build。这个坑文档没说，issue 里大量。
5. **连接 pooling 哲学不同**：Prisma Accelerate / Neon Serverless / Drizzle 的 HTTP fetch driver 都假设"短生命周期 + 远程 pool"。MikroORM 假设"长生命周期 + 本地 pool"。不是技术上不能，是设计哲学不匹配。

结论：MikroORM 是给"传统 server + 复杂领域模型"项目的 ORM。Edge / Serverless 用户不该选它。这不是 MikroORM 的失败，是项目类型不同。

## 附录 C — 学到补充（≥ 8 行）

15. **Doctrine ORM 的影响远大于第一眼看出的**：MikroORM 文档里 "Doctrine inspired" 不是客气话，API 形态、术语、行为大量复刻。看 PHP Doctrine 文档反而能更快上手 MikroORM。
16. **"DDD 风格 ORM"是个市场细分定位**：MikroORM 没打算抢 Prisma 的 CRUD 用户，它瞄准的是已经在用 NestJS + 走 DDD 路线的团队。市场份额 200k 不代表失败，代表准确占据细分。
17. **`em.clear()` 是诊断工具**：调试 "为什么改了字段没 flush" 时，先 `em.clear()` 重新 find，能区分是 dirty 检测问题还是关系映射问题。
18. **`em.populate()` vs find populate 不是同一回事**：前者对已加载 entity 主动 init 关系，后者在 query 时 join。性能差距 10x 以上，文档没强调。
19. **migration 的"diff"模式不是万能**：复杂 schema 变更（rename 列、split 表）`mikro-orm migration:create --initial` 会生成不安全的 DROP+ADD。手写 migration 仍然必要。
20. **`orm.em` 直接用 = 内存泄漏**：再强调一次。这个坑 90% 新人会踩、文档警告但不够显眼、stack overflow 上反复出现。`@mikro-orm/nestjs` 装上就自动正确，自己写 Express 中间件要手动 `RequestContext.create(em, next)`。

关联补充：

- [[zod]] —— 现代 input 校验，取代 entity 内置 `validate` 函数
- [[nestjs-overview]] —— MikroORM 在 NestJS 生态里的定位
- [[prisma]] [[drizzle]] —— 这一代 ORM 的事实标准，MikroORM 是 DDD 利基补位
- [[sequelize]] —— ActiveRecord 老前辈，MikroORM 走相反路线
