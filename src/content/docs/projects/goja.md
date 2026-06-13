---
title: Goja — 纯 Go 写的 ES5.1 JavaScript 解释器
来源: https://github.com/dop251/goja
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Goja：在 Go 里跑 JavaScript

## 一个日常类比

想象一下：Go 是你家厨房的主厨，JavaScript 是一份从国外寄来的菜谱。

通常有两种做法：
1. 找一台真正的国外烤箱（V8 引擎），把 Go 代码连到那台烤箱上——这要经过复杂的"翻译设备"（cgo），安装也麻烦。
2. 完全自己从零搭建一套烤箱——这就是 Goja 做的事：它用 Go 语言自己写了一个能看懂 JavaScript 的引擎，不需要任何外部依赖。

Goja 就是第二种做法：一个纯 Go 实现的 JavaScript 引擎，不需要 cgo，不需要编译 V8，一个 `go get` 就能用。

---

## 核心概念

### 1. Runtime（运行时）

Runtime 是 Goja 的心脏。它包含了一个完整的 JavaScript 执行环境：变量存储、函数定义、对象、甚至内置的 `Math`、`JSON` 等对象。

你可以把它想象成一个独立的 JavaScript 世界。每个 Runtime 实例是彼此隔离的——一个 Runtime 里的变量，另一个 Runtime 看不见。

> **重要限制**：一个 Runtime 同一时间只能被一个 goroutine 使用。不能多个 goroutine 共享同一个 Runtime。如果需要并发，就创建多个 Runtime 实例。

### 2. Value（值）

JavaScript 里的每个值（数字、字符串、对象、函数……）在 Goja 中都被包装成一个 `Value` 类型。它不是一个普通的 Go 类型，而是 JavaScript 值和 Go 类型之间的桥梁。

从 JS 到 Go：用 `v.Export()`
从 Go 到 JS：用 `runtime.ToValue()`

### 3. 双向调用

Goja 最强大的能力是**让 Go 和 JavaScript 互相调用**：

- 在 Go 代码里写 JavaScript 代码并执行
- 在 JavaScript 代码里调用 Go 函数
- 在两者之间传递数据和对象

这种"双向通道"是 Goja 最大的价值所在。

---

## 代码示例一：最简单的 hello world

这是 Goja 的最基本用法——创建一个虚拟机，执行一段 JS 代码，拿到结果。

```go
package main

import (
	"fmt"
	"log"

	"github.com/dop251/goja"
)

func main() {
	// 1. 创建一个新的 JavaScript 运行时（一个独立的 JS 世界）
	vm := goja.New()

	// 2. 执行一段 JavaScript 代码
	v, err := vm.RunString("2 + 2")
	if err != nil {
		log.Fatal(err)
	}

	// 3. 把 JS 的值转回 Go 的类型
	result := v.Export().(int64)
	fmt.Printf("2 + 2 = %d\n", result)
	// 输出: 2 + 2 = 4
}
```

这一段的流程就是：

| 步骤 | 做什么 | 核心 API |
|------|--------|----------|
| 1 | 创建 JS 运行时 | `goja.New()` |
| 2 | 执行 JS 代码 | `vm.RunString("...")` |
| 3 | 拿到 JS 的结果值 | `v.Export().(int64)` |

---

## 代码示例二：在 Go 和 JS 之间传数据

这个例子展示了双向交互：把 Go 的数据传给 JS，让 JS 计算后再传回来，同时把 Go 函数注册到 JS 里让 JS 调用。

```go
package main

import (
	"fmt"
	"log"

	"github.com/dop251/goja"
)

func main() {
	vm := goja.New()

	// --- 第一部分：把 Go 的值传给 JS ---

	// 在 JS 世界里创建一个变量 "message"，值是 Go 字符串 "hello from Go"
	vm.Set("message", "hello from Go")

	// 在 JS 里运行代码，使用刚才设置的变量
	v, err := vm.RunString(`message + " — welcome to JavaScript!"`)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(v.ToString().String())
	// 输出: hello from Go — welcome to JavaScript!

	// --- 第二部分：把 Go 函数注册给 JS 调用 ---

	// 定义一个 Go 函数：接收一个整数，返回它的平方
	vm.Set("square", func(call goja.FunctionCall) goja.Value {
		num := call.Argument(0).ToInteger()
		result := num * num
		return vm.ToValue(result)
	})

	// 在 JS 里调用刚才注册的 Go 函数
	v2, err := vm.RunString("square(7)")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("square(7) = %d\n", v2.ToInteger())
	// 输出: square(7) = 49
}
```

