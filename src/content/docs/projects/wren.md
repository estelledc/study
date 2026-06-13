---
title: Wren — Bob Nystrom 的小型类语言
来源: https://github.com/wren-lang/wren
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Wren — 一只小巧的鸟，一个精巧的语言

## 1. 这是什么？

想象你手边有三个老朋友：

- Smalltalk 告诉你"万物皆对象"
- Lua 告诉你"小而美也可以很强"
- Erlang 告诉你"并发应该很轻"

Wren 把这三者的灵感揉在一起，用你熟悉的类 JavaScript 语法包起来，就诞生了一个既小又快的类-based 脚本语言。

它的作者 Bob Nystrom 是个老练的语言设计者——他还写了《Crafting Interpreters》（也是《Game Programming Patterns》的作者）。Wren 的虚拟机实现代码不到 4000 个分号，一个下午就能 skim 完。

**一句话定位**：一个嵌入型脚本语言，设计用来被其他应用程序（如游戏引擎、工具链）内嵌使用。

## 2. 核心价值主张

| 特性 | 说明 |
|------|------|
| 小巧 | VM 不到 4000 行代码（以分号计），可读性极高 |
| 快速 | 单遍编译到紧凑字节码，性能与主流动态语言竞争 |
| 类为基础 | 对象模型摆在第一位，不像 Lua 那样特殊 |
| 并发 | 轻量 Fiber（协程），核心执行模型，不是事后补丁 |
| 嵌入友好 | 零依赖 C99 编译，C API 简单 |

## 3. 核心概念拆解

### 3.1 一切都是对象

在 Wren 里，**每个值都是对象**。连 `true` 和 `false` 都是 `Bool` 类的实例，数字是 `Num` 类的实例，字符串是 `String` 类的实例。没有"原始类型"这个概念。

### 3.2 变量与类型

```
var x = 10
var name = "Wren"
var nothing = null
```

Wren 是动态类型语言——变量没有类型，值有类型。用 `var` 声明变量，赋值时确定值的类型。

### 3.3 类与对象

Wren 的类系统是你最熟悉的样子，和 Ruby/Python 类似：

```wren
class Animal {
  construct new(name) {
    _name = name
  }

  greet() {
    System.print("Hi, I'm %(this._name)")
  }
}

var cat = Animal.new("Whiskers")
cat.greet() //> Hi, I'm Whiskers
```

几个要点：
- `construct new(...)` 定义构造函数
- 字段以 `_` 开头，默认是私有的（封装）
- `this` 指当前实例
- 所有构造函数都必须显式声明，没有隐式默认构造

### 3.4 方法重载（按参数数量）

Wren 的方法重载不靠默认参数，而是靠不同的"元数"（arity）：

```wren
class Greeter {
  hello() {
    System.print("Hello!")
  }

  hello(name) {
    System.print("Hello, %(name)!")
  }

  hello(first, last) {
    System.print("Hello, %(first) %(last)!")
  }
}
```

三个 `hello` 是不同的方法——参数数量不同。

### 3.5 继承与 super

```wren
class Bird is Animal {
  construct new(name) {
    super(name)
  }

  fly() {
    System.print("%(_name) spreads its wings!")
  }
}

var eagle = Bird.new("Eagle Eye")
eagle.greet() //> Hi, I'm Eagle Eye
eagle.fly()   //> Eagle Eye spreads its wings!
```

- `is` 关键字声明父类
- `super(...)` 调用父类构造函数
- 默认所有类继承自 `Object`

### 3.6 Fiber 并发

这是 Wren 最独特的卖点。Fiber 不是 OS 线程，而是用户态协程——极其轻量，一个游戏里可以有几千个 Fiber 跑各自的实体。

```wren
var counter = Fiber.new {
  for (i in 1..5) {
    Fiber.yield(i)
  }
}

while (!counter.isDone) {
  System.print(counter.call())
}
```

输出：`1 2 3 4 5`（各一行）

- `Fiber.new { ... }` 创建一个 fiber
- `fiber.call()` 启动或恢复执行
- `Fiber.yield(value)` 挂起并传回值
- `fiber.isDone` 检查是否结束

## 4. 代码示例

### 示例 1：一个完整的类体系

下面是一个展示类、继承、字段、getter 的完整例子：

