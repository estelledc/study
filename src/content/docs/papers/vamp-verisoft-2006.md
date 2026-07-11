---
title: VAMP — 把一颗有流水线、乱序、浮点和 cache 的处理器从门电路证到指令集
来源: Beyer, Jacobi, Kröning, Leinenbach, Paul, "Putting It All Together — Formal Verification of the VAMP", Journal of Universal Computer Science 13(5), 2006
日期: 2026-05-31
分类: 形式化方法
难度: 高级
---

## 是什么

VAMP（Verified Architecture Microprocessor）是 Verisoft 项目里那颗被一证到底的 RISC 处理器。和母项目 [[verisoft-2008]] 不同，本文聚焦硬件层：一颗带取指/译码流水、Tomasulo 乱序核、IEEE-754 浮点、MMU 与 cache 的真处理器，从门电路语义证到指令集语义。早期门级证明主要在 PVS；进入 Verisoft 端到端栈后，证明与上层接合迁到 Isabelle/HOL。

日常类比：发动机厂家不光说「这台 V8 输出 400 马力」，还把每根活塞、每个气门在显微镜下拍下来，用数学证明这堆零件组装起来就是那 400 马力——不是路试，是证明。

「证到指令集」的意思是：程序员眼里的每条指令（加、跳、读内存），都能在门电路行为上找到对应，而且对应关系有定理保证，不是「测了很多用例碰巧对」。

## 为什么重要

在 verisoft-2008 综述里 VAMP 只占一小段，但它本身是约 6 人、数年的活，单独一篇 30 页论文。不理解 VAMP，下面这些事都讲不清。

- 为什么 seL4 不证 CPU —— Verisoft 做过一次，知道代价多大
- 为什么 RISC-V 形式化（Sail）从 ISA 出发而不是门电路 —— VAMP 给出了门级证明的真实成本
- 浮点证明最难：IEEE-754 要翻进定理证明器；同代 HOL Light 证 Kepler 猜想也走「把规范写成可证数学」这条路
- Tomasulo 乱序证明是早期少数完整证完的乱序核之一（同期还有 Sawada-Hunt 的 ACL2 工作），同属后来工业 CPU 验证（如 Centaur ACL2）所在的方法学谱系

## 核心要点

VAMP 的证明结构可以拆成 5 件事。

1. **RTL 层 vs ISA 层 —— 两套语义之间架桥**：类比「电路图纸」对「用户说明书」。RTL（register-transfer level）把寄存器、ALU、控制信号写成布尔函数；ISA 是抽象的「执行 ADDI」。定理：RTL 跑 N 个时钟，对应 ISA 跑了 K 条指令（K ≤ N，因为有 stall 气泡和预测失败）。

2. **Tomasulo 乱序 —— 调度器 + 重排序缓冲**：Tomasulo（1967，IBM）像厨房里多灶同时炒菜，但上菜仍按点单顺序。保留站排队等操作数，CDB（公共数据总线）广播结果，ROB（重排序缓冲）保证按程序序提交。证明核心：乱序执行，提交后的可观测状态仍等价于顺序语义。

3. **IEEE-754 浮点**：32/64 位、4 种舍入、含 denormal（极小的「非规格化」数，商用 CPU 常丢给慢路径）。证明 ALU 电路 = IEEE 算术抽象；独立成 Berg、Jacobi 的博士工作。

4. **MMU 和 cache**：虚拟地址 load/store ≡ 物理语义 + 页表查询；cache 对软件不可见——有 cache 与无 cache 的内存语义一致。

5. **和 C0 编译器 / VAMOS 内核接合**：VAMP 的 ISA 层正是 C0 编译器证明的目标语义，共用 Isabelle 状态空间，才能拼出端到端定理。

## 实践案例

下列片段是教学示意，不是可直接检的 Isabelle 证明脚本。

### 案例 1：RTL 一个时钟周期到底证什么

```
step_RTL 重复 N 次后的相关寄存器
  ＝
step_ISA 重复 K 次后的值
```

**逐部分解释**：

1. `step_RTL`：所有寄存器按当前控制信号同时更新（一个时钟）
2. `step_ISA`：抽象地执行一条指令
3. 难点是 stall 与 forwarding，使 N 与 K 不再 1:1
4. 证明要构造「映射函数」从 RTL 抽出 ISA 状态，再归纳保持该映射

### 案例 2：浮点加法为什么难证

电路四步：对齐指数（移位）→ 加尾数 → 规范化 → 舍入。要证：

```
电路输出 = round(real_add(a, b))
```

**逐部分解释**：

1. 对齐：小数点对齐，移位错一位后面全错
2. 加尾数：可能溢出，要进位到指数
3. 规范化：把结果调回「1.xxx × 2^e」形态
4. `round`：四种舍入之一；光「移位位数对」就要大量 Isar（Isabelle 可读证明语言）行；整块 FPU 证明约数万行

