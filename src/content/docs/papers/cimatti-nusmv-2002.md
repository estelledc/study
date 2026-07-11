---
title: NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具
来源: 'Cimatti, Clarke, Giunchiglia et al., "NuSMV 2: An OpenSource Tool for Symbolic Model Checking", CAV 2002'
日期: 2026-05-30
分类: 形式化方法
难度: 高级
---

## 是什么

**NuSMV 2** 是一个**自动验证有限状态系统是否满足时序逻辑性质**的开源工具。日常类比：像一个全自动的"飞机黑匣子审查员"——你交给它一份系统描述和一句"任何时候警报响了 5 秒内必须开舱"，它要么给你证明"永远成立"，要么甩给你一段反例视频："看，第 17 步你违反了"。

它不是新算法，而是一个**重写、整合**的工程作品。前身 SMV（McMillan 1993）是闭源单引擎的，只能用 BDD（二叉决策图）做完整证明，遇到状态太多就跑不动。NuSMV 2 干了两件大事：

1. **重写成开源 LGPL**，CMU + ITC-IRST + 热那亚大学合作
2. **加进第二个引擎 SAT-based Bounded Model Checking**，跟 BDD 引擎并列存在；用户按需切换

```smv
MODULE main
VAR turn : 0..1; c1 : boolean; c2 : boolean;
ASSIGN init(c1) := FALSE; init(c2) := FALSE;
SPEC AG !(c1 & c2)   -- 永远不允许两个进程同时进临界区
```

输入这种 `.smv` 文件，NuSMV 几秒内告诉你这条性质成立或反例怎么走。

它的定位**不是新算法**，而是把过去十年的符号模型检测成果——BDD 不动点（McMillan 1993）、SAT BMC（Biere 1999）、LTL tableau——揉到一个开源、模块化、能被研究人员持续扩展的平台里。换句话说：**它是一个杠杆**，工业用户拿来验证产品，研究人员拿来挂自己的新算法当 baseline。

## 为什么重要

不理解 NuSMV 2，下面这些事都没法解释：

- 为什么航天 / 铁路信号 / 安全协议这类高可靠系统的"形式验证"流程几乎都从 NuSMV 起步
- 为什么"BDD 派"和"SAT 派"在 2000 年代初居然能在同一个工具里和平共处
- 为什么后来的 nuXmv / IC3 / Kratos 等学术工具都基于它演化，而不是从头另造
- 为什么"开源 + 模块化"对学术工具的生命力比单点算法创新更重要

## 核心要点

NuSMV 2 的关键设计可以拆成 **三件事**：

1. **双引擎共存**：BDD 引擎走完整不动点能证明性质永远成立；SAT 引擎做 BMC（把转移关系展开 k 步翻译成布尔公式扔给 SAT 求解器）只能在 k 步内找反例。类比：BDD 是地毯式排查，SAT BMC 是直奔可疑现场——一个负责证明无罪，一个负责快速抓现行。

2. **CUDD 作 BDD 内核**：BDD 是 Bryant 1986 发明的压缩布尔函数表示，节点数 ≈ 内存占用。NuSMV 用 Colorado 大学的 CUDD 库把"所有合法状态"和"转移关系"编码成 BDD，CTL 算子翻译成 BDD 上的 image / pre-image **不动点迭代**——类比池塘扔石头，涟漪一圈圈扩散，扩散到不再变化就停下，那一圈就是答案。

3. **模块化架构**：每个引擎、每个 parser、每个算法都是独立模块。研究人员加新算法（比如 IC3、predicate abstraction）不用改核心。这是 NuSMV 能活 20 年还在产出论文的关键。

4. **同输入语言双输出**：用户写一份 `.smv`，可以**同一次会话**里先 BMC 找反例，找到后再切 BDD 在小一点的子模块上做完整证明，两个引擎共享 parser 和符号表。

简单说：**双引擎让你"既能证又能驳"，模块化让别人"能在你身上盖楼"**。

## 实践案例

### 案例 1：两个进程的互斥（BDD 引擎全证明）

```smv
MODULE proc(turn, other)
VAR pc : {idle, want, crit};
ASSIGN next(pc) := case
  pc = idle              : {idle, want};
  pc = want & turn       : crit;
  pc = crit              : idle;
  TRUE                   : pc;
esac;

MODULE main
VAR turn : 0..1; p1 : proc(turn, p2.pc); p2 : proc(turn, p1.pc);
SPEC AG !(p1.pc = crit & p2.pc = crit)
```

代码里 `case ... esac` 类似其他语言的 if-elif-else（esac 是 case 倒过来表示结束）。跑 `NuSMV mutex.smv`，BDD 引擎做完整可达性，几毫秒报 "specification is true"——证明**所有可能交错**下两个进程都不会同时进临界区。

### 案例 2：流水线 hazard（切到 SAT BMC）

5 级流水线设计变量上千，BDD 节点炸到几亿跑不动。用 NuSMV 的 BMC 模式：

```
NuSMV -bmc -bmc_length 30 pipeline.smv
```

意思是"展开 30 步，转成 SAT 看能不能找到反例"。SAT 求解器几秒回："步 17 处 `forward = R1` 但 `R1` 还没写回，数据冒险"。**只能反驳不能证明**——30 步没找到不代表第 31 步没事。

### 案例 3：Needham-Schroeder 协议中间人攻击

