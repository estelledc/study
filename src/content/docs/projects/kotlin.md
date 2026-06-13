---
title: Kotlin — JetBrains 的 JVM 语言
来源: https://github.com/JetBrains/kotlin
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**Kotlin** 是 JetBrains 在 2010 年发布、2016 年发布 1.0 的现代编程语言，官方仓库 [JetBrains/kotlin](https://github.com/JetBrains/kotlin) 同时托管编译器、标准库与多平台后端。它首先运行在 **JVM** 上，与 Java 字节码互操作；如今还可编译到 **JavaScript**、**WebAssembly**、**Native**（LLVM），并通过 **Kotlin Multiplatform（KMP）** 在移动端、服务端、桌面之间共享业务逻辑。

日常类比：如果把 **Java** 想象成一座已经运营三十年的**大型百货商场**——货品齐全、人流稳定、规章制度写在厚厚一本手册里（样板代码多、空指针事故频发）；那 **Kotlin** 像是同集团在同一地块上新建的**精品生活馆**：

- **货架布局更紧凑**（语法简洁：`data class`、类型推断、单表达式函数），顾客（开发者）走更少步数就能买到东西；
- **门口贴了「易碎品请轻放」标签**（类型系统区分 `String` 与 `String?`），很多「摔碎」在结账前就被保安（编译器）拦住；
- **地下通道直连老商场**（100% 与 Java 互操作），你可以只翻新一层楼（新模块用 Kotlin），不必整栋拆迁；
- **后勤队换成协程**（`suspend` / `CoroutineScope`），一个服务员可以同时照应十桌客人，不必每桌配一名专职线程。

Google 自 2017 年起将 Kotlin 列为 **Android 官方首选语言**；后端领域 Spring、Ktor、Exposed 的一等支持，也让 Kotlin 成为 JVM 生态里增长最快的语言之一。

## 为什么值得学

零基础或从 Java 转 Kotlin，常见收益：

| 痛点（Java / 传统 JVM） | Kotlin 的应对 |
|-------------------------|---------------|
| `NullPointerException` 线上频发 | 可空类型 `?`、`?.`、`?:` 在编译期约束 |
| POJO + Lombok + getter/setter 冗长 | `data class` 一行生成 `equals` / `hashCode` / `copy` |
| 回调地狱、线程池配置复杂 | 协程 + `suspend`，用顺序代码写并发 |
| 想渐进迁移老项目 | 同一模块里 `.java` 与 `.kt` 混编，互调零摩擦 |
| Android UI 样板代码多 | 与 **Jetpack Compose** 声明式 UI 天然契合 |

即使主攻后端，懂 Kotlin 也有助于阅读 **Gradle Kotlin DSL**、**Spring Boot 3** 样例、以及 Android 客户端代码——它们共享同一套语言特性。

## 核心概念

### 1. 编译管线：从 `.kt` 到多目标

```
┌────────────────────────────────────────────────────────────┐
│  源码 .kt / .kts（脚本）                                     │
├────────────────────────────────────────────────────────────┤
│  Kotlin 编译器（kotlinc）                                    │
│    → JVM：.class 字节码（与 javac 产物互操作）                │
│    → JS / Wasm / Native：各自后端                             │
├────────────────────────────────────────────────────────────┤
│  运行时：JVM HotSpot / Node / 原生二进制 / 浏览器 Wasm         │
└────────────────────────────────────────────────────────────┘
```

Kotlin 编译器用 **Kotlin 自身** 的大部分逻辑编写（自举），JetBrains 在 IntelliJ IDEA 里 dogfood 同一套语言。命令行可用 **Kotlin CLI** 或构建工具 **Gradle**（`org.jetbrains.kotlin.jvm` 插件）驱动编译。

### 2. `val` 与 `var`：读多写少

- **`val`**：只赋值一次，类似 Java 的 `final`，引用不可变（对象内容仍可变，如 `MutableList`）。
- **`var`**：可重新赋值。

类型可显式声明，也可由编译器 **推断**：

```kotlin
val name: String = "Kotlin"   // 显式类型
val year = 2016                 // 推断为 Int
var downloads = 1_000_000
downloads += 1                  // var 允许
```

习惯上：**默认 `val`，只有需要改引用时才用 `var`**——这和函数式风格、并发安全都更合拍。

### 3. 函数：表达式体与默认参数

```kotlin
fun greet(name: String = "world"): String = "Hello, $name!"

fun main() {
    println(greet())           // Hello, world!
    println(greet("JetBrains"))
}
```

- **单表达式函数**可写 `fun f() = expr`，返回类型自动推断。
- **默认参数**减少 Java 式重载爆炸；配合 **命名参数** `greet(name = "Alice")` 提升可读性。
- 无返回值时类型为 `Unit`（类似 `void`），通常省略。

### 4. 空安全：类型系统里的「易碎标签」

Java 里任何引用都可能暗中为 `null`；Kotlin 把可空性 **写进类型**：

| 写法 | 含义 |
|------|------|
| `String` | 不可为 `null` |
| `String?` | 可为 `null` |
| `user?.name` | 安全调用，整条链遇 `null` 则结果为 `null` |
| `user?.name ?: "匿名"` | Elvis：左侧为 `null` 时用右侧 |
| `user!!.name` | 断言非空，若实际为 `null` 则 NPE（慎用） |

编译器在 **智能转换（smart cast）** 后会把 `String?` 收窄为 `String`，例如 `if (x != null) x.length`。

### 5. 类与 `data class`

```kotlin
data class User(val id: Long, val name: String, val email: String?)

fun main() {
    val u1 = User(1, "Ada", "ada@example.com")
    val u2 = u1.copy(name = "Augusta")  // 不可变更新
    println(u2)  // User(id=1, name=Augusta, email=ada@example.com)
}
```

- 主构造函数参数可直接声明为属性：`class Point(val x: Int, val y: Int)`。
- 类默认 **不可继承**（`final`），需显式 `open` 才能被继承——与 Java 默认 `extends` 相反。
- `data class` 自动生成 `equals`、`hashCode`、`toString`、`copy`、`componentN()`（解构）。

### 6. 集合与函数式 API

Kotlin 标准库区分 **只读** 与 **可变** 视图：

```kotlin
val list = listOf(1, 2, 3)           // List<Int>，只读接口
val mutable = mutableListOf(1, 2, 3) // MutableList<Int>

val doubled = list
    .filter { it > 1 }
    .map { it * 2 }
// [4, 6]
```

`it` 是单参数 lambda 的默认形参名；链式调用与 Java Stream 类似，但在 Kotlin 里更常用。

### 7. 协程：轻量并发

线程是 OS 级资源，数量上千就吃力；**协程**是语言级任务单元，可在少量线程上 **挂起（suspend）** 与恢复：

```kotlin
import kotlinx.coroutines.*

fun main() = runBlocking {
    val deferred = async { fetchUser() }
    val user = deferred.await()
    println(user)
}

suspend fun fetchUser(): String {
    delay(100) // 挂起，不阻塞线程
    return "Ada"
}
```

- `suspend` 标记可在不阻塞线程的情况下「等待」的函数。
- `CoroutineScope` + `launch` / `async` 管理生命周期；Android 用 `viewModelScope`，服务端用 `runBlocking` 或框架集成。
- 库 **`kotlinx.coroutines`** 需单独依赖，不属于语言内置关键字之外的stdlib。

### 8. 与 Java 互操作

- Kotlin 调用 Java：注意 Java 类型在 Kotlin 里常变成 **平台类型**（可空信息丢失），要对可能为 `null` 的返回值手动处理。
- Java 调用 Kotlin：`@JvmStatic`、`@JvmOverloads`、`@JvmName` 等注解控制生成字节码的静态方法、重载与命名。
- 同一 Gradle/Maven 模块可混放 `.java` 与 `.kt`，无需拆项目。

### 9. 多平台（KMP）简述

**Kotlin Multiplatform** 把 **共享业务逻辑** 编译到各端原生目标，UI 仍可保持 SwiftUI / Compose / Web 原生。与「一套代码画所有 UI」的 Flutter 不同，KMP 更强调 **逻辑共享、界面各写各的**。入门可先专注 JVM/Android，再按需扩展 KMP。

## 代码示例一：空安全处理用户输入

下面模拟从 API 或表单读取可能缺失的字段，并安全拼接显示名：

```kotlin
data class Profile(val nickname: String?, val email: String?)

fun displayName(profile: Profile?): String {
    val nick = profile?.nickname?.trim()
    val mail = profile?.email?.substringBefore('@')
    return when {
        !nick.isNullOrBlank() -> nick
        !mail.isNullOrBlank() -> mail
        else -> "访客"
    }
}

fun main() {
    println(displayName(Profile("  kotlin  ", null)))     // kotlin
    println(displayName(Profile(null, "dev@jetbrains.com"))) // dev
    println(displayName(null))                              // 访客
}
```

要点：全程无 `!!`；`?.` 与 `isNullOrBlank()` 把 NPE 风险压在编译期与可读的分支里。

## 代码示例二：协程并发抓取多个 URL

多个网络请求并发执行，再汇总结果——这是服务端与 Android 的常见模式：

```kotlin
import kotlinx.coroutines.*
import kotlin.system.measureTimeMillis

suspend fun fetchTitle(id: Int): String {
    delay(100L * id) // 模拟 IO
    return "page-$id"
}

fun main() = runBlocking {
    val time = measureTimeMillis {
        val titles = coroutineScope {
            val jobs = (1..5).map { n ->
                async(Dispatchers.Default) { fetchTitle(n) }
            }
            jobs.awaitAll()
        }
        println(titles) // [page-1, page-2, page-3, page-4, page-5]
    }
    println("completed in ${time}ms") // 约 500ms，而非串行 1500ms+
}
```

`async` + `awaitAll` 在结构化并发子作用域里并行；任一子协程失败会取消兄弟任务（可配置）。生产环境应用 `withContext(Dispatchers.IO)` 包裹真实阻塞 IO，并交给 OkHttp、Ktor Client 等库。

## 工具链与环境

| 工具 | 用途 |
|------|------|
| **IntelliJ IDEA** / **Android Studio** | 官方 IDE，内置 Kotlin 插件与调试器 |
| **Gradle** `kotlin("jvm") version "2.x"` | JVM 项目构建 |
| **[kotlinlang.org/docs](https://kotlinlang.org/docs/home.html)** | 官方文档与 Kotlin Playground |
| **kotlinc** | 命令行编译器，`kotlinc hello.kt -include-runtime -d hello.jar` |
| **detekt** / **ktlint** | 静态分析与格式化 |

创建 JVM 项目最快路径：IntelliJ → New Project → **Kotlin** → Application；或 CLI：

```bash
# 使用 Gradle 初始化（需已安装 JDK 17+）
gradle init --type kotlin-application --dsl kotlin
./gradlew run
```

## 学习路径建议

1. **语法与空安全**：官方 [Basic syntax](https://kotlinlang.org/docs/basic-syntax.html)、[Null safety](https://kotlinlang.org/docs/null-safety.html)，在 Playground 或 IDE Scratch 文件里敲一遍。
2. **面向对象与函数式**：`data class`、`sealed class`、`when` 表达式、集合 lambda。
3. **协程**：[Coroutines basics](https://kotlinlang.org/docs/coroutines-basics.html)，写一个小爬虫或并行下载器。
4. **选方向深入**：
   - Android → Jetpack Compose、ViewModel、`Flow`
   - 后端 → Ktor 或 Spring Boot + Kotlin、Exposed/JPA
   - 跨端 → Kotlin Multiplatform 官方教程

与专题笔记 [[openjdk]] 对照：Kotlin 编译到 JVM 字节码后，仍由 **HotSpot** 解释 / JIT、由 **GC** 回收对象；换的是 **源码层表达力与安全性**，不是换掉整个运行时。若关心原生镜像与冷启动，可结合 [[graalvm]] Native Image 将 Kotlin 一并 AOT 编译。

## 常见误区

- **「Kotlin 只能写 Android」** — JVM 服务端、Gradle 插件、数据脚本（`.kts`）同样普遍。
- **「学完 Kotlin 就不用学 Java」** — 读老库源码、配置 Maven 插件、理解字节码与 Spring 历史 API 仍需要 Java 底子。
- **「协程 = 线程」** — 协程是调度模型；底层仍跑在线程池上，CPU 密集任务要选合适 `Dispatcher`。
- **到处用 `!!`** — 等于放弃空安全；应优先 `?.`、`?:`、`requireNotNull`、`checkNotNull`。

## 延伸阅读

- 官方仓库：[github.com/JetBrains/kotlin](https://github.com/JetBrains/kotlin)
- 语言演进与兼容性：[Kotlin releases](https://kotlinlang.org/docs/releases.html)
- Android 官方：[Kotlin 优先](https://developer.android.com/kotlin)
- 本库相关笔记：[[jetpack-compose-samples]]（Compose UI 样例）、[[openjdk]]（JVM 底座）、[[graalvm]]（多语言运行时与 Native Image）
