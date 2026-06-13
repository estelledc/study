---
title: "Kotlin Multiplatform — 跨平台共享逻辑"
来源: https://github.com/JetBrains/kotlin
日期: 2026-06-13
分类: 编程语言
子分类: mobile-cross-platform
provenance: pipeline-v3
---

# Kotlin Multiplatform — 跨平台共享逻辑

## 一句话理解

Kotlin Multiplatform（简称 KMP）让你用 Kotlin 写一份业务逻辑，然后同时跑到 Android、iOS、桌面端甚至浏览器上。

## 日常类比

想象你在学做菜。

传统做法是：给 Android 团队一份菜谱（Java/Kotlin），给 iOS 团队另一份菜谱（Swift）。两份菜谱内容差不多，但每次要改口味——比如把盐量从 5 克改成 3 克——你就得改两份。

KMP 的做法是：把所有"通用菜谱"（登录验证、数据校验、网络请求、业务规则）写成一份，放在一个共享厨房里。Android 和 iOS 各用自己的厨具（原生界面），但都从同一个厨房取菜。改一次，所有人都吃到改好的味道。

关键区别在于：KMP **不是**像 Flutter 那样共享整个 UI。它只共享"逻辑"，UI 仍然各自用原生的方式写。这就像你共享的是菜谱，不是餐厅装修。

## 核心概念

### 1. Source Sets（源码集）

KMP 项目按"源码集"组织代码。每个源码集就是一组有相同依赖关系的文件：

- **commonMain** — 共享代码，所有平台共用。这里写的代码不能调用任何平台特有的 API（比如不能直接调相机或蓝牙）。
- **androidMain** — 只在 Android 上运行的代码，比如调 Android 的原生 API。
- **iosMain** — 只在 iOS 上运行的代码。
- **commonTest / androidTest / iosTest** — 对应的测试代码。

编译时，Kotlin 编译器会自动把 commonMain 的代码"翻译"成不同的格式：在 Android 上变成 Kotlin/JVM（运行在 JVM 上），在 iOS 上变成 Kotlin/Native（直接编译成机器码）。

### 2. expect / actual —— 平台差异的桥梁

有些东西每个平台都不一样。比如"获取设备名称"，Android 和 iOS 的获取方式完全不同。KMP 用 `expect` 和 `actual` 来解决这个问题：

先在 commonMain 里声明一个 `expect`（期望），然后在每个平台的源码集里写 `actual`（实际实现）。

### 3. 渐进式采用

KMP 不需要你从头重写整个 App。你可以先在现有的 Android App 里加一个共享模块，试试水。觉得好用，再慢慢把更多逻辑搬进去。iOS 端也一样，可以逐步接入。

## 代码示例

### 示例一：共享数据校验逻辑

这是最常见的用法——把业务规则放到共享模块里，两端直接调用。

```kotlin
// ===== commonMain/kotlin/shared/validator.kt =====
package com.example.shared

class LoginValidator {

    fun validateEmail(email: String): Boolean {
        // 邮箱格式校验规则，Android 和 iOS 共用同一套
        val regex = Regex("^[\\w-.]+@([\\w-]+\\.)+[\\w-]{2,4}$")
        return regex.matches(email)
    }

    fun validatePassword(password: String): ValidationResult {
        return when {
            password.length < 8 -> ValidationResult.Error("密码至少8位")
            !password.any { it.isUpperCase() } -> ValidationResult.Error("密码需要包含大写字母")
            else -> ValidationResult.Success
        }
    }
}

sealed class ValidationResult {
    object Success : ValidationResult()
    data class Error(val message: String) : ValidationResult()
}
```

```kotlin
// ===== Android 端调用（androidMain 或直接使用） =====
val validator = LoginValidator()
val result = validator.validatePassword("MyPass123")
when (result) {
    is ValidationResult.Success -> println("密码通过")
    is ValidationResult.Error -> println("错误: ${result.message}")
}
```

```kotlin
// ===== iOS 端调用（完全相同的代码） =====
let validator = LoginValidator()
let result = validator.validatePassword("MyPass123")
// 输出: 密码通过
```

