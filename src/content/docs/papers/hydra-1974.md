---
title: HYDRA — 用 capability 把整个内核重做成对象 + 票据
来源: 'Wulf, Cohen, Corwin, Jones, Levin, Pierson, Pollack, "HYDRA: The Kernel of a Multiprocessor Operating System", CACM 17(6): 337-345, June 1974'
日期: 2026-05-31
子分类: 内核与虚拟化
分类: 操作系统
难度: 中级
---

## 是什么

HYDRA 是 1974 年 CMU 给自家多处理器 C.mmp（最多 16 颗 PDP-11）写的一个内核。它把"整个 OS"重新想了一遍：所有东西——进程、文件、信号量、过程——都是**带类型的对象**；想访问对象，必须先持有一张**capability**（能力票据），票据上写明可以做什么（读 / 写 / 调用 / ...）。

日常类比：像一个**门禁极严的图书馆**。每本书是一个"对象"。进门时管理员给你一张卡（capability），卡上写着"你可以借这本但只能读不能写"。卡是不可伪造的——你想做的事必须卡上写过，没写就做不了。卡可以转手，但不能涂改。

这是历史上第一个把"capability"和"policy / mechanism separation"两件事**同时讲清楚**的系统级论文。

## 为什么重要

不理解 HYDRA，下面这些事都没法解释：

- 为什么 macOS / iOS 内核的祖宗叫 Mach，Mach 内核就是 HYDRA 思路的直系延续
- 为什么 seL4 / Fuchsia Zircon / KeyKOS / EROS 这些"形式化或安全内核"全都用 capability，而不用 Unix 的 uid + 权限位
- 为什么浏览器沙箱、Linux container、iOS 应用授权弹窗都是"给你一张卡只能做这件事"——这都是 capability 模型的弱化版
- 为什么 FreeBSD Capsicum、Cap’n Proto RPC 都把"显式传递权限"当成核心特性——它们不约而同回到了 1974 年的设计
- 为什么操作系统教科书一定要讲"机制 vs 策略"——这个区分在 HYDRA 之前没人系统化讲过

## 核心要点

HYDRA 的设计可以拆成 **三块**：

1. **typed object（带类型的对象）**：内核里所有东西都是对象，每个对象有"类型"（process / file / semaphore / procedure / ...），类型决定了它支持哪些操作。类比：图书馆里有书、CD、座位三种"对象"，不同对象能做的事不一样。

2. **capability（能力票据）**：每个进程持有一张 **C-list**（capability 列表）。要访问对象 O 上的操作 op，必须 C-list 里有一张 capability 写着"O + 允许 op"。capability 由内核维护，用户**只能传递、不能伪造**。类比：你能把图书馆卡借给朋友，但你不能自己印一张。

3. **policy / mechanism separation（机制与策略分离）**：内核只做**机制**——对象创建、capability 检查、过程调用切换。**策略**——调度算法、分页置换、文件系统怎么组织——由上层 subsystem 自己写。类比：图书馆的**门禁规则**（机制）和**借阅时长怎么定**（策略）是两件事，门禁系统不该写死借多久。

三块加起来叫"capability-based kernel"或"object-capability OS"，这个名字 1974 年还没流行，但 HYDRA 是它最早的完整实现。

## 实践案例

### 案例 1：同一个内核上跑两个不同 OS

在 HYDRA 上，可以同时实现一个"学生用 OS"和一个"教授用 OS"。两套用完全不同的调度策略 + 不同的文件 personality，但用的是同一个 HYDRA 内核——因为内核只管"capability 检查"和"对象切换"，**不管谁先跑**。这是 1974 年的 paper 就做出来的事。

放到今天看：Linux KVM 跑虚机、Firecracker 跑微 VM、Wasm runtime 跑应用——都是同一思路的不同抽象层重演。HYDRA 把"内核给上层留空"这个口子第一次开大。

### 案例 2：一次性授权

你有一个文件 F。你想让另一个进程 P 读一次 F，读完不能再读。在 Unix 里你得 chmod + setuid + 算时间，组合起来还有竞态。HYDRA 里：你做一张**只读 capability**，传给 P；P 用完，你 revoke。下一次 P 再想访问 F，capability 已经无效，内核直接拒绝。**精细到单次访问**。

### 案例 3：防 confused deputy

经典安全问题：进程 A 调用进程 B 的某个过程，B 拿 A 的权限去访问别的资源——可能越权。HYDRA 里，A 调 B 时**必须把所需 capability 显式传过去**，B 没收到就 deref 不了。"权限不会随调用关系泄漏"——这是 seL4 / EROS 后来反复强调的"capability confinement"，源头就在 HYDRA。

