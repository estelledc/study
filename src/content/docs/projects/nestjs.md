---
title: NestJS — 用模块与 DI 组织 Node 后端的企业级框架
来源: https://github.com/nestjs/nest
日期: 2026-05-30
分类: 后端框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/nestjs/nest
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2b36ee5fea13dedcedfd9815a9c193b2d21130c1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.2.3
---

## 是什么

NestJS 是一个用装饰器、模块和依赖注入组织 Node 后端的框架。日常类比：它像工厂调度台——`@Module` 划分车间，`@Injectable` 登记工人，`@Controller` 开对外窗口；真正接 HTTP 请求的是底下的 adapter，不是 Nest 自己实现的服务器。

你写：

```ts
@Injectable()
class UsersService { findAll() { return [{ id: 1 }]; } }

@Controller('users')
class UsersController {
  constructor(private users: UsersService) {}
  @Get() list() { return this.users.findAll(); }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
class AppModule {}
```

`NestFactory.create(AppModule)` 会扫描模块树、按依赖实例化 provider，再把路由挂到 HTTP adapter。未传入 adapter 时，固定 `11.2.3` 会 `require('@nestjs/platform-express')` 并构造 `ExpressAdapter`。

## 为什么重要

不理解 NestJS 这套，下面这些事都没法解释：

- 为什么同一套 controller / provider 可以挂到 Express 或 Fastify，而不等于“换一个字符串就切完”
- 为什么 constructor 参数能自动注入，却仍依赖 `reflect-metadata` 与 `design:paramtypes`
- 为什么某个 provider 标成 `Scope.REQUEST` 后，依赖它的整棵树都会变成非静态
- 为什么跨模块注入失败时，问题常常在 `exports` 而不在 decorator 本身

## 核心架构与流程

固定 `11.2.3` 的启动与请求链可以拆成五步：

1. **选 adapter 并建容器**：`NestFactory.create()` 要么使用传入的 `AbstractHttpAdapter`，要么加载 Express adapter；随后创建 `NestContainer`、`Injector`、`DependenciesScanner`。

2. **扫描模块图**：`DependenciesScanner.scan()` 先注册内部 core module，再递归读 `imports` / `providers` / `controllers` / `exports`，计算模块距离并绑定 global scope。

3. **按拓扑实例化**：`InstanceLoader` 先给 provider / injectable / controller 建 prototype，再并行 `loadProvider` / `loadInjectable` / `loadController`。构造参数来自 `design:paramtypes`，再用 `@Inject` 的 `self:paramtypes` 覆盖。

4. **跨模块可见性看 exports**：向已 import 的模块解析依赖时，目标 token 必须同时出现在该模块的 `exports` 与 `providers`；只 import 不 export 不能注入。

5. **请求时 guard → interceptor → pipe → handler**：`RouterExecutionContext` 先跑 guard，再让 interceptor 包住后续步骤；pipe 在 interceptor 最内层、调用 handler 之前执行。返回值由 response controller 写出，不必手写 `res.json()`。

## 实践示例

### 案例 1：最小 module 起步

```ts
import { Module, Controller, Get, Injectable } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Injectable()
class UsersService { findAll() { return [{ id: 1, name: 'Ada' }]; } }

@Controller('users')
class UsersController {
  constructor(private users: UsersService) {}
  @Get() list() { return this.users.findAll(); }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
class AppModule {}

const app = await NestFactory.create(AppModule);
await app.listen(3000);
```

同一模块内的 provider 可以直接注入。`listen()` 发生在实例化之后；扫描失败且未关 `abortOnError` 时，固定实现会 `process.abort()`。

### 案例 2：显式传入 Fastify adapter

```ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';

const app = await NestFactory.create(AppModule, new FastifyAdapter());
await app.listen(3000);
```

这不是改一行配置名。固定 `11.2.3` 的 `@nestjs/platform-fastify` 依赖 Fastify 5.11.3，并在 adapter 里自建 Fastify instance；直接碰 `req.app`、Express middleware 或 multipart 约定的代码不会自动兼容。

### 案例 3：guard、interceptor 与 pipe 的真实顺序

```ts
@Injectable()
class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    return !!ctx.switchToHttp().getRequest().headers.authorization;
  }
}

@Controller('users')
@UseGuards(AuthGuard)
class UsersController {
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return { id }; }
}
```

请求先过 guard；过了之后 interceptor 才包住“pipe + handler”。`ParseIntPipe` 不会在 guard 之前跑。旧印象里的“guard → pipe → handler”少了 interceptor 这一层包裹。

## 踩过的坑

1. **仍然依赖实验装饰器元数据**：仓库 tsconfig 仍开 `experimentalDecorators` 与 `emitDecoratorMetadata`。DI 读的是 `design:paramtypes`。esbuild 等不发射该 metadata 的工具链会得到稀疏参数表；这不是 TypeScript 5 stage-3 decorator 的默认行为。

2. **REQUEST scope 会沿着依赖树上浮**：`InstanceWrapper.isDependencyTreeStatic()` 在自身或任一依赖是 `Scope.REQUEST` 时返回 false。给 logger 加 REQUEST 以便带 trace id，可能让整棵子树按请求实例化。`durable` 只能和 REQUEST 一起用，用来构造惰性子树，不是性能开关。

