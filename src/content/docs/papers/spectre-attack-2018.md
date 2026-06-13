---
title: Spectre Attacks — 推测执行如何绕过边界检查偷读内存
来源: https://spectreattack.com/spectre.pdf
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Spectre Attacks: Exploiting Speculative Execution**（Kocher、Genkin、Gruss 等，2018 年 1 月披露，后发表于 IEEE S&P 2019）是一类**硬件层面的信息泄漏攻击**：攻击者诱导 CPU 在「本不该走」的分支上**推测执行**（speculative execution）若干指令，把受害进程里的秘密字节写进**缓存状态**；虽然 CPU 事后会撤销寄存器里的错误结果，**缓存里留下的痕迹**仍可通过计时侧信道读出来。

论文 arXiv 编号 [1801.01203](https://arxiv.org/abs/1801.01203)，官方站点 [spectreattack.com](https://spectreattack.com/)。与同日披露的 [[lipp-meltdown-2018]] 不同：Meltdown 主要利用「乱序执行 + 特权检查延迟」**直接读内核**；Spectre 更通用——**受害者代码逻辑上完全正确**（有边界检查、无缓冲区溢出），仍可能被偷密钥。

日常类比：

> 想象银行柜员处理转账：规则是「先核对签名，再打开保险柜」。为了排队更快，柜员会**猜**你签名有效，提前把保险柜门拉开一条缝、瞄一眼里面的编号牌——若后来发现签名是假的，业务作废、账本回滚，但**门把手上的指纹和锁芯温度**已经变了。攻击者不去撬锁，只站在旁边用红外仪量「哪扇柜门刚被碰过」，就能反推编号牌上的数字。  
> CPU 的分支预测器就是那个「爱猜的柜员」；L1/L2 缓存就是「会留下痕迹的柜门」。

一句话：**Spectre 把「为了提速而提前执行的代码」变成泄密通道，让软件以为安全的边界检查在微架构层面晚了一步。**

## 为什么重要

不理解这篇论文，下面这些事都讲不清：

- 为什么 2018 年 Intel / AMD / ARM 全线紧急发微码，Linux 上突然出现 **retpoline**、**IBPB/STIBP**，浏览器也要发大版本
- 为什么「代码有 `if (x < size)` 检查」仍被 CVE-2017-5753（Spectre v1）点名
- 为什么打了防 Meltdown 的 **KPTI** 之后，**同机不同进程**仍可能互偷内存——KPTI 藏内核地址，挡不住 Spectre 在用户态里投机读
- 为什么云厂商开始审计「**同物理核**上是否调度了不同租户的密钥运算」——侧信道几乎不留传统日志
- 为什么形式化验证过的密码库、JIT 沙箱、容器隔离在 2018 年后都要**重新假设「CPU 不泄密」**

论文还指出：操作系统进程隔离、静态分析、容器化、JIT 编译、以及针对缓存计时的软件缓解，其安全假设都建立在「**未执行的指令不会产生可观测副作用**」之上——Spectre 证明这个假设在当代 CPU 上不成立。

## 核心概念

### 1. 推测执行（Speculative Execution）

现代 CPU 遇到分支时，若目标地址还没算完（例如 `array1_size` 还在 DRAM 里），不会干等：分支预测器先**猜**走哪条路，**提前执行**后面的指令。猜对则提交结果、省时间；猜错则**撤销架构状态**（寄存器、PC），继续走正确路径。

关键矛盾：**撤销的是「名义上的 CPU 状态」，不是全部微架构状态**——缓存行是否被载入、BTB 是否被更新，都可能保留。

### 2. 瞬态指令（Transient Instructions）

在错误推测路径上执行、随后被丢弃的指令叫 **transient instructions**。它们在**架构语义**上「从未发生」，在**物理实现**上却可能：

- 读过受害者的秘密内存
- 用秘密值做地址计算，触碰 `array2[k * 512]` 某一缓存行
- 把「秘密字节 k 是多少」编码成「哪条缓存线变热」

### 3. 架构状态 vs 微架构状态

| 类型 | 例子 | Spectre 撤销？ |
|------|------|----------------|
| 架构状态 | 通用寄存器、标志位、程序计数器 | 会回滚 |
| 微架构状态 | L1/L2 缓存内容、分支预测器历史、填充队列 | **通常不回滚** |

攻击者读的是**微架构状态**——这就是侧信道。

### 4. 攻击三阶段（论文 Figure 1 抽象）

1. **布置泄密 gadget**：在受害者地址空间找到（或诱导）一段代码，投机执行时会「读秘密 → 依赖秘密访问缓存」。
2. **训练误预测**：反复用合法输入让分支预测器学会「这条路几乎总成立」，再传入恶意输入；或污染 **BTB**（Branch Target Buffer）让间接跳转去错地方。
3. **侧信道读出**：用 **Flush+Reload** 或 **Evict+Reload** 测量缓存，还原秘密字节；对字符串可逐字节循环。

### 5. 两种主要变体

| 变体 | CVE | 机制 | 典型场景 |
|------|-----|------|----------|
| **Spectre v1** | CVE-2017-5753 | 条件分支**方向**误预测 | 绕过 `if (x < size)` 边界检查 |
| **Spectre v2** | CVE-2017-5715 | 间接分支**目标**误预测（BTB 投毒） | 在受害者进程里投机执行 ROP 式 gadget |

论文 Section 4 详述 v1，Section 5 详述 v2；两者可组合 Flush+Reload，也可在浏览器 JavaScript 中演示（同进程沙箱逃逸）。

### 6. Flush+Reload 侧信道（简述）

攻击者与受害者共享某级缓存（同进程、同核、或共享库页）时：

1. **Flush**：用 `clflush` 等把探测数组各缓存行清出
2. **Trigger**：让受害者（或投机路径）访问 `array2[k * STRIDE]`
3. **Reload**：计时读取 `array2[i * STRIDE]`，**最快**的 `i` 往往等于秘密 `k`

STRIDE 通常取 512 或 4096 字节，保证每个索引独占一条缓存行，避免 prefetch 干扰。

## 论文经典 gadget：Spectre v1

Section 4 的条件分支例子（Listing 1）是整篇论文的「Hello World」：

```c
/* 受害者函数片段 — 逻辑上安全，微架构上可被利用 */
if (x < array1_size)
    y = array2[array1[x] * 256];
```

**正常执行**：`x` 越界 → 比较失败 → 不读 `array1[x]`。

**攻击者控制的设定**：

1. 多次传入合法 `x`，训练分支预测器「这个 if 几乎总为真」
2. 用 `clflush` 把 `array1_size` 和 `array2` 清出缓存，让边界比较**变慢**
3. 传入恶意 `x`，使 `array1[x]` 的地址落在**受害者秘密字节 k** 上（论文：`x = (secret_addr - array1_base)`）
4. CPU 在等 `array1_size` 期间**投机**走进 if，读 `k`，访问 `array2[k * 256]`
5. 比较结果返回后撤销 `y`，但 `array2[k * 256]` 所在缓存行已变热
6. 攻击者对 `i = 0..255` 做 Flush+Reload，命中最快的 `i` 即 `k`

**逐行直觉**：

- `array1_size` 是软件眼里的「门卫」
- 门卫核实身份时，CPU 已按「会通过」的猜测把保险柜摸了一遍
- 门卫说「不对，出去」——摸过的事实写在缓存温度计上

## 代码示例 1：Flush+Reload 探测循环

下面是与论文 / PoC 同构的**教学用 C 伪代码**（不可直接当武器；省略对齐、页表与权限细节）：

```c
#define STRIDE 4096
#define THRESHOLD 80   /* 缓存命中 vs 未命中的周期阈值，需校准 */

uint8_t probe[256 * STRIDE];  /* 256 个探测页，每页至少一条缓存行 */

static inline uint64_t rdtsc(void) {
    uint32_t lo, hi;
    __asm__ volatile("rdtsc" : "=a"(lo), "=d"(hi));
    return ((uint64_t)hi << 32) | lo;
}

/* 攻击者：测量 probe[i*STRIDE] 是否在缓存里 */
int flush_reload_probe(void) {
    int hits[256];
    for (int i = 0; i < 256; i++)
        hits[i] = 0;

    for (int attempt = 0; attempt < 1000; attempt++) {
        /* 1. 清掉整个探测数组 */
        for (int i = 0; i < 256; i++)
            _mm_clflush(&probe[i * STRIDE]);

        /* 2. 触发受害者 gadget（训练 + 恶意 x） */
        victim_gadget(malicious_x);

        /* 3. 计时读回：投机路径若访问 probe[k*STRIDE]，该处会更快 */
        for (int i = 0; i < 256; i++) {
            uint64_t t0 = rdtsc();
            volatile uint8_t junk = probe[i * STRIDE];
            uint64_t t1 = rdtsc();
            if (t1 - t0 < THRESHOLD)
                hits[i]++;
        }
    }
    /* 命中次数最多的 i 即泄漏字节 k */
    return argmax(hits, 256);
}
```

**要点**：

- `rdtsc` 把「读一行内存的延迟」变成可测量信号
- 投机执行的 `array2[k * STRIDE]` 与 `probe[k * STRIDE]` 若映射同一缓存集合，则 `k` 被重建
- 需多次采样 + 阈值校准，对抗噪声与预取

## 代码示例 2：Spectre v2 与 retpoline 缓解

Spectre v2 污染 BTB，让受害进程的**间接跳转**（函数指针、虚表、`switch` 跳转表）投机跳到攻击者布置的 gadget。Linux 内核广泛采用 **retpoline** 替换间接 `call/jmp`：

```c
/* 简化：编译器/汇编对间接调用的 retpoline 包装（x86-64 概念） */
#define RETPOLINE_THUNK \
    "1: call 2f\n" \
    "2: pause\n" \
    "   lfence\n" \
    "   jmp 1b\n" \
    "2:"

/* 间接调用 target 时，先跳进 thunk，使 BTB 预测到安全循环 */
asm volatile(RETPOLINE_THUNK : : : "memory");
(*indirect_target)(args);
```

**直觉**：

- 裸 `call *%rax` 的 BTB 条目可被跨进程或跨 VM 训练（具体条件依 CPU 型号）
- retpoline 让预测器「以为要进一个小循环」，等真实目标解析完再跳过去，缩小投机窗口
- 仍非银弹：需编译器、内核、微码、**IBPB**（间接分支预测屏障）组合

用户态编译器缓解示例（Intel 软件安全指南）：在敏感边界检查后加入 **lfence**，阻止后续 load 被投机排到检查之前：

```c
if (x < array1_size) {
#ifdef MITIGATION_SPECTRE_V1
    _mm_lfence();   /*  speculation barrier */
#endif
    y = array2[array1[x] * 256];
}
```

更稳妥的模式是 **index masking**：即使投机也读不出界——`index = x & (array1_size - 1)`（要求 size 为 2 的幂），或 Intel 的 `array_ptr()` 内联封装。

## 与 Meltdown 的对比

| 维度 | Spectre（本文） | Meltdown [[lipp-meltdown-2018]] |
|------|-----------------|----------------------------------|
| 根因 | 分支**误预测**导致瞬态执行 | 权限检查**晚于**乱序 load |
| 受害者代码 | 常是**正确**的 | 依赖「用户态能发起内核读」的时序 |
| 典型目标 | 同进程/同核其他上下文 | 内核映射、物理内存窗口 |
| 主要缓解 | retpoline、lfence、IBPB、SLH | KPTI / KVA Shadow |

两者同日披露，合称 **2018 CPU 漏洞地震**；实际部署需同时打微码、内核与编译器补丁。

## 影响范围与缓解（2018 视角）

论文在 **Intel、AMD、ARM** 处理器与 **JavaScript** 环境中验证了可读任意进程内存的可行性。影响包括：

- **浏览器**：站点 A 可能读到站点 B 的数据（同进程多标签）
- **云**：同物理核不同 VM 的侧信道风险上升（需调度隔离 + 微码）
- **密码学库**：常量时间实现防的是**架构层**计时，未必覆盖**投机层**缓存信道

缓解分层：

1. **硬件 / 微码**：IBPB、STIBP、增强 BTB 隔离（因型号而异）
2. **内核**：retpoline、单线程间接分支预测策略
3. **编译器**：`-mspeculative-load-hardening`、自动插入 lfence、指针 sanitization
4. **应用**：避免秘密与攻击者可控索引在同一热路径；密钥 material 用 `mlock` + 最小权限仍不够，需假设 CPU 可能泄密

论文结论：**仅靠处理器特化补丁不够**；需要 ISA 层面明确「实现允许/禁止泄漏哪些微架构状态」，让软硬件对安全假设一致。

## 踩过的坑（学习时）

1. **把 KPTI 当成 Spectre 解药**：KPTI 主要防 Meltdown；Spectre v1 可在用户态数组边界场景直接生效。
2. **以为「检查了边界就安全」**：检查指令本身可能被投机**绕过顺序**——要在模型里加入微架构。
3. **忽略间接分支**：只加固 `if (x < n)`，忘了 `obj->vtable->fn()` 也能被 v2 利用。
4. **用网络攻击思维排障**：Spectre 是**本地/同机**问题，WAF 与 TLS 挡不住进程内读出。

## 适用 vs 不适用

**适合用 Spectre 框架理解**：

- 浏览器、JIT、Wasm 沙箱、Enclave 边界设计
- 云多租户调度与「是否同核跑密钥」的合规评估
- 读 CPU / 内核 / 编译器安全公告（CVE-5753、5715）
- 与 [[kocher-spectre-2019]] 对照阅读（同一工作的正式发表版笔记）

**不要硬套**：

- 传统栈溢出、UAF、SQL 注入——属于软件内存/逻辑 bug
- 纯钓鱼、中间人——与分支预测无关
- 「再多写一次 if 判断」——重复检查可能增加 gadget 表面积

## 历史时间线（可跳过）

- **1996**：Kocher 展示计时攻击可破 RSA；缓存侧信道进入主流视野
- **2017 年中**：Kocher 从 ROP + 分支预测联想推测执行风险；Google Project Zero 等独立发现重叠
- **2018-01-03**：与 Meltdown 协调披露；[spectreattack.com](https://spectreattack.com/) 上线
- **2019**：IEEE S&P 正式发表；行业推广 retpoline、微码、浏览器站点隔离（Site Isolation）

## 学到什么

1. **性能优化即共享状态**：分支预测器与缓存是跨安全域的「隐式通道」。
2. **撤销 ≠ 无副作用**：安全模型必须区分架构语义与微架构实现。
3. **正确代码也可被利用**：Spectre _gadget_ 来自合法指令序列，类似 ROP，但由 CPU 投机执行而非 attacker 写栈。
4. **缓解需全栈**：单点 lfence 或单点 KPTI 都不够；威胁模型要重写。

## 延伸阅读

- 官方 PDF：[spectreattack.com/spectre.pdf](https://spectreattack.com/spectre.pdf)
- arXiv：[1801.01203](https://arxiv.org/abs/1801.01203)
- Intel 开发者指南：[Bounds Check Bypass / CVE-2017-5753](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/advisory-guidance/bounds-check-bypass.html)
- 视频：[Computerphile — Spectre & Meltdown](https://www.youtube.com/watch?v=I5mRwzivHXw)

## 关联

- [[lipp-meltdown-2018]] —— 同日披露的「读内核」乱序攻击，常与 Spectre 对照
- [[kocher-spectre-2019]] —— 同一论文的姊妹笔记（IEEE S&P 发表视角）
- [[branch-prediction-yeh-patt-1991]] —— 分支预测如何被训练
- [[moesi-cache-coherence-1986]] —— 多核缓存共享与 Flush+Reload 的物理基础
- [[xen-2003]] —— 云虚拟化隔离；Spectre 后需重新审视同核调度
- [[sgx-2013]] —— Enclave 同样受推测执行泄漏影响

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[branch-prediction-yeh-patt-1991]] —— Yeh-Patt 1991 — 用最近 12 条分支的历史给 CPU 算命
- [[kocher-spectre-2019]] —— Spectre 攻击 — 推测执行偷看别人的内存
- [[lipp-meltdown-2018]] —— Meltdown — 乱序执行偷读内核内存
- [[log4shell-cve-2021-44228]] —— Log4Shell (CVE-2021-44228) — 一条日志字符串如何远程控制服务器
- [[meltdown-attack-2018]] —— Meltdown — 从用户空间偷读内核内存
- [[moesi-cache-coherence-1986]] —— Sweazey-Smith MOESI 1986 — 给多核 CPU 一份"谁手里有这块内存"的统一规则
- [[rowhammer-2014]] —— Row Hammer — 不碰邻居也能把邻居的位翻过来
- [[sgx-2013]] —— Innovative Instructions and Software Model for Isolated Execution
- [[xen-2003]] —— Xen 2003 — 让操作系统配合虚拟化，性能直接接近原生

