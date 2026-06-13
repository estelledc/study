---
title: "Hyperkernel — 让 SMT 求解器一键验证操作系统内核"
来源: 'Nelson, Sigurbjarnarson, Zhang, Johnson, Bornholt, Bornholt, Torlak, Wang, "Hyperkernel: Push-Button Verification of an OS Kernel", SOSP 2017'
日期: 2026-05-31
子分类: 形式化验证
分类: 形式化方法
难度: 高级
provenance: pipeline-v3
---

## 是什么

Hyperkernel 是华盛顿大学 Xi Wang 组做的**一个能用 SMT 求解器一键自动验证的操作系统内核**。日常类比：传统内核证明像盖楼时请数学家手算每根钢筋——比如 seL4 用 Coq 写了 20 多万行手工证明；Hyperkernel 反过来——**先把楼设计成"机器能算的形状"，然后让 Z3 自己跑一遍说"行"或"不行"**。

它从 MIT 教学内核 xv6 改写而来，约 7000 行 C，验证一次只要几分钟，不需要人工写一行证明脚本。论文全篇核心信息：**改设计比补证明聪明**——传统内核 syscall 有不定循环、不限大小的数据结构，SMT 求解器算不动；只要把 syscall 设计成"步数有限、数据有界"，Z3 一次决策就能确认它满足规约。

放回大图景：从 1970 年代 Hoare 逻辑、2009 年 seL4（Isabelle 顺序证明）、2016 年 CertiKOS（Coq 并发证明）到 2017 年 Hyperkernel——OS 验证一直在卷"证明便宜"。Hyperkernel 把"便宜"推到极致：写代码的人不必懂 Coq。

## 为什么重要

不理解 Hyperkernel，下面这些事都没法解释：

- 为什么"机器证明操作系统"听上去高不可攀，2017 年突然就有 PhD 在校项目能跑——关键不在求解器变强，是**问题被重新切**了
- 为什么 Z3、CVC5 这些 SMT 求解器从约束求解领域慢慢渗透进系统软件——它们能处理"有限状态决策"问题，比 Coq 那种"人写每一步"的交互式证明门槛低 10 倍
- 为什么"finite interface"（有限接口）成了之后一系列系统验证项目的设计原则——Yggdrasil 文件系统、Serval 验证器都沿用这条路
- 为什么"先改设计再做验证"是工程美学胜于纯学术——它承认人有限、机器有限，数学只在它能赢的地方用

## 核心要点

Hyperkernel 把"自动验证"做成可能，靠 **三件事**：

1. **有限接口（finite interface）设计原则**：每个 syscall **不能有不定循环、不能分配不定大小数据**。比如不再像 xv6 那样让 `fork()` 内部循环遍历整张页表，而是改成"一次复制固定页数"，多余分多次调用。这样每个 syscall 的状态变化只有有限分支，SMT 一遍就能决策。

2. **基于 Rosette 的符号执行**：不写 C 然后翻译——直接用 **Rosette**（华盛顿大学自己出的 Racket 方言，可符号执行的程序语言）写"内核行为模型"，再让 Rosette 把它**编译成 SMT-LIB 公式**喂给 Z3。Rosette 在中间扛起了"写起来像程序、算起来像约束"的双重身份。

3. **三层规约一致性**：用 SMT 同时证 **(a)** C 实现 ≡ Rosette 模型，**(b)** Rosette 模型 ≡ 状态机规约，**(c)** 状态机规约满足若干安全性质（隔离、无溢出、无 use-after-free）。三层都靠同一个 Z3，没有 Coq 介入。

三件事合起来，让"证一个内核"从"博士生 5 年手写证明"变成"博士生几个月写规约 + 让 Z3 自动跑"。

## 实践案例

### 案例 1：xv6 vs Hyperkernel 同一 syscall 的差别

xv6 的 `wait()` 实现里有这种代码：

```c
for(p = ptable.proc; p < &ptable.proc[NPROC]; p++) {
  if(p->parent == curproc) ...
}
```

朴素 SMT 处理不动循环——`NPROC` 是参数，循环展开次数不定。Hyperkernel 把同一逻辑改写成"调用方传 PID，内核检查这个 PID 的父进程是不是我"。**循环消失了**——syscall 变成"O(1) 步定长操作"。功能上少一点便利，验证上一切自动。

### 案例 2：用 Rosette 写出来的规约长这样

