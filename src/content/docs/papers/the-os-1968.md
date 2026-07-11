---
title: THE 1968 — Dijkstra 用分层 + 信号量造出第一个可证明的 OS
来源: Dijkstra, "The Structure of the THE-Multiprogramming System", CACM 1968
日期: 2026-05-31
分类: 操作系统
难度: 中级
---

## 是什么

THE 是 Dijkstra 1968 年在荷兰 Eindhoven 工业大学（Technische Hogeschool Eindhoven，缩写 THE）造出的一个操作系统，跑在一台叫 Electrologica X8 的机器上。

它是历史上**第一个**故意把自己切成"严格分层"的 OS——每一层只调用比它更底层的层，从不反向求救。今天教科书里画的"OS 5 层模型"就是从这篇论文来的。

日常类比：盖房子时如果地基、承重墙、装修、家具乱接线，一处坏了全塌。Dijkstra 强行规定"水电工不能改地基，装修工不能拆承重墙"，这样每一层都能独立验收。

## 为什么重要

不理解 THE，下面这些事都没法解释：

- 为什么 Linux 内核里 `mm/`（内存管理）从不直接调 `fs/`（文件系统）——这是 THE 留下的依赖偏序律
- 为什么 Python `threading.Semaphore` / Go `sync.Semaphore` / Java `java.util.concurrent.Semaphore` 三家用同一个名字、同一套 P/V 语义——都是 THE 论文定义的
- 为什么"无 MMU 的小机器"也能跑虚拟内存——THE 用软件分页证明了这件事可行，启发了后来嵌入式 OS
- 为什么 1972 年图灵奖颁给 Dijkstra，颁奖词第一条就是"程序设计语言研究"——THE 让 OS 也变成"可以推理的程序"

## 核心要点

THE 系统结构 = **三件套**：

1. **6 层依赖偏序**。从下到上：

   - 第 0 层：CPU 调度（处理器在多个进程间切换）
   - 第 1 层：内存分页（主存 + 鼓型外存的换页，软件实现）
   - 第 2 层：操作员控制台（人机交互的串行通道）
   - 第 3 层：I/O 缓冲（输入输出设备的逻辑抽象）
   - 第 4 层：用户进程（5 个静态进程，跑 ALGOL 60 程序）
   - 第 5 层：操作员（坐在控制台的人）

   关键：第 N 层只看得见第 0..N-1 层。这让每层可以**独立证明**正确性，再独立测试。

2. **信号量（semaphore）**。Dijkstra 在论文里第一次正式定义 P 操作（请求资源，资源减一，不够就阻塞）和 V 操作（释放资源，资源加一，唤醒等待者）。日常类比：图书馆的"今日剩余阅览座位"牌，借走翻一格，还回来翻一格，没座位的人在门口排队，不在屋里转圈找。

3. **顺序进程（sequential process）**。每个进程对程序员来说像一个独立的串行程序，不用关心被切了多少刀，OS 在切换时保证状态一致。这是"线程"概念的原型。

三件套合起来让"并发系统"第一次可被人类大脑装下并形式化论证。

## 实践案例

### 案例 1：信号量限并发——爬虫最多 3 个线程同时下载

```python
import threading
sem = threading.Semaphore(3)  # 资源 = 3

def download(url):
    sem.acquire()           # P 操作：减一，没了就阻塞
    try:
        fetch(url)
    finally:
        sem.release()       # V 操作：加一，唤醒一个等待者
```

这就是 1968 年 Dijkstra 设计的 P/V 直接搬到 Python。`acquire`/`release` 必须**成对**——漏掉 release 一次，资源永久少一个，最终全员阻塞。

### 案例 2：分层依赖偏序在现代代码里的影子

Linux 源码树下：

```
linux/
  mm/        ← 第 1 层：内存管理
  fs/        ← 第 3 层：文件系统（依赖 mm）
  net/       ← 第 3 层：网络（依赖 mm）
  drivers/   ← 第 4 层：设备驱动（依赖 mm + fs/net）
```

`mm/` 里的代码**只能** `#include` 更底层（kernel 核心、调度器）。如果 `mm/` 里的某个函数想调 `fs/`，code review 会被打回——这是 THE 留下的纪律。

### 案例 3：软件分页——没有 MMU 也能虚拟内存

Electrologica X8 没有 MMU，硬件不会在缺页时中断。Dijkstra 让编译器在生成代码时**主动插入**"检查页是否在主存"的判断；不在就调 OS 把页从鼓上换进来。

今天 Lua 的"协作式 GC 检查点"、JavaScript 引擎的"safepoint"用的是同一个套路——硬件不给中断，软件自己插检查点。

### 案例 4：用 P/V 写一个生产者-消费者

```python
import threading, queue
buf = queue.Queue(maxsize=10)
empty = threading.Semaphore(10)   # 空槽数
full  = threading.Semaphore(0)    # 满槽数

def producer(item):
    empty.acquire()    # P：先抢空槽
    buf.put(item)
    full.release()     # V：多了一个满槽

def consumer():
    full.acquire()     # P：先抢满槽
    item = buf.get()
    empty.release()    # V：多了一个空槽
    return item
```

两个信号量配合，不需要任何 `while sleep` 轮询。Dijkstra 当年的"消除忙等待"在这 12 行代码里看得最清楚。

