---
title: Endokernel: A Thread Safe Monitor for Lightweight Subprocess Isolation
来源: https://www.usenix.org/conference/usenixsecurity24/presentation/yang-fangfei
日期: 2026-06-13
分类: 安全与隐私
子分类: 系统安全
provenance: pipeline-v3
---

# Endokernel：轻量级进程隔离的安全监控器

## 一、什么是"隔离"？从一个日常类比开始

想象一栋公寓楼，每间公寓住着一家人。理想情况下，A 家着火不会烧到 B 家。操作系统把每个程序当作一间独立的"公寓"——这就是**进程隔离**。

但现实中有个问题：为了效率，程序之间经常需要互相打电话（系统调用，比如"打开一个文件"）。如果每通电话都要绕到物业（内核）转一圈，那楼就慢了。

于是有人想：不如在每间公寓里装一个**保安亭**（monitor），由保安代替业主去跟物业打交道。这样，保安既能保证业主不会偷藏危险品，又能少跑几趟腿。

Endokernel 就是这样一个"保安亭"——它放在进程内部，拦截所有系统调用，在它们真正到达操作系统内核之前，先过一遍安全检查。

## 二、核心问题：为什么现有的方案不够好？

操作系统的安全机制通常有两种部署方式：

**方式一：在进程外面监控**（如 seccomp-bpf、cgroups）
- 安全：保安站在大楼门口检查每个人
- 代价：每次通信都要出大楼，性能差

**方式二：在进程里面监控**（如 Firejail 的 namespace 隔离、某些容器技术）
- 快：保安就在公寓里，不需要出门
- 代价：保安本身也是进程的一部分，如果被黑客攻破了保安亭，整座楼就危险了

Endokernel 要解决的，就是方式二的安全漏洞——**保安亭本身可能被绕过**。

### 绕过手段：OS 原语

即使保安亭在进程内部，如果操作系统提供了某些特殊的系统调用接口，攻击者可以直接"跳过硬检查"。比如：

- `ptrace`：一个进程可以操控另一个进程的状态
- `clone()` 带特定标志：可以创建与父进程共享内存的子进程

这些原语就像公寓里隐藏的"秘密通道"，保安没注意到，攻击者就能利用它们逃出沙箱。

## 三、Endokernel 的核心设计

### 3.1 "由内到外"的分析方法

Endokernel 的做法不是盲目地拦截所有系统调用，而是：

1. 先找出哪些**操作系统原语**可以被用来绕过监控
2. 从这些原语反向推导，找到依赖它们的所有系统调用接口
3. 为每个接口补充缺失的安全策略

这种方法叫做**inside-out methodology**（由内到外方法论）。

### 3.2 线程安全的监控器

一个复杂的程序往往有多个线程在同时运行。如果每个线程都在调用系统调用，而保安亭只有一个，那就需要**锁**（lock）来保证安全：

```
线程 A：我要打开一个文件
线程 B：我要创建一个新进程  ← 两个线程同时行动！

如果保安亭没有锁：
  线程 A 的请求先被处理
  线程 B 的请求紧跟着被处理
  但两个请求可能"交叠"，导致状态不一致

如果有锁：
  线程 A 先拿到锁 → 处理请求 → 释放锁
  线程 B 等锁释放 → 拿到锁 → 处理请求 → 释放锁
  保证安全
```

Endokernel 引入了**细粒度的锁机制**（fine-grained locking），对不同类别的系统调用使用不同的锁，而不是粗暴地全部串行化。这样既保证了安全性，又不会让性能降到地板上。

## 四、代码示例

### 示例一：监控器拦截系统调用

下面是一个简化的概念示例，展示 Endokernel 如何在用户态拦截并检查系统调用：

```c
// 简化的系统调用拦截器
// 在实际的 Endokernel 中，这部分代码通过拦截 libc 函数
// 来捕获所有系统调用

typedef struct {
    policy_set_t allow_list;     // 允许的策略集合
    pthread_mutex_t monitor_lock; // 细粒度锁
} endokernel_monitor_t;

// 拦截 open() 系统调用
int open(const char *path, int flags, ...) {
    // 1. 先获取监控器的锁
    pthread_mutex_lock(&monitor.monitor_lock);

    // 2. 检查策略：这个路径是否被允许访问？
    if (!policy_check(&monitor.allow_list, path, flags)) {
        // 策略拒绝，返回错误
        pthread_mutex_unlock(&monitor.monitor_lock);
        errno = EACCES;
        return -1;
    }

    // 3. 策略通过，调用真正的 open
    int fd = real_open(path, flags);

    // 4. 释放锁
    pthread_mutex_unlock(&monitor.monitor_lock);
    return fd;
}
```

