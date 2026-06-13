---
title: Accompanist — Jetpack Compose 的「补丁工具箱」
来源: 'https://github.com/google/accompanist'
日期: 2026-06-13
分类: 后端 API
子分类: 移动端
难度: 初级
provenance: pipeline-v3
---

## 是什么

**Accompanist**（字面意思是"伴奏者"）是 Google 维护的一组 **Jetpack Compose 扩展库**，专门填补官方 Compose 工具箱里暂时还没有、但 App 开发又经常需要的 API 缺口。

日常类比：你搬进一套精装公寓（Jetpack Compose），厨房、卧室、客厅一应俱全；但发现**没有窗帘轨、没有门铃、没有阳台晾衣架**——这些小件官方还没标配。Accompanist 就像一家**宜家配件区**：先卖过渡款（权限弹窗封装、自适应布局工具、Drawable 转 Painter），等官方家具厂把同款做进主线（`androidx.compose.*`），配件就下架、标 Deprecated，让你迁回"原厂件"。

项目 2020 年随 Compose 早期一起开源，GitHub 7.8k+ star。定位是 **labs 试验田**：验证 API 设计、收集开发者体验，成熟后 **upstream 进 AndroidX**，再从 Accompanist 移除。因此读文档时要习惯看到"本库已废弃，请改用 `androidx…`"——这不是烂尾，而是**成功毕业**。

截至 2026 年，仍在活跃维护的模块只剩三个：**Permissions**（运行时权限）、**Adaptive**（折叠屏/大屏自适应布局）、**Drawable Painter**（Android Drawable 转 Compose Painter）。其余如 Pager、System UI Controller、Navigation Animation、WebView 等均已 upstream 进 AndroidX 或官方 compose 库。

## 为什么重要

不理解 Accompanist，下面这些事都没法解释：

- **运行时权限**在 Compose 里怎么声明式处理，而不是回退到 `ActivityCompat.requestPermissions`——Accompanist Permissions 把 granted / denied / rationale 三个分支收敛成一个 `PermissionState` 状态机
- 以前用 **ViewPager** 做左右滑页，迁移到 Compose 后该用谁——历史答案是 Accompanist Pager，今天是 `foundation.pager`，迁移路径由 Accompanist 的文档桥接
- **WebView、系统栏颜色、WindowInsets** 等在 View 时代有现成方案，Compose 早期缺口由谁补——Accompanist 提供了过渡版，并配有 migration guide 指向官方替代
- 如何判断一个依赖该不该继续加——读 README 的 **Deprecated / Upstream 表**，避免在新项目里踩已迁移的 API

## 核心要点

Accompanist 的学习可以拆成**三步理解**：

1. **多模块按需引入**：Accompanist 不是单一 jar，而是按能力拆包，Gradle 里按需引入。类比：不是买一箱"万能胶"，而是按问题买"权限胶带""布局胶带""绘图胶带"——胶带用完即换官方螺丝固定。当前活跃的三个模块：`accompanist-permissions`（运行时权限）、`accompanist-adaptive`（折叠屏/大屏布局）、`accompanist-drawablepainter`（Drawable 转 Painter）。已废弃的模块在 README 表格中有明确标注和迁移指引。

2. **Labs → Upstream 生命周期**：每个子库经历 Incubating（API 可能变）→ Stable（大量 App 采用）→ Upstream（等价能力进 AndroidX）→ Deprecated & frozen（仅修严重 bug）。这不是烂尾，而是成功毕业。2023 年 8 月 Google 官方博客正式确认了这一定位，建议开发者优先使用 androidx 内置能力。

3. **Permissions 状态机是核心价值**：`rememberPermissionState(permission)` 返回可组合里可记忆的权限状态对象——`status.isGranted`、`status.shouldShowRationale`、`launchPermissionRequest()` 三个字段涵盖权限请求的全部流程。不用 Accompanist 时你也能用 `rememberLauncherForActivityResult` 自己封装，但 Accompanist 的价值是把分支收敛成统一状态对象，减少样板代码。

## 实践案例

### 案例 1：相机权限完整分支

已授权则展示功能；未授权则根据 `shouldShowRationale` 展示不同文案，按钮触发请求。

