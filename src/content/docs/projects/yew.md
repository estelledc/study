---
title: Yew — Rust WASM 前端框架
来源: https://github.com/yewstack/yew
日期: 2026-06-13
分类: 后端 API
子分类: rust-tools
provenance: pipeline-v3
---

# Yew — 用 Rust 写浏览器里的网页

## 一、先搞懂一个问题：为什么用 Rust 写前端？

你写过网页吗？HTML + CSS + JavaScript，三件套。但有个痛点：JavaScript 是动态语言，变量类型运行时才确定，一个拼写错误就能让整个页面崩溃。

Rust 的前端框架 Yew 做的事情是：你用 Rust 写前端逻辑，Rust 编译器帮你检查所有类型错误，然后编译成 WebAssembly（WASM），在浏览器里运行。

打个比方：JavaScript 就像你一边开车一边看地图，随时可能走错；Rust + Yew 像是出发前，导航已经把每条路都检查过了，上车只管开。

Yew 的名字是一种树（yew tree），发音 /juː/。它在 GitHub 上有超过 32k star，是目前最成熟的 Rust 前端框架之一。

## 二、核心概念

### 2.1 组件（Component）—— 网页的积木

Yew 的核心思想是"组件化"。想象你在搭乐高：每个组件就是一块积木，有自己负责的外观（渲染什么）和行为（怎么响应点击）。

Yew 提供两种组件写法：

- **函数组件**（Function Component）—— 推荐新手使用，像一个纯函数，输入属性，输出 HTML
- **结构体组件**（Struct Component）—— 更底层，可以精细控制状态和生命周期

### 2.2 html! 宏 —— 在 Rust 里写 HTML

Yew 提供了一个 `html!` 宏，让你在 Rust 代码中像写 JSX（React 的语法）一样写 HTML：

```rust
html! {
    <div>
        <h1>{ "你好，世界" }</h1>
        <button onclick={ /* 点击事件 */ }>{"点我"}</button>
    </div>
}
```

花括号 `{}` 里放的是 Rust 表达式，会被渲染成对应的内容。

### 2.3 虚拟 DOM（Virtual DOM）—— 性能的关键

每次组件状态变化时，Yew 不会直接操作真实的浏览器 DOM（这很慢）。它会先构建一棵"虚拟的 DOM 树"，然后和上一棵树对比，只把真正变化的部分更新到真实页面上。

类比：就像你搬家时，不会把所有家具都搬出去再搬回来，而是只移动需要换位置的那几件。

### 2.4 状态与消息 —— 数据驱动视图

Yew 遵循单向数据流：状态变化 → 触发消息 → 更新状态 → 重新渲染。

## 三、代码示例

### 示例 1：计数器（结构体组件）

这是最经典的入门例子。一个按钮，每点一次数字加一。

```rust
use yew::prelude::*;

// 定义这个组件能发出的"消息"类型
enum Msg {
    AddOne,
    SubtractOne,
}

// 定义组件的结构体，包含状态
struct Counter {
    count: i64,
}

// 实现 Component trait，告诉 Yew 这个组件的行为
impl Component for Counter {
    // 消息类型
    type Message = Msg;
    // 这个组件不接受父组件传过来的属性
    type Properties = ();

    // 组件创建时调用，初始化状态
    fn create(ctx: &Context<Self>) -> Self {
        Self { count: 0 }
    }

    // 收到消息时更新状态
    fn update(&mut self, _ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Msg::AddOne => self.count += 1,
            Msg::SubtractOne => self.count -= 1,
        }
        true // 返回 true 表示需要重新渲染
    }

    // 渲染界面：根据当前状态生成 HTML
    fn view(&self, _ctx: &Context<Self>) -> Html {
        html! {
            <div class="counter">
                <h2>{ "计数器：" }</h2>
                <p>{ self.count }</p>
                <button onclick={ _ctx.link().callback(|_| Msg::AddOne) }>
                    { "+1" }
                </button>
                <button onclick={ _ctx.link().callback(|_| Msg::SubtractOne) }>
                    { "-1" }
                </button>
            </div>
        }
    }
}

// 启动应用
fn main() {
    yew::Renderer::<Counter>::new().render();
}
```

代码拆解：

