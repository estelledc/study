---
title: Serde — Rust 序列化框架
来源: 'https://github.com/serde-rs/serde'
日期: 2026-06-13
分类: 其他
子分类: rust-tools
provenance: pipeline-v3
---

## 是什么

**Serde**（发音 /sɜːrdiː/）是 Rust 生态中最流行的**序列化与反序列化框架**，名字来自 **ser**ializing + **de**serializing 的组合。当前版本 1.0，由 David Tolnay 主导维护，是 Rust 社区使用量排名第一的 crate。

日常类比：

- 想象你要把一份**纸质文档**寄给朋友。你需要把它扫描成电子文件（序列化），朋友收到后需要打印出来阅读（反序列化）。Serde 就是这套"扫描 + 打印"流程的标准化工具
- 更具体地说：Serde 让你的 Rust 程序里的**数据结构**（比如一个包含用户名、年龄的结构体）可以变成**字节流**（存到文件或通过网络发送），也能从字节流**还原**回原来的数据结构
- 它支持的格式包括 JSON、TOML、YAML、MessagePack、CBOR 等十几种数据格式，就像同一个扫描仪可以输出 PDF、JPEG、PNG 不同格式的文件

## 核心概念

### 1. 序列化（Serialize）与反序列化（Deserialize）

这是 Serde 的两个基本操作：

- **序列化**：把内存中的 Rust 数据结构 → 某种格式（JSON 字符串、二进制字节等）
- **反序列化**：把某种格式的数据 → 内存中的 Rust 数据结构

为什么需要这个？因为数据在**内存中**和**存储/传输**时的形态不一样。内存里是 Rust 的对象，但网络上传输的是字节，磁盘上存的是文本或二进制文件。Serde 负责在这两者之间架桥。

### 2. Trait（特征）系统 —— Serde 的设计基石

大多数语言（如 Java、Python）用**运行时反射**来做序列化——程序运行到那一刻才去"看"对象的内部结构。Rust 没有运行时反射，Serde 用的是**编译期 Trait 机制**：

- `Serialize` trait：告诉 Serde"我这个类型知道怎么把自己变成字节"
- `Deserialize` trait：告诉 Serde"我这个类型知道怎么从字节还原自己"

你不需要手动写转换代码——Serde 通过 `#[derive]` 宏在**编译时自动生成**这些实现。这带来两个好处：零运行时开销（编译器可以把整个序列化过程优化掉），以及编译期就能发现错误。

### 3. Derive 宏 —— 零手写代码的关键

这是 Serde 最强大的地方。你只需要在结构体上方加一行注解，Serde 就会自动为你生成序列化和反序列化所需的全部代码：

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
struct User {
    name: String,
    age: u32,
    email: String,
}
```

就这么简单。`#[derive(Serialize, Deserialize)]` 这一行代码，Serde 在编译时会自动展开为完整的序列化/反序列化实现。

## 代码示例

### 示例一：JSON 序列化与反序列化（最常用）

