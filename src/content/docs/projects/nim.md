---
title: Nim — Python 风的系统语言
来源: https://github.com/nim-lang/Nim
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
难度: 初级
provenance: pipeline-v3
---

## 什么是 Nim

Nim 是一门静态类型的编译型系统编程语言。它的设计哲学可以浓缩为一句话：**写出 Python 一样简洁的代码，跑出 C 一样快的速度。**

Nim 的代码最终会被编译成 C、C++、Objective-C 或 JavaScript 代码，然后交给你电脑上的 C 编译器去编译。也就是说，Nim 本身是一个"编译器编译器"——它把你写的高级语言转成底层语言，再由底层语言的工具链产出最终的可执行文件。

## 日常类比：翻译官与建筑师

想象你要盖一栋房子。C 语言就像你自己搬砖和水泥——完全掌控每一块材料，但要操心每一个细节。Nim 就像你雇了一位翻译官，你用简单明了的语言告诉他你的想法，翻译官帮你写成精确的建筑图纸，然后交给施工队（C 编译器）去盖。

你不再直接和砖块打交道，但你盖出来的房子和 C 程序员盖的一模一样结实，而且因为你用的高级语言更简洁，同样的工作量你写的指令更少。

## 核心概念一：缩进敏感 + Python 式语法

Nim 最直观的"Python 味"体现在语法上。它不用大括号 `{}` 来划分代码块，而是用缩进来区分。看下面的 Nim 代码：

```nim
# hello.nim - 最简单的 Nim 程序
import strformat

proc greet(name: string) =
  echo &"你好，{name}！"

greet("世界")
```

这段代码的含义非常简单：

- `import strformat` — 引入字符串格式化模块，类似 Python 的 `import ...`
- `proc greet(name: string) =` — 定义一个叫 `greet` 的函数，它接收一个字符串参数
- `echo &"你好，{name}！"` — 打印格式化的字符串，`&` 前缀表示字符串内可以嵌入变量（类似 Python 的 f-string）
- `greet("世界")` — 调用函数

注意 `=` 后面直接跟着函数体，没有 `begin` / `end`，没有 `()` 包裹的参数（调用时可以省略），没有大括号。这和 Python 的风格几乎一致。

## 核心概念二：类型推导 + 显式声明并存

Nim 支持类型推导，但也允许你显式声明类型。这是为了兼顾可读性和安全性。

```nim
# 类型推导 —— Nim 自己知道类型
var name = "Jason"        # name 是 string 类型
var age = 28              # age 是 int 类型

# 显式类型声明 —— 告诉编译器你要什么类型
var score: float = 95.5   # 明确指定为浮点数
```

`var` 声明可变变量，`let` 声明不可变变量（类似 Python 中没有直接对应、但类似 const）：

```nim
# let 是不可变的，编译时如果尝试修改会报错
let maxScore = 100
echo maxScore  # 100
# maxScore = 99  # 编译错误！let 变量不能被修改
```

## 核心概念三：过程（proc）和闭包

Nim 中的函数叫 `proc`（procedure 的缩写）。proc 可以接受命名参数，可以有多返回值，还可以通过 `proc` 内部再定义 `proc` 来创建闭包。

```nim
import math

# 多返回值 —— 一个 proc 可以返回多个值
proc divide(a, b: int): (int, int) =
  (a div b, a mod b)

let (quotient, remainder) = divide(17, 5)
echo &"商: {quotient}, 余数: {remainder}"  # 商: 3, 余数: 2

# 闭包 —— proc 内部定义 proc
proc makeGreeter(prefix: string): proc (name: string): string =
  # 这是一个返回 proc 的 proc
  result = proc (name: string): string =
    &"{prefix}{name}"
```

`result` 是 Nim 的内置变量，proc 最后表达式的值会自动成为返回值（类似 Ruby）。

## 核心概念四：集合与迭代

Nim 的集合类型和 Python 有很多相似之处，但底层实现是编译期的静态结构。

```nim
# Seq（序列）—— 类似 Python 的 list
var numbers = @[1, 2, 3, 4, 5]

# 迭代
for n in numbers:
  echo n * 2  # 输出 2, 4, 6, 8, 10

# 列表推导风格 —— Nim 用 toSeq + 模板
import sequtils
var doubled = numbers.mapIt(it * 2)
echo doubled  # @[2, 4, 6, 8, 10]

# 字符串操作类似 Python
var text = "Nim 是一门很棒的语言"
echo text[0]          # N （索引访问）
echo text.len          # 17 （长度）
echo "Nim" in text     # false （成员检查）
```

