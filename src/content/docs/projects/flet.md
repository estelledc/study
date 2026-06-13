---
title: Flet — Python Flutter 风格 UI 框架学习笔记
来源: https://github.com/flet-dev/flet
日期: 2026-06-13
分类: 后端 API
子分类: mobile-cross-platform
provenance: pipeline-v3
---

# Flet — 用 Python 写 Flutter 风格的跨平台 UI

## 日常类比

想象一下你想做一道菜（一个桌面/网页/手机应用）。传统方式是你要同时学会煎炒烹炸（HTML/CSS/JavaScript），每种厨具（浏览器、桌面系统、iOS、Android）还得分别学。

Flet 做了什么？它让你只用 Python —— 也就是你厨房本来就有的基本刀工 —— 同时做出所有平台上的菜。它的底层用的是 Google 的 Flutter（一个用 Dart 写的跨平台 UI 框架），但你完全不需要学 Dart，更不需要碰 HTML 和 CSS。

简单说：**Flet = Python + Flutter 的 UI 能力**。

## 核心概念

### 1. Page —— 你的画布

Flet 应用从 `flet.app(target=main)` 启动。框架会创建一个 `Page` 对象，它相当于你的"画布"或"桌面"。所有的 UI 元素都要放到这个画布上。

```python
import flet as ft

def main(page: ft.Page):
    # page 就是你的画布
    page.title = "我的第一个 Flet 应用"
    page.add(ft.Text("Hello, Flet!"))  # 往画布上放一个文字

ft.app(target=main)
```

运行后会自动打开一个窗口或浏览器页面，显示 "Hello, Flet!"。

### 2. Control（控件）—— UI 积木

Flet 的每个 UI 元素叫一个"Control"，全部以 `ft.` 开头。常见的有：

| 控件 | 作用 | 类比 |
|------|------|------|
| `ft.Text` | 显示文字 | 一张便利贴 |
| `ft.TextField` | 输入框 | 记事本的一行 |
| `ft.ElevatedButton` | 凸起的按钮 | 门把手（凸出来，好按） |
| `ft.IconButton` | 图标按钮 | 只有图标的开关 |
| `ft.Column` | 垂直排列容器 | 文件夹（把东西竖着排） |
| `ft.Row` | 水平排列容器 | 抽屉（把东西横着排） |
| `ft.AppBar` | 顶部导航栏 | 文件的标题栏 |

控件可以嵌套，就像俄罗斯套娃：

```python
page.add(
    ft.Column([
        ft.Text("用户信息"),
        ft.Row([
            ft.TextField(label="名字"),
            ft.TextField(label="邮箱"),
        ]),
        ft.ElevatedButton("提交", on_click=lambda e: print("提交！")),
    ])
)
```

### 3. 事件处理 —— 按钮按下去之后

每个控件可以绑定"事件"。最常用的是 `on_click`（点击事件）。事件处理函数收到一个 `e` 参数（事件对象），里面记录了谁被按了、在哪里按了等信息。

### 4. page.update() —— 告诉界面"变了"

Flet 的 UI 默认是"命令式"的：你 `page.add()` 添加控件，或者修改变量后必须调用 `page.update()` 让界面刷新。

## 代码示例

### 示例 1：问候应用 —— 输入名字打招呼

这个示例展示了 TextField（输入框）、ElevatedButton（按钮）、on_click（事件）和页面刷新。

```python
import flet as ft

def main(page: ft.Page):

    # 定义输入框控件
    txt_name = ft.TextField(label="请输入你的名字")

    # 按钮按下去时执行的操作
    def btn_click(e):
        page.clean()  # 清空画布上所有内容
        page.add(ft.Text(f"你好, {txt_name.value}!"))
        # 别忘了更新页面
        page.update()

    # 把控件放到画布上
    page.add(
        ft.Column([
            ft.Text("欢迎来到问候应用！", size=24, weight="bold"),
            ft.Row([txt_name, ft.ElevatedButton("打招呼", on_click=btn_click)]),
        ])
    )

ft.app(target=main)
```

