---
title: Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器
来源: 'https://github.com/ChilliCream/graphql-platform'
日期: 2026-05-30
分类: 后端 API
难度: 中级
---

## 是什么

Hot Chocolate 是 **.NET 生态最主流的 GraphQL 服务器**：你写普通 C# 类和方法，它自动把这些类型变成对外的 GraphQL schema。

日常类比：像点菜系统的"自动菜单生成器"。Apollo Server 那一派要你先手写菜单（SDL）再做厨师（resolver）；Hot Chocolate 反过来——你只写厨师（C# 方法），系统按厨师能做什么自动印一份菜单出来。

最小例子：

```csharp
public class Query {
  public string Hello() => "world";
}

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddGraphQLServer().AddQueryType<Query>();
var app = builder.Build();
app.MapGraphQL();
app.Run();
```

跑起来访问 `/graphql`，里面就有一个 `hello: String` 字段，自带 Nitro（前身 Banana Cake Pop）网页 IDE 让你直接写查询测试。

## 为什么重要

不理解 Hot Chocolate，下面这些事都不好解释：

- 为什么 .NET 团队从 2020 年开始扔掉老牌 GraphQL.NET，集体迁过来——code-first 省一半样板
- 为什么 Microsoft / Swiss Post 这种保守巨头敢在生产用 GraphQL——Hot Chocolate 把 ASP.NET Core 中间件 / EF Core / Authorization 都接好了
- 为什么 Fusion 联邦能跟 Apollo Federation 打——同样的 `@key` / `@external` 思路但生成器自动写胶水
- 为什么 v13 升级时全网在骂 attribute 改名——这是 code-first 阵营的"v3→v4 改 import"

## 核心要点

Hot Chocolate 的设计可以拆成 **三块**：

1. **code-first**：你不写 SDL，写 C# 类。系统反射读类型 + `[GraphQLType]` / `[UseFiltering]` 等 attribute，自动推出 schema。类比：先有厨师，再印菜单，菜单永远跟厨师同步。也支持 schema-first 但社区主流走 code-first。

2. **DataLoader 解 N+1**：和 Apollo / graphql-yoga 一样，用 DataLoader 把"一次请求里多次按 id 取数据"合并成一次批量查询。Hot Chocolate 内置实现，注册成 Scoped 服务自动绑定到请求生命周期。

3. **执行引擎 + Fusion**：底层 `IExecutionEngine` 把查询编译成执行计划再跑；Fusion 是 Hot Chocolate 自己的联邦方案，gateway 用源生成器把多个 subgraph 拼成一份对外 schema。

底层是纯 .NET 实现，不依赖 graphql-js，订阅走 ASP.NET Core 的 WebSocket / SSE。

## 实践案例

### 案例 1：最小 ASP.NET Core 集成

```csharp
public record Book(string Title, string Author);

public class Query {
  public IEnumerable<Book> GetBooks() =>
    new[] { new Book("Clean Code", "Martin") };
}

builder.Services
  .AddGraphQLServer()
  .AddQueryType<Query>();
app.MapGraphQL("/graphql");
```

启动后访问 `/graphql`，Nitro IDE 里能直接 `query { books { title author } }`。schema 由 `Query` 类反射推出来——`GetBooks` 自动变成 `books` 字段。

### 案例 2：用 DataLoader 解 N+1

```csharp
public class BookByIdDataLoader : BatchDataLoader<int, Book> {
  protected override async Task<IReadOnlyDictionary<int, Book>>
    LoadBatchAsync(IReadOnlyList<int> ids, CancellationToken ct) {
      var books = await db.Books.Where(b => ids.Contains(b.Id)).ToListAsync(ct);
      return books.ToDictionary(b => b.Id);
    }
}

public class Query {
  public Task<Book> GetBook(int id, BookByIdDataLoader loader) =>
    loader.LoadAsync(id);
}
```

注册成 `Scoped` 后，一个请求里 100 次 `loader.LoadAsync(id)` 会被合并成一次 `WHERE id IN (...)` 查询，而不是 100 次 SQL。

### 案例 3：Strawberry Shake 强类型客户端

```bash
dotnet new tool-manifest
dotnet tool install StrawberryShake.Tools --local
dotnet graphql init https://api.example.com/graphql -n MyClient
```

把 `.graphql` 查询文件丢进项目，源生成器编译时产出强类型 C# 客户端：

```csharp
var result = await client.GetBooks.ExecuteAsync();
foreach (var book in result.Data!.Books) {
  Console.WriteLine($"{book.Title} by {book.Author}");
}
```

