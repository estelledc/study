---
title: McFarling 1993 — 用 XOR 把全局历史和 PC 拧在一起，再让两个预测器打擂台
来源: Scott McFarling, "Combining Branch Predictors", DEC WRL Technical Note TN-36, June 1993
日期: 2026-05-31
分类: CPU 微架构
难度: 中级
---

## 是什么

1993 年 DEC 西部研究院（WRL）的 Scott McFarling 写的一份**内部技术备忘录**（TN-36，不是会议论文），同时提出了两个改变后续 30 年硬件分支预测的设计：

- **gshare** —— 把全局历史寄存器（BHR）和分支地址（PC）做一次 XOR，结果当 PHT 索引。一个 XOR 门，几乎不花硬件，却让别名污染锐减。
- **锦标赛预测器**（tournament / combining predictor）—— 让两个不同思路的预测器并跑，再加一个 2 位选择器决定「这条分支该听谁的」。

日常类比：CPU 里有两个赌马的庄家，一个看分支地址的长期习惯（bimodal），一个看最近 12 步的走法（gshare）。再请一个裁判（meta-predictor）记下「**这条分支长期上更听哪个庄家**」。McFarling 的核心论证是——**没有哪个庄家永远对**，所以裁判比庄家本身更值钱。

## 为什么重要

Yeh-Patt 1991 把准确率推到 97%，但留了两个洞：

1. **PHT 别名污染**：纯用 BHR 当索引时，不同分支走到同一段历史就会撞同一格，互相覆盖训练
2. **没有任何一个预测器对所有分支都好**：循环回跳听 bimodal 就够、数据相关分支只有 gshare 看得到，强行统一必有结构性误判

McFarling 的两招分别治这两个洞：XOR 索引把别名打散；锦标赛让每条分支自己挑预测器。结果是同样硬件预算下准确率再升 2-3%，更关键的是这套**「多预测器 + 元选择器」的范式**贯穿了后续 30 年——TAGE、感知机预测器、SC-L 都是它在不同维度上的展开。1996 年 DEC Alpha 21264 直接把锦标赛抄进硅片，是当年 IPC 之王。

## 核心要点

### 1. gshare：一个 XOR 解决别名

Yeh-Patt 旧索引：

```
index = BHR
PHT[index]   // 所有分支共享，按历史撞格
```

gshare 新索引：

```
index = BHR XOR PC[low 12 bits]
PHT[index]   // 同样 4096 项，但每条分支视角不同
```

差别只是多一个 XOR 门，但因为每条分支的 PC 不同，**同一段历史在不同分支会查到 PHT 里不同的格子**——别名从「必撞」变成「概率撞」。

### 2. 别名是怎么消失的

旧（Yeh-Patt 纯 BHR）：分支 A 和分支 B 走到同一段历史 `0xE14`，都索引 PHT[0xE14]，互相覆盖训练数据。

新（gshare XOR）：A 在 PC=0x1234 索引 `0xE14 XOR 0x234 = 0xC20`，B 在 PC=0x5678 索引 `0xE14 XOR 0x678 = 0x86C`——**分到不同格子，互不打扰**。

### 3. 锦标赛预测器：让分支自己投票

两个独立预测器并跑：

- **bimodal**：纯按 PC 索引的 2 位计数器（学每条分支的长期 base rate）
- **gshare**：BHR XOR PC 索引的 2 位计数器（学历史相关性）

再给**每条分支配一个 2 位选择器**（meta-predictor），训练规则：

- bimodal 对、gshare 错 → 选择器朝 bimodal 方向 +1
- gshare 对、bimodal 错 → 选择器朝 gshare 方向 +1
- 都对或都错 → 选择器不动（信息为零）

预测时：选择器最高位决定听哪个。

### 4. 为什么单一预测器永远不够（核心论证）

McFarling 用一组实验给出可证伪的论据：

- **循环回跳**：bimodal 准确率 ≈ gshare ≈ 99%，多带一个 gshare 浪费
- **数据驱动分支**（`if (x == 0)` 后跟 `if (x == 0)`）：gshare 95%、bimodal 50%——必须 gshare
- **混合工作负载**：单 bimodal 平均 89%、单 gshare 94%、锦标赛 96.5%

结论是工程性的：**让每条分支动态选最适合自己的预测器**，比训练一个万能预测器便宜也准。

### 5. 硬件成本

bimodal 4KB + gshare 4KB + 选择器 4KB ≈ **12KB SRAM**。比 Yeh-Patt 的 PAp（每分支私有 PHT，几十 KB）省得多，比单 GAg 多 3 倍但准确率多 2-3%——按当时晶体管价格算极划算。

## 实践案例

### 案例 1：循环 + 数据分支并存

```c
for (int i = 0; i < N; i++) {
  if (data[i] == 0) handle_zero();   // 数据相关
}
```

外层 for 的回跳：bimodal 99% 准、gshare 也准——选择器学成中立。
内层 if：gshare 从 BHR 看到近期 `data[i]` 的取/不取序列，bimodal 完全瞎猜（base rate 50%）。**同一程序两种分支各自选最优预测器**——这正是锦标赛存在的全部意义。

### 案例 2：DEC Alpha 21264 实测

21264（1996）把 McFarling 的**元选择思想**抄进硅片，但对手预测器做了工程变形：一侧是 local-history 两级表（不是纯 bimodal），一侧是全局历史表，再加 choice predictor 二选一。

- local / global / choice 三张表合计约几十 Kb 量级的预测状态
- TN-36 仿真里锦标赛约 **96.5%**（相对单 gshare / 单 bimodal 的对比数字）
- 硅片公开口径：SPECint95 大约 **7–10 次误判 / 千条指令**，折合约 **95%** 分支方向准确率——比论文仿真略低，但仍是当年商用核顶尖水平

