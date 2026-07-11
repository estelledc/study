---
title: CEGAR — 用反例自动改进抽象，让大软件能被验证
来源: Clarke, Grumberg, Jha, Lu, Veith, "Counterexample-Guided Abstraction Refinement for Symbolic Model Checking", JACM 2003
日期: 2026-05-30
分类: 形式化方法
难度: 中级
---

## 是什么

**CEGAR**（Counterexample-Guided Abstraction Refinement，反例引导的抽象细化）是一套**让计算机自动验证大型程序**的循环方法。

日常类比：警察办案。线索太多查不完，先按"男/女"粗分嫌疑人。结果某条线索说"这个男的是凶手"，但去查发现这人那天有不在场证明——这条线索是**伪线索**（spurious counterexample）。警察不会放弃，而是想"按性别分太粗了，得加个标准"，于是再分成"戴眼镜的男性 / 不戴的男性"，重新查一轮。每次伪线索告诉你**该在哪里加分类标准**。

把"嫌疑人"换成"程序状态"，"分类标准"换成"逻辑谓词"，就是 CEGAR。

## 为什么重要

不理解 CEGAR，下面这些事都没法解释：

- 为什么 Microsoft 能在 2002 年自动验证 Windows 设备驱动程序（SLAM 工具，CEGAR 的第一个工业落地）
- 为什么 Linux 内核能跑 BLAST 自动找内存安全 bug
- 为什么 model checking 这门 1980 年代的技术，到 2000 年代才能处理百万行级别的软件
- 为什么 Clarke 凭 model checking 在 2007 年拿了图灵奖——CEGAR 是他晚期最重要的贡献

核心矛盾：**状态空间爆炸**。一个有 100 个布尔变量的程序，状态数是 2^100，直接枚举宇宙都不够。必须**抽象**（合并相似状态）。但抽象会丢信息，导致**伪反例**——抽象上看起来有 bug，原代码上其实没有。CEGAR 把"抽象→检查→验证反例→细化"自动闭环。

## 核心要点

CEGAR 是一个 **4 步循环**，转直到给出明确答案：

1. **抽象**（abstract）：选一组谓词 P = {p1, p2, ...}（如 `x > 0`、`p == NULL`），把每个具体状态映射成一个布尔向量。原本 2^100 个状态可能合并成几百个。

2. **模型检查**（model check）：在小得多的抽象模型上跑标准 CTL 模型检查。如果说"安全"，因为是过近似（over-approximation），原程序也安全 → 报告"通过"。

3. **验证反例**（simulate counterexample）：如果抽象说"有 bug，路径是 s0→s1→...→sn"，把这条路径映回原程序看是否走得通。**真反例** → 报告 bug；**伪反例**（某一步在原程序里走不通）→ 进入第 4 步。

4. **细化**（refine）：找出抽象路径上**最后一个能继续走**的状态（"failure state"），把这个抽象状态**分裂**成"能走的"和"不能走的"两组，新增谓词区分它们。回到第 1 步。

## 实践案例

### 案例 1：一个最小 C 程序

```c
int x = 0;
if (read_input() > 0) x = 1;
if (x > 0) ERROR();   // 我们想证明这行不可达
```

**第一轮**：选谓词 P = ∅（什么都不分）。抽象模型只有一个状态，能到 ERROR → 伪反例。

**第二轮**：CEGAR 分析反例发现"得知道 x 是不是大于 0"，加谓词 p = (x > 0)。重新检查：抽象有 2 个状态（p=true / p=false），但还是说能到 ERROR，因为它不知道 read_input 的结果决定了 x。仍然伪反例。

**第三轮**：加第二个谓词 q = (read_input() > 0)。这次抽象足够精确：q=false 时 x 始终 0，到不了 ERROR；q=true 时确实到 ERROR。但等等——题设说"想证明不可达"，那这就是真反例，报告 bug。

整个过程**没人手动选谓词**，全靠反例驱动。

### 案例 2：Existential abstraction（过近似）

