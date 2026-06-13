---
title: OkHttp — JVM/Android 上的高效 HTTP 客户端
来源: https://github.com/square/okhttp
日期: 2026-06-13
分类: 后端 API
子分类: 移动端
provenance: pipeline-v3
---

## 是什么

**OkHttp** 是 Square 出品的 HTTP 客户端，面向 **Android、Java、Kotlin 和 GraalVM**。它不负责把 JSON 自动变成对象（那是 [[retrofit]] 和 Converter 的事），而是专注做好一件事：**可靠、高效地把 HTTP 请求发出去，把响应字节流拿回来**。

日常类比：

- 浏览器里的「地址栏 + 网络栈」：你输入 URL，底层帮你 DNS 解析、建 TCP、TLS 握手、发请求、收响应、处理重定向和压缩。
- **OkHttp** 就是给 App 用的「专业快递员」：自带**车队调度**（连接池）、**拼车规则**（HTTP/2 多路复用）、**备用路线**（多 IP / IPv6 快速回退）、**冷藏箱**（响应缓存）。你只填一张「运单」（`Request`），它负责把「包裹」（`Response`）送到你手上。

最小同步 GET 长这样：

```java
OkHttpClient client = new OkHttpClient();

Request request = new Request.Builder()
    .url("https://api.github.com/repos/square/okhttp")
    .build();

try (Response response = client.newCall(request).execute()) {
  if (!response.isSuccessful()) throw new IOException("Unexpected code " + response);
  System.out.println(response.body().string());
}
```

四行核心逻辑 = 一次完整 HTTP 往返。OkHttp 默认已开启连接复用、GZIP 解压、现代 TLS；你不必像手写 `HttpURLConnection` 那样到处设 Header 和流。