3. **默认 Express 5，不是“一行切 Fastify”**：未传 adapter 时加载 `@nestjs/platform-express`，该包固定依赖 Express 5.2.1。改用 Fastify 必须传入 `FastifyAdapter`，并处理 cookie、multipart、底层 request 形状差异。

4. **export 不是礼貌标记**：`validateExportedProvider()` 只允许导出本模块 provider 或已 import 的模块 token。跨模块查找还要求 `exports.has(name) && providers.has(name)`。漏 export 会表现为“can't resolve dependencies”，不一定是循环依赖。

## 适用 vs 不适用场景

**适用**：

- 需要统一模块边界、测试替换和多 transport（HTTP / microservice / WebSocket）的中大型后端
- 团队已熟悉 Angular / Spring 式 annotation + IoC
- 希望业务代码不直接依赖 Express 或 Fastify 的 request/response 形状

**不适用**：

- 只需几条路由的脚本或 BFF——模块扫描和 DI 图是固定成本
- 不能接受 `reflect-metadata` / 实验装饰器发射合同的构建链
- 边缘 runtime 或短生命周期 worker：启动时要扫整棵模块树再实例化
- 把 Nest 当 Express 兼容层，却继续大量使用底层 `req` / `res` 专有 API

## 固定版本边界

- 本文绑定 `nestjs/nest@2b36ee5fe...`，GitHub Release 与 npm `@nestjs/core@11.2.3` 的 `gitHead` 均为该提交。
- 源码树里 `packages/*/package.json` 的 `gitHead` 字段仍写着旧提交 `bcb4747f...`，以 npm registry 与 annotated tag 为准。
- 审阅当日 npm `latest` 已是 `12.0.0`，其 `gitHead` 为 `6494a6c2...`，与 GitHub tag `v12.0.0` 的剥皮提交一致，但当时还没有 GitHub Release 页；本文不把 v12 当已核验合同。
- 引擎声明为 Node `>= 20`。peer 包括 `reflect-metadata` 与 `rxjs`。
- 本文未安装依赖、未跑上游测试、未启动 HTTP 服务或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **框架主链是扫描 + 注入 + adapter**——Nest 管组织，HTTP 语义仍由 Express / Fastify 实现。
2. **装饰器只写 metadata**——没有 `design:paramtypes` 或显式 `@Inject`，DI 无法可靠推断构造参数。
3. **作用域是树属性**——REQUEST 不是单个 provider 的局部开关。
4. **enhancer 顺序以源码为准**——guard 在前，interceptor 包裹 pipe 与 handler。

## 应用型自测

1. 调用 `NestFactory.create(AppModule)` 且不传第二参，固定 11.2.3 会加载哪个 HTTP adapter？
2. 一个 DEFAULT provider 依赖 `Scope.REQUEST` 的服务后，它的依赖树还是静态的吗？
3. `@UseGuards` 与 `@Param(..., ParseIntPipe)` 同时存在时，pipe 会在 guard 之前执行吗？

检查点：

1. `@nestjs/platform-express` 的 `ExpressAdapter`。
2. 不会。`isDependencyTreeStatic()` 会因 REQUEST 依赖返回 false。
3. 不会。guard 先执行；pipe 在 interceptor 包住的 handler 里、调用方法前执行。

## 延伸阅读

- 文档：[docs.nestjs.com](https://docs.nestjs.com)
- 固定源码：[nestjs/nest](https://github.com/nestjs/nest) —— 本文绑定提交 `2b36ee5fea13dedcedfd9815a9c193b2d21130c1`
- 对照：[[koa]] 把组织问题留给用户，只保留 ctx 与中间件链
- [[spring-boot]] —— annotation / IoC 对照，不是源码等价物

## 关联

- [[koa]] —— 同主题的极简洋葱模型对照
- [[express]] —— 固定版本的默认 HTTP adapter
- [[fastify]] —— 需显式传入的可选 adapter
- [[spring-boot]] —— Java 侧 IoC / 模块化对照
- [[fastapi]] —— Python 类型注解 + Depends 的另一条组织路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[axum]] —— axum — 用 Rust 类型系统当『路由参数表』的 Web 框架
- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[commander]] —— commander.js — Node.js CLI 解析的声明式标准
- [[echo]] —— Echo — 极简高性能 Go 框架，5 行起服务
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[gin]] —— Gin — Go 写 web API 的事实标准框架
- [[hot-chocolate]] —— Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器
- [[immich]] —— Immich — 把家庭照片从别人的云里救回自己机器
- [[litestar]] —— Litestar — 类型驱动的 ASGI 框架（原 Starlite）
- [[micronaut]] —— Micronaut — 编译期搞定 DI 的 JVM 云原生框架
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
- [[spring-boot]] —— Spring Boot — 用 Auto-configuration 把 Java 后端从 XML 地狱里救出来的事实标准框架
- [[symfony]] —— Symfony — 把 PHP 框架拆成 30 个独立组件再拼起来