这段代码展示了三个关键 API：

1. `vm.Set("key", value)`：把一个 Go 变量放到 JS 的世界里
2. `vm.Set("funcName", goFunction)`：把一个 Go 函数注册成 JS 能调用的函数
3. `call.Argument(0)`：在 Go 函数里读取 JS 传过来的第一个参数

---

## 为什么需要 Goja？

### 与 V8 包装器对比

| 场景 | 用 V8 包装器 | 用 Goja |
|------|-------------|---------|
| JS 做大量计算（如加密） | V8 更快 | Goja 慢一些 |
| Go 频繁调用 JS 并传复杂数据 | cgo 开销很大 | 零 cgo，直接内存访问 |
| 跨平台编译 | 需要为每个平台编译 V8 | 一个二进制文件搞定所有平台 |
| 依赖管理 | 需要 CGO 和系统库 | 零外部依赖 |

**一句话结论**：如果你的程序"主体是 Go，偶尔需要跑一下 JS"，Goja 通常比 V8 包装器更合适。

### 典型用途

- 在 Go 应用中嵌入配置脚本语言（用户写 JS 定制行为）
- 服务端渲染或模板引擎的脚本层
- 安全沙箱：在隔离的 JS 环境中执行不受信任的代码
- 数据转换管道：用 JS 写灵活的转换逻辑，Go 做基础设施
- 学习和研究 JavaScript 引擎内部原理

---

## Goja 的内部结构（简化版）

了解 Goja 的代码结构，能帮助你理解它是怎么工作的：

```
goja/
├── parser/        # 解析器：把 JS 源代码字符串变成抽象语法树（AST）
├── ast/           # 抽象语法树的数据结构定义
├── compiler.go    # 编译器：把 AST 编译成字节码
├── runtime.go     # 运行时：执行字节码，管理变量和作用域
├── builtin_*.go   # 内置对象：Math, Array, Object, String 等的实现
├── object.go      # JavaScript 对象模型
└── vm.go          # 虚拟机核心：执行字节码的引擎
```

整个流程是：

```
JS 源码字符串
    ↓
Parser（解析器）→ 抽象语法树 AST
    ↓
Compiler（编译器）→ 字节码
    ↓
VM（虚拟机）→ 执行字节码，操作 Runtime 中的值
    ↓
返回 Value（结果）
```

---

## 重要注意事项

1. **不支持 goroutine 共享**：一个 `*goja.Runtime` 只能被一个 goroutine 使用。需要并发时创建多个实例。

2. **不支持 setTimeout/setInterval**：这两个函数不属于 ECMAScript 标准，而是浏览器和 Node.js 提供的。Goja 本身不包含它们（但有独立的 [goja_nodejs](https://github.com/dop251/goja_nodejs) 项目提供 Node.js 兼容性）。

3. **性能定位**：它比 Go 生态中的其他脚本引擎快（比 otto 快 6-7 倍），但它不是 V8 或 SpiderMonkey 的替代品——它的定位是"嵌入到 Go 程序中的脚本引擎"，不是通用 JS 运行时。

4. **ES 标准**：完整支持 ECMAScript 5.1，大部分 ES6 功能也在持续实现中。

5. **异常处理**：JS 抛出的异常在 Go 侧以 `*goja.Exception` 类型返回，可以用 `err.(*Exception)` 类型断言来捕获。

---

## 总结

Goja 做的事情本质上是：**用 Go 语言重新实现了一个 JavaScript 引擎**。

它最核心的价值就是"双向通道"——让你在纯 Go 的环境中，无缝执行 JavaScript 代码，并且在这两种语言之间自由传递数据。对于需要嵌入脚本能力的 Go 应用来说，这是一个非常优雅的选择。

---

## 练习思考

现在你已经了解了 Goja 的基本用法，思考一下：如果你的 Go 程序需要让用户"写脚本自定义行为"（比如数据转换规则），用 Goja 来执行用户写的 JavaScript 脚本，你觉得需要处理哪些安全方面的问题？

想好了可以随时讨论，我会帮你分析。
