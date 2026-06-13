---
title: "Boehm-Demers-Weiser GC — 经典保守式垃圾回收器"
来源: https://github.com/ivmai/bdwgc
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Boehm-Demers-Weiser GC — 经典保守式垃圾回收器

## 一、从"自动倒垃圾"说起

想象你住在一个小区里，每个住户家里都有垃圾袋。

**手动管理内存**就像你自己每天把垃圾袋拎下楼扔进垃圾桶——你需要记住什么时候满了、往哪个桶里扔、扔完之后袋子还在不在手里。

**Java/Python 的精确 GC**像是一个智能保洁阿姨，她拿着每户人家的"物品清单"，知道哪个袋子里装的是垃圾、哪个袋子里还装着有用的东西（比如一张照片）。她只扔掉真正的垃圾。

**BDWGC 的保守式 GC**像是另一个版本的保洁阿姨——她**不看清单**。她走进房间，看到地上有个袋子，就看看袋子里面有没有"看起来像地址的东西"（比如一串数字，长得像指向其他房间的编号）。如果有，她就认为这个袋子"可能还有人引用"，不扔；如果没有，她就扔。

这种"看起来像就留着"的策略就是**保守（conservative）**的含义：宁可错留，不可错扔。

## 二、它是什么

Boehm-Demers-Weiser Garbage Collector（简称 BDWGC，也叫 libgc、boehm-gc）是一个用于 C/C++ 的**可插拔式垃圾回收器**。它的核心设计理念非常简单：

> 把你代码里的 `malloc` 换成 `GC_malloc`，把 `free` 删掉，程序就能自动回收不再使用的内存。

它由 Hans Boehm、Alan Demers 和 Mark Weiser 在 1988-1991 年间提出，是最早被广泛使用的实用化 GC 之一。至今仍在大量项目中运行：LLVM、WebKit、Mono、GIMP、R 语言运行时……

## 三、核心概念

### 3.1 标记-清除（Mark-Sweep）

BDWGC 使用经典的标记-清除算法，分两步：

1. **标记（Mark）**：从程序的"根集合"（全局变量、栈上的局部变量、寄存器）出发，沿着指针找到所有可达的对象，把它们标记为"活着"。
2. **清除（Sweep）**：扫描整个堆，把所有没被标记的对象回收，归还给操作系统。

### 3.2 保守式（Conservative）指针识别

这是 BDWGC 最核心的创新。在 Java 中，运行时知道每个变量的类型，所以能精确判断某个值是不是指针。但在 C 语言中，没有类型信息——一个 `unsigned long` 的值可能恰好等于某个对象的地址。

BDWGC 的做法是：**把内存中的每一个字（word）都当作"可能是指针"来检查**。如果这个字的值落在某个已分配对象的地址范围内，就认为它是指针，这个对象就不能回收。

```
内存布局示意：
┌──────────────┐
│  int a = 42  │  ← 对象 A，地址 0x1000
├──────────────┤
│  char *p     │  ← 栈上的指针，值 = 0x1000
├──────────────┤
│  int x       │  ← 栈上普通整数，值 = 0x1000（碰巧和 A 的地址一样！）
└──────────────┘
```

保守式 GC 看到栈上两个值都是 `0x1000`，都会认为它们指向对象 A。区别在于：精确 GC 知道 `p` 是指针、`x` 不是；保守式 GC 两个都当成指针处理。

**代价**：可能导致一些其实已经没用的对象因为"碰巧有数字长得像地址"而不会被回收。但实际使用中，这种"假阳性"通常不会导致严重问题——内存用量只会略微偏高，不会出错。

### 3.3 原子对象（Atomic Objects）

有些内存块里面**肯定不包含指针**，比如字符数组 `char buffer[1024]`。BDWGC 提供了 `GC_malloc_atomic`，告诉回收器："这块内存里没有指针，扫描时可以跳过。"这样能显著加快回收速度。

### 3.4 增量与分代收集

默认情况下，BDWGC 在执行标记阶段会暂停你的程序（Stop-The-World）。但对于大堆场景，可以通过 `GC_enable_incremental()` 启用**增量收集**——把标记工作拆成很多小步，每次分配时做一点点，减少单次停顿时间。

## 四、代码示例

### 示例 1：基本用法——替换 malloc

这是最简单的使用方式，直接把 `malloc` 换成 `GC_malloc`：

```c
#include <stdio.h>
#include <gc.h>

typedef struct Node {
    int value;
    struct Node *next;
} Node;

int main(void) {
    // 用 GC_malloc 代替 malloc —— 不需要 free！
    Node *n1 = GC_malloc(sizeof(Node));
    n1->value = 1;

    Node *n2 = GC_malloc(sizeof(Node));
    n2->value = 2;
    n1->next = n2;

    // 断掉引用链
    n1->next = NULL;
    // n2 现在没有人引用了，GC 会自动回收它

    printf("n1 value: %d\n", n1->value);
    return 0;
}
```

编译方式：

```bash
gcc -o demo demo.c -lgc
```

运行后，`n2` 指向的内存会在某个 GC 周期被自动回收。你不需要写任何 `free`。

### 示例 2：原子分配 + 最终化器

展示两种高级特性：原子分配（用于纯数据）和最终化器（类似析构函数）：

```c
#include <stdio.h>
#include <gc.h>

// 最终化器：对象被回收前调用
void my_finalizer(void *obj, void *data) {
    printf("[Finalizer] 对象 \"%s\" 被回收了\n", (char *)data);
}

int main(void) {
    // 1. 原子分配：这块内存里没有指针，扫描更快
    char *buffer = GC_malloc_atomic(1024);
    snprintf(buffer, 1024, "Hello, GC!");
    printf("Buffer: %s\n", buffer);

    // 2. 注册最终化器
    int *counter = GC_malloc(sizeof(int));
    *counter = 42;
    GC_register_finalizer(counter, my_finalizer, "计数器", 0);

    // 3. 手动触发 GC 来看看效果
    GC_gcollect();

    return 0;
}
```

编译：

```bash
gcc -o demo2 demo2.c -lgc
```

输出：

```
Buffer: Hello, GC!
[Finalizer] 对象 "计数器" 被回收了
```

`GC_gcollect()` 是手动触发垃圾回收的函数。正常情况下 GC 会根据内存使用情况自动触发。

## 五、优缺点总结

**优点：**
- 对现有 C 代码改动极小，几乎可以零改造接入
- 不会"错误回收"——保守策略保证了安全性
- 性能接近 malloc/free，对小对象甚至更快
- 支持多线程、增量收集、最终化器
- 经过三十多年实战检验，极其稳定

**缺点：**
- 保守式策略可能导致内存占用偏高（假阳性指针）
- 不支持移动对象（moving GC），无法实现压缩式内存管理
- 不是实时 GC——大堆时停顿时间会变长
- 标准 `malloc` 分配的内存中的指针，GC 看不到

## 六、学习路线建议

1. 先跑通上面的两个示例，感受"不用 free 也能工作"
2. 读 `docs/simple_example.md` 中的官方入门示例
3. 了解 `GC_malloc` vs `GC_malloc_atomic` 的性能差异
4. 进阶阅读 Boehm 1988 年原始论文《Garbage Collection in an Uncooperative Environment》

## 七、参考

- GitHub: https://github.com/ivmai/bdwgc
- 原始论文: Boehm & Weiser, SPE 1988
- 官方文档: http://www.hboehm.info/gc/
- Stack Overflow 标签: [boehm-gc](https://stackoverflow.com/questions/tagged/boehm-gc)
