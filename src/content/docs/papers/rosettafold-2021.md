---
title: RoseTTAFold — 三轨神经网络预测蛋白质结构与相互作用
来源: https://www.science.org/doi/10.1126/science.abj8754
日期: 2026-06-13
子分类: 生物信息
分类: 机器学习
provenance: pipeline-v3
---

## 先想成什么事

想象你拿到一串**只有颜色名称、没有图纸**的折纸说明：

> 红、蓝、黄、绿、红、紫、蓝、蓝、黄……

你要猜出折完之后是鹤还是船。一个人很难，但如果全世界有成千上万份「类似颜色串」——有的折成了鹤、有的折成了船——你就能从**共变模式**里推断：「每当第 3 位是黄、第 47 位是蓝时，它们往往在成品里靠得很近」。

蛋白质折叠问题与此同构：

- **颜色串** = 氨基酸序列（20 种字母：A、R、N、D、C……）
- **成品形状** = 三维原子坐标（每个残基的 Cα 骨架位置）
- **全世界的类似串** = 多序列比对（MSA，Multiple Sequence Alignment）里搜到的同源蛋白

1972 年 Anfinsen 因证明「序列决定结构」获诺贝尔奖；此后科学家每两年在 **CASP**（Critical Assessment of Structure Prediction）上比谁的预测更准。2020 年 DeepMind 的 **AlphaFold2** 在 CASP14 震惊全场；2021 年 7 月，华盛顿大学 Baker 实验室的 **Baek 等**在 *Science* 发表 **RoseTTAFold**，用**三轨神经网络**达到接近 AlphaFold2 的精度，并把代码开源给整个生物学界。

