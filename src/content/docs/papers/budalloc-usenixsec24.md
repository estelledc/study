---
title: "BUDAlloc: Defeating Use-After-Free Bugs by Decoupling Virtual Address Management from Kernel"
来源: https://www.usenix.org/conference/usenixsecurity24/presentation/ahn
日期: 2026-06-13
分类_原始: systems
分类: 基础设施
子分类: 系统安全
provenance: pipeline-v3
---

# BUDAlloc: Defeating Use-After-Free Bugs by Decoupling Virtual Address Management from Kernel

## 一、这是什么：一句话介绍

BUDAlloc 是一种运行在用户态的内存分配器，用来**防止和检测** C/C++ 中臭名昭著的 use-after-free (UAF) 漏洞。
它的核心创新在于：把"虚拟地址管理"这件原本属于内核的事，搬到了用户空间，和用户态分配器一起做"协同设计"。

## 二、use-after-free 问题：从日常类比开始

想象你租了一间公寓：

1. 你住了进去（`malloc`：分配内存并拿到钥匙）
2. 你搬走了，把钥匙还给了房东（`free`：归还内存）
3. 房东把房间租给下一个租户（这块内存被重新分配给另一个变量）
4. **bug 出现了**：你手里还留着旧钥匙，偷偷跑回去拿你的东西（UAF：你仍然用旧指针访问已被释放的内存）

在传统操作系统中，当内存被 `free` 时，内核只是把"这块物理内存可以被 reuse"标记上。
但旧的虚拟地址映射**不会立即消失**——你的旧指针仍然能读到那个地址的数据，哪怕数据已经是别人的了。

BUDAlloc 的做法是：**当你把钥匙还回去的时候，房东不只是标记房间空闲，而是直接把那张钥匙作废**。
这样下次你拿着旧钥匙开门时，门就打不开了（程序收到段错误，bug 被立即发现）。

## 三、传统方案的痛点

在看 BUDAlloc 之前，先理解"前人"是怎么做的，以及为什么不够好。

### 方案 A：一次性分配器（One-Time Allocators）

思路很简单：每个地址只能被成功使用**一次**。一旦该地址被 `free`，再访问就立刻触发错误。
这就像"一次性门卡"——用过就销毁。

但问题在于：**为了做到这一点，每次 `free` 都需要内核介入**，内核要去修改页表、移除虚拟地址映射。
在频繁的 `malloc/free` 场景下，这种"用户态到内核态"的切换（syscall）开销巨大。

### 方案 B：垃圾回收（Garbage Collection）

Java、Go 等语言用 GC 自动管理内存。
但垃圾回收有延迟——对象被"标记为可回收"到真正被回收之间有时间差，而且 GC 本身带来运行时开销。
对于 C/C++ 程序，我们不能随便加一个 GC 运行时。

### 关键矛盾

一次性分配器需要**内核参与**来即时失效地址，但内核参与意味着性能瓶颈。
BUDAlloc 要回答的问题就是：**能不能不让内核每次都参与？**

## 四、BUDAlloc 的核心思想：分离虚拟地址和物理地址

BUDAlloc 的设计基于一个简单观察：

> **虚拟地址映射（virtual address mapping）和物理内存管理（physical memory management）其实是两件事。**

内核管理的是物理内存的分配——它知道你用了多少 RAM。
但虚拟地址到物理地址的映射（页表），其实可以由用户空间来管理。

BUDAlloc 做了两件关键的事：

### 1. 用户态分配器管理虚拟地址布局

传统的 `malloc` 从堆顶增长，连续分配。BUDAlloc 不同：
- 它在用户态维护一个**虚拟地址布局表**，记录每个地址是否正在使用
- 当对象被 `free` 时，BUDAlloc 在用户态立即"标记"这个地址失效，而不是等内核操作
- 创建"虚拟别名"（virtual alias，即同一个物理地址对应多个虚拟地址）时，不需要 syscall，因为地址管理在用户态完成

这就像：传统方法是房东每换一个人就打电话给派出所改登记信息（syscall）。
BUDAlloc 是房东自己在本子上记——随时改，不用打电话。

### 2. 内核页表错误处理器的 eBPF 批处理

BUDAlloc 并不是完全绕过内核。当确实需要内核帮忙时（比如真正移除页表映射），
它使用 **eBPF**（extended Berkeley Packet Filter）来**批量处理** unmap 请求。

eBPF 允许你在内核中运行"小程序"，不需要修改内核源码。
BUDAlloc 把多个 `free` 请求攒在一起，一次性告诉内核："这些地址都不要了，帮我一起处理"。

这就像：不是每次换租客都让警察来一次，而是攒够一柜子再让警察来统一处理。

## 五、代码示例

### 示例 1：传统 UAF bug vs BUDAlloc 的检测

```c
// --- 传统代码：UAF bug ---
void vulnerable_function() {
    int *ptr = malloc(sizeof(int));  // 分配一个 int
    *ptr = 42;                        // 写入值
    free(ptr);                        // 释放内存，ptr 变成悬垂指针

    // BUG：ptr 指向的内存已经被释放，但指针还能用
    printf("%d\n", *ptr);             // use-after-free!
    // 传统情况：这个读操作可能"成功"，读到垃圾数据或旧数据
    // bug 延迟发生，极难调试
}

// --- BUDAlloc 下的同一代码 ---
// 当 free(ptr) 执行时，BUDAlloc 的分配器会在用户态记录：
//   ptr 指向的虚拟地址已被标记为"已释放"
// 同时，BUDAlloc 通过 eBPF 向内核提交 unmap 请求：
//   将该虚拟地址对应的页表项移除
// 所以 *ptr 访问时：
//   1. CPU 查页表 → 页表项不存在 → 触发页错误 (page fault)
//   2. 内核 eBPF 程序介入 → 确认该地址确实已被释放
//   3. 立即发送 SIGSEGV 信号 → 进程终止
// 结果：bug 被立即检测到，不会静默破坏数据
```

