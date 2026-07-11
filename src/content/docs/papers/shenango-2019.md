---
title: Shenango — 每 5 微秒重新分一次核的中央调度器
来源: 'Ousterhout et al., "Shenango: Achieving High CPU Efficiency for Latency-sensitive Datacenter Workloads", NSDI 2019'
日期: 2026-06-01
分类: 系统
难度: 中级
---

## 是什么

Shenango 是一套**让延迟敏感服务和批处理任务共享同一台机器、却互不影响**的运行时。它的核心动作只有一个：**每 5 微秒**，由一个叫 IOKernel 的中央调度器重新决定"哪个应用应该再拿一个核、哪个该让出一个核"。

日常类比：海底捞经理。传统 Linux 调度是经理每隔几分钟巡一次场，看到哪桌缺人才补；Shenango 是经理盯着监控屏，**每 5 秒**重排所有服务员的工位。频率高到顾客（请求）几乎感知不到等待。

写成数字：5 μs（微秒）= 0.000005 秒。Linux CFS 默认调度周期是毫秒级，**Shenango 比它快 1000 倍**。

## 为什么重要

数据中心一直被一个尴尬卡住：

- 想要**尾延迟低**（p99 < 100 μs）→ 给服务**独占核**，但 CPU 利用率常年 30%，电费白烧
- 想要**利用率高**（共享核）→ Linux 会把延迟拉到几十毫秒，p99 直接爆表

不理解 Shenango 就解释不了：

- 为什么 ByteDance / Meituan 这种大厂这几年都在自研用户态运行时
- 为什么 Go 的 GMP 模型再快也不够（Go 是应用内调度，没人协调跨应用）
- 为什么"独占核 vs 共享核"这场十年之争，2019 年才被看作真的解决了
- 为什么后来 Caladan / Concord / Junction 一连串 paper 全围着这个 5 μs 转

## 核心要点

Shenango 把传统 OS 调度拆成 **三层**：

1. **IOKernel（中央塔台）**：一个独立进程，**独占一个核**，全机器只跑它一个。它通过共享内存看到每个应用 runtime 的线程队列、网卡的包队列。每 5 微秒醒一次，跑一遍**拥塞检测算法**：如果某个应用连续两次观察都有未消化的工作 → 给它加一个核；如果某个核在 spin 但没活干 → 收回去。

2. **每应用 runtime（用户态线程库）**：每个应用链接 Shenango runtime，里面是 M:N 用户态线程（像 Go goroutine）+ 自己的 TCP 栈（绕开内核）+ 同步原语。**核迁移只要切几个寄存器**，不走内核 context switch。

3. **DPDK 风格网卡**：网卡 ring buffer 直接映射到用户态，IOKernel 把包派发给应用 runtime。**整条数据路径零系统调用**。

三层加起来叫 **应用核心模型**（application-core model）：核是中央分的，线程是应用自己排的。

### 三层各自负责什么（一句话版）

- IOKernel：决定"谁拿几个核"，**跨应用**全局视角
- runtime：决定"我这几个核里 goroutine 怎么排"，**应用内**视角
- 网卡 ring：把包**绕过内核**直送应用，去掉 syscall 开销

合在一起得到一个朴素但反直觉的结论：**调度可以中央化，只要中央动作够快**。

## 实践案例

### 案例 1：memcached + 批处理共存

机器上跑两个东西：

- 前台：memcached（要 p99 < 100 μs）
- 后台：一个 Go 写的批处理（吃 CPU，无延迟要求）

**传统 Linux**：批处理偶尔抢核 → memcached p99 飚到 50 ms（500 倍劣化）。
**独占核（IX 2014 派系）**：memcached 永远独占 8 个核 → 利用率 30%，剩下 70% 给批处理也只能用 5 个固定核。
**Shenango**：IOKernel 看到 memcached 流量上来 → 5 μs 内从批处理那抽 2 个核给它；流量降下去 → 5 μs 内还回去。memcached p99 < 100 μs，整机 CPU 利用率 ~100%。

### 案例 2：拥塞检测的两次采样

```
t = 0    μs：观察 memcached 队列 = 3 个包，runqueue 深度 = 5
t = 5    μs：观察 memcached 队列 = 4 个包，runqueue 深度 = 6
判定：连续两次都没消化干净 → 加一个核给 memcached
```

为什么是**两次**？一次可能是抖动，两次连续才说明真有持续负载。这个 "看两眼" 是工程经验性的取舍：太敏感会抖，太迟钝就慢。

### 案例 3：核迁移到底"快"在哪

传统 OS 把一个线程从核 A 搬到核 B，要做：
- 走系统调用陷入内核
- 保存全套寄存器（包括 SIMD 大寄存器组）
- 把缓存里的内容刷到内存
- 重新加载到 B 核的缓存

