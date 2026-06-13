---
title: MileStone — 多目标编译器 Phase Ordering（GNN + RL）零基础学习笔记
来源: https://arxiv.org/abs/2605.23435
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

## 从日常类比开始：做菜工序 vs 固定菜谱

想象你在经营一家**中央厨房**，要把同一批食材做成成品菜。厨房里有几十种工序：切配、腌制、焯水、爆炒、蒸、烤、装盘……每种工序都会改变食材的状态，而且**先后顺序**极其重要——先腌后切和先切后腌，口感完全不同；过度爆炒会让体积膨胀（代码变大），过度蒸制会耗电但省火工（能耗与时间的权衡）。

传统编译器给你的是**固定套餐**：

- `-O1`：家常快手菜
- `-O2`：标准宴席
- `-O3`：追求极致速度，往往牺牲体积和能耗

这三档只是巨大搜索空间里的**三个点**。真实场景更复杂：手机 App 要控制安装包体积；IoT 设备电池只有 200 mAh，必须在**能耗上限**内尽量快；数据中心又要吞吐优先。你很少只关心单一指标。

**Phase Ordering Problem（阶段排序问题）** 就是：给定一堆 LLVM/GCC 优化 pass（内联、循环展开、向量化、死代码消除……），找到**一串顺序**，让最终程序在多个目标上同时表现良好。

穷举所有 pass 排列？组合爆炸，不现实。每个候选序列都真机跑一遍 profiling？太慢。