这个模式的关键在于：`real_open` 是 Endokernel 保存的原始系统调用指针，而外层的 `open` 是我们拦截后的版本。所有对 `open` 的调用都会先经过策略检查。

### 示例二：细粒度锁策略

Endokernel 对不同类别的系统调用使用不同的锁，避免不必要的等待：

```c
// 细粒度锁管理
typedef struct {
    pthread_mutex_t fd_lock;        // 文件描述符操作锁
    pthread_mutex_t net_lock;       // 网络操作锁
    pthread_mutex_t process_lock;   // 进程创建锁
    pthread_mutex_t mem_lock;       // 内存管理锁
} fine_grained_locks_t;

// 根据系统调用类型选择合适的锁
int monitored_syscall(int syscall_id, void *args) {
    switch (syscall_id) {
        case SYS_open:
        case SYS_read:
        case SYS_write:
            pthread_mutex_lock(&locks.fd_lock);
            break;

        case SYS_socket:
        case SYS_connect:
        case SYS_sendto:
            pthread_mutex_lock(&locks.net_lock);
            break;

        case SYS_clone:
        case SYS_fork:
        case SYS_execve:
            pthread_mutex_lock(&locks.process_lock);
            break;

        case SYS_mmap:
        case SYS_munmap:
            pthread_mutex_lock(&locks.mem_lock);
            break;
    }

    // 执行安全检查
    int result = execute_check(syscall_id, args);

    // 释放对应的锁
    switch (syscall_id) {
        case SYS_open: case SYS_read: case SYS_write:
            pthread_mutex_unlock(&locks.fd_lock);
            break;
        // ... 其他 case
    }

    return result;
}
```

这样做的好处是：文件操作和网络操作可以**并发执行**，不需要互相等待，因为它们在语义上没有冲突。只有相同类别的操作才需要排队。

## 五、Endokernel 解决了什么问题？

### 5.1 找到的缺失策略

通过 inside-out 分析，Endokernel 发现了一些之前没有被考虑到的安全漏洞：

- 某些系统调用的变体没有被策略覆盖
- 多线程环境下，系统调用的执行顺序可能导致状态不一致
- 一些不太常用的系统调用可以被用作绕过手段

### 5.2 性能与安全兼顾

Endokernel 的目标是：

| 维度 | 传统进程隔离 | Endokernel |
|------|-------------|-----------|
| 安全性 | 监控器在进程内，可能被突破 | 细粒度锁 + 完整策略覆盖 |
| 性能 | 在进程内，开销小 | 在进程内，开销同样小 |
| 线程安全 | 通常不考虑 | 专门设计细粒度锁 |
| 向后兼容 | 可能破坏现有程序 | 模拟 OS 接口，兼容现有程序 |

## 六、关键概念回顾

| 概念 | 解释 |
|------|------|
| **Compartmentalization**（分区化） | 把程序拆成多个隔离部分，一个被攻破不影响其他部分 |
| **Monitor**（监控器） | 拦截并检查系统调用的安全组件 |
| **System Call**（系统调用） | 程序向操作系统内核请求服务的接口 |
| **Inside-out Methodology**（由内到外） | 从可被滥用的 OS 原语出发，反向推导需要覆盖的接口 |
| **Fine-grained Locking**（细粒度锁） | 对不同类别的共享资源使用独立的锁，提高并发度 |
| **Backwards Compatibility**（向后兼容） | 不改程序代码就能运行的能力 |

## 七、思考

Endokernel 给我们一个重要的启示：**安全不是"加一道锁"那么简单**。当一个监控系统本身运行在被监控的程序内部时，它面临的是一个更复杂的安全挑战——你需要确保监控系统本身不会因为多线程竞争、系统调用原语的复杂性而被绕过。

这种"由内到外"的分析方法，对于任何需要在既有系统之上添加安全层的场景，都有参考价值。

## 参考文献

1. Yang, F., Im, B., Huang, W., et al. "Endokernel: A Thread Safe Monitor for Lightweight Subprocess Isolation." *33rd USENIX Security Symposium*, 2024, pp. 145-162.
