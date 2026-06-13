---
title: AttackGNN — 用强化学习给硬件安全里的 GNN 做红队测试
来源: https://www.usenix.org/conference/usenixsecurity24/presentation/gohil
日期: 2026-06-13
分类: 机器学习
子分类: 硬件安全
provenance: pipeline-v3
---

# AttackGNN：用强化学习给硬件安全中的 GNN 做红队测试

> 论文：AttackGNN: Red-Teaming GNNs in Hardware Security Using Reinforcement Learning
> 作者：Vasudev Gohil, Satwik Patnaik, Dileep Kalathil, Jeyavijayan Rajendran
> 发表：33rd USENIX Security Symposium, 2024

---

## 一、日常类比：考试作弊检测 vs 反作弊

想象一个场景：学校用一套智能系统来检测学生是否抄袭作业。这套系统会把两份作业变成"特征向量"，然后算相似度——如果两份作业很像，就判定为抄袭。

现在，有一个学生想绕过这个检测系统。他不能改变作业的答案（否则老师一眼就能看出），但他可以**换一种写法、调换个段落顺序、把同义词替换一下**。只要最终答案不变，系统却认为这两份作业"不像"了，他的目的就达到了。

AttackGNN 做的事情完全一样——只不过：

- "作业"变成了**集成电路（IC）电路设计**
- "抄袭检测系统"变成了**用 GNN 做的各种硬件安全检测工具**
- "换种写法"变成了**保持功能不变的前提下，改变电路结构**

---

## 二、为什么要关心这件事？

### 2.1 芯片供应链的现实问题

现代芯片（CPU、GPU、手机 SoC）的设计极其复杂，没人能从头到尾自己做。于是形成了全球分工：

- **设计公司**（如 NVIDIA、Apple）只负责设计
- **代工厂**（如台积电、三星）负责制造
- 芯片还要经过**封装、测试、集成**到设备中

这种全球化分工带来了安全隐患：

1. **IP 盗版**：竞争对手窃取你的电路设计
2. **硬件木马（Hardware Trojan）**：敌人在制造环节偷偷植入恶意电路
3. **逆向工程**：对手拆解你的芯片，还原出设计
4. **硬件混淆破解**：对手破解你用密钥保护的电路

### 2.2 GNN 被广泛用于解决这些问题

研究者用**图神经网络（GNN）**来解决上述安全问题。GNN 是一种专门处理"图"数据的深度学习模型。电路天然可以表示为图：

- **节点** = 逻辑门（AND、OR、NOT 等）
- **边** = 连接这些门的导线

举几个例子：

| 安全问题 | GNN 方法 | 做了什么 |
|---------|---------|---------|
| IP 盗版检测 | GNN4IP | 比较两个电路图的相似度 |
| 硬件木马检测 | GNN4TJ | 判断电路中是否藏有恶意模块 |
| 硬件木马定位 | TrojanSAINT | 指出木马具体在哪几个门 |
| 逆向工程 | GNN-RE | 识别电路的各个功能模块 |
| 破解硬件混淆 | OMLA | 恢复被混淆电路的正确密钥 |

这些方法的准确率都很高（90%+），看起来非常可靠。**但问题来了：它们真的可靠吗？**

---

## 三、核心概念：对抗样本

### 3.1 什么是"对抗样本"？

对抗样本是指**人类看起来没区别，但能让 AI 模型产生错误判断的输入**。

最著名的例子：给一张"停车标志"的图片加上一些人眼看不见的微小噪点，自动驾驶汽车就会把它识别成"限速 45"。

在 GNN 的语境下，对抗样本就是**被精心修改过的图数据**。对于电路来说，就是**被修改过的电路图**。

### 3.2 电路的对抗样本有什么特殊要求？

普通的图对抗攻击可以用三种方式：

1. 添加边
2. 删除边
3. 修改节点特征

但对电路来说，这些都不行：

- **添加/删除边** → 改变了电路的功能（比如加法器变成了错误的结果）
- **修改节点特征** → 在我们的攻击模型中，攻击者无法直接控制特征

所以，我们需要一种特殊的修改方式：**功能等价变换**。

### 3.3 功能等价变换：换汤不换药

想象你有这样一段代码：

```python
# 原始写法
result = (a AND b) OR (a AND c)

# 变换后的写法（功能完全相同！）
result = a AND (b OR c)
```

这两行代码的逻辑输出完全一样，但内部结构不同。在电路设计中，类似的变换非常多。AttackGNN 就是利用这些变换来"欺骗"GNN。

---

## 四、AttackGNN 的核心方法

### 4.1 把攻击过程建模为"玩游戏"

AttackGNN 的核心思想是：**把生成对抗电路的过程变成一个强化学习任务**。

强化学习的基本框架：

```
环境（电路） ──观察──> 智能体（RL Agent）
    ^                        |
    |  奖励信号               | 做出决策
    └────────────────────────┘
```

具体来说：

