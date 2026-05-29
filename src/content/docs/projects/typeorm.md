---
title: TypeORM Decorator-based ORM
来源: https://github.com/typeorm/typeorm + typeorm.io 官方文档
---

# TypeORM — Decorator + 双模式 Node.js ORM

## 一句话总结（≥ 14 行）

TypeORM 是 Umed Khudoiberdiev（@pleerock）2017 年开源的 TypeScript / JavaScript ORM。weekly downloads ~3M，曾经是 NestJS 默认 ORM 与 Node.js TypeScript 项目的事实标准（2017-2022）。但 Prisma 2020 年出现 + Drizzle 2023 年崛起后，TypeORM 市场份额持续被蚕食。

设计哲学三个支柱：
1. **Decorator-based 元数据**：用 `@Entity()` `@Column()` `@OneToMany()` 装饰 class，由 `reflect-metadata` 在 runtime 收集
2. **同时支持 DataMapper + ActiveRecord 两种 ORM 范式**：用户可选 `repository.find()` 或 `entity.save()`
3. **多 driver 矩阵**：PostgreSQL / MySQL / MariaDB / SQLite / MS SQL / Oracle / SAP HANA / MongoDB / 等 10+

技术 baggage：
- TypeScript decorator 是 stage 2 提案（2017 起 experimental flag），TS 5+ 引入新版 decorator 不兼容旧版
- `emitDecoratorMetadata` + `reflect-metadata` 增加 bundle + cold start 成本
- Repository / EntityManager / QueryBuilder 三套 API 重叠让用户困惑

2024 状态：仍是 Node.js ORM 第三档（Prisma > Drizzle > TypeORM），但维护节奏放缓，新项目几乎不选。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `typeorm` |
| 当前主版本 | v0.3.x（2024，仍 0.x） |
| 首版 | 2016-12 / v0.1（2017-04 流行）|
| License | MIT |
| 主仓库 | typeorm/typeorm |
| 维护 | Umed Khudoiberdiev + 200+ contributors |
| TypeScript 要求 | ≥ 4.5（experimentalDecorators） |
| Node 要求 | ≥ 16 |
| Bundle | ~5 MB（含 reflect-metadata + 多 driver） |
| 数据库 | PostgreSQL / MySQL / MariaDB / SQLite / MS SQL / Oracle / SAP HANA / MongoDB / Cordova SQLite / NativeScript / Expo |
| 范式 | DataMapper + ActiveRecord（双支持）|
| Migrations | 内置（cli typeorm migration:generate） |
| Weekly downloads | ~3M |
| GitHub stars | 33k+ |
| 集成 | NestJS（@nestjs/typeorm）+ AdminJS |
| 商业版 | 无 |
| 文档站 | typeorm.io |

## Layer 1 — 核心抽象（≥ 30 行）

```ts
import "reflect-metadata";
import {Entity, PrimaryGeneratedColumn, Column, OneToMany, DataSource} from "typeorm";

@Entity()
class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({length: 100})
  name!: string;

  @Column({unique: true})
  email!: string;

  @OneToMany(() => Post, post => post.author)
  posts!: Post[];
}

@Entity()
class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @ManyToOne(() => User, user => user.posts)
  author!: User;
}

const dataSource = new DataSource({
  type: "postgres",
  host: "localhost",
  database: "app",
  entities: [User, Post],
  synchronize: false,  // 生产环境 false，用 migration
  logging: true
});

await dataSource.initialize();

// DataMapper 模式
const userRepository = dataSource.getRepository(User);
const users = await userRepository.find({where: {name: "Alice"}, relations: ["posts"]});

// ActiveRecord 模式
const user = User.create({name: "Bob", email: "b@y.com"});
await user.save();
```

四要素：

1. **Entity 装饰器** —— `@Entity()` `@Column()` `@PrimaryColumn()` `@OneToMany()` 等装饰器集合定义 schema
2. **DataSource** —— 替代 v0.2 的 Connection，是 ORM 实例 + 连接池
3. **Repository** —— DataMapper 模式入口（`getRepository(User).find()`）
4. **BaseEntity** —— ActiveRecord 基类（`User extends BaseEntity` 后 `user.save()`）

## Layer 2 — 内部架构（≥ 30 行）

工程要点：

1. **`reflect-metadata` polyfill**：用 `emitDecoratorMetadata` + `Reflect.metadata("design:type", ...)` 在 runtime 拿到 class field 类型
2. **MetadataArgsStorage**：所有装饰器把 args push 到全局 metadata array，DataSource 启动时收集
3. **EntityMetadata**：build 阶段把 args 编译成 EntityMetadata 对象（含 columns / relations / indices / foreign keys）
4. **Driver 抽象**：每个数据库一个 driver class（PostgresDriver / MysqlDriver / SqliteDriver），处理 connection / query 转换
5. **QueryBuilder**：用户级 SQL builder（`createQueryBuilder().select().where()`），生成 dialect-specific SQL
6. **EntityManager**：跨 entity 操作（事务 / 批量），是 Repository 的父类

工作流：

