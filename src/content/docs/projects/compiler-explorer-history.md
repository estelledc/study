---
title: How Compiler Explorer Was Built
来源: https://xania.org/202605/compiler-explorer-architecture
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# How Compiler Explorer Was Built

## 一、从 tmux 到 godbolt.org：一个项目的诞生

想象一下：你是一个程序员，想搞清楚一段 C++ 代码到底编译成了什么样的机器指令。

你该怎么办？传统做法是：写一个 `.c` 文件，运行 `gcc -S file.c -o file.s`，然后打开生成的 `.s` 汇编文件，一行行看。每次改代码，都要重新跑一遍命令，再刷新文件。很麻烦，对吧？

2012 年，Matt Godbolt 遇到了同样的问题。他的解决方式非常极客——他直接用 `tmux`（一个终端多路复用工具），左边窗口跑 `vi` 编辑代码，右边窗口跑 `watch gcc -S foo.cc -o -`，用 `watch` 命令让终端每隔几秒自动重新编译，把最新汇编结果打印出来。

这就是 Compiler Explorer 的最初形态：**两个并排的终端窗口**。

后来 Matt 觉得这个工具太好了，应该让更多人用到。于是他把这个"tmux hack"变成了一个真正的网站——godbolt.org。今天它每周处理超过 300 万次编译，支持 30 多种编程语言。

## 二、核心概念：编译器到底在做什么？

要理解 Compiler Explorer，先要理解编译器的基本流程。

### 2.1 从源代码到机器码

计算机的 CPU 只认识"机器码"——就是一串数字，比如 `01fe89f0c3`。但这对人来说完全不可读。

所以程序员用"汇编语言"来代替机器码。汇编和机器码是一一对应的：

```nasm
add esi, edi        ; 对应机器码字节 01 fe
mov eax, esi        ; 对应机器码字节 89 f0
ret                 ; 对应机器码字节 c3
```

这是一段汇编，意思是：把 `edi` 寄存器的值加到 `esi` 上，然后把结果复制到 `eax`，最后返回。

而在高级语言（比如 C）中，同样的功能只需要一行：

```c
int add(int x, int y) {
  return x + y;
}
```

编译器的任务，就是把人类能读懂的高级语言，翻译成 CPU 能执行的机器码。这个过程包括：

1. **词法分析**：把源代码拆分成一个个"词"（关键字、变量名、运算符等）
2. **语法分析**：根据语法规则，把这些词组织成语法树
3. **语义分析**：检查类型是否匹配、函数调用是否正确
4. **优化**：生成更快、更小的代码
5. **代码生成**：最终产出机器码/汇编

Compiler Explorer 让你能看到每一步的结果，尤其是最终的汇编输出。

## 三、Compiler Explorer 的架构设计

### 3.1 整体架构

Compiler Explorer 是一个典型的"前后端一体"应用：

- **前端**：浏览器里的代码编辑器和汇编展示面板
- **后端**：用 TypeScript + Node.js 写的服务器
- **编译器**：实际执行编译工作的 GCC、Clang、Rustc 等

用户在前端编辑代码 → 前端通过 HTTP API 把代码发给后端 → 后端调用系统上的编译器（如 gcc、clang）→ 编译器返回汇编结果 → 后端把汇编返回给前端展示。

整个过程几乎实时完成。

### 3.2 关键组件

**语言配置系统**：Compiler Explorer 支持 30 多种语言。每种语言的编译器配置写在 `etc/config/` 目录下的属性文件中。比如 `c++.defaults.properties` 定义了 C++ 编译器的默认路径和参数。用户可以创建 `c++.local.properties` 来覆盖默认配置，这个文件不会被 git 跟踪，适合本地定制。

**UI 布局引擎**：页面使用 GoldenLayout 库实现可拖拽的面板布局。你可以自由调整编辑器窗口和汇编窗口的相对大小，甚至可以添加"执行结果"面板、"控制流图"面板等子面板。

**着色关联**：每一行源代码和它对应的汇编行会用相同的颜色高亮。鼠标悬停在一行上时，另一侧对应的行也会高亮。这让"这段 C++ 代码变成了哪条汇编指令"变得一目了然。

## 四、动手体验：用 Compiler Explorer 看编译过程

### 4.1 示例一：简单函数的汇编输出

打开 godbolt.org，输入以下 C 代码：

```c
int add(int x, int y) {
    return x + y;
}
```

默认情况下，编译器以 `-O0`（无优化）模式编译。你会看到类似这样的汇编：

```nasm
add esi, edi        ; 把 edi 和 esi 相加
mov eax, esi        ; 把结果放入 eax（返回值寄存器）
ret                 ; 返回
```

现在把编译选项改成 `-O2`（开启优化），汇编变成了：

```nasm
lea eax, [rdi+rsi]  ; 一条指令完成加法并放入 eax
ret                 ; 返回
```

