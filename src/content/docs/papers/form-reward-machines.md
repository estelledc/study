---
title: FORM — 用一阶逻辑奖励机让 RL 学会"先做什么再做什么"
来源: 'Ardon, Furelos-Blanco, Parac & Russo, "FORM: Learning Expressive and Transferable First-Order Logic Reward Machines", AAMAS 2025'
日期: 2026-06-13
分类: 机器学习
子分类: 强化学习
provenance: pipeline-v3
---

## 是什么

FORM（**F**irst-**O**rder **R**eward **M**achines）是 AAMAS 2025 发表的论文，把传统奖励机（Reward Machine, RM）的边缘标签从**命题逻辑升级到一阶逻辑**，解决了复杂非马尔可夫任务里状态爆炸、无法跨任务迁移的问题。

要理解 FORM，先把场景讲清楚。

日常类比：你是一个快递员，任务不是"送一单给 1 块钱"，而是"先取咖啡、再送到办公室，中途不能踩坏任何装饰品"。**同样的动作"走到某个格子"，根据你之前有没有取过咖啡、有没有踩坏东西，奖励完全不同**——这就是非马尔可夫奖励：奖励不只取决于当前状态，还取决于历史。

奖励机（RM）就是为解决"任务有先后顺序"而生的。它是一个有限状态机，内部有几个状态（比如"还没取咖啡"→"已取咖啡"→"任务完成"），每条边上标着**触发条件和奖励**。Agent 的回报由当前环境状态 + RM 内部状态共同决定。

传统 RM 用**命题逻辑**（propositional logic）标注边：每条边写死具体的原子命题，比如 `o ∧ ¬*` 表示"在办公室且没踩装饰品时才触发这条边"。这在简单任务里没问题，但任务变复杂时：

- "访问所有黄色检查点"——需要为每个黄色检查点单独写一条边（color(yellow_1) → color(yellow_2) → ...），检查点数量一变，RM 就得重写。
- "访问任意一个蓝色检查点，然后所有黄色"——需要为蓝黄组合穷举分支，状态数随对象数量指数增长。

FORM 的解法：**用一阶逻辑（First-Order Logic, FOL）代替命题逻辑**。一阶逻辑有**量词**（"存在一个"、"所有"）和**变量**，能写出 `∃c : color(c, blue)` 这种一句话覆盖无数具体对象的规则。FORM 因此做到了三件事：

1. **更紧凑**：一阶公式比枚举命题短得多
2. **可迁移**：公式说"任意黄色检查点"，在 3 个黄点和 6 个黄点的任务里都能用
3. **可自动学习**：论文提出了用 ILASP（归纳逻辑编程）从 agent 的交互轨迹中自动学习 FORM 结构

## 为什么重要

不理解 FORM，下面这些判断容易出错：

- 为什么非马尔可夫奖励是 RL 的真实瓶颈——现实任务几乎都有先后顺序（导航、操作、对话），纯 MDP 无法表达
- 为什么命题逻辑 RM 在复杂任务里不可扩展——对象数量增长时状态数爆炸，且迁移需要手动重写
- 为什么一阶逻辑是解开"迁移"的关键——FOL 的变量和量词天然把"具体对象"抽象成"满足某属性的对象"，同一套规则跨任务复用
- 为什么 ILASP 学习比神经网络学习更适合 RM——RM 是符号结构，梯度下降不适合学习离散逻辑规则；归纳逻辑编程（ILP）从小样本中推断逻辑规则，正是为此而生的
- 为什么多 agent 共享一个 FORM 比各自学各自的好——FORM 是共享知识，多个 agent 同时在不同环境探索，把各自的经验汇入同一个 FORM，学习速度叠加

这项工作的贡献不只是一篇论文——它把符号 AI（归纳逻辑编程）和连接主义 AI（深度 RL）在奖励建模上交汇了。神经符号 RL 是当前的活跃方向，FORM 提供了其中一个清晰的实例。

## 核心要点