这一套下来数微秒是常态。Shenango 把**核**和**用户态线程**拆开：**应用内的 uthread 根本不跨核搬**——变的是"哪个 kthread 被允许占用哪个核"。IOKernel 用 eventfd 唤醒（unpark）、用信号抢占（preempt）kthread，仍会碰到内核原语，但路径极短；真正的工作线程队列还在用户态 runtime 里。所以**分核**和**切 goroutine**是两件事，前者不必做完整线程迁移。

### 案例 4：和 Go runtime 的关系

Go 的 GMP 是**应用内**调度：一个 Go 进程内部 goroutine 排 OS 线程的核。
Shenango 是**跨应用**调度：决定每个进程总共能拿几个核。

两者**互补不冲突**——Go 管进程内怎么排；Shenango 管机器上谁拿几个核。若要用 Shenango 的跨应用分核，需要**链上它的 runtime（或按其 API 移植）**，不是换个库就零改动；跨应用协调由 IOKernel 接管。

## 踩过的坑

1. **5 μs 不是延迟保证**，是**观察周期**。如果应用线程拿了一个 mutex 不放，IOKernel 看不见这种逻辑阻塞，仍可能堵几十微秒。
2. **IOKernel 单点**：它挂了整机器废。生产部署需要 watchdog + fast restart。
3. **必须改 runtime**：传统 socket 应用不能直接跑，要链接 Shenango libc 风格的 wrapper。
4. **极端突发**：μs 级流量尖峰仍会被 5 μs 周期吃掉一拍。Caladan（OSDI 2020）把粒度推到亚微秒才彻底解决。

## 一个常被问的问题：5 μs 是怎么定下来的

不是先定的数字，是**约束推出来的**：

- IOKernel 自己跑一轮拥塞检测 + 决策大约 1-2 μs
- 加上两次采样间隔 → 至少 ~3-5 μs
- 太短：IOKernel 占的核会饱和，反而变成瓶颈
- 太长：堵成"传统 OS 调度" → 失去意义

5 μs 是**"恰好够快、IOKernel 又不饱和"**的工程平衡点。看见这种数字，第一反应应该是问：**改一下底层假设，这数字会怎么动**——这就是后续 Caladan / Concord 切入的地方。

## 适用 vs 不适用场景

**适用**：
- 延迟敏感 + 批处理混部（CDN 边缘节点、in-memory KV、RPC 后端）
- 流量波动大、想榨干 CPU 的场景
- 已愿意接管运行时栈（用户态线程 + 用户态网络）

**不适用**：
- 容器化通用云主机（多租户隔离 Shenango 不解决）
- 跨机器调度（k8s scheduler 那一层）
- 应用代码动不了的遗留服务

## 历史小故事（可跳过）

- **2014 年**：IX paper（OSDI）开"独占核"派 → 延迟好但浪费 CPU
- **2018 年**：Arachne（OSDI）让应用内细粒度切核 → 但跨应用协调弱
- **2019 年**：Shenango 用 IOKernel 把"中央 + 5 μs"两件事一起拿下
- **2020 年**：Caladan 续作，亚微秒级 + interference-aware（看 LLC / 内存带宽）
- **2022 年起**：这套思路变成"用户态 OS"研究的新基线，Junction / Concord 都是其衍生

## 学到什么

1. **频率本身是产品特性**：把同一件事做得快 1000 倍，能开出新的可能性
2. **集中调度未必慢**：经理是单点，但当他够快、信道够短（共享内存），他比分布式协调更有效
3. **用户态运行时的边界正在重画**：以前内核管线程，现在应用管线程；以前内核管包，现在应用管包；内核只剩"分配核"这一件事
4. **理论 → 工程 → 续作**节奏：每 1-2 年一个 NSDI/OSDI 推进一档，是系统社区典型的接力

## 延伸阅读

- 论文 PDF：[Shenango NSDI 2019](https://www.usenix.org/system/files/nsdi19-ousterhout.pdf)
- 源码：[shenango/shenango](https://github.com/shenango/shenango)（C，含 IOKernel + runtime）
- 续作：[Caladan OSDI 2020](https://www.usenix.org/system/files/osdi20-fried.pdf)
- 综述视角：[Belay 组主页](https://abelay.github.io/)（这一系 paper 都从这里出）

## 关联

- [[ix-2014]] —— 独占核派的代表，Shenango 想超越的对象
- [[ebpf]] —— 另一种把内核能力用户态化的路径，与 Shenango 互补
- [[immix-mark-region]] —— 同样是"频率换效率"的设计哲学（GC 域）
- [[unix-1974]] —— 调度作为 OS 三件大事之一，Shenango 是这条线的最新翻案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[snap-2019]] —— Snap 2019 — Google 把网络栈搬到用户态微内核
- [[xen-2003]] —— Xen 2003 — 让操作系统配合虚拟化，性能直接接近原生
