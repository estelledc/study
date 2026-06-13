---
title: "Compose Multiplatform — 跨平台声明式 UI"
来源: "https://github.com/JetBrains/compose-multiplatform"
日期: "2026-06-13"
分类: 其他
子分类: mobile-cross-platform
provenance: "pipeline-v3"
---

# Compose Multiplatform — 跨平台声明式 UI

## 一、从日常类比开始

想象一下，你要在多个餐厅（iOS、Android、桌面、网页）提供完全相同的菜单。

传统方式：每个餐厅各自请厨师、各自买食材、各自写菜谱。换道菜，得通知所有餐厅。

声明式 UI 的方式：你写一份电子菜谱（代码），然后每个餐厅的厨房（平台）都按同一份菜谱做菜。菜谱改了，所有餐厅自动更新。

Compose Multiplatform 就是这份"电子菜谱"的生成器。

## 二、它是什么

Compose Multiplatform 是 JetBrains 用 Kotlin 写的跨平台 UI 框架。它基于 Google 的 Jetpack Compose（Android 官方 UI 框架），让开发者用同一套代码，一次编写，在四个平台上运行：

- iOS — 稳定版
- Android — 通过 Jetpack Compose
- Desktop — Windows、macOS、Linux
- Web — Beta 阶段（基于 Kotlin/Wasm）

它支持热重载、Material 组件库、与原生 API 互操作，还能渐进式采用——你可以只共享一个按钮，也可以共享整个应用。

## 三、核心概念

### 1. 声明式（Declarative）

声明式 UI 的核心思想是：**你只描述界面"长什么样"，不告诉它"怎么变"。**

传统方式（命令式）：你得像程序员一样，手动写每一行操作——先找按钮，再改文字，再刷新屏幕。

声明式：你只写"当点击时，按钮显示已选中"。框架自己处理更新。

类比：你不是在教机器人一步步折纸，而是给它一张折好的纸——每次它看到这张纸，就按上面的样子折。

### 2. Composable 函数

Compose 的基本构建块是 `@Composable` 函数。这是一个标注，告诉编译器"这个函数用来画 UI"。每个 Composable 函数像一个积木块，可以嵌套组合：

```kotlin
@Composable
fun Greeting(name: String) {
    Text(text = "Hello, $name!")
}
```

### 3. 状态管理（State）

UI 会变化（用户点击、数据加载），状态就是"驱动变化的燃料"。Compose 用 `mutableStateOf` 创建可观察的状态——状态变了，UI 自动重新绘制。

类比：状态就像一个智能灯泡开关。你拨一下开关（改状态），灯泡（UI）自动亮/灭，你不需要自己去拉电线。

### 4. 响应式布局

Compose 提供 Column（纵向排列）、Row（横向排列）、Box（叠加）等布局容器。它们自动适应内容大小和屏幕尺寸。

## 四、代码示例

### 示例一：一个简单的待办事项列表

这个例子展示如何创建一个带标题、文本输入和待办列表的完整界面：

```kotlin
@Composable
fun TodoApp() {
    // 状态：待办事项列表，用 mutableStateOf 创建可观察状态
    var tasks by remember { mutableStateOf(listOf<String>()) }
    var inputText by remember { mutableStateOf("") }

    // Column = 纵向排列的布局容器
    Column(
        modifier = Modifier
            .fillMaxSize()       // 占满整个屏幕
            .padding(16.dp),    // 四周留 16 像素的边距
        verticalArrangement = Arrangement.spacedBy(8.dp) // 子元素间距
    ) {
        // 标题
        Text(
            text = "待办事项",
            style = MaterialTheme.typography.headlineLarge
        )

        // 文本输入框
        OutlinedTextField(
            value = inputText,
            onValueChange = { inputText = it }, // 输入变化时更新状态
            label = { Text("新任务") },
            modifier = Modifier.fillMaxWidth()
        )

        // 添加按钮
        Button(
            onClick = {
                if (inputText.isNotBlank()) {
                    tasks = tasks + inputText // 追加新任务（不可变更新）
                    inputText = ""           // 清空输入框
                }
            }
        ) {
            Text("添加")
        }

        // 待办列表
        LazyColumn(
            modifier = Modifier.weight(1f)
        ) {
            items(tasks) { task ->
                TaskItem(task = task)
            }
        }
    }
}

@Composable
fun TaskItem(task: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = task, style = MaterialTheme.typography.bodyLarge)
        // 可以添加删除按钮
    }
}
```

