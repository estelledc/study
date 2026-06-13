---
title: "Swift：一门为系统编程而生的类型安全语言"
来源: https://swift.org/documentation/
日期: 2026-06-13
分类: 编程语言
子分类: pl-compilers
provenance: pipeline-v3
---

## 是什么

**Swift** 是 Apple 在 2014 年 WWDC 上发布的一门**通用、现代、类型安全**的编程语言。它的设计目标是：让新手容易上手，让专家感到强大——同时具备 C 语言级别的系统编程能力。

日常类比：**如果说 C 语言是手动挡赛车（给你方向盘、油门、离合器的全部控制权，但也随时可能熄火），Swift 就是带 ABS + 牵引力控制的自动挡赛车——你依然能开得飞快，但系统替你兜住了最常见的翻车方式。**

Swift 从设计之初就强调三件事：

1. **安全**：变量必须先初始化才能用，数组越界会报错，内存自动管理——把"显而易见的错误"变成"编译不过的错误"。
2. **快速**：编译性能和运行性能对标 C 系列语言，零开销抽象——安全不牺牲速度。
3. **现代语法**：可选类型（optional）、模式匹配、闭包、泛型、函数式编程模式（map/filter），让代码可读且不易出错。

## 为什么重要

不理解 Swift，下面这些事都没法解释：

- 为什么 Apple 平台（iOS / macOS / watchOS / tvOS）的所有新 App 几乎都用 Swift 重写
- 为什么 Linux 服务器端也开始用 Swift 构建高性能网络服务
- 为什么 Swift 成为第一个"从第一天起就开源"的现代系统级语言（2015 年 Apache 2.0 许可）
- 为什么 Apple 把 TrueType 字体 hinting 解释器从 C 重写为 Swift，还快了 13%
- 为什么 Swift 6 引入严格的并发检查（complete concurrency checking）——让数据竞争在编译期被捕获

一句话：**Swift 证明了"安全"和"系统编程性能"不是互斥的。**

## 核心概念

### 概念 1：可选类型（Optionals）—— 消灭 nil 崩溃

在 C / Java 里，一个指针或引用默认可以是 `NULL` / `null`，你随时可能忘记检查就解引用，导致运行时崩溃。Swift 的做法是：**普通变量绝不可能是 nil**，只有显式声明为可选类型的变量才能"为空"。

```swift
// 普通变量：必须有值
let name: String = "Jason"
// name = nil   // ❌ 编译报错：Cannot assign to non-optional value

// 可选变量：可以没有值（等于 nil）
let nickname: String? = nil
// nickname = "jay"  // ✅ 可以重新赋值
```

可选类型用 `?` 标记。编译器强制你在使用前**安全地 unwrap**：

```swift
let nickname: String? = "jay"

// 方式一：可选绑定（最常用）
if let name = nickname {
    print("昵称是 \(name)")   // 这里 name 已经是 String，不是 String?
} else {
    print("没有昵称")
}

// 方式二：nil 合并运算符 ??
let displayName = nickname ?? "匿名用户"
// 如果 nickname 是 nil，就用 "匿名用户" 代替
```

类比：**可选类型就像快递包裹上贴了"内有易碎品"的标签。你拿到时必须先拆开确认（unwrap），不能直接当普通包裹扔——编译器逼着你养成检查的习惯。**

### 概念 2：值类型 vs 引用类型

Swift 有两种核心类型：

- **值类型（struct / enum）**：复制时拷贝整个数据，互不影响
- **引用类型（class）**：复制时只拷贝引用（指针），指向同一份数据

```swift
// struct = 值类型
struct Point {
    var x: Int
    var y: Int
}

var p1 = Point(x: 1, y: 2)
var p2 = p1          // p2 是 p1 的一份完整副本
p2.x = 100           // 改 p2 不影响 p1
print(p1.x)          // 输出 1（不受影响）

// class = 引用类型
class Person {
    var name: String
    init(name: String) { self.name = name }
}

var alice = Person(name: "Alice")
var bob = alice      // bob 和 alice 指向同一个人
bob.name = "Bob"
print(alice.name)    // 输出 Bob（被改了）
```

类比：**struct 像复印文件——复印件改了原文不动；class 像共享 Google 文档——任何人改了，大家都看到新内容。**

### 概念 3：协议（Protocol）—— Swift 的"接口"

协议定义了"一组能力"，任何类型只要实现了这些能力，就 conform（符合）该协议：

```swift
protocol Describable {
    var description: String { get }
}

struct Circle: Describable {
    let radius: Double
    var description: String {
        return "圆形，半径 \(radius)"
    }
}

class Rectangle: Describable {
    let width: Double
    let height: Double
    var description: String {
        return "矩形 \(width)×\(height)"
    }
}

// 协议类型作为函数参数
func printDescription(_ item: Describable) {
    print(item.description)
}

printDescription(Circle(radius: 5))     // 圆形，半径 5.0
printDescription(Rectangle(width: 3, height: 4))  // 矩形 3.0×4.0
```

