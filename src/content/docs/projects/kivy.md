---
title: Kivy — Python 跨平台应用框架
来源: https://github.com/kivy/kivy
日期: 2026-06-13
分类: 其他
子分类: mobile-cross-platform
provenance: pipeline-v3
---

# Kivy — Python 跨平台应用框架

## 什么是 Kivy

想象一下，你写了一封信，想同时寄给住在不同城市、用不同语言的人。如果每封信都要用不同的语言重新写一遍，那就太麻烦了。Kivy 做的就是这件事——只不过它处理的是**用户界面**（按钮、输入框、图片这些你看得见的东西）。

你只写一次代码，Kivy 帮你在 Windows、macOS、Linux、Android、iOS 上都能跑起来。它底层用 Python + Cython 编写，渲染引擎基于 OpenGL ES 2.0，从 2011 年开源至今，GitHub 上已有近 19,000 个 star。

## 核心概念

### 1. App（应用）

Kivy 的入口是一个继承自 `App` 的类。每个 Kivy 程序必须至少有一个 App 子类。它负责：

- 启动窗口
- 管理生命周期（启动、运行、退出）
- 提供根 Widget 树

### 2. Widget（小部件）

Widget 是屏幕上所有可见元素的基类。常见的 Widget 包括：

- **Label**：显示文字
- **Button**：可点击的按钮
- **TextInput**：用户输入框
- **Image**：显示图片

所有的界面都是 Widget 的树形嵌套结构——就像俄罗斯套娃，一个 Widget 可以包含多个子 Widget。

### 3. Layout（布局）

Widget 需要知道如何排列自己。Layout 就是负责管理子 Widget 排列方式的容器，常用的有：

- **GridLayout**：网格布局，固定行数和列数
- **BoxLayout**：盒子布局，水平或垂直排列
- **FloatLayout**：浮动布局，每个子 Widget 可以手动指定位置
- **AnchorLayout**：锚点布局，把子 Widget 对齐到某个角落

### 4. Kv 语言

Kivy 自带一种专门的界面描述语言——`.kv` 文件。它的作用类似 HTML，但更简洁。Kv 语言的核心理念是**关注点分离**：界面设计（长什么样）和业务逻辑（做了什么）分开写在不同的文件里。

例如在 `.kv` 文件中写：

```
<LoginScreen>:
    GridLayout:
        rows: 2
```

这段代码定义了 `LoginScreen` 这个界面由一个 2 行的网格布局组成。

### 5. Property（属性）

Kivy 有自己的 Property 系统，和普通的 Python 变量不同。Property 是**可绑定的**——当你改变它的值时，Kivy 会自动刷新界面显示。比如把 `Label` 的 `text` 属性从 "Hello" 改成 "World"，界面上的文字就会立刻更新。

## 代码示例

### 示例一：最简单的 Kivy 应用

这是 Kivy 的 "Hello World"，也是理解 Kivy 的最小完整单元。

```python
import kivy
kivy.require('2.1.0')  # 确保 Kivy 版本兼容

from kivy.app import App
from kivy.uix.label import Label


class MyApp(App):
    """继承 App 类，这是每个 Kivy 应用的入口"""

    def build(self):
        """build() 方法返回应用的根 Widget"""
        return Label(text='Hello, Kivy!')


if __name__ == '__main__':
    MyApp().run()
```

**代码拆解：**

- `import kivy` + `kivy.require()`：声明版本依赖
- `class MyApp(App)`：App 是 Kivy 应用的基类，你的应用必须继承它
- `build()`：Kivy 的生命周期方法。这个方法返回什么 Widget，那个 Widget 就是整个应用的"根"。这里返回了一个 `Label`，文字是 "Hello, Kivy!"
- `MyApp().run()`：创建应用实例并启动。`run()` 会打开一个窗口，开始处理事件循环

运行后你会看到一个黑色背景的窗口，中间写着 "Hello, Kivy!"。

### 示例二：登录表单界面

这个例子展示了如何用 `GridLayout` 布局多个 Widget，创建真实的登录界面。

