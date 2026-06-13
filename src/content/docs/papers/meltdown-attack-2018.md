---
title: Meltdown — 从用户空间偷读内核内存
来源: https://meltdownattack.com/meltdown.pdf
日期: 2026-06-13
子分类: 安全与隐私
分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Meltdown: Reading Kernel Memory from User Space**（Lipp、Schwarz、Gruss 等，USENIX Security 2018；arXiv [1801.01207](https://arxiv.org/abs/1801.01207)）揭示了一类**硬件级信息泄漏**：普通用户程序**不需要 root、不需要内核漏洞**，就能读到操作系统内核映射里的内存——密码、SSH 密钥、别的进程数据都可能被拖出来。

官方 PDF：[meltdownattack.com/meltdown.pdf](https://meltdownattack.com/meltdown.pdf)。同日披露的 [[spectre-attack-2018]] 利用**分支预测错误**诱骗受害代码投机执行；Meltdown 更直接——利用**乱序执行**在权限检查完成前就把「不该读的内核地址」搬进 CPU 内部流水线，再用**缓存侧信道**把秘密字节「听」出来。

日常类比：

> 图书馆规定「普通读者不能进珍本室」。你站在阅览室（用户态），照理够不到珍本室书架（内核内存）。但管理员为了提速，会让助理**手快先抽书**——在刷卡系统确认「你有没有权限」之前，书页可能已经翻过几页；发现你没权限后，业务作废、登记本上这笔借阅被划掉，可**书页压在复印机玻璃上留下的压痕**（CPU 缓存访问痕迹）还在。攻击者不闯珍本室，只量复印机哪块玻璃最近被压过，就能反推书页上的字。  
> 现代 CPU 的乱序执行就是那个「手快的助理」；L1/L2 缓存就是「会留下压痕的玻璃」。

一句话：**Meltdown 把「为了提速而提前执行的内存访问」变成泄密通道，让操作系统以为牢固的地址空间隔离在微架构层面晚了一步。**

## 为什么重要

不理解这篇论文，下面这些事都讲不清：

- 为什么 2018 年 1 月全球 IT 进入「紧急补丁周」，Linux 突然上了 **KPTI**（Kernel Page Table Isolation），Windows 上了 **KVA Shadow**，macOS 做了类似改造
- 为什么打内核补丁后，数据库、容器运行时、高频 `syscall` 的服务**明显变慢**——不是补丁写坏了，是为堵 Meltdown 付的**性能税**
- 为什么云厂商要强调「同宿主机邻居进程」不再被默认信任，多租户隔离要重新审计
- 为什么 CPU 厂商除了打微码，还要在新一代芯片里改硬件缓解——软件补丁救不了所有变体
- 为什么安全圈把「侧信道」从冷门论文话题变成**每台服务器的必修项**

论文强调：Meltdown **不依赖任何软件漏洞**，破坏的是**地址空间隔离**这一安全地基；在受影响系统上，攻击者可读其他进程或云虚拟机内存，**无需任何权限或特权**。

## 核心概念

### 1. 架构状态 vs 微架构状态

CPU 有两层「状态」需要区分：

| 层面 | 含义 | 攻击者能否直接读 |
|------|------|------------------|
| **架构状态**（architectural） | 程序员可见的寄存器、内存、程序计数器 | 非法读取会被撤销，你看不到「名义上的」秘密 |
| **微架构状态**（microarchitectural） | 缓存行是否载入、TLB、分支预测历史等 | 可通过计时、功耗等侧信道间接观测 |

Meltdown 的核心矛盾：**乱序执行撤销了架构层面的非法读取，却没有完全抹掉微架构层面的缓存痕迹。**

### 2. 乱序执行（Out-of-Order Execution）

现代 CPU 不会严格按程序顺序一条一条执行。为了填满流水线，会在**依赖还没算完**时先执行后面「看起来独立」的指令——例如「读内核地址」这条 load，可能在「权限检查是否通过」之前就进入内存子系统。

类比：电梯门还没开，职员的手已经伸进抽屉——架构上最终会作废这次读取，但微架构层面**数据可能已被取进缓存**。

### 3. 瞬态指令序列（Transient Instruction Sequence）

在乱序窗口里执行、随后因异常或权限失败而被丢弃的指令，叫 **transient instructions**。它们在架构语义上「从未发生」，却可能：

1. 从**用户不可访问的内核地址**读出秘密字节 `value`
2. 用 `value` 计算 `probe[value * 4096]` 并访问该地址
3. 把「秘密是多少」编码成「probe 数组的哪一行被载入缓存」

### 4. Flush+Reload 侧信道

**Flush+Reload** 是 Meltdown 选用的缓存攻击技术（Yarom & Falkner, USENIX Security 2014）：

1. **Flush**：用 `clflush` 把探测数组从缓存清掉
2. **Trigger**：触发瞬态序列，让 CPU 暗中访问 `probe[secret]`
3. **Reload**：逐个探测 `probe[i]` 的访问时间——**缓存命中快、未命中慢**，最热的行号就是 `secret`

论文报告在 Intel Core i7-6700K 上可达约 **503 KB/s** 的泄漏速率。

### 5. KAISER / KPTI 缓解

**KAISER**（Kernel Address Isolation to have Side-channels Efficiently Removed）把内核页表与用户页表拆开：用户态运行时**根本映射不到内核地址**，乱序 load 够不着目标。Linux 实现叫 **KPTI**；论文在披露窗口内与 Windows、macOS 厂商协同验证，这是当时最有效的软件缓解。

## 攻击三步走（论文 Figure 4–5）

```text
Step 1  选择目标内核地址 addr，尝试读取 *addr → 得到秘密字节 value
        （乱序执行可能在页错误/权限异常「提交」前完成 load）

Step 2  瞬态序列：access(probe[value * 4096])
        → 把 value 写入缓存状态（微架构 covert channel 发送端）

Step 3  Flush+Reload 扫描 probe[0..255]
        → 最热的页号 = value（covert channel 接收端）
```

重复 Step 1–3，对内核地址空间逐字节扫描，即可 dump 内核映射（含指向物理内存的窗口）。

## 实践案例

### 案例 1：玩具示例——三行 C 在干什么

论文 Section 3 的极简示意（教学用，现代系统已缓解，不可直接当武器）：

```c
// addr：攻击者想读的内核虚拟地址（例如通过 /proc/self/mem 等途径获得线索）
// probe：攻击者分配的大数组，256 页，每页至少 4096 字节（一页一缓存行策略）
// value：从 addr 读出的秘密字节（0–255）

value = *addr;                          // Step 1：非法读内核；乱序下可能先完成
probe[value * 4096];                    // Step 2：用秘密值触碰 probe 某一页
                                        // Step 3：随后用 Flush+Reload 在外层循环恢复 value
```

**逐行解释**：

- `*addr` 在架构上应触发 **#GP 页保护异常** 或页错误，结果不应提交到 `value`
- 乱序窗口里，load 可能**已经**把数据搬进内部寄存器，并沿依赖链执行 `probe[...]`
- 异常处理撤销寄存器，但 **`probe[value*4096]` 对应缓存行可能已变热**
- 外层 `for (i=0; i<256; i++)` 配合 `rdtsc` 计时，找出最热页号 → 重建 `value`

### 案例 2：Flush+Reload 探测循环

攻击的「接收端」通常是测量缓存的循环，而非「一行就读内核」：

```c
#define CACHE_LINE  512      // 典型 x86 缓存行 64B；教学常放大 stride 减少预取干扰
#define THRESHOLD   80       // 命中/未命中的周期阈值，需校准

uint8_t probe[256 * CACHE_LINE];
int leaked_byte = -1;

void flush_probe_array(void) {
    for (int i = 0; i < 256; i++)
        _mm_clflush(&probe[i * CACHE_LINE]);   // 清空所有探测行
}

int reload_probe(void) {
    for (int i = 0; i < 256; i++) {
        uint64_t t0 = __rdtsc();
        volatile uint8_t junk = probe[i * CACHE_LINE];
        uint64_t t1 = __rdtsc();
        if (t1 - t0 < THRESHOLD)
            return i;                          // 这一行刚被瞬态序列碰过
    }
    return -1;
}

// 典型一轮：flush → 触发含 *addr 与 probe[value*4096] 的瞬态序列 → reload_probe()
```

**要点**：

- `_mm_clflush` / `clflush` 把指定缓存行逐出，保证测量前起点一致
- `__rdtsc` 读时间戳计数器，**命中约数十周期，未命中可达数百周期**
- `volatile` 防止编译器把探测访问优化掉
- 实际 PoC 还需**吞掉或延迟异常**（如 `try/catch` 信号处理、Intel TSX 事务内存等），否则瞬态窗口太短；论文讨论了多种实现细节

### 案例 3：KPTI 如何让 Step 1 够不着内核

Linux KPTI 在每次 **syscall / 中断 / 异常** 进出内核时切换页表：

```bash
# 查看本机是否启用 KPTI（较新内核）
grep -i pti /sys/devices/system/cpu/vulnerabilities/meltdown
# 常见输出：Mitigation: PTI

# 打补丁前后 syscall 密集场景（示意，因 CPU/内核版本而异）
# 打补丁前：getpid() 约数百纳秒
# 打补丁后：同机器可能涨到 1–2 微秒量级，高 QPS 服务 TPS 可降几个点
```

**解释**：

- 用户态页表里**没有内核映射**，乱序 load 目标地址时更早失败或读不到真实内核内容
- 代价是每次进内核多一次页表切换与 TLB 刷新——Redis、PostgreSQL、serverless 冷路径都会感受到
- 后来 PCID 等硬件特性减轻部分开销，但 **安全与速度的 trade-off** 至今仍在

### 案例 4：云虚拟机与「邻居不可信」

论文在公有云实例上验证：同一物理机上的普通 VM，理论上可读宿主机内核映射片段。

```text
┌─────────────┐  ┌─────────────┐
│  租户 A VM   │  │  租户 B VM   │   同一物理 CPU
│  用户进程    │  │  用户进程    │
└──────┬──────┘  └──────┬──────┘
       │  Meltdown 泄漏  │
       └────────┬────────┘
            宿主机内核映射
```

Meltdown 说明：**Hypervisor + 内核隔离** 之上，还要假设 CPU 不乱序泄密；多租户平台除打补丁外，需审计是否仍共享易受影响的旧 CPU 池。

## Meltdown vs Spectre（对照表）

| 维度 | Meltdown | Spectre |
|------|----------|---------|
| 利用机制 | **乱序执行**，权限检查延迟 | **推测执行**，分支预测错误 |
| 主要目标 | **内核 / 物理内存映射** | 受害进程**自己的**地址空间 |
| 是否需要诱骗受害代码 | 否，攻击者主动读内核地址 | 是，需构造投机路径 |
| 关键缓解 | KPTI / KAISER、微码 | retpoline、IBRS、编译器屏障等 |
| 与软件漏洞关系 | **无** | **无**（受害者逻辑可完全正确） |

两者共同点：**架构上撤销的操作，微架构缓存状态仍可能泄漏。**

## 踩过的坑

1. **Meltdown ≠ 软件提权漏洞**：不是「内核有个 buffer overflow」，而是 CPU 实现与隔离假设不一致。

2. **补丁 ≠ 所有侧信道消失**：KPTI 主要挡 Meltdown 这条「乱序读内核」路；后续 MDS、L1TF、LazyFP 等变体仍需微码与继续隔离，不能 2018 年打一次就躺平。

3. **容器 ≠ 额外硬件隔离**：Docker 默认共享宿主机内核；Meltdown 时代说明「命名空间」之上还要信任 **KPTI 是否到位**。

4. **不要低估 syscall 密集场景**：静态网站几乎无感；高 QPS 数据库、消息队列必须重新做容量规划。

5. **ARM 也受影响**：初版讨论以 x86 为主，但论文与后续公告表明多种 ARM 核心同样需缓解——不是「Intel 独有」。

## 适用 vs 不适用场景

**适用**：

- 理解现代 CPU **乱序执行 + 缓存** 为何构成安全面
- 解释 2018 年前后 OS / 虚拟化 / 云架构的紧急改造动机
- 学习侧信道思维：「作废的读取仍可重建秘密」
- 评估旧硬件池是否仍应留在多租户生产环境

**不适用**：

- 把本文当「一步步入侵教程」——实战利用受法律与伦理约束，且现代已缓解系统需组合多种技巧
- 用 Meltdown 解释**纯用户态栈溢出**——那是另一类漏洞模型
- 在 **已启用 KPTI + 新微码 + 新 CPU** 的环境假设「和 2018 年一样好利用」
- 替代形式化验证工具——Meltdown 是**打破假设**的案例，不是证明工具

## 历史小故事（可跳过）

- **1967 年**：Tomasulo 算法让乱序执行在工程上可行——性能大奖，五十年后变成安全噩梦的伏笔。
- **2017 年底**：Graz 理工大学团队与 Google Project Zero 的 Jann Horn **独立**发现同类问题。
- **2018 年 1 月 3 日**：Meltdown 与 Spectre 同期披露，[meltdownattack.com](https://meltdownattack.com) 上线，全球紧急补丁。
- **2018 年 8 月**：论文正式发表于 USENIX Security 2018，页 973–990。
- **之后数年**：Intel 微码、硬件级缓解、MDS/L1TF 等变体研究——故事没在一月结束。

## 学到什么

1. **内存隔离是安全的地基**——Meltdown 证明硬件实现可以无声击穿「用户碰不到内核」。
2. **性能优化与安全常常对打**——乱序执行是刚需，副作用必须用页表隔离、微码、新硬件持续买单。
3. **侧信道的本质是测「痕迹」**——不必拿到寄存器本身，缓存时间差就足够重建秘密字节。
4. **责任披露 + 全行业协同**——OS、云、芯片厂同一窗口修补，是「基础设施级」漏洞的应对模板。
5. **读论文要分清架构与微架构**——安全假设若只写在 ISA 手册上，而攻击活在硅片实现里，就会反复踩坑。

## 延伸阅读

- 同日姊妹篇：[[spectre-attack-2018]] — 推测执行与边界检查绕过
- 本仓库姊妹笔记：[[lipp-meltdown-2018]] — 另一版 Meltdown 学习笔记
- Flush+Reload 基础：Yarom & Falkner, USENIX Security 2014
- KAISER 原理：Gruss et al., USENIX Security 2017（后演进为 KPTI）
- 官方站点：[meltdownattack.com](https://meltdownattack.com)
- USENIX 演讲页：[usenix.org/conference/usenixsecurity18/presentation/lipp](https://www.usenix.org/conference/usenixsecurity18/presentation/lipp)

## 参考文献

```bibtex
@inproceedings{lipp2018meltdown,
  title     = {Meltdown: Reading Kernel Memory from User Space},
  author    = {Moritz Lipp and Michael Schwarz and Daniel Gruss and Thomas Prescher
               and Werner Haas and Anders Fogh and Jann Horn and Stefan Mangard
               and Paul Kocher and Daniel Genkin and Yuval Yarom and Mike Hamburg},
  booktitle = {27th USENIX Security Symposium (USENIX Security 18)},
  year      = {2018},
  pages     = {973--990},
  url       = {https://meltdownattack.com/meltdown.pdf}
}
```
