---
title: Leptos — Rust 全栈 Web 框架入门
来源: https://github.com/leptos-rs/leptos
日期: 2026-06-13
分类_原始: 前端框架
分类: 后端 API
子分类: rust-tools
provenance: pipeline-v3
---

# Leptos — Rust 全栈 Web 框架入门

## 一、什么是 Leptos？

Leptos 是一个用 Rust 编写的**全栈 Web 框架**。它的口号是"Build fast web applications with Rust"。

用一个日常类比来理解：

想象你要开一家餐厅。传统的前后端分离做法就像把厨房（后端）和餐厅（前端）分开在不同楼层，中间要通过电梯（API）传递菜单和菜品——每次都要重新沟通格式、确认订单。而 Leptos 的做法是：厨房和餐厅在同一层，厨师可以直接把菜端上桌，不需要翻译，也不需要额外搭建通道。

具体来说，Leptos 有这几个关键特点：

1. **全栈（Full-stack）**：前端（浏览器里跑的界面）和后端（服务器上的数据库、业务逻辑）用同一种语言（Rust）写，共享类型定义
2. **细粒度响应式（Fine-grained reactivity）**：不是"整页重绘"，而是只更新变化了的那一小块内容
3. **无虚拟 DOM（No Virtual DOM）**：这是和 React 最大的区别。Leptos 直接操作真实的 DOM 节点，性能更好
4. **服务端渲染（SSR）**：页面先在服务器上生成好 HTML 发给浏览器，用户看到得更快
5. **Server Functions**：可以在前端代码里直接调用后端函数，像调用普通函数一样，框架自动处理网络通信

## 二、核心概念

### 2.1 信号（Signals）—— 响应式的基本单元

信号是 Leptos 最核心的概念。类比：信号就像一个智能灯泡 + 一个开关。你拨动开关（设置值），灯泡（UI）会自动亮起来。你不需要告诉灯泡"请亮起来"，它会**自动感知**开关的变化。

```rust
let (count, set_count) = signal(0);
// count  —— 读取当前值（getter）
// set_count —— 设置新值（setter）
```

一个信号返回一对东西：getter 和 setter。getter 用来读值，setter 用来改值。

### 2.2 组件（Component）—— 界面的积木

组件是 Leptos 构建界面的基本单位。类比：组件就像乐高积木块。每一块有自己的功能和外观，你可以把很多块拼在一起，组成复杂的结构。

```rust
#[component]
fn App() -> impl IntoView {
    // ...
}
```

每个组件函数返回 `impl IntoView`，意思是"我能变成页面上的一块东西"。

### 2.3 View 宏 —— 用类似 HTML 的方式写界面

Leptos 提供了一个 `view!` 宏，让你用类似 HTML 的语法描述界面：

```rust
view! {
    <button on:click=move |_| set_count.set(3)>
        "点击我: "
        {count}
    </button>
}
```

注意几个细节：
- 文本要用引号括起来，比如 `"点击我"`
- 要响应式显示的值放在花括号里，比如 `{count}`
- 事件监听用 `on:事件名` 的语法，比如 `on:click`

### 2.4 Server Functions —— 前后端之间的桥梁

Server Function 让你在前端代码里直接调用后端函数。类比：就像你在手机上点外卖，直接打电话给餐馆说"我要一份炒饭"——不需要另外建一个"订单系统"。

```rust
#[server]
pub async fn add_todo(title: String) -> Result<(), ServerFnError> {
    // 这里可以访问数据库、文件系统等服务端资源
    Ok(())
}
```

加上 `#[server]` 标记后，这个函数就能从前端的按钮点击事件里直接调用了。

## 三、代码示例

### 示例 1：计数器组件

这是 Leptos 官方文档里的经典入门示例，展示了信号、视图宏和事件处理的用法：

```rust
use leptos::prelude::*;

#[component]
pub fn SimpleCounter(initial_value: i32) -> impl IntoView {
    // 创建一个响应式信号，初始值为 initial_value
    // (value, set_value) 分别是对应的读取器和写入器
    let (value, set_value) = signal(initial_value);

    // 定义三个按钮的事件处理函数
    // value 和 set_value 都是 Copy 类型，所以可以直接移动到闭包中
    let clear = move |_| set_value(0);
    let decrement = move |_| set_value.update(|v| *v -= 1);
    let increment = move |_| set_value.update(|v| *v += 1);

    // 用 view! 宏声明用户界面
    view! {
        <div>
            <button on:click=clear>"清除"</button>
            <button on:click=decrement>"-1"</button>
            // 文本节点可以用引号包裹，也可以直接写
            <span>"当前值: " {value} "!"</span>
            <button on:click=increment>"+1"</button>
        </div>
    }
}

// 入口函数：把 App 组件挂载到页面的 <body> 上
pub fn main() {
    mount_to_body(|| view! {
        <SimpleCounter initial_value=3 />
    })
}
```

逐行解释：