项目 2012 年由 Square 开源，GitHub [square/okhttp](https://github.com/square/okhttp) 累计数万 star；当前主线为 **OkHttp 5.x**（Kotlin Multiplatform，JVM/Android 通用），是 Android 官方网络栈推荐之一，也是 Retrofit、Picasso 等库的底层传输层。

## 为什么重要

零基础学移动端或 JVM 后端网络，绕不开 OkHttp，因为：

- **Android 生态事实标准**：系统 `HttpURLConnection` 难用、行为碎片化；OkHttp 统一了超时、重试、HTTP/2、证书校验
- **Retrofit 的引擎**：声明式 API 在 Retrofit，真正建连、读写 socket 在 OkHttp——改超时、加 Token、打日志都在 `OkHttpClient` 配置
- **性能是默认项**：连接池 + HTTP/2 多路复用，对同一 host 的多次请求往往共用一条 TCP，延迟和耗电都更低
- **可测试**：官方提供 **MockWebServer**，本地起假 HTTP 服务，不依赖外网就能测客户端逻辑
- **生产级韧性**：多 IP 重试、TLS 协商失败换路线、Happy Eyeballs 式并发连接（5.0+ fast fallback）

## 核心概念

### 1. 不可变 Request / Response + Builder

OkHttp 的 `Request` 和 `Response` 对象**创建后不可变**。要改 URL、Header、Method，用 `Request.Builder` 链式调用：

```kotlin
val request = Request.Builder()
    .url("https://httpbin.org/post")
    .header("User-Agent", "OkHttp Study Note")
    .post("""{"name":"demo"}""".toRequestBody("application/json".toMediaType()))
    .build()
```

好处：同一份 `Request` 可以安全地传给拦截器、日志、重试逻辑，不会出现「半路被改掉」的竞态。`Response.body()` 只能读一次（字节流消费型），重复读要用 `peekBody()` 或在拦截器里缓存。

### 2. OkHttpClient：共享的单例「车队总部」

官方强烈建议：**整个应用只建一个（或少量）`OkHttpClient` 实例并复用**。每个 client 自带：

| 组件 | 作用 |
|------|------|
| **ConnectionPool** | 空闲 TCP 连接复用，减少握手 |
| **Dispatcher** | 异步请求的线程池与并发上限 |
| **Cache** | 可选磁盘 HTTP 缓存（需配置 `Cache` 目录） |
| **Interceptor 列表** | 应用层 / 网络层拦截器链 |

用 `client.newBuilder()` 可以基于共享实例派生「只改超时」的临时 client，**连接池仍然共享**：

```kotlin
val quickClient = client.newBuilder()
    .readTimeout(500, TimeUnit.MILLISECONDS)
    .build()
```

### 3. Call：一次 HTTP 事务的句柄

`client.newCall(request)` 得到 `Call`，代表**尚未完成或正在进行**的一次请求。两种执行方式：

- **同步**：`call.execute()` 阻塞当前线程直到响应或异常
- **异步**：`call.enqueue(Callback)` 在 OkHttp 线程池回调 `onResponse` / `onFailure`

`Call` 可 `cancel()`——用户离开页面时取消无用请求，避免浪费流量和回调崩溃。

### 4. 连接模型：URL → Address → Route → Connection

OkHttp 内部用三层描述「怎么连上服务器」：

1. **URL**：你写的 `https://api.example.com/v1/users`
2. **Address**：host + 端口 + TLS 配置 + 协议偏好（静态）
3. **Route**：DNS 得到的具体 IP、代理、TLS 版本（动态）

同一 Address 的请求会尽量**复用 Connection**；HTTP/2 下多条请求可**共用一条 socket 多路复用**。连接空闲一段时间后从池中淘汰。理解这层有助于排查「为什么第一次慢、后面快」——第一次要 DNS + TCP + TLS，后面走池化连接。

### 5. Interceptor：请求/响应流水线

拦截器是 OkHttp 最强大的扩展点，像**快递分拣中心的关卡**：可以打日志、改 Header、加签名、重试、短路返回 Mock。

分两类：

| 类型 | 注册方式 | 特点 |
|------|----------|------|
| **Application Interceptor** | `addInterceptor()` | 不关心重定向/重试中间态；缓存命中也会走；适合鉴权、业务日志 |
| **Network Interceptor** | `addNetworkInterceptor()` | 看到真实网络上的请求；可访问 `Connection`；重定向会多次触发 |

链上每一环必须调用 `chain.proceed(request)` 把请求交给下一环；可以改 request、改 response，也可以不调用 `proceed` 直接返回伪造响应（测试常用）。

### 6. 默认自带的能力（不用你手写）

- **HTTP/2** 与 **HTTP/1.1** 自动协商（ALPN）
- **透明 GZIP**：自动加 `Accept-Encoding: gzip` 并解压
- **重定向跟随**（可 `followRedirects(false)` 关闭）
- **连接失败重试**（`retryOnConnectionFailure`，默认 true）
- **证书固定（Certificate Pinning）**、**CookieJar**、**代理**、**DNS 自定义** 均可配置

## 依赖与版本

Gradle Kotlin DSL（推荐 BOM 统一版本，2026 年主线 5.4.x）：

```kotlin
dependencies {
    implementation(platform("com.squareup.okhttp3:okhttp-bom:5.4.0"))
    implementation("com.squareup.okhttp3:okhttp")
    implementation("com.squareup.okhttp3:logging-interceptor") // 可选：官方日志拦截器
    testImplementation("com.squareup.okhttp3:mockwebserver")   // 可选：单元测试假服务器
}
```

要求：**Android API 21+** 或 **Java 8+**。OkHttp 5 为 Kotlin Multiplatform 项目；Maven 用户需选 `okhttp-jvm` 或 `okhttp-android` 而非空的 `okhttp` 聚合坐标。

## 实践案例

### 案例 1：Kotlin 异步请求 + 日志拦截器

适合 Android Activity / ViewModel：不阻塞主线程。

```kotlin
import okhttp3.*
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException

class GitHubReposFetcher {
    private val client = OkHttpClient.Builder()
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            }
        )
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    fun fetchRepoJson(owner: String, repo: String, onResult: (String?) -> Unit) {
        val request = Request.Builder()
            .url("https://api.github.com/repos/$owner/$repo")
            .header("Accept", "application/vnd.github+json")
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onResult(null)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        onResult(null)
                        return
                    }
                    onResult(it.body?.string())
                }
            }
        })
    }
}
```

要点：

- `enqueue` 回调在 OkHttp 线程池执行，更新 UI 需切回主线程
- `response.use { }` 确保 body 和连接资源释放
- `HttpLoggingInterceptor.Level.BODY` 会打印请求/响应体，生产环境慎用（泄露 Token）

### 案例 2：自定义拦截器统一加 Authorization + MockWebServer 测试

业务上常见模式：Token 放在拦截器，API 层只关心 URL。

```kotlin
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class AuthInterceptor(private val tokenProvider: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
        val original = chain.request()
        val token = tokenProvider() ?: return chain.proceed(original)

        val authed = original.newBuilder()
            .header("Authorization", "Bearer $token")
            .build()
        return chain.proceed(authed)
    }
}

class ApiClientTest {
    private lateinit var server: MockWebServer

    @BeforeEach
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @AfterEach
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `interceptor adds bearer token`() {
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))

        var capturedAuth: String? = null
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                capturedAuth = request.getHeader("Authorization")
                return MockResponse().setBody("ok")
            }
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor { "secret-token" })
            .build()

        val request = Request.Builder().url(server.url("/me")).build()
        client.newCall(request).execute().close()

        assertEquals("Bearer secret-token", capturedAuth)
    }
}
```

要点：

- **MockWebServer** 在 JVM 测试里起真实 HTTP 监听端口，无需 Mockito 伪造 socket
- Application Interceptor 在重定向之前执行，适合加鉴权 Header
- 测试里 `execute()` 同步调用即可；Android Instrumentation 测试同样适用

### 案例 3：响应缓存（减少重复下载）

```kotlin
val cacheSize = 10L * 1024 * 1024 // 10 MiB
val cache = Cache(File(System.getProperty("java.io.tmpdir"), "okhttp-cache"), cacheSize)

val client = OkHttpClient.Builder()
    .cache(cache)
    .build()

// 第一次：走网络；若服务端 Cache-Control 允许，第二次可能 304 或直接读磁盘
val response1 = client.newCall(request).execute()
val response2 = client.newCall(request).execute()
// response2.cacheResponse 非 null 表示命中缓存
```

缓存遵守 HTTP 语义（`Cache-Control`、`ETag`、`max-age`）；强行缓存一切需自定义 `CacheInterceptor` 或只用离线场景。

## 同步 vs 异步怎么选

| 场景 | 建议 |
|------|------|
| Android 主线程 | **禁止** `execute()`，用 `enqueue` 或 Kotlin 协程（`okhttp3` 协程扩展 / Retrofit `suspend`） |
| JUnit 单元测试 | `execute()` 简单直接 |
| 命令行工具、批处理脚本 | `execute()` |
| 需要取消 | 保留 `Call` 引用，页面销毁时 `call.cancel()` |

Kotlin 协程项目可加 `implementation("com.squareup.okhttp3:okhttp-coroutines")`，用 `suspend fun Call.await()` 风格包装。

## 常见坑与最佳实践

1. **不要每个请求 `new OkHttpClient()`**：浪费连接池和线程池；用单例或 DI 注入共享实例。
2. **ResponseBody 只读一次**：在拦截器里若要「既打日志又给下游」，用 `peekBody` 或缓冲。
3. **主线程网络**：`NetworkOnMainThreadException` 的根源；务必异步。
4. **证书问题**：企业内网自签证书需自定义 `sslSocketFactory` / `TrustManager`；公网 App 优先考虑 **Certificate Pinning** 防中间人。
5. **超时三层**：`connectTimeout`（建连）、`readTimeout`（等响应字节）、`writeTimeout`（发请求体）；另有 `callTimeout` 限制整次 Call 总时长。
6. **和 Retrofit 分工**：OkHttp 管传输；Retrofit 管 interface 映射和 JSON 转换。改网络行为找 OkHttp，改 API 形状找 Retrofit。

## 与相关技术的关系

```text
业务代码
   ↓ 调用
Retrofit interface（可选）
   ↓ 生成 Request，委托
OkHttpClient → Call → ConnectionPool → Socket/TLS
   ↓
MockWebServer（测试） / 真实服务器
```

- **[[retrofit]]**：在 OkHttp 之上加类型安全 API；换 JSON 库不必动 OkHttp
- **Okio**：OkHttp 依赖的高性能 I/O 库；`ResponseBody` 底层是 Okio `BufferedSource`
- **Cronet / URLSession**：平台原生栈的替代选型；OkHttp 优势在跨版本一致性与可测试性

## 学习路径建议

1. 用 `execute()` 写通同步 GET/POST，理解 `Request`/`Response` 生命周期
2. 改成 `enqueue()` 或协程，理解线程与取消
3. 加一个 `HttpLoggingInterceptor`，观察真实 Header 与 HTTP/2
4. 写自定义 `Interceptor` 做鉴权或公共参数
5. 用 MockWebServer 为网络层写单元测试
6. 需要声明式 REST 时再上 Retrofit，并复用同一个 `OkHttpClient`

## 官方资源

- 文档：https://square.github.io/okhttp/
- 食谱（Recipes）：同步/异步、缓存、超时、认证等可复制示例
- 仓库：https://github.com/square/okhttp
- 变更日志：关注 5.x 的 KMP 与 Java Module（`module-info`）说明

## 小结

OkHttp 是 JVM/Android 世界的**高效 HTTP 传输引擎**：连接池、HTTP/2、拦截器链、韧性重试都是默认或一等公民。零基础记住三句话——**共享一个 OkHttpClient**、**Request/Response 用 Builder 且 body 只读一次**、**扩展能力写在 Interceptor 里**。掌握它之后，无论是手写 REST、接 Retrofit，还是写可靠的网络测试，都有同一套扎实底座。
