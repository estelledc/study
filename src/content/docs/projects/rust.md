---
title: Rust 零基础学习笔记
来源: https://github.com/rust-lang/rust
日期: 2026-06-13
分类: 编程语言
子分类: rust-ecosystem
provenance: pipeline-v3
---

# Rust 零基础学习笔记

## 1. Rust 是什么？一句话理解

Rust 是一门由 Mozilla 开发的系统级编程语言。它的核心目标是：**让你写出 C/C++ 那样快的程序，同时在编译阶段就拦住所有内存错误。**

你可以把 Rust 想象成一个**极度负责的仓库管理员**。普通的语言（比如 Python）把货物交给你之后就不管了——你忘了关门、把货放错了位置，它都不提醒，等你运行时才发现程序崩溃了。而 Rust 会在你取钥匙之前，先检查你记不记得关门。如果记不得，它就不把钥匙给你——**编译直接失败**，你永远不会写出有内存错误的程序。

这也解释了为什么 Rust 自 2016 年起连续多年成为 Stack Overflow 开发者调查中"最受喜爱的语言"第一名。

### 为什么学 Rust？

- **内存安全**：没有垃圾回收（GC），也不需要手动 new/free，靠编译器保证安全
- **零成本抽象**：你写的高层代码，最终编译出来和手写 C 一样快
- **并发安全**：编译器直接拦住数据竞争（data race），多线程不再可怕
- **生态系统壮大**：从操作系统内核到浏览器引擎，Rust 无处不在

---

## 2. 核心概念

### 2.1 所有权（Ownership）—— Rust 的杀手锏

所有权是 Rust 最独特、也最重要的概念。它用三条规则管理内存，替代了垃圾回收：

1. **每个值都有一个所有者（变量）**
2. **同一时刻，只能有一个所有者**
3. **当所有者离开作用域，值就会被丢弃（drop）**

#### 日常类比：借书

想象你在图书馆借了一本《Rust 程序设计》：

- **Python 的做法**：书还回来之后，图书馆自动把书销毁。你忘了还书？没关系，反正会自动处理。但问题是，如果两个人同时想借同一本书，图书馆不知道该给谁。
- **Rust 的做法**：书只有一本。你借走它的时候，图书馆把这本书的所有权"转移"给你。你读完离开阅览室（作用域结束），书就自动归还（drop）。如果你想把书给朋友看，你必须**先还回去**，让朋友重新借走——这就叫"移动（move）"。

这种设计确保了：**任何时候，只有一个人对书有控制权**，不会出现两个人同时修改同一本书的混乱情况。

#### 代码示例 1：所有权与移动

```rust
fn main() {
    // s1 是字符串的所有者
    let s1 = String::from("hello");

    // 把 s1 的所有权"移动"给 s2
    // 此时 s1 不能再用了！
    let s2 = s1;

    // println!("{}", s1);  // 这行会编译错误！s1 已经无效了
    println!("{}", s2);    // 输出: hello

    // s2 离开 main 函数的作用域，内存自动释放
    // 不需要手动 free，也不需要垃圾回收
}
```

如果你尝试编译上面注释掉的那行，Rust 编译器会报这样的错误：

```
error[E0382]: use of moved value: `s1`
  --> src/main.rs:8:20
   |
3  |     let s1 = String::from("hello");
   |         -- move occurs because `s1` has type `String`, which is owned by `s1`
4  |     let s2 = s1;
   |             -- value moved here
5  |
6  |     // println!("{}", s1);  // ERROR!
   |                    ^^^ value used here after move
```

这种错误在运行时才能发现的 bug（比如 use-after-free），在 Rust 里**编译阶段就无法通过**。

### 2.2 引用与借用（References & Borrowing）

有时候我们不想把所有权移走，只是想知道某个值是什么。这就像借书给朋友——朋友只是看看，不是把书据为己有。

Rust 提供了**引用（&）**，允许你不拿所有权去"借用"一个值。

#### 借用规则（图书馆借书规则）

1. **你可以有多个读者（不可变引用 `&T`），或者**
2. **只能有一个写者（可变引用 `&mut T`），但不能同时有读者和写者**

这个规则防止了"你正在读的时候别人把书涂改了"的问题。

#### 代码示例 2：借用与借用检查

```rust
fn main() {
    let mut book = String::from("Rust 程序设计");

    // 多个不可变引用——大家都能看这本书，但不能改
    let reader1 = &book;
    let reader2 = &book;
    println!("读者1看: {}", reader1);  // 输出: Rust 程序设计
    println!("读者2看: {}", reader2);  // 输出: Rust 程序设计

    // 现在只有一个写者——只有 main 函数能改
    book.push_str("（第二版）");
    println!("新版本: {}", book);  // 输出: Rust 程序设计（第二版）
}
```

如果违反借用规则，编译器会立刻拦住：

```rust
fn main() {
    let mut book = String::from("Rust 程序设计");

    let r1 = &book;        // 读者1
    let r2 = &book;        // 读者2
    // let r3 = &mut book; // 编译错误！不能同时有读者和写者
    println!("{} {}", r1, r2); // 读者用完之后再改就不冲突了
    book.push_str("（第二版）");
}
```

错误信息：

```
error[E0502]: cannot borrow `book` as mutable because it is also borrowed as immutable
 --> src/main.rs:5:18
  |
3 |     let r1 = &book;        // ---- immutable borrow occurs here
  |              ^^^^
4 |     let r2 = &book;        // ---- immutable borrow also occurs here
  |              ^^^^
5 |     let r3 = &mut book; // ---- mutable borrow occurs here
  |                      ^^^^ mutable borrow occurs here
```