```kotlin
@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CameraFeatureGate() {
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

    when {
        cameraPermission.status.isGranted -> {
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

要点：`launchPermissionRequest()` 放在 `onClick` 里，不能在 `@Composable` 函数体顶层直接调；`shouldShowRationale` 用于区分"首次请求"和"用户曾拒绝"两种场景。

### 案例 2：一次请求多权限

```kotlin
@Composable
fun LocationAndBluetoothGate(content: @Composable () -> Unit) {
    val permissions = rememberMultiplePermissionsState(
        listOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.BLUETOOTH_SCAN,
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

`rememberMultiplePermissionsState` 适合 onboarding 一步收齐多个相关权限；若权限彼此独立（如相机和通讯录），拆成多个 `rememberPermissionState` 通常 UX 更清晰。

### 案例 3：从 Accompanist Pager 迁移到官方 Pager

Accompanist Pager 已废弃，官方替代在 `androidx.compose.foundation.pager`。

```kotlin
// 现代写法 — 使用 foundation.pager
@Composable
fun OnboardingPager(pages: List<@Composable () -> Unit>) {
    val pagerState = rememberPagerState(pageCount = { pages.size })

    HorizontalPager(state = pagerState) { page ->
        pages[page]()
    }

    // 自己写指示器（十行即可，不必再引 accompanist-pager-indicators）
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

迁移要点：`pageCount` 从 `rememberPagerState` 挪到 `HorizontalPager` 的 `pageCount` 参数；`currentPageOffset` 更名为 `currentPageOffsetFraction`。

## 踩过的坑

1. **在 `@Composable` 函数体里直接调 `launchPermissionRequest()`**：会违反 Compose 副作用规则；放 `LaunchedEffect` 也要用户手势触发时慎用——优先按钮 `onClick`。

2. **新项目仍引入 `accompanist-pager`**：Android Studio Lint 会提示迁移；直接用 `foundation.pager` 可减少未来删除依赖的工作量。

3. **以为 Accompanist 能绕过「不再询问」**：用户永久拒绝后只能引导去系统设置；库不会 magically 再弹系统框。需自行处理 `ACTION_APPLICATION_DETAILS_SETTINGS` Intent。

4. **忽略 `@ExperimentalPermissionsApi` 注解**：模块 API 仍可能微调；全项目统一 `@OptIn` 或封装一层自己的 `Permissions.kt` facade，方便将来换实现。

## 适用 vs 不适用场景

**适用**：

- Jetpack Compose 项目中需要运行时权限声明式处理——Accompanist Permissions 是目前最成熟的方案
- 折叠屏 / 大屏设备需要自适应布局工具——`accompanist-adaptive` 提供了 `TwoPane`、`AnimatedPane` 等实用组件
- 需要将 Android Drawable（矢量图、Shape、Gradient）转成 Compose Painter——`accompanist-drawablepainter` 桥接两套绘图体系
- 维护老项目时遇到了 Accompanist 依赖，需要看懂代码并规划迁移

**不适用**：

- 翻页（Pager）、系统栏颜色、导航动画、WebView——这些已有官方替代，不应再引入 Accompanist 对应模块
- Compose Multiplatform 项目——Accompanist 面向 Android；KMP 项目权限/布局需各平台各自方案
- 全新项目在设计阶段就应优先查 androidx 是否已有等价能力，而非默认加 Accompanist 依赖

## 历史小故事（可跳过）

- **2020 年**：Jetpack Compose 发布 alpha 版，Google 同时开源 Accompanist，作为官方 Compose 的"补丁包"。名字寓意"伴奏者"——为 Compose 这个"作曲者"提供支撑和声。最初包含十几个子模块，覆盖权限、翻页、Insets、系统栏、WebView、主题适配等方方面面。

- **2021-2022 年**：Compose 1.0 正式发布，Accompanist 进入高速迭代期。Pager、System UI Controller、Navigation Animation 等模块被大量 App 采用，Google 根据反馈调整 API。

- **2023 年 8 月**：Google 发布官方博客《An update on Jetpack Compose Accompanist libraries》，首次正式确认项目定位为过渡性质，宣布多个模块已完成 upstream 和废弃流程。

- **2024-2026 年**：大部分模块完成迁移，Accompanist 精简为三个核心模块（Permissions、Adaptive、Drawable Painter）。Permissions 因 Android 权限模型本身未变，成为项目中仍可放心使用的最长寿命模块。

## 学到什么

1. **好的过渡方案比没有方案强百倍**：Accompanist 证明了"先给能用但不完美的方案，同时推进官方方案"是有效的生态成长策略。你不必等所有官方的"完美"实现才开工。

2. **依赖的生命周期意识**：加一个依赖前，查它是否还在活跃维护、是否有官方替代、迁移成本多大。Accompanist 的 Deprecated 列表是活教材——每个废弃模块背后都是一条从"过渡"到"官方"的演进路线。

3. **状态收敛是好的 API 设计**：Permissions 模块把三个分支（granted / denied / rationale）收敛成一个 `PermissionState`，比到处散落的 `if-else` 更容易写对、更容易测试。

4. **看 README 的废弃声明比看 star 数更重要**：7.8k star 不代表所有模块都能用——一半以上已经废弃。判断一个库该不该加，先看 README 的 Deprecated 部分，再看最近 commit 日期。

## 延伸阅读

- 官方文档：[Accompanist 网站](https://google.github.io/accompanist/)——各模块的 API 文档和 migration guide
- Google 官方博客：[An update on Jetpack Compose Accompanist libraries (2023.08)](https://medium.com/androiddevelopers/an-update-on-jetpack-compose-accompanist-libraries-august-2023-ac4cbbf059f1)——各模块当前状态和迁移建议
- [Permissions 模块文档](https://google.github.io/accompanist/permissions/)——权限处理的完整 API 参考
- [Android 官方权限指南](https://developer.android.com/training/permissions/requesting)——Accompanist Permissions 的底层模型来源
- [Compose 官方 Pager 文档](https://developer.android.com/reference/kotlin/androidx/compose/foundation/pager/package-summary)——从 Accompanist Pager 迁移后的目标 API

## 关联

- [[compose-multiplatform]] —— Compose 跨平台方案；Accompanist 仅面向 Android，KMP 项目需各平台各自处理权限和布局
- [[kotlin]] —— Compose 和 Accompanist 的宿主语言，理解 Kotlin 的 lambda 和 receiver 语法才能顺畅写 Composable
- [[coil]] —— Compose 生态的图片加载库；Accompanist 不管 bitmap 加载，Coil 填补了图片方面的缺口
- [[dagger]] —— Android 依赖注入框架；Accompanist 处理的是 UI 层缺口，Dagger 处理的是对象创建和依赖管理
- [[retrofit]] —— Android 网络请求库；与 Accompanist 分别在"网络"和"UI 补丁"两个维度支撑 Compose App
- [[lottie]] —— 动画渲染库；Accompanist 的 Adaptive 模块处理布局适配，Lottie 处理动画播放，两者在 UI 层互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
