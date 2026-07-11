---
title: FLUSH+RELOAD 2014 — 用缓存时间偷看程序访问了哪行内存
来源: 'Yarom & Falkner, "FLUSH+RELOAD: a High Resolution, Low Noise, L3 Cache Side-Channel Attack", USENIX Security 2014'
日期: 2026-07-09
分类: 安全与隐私
难度: 中级
---

## 是什么

FLUSH+RELOAD 是一种缓存侧信道攻击：攻击者不直接读受害程序的数据，而是观察“某一行共享内存有没有被受害程序碰过”。

日常类比：你不能打开同事的抽屉，但你能把抽屉把手擦干净，过一会儿再摸一下有没有新指纹。
如果有新指纹，说明有人来过；如果没有，说明这段时间没人碰。

在电脑里，“擦干净”对应 `clflush` 把某条 cache line 从缓存里刷掉；“摸把手”对应重新读取这条内存并计时。
如果读取很快，说明受害程序刚访问过，数据又回到了缓存；如果读取很慢，说明它还在主内存里。

这篇论文把这个想法做成高分辨率、低噪声的攻击，并证明它能跨 CPU 核心、甚至跨虚拟机边界观察 GnuPG 的 RSA 私钥运算。

## 为什么重要

不理解 FLUSH+RELOAD，下面这些事会很难解释：

- 为什么“我没有权限读你的内存”不等于“我学不到你的秘密”；
- 为什么共享库、内存去重、虚拟机共驻这些省资源技术会放大安全风险；
- 为什么密码代码不只要数学正确，还要避免按密钥走不同代码路径；
- 为什么 Spectre / Meltdown 之前，微架构侧信道已经足够实用和危险。

## 核心要点

1. **共享页是门缝**：攻击者和受害者必须共享同一份只读页面，比如同一个动态库或被去重的可执行文件页面。
   类比：两个人看同一本公共图书，谁翻过哪一页会留下痕迹。
   只读保护能防止篡改内容，却挡不住缓存状态这种间接痕迹。

2. **缓存命中时间是指纹**：从缓存读数据通常比从内存读快很多。
   类比：桌上拿文件比去档案室取文件快。
   攻击者只要把“快”和“慢”分开，就能判断受害者是否访问过目标 cache line。

3. **L3 让攻击跨核心**：论文抓住 Intel 当时的 inclusive LLC 特性：L3 包含低层缓存的副本。
   类比：总仓库清掉某件货，各个小仓库也跟着没货。
   所以 `clflush` 能影响其他核心上的受害程序，不必和受害者挤在同一个核心里。

## 实践案例

### 案例 1：一轮 FLUSH+RELOAD 的心智模型

```text
flush(target_line)          # 先把这行内存从缓存里赶出去
wait(a_few_cycles)          # 给受害程序一点执行时间
time = reload(target_line)  # 自己再读一次，并测读取耗时
if time < threshold:
    record("victim touched it")
else:
    record("no observed touch")
```

逐部分解释：

- `target_line` 不是任意地址，而是攻击者和受害者共享页面里的某条 cache line；
- `threshold` 需要先校准，论文机器上缓存命中和内存访问差距很大；
- 这一轮只回答一个问题：“这段时间里，受害者有没有碰这行？”

### 案例 2：为什么 RSA 的平方乘算法会漏 bit

```text
for bit in private_exponent:
    square()
    reduce()
    if bit == 1:
        multiply()
        reduce()
```

逐部分解释：

- 如果私钥 bit 是 0，程序只走 `square -> reduce`；
- 如果私钥 bit 是 1，程序多走一次 `multiply -> reduce`；
- 攻击者监控这几个函数对应的 cache line，就能把执行节奏还原成 0/1 序列。

### 案例 3：修复思路是让路径看起来一样

```text
for bit in private_exponent:
    square()
    reduce()
    candidate = multiply()
    reduce()
    result = choose_without_branch(bit, candidate, result)
```

逐部分解释：

- 关键不是“不要乘”，而是每个 bit 都执行同样形状的动作；
- `choose_without_branch` 表示用常数时间选择，避免 `if bit` 直接控制代码路径；
- GnuPG 后续版本用 square-and-multiply-always 缓解了论文里的攻击样式。

## 踩过的坑