1. **奖励机回顾**：一个 RM 定义为 `⟨U, u₀, u_A, u_R, δᵤ, δᵣ⟩`。U 是内部状态集合，u₀ 是初始状态，u_A / u_R 是接受/拒绝状态，δᵤ 按命题真值分配决定状态转移，δᵣ 按 RM 状态给出奖励函数。Agent 实际看到的状态是 `(环境状态, RM状态)` 的叉积。日常类比：RM 是一个"任务说明书"，Agent 每走一步都翻一下说明书确认"我现在在任务流程的哪个阶段"。

2. **一阶逻辑标签**：传统 RM 边上写 `o ∧ ¬*`（命题），FORM 边上写 `∃c : (color(c, blue) ∧ visited(c))`（一阶）。一阶逻辑的关键能力：
   - **存在量词 ∃**："至少有一个蓝色检查点被访问过"——一个公式覆盖任意数量
   - **全称量词 ∀**："所有黄色检查点都被访问过"——适用范围随对象数量自动伸缩
   - **谓词 + 变量**：`visited(c)` 不是具体对象 `visited(yellow_1)`，而是对任意满足 `color(c, yellow)` 的对象成立
   类比：命题逻辑像你在名单上打勾（张三 √、李四 √...），一阶逻辑像你说"名单上所有人都签到了"（一句顶一万句）。

3. **ILASP 学习 FORM**：ILASP（Inductive Learning of Answer Set Programs）是一个归纳逻辑编程系统。给定：
   - **背景知识 B**：环境中的对象、属性、关系（比如网格世界里有哪些格子、格子的颜色）
   - **假设空间 Sm**：允许生成的规则形式（比如"最多 3 个状态，边上最多 2 个谓词"）
   - **示例 E**：Agent 收集的交互轨迹（每一步观察到哪些命题为真、进入了哪个 RM 状态）
   ILASP 的任务是找到一个最小化的假设 H（即 FORM 的 ASP 编码），使得 B ∪ H 接受所有正例、拒绝所有负例。类比：ILASP 像一个侦探，从 Agent 的行动记录中反推出"这个任务的规则到底是什么"。

4. **多 Agent 共享 FORM**：FORM 学习完后，多个 agent **共享同一个 FORM 结构、各自维护独立的策略网络**。每个 agent 在不同实例（比如不同随机种子、不同网格布局）上用 PPO 并行训练。因为 FORM 把任务结构抽象出来了，agent 学策略时可以复用 FORM 里的"阶段信息"——知道自己在任务流的哪一步，行动选择更有方向。

5. **迁移机制**：FORM 的迁移不是迁移策略（policy transfer），而是迁移**任务结构**（task structure transfer）。因为在 FORM 公式里只写属性不写具体对象（`∃c : color(c, yellow)` 而非 `yellow_1`），同一个 FORM 直接从"4 个黄色检查点"的任务迁移到"6 个黄色检查点"的任务，无需任何修改。然后在新任务上用 FORM 引导 RL，收敛速度远快于从零学。

## 实践案例

### 案例 1：命题 RM vs FORM — 同一个任务需要的状态数

任务："访问所有黄色检查点 → 去绿色目标"

命题 RM（4 个黄色检查点 yellow_1 到 yellow_4）：

```
状态：u0(初始) → u1(访问了1个) → u2(2个) → u3(3个) → u4(全访问) → 目标
边数：每个状态之间需要 4C1 + 4C2 + ... ≈ 多到写不下
```

FORM（同样任务，用一阶逻辑）：

```
u0 ──[ ∃c : color(c,yellow) ∧ visited(c) ]──> u0  (自环：持续访问黄色)
u0 ──[ ∀c : color(c,yellow) → visited(c) ]──> u1  (全访问后转移)
u1 ──[ ∃g : is_goal(g) ∧ at(g) ]───────────> 接受状态
```

无论多少黄色检查点，FORM 只有 2 个状态 + 3 条边。

### 案例 2：FORM 的 ASP 编码长什么样

ILASP 学习得到的 FORM 在 ASP 中表达（简化示意）：

