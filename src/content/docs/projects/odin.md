---
title: Odin — Pascal 风系统语言
来源: https://github.com/odin-lang/Odin
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Odin — Pascal 风系统语言

## 一句话概括

Odin 是一个注重**显式**和**数据导向**的系统级编程语言，语法有 Pascal 的影子（冒号定义类型、双冒号声明常量/函数、花括号块），目标是给 C/C++ 一个更干净的选择。

> 项目地址：https://github.com/odin-lang/Odin （Star 10k+，2016 年开仓）

---

## 从日常类比开始

想象你要组装一个乐高模型。

- **C 语言**就像给你一堆散落的积木块——你可以拼出任何东西，但也可能拼歪了没人提醒你。
- **Odin** 像是一套带说明书的乐高：每块积木有明确的位置（类型），说明书（编译器）会告诉你"这块放不下，你拿错了"。它不阻止你造东西，但会把模糊地带清掉。

Odin 的设计哲学可以浓缩成四个字：**明确胜过聪明**。它不希望你写"看起来聪明但看不懂"的代码。

---

## 核心概念

### 1. 类型声明：`:` 而非 `=`

在大多数语言中，变量赋值用 `=`。Odin 用 `:=`（其实是 `:` + `=` 两个 token）来声明并赋值，用 `=` 做纯赋值：

```odin
x: int = 10       // 声明 x 为 int 类型，赋值为 10
x = 20             // 把 x 改成 20（不能改类型）
y := 30            // 简写：声明并赋值，类型自动推导
```

### 2. 常量与过程：`::`

双冒号 `::` 用于定义**不会改变**的东西——常量、类型、过程（Odin 对"函数"的叫法）：

```odin
PI :: 3.14159          // 常量
max_length :: 100      // 常量

main :: proc() { ... } // 过程/函数
```

### 3. 过程（Proc）

Odin 的函数叫 `proc`，用 `:: proc()` 定义，参数和返回值类型用冒号声明：

```odin
add :: proc(a, b: int) -> int {
    return a + b
}
```

注意 `a, b: int` 的写法——多个参数共享类型时，可以省略中间的类型，简洁很多。

### 4. 包系统

Odin 以**目录**为单位组织代码，每个目录是一个 `package`。程序从 `package main` 的 `main` 过程开始执行：

```odin
package main

import "core:fmt"

main :: proc() {
    fmt.println("Hellope!")
}
```

`core:fmt` 中的 `core:` 前缀告诉编译器去标准库找。没有前缀的话，编译器会从相对目录找。

### 5. 枚举（Enum）

Odin 的枚举是**强类型**的，不能和整数混用：

```odin
Color :: enum {
    Red,
    Green,
    Blue,
}

c := Color.Red
```

### 6. 结构体（Struct）

结构体字段默认**公开**，用 `@(private)` 标记私有：

```odin
Person :: struct {
    name    : string
    age     : int
    @(private)
    secret  : int
}
```

### 7. 唯一循环：`for`

Odin 只有 `for` 一种循环，但用法多样：

```odin
// 经典 for
for i := 0; i < 10; i += 1 {
    fmt.println(i)
}

// 范围迭代
for i in 0..=9 {        // 闭区间 [0, 9]
    fmt.println(i)
}

for i in 0..<10 {        // 半开区间 [0, 10)
    fmt.println(i)
}

// 无限循环
for {
    // 永远执行
}
```

### 8. Switch — 不需要 break

Odin 的 `switch` 选中一个 case 后就自动退出，不需要 `break`。用 `fallthrough` 显式跳到下一个 case：

```odin
switch day {
case 1, 2, 3:
    fmt.println("工作日")
case 4, 5:
    fmt.println("快周末了")
case 6, 7:
    fmt.println("休息日")
case:
    fmt.println("无效的天数")
}
```

### 9. Defer — 延迟执行

`defer` 在作用域结束时执行，类似 Go：

```odin
main :: proc() {
    file := open_file("data.txt")
    defer close_file(file)    // 函数返回时自动关闭

    // ... 使用 file ...

    return   // defer 在这里自动触发
}
```

### 10. 强类型 + 无隐式转换

Odin 要求类型转换必须显式写出，不做隐式转换：

```odin
x: int = 42
y: f64 = f64(x)    // 必须显式转换，不能 y = x
z: u32 = u32(y)    // 同上
```

---

## 代码示例

