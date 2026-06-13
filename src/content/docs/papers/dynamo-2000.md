---
title: Dynamo: A Transparent Dynamic Optimization System
来源: https://dl.acm.org/doi/10.1145/349299.349303
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# Dynamo: A Transparent Dynamic Optimization System

## 论文信息

- **作者**: Manoj Franklin, Mark Ammerer, Talin Arlitt, Jeffrey Cox, James Dang, Will Dudley, Robert Finch, Tom Bergland, Matt Flinn, Charlie Gordon, Jeff Hawkins, David Olsifierski, Steve Reinke
- **会议**: OSDI 2000
- **机构**: Amazon.com, Inc.
- **链接**: https://dl.acm.org/doi/10.1145/349299.349303

---

## 一个日常类比

想象你在一家餐厅打工。第一天上班，你完全不知道厨房的规矩——锅在哪里、调料怎么放、每道菜做几步。你照着菜单一步一步来，动作慢，还容易出错。

但三个月后，你已经成了快手：你知道哪个调料瓶在右手边，知道先放油还是先放盐，甚至能预判客人的特殊需求。你不需要额外的训练课程——你只是**在实践中学习并变快**了。

Dynamo 做的事情和这个例子一模一样。它让程序在运行时自动"变聪明"，不需要程序员提前做任何优化工作。

---

## 问题背景

在 Dynamo 出现之前，程序有两种编译方式：

1. **静态编译**（如 C/C++）：在运行前一次性把代码变成机器指令。编译时可以做一些优化（比如把循环展开），但编译器看不到程序实际运行时才知道的信息。
2. **解释执行**（如早期 Python/Perl）：代码一行一行解释执行。灵活，但慢。

Dynamo 的出现引入了一种新模式：**JIT（Just-In-Time）编译**。程序先以普通方式运行，同时有一个"监工"在后台观察程序跑得多快、哪些代码最忙，然后悄悄把"忙代码"换成更快的机器指令。

关键要求是：**透明**。程序本身完全不知道自己被优化了。就像你学会了快速做饭，但你不会觉得有什么不一样——你就是变快了。

---

## 核心概念

### 1. 字节码解释器（Bytecode Interpreter）

Dynamo 处理的是 Java 字节码。Java 程序先被编译成一种中间形式（字节码），然后由解释器逐条执行。解释器慢，但它简单，而且**每一步都知道自己正在执行哪条指令**。

### 2. 代码缓存（Code Cache）

这是一块内存区域，存放已经被优化过的机器码。当一个函数被反复执行多次（超过阈值），Dynamo 就会把它翻译成机器码放进代码缓存。下次执行时，直接从缓存中取机器码跑，快得多。

### 3. 内联（Inlining）

把函数调用的代码直接"塞"到调用者的位置。比如 `main()` 调用 `greet()`，`greet()` 又调用 `print_hello()`。内联后变成一大块连续的代码，没有函数调用的开销。这就像把三步厨房工序合成一个动作完成。

### 4. 去虚拟化（De-virtualization）

Java 中有虚方法调用（根据对象的实际类型来决定调用哪个方法）。传统编译器不确定运行时是哪个类型，只能保守处理。Dynamo 在运行时知道了对象的真实类型，就可以去掉虚分派，直接调用确定版本。

### 5. 优化级别（Optimization Levels）

Dynamo 有三个级别：
- **Level 0**：字节码解释器，最慢但启动最快
- **Level 1**：简单优化，内联一些调用
- **Level 2**：激进优化，激进的分析和重写

级别越高越快，但也越复杂。Dynamo 会根据代码的热度自动升级。

### 6. 去优化（Deoptimization）

这是 Dynamo 最聪明的设计。如果运行时发现之前的优化假设错了（比如原来以为某个对象一定是 A 类型，结果来了个 B 类型），Dynamo 能**安全地回退到解释模式**，保证程序正确性。

这就像你学会快速做法后，发现客人点了你没做过的菜，你能安全地回到"慢慢看菜单做"的模式，而不会把厨房炸了。

### 7. 安全点（Safe Points）

JVM 在特定位置插入"检查点"，让 GC（垃圾回收）或去优化能够安全暂停程序。程序跑到这里会被暂停一下，然后可以切换到不同模式。

---

## 代码示例

### 示例 1：内联优化前后的对比

假设有这段 Java 代码：

```java
// 原始代码：三个函数层层调用
public int process(int x) {
    return doubleIt(x) + squareIt(x);
}

public int doubleIt(int x) {
    return x * 2;
}

public int squareIt(int x) {
    return x * x;
}
```

**优化前（解释执行）：**

每调用一次 `process()`，需要：
1. 执行 `doubleIt(x)` 的字节码——函数调用有开销
2. 执行 `squareIt(x)` 的字节码——又一个函数调用开销
3. 两条 `return` 指令

**优化后（Level 2 内联）：**

Dynamo 观察到 `process()` 被频繁调用，把 `doubleIt` 和 `squareIt` 的代码直接内联：

```java
// 内联后等价于：
public int process(int x) {
    return (x * 2) + (x * x);
}
```

没有函数调用开销，两个操作变成连续指令，CPU 的流水线跑得更顺。

### 示例 2：去虚拟化

