---
title: ASP.NET Core — 微软跨平台 web 框架
来源: 'https://github.com/dotnet/aspnetcore'
日期: 2026-05-30
分类: backend-framework
难度: 中级
---

## 是什么

ASP.NET Core 是**微软在 2016 年开源的跨平台 web 框架**，用 C# 写，能在 Windows / macOS / Linux 上跑同一份代码。日常类比：像一条**工厂流水线**——HTTP 请求从一头进来，穿过一节一节的工位（鉴权、日志、压缩、路由），最后从另一头吐出响应。每个工位都能换、能加、能拿掉。

旧 ASP.NET 绑死 Windows 服务器（IIS），2014 年微软看着 Linux 容器和云原生兴起，决定推倒重来：把单体框架拆成**Kestrel**（HTTP 服务器）+ **middleware**（中间件管道）+ **DI 容器**（依赖注入）+ **minimal API**（极简端点写法）四个核心模块。

最小例子：

```csharp
var app = WebApplication.Create(args);
app.MapGet("/", () => "Hello World");
app.Run();
```

三行起一个 web 服务，这就是 minimal API 的样子。性能上 ASP.NET Core 在 TechEmpower 基准常年排前列。

## 为什么重要

不理解 ASP.NET Core，下面这些事都没法解释：

- 为什么微软 Azure 后台、Stack Overflow、众多企业生产服务都跑在它上面
- 为什么 C# 在 web 后端领域能和 Java（Spring）/ Node.js（Express）正面竞争
- 为什么 minimal API 几行能写完一个服务，而传统 MVC 要建 4 个文件
- 为什么"中间件顺序错了"是 ASP.NET Core 新人最常见的 bug

## 核心要点

ASP.NET Core 的核心机制可以拆成 **三块**：

1. **Kestrel HTTP 服务器**：监听端口、解析 HTTP 协议，跨平台跑。类比：流水线最前面的"卸货码头"，所有原料（请求字节）都从这里进。Kestrel 用 .NET 内置的高性能 Socket，不依赖 IIS 也不依赖 nginx。

2. **中间件管道（middleware pipeline）**：一串函数，请求按顺序穿过。每个函数能读改请求、调下一个、读改响应。类比：流水线上的工位，每个工位决定"加工后让产品继续往后走" 或 "直接打回去"。鉴权、日志、CORS、错误处理都是中间件。

3. **依赖注入（DI）容器**：内置的对象工厂，按你声明的接口找具体实现，注入到构造函数。类比：餐厅后厨——服务员（Controller）说"我要一份番茄炒蛋"，DI 是后厨经理，决定谁来炒、用谁家的锅。

三块拼起来，就是一个能扩展的 web 服务。

## 实践案例

### 案例 1：Minimal API 写一个 REST 端点

```csharp
var app = WebApplication.Create(args);

app.MapGet("/users/{id}", (int id) =>
{
    return Results.Ok(new { Id = id, Name = "Jason" });
});

app.Run();
```

**逐部分解释**：

- `WebApplication.Create` 一行起好框架（管 Kestrel + DI + 默认中间件）
- `MapGet("/users/{id}", ...)` 路由：GET 请求 `/users/123` 触发这个 lambda
- `Results.Ok(...)` 自动把对象序列化成 JSON 返回
- 完全不用建 Controller / Startup / 配置文件

### 案例 2：中间件管道——日志 + 鉴权

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.Use(async (context, next) =>
{
    Console.WriteLine($"Got {context.Request.Path}");
    await next();   // 让请求继续往后走
    Console.WriteLine($"Done {context.Response.StatusCode}");
});

app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/secret", () => "shh").RequireAuthorization();
app.Run();
```

**怎么读**：每个 `app.Use*` 往管道末尾加一节。请求穿过：自定义日志 → 认证 → 授权 → 路由处理 → 反向穿回响应。`await next()` 是关键，不调就在这里截断。

### 案例 3：依赖注入注入服务

```csharp
public interface IUserService { string GetName(int id); }
public class UserService : IUserService { public string GetName(int id) => "Jason"; }

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddScoped<IUserService, UserService>();   // 每个请求一份
var app = builder.Build();