**理解关键点：**

在传统系统中，`free(ptr)` 只是把内存标记为"可用"。
在 BUDAlloc 下，`free(ptr)` 做了两件事：
1. 用户态：标记地址失效（零 syscall 开销）
2. 内核态：通过 eBPF 批量 unmap（批量处理减少 syscall 次数）

当 UAF 访问发生时，页错误让内核介入，内核确认这是非法访问后终止程序。

### 示例 2：BUDAlloc 的用户态分配流程

```c
// --- BUDAlloc 分配器内部逻辑（简化） ---

// 1. malloc 时：
void *budalloc_malloc(size_t size) {
    // 从用户态的地址布局表中找到一个空闲区域
    VirtualAddressSlot *slot = find_free_slot_in_user_table(size);

    // 申请一块物理内存（这个需要 syscall，但只发生一次）
    void *phys_mem = mmap_anonymous_page(size);

    // 在用户态记录映射关系
    slot->phys_addr = phys_mem;
    slot->in_use    = true;
    slot->free_time = 0;

    return (void *)slot->virt_addr;
}

// 2. free 时：
void budalloc_free(void *ptr) {
    // 在用户态直接标记（零 syscall）
    VirtualAddressSlot *slot = get_slot_for_address(ptr);

    slot->in_use  = false;
    slot->free_time = current_timestamp();

    // 将 unmap 请求加入批处理队列（不立即 syscall）
    batch_queue_add(ptr, slot->virt_addr);

    // 检查：如果这个地址被再次访问，BUDAlloc 的页错误处理
    // 会立即知道这是 UAF
}

// 3. 页错误处理（内核 eBPF）：
// 当任何程序访问了已被 free 的地址时，触发页错误：
//
// BPF_PROGRAM(page_fault_handler) {
//     addr = access_fault_address();
//     if (addr is in batch_queue) {
//         // 确认这是 use-after-free！
//         send_signal(SIGSEGV, "use-after-free detected at " + addr);
//         terminate_process();
//     }
//     // 如果不在批处理队列，说明是正常的首次访问，继续处理
//     allow_page_fault();
// }
```

## 六、架构全景图

```
┌──────────────────────────────────────────────────────────────┐
│                     用户空间 (User Space)                      │
│  ┌─────────────┐     ┌──────────────────┐     ┌────────────┐ │
│  │  BUDAlloc   │────▶│  虚拟地址布局表    │     │  批处理队列  │ │
│  │  分配器      │     │  (虚拟地址 → 物理  │     │  (攒 unmap │ │
│  │             │     │   地址映射)        │     │   请求)     │ │
│  └─────────────┘     └──────────────────┘     └─────┬──────┘ │
│                                                      │ mmap  │
└──────────────────────────────────────────────────────┼──────┘
                                                        │ syscall
┌──────────────────────────────────────────────────────┼──────┐
│                     内核空间 (Kernel Space)             │      │
│  ┌─────────────────────────────────┐   ┌──────────────┴──┐  │
│  │     页表 (Page Table)           │   │   eBPF 程序      │  │
│  │  虚拟地址 → 物理地址 映射         │   │  批量处理 unmap  │  │
│  │  (页错误时由 eBPF 介入检查)       │   │  检测 UAF 访问   │  │
│  └─────────────────────────────────┘   └─────────────────┘  │
│                                                              │
│  ┌─────────────────────────────────┐                         │
│  │     物理内存分配器               │                         │
│  │  (管理真实的 RAM 分配)           │                         │
│  └─────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────┘
```

## 七、核心概念总结

**虚拟别名（Virtual Alias）：** 同一个物理内存地址被映射到多个虚拟地址。
一次性分配器需要虚拟别名来实现"地址只能被一次使用"。
传统方案中，创建虚拟别名需要多次 syscall，开销巨大。
BUDAlloc 把虚拟地址管理移到用户态，创建虚拟别名不再需要 syscall。

**eBPF 批处理 Unmap：** eBPF 程序运行在内核中，当页错误发生时检查访问是否合法。
配合"批处理"机制，减少对内核的 syscall 次数。

**协同设计（Co-design）：** 用户态分配器和内核不是独立工作的，而是作为一个系统来设计。
这是 BUDAlloc 最核心的设计哲学。

## 八、性能效果

论文在 SPEC CPU 2017 基准测试集上做了实验：

| 对比项 | 结果 |
|--------|------|
| 相比 DangZero（另一个一次性分配器） | 性能提升 15% |
| 相比 FFmalloc 的内存开销 | 减少 61% |
| 相比 AddressSanitizer（ASan） | 运行开销大幅更低 |

这些结果说明 BUDAlloc 在安全和性能之间找到了更好的平衡点。

## 九、为什么这个工作重要

1. **不用改代码**：BUDAlloc 可以保护未修改的二进制文件（unmodified binaries），不需要重新编译源程序
2. **即时检测**：不像 GC 有延迟，UAF bug 发生即发现
3. **高性能**：通过用户态管理虚拟地址 + eBPF 批处理，减少了最多的 syscall 开销
4. **架构启示**：它提出了"虚拟地址管理和物理内存管理可以分离"这个思路，可能对其它内存安全问题也有启发

## 十、进一步思考

BUDAlloc 解决了"用户态和内核态如何协作管理内存"这个大问题。
一个值得思考的问题是：如果虚拟地址管理可以在用户态做，那么内核中还有哪些功能是可以"下放"给用户空间的？
这涉及到操作系统设计中一个根本性问题——微内核 vs 宏内核的争论在内存管理系统中的具体体现。