```java
// 原始代码：虚方法调用
Animal animal = getRandomAnimal();
animal.speak();  // 运行时才知道是 Dog 还是 Cat

// Dog 和 Cat 都继承了 Animal，但 speak() 实现不同
```

传统编译器不知道 `animal` 具体是什么类型，每次都要查"虚方法表"（vtable），多了一步间接寻址。

Dynamo 在运行时观察到：
> "哦，过去 1000 次调用，`animal` 从来都是 `Dog` 类型"

于是生成优化后的机器码：

```java
// 去虚拟化后（Dynamo 生成的机器码逻辑等价于）：
Animal animal = getRandomAnimal();
if (animal instanceof Dog) {
    ((Dog) animal).speak();  // 直接调用，没有间接寻址
} else {
    // 如果假设错了，触发放回解释器的去优化路径
    animal.speak();  // 通用的虚调用
}
```

如果后来真的出现了一只 `Cat`，Dynamo 的安全点会检测到，程序安全地回退到解释模式，不会崩溃。

### 示例 3：去优化过程

```java
// 程序开始运行
MyClass obj = new MyClass();
obj.doWork();  // 被 Dynamo 编译为高度优化的机器码
obj.doWork();
obj.doWork();
// ... 重复多次，假设成立

// 后来，子类来了
class SubClass extends MyClass {
    @Override
    void doWork() {
        // 不同的实现
    }
}

SubClass sub = new SubClass();
sub.doWork();  // 触发去优化！之前的优化假设不成立了

// Dynamo 的反应：
// 1. 检测到类型变化
// 2. 暂停优化代码的执行
// 3. 恢复到解释器执行当前调用
// 4. 更新内联缓存信息
// 5. 未来可能重新编译一个新的优化版本
```

---

## 架构总览

```
                    ┌─────────────────────────┐
                    │    Java Application      │
                    │   (Bytecode, .class)     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Bytecode Interpreter   │
                    │   (Level 0 - 解释执行)    │
                    └────────────┬────────────┘
                                 │
              计数器触发编译       │       安全点暂停
                    ┌────────────▼────────────┐
                    │     Dynamo Compiler       │
                    │                           │
                    │  • 内联缓存 (Inline Cache) │
                    │  • 去虚拟化               │
                    │  • 分支预测                │
                    │  • 常量传播               │
                    └────────────┬────────────┘
                                 │
              生成优化的机器码     │       去优化时回退
                    ┌────────────▼────────────┐
                    │     Code Cache           │
                    │   (机器码存放区)          │
                    └─────────────────────────┘
```

---

## 性能表现

Dynamo 在 Amazon 的内部基准测试中表现出显著优势：

- 对于典型的企业级 Java 工作负载（Web 服务、批处理等），Dynamo 比纯字节码解释器快 **2-4 倍**
- 对于热点代码路径（反复执行的循环、高频方法调用），速度提升可达 **10 倍以上**
- 相比同年代的静态编译器，在某些动态特性丰富的应用中，Dynamo 甚至能获得更好性能，因为编译器能利用运行时信息做更精准的优化

代价是：
- **内存占用**：代码缓存需要内存空间
- **编译开销**：编译本身有成本
- **启动延迟**：Level 2 优化需要代码先"热身"才能发挥作用

---

## 历史意义

Dynamo 是**第一个生产级别的客户端 JIT 编译器**。它的技术遗产深远影响了后续所有 JIT 系统：

1. **Infer 字节码格式**：Dynamo 的字节码格式后来成为了 JVM 字节码设计的参考
2. **去优化技术**：证明了"假设-验证-回退"模式在生产环境中是可行的
3. **内联缓存**：动态虚方法调用的优化方案成为行业标准
4. **架构启发**：后续的 V8（JavaScript）、HotSpot JVM、.NET CLR 都借鉴了 Dynamo 的核心思想

Dynamo 最重要的贡献在于证明了一件事：**让程序自己在运行时学习并优化，比让程序员或编译器提前猜测要有效得多。**

---

## 关键术语

| 术语 | 说明 |
|------|------|
| JIT | Just-In-Time 编译，运行时编译 |
| 字节码 | 介于源代码和机器码之间的中间表示 |
| 内联 | 把被调用函数的代码直接嵌入调用处 |
| 去虚拟化 | 将不确定类型的虚调用转换为确定的直接调用 |
| 去优化 | 从优化后的代码回退到解释执行 |
| 安全点 | 程序运行中的检查点，用于暂停和安全切换 |
| 内联缓存 | 记录最近一次虚调用的目标，加速后续调用 |

---

## 思考题

1. 为什么说"透明"对 Dynamo 很重要？如果程序员需要手动标注"这里需要优化"，会有什么问题？
2. 去优化和"回退"听起来像是在降级，为什么设计者反而觉得它是优点？
3. Dynamo 用的是 Java 字节码。如果换成 Python，去虚拟化还会有效吗？为什么？

---

## 延伸阅读

- **HotSpot JVM**：Sun/Oracle 的 Java 虚拟机，采用了类似的 JIT 架构
- **V8 JavaScript Engine**：Google 的 JS 引擎，核心思想与 Dynamo 一脉相承
- **TRACEMONKEY**：Mozilla 的 JavaScript JIT 编译器，也是 Dynamo 的后继者之一
- **Self 虚拟机**：Chambers 等人的动态优化研究，是 Dynamo 重要的学术先驱