**MileStone**（Shahid Beheshti University，[arXiv:2605.23435](https://arxiv.org/abs/2605.23435)，PLDI 2026）的做法像雇了两位助手：

1. **品菜师（GNN）**：看一眼当前「食材关系图」（LLVM IR 的控制流+数据流图 CDFG），不用真下锅，就能**预测**做完某套工序后的执行时间、代码体积、能耗。
2. **排班经理（RL）**：在品菜师反馈下，逐步决定每个节点该偏向「缩体积」还是「抢速度」，并在用户给的**能耗预算**内探索 Pareto 最优折中。

论文摘要报告：在相同能耗预算下，执行时间最多可降低约 **45%**；且无需穷举搜索或动态 profiling 也能找到多目标 Pareto 前沿。

一句话：**用图神经网络当廉价性能预言机，用强化学习当多目标排程器，解决编译器 pass 顺序怎么排。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | MileStone: A Multi-Objective Compiler Phase Ordering Framework for Graph-based IR-Level Optimization |
| 作者 | Amirhossein Sadr, Mehran Alidoost Nia |
| 机构 | Shahid Beheshti University（伊朗） |
| 发表 | PLDI 2026（ACM SIGPLAN） |
| arXiv | [2605.23435](https://arxiv.org/abs/2605.23435) |
| 关键词 | Compiler Optimization, Multi-Objective Optimization, Phase Ordering, GNN, RL |
| 目标平台 | LLVM IR 层（前端编译后提取 CDFG） |
| 优化指标 | 执行时间（ExecTime）、代码体积（CodeSize）、能耗（Energy） |

名字 **MileStone** 有两层含义：流水线被拆成「图提取 → 数据库构建 → 预测 → 多目标探索」等里程碑；同时在执行时间/体积/能耗的 trade-off 空间里，标出 Pareto 最优的「里程碑点」。

---

## 为什么重要

### 1. `-O3` 不是万能答案

`-O3` 会激进内联、循环展开、自动向量化——通常更快，但**代码膨胀**、**功耗上升**。嵌入式、边缘 AI、电池设备往往不能接受。固定优化级别无法表达「在 3J 能耗以内尽量快」这类**带约束的多目标**需求。

### 2. 单目标学习方法不够用

已有工作（Autophase、CompilerGym、MLComp 等）多用 RL 或监督学习找 pass 序列，但常见局限：

- 只优化**执行时间**或**代码大小**之一
- 依赖**动态 profiling**（真编译+真跑），样本效率低
- 把多目标硬塞进加权标量和，丢失 Pareto 前沿多样性

MileStone 把问题形式化为**约束多目标优化（CMOO）**，显式探索 Pareto 前沿。

### 3. GNN + RL 分工明确

| 组件 | 角色 | 类比 |
|------|------|------|
| GNNPP | 静态预测三个指标 | 品菜师：看菜谱结构猜结果 |
| RLMOE | 探索 pass/指令级决策 | 排班经理：试不同工序组合 |
| RLDBG | 自进化数据库 | 配方档案室：越积越准 |
| GG | LLVM IR → CDFG | 把厨房现状画成关系图 |

GNN 提供**廉价反馈**，RL 不必每步都真编译，训练收敛更快。

---

## 核心概念

### 1. Compiler Pass 与 Phase Ordering

现代编译器（LLVM、GCC）把优化拆成可插拔的 **pass**：`inline`、`loop-unroll`、`vectorize`、`dce`……每个 pass 读写 IR。Pass **顺序**影响最终效果，且 pass 之间可能互相增强或抵消（例如先 DCE 再 inline vs 反过来）。

搜索空间大小随 pass 数量呈阶乘级增长；`-O1/-O2/-O3` 只是人工挑出的几条路径。

### 2. CDFG（Control and Data Flow Graph）

MileStone 不直接喂源代码文本，而是从 **LLVM IR** 提取 **CDFG**：

- **节点**：基本块节点 + 指令节点（`alloca`、`load`、`store`、`add`、`call` 等）
- **边**：控制流边 + 数据依赖边

这样程序结构（循环、分支、调用关系）和语义（算术、内存操作）都编码进图里，适合 GNN 做 message passing。

### 3. GNNPP：图卷积性能预测器

每个节点用 **10 维二元特征向量**：

- 第 1 维：基本块 vs 指令
- 后 9 维：常见 LLVM opcode 的 one-hot（`alloca/load/store/add/sub/mul/div/icmp/call`）

多层 **GCN（Graph Convolutional Network）** 做邻居聚合，mean pooling 得到图级 embedding，再接三层全连接 + LeakyReLU，分别预测 **CodeSize、Energy、ExecTime**（三个结构相同、权重独立的 GNN）。

推理时三个 embedding 各 64 维，拼接成 **192 维** 向量，再拼 CDFG 元数据（节点数、边数、乘法次数等），作为 RL 的状态输入。

### 4. RLMOE：强化学习多目标探索器

把 phase ordering 建模为 **MDP**：

| MDP 元素 | MileStone 中的含义 |
|----------|-------------------|
| 状态 \(s_t\) | 部分赋值的 CDFG + 192 维 embedding + 当前节点 ID + 能耗约束 |
| 动作 \(a_t\) | 对当前节点选择优化取向（如偏代码大小 vs 偏执行时间） |
| 转移 | 逐步为 CDFG 节点分配 directive，直到完整方案 |
| 奖励 \(r_t\) | 中间步为 0；**最后一步**用 GNN 预测值算综合奖励 |

奖励与优化目标（论文公式 2、4）对齐。在用户指定能耗目标 \(Energy_{target}\) 下，最小化：

\[
U(\text{CodeSize}, \text{ExecTime} \mid Energy_{target}) = \mu \frac{\text{CodeSize}}{q} + (1-\mu)\,\text{ExecTime}
\]

终端奖励形如：

\[
r_T = -\alpha \cdot \text{CodeSize}_p - \beta \cdot |Energy_t - Energy_p| - \lambda \cdot \text{ExecTime}_p
\]

其中 \(\alpha = \mu/q\)，\(\lambda = 1-\mu\)，\(p\) 表示 GNN 预测值。算法可用 **DQN** 或 **PPO**。

### 5. RLDBG：自进化数据库

闭环训练的数据来源：

1. RLMOE 探索大量 pass 配置
2. Evaluator **真编译 + profiling** 得到 ground truth
3. 存入数据库：IR、CDFG、实测指标
4. 用这些数据**监督训练 GNNPP**
5. 更准的 GNN → 更快的 RL 反馈 → 更多高质量样本

论文强调捕获 **Pareto 高效** 结果，减少重复 profiling。

### 6. Pareto 最优与能耗约束

两个方案 A、B：

- A：1.2 s，5 J
- B：1.4 s，2 J

对电池供电 MCU，B 可能更优——尽管更慢。MileStone 在**用户能耗约束**下找非支配解集（Pareto front），而不是单一「最快」答案。

---

## 四模块架构（工作流）

```text
LLVM 前端 IR
    │
    ▼
┌─────────────┐
│ GG          │  Graph Generator：提取 CDFG
└──────┬──────┘
       │
       ├──────────────────────────────────┐
       ▼                                  ▼
┌─────────────┐                    ┌─────────────┐
│ RLDBG       │◄──探索/标注───────│ RLMOE       │
│ 自进化 DB   │                    │ RL 探索器   │
└──────┬──────┘                    └──────▲──────┘
       │ 训练数据                        │ 预测反馈
       ▼                                  │
┌─────────────┐──────────────────────────┘
│ GNNPP       │  三头 GNN 预测 Size/Energy/Time
└─────────────┘
```

**训练阶段**：RLDBG 驱动探索 → 标注 CDFG → 训练 GNNPP → GNN 加速 RLMOE 策略学习。

**推理阶段**：新程序 → GG 出图 → GNNPP 嵌入 → RLMOE 在约束下输出 pass 策略 → Pareto 里程碑解。

---

## 代码示例 1：从 LLVM IR 概念构造 CDFG 节点特征

下面用 Python **伪代码**说明论文中 10 维节点特征如何编码（便于理解 GNN 输入，非官方实现）：

```python
# MileStone GNNPP 节点特征：10 维二元向量
OPCODES = ["alloca", "load", "store", "add", "sub", "mul", "div", "icmp", "call"]

def node_features(node) -> list[int]:
    """将 CDFG 节点编码为 10 维特征（论文 §4.2.1）"""
    feats = [0] * 10
    if node.kind == "basic_block":
        feats[0] = 1  # 基本块节点
        return feats
    # 指令节点
    feats[0] = 0
    if node.opcode in OPCODES:
        feats[1 + OPCODES.index(node.opcode)] = 1
    return feats

# 示例：一条 store 指令节点
store_node = {"kind": "instruction", "opcode": "store"}
print(node_features(store_node))
# [0, 0, 0, 1, 0, 0, 0, 0, 0, 0]  → store 在索引 3（1+2）

# 示例：基本块入口
bb_node = {"kind": "basic_block"}
print(node_features(bb_node))
# [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
```

要点：结构（块 vs 指令）和语义（opcode）分开编码，让 GCN 能区分控制流骨架与计算操作。

---

## 代码示例 2：终端奖励与多目标标量（对齐论文公式）

```python
def milestone_terminal_reward(
    code_size_p: float,      # GNN 预测代码体积
    exec_time_p: float,      # GNN 预测执行时间
    energy_p: float,         # GNN 预测能耗
    energy_target: float,    # 用户能耗预算
    mu: float = 0.5,         # 代码体积 vs 时间的权重
    q: int = 1000,           # 体积量纲缩放
    beta: float = 1.0,       # 能耗偏差惩罚
) -> float:
  """
  对应 MileStone 公式 (2)(4) 的终端奖励（RL 只在最后一步非零）。
  RL 最大化累计奖励 → 等价于最小化加权目标 + 能耗约束偏差。
  """
  alpha = mu / q
  lam = 1.0 - mu
  penalty_energy = abs(energy_target - energy_p)
  return -(
      alpha * code_size_p
      + lam * exec_time_p
      + beta * penalty_energy
  )

# 场景：IoT 设备能耗预算 2J，更在意能耗达标
r = milestone_terminal_reward(
    code_size_p=12000,
    exec_time_p=1.4,
    energy_p=1.9,
    energy_target=2.0,
    mu=0.3,      # 更偏执行时间
    beta=2.0,    # 加重能耗约束
)
print(f"terminal reward: {r:.4f}")
```

调 `mu` 可在「缩体积」与「抢速度」间滑动；调 `beta` 可强化「别超能耗预算」。RLMOE 通过在不同约束下探索，拼凑 Pareto 前沿上的多个里程碑点。

---

## 代码示例 3：用 clang 理解「pass 顺序」实验入口（可选动手）

虽 MileStone 未开源完整框架，理解 phase ordering 可从手动试 LLVM pass 管道开始：

```bash
# 查看默认 -O3 会跑哪些 pass（LLVM 17+）
opt -passes='default<O3>' -disable-output hello.bc -print-passes 2>&1 | head

# 自定义 pass 顺序：先内联再循环展开（顺序不同结果可能不同）
opt -passes='inline,function(loop-unroll)' hello.bc -o tuned.bc

# 对比代码体积与后续链接产物
clang tuned.bc -o tuned -O0
size tuned
```

MileStone 的价值在于：不用你对每个 benchmark 手工试几百条 `opt -passes=...`，而是由 RL 在 GNN 预测引导下自动搜索，且同时看时间/体积/能耗。

---

## 实验结论（论文摘要级）

论文在标准 benchmark 上报告：

- 能找到**强 Pareto 最优**解，优于固定 LLVM 优化级别及相关技术
- 在**相同能耗预算**下，执行时间最多降低约 **45%**
- 比依赖固定启发式或单目标学习的方法，更能**准确满足能耗约束**

（具体 benchmark 名称、基线对比细节见论文 §5 Experimental Results。）

---

## 与相关工作的关系

| 方向 | 代表工作 | 与 MileStone 的差异 |
|------|----------|---------------------|
| RL + 编译 pass | Autophase (Haj-Ali et al.) | Autophase 偏 HLS/单目标；MileStone 强调 LLVM IR + **三目标** |
| GNN + pass 学习 | CompilerGym, ProGraML | 多依赖 profiling 奖励；MileStone 用 GNN **静态预测** 减 profiling |
| 多目标 pass 序列 | MLComp | 同样 RL+ML 估计，MileStone 强调 **CDFG + 自进化 DB + 能耗约束 Pareto** |
| 固定优化级别 | `-O1/-O2/-O3` | 只是搜索空间中极少数预设点 |

读 MileStone 的最佳搭档：先理解 LLVM pass 管线，再看 **Autophase**（RL 排 pass 的开山）、**ProGraML**（程序图表示）、**MLComp**（多目标 pass 序列 + ML 性能估计）。

---

## 局限与开放问题

1. **GNN 预测误差**：RL 策略受 surrogate 质量上限；极端未见过的 IR 结构可能预测漂移。
2. **训练成本**：RLDBG 仍需一定量真 profiling 建库；冷启动程序域与目标 CPU 时要重新积累数据。
3. **动作空间抽象**：论文将决策建模为对 CDFG 节点赋 directive，与工业界完整 pass pipeline 的映射关系需读原文细节。
4. **泛化到其他后端**：目前围绕 LLVM IR/CDFG；GPU kernel 编译器（XLA、TVM）的 phase ordering 是平行问题，架构可借鉴但图特征需重做。

---

## 零基础自检清单

读完本篇，你应该能回答：

- [ ] 什么是 **phase ordering problem**？为什么 `-O3` 不能覆盖所有场景？
- [ ] **CDFG** 的节点和边分别表示什么？
- [ ] **GNNPP** 和 **RLMOE** 各解决什么子问题？为何要强绑定？
- [ ] **RLDBG** 在闭环里扮演什么角色？
- [ ] 论文中 **Pareto 最优** 与 **能耗约束** 如何同时体现？
- [ ] 终端奖励里 \(\mu\)、\(q\)、\(\beta\) 各控制什么权衡？

---

## 延伸阅读

- 论文 HTML：[arXiv:2605.23435](https://arxiv.org/html/2605.23435v1)
- LLVM Pass 基础设施：[LLVM Passes](https://llvm.org/docs/Passes.html)
- Autophase（RL 排 HLS pass）：[MLSys 2020](https://proceedings.mlsys.org/paper/2020/file/5b47430e24a5a1f9fe21f0e8eb814131-Paper.pdf)
- ProGraML（程序图表示）：Cummins et al., 2021
- MLComp（多目标 pass + ML 估计）：[arXiv:2012.05270](https://arxiv.org/abs/2012.05270)

---

## 一句话带走

**MileStone 把编译器优化排程变成「看图预测 + 强化学习寻 Pareto 前沿」：GNN 当廉价品菜师，RL 当听预算的排班经理，自进化数据库让两者越配合越准——在能耗约束下，比死磕 `-O3` 更能找到适合你设备的那道菜。**