### 案例 3：Tomasulo 乱序的精化关系

找一个**精化关系**（refinement）：乱序硬件的可观测写（寄存器/内存）必须等价于某顺序语义一条条执行的可观测写。

**逐部分解释**：

1. 乱序机内部可以「先算后面的、后算前面的」
2. 但对外只看 commit 写回的结果
3. ROB 按 program order 排队，commit 必按此序写回
4. 投机指令若异常，必须在 commit 前抛弃——漏写一行整套证明崩

### 案例 4：端到端怎么拼起来

两条 lemma 复合：

- C0 编译器：`C0 程序 P` 的语义 = 编译产物在 VAMP-ISA 上的语义
- VAMP：`VAMP-ISA` 的语义 = RTL 上 N 个周期的行为

拼起来就是「C0 源码 → 物理硬件」——verisoft-2008 说的「端到端」真正指这个。

## 踩过的坑

1. **投机执行 + 异常**：未提交的投机指令产生异常时规约写错，下面整套证明崩（Jacobi 论文专章）。
2. **denormal 全硬件**：证明量翻倍，换来「固定时钟内完成」；商用常走慢路径。
3. **Cache 只证单核**：多核 MESI 等一致性在 VAMP 外，是 Verisoft XT 话题。
4. **只证行为、不证时序闭合**：能不能跑到 1 GHz 是综合工具的事；「证完」≠「能流片」。
5. **RTL 是 Isabelle 手写等价物**，不是 Verilog 自动翻译；工业还要再加一层翻译。
6. **改一行实现可能重证几千行**：forwarding 加一条，步进定理归纳要重做。

## 适用 vs 不适用场景

**适用**：

- 教科书 —— 看「流水 + 乱序 + 浮点」完整证明长什么样（人年级数投入）
- 启发后续 —— 可执行 ISA 规约（Sail、ARM 机器可读 ISA）
- 安全 CPU / 教学 —— 航天医疗密码硬件；Saarland 体系结构课用 VAMP 当教具

**不适用**：

- 工业 x86 / ARM —— 体积太大；VAMP 是简化 DLX
- 多核 / NUMA —— 只有单核
- 动态频率 / 低功耗 —— 无时序细节
- 软核直接综合 —— Isabelle RTL 不能直接喂综合工具（后来另做可综合版本）

## 历史小故事（可跳过）

- **1992-1995**：Wolfgang Paul 用 PVS 证 DLX（前身）
- **2002-2003**：方法学定稿；Verisoft 启动，VAMP 成硬件层主体，工具迁向 Isabelle
- **2003-2005**：流水线、Tomasulo、浮点、MMU、编译器接口多篇博士并行
- **2006**：本文把方法与定理拼成 30 页综述
- **2007**：FPGA 上真跑；其后 Verisoft XT 更多停在 ISA 层，不再下到门电路

## 学到什么

1. **证 CPU 的瓶颈是规约**：写出 ISA / IEEE-754 / MMU 的形式语义往往比推证明步骤更难。
2. **乱序证明 = 精化关系**：找到序列化模型与乱序执行的对应，再按结构归纳。
3. **浮点是严格代数**：对就是对，错就是错，没有「差不多」。
4. **硬件证明给上层地基**：C0 证明可直接假设「硬件对」；证明工程需要工具链与回归，项目结束后工件失维护是真实代价。

## 延伸阅读

- 论文 PDF：[Beyer et al. 2006 — Putting It All Together](https://www-wjp.cs.uni-saarland.de/publikationen/BJKLP06.pdf)（30 页综述，先读引言与主定理）
- 项目页：[Saarland WJP](https://www-wjp.cs.uni-saarland.de/projekte/verification/)（技术报告与相关源码入口）
- Beyer 博士论文 —— 流水线与中断细节
- Jacobi 博士论文 —— Tomasulo 调度器证明细节
- Berg-Jacobi —— VAMP 浮点单元证明细节
- [[verisoft-2008]] —— 母项目；[[isabelle-hol-2002]] —— 证明工具；[[compcert]] —— 同期编译器证明

## 关联

- [[verisoft-2008]] —— VAMP 是其硬件层；端到端定理由两者拼出
- [[isabelle-hol-2002]] —— 主证明工具；浮点证明大量用 Isar
- [[compcert]] —— 同期 C 编译器证明，目标 ISA 不同
- [[cakeml]] —— 后辈自举编译器，目标 ISA 用 Sail
- [[hol-light-2009]] —— 同代把规范写成可证数学的路线
- [[acl2-2000]] —— 工业 CPU 验证另一条路（Centaur 等）
- [[hoare-logic]] —— 上层程序证明的逻辑基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