字段拼写错、字段不存在，**编译时**就报错，不用等运行时 500。

## 踩过的坑

1. **code-first 反射启动慢**：大型 schema（几百个类型）冷启动可能要几秒，因为要扫所有 `[ObjectType]` 类。v13+ 用 source generator（`HotChocolate.Types.Analyzers`）兜底，编译时把反射结果生成代码。

2. **DataLoader 作用域错放**：注册成 `Singleton` 会跨请求共享缓存，A 请求的数据泄到 B 请求。必须 `Scoped`，让每个 HTTP 请求一个独立 loader 实例。

3. **EF Core `[UseProjection]` 黑魔法**：自动 projection 重写 `IQueryable`，复杂 include / 多对多 join 容易生成性能差的 SQL，得用 EF Core 日志看实际查询，必要时退回手写 `Select`。

4. **v12 → v13 attribute 行为大改**：`[ObjectType]` 默认从"显式"变成"隐式包含 public 成员"，老代码升级一片飘红。**Banana Cake Pop → Nitro 的改名是 v13 → v14（约 2024）**，别和 v13 的 attribute 行为变更混成一次升级；链接、包名和文档要按目标大版本分别查。

## 适用 vs 不适用场景

**适用**：
- 已经在 .NET / ASP.NET Core 生态，要给前端开 GraphQL endpoint
- 想要 schema 跟 C# 类型同步、不想手维护 SDL 和模型双份
- 多团队多服务要联邦（Fusion 替代 Apollo Federation）
- 端到端 .NET 强类型——服务端 Hot Chocolate + 客户端 Strawberry Shake 一条龙

**不适用**：
- Node.js / Python / Go 项目 → 用 Apollo Server / graphql-yoga / Strawberry / gqlgen
- 简单内部 CRUD + 单团队 → REST + minimal API 更轻
- 极致延迟敏感的金融场景 → gRPC / Connect-RPC 二进制更快
- 老 GraphQL.NET 项目无强诉求 → 迁移成本高，schema-first 风格也不一致

## 历史小故事（可跳过）

- **2018 年**：ChilliCream 起步，瑞士小团队，目标"做 .NET 版的 graphql-js"
- **2019 年**：v10 开源，code-first 路线和老牌 GraphQL.NET 区分开
- **2020 年**：v11 大重构，自研执行引擎，性能追上 graphql-js
- **2022 年**：v13 加 source generator + Fusion 联邦
- **2024 年**：Banana Cake Pop IDE 改名 Nitro，独立成产品（多语言 GraphQL IDE）

## 学到什么

- **code-first 把"模型"提前**：C# 类是真相，schema 自动同步，避免双份维护
- **DataLoader 的位置只能是 Scoped**：这条规则在所有 GraphQL server 都成立，DI 容器再先进也得手动确认
- **生态圈完整 vs 单点强**：Hot Chocolate 不仅是 server，还包 IDE + 客户端 codegen + 联邦，这种"端到端"思路是 .NET 圈典型打法
- **反射 → source generator** 是 .NET 性能优化通用路线，启动期把动态变静态

## 延伸阅读

- 官方文档：[Hot Chocolate Docs](https://chillicream.com/docs/hotchocolate)（quickstart 到 Fusion 全覆盖）
- 视频：[ChilliCream YouTube](https://www.youtube.com/@ChilliCream)（团队自己讲新版本动机）
- Strawberry Shake：[客户端代码生成](https://chillicream.com/docs/strawberryshake)
- Nitro IDE：[chillicream.com/products/nitro](https://chillicream.com/products/nitro)
- DataLoader 原理：[graphql/dataloader](https://github.com/graphql/dataloader)（JS 版，思路通用）

## 关联

- [[apollo-server]] —— Node 端 schema-first GraphQL server，Hot Chocolate 的对照组
- [[graphql-yoga]] —— 跨运行时轻量 GraphQL 服务器，Node/Bun/Deno
- [[strawberry]] —— Python 用类型注解直接生成 GraphQL schema，code-first 同流派
- [[gqlgen]] —— Go 的 schema-first GraphQL server，类型由 SDL 倒推
- [[aspnetcore]] —— Hot Chocolate 的宿主框架，中间件 / DI / Authorization 全继承
- [[trpc]] —— 同站全 TS 替代品，没 schema language 靠 TS 推导
- [[nestjs]] —— Node 企业级框架，也有 GraphQL 模块走 code-first 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[aspnetcore]] —— ASP.NET Core — 微软跨平台 web 框架
- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC

