---
title: Binaryen — WASM 编译器基础设施
来源: https://github.com/WebAssembly/binaryen
日期: 2026-06-13
分类: 其他
子分类: wasm-toolchain
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Binaryen** 是一个用 C++ 写的编译器工具链库，专门用来处理和优化 WebAssembly（WASM）代码。你可以把它理解为 WebAssembly 世界的"瑞士军刀"——它既能解析 WASM、也能优化 WASM、还能把 WASM 转成别的格式。

日常类比：想象你有一座钢铁厂（编译器），把铁矿石（高级语言代码）炼成钢材（WebAssembly）。但刚炼出来的钢材形状不够完美，需要再加工——切削、打磨、热处理——才能做成最好的产品。Binaryen 就是这座钢铁厂后面的"精加工车间"，它接收刚出炉的 WASM 钢材，通过几十种加工工序（优化 Pass），把它变得更轻、更快、更小。

## 核心概念

### 1. 模块（Module）

Module 是 Binaryen 里的基本单位，对应一个 WebAssembly 文件。一个 Module 包含函数、全局变量、内存、导入/导出等所有东西。你可以把它理解成一个完整的"WASM 工厂"。

### 2. Binaryen IR

IR（Intermediate Representation）即中间表示。Binaryen 不把 WASM 当作一串二进制字节来处理，而是把它解析成一棵**树形结构**（AST），这棵树就是 Binaryen IR。每个节点代表一个操作（比如加法、函数调用、条件判断），叶子节点是常量或变量。

为什么要把 WASM 变成树？因为树结构让优化变得容易——你可以像修剪盆栽一样，直接找到树中某个分支进行改造，而不必在二进制字节流里猜来猜去。

### 3. 优化 Pass（Pass / 优化器）

Binaryen 最核心的能力是它的**优化器**。它包含 40 多种优化 Pass，每种 Pass 负责一件事：去掉死代码、合并重复指令、把常量在编译时就算出来……你可以单独跑某一个 Pass，也可以按一条"优化流水线"（Pipeline）一次性跑完所有 Pass。

常用命令 `wasm-opt` 就是 Binaryen 的命令行优化器，用法类似 `gcc -O3`：

```
wasm-opt input.wasm -O3 -o output.wasm
```

其中 `-O3` 代表应用全套优化，类似给工厂全速运转。

### 4. 工具链组件

Binaryen 不只提供一个优化器，还自带一整套工具：

| 工具 | 作用 | 类比 |
|------|------|------|
| `wasm-opt` | 优化 WASM 文件 | 精加工车间 |
| `wasm-as` | 把文本格式转成二进制 WASM | 原料入厂检验 |
| `wasm-dis` | 把二进制 WASM 反汇编成文本 | 拆解成品看内部 |
| `wasm2js` | 把 WASM 转成 JavaScript | 逆向工程——把成品还原成原材料 |
| `wasm-merge` | 合并多个 WASM 文件 | 工厂并购——把两个工厂合并成一个 |
| `wasm-ctor-eval` | 编译期执行函数（预计算） | 提前把能算的都算好，运行时直接拿结果 |

## 代码示例

### 示例 1：用 wasm-opt 优化一个 WASM 文件

你有一个叫 `hello.wasm` 的文件，里面是一个简单的加法函数：

```bash
# 不做任何优化，直接读取并原样输出（-S 表示文本格式）
wasm-opt hello.wasm -S

# 应用全套优化
wasm-opt hello.wasm -O3 -o hello-opt.wasm

# 只看某个特定优化 Pass 的效果（去掉死代码）
wasm-opt hello.wasm -DCE -S -o -
```

输出对比：

```
# 优化前
(func $add (param $x i32) (param $y i32) (result i32)
  (i32.add (local.get $x) (local.get $y))
)

# 优化后（-O3 可能会做内联、常量折叠等，结果更紧凑）
(func $add (param $0 i32) (param $1 i32) (result i32)
  (i32.add (local.get $0) (local.get $1))
)
```

这里可以看到变量名被简化了（`$x` 变成 `$0`），这是 Binaryen 的变量重命名优化在起作用——既然没人从外面引用这个名字，简化它能减小最终二进制文件的大小。

### 示例 2：在代码中用 C API 构建一个简单的 WASM 模块

Binaryen 提供 C API（单头文件），你可以在自己的编译器中用它来生成 WASM：

```c
#include "binaryen-c.h"

// 1. 创建一个空模块
ModuleRef module = BinaryenModuleCreate();

// 2. 定义函数类型：两个 i32 输入，一个 i32 输出
TypeRef params = BinaryenTypeNone();
TypeRef results = BinaryenTypeInt();
TypeRef func_type = BinaryenTypeMake(params, 2, &results, 1);

// 3. 创建两个参数（局部变量）
ExpressionRef x = BinaryenAddLocal(module, "x", BinaryenTypeInt());
ExpressionRef y = BinaryenAddLocal(module, "y", BinaryenTypeInt());

// 4. 创建表达式：(i32.add (local.get $x) (local.get $y))
ExpressionRef body = BinaryenCall(
    module,
    "add_internal",     // 函数名
    &func_type, 1,       // 函数类型
    NULL, 0,             // 参数（下面填充）
    BinaryenTypeInt()
);

// 实际的加法表达式
ExpressionRef add_expr = BinaryenBinary(
    BinaryenAdd,                     // 加法操作
    BinaryenGetLocal(module, x, BinaryenTypeInt()),
    BinaryenGetLocal(module, y, BinaryenTypeInt()),
    BinaryenTypeInt()
);

// 5. 创建函数并添加到模块
BinaryenFunctionAdd(
    module,
    "add",                         // 函数名
    &func_type, 1,                  // 函数类型
    BinaryenTypeNone(),             // 本地变量类型
    0,                              // 本地变量数量
    add_expr,                       // 函数体
    0,                              // 代码大小
    BinaryenCreateReprofiling()     // 优化标记
);

// 6. 优化模块
BinaryenModuleOptimize(module);

// 7. 输出为二进制 WASM 文件
BinaryenModuleWrite(module, "hello.wasm");

// 8. 释放模块
BinaryenModuleDispose(module);
```

这段代码做了什么？它从头构建了一个加法函数，告诉 Binaryen："给我创建一个函数，接受两个整数参数，返回它们的和"。Binaryen 会在内部把这段描述变成树形 IR，经过优化，最后输出一个真正的 `.wasm` 二进制文件。

## 为什么重要

Binaryen 是 WebAssembly 生态的**核心基础设施**。几乎所有主流的 WASM 工具链都在用它：

- **Emscripten**（C/C++ → WASM）底层用 `wasm-opt` 做最终优化
- **wasm-pack**（Rust → WASM）同样依赖 Binaryen 做代码尺寸压缩
- **AssemblyScript**（TypeScript → WASM）直接用 Binaryen 库生成 WASM
- **V8 引擎**（Chrome/Node.js 的 JS 引擎）也用 Binaryen 来优化 WASM

一句话：只要你的代码最终要在浏览器或其他 WASM 运行时里跑，Binaryen 很可能就在你看不见的地方帮你把代码变得更快更小了。

## 延伸方向

- **Emscripten**：如果你会 C/C++，了解 Emscripten 能帮你理解"代码怎么从 C++ 变成浏览器能跑的东西"
- **WebAssembly 规范**：了解 WASM 本身的结构（栈机器、二进制格式），能更好地理解 Binaryen 的 IR 设计意图
- **binaryen.js**：Binaryen 的 JavaScript 版本，让你能在浏览器里直接用 JS 做 WASM 优化，不需要装任何工具

## 一句话总结

Binaryen 是 WebAssembly 的"精加工车间"——它用树形 IR 表示 WASM 代码，通过几十种优化 Pass 让代码更小更快，是整个 WASM 生态的基础设施层。
