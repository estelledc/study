---
title: Glide — Android 上专注流畅滚动的图片加载库
来源: 'https://github.com/bumptech/glide'
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

**Glide** 是 Google（原 Bumptech 团队）维护的 Android 图片与媒体加载框架，把「取图 → 解码 → 缓存 → 显示」整条链路封装成一行 API，并针对**列表快速滑动**做了大量性能优化。GitHub [bumptech/glide](https://github.com/bumptech/glide) 累计 3.5 万+ star，是 Android 生态里最老牌、最广泛使用的图片加载方案之一。

日常类比：Glide 像一家**连锁快递驿站 + 智能仓储**。你把包裹单号（URL、`Uri`、资源 ID）交给前台（`RequestBuilder`），驿站系统（`Glide` 单例 + `Engine`）会：

1. 先查**前台货架**有没有同款小件（**内存缓存**）
2. 没有再翻**仓库档案**（**磁盘缓存**）
3. 还没有就派快递员去原厂取货（**网络 / 本地 ModelLoader**）
4. 按你指定的相框尺寸裁剪打包（**下采样 + Transformation**）
5. 最后把成品放进 `ImageView` 或自定义 `Target`

你不需要自己管线程池、Bitmap 回收和 Activity 销毁时的取消逻辑——`Glide.with(activity).load(url).into(imageView)` 一行即可。Activity/Fragment 销毁时，关联请求会自动取消并释放资源。

Glide v4 是当前主线（最低 API 14，编译需 API 27+）。支持静态图、GIF、视频缩略图；默认用 `HttpURLConnection` 发网络请求，也可通过集成库换成 [[okhttp]] 或 Volley。

## 为什么重要

零基础学 Android UI，Glide 几乎是「必认识的名字」，因为：

- **RecyclerView 列表场景的事实标准**：自动处理 View 复用、请求取消、尺寸下采样，减少 OOM 和滑动卡顿
- **生命周期深度绑定**：`Glide.with(Fragment/Activity)` 让后台加载与界面存活期对齐，避免「页面已关图还在写进 ImageView」
- **多层缓存开箱即用**：内存 LRU + 磁盘 LRU + Bitmap 对象池，不必手写 `LruCache` 和文件命名规则
- **可扩展管道**：`ModelLoader`、`DataFetcher`、`Transformation` 可插拔，企业 App 常在此定制 CDN 签名、鉴权 Header、水印
- **与 [[coil]] 的对照**：新 Kotlin/Compose 项目多选 Coil；大量存量 Java/Kotlin View 项目、复杂图像策略仍大量依赖 Glide

## 核心概念

Glide 的运转可以拆成 **七块**：

1. **RequestManager（请求调度员）**：由 `Glide.with(context)` 获得，与 Activity/Fragment/View 生命周期绑定。同一生命周期内共享配置；`onStop` 时暂停，`onDestroy` 时清请求。类比：某个门店的前台班组。

2. **RequestBuilder（运单）**：链式 API 描述加载什么、怎么加载。`.load()` 接受 URL 字符串、`Uri`、`File`、`@DrawableRes`、`byte[]` 等；`.placeholder()` / `.error()` 设置占位与失败图；`.override(w,h)` 指定目标像素尺寸；`.transform()` 应用圆角、模糊等变换。

3. **Target（收件人）**：接收加载结果的抽象。最常用的是 `into(ImageView)`，内部包装为 `ImageViewTarget`。也可 `into(CustomTarget<Drawable>)` 或 `submit()` 在后台线程拿 `Bitmap`。Target 负责报告 View 尺寸，Glide 据此下采样——**只解码显示所需大小**，这是省内存的关键。

4. **Engine + 三级缓存查找顺序**：每次请求默认依次查：
   - **活动资源**（正在屏幕上的资源，带引用计数）
   - **内存缓存**（`MemoryCache`，LRU）
   - **磁盘缓存**（`DiskCache`，默认应用 `cacheDir` 下约 250MB）
   - 都没有才走 **ModelLoader → DataFetcher** 拉原始数据，再 **Decode → Transform → Encode 回写磁盘**

5. **DiskCacheStrategy（磁盘策略）**：`AUTOMATIC`（默认，远程只缓存原数据、本地只缓存变换结果）、`ALL`、`DATA`、`RESOURCE`、`NONE`。配合 `skipMemoryCache(true)` 可跳过内存层。

6. **BitmapPool（位图对象池）**：复用 `Bitmap` 内存块，减少 GC 和堆碎片。与 `MemoryCache` 分工：缓存存「成品资源」，对象池存「可重用空壳」。

7. **AppGlideModule / LibraryGlideModule（全局配置）**：通过注解处理器在编译期合并模块，在 `applyOptions(GlideBuilder)` 里改磁盘大小、内存比例、默认 `DecodeFormat`；在 `registerComponents()` 里注册自定义 `ModelLoader`。注意：`GlideApp` 等生成 API 自 4.14 起已**废弃**，应直接用 `Glide` + `RequestOptions`，但 `AppGlideModule` 配置本身仍推荐。

## 依赖与最小配置

Gradle（Kotlin DSL，Glide 4.16.x 示例）：

```kotlin
dependencies {
    implementation("com.github.bumptech.glide:glide:4.16.0")
    ksp("com.github.bumptech.glide:ksp:4.16.0") // 或 kapt("...:compiler:4.16.0")
    // 可选：OkHttp 集成
    // implementation("com.github.bumptech.glide:okhttp3-integration:4.16.0")
}
```

`AndroidManifest.xml` 加载网络图片时需要：

```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- 可选：断网重连后自动重试失败请求 -->
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

全局配置（Kotlin 项目仍可用 Java 写 Module）：

```java
@GlideModule
public final class MyAppGlideModule extends AppGlideModule {
    @Override
    public void applyOptions(@NonNull Context context, @NonNull GlideBuilder builder) {
        int memoryCacheSize = (int) (Runtime.getRuntime().maxMemory() / 8);
        builder.setMemoryCache(new LruResourceCache(memoryCacheSize));
    }
}
```

## 实践案例

### 案例 1：Activity 里一行加载网络图

最基础用法——生命周期随 Activity，销毁时自动清理：

```kotlin
class ProfileActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_profile)
        val avatar: ImageView = findViewById(R.id.avatar)

        Glide.with(this)
            .load("https://example.com/users/42/avatar.jpg")
            .placeholder(R.drawable.avatar_placeholder)
            .error(R.drawable.avatar_error)
            .circleCrop()
            .into(avatar)
    }
}
```

`.with(this)` 传入 Activity，而不是 `applicationContext`，这样加载会随 Activity 暂停/销毁而取消。`circleCrop()` 是内置 `Transformation`，在解码后裁剪圆形，比外层套 `CircleImageView` 更省一层 Drawable 嵌套问题。

### 案例 2：RecyclerView 列表（Glide 的主场）

列表滑动时 View 会被复用；Glide 自动取消旧请求，但必须保证每次 bind 都发起新 load 或显式 `clear()`：

```kotlin
class PhotoAdapter(private val items: List<Photo>) :
    RecyclerView.Adapter<PhotoAdapter.VH>() {

    class VH(val image: ImageView) : RecyclerView.ViewHolder(image)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_photo, parent, false) as ImageView
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val photo = items[position]
        Glide.with(holder.image) // 也可 Glide.with(holder.itemView)
            .load(photo.thumbnailUrl)
            .centerCrop()
            .transition(DrawableTransitionOptions.withCrossFade(200))
            .into(holder.image)
    }

    override fun getItemCount() = items.size
}
```

若某行要显示本地占位 Drawable 而非网络图，应先 `Glide.with(holder.image).clear(holder.image)`，否则上一行的异步结果可能在占位图之后到达，造成**图片错位**——这是列表场景最常见的坑。

### 案例 3：RequestOptions 复用与磁盘策略

多个页面共享同一套「缩略图规格」时，用 `RequestOptions` 避免重复链式调用：

```kotlin
object ThumbOptions {
    val gridThumb: RequestOptions = RequestOptions()
        .diskCacheStrategy(DiskCacheStrategy.AUTOMATIC)
        .override(300, 300)
        .centerCrop()
        .placeholder(R.drawable.loading_spinner)
}

