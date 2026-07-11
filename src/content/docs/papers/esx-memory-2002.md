---
title: ESX Memory 2002 — 让一台机器假装比自己更大的四个魔术
来源: Carl A. Waldspurger, "Memory Resource Management in VMware ESX Server", OSDI 2002
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

ESX 是 VMware 早年的服务器虚拟化软件——它让**一台物理机同时跑十几台虚拟机**（VM），每台 VM 都以为自己独占了 4G 内存。这篇论文讲的是：物理机其实只有 8G，怎么让十台 VM 加起来"看到"40G 还不崩溃？

日常类比：一家咖啡店只有 30 个座位，但卖了 80 张会员卡。要让大部分时间够用、偶尔有人来发现没座也能临场调度——这套魔术在内存上叫**超分**（over-commit）。

ESX 在 2002 年第一次把这件事做成工业级稳定，靠四个独立但互补的技术。今天 AWS / GCP 上"1 核 2G" 那个 2G 背后的所有魔术，源头都在这篇论文。

## 为什么重要

不理解 ESX，下面这些事都没法解释：

- 为什么云服务器一台物理机能"卖"出 5 倍于自己内存的 VM 还稳定运行
- 为什么 Linux 的 KSM（Kernel Samepage Merging）那个内核功能存在——它是这篇论文 page sharing 思想的徒孙
- 为什么 KVM、Xen、Hyper-V 全都有 "balloon driver" 这个奇怪的东西
- 为什么 2018 年的 Spectre / Meltdown 漏洞会让云厂商紧急关掉跨租户内存共享

## 核心要点

ESX 的四个魔术：

1. **Ballooning（气球）**：在 guest 内核装一个伪装的"驱动"，hypervisor 想要回收内存时让它"膨胀"——气球在 guest 里申请页面，guest 自己挑最不重要的页给它，hypervisor 再把页拿走。**关键洞察：guest OS 比 hypervisor 更懂哪些页面能丢**。

2. **Page sharing（页面去重）**：后台扫描所有 VM 内存，对每页算 hash，相同的合并成一份只读副本。10 台 Linux VM 跑同样的 glibc，内存里 30%-60% 重复——去重后省一半。

3. **Idle memory tax（闲置内存税）**：VM 抢到内存却不用，按比例征税，重新分给在用的 VM。防止"抢到就囤"。

4. **Proportional shares + min/max**：每个 VM 一个 share 份额，竞争时按比例切；admin 设 min（保底）防饿死，max（封顶）防失控。

四个加起来：**让一台 8G 的机器稳定撑住 10 台 4G 的 VM**。

## 实践案例

### 案例 1：气球怎么"骗"出内存

宿舍管理员（hypervisor）不知道每个学生（VM）抽屉里哪件衣服可以丢——他自己挑容易挑错。

ESX 的办法：发给每个学生一个气球（balloon driver）。管理员对气球说"膨胀到 5 件"，气球就在学生抽屉里申请 5 件衣服的位置；**学生自己挑 5 件最不重要的塞进去**（因为 guest OS 知道哪些是文件 cache、哪些是脏页）。管理员把气球收走，里面那 5 件位置就还给物理内存了。

这一步省了 hypervisor 盲选的代价——guest 自己挑，通常比 hypervisor 瞎猜更贴近真正可丢的页。

### 案例 2：page sharing 的扫描节奏

```
后台每 N 秒扫一遍 → 算 hash → hash 表里查
  ↓
hash 撞了？做完整 byte 对比（防 hash 碰撞）
  ↓
真相同 → 改成 COW（写时复制）只读共享
  ↓
某 VM 想写 → 触发缺页 → 分裂出独立副本
```

10 台 Linux VM 同时跑，第一次扫完通常去重 30%-60% 的内存。代价：扫描和 hash 占 CPU 1%-2%。

### 案例 3：闲置内存税怎么算

VM A 申请了 4G、用了 4G；VM B 申请了 4G、只用 1G。

- 不征税：B 的 3G 闲着，A 想多要拿不到——浪费
- 征税 75%：B 的 3G 闲置部分被算成"只值 0.75G"，A 比 B 出价高就能抢走
- 结果：B 真的需要时还能拿回来（min 保底），平时 A 多用

这个机制让"share 份额" 不再奖励囤积——这是云厂商超分计费的雏形。

### 案例 4：谁被收 vs 怎么收

内存吃紧时，ESX 其实分两层决策：

1. **先定目标（idle tax + shares）**：按「谁闲着囤内存」调低有效份额，算出每台 VM 该留多少——tax 本身不搬页，只改分配目标。
2. **再执行回收**：优先靠背景 **page sharing** 省重复页；不够就 **ballooning** 让 guest 交页；balloon 不可用或不够，才落到 **hypervisor swap**（慢，但保证不崩）。

所以"超分但不卡顿"的关键是：多数压力在 sharing + ballooning 就消化掉，swap 只是兜底。

## 踩过的坑

1. **ballooning 依赖 guest 配合**：hostile guest 可以拒绝膨胀。ESX 兜底有 hypervisor swap，但性能差 100 倍。所以"VM 行为良好"是前提。

2. **page sharing 有 side-channel 风险**：2014 年后 Flush+Reload、Rowhammer 证实跨 VM 共享页能泄漏密钥。**今天云厂商默认关闭跨租户 page sharing**，只在同租户内共享。