```prolog
% 状态声明
state(u0).
state(u1).
accept(u_accept).

% 边定义：从 u0 经过条件 φ 转移到 u1
edge(u0, u1, 0) :- step(T), 
    not forall_color_yellow_visited(T).
edge(u0, u_accept, 1) :- step(T),
    forall_color_yellow_visited(T), at_goal(T).

% 辅助谓词
forall_color_yellow_visited(T) :- color(C, yellow), visited(C, T).
```

关键是 `forall_color_yellow_visited` 这个一阶谓词——它不依赖具体多少个黄色格子。

### 案例 3：论文中的三个实验任务

| 任务 | 描述 | 关键结果 |
|------|------|---------|
| Task 1: All-Yellow | 访问所有黄色后到目标 | FORM 收敛速度远超命题 RM 学习方法 |
| Task 2: All-Green-Except-One, No-Lava | 访问所有绿色（跳过指定一个），避开熔岩 | 手工 FORM 基线优于任何 RM 方法；接受/拒绝状态结构被学会 |
| Task 3: Blue-Then-All-Yellow | 先访问任意蓝色，再访问所有黄色，再到目标 | 顺序子任务结构被成功学习（先 ∃blue, 再 ∀yellow） |
| 迁移实验 | 把 Task 1 学到的 FORM 用到 4 黄/6 黄变体 | 迁移后策略收敛速度大幅提升 |

### 案例 4：FORM 学习与利用的交替流程

```
1. Agent 随机探索，收集轨迹 trace₁
2. 把 trace₁ 传给 ILASP，ILASP 尝试学出一个 FORM₁
3. Agent 用 FORM₁ 引导继续探索（此时方向更明确）
4. 如果 trace₂ 与 FORM₁ 矛盾，ILASP 在新旧轨迹上重新学习 → FORM₂
5. 重复直到 FORM 稳定
6. 启动多个 agent，共享最终 FORM，各自用 PPO 学策略
```

这个交替过程的关键洞察：**一开始乱走收集"反例"也很重要**——只有碰到失败的路径，ILASP 才知道哪条规则写错了。

## 踩过的坑

1. **ILASP 的冷启动问题**：如果初始轨迹太少、太单一（比如 agent 只会原地转圈），ILASP 学出来的 FORM 会过拟合——把所有路径都判为正确。解决方案是加探索噪声或手动给一些"明显错误"的负例。

2. **一阶逻辑的表达力不等于啥都能写**：FORM 能表达的是**一阶可定义的规则性任务**，对于需要计数的任务（"访问黄色检查点恰好 5 次"），一阶逻辑本身也需要额外的编码技巧，实际使用时要意识到这个边界。

3. **ILASP 的运行时间不可预测**：归纳逻辑编程在最坏情况下是 NP 难的。论文里的网格世界任务规模较小所以可控，但放到更大更复杂的环境（几十种对象、几十种关系），ILASP 的搜索可能超时。实际部署需要设定假设空间的严格界限。

4. **命题 → 一阶的抽象不是免费的午餐**：要定义 FOL 的谓词（color、visited、at），需要环境提供结构化的感知输入。如果环境给的是像素（Atari 那种），先从像素提取符号谓词本身就是一个难题。FORM 适合**符号化环境**（网格世界、知识图谱、结构化数据库），不适合原始感知输入。

5. **多 agent 共享 FORM 的前提是任务同构**：如果不同 agent 面对的任务本质上不同（结构不同，不只是参数不同），共享同一个 FORM 反而会让 ILASP 找不到一致的假设。

## 适用 vs 不适用场景

**适用**：

- 任务有明显的阶段性结构（"先做 A、再做 B、再做 C"）
- 需要在不同实例间迁移任务知识（比如不同大小的地图、不同数量的目标）
- 环境提供结构化的符号感知（网格世界、知识图谱、逻辑状态）
- 样本效率要求高——ILASP 从少量轨迹就能学出逻辑规则，不需要几十万帧
- 需要可解释的奖励结构——FORM 学出来的规则人类可读、可审计

**不适用**：

- 环境输出是原始像素/传感器信号（需要额外感知层把像素变成符号谓词）
- 任务的奖励不依赖历史（标准 MDP 就够了，用 RM 是杀鸡用牛刀）
- 需要学连续控制策略（连续动作空间里 PPO 没问题，但 FORM 学的是离散任务结构）
- 任务不满足规则性（随机奖励、动态变化的目标、无结构化规律）
- 对实时性要求极高（ILASP 的推理时间不可控）