// 使用
Glide.with(fragment)
    .load(url)
    .apply(ThumbOptions.gridThumb)
    .into(imageView)
```

需要强制走缓存、节省流量（如离线预览模式）：

```kotlin
Glide.with(context)
    .load(url)
    .onlyRetrieveFromCache(true) // 缓存未命中则失败，不发网络
    .into(imageView)
```

### 案例 4：后台线程同步取 Bitmap

UI 不需要 Drawable，只要 `Bitmap` 做分享、上传或图像处理：

```kotlin
suspend fun fetchBitmap(context: Context, url: String): Bitmap =
    withContext(Dispatchers.IO) {
        Glide.with(context)
            .asBitmap()
            .load(url)
            .submit(512, 512) // 目标宽高像素
            .get() // 阻塞；生产代码注意超时与异常
    }
```

`submit()` 适合工作线程；若在主线程请继续用 `into()`。完成后 Glide 仍管理资源引用计数，**不要**随意 `bitmap.recycle()`，除非你知道没有其它 Glide 引用。

## 缓存与内存：一张心智图

```text
请求 load(url)
    │
    ▼
[活动资源] ──命中──► 显示
    │ miss
    ▼
[内存缓存] ──命中──► 显示
    │ miss
    ▼
[磁盘缓存] ──命中──► 解码 ──► 显示
    │ miss
    ▼
