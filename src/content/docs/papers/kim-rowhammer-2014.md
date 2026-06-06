---
title: RowHammer — 只读内存也能把邻居的 bit 敲 flip
来源: 'Yoongu Kim et al., "Flipping Bits in Memory Without Accessing Them: An Experimental Study of DRAM Disturbance Errors", ISCA 2014'
日期: 2026-05-30
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

**RowHammer**（行锤击）是一种 DRAM 物理层漏洞：你**只反复读取**某个内存地址，却可能让**相邻存储行**里的 bit 从 0 变成 1（或反过来）——你从未写入那些地址，也从未在软件里「访问」过它们。

日常类比：像住在公寓里，你只是在自家门反复开关（读自己的页），门轴震动传到了隔壁墙，把邻居书架上一本书震掉了（相邻 row 的 cell 漏电丢电荷）。门是你家的，掉书的是邻居家——**内存隔离**在物理层被打破了。

DRAM 里数据存在 tiny 电容里，按 **row（行）** 组织。要读某一格，内存控制器得先 **activate（打开）** 那一整行——把 wordline 电压拉高。Kim 等（ISCA 2014）证明：对**同一行** activate/close **太多次**，会通过电磁耦合等方式让**附近行**的 cell **加速漏电**；若在两次 refresh 之间电荷丢光，就出现 **disturbance error**——bit flip。

论文用普通用户态程序（mov + clflush，无需 root）在 Intel/AMD 机器上实测 flip；129 块 DDR3 条里 **110 块**可诱导错误。

## 为什么重要

不理解 RowHammer，下面这些事都没法解释：

- 为什么云厂商后来**强制 ECC**、在 DDR4 里加 **Target Row Refresh (TRR)**——源头就是这篇 ISCA 2014
- 为什么浏览器一度限制 **SharedArrayBuffer** / 高精度定时器——后续 exploit 用它们做 hammer 计时与侧信道
- 为什么「**只读不写**」在 security model 里不能假设无副作用——读可以经 DRAM 物理层改别人的数据
- 为什么 **JavaScript 沙箱**、**VM 隔离**不能只靠页表——攻击者 hammer 自己页就能 corrupt 内核/邻居 VM 页（需后续工程化 exploit）

## 核心要点

RowHammer 机制可以拆成 **三步**：

1. **Row 是打开/关闭的单位，不是单个 byte**：读一个地址会先 ACTIVATE 整行，读完 PRECHARGE 关闭。类比：不是「翻开书中一个字」，而是「整页纸被抽出来又塞回去」。反复抽同一页，隔壁页会晃。

2. **Hammer 模式 = 强迫 memory controller 反复切换 row**：论文 Code 1a 交替读地址 X 和 Y（映射到**同 bank、不同 row**），每次读前 **clflush** 清 cache，保证请求落到 DRAM。内存控制器序列类似 `(ACT_X, READ, PRE_X, ACT_Y, READ, PRE_Y, …)`——这才是 hammer。只 hammer 单行（Code 1b）几乎不 flip。

3. **阈值与缓解**：FPGA 实测最少约 **139K 次** row 激活可 flip 一位；约 **1/1700** cell 可能受害。缓解包括更频 refresh、ECC（有局限）、以及论文提出的 **PARA**——每次 toggle wordline 时以极小概率 p **顺带 refresh 相邻 row**，低开销换安全。

论文还强调：disturbance 主要影响 **已充电（charged）** 的 cell——它们被加速放电；这与「写 1 变 0 / 读 charged cell 变 discharged」的数据模式有关，也是为何测试时用 RowStripe（奇偶行填 0/1）能诱导最多错误。

## 实践案例

### 案例 1：论文里的最小 hammer 循环（汇编）

下面简化自 Kim 等 Code 1a 的核心思路（x86 汇编）：

```asm
code1a:
    mov  (X), %eax      ; 读地址 X，数据进寄存器也进 cache
    mov  (Y), %ebx      ; 读地址 Y（与 X 同 bank 不同 row）
    clflush (X)         ; 把 X 对应 cache line 踢出去
    clflush (Y)         ; 把 Y 对应 cache line 踢出去
    mfence              ; 等 flush 完成再下一轮
    jmp  code1a
```

**逐部分解释**：

- `mov (X)` / `mov (Y)`：触发 load；若 cache 未命中，memory controller 会 open 对应 **row**
- `clflush`：关键——没有它，后续读会命中 cache，**根本不会反复 ACT/PRE DRAM row**
- X 与 Y 的物理地址需精心选（论文对 Intel 用 `Y = X ⊕ 8MB` 等技巧），使两次读落在**同 bank 不同 row**
- 循环百万次后，用 Memtest 类工具扫描**其他页**是否出现 bit flip——证明「只读也改别人数据」

### 案例 2：云多租户 — 为什么后来强制 ECC + TRR

场景：同一物理机跑租户 A 和 B 的两个 VM，页表隔离「正常」。

1. 租户 A 在用户态跑 hammer 循环，只 touch **自己** 映射的页
2. 由于 row 相邻映射，A 的 aggressor row 可能让 **B 的页**（或 hypervisor 元数据页）受害 cell 漏电
3. 2014 论文证明 phenomenon 广泛存在；2015 年后 Project Zero 等展示 **privilege escalation** 链（需结合页表喷射等技巧，超出本文范围）
4. 行业响应：DDR4 **TRR**（硬件在检测到某 row 被频繁打开时 refresh 邻居）、云厂商 **ECC 内存**政策、以及 microcode/BIOS 更新

这不是「某家云配置失误」，而是 **commodity DRAM 默认行为** 与 **安全假设** 冲突。

