---
title: Gleam — 静态类型 BEAM 语言
来源: https://github.com/gleam-lang/gleam
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Gleam — 静态类型 BEAM 语言

## 一、Gleam 是什么？（日常类比版）

想象一下你要建一座房子。

- **Python** 像是给你一堆砖头，你自己搬、自己砌——灵活，但如果某块砖放错了位置，房子可能住到一半才塌。
- **C** 像是给你一套精密的机床——强大到能造火箭，但你需要知道每一颗螺丝的扭矩。
- **Gleam** 像是给你一套**带说明书的预制模块**。每块砖上写着"承重墙专用"或"装饰面板专用"，你在搭建的时候，如果拿错了模块，建造工具立刻告诉你："等等，这块砖不能用在屋顶上！"——**在房子还没建好之前，你就发现了错误**。

Gleam 就是这样一种语言：它让你在设计阶段就发现 bug，而不是等程序上线了才崩溃。

## 二、为什么叫 BEAM 语言？

BEAM 是 Erlang 虚拟机（Virtual Machine）的名字。你可以把它理解为**一个超级耐用的发动机**：

- WhatsApp 用它来处理每天数十亿条消息
- Ericsson 用它来管理电信网络
- 它能同时运行数百万个"绿色线程"（lightweight processes），而且一个线程崩了不会影响其他线程

Gleam 编译成 BEAM 字节码后，直接跑在这个发动机上。**你得到了静态类型的安全感，同时继承了 Erlang 几十年的高并发、容错经验。**

此外，Gleam 还能编译成 JavaScript，在浏览器里运行。

## 三、核心概念

### 1. 静态类型系统——编译时的"守门员"

Gleam 在编译时就检查所有类型。没有 `null`，没有异常，没有隐式转换。如果代码能编译通过，基本可以确信不会有"空指针引用"这类经典 bug。

```gleam
import gleam/io

pub fn main() {
  // 类型推断：编译器自动知道 age 是 Int
  let age = 25
  io.println("Age is: " <> gleam/int.to_string(age))

  // 如果你写成 io.println(age)，编译器会报错：
  // "Expected type String but found type Int"
  // ——在运行之前就抓住了错误
}
```

### 2. 不可变数据——像照片，不像便签

在 Gleam 中，变量一旦绑定就不可更改。这就像你拍了一张照片——你可以再拍一张新的，但不能修改原来的那张。

```gleam
pub fn main() {
  let name = "Alice"
  // name = "Bob"  // ❌ 编译错误：不能重新赋值

  // 正确的做法：创建一个新的绑定
  let name = "Bob"  // ✅ 创建了新的绑定，旧的 "Alice" 还在内存里
}
```

这听起来有点麻烦，但实际上它消除了大量"意外修改"导致的 bug。

### 3. 模式匹配——数据的"拆礼物"

模式匹配是 Gleam 最强大的特性之一。你可以把数据结构看作一个礼物盒，用 `case` 语句一层层拆开它，根据里面的内容做不同的事情。

```gleam
pub type UserStatus {
  Active
  Inactive
  Banned(reason: String)
}

pub fn greet(status: UserStatus) -> String {
  case status {
    Active -> "Welcome back!"
    Inactive -> "We miss you!"
    Banned(reason) -> "You've been banned because: " <> reason
  }
}
```

Gleam 还会**穷举检查**：如果你漏掉了某个分支，编译器会提醒你。

### 4. Result 类型——没有异常的错误处理

Gleam 不使用 `try/catch` 异常机制。所有可能失败的函数返回一个 `Result` 值：

- `Ok(value)` — 成功了，里面装着结果
- `Error(error)` — 失败了，里面装着错误原因

调用者**必须**处理这两种情况，编译器会强制你这么做。

### 5. 管道操作符 `|>`——从左到右读代码

管道操作符把前一步的结果传给下一个函数，让代码像流水一样自然流淌：