CEGAR 用的抽象规则：抽象状态 [s] 有转移到 [t]，当且仅当**存在**具体状态 s' ∈ [s] 和 t' ∈ [t] 使 s' → t'。

直觉：原程序里能走的路径，抽象里**一定**能走（sound）；但抽象里能走的，原程序**未必**能走（这就是伪反例的来源）。

这保证了**找不到 bug 时的可信度**——抽象上说"安全"=原程序真的安全。

### 案例 3：怎么找细化点

伪反例 [s0] → [s1] → [s2] → [s3]（错误状态）。

把每个抽象状态展开成具体状态集合，标记三类：
- **可达状态**：能从初始一路走到这里的具体状态
- **死端状态**（deadend）：可达但下一步走不动的
- **坏状态**（bad）：不可达的

只要某层 deadend ≠ ∅ 且 bad ≠ ∅，就在这层加一个谓词，把 deadend 和 bad 分开。论文证明**最小细化是 NP-hard**，但提了一个多项式时间近似算法 **SplitPATH**。

### 案例 4：SLAM 在 Windows 驱动上发现的真实 bug

Microsoft 用 SLAM 跑 Windows 设备驱动，找到一类常见 bug：**某些路径下忘记释放锁**。

伪代码：

```c
KeAcquireSpinLock(&lock);
if (error_condition) return;   // bug: 没释放就返回
KeReleaseSpinLock(&lock);
```

CEGAR 第一轮抽象不知道 `error_condition` 何时为真，过近似认为"所有路径都可能"，找到一条"加锁→直接 return"的反例。验证发现：在原程序里，只有 error_condition=true 时这条路径成立。然后 SLAM 报告：这条路径**真实存在**——bug 确认。

这种"加锁/释放配对"叫 **typestate property**，CEGAR 处理这类属性特别好——只需几个谓词追踪锁状态。

## 踩过的坑

1. **可能不终止**：如果原程序状态无限（含递归、动态分配），CEGAR 可能一直加谓词加不停。SLAM 用"超时 + 启发式"兜底；现代工具（CPAchecker）切到 lazy abstraction 缓解。

2. **谓词组合爆炸**：每加一个谓词，抽象状态数翻倍。10 个谓词就 1024 个抽象状态，够你跑一会的。BLAST 引入"lazy abstraction"——不同程序点用不同谓词集，按需细化。

3. **找不对失败状态**：早期实现 SplitPATH 偶尔会"细化错地方"——加了谓词但没真正排除伪反例，下一轮还是同样的伪反例。要靠**Craig interpolation**（McMillan 2003）做更精准的谓词发现。

4. **并发不友好**：原 CEGAR 假设单线程。多线程要扩展为 thread-modular CEGAR，复杂度上一个台阶。

## 适用 vs 不适用场景

**适用**：
- 控制流密集、数据简单的程序（设备驱动、协议实现、操作系统组件）
- 安全性属性（safety property）：'某个错误状态不可达'
- 谓词数量在百级以内的中等规模程序
- 硬件验证（CPU 流水线、缓存一致性）—— Intel / IBM 已工业化使用

**不适用**：
- 数据密集程序（数值计算、机器学习）—— 谓词没法捕捉浮点关系
- liveness（活性）属性 'A 终会发生' —— 要扩展成 progress measure
- 高并发、大状态空间的分布式系统 —— 用 TLA+ / Spin 更合适
- 没有清晰错误状态的程序 —— CEGAR 需要明确的"我要证明 ERROR 不可达"

## 历史小故事（可跳过）