### 案例 3：安全审计 — 三问 checklist

评估一个跑 untrusted code 的服务（浏览器、WASM 沙箱、多租户 DB 旁路进程）：

```text
1. 主机 DRAM 代际？2012–2013 制造批次在论文里几乎全 vulnerable
2. 是否有 TRR / 更短 refresh / ECC？SECDED 对「同一 64-bit 字双 bit flip」仍可能 silent corruption
3.  untrusted 层能否跑 tight loop + flush cache？若可以，是否还有 timing / SAB 限制？
```

三条任一答「否/不知道」，RowHammer 就不能当「已缓解」而忽略。

## 踩过的坑

1. **「我只读，不会破坏数据」**——RowHammer 违反「读无副作用」不变量；根因在 DRAM 电路，不是 C 语言未定义行为。

2. **hammer 时不 clflush**——读全命中 cache，DRAM row 不会被反复打开，测不到 flip，误以为机器免疫。

3. **迷信 SECDED ECC**——论文 Table 5：同一 64-bit word 内 2 个 victim 时 SECDED **无法纠正**；≥3 个可能 **检测不到**，比 crash 更糟。

4. **把 PARA/TRR 当成软件补丁**——PARA 是 memory controller / DRAM 侧逻辑；应用层 `malloc` 对齐救不了 wordline 耦合。

## 适用 vs 不适用场景

**适用**（需要理解 RowHammer 时）：

- 设计 **云隔离**、**浏览器沙箱**、**机密计算** 的威胁模型
- 评估 **DDR3/DDR4** 老硬件是否还在生产环境跑 untrusted native code
- 读后续 **DRAMmer、Throwhammer、ECC 失效** 等论文的前置背景
- 解释为何 **硬件安全特性**（TRR、ECC、CXL 内存加密）成为采购项

**不适用**（不必从 RowHammer 入门）：

- 纯 **SSD/NVM** 存储可靠性（不同物理机制；可看 [[persistent-memory-2014]]）
- **网络层** 漏洞如 Heartbleed（协议实现 bug，非 DRAM 物理层；对比 [[heartbleed-2014]]）
- **密码算法本身** 的数学安全性（RowHammer 是实现/硬件层；算法看 [[aes]]）
- 已全面 **DDR5 + 强制 ECC + 最新 microcode** 且不接受 native code 的静态站点——风险低但仍非数学证明为 0

## 历史小故事（可跳过）

- **1970s**：Intel 1103 商用 DRAM 起，厂商已知 disturbance，靠电路隔离 + 出厂筛片控制。
- **2012**：Intel 等提交 row hammer 相关专利（论文审稿期间公开），说明产业早察觉，但未广泛告知用户。
- **2014-06**：Kim 等在 **ISCA** 发表，129 模块实验 + 真实系统 demo + PARA；「RowHammer」进入安全主流词汇。
- **2015–2016**：Google Project Zero、DRAMmer 等展示 **跨 privilege** exploit；浏览器厂商紧急限制 SAB。
- **2017+**：DDR4 TRR、云 ECC 标配；研究仍持续（double-sided hammer、网络远程触发等）。
- **2023**：原团队发表 Retrospective，回顾 RowHammer 从 lab curiosity 到 industry-wide mitigations 的十年。

## 学到什么

1. **安全假设必须对齐物理现实**——「读不改别人数据」在 DRAM 上曾为假；抽象机模型漏了 hardware coupling。
2. **缓解是分层栈**：user 权限 / 页表 / cache / memory controller / DRAM 电路 / ECC，缺一层都可能被链式利用。
3. **表征论文的价值**：Kim 等先量化「多宽、多快、多少模块」，后续 exploit 与 TRR 才有靶子；不是每篇安全论文都要 day-one RCE。
4. **老硬件长尾**：2012–2013 批次在论文里几乎全中招；嵌入式/二手服务器可能仍在场。
5. **读也是「写」的一种（在物理层）**：安全教材里的「读-复制-改-写回」四步模型，在 DRAM row 层要先 open row——hammer 利用的就是 open/close 的副作用，而非 column read 本身。

## 延伸阅读

- 论文 PDF：[Kim ISCA 2014](https://users.ece.cmu.edu/~yoonguk/papers/kim-isca14.pdf)（FPGA 方法论 + PARA 细节）
- 回顾文：arXiv [Retrospective RowHammer (2023)](https://arxiv.org/abs/2306.16093v1)（作者十年总结）
- 科普视频：搜索 "RowHammer explained"（Brendan Gregg / Black Hat 相关 talk 均可）
- [[heartbleed-2014]] —— 另一类「内存边界失效」，但是 OpenSSL 实现层
- [[aes]] —— 密码学正确仍挡不住 RowHammer 翻 key 所在物理页

## 关联

- [[heartbleed-2014]] —— 都挑战「内存/缓冲区隔离」，但 Heartbleed 是软件越界读，RowHammer 是硬件耦合写
- [[aes]] —— 密钥在 RAM 里；hammer 目标常是 flip 页表或 crypto 状态，而非破 AES 数学
- [[cryptoverif-2008]] —— 形式化证明 crypto 协议；RowHammer 提醒「证明假设的硬件层」可能不成立
- [[persistent-memory-2014]] —— 另一类内存技术可靠性议题，关注 NVM 而非 DRAM disturbance
- [[evo-memory-2511]] —— 现代内存系统演进语境，可与 TRR/ECC 缓解对照
- [[libsignal]] —— 端到端加密仍依赖客户端 RAM 完整性；物理层 flip 在威胁模型边缘
- [[hoare-logic]] —— 「程序性质」证明常假设内存模型；RowHammer 是模型与机器不一致的实例

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