注意变化：优化后的版本只用了一条 `lea`（Load Effective Address）指令就完成了加法，比原来少了一条指令、节省了字节。这就是编译器优化的威力——它比你更了解 CPU 的指令特性。

### 4.2 示例二：循环展开与向量化

再看一个稍微复杂的例子：

```c
int sum_array(int *arr, int n) {
    int sum = 0;
    for (int i = 0; i < n; i++) {
        sum += arr[i];
    }
    return sum;
}
```

无优化（`-O0`）时，汇编大致如下：

```nasm
sum_array:
    xor eax, eax          ; sum = 0
    test edi, edi         ; 检查 n <= 0 ?
    jle .L2               ; 如果 <= 0，跳到结束
.L3:
    movsx rcx, dword [rax + rdx*4]  ; 取 arr[i]
    add eax, ecx          ; sum += arr[i]
    inc rsi               ; i++
    cmp rsi, rdx          ; 比较 i 和 n
    jl .L3                ; 如果 i < n，继续循环
.L2:
    ret                   ; 返回 sum
```

加上 `-O3` 优化后，编译器可能会做"向量化"——用 SIMD 指令一次处理多个元素（比如同时加 4 个整数）：

```nasm
sum_array:
    test edi, edi
    jle .L2
    xor eax, eax
    xor ecx, ecx          ; 循环计数器
.L3:
    movsxd r8d, dword [rsi + rcx*4]   ; 取 arr[i]
    lea rdx, [rcx+1]
    add eax, r8d                    ; sum += arr[i]
    cmp rdx, rdi
    jb .L3                  ; 如果 i < n，继续
.L2:
    ret
```

在真实的 godbolt.org 上，如果你用 Clang 编译器并开启 `-O3`，你甚至可能看到编译器使用了 AVX/AVX2 的 SIMD 指令（如 `vpaddld`），一次处理 8 个整数的加法——这比原始代码快了将近一个数量级。

## 五、为什么 Compiler Explorer 如此有用

### 5.1 教学价值

对于学习汇编、理解编译器优化的人来说，Compiler Explorer 是最好的交互式教材。你不需要在本地配置 GCC、写 Makefile、跑命令——一切都在浏览器里完成。

### 5.2 性能调优

在 C++ 社区，Compiler Explorer 被广泛用于性能调优。比如：

- 某个函数为什么没有内联？看汇编就知道
- 编译器有没有做循环向量化？看汇编就能确认
- 不同写法生成的汇编有什么区别？改一下代码立刻对比

### 5.3 语言研究

每种语言的设计者都可以用它来验证自己的设计决策。比如 C++ 标准库中的 `std::vector` 在什么情况下会被"省略"（Copy Elision），Java 的 JIT 编译器如何优化字符串拼接——这些都可以通过 Compiler Explorer 直观地观察。

## 六、技术栈一览

| 层级 | 技术 |
|------|------|
| 前端 | TypeScript + Pug（模板）+ SCSS（样式）+ GoldenLayout（布局） |
| 后端 | Node.js + TypeScript + Express |
| 编译器 | GCC、Clang、Rustc、LLVM、MSVC 等（安装在服务器上） |
| 构建 | Makefile + npm |
| 测试 | Vitest（单元测试）+ Cypress（端到端测试） |

## 七、关键启发

Compiler Explorer 的故事告诉我们几个重要的工程原则：

1. **从自己的痛点出发**：Matt 是因为自己需要看汇编才做了这个工具。最好的工具往往源于解决自己的问题。
2. **最小可行产品（MVP）可以极其简陋**：最初的版本就是两个 tmux 窗口。不需要精美的界面，不需要用户系统，只要能跑就行。
3. **渐进式演进**：从 tmux 到独立网站，从只有 C++ 到支持 30 种语言，从单人使用到每周 300 万次访问——每一步都是为了解决下一个瓶颈。
4. **开源的力量**：Compiler Explorer 是开源项目（BSD-2-Clause 协议），全球贡献者一起维护。它的 GitHub 仓库有 18,800+ Star，是 C++ 生态中最受欢迎的项目之一。

## 八、延伸实践

如果你想自己跑一个本地的 Compiler Explorer：

```bash
# 克隆仓库
git clone https://github.com/compiler-explorer/compiler-explorer.git
cd compiler-explorer

# 安装依赖并启动（需要 Node.js 22+）
make

# 访问 http://localhost:10240/
```

开发模式下可以用 `make dev`，它会监听文件变化自动重载，方便调试。

如果想限制只运行特定语言（比如只跑 C++），可以加参数：

```bash
make EXTRA_ARGS='--language c++'
```

---

> 本文基于 Matt Godbolt 在 CppCon 2019 的演讲、Compiler Explorer 官方文档以及社区资料整理而成。官方网站：https://godbolt.org
