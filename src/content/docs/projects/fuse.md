---
title: Fuse — 跨平台原生 UI 工具包学习笔记
来源: https://github.com/fuse-open/fuse
日期: 2026-06-13
分类_原始: 前端框架
分类: 后端 API
子分类: mobile-cross-platform
provenance: pipeline-v3
---

# Fuse — 跨平台原生 UI 工具包

## 日常类比

想象一下，你想开一家连锁奶茶店。

传统做法是：去北京开一家店，你得自己招员工、买设备、设计菜单；再去上海开一家，同样的流程再来一遍；再去手机应用商店发一个版本……每一步都是重复劳动。

Fuse 做了什么？它像是一套"万能奶茶店模板"——你只需要设计一次菜单（界面），配置一次配方（业务逻辑），就可以一键开出北京店、上海店、iOS 店、Android 店。而且每一家店都是"原装正品"（原生性能），不是用塑料模型糊弄。

简单说：**Fuse = 一次编写界面，运行在所有平台，性能跟原生一样快。**

## 核心概念

### 1. UX Markup —— 用声明式语言描述界面

Fuse 使用一种叫 **UX Markup** 的语言，它长得像 XML/HTML，但专门为 UI 设计。你不需要写 HTML 或 CSS，UX Markup 把结构描述和样式设计合在一种语言里。

```ux
<App>
    <StackPanel>
        <Text Value="Hello, Fuse!" FontSize="32" Alignment="center" />
        <Button Text="点击我" Background="orange" />
    </StackPanel>
</App>
```

对比你熟悉的 HTML，UX Markup 的语法非常接近：
- `App` 对应 `html` 根元素
- `StackPanel` 对应一个 Flex 容器
- `Text` 对应 `div` 里的文字
- `Button` 对应 `button`

但区别在于：**UX Markup 不是给浏览器渲染的**，它是直接编译成 C++ 或 .NET 字节码，跑在原生的 GPU 加速渲染管道上。

### 2. FuseJS —— 用 JavaScript 写业务逻辑

界面搭好了，接下来要加交互。Fuse 使用 **FuseJS**，它本质上是 JavaScript —— 你熟悉 `console.log`、`module.exports`、函数调用，那就已经够用 90% 了。

```ux
<App>
    <Panel ux:Class="MyPanel">
        <!-- 界面结构写在 UX 里 -->
        <Text Value="{count}" FontSize="48" Alignment="center" />
        <StackPanel>
            <Button Text="-" Clicked="{decrement}" />
            <Button Text="+" Clicked="{increment}" />
        </StackPanel>
    </Panel>
</App>
```

```javascript
// counter.js
function MyPanel() {
    var count = Observable(0); // 可观察变量

    function increment() {
        count.value++;
    }

    function decrement() {
        count.value--;
    }

    module.exports = {
        count: count,
        increment: increment,
        decrement: decrement,
    };
}
```

UX 文件通过 `import` 引入 JS 模块，然后 `{count}` 的语法把 JS 里的变量绑定到 UI 上。这就是**数据绑定** —— 数据变了，界面自动更新，不用手动刷新。

### 3. Live Reload —— 边改边看

Fuse 内置了一个本地开发服务器。你保存文件（UX、JS、图片、字体）后，运行中的应用几乎瞬间同步更新。

```
你改了一个数字的字号 → 按 Save → 手机上的 App 立刻变了
```

这跟 React Hot Reload 的体验类似，但 Fuse 的 Live Reload 对**整个应用**都有效，包括资产文件（图片、视频、音频）。

### 4. 原生编译 —— 从原型到产品只差一个开关

Fuse 的应用在开发阶段以解释模式运行（方便 Live Reload），但打包发布时，UX Markup 被编译成**高性能 C++ 或 .NET 字节码**，跟手写原生代码的性能差距极小。

这意味着同一个代码库：
- 开发阶段：用解释模式快速迭代
- 发布阶段：编译为原生二进制，性能拉满

### 5. 三大目标平台

| 平台 | 编译产物 | 开发工具 |
|------|----------|----------|
| iOS | Xcode 项目 | Xcode + 原生 Swift/Objective-C |
| Android | Android Studio 项目 | Android Studio + 原生 Java/Kotlin |
| .NET (桌面) | .NET 可执行文件 | Visual Studio / VS Code |

你编写的 UX + FuseJS 是跨平台的，但如果你需要调用原生功能（比如相机、GPS），可以在对应平台上写原生代码。

## 代码示例

### 示例 1：计数器应用 —— 数据绑定的核心体验

这是理解 Fuse 最关键的一个示例。UX 文件定义界面，JS 文件处理逻辑和数据。

**Counter.ux：**

```ux
<Panel ux:Class="Counter" ux:Name="self">
    <!-- 引入 JS 模块 -->
    <JSModule File="counter.js" />

    <!-- 绑定 JS 数据 -->
    <Text Value="{self.count}" FontSize="64" Alignment="center" Color="white" />

    <StackPanel Alignment="center" Margin="0,20,0,0">
        <Button Text="-" FontSize="32" Background="#444"
                HitTestVisibility="None"
                Clicked="{self.decrement}" />
        <Button Text="+" FontSize="32" Background="orange" Margin="0,10,0,0"
                HitTestVisibility="None"
                Clicked="{self.increment}" />
    </StackPanel>
</Panel>
```

**counter.js：**

