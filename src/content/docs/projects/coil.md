---
title: Coil — Kotlin 协程驱动的 Android / Compose 图片加载库
来源: 'https://github.com/coil-kt/coil'
日期: 2026-06-13
分类: 后端 API
子分类: 移动端
难度: 初级
provenance: pipeline-v3
---

## 是什么

Coil（**Co**routine **I**mage **L**oader）是面向 Android 与 Compose Multiplatform 的现代图片加载库，用 Kotlin 协程把「从网络/磁盘取图 → 解码 → 缓存 → 显示」整条链路串起来。

日常类比：Coil 像一家**连锁照相馆冲印店**。你把照片底片（URL、本地路径、`Uri`）交给前台（`ImageRequest`），店里统一的流水线（`ImageLoader`）负责：先查柜台抽屉里有没有洗好的小照（内存缓存），没有再翻仓库档案（磁盘缓存），还没有就派人去原厂取底片（网络 Fetcher），按相框尺寸裁剪冲印（下采样解码），最后装进相框（`ImageView` / `AsyncImage`）。你不需要自己管暗房、药水配比和排队——一句 `load(url)` 或 `AsyncImage(model = url)` 就行。

2019 年由 Colin White 等人开源，GitHub 上 1.1 万+ star。3.x 起成为 **Kotlin Multiplatform** 库，除 Android 外还支持 iOS、JVM、JS、WASM；Android 侧与 Jetpack Compose、OkHttp、Ktor 生态深度集成。Maven 坐标形如 `io.coil-kt.coil3:coil-compose:3.5.0`。

## 为什么重要

不理解 Coil，下面这些事都没法说清楚：

- 为什么 Compose 里加载网络图只要一个 `AsyncImage`，却不用手写 `BitmapFactory` + `HttpURLConnection`
- 为什么列表快速滑动时图片不会乱加载、乱闪烁——请求会随生命周期自动取消，且按目标尺寸下采样
- 为什么 Glide / Picasso 之外又多了一个「Kotlin 首选」方案——协程一等公民、依赖轻、API 更贴近现代 Android
- 为什么 Coil 3 能在 Compose Multiplatform 项目里共用一套图片 API

## 核心概念

Coil 的运转可以拆成 **六块**：

1. **ImageRequest（订单）**：描述「要加载什么、怎么加载」。`data` 可以是 URL 字符串、`Uri`、`File`、`@DrawableRes Int`、`ByteArray` 等；还可配置占位图、错误图、变换（圆角、裁剪）、过渡动画、内存/磁盘缓存策略。类比：冲印单上的规格备注。

2. **ImageLoader（流水线车间）**：执行 `ImageRequest` 的服务对象，负责调度整条管道。官方强烈建议**全应用共用一个** `ImageLoader`——每个实例自带独立的内存缓存、磁盘缓存和网络客户端，多实例会浪费内存且缓存不共享。默认提供全局单例，也可自行 `ImageLoader.Builder` 构建。

3. **图片管道五段式（Pipeline）**：请求依次经过 **Interceptor → Mapper → Keyer → Fetcher → Decoder**。
   - **Interceptor**：拦截、改写、短路或重试（类似 OkHttp Interceptor）
   - **Mapper**：把自定义数据类型映射成可抓取的形式（如 `data class Avatar(val userId: String)` → URL）
   - **Keyer**：生成内存缓存键
   - **Fetcher**：真正取原始字节（网络 OkHttp/Ktor、本地文件、ContentProvider…）
   - **Decoder**：解码成 `Image`（Bitmap / Drawable / SVG / GIF 帧等）

4. **双层缓存**：**MemoryCache** 存最近解码的位图，按可用内存百分比限额；**DiskCache** 存网络图原始字节，默认在 `cacheDir/image_cache`。命中缓存时跳过网络，列表回滚时几乎瞬时显示。

5. **Compose 与 View 两套入口**：
   - Compose：`AsyncImage`、`SubcomposeAsyncImage`、`rememberAsyncImagePainter`
   - 传统 View：`ImageView.load(url)` 扩展函数
   `AsyncImage` 会根据 Composable 约束自动计算加载尺寸（下采样），是日常首选。