网络/ContentProvider/File ──► 解码 ──► Transform ──► 写磁盘 ──► 显示
```

系统内存紧张时，Glide 响应 `ComponentCallbacks2` 自动 trim 内存缓存；也可 `Glide.get(context).trimMemory(level)` 手动干预。大图预览场景记得 `.override()` 或 `downsample()`，不要解码原图尺寸。

## 与 Coil / Picasso 的对比（选型速览）

| 维度 | Glide | Coil | Picasso |
|------|-------|------|---------|
| 维护方 | Google / Bumptech | Coil 社区 | Square（维护模式） |
| 语言风格 | Java 优先，Kotlin 可用 | Kotlin 协程优先 | Java，API 最简 |
| Compose | 无官方一等 API | `AsyncImage` 原生支持 | 无 |
| 列表性能 | 极成熟，引用计数 + 生命周期 | 协程取消 + 下采样 | 简单场景够用 |
| 扩展性 | ModelLoader 体系完整 | Fetcher/Decoder 管道 | 较弱 |
| 典型场景 | 存量大 App、复杂缓存策略 | 新 Compose/KMP 项目 | 老项目极简加载 |

没有绝对「最好」：Glide 的优势在**十年积累的生命周期、缓存与列表行为**；新项目若全栈 Kotlin Compose，[[coil]] 往往更顺手；三者网络层都可对接 [[okhttp]]。

## 常见问题

**Q：列表图片错位、闪旧图？**  
`onBindViewHolder` 必须对复用 View 调用新的 `.into(imageView)`，或切换为占位图前 `.clear(imageView)`。不要只在 `onCreateViewHolder` 里 load 一次。

**Q：GIF 与 crossFade/placeholder 冲突？**  
部分圆形 ImageView 库与 `TransitionDrawable` 不兼容。可 `.dontAnimate()` 或改用 Glide 内置 `.circleCrop()` Transformation。

**Q：Cleartext HTTP 图加载失败？**  
Android 9+ 默认禁止明文 HTTP。改用 HTTPS，或配置 `networkSecurityConfig` 放行特定域名。

**Q：还能用 `GlideApp` 吗？**  
4.14 起生成 API 已废弃，官方建议统一 `Glide.with()` + `RequestOptions` / Kotlin 扩展函数。`AppGlideModule` 配置仍需要。

**Q：和 [[retrofit]] 什么关系？**  
无直接依赖。Retrofit 管 JSON API；Glide 管图片字节流。若 REST 返回的是图片 URL，Glide 负责把 URL 变成 Bitmap；若 API 要上传图片，可用 Glide `submit()` 取 Bitmap 再交给 OkHttp Multipart。

## 延伸学习

- 官方文档：[Getting Started](https://bumptech.github.io/glide/doc/getting-started.html)、[Caching](https://bumptech.github.io/glide/doc/caching.html)、[Configuration](https://github.com/bumptech/glide/wiki/Configuration)
- 源码入口：`com.bumptech.glide.Glide`、`RequestManager`、`Engine`
- 对照阅读：本库笔记 [[coil]]（Kotlin 现代方案）、[[okhttp]]（可插拔网络栈）
- Android 官方 Codelab：[Load and display images from the internet](https://developer.android.com/codelabs/basic-android-kotlin-compose-load-images)（Compose 侧用 Coil，但缓存/生命周期概念相通）

## 小结

Glide 把 Android 图片加载从「手工线程 + LruCache + 担心泄漏」收敛成 **`with(生命周期) → load(数据源) → into(目标)`** 三件套。零基础记住四件事就够上手：

1. **永远用 Activity/Fragment 级 `with()`**，不要用 Application Context 加载进 View（除非明确知道后果）
2. **列表必复用 RequestOptions，bind 必重新 `into()`**
3. **Trust 默认缓存**，用 `override` 控制尺寸，用 `DiskCacheStrategy` 微调持久化
4. **全局配置走 `AppGlideModule`**，别在每个 Fragment 里重复造轮子

掌握这些后，再按需深入 `ModelLoader` 自定义数据源、`Transformation` 自定义视觉效果、以及 `okhttp3-integration` 统一网络栈——Glide 的复杂度高，但每一项复杂度都对应真实 App 里踩过的坑。
