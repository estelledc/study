---
title: Accompanist — Jetpack Compose 的「补丁工具箱」
来源: https://github.com/google/accompanist
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

**Accompanist**（字面意思是「伴奏者」）是 Google 维护的一组 **Jetpack Compose 扩展库**，专门填补官方 Compose 工具箱里暂时还没有、但 App 开发又经常需要的 API 缺口。

日常类比：你搬进一套精装公寓（Jetpack Compose），厨房、卧室、客厅一应俱全；但发现**没有窗帘轨、没有门铃、没有阳台晾衣架**——这些小件官方还没标配。Accompanist 就像一家**宜家配件区**：先卖过渡款（权限弹窗封装、WebView 包装、主题适配器），等官方家具厂把同款做进主线（`androidx.compose.*`），配件就下架、标 Deprecated，让你迁回「原厂件」。

项目 2020 年随 Compose 早期一起开源，GitHub 7k+ star。定位是 **labs 试验田**：验证 API 设计、收集开发者体验，成熟后 **upstream 进 AndroidX**，再从 Accompanist 移除。因此读文档时要习惯看到「本库已废弃，请改用 `androidx…`」——这不是烂尾，而是**成功毕业**。

## 为什么重要

做 Android Compose 开发时，Accompanist 帮你回答这些问题：

- **运行时权限**在 Compose 里怎么声明式处理，而不是回退到 `ActivityCompat.requestPermissions`
- 以前用 **ViewPager** 做左右滑页，迁移到 Compose 后该用谁（历史答案是 Accompanist Pager，今天是 `foundation.pager`）
- **WebView、系统栏颜色、WindowInsets** 等在 View 时代有现成方案，Compose 早期缺口由谁补
- 如何判断一个依赖该不该继续加：看 README 的 **Deprecated / Upstream 表**，避免在新项目里踩已迁移的 API

不理解 Accompanist 的「过渡库」定位，容易在新项目里仍引用已废弃的 `accompanist-pager`，或在权限场景手写 `rememberLauncherForActivityResult` 却漏掉 rationale 流程。

## 核心概念

### 1. 多模块（Multi-artifact）结构

Accompanist 不是单一 jar，而是**按能力拆包**，Gradle 里按需引入，例如：

| Maven 坐标前缀 | 典型用途 | 现状（2024+） |
| --- | --- | --- |
| `accompanist-permissions` | 相机、定位等运行时权限 | 维护中，API 标 `@ExperimentalPermissionsApi` |
| `accompanist-adaptive` | 折叠屏 / 大屏自适应布局工具 | 活跃 |
| `accompanist-webview` | Compose 包装 `android.webkit.WebView` | 已废弃，建议 fork 自管 |
| `accompanist-pager` | 横向/纵向翻页 | 已废弃 → `androidx.compose.foundation.pager` |
| `accompanist-systemuicontroller` | 状态栏/导航栏颜色 | 已废弃 → `Activity.enableEdgeToEdge()` 等 |
| `accompanist-navigation-animation` | 导航转场动画 | 已废弃 → `navigation-compose` 内置 |

类比：不是买一箱「万能胶」，而是按问题买「权限胶带」「网页展示胶带」；胶带用完即换官方螺丝固定。

### 2. Labs → Upstream 生命周期

每个子库大致经历：

1. **Incubating**：API 可能变，文档带 Experimental 注解  
2. **Stable enough**：大量 App 采用，Google 收集反馈  
3. **Upstream**：等价能力进入 `androidx.compose.foundation` / `navigation` / `activity`  
4. **Deprecated & frozen**：Accompanist 侧只修严重 bug，不再加功能  