### 案例 4：amplification（权限放大）模式

HYDRA 提供了一种巧妙机制：某个对象类型的"管理过程"在被调用时，临时获得对它管理对象的更高权限，调用完自动归零。日常类比：图书管理员上班时持有"全馆通用钥匙"，下班自动收回。这种 amplification 思路后来在 [[smalltalk-80]] 的 metaclass、Java Bean 的反射访问、JVM 的 setAccessible() 里都有影子，是"受控特权"模式的早期范本。

### 案例 5：现代映射——iOS 应用权限弹窗

iOS 弹"是否允许此 App 访问相册"——本质就是发一张 capability 给 App。App 不能伪造，也不能跨权限调用别的资源。用户随时可以在系统设置 revoke。这不是 Apple 凭空发明的，而是 1974 年 HYDRA 的思路在移动时代的工程化包装。理解这一点，再看 Android Permissions / Web 的 Permissions API，会发现它们的"差距"全在 capability 模型的纯度上——iOS 较纯，Android 历史包袱重一些。

## 踩过的坑

1. **把 capability 等同于 Unix 文件描述符**——错。fd 只是个整数索引，没有权限粒度，进程拿到 fd 可以做这个 fd 关联的所有操作。capability 是"对象引用 + 权限位 + 不可伪造"三位一体，由内核保证完整性。

2. **误以为 HYDRA = 微内核**——HYDRA 更准确叫"capability kernel"。"微内核"（microkernel）这个术语是 [[smalltalk-80]] 同时代的 Mach（1985）才标准化的，HYDRA 是它的祖先而非同义词。

3. **以为 policy/mechanism separation = 内核什么都不做**——不是。内核做的是"**不可被绕过的强制机制**"（capability 检查、对象类型分发、过程切换），策略是"**可被替换的决策**"（调度算法、置换算法、文件布局）。两者都必须存在，分层但不能省。

4. **以为 capability 模型已经过时**——恰恰相反。2010s 之后 seL4、CHERI（硬件 capability）、Fuchsia Zircon、Cap’n Proto RPC、浏览器沙箱、iOS 应用权限模型，全都是 HYDRA 思路的延续或弱化版。

5. **以为 capability 不能 revoke**——常见误解。HYDRA 通过"间接对象表"实现 revoke：把整个对象槽置空，所有指向它的 capability 同时失效。代价是每次 deref 多一层间接。后续 KeyKOS / EROS 优化为"代际编号"机制，进一步降低开销。

## 适用 vs 不适用场景

**适用**：

- 需要**强隔离 + 灵活策略**的安全敏感系统（航空、医疗、银行内核）
- 想做形式化验证的内核（seL4 的 capability 模型直接来自 HYDRA，详见 [[hyperkernel-2017]]）
- 沙箱、容器、浏览器进程隔离——按 capability 思路设计权限边界

**不适用**：

- 性能极致敏感的高频路径（capability 检查每次调用都要走，有开销；现代实现用硬件 CHERI 才能贴近 native 速度）
- 对兼容性要求强的场景——POSIX / Unix 权限模型是 uid + mode，capability 模型不能"原地兼容"
- 极简嵌入式（< 32KB RAM）——capability 表本身有空间开销
- 跨主机分布式（capability 在网络上传递时如何防伪造是另一道题，Cap’n Proto / WebTransport 的能力凭证是后来的工程化解法）

## 历史小故事（可跳过）

- **1971 年**：William Wulf 在 CMU 启动 C.mmp 项目——把 16 颗 PDP-11 用一个 crossbar 连成共享内存机。当时是世界最早的多处理器之一。
- **1974 年**：HYDRA 论文发在 CACM。第一次把 capability + typed object + policy/mechanism separation 三件事打包讲清楚。实现语言是 BLISS-11。
- **1975-1977 年**：HYDRA 实际跑在 C.mmp 上，宕机时间通常 2-6 小时（处理器累计故障导致，不是软件 bug）。
- **1985 年**：Mach 在 CMU 诞生，直接继承 HYDRA 的 capability + 微内核思路（Mach port = capability handle）。
- **1980s-90s**：KeyKOS / EROS 把 HYDRA 的纯 capability 思路推到极致。
- **2009 年**：seL4 第一次给 capability 微内核做完全形式化证明（见 [[hyperkernel-2017]] / [[certikos-2016]] 同一脉络）。
- **现在**：macOS / iOS 用的 XNU 内核里仍有 Mach port 的影子；Fuchsia 的 Zircon、CHERI、浏览器站点隔离，都能溯源到 HYDRA。

