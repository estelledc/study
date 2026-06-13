---
title: Row Hammer — 不碰邻居也能把邻居的位翻过来
来源: https://users.ece.cmu.edu/~yoonguk/papers/kim-isca14.pdf
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Flipping Bits in Memory Without Accessing Them: An Experimental Study of DRAM Disturbance Errors**（Kim、Daly、Kim 等，ISCA 2014）首次系统性地把 **Row Hammer（行锤）** 现象摆到学术界和工业界面前：攻击者**只反复读取同一条 DRAM 行**（aggressor row / aggressor 行），**从不写入、也从不直接访问**相邻行里的比特，却能让相邻行（victim row，受害行）里的电荷泄漏，最终把 **0/1 翻转**——破坏内存隔离这一基本安全假设。

官方 PDF：[users.ece.cmu.edu/~yoonguk/papers/kim-isca14.pdf](https://users.ece.cmu.edu/~yoonguk/papers/kim-isca14.pdf)

日常类比：

> 想象一列老式公寓信箱，每个格子存一张「 charged / discharged 」的卡片代表 0 或 1。规定是：**只有打开某一层的总控电闸（wordline），才能读或写那一层的信箱**；别的层理应互不影响。  
> 论文发现：如果你**疯狂反复开关同一层的电闸**——每次只是「打开→读一眼→关上」，从不动隔壁层的信箱——隔壁层某些格子的卡片会因为**电磁耦合、漏电通道或晶体管被反复应力**而**加速掉电**。在 DRAM 每 **64ms** 必须刷新一次电荷的窗口里，掉得够快，刷新就来不及，比特就从 1 悄悄变成 0。  
> 你锤的是 A 层，坏的是 B、C 层—— hence「**不访问它们，却翻转它们的位**」。

一句话：**Row Hammer 不是软件写错指针，而是 DRAM 物理层在工艺微缩后，「行与行之间本该绝缘」这件事做不够彻底。**

## 为什么重要

不理解这篇论文，后面一整条硬件安全线都接不上：

- 为什么 2015 年后浏览器、JavaScript 引擎要限制 `SharedArrayBuffer`、调整计时器精度——都和 **DRAM 侧信道 / 行锤** 有关
- 为什么 Google Project Zero 的 **DRAMMER**（2016）能在 **Android 上不用 root** 提权——根基就是 Kim 等人证明「用户态读内存就能制造位翻转」
- 为什么 **ECC 内存** 不能高枕无忧：论文表 5 显示同一 64 位字里可能出现 **2～4 个 victim cell**，SECDED 纠一位错、检两位错，**多比特翻转可能静默通过**
- 为什么 Intel 早在 2012 年就提交了 row hammer 相关专利，而学术界 2014 年才公开大规模实测——说明问题在业界早有认知，但**部署系统普遍低估**
- 为什么今天 DDR4/DDR5 有 **TRR（Target Row Refresh）**、**MTE**、内存控制器里的 **probabilistic refresh**—— mitigation 谱系可追溯到本文提出的 **PARA**

论文量化结论（摘要与第 6 节）：

| 指标 | 数值 |
|------|------|
| 测试模块 | 129 条 DRAM 模块（972 颗芯片），三家主流厂商 |
| 出现 disturbance error 的模块 | **110 / 129** |
| 触发翻转所需最少行激活次数 \(N_{th}\) | 少至 **139K** 次（55ns 间隔、64ms 刷新窗口内） |
| 易受干扰 cell 比例 | 最高约 **1 / 1.7K** |
| 2012–2013 年制造的模块 | **几乎全部** 可被诱导出错 |

## 核心概念

### 1. DRAM 不是「一个地址一个独立盒子」

DRAM 单元 = **电容 + 访问晶体管**。电容满/空表示 1/0，但电荷会自然泄漏，必须周期性 **refresh（刷新）**——JEDEC DDR3 默认约 **64ms** 刷一遍。

物理布局（论文 Figure 1）：

```
        bitline（列方向，竖线）
           │   │   │   │
wordline ──┼───┼───┼───┼──  第 0 行（row）
           │   │   │   │
wordline ──┼───┼───┼───┼──  第 1 行  ← aggressor：反复 open/close
           │   │   │   │
wordline ──┼───┼───┼───┼──  第 2 行  ← victim：电荷被「锤」泄漏
           ...
```

- **Row（行）**：共享一条 wordline 的一整排 cell
- **Bank**：多行共享一个 row-buffer（sense amplifier）
- **Rank**：多个 bank 组成一颗「内存条」上可被独立选中的一组芯片

CPU 读一个虚拟地址时，内存控制器会：**ACT（打开行）→ READ/WRITE 列 → PRE（关闭行）**。Row Hammer 的本质是：**对 aggressor 行执行太多次 ACT/PRE，wordline 电压反复高低切换，干扰相邻行 cell 保电荷能力。**

### 2. Disturbance error 的触发模式

论文 Table 4 归纳：能诱导错误的访问模式必须 **反复 open–close 同一行**：

| 访问模式 | 是否出错 |
|----------|----------|
| `(open–read–close)^N` | **是** |
| `(open–write–close)^N` | **是** |
| `open–read^N–close`（只开一次） | 否 |
| `open–write^N–close` | 否 |

根因：**反复 toggling 同一 wordline** → 电压波动 / 耦合 / 桥接故障 → 相邻行 **charge leakage 加速** → 在两次 refresh 之间 victim cell 掉电 → **bit flip**。

### 3. Aggressor 与 Victim

- **Aggressor row**：被疯狂激活的那一行
- **Victim row**：出错的行；论文 **6.3 节** 论证 victim ** predominantly 是 immediate neighbors（正上/正下相邻行）**
- 有趣细节：**只有原本处于 charged 状态（存 1）的 cell** 容易在干扰下 discharge 成 0；已 discharged 的 cell 不太「再翻一次」

### 4. 三个关键时间参数

| 参数 | 含义 | 论文观察 |
|------|------|----------|
| **RI（Refresh Interval）** | 两次 refresh 间隔 | RI 越短，victim 泄漏窗口越小，错误越少 |
| **AI（Activation Interval）** | 两次打开同一行的间隔 | AI 越长，hammer 次数/窗口内越少，错误越少 |
| **\(N_{th}\)** | 在 RI=64ms 内触发错误所需最少激活次数 | 三颗代表模块：139K / 155K / 284K |

### 5. PARA：论文提出的低开销缓解

**PARA（Probabilistic Adjacent Row Activation）**：每次 **关闭** 一行时，以很小概率 \(p\)（如 **0.001**）**额外打开并刷新** 其左右相邻行之一。Hammer 者可以疯狂敲 aggressor，但统计上相邻行迟早会被「顺带 refresh」，电荷补回来，翻转概率降到 **\(10^{-14}\)/年** 量级（Table 7）。

优点：**无状态**——不必在内存控制器里给每行维护 hammer 计数器（硬件面积贵）。

## 实践案例

### 案例 1：用户态「锤行」最小逻辑（教学伪代码）

Kim 等人在 **真实 Intel/AMD 系统** 上用用户程序诱导错误。核心不是 magic opcode，而是 **让内存控制器对同一物理 row 反复 ACT→READ→PRE**。下面 C 风格片段说明**思路**（地址需映射到同一 bank 内同一 row；真实 exploit 还要解决 **row 物理地址推断**，后文简述）：

```c
// hammer_buf： mmap 的一大块缓冲区
// offset_aggressor： 经物理行对齐后，落在 aggressor row 内的偏移
volatile uint64_t *hammer = (uint64_t *)(hammer_buf + offset_aggressor);

// 论文有效模式：(open–read–close)^N
// 每次读不同 cache line 可减少 CPU cache 命中，迫使 DRAM 反复打开同一 row
#define HAMMER_COUNT 200000  // 论文 Nth 量级：139K～284K

static inline void mfence(void) {
    __asm__ __volatile__("mfence" ::: "memory");
}

void row_hammer_naive(void) {
    for (int i = 0; i < HAMMER_COUNT; i++) {
        // volatile 读 → 内存访问不会被编译器优化掉
        (void)*hammer;
        mfence();  // 序列化，避免 CPU/内存 reorder 削弱 hammer 强度
    }
}
```

**逐行解释**：

- `volatile` + 循环：保证生成 **\(N\) 次真实 DRAM 读**，而不是被优化成读一次寄存器
- `HAMMER_COUNT` 取 200K：落在论文测得的 **\(N_{th}\)** 附近；实际模块因厂商/年份差异很大
- `mfence`：在教学/复现实验里常用；后续 DRAMMER 等 work 还会配合 **`clflush` 逐出 cache**，确保每次读都打到 DRAM row-buffer 路径
- **权限**：普通用户进程只能锤 **自己映射的页**；但若 victim 数据在同一 rank/bank 的相邻 row（如同进程堆上的 guard 页、页表、函数指针），仍可能 **破坏进程内安全边界**——更高级的跨进程攻击需要 **内存喷洒 + 物理行定位**（超出本文范围，但 Kim 2014 已指出 **可能 breach memory protection**）

### 案例 2：论文在 Intel/AMD 上真正诱导翻转的 Code 1a

Kim 等人在 Sandy Bridge / Ivy Bridge / Haswell / Piledriver 上，用 **2GB DDR3 模块** 观察到 **数千至上万次 bit flip**（Table 2）。关键不是「读同一个地址 N 次」，而是 **选两个物理地址 X、Y，映射到同一 bank 的不同 row**，迫使内存控制器反复 **ACT→PRE** 切换：

```asm
; Code 1a — 论文 §4，在真实 x86 系统上诱导 disturbance error
; X、Y 须落在同一 bank、不同 row（Intel 上常用 Y = X + 8MB 等启发式）
code1a:
    mov  (X), %eax      ; 读 row X → 触发 ACT_X … PRE_X
    mov  (Y), %ebx      ; 读 row Y → 触发 ACT_Y … PRE_Y
    clflush (X)         ; 逐出 cache，下次读必须再进 DRAM
    clflush (Y)
    mfence              ; 保证 flush 完成后再开始下一轮
    jmp  code1a

; Code 1b — 对照组：只读 X，同一 row 只 ACT 一次、中间全是列读 → 不出错
code1b:
    mov  (X), %eax
    clflush (X)
    mfence
    jmp  code1b
```

内存控制器看到的命令序列对比：

```text
Code 1a:  ACT_X, READ_X, PRE_X, ACT_Y, READ_Y, PRE_Y, ACT_X, …  ← 反复 toggling wordline
Code 1b:  ACT_X, READ_X, READ_X, READ_X, …, PRE_X               ← 只开一次行，无 hammer
```

**零基础要点**：

- `clflush` 把 cache line 踢出去，否则 CPU 可能 **命中 L1/L2**，根本到不了 DRAM
- 乱序 CPU 会把多次 load **排队** 到内存控制器，形成 `(reqX, reqY, reqX, reqY, …)` 的 hammer 节奏
- Code 1a **不写 DRAM**，翻转只能来自 disturbance——直接证明「读也能破坏邻居」
- 论文在 Memtest86+ 定制环境里跑，绕过复杂 OS 页表；但结论对 **普通用户态程序** 同样成立

### 案例 3：用 Python 模拟 PARA 如何压掉 hammer 成功率

PARA 没有复杂数据结构，可以用抛硬币模拟「每次关 aggressor 行时，是否顺带 refresh 邻居」：

```python
import random

def simulate_para(hammer_swings: int, p_refresh: float = 0.001) -> bool:
    """
    返回 True 表示 victim 行在 hammer 结束前从未被 PARA refresh —— 即攻击成功。
    hammer_swings： aggressor 被 open-close 的次数（论文 Nth ~ 1.39e5）
    p_refresh：     每次关行时 refresh 左或右邻行的概率（论文示例 p=0.001）
    """
    victim_refreshed = False
    for _ in range(hammer_swings):
        # 关闭 aggressor 时，PARA 以概率 p 刷新相邻行
        if random.random() < p_refresh:
            victim_refreshed = True
            break
    return not victim_refreshed  # True = 攻击者赢： victim 一直没被补电

# 单次试验：139K 次 hammer，p=0.001
success = simulate_para(139_000, p_refresh=0.001)

# 论文 Table 7：p=0.001, Nth=100K 时，持续 hammer 一年的错误概率约 9.4e-14
# 蒙特卡洛：重复 10000 次看经验成功率
trials = 10_000
wins = sum(simulate_para(139_000, 0.001) for _ in range(trials))
print(f"PARA 未 refresh 的比例（经验）: {wins / trials:.6f}")
```

**逐段解释**：

- 内层循环对应 **每一次 aggressor 行关闭**——真实硬件在 PRE 之后掷 biased coin
- 只要 **任意一次** refresh 命中 victim，电荷被 sense amplifier 读回再写回，hammer 累积泄漏被 **清零**
- `p=0.001` 时，139K 次 hammer 仍可能赢 **一次都不 refresh**，但概率极小；论文算 **持续恶意 hammer 一整年** 的成功率约 **\(9.4 \times 10^{-14}\)**——对数据中心而言足够低，且 **几乎不增加正常 workload 开销**（绝大多数关行不触发额外 ACT）

### 案例 4：为什么「虚拟地址相邻」不等于「物理 row 相邻」

Row Hammer 发生在 **DRAM 物理行**。操作系统给你的 `malloc` 相邻指针，可能映射到 **不同 bank**，hammer A 根本碰不到 B：

```
虚拟地址：  [ page X + 0x0000 ]  [ page X + 0x1000 ]  ← 看起来挨着
                ↓ 页表               ↓
物理 frame：  frame 0x8a000         frame 0x3f000      ← 可能不相邻
                ↓ DRAM 映射           ↓
DRAM 位置：   bank2, row 101        bank5, row 7       ← hammer row 101 伤不到 row 7
```

后续 exploit（如 **DRAMMER**）大量工作花在 **reverse-engineering 内存控制器寻址函数**，把 aggressor 和 victim **喷到同一 bank 的 ±1 物理行**——Kim 2014 用 FPGA 平台可以精确指定 row；在商用 OS 上则需要 **内存占用技巧**。这是「论文证明存在」到「野外可利用」之间的工程鸿沟。

## 论文实验方法（读论文时对照）

1. **真实系统 demo**：x86 用户态程序，大量 DRAM 访问，在 Intel/AMD 机器上观察到翻转
2. **FPGA 测试平台**：129 模块、可控 RI/AI、逐 row 扫描；产出 Table 3 厂商/日期统计
3. **TestBulk / TestEach**：Bulk 测整模块；Each 对 **每一行** 单独 hammer，找出 aggressor 比例（最高 **100%** 行都可当 aggressor）

Manufacture date 边界（约 2010–2011 后新 die）与错误出现强相关——说明 **工艺节点缩小后隔离变难**，不是单一厂商良率偶发事件。

## 缓解与后续演进

| 层级 | 方法 | 与 Kim 2014 关系 |
|------|------|------------------|
| 内存控制器 | **PARA**、TRR、双倍 refresh | PARA 为本文原创 proposal |
| DRAM 芯片 | 加强 cell 隔离、产测筛选 | 厂商原有路线，论文证明仍漏网 |
| 系统软件 | 禁止可疑 `/dev/mem`、限制 CLFLUSH 暴露面 | 降低用户态 hammer 能力 |
| 架构 | **ECC、Chipkill** | 减轻但无法覆盖多 bit victim（Table 5） |

2014 之后的重要分支（本文 **不展开 exploit 细节**，只标脉络）：

- **2015 Google**：Row Hammer 与 **capability 安全**、浏览器沙箱
- **2016 DRAMMER**：Android rootless；**double-sided hammer**（同时锤 aggressor 上下两行）降低 \(N_{th}\)
- **2018 RAMBleed**：利用 Row Hammer **读** 相邻行 charge 状态（「不访问却读取」）
- **DDR5** 规范把 **Adaptive Refresh Management** 写进标准——行业终于从「实验室现象」变成「每代 JEDEC 必谈项」

## 与 Meltdown / Spectre 的对比

| 维度 | Row Hammer (2014) | Meltdown / Spectre (2018) |
|------|-------------------|---------------------------|
| 层次 | **DRAM 物理** | **CPU 微架构** |
| 操作 | 合法 **读** 自己映射内存 | 非法/误导 **推测读** |
| 侧信道 | 直接 **改 victim 比特** | 主要 **泄漏** 不修改 |
| 缓解主战场 | 内存控制器、DRAM 刷新策略 | 页表隔离、微码、屏障 |

三类漏洞共同教训：**「架构规格保证的隔离」≠「物理实现里的隔离」**。

## 读论文路线图

1. **§2–3**：DRAM 组织、refresh、disturbance 背景 —— 建立 row/bank/wordline 词汇
2. **§4–5**：真实系统 demo + FPGA 方法论
3. **§6**：**RI / AI / \(N_{th}\)**、aggressor–victim 邻接性、charged-only 翻转 —— 核心实验章
4. **§8.2**：**PARA** 概率分析 —— 工程上最可落地的 mitigator

## 自测题

1. 为什么 `(open–read–close)^N` 能出错，而 `open–read^N–close` 不行？
2. 若把 refresh 间隔从 64ms 减半，hammer 成功率如何变化？对应论文哪张图？
3. PARA 的 \(p=0.001\) 意味着什么？为何说它是 **stateless**？
4. SECDED ECC 为何不能声称「完全防 Row Hammer」？

## 相关链接

- 论文 PDF：[kim-isca14.pdf](https://users.ece.cmu.edu/~yoonguk/papers/kim-isca14.pdf)
- 作者 ISCA 2014 幻灯片：[dram-row-hammer_kim_talk_isca14.pdf](https://users.ece.cmu.edu/~omutlu/pub/dram-row-hammer_kim_talk_isca14.pdf)
- 同仓库笔记：[[meltdown-attack-2018]]、[[spectre-attack-2018]]、[[kocher-spectre-2019]]、[[lipp-meltdown-2018]]
- 延伸阅读：Onur Mutlu 研究组 [DRAM RowHammer 项目页](https://users.ece.cmu.edu/~omutlu/pub/all-papers-by-date.html)（含 TRR、Blacksmith 等后续工作）

## 小结

Kim 等人 2014 年证明：**commodity DRAM 在合法访问模式下即可破坏邻近数据**，且 **110/129** 模块可复现、**139K** 量级激活即可翻转。根因是 **wordline 反复切换** 加速相邻 cell 漏电；缓解方面 **PARA** 用极小概率邻行 refresh 换取极低残余风险。Row Hammer 开启了「**内存条本身是攻击面**」的时代——之后 decade 的权限提升、浏览器沙箱突破、云多租户隔离重估，都能把 lineage 追到这里。