### 示例一：FizzBuzz（涵盖循环、switch、字符串）

```odin
package main

import "core:fmt"

main :: proc() {
    for i := 1; i <= 100; i += 1 {
        switch {
        case i % 15 == 0:
            fmt.println("FizzBuzz")
        case i % 3 == 0:
            fmt.println("Fizz")
        case i % 5 == 0:
            fmt.println("Buzz")
        case:
            fmt.println(i)
        }
    }
}
```

**解读**：这里 `switch` 后面没有条件，等价于 `switch true`。case 里写的是布尔表达式，从上到下匹配，第一个命中就执行并自动退出——不需要 break。

### 示例二：数据结构 + 过程 + 结构体（涵盖 struct、proc、数组、范围迭代）

```odin
package main

import "core:fmt"

// 定义一个向量类型
Vector3 :: struct {
    x, y, z: f32
}

// 向量加法
add_vec :: proc(a, b: Vector3) -> Vector3 {
    return Vector3{
        x: a.x + b.x,
        y: a.y + b.y,
        z: a.z + b.z,
    }
}

// 向量长度
vec_length :: proc(v: Vector3) -> f32 {
    return f32(v.x*v.x + v.y*v.y + v.z*v.z)
}

main :: proc() {
    a := Vector3{x: 1.0, y: 2.0, z: 3.0}
    b := Vector3{x: 4.0, y: 5.0, z: 6.0}

    c := add_vec(a, b)
    fmt.println("a + b = {", c.x, ", ", c.y, ", ", c.z, "}")
    fmt.println("length of c = ", vec_length(c))
}
```

**解读**：
- `Vector3` 是一个结构体类型，有三个 f32（32位浮点数）字段
- `add_vec` 过程接收两个向量，返回它们的和
- `vec_length` 计算向量的模长
- 结构体字面量用 `Vector3{x: 1.0, y: 2.0, z: 3.0}` 语法创建

### 示例三：枚举 + 字符串映射 + 范围迭代

```odin
package main

import "core:fmt"

Day :: enum {
    Mon, Tue, Wed, Thu, Fri, Sat, Sun,
}

day_to_string :: proc(d: Day) -> string {
    switch d {
    case .Mon: return "星期一"
    case .Tue: return "星期二"
    case .Wed: return "星期三"
    case .Thu: return "星期四"
    case .Fri: return "星期五"
    case .Sat: return "星期六"
    case .Sun: return "星期日"
    case:      return "未知"
    }
}

main :: proc() {
    days := [7]Day{.Mon, .Tue, .Wed, .Thu, .Fri, .Sat, .Sun}

    for i in 0..=6 {
        fmt.println(days[i], " = ", day_to_string(days[i]))
    }
}
```

---

## Odin 与其他语言对比

| 特性 | C | Go | Rust | Odin |
|------|---|-----|------|------|
| 类型系统 | 弱（隐式转换） | 静态 | 静态（借用检查） | 静态（显式转换） |
| 垃圾回收 | 无 | 有 | 无 | 无 |
| 函数关键字 | 无 | `func` | `fn` | `proc` |
| 常量声明 | `#define` | `const` | `const` | `::` |
| Switch | 需要 break | 自动退出 | 模式匹配 | 自动退出 |
| 包系统 | 文件级 | 目录级 |  Crate | 目录级 |
| 内存管理 | 手动 | GC | 借用系统 | 手动 + defer |

---

## 为什么学 Odin

1. **学习系统编程的更好入口**：没有 Rust 的借用检查器那么陡峭，但比 C 安全得多
2. **语法直观**：`::` 和 `:` 的区分让"可变 vs 不变"一目了然
3. **数据导向设计**：内置支持数组编程、结构体之数组（SoA），适合游戏引擎和高性能场景
4. **编译快**：相比 C++ 的分钟级编译，Odin 编译几乎是秒级的
5. **社区活跃**：Discord 活跃，2024-2026 年持续发布高质量版本

---

## 进一步学习

- 官方文档：https://odin-lang.org/docs/overview
- 在线示例：https://github.com/odin-lang/examples
- 包文档：https://pkg.odin-lang.org/
- Discord 社区：https://discord.gg/sVBPHEv
- 编译安装：https://odin-lang.org/docs/install

运行代码的方式很简单：

```bash
odin run .          # 编译并运行当前目录
odin build .        # 只编译，不运行
odin run hello.odin -file   # 运行单个文件
```