运行逻辑：
1. 显示一个输入框和一个按钮
2. 用户在输入框中输入名字
3. 点击"打招呼"按钮，触发 `btn_click` 函数
4. `page.clean()` 清空画布，`page.add()` 放上一行问候语
5. `page.update()` 通知框架刷新界面

### 示例 2：计数器应用 —— 增减数字

这个示例展示了如何**读取和修改控件的值**，以及如何用 `page.update()` 做响应式更新。

```python
import flet as ft

def main(page: ft.Page):
    # 显示数字的文本控件，右对齐，宽度 100
    txt_count = ft.Text("0", size=48, weight="bold", text_align=ft.TextAlign.CENTER)

    # 减一事件
    def minus_click(e):
        current = int(txt_count.value)
        if current > 0:
            txt_count.value = str(current - 1)
        page.update()  # 刷新界面

    # 加一事件
    def plus_click(e):
        current = int(txt_count.value)
        txt_count.value = str(current + 1)
        page.update()  # 刷新界面

    # 重置事件
    def reset_click(e):
        txt_count.value = "0"
        page.update()

    # 把控件排成一行
    page.add(
        ft.Column(
            alignment=ft.MainAxisAlignment.CENTER,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            controls=[
                txt_count,
                ft.Row(
                    [
                        ft.ElevatedButton("-", on_click=minus_click,
                                            style=ft.ButtonStyle(bgcolor=ft.Colors.GREY_300)),
                        ft.FilledButton("重置", on_click=reset_click),
                        ft.ElevatedButton("+", on_click=plus_click,
                                            style=ft.ButtonStyle(bgcolor=ft.Colors.BLUE_500)),
                    ],
                    alignment=ft.MainAxisAlignment.CENTER,
                    spacing=16,
                ),
            ],
        )
    )

    # 居中显示
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER

ft.app(target=main)
```

关键理解点：
- `txt_count` 是一个 Python 变量，指向一个 UI 控件对象
- 修改 `txt_count.value` 只是改了 Python 变量的值，**界面不会自动变**
- 必须调用 `page.update()` 才会把变化同步到界面上
- 这就是 Flet 的"命令式 UI"模式

### 示例 3（进阶）：可观察状态 —— 声明式写法

Flet 也有类似 React 的声明式状态管理。用 `@ft.observable` 装饰数据类，状态变化会自动触发 UI 更新：

```python
import flet as ft
from dataclasses import dataclass

@dataclass
@ft.observable
class AppState:
    counter: int = 0

    def increment(self):
        self.counter += 1

    def decrement(self):
        self.counter -= 1

def main(page: ft.Page):
    state = AppState()

    page.add(
        ft.Text(str(state.counter), size=48, weight="bold"),
        ft.Row([
            ft.ElevatedButton("-", on_click=lambda e: state.decrement()),
            ft.ElevatedButton("+", on_click=lambda e: state.increment()),
        ]),
    )

ft.app(target=main)
```

`@ft.observable` 的作用：当 `state.counter` 被修改时，Flet 自动追踪到变化并刷新 UI。这省掉了手动 `page.update()` 的麻烦。

## 运行方式

安装：

```bash
pip install flet
```

运行：

```bash
python app.py
```

默认启动桌面/网页模式。也可以指定运行平台：

```bash
# 打包为桌面应用（Windows/macOS/Linux）
flet pack app.py

# 打包为移动应用（需要额外配置）
flet build apk
flet build ios
```

## 学习路线建议

1. 先跑通示例 1（问候应用）—— 理解 `page` 画布和 `add()` 添加控件
2. 再跑通示例 2（计数器）—— 理解事件处理和 `page.update()` 刷新
3. 看示例 3 —— 理解声明式状态管理
4. 官方文档：https://flet.dev/docs

## 一句话总结

Flet 让你用纯 Python 写出跨平台的漂亮界面，底层是 Flutter 提供 UI 能力。`page.add()` 放控件，`on_click` 绑定事件，`page.update()` 刷新界面 —— 三步搞定一个桌面/网页/手机应用。