类比：**协议像驾照上的"准驾车型"。C 照能开小轿车，A 照能开大巴。不管你是开丰田还是宝马，只要持有对应驾照（符合协议），就能上路（被统一对待）。**

## 代码示例

### 示例 1：完整的"用户管理系统"——展示 struct、可选类型、协议

```swift
// 1. 定义用户结构体（值类型，线程安全）
struct User {
    let id: Int
    var name: String
    var email: String?       // 邮箱是可选的——新用户可能还没填

    // 计算属性：根据可选邮箱给出不同显示
    var displayName: String {
        return email != nil ? "\(name) (\(email!))" : name
    }
}

// 2. 定义存储协议
protocol UserRepository {
    func save(_ user: User)
    func findById(_ id: Int) -> User?
    func all() -> [User]
}

// 3. 内存中的简单实现
class InMemoryUserStore: UserRepository {
    private var users: [Int: User] = [:]
    private var nextId = 1

    func save(_ user: User) {
        users[user.id] = user
    }

    func findById(_ id: Int) -> User? {
        return users[id]   // 返回可选类型，找不到就是 nil
    }

    func all() -> [User] {
        return Array(users.values)
    }
}

// 4. 使用
let store = InMemoryUserStore()
let newUser = User(id: 1, name: "Jason", email: "jason@example.com")
store.save(newUser)

if let found = store.findById(1) {
    print(found.displayName)  // Jason (jason@example.com)
}

if let notFound = store.findById(999) {
    print(notFound.displayName)
} else {
    print("用户不存在")        // 这行会执行
}
```

**逐段解释**：

- `User` 用 `struct`，因为用户数据应该是值语义——传给别人的时候不会意外被改
- `email: String?` 表示邮箱可能没有，这是可选类型的典型用法
- `findById` 返回 `User?`，因为按 ID 查找可能找不到人
- `InMemoryUserStore` 符合 `UserRepository` 协议，实现了三个方法
- `if let` 安全 unwrap，避免了空指针崩溃

### 示例 2：函数式编程 + 模式匹配——展示 map/filter/guard

```swift
// 模拟一段电商订单数据
struct Order {
    let id: Int
    let product: String
    let price: Double
    let status: String   // "pending" / "shipped" / "delivered" / "cancelled"
}

let orders = [
    Order(id: 1, product: "键盘", price: 599.0, status: "delivered"),
    Order(id: 2, product: "鼠标", price: 299.0, status: "pending"),
    Order(id: 3, product: "显示器", price: 2499.0, status: "shipped"),
    Order(id: 4, product: "耳机", price: 0.0, status: "cancelled"),
]

// 1. filter：只保留已发货的订单
let shippedOrders = orders.filter { $0.status == "shipped" }
print(shippedOrders.map { $0.product })  // ["显示器"]

// 2. map + 可选类型：计算总收货金额（排除 cancelled）
let totalDelivered = orders
    .filter { $0.status == "delivered" }
    .map { $0.price }
    .reduce(0, +)
print(totalDelivered)  // 599.0

// 3. guard：函数入口处提前退出
func processOrder(_ order: Order) -> String {
    guard order.status != "cancelled" else {
        return "订单 \(order.id) 已取消"
    }
    guard order.price > 0 else {
        return "订单 \(order.id) 价格为 0"
    }
    return "处理订单 \(order.id)：\(order.product)，¥\(order.price)"
}

for order in orders {
    print(processOrder(order))
}
```

**逐段解释**：

- `filter` 像筛子，只留下符合条件的元素
- `map` 像传送带，每个元素经过变换后输出新的值
- `reduce` 像收银员，把所有价格加到一起
- `$0` 是 Swift 的简写语法，代表闭包的第一个参数
- `guard` 像门卫——条件不满足就提前 return，满足时才继续往下走

### 示例 3：错误处理——Swift 内置的错误机制

```swift
// 定义业务错误
enum DivideError: Error {
    case divisorIsZero
    case invalidInput(String)
}

func divide(_ a: Double, _ b: Double) throws -> Double {
    guard b != 0 else {
        throw DivideError.divisorIsZero
    }
    return a / b
}

// 调用方必须处理错误
do {
    let result = try divide(10, 0)
    print(result)
} catch DivideError.divisorIsZero {
    print("除数不能为零")
} catch {
    print("未知错误: \(error)")
}
```

类比：**`throws` + `do-catch` 就像做饭时的"防烫手套"。函数声明 `throws` 就是在说"我会烫到你"，调用方用 `try` + `catch` 就是戴上手套——不戴手套（不处理错误）就不让做。**

## 踩过的坑

1. **`var` vs `let` 选错**：Swift 默认鼓励用 `let`（常量），除非确实需要修改。很多人一开始用 `var` 太多，后面发现本该是 `let` 的地方被不小心改了。