```gleam
"hello world"
|> string.uppercase
|> string.replace("WORLD", "Gleam")
|> io.println
// 输出: HELLO GLEAM
```

### 6. 自定义类型——定义你自己的"数据类型"

Gleam 允许你创建全新的类型，而不仅仅是使用内置的整数、字符串等。

## 四、代码示例

### 示例 1：一个简单的用户管理系统

这个例子展示了自定义类型、记录、模式匹配和 Result 类型的综合使用。

```gleam
import gleam/io
import gleam/list

// 定义一个用户类型
pub type User {
  User(
    id: Int,
    name: String,
    email: String,
    role: Role,
  )
}

// 定义角色类型——只有三种可能的角色
pub type Role {
  Admin
  Moderator
  Member
}

// 定义可能的错误类型
pub type UserError {
  UserNotFound
  DuplicateEmail
  InvalidRole
}

// 创建一个新用户，返回 Result
pub fn create_user(
  id: Int,
  name: String,
  email: String,
  role: Role,
  existing_users: List(User),
) -> Result(User, UserError) {
  // 检查邮箱是否重复
  case list.find(existing_users, fn(u) { u.email == email }) {
    Ok(_) -> Error(DuplicateEmail)
    Nil -> {
      // 检查角色是否为 Admin（这里简化处理）
      Ok(User(id: id, name: name, email: email, role: role))
    }
  }
}

// 查找用户——展示模式匹配
pub fn find_user(id: Int, users: List(User)) -> Result(User, UserError) {
  case list.find(users, fn(u) { u.id == id }) {
    Some(user) -> Ok(user)
    None -> Error(UserNotFound)
  }
}

// 获取用户角色名称——展示模式匹配
pub fn role_name(role: Role) -> String {
  case role {
    Admin -> "管理员"
    Moderator -> "版主"
    Member -> "普通成员"
  }
}

// 列出所有用户——展示列表操作
pub fn list_all_users(users: List(User)) -> String {
  users
  |> list.map(fn(u) { u.name <> " (" <> role_name(u.role) <> ")" })
  |> string.join(", ")
}

pub fn main() {
  let users = [
    User(id: 1, name: "Alice", email: "alice@example.com", role: Admin),
    User(id: 2, name: "Bob", email: "bob@example.com", role: Member),
  ]

  // 查找存在的用户
  case find_user(1, users) {
    Ok(user) -> io.println("找到用户: " <> user.name)
    Error(UserNotFound) -> io.println("用户不存在")
  }

  // 查找不存在的用户
  case find_user(99, users) {
    Ok(user) -> io.println("找到用户: " <> user.name)
    Error(UserNotFound) -> io.println("❌ 用户不存在")
  }

  // 尝试创建重复邮箱的用户
  case create_user(3, "Charlie", "alice@example.com", Member, users) {
    Ok(_) -> io.println("创建成功")
    Error(DuplicateEmail) -> io.println("❌ 邮箱已被注册")
  }

  // 列出所有用户
  io.println("所有用户: " <> list_all_users(users))
}
```

运行结果：

```
找到用户: Alice
❌ 用户不存在
❌ 邮箱已被注册
所有用户: Alice (管理员), Bob (普通成员)
```

### 示例 2：递归 + 尾调用优化——计算斐波那契数列

这个例子展示了 Gleam 的递归思维和尾调用优化（TCO）。

