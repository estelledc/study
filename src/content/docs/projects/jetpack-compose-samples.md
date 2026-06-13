---
title: Jetpack Compose Samples — Google 官方 Compose 样例博物馆
来源: https://github.com/android/compose-samples
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

**jetpack-compose-samples** 是 Google Android 团队维护的 **Jetpack Compose 官方示例合集**：仓库里不是一个大 App，而是 **多个可独立打开的 Android Studio 工程**（JetNews、Jetchat、Jetsnack、Jetcaster、Reply、JetLagged 等），每个工程专注演示一类 UI 能力或架构模式。

日常类比：你想学做菜，买一本菜谱书（官方文档）当然有用，但有时候更需要 **几家风格不同的样板厨房**——一家只做家常菜摆盘（JetNews），一家专攻聊天输入和动效（Jetchat），一家把播客 App 从手机做到手表和电视（Jetcaster）。compose-samples 就是这些 **带完整源码的样板厨房**：你可以直接打开、改参数、看 Preview、跑测试，比只看 API 文档快得多。

仓库在 GitHub 上有 2 万+ star，与 [Android 开发者文档中的 Compose Samples 页面](https://developer.android.com/develop/ui/compose/samples) 互相引用。2024 年后部分老样本（Crane、Owl、Jetsurvey、Rally）已从主分支移除，历史版本仍可在 tag `v2024.05.00` 里找到——读教程时注意日期，别对着已下架工程找文件。

## 为什么值得学

零基础学 Compose，常见弯路是：

- 只看 `@Composable` 语法，不知道真实项目怎么拆包、导航、测 UI
- 把官方 Codelab 和「能上生产的架构」混为一谈
- 在 Stack Overflow 抄片段，缺少 **Material 3、自适应大屏、动态取色** 的完整上下文

compose-samples 的价值在于 **按难度和主题分仓**：你可以从 Jetchat 理解状态与输入，再跳到 Jetcaster 看 `StateFlow` + Room + 多形态（手机 / TV / Wear）。每个样本的 README 会标明复杂度（Low / Medium / Advanced）和覆盖的 API 清单，相当于一张 **能力地图**。

## 仓库结构一览

根目录 `README.md` 用表格列出主样本（以下为 2024–2025 主分支常见集合，以克隆时 README 为准）：

| 子工程 | 复杂度 | 侧重点 |
| --- | --- | --- |
| **JetNews** | Medium | Material 新闻阅读、抽屉导航、列表/详情、Glance 小组件、自适应 list-detail |
| **Jetchat** | Low | 聊天 UI、Material 3 / 动态取色、文本输入、Fragment+Compose 混用、动画 |
| **Jetsnack** | Medium | 自定义设计系统、网格与折叠头图、底部栏动画 |
| **Jetcaster** | Advanced | Redux 式单向数据流、封面动态主题、Room、TV / Wear 子模块 |
| **Reply** | Medium | Material 3 邮件客户端、折叠屏/平板自适应、Navigation |
| **JetLagged** | — | 自定义 Layout、Path 绘图（睡眠追踪场景） |

另有 **Now in Android**、**Material Catalog** 等链接到仓库外，但同属「官方推荐学习路径」。

克隆后 **用 Android Studio 打开某一个子目录**（如 `JetNews/`），不要试图把整仓当一个 Gradle 工程导入。环境要求见 [Compose 设置文档](https://developer.android.com/jetpack/compose/setup#sample)：需要较新的 Android Studio 与对应 Compose BOM 版本。

## 核心概念

### 1. 声明式 UI：`@Composable` 函数

Compose 界面由 **Composable 函数** 描述「当前状态长什么样」，而不是像传统 View 那样 `findViewById` 再改属性。状态变了，框架会 **重组（recomposition）** 受影响的 Composable 子树。

JetNews 的文章列表就是把数据映射成一组可组合项；概念上类似：

```kotlin
@Composable
fun PostCard(post: Post, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(post.title, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                post.summary,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
```

要点：`PostCard` 不关心「上一次标题是什么」，只根据传入的 `post` 绘制；点击通过 lambda 往上抛，由导航层决定跳转详情。

### 2. 状态提升与单向数据流

样本里反复出现的模式：**子 Composable 无状态（stateless）**，状态放在 ViewModel 或上层，通过参数下发、通过事件回调上报。Jetcaster 更极端：每个屏幕一个 ViewModel，暴露 **单个 `StateFlow<UiState>`**，UI 用 `collectAsStateWithLifecycle()` 订阅——接近 Redux「一个 store、一种 state、事件驱动 reducer」的 Android 版。

### 3. 导航与自适应（JetNews / Reply）

- **JetNews**：`JetnewsApp.kt` 管导航状态与抽屉；`JetnewsNavDisplay.kt` 用 **list-detail 场景策略**，按窗口宽度决定是单栏还是主从双栏（手机 vs 平板/折叠屏）。
- **Reply**：Material Study 邮件客户端，演示 **Material 3 组件 + 自适应导航**（手机底部栏、大屏 navigation rail 等）。

### 4. 主题与设计系统

- **Jetchat**：Material 3、`dynamicDarkColorScheme` / `dynamicLightColorScheme`（Material You 取色）。
- **Jetsnack**：**完全自定义** 颜色、字体、形状，不跟默认 Material 走——学「品牌设计系统」时优先翻 `Jetsnack/ui/theme/`。
- **Jetcaster**：根据播客封面 **动态生成主题色**（`DynamicTheming.kt`），并带颜色切换动画。

### 5. 测试：仪器化 + Robolectric

JetNews README 写明：UI 测试可在真机/模拟器跑 **Instrumented**，也可用 **Robolectric** 在 JVM 跑 `./gradlew testDebug`。学 Compose 测试时，直接对照样本里的 `androidTest` 与 `test` 目录，比从零写 `createComposeRule` 省事。

### 6. 多形态：TV 与 Wear（Jetcaster）

同一产品域下，`Jetcaster/tv-app`、`Jetcaster/wear` 展示 **Compose for TV** 与 **Wear Compose**，手机端 ViewModel 模式在手表上复用。Wear 侧还集成 Horologist Media Toolkit（示例里用 mock Player，真播放可参考 Media Toolkit sample）。

## 推荐学习路径（零基础）

1. **环境**：安装最新稳定版 Android Studio，JDK 17+，打开 `Jetchat` → Sync → 运行 app，熟悉 Preview 面板。
2. **读 UI 状态**：从 `Jetchat` 的 `Conversation.kt`、`UserInput.kt` 看 `remember`、`mutableStateOf`、动画 FAB。
3. **读导航与 Material**：打开 `JetNews`，跟 `ui/` 包从 `JetnewsApp` → `home` → `post` → `interests` 走一遍；看 `glance` 包了解桌面小组件。
4. **读架构**：有 Kotlin 协程和 ViewModel 基础后，克隆 `Jetcaster`，读 `HomeViewModel` + `HomeViewState` + `Home.kt` 三角关系。
5. **读大屏**：对比 `Reply` 与 JetNews 的 window size / adaptive 代码；用 Android Studio 的 **Resizable Emulator** 拖窗口看布局变化。
6. **按需深挖**：自定义布局看 Jetsnack 的 `Grid.kt`、`SnackDetail.kt`；图表看 JetLagged。

## 代码示例

### 示例 1：Jetcaster 风格 — ViewModel + StateFlow + Compose

下列代码浓缩自 Jetcaster 首页模式（包名与类型名与仓库一致，便于你对照源码），展示 **UI 只订阅 state、通过方法发事件**：

```kotlin
@Immutable
data class HomeViewState(
    val featuredPodcasts: List<PodcastPreview> = emptyList(),
    val isLoading: Boolean = true,
)

class HomeViewModel(
  private val podcastRepository: PodcastRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeViewState())
    val state: StateFlow<HomeViewState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            podcastRepository.featuredPodcasts().collect { list ->
                _state.update { it.copy(featuredPodcasts = list, isLoading = false) }
            }
        }
    }

    fun onPodcastSelected(podcastUri: String) {
        // 导航或写入已选状态，由 NavController / 上层处理
    }
}

@Composable
fun HomeRoute(
    viewModel: HomeViewModel = viewModel(),
    onPodcastSelected: (String) -> Unit,
) {
    val viewState by viewModel.state.collectAsStateWithLifecycle()

  if (viewState.isLoading) {
        CircularProgressIndicator()
    } else {
        LazyColumn {
            items(viewState.featuredPodcasts, key = { it.uri }) { podcast ->
                PodcastRow(
                    podcast = podcast,
                    onClick = { onPodcastSelected(podcast.uri) },
                )
            }
        }
    }
}
```

学习要点：`@Immutable` 帮助 Compose 跳过不必要的重组；`collectAsStateWithLifecycle()` 让 Flow 与生命周期对齐，避免后台泄漏更新。

### 示例 2：JetNews 风格 — 自适应 list-detail 思路

JetNews 在宽屏上同时显示列表与详情，窄屏只显示其一。简化版用 `WindowSizeClass` 分支（实际仓库用 Navigation 3 场景策略，思想相同）：

```kotlin
@Composable
fun PostListDetail(
    posts: List<Post>,
    windowSizeClass: WindowSizeClass,
    modifier: Modifier = Modifier,
) {
    var selectedPostId by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedPost = posts.find { it.id == selectedPostId }

    when {
        windowSizeClass.widthSizeClass >= WindowWidthSizeClass.Expanded -> {
            Row(modifier.fillMaxSize()) {
                PostList(
                    posts = posts,
                    selectedId = selectedPostId,
                    onSelect = { selectedPostId = it },
                    modifier = Modifier.weight(0.4f),
                )
                selectedPost?.let { post ->
                    PostDetail(post = post, modifier = Modifier.weight(0.6f))
                }
            }
        }
        else -> {
            if (selectedPost == null) {
                PostList(
                    posts = posts,
                    selectedId = null,
                    onSelect = { selectedPostId = it },
                    modifier = modifier.fillMaxSize(),
                )
            } else {
                PostDetail(
                    post = selectedPost,
                    onBack = { selectedPostId = null },
                    modifier = modifier.fillMaxSize(),
                )
            }
        }
    }
}
```

学习要点：**同一数据、两种布局**；`rememberSaveable` 在旋转或进程重建时保留选中项。完整实现请对照 `JetNews/.../JetnewsNavDisplay.kt`。

## 与其他官方资源的关系

| 资源 | 与 compose-samples 的分工 |
| --- | --- |
| [Now in Android](https://github.com/android/nowinandroid) | 单一完整产品级 App，模块化 + 离线优先 + 测试体系更全面 |
| [Material Catalog](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/integration-tests/material-catalog) | 组件陈列室，查「这个 Button 长什么样」 |
| [Compose 文档](https://developer.android.com/jetpack/compose) | 概念与 API 权威说明 |
| [Accompanist](https://github.com/google/accompanist) | Compose 生态「过渡配件」，很多能力已 upstream 到 AndroidX |

建议：**文档建立概念 → Codelab 跟做 → compose-samples 按主题翻源码 → Now in Android 看工程化全貌**。

## 本地开发与仓库维护

- **格式化**：根目录 `./scripts/format.sh` 可格式化所有样本；单样本内 `./gradlew spotlessApply`。
- **依赖升级**：`./scripts/updateDeps.sh` 批量升稳定版依赖。
- **已移除样本**：Crane、Owl、Jetsurvey、Rally 等见 README「Obsolete Sample Projects」表；学习历史文章时核对 commit/tag。

## 常见问题

**Q：应该从哪个 sample 开始？**  
几乎没有架构基础：Jetchat。想系统看 Material 新闻类 UI：JetNews。想学数据层 + 多设备：Jetcaster。

**Q：需要会 Kotlin 吗？**  
需要。样本全是 Kotlin；不懂协程可先跳过 Jetcaster 的数据流部分，只看 Composable。

**Q：和 Flutter / React Native 样本比呢？**  
compose-samples 只服务 **原生 Android**；优势是与 Jetpack（Navigation、ViewModel、Room、Glance）深度结合，不是跨平台 Demo。

**Q：Preview 不显示或编译失败？**  
通常是 Android Studio / Compose Compiler 版本与项目 BOM 不匹配。用 README 要求的 Studio 版本，对单子工程执行 Sync，不要混用几年前博客里的 Crane 路径。

## 小结

jetpack-compose-samples 是 **按主题拆分的官方 Compose 教科书**：每个子工程是一个可运行的样板厨房，覆盖从聊天输入、自定义设计系统，到 Redux 式架构、TV/Wear、自适应大屏和 UI 测试。零基础学习时，不要试图一次读完整个仓库——**选一个子工程、一条用户路径（例如 JetNews：列表 → 详情 → 兴趣页）跟到底**，再对照本文的核心概念与代码示例回源码里找同名模式，效率最高。

---

**来源**：[https://github.com/android/compose-samples](https://github.com/android/compose-samples)  
**延伸阅读**：[Compose samples \| Android Developers](https://developer.android.com/develop/ui/compose/samples)