app.MapGet("/u/{id}", (int id, IUserService svc) => svc.GetName(id));
app.Run();
```

**逐部分解释**：

- `AddScoped` 声明：要 `IUserService` 时，给 `UserService` 实例，每个 HTTP 请求新建一份
- 端点 lambda 的参数 `IUserService svc` 由 DI 容器自动填
- 换成 `AddSingleton` 是全进程一份，`AddTransient` 是每次都新建

## 踩过的坑

1. **中间件顺序错**——`UseAuthentication` 必须在 `UseAuthorization` 之前，`UseRouting` 必须在 `UseEndpoints` 之前。顺序写反，鉴权静默失效或一律 401，没报错很难查。

2. **DI 生命周期混搭**——把 Scoped 服务注入到 Singleton 里，Scoped 实际被 Singleton 持有，活到进程结束，不同请求状态串号。新人常踩。

3. **async 调 `.Result` 或 `.Wait()`**——同步阻塞异步，线程池里所有线程被占住等不到完成，整个服务卡死。老 ASP.NET 习惯搬过来的最容易犯。

4. **配置覆盖顺序记错**——`appsettings.json` < `appsettings.Production.json` < 环境变量 < 命令行参数。本地 launchSettings 设了一个值，部署上去被环境变量盖掉，"为什么本地能跑"由此而来。

## 适用 vs 不适用场景

**适用**：

- 企业级 REST / GraphQL / gRPC 服务（强类型 + 高性能 + 完整生态）
- 实时通信（SignalR 内置 WebSocket，不用外接库）
- 全栈 web 应用（Razor / Blazor + EF Core 一条龙）
- 跨平台容器部署（Linux + Docker，原生 AOT 冷启动 < 100ms）

**不适用**：

- 极简脚本式服务（用 [[express]] / [[sinatra]] 几行就够，不用引入 .NET 运行时）
- 团队完全没 C#/.NET 背景且时间紧（学习曲线比 Express 陡）
- 嵌入式或资源极度受限场景（运行时 + GC 仍有 30+ MB 基线）
- 需要硬实时（GC 偶尔停顿，做高频交易选 Rust [[axum]]）

## 历史小故事（可跳过）

- **2002 年**：ASP.NET 1.0 发布，绑死 Windows + IIS，是当年企业 web 主力之一。
- **2014 年**：微软看着 Linux 容器和云原生兴起，宣布 .NET 跨平台开源，组建团队推倒重来。
- **2016 年**：ASP.NET Core 1.0 发布，重写 HTTP 栈用 Kestrel，砍掉 System.Web 依赖，可跑 Linux。
- **2020 年**：.NET 5 把 .NET Framework 和 .NET Core 合一，框架名简化成 .NET。
- **2022 年**：.NET 6 引入 minimal API + hot reload，从"传统 MVC"风格转向"几行起服务"。
- **2024 年**：.NET 9 + 原生 AOT 让冷启动 < 100ms，瞄准 serverless 场景。

## 学到什么

1. **重写需要勇气也需要克制**——ASP.NET Core 砍掉了 15 年积累的 API，但保留了 C# 语言和 .NET 生态，没把用户连根拔起
2. **中间件管道是 web 框架的通用骨架**——Express / Koa / [[axum]] / [[ktor]] 都是这套思路，懂一个能迁移
3. **DI 容器内置进框架**比第三方接进来体验好得多——配置统一、生命周期可控
4. **跨平台不只是技术问题，是生态问题**——.NET Core 用了几年才让 Linux 部署体验追上 Windows

## 延伸阅读

- 官方文档：[ASP.NET Core docs](https://learn.microsoft.com/aspnet/core)（深度足够，免费）
- 中间件原理视频：[How ASP.NET Core middleware works (Nick Chapsas)](https://www.youtube.com/watch?v=OFw8tOexLrQ)
- 性能基准：[TechEmpower Round 22](https://www.techempower.com/benchmarks)（看 ASP.NET Core 在 web 框架里的位置）
- 源码：[github.com/dotnet/aspnetcore](https://github.com/dotnet/aspnetcore)（36k+ star）

## 关联

- [[spring-boot]] —— Java 阵营对标，ASP.NET Core 是 .NET 阵营答案
- [[express]] —— Node.js 极简框架，中间件思想同源
- [[fastapi]] —— Python 用类型注解写 API，minimal API 哲学相通
- [[axum]] —— Rust 框架，性能和类型安全方向类似
- [[ktor]] —— Kotlin 跨平台 web，同样押注协程 + DSL
- [[rails]] —— Ruby 全栈框架，约定优于配置的另一极
- [[django]] —— Python 全栈对照组，路由和 ORM 设计可对比

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hot-chocolate]] —— Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[orleans]] —— Orleans — 让分布式服务写起来像单机对象
- [[phoenix]] —— Phoenix — Elixir/OTP 上的实时 web 框架
