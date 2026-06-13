---
title: "MMTk — 通用 GC 框架"
来源: "https://github.com/mmtk/mmtk-core"
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# MMTk — 通用垃圾回收框架

## 一、从生活类比开始

想象你是一家大型图书馆的馆长。图书馆有几百万本书（这就是程序运行时分配的「对象」），每天有成千上万的读者（程序线程）来借书还书。

传统的管理方式是：每个读者自己记一个小本子，借了什么、还了什么，自己管自己。等到书架满了（内存不够了），才手忙脚乱地整理——把没人读的书清理掉。这种方式简单，但效率低，而且每个人整理的标准不一样。

MMTk 做的事情，相当于给图书馆请了一个**统一的后勤团队**：

- 借书（分配内存）有统一流程
- 整理书架（垃圾回收）有统一策略
- 但不同语言（Java、JavaScript、Rust 等）可以告诉这个团队「我们馆的特殊规则是什么」

**一句话总结：MMTk 不是垃圾回收器本身，而是一个「制造垃圾回收器的工具包」。**

## 二、MMTk 是什么

MMTk（Memory Management ToolKit）是一个用 Rust 编写的**通用内存管理框架**。它的核心思想是：

> 不要把 GC 写死在某个语言虚拟机里，而是把它拆成可以拼装、可以替换的模块。

就像乐高积木，你可以选不同的「计划」（Plan，即 GC 算法），不同的「分配器」（Allocator），拼出适合你的 GC。

项目主页：[github.com/mmtk/mmtk-core](https://github.com/mmtk/mmtk-core)

## 三、核心概念

### 1. Plan（计划）= GC 算法

Plan 是 MMTk 里最核心的概念，它决定垃圾回收怎么工作。常见的 Plan 包括：

- **Immix**：把内存切成小方块（scanna block），标记哪些方块"可能"有垃圾，只扫描那些方块
- **GenImmix**：Immix 的增强版，把内存分新生代和老生代，优先清理新生代（因为年轻人死得快）
- **Semispace**：最简单的分代 GC，把内存分成两半，轮流清空

### 2. Mutator（突变者）= 正在运行的程序线程

在 GC 术语里，"mutator"指的是你的程序本身——它在"突变"内存状态（分配和修改对象）。每个运行线程对应一个 Mutator 对象。

### 3. VMBinding（虚拟机绑定）= 语言和 MMTk 之间的翻译官

MMTk 不直接和 Java、JavaScript 对话。它通过 VMBinding 接口：

- 让语言**调进** MMTk（"帮我分配一块内存"）
- 让 MMTk **调进**语言（"我要暂停一下来做 GC"）

### 4. Barrier（屏障）= 内存修改的安检门

当程序修改一个对象里的引用字段时，MMTk 需要知道这件事（比如跟踪引用关系）。Barrier 就是在每次修改前/后触发的检查机制。

### 5. Work Bucket & Scheduler（工作桶与调度器）= GC 任务的分工表

GC 不是一个人干的。MMTk 把回收工作拆成很多小包（Work Packet），分给多个线程并行处理。

## 四、代码示例

### 示例一：初始化一个 MMTk 实例

这是虚拟机（比如 JikesRVM 或自定义语言）接入 MMTk 的第一步。相当于"启动后勤团队"：

```rust
// 1. 创建一个构建器，配置 GC 策略
let mut builder = MMTKBuilder::new();
builder.set_option("plan", "immix");
builder.set_option("threads", "4");

// 2. 用构建器建造 MMTk 实例
let mmtk = mmtk_init(&builder);
```

这里 `MMTKBuilder` 就像是一个"遥控器"，你可以切换 Plan、调线程数、开调试选项。`mmtk_init()` 则真正启动整个内存管理系统。

### 示例二：程序分配一个对象

当你的程序需要创建对象时（比如 `new String("hello")`），它会调用 MMTk 的分配 API：

```rust
// 获取当前线程的 Mutator（相当于"借阅证"）
let mut mutator = bind_mutator(&mmtk, current_thread_tls);

// 请求分配 128 字节、8 字节对齐的对象
let address = alloc(
    &mut mutator,
    128,          // 需要的大小（字节）
    8,            // 对齐要求
    0,            // 对齐偏移
    AllocationSemantics::DEFAULT,  // 普通对象
);

// alloc() 返回的地址就是新对象的起始位置
// 如果内存不足，MMTk 会自动触发 GC 再重试
```

`alloc()` 是最常用的接口。它的智能之处在于：**如果内存不够，它不会直接报错，而是先尝试触发垃圾回收，回收完了再重试**。这相当于图书馆管理员先整理书架，腾出空间后再借书给你。

### 示例三：手动触发垃圾回收

当程序觉得"该整理一下了"：

```rust
// 请求一次 GC（这是一个提示，MMTk 可能忽略它）
handle_user_collection_request(&mmtk, current_thread_tls);

// 或者检查已用/可用内存
let used = used_bytes(&mmtk);
let free = free_bytes(&mmtk);
println!("已用: {} 字节, 空闲: {} 字节", used, free);
```

## 五、MMTk 的工作流程

```
你的程序调用 alloc()
       |
       v
   Mutator 分配对象
       |
       v (内存不够了)
   MMTk 触发 GC
       |
       v
   Scheduler 分发工作包
       |
       v   GC Workers 并行扫描、清理、整理
       |
       v   通知语言"GC 完成"（Resume mutators）
       |
       v
   回到分配，继续
```

## 六、为什么需要 MMTk

如果没有 MMTk，每种语言的 GC 都要从零开发：

- Java (HotSpot) 自己写了一套 GC
- JavaScript (V8) 自己写了一套 GC
- 每种实现都不同，研究新的 GC 算法要反复造轮子

有了 MMTk：

- 研究者写一个 Plan，就能在多个语言上测试
- 语言开发者不需要懂 GC 细节，接入就行
- 社区积累了可复用的组件（分代、压缩、标记-整理...）

## 七、已知绑定

MMTk 官方维护了三个 VM 绑定：

| 绑定 | 语言 |
|------|------|
| mmtk-openjdk | Java (OpenJDK) |
| mmtk-jikesrvm | Java (JikesRVM) |
| mmtk-v8 | JavaScript (V8) |

## 八、延伸思考

用开头图书馆的类比收尾：

> MMTk 不决定图书馆该怎么整理书架——它提供的是整理书架的**工具、流程和团队调度系统**。真正决定"按什么规则整理"的，是 Plan。这就像给了你一套工业级的图书馆自动化系统，你可以选择最适合作馆（编程语言）的那套方案。

## 九、学习要点回顾

- MMTk = 内存管理的"乐高积木框架"，不是某个具体的 GC
- Plan 决定了 GC 算法（Immix / GenImmix / Semispace...）
- VMBinding 是语言与 MMTk 之间的翻译层
- Mutator 代表正在运行的程序线程
- Barrier 跟踪内存引用变化，辅助 GC 正确性
- alloc() 会在内存不足时自动触发 GC，无需手动干预
- 用 Rust 编写，追求性能和安全性