```wren
class Shape {
  construct new() {
    _color = "white"
  }

  color { _color }

  setColor(value) {
    _color = value
  }

  area() {
    Fiber.print("Unknown shape area")
  }
}

class Circle is Shape {
  construct new(radius) {
    super()
    _radius = radius
  }

  area {
    3.14159 * _radius * _radius
  }
}

class Rectangle is Shape {
  construct new(width, height) {
    super()
    _width = width
    _height = height
  }

  area { _width * _height }
}

var c = Circle.new(5)
c.setColor("red")
System.print("Circle color: %(c.color)")
System.print("Circle area: %(c.area)")

var r = Rectangle.new(4, 6)
System.print("Rectangle area: %(r.area)")
```

输出：
```
Circle color: red
Circle area: 78.53975
Rectangle area: 24
```

关键点：
- `area` 是一个 getter（没有括号）
- 字段 `_` 开头，通过 getter 对外暴露
- `is` 实现继承，`super()` 调用父构造

### 示例 2：Fiber 并发 + 值传递

这是一个更复杂的 Fiber 协作示例：

```wren
// 生产者 fiber：依次产出 1 到 5
var producer = Fiber.new {
  for (i in 1..5) {
    var message = Fiber.yield("item %(i)")
    if (message == "stop") break
  }
  System.print("Producer done")
}

// 消费者：依次消费，直到收到 stop
var received = []
while (!producer.isDone) {
  var item = producer.call()
  System.print("Got: %(item)")
  received.add(item)
  if (received.count >= 4) {
    producer.call("stop")
  }
}

System.print("Received: %(received.join(", "))")
```

输出：
```
Got: item 1
Got: item 2
Got: item 3
Got: item 4
Producer done
Received: item 1, item 2, item 3, item 4
```

关键点：
- `Fiber.yield("item %(i)")` — fiber 产出值给调用者
- `producer.call("stop")` — 调用者传入值，成为 yield 的返回值
- 这是一个"双向通道"：fiber 和调用者可以互相传数据

## 5. 其他值得注意的特性

### 字符串插值

Wren 用 `%(表达式)` 做插值，类似 Python f-string：

```wren
var name = "Wren"
var version = 0.4
System.print("%(name) v%(version)") //> Wren v0.4
```

### 列表和范围

```wren
var fruits = ["apple", "banana", "cherry"]
var nums = 1..5        // 1, 2, 3, 4, 5
var half = 1...5       // 1, 2, 3, 4（不含 5）

nums.each {|n| System.print(n) }
```

### 错误处理

Wren 用 Fiber 来做错误处理（不是 try/catch）——当一个 fiber 出错了，错误会沿着 fiber 调用链冒泡回去。这是一种把错误处理嵌入并发模型的设计选择。

## 6. Wren 适合谁？

- **想做嵌入式脚本语言的人**：Wren 就是你的模板。零依赖、几 KB 的 VM、C API 简洁。
- **想理解语言设计的人**：4000 行分号的代码，比大部分框架的源码都好读。
- **游戏开发者**：轻量 Fiber 天然适合游戏实体，每颗子弹、每个 NPC 都能有自己的 fiber。
- **语言爱好者**：Bob Nystrom 的语言设计哲学值得学习。

## 7. 和 Ruby、Lua 的简单对比

| 特性 | Wren | Ruby | Lua |
|------|------|------|-----|
| 面向对象 | 类为基础 | 类为基础 | 原型（prototype） |
| 并发模型 | Fiber（协程） | Thread/GVL | 无原生协程 |
| 包大小 | VM ~4000 分号 | 数 MB | ~300KB C 代码 |
| 默认封装 | 字段私有 | 无 | 模块级 |
| 错误处理 | Fiber 冒泡 | Exception | pcall |
| 嵌入 | 设计目标 | 非主要目标 | 设计目标 |

## 8. 学习资源

- 官方文档：https://wren.io/
- 在线尝试：https://wren.io/try/
- GitHub：https://github.com/wren-lang/wren
- 作者博客：http://journal.stuffwithstuff.com/
- Discord 社区：https://discord.gg/Kx6PxSX

## 9. 总结

Wren 证明了"小而精"不是空话——一个 4000 分号的语言可以同时做到类为基础、支持并发、性能可观、易于嵌入。如果你正在学习语言设计，或者需要为某个项目找一个嵌入脚本语言，Wren 值得深入研究。

它的核心设计哲学可以归结为一句话：**把简单的事做简单，把复杂的事做优雅**——简单类型通过类来组织，并发通过轻量 fiber 来实现，错误通过 fiber 链冒泡来处理。每一个选择都服务于"嵌入友好"这个终极目标。