6. **Coil 3 的 `Image` 抽象**：跨平台用 `coil3.Image` 替代 Android `Drawable`；在 Android 上可与 `Drawable`、`Bitmap`、`Painter` 互转。网络层可选 **OkHttp**（Android 常见）或 **Ktor**（Compose Multiplatform 常见）。

## 依赖与最小配置

Gradle（Kotlin DSL）——纯 Android + Compose：

```kotlin
dependencies {
    implementation("io.coil-kt.coil3:coil-compose:3.5.0")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.5.0")
    // 可选：GIF / SVG
    // implementation("io.coil-kt.coil3:coil-gif:3.5.0")
    // implementation("io.coil-kt.coil3:coil-svg:3.5.0")
}
```

AndroidManifest 需要网络权限（若加载 https 图）：

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

## 实践案例

### 案例 1：Compose 中最常见的 `AsyncImage`

一行 URL 即可显示网络图；需要圆角、占位、淡入时改用 `ImageRequest`：

```kotlin
@Composable
fun Avatar(url: String, modifier: Modifier = Modifier) {
    AsyncImage(
        model = ImageRequest.Builder(LocalContext.current)
            .data(url)
            .crossfade(true)
            .build(),
        contentDescription = "用户头像",
        placeholder = painterResource(R.drawable.placeholder_avatar),
        error = painterResource(R.drawable.error_avatar),
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(48.dp)
            .clip(CircleShape),
    )
}
```

`model` 既可以直接传字符串 URL，也可以传完整 `ImageRequest`。`AsyncImage` 会读取 Composable 的宽高约束，只解码所需分辨率，避免把 4000×3000 原图塞进 48dp 小头像。

### 案例 2：LazyVerticalGrid 图片墙（Mars 照片墙模式）

列表场景是 Coil 的主场：滚动出屏的请求自动取消，回滚时走缓存：

```kotlin
@Composable
fun PhotoGrid(photos: List<Photo>, modifier: Modifier = Modifier) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 128.dp),
        modifier = modifier,
        contentPadding = PaddingValues(4.dp),
    ) {
        items(photos, key = { it.id }) { photo ->
            AsyncImage(
                model = photo.imageUrl,
                contentDescription = photo.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .padding(4.dp)
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(8.dp)),
            )
        }
    }
}
```

若要在加载中显示转圈、失败显示重试按钮，可用 `SubcomposeAsyncImage` 的 `loading` / `error` 插槽——注意子组合（subcomposition）比 `AsyncImage` 慢，**性能敏感的 `LazyList` 里优先 `AsyncImage` + 占位图**。

### 案例 3：传统 `ImageView` 与自定义 `ImageLoader`

未迁移 Compose 的模块，或需要细粒度控制时：

```kotlin
// 简单用法
imageView.load("https://example.com/banner.jpg") {
    crossfade(true)
    placeholder(R.drawable.placeholder)
    transformations(CircleCropTransformation())
}

// Application 里配置全局单例（Android 推荐）
class MyApp : Application(), SingletonImageLoader.Factory {
    override fun newImageLoader(context: Context): ImageLoader {
        return ImageLoader.Builder(context)
            .crossfade(true)
            .memoryCache {
                MemoryCache.Builder()
                    .maxSizePercent(context, 0.25)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(context.cacheDir.resolve("image_cache"))
                    .maxSizePercent(0.02)
                    .build()
            }
            .build()
    }
}
```

Compose Multiplatform 入口则在根 `@Composable` 调用 `setSingletonImageLoaderFactory { ... }`，网络层换 `coil-network-ktor3` 而非 OkHttp。

### 案例 4：用 Mapper 支持业务模型

不必在 UI 层拼 URL，把映射逻辑注册进 `ImageLoader`：