3. **机器页 vs 物理页两层映射**：guest 看到的"物理页"在 ESX 下面还有一层"机器页"。guest physical → machine 是 hypervisor 维护的影子页表，性能开销大。后来 Intel EPT / AMD NPT 硬件加速才解决——但概念是这篇论文打的地基。

4. **idle memory tax 误伤刚启动的 VM**：刚开机的 VM 还没占满分配的内存，被税了反而拖慢启动。后来云厂商加了"启动宽限期"。

5. **采样估计 working set 不准**：ESX 用统计采样判断"在用 vs 空闲"。采样窗口短了误判频繁、长了反应慢。论文里调到 60 秒一轮，是工程妥协。

6. **page sharing 的 hash 冷启动慢**：刚开机所有 VM，hash 表还没建起来，前几分钟去重收益接近 0。生产环境靠"提前预热"或长生命周期 VM 摊薄这个代价。

## 一些数字（论文里的）

- 10 台同质 Linux VM 跑两小时后，page sharing 去重 **42% 内存**
- ballooning 触发回收 100MB，**耗时 < 1 秒**；hypervisor swap 同样 100MB **耗时 > 30 秒**
- 一台 1.5GB 物理机能稳定撑住 **8 台 256MB Windows VM**（合计 2GB，超分 33%）

这些数字在 2002 年的硬件上是震撼的——直接证明工业级超分可行。

## 适用 vs 不适用场景

**适用**：

- 多租户虚拟化（公有云 / 私有云 / 桌面虚拟化）
- 工作负载差异大（有些 VM 闲、有些 VM 忙）
- 同质 guest（多台 Linux 跑同样发行版，page sharing 收益高）

**不适用**：

- 单机单 VM（没东西可超分）
- 强延迟敏感的负载（HFT 高频交易）——ballooning 触发的 swap 不可预测
- 高安全要求场景——page sharing 关掉，剩下三招收益减半
- 容器化（Docker / K8s）——容器共享内核，超分模型不一样，需要 cgroup memory + OOM killer

## 历史小故事（可跳过）

- **1998 年**：Stanford 的 Mendel Rosenblum、Diane Greene、Edouard Bugnion 创立 VMware。早期产品 GSX / Workstation 靠 host OS 借内存。
- **2001 年**：ESX 作为"裸金属"hypervisor 发布——直接管硬件，不依赖 host OS。
- **2002 年**：Carl Waldspurger 发表本文，把 ballooning + sharing + tax + shares 四件事写成完整系统。OSDI 当年最佳论文之一。
- **2007 年之后**：KVM、Xen、Hyper-V 全抄了 ballooning；Linux 把 page sharing 抄成 KSM。Waldspurger 后来去了 CMU 教虚拟化系统课。

## 学到什么

1. **超分不靠平均、靠不同步**——VM 们高峰错开，统计上加起来才不会同时爆。这是云便宜的根本原因。
2. **让"知道更多"的人决定**——ballooning 的核心不是技术，是把"挑哪些页能丢"这个决策从 hypervisor 推回 guest OS（它信息更多）。
3. **市场机制 > 静态分配**——share + tax + min/max 是把内存当商品，让 VM 之间用价格信号竞争，而不是 admin 手工切。
4. **理论简单 + 工程极难**——四个 idea 听起来都不复杂，难在 hash 撞了怎么处理、COW 怎么不死锁、税怎么算才不抖动。这就是工业级系统的真容。
5. **机制要可降级**——回收顺序前轻后重，每一级失败才升级。这套思路后来在调度器、流量控制、限流器里反复出现。
6. **观察工作集而不是分配量**——idle tax 的本质是测量"VM 真在用什么"，不是"它要了什么"。这跟 LRU、working set theory 一脉相承。

## 延伸阅读

- 论文 PDF：[ESX Memory Management 2002](https://www.cs.princeton.edu/courses/archive/fall12/cos518/papers/esx.pdf)（17 页，有耐心读得完）
- 视频：[Carl Waldspurger - Memory Virtualization](https://www.youtube.com/results?search_query=waldspurger+memory+virtualization)（作者本人讲课）
- 续作：Difference Engine (OSDI 2008) —— 把 page sharing 升到 sub-page 级
- 续作：Satori (USENIX 2009) —— 让 page sharing 实时化
- [[xen-2003]] —— 同期另一种虚拟化路线（半虚拟化）
- [[kvm-2007]] —— Linux 内核内置 hypervisor，抄了 ballooning

## 关联

- [[xen-2003]] —— 同时代竞品，Xen 也有 balloon driver，思路同源
- [[kvm-2007]] —— Linux 内核 hypervisor，内置 virtio_balloon
- [[unified-memory-2014]] —— GPU/CPU 共享内存，问题不同但思路相通
- [[persistent-memory-2014]] —— 持久内存改写虚拟化内存模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kvm-2007]] —— KVM 2007 — 把 Linux 内核本身变成 hypervisor
- [[persistent-memory-2014]] —— PMFS — 第一个为字节寻址持久内存设计的文件系统
- [[xen-2003]] —— Xen 2003 — 让操作系统配合虚拟化，性能直接接近原生

