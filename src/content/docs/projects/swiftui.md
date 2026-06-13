---
title: SwiftUI 零基础入门笔记
来源: https://github.com/apple/swiftui
日期: 2026-06-13
分类: 后端 API
子分类: mobile-and-cross-platform
provenance: pipeline-v3
---

# SwiftUI 零基础入门笔记

## 一、什么是 SwiftUI？

想象一下你要搭积木。

传统的方式（比如以前 iOS 用的 UIKit）就像是告诉你每一步怎么搭：先放第一块，再放第二块，如果第二块歪了，你得手动扶正。

SwiftUI 的方式则是直接告诉系统"我要一个这样的结果"：放一块蓝色的积木在上面，下面放一块红色的。系统自己会搞定怎么摆、怎么动、怎么更新。

这就是 **声明式（Declarative）** 编程的核心：描述"是什么"，而不是"怎么做"。

SwiftUI 是 Apple 在 2019 年推出的 UI 框架，用它你可以写一套代码，同时运行在 iPhone、iPad、Mac、Apple Watch 上。

## 二、核心概念

### 1. View（视图）

View 是你看到的每一个 UI 元素：文字、按钮、图片、列表……在 SwiftUI 里，所有东西都是 View。

### 2. 栈布局（Stack）

Stack 是把多个 View 排列在一起的容器：

- **VStack**：从上到下垂直排列
- **HStack**：从左到右水平排列
- **ZStack**：前后叠加（像图层一样）

### 3. State（状态）

状态就是变量，但它跟普通变量不同：当你改变一个 `@State` 变量的值，界面会自动更新。

比如一个开关按钮，点了以后文字从"开"变成"关"，不需要你写任何更新界面的代码——只要修改状态，SwiftUI 自己会画新的样子。

### 4. 链式修饰（Modifiers）

每个 View 都可以加一串"装饰"，比如改颜色、改字号、加圆角。这些修饰像链条一样连在一起，从左到右依次作用。

## 三、代码示例

### 示例一：一个简单的天气卡片

这段代码搭了一个小卡片，显示温度和天气描述：

```swift
import SwiftUI

struct WeatherCard: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("北京")
                .font(.title2)
                .fontWeight(.bold)

            Text("23°C")
                .font(.system(size: 64))
                .fontWeight(.light)

            Text("晴间多云")
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(16)
    }
}
```

拆解一下：

- `VStack(spacing: 12)` — 把三个 Text 垂直排好，间距 12 点
- `.font(.title2)` — 设置字体样式
- `.foregroundStyle(.secondary)` — 文字用次要颜色（看起来淡一些）
- `.background(Color(.systemGray6))` — 给整个卡片加个浅灰底色
- `.cornerRadius(16)` — 圆角，让它看起来柔和一点

每个 `.xxx` 就是在 View 上加一个修饰。它们从左到右连成一条链。

### 示例二：带状态的番茄钟计数器

这个例子展示 `@State` 的用法：

```swift
import SwiftUI

struct TomatoTimer: View {
    @State private var count: Int = 0

    var body: some View {
        VStack(spacing: 24) {
            Text("番茄钟")
                .font(.headline)

            Text("\(count) / 8")
                .font(.system(size: 48))
                .fontWeight(.bold)
                .foregroundStyle(count >= 8 ? .green : .primary)

            Button("完成一个番茄") {
                count += 1
            }
            .buttonStyle(.borderedProminent)
            .disabled(count >= 8)
        }
        .padding()
    }
}
```

关键点在 `count += 1` 这一行：

- `count` 前面加了 `@State`，说明它是一个"能驱动界面更新"的变量
- 按钮按下的时候 `count` 增加 1
- 因为 `count` 是 `@State`，界面中所有用到 `count` 的地方（数字显示、颜色判断）都会**自动更新**
- 没有 `@State` 的话，改变量但界面不会变

当 `count` 达到 8 时，按钮变灰（`.disabled`），数字变绿。

## 四、为什么要学 SwiftUI

对于零基础学习者来说，SwiftUI 有几个特别友好的特点：

1. **所见即所得**：Xcode 编辑器旁边直接看到预览，改了代码马上看到效果
2. **代码量很少**：做同样的界面，SwiftUI 比老方法少写一半以上的代码
3. **Swift 语言本身很简洁**：没有复杂的类型声明，没有分号，读起来像英文
4. **跨平台**：一套代码跑在所有 Apple 设备上

## 五、下一步该学什么

学完上面这些概念后，可以按这个顺序继续：

1. **List + ForEach** — 显示一列数据（比如通讯录）
2. **NavigationStack** — 页面跳转
3. **@StateObject / @Observable** — 管理更大范围的数据
4. **Form** — 表单输入（登录、注册这类页面）
5. **动画** — 让界面动起来

## 参考资料

- Apple 官方文档：https://developer.apple.com/documentation/swiftui
- SwiftUI GitHub 仓库：https://github.com/apple/swiftui
- Apple 教程（HIG 设计规范）：https://developer.apple.com/design/human-interface-guidelines