- **状态（State）**：当前电路的特征描述，比如输入数量、输出数量、各种门的数量
- **动作（Action）**：对电路做一次功能等价变换
- **奖励（Reward）**：如果变换后的电路成功骗过了 GNN，就得到正奖励；否则为零

### 4.2 智能体能做什么？（动作空间）

AttackGNN 的智能体有两种类型的动作：

**类型一：综合工具的原生变换**

```
动作列表：
  - refactor       （重构电路）
  - rewrite        （重写电路）
  - resub          （重新代入）
  - balance        （平衡电路深度）
  - refactor -z    （重构并优化输出极性）
  - rewrite -z     （重写并优化输出极性）
  - resub -z       （重新代入并优化输出极性）
  - no-op          （什么都不做，当已经成功时就用它停止）
```

这些动作来自一个叫 **ABC** 的开源电路综合工具。ABC 会对电路进行"重新编译"，改变其结构但保持功能不变。

**类型二：自定义的标准单元选择策略**

这是论文的创新之一。作者设计了 10 种不同的"标准细胞"选择策略：

```python
# 伪代码：每种策略规定综合工具可以使用哪些逻辑门

# 策略 a1：只用 2 输入的门
allowed_cells_a1 = {
    "AND2", "OR2", "NAND2", "NOR2",
    "XOR", "XNOR", "INV", "BUF"
}
# 不允许使用 3 输入及以上的门

# 策略 a2：允许 3 输入及以上的门
allowed_cells_a2 = {
    "AND2", "OR2", "NAND2", "NOR2",
    "AND3+", "OR3+", "NAND3+", "NOR3+",
    "XOR", "XNOR", "INV", "BUF"
}

# ... 共 10 种策略，覆盖不同的门组合
```

每种策略就像是给综合工具一个"菜谱"，告诉它可以用哪些食材（逻辑门）来做菜（综合电路）。不同的菜谱做出来的菜（电路结构）不一样，但味道（功能）相同。

### 4.3 训练技巧：延迟奖励

论文发现，如果在每一步都去查询 GNN 来判断是否攻击成功，会非常慢（每次查询需要几秒）。

他们的解决方案：**只在回合结束时计算一次奖励**。

```python
# 低效的做法：每步都查询 GNN
for step in range(max_steps):
    action = agent.choose_action(state)
    new_state = apply_transformation(state, action)
    # 每次都加载 GNN 模型做前向传播 —— 很慢！
    reward = query_gnn(original_circuit, new_state)
    state = new_state

# 高效的做法：只在最后查询一次
for step in range(max_steps):
    action = agent.choose_action(state)
    state = apply_transformation(state, action)

# 回合结束，只查询一次
final_reward = query_gnn(original_circuit, state)
```

效果：训练速度提升了 **3.73 倍**，成功率反而从 77% 提升到 89%。

### 4.4 一个完整的攻击流程示例

让我们用一个具体的例子来理解整个流程：

```
假设我们要攻击 GNN4IP（IP 盗版检测器）

原始电路（被抄袭的目标）：
  ┌─────┐     ┌─────┐
  │ AND │────▶│ OR  │────▶ 输出
  └─────┘     └─────┘
       │         ▲
  ┌─────┐         │
  │ AND │─────────┘
  └─────┘

第 1 步：智能体选择动作 "rewrite"
  ┌─────┐     ┌─────┐
  │ AND │────▶│ OR  │────▶ 输出  （功能不变！）
  └─────┘     └─────┘
       │         ▲
  ┌─────┐       │
  │ AND │────┐  │
  └─────┘    │  │
         ┌────┘  │
         │ AND   │
         └───────┘
  （电路结构变了，但输入输出关系完全一样）

第 2 步：智能体选择动作 "balance"
  电路进一步变形...

第 3 步：智能体选择动作 "a3"（某种标准单元策略）
  电路再次变形...

第 4 步：智能体选择 "no-op"
  因为此时 GNN4IP 已经把"变形后的电路"判断为
  "没有被抄袭"，攻击成功了，不再继续变化。

最终结果：
  - 原始电路：GNN4IP 判断为 "pirated"（被盗版了）✓
  - 变形后的电路：GNN4IP 判断为 "not pirated"（没被盗版）✗
  - 两个电路功能完全相同！
```

---

## 五、实验结果

AttackGNN 攻击了 5 种 GNN 方法，覆盖 4 类硬件安全问题：

| 被攻击的 GNN | 安全任务 | 攻击成功率 |
|------------|---------|----------|
| GNN4TJ | 硬件木马检测 | **100%** |
| TrojanSAINT | 硬件木马定位 | **100%** |
| GNN4IP | IP 盗版检测 | **100%** |
| GNN-RE | 逆向工程 | **100%** |
| OMLA | 破解硬件混淆 | **100%** |

全部 100% 成功率。这意味着这些在论文中声称准确率 90%+ 的 GNN 防御方法，在面对 AttackGNN 生成的对抗电路时，**完全没有抵抗力**。

