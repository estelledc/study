---
title: Retrofit — 把 HTTP API 变成 Java/Kotlin 接口的类型安全客户端
来源: 'https://github.com/square/retrofit'
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

Retrofit 是 Square 出品的**类型安全 HTTP 客户端**，面向 Android 和 JVM。日常类比：像餐厅里的**点菜单 + 传菜员**——你在菜单（interface）上勾选菜名和口味（注解描述 URL、参数、请求体），厨房按单做菜；你不需要自己跑后厨、拼 URL、手写 JSON 解析，传菜员（Retrofit 生成的实现类）把成品端到你面前（Kotlin/Java 对象）。

你写：

```kotlin
interface GitHubService {
    @GET("users/{user}/repos")
    suspend fun listRepos(@Path("user") user: String): List<Repo>
}
```

Retrofit 在运行时生成 `GitHubService` 的实现：把 `@GET` 拼成完整 URL、用 OkHttp 发请求、用 Converter 把 JSON 转成 `List<Repo>`。业务层只看到**普通接口方法调用**，看不到 socket、字节流和解析细节。

2010 年 Jake Wharton 在 Square 开源，和 OkHttp 组成 Android 网络栈事实标准；GitHub 上 4.3 万+ star，Maven 坐标 `com.squareup.retrofit2:retrofit`，2025 年 5 月发布 **3.0.0**（要求 Java 8+ 或 Android API 21+）。

## 为什么重要

不理解 Retrofit，下面这些事都没法解释：

- 为什么 Android 教程里 `interface ApiService` + `@GET` 就能调 REST，却找不到实现类源码
- 为什么换 Gson 成 Moshi 往往只改 `addConverterFactory` 一行，业务 interface 不动
- 为什么 Kotlin `suspend` 函数可以直接 `api.getUser()`，底层仍是 OkHttp 异步
- 为什么很多团队把「网络层」和「业务层」边界画在 Retrofit interface 上——它是契约，不是工具函数堆

## 核心要点

Retrofit 的运转可以拆成 **五块**：

1. **声明式接口（API 契约）**：每个 HTTP 端点对应 interface 里一个方法；`@GET` / `@POST` / `@PUT` / `@PATCH` / `@DELETE` / `@HEAD` / `@OPTIONS` 或自定义 `@HTTP` 指定方法与相对路径。路径占位用 `@Path("{name}")`，查询串用 `@Query`，请求体用 `@Body`，动态 Header 用 `@Header`。类比：菜单上每道菜一行，括号里写辣度、加料选项。

2. **Retrofit.Builder 组装运行时**：`baseUrl`（必须以 `/` 结尾）、`addConverterFactory`（JSON ↔ 对象）、可选 `client(OkHttpClient)`（超时、拦截器、证书）。`retrofit.create(MyApi::class.java)` 用动态代理生成实现。类比：餐厅加盟手册——定总部地址、定厨师（转换器）、定配送车（OkHttp）。

3. **Call 与协程两种返回风格**：
   - Java 风格：`Call<T>`，`.execute()` 同步阻塞，`.enqueue(Callback)` 异步回调。
   - Kotlin 风格：`suspend fun ...(): T` 或 `Response<T>`，编译器挂起，非 2xx 抛 `HttpException`。
   本质都是「描述一次尚未发出的 HTTP 请求」，真正 IO 在 OkHttp 线程池。

4. **Converter 负责序列化边界**：默认只认识 `RequestBody` / `ResponseBody`。加 `converter-gson`、`converter-moshi`、`converter-kotlinx-serialization` 等 sibling 模块后，`@Body User` 和 `User` 返回值才能自动 JSON 化。`Converter.Factory` 可自定义 YAML、Protobuf 等格式。

5. **底层是 OkHttp**：Retrofit 不自己建连接；所有 TLS、连接池、重试、拦截器都走 `OkHttpClient`。统一加 Token、打日志、Mock 响应，在 OkHttp `Interceptor` 里做，Retrofit interface 保持干净。

## 依赖与最小配置

Gradle（Kotlin DSL）常见写法：

```kotlin
dependencies {
    implementation("com.squareup.retrofit2:retrofit:3.0.0")
    implementation("com.squareup.retrofit2:converter-moshi:3.0.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
}
```

Moshi 需要 `kapt` 或 KSP 生成 adapter；若用 Gson 则换 `converter-gson`。R8 混淆时 Retrofit 自带 ProGuard 规则；纯 ProGuard 需手动合并 `retrofit2.pro` 和 OkHttp 规则。

