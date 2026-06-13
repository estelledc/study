---
title: Iced — Rust 原生 GUI 框架
来源: https://github.com/iced-rs/iced
日期: 2026-06-13
分类: 后端 API
子分类: rust-tools
provenance: pipeline-v3
---

# Iced — Rust 原生 GUI 框架

## 一句话理解

Iced 是一个用 Rust 写的跨平台 GUI 库。它的核心理念来自一个叫做 Elm 的网页框架，采用一种叫"Elm 架构"的设计模式：**数据驱动界面，界面只产生消息，消息只改变数据**。

## 从日常类比开始

想象你去餐厅点餐：

1. 你心里有一个"当前想吃什么"的状态（比如"想吃面"）
2. 服务员给你一张菜单（这就是界面），菜单上有"加辣""换汤"之类的选项
3. 你点菜时产生的每一个选择，都是"消息"
4. 厨房（更新逻辑）收到消息后，改变你想吃的东西（更新状态）
5. 服务员端上新菜单（渲染新界面）

Iced 做的就是把这套流程变成代码里的固定模式，让你不需要自己一遍遍处理"界面怎么变""用户点了什么"这些琐事。

## Elm 架构的四个核心概念

### 1. State（状态）

就是应用里所有需要记住的数据。比如一个计数器，只需要记住一个数字。

```rust
#[derive(Default)]
struct Counter {
    value: i32,  // 计数器当前的值
}
```

`#[derive(Default)]` 意思是"如果我不指定初始值，就让它等于零"。

### 2. Messages（消息）

所有用户可能触发的动作。按钮点击、输入文字、键盘按下——全部定义在这里。

```rust
#[derive(Debug, Clone, Copy)]
pub enum Message {
    Increment,
    Decrement,
}
```

用 `enum`（枚举）定义消息，意思是"消息只有这两种可能"。Rust 的类型系统会确保你的代码处理了所有情况，不会漏掉某个按钮点击。

### 3. View（视图 / 界面）

一个函数，根据当前状态决定屏幕上显示什么。输入是状态，输出是界面组件的树。

```rust
use iced::widget::{button, column, text, Column};

impl Counter {
    pub fn view(&self) -> Column<'_, Message> {
        column![
            button("+").on_press(Message::Increment),
            text(self.value).size(50),
            button("-").on_press(Message::Decrement),
        ]
    }
}
```

`column!` 是把组件从上到下排成一列的布局。每个按钮通过 `.on_press()` 告诉 Iced："点我时产生对应的消息"。

### 4. Update（更新）

收到消息后，怎么改变状态。

```rust
impl Counter {
    pub fn update(&mut self, message: Message) {
        match message {
            Message::Increment => {
                self.value += 1;
            }
            Message::Decrement => {
                self.value -= 1;
            }
        }
    }
}
```

## 完整运行示例

上面四个部分拼在一起，加上一个 `main` 函数：

```rust
use iced::widget::{button, column, text, Column};

#[derive(Default)]
struct Counter {
    value: i32,
}

#[derive(Debug, Clone, Copy)]
pub enum Message {
    Increment,
    Decrement,
}

impl Counter {
    pub fn view(&self) -> Column<'_, Message> {
        column![
            button("+").on_press(Message::Increment),
            text(self.value).size(50),
            button("-").on_press(Message::Decrement),
        ]
    }

    pub fn update(&mut self, message: Message) {
        match message {
            Message::Increment => self.value += 1,
            Message::Decrement => self.value -= 1,
        }
    }
}

fn main() -> iced::Result {
    iced::run("计数器", Counter::new, Counter::update, Counter::view)
}
```

运行后就会弹出一个窗口，显示一个数字和两个按钮，点击可以加减。Iced 自动帮你处理了窗口创建、事件循环、界面重绘所有底层细节。

## 第二个例子：带输入框的待办事项

这个例子更实用一些，展示文本输入和列表：

```rust
use iced::widget::{button, text, text_input, Column, TextInput};

#[derive(Default)]
struct TodoApp {
    tasks: Vec<String>,
    new_task: String,
}

#[derive(Debug, Clone)]
pub enum Message {
    NewTask(String),
    Add,
    Remove(usize),
}

impl TodoApp {
    fn view(&self) -> Column<'_, Message> {
        let input = TextInput::new("输入新任务...", &self.new_task)
            .on_input(Message::NewTask)
            .on_submit(Message::Add);

        let mut items: Vec<iced::widget::Column<'_, Message>> = Vec::new();
        for (i, task) in self.tasks.iter().enumerate() {
            items.push(
                iced::widget::row![
                    text(task),
                    button("删除").on_press(Message::Remove(i))
                ]
            );
        }

        column![
            input,
            button("添加").on_press(Message::Add),
            column!(items),
        ]
    }

    fn update(&mut self, message: Message) {
        match message {
            Message::NewTask(text) => self.new_task = text,
            Message::Add => {
                if !self.new_task.is_empty() {
                    self.tasks.push(self.new_task.clone());
                    self.new_task.clear();
                }
            }
            Message::Remove(index) => {
                self.tasks.remove(index);
            }
        }
    }
}
```

这里引入了两个新概念：
- `TextInput`：文本输入框，`.on_input()` 实时捕获输入，`.on_submit()` 在按回车时触发
- `Vec`：动态数组，用来存不定数量的待办事项

## Iced 的其他亮点

- **跨平台**：Windows、macOS、Linux、Web 都能跑
- **两种渲染器**：wgpu（GPU 加速，支持 Vulkan/Metal/DX12）和 tiny-skia（纯软件渲染，适合嵌入式）
- **自定义组件**：可以创建自己的 Widget，像搭积木一样组合
- **调试工具**：内置 DevTools，支持性能指标查看和时间旅行（类似 React DevTools）
- **异步支持**：直接用 Rust 的 `futures` 处理网络请求等异步操作
- **30k+ GitHub Star**：社区活跃，文档完善

## 学习路线

1. [iced 官方书](https://book.iced.rs/)：从零开始的教学
2. [官方示例](https://github.com/iced-rs/iced/tree/master/examples)：30+ 个完整示例
3. [docs.rs 文档](https://docs.rs/iced/)：API 参考
4. [Zulip 社区](https://iced.zulipchat.com/)：提问和交流

## 适合谁

- 想用 Rust 写桌面应用，但不想处理繁琐的窗口和事件管理
- 已经熟悉 Elm/Redux 模式，想在桌面端用同样思路开发
- 喜欢类型安全，希望编译期就抓住界面相关的 bug