- `signal(initial_value)` 创建了一个信号，返回值是 `(getter, setter)` 元组
- `set_value(0)` 直接把值设为 0（等价于 `set_value.set(0)`）
- `set_value.update(|v| *v += 1)` 在原地增加值，比 `.set()` 更高效
- `{value}` 直接放入信号，Leptos 会自动让它保持响应式更新
- `mount_to_body` 把整个应用挂载到 HTML 的 `<body>` 元素上

### 示例 2：带数据库操作的表单

这个示例展示了 Server Function 的用法——前端表单直接调用后端数据库操作：

```rust
use leptos::prelude::*;

// --- 服务端函数：保存收藏到数据库 ---
// #[server] 标记告诉 Leptos："这个函数要在服务器上运行"
#[server(SaveFavorites, "/api")]
pub async fn save_favorites(
    cookie_type: String,
    color: String,
) -> Result<String, ServerFnError> {
    // 这里可以使用 sqlx 等库访问数据库
    let pool = get_pool().await?;

    let query = "
        INSERT INTO cookies (favorite_cookie_type, favorite_color)
        VALUES ($1, $2)
    ";

    sqlx::query(query)
        .bind(cookie_type)
        .bind(color)
        .execute(&pool)
        .await
        .map_err(|e| ServerFnError::ServerError(e.to_string()))?;

    Ok(format!("给你 {} 色的 {} 饼干！", color, cookie_type))
}

// --- 前端组件：收藏表单 ---
#[component]
pub fn FavoritesForm() -> impl IntoView {
    // 创建一个"动作"——用于处理表单提交
    let action = create_server_action::<SaveFavorites>();
    let value = action.value();

    view! {
        <ActionForm action=action>
            <label>
                "最喜欢的饼干种类"
                <input type="text" name="cookie_type" />
            </label>
            <label>
                "最喜欢的颜色"
                <input type="text" name="color" />
            </label>
            <input type="submit" value="提交" />
        </ActionForm>

        // 加载中状态
        <Show when=move || action.pending()>
            <div>"正在保存..."</div>
        </Show>

        // 提交成功后显示结果
        <Show when=move || value.with(Option::is_some)>
            <div>{value}</div>
        </Show>
    }
}
```

逐行解释：

- `#[server(SaveFavorites, "/api")]` 定义了一个服务端函数，名字是 `SaveFavorites`，挂载在 `/api` 路径下
- `create_server_action::<SaveFavorites>()` 创建一个与 `SaveFavorites` 关联的动作
- `<ActionForm action=action>` 将表单与动作绑定，提交时自动调用服务端函数
- `action.pending()` 返回是否正在等待服务端响应
- `value` 包含服务端函数的返回值
- `<Show>` 组件根据条件显示或隐藏内容

## 四、Leptos 与其他框架的对比

| 特性 | Leptos | React | Yew | Dioxus |
|------|--------|-------|-----|--------|
| 底层机制 | 细粒度响应式（直接操作 DOM） | 虚拟 DOM | 虚拟 DOM | 虚拟 DOM |
| 语言 | Rust | JavaScript/TypeScript | Rust | Rust |
| 组件是否反复执行 | 否（只执行一次，建立响应关系） | 是（状态变化时重新渲染） | 是 | 是 |
| 全栈支持 | 内置 Server Functions | 需额外配置 | 需额外配置 | 有类似功能 |
| 性能 | 极高（无虚拟 DOM 开销） | 高 | 中等 | 高 |

关键区别在于：**React 每次状态变化都会重新运行整个组件函数，然后对比虚拟 DOM 的差异再更新真实 DOM；Leptos 的组件函数只运行一次，之后通过信号系统精确更新变化的部分。**

## 五、如何开始

安装构建工具 `cargo-leptos`：

```bash
cargo install cargo-leptos --locked
```

创建新项目：

```bash
cargo leptos new --git https://github.com/leptos-rs/start-axum
cd your-project-name
cargo leptos watch
```

然后在浏览器打开 `http://localhost:3000/` 就能看到你的第一个 Leptos 应用了。

## 六、学习资源

- 官方网站：https://leptos.dev
- 官方教程（Book）：https://book.leptos.dev
- API 文档：https://docs.rs/leptos
- 在线 Playground：https://codesandbox.io/p/devbox/playground-j23dz7
- Discord 社区：https://discord.gg/YdRAhS7eQB
- 实用库列表（awesome-leptos）：https://github.com/leptos-rs/awesome-leptos

## 七、总结

Leptos 的核心思想可以概括为一句话：**用 Rust 的类型安全保证整个应用的正确性，用细粒度响应式保证极致性能，用 Server Functions 消除前后端之间的隔阂。**

对于初学者来说，最需要理解的三个概念是：
1. **信号**——状态的管理方式（不是变量，而是会"通知"UI 的智能开关）
2. **组件**——界面的组织方式（只运行一次的设置函数）
3. **Server Functions**——前后端通信的方式（像调用普通函数一样调用后端）

掌握这三个概念后，你就已经理解了 Leptos 的大半。