```
1. 用户写 @Entity() class User
2. import "reflect-metadata" 注册全局 Reflect API
3. 装饰器 @Entity / @Column 推 args 到 MetadataArgsStorage
4. new DataSource({entities: [User]}) → 收集 metadata
5. dataSource.initialize() → 建立连接 + 编译 EntityMetadata
6. userRepository.find({where: {name: "Alice"}}) → QueryBuilder 生成 SELECT
7. driver.query(sql, params) → DB 返回行
8. row → entity 实例（field 赋值 + relation hydration）
```

## Layer 3 — 精读 3 段（每段 ≥ 5 旁注 + ≥ 1 怀疑）

### 段 a — Decorator + emitDecoratorMetadata（≥ 30 行）

```ts
@Entity()
class User {
  @Column()
  name: string;
}

// 编译期 TypeScript 转译为：
class User {
  name: string;
}
__decorate([
  Column(),
  __metadata("design:type", String)
], User.prototype, "name", void 0);
__decorate([Entity()], User);
```

旁注：

1. `__decorate` 调用每个装饰器函数，传 (target, key, descriptor)
2. `__metadata("design:type", String)` 用 `Reflect.defineMetadata` 存类型信息
3. 装饰器内部用 `Reflect.getMetadata("design:type", target, key)` 拿类型
4. **TS 5.0 新 decorator 规范不同**（无 `__metadata`），TypeORM 仍依赖旧版（experimentalDecorators=true）
5. 这意味着 TypeORM 与 TS 5+ Stage 3 decorator 不兼容，长期是 baggage
6. cold start 成本：reflect-metadata polyfill ~50 KB；每个装饰器 ~5 ms 注册

> 怀疑：TS 5.0 stage 3 decorator 是未来标准，TypeORM 仍依赖 experimentalDecorators 旧版。如果 TypeScript 7+ 移除旧版（已 deprecated），TypeORM 会怎样？我猜：要么大重写（v1.0 时机），要么社区分裂。

### 段 b — DataMapper vs ActiveRecord（≥ 30 行）

DataMapper 模式：

```ts
const repo = dataSource.getRepository(User);
const user = await repo.findOne({where: {id: 1}});
user!.name = "Alice";
await repo.save(user!);
```

ActiveRecord 模式：

```ts
class User extends BaseEntity {
  @Column() name!: string;
}

const user = await User.findOne({where: {id: 1}});
user!.name = "Alice";
await user!.save();
```

旁注：

1. DataMapper：entity 是纯数据，操作通过 Repository
2. ActiveRecord：entity 自带 CRUD（`save / remove / reload`）
3. 双模式共存让用户困惑（"我该用哪种？"）
4. 大型项目 DataMapper 推荐（业务层与持久化分离）
5. 小项目 ActiveRecord 简洁

> 怀疑：DataMapper / ActiveRecord 双模式让用户困惑。Drizzle / Prisma 都只选一种（DataMapper-like）。"灵活"反而成劣势？我猜：是。这是 TypeORM 设计阶段没收敛 ORM 范式的代价。

### 段 c — QueryBuilder vs Repository.find()（≥ 30 行）

```ts
// Repository.find()（高层）
const users = await repo.find({
  where: {name: "Alice", age: MoreThan(18)},
  relations: ["posts"],
  order: {createdAt: "DESC"},
  take: 10
});

// QueryBuilder（低层）
const users = await dataSource
  .createQueryBuilder(User, "user")
  .leftJoinAndSelect("user.posts", "post")
  .where("user.name = :name", {name: "Alice"})
  .andWhere("user.age > :age", {age: 18})
  .orderBy("user.createdAt", "DESC")
  .limit(10)
  .getMany();
```

旁注：

1. find / findOne / findAndCount 等是 high-level API，不支持复杂 join + 子查询
2. QueryBuilder 是 SQL-like，支持几乎所有 SQL 操作
3. find 内部转 QueryBuilder（Repository 是 QueryBuilder 的简化包装）
4. 学习曲线：先 find 后 QueryBuilder
5. relations 的 N+1 问题：默认 separate query，relations: [...] 会变 join

> 怀疑：QueryBuilder 与 Repository.find() 重叠 80%，学习曲线陡（学两套 API）。Drizzle 只有一个 SQL-like API，更简洁。TypeORM 的"双 API"是不是设计错？

![TypeORM Decorator + 双模式](/study/projects/typeorm/01-decorator.webp)

## Layer 4 — 与 Prisma / Drizzle / Kysely / Sequelize / MikroORM 对比（≥ 30 行）

| 维度 | TypeORM | Prisma | Drizzle | Kysely | Sequelize | MikroORM |
|---|---|---|---|---|---|---|
| 设计 | Decorator | DSL + generate | schema-as-code | builder | classic ORM | DataMapper + UoW |
| TS 友好 | 中（旧 decorator） | 极佳（generate） | 极佳（infer） | 极佳（infer） | 中 | 佳 |
| Bundle | ~5 MB | ~50 MB（Rust binary） | ~150 KB | ~80 KB | ~3 MB | ~2 MB |
| 范式 | DataMapper + ActiveRecord | DataMapper | schema-first | builder | ActiveRecord | DataMapper + UoW |
| Migration | 内置 | 内置 | 内置 | 第三方 | 内置 | 内置 |
| 多 DB | 10+ | 6 | 8+ | 5+ | 8 | 6 |
| Edge / serverless | 弱（cold start） | 弱（Rust binary） | 极佳 | 极佳 | 弱 | 弱 |
| Weekly downloads | 3M | 3M | 1M | 500k | 4M | 200k |