把协议双方 + 攻击者写成 SMV 模块，性质 `AG (alice.session = bob.session)`。BMC 跑 6 步内就重现了 Lowe 1995 发现的攻击：攻击者把 Alice 发给自己的消息转发给 Bob，让 Bob 以为在跟 Alice 通话。**这不是新发现**，是 NuSMV 的 demo——证明这种工具能在几秒内复刻原本要人类专家想几个月的反例。

## 踩过的坑

1. **BDD 变量序敏感**：同一个布尔函数，变量排序好节点数几千，排错从几亿起步。NuSMV 提供 sift 启发式但**不是万能**，复杂电路要自己调或换 SAT。

2. **BMC 只能反驳不能证明**：跑 k=50 没找到反例不等于"系统安全"——只是**前 50 步没发现而已**。要证明完整性必须配合归纳（k-induction）或回到 BDD。

3. **SMV 语言是同步语义**：默认所有模块每步**同时**走一拍。建异步系统（比如分布式协议）必须手写"调度器"模块每步只激活一个进程，否则反例可能是物理不可能的虚假场景。

4. **状态爆炸仍然存在**：BDD 不是魔法，对位级精确建模的大型设计（百万状态变量）必须先做**抽象**（CEGAR，Clarke 2003）或切片，否则两个引擎都跑不动。

## 适用 vs 不适用场景

**适用**：
- 中等规模硬件（几百到几千状态变量）的 CTL / LTL 性质验证
- 安全 / 通信协议有限模型的反例搜索（BMC 几秒出结果）
- 学术研究做新算法 baseline——架构模块化好挂钩
- 工业前期可靠性筛查（航天、铁路、汽车 ECU）

**不适用**：
- 无穷状态系统（实数变量、无界整数）→ 要 SMT 引擎，用 nuXmv 或 cvc5
- 软件源码直接验证 → 用 CBMC 或 SeaHorn，它们专门处理 C/Java
- 超大型工业 SoC（百万门）→ 商业工具 Cadence JasperGold / Synopsys VC Formal
- 概率系统（Markov 链）→ 用 PRISM / Storm
- 实时系统连续时钟约束 → 用 UPPAAL，它把时钟自动机当一等公民

## 历史小故事（可跳过）

- **1981 年**：Clarke / Emerson 提出 CTL 模型检测，状态显式枚举只能跑 10^5 起步
- **1986 年**：Bryant 提出 ROBDD（有序约简二叉决策图），让布尔函数压缩存得下
- **1993 年**：McMillan 在 CMU 博士论文造 SMV，BDD 把上限推到 10^20，但闭源单引擎
- **1999 年**：Biere 等提出 SAT-based Bounded Model Checking，找反例比 BDD 快几个数量级
- **2002 年**：Cimatti 等在意大利 ITC-IRST 主导重写 NuSMV 2，把 BDD + SAT 合到同一个开源工具，发表于 CAV 2002
- **2014 年起**：nuXmv 把 NuSMV 2 扩展到 SMT 和 IC3，处理无穷状态；NuSMV 2 本身仍在维护

## 学到什么

1. **工程作品也能拿顶会**——CAV 2002 这篇没新算法，但它把已有算法工程化、开源化、模块化，影响超过多数纯理论论文
2. **双引擎策略**：当一个方法有"完整但慢"和"快但不完整"两个流派，把它们放进同一个工具让用户按需切换，比逼用户站队更现实
3. **模块化 > 算法创新**：能让别人"在你身上盖楼"的工具才能活 20 年
4. **开源是学术工具的护城河**——NuSMV 2 之后 SMV 系几乎所有创新都在开源生态里，闭源 SMV 慢慢沉没
5. **抽象层选对了，扩展几乎免费**——parser、符号表、算法 backbone 解耦后，加新引擎只是补一个 module，不是重写

## 延伸阅读

- 论文 PDF：[NuSMV 2 CAV 2002](https://nusmv.fbk.eu/papers/cav2002.pdf)（6 页，不长，工具论文风格）
- 官方网站：[nusmv.fbk.eu](https://nusmv.fbk.eu/) — tutorial / 用户手册 / 下载
- 后续工具：[nuXmv](https://nuxmv.fbk.eu/) — NuSMV 加 SMT / IC3 的现代分支
- [[mcmillan-smv-1993]] —— NuSMV 的前身，BDD 符号模型检测的奠基
- [[biere-bmc-1999]] —— NuSMV 2 第二个引擎 BMC 的来源论文
- 教材：Clarke / Grumberg / Peled《Model Checking》第 6-8 章

## 关联

- [[mcmillan-smv-1993]] —— SMV 原版，NuSMV 2 是它的开源重写并加引擎
- [[biere-bmc-1999]] —— BMC 算法本体，NuSMV 2 把它装成第二个引擎
- [[clarke-emerson-1981]] —— CTL 模型检测的源头，NuSMV 验证的语言之一
- [[clarke-cegar-2003]] —— 反例驱动抽象细化，是 NuSMV 状态爆炸的常用解法
- [[holzmann-spin-1997]] —— 同时代另一个流派的模型检测器，显式状态枚举 + LTL，互为对照
- [[ssa]] —— 编译器领域同样追求"符号化压缩信息"的思路
- [[hoare-logic]] —— 命题级程序证明的另一支，跟模型检测互补：Hoare 偏手工偏无穷状态，NuSMV 偏自动偏有限状态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
