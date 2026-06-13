---
title: OpenSmalltalk VM (Cog) — Cog VM 的现代继承
来源: https://github.com/OpenSmalltalk/opensmalltalk-vm
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# OpenSmalltalk VM (Cog) — Cog VM 的现代继承

## 一、先打个日常比喻

想象你去一家餐馆：

1. **解释器模式**：每次你点一道菜（调用一个方法），厨师就现场做一道。简单，但慢。
2. **编译模式**：厨师把菜谱提前编译成"半成品"（机器码），你点菜时直接加热。快了很多。
3. **Cog 模式**：厨师不仅做了半成品，还记住了哪些菜你点得最多（热点方法），自动把它们的配方优化到极致——甚至把锅铲换成了机器手臂。这就是 JIT（即时编译）。

Cog VM 就是这样一个"超级厨师"——它是 Smalltalk 语言的虚拟机，能把高频执行的代码从"慢慢解释"自动变成"极速编译"。

## 二、从小talk 开始

Smalltalk 是 1970 年代在 Xerox PARC 发明的一种**纯面向对象**编程语言。它有一个核心理念：

> **一切皆对象。**

数字是对象、布尔值是对象、连"类"本身也是对象。你通过"发送消息"来让对象做事，而不是像 C 语言那样调用函数。

```smalltalk
"向 42 发送 '乘以 3' 这条消息"
(42) * 3
"结果是 126"
```

```smalltalk
"创建一个字符串对象，给它发送 '大写' 消息"
'hello' upCase
"结果是 'HELLO'"
```

这种语言太有魅力了，以至于 Java、Python、Ruby 等现代语言都深受影响。但问题来了：Smalltalk 跑在什么上面？答案就是——Cog VM。

## 三、Cog VM 是什么

Cog 是一个 Smalltalk 虚拟机，专门运行 Squeak 和 Cuis 这两个 Smalltalk 方言。它有几个关键特征：

1. **JIT 编译器（Just-In-Time）**：当一个方法被执行多次后，Cog 会自动把它编译成真正的机器码，直接跑在 CPU 上。
2. **混合架构**：它不是纯解释器也不是纯编译器，而是"解释器 + JIT 编译器"协同工作。
3. **Garbage Collector（垃圾回收）**：自动管理内存，你不需要手动释放。
4. **Spur 内存管理器**：新一代内存管理，使用"分代回收"和"隐式转发"来加速对象操作。

## 四、核心概念详解

### 4.1 CoInterpreter 和 Cogit：双引擎协作

Cog 的核心由两个组件组成：

- **CoInterpreter（协作解释器）**：负责解释执行 Smalltalk 字节码，管理对象内存和消息传递。它就像厨房的主厨，负责日常运转。
- **Cogit（代码生成器 / JIT 编译器）**：负责把热点方法编译成机器码。它像机器手臂，只在必要时介入。

两者通过 API 协作：CoInterpreter 告诉 Cogit"这个方法被调用了太多次，帮我编译它"，Cogit 编译好后，CoInterpreter 下次就直接跳到机器码执行。

### 4.2 Spur 内存管理

Spur 是 Cog 的新一代内存管理器，相比旧版 v3 有重大改进：

| 特性 | v3 | Spur |
|------|-----|-------|
| 分代垃圾回收 | 否 | 是（年轻代 + 老年代） |
| 对象转发 | 完全转发（慢） | 隐式转发（快） |
| 对象头格式 | 32/64位不同 | 统一格式 |
| 堆大小 | 固定 | 可伸缩（动态增长/缩小） |

### 4.3 VM 的多种变体

Cog 有多种组合方式，就像手机的"标准版 + Pro 版"：

- **Stack VM**：纯解释器，方法调用在栈上执行，比传统解释器快，但没有 JIT。
- **Cog VM**：Stack VM + JIT 编译器，高频代码自动编译为机器码。
- **Sista VM**：实验性的自适应优化，支持内联和类型推测（还在开发中）。

## 五、代码示例

### 5.1 示例一：Smalltalk 代码（在 Squeak/Cuis 中运行）

下面是一个完整的 Smalltalk 程序，展示了 Smalltalk 的基本语法。这段代码在 Cog VM 上执行时，会被 CoInterpreter 解释执行，其中 `loop` 方法因为反复被调用，会被 Cogit 自动编译为机器码。

```smalltalk
"定义一个集合，存储数字 1 到 100"
| numbers total evenCount |

numbers := (1 to: 100) asArray.

"计算总和 —— 用 'inject:into:' 方法遍历"
total := numbers
    inject: 0
    into: [ :sum :each | sum + each ].

Transcript show: '1 到 100 的总和是: '; show: total; cr.

"找出偶数的数量 —— 用 'select:' 过滤"
evenCount := (numbers select: [ :each | each isEven ]) size.

Transcript show: '偶数有: '; show: evenCount; cr.

"定义一个类 —— Smalltalk 中一切皆对象"
Object subclass: #FibonacciGenerator
    instanceVariableNames: 'previous current'
    classVariableNames: ''
    package: 'Examples'.

"创建实例"
| fib |
fib := FibonacciGenerator new.
fib initialize.

"打印前 10 个斐波那契数"
1 to: 10 do: [ :i |
    Transcript show: 'Fib(', i, '): '; show: fib next; cr.
].
```