Wulf 后来当了 ACM 主席、美国国家工程院院士。

## 与同时代 / 后续方案对比

| 维度 | Unix（1971） | HYDRA（1974） | seL4（2009） |
|------|---------------|----------------|---------------|
| 权限粒度 | uid + 9 位 mode | per-object capability + 多权限位 | per-object capability + 类型化引用 |
| 谁定调度策略 | 内核硬编码 | 用户 subsystem 自己写 | 用户 subsystem 自己写 |
| 形式化验证 | 无 | 无（手工论证） | 全栈机器验证（Isabelle/HOL） |
| 多处理器 | 后期补丁 | 原生设计目标 | 现代 SMP 支持 |
| 工业落地 | 极广 | 学术原型 | 航空 / 汽车 / 安全设备 |

可以这样总结：HYDRA 是"思想原型"，Unix 是"工程胜利"，seL4 是"思想 + 形式化补完"。

## 学到什么

1. **资源 = 对象，访问 = 票据**——这种"object-capability"思路比 uid+mode 精细一两个数量级，但需要内核负担更多
2. **机制和策略要分层**——内核里写死"先来先服务"是早期 OS 反复犯的错；HYDRA 教会大家这两件事必须分开
3. **capability 不可伪造**靠"内核维护、用户只能传递"来保证——这是后来对象引用、JS 闭包、Cap’n Proto 等"capability-style"工具的共同祖先
4. **一个 1974 年的论文影响了 50 年的 OS 设计**——经典就是这个意思
5. **思想原型不必赢工程战**——HYDRA 自己只跑了几年硬件就退役，但思想被三代后继者反复吸收，比"赢一时"重要

## 延伸阅读

- 论文 PDF：[Wulf et al. 1974, HYDRA: The Kernel of a Multiprocessor Operating System](https://dl.acm.org/doi/10.1145/355616.364017)（9 页，CACM 风格）
- Levy 经典书：[Capability-Based Computer Systems (1984)](https://homes.cs.washington.edu/~levy/capabook/)——HYDRA / CAP / iAPX 432 三大 capability 系统全景史
- 项目主页：[seL4 Microkernel](https://sel4.systems/)——形式化验证的现代 capability 微内核
- 视频：[Mark Miller — Object-Capability Security](https://www.youtube.com/watch?v=oBqeDYETXME)（半小时讲清 capability 思想的现代延伸）

## 一句话记忆

**对象 + 票据 + 不可伪造 + 机制策略分离**——这四件事在 1974 年同时被想清楚，后续 50 年的"安全内核"都是它的注脚。如果只能记一句话：**capability 是把"谁可以做什么"从"用户身份"换成"手里有没有那张卡"**。

## 给初学者的下一步

- 想动手感受：装 [seL4 教程版](https://docs.sel4.systems/Tutorials/)，跟着跑 hello-world，能直观看到 capability slot
- 想看代码：FreeBSD 的 Capsicum 子系统（在 `sys/kern/sys_capability.c`）是相对简单的 capability 实现
- 想读哲学：Mark Miller 的博士论文《Robust Composition》把 object-capability 思想推到极致
- 想看反例：Linux 的 namespaces + cgroups + seccomp 是"非 capability"思路怎么逼近隔离效果——对比着读最有启发

## 关联

- [[lampson-hints]] —— Lampson 1983 把"机制/策略分离"列为正式 hint，HYDRA 1974 是它的实证
- [[hyperkernel-2017]] —— 现代 push-button 内核验证，capability 仍是核心建模对象
- [[certikos-2016]] —— Coq 证过的并发内核，也是 capability 思路的延续
- [[simula-67]] —— object 的概念源头，HYDRA 把 object 提升到内核级
- [[smalltalk-80]] —— 同时代 object-capability 思想在用户空间的探索
- [[amdahl-law-1967]] —— 多处理器扩展性极限，C.mmp 时代就在踩
- [[dash-numa-1992]] —— 多处理器后续——从 UMA 走到 NUMA

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amdahl-law-1967]] —— Amdahl 定律 — 串行比例决定并行加速比的上界
- [[certikos-2016]] —— CertiKOS — 把整个并发内核拆成 30 多层每层都被 Coq 证过
- [[dash-numa-1992]] —— Stanford DASH — 第一台真跑起来的目录式 CC-NUMA 多处理器
- [[ffs-1984]] —— FFS — 把磁盘几何写进文件系统
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
- [[simula-67]] —— SIMULA 67 — 面向对象的诞生
- [[smalltalk-80]] —— Smalltalk-80