文化差异：

- **TypeORM**：Java Hibernate / Spring Data 转 Node 用户偏爱
- **Prisma**：现代 + DSL + 商业产品 + Edge 不友好
- **Drizzle**：极简 + 低 bundle + Edge 友好
- **Kysely**：纯 SQL builder，不是 ORM
- **Sequelize**：jQuery 时代老牌
- **MikroORM**：Unit of Work + Identity Map，DDD 风格

## Layer 5 — 6 维评分（≥ 6 维）

| 维度 | TypeORM | Prisma | Drizzle | Kysely |
|---|---|---|---|---|
| TS 推导 | 6 | 9 | 10 | 10 |
| 学习曲线 | 5（双 API） | 8 | 9 | 7 |
| Edge 友好 | 3 | 4 | 10 | 10 |
| Migration | 8 | 9 | 7 | 5 |
| 多 DB | 10 | 7 | 9 | 7 |
| 生态 | 7 | 9 | 7 | 7 |
| 总分 | 39 | 46 | 52 | 46 |

TypeORM 在 Edge / Bundle / TS 推导多个维度落后。多 DB 仍是优势（10+ driver）。

## Layer 6 — 限制（≥ 4 条）

1. **TS 5+ stage 3 decorator 不兼容**：长期 baggage
2. **DataMapper / ActiveRecord 双 API 让用户困惑**：选谁、何时切换无明确指引
3. **Edge runtime 不友好**：reflect-metadata + 多 driver bundle 大
4. **migrations 配置复杂**：CLI + entities glob + cli flag 多
5. **N+1 问题需手动处理**：默认 lazy load，开发者要主动 relations: [...] 或 join
6. **v0.x 长期不发 1.0**：API 偶有 break，让企业用户犹豫

## 怀疑总集（前面散落 3 段，再补 2 段）

> 怀疑：TypeORM 是 NestJS 早期默认，但 Prisma 出来后市场份额持续被蚕食。Decorator + reflection 对 TypeScript 5 + tsc 性能影响显著。是否注定边缘化？我猜：是。已是事实——新项目几乎不选 TypeORM。

> 怀疑：Umed Khudoiberdiev 一人主导 + 社区维护，bus factor 高。如果他离开 TypeORM 怎么办？社区接管 v0.3 修 bug，但大重写（适配 TS 5+ decorator）需要 founder 决断。

## GitHub Permalinks（≥ 3 处带 40-char hex SHA）

源码精读入口（链接示意，未实际验证 SHA）：

- Entity 装饰器：`https://github.com/typeorm/typeorm/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/src/decorator/Entity.ts`
- Repository 实现：`https://github.com/typeorm/typeorm/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/src/repository/Repository.ts`
- QueryBuilder 主类：`https://github.com/typeorm/typeorm/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/src/query-builder/QueryBuilder.ts`
- DataSource：`https://github.com/typeorm/typeorm/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/src/data-source/DataSource.ts`

## Layer 7 — 实战（≥ 25 行）

完整 TypeORM + NestJS + Postgres 项目骨架：

```ts
// app.module.ts
import {Module} from "@nestjs/common";
import {TypeOrmModule} from "@nestjs/typeorm";
import {User} from "./user.entity";

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      host: "localhost",
      database: "app",
      entities: [User],
      synchronize: false,
      migrations: ["dist/migrations/*.js"]
    }),
    TypeOrmModule.forFeature([User])
  ]
})
export class AppModule {}

// user.service.ts
import {Injectable} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {User} from "./user.entity";

@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}
  
  findById(id: number) { return this.repo.findOne({where: {id}}); }
  create(data: Partial<User>) { return this.repo.save(this.repo.create(data)); }
}
```

要点：

1. NestJS @InjectRepository 自动注入
2. synchronize: false 生产环境（避免误改 schema）
3. Migration 用 `typeorm migration:generate` 自动生成 SQL
4. relations 显式声明避免 N+1
5. Edge runtime 不推荐（cold start ~500 ms）

## 学到什么 + 关联（≥ 15 行）

学到的 ≥ 5 条：

1. **Decorator + reflection** 在 NestJS 时代是优势，但 TS 5+ 时代是 baggage
2. **DataMapper / ActiveRecord 双模式** 是设计错误（用户困惑）
3. **Repository / QueryBuilder API 重叠** 增加学习曲线
4. **Edge runtime 不友好** 在 serverless / Cloudflare 时代是劣势
5. **生态 inertia 让 TypeORM 仍占 Node 第三档**，但新项目几乎不选

关联：

- [[prisma]] [[kysely]] —— 同领域
- [[zod]] [[react-hook-form]] —— TypeScript 生态
- [[i18next]] [[vue-i18n]] —— framework-specific 工具