注意：同一段 `validatePassword` 逻辑，Android 和 iOS 端**一行都不用改**。

### 示例二：expect / actual 处理平台差异

假设你需要获取设备的平台名称，两端实现不同：

```kotlin
// ===== commonMain/kotlin/shared/platform.kt =====
package com.example.shared

interface Platform {
    val name: String
}

// 声明一个"期望"：每个平台都要提供自己的实现
expect fun getPlatform(): Platform
```

```kotlin
// ===== androidMain/kotlin/shared/platform.android.kt =====
package com.example.shared

class AndroidPlatform : Platform {
    override val name: String = "Android (${android.os.Build.VERSION.SDK_INT})"
}

actual fun getPlatform(): Platform = AndroidPlatform()
```

```kotlin
// ===== iosMain/kotlin/shared/platform.ios.kt =====
package com.example.shared

import platform.UIKit.UIDevice

class IOSPlatform : Platform {
    override val name: String = "iOS (${UIDevice.currentDevice.systemVersion})"
}

actual fun getPlatform(): Platform = IOSPlatform()
```

```kotlin
// ===== commonMain 中直接使用，自动获得对应平台的实现 =====
fun main() {
    println("当前平台: ${getPlatform().name}")
    // 在 Android 上输出: 当前平台: Android (34)
    // 在 iOS 上输出: 当前平台: iOS (17.5)
}
```

`expect` 就像一份合同：commonMain 说"我需要一个能告诉我平台名字的东西"。每个平台各自签这份合同，给出自己的答案。commonMain 不需要知道具体怎么实现的。

### 示例三：共享网络请求（配合 Ktor）

KMP 生态中有 Ktor 库，可以在共享模块里写网络请求：

```kotlin
// ===== commonMain/kotlin/shared/api.kt =====
package com.example.shared

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*

class UserRepository {

    private val client = HttpClient()

    suspend fun getUser(id: Int): User {
        return client.get("https://api.example.com/users/$id")
            .body()
    }
}

data class User(val id: Int, val name: String, val email: String)
```

这段网络请求代码在 Android 和 iOS 上都能直接运行，不需要任何改动。Ktor 底层会根据目标平台自动选择最合适的 HTTP 引擎。

## 项目结构一览

```
my-app/
├── shared/                    ← 共享模块
│   ├── build.gradle.kts       ← 配置 KMP 目标平台
│   └── src/
│       ├── commonMain/kotlin/ ← 共享逻辑（两端共用）
│       │   └── shared/
│       │       ├── validator.kt
│       │       ├── platform.kt
│       │       └── api.kt
│       ├── androidMain/kotlin/  ← Android 特有代码
│       └── iosMain/kotlin/      ← iOS 特有代码
├── android-app/               ← Android 原生 App
└── ios-app/                   ← iOS 原生 App
```

## 为什么选 KMP 而不是 Flutter / React Native？

| 维度 | KMP | Flutter / RN |
|------|-----|-------------|
| 共享范围 | 业务逻辑 | 整个 UI + 逻辑 |
| UI 体验 | 100% 原生 | 自绘引擎 / WebView |
| 学习成本 | 团队只需多学 Kotlin | 需学 Dart / JavaScript |
| 接入方式 | 渐进式，现有 App 可逐步迁移 | 通常需从零搭建 |
| 性能 | 逻辑层无额外开销 | 有桥接或渲染层开销 |

KMP 适合的场景：你已经有成熟的 Android 和 iOS 团队，不想推翻现有 UI 代码，只想把重复的业务逻辑抽出来共享。

## 关键要点

1. KMP 共享的是**逻辑**，不是 UI。每个平台保持原生界面。
2. `commonMain` 放共享代码，`androidMain` / `iosMain` 放平台特定代码。
3. `expect` / `actual` 是解决平台差异的核心机制。
4. 可以渐进式采用，不需要重写整个 App。
5. 逻辑代码两端零开销——不是通过桥接通信，而是直接编译到原生二进制中。