```racket
(define (sys-fork s pid)
  (cond
    [(>= pid NPROC) (state-error s 'EINVAL)]
    [(proc-used? s pid) (state-error s 'EEXIST)]
    [else (state-spawn s pid (current-pid s))]))
```

读法：拿当前状态 `s` 和目标 PID，三种情况返回三种状态。每种情况都是有限运算。Rosette 自动把这一段连同 C 实现一起编译成 SMT，让 Z3 检查**任何输入下两段计算的结果都相等**。

### 案例 3：Z3 真的能跑完吗

文中报告：约 7000 行 C 的内核，全套验证（C-Rosette 等价 + 规约符合性 + 安全性质）在普通服务器上几分钟跑完。**没有人工证明脚本**——所有交给 Z3。这和 seL4 的 20 万行手写 Coq 形成强对比。代价是：内核功能更小（没文件系统并发、没复杂调度），且必须严格按"有限接口"原则写。

### 案例 4：找到的真实 bug

Hyperkernel 验证过程中发现 xv6 原版有若干隔离漏洞——比如某些 syscall 路径下子进程能读到父进程残留页面。这类 bug 在测试里很难触发，但 SMT 探索全部状态时一步就找到。这是"自动验证"对工程的直接回报：**不是装饰品，是能抓 bug 的工具**。

### 案例 5：性能数字的现实意义

Hyperkernel 在评测里跑 shell、ping 这类小程序——功能上像 1980 年代的 UNIX。性能不是论文卖点，**"被证明的内核能跑真程序"** 才是。这个里程碑很重要——之前的自动验证内核多半只在论文图里走过，没跑过真二进制。从"能证 + 能跑"两个维度同时过关，才让审稿人相信这条路有未来。

## 踩过的坑

1. **"自动"的代价是"功能受限"**：Hyperkernel 内核是单核的、没并发文件系统、调度极简。它**证明了一个简单内核**，不是"证明了任意内核都能这样做"。要做更大的内核，"有限接口"约束就成了功能枷锁。

2. **设计 vs 验证两端拉扯**：原本 xv6 设计追求"代码短小有教学性"，Hyperkernel 改写后"代码更死板"。**写得不好看的代码**有时是为了机器能算——这种取舍每个项目要自己权衡。

3. **信任基包括 Z3 + Rosette + Racket + 编译器**：Z3 有过历史 bug，Rosette 也是研究软件。如果 Z3 错了，定理仍数学上成立，但对真实硬件**不**成立。和 CertiKOS 一样，信任边界要老实画。

4. **对并发完全没办法**：Hyperkernel 是顺序内核。并发情况下"有限接口"原则失效——线程交错让状态空间爆炸。CertiKOS 用 CCAL 处理并发但要写手工证明；Hyperkernel 用自动求解但只跑顺序。**两条路目前没人合并**。

5. **"验证 = 完全正确"是误读**：Hyperkernel 证的是"实现满足给定规约"。如果**规约本身**漏掉某种安全性质（比如没要求侧信道隔离），那种攻击仍然存在。规约是人写的，人会漏。

6. **SMT 求解时间会爆炸**：finite interface 不是免疫卡——某些 syscall 改完仍可能让 Z3 跑几小时甚至超时。Hyperkernel 的工程功夫一半花在"调整规约和实现，让 Z3 跑得动"。这是和 Coq 路线相反的痛点——前者卡在写证明，后者卡在求解器。

## 适用 vs 不适用场景

**适用**：

- 教学验证：把"内核 + SMT"作为学生入门形式化方法的活教材，门槛比 Coq 低很多
- 嵌入式 / 安全关键的小内核：功能受限可接受，自动验证的低成本回报极高
- 验证基础设施研究：作为"finite interface + SMT"路线的基线，对照 seL4、CertiKOS 看不同验证哲学

**不适用**：

- 通用 OS 替代——功能远不足以替代 Linux 或商业 RTOS
- 高并发 / 多核内核——SMT 自动化扛不动并发证明
- 不愿接受"接口设计被验证约束"的项目——Hyperkernel 的核心是设计妥协换取自动化
- 需要侧信道、时序攻击等非功能性安全保证的场景——SMT 不直接处理这些

**不适用补充**：

- 算法/数据结构密集型内核子模块（如复杂调度器、文件系统 B-tree）——这些通常需要不定循环和动态分配，finite interface 原则会把它们改得面目全非
- 想要一个"开箱即用、能编译运行任意 C 代码"的内核环境——Hyperkernel 自带的接口集是为论文准备的，扩展会触发重新规约工作