读 [官方 Medium 说明（2023-08）](https://medium.com/androiddevelopers/an-update-on-jetpack-compose-accompanist-libraries-august-2023-ac4cbbf059f1) 可核对各模块当前阶段。

### 3. Permissions：`PermissionState` 状态机

`rememberPermissionState(permission)` 返回可组合里**可记忆**的权限状态对象，核心字段：

- `status.isGranted`：是否已授权  
- `status.shouldShowRationale`：是否应向用户解释「为何需要此权限」（用户曾拒绝且系统允许展示说明）  
- `launchPermissionRequest()`：触发系统弹窗——**必须在非 Composable 回调里调用**（如 `Button.onClick`），不能在 `@Composable` 函数体顶层直接调  

工作流与 [Android 官方权限指南](https://developer.android.com/training/permissions/requesting) 一致，只是从 Imperative Activity 换成 Declarative Compose。

### 4. 与 `rememberLauncherForActivityResult` 的关系

不用 Accompanist 时，你可以用 Activity Result API 自己封装权限；Accompanist 的价值是**把 granted / denied / rationale 分支收敛成统一 `PermissionState`**，减少样板代码。平台能力没有扩展——例如**无法区分**「首次请求」与「用户勾选不再询问」的底层差异，文档也明确说明这一限制。

### 5. 已迁移能力：Pager 对照

旧代码：

```kotlin
import com.google.accompanist.pager.HorizontalPager
import com.google.accompanist.pager.rememberPagerState
```

应改为：

```kotlin
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
```

`pageCount` 从 `rememberPagerState` 挪到 `HorizontalPager` 的 `pageCount` 参数；`currentPageOffset` 更名为 `currentPageOffsetFraction`。翻页指示器 `accompanist-pager-indicators` 仍可与官方 `PagerState` 配合，或自行实现 `Modifier` 画圆点。

## 依赖与版本

在 `libs.versions.toml` 或 `build.gradle.kts` 中（版本号以 [Maven Central](https://central.sonatype.com/search?q=accompanist) 为准）：

```kotlin
dependencies {
    // 权限（Compose 项目最常见仍活跃依赖）
    implementation("com.google.accompanist:accompanist-permissions:0.37.3")

    // 自适应布局（按需）
    // implementation("com.google.accompanist:accompanist-adaptive:0.37.3")

    // WebView — 仅维护模式，新项目请评估是否 fork
    // implementation("com.google.accompanist:accompanist-webview:0.37.3")
}
```

`AndroidManifest.xml` 里声明权限，例如相机：

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

## 实践案例

### 案例 1：相机权限完整分支（Permissions）

典型模式：已授权则展示功能；未授权则根据 `shouldShowRationale` 展示不同文案，按钮触发请求。

```kotlin
@file:OptIn(ExperimentalPermissionsApi::class)

import android.Manifest
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.accompanist.permissions.shouldShowRationale

@Composable
fun CameraFeatureGate() {
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

    when {
        cameraPermission.status.isGranted -> {
            // 真正的相机预览 Composable
            Text("相机已就绪，可显示 Preview / 拍照 UI")
        }
        else -> {
            val message = if (cameraPermission.status.shouldShowRationale) {
                "扫码需要相机权限，请在设置中允许访问相机。"
            } else {
                "本功能需要相机权限才能使用。"
            }
            Column {
                Text(message)
                Button(onClick = { cameraPermission.launchPermissionRequest() }) {
                    Text("授予权限")
                }
            }
        }
    }
}
```

要点：`launchPermissionRequest()` 放在 `onClick` 里；`when` 分支可根据产品再加「去设置页」Intent（`ACTION_APPLICATION_DETAILS_SETTINGS`），那部分 Accompanist 不封装，需自行处理。

### 案例 2：一次请求多权限（定位 + 蓝牙扫描场景）

```kotlin
@Composable
fun LocationAndBluetoothGate(content: @Composable () -> Unit) {
    val permissions = rememberMultiplePermissionsState(
        listOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.BLUETOOTH_SCAN, // API 31+
        )
    )

    if (permissions.allPermissionsGranted) {
        content()
    } else {
        Column {
            Text("需要定位与附近设备权限以扫描蓝牙信标。")
            Button(onClick = { permissions.launchMultiplePermissionRequest() }) {
                Text("继续")
            }
        }
    }
}
```

`rememberMultiplePermissionsState` 适合 onboarding 一步收齐多个相关权限；若权限彼此独立，拆成多个 `rememberPermissionState` 通常 UX 更清晰。

### 案例 3：WebView（了解即可，新项目谨慎）

Accompanist WebView 已废弃，但读懂 API 有助于维护老代码或 fork 实现：

```kotlin
@Composable
fun HelpCenterWebPage(url: String) {
    val state = rememberWebViewState(url = url)

    WebView(
        state = state,
        onCreated = { webView ->
            webView.settings.javaScriptEnabled = true
        },
        captureBackPresses = true, // WebView 内可后退时拦截系统返回键
    )

    if (state.isLoading) {
        CircularProgressIndicator()
    }
}
```

`rememberWebViewState` 记住 URL、加载进度；`WebView` Composable 负责 AndroidView 互操作。官方建议：**复制源码进工程按业务裁剪**，而不是依赖长期演进。

### 案例 4：从 Accompanist Pager 迁移到官方 Pager

```kotlin
// 现代写法 — androidx.compose.foundation.pager
@Composable
fun OnboardingPager(pages: List<@Composable () -> Unit>) {
    val pagerState = rememberPagerState(pageCount = { pages.size })

    HorizontalPager(state = pagerState) { page ->
        pages[page]()
    }

    Row {
        repeat(pages.size) { index ->
            val selected = pagerState.currentPage == index
            Box(
                Modifier
                    .padding(4.dp)
                    .size(if (selected) 10.dp else 6.dp)
                    .background(
                        if (selected) Color.Black else Color.Gray,
                        CircleShape
                    )
            )
        }
    }
}
```

指示器逻辑自己写十行即可，不必再引 `accompanist-pager-indicators`，除非你想复用现成动画。

## 与周边技术的关系

```text
Android View 体系          Jetpack Compose (androidx)
     │                              │
     │  权限 / WebView / Pager 缺口   │
     └──────────► Accompanist ◄─────┘
                        │
                        │ upstream
                        ▼
              androidx.compose.foundation
              androidx.navigation.compose
              androidx.activity (EdgeToEdge)
```

- **Coil / Glide**：管图片；Accompanist 不管 bitmap 加载  
- **Navigation Compose**：路由与参数；Accompanist 曾补动画，现已合并  
- **Material3**：主题与组件；Accompanist 的 MDC/AppCompat Theme Adapter 已废弃，应直接用 Material3 `MaterialTheme`  
- **Compose Multiplatform**：Accompanist 面向 **Android**；KMP 项目权限/WebView 需各平台各自方案  

## 常见坑

1. **在 `@Composable` 函数体里直接调 `launchPermissionRequest()`**  
   会违反 Compose 副作用规则；放 `LaunchedEffect` 也要用户手势触发时慎用——优先按钮 `onClick`。

2. **新项目仍引入 `accompanist-pager`**  
   Android Studio Lint 会提示迁移；直接用 `foundation.pager` 可减少未来删除依赖的工作量。

3. **以为 Accompanist 能绕过「不再询问」**  
   用户永久拒绝后只能引导去系统设置；库不会 magically 再弹系统框。

4. **WebView 默认禁用 JavaScript**  
   需在 `onCreated` 里开 `settings.javaScriptEnabled`；同时评估 XSS、混合内容安全风险。

5. **忽略 `@ExperimentalPermissionsApi`**  
   模块 API 仍可能微调；全项目统一 `@OptIn` 或封装一层自己的 `Permissions.kt` facade。

## 学习路径建议

1. 先掌握 Compose 基础（状态、副作用、`AndroidView` 互操作）  
2. 读 [permissions 官方文档](https://google.github.io/accompanist/permissions/)，在真机跑通案例 1  
3. 查 README 的 **Deprecated** 列表，确认你需要的模块是否已 upstream  
4. 若做折叠屏 / 大屏，再读 `accompanist-adaptive`  
5. 关注 [Android Developers Blog](https://android-developers.googleblog.com/) 的 Compose 发布说明，比死记 Accompanist 版本号更重要  

## 小结

Accompanist 是 Compose 生态的**过渡伴奏**：在官方 API 缺席时提供可生产的实现，在官方 API 就绪后主动退场。零基础开发者应记住两句话——

- **权限**：现阶段仍可放心用 `accompanist-permissions`，但包在自家 facade 里，方便将来换实现。  
- **翻页、Insets、导航动画、系统栏**：优先查 `androidx` 是否已有再决定是否加 Accompanist 依赖。

把它当成「阅读官方 Compose 演进路线图」的入口，比当成「长期核心框架」更准确；这样既不轻视它历史上的价值，也不会在新项目里堆一堆已废弃的 artifact。