1. **把 side-channel 当成直接读内存**：它读不到内容本身，只读到“访问过没有”这种影子信息。

2. **以为 ASLR 足够防御**：共享物理页对应同一份缓存内容，单纯换虚拟地址挡不住。

3. **只看平均耗时**：攻击看的是命中和未命中的分布，系统噪声会改变阈值和误差。

4. **把常数时间理解成“每次一样快”**：真正目标是秘密不影响分支、访存地址和可观察资源使用。

## 适用 vs 不适用场景

**适用**：

- 受害者和攻击者共享只读页面，例如共享库、可执行文件映射或内存去重后的页；
- CPU 缓存结构让 `clflush` 能影响受害者会用到的缓存层；
- 目标程序的秘密会影响代码路径或内存访问模式；
- 攻击者能获得足够高分辨率的计时信号。

**不适用**：

- 没有共享页面，攻击者无法锁定同一条物理 cache line；
- 目标实现已经做到秘密无关的访存和分支；
- 系统关闭跨租户内存去重，并隔离不可信代码运行位置；
- 硬件或权限模型不允许用户态随意刷掉别人的缓存行。

## 历史小故事（可跳过）

- **2005 年前后**：研究者已经能用缓存时间攻击 AES，说明“快慢差”能泄露密钥线索。
- **2011 年**：Gullasch 等人把共享页加 `clflush` 的思路用于 AES，但主要依赖同核心场景。
- **2013 年**：Yarom 和 Falkner 披露 FLUSH+RELOAD，并推动 GnuPG / libgcrypt 修复。
- **2014 年**：USENIX Security 论文发表，跨核心、跨 VM 的缓存攻击成为云安全讨论重点。
- **2018 年后**：Spectre / Meltdown 让更多人意识到，微架构优化本身也能成为泄密通道。

## 学到什么

1. 安全边界不只在权限系统里，也在缓存、分支预测、计时器这些“看不见的共享资源”里。

2. 共享能省内存，但共享得越细，隔离边界就越容易被侧信道绕过。

3. 密码实现要按“攻击者能观察执行痕迹”来设计，而不是只按数学公式设计。

4. 防御要拆成四个问题：断共享、降计时精度、限制 `clflush`、消除秘密相关访存。

## 延伸阅读

- 论文 PDF：[FLUSH+RELOAD: a High Resolution, Low Noise, L3 Cache Side-Channel Attack](https://www.usenix.org/system/files/conference/usenixsecurity14/sec14-paper-yarom.pdf)
- 相关背景：[Cache Attacks and Countermeasures: The Case of AES](https://doi.org/10.1007/11605805_1)
- 相关论文：[[aes]] —— AES 软件查表实现也是缓存侧信道经典案例。
- 相关论文：[[rsa]] —— 本文攻击的示范目标是 GnuPG 的 CRT-RSA 私钥运算。
- 相关论文：[[kocher-spectre-2019]] —— 后来的 Spectre 把“微架构痕迹会泄密”推到更大范围。
- 相关论文：[[lipp-meltdown-2018]] —— Meltdown 同样说明硬件隔离和软件权限不是一回事。

## 关联

- [[aes]] —— 早期缓存攻击多以 AES 查表实现为目标，帮助理解侧信道传统脉络。
- [[rsa]] —— FLUSH+RELOAD 通过观察 RSA 平方乘运算恢复私钥 bit。
- [[cache-coherence-cxl3-2026]] —— 都围绕共享缓存/共享内存，但一个追求性能协作，一个暴露隔离风险。
- [[gpu-cache-coherence-2013]] —— 缓存一致性关注“数据什么时候可见”，侧信道关注“可见性会不会泄密”。
- [[moesi-cache-coherence-1986]] —— 理解缓存状态机后，更容易看懂为什么 flush / reload 能改变系统状态。
- [[kocher-spectre-2019]] —— Spectre 也常用缓存计时把 speculative execution 的痕迹读出来。
- [[kim-rowhammer-2014]] —— 同年展示另一类硬件副作用：不读不写目标位，也能通过物理机制影响它。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kocher-spectre-2019]] —— Spectre — CPU 猜错路时也会泄密
- [[lipp-meltdown-2018]] —— Meltdown — 从用户态读到内核内存的硬件漏洞
