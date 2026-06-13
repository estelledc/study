---
title: Dioxus — React 风格的 Rust UI 框架
来源: https://github.com/DioxusLabs/dioxus
日期: 2026-06-13
分类: 后端 API
子分类: rust-tools
provenance: pipeline-v3
---

## 一、从"贴春联"说起：UI 到底是什么？

想象一下，每年贴春联。

传统做法（命令式）：你拿着一把刷子、一桶浆糊，跑到墙上，一笔一画地涂——"这里涂一点，那里抹一下"。如果春联贴歪了，你要撕掉重贴。

React 的做法（声明式）：你先把春联在家里比划好，满意了，然后直接说"春联应该贴在这儿"。框架负责帮你撕掉旧的、贴上新的。你不用管怎么撕、怎么抹。

Dioxus 也是声明式的，但它是用 **Rust** 写的。你告诉 Dioxus："界面长这样"，它负责渲染到浏览器、桌面或手机上。

一句话总结：

> **React 用 JSX 写 UI，Dioxus 用 RSX（Rust + JSX）写 UI。**

---

## 二、核心概念

### 2.1 组件（Component）

组件就是 UI 的基本单位——一个函数，返回"界面长什么样"。

```rust
use dioxus::prelude::*;

fn App() -> Element {
    rsx! {
        h1 { "Hello from Dioxus!" }
        p { "这是一个 Rust 写的网页。" }
    }
}
```

注意 `rsx!` 宏——它长得像 HTML，但其实是 Rust 宏。编译时会被展开成真正的 Rust 代码。

### 2.2 信号（Signal）——状态管理

Dioxus 用 **Signal** 管理状态。你可以把 Signal 想象成一个"带通知功能的小盒子"——当你把盒子里的东西换掉时，所有看到盒子的人会**自动更新**。

```rust
use dioxus::prelude::*;

fn Counter() -> Element {
    // use_signal 创建一个"小盒子"，初始值为 0
    let mut count = use_signal(|| 0);

    rsx! {
        h1 { "计数：{count}" }
        button {
            // 点一下按钮，盒子里的数字 +1
            onclick: move |_| count += 1,
            "加一"
        }
        button {
            onclick: move |_| count -= 1,
            "减一"
        }
    }
}
```

关键点：

- `use_signal(|| 0)` 创建一个可变信号，闭包 `|| 0` 定义初始值
- `count += 1` 修改信号，Dioxus 自动检测到变化并重新渲染受影响的 UI
- 不需要 `useState` + `setState` 的两步操作，直接赋值就行

### 2.3 条件渲染与列表

`rsx!` 宏支持 `if` 和 `for` 语法糖：

```rust
fn TodoList() -> Element {
    let mut items = use_signal(|| vec!["学 Rust".to_string(), "学 Dioxus".to_string()]);

    rsx! {
        h1 { "待办事项" }

        // 条件渲染
        if items.read().is_empty() {
            p { "空空如也，真惬意～" }
        } else {
            ul {
                for item in items.read().iter() {
                    li { "{item}" }
                }
            }
        }
    }
}
```

`if` 块直接写在 `rsx!` 里面，不需要 `return null`。`for` 循环遍历集合，渲染列表项。

### 2.4 组件传参（Props）

组件可以接收参数，用 `#[component]` 宏声明：

```rust
#[component]
fn Greeting(name: String, age: u32) -> Element {
    rsx! {
        p { "你好，{name}！今年 {age} 岁。" }
    }
}

// 使用：
// <Greeting name="小明" age={25} />
```

参数名默认用 snake_case，但使用时用 camelCase——Dioxus 会自动转换。

### 2.5 跨平台编译

Dioxus 最酷的地方：同一份代码，编译到不同平台。

```toml
# Cargo.toml
[dependencies]
dioxus = { version = "0.7.0" }

[features]
default = ["web"]
web = ["dioxus/web"]
desktop = ["dioxus/desktop"]
mobile = ["dioxus/mobile"]
```