```kotlin
data class UserAvatar(val userId: String, val size: Int = 200)

class UserAvatarMapper : Mapper<UserAvatar, String> {
    override fun map(data: UserAvatar, options: Options): String? {
        return "https://cdn.example.com/avatars/${data.userId}?s=${data.size}"
    }
}

val imageLoader = ImageLoader.Builder(context)
    .components {
        add(UserAvatarMapper())
    }
    .build()

// UI 层
AsyncImage(
    model = UserAvatar(userId = "u_42"),
    contentDescription = null,
    imageLoader = imageLoader,
)
```

## Compose API 怎么选

| API | 适用场景 | 注意 |
|-----|----------|------|
| `AsyncImage` | 绝大多数显示网络/本地图 | 自动算尺寸，首选 |
| `rememberAsyncImagePainter` | 需要 `Painter`、自定义绘制 | 默认按原图尺寸加载，需配 `SizeResolver` |
| `SubcomposeAsyncImage` | 按加载状态切换不同 Composable | 子组合有性能成本，慎用于长列表 |

## 与 Glide / Picasso 的对比（选型速览）

| 维度 | Coil | Glide | Picasso |
|------|------|-------|---------|
| 语言 | Kotlin 优先，KMP | Java/Kotlin，Android 为主 | Java，Android 为主 |
| 异步模型 | 协程 `suspend` | 线程池 + 回调 | 线程池 + 回调 |
| Compose | 一等支持 `AsyncImage` | 需额外集成 | 无官方 Compose API |
| 依赖体积 | 轻（Kotlin + Coroutines + Okio） | 较大，功能全 | 很小但功能少 |
| 典型场景 | 新 Kotlin/Compose 项目、KMP | 复杂图像策略、超大图库 | 老项目极简加载 |

没有绝对「最好」，只有「与栈是否同频」。新 Compose 项目默认优先考虑 Coil；已有大量 Glide 定制（自定义 `ModelLoader`、复杂 `Transformation`）的存量 App 迁移要算成本。

## 常见问题

**Q：列表里图片错位/闪烁？**  
给 `LazyList` / `LazyGrid` 的 `items` 传稳定 `key`；`model` 变化时 Coil 会重新请求。检查是否在 `Row` 里复用了错误的 `remember` 状态。

**Q：HTTPS 图加载失败？**  
确认 `INTERNET` 权限、Cleartext 限制（HTTP 需 `networkSecurityConfig`）、以及图片 URL 是否 404。

**Q：库模块里能设置单例 `ImageLoader` 吗？**  
**不要。** 库应依赖 `coil-core`，自建 `ImageLoader` 并由调用方注入，否则会覆盖宿主 App 的配置。

**Q：Android Studio Preview 里网络图不显示？**  
预览环境禁止网络。用 `LocalAsyncImagePreviewHandler` 返回占位 `ColorImage`，或预览本地 `drawable`。

## 延伸学习

- 官方文档：[Getting Started](https://coil-kt.github.io/coil/getting_started/)、[Compose](https://coil-kt.github.io/coil/compose/)、[Image Pipeline](https://coil-kt.github.io/coil/image_pipeline/)
- Android 官方 Codelab：[Load and display images from the internet](https://developer.android.com/codelabs/basic-android-kotlin-compose-load-images)
- 升级指南：[Upgrading to Coil 3.x](https://coil-kt.github.io/coil/upgrading_to_coil3/)（`Coil` 类重命名为 `SingletonImageLoader`、`Drawable` → `Image` 等破坏性变更）

## 小结

Coil 把 Android 图片加载从「手工管理线程 + Bitmap 生命周期」收敛成**声明式请求 + 协程管道 + 双层缓存**。记住三个抓手就够用：`ImageRequest` 描述加载什么，`ImageLoader` 执行管道，`AsyncImage` / `ImageView.load` 负责显示。新项目从 `coil-compose` + `coil-network-okhttp` 起步，列表用 `AsyncImage` 配稳定 `key`，全应用共享一个 `ImageLoader`——其余优化（磁盘比例、自定义 Fetcher、GIF/SVG 解码器）按流量与格式再叠。
