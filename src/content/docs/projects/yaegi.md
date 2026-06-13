---
title: Yaegi — Traefik 的 Go 解释器
来源: https://github.com/traefik/yaegi
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Yaegi：让 Go 变成一门可解释执行的语言

## 一个日常类比

想象一下：你有一个乐高套装，通常你需要按照说明书一步步拼好它（这就是 Go 的编译过程），拼好之后才能玩。

但 Yaegi 做的事情是：它给你一个"实时拼装台"——你可以把乐高零件（Go 代码）一块一块放上去，拼装台会立刻告诉你"这一块能放进去吗？""放上去之后效果怎样？"。拼的过程中随时可以改、可以撤，不需要把整个拆了重来。

换句话说：**Go 本来是一门编译语言——代码必须先编译成二进制文件才能跑。Yaegi 在 Go 运行时内部塞进了一个解释器，让你可以直接"边写边跑" Go 代码，就像 Python 和 JavaScript 那样。**

---

## 核心概念

### 1. Interpreter（解释器实例）

解释器就像一个"Go 代码执行沙箱"。你创建它、往里面丢代码、它返回结果或错误。每个解释器实例都是独立的，互不干扰。

创建方式非常简单：

```go
i := interp.New(interp.Options{})
```

这行代码就创建了一个空白的 Go 解释器实例。

### 2. Eval（求值）

`Eval` 是解释器的核心方法。你给它一段 Go 代码字符串，它会"当场"解析、执行这段代码，并返回结果。

类比：你把一张写满 Go 代码的纸条塞进解释器，它看完纸条后立刻执行，把结果塞回给你。

### 3. Use（注册符号）

Go 的标准库（比如 `fmt`、`os`、`time`）不会自动在解释器里可用。你需要用 `Use()` 把标准库"注入"到解释器的环境中，这样解释器才知道 `fmt.Println` 是什么。

类比：你给拼装台配好了所有乐高零件的说明书，拼装台才知道这些零件怎么拼。

---

## 代码示例

### 示例 1：基础使用——在 Go 里执行 Go 代码

这个示例展示了最基础的用法：创建一个解释器，加载标准库，然后执行一段 Go 代码。

```go
package main

import (
	"fmt"
	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

func main() {
	// 1. 创建一个解释器实例
	i := interp.New(interp.Options{})

	// 2. 注入 Go 标准库（让解释器知道 fmt、os 等是什么）
	i.Use(stdlib.Symbols)

	// 3. 执行一段 Go 代码
	_, err := i.Eval(`import "fmt"`)
	if err != nil {
		panic(err)
	}

	// 4. 调用标准库函数
	_, err = i.Eval(`fmt.Println("Hello from Yaegi!")`)
	if err != nil {
		panic(err)
	}
}
```

输出：

```
Hello from Yaegi!
```

关键流程就三步：`New()` 创建实例 → `Use()` 注入标准库 → `Eval()` 执行代码。

### 示例 2：动态扩展——把解释的函数拿来用

这才是 Yaegi 真正强大的地方：你可以在编译好的 Go 程序里，动态加载一段 Go 代码定义的函数，然后像调用普通 Go 函数一样调用它。这就像给你的程序装了"热插拔插件"。

```go
package main

import (
	"fmt"
	"github.com/traefik/yaegi/interp"
)

const src = `
package foo

import "strings"

func AddPrefix(s string) string {
	return "PREFIX-" + s
}

func UpperAndReverse(s string) string {
	return strings.ToUpper(s)
}
`

func main() {
	// 创建解释器
	i := interp.New(interp.Options{})

	// 执行上面那段 Go 代码（定义了两个函数）
	_, err := i.Eval(src)
	if err != nil {
		panic(err)
	}

	// 从解释器中取出 foo.AddPrefix 函数
	v, err := i.Eval("foo.AddPrefix")
	if err != nil {
		panic(err)
	}

	// 把它转换成 Go 函数类型并调用
	addPrefix := v.Interface().(func(string) string)
	result := addPrefix("Hello Yaegi")
	fmt.Println(result) // 输出: PREFIX-Hello Yaegi

	// 同理取出并调用 UpperAndReverse
	v2, _ := i.Eval("foo.UpperAndReverse")
	upper := v2.Interface().(func(string) string)
	fmt.Println(upper("hello")) // 输出: HELLO
}
```

输出：

```
PREFIX-Hello Yaegi
HELLO
```

这个模式的妙处在于：`src` 那段代码不需要在编译时存在。你可以从文件读取它、从网络下载它、让用户在运行时编写它——程序主体编译好后，行为完全可以通过解释的代码来改变。

### 示例 3：命令行 REPL（交互式解释器）

Yaegi 本身也提供了一个命令行工具，可以像 Python 那样交互式地执行 Go 代码：

```
$ yaegi
> 1 + 2
3
> import "fmt"
> fmt.Println("Hello World")
Hello World
>
```

也可以用在脚本的 shebang 行，让 Go 文件直接可执行：

```go
#!/usr/bin/env yaegi
package main

import "fmt"

func main() {
	fmt.Println("这是一段可以直接跑的 Go 脚本！")
}
```

---

## 为什么需要 Go 解释器？

Go 是一门编译型语言，编译之后得到的是静态二进制文件。但在一些场景中，编译好的程序不够灵活：

| 场景 | 传统做法的痛点 | Yaegi 的优势 |
|------|---------------|-------------|
| Traefik 路由规则配置 | 修改路由规则需要重新编译 | 解释器动态加载规则，热更新 |
| 插件系统 | 插件编译链接复杂 | 解释器直接执行插件代码 |
| 嵌入式设备 | 需要交叉编译工具链 | 解释器在设备 runtime 内执行 |
| 教学/实验 | 每次改代码都要重新编译 | 即时看到结果 |

**核心思路**：Traefik（一个流行的开源反向代理/负载均衡器）用 Yaegi 来让它的用户可以用 Go 语言来配置路由规则，而且改完配置不需要重新编译 Traefik 本身。

---

## 重要限制

理解限制和了解功能一样重要：

- **`unsafe` 和 `syscall` 包默认不可用**——这是安全设计，防止解释的代码做危险操作
- **不支持汇编文件（`.s`）**
- **不支持调用 C 代码**（没有虚拟的 `C` 包）
- **接口不能动态添加**——要被预编译代码调用的接口必须预编译
- **计算密集型代码会很慢**——解释执行天然比编译执行慢很多
- **Go modules 暂不支持**

---

## 一句话总结

Yaegi 把 Go 变成了一门"可解释"的语言——它不是一个编译器，而是一个能当场读懂 Go 代码、执行代码、并把结果给你的解释器。它让 Go 程序拥有了动态加载和执行代码的能力，是 Traefik 插件系统的幕后功臣。

---

## 进一步学习

- 官方文档：https://pkg.go.dev/github.com/traefik/yaegi
- 内部实现解析：https://marc.vertes.org/yaegi-internals/
- 调试用 trace：查看 `interp/trace.go`，可以打印解释器内部执行过程