```javascript
var Observable = require('FuseJS/Observable');

function Counter() {
    // Observable 是可观察变量，值变化时 UI 自动响应
    var count = Observable(0);

    function increment() {
        count.value++;
    }

    function decrement() {
        count.value--;
    }

    // 导出的数据会被 UX 通过 ux:Name 引用
    return {
        count: count,
        increment: increment,
        decrement: decrement,
    };
}

module.exports = Counter;
```

**App.ux**（入口文件）：

```ux
<App>
    <Panel Background="#222">
        <Counter />
    </Panel>
</App>
```

运行后的效果：屏幕上显示一个大数字（初始为 0），两个按钮分别增加和减少。点一下按钮，数字立刻变化，不需要写任何刷新代码。

### 示例 2：待办事项列表 —— 列表渲染 + 数据绑定

这个示例展示了如何渲染动态列表，以及如何处理用户输入。

**TodoApp.ux：**

```ux
<App>
    <StackPanel>
        <!-- 标题 -->
        <Text Value="我的待办" FontSize="36" Margin="20,40,20,10" />

        <!-- 输入区域 -->
        <Panel Height="50" Margin="20,0,20,20">
            <TextInput ux:Name="inputBox" Background="#333"
                       TextColor="white" Placeholder="新增待办..."
                       FontSize="18" />
            <Button Text="添加" Background="orange"
                    HitTestVisibility="None"
                    Clicked="{addTodo}"
                    Alignment="Right" Margin="0,0,10,0" />
        </Panel>

        <!-- 待办列表 -->
        <ScrollingContainer Items="{todos}" ItemHeight="50">
            <Panel Background="#2a2a2a" Margin="20,5,20,5">
                <Text Value="{item.text}" TextColor="white"
                      TextWrapping="Wrap" FontSize="16" />
            </Panel>
        </ScrollingContainer>
    </StackPanel>
</App>
```

**todoApp.js：**

```javascript
var Observable = require('FuseJS/Observable');

function TodoApp() {
    // 待办列表，每个元素是一个对象 { text: string }
    var todos = Observable();
    var nextId = 1;

    function addTodo() {
        var text = inputBox.value || '未命名待办';
        todos.add({ id: nextId++, text: text });
        inputBox.value = ''; // 清空输入框
    }

    return {
        todos: todos,
        addTodo: addTodo,
    };
}

// 需要引用 UI 中的 TextInput
var inputBox = require('FuseJS/UI').findControl('inputBox');

module.exports = {
    addTodo: addTodo,
};
```

核心逻辑拆解：
1. `Observable()` 创建一个可观察的数据容器
2. `items="{todos}"` 告诉 `ScrollingContainer` 用 `todos` 的数据来渲染每一行
3. 每调用一次 `todos.add()`，列表自动追加一行
4. `inputBox.value = ''` 清空输入框

### 示例 3（进阶）：动画 —— 让 UI 活起来

Fuse 最大的亮点之一是**动画是第一公民**。几乎任何属性都可以动画，而且声明极其简洁。

```ux
<App>
    <Panel Background="#1a1a2e" Alignment="Center">
        <Circle ux:Name="ball" Width="60" Height="60"
                Color="orange" />

        <!-- 定义动画：点击球时触发 -->
        <JavaScript>
            var Observable = require('FuseJS/Observable');
            var ball = getContext('ball');

            module.exports = {
                tap: function() {
                    // 让球随机弹到屏幕上某个位置
                    ball.X = Math.random() * 300;
                    ball.Y = Math.random() * 500;
                }
            };
        </JavaScript>

        <Click Handler="{tap}" />

        <!-- 用 Transition 让变化过程有动画效果 -->
        <Circle.Transitions>
            <Transition Duration="0.5">
                <Scale Factor="1.5" />
            </Transition>
        </Circle.Transitions>
    </Panel>
</App>
```

这里的关键是 `Transition` 和 `Scale`。当你修改 `ball.X` 或 `ball.Y` 的值时，不需要写任何动画代码，Fuse 会自动在 0.5 秒内平滑移动。

## 开发工具链

Fuse 提供了一套桌面工具（Fuse Studio），也可以在 VS Code 中使用扩展。

```bash
# 安装 Fuse CLI
npm install -g fuse-open

# 创建新项目
fuse new my-app

# 启动开发服务器（支持 Live Reload）
fuse watch

# 构建 iOS 项目
fuse build --target:iOS --configuration:Release

# 构建 Android 项目
fuse build --target:Android --configuration:Release
```

工具链说明：

| 工具 | 用途 |
|------|------|
| Fuse Studio | 可视化桌面开发工具（IDE） |
| VS Code 扩展 | 轻量编辑 + 语法高亮 |
| `fuse watch` | 开发时启动，支持热更新 |
| `fuse build` | 发布时编译原生项目 |

## 与其他跨平台方案的对比

| 特性 | Fuse | React Native | Flutter |
|------|------|-------------|---------|
| 界面描述语言 | UX Markup | JSX (JavaScript) | Dart |
| 业务逻辑语言 | JavaScript | JavaScript | Dart |
| 渲染方式 | 原生 C++ GPU 渲染 | JavaScript Bridge + 原生控件 | Skia 自绘引擎 |
| 动画体验 | 声明式，属性级 | 需借助库 | 内置动画 |
| 学习曲线 | 低（类 XML） | 中（需学 React） | 中高（需学 Dart） |
| 编译产物 | 原生 C++/.NET | JS 解释器 + 原生模块 | 原生二进制 |

## 一句话总结

Fuse 让你用一套类 XML 的 UX Markup 写界面、用 JavaScript 写逻辑，一键打包到 iOS、Android 和桌面平台。它的杀手��是**声明式动画**和**即时编译**，让开发体验非常流畅。