- **1981 年**：Clarke 和 Emerson 发明 CTL model checking。能验证有限状态系统，但状态一多就炸。
- **1992 年**：McMillan 用 BDD 把状态压缩到指数级，叫 Symbolic Model Checking。硬件能验证了，软件还不行。
- **1997 年**：Graf-Saïdi 提出 predicate abstraction，把无限状态压缩到有限抽象。但谓词得手选。
- **2000 年**：Clarke 团队在 CAV 发表 CEGAR 雏形——第一次让"抽象+细化"自动化。
- **2002 年**：Microsoft 的 Ball-Rajamani 把 CEGAR 做成 SLAM 工具，验证了上千个 Windows 驱动，找出几百个 bug。商业上一战封神。
- **2003 年**：Clarke 等人在 JACM 发表完整版（本论文），证明算法正确性、给出 SplitPATH 多项式近似。
- **2007 年**：Clarke、Emerson、Sifakis 共同获图灵奖，授奖词点名 CEGAR。

## 学到什么

1. **过近似 + 反例**是验证大系统的通用模式——不止 CEGAR，编译器优化、静态分析也用同思路
2. **自动化的关键是闭环**：人工选谓词 → 自动选谓词，差别就是有没有"反例驱动"这一步
3. **NP-hard 在工程里不可怕**：精确最小细化是 NP-hard，但 SplitPATH 多项式近似就够用了。理论复杂度 ≠ 工程可行性
4. **理论 → 算法 → 工程 → 商业**：1981 model checking → 2000 CEGAR → 2002 SLAM → 2007 图灵奖。20 多年才把概念落到产品

## 延伸阅读

- 论文 PDF：[CEGAR JACM 2003](https://www.cs.cmu.edu/~emc/papers/Books%20and%20Edited%20Volumes/Counterexample-guided%20Abstraction%20Refinement%20for%20Symbolic%20Model%20Checking.pdf)（44 页，前 10 页是非形式化介绍，建议先读）
- 综述：[Clarke "25 Years of Model Checking"](https://www.cs.cmu.edu/~emc/papers/Books%20and%20Edited%20Volumes/25%20Years%20of%20Model%20Checking.pdf) —— Clarke 自己 2008 年回顾整个领域
- 工具上手：[CPAchecker](https://cpachecker.sosy-lab.org/) —— 现代 CEGAR 实现，能直接跑 C 代码
- SLAM 故事：[Ball-Rajamani "The SLAM Project"](https://www.microsoft.com/en-us/research/publication/slam-project-debugging-system-software-via-static-analysis/) —— CEGAR 第一个工业落地的复盘
- [[biere-bmc-1999]] —— 兄弟方法 BMC，用 SAT 求解器直接展开 k 步

## 关联

- [[biere-bmc-1999]] —— Bounded Model Checking，CEGAR 的兄弟，区别是 BMC 不抽象、靠 SAT 暴力展开有限步
- [[cousot-abstract-interpretation]] —— 抽象解释，CEGAR 的理论祖先；CEGAR 是抽象解释的"自动选抽象"版
- [[hoare-logic]] —— Hoare 逻辑是模型检查的对偶——一个证明、一个枚举
- [[liquid-types]] —— Liquid Types 也用谓词细化思想，不过用在类型系统里
- [[refinement-types-1991]] —— Refinement Types 用谓词限定值的合法子集，思路同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chaff-2001]] —— Chaff 2001 — 把 CDCL 工程化的两个杀手锏
- [[cimatti-nusmv-2002]] —— NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具
- [[dpll-1962]] —— DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯
- [[graf-saidi-1997]] —— Graf-Saïdi — 用谓词把无限状态压成有限抽象
- [[holzmann-spin-1997]] —— SPIN — 让计算机帮你穷举并发程序的所有可能执行
- [[marques-silva-grasp-1996]] —— GRASP 1996 — 让 SAT 求解器从冲突里学到东西
- [[minisat-2003]] —— MiniSat 2003 — 600 行 C++ 把 CDCL 写成教科书
- [[nieuwenhuis-dpll-t-2006]] —— Nieuwenhuis-Oliveras-Tinelli 2006 — 给 SMT 求解器写一套数学规则书
- [[slam-microsoft]] —— SLAM — 让 Windows 驱动 bug 自己撞到工具上
- [[z3-2008]] —— Z3 2008 — 把 SMT 工程化到工业默认