## 实践案例

### 案例 1：Kotlin + suspend + Moshi 完整起步

```kotlin
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.GET
import retrofit2.http.Path

data class Repo(val id: Long, val name: String, val full_name: String)

interface GitHubService {
    @GET("users/{user}/repos")
    suspend fun listRepos(@Path("user") user: String): List<Repo>
}

fun main() {
    val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    val retrofit = Retrofit.Builder()
        .baseUrl("https://api.github.com/")
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    val api = retrofit.create(GitHubService::class.java)

    // 在协程作用域内调用
    // val repos = api.listRepos("square")
}
```

要点：`baseUrl` 末尾的 `/` 不能漏；`@GET("users/{user}/repos")` 是相对路径，会和 base 拼接。`suspend` 方法在非协程上下文不能直接调——Android 里用 `lifecycleScope.launch`，JVM 脚本用 `runBlocking`。

### 案例 2：POST + @Body + OkHttp 拦截器统一鉴权

```kotlin
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.http.Body
import retrofit2.http.POST
import java.util.concurrent.TimeUnit

data class LoginRequest(val email: String, val password: String)
data class TokenResponse(val access_token: String, val expires_in: Long)

interface AuthApi {
    @POST("v1/auth/login")
    suspend fun login(@Body body: LoginRequest): TokenResponse
}

fun buildApi(tokenProvider: () -> String?): AuthApi {
    val authInterceptor = Interceptor { chain ->
        val original = chain.request()
        val token = tokenProvider()
        val request = if (token != null) {
            original.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else original
        chain.proceed(request)
    }

    val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
        .addInterceptor(logging)
        .build()

    return Retrofit.Builder()
        .baseUrl("https://api.example.com/")
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create())
        .build()
        .create(AuthApi::class.java)
}
```

登录接口用 `@Body` 发 JSON；登录成功后把 token 存起来，`tokenProvider` 给后续请求自动带 `Authorization`。网络横切关注点放在 OkHttp 拦截器，Retrofit interface 只描述 REST 形状。

### 案例 3：Java 回调风格（遗留代码常见）

```java
public interface LegacyApi {
    @GET("status")
    Call<Health> health();
}

Retrofit retrofit = new Retrofit.Builder()
    .baseUrl("https://api.example.com/")
    .addConverterFactory(GsonConverterFactory.create())
    .build();

LegacyApi api = retrofit.create(LegacyApi.class);

api.health().enqueue(new Callback<Health>() {
    @Override
    public void onResponse(Call<Health> call, Response<Health> response) {
        if (response.isSuccessful()) {
            Health body = response.body();
            // 使用 body
        }
    }

    @Override
    public void onFailure(Call<Health> call, Throwable t) {
        // 网络层失败
    }
});
```

新 Kotlin 项目优先 `suspend`；维护老 Android 模块时仍会见到 `Call` + `enqueue`。`Response<T>` 包装 HTTP 状态码和 header，适合需要读 `code()` 而不是直接抛异常的场景。

## 常用注解速查

| 注解 | 作用 |
|------|------|
| `@GET` / `@POST` / … | HTTP 方法与相对路径 |
| `@Url` | 动态完整 URL（覆盖 baseUrl 路径部分） |
| `@Path("id")` | 替换路径中的 `{id}` |
| `@Query` / `@QueryMap` | URL 查询参数 |
| `@Header` / `@Headers` | 请求头（动态 / 静态） |
| `@Body` | JSON 或已转换的请求体 |
| `@Field` + `@FormUrlEncoded` | `application/x-www-form-urlencoded` |
| `@Part` + `@Multipart` | 文件上传 multipart |
| `@Streaming` | 大文件流式读 ResponseBody，避免整包进内存 |

## 踩过的坑

1. **`baseUrl` 必须以 `/` 结尾**：`https://api.example.com` 会报错或拼错路径；正确是 `https://api.example.com/`。

2. **interface 方法不能在 Android 主线程 `.execute()`**：同步调用会 NetworkOnMainThreadException；用 `enqueue` 或 `suspend`。

3. **Converter 顺序有优先级**：`addConverterFactory` 先注册的先尝试；Scalars 工厂放太前会把一切当 String，导致 Gson 永远轮不到。

