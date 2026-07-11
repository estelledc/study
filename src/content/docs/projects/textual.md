---
title: Textual — 用 CSS 写终端界面的 Python 框架
来源: https://github.com/Textualize/textual
日期: 2026-05-31
分类: CLI 工具
难度: 中级
---

## 是什么

Textual 是一个**让你用 Python + CSS 写出现代化终端界面**的框架。日常类比：以前在终端里画界面像在黑板上摆磁贴（curses），Textual 把它升级成了"用 CSS 排版的网页，只是渲染在终端里"。

你写：

```python
from textual.app import App
from textual.widgets import Button, Static

class HelloApp(App):
    CSS = "Button { background: blue; }"
    def compose(self):
        yield Static("Hello")
        yield Button("Click")

HelloApp().run()
```

跑起来——一个有蓝色按钮、能点击响应的 TUI 程序。**没有一行 ANSI 转义码**。

它建立在 Rich（Will McGugan 同作者的终端富文本库）之上，加了三件事：**事件系统、布局引擎、CSS 样式表**。

## 为什么重要

不理解 Textual 的位置，下面这些事都没法解释：

- 为什么一个写命令行工具的人会用上 CSS——终端不是只能 `print` 吗
- 为什么 Python 生态里突然有了能跟 Go 的 bubbletea / Rust 的 ratatui 抗衡的 TUI 方案
- 为什么同一份 TUI 代码能经 `textual-serve`（自托管）或 `textual-web`（公网发布）进浏览器
- 为什么 Will McGugan 全职做 Textual 后 Rich 反而被反过来照亮（Rich 现在是 Textual 的渲染后端）

## 核心要点

Textual 的设计可以拆成 **四块**：

1. **Widget 树**：界面是一棵 Widget 组成的树（类似 DOM）。`compose()` 方法 yield 出子 Widget。

2. **TCSS（Textual CSS）**：用类 CSS 语法定义颜色、边框、间距、布局。`Button.primary { background: $accent; }` 长得就和网页 CSS 一样。

3. **Reactive 属性**：在 Widget 上声明 `count = reactive(0)`，值变了自动触发重渲染——和 React state 一个味道。

4. **Async 事件循环**：底层跑在 asyncio 上（像餐厅只有一个传菜口，谁堵着谁就全停）。handler 可以是同步函数，但里面若写 `time.sleep()` 会冻住整棵界面；I/O 要用 `await`。

四块加起来：**声明式组件 + 样式表分离 + 响应式状态 + 异步事件**——这套心智模型从前端搬过来，但跑在终端里。

## 实践案例

### 案例 1：一个能用的待办列表（30 行）

```python
from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, Input, ListView, ListItem, Label

class TodoApp(App):
    CSS = """
    Input { dock: top; }
    ListView { height: 1fr; }
    """

    def compose(self) -> ComposeResult:
        yield Header()
        yield Input(placeholder="加一条 todo...")
        yield ListView()
        yield Footer()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self.query_one(ListView).append(ListItem(Label(event.value)))
        event.input.value = ""

TodoApp().run()
```

**逐部分解释**：

- `compose()` 返回 Widget 列表，自动构成 Widget 树
- CSS 里 `dock: top` 把 Input 钉在顶端，`1fr` 是 flex 单位（剩余空间）
- `on_input_submitted` 命名约定：`on_<widget>_<event>` 自动绑定

### 案例 2：Reactive 触发重渲染

```python
from textual.reactive import reactive
from textual.widgets import Static

class Counter(Static):
    count = reactive(0)
    def render(self) -> str:
        return f"计数：{self.count}"
    def on_click(self) -> None:
        self.count += 1
```

**逐部分解释**：

- `count = reactive(0)` 把普通属性升级成"一改就通知界面"的状态
- `render()` 只负责把当前 `count` 画成字符串，不必手写刷新
- `on_click` 里 `self.count += 1` 触发 reactive 描述符，框架自动再跑 `render()`

### 案例 3：textual-serve 把 TUI 送进浏览器

```bash
pip install textual-serve
```

```python
from textual_serve.server import Server
Server("python myapp.py").serve()  # 本机浏览器打开；公网用 textual-web
```

**逐部分解释**：