这是 Serde 最常见的用法——把 Rust 结构体变成 JSON 字符串，再还原回来：

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    // 创建一个结构体实例
    let point = Point { x: 1, y: 2 };

    // 序列化：Point → JSON 字符串
    let serialized = serde_json::to_string(&point).unwrap();
    // 结果: serialized = {"x":1,"y":2}
    println!("serialized = {}", serialized);

    // 反序列化：JSON 字符串 → Point
    let deserialized: Point = serde_json::from_str(&serialized).unwrap();
    // 结果: deserialized = Point { x: 1, y: 2 }
    println!("deserialized = {:?}", deserialized);
}
```

Cargo.toml 依赖配置：

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

关键点：

- `serde_json::to_string()` 把 Rust 对象转成 JSON 字符串
- `serde_json::from_str()` 把 JSON 字符串转回 Rust 对象
- `serde_json` 是 Serde 生态中专门处理 JSON 格式的 crate，Serde 本身不包含任何具体格式的解析器
- 每个数据格式都是独立的 crate（如 `serde_yaml`、`serde_cbor`、`serde_toml`），按需引入

### 示例二：嵌套结构与 Vec 集合

Serde 能处理复杂的数据结构——嵌套结构体、数组、Option 可选值：

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug)]
struct Address {
    street: String,
    city: String,
    country: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct Employee {
    name: String,
    age: u32,
    address: Address,
    skills: Vec<String>,
    metadata: Option<HashMap<String, String>>,
}

fn main() {
    let emp = Employee {
        name: "Alice".to_string(),
        age: 30,
        address: Address {
            street: "123 Main St".to_string(),
            city: "San Francisco".to_string(),
            country: "USA".to_string(),
        },
        skills: vec!["Rust".to_string(), "Go".to_string()],
        metadata: Some({
            let mut map = HashMap::new();
            map.insert("department".to_string(), "Engineering".to_string());
            Some(map)
        }),
    };

    // 序列化为格式漂亮的 JSON（带缩进）
    let json = serde_json::to_string_pretty(&emp).unwrap();
    println!("{}", json);
    // 输出:
    // {
    //   "name": "Alice",
    //   "age": 30,
    //   "address": {
    //     "street": "123 Main St",
    //     "city": "San Francisco",
    //     "country": "USA"
    //   },
    //   "skills": ["Rust", "Go"],
    //   "metadata": {
    //     "department": "Engineering"
    //   }
    // }

    // 反序列化回去
    let restored: Employee = serde_json::from_str(&json).unwrap();
    println!("{:?}", restored.name); // Alice
}
```

这个例子展示了几个重要特性：

- **嵌套结构体**（`Address` 在 `Employee` 内部）—— Serde 递归处理，无需额外配置
- **Vec\<String\>**（字符串数组）—— 直接映射为 JSON 数组
- **Option\<...\>**（可选值）—— `Some(value)` 正常输出，`None` 则输出 `null`
- **HashMap\<String, String\>**（键值对）—— 映射为 JSON 对象

### 示例三：自定义字段名称与默认值

有时候你需要控制 JSON 的字段名（比如 API 要求驼峰命名，而 Rust 用蛇形命名），或者给字段设默认值：

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
struct Config {
    #[serde(rename = "api_key")]
    api_key: String,

    #[serde(default = "default_port")]
    port: u16,

    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}

fn default_port() -> u16 {
    8080
}

fn main() {
    let config = Config {
        api_key: "secret123".to_string(),
        port: 3000,
        description: None,
    };

    let json = serde_json::to_string_pretty(&config).unwrap();
    println!("{}", json);
    // 输出:
    // {
    //   "api_key": "secret123",
    //   "port": 3000
    // }
    // 注意：description 因为 None 被跳过了，port 用了默认函数
}
```

`#[serde(...)]` 属性提供了丰富的定制能力：

- `rename`：重命名字段（蛇形 → 驼峰等）
- `default`：指定默认值函数
- `skip_serializing_if`：条件跳过序列化（避免输出 `null`）

## 为什么 Serde 这么重要

1. **Rust 生态的事实标准**：几乎所有需要处理数据的 Rust crate 都依赖 Serde（包括 `reqwest`、`tokio`、`actix-web`、`sqlx` 等知名库）
2. **零成本抽象**：不像 Java 用反射做序列化有运行时开销，Serde 在编译期完成所有工作，性能几乎等同于手写序列化代码
3. **格式无关**：同一套结构体定义，切换 JSON/YAML/TOML 只需改一行依赖，代码不动
4. **安全性**：编译期检查确保类型安全，不会像某些动态语言那样在运行时突然报错

## 快速上手清单

| 步骤 | 命令/操作 |
|---|---|
| 添加依赖 | `cargo add serde --features derive` + `cargo add serde_json` |
| 定义结构体 | 加 `#[derive(Serialize, Deserialize)]` |
| 序列化 | `serde_json::to_string(&data)` |
| 反序列化 | `serde_json::from_str::<MyType>(&json_string)` |
| 换格式 | 改依赖为 `serde_yaml`，调用方式不变 |

## 进一步学习

- 官方教程：https://serde.rs/getting-started.html
- 完整 API 文档：https://docs.rs/serde
- 支持的格式列表：https://serde.rs/data-formats.html
- Discord 社区：#rust-questions 频道