日常类比再收一句：**RoseTTAFold 不是「模拟折纸过程」，而是「同时读说明书、画平面关系图、捏 3D 模型」，三条线索来回校对，直到三者一致。**

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 标题 | Accurate prediction of protein structures and interactions using a three-track neural network |
| 作者 | Minkyung Baek, Frank DiMaio, Ivan Anishchenko 等；David Baker 通讯作者 |
| 发表 | *Science*, 2021；DOI [10.1126/science.abj8754](https://www.science.org/doi/10.1126/science.abj8754) |
| 机构 | 华盛顿大学蛋白质设计研究所（Institute for Protein Design）等 |
| 开源 | [RoseTTAFold GitHub](https://github.com/RosettaCommons/RoseTTAFold) + [在线服务器](https://robetta.bakerlab.org/) |

论文核心贡献：

1. **三轨架构**：1D 序列轨、2D 距离/取向图轨、3D 坐标轨**双向通信**，比 AlphaFold2 的两轨（1D+2D 先算完再出 3D）更紧密耦合。
2. **端到端学习**：从氨基酸序列经 MSA 一路反传到最终 Cα 坐标；也提供经 **pyRosetta** 生成全原子侧链的版本。
3. **复合物预测**：把两条（或多条）蛋白序列拼在一起输入，**直接**预测蛋白-蛋白复合物，跳过「先分别折叠再刚性对接」的传统流程。
4. **实验结构生物学落地**：解决此前分子置换（MR）失败的晶体学难题、辅助 cryo-EM 建模、为未知结构的人类 GPCR 与疾病相关蛋白提供假说模型。

## 为什么重要

| 对比维度 | 传统方法 | RoseTTAFold |
|----------|----------|-------------|
| 实验测定一条结构 | 数月到数年（X 射线 / cryo-EM） | GPU 上约 **10 分钟**（<400 残基骨架） |
| 复合物建模 | 亚基预测 + 对接搜索 | **一条序列输入，~30 分钟**出复合物骨架 |
| 与 AlphaFold2 | 闭源、需大量算力做推理 | **开源**，单卡 RTX 2080 可跑 |
| CASP14 精度 | AlphaFold2 第一 | RoseTTAFold **接近** AF2，明显优于 trRosetta 等 |

对零基础读者的意义：

- 理解 **2021 年后结构生物学范式转移**：「先算结构再解释功能」成为常态
- 读懂后续 **RFdiffusion、ProteinMPNN、AlphaFold3** 等工作的共同地基
- 知道 **MSA 深度、共进化信号、距离图** 在深度学习结构预测里的角色

## 核心概念

### 1. 氨基酸序列与一级结构（1D Track）

蛋白质由 20 种标准氨基酸按顺序连成多肽链。输入网络的是：

- 目标序列的一 hot 或 embedding
- **MSA**：在 UniRef、BFD 等数据库里搜到的同源序列堆成的矩阵（行=序列，列=对齐位置）

1D 轨用 **轴向注意力（axial attention）** 在 MSA 上同时沿「序列方向」和「对齐列方向」聚合信息，提取每个位置的进化约束。

### 2. 残基对关系与距离图（2D Track）

对任意残基对 \((i, j)\)，网络维护一个 **pair representation**，预测：

- Cβ–Cβ（或 Cα–Cα）**距离分布**
- 残基间 **取向**（orientation）：用四元数或旋转矩阵描述局部坐标系相对关系

这就是 **contact map / distogram** 思想：远在上游的序列位置，若在下游折叠后空间相邻，往往在 MSA 里**协同突变**（共进化）。

2D 轨与 1D 轨通过 **outer product mean** 等方式互相更新：1D 特征「外积」成 2D，2D 再反馈修正 1D。

### 3. 三维骨架坐标（3D Track）

3D 轨直接操作 **Cα 骨架坐标**（初始可为随机线圈），使用 **SE(3)-等变注意力**（Invariant Point Attention 的同类思想）：旋转平移蛋白质时，网络内部几何关系保持一致。

与 AlphaFold2 的差异（论文强调）：AF2 主要在 1D/2D 处理完后用 Structure Module 出 3D；RoseTTAFold 让 **1D ↔ 2D ↔ 3D 全程迭代**，在推理时「集体推理」序列、距离与坐标的一致性。

### 4. 不连续裁剪（Discontinuous Crop）训练

全长蛋白往往几百残基，三轨网络参数量大，**无法一次塞进 GPU**。训练时输入 **两段不连续序列片段**（中间 chain break），总长约 260 残基。推理时对多个 crop 的 1D/2D 预测做平均，再生成最终结构。

### 5. 两种推理管线

| 版本 | 流程 | 特点 |
|------|------|------|
| **pyRosetta 版** | 网络 → 距离/取向分布 → pyRosetta 组装全原子 | 显存低（>400 残基约 8GB），含侧链，CPU 后处理约 1 小时 |
| **端到端版** | 网络直接输出 Cα 坐标 | 更快，24GB 显存，骨架精度高；侧链需另一步 |

### 6. 蛋白-蛋白复合物

把链 A、链 B 的序列（及各自 MSA / template）拼成**多链输入**，中间用 chain break 隔开。网络在联合 MSA 里读 **跨链共进化**（inter-protein co-evolution），直接输出多条链在同一坐标系下的相对位置——相当于 **柔性对接** 内建在结构预测里。

论文在双链、三链复合物上达到 TM-score > 0.8 的案例不少；并演示了 **人 IL-12R/IL-12 四链复合物** 与 cryo-EM 密度吻合的模型。

### 7. 评价指标（零基础必知）

- **RMSD**：预测与实验结构对应原子的均方根偏差（Å），越小越好
- **TM-score**：0–1，>0.5 通常认为折叠拓扑正确，>0.8 非常准
- **lDDT**：局部距离差异检验，DeepAccNet 可逐残基估计可信度

## 代码示例 1：从 FASTA 理解 MSA 输入

RoseTTAFold 的第一步与 [[blast-altschul-1990]]、HHblits 同类：搜同源序列。下面用 Python 演示「MSA 矩阵」长什么样——**行是同源蛋白，列是对齐位置**：

```python
#!/usr/bin/env python3
"""极简 MSA 表示：理解 RoseTTAFold 的 1D 输入."""

from collections import Counter

# 查询序列（目标蛋白）
query = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDWSTPSELGHAGLNGDILVWNPVLEDAFELSSMGIRVDADTLKHQLALTGDENRAQKGAKIMLDIDGNCKQSDAKKYAGGLKEAQKK"

# 模拟 MSA：真实流程由 HHblits / JackHMMER 对 UniRef30 等数据库生成
msa_rows = [
    query,
    "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDWSTPSELGHAGLNGDILVWNPVLEDAFELSSMGIRVDADTLKHQLALTGDENRAQKGAKIMLDIDGNCKQSDAKKYAGGLKEAQKK",
    "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDWSTPSELGHAGLNGDILVWNPVLEDAFELSSMGIRVDADTLKHQLALTGDENRAQKGAKIMLDIDGNCKQSDAKKYAGGLKEAQKR",  # 末尾 K→R 突变
    "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDWSTPSELGHAGLNGDILVWNPVLEDAFELSSMGIRVDADTLKHQLALTGDENRAQKGAKIMLDIDGNCKQSDAKKYAGGLKEAQKQ",
]

def msa_depth(msa: list[str]) -> int:
    return len(msa)

def column_conservation(msa: list[str], col: int) -> float:
    """单列 Shannon 熵的粗代理：常见氨基酸占比越高，进化约束越强."""
    chars = [row[col] for row in msa if col < len(row)]
    if not chars:
        return 0.0
    top_freq = Counter(chars).most_common(1)[0][1] / len(chars)
    return top_freq

# RoseTTAFold 论文 fig.S2：MSA 越深，传统方法收益越大；
# 但 AF2/RoseTTAFold 对「浅 MSA」更鲁棒
print(f"MSA depth = {msa_depth(msa_rows)}")
for i in [0, 50, 100, 150]:
    if i < len(query):
        print(f"  col {i:3d} ({query[i]}) conservation ≈ {column_conservation(msa_rows, i):.2f}")
```

**读代码**：`msa_depth` 对应论文里「MSA 序列条数」；高保守列往往结构核心或功能位点。真实 RoseTTAFold 用最多约 1000 条同源序列（内存限制），论文还探索 Perceiver 结构以吃进 10000+ 条。

## 代码示例 2：从坐标计算距离图（2D Track 的监督信号）

2D 轨本质上学习 **残基对距离分布**。若有实验结构（PDB），可从 Cα 坐标直接算出「真值」距离矩阵，用于理解网络在预测什么：

```python
#!/usr/bin/env python3
"""从 PDB 式坐标构建 Cα 距离图 + 接触图阈值."""

import math

# 简化：每条残基只存 Cα 的 (x, y, z)，单位 Å
# 真实 PDB 解析可用 BioPython: Bio.PDB.PDBParser
ca_coords = [
    (12.1, 5.3, -1.2),
    (14.0, 6.1, 0.5),
    (16.2, 4.8, 1.1),
    (18.5, 6.0, 2.8),
    (20.1, 4.2, 4.0),
]

def ca_distance(ci: tuple[float, float, float], cj: tuple[float, float, float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(ci, cj)))

def distance_map(coords: list[tuple[float, float, float]]) -> list[list[float]]:
    n = len(coords)
    return [[ca_distance(coords[i], coords[j]) for j in range(n)] for i in range(n)]

def contact_map(dist_map: list[list[float]], threshold: float = 8.0) -> list[list[bool]]:
    """8 Å 是蛋白质领域常用的 Cβ/Cα 接触 cutoff（略简化）."""
    n = len(dist_map)
    return [[i != j and dist_map[i][j] < threshold for j in range(n)] for i in range(n)]

def bin_distance(d: float, bins: list[float]) -> int:
    """RoseTTAFold / AF2 的 distogram：把连续距离离散成直方图 bin."""
    for k, edge in enumerate(bins):
        if d < edge:
            return k
    return len(bins)

# AF2 风格距离 bin 上界（Å），共 64 档示例（真实实现见 supplement）
DIST_BINS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 30, 38]

dm = distance_map(ca_coords)
cm = contact_map(dm)

print("Cα–Cα distance map (Å):")
for row in dm:
    print("  " + " ".join(f"{d:5.1f}" for d in row))

print("\nContacts (< 8 Å):")
for row in cm:
    print("  " + " ".join("1" if c else "." for c in row))

i, j = 0, 4
print(f"\nPair (0,4): d={dm[i][j]:.2f} Å → bin={bin_distance(dm[i][j], DIST_BINS)}")
```

**读代码**：`distance_map` 是 2D 轨的「答案格式」之一；网络输出的是每个 \((i,j)\) 的 **bin 概率分布**（distogram），而非单点估计。3D 轨则进一步把分布折叠成一致的三维几何。

## 代码示例 3：TM-score 的直觉实现（评价复合物预测）

论文用 **TM-score** 判断复合物预测是否靠谱。下面给出简化版核心：按 **TM 长度归一化** 的距离得分（完整实现见 Zhang 组 TM-score 程序）：

```python
#!/usr/bin/env python3
"""TM-score 直觉：d0 随蛋白长度变化，短蛋白允许更大误差."""

import math

def d0_normalized(length: int) -> float:
    """经验公式：TM-score 标准定义中的长度相关尺度 d0(L)."""
    if length < 12:
        return 0.3
    if length < 16:
        return 0.4
    if length < 20:
        return 0.5
    if length < 24:
        return 0.6
    if length < 29:
        return 0.7
    if length < 35:
        return 0.8
    return 1.24 * (length - 15) ** (1 / 3) - 1.8

def tm_pair_score(dist: float, d0: float) -> float:
    """单对残基 TM 贡献：距离越小于 d0，得分越高."""
    return 1.0 / (1.0 + (dist / d0) ** 2)

# 假设已叠合（superimpose）后 5 个残基的 Cα 偏差（Å）
aligned_rmsd_per_residue = [1.2, 2.5, 0.8, 3.1, 1.9]
L = len(aligned_rmsd_per_residue)
d0 = d0_normalized(L)

tm_approx = sum(tm_pair_score(d, d0) for d in aligned_rmsd_per_residue) / L
print(f"L={L}, d0={d0:.2f} Å, approximate TM-score ≈ {tm_approx:.3f}")
print("论文阈值：TM-score > 0.5 通常拓扑正确；> 0.8 与实验非常接近")
```

## 三轨信息流动（一图读懂）

```text
                    ┌─────────────────────────────────────┐
                    │  输入：序列 + MSA +（可选）模板结构   │
                    └─────────────────┬───────────────────┘
                                      ▼
┌──────────────┐    双向更新     ┌──────────────┐    双向更新     ┌──────────────┐
│  1D Track    │ ◄────────────► │  2D Track    │ ◄────────────► │  3D Track    │
│  MSA 嵌入    │                │  距离/取向图  │                │  Cα 坐标     │
│  逐残基特征   │                │  残基对特征   │                │  SE(3) 等变  │
└──────────────┘                └──────────────┘                └──────────────┘
                                      │
                    ┌─────────────────┴───────────────────┐
                    ▼                                         ▼
            pyRosetta 全原子组装                          端到端 Cα 输出
            + DeepAccNet 可信度                           + 复合物多链坐标
```

## 论文中的典型应用（读图用）

1. **分子置换（MR）**：四个此前解不出的晶体数据集，用 RoseTTAFold 模型成功相位求解；trRosetta 模型失败——说明 **精度门槛** 对实验方法有决定性影响。
2. **cryo-EM**：PI3Kγ 复合物中 p101 GBD 结构，HHsearch 几乎无同源模板，RoseTTAFold 预测可填入低密度区，Cα-RMSD ~3 Å。
3. **疾病机制假说**：TANGO2（代谢病）、ADAM33 前结构域（哮喘相关）、CERS1（鞘脂代谢）——**无近缘 PDB 模板**时，全原子精度模型仍能定位活性位点与致病突变的空间后果。
4. **CAMEO 盲测**：2021 年 5–6 月 69 个中等/困难靶标上，RoseTTAFold 服务器优于 Robetta、SWISS-MODEL 等。

## 与 AlphaFold2 的异同（2021 视角）

| 项目 | AlphaFold2 | RoseTTAFold |
|------|------------|-------------|
| 轨道数 | 2D+1D → 再 Structure Module | **1D+2D+3D 全程三轨** |
| 开源 | 2021 年 7 月才部分公开 | **同期开源** + Robetta 服务器 |
| 推理算力 | 多 GPU、多日（报道） | **单卡 10–30 分钟** |
| CASP14 | 第一 | 第二梯队顶端，略低于 AF2 |
| 复合物 | AF2 初版侧重单体；后续 AF-Multimer | **论文即强调复合物端到端** |

二者共同依赖：**MSA 共进化 + 注意力 + 等变几何网络 + 端到端坐标监督**。差异主要在工程与架构细节，而非「是否用深度学习」。

## 踩过的坑（读论文 + 用工具时）

1. **MSA 质量决定上限**：浅 MSA（同源序列少）时，任何方法都会糊；论文 fig.S2 仍显示深度有帮助，只是 RoseTTAFold 比 trRosetta 更「耐浅」。
2. **crop 平均不是免费的午餐**：极长蛋白或域间柔性 linker 可能让不同 crop 预测不一致，需要检查 lDDT / pLDDT 类置信度图。
3. **端到端版侧链弱**：药物对接、突变效应分析常要全原子——优先 pyRosetta 管线或后续侧链打包（如 ProteinMPNN）。
4. **复合物训练偏置**：网络主要在**单体**上训练，复合物是零样本泛化；论文承认 paired MSA 条数影响跨链放置精度。
5. **别把预测当晶体**：TM-score 高仍可能有局部错误；关键位点应用突变实验或 cryo-EM 验证。

## 适用 vs 不适用

**适用**：

- 无近缘模板的新蛋白 / 新复合物，需要**可发表质量的起步模型**
- X 射线 MR 缺模型、cryo-EM 需先验骨架
- 大规模人类蛋白质组、GPCR、疾病突变位点的**结构假说生成**
- 教学：理解 MSA → 距离图 → 3D 的深度学习结构预测范式

**不适用**：

- 需要 **配体、糖基化、离子** 等修饰的精确几何（需专门力场或 AF3 类扩展）
- 本质无序蛋白（IDP）——单稳态结构假设不成立
- 膜蛋白在脂双层中的真实构象分布——预测通常是单一静态快照
- 不做任何 MSA 搜索就想秒出结果（流水线里 MSA 往往占 ~1.5 小时）

## 学到什么

1. **多表示联合推理** 比「串行流水线」更强：序列、对、坐标应互相约束，而非后处理补丁。
2. **共进化是免费的结构实验**：自然界通过进化实验已把距离信息编码在 MSA 统计里。
3. **开源 + 可部署算力** 与 **SOTA 0.01** 同样改变科学——RoseTTAFold 让结构预测从「DeepMind 专属」变成「实验室台式机日常」。
4. **复合物端到端** 重新定义了对接问题：搜索空间从 6 维刚体 × 构象空间，部分坍缩为「多链序列 → 联合折叠」。

## 延伸阅读

- 论文 PDF：[UW IPD 镜像](https://www.ipd.uw.edu/wp-content/uploads/2021/07/Baek_etal_Science2021_RoseTTAFold.pdf)
- 前置：**trRosetta**（Yang et al., PNAS 2020）— 从共进化到深度网络的直接前身
- 对照：**AlphaFold2**（Jumper et al., Nature 2021）
- 后续：**RFdiffusion**（蛋白设计）、**RoseTTAFold2 / RF2**（Baker 组迭代）
- 生物信息基础：[[blast-altschul-1990]]（序列搜索）、[[smith-waterman-1981]]（局部比对）
- 在线工具：[Robetta](https://robetta.bakerlab.org/)、[CAMEO](https://cameo3d.org/)（盲测排行榜）

## 自测题

1. 三轨分别存储什么信息？为何需要双向通信而非先 2D 后 3D？
2. 什么是 discontinuous crop？为何训练用 crop、推理却要拼回全长？
3. 蛋白-蛋白复合物预测为何需要 **paired MSA**？与传统对接相比省掉了哪一步？
4. pyRosetta 版与端到端版在显存、侧链、速度上如何权衡？
5. 若 TM-score = 0.45，应如何解读？下一步该做什么实验或计算？

---

*笔记版本：pipeline-v3 | 面向零基础读者 | 代码示例为教学简化，非 RoseTTAFold 官方实现*