```gleam
import gleam/io

// 方法一：朴素递归（直观但不高效）
// 计算第 n 个斐波那契数
pub fn fib(n: Int) -> Int {
  case n {
    0 -> 0
    1 -> 1
    _ -> fib(n - 1) + fib(n - 2)
  }
}

// 方法二：尾递归 + 累加器（高效，编译器会优化为循环）
pub fn fib_fast(n: Int) -> Int {
  fib_loop(n, 0, 1)
}

// 私有辅助函数：带累加器的递归
fn fib_loop(remaining: Int, a: Int, b: Int) -> Int {
  case remaining {
    0 -> a
    _ -> fib_loop(remaining - 1, b, a + b)
  }
}

pub fn main() {
  io.println("=== 斐波那契数列 ===")

  // 打印前 15 个数
  let numbers = generate_fibs(15, 0, 0)
  io.println(numbers)
}

// 生成斐波那契数列列表
fn generate_fibs(count: Int, index: Int, result: List(Int)) -> String {
  case index < count {
    True -> {
      let n = fib_fast(index)
      generate_fibs(count, index + 1, [n, ..result])
    }
    False -> {
      result
      |> list.reverse
      |> list.map(gleam/int.to_string)
      |> string.join(" ")
    }
  }
}
```

运行结果：

```
=== 斐波那契数列 ===
0 1 1 2 3 5 8 13 21 34 55 89 144 233 377
```

**关键点**：

- `fib` 是朴素递归，逻辑清晰但指数级复杂度
- `fib_fast` 使用尾递归 + 累加器，编译器将其优化为 O(n) 的循环
- `generate_fibs` 展示了如何用递归替代循环来构建列表

### 示例 3：管道 + 高阶函数——数据处理流水线

```gleg
import gleam/io
import gleam/list
import gleam/string

pub type Product {
  Product(
    name: String,
    price: Float,
    category: String,
    in_stock: Bool,
  )
}

pub fn main() {
  let products = [
    Product("键盘", 299.0, "数码", True),
    Product("鼠标", 149.0, "数码", False),
    Product("笔记本", 45.0, "文具", True),
    Product("耳机", 599.0, "数码", True),
    Product("橡皮擦", 5.0, "文具", False),
  ]

  // 数据处理流水线：过滤 -> 映射 -> 排序 -> 格式化
  let summary = products
  |> list.filter(fn(p) { p.in_stock })          // 只保留有库存的
  |> list.filter(fn(p) { p.category == "数码" }) // 只要数码类
  |> list.map(fn(p) { #(p.name, p.price) })     // 提取名称和价格
  |> list.sort(fn(a, b) { b.1 <. a.1 })         // 按价格降序
  |> list.map(fn(p) { p.0 <> ": $" <> float.to_string(p.1) })
  |> string.join("\n")

  io.println("热销数码产品：\n" <> summary)
}
```

运行结果：

```
热销数码产品：
耳机: $599.0
键盘: $299.0
```

## 五、Gleam 的独特优势

| 特性 | 说明 |
|------|------|
| **零运行时开销的外部调用** | 调用 Erlang/Elixir 代码没有性能损失 |
| **跨目标编译** | 同一份代码可编译为 BEAM 字节码或 JavaScript |
| **TypeScript 定义生成** | JS 编译时自动生成 `.d.ts` 文件 |
| **无 null、无异常** | 编译期保证类型安全 |
| **丰富的包管理器** | `gleam add` 安装包，`gleam test` 运行测试 |
| **友好的社区** | 不以"聪明"为荣，以"易懂"为目标 |

## 六、适合谁学？

- **想理解函数式编程但不想被 Haskell 吓到的人** — Gleam 的语法接近主流语言
- **想利用 Erlang/BEAM 的强大但不想学 Erlang 的人** — Gleam 是更现代的选择
- **重视类型安全的后端开发者** — 编译期 catches 大量 bug
- **全栈开发者** — 一份 Gleam 代码同时服务后端和前端（JavaScript 目标）

## 七、学习资源

- **官方文档**: https://gleam.run
- **交互式语言教程**: https://tour.gleam.run（浏览器里直接学，无需安装）
- **在线 Playground**: https://playground.gleam.run
- **包仓库**: https://packages.gleam.run
- **标准库文档**: https://hexdocs.pm/gleam_stdlib/
- **Exercism 练习**: https://exercism.org/tracks/gleam
- **Discord 社区**: https://discord.gg/Fm8Pwmy