2. **可选类型 unwrap 地狱**：多层嵌套的 `if let` 或 `??` 会让代码变得难读。解法是用 `guard let` 提前退出，或用 `flatMap` / `compactMap` 链式处理。

3. **struct 传参的拷贝成本**：struct 是值类型，大 struct 传参会完整拷贝。如果结构体包含大量数据，应该改用 class，或者传引用 `inout`。

4. **ARC 不是 GC**：Swift 用 ARC（自动引用计数）管理内存，不是垃圾回收。循环引用（两个 class 互相持有）会导致内存泄漏——需要用 `weak` / `unowned` 打破循环。

5. **Swift 6 严格并发**：Swift 6 引入了数据竞争检测，旧代码中大量 `@objc` 和未标注 `Sendable` 的类型会报编译错误。迁移成本不小。

## 适用 vs 不适用场景

**适用**：

- iOS / macOS / watchOS / tvOS 原生 App 开发——Apple 的首选语言
- 跨平台服务端——Swift on Server 生态成熟（Vapor / Kitura 等框架）
- 系统工具脚本——语法现代、类型安全，替代 Python 脚本
- 嵌入式 / 边缘计算——Swift 可以编译为独立二进制，无运行时依赖

**不适用**：

- 网页前端——JavaScript / TypeScript 仍是浏览器唯一选择
- 深度学习训练——Python 生态（PyTorch / TensorFlow）无可替代
- 需要大量 C 互操作的遗留项目——虽然 Swift 能桥接 C，但不如 C++ 自然
- 纯学术研究语言——Swift 是工程语言，不是新语言特性的试验田

## 历史小故事（可跳过）

- **2010 年**：Chris Lattner（也是 LLVM 创始人）在 Apple 秘密启动 Swift 项目，目标替换 Objective-C。
- **2012 年**：Swift 原型仅用 6 个月完成——得益于 LLVM 已经成熟的编译基础设施。
- **2014 年 6 月**：WWDC 2014 上正式发布。Apple 给了开发者 6 个月过渡期，Swift 1.0 在同年秋季随 Xcode 6 发布。
- **2015 年 12 月**：Swift 开源，Apache 2.0 许可。编译器、标准库、包管理器全部开放。
- **2016 年**：Swift 进入 Stack Overflow 最受欢迎语言 Top 10。
- **2021 年**：Swift 5.5 引入 async/await，正式支持并发编程。
- **2023 年**：Swift 6.0 发布，引入严格的并发检查和默认不可变性。
- **2026 年**：Apple 将 TrueType hinting 解释器从 C 重写为 Swift，性能提升 13%——证明了 Swift 在底层系统编程中的竞争力。

## 学到什么

1. **安全是设计出来的，不是测出来的**：Swift 把"最常见的那些 bug"变成"编译不过"，而不是"上线后崩溃"。
2. **类型系统不是束缚，是护栏**：可选类型、泛型、协议——这些看似复杂的东西，最终让你写的代码更少、更不容易出错。
3. **现代语言可以兼顾两端**：Swift 同时是"新手友好的教学语言"和"系统级高性能语言"——这两者以前被认为不可兼得。
4. **基础设施决定语言命运**：Swift 能快速成功，很大程度上是因为 LLVM 已经铺好了路。没有 LLVM，Swift 不可能 6 个月出原型。
5. **开源加速生态**：2015 年开源后，Swift 迅速扩展到 Linux / Windows / 服务器端，社区贡献让语言迭代速度远超预期。

## 延伸阅读

- 官方文档：[The Swift Programming Language (TSPL)](https://docs.swift.org/swift-book/)（Swift 官方"圣经"，从入门到高级全覆盖）
- 关于 Swift：[swift.org/about](https://swift.org/about/)（Swift 特性概览、平台支持、开源治理）
- Swift Evolution：[swift.org/swift-evolution](https://swift.org/swift-evolution/)（Swift 语言演进的提案流程）
- Swift 6 迁移指南：[swift.org/documentation](https://swift.org/documentation/)（严格并发迁移的实际操作）
- [[llvm]] —— Swift 的编译基础设施，理解 LLVM 是理解 Swift 的关键
- [[vellvm]] —— Swift 也使用 LLVM IR，Vellvm 的形式化语义同样适用于 Swift

## 关联

- [[llvm]] —— Swift 编译器的后端，Swift 源码最终编译为 LLVM IR
- [[vellvm]] —— LLVM IR 的形式化语义，Swift 也受其约束
- [[local-type-inference]] —— Swift 的类型推断与 HM 类型系统一脉相承
- [[refinement-types]] —— Swift 的可选类型本质上是一种 refinement type
- [[standard-ml]] —— Swift 的很多语法灵感来自 ML 系语言（模式匹配、代数数据类型）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[llvm]] —— LLVM 是 Swift 的编译后端
- [[vellvm]] —— Vellvm 形式化的 LLVM IR 同样支撑 Swift 编译