---

## 六、关键洞察与反思

### 6.1 为什么这个研究很重要？

GNN4IP 这类方法在论文里报告了 94.61% 的准确率，听起来很可靠。但**测试集上的准确率高 ≠ 实际使用中安全**。就像一把锁在实验室里打不开，但小偷找到了一个"看起来一样但结构不同"的钥匙。

### 6.2 功能等价变换是关键

AttackGNN 最核心的创新不是用了 RL，而是找到了**既能改变电路结构又不改变功能的变换方式**。这使得攻击者可以在"黑盒"条件下（不知道 GNN 的内部参数）成功欺骗它。

### 6.3 对防御者的启示

如果你正在开发基于 GNN 的硬件安全工具，你需要：

1. **做对抗鲁棒性评估**——不要只看准确率，要看对抗攻击下的表现
2. **考虑功能等价变换的威胁面**——攻击者可以利用综合工具的变换来改变电路结构
3. **训练更鲁棒的模型**——在训练时加入对抗样本作为数据增强

---

## 七、代码示例

### 7.1 模拟 AttackGNN 的状态表示

```python
# 一个电路的状态向量
# 格式：[输入数, 输出数, 总门数, 总连线数,
#        AND门, OR门, NAND门, NOR门,
#        NOT门, BUF门, XOR门, XNOR门, 其他门]

def extract_circuit_state(circuit):
    """从电路中提取状态向量"""
    state = [
        len(circuit.inputs),       # 输入数量
        len(circuit.outputs),      # 输出数量
        len(circuit.all_gates),    # 总门数
        len(circuit.wires),        # 总连线数
        circuit.count_gate_type("AND"),
        circuit.count_gate_type("OR"),
        circuit.count_gate_type("NAND"),
        circuit.count_gate_type("NOR"),
        circuit.count_gate_type("INV"),
        circuit.count_gate_type("BUF"),
        circuit.count_gate_type("XOR"),
        circuit.count_gate_type("XNOR"),
        circuit.count_gate_type("OTHER"),
    ]
    return state

# 示例：一个全加器的状态
full_adder_state = extract_circuit_state(full_adder_circuit)
# 输出可能是类似这样的向量：
# [2, 2, 5, 6, 2, 1, 1, 0, 1, 0, 0, 0, 0]
```

### 7.2 模拟 AttackGNN 的动作执行

```python
# 标准单元选择策略（AttackGNN 的创新动作）
STANDARD_CELL_POLICIES = {
    "a1": {
        "allowed": ["AND2", "OR2", "NAND2", "NOR2",
                     "XOR", "XNOR", "INV", "BUF"],
        "prohibited": ["AND3+", "OR3+", "NAND3+", "NOR3+"]
    },
    "a2": {
        "allowed": ["AND2", "OR2", "NAND2", "NOR2",
                     "AND3+", "OR3+", "NAND3+", "NOR3+",
                     "XOR", "XNOR", "INV", "BUF"],
        "prohibited": []
    },
    # ... 共 10 种策略
}

def apply_synthesis_policy(circuit, policy_name, synthesis_tool="abc"):
    """
    对电路应用综合策略，生成功能等价但结构不同的电路。
    这就是 AttackGNN 的"动作"。
    """
    policy = STANDARD_CELL_POLICIES[policy_name]

    # 调用综合工具，限制其可用的标准单元
    resynthesized = synthesis_tool.resynthesize(
        circuit,
        allowed_cells=policy["allowed"],
        prohibited_cells=policy["prohibited"],
        # 固定应用这三个变换
        transformations=["rewrite", "balance", "refactor"]
    )

    # 验证功能等价性
    assert circuit.verify_functional_equivalence(resynthesized)

    return resynthesized

# 示例：对一个被盗版的电路应用策略 a1
original = load_circuit("pirated_design.v")
perturbed = apply_synthesis_policy(original, "a1")

# 检查 GNN 的判断是否改变
original_verdict = gnn4ip.predict(original, original)
perturbed_verdict = gnn4ip.predict(original, perturbed)

print(f"原始判断: {original_verdict}")      # "pirated"
print(f"扰动后判断: {perturbed_verdict}")    # "not pirated" ← 攻击成功！
```

---

## 八、一句话总结

AttackGNN 告诉我们：**一个在测试集上准确率 94% 的安全模型，可能因为攻击者用强化学习找到了"换汤不换药"的电路结构而完全失效**。在安全领域，只看准确率是不够的，必须评估模型在对抗条件下的鲁棒性。

---

## 九、延伸阅读建议

1. **GNN 基础**：了解图神经网络如何工作（GCN、GAT 等架构）
2. **对抗机器学习**：了解 FGSM、PGD 等经典对抗攻击方法
3. **强化学习入门**：理解 MDP、Policy Gradient、PPO 等基本概念
4. **硬件安全基础**：了解 IP 盗版、硬件木马、硬件混淆等威胁模型