**解释**：
- `| numbers total evenCount |`：声明局部变量（管道符号分隔）。
- `inject:into:`：类似其他语言的 reduce/fold，累加所有数字。
- `select:`：过滤集合，选出偶数。
- `Object subclass:`：Smalltalk 用消息来创建子类，这是"一切皆对象"的体现。

### 5.2 示例二：JIT 编译过程（Cog 内部视角）

这是 Cog 虚拟机内部的简化逻辑，展示了 JIT 编译的工作流程。注意：这不是 Smalltalk 代码，而是用 C 语言描述的概念性代码（实际的 Cog 源码就是用 C 写的）：

```c
// 伪代码 - 展示 Cog JIT 的工作流程

// CoInterpreter: 解释执行字节码
void co_interpret_method(Method *method) {
    while (hasMoreBytecodes(method)) {
        Bytecode bc = readBytecode(method);

        // 计数器：每次执行都 +1
        method->invocationCount++;

        // 热检测方法：如果调用超过阈值，触发 JIT 编译
        if (method->invocationCount > HOT_THRESHOLD) {
            CogMethod *compiled = cogit_compile(method);
            if (compiled) {
                // 下次直接跳到机器码执行！
                execute_compiled_method(compiled);
            }
        }
        // 否则继续解释执行
        else {
            execute_bytecode(bc);
        }
    }
}

// Cogit: JIT 编译器 - 把字节码翻译成机器码
CogMethod *cogit_compile(Method *method) {
    // 1. 分配一块可执行的内存页
    void *codePtr = allocateExecutableMemory(PAGE_SIZE);

    // 2. 逐条翻译字节码为机器码
    for (Bytecode bc : method->bytecodes) {
        switch (bc.opcode) {
            case OP_PUSH_INTEGER:
                emitMachineCode(codePtr, MOV, register_A, bc.value);
                break;
            case OP_ADD:
                emitMachineCode(codePtr, ADD, register_A, register_B);
                break;
            case OP_SEND_MESSAGE:
                emitMachineCode(codePtr, CALL, resolveSelector(bc.selector));
                break;
        }
    }

    // 3. 返回编译后的方法
    return createCogMethod(codePtr, method);
}
```

**解释**：
- `HOT_THRESHOLD`：一个阈值（比如方法被执行 20 次），超过后触发编译。
- `allocateExecutableMemory`：CPU 只能执行内存中带有"可执行权限"的数据，JIT 编译的代码需要这样的内存页。
- 编译后的机器码会缓存在 `CogMethod` 中，下次调用直接跳转，跳过所有解释开销。

## 六、VM 源码目录结构

如果你 clone 了 opensmalltalk-vm 仓库，会看到这样的目录：

```
opensmalltalk-vm/
├── src/                          # 虚拟机核心源码
│   ├── spur32.cog/              # 32位 Cog JIT VM
│   ├── spur64.cog/              # 64位 Cog JIT VM
│   ├── spur32.stack/            # 32位 Stack VM（无 JIT）
│   ├── spur32.sista/            # Sista 实验性 VM
│   └── plugins/                 # 所有插件（文件系统、网络等）
├── building/                     # 各平台构建目录
│   ├── linux64x64/              # Linux 64位构建
│   ├── macos64x64/              # macOS Intel 构建
│   ├── macos64ARMv8/            # macOS ARM/M 系列构建
│   └── win64x64/                # Windows 构建
├── platforms/                    # 平台适配代码
├── processors/                   # CPU 模拟器（用于 JIT 开发测试）
└── image/                        # 用于开发 VM 本身的 Smalltalk 图像
```

## 七、一个有趣的特性：VM 本身用 Smalltalk 写

Cog VM 最独特的一点是：**它的核心是用 Smalltalk 写的，通过一个 "Slang" 翻译器变成 C 代码。**

这意味着：
- VM 开发者用 Smalltalk 写 VM 代码，在 Smalltalk 环境中调试。
- Slang 把 Smalltalk 代码翻译成 C。
- C 编译器把 C 代码编译成可执行的虚拟机。

这种"用语言本身开发其虚拟机"的模式，是 Smalltalk 反射能力的极致体现。

## 八、总结

Cog VM 是 Smalltalk 虚拟机的现代形态。它通过 JIT 编译把 Smalltalk 从"慢解释器"变成了"高性能运行时"。它的核心创新包括：

- 解释器 + JIT 的协作架构
- Spur 分代垃圾回收
- VM 本身用 Smalltalk 开发并通过 Slang 翻译成 C

理解了 Cog，你就理解了 Smalltalk 如何在 50 年后仍然保持生命力。