编译器告诉你：**你已经在借书给 r1 和 r2 了，不能同时再借给别人修改**。

---

## 3. 更多核心概念

### 3.1 结构体（Struct）—— 定义你的数据类型

像 TypeScript 的 interface 或 Go 的 struct，用来组合多个字段成一个自定义类型。

```rust
struct User {
    username: String,
    email: String,
    active: bool,
    login_count: u32,
}

fn main() {
    let user1 = User {
        username: String::from("jason"),
        email: String::from("jason@example.com"),
        active: true,
        login_count: 42,
    };

    println!("用户: {}", user1.username);
    println!("登录次数: {}", user1.login_count);
}
```

### 3.2 枚举（Enum）+ 模式匹配 —— Rust 的强类型武器

Rust 的枚举比 JS 的 enum 强大得多——它可以携带数据，配合 `match` 可以穷尽所有可能，编译器帮你确保不会漏掉任何分支。

```rust
enum Message {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColor(u8, u8, u8),
}

fn handle_message(msg: Message) {
    match msg {
        Message::Quit => println!("退出"),
        Message::Move { x, y } => println!("移动到 ({}, {})", x, y),
        Message::Write(text) => println!("写入: {}", text),
        Message::ChangeColor(r, g, b) => println!("颜色: RGB({}, {}, {})", r, g, b),
    }
}

fn main() {
    handle_message(Message::Write(String::from("Hello, Rust!")));
    handle_message(Message::Move { x: 10, y: 20 });
}
```

### 3.3 Result 错误处理 —— 没有 try-catch

Rust 没有 `try/catch`，也没有 `null`。它用 `Result<T, E>` 和 `Option<T>` 来显式处理错误。

```rust
use std::fs::File;
use std::io::Read;

fn read_config() -> Result<String, std::io::Error> {
    let mut file = File::open("config.txt")?;  // ? 自动 propagate 错误
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    Ok(content)
}

fn main() {
    match read_config() {
        Ok(content) => println!("配置内容: {}", content),
        Err(e) => println!("读取失败: {}", e),
    }
}
```

`?` 运算符的作用：**如果前面成功，继续取值；如果失败，直接 return 错误**。这比一层层 if-else 优雅多了。

### 3.4 生命周期（Lifetime）—— 编译器如何确保引用不会失效

当你返回一个引用时，编译器需要知道它指向的数据会不会在返回后就被销毁了。这就是生命期的意义。

```rust
// 'a 是一个"生命周期标签"，告诉编译器：返回的引用至少活这么久
fn first_word(s: &str) -> &'static str {
    let bytes = s.as_bytes();
    for (i, &item) in bytes.iter().enumerate() {
        if item == b' ' {
            return &s[0..i];
        }
    }
    &s[..]
}

fn main() {
    let sentence = String::from("hello world");
    let word = first_word(&sentence);
    println!("第一个词: {}", word); // 输出: hello
}
```

---

## 4. Rust 的学习路线图

| 阶段 | 内容 | 推荐资源 |
|------|------|----------|
| 入门 | 安装 rustup、cargo 基础使用、变量与数据类型 | [The Rust Book 第 1-4 章](https://doc.rust-lang.org/book/ch01-00-getting-started.html) |
| 核心 | 所有权、借用、切片、结构体、枚举、match | [The Rust Book 第 5-8 章](https://doc.rust-lang.org/book/ch05-00-structs.html) |
| 进阶 | 泛型、trait、生命周期、错误处理、闭包 | [The Rust Book 第 9-15 章](https://doc.rust-lang.org/book/ch09-00-error-handling.html) |
| 实战 | Cargo 工作区、测试、文档、发布 crate | [Rust By Example](https://doc.rust-lang.org/rust-by-example/) |
| 生态 | Tokio 异步运行时、serde 序列化、数据库 ORM | 各 crate 官方文档 |

## 5. 给零基础学习者的建议

1. **不要怕编译错误**：Rust 的错误信息是编程界最好的，它们不是报错，是在"教你怎么改"。每次遇到编译错误，认真读一遍，你会学到新东西。

2. **所有权是第一优先级**：在学其他特性之前，先把所有权的三条规则刻在脑子里。大部分编译错误都跟所有权有关。

3. **多写 `cargo check`**：这是最快的编译检查（不生成二进制文件），写完一段就跑一次，错误越早知道越好。

4. **用 rust-analyzer**：VS Code 或 Helix 编辑器装上它，编辑器会帮你实时检测借用问题。

5. **做小项目练手**：写一个命令行待办事项、一个 URL 短链接器、或者一个简单的 Web 服务器（用 Actix 或 Axum）。实践是理解所有权的最好方式。

## 6. 关键术语速查表

| 术语 | 类比 | Rust 中的含义 |
|------|------|---------------|
| Ownership | 借书的所有权 | 谁负责释放内存 |
| Borrowing | 借书给别人看 | 引用 `&T` 和可变引用 `&mut T` |
| Lifetimes | 书的借阅期限 | 引用有效的范围 |
| Drop | 还书 | 离开作用域时自动释放资源 |
| Trait | 接口/协议 | Rust 的"行为"定义机制 |
| Cargo | 包管理器 | Rust 的 npm/cargo/pip |
| Crate | 包/库 | 一个可编译的 Rust 项目单元 |

---

*本笔记基于 https://github.com/rust-lang/rust 官方仓库整理，适合编程零基础但有一定其他语言经验的学习者。*