- `Msg` 枚举定义了组件能响应的动作：加一或减一
- `count` 是组件的内部状态，存在结构体字段里
- `create` 在组件首次加载时运行，把 count 初始化为 0
- `update` 收到消息时修改状态，返回 `true` 告诉 Yew"请重新渲染页面"
- `view` 根据当前 `count` 的值生成对应的 HTML
- `ctx.link().callback(...)` 把用户点击包装成一个消息，发给 `update`

### 示例 2：待办事项列表（函数组件）

函数组件是 Yew 0.20+ 版本推荐的写法，更接近 React 的风格。

```rust
use yew::prelude::*;

#[derive(Clone, PartialEq, Properties)]
struct TodoItemProps {
    text: String,
    done: bool,
    on_toggle: Callback<(), ()>,
}

#[function_component]
fn TodoItem(props: &TodoItemProps) -> Html {
    html! {
        <li class=todo_item_class(props.done)>
            <input
                type="checkbox"
                checked={ props.done }
                onchange={ props.on_toggle.callback(()) }
            />
            <span>{ &props.text }</span>
        </li>
    }
}

fn todo_item_class(done: bool) -> Classes {
    if done {
        classes!("todo-item", "done")
    } else {
        classes!("todo-item")
    }
}

#[function_component]
fn App() -> Html {
    let mut todos = use_state(|| vec![
        ("学 Rust", false),
        ("学 Yew", false),
        ("做项目", false),
    ]);

    let on_toggle = {
        let todos = todos.clone();
        Callback::new(move |()| {
            let mut items = todos.to_vec();
            if !items.is_empty() {
                let mut item = items.pop().unwrap();
                item.1 = !item.1;
                items.push(item);
                todos.set(items);
            }
        })
    };

    html! {
        <div class="app">
            <h1>{ "我的待办清单" }</h1>
            <ul>
                { todos.iter().map(|(text, done)| {
                    html! {
                        <TodoItem
                            key={text.clone()}
                            text={text.clone()}
                            done={*done}
                            on_toggle={on_toggle.clone()}
                        />
                    }
                }).collect::<Html>() }
            </ul>
            <p>{ format!("已完成：{}/{}", todos.iter().filter(|(_, d)| *d).count(), todos.len()) }</p>
        </div>
    }
}

fn main() {
    yew::Renderer::<App>::new().render();
}
```

代码拆解：

- `#[function_component]` 标记一个函数为组件，Yew 会自动展开成结构体组件
- `use_state` 是函数组件的状态钩子（Hook），类似 React 的 `useState`
- `Callback` 是回调函数，可以把事件传递给组件
- `#[derive(Properties)]` 自动生成组件属性的解析代码
- `key={text.clone()}` 给每个列表项一个唯一标识，帮助 Yew 优化渲染

## 四、Yew 的技术栈

要使用 Yew，你需要安装：

1. **Rust 工具链**（最低版本 1.84.0）
2. **WebAssembly 编译目标**：`rustup target add wasm32-unknown-unknown`
3. **构建工具 Trunk**：`cargo install --locked trunk`

Trunk 是 Yew 官方推荐的构建工具，它能帮你编译 Rust 到 WASM、打包资源、启动开发服务器，一条龙搞定。

## 五、Yew 适合谁？

- 已经会 Rust，想用它写前端的开发者
- 想要编译时类型安全的前端项目
- 希望复用 Rust 后端逻辑到前端的场景（比如相同的加密算法、数据结构校验）
- 对性能和内存控制有极致要求的应用

## 六、总结

Yew 的本质就是用 Rust 的编译时安全保障，来写原本需要用 JavaScript 写的网页。它的组件模型借鉴了 React 和 Elm，`html!` 宏提供了类 JSX 的声明式 UI 描述，虚拟 DOM 保证了渲染效率。

对 Rust 学习者来说，Yew 是一个很好的实践目标：当你理解了 Rust 的所有权、trait、泛型这些概念后，回头再看 Yew 的代码，会发现很多"原来如此"的时刻。

## 参考资料

- Yew 官方文档：https://yew.rs/
- Yew GitHub 仓库：https://github.com/yewstack/yew
- Yew Playground（在线 playground）：https://play.yew.rs
- Yew API 文档：https://docs.rs/yew