```python
from kivy.app import App
from kivy.uix.gridlayout import GridLayout
from kivy.uix.label import Label
from kivy.uix.textinput import TextInput


class LoginScreen(GridLayout):
    """登录界面，继承自 GridLayout"""

    def __init__(self, **kwargs):
        super(LoginScreen, self).__init__(**kwargs)
        # 设置网格为 2 列：左边是标签，右边是输入框
        self.cols = 2

        # 用户名标签 + 输入框
        self.add_widget(Label(text='User Name'))
        self.username = TextInput(multiline=False)
        self.add_widget(self.username)

        # 密码标签 + 输入框（密码模式隐藏字符）
        self.add_widget(Label(text='Password'))
        self.password = TextInput(password=True, multiline=False)
        self.add_widget(self.password)


class MyApp(App):

    def build(self):
        return LoginScreen()


if __name__ == '__main__':
    MyApp().run()
```

**代码拆解：**

- `class LoginScreen(GridLayout)`：自定义一个继承自 `GridLayout` 的类，代表整个登录界面
- `self.cols = 2`：告诉网格布局有 2 列，每行第一个 Widget 在第一列，第二个在第二列
- `self.add_widget(Label(text='User Name'))`：添加用户名标签
- `self.username = TextInput(multiline=False)`：创建一个单行输入框并保存为实例变量，方便后续使用
- `TextInput(password=True)`：开启密码模式，输入的字符会显示为圆点而不是明文
- `super().__init__(**kwargs)`：调用父类 `GridLayout` 的初始化方法。**必须调用**，否则会丢失 `GridLayout` 的内部功能

这个例子展示了 Kivy 的**自动尺寸适应**特性——当你缩放窗口时，Widget 会自动重新调整大小。这是 Kivy 默认的 size hint 机制在起作用。

### 示例三：用 Kv 语言分离界面

对比上面两个例子（所有界面代码都写在 `.py` 里），Kv 语言可以把界面定义单独拿出来。

Python 端（`main.py`）：

```python
from kivy.app import App
from kivy.uix.label import Label


class MyApp(App):
    title = "Kivy Kv Demo"

    def build(self):
        # 返回一个 Label 作为根 Widget
        return Label(text='用 Kv 语言写的界面')


if __name__ == '__main__':
    MyApp().run()
```

Kv 文件（`main.kv`，和 `main.py` 同名放在同一目录）：

```kv
#:kivy 2.1.0

Label:
    text: 'Hello from Kv!'
    font_size: 48
```

Kv 文件的规则：

- `#:kivy 2.1.0`：声明 Kivy 版本要求
- Kivy 会自动寻找和 Python 文件同名的 `.kv` 文件（`main.py` → `main.kv`）
- 如果返回的 Widget 类名是 `MyApp`（去掉 App 后缀），Kv 文件中写 `MyApp:` 就可以覆盖它的根 Widget
- 属性缩进表示嵌套关系，类似 YAML

## 为什么选择 Kivy

| 特性 | 说明 |
|---|---|
| 一套代码，五端运行 | Windows、macOS、Linux、Android、iOS |
| 多点触控原生支持 | 所有 Widget 自带多触手势支持 |
| MIT 开源协议 | 可商用，无限制 |
| 丰富的 Widget 库 | 按钮、滑块、列表、轮播图等 40+ 种内置控件 |
| Python 生态 | 可以直接用 NumPy、Pandas 等现有库 |
| 活跃社区 | GitHub 19k+ stars，Kivy Garden 提供第三方插件 |

## 下一步

- 官方教程 [Pong Game Tutorial](https://kivy.org/doc/stable/tutorials/pong.html)：从零搭建一个乒乓球小游戏，是理解 Kivy 最好的实践
- [Kivy Garden](https://github.com/kivy-garden)：社区提供的第三方 Widget 库，像pip一样安装：`kivy garden install graph`
- [Buildozer](https://github.com/kivy/buildozer)：把 Kivy 应用打包成 Android APK 或 iOS 包