代码解读：
- `remember` 记住状态，避免每次重绘时重新初始化
- `tasks = tasks + inputText` 不是修改原列表，而是创建新列表（不可变更新），这是 Compose 的设计原则
- `LazyColumn` 是懒加载列表，只渲染屏幕可见的项，性能优秀

### 示例二：天气卡片组件

这个例子展示自定义组件、条件渲染、以及动画效果：

```kotlin
@Composable
fun WeatherCard(city: String, temperature: Int, isSunny: Boolean) {
    // 卡片容器，带圆角和阴影
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp)
            .animateContentSize(),      // 内容变化时自动过渡动画
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSunny) Color(0xFFFFF3E0) else Color(0xFFECEFF1)
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // 城市名 + 天气图标
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = city,
                    style = MaterialTheme.typography.titleLarge,
                    color = Color(0xFF37474F)
                )
                Spacer(modifier = Modifier.weight(1f))
                Icon(
                    imageVector = if (isSunny) Icons.Default.Lightbulb else Icons.Default.Cloud,
                    contentDescription = "天气图标",
                    tint = if (isSunny) Color(0xFFFFA000) else Color(0xFF78909C)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // 温度
            Text(
                text = "$temperature°C",
                style = MaterialTheme.typography.displayMedium,
                color = Color(0xFF263238)
            )

            Spacer(modifier = Modifier.height(4.dp))

            // 天气描述
            Text(
                text = if (isSunny) "晴朗" else "多云",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF546E7A)
            )
        }
    }
}

// 使用示例：在主界面中调用
@Composable
fun WeatherScreen() {
    // 从 API 获取数据
    val weather = remember { mutableStateOf(WeatherData("北京", 25, true)) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        WeatherCard(
            city = weather.value.city,
            temperature = weather.value.temperature,
            isSunny = weather.value.isSunny
        )
    }
}

data class WeatherData(val city: String, val temperature: Int, val isSunny: Boolean)
```

代码解读：
- `animateContentSize()` 让卡片大小变化时有平滑动画
- 条件渲染 `if (isSunny)` 根据布尔值切换 UI，无需手动管理视图可见性
- `Spacer` 是"隐形占位符"，用来控制间距，替代了以前需要手动设 margin 的麻烦

## 五、与传统方式对比

| 特性 | 传统视图系统（XML/SwiftUI原生） | Compose Multiplatform |
|------|------|------|
| 跨平台 | 各写各的 | 一套代码多平台运行 |
| UI 描述 | 先写布局文件，再绑定逻辑 | 直接用代码声明 UI + 逻辑 |
| 状态驱动 | 手动更新 UI | 状态变化自动刷新 |
| 语言 | Java/Kotlin (Android), Swift (iOS) | Kotlin 统一 |
| 复用率 | 通常 0-30% | 可达 80-90% |

## 六、学习建议

1. 先学 Kotlin 基础语法（变量、函数、数据类）
2. 理解"声明式"思想，忘掉"怎么改 UI"
3. 从小的 Composable 组件开始写（Text、Button、Row）
4. 掌握状态管理（remember、mutableStateOf）是关键
5. 动手写一个完整的待办事项 App 来巩固

## 七、参考资源

- 官方文档：https://www.jetbrains.com/lp/compose-multiplatform/
- GitHub 仓库：https://github.com/JetBrains/compose-multiplatform
- 入门教程：https://jb.gg/start-cmp
- 示例项目：https://jb.gg/cmp-samples