## 历史小故事（可跳过）

- **2012-2018**：Toro Icarte 等人先后在 IJCAI、JAIR 上提出和形式化 Reward Machines——核心思想是"用有限状态机表达非马尔可夫奖励"
- **2019**：Camacho 等人提出用 LTL（线性时态逻辑）自动合成 RM——把形式化规约和 RL 连起来
- **2020-2022**：Furelos-Blanco 等人提出 ISA（Inductive Subgoal Automata），用 ILASP 从轨迹中自动学习命题逻辑 RM——第一次把归纳逻辑编程引入 RM 学习
- **2023**：Furelos-Blanco 的博士论文系统总结了"用 ILP 学 RM"的方法体系
- **2024 年末**：Ardon、Furelos-Blanco、Parac、Russo（均为 Imperial College London）提交 arXiv 预印本，提出 FORM——把 ISA 从命题逻辑升级到一阶逻辑
- **2025 年 5 月**：FORM 在 AAMAS 2025（底特律）正式发表，被评为 10 页全论文

这条线展示了 RM 研究从"手工设计"到"自动学习"、从"命题级"到"一阶级"的演进路径。FORM 站在这条线的当前最前端。

## 学到什么

1. **符号 AI 和神经网络不是对立面**——ILASP 学会符号化的任务结构，PPO 学会连续的动作策略，两者配合各自做擅长的事
2. **一阶逻辑的核心价值是抽象**——写"所有黄色"而不是"yellow_1, yellow_2, ..."，迁移的根基就在这层抽象
3. **任务结构比策略更容易迁移**——FORM 迁移的是 FORM（任务说明书），不是 policy（怎么做），因为说明书跨场景共用，但怎么做跟具体环境有关
4. **非马尔可夫奖励是真实世界的默认情况**——几乎任何有意义的任务都有"先 X 再 Y"的约束，纯马尔可夫假设只在教科书里成立
5. **归纳逻辑编程在特定场景下远超神经网络**——从 10 条轨迹学出逻辑规则，神经网络需要 10 万条；但 ILP 对连续感知无能为力，所以是互补关系

## 延伸阅读

- 论文 PDF：[FORM: Learning Expressive and Transferable First-Order Logic Reward Machines](https://arxiv.org/abs/2501.00364)
- RM 基础：[Toro Icarte et al., "Using Reward Machines for High-Level Task Specification and Decomposition in RL", JAIR 2022](https://www.jair.org/index.php/jair/article/view/12440)
- ISA（FORM 的前驱）：[Furelos-Blanco et al., "Induction of Subgoal Automata for RL", JAIR 2023](https://www.jair.org/index.php/jair/article/view/12372)
- ILASP 系统：[Law et al., "Inductive Learning of Answer Set Programs"](https://www.ilasp.com/)
- LTL + RL：[Camacho et al., "LTL and Beyond: Formal Languages for Reward Function Specification in RL", IJCAI 2019](https://www.ijcai.org/proceedings/2019/840)
- Furelos-Blanco 博士论文（ILP + RM 体系总结）：[PhD Thesis, Imperial College London, 2023](https://danielfurelos.com/assets/pdf/publications/FurelosBlanco23/FurelosBlanco-D-2023-PhD-Thesis.pdf)

## 关联

- [[rl-overview]] —— 从 RL 基础到 FORM 认知路线
- [[dqn]] —— DQN 假设马尔可夫奖励，FORM 解决的正是 DQN 无法处理的非马尔可夫情况
- [[a3c-2016]] —— A3C 是 FORM 实验用的底层 RL 算法（PPO 的直接前身）
- [[adam-2014]] —— 占位关联

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[a3c-2016]] —— A3C — 多个 CPU 同时跑游戏，让 RL 不再吃 GPU
- [[adam-2014]] —— Adam — 自适应矩估计优化器
- [[dqn]] —— DQN — Deep Q-Network