## 核心概念五：宏（Macro）和编译期元编程

这是 Nim 真正的杀手锏。Nim 的宏可以在编译期直接操作代码的抽象语法树（AST），这意味着你可以**在编译期生成、修改甚至替换代码**。这和 Python 的装饰器类似，但更强大，因为它操作的是代码树结构本身。

```nim
# 一个简单的宏：自动为 proc 打印调试信息
import std/macros

macro debugImpl*(body: untyped): untyped =
  # 这段宏代码在编译期运行
  # 它接收一段代码，返回一段修改后的代码
  result = newNimNode(nnkStmtList)
  # 插入打印语句
  let printNode = newCall("echo", newLit("进入函数"))
  result.add printNode
  # 添加原始函数体
  result.add body

# 使用宏
debugImpl:
  echo "函数实际在做什么"

# 展开后相当于：
# echo "进入函数"
# echo "函数实际在做什么"
```

Nim 的宏和 Python 的装饰器相比，有两点关键区别：
1. 宏在编译期运行，装饰器在运行时运行 —— 宏的开销为零
2. 宏操作的是代码结构（AST），而不是函数对象 —— 这意味着可以生成全新代码

## 核心概念六：内存管理（垃圾回收 + 引用计数）

Nim 默认使用垃圾回收器（Garbage Collector）来自动管理内存，这和 Python 一模一样。但 Nim 也支持手动内存管理，你可以根据场景选择：

```nim
# 默认方式 —— 垃圾回收（GC），和 Python 一样
var s = newString(10)
s[0] = 'A'
# 程序结束或超出作用域时，GC 自动回收

# 也可以关闭 GC，用引用计数（ARC/ORC）
# 编译时加参数: nim c --mm:arc myprogram.nim

# 或者完全手动管理（类似 C）
# 编译时加参数: nim c --mm:none myprogram.nim
```

## 核心概念七：C 语言互操作性

Nim 可以直接调用 C 代码，无需任何包装层。因为 Nim 本身就生成 C 代码，它和 C 的互操作是"原生级别"的。

```nim
# 直接导入 C 的函数
{.passL: "-lm".}  # 链接数学库

proc sqrt(x: cfloat): cfloat {.importc: "sqrt", header: "<math.h>".}

echo sqrt(16.0)  # 4.0
```

这意味你可以用 Nim 写高级逻辑，用 C 写性能敏感的部分，两者无缝协作。

## 编译与运行

Nim 的工作流程非常直接：

```
nim c hello.nim    # 编译成 C 代码并调用 C 编译器
nim r hello.nim    # 编译并立即运行（类似 Python 的 python hello.py）
nim js hello.nim   # 编译成 JavaScript
```

编译后的产物是一个独立的可执行文件，没有任何运行时依赖，不需要像 Java 那样装 JVM，也不像 Python 那样需要解释器。

## Nim 和 Python 的对比总结

| 维度 | Python | Nim |
|------|--------|-----|
| 类型 | 动态类型 | 静态类型（编译期检查） |
| 执行 | 解释执行 | 编译成机器码 |
| 速度 | 较慢（GIL 限制） | 和 C 接近 |
| 语法 | 缩进敏感 | 缩进敏感 |
| 内存 | 自动垃圾回收 | 垃圾回收 / 引用计数 / 手动 |
| 互操作 | CPython C API | 原生 C 互操作 |
| 元编程 | 装饰器、反射 | 宏（AST 操作） |
| 输出 | 需要 Python 运行时 | 独立可执行文件 |

## 学习 Nim 的价值

对于理解编程语言的底层原理，Nim 是一个绝佳的桥梁。它让你看到：

1. 静态类型系统如何在不牺牲表达力的前提下保证安全
2. 编译期元编程如何消除运行时的样板代码
3. 一门"高级语法"的语言如何在底层和 C 一样高效
4. 垃圾回收器和手动内存管理各自适合什么场景

读完这篇之后，如果你想继续探索，建议用 `nim r --eval:"echo 1"` 直接在命令行体验 Nim，然后用 `nim c hello.nim && ./hello` 走一遍完整的编译运行流程。
