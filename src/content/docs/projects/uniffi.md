---
title: uniFFI — Rust 跨语言绑定生成器
来源: https://github.com/mozilla/uniffi-rs
日期: 2026-06-13
分类: 其他
子分类: rust-tools
provenance: pipeline-v3
---

# uniFFI — Rust 跨语言绑定生成器

## 日常类比

想象你在一家跨国食品公司工作。公司有一个「万能厨师」——它做的菜是全球最好吃的（这段代码用 Rust 写的，因为 Rust 安全又快）。但现在问题来了：

- 中国的分店要用 Java 调用这个厨师
- 美国的分店要用 Swift 调用同一个厨师
- 法国的分店要用 Python 调用

在没有 uniFFI 的时代，你需要：
1. 让厨师把自己的菜「翻译」成 Java 能理解的格式
2. 再翻译一遍给 Swift 用
3. 再翻译一遍给 Python 用

而且每次菜式更新，你都要重新翻译三遍。累不累？

uniFFI 做的事就是：**你只用 Rust 写一次，它自动帮你翻译成所有语言的接口**。你定义一次规则，Kotlin、Swift、Python、Ruby 都能调用。这就是"Unified FFI"——统一的外语函数接口。

## 核心概念

### 1. 接口定义（Interface Definition）

你需要告诉 uniFFI「哪些功能要暴露给其他语言」。有两种方式：

- **UDL 文件**（UniFFI Definition Language）—— 类似 IDL，用一种类 WebIDL 的文本描述接口
- **Proc Macros** —— 在 Rust 代码上直接加 `#[uniffi::xxx]` 属性，更 Rust 原生

### 2. Scaffolding（脚手架代码）

uniFFI 会根据你的接口定义，自动生成一份 Rust 代码。这份代码负责把 Rust 内部的数据结构「打包」成跨语言能传递的格式（这个过程叫 **lowering**）。

### 3. 绑定代码（Bindings）

同时 uniFFI 还会自动生成目标语言的代码——比如在 Swift 里生成一个可以调用的 `.swift` 文件，在 Kotlin 里生成 `.kt` 文件。这份代码负责把调用「打包」成 C 能理解的格式，传递给 Rust 编译出的动态链接库。

### 4. 运行时动态链接库

你的 Rust 代码编译成一个共享库（`.so`、`.dylib`、`.dll`），其他语言在运行时加载它。uniFFI 生成的绑定代码就像一座桥，连接了「其他语言的调用」和「Rust 的共享库」。

```
[ Swift / Kotlin / Python ]
       ↑ 调用
[ uniFFI 自动生成的绑定代码 ]
       ↑ FFI 调用（C 兼容格式）
[ Rust 编译的动态链接库 ]
```

### 5. 类型映射

uniFFI 帮你处理语言间的类型转换。比如：

| Rust 类型 | Kotlin | Swift | Python |
|-----------|--------|-------|--------|
| `String` | `String` | `String` | `str` |
| `u32` | `Int` | `UInt32` | `int` |
| `Vec<String>` | `List<String>` | `[String]` | `List[str]` |
| `Result<T, E>` | `T / throws E` | `Result<T, E>` | 抛出异常 |

## 代码示例

### 示例一：用 Proc Macro 定义一个待办事项管理器

这是最现代、最推荐的方式。直接在你的 Rust 代码上加宏：

```rust
use uniffi::Object;

// 声明一个可暴露给其他语言的「对象」
#[uniffi::Object]
pub struct TodoList {
    items: std::sync::RwLock<Vec<String>>,
}

// 给这个对象实现方法
#[uniffi::export]
impl TodoList {
    // 构造函数（必须是 #[uniffi::constructor]）
    pub fn new() -> Self {
        TodoList {
            items: std::sync::RwLock::new(Vec::new()),
        }
    }

    // 添加待办事项
    pub fn add_item(&self, todo: String) {
        self.items.write().unwrap().push(todo);
    }

    // 获取所有待办事项
    pub fn get_items(&self) -> Vec<String> {
        self.items.read().unwrap().clone()
    }
}

// 暴露一个全局函数
#[uniffi::export]
pub fn create_demo_list() -> TodoList {
    let list = TodoList::new();
    list.add_item("学习 uniFFI".to_string());
    list.add_item("写笔记".to_string());
    list
}
```

然后在 `lib.rs` 顶部加一句：

```rust
uniffi::setup_scaffolding!();
```

### 示例二：Kotlin 端调用（自动生成）

uniFFI 会为上面的 Rust 代码自动生成 Kotlin 代码。你在 Kotlin 里就这样用：

```kotlin
// 自动生成的代码，不需要你手写
val list = createDemoList()
// 或者
val list = TodoList()

list.addItem("买牛奶")
list.addItem("提交 PR")

val items = list.items()
for (item in items) {
    println("待办: $item")
}
```

生成的 Kotlin 代码长这样（简化版）：

```kotlin
class TodoList : TodoListInterface {
    override fun addItem(todo: String) {
        // 内部调用 FFI，传递 String 给 Rust
    }
    override fun getItems(): List<String> {
        // 内部调用 FFI，从 Rust 获取 Vec<String>
    }
}
```

### 示例三：用 UDL 文件定义接口（另一种方式）

如果你更喜欢把接口单独定义，可以写一个 `.udl` 文件：

```udl
namespace todo {
    [Constructor]
    interface TodoList {
        void addItem(String todo);
        sequence<String> getItems();
    };

    TodoList createDemoList();
};
```

然后在 Rust 的 `build.rs` 中告诉 uniFFI 去处理它：

```rust
fn main() {
    uniffi::generate_scaffolding("src/todo.udl").unwrap();
}
```

### 示例四：错误处理

uniFFI 也支持跨语言传递错误：

```rust
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("待办事项不能为空")]
    EmptyItem,
    #[error("重复的待办事项: {0}")]
    Duplicate(String),
}

impl uniffi::Error for AppError {}

#[uniffi::export]
impl TodoList {
    pub fn add_item(&self, todo: String) -> Result<(), AppError> {
        if todo.is_empty() {
            return Err(AppError::EmptyItem);
        }
        // ... 检查重复
        self.items.write().unwrap().push(todo);
        Ok(())
    }
}
```

在 Swift 里调用时，它就是一个 `Result` 类型，可以正常使用 `do/catch`：

```swift
do {
    try list.addItem("")
} catch {
    print("出错了: \(error)")
}
```

## 为什么用 uniFFI？

| 对比项 | 手动写 FFI | 用 uniFFI |
|--------|-----------|----------|
| 类型转换 | 自己写每个类型的映射 | 自动生成 |
| 新增语言 | 重写一遍绑定代码 | 重新生成即可 |
| 接口变更 | 三处都要改 | 改一处重新生成 |
| 错误处理 | 容易出错 | 有统一规范 |
| 内存管理 | Arc 引用计数要手动处理 | 自动生成 |

## 支持的绑定语言

- **官方支持**：Kotlin（Android）、Swift（iOS/macOS）、Python、Ruby（部分， legacy）
- **第三方**：C#、Go、Dart、Java、React Native（WASM）

## 一句话总结

uniFFI 就是 Rust 界的「一次编写，到处运行」——你定义接口，它帮你生成所有目标语言的桥接代码。Mozilla 在 Firefox 中用它把 Rust 写的核心逻辑同时暴露给了 Android（Kotlin）和 iOS（Swift），这就是它最真实的实战场景。