深乱序窗口叠上高命中预测，是 21264 相对同期对手 IPC 优势的重要一块（具体百分比随基准与系统配置变化，不宜当成单一固定值）。

### 案例 3：现代 CPU 里的余韵

Intel Core（Nehalem 之后）、AMD Zen、ARM Cortex-A 都用「锦标赛 + TAGE」混合架构。TAGE 自身也是「多张不同历史长度的表互相选」——本质是**McFarling 锦标赛在历史长度这一维度上的展开**。换句话说，今天 CPU 里你能看到的复杂预测器，骨架都是 1993 年这份 TN-36 定下的。

## 踩过的坑

1. **gshare 别名只是稀释、没消除**：XOR 把同一段历史的多分支分散，但两条 PC 不同的分支仍可能 XOR 到同一格——撞格概率从 100% 降到 1/4096，不是 0
2. **选择器冷启动慢**：选择器只在「两个预测器结果不同」时更新，一条新分支可能要训几百次才偏向某一边
3. **gshare 历史太长反而变差**：超过 14 位时 PHT 训不满，准确率反降——这是 TAGE（多历史长度表）出现的直接动机
4. **侧信道攻击面更大**：Spectre v1/v2 利用 BHR 训练影响 gshare，毒化受害进程的间接分支预测；1993 年完全没考虑安全语义，后续加 IBRS/IBPB 才补上
5. **锦标赛假设要成立**：「每条分支长期偏向某一个预测器」对极少数交替型分支不成立，选择器在两个值之间反复震荡
6. **TN-36 的实验只到 SPEC89/92**：现代工作负载（数据库、JIT、神经网络推理）的分支特征已大不同，参数要重调

## 适用 vs 不适用

**适用**：

- 通用乱序超标量 CPU（Alpha、Pentium 4 后续、几乎所有现代 ARM/x86 高性能核）
- 任何「多个候选模型，每个数据点该用哪个不一定」的混合预测——预取器、cache 替换都借了这个套路
- 编译器 PGO + 硬件预测协作时的两层学习

**不适用**：

- 极简顺序核（Cortex-M、教学 RISC-V）—— 单 bimodal 已够，多预测器没必要
- GPU SIMT 模型 —— 分支不预测、走 warp 分歧
- 数据相关性极弱负载（密码学 S-box、随机哈希）—— 两个预测器都瞎猜，不如直接 cmov

## 历史与后续

- **直接前身**：Yeh-Patt 1991 两级自适应（[[branch-prediction-yeh-patt-1991]]），定下「BHR 索引 PHT」的骨架
- **同期独立工作**：Pan-So-Rahmeh 1992 correlation predictor，思路相近
- **直接产业化**：DEC Alpha 21264（1996），Compaq 的旗舰 RISC，第一个商用锦标赛
- **下一代王者**：Seznec 2006 TAGE（多历史长度并存 + 标签命中），把 gshare 思想推到极限
- **机器学习方向**：Jiménez-Lin 2001 感知机预测器，PHT 换成线性分类器
- **安全余波**：2018 Spectre 漏洞暴露全局共享 BHR 的隐患
- **格式有意思**：DEC WRL 的内部技术备忘录（TN-36）从未在会议发表，但被引用过万——**工业研究院的产出直接定义了 30 年硬件标准**

## 学到什么

1. **没有银弹预测器**——不同分支需要不同上下文，强行统一就有结构性误判
2. **XOR 是廉价但有效的索引技巧**——零额外硬件解 aliasing，工程美学的典范
3. **元预测器（predictor of predictors）是万能范式**——用一层选择器统合多个简单预测器，比训练一个复杂预测器更好；MoE、ensemble、stacking 在 ML 里反复重演
4. **工程论文不一定要会议**——DEC WRL 内部 TN-36 改变了整个产业
5. **可比较的 baseline 才有说服力**——McFarling 用同样硬件预算下 bimodal/gshare/锦标赛三组对比，让读者看到边际收益曲线
6. **训练数据越分越准**——本质是把「单一计数器表」分到多个上下文，让每个计数器只学自己擅长的部分；这思路在今天 ML 的混合专家（MoE）里再次重演

## 延伸阅读

- 论文 PDF：[McFarling 1993 DEC WRL TN-36](https://www.hpl.hp.com/techreports/Compaq-DEC/WRL-TN-36.pdf)
- 综述：Mittal, "A Survey of Techniques for Dynamic Branch Prediction", 2019
- 继承者：[Seznec, "A 256 Kbits L-TAGE Branch Predictor", JILP 2007](https://jilp.org/vol9/v9paper6.pdf)
- 工具体验：`perf stat -e branch-misses,branches ./your_program` 能看到自己代码的真实误判率
- [[branch-prediction-yeh-patt-1991]] —— 直接前身，先读这篇再看 McFarling 收获最大

## 关联

- [[branch-prediction-yeh-patt-1991]] —— Yeh-Patt 提出两级预测，McFarling 的 gshare 是其廉价高效变种
- [[amdahl-law-1967]] —— 分支预测每升 1% 都直接攻 Amdahl 的串行段
- [[ssa]] —— SSA 影响编译器生成的分支密度，间接影响预测器命中率
- [[hotspot-server-compiler]] —— JIT 用运行时 profile 重排分支，与硬件锦标赛形成两层学习
- [[self-pic]] —— Self / PIC 内联缓存也是「按上下文索引小表」在间接分支上的体现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