## 历史小故事（可跳过）

- **2008 年**：Z3 发布，SMT 求解器进入工业级（[[z3-2008]]）
- **2009 年**：seL4 在 NICTA 完成——Isabelle/HOL 写的 20 万行手工证明
- **2014 年**：Emina Torlak 在 UW 发布 Rosette——可符号执行的语言基础设施
- **2016 年**：CertiKOS 用 Coq 证并发内核（[[certikos-2016]]）
- **2017 年**：Hyperkernel SOSP 发表，提出 finite interface + SMT 路线
- **之后**：Yggdrasil 文件系统验证、Serval 验证器（OSDI 2019）继续沿用同套路；UW 团队成为这条路线的代表

这是一条"求解器进步（Z3）→ 中间层进步（Rosette）→ 系统软件验证（Hyperkernel）"的清晰技术链。

## 学到什么

1. **改问题比改工具聪明**——SMT 算不动不定循环，那就把内核 syscall 改成定长；这种"先迁就工具，再用工具赢"的思维在系统设计里反复出现
2. **自动化不是免费的**——交给机器的代价是接口设计被约束、功能要砍、并发暂时让位
3. **三层规约 + 一个求解器**比 **一层规约 + 半层证明 + 半层求解器** 工程上简洁——Hyperkernel 把"工具栈高度"压到最低，这是它能让本科生也跑得起来的关键
4. **"证明便宜"会改变研究和工程的边界**——以前内核验证是少数大组的事，Hyperkernel 之后小团队也能尝试，这是技术民主化的小例子
5. **诚实画信任边界**——Z3 / Rosette / 硬件 ISA 都是信任基；写论文时把它们列出来比假装"完全正确"更有科学态度
6. **同代不同哲学的两条路**——CertiKOS（Coq 手证、表达力强、并发可证）与 Hyperkernel（SMT 自动、便宜可推广、暂限顺序）回答了同一个问题：怎么造一个"对的内核"。看两篇论文一起读，才能理解形式化方法不是单线进步，而是哲学对峙

## 延伸阅读

- 论文 PDF：[SOSP 2017 Hyperkernel](https://unsat.cs.washington.edu/papers/nelson-hyperkernel.pdf)（17 页主文 + 评测）
- 项目主页：[unsat.cs.washington.edu](https://unsat.cs.washington.edu/)（含 Yggdrasil、Serval 后续工作）
- Rosette 项目：[Emina Torlak 主页 + Rosette tutorial](https://emina.github.io/rosette/)（理解 finite interface 必读基础设施）
- 前置阅读：[[z3-2008]] 给出 SMT 求解器的工程基础
- 对照阅读：[[certikos-2016]] 是 Coq 路线代表；二者哲学完全相反
- 后续工作：Serval（OSDI 2019）把同套思路推到 RISC-V 微内核 + boot loader

## 一句话区分类似工作

- **Hyperkernel**：finite interface + SMT 自动 = 顺序内核、几分钟跑完、零手写证明
- **seL4**：顺序内核 + Isabelle/HOL 手证 = 20 万行手写证明、工业部署最深
- **CertiKOS**：并发内核 + Coq 分层证明 = 30 多层 CAL、并发可证但工程量巨大
- **Dafny**：通用程序 + SMT 自动 = 程序员级工具，不针对内核
- **Frama-C**：C 程序契约 + 多种后端 = 工业级 C 验证平台，比 Hyperkernel 老但更通用

读一遍这五条，操作系统形式化验证整张地图基本清楚了。

## 关联

- [[z3-2008]] —— Hyperkernel 的核心工具，所有定理由 Z3 决策
- [[certikos-2016]] —— Coq 手写并发证明路线，与 Hyperkernel 形成对照
- [[hoare-logic]] —— 程序证明祖师爷，规约-实现等价是其思想延伸
- [[dafny-2010]] —— 同样走 SMT 自动化路线，但目标是程序员不是内核
- [[boogie-2005]] —— SMT 后端中间语言，Dafny 等系统的基础
- [[frama-c-2012]] —— C 程序契约式验证，工程化更深的另一路线
- [[minisat-2003]] —— SAT 求解器，SMT 的前身和子模块
- [[nelson-oppen-1979]] —— SMT 多理论组合的理论根基