## 踩过的坑

1. **把 THE 当成多用户分时系统**：错。它是**批处理多任务**，5 个进程**静态固定**，不能像 UNIX `fork()` 任意起新进程。THE 的目标是"几个固定任务可证明地共存"，不是"任意用户登录"。

2. **把 6 层等同于现代"分层架构美学"**：错。Dijkstra 的层是**严格的依赖偏序**，目的是让每层**孤立可证**——不是为了"代码组织好看"。MVC 三层、DDD 四层都是后人改的版本，已经丢掉了"可证"这个原始动机。

3. **以为 semaphore 就是 mutex**：semaphore 是**计数器**，mutex 只是 binary semaphore（计数器=1）的一种用法。semaphore 还能做生产者-消费者（用两个）、读者-写者、屏障同步——比 mutex 表达力大一截。

4. **以为软件分页 = 现代虚拟内存**：THE 的分页**没有 page fault 中断**，靠编译器插换页调用。现代 OS 用硬件 MMU + page fault 才有"任何指令任何时刻都能换页"的透明性。理解这层差异，才能明白"为什么嵌入式实时 OS 至今爱用 THE 式软件方案"。

## 适用 vs 不适用场景

**适用**：

- 任何"几个固定任务并发，要求可推理"的系统——嵌入式 RTOS、火箭飞控、医疗设备
- 教学场景：第一次讲清楚"什么叫并发原语"
- 微内核 / seL4 / CertiKOS 这类"要写形式化证明的 OS"——它们的分层比 THE 还严格

**不适用**：

- 多用户分时通用 OS（UNIX / Linux）——分层在这里只是组织约定，不再强制
- 需要 fork/exec 任意进程的系统——THE 的静态进程数模型撑不住
- 现代 SMP 多核机器——P/V 在多核下要加内存屏障，比 1968 年单 CPU 复杂得多

## 历史小故事（可跳过）

- **1965 年**：Dijkstra 已经在论文 Cooperating Sequential Processes 里提出"顺序进程 + 信号量"的雏形，但还没落到一个完整 OS 里。
- **1968 年**：THE 系统在 Eindhoven 工业大学跑通；同年他在 CACM 写下著名的 "GOTO Considered Harmful"——两件事是同一个思想：**结构是可证明性的前提**。
- **1972 年**：图灵奖颁给 Dijkstra，颁奖词同时提到 THE 与他的程序设计语言贡献。
- **1973-1974 年**：Hoare 发表 monitor 论文（[[hoare-logic]] 之后又一篇影响深远的并发原语论文），UNIX 在 Bell Labs 跑通。两者都把 THE 的分层与同步原语变成行业标配。

## 学到什么

1. **结构本身是一种证明**——把系统切对，每层小到能装进脑子，正确性才有谈的余地
2. **信号量 = 把"等待"从忙等变成阻塞**——这是从"轮询"到"事件驱动"的第一次范式转移
3. **依赖偏序 > 模块划分**——前者强制单向，后者只是命名；强制才有红线，红线才有纪律
4. **可推理 > 灵活**——THE 故意限制成 5 个静态进程，换来了"我能证明它无死锁"。这个权衡在现代 RTOS 里仍然有效

## 延伸阅读

- 论文 PDF：[Dijkstra EWD196](https://www.cs.utexas.edu/users/EWD/ewd01xx/EWD196.PDF)（10 页，密度高，读完就懂分层为什么重要）
- 视频：[Operating Systems: Three Easy Pieces — Concurrency 章节](https://pages.cs.wisc.edu/~remzi/OSTEP/)（免费 OS 教材，把 P/V 讲到能动手写）
- 自己动手：用 Python `threading.Semaphore` 写一个生产者-消费者，再不用任何同步原语写一遍对比，体会"消除忙等待"
- [[dijkstra-goto]] —— 同年另一篇，"结构 vs 跳转"的姊妹论证
- [[dijkstra-shortest-path]] —— 同一作者的算法名作，思想风格一脉相承

## 关联

- [[dijkstra-goto]] —— 同作者同年，把"程序结构"思想从 OS 推广到所有代码
- [[dijkstra-shortest-path]] —— 同作者，证明"贪心 + 不变式"的早期范本
- [[hoare-logic]] —— 1969 年用前置/后置条件给程序写证明，THE 是它的工程对应物
- [[certikos-2016]] —— 半个世纪后用 Coq 给"分层 OS"补上完整数学证明
- [[hyperkernel-2017]] —— 用 SMT 自动验证微内核，THE 思想 + 现代自动化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[denali-2002]] —— Denali — 在一台机器上同时跑上千个轻量 VM 的早期实验
- [[dijkstra-goto]] —— Dijkstra 1968 — Go To Statement Considered Harmful
- [[exokernel-1995]] —— Exokernel — 把抽象推到用户态的极致设计
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[hoare-monitors-1974]] —— Hoare Monitors 1974 — 把锁和等待队列封进一个房间
- [[l4-1995]] —— L4 — Liedtke 用 12KB 内核反驳"微内核必然慢"
- [[linux-kernel]] —— Linux kernel — 三层解释开源内核如何协作
- [[soltesz-2007]] —— Soltesz 2007 — 容器：比虚拟机轻一档的隔离方案