1. 先装独立包 `textual-serve`（自托管）；不要和公网产品 `textual-web` 混成一个东西。
2. `Server("python myapp.py")` 用子进程拉起你的 Textual app，经 WebSocket 把键鼠/画面代理到网页。
3. 开发期也可试内置 CLI：`textual serve "python myapp.py"`——同一思路，包名不同。

## 踩过的坑

1. **CJK 字符宽度**：中文字符在不同终端按 1 或 2 列计算，布局可能错位。Textual 假设 east-asian-width=2，但旧终端会乱。

2. **Async 心智模型**：事件循环基于 asyncio，handler 里直接 `time.sleep()` 会**冻住整个界面**。必须用 `await asyncio.sleep()`。

3. **TCSS 不是真 CSS**：`:hover` 支持，但 `:nth-child(2n)` 不支持；选择器是 CSS 子集。学完真 CSS 来用会被坑几次。

4. **DevTools 端口冲突**：`textual run --dev` 默认开 8081 端口的调试控制台，跑两个 app 会撞端口。`--port` 显式指定。

5. **打包成单文件**：PyInstaller 打 Textual app 容易漏 CSS 资源文件，需要在 spec 里显式 `datas` 加进去。

## 适用 vs 不适用场景

**适用**：

- 命令行工具需要交互界面——数据库 client、API 调试器、日志查看器
- 服务器/容器内的监控面板——没有 X11、没有浏览器，但有 SSH
- 本地开发工具——后期可用 textual-serve / textual-web 把同一份代码送上浏览器
- Python 已是技术栈主语言——和 asyncio / pydantic / rich 无缝

**不适用**：

- 性能敏感的高刷新率——无虚拟化时，数千行 `ListView` 每帧重绘整棵树会卡
- Windows cmd 旧版兼容——颜色/Unicode 支持差，建议 Windows Terminal
- 需要原生 OS 控件——TUI 终究在终端里，没真复选框/原生菜单
- 不会 async/await——心智模型门槛高，如果只想 print 表格用 Rich 就够

## 历史小故事（可跳过）

- **2019–2020 年**：Will McGugan 先把 Rich 做成终端富文本基础设施，再在其上长出 Textual。
- **2021–2022 年**：TCSS、Widget 树和 reactive 成型，Python 圈第一次有了"像写前端一样写 TUI"的完整方案。
- **2023–2024 年**：`textual-serve` / `textual-web` 把同一套 app 送进浏览器；Textualize 把"终端即应用运行时"推成产品叙事。

## 学到什么

1. **TUI 也能"现代化"**——把 Web 的声明式组件、CSS 样式表、响应式状态搬到终端，比 curses 那一套体验强一个时代
2. **Rich 是基础设施，Textual 是应用框架**——Rich 管"怎么把字符画到终端"，Textual 管"怎么组织界面和事件"
3. **TUI ↔ Web 的边界在消融**——自托管用 textual-serve，公网发布用 textual-web，同一份代码可以跨界部署
4. **CSS 是好抽象**——选择器 + 层叠 + 盒模型这套东西，离开浏览器照样工作

## 延伸阅读

- 官方教程：[Textual Tutorial](https://textual.textualize.io/tutorial/)（一步步从 0 写计算器）
- 作者博客：[Will McGugan — Building rich terminal UIs](https://www.willmcgugan.com/)（设计取舍背后的思路）
- 源码导读：仓库 `src/textual/app.py` 是入口，`src/textual/widget.py` 是核心
- [[rich]] —— Textual 的渲染后端，先学 Rich 再学 Textual 顺
- [[ratatui]] —— Rust 阵营对标方案，对比能看出语言生态差异

## 关联

- [[rich]] —— 同作者的终端富文本库，Textual 站在它的肩膀上
- [[ratatui]] —— Rust 的 TUI 框架，immediate mode，和 Textual 的 retained mode 是两条路
- [[bubbletea]] —— Go 的 TUI 框架，Elm 架构，和 Textual 的"组件树+CSS"对照学
- [[ink]] —— Node.js 的 TUI 框架，直接用 React 写，和 Textual 思路最像
- [[clack]] —— 命令行交互提示库，比 Textual 轻量，只做问答不做整页

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