4. **`@Url` 传相对路径时的拼接规则**：若 `@Url` 以 `/` 开头，会替换 baseUrl 的 path 部分；全 URL 则忽略 base 的 path。调试时看 OkHttp logging 最直观。

5. **数据类字段名与 JSON 不一致**：Moshi/Gson 要靠 `@Json(name = "...")` 或命名策略；否则静默得到 `null` 字段。

6. **把 Retrofit 实例到处 new**：应单例 `Retrofit` + 单例 `OkHttpClient`，否则连接池不复用，TLS 握手浪费严重。

## 适用 vs 不适用场景

**适用**：

- Android / JVM 调 REST JSON API（移动 App、桌面工具、后端集成第三方）
- 团队希望「API 契约」用 interface 集中管理，方便 Mock 和单元测试
- 已与 OkHttp 生态深度绑定（Certificate Pinning、Chucker 调试、缓存）
- 多端共享同一套 API 描述（配合 Kotlin Multiplatform 时常见 Moshi + Retrofit）

**不适用**：

- 纯浏览器前端 → 用 fetch / axios / ky
- Node.js 服务 → 用 undici、got、原生 fetch
- gRPC / WebSocket 长连接为主 → Retrofit 不是这档子工具（可看 OkHttp WebSocket 或其他 SDK）
- 极简脚本只打一两个 GET → `curl` 或一行 HttpClient 更轻

## 与 OkHttp、axios 的对比

| 维度 | Retrofit | OkHttp | axios |
|------|----------|--------|-------|
| 定位 | REST 接口生成器 | 底层 HTTP 引擎 | 高层 HTTP 客户端 |
| API 风格 | 注解 interface | Request/Response 对象 | config + Promise |
| 平台 | JVM / Android | JVM / Android | 浏览器 + Node |
| JSON | 靠 Converter 插件 | 手写或配合 Retrofit | 内置 transform |

Retrofit **离不开** OkHttp；axios 在概念上接近「Retrofit + Gson + 拦截器」打包给 JS 世界，但没有「interface 动态代理」这一层。

## 历史小故事（可跳过）

- **2010-09**：Square 开源 Retrofit，解决 Android 上 HttpURLConnection 难用、回调地狱问题
- **2013-2015**：与 OkHttp 2/3 深度整合，注解驱动 API 成为 Android 社区默认教科书写法
- **2017**：Kotlin 普及后，`Call` 逐渐让位给 `suspend` 扩展（Retrofit 2.6+ 内建支持，无需 Rx 适配器）
- **2020s**：Ktor Client、Apollo GraphQL 在部分场景分流，但 REST + Retrofit 仍是面试高频
- **2025-05**：Retrofit **3.0.0** 发布，延续 `com.squareup.retrofit2` 坐标，与新版 Kotlin / OkHttp 对齐

## 学到什么

1. **把协议声明成类型，比封装工具函数更可持续**——interface 即文档，编译期就能发现签名漂移
2. **分层：Retrofit 管契约，OkHttp 管传输，Converter 管格式**——换 JSON 库不动 URL 定义
3. **动态代理是 JVM 的隐藏大招**——`create()` 背后没有手写实现类，却类型安全
4. **平台库的生命周期极长**——十四年仍在发 major，说明「声明式 + 可组合」比一次性全能 SDK 更耐演进

## 延伸阅读

- 官方文档：[square.github.io/retrofit](https://square.github.io/retrofit/)
- 声明式注解详解：[Declarations](https://square.github.io/retrofit/declarations/)
- 配置与 Converter：[Configuration](https://square.github.io/retrofit/configuration/)
- 源码入口：[Retrofit.java](https://github.com/square/retrofit/blob/trunk/retrofit/src/main/java/retrofit2/Retrofit.java)
- [[okhttp]] —— Retrofit 默认搭载的 HTTP 引擎
- [[moshi]] —— Square 出品的 JSON 库，与 Retrofit 常配对

## 关联

- [[okhttp]] —— 连接池、TLS、拦截器、超时；Retrofit 的运输层
- [[moshi]] —— Kotlin 友好的 JSON 适配，常作 Retrofit Converter
- [[gson]] —— 老项目最常见的 Retrofit JSON 后端
- [[kotlin-coroutines]] —— `suspend` API 的并发模型
- [[axios]] —— Web 端地位类似的 HTTP 客户端（无 interface 代理）
- [[ktor]] —— Kotlin 原生多平台 HTTP 客户端，KMP 场景的替代路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