- `dioxus/web` → 编译到浏览器（生成 WebAssembly）
- `dioxus/desktop` → 编译到桌面应用（基于 Tauri / 原生窗口）
- `dioxus/mobile` → 编译到 iOS / Android

一套代码，到处运行。

---

## 三、代码示例

### 示例 1：完整计数器应用

这是 Dioxus 官方的入门示例：

```rust
use dioxus::prelude::*;

pub fn App() -> Element {
    let mut count = use_signal(|| 0);

    rsx! {
        h1 { "High-Five counter: {count}" }
        button {
            onclick: move |_| count += 1,
            "Up high!"
        }
        button {
            onclick: move |_| count -= 1,
            "Down low!"
        }
    }
}
```

运行：`cargo dioxus start`，自带热重载——改了代码，浏览器自动刷新。

### 示例 2：带输入的任务管理器

```rust
use dioxus::prelude::*;

#[derive(Clone, PartialEq)]
struct Task {
    text: String,
    done: bool,
}

fn TaskManager() -> Element {
    let mut tasks = use_signal(Vec::<Task>::new);
    let mut input = use_signal(String::new);

    rsx! {
        h1 { "任务管理器" }

        div {
            input {
                r#type: "text",
                value: "{input}",
                oninput: move |e| input.set(e.value()),
                placeholder: "输入新任务...",
            }
            button {
                onclick: move |_| {
                    let text = input.read().clone();
                    if !text.is_empty() {
                        tasks.push(Task {
                            text,
                            done: false,
                        });
                        input.set(String::new());
                    }
                },
                "添加任务"
            }
        }

        ul {
            for task in tasks.read().iter() {
                li {
                    style: "text-decoration: {}",
                    style: "{} if task.done { \"line-through\" } else { \"none\" }",
                    onclick: move |_| {
                        // 找到对应任务并切换 done 状态
                        let mut t = tasks.read_mut();
                        if let Some(found) = t.iter_mut().find(|t| t.text == task.text) {
                            found.done = !found.done;
                        }
                    },
                    if task.done { "✅ " } else { "⬜ " }
                    "{task.text}"
                }
            }
        }
    }
}
```

这个示例展示了：

- `use_signal` 管理数组和字符串状态
- `input` 元素绑定 `oninput` 事件
- `for` 循环渲染列表
- `read_mut()` 模式修改集合中某一项
- 三元表达式放在 `rsx!` 里做样式切换

---

## 四、Dioxus vs React 对照

| 概念 | React | Dioxus |
|------|-------|--------|
| UI 语法 | JSX (JS/TS) | RSX (Rust) |
| 状态管理 | useState / useReducer | use_signal |
| 组件函数 | `function Foo() { return ... }` | `fn Foo() -> Element { ... }` |
| 编译产物 | JavaScript | WebAssembly / 原生二进制 |
| 类型安全 | 可选 (TypeScript) | 编译期强制 |
| 跨平台 | 有 React Native | 原生支持 web/desktop/mobile |
| 热重载 | 有 | 有（零配置） |

---

## 五、为什么选 Dioxus？

1. **类型安全**：Rust 的借用检查器让你在编译期就抓住大部分 bug，不需要运行时调试
2. **性能**：编译为 WebAssembly，体积比 React 应用更小；Signal 机制比 React 的 Virtual DOM Diff 更高效（接近 SolidJS 的细粒度响应式）
3. **跨平台**：一份代码跑 Web、桌面、手机，不用维护多套 UI 代码
4. **生态在增长**：Dioxus 0.7 已经相当成熟，官方文档齐全，社区活跃

---

## 六、一句话回顾

> React 用 JavaScript 声明 UI，Dioxus 用 Rust 做同样的事，但多了一层编译期的安全保障和跨平台的自由。

---

*本文基于 Dioxus 0.7 编写。*
