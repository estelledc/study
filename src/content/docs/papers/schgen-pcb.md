---
title: SchGen — 用自然语言生成 PCB 原理图（零基础学习笔记）
来源: https://arxiv.org/abs/2605.30345
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：菜谱 vs 厨房平面图坐标

你想做一块「带 USB 供电、3.3V 稳压、状态 LED」的小板子。对工程师来说，第一步不是画 PCB 铜箔，而是画**原理图（schematic）**：选芯片、电阻、电容，用线把引脚连对——相当于写一份**电路菜谱**。

传统 EDA 工具（KiCad、Altium 等）保存原理图时，文件里塞满了：

- 工具版本号、图层、字体、线宽等**装修细节**；
- 每个符号的**绝对坐标**（像「冰箱距厨房左墙 157.48 cm」）；
- 导线用一串折线点描述几何形状。

若你把这份原始文件直接丢给大模型生成，就像让 AI **背整张建筑平面图坐标**来画厨房——格式稍错就打不开，连线更容易画歪。

微软与 UCSD 等作者在 2026 年论文 **SchGen: PCB Schematic Generation with Semantic-Grounded Code Representations**（arXiv:[2605.30345](https://arxiv.org/abs/2605.30345)）里换了一种说法：

> 别背坐标，改说**编辑步骤**：先放稳压芯片 U1，在 U1 左边 20 格放输入电容，用 `connect_pins` 把 `VIN` 接到 `U1.VIN`。

把「几何预测」变成「语义匹配」——这正是 LLM 擅长的序列生成。开源实现见 [microsoft/SchGen](https://github.com/microsoft/SchGen)。

一句话：**硬件原理图生成，瓶颈往往不在模型大小，而在有没有 LLM 吃得下的表示（representation）。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 任务 | 自然语言需求 → 可编辑 KiCad 原理图 |
| 模型 | 基于 **GPT-oss-20B** 监督微调 + LoRA 的 **SchGen** |
| 核心表示 | **Code-L1**：语义接地代码 API（相对坐标 + 引脚名连线） |
| 数据集 | 2105 张原理图 / 1390 种设计；含简洁与详细两种用户请求 + CoT |
| 主要来源 | SparkFun 等开源硬件（CC BY-SA 4.0）+ GitHub KiCad 项目（泛化测试） |
| 下游 | 生成 `.kicad_sch` → 导出 **netlist** → PCB 布局与制造 |

论文声称这是首个从自然语言生成**可编辑 PCB 原理图**的专用 LLM，并系统比较了多种表示与前沿通用模型的差距。

---

## 为什么重要

### 1. PCB 原理图仍是硬件创新的「第一道门」

几乎所有电子设备都依赖 PCB。原理图决定器件清单与电气连接（netlist），后续布局、布线、打样都建立在它之上。这一步至今高度依赖人工与领域经验，自动化程度远低于数字 IC 的 Verilog 生成或部分模拟电路拓扑搜索。

### 2. 现有表示对 LLM 不友好

论文对比三类常见路线（见图 2 概念）：

| 表示 | 问题 |
|------|------|
| **原始 KiCad 文本** | 冗长 s-expression、元数据多；Valid Circuits 仅 ~32% |
| **纯图像生成** | 不可编辑、符号扭曲、难转 netlist |
| **SKiDL 等代码 netlist** | 跳过可视化原理图，工程师难以审阅 |

SchGen 的目标是在「可读原理图」与「可学习文本」之间搭桥。

### 3. 表示设计 > 盲目堆参数

实验里 **20B 的 SchGen** 在连线准确率、专家功能正确率上超过用同样 API 提示的 **GPT-5.2** 等更大模型——说明**领域数据 + 合适抽象**可以弥补规模差距。

---

## 核心概念

### 1. PCB 原理图三要素（KiCad 语境）

1. **元件符号（symbol）**：MCU、电阻、电容、连接器等，每个有多个 **pin（引脚）**。
2. **电源符号 / 网络标签（power / net label）**：如 `VCC`、`GND`；同名标签在电气上视为相连。
3. **导线（wire）**：在引脚之间建立连接；最终导出 **netlist**（谁与谁同网）。

人类画图的顺序通常是：**选件 → 摆放 → 连线**。SchGen 的 API 刻意模仿这一编辑流程。

### 2. 语义接地代码 API（Code-L1）

五个核心原语（论文 §3.1）：

```python
def add_schematic_symbol(symbol_lib, symbol_name, x, y, ref, value, rotation, mirror)
def add_label(label_pos, label_text, label_ref, label_type, text_orient)
def get_pin_location(symbol_ref, pin_name)
def connect_pins(symbol_a, pin_a, symbol_b, pin_b)
def write_out_all_wires()
```

设计要点：

- **相对坐标**：以每个功能块的「中心元件」为锚点，其他元件写 `center_x + (-20)` 这类偏移，减轻 LLM 记绝对像素的压力。
- **引脚名连线**：`connect_pins("#PWR1", "VIN", "U1", "VIN")` 用语义名匹配，而不是 `add_new_wire([99.06, 117.29], ...)` 画折线。
- **批量布线**：所有 `connect_pins` 登记完后，由 `write_out_all_wires()` 统一自动走线并写出 KiCad 文件。

### 3. 三种代码表示消融（Table 1）

| 代号 | 含义 | 相对坐标 | 引脚名连线 |
|------|------|----------|------------|
| **Code-L1** | SchGen 采用 | ✓ | ✓ |
| **Code-L2** | 去掉相对坐标 | ✗（绝对坐标） | ✓ |
| **Code-L3** | 再去掉引脚名 | ✗ | ✗（坐标画线段） |

论文用 MDL、LZ 复杂度、验证损失说明 **L1 更可压缩、更易学**；实验上 L3 的 netlist Jaccard 暴跌（~15%），说明**连线语义**是关键。

### 4. 数据集构建：Agent 描摹 + 人工校对

开源硬件网上常只有原理图**图片**，没有可编辑源文件。流水线（§3.2）：

```text
参考原理图图片
  → 多模态 LLM（如 GPT-5）按 API 写 Python，执行得反馈
  → 迭代修正语法/非法符号
  → 人工工程师对齐连线（LLM 难判「相交」vs「真正连接」）
  → schematic-to-code 反向转换，生成 Code-L1 训练样本
  → 再由 LLM 根据图像 + netlist 合成「简洁 / 详细」用户请求 + CoT
```

平均每个设计验证对齐 <20 秒，远低于从零手画数分钟——这是规模数据集（8420 条增广样本）的前提。

### 5. 训练与推理

- 基座：**GPT-oss-20B**（Apache-2.0），**LoRA** 监督微调。
- 数据增强：两种请求风格 × 两种 CoT 来源（GPT-oss-120B 与 20B 自蒸馏）。
- 推理：用户自然语言 → SchGen 输出 Python → 执行 → `.kicad_sch`。

---

## 代码示例 1：最小稳压块（Code-L1 风格）

下面综合论文附录 Listing 1，展示**锚点 + 相对放置 + 引脚名连接**（教学用缩写，非完整库导入）：

```python
# 功能块 1：AP2112K-1.8 线性稳压
center_x_1, center_y_1 = 120, 105

add_schematic_symbol(
    symbol_lib="Regulator_Linear",
    symbol_name="AP2112K-1.8",
    pos_x=center_x_1,
    pos_y=center_y_1,
    reference="U1",
    value="AP2112K-1.8",
    rotation=0,
    mirror="None",
)

# 相对 U1 放置输入电源、去耦电容、地
add_schematic_symbol(
    symbol_lib="power", symbol_name="VAA",
    pos_x=center_x_1 + (-20), pos_y=center_y_1 + 5,
    reference="#PWR1", value="VIN", rotation=0, mirror="None",
)
add_schematic_symbol(
    symbol_lib="Device", symbol_name="C",
    pos_x=center_x_1 + (-20), pos_y=center_y_1 + (-5),
    reference="C1", value="1uF", rotation=0, mirror="None",
)

# 语义连线：电源 → 芯片 → 输出轨
connect_pins("#PWR1", "VIN", "U1", "VIN")
connect_pins("U1", "VOUT", "#PWR_1V1", "+1V8")
connect_pins("U1", "VIN", "U1", "EN")  # 使能脚接输入

write_out_all_wires()  # 导出 KiCad 并做基础自动布线
```

读这段代码时，你应能**不看坐标**就理解电气意图——这正是 SchGen 想让模型学到的技能。

---

## 代码示例 2：用户请求 → SchGen 推理（仓库 CLI 概念）

官方仓库典型用法（见 [microsoft/SchGen](https://github.com/microsoft/SchGen) README）：

```bash
# 环境：KiCad、Python 依赖、Hugging Face 上的 microsoft/SchGen 权重
export PROJECT_PATH=/path/to/SchGen

python schematic_generation/generate.py \
  --prompt "Design a 3.3V LDO regulator with input capacitor, \
enable tied to VIN, and a test point on the output rail." \
  --output ./schematic_generation/generated.py

# 执行生成的表示代码 → 得到可编辑原理图
python ./schematic_generation/generated.py
```

模型内部流程可概括为：

```text
自然语言 prompt
  → SchGen（CoT + Code-L1 Python）
  → 执行 API（add_schematic_symbol / connect_pins / ...）
  → write_out_all_wires()
  → 有效 .kicad_sch + netlist
```

若 Python 抛错（引脚名不存在、reference 重复）或 KiCad **ERC** 报短路/非法连接，则该样本在 **Valid Circuits** 指标下计为失败。

---

## 评估指标（读论文结果用）

| 指标 | 含义 | SchGen (Code-L1) 约值 |
|------|------|------------------------|
| **Valid Circuits** | 代码可执行且 KiCad ERC 无严重错误 | **82%** |
| **Spatial Violation** | 符号/标签/线重叠（可读性代理） | ~7.7（加权） |
| **Netlist Jaccard** | 生成与真值 netlist 的集合相似度 | **~49%** |
| **Expert Functional Correctness** | 两位专家抽检能否按意图工作 | **60.5%** |

对比亮点（Table 2–3）：

- 原始 **KiCad 文件**微调：Valid **32%**，功能正确 **3%**。
- **Code-L3**（无引脚名连线）：功能正确仅 **6%**。
- 去掉 **CoT**：Valid 从 82% 降到 **53%**。
- 同 API 提示下 **GPT-5.2** 功能正确 **50%**，仍低于 SchGen。

GitHub 外分布测试（988 样本）：SchGen netlist Jaccard **40.65%**，与 GPT-5.2 **40.64%** 持平，说明有一定泛化，但复杂 unseen 设计仍是难点。

---

## 与相关工作的关系

```text
数字 IC：Verilog/VHDL + LLM（ChatEDA、VeriGen 等）
模拟 IC：图生成 / Python 拓扑（CktGNN、AnalogCoder）
PCB 布局布线：强化学习、启发式（与原理图阶段不同）
原理图图像 → netlist：Netlistify、Image2Net（逆向，非端到端生成）
SKiDL：Python 写 netlist，跳过可视化原理图
SchGen：自然语言 → 可编辑原理图（正向生成 + 语义代码表示）
```

SchGen 填补的是「**系统级混合器件原理图** + **自然语言意图**」这一空白；它不做 SPICE 级仿真验证（器件太杂），而用 netlist 与专家 rubric 作代理指标。

---

## 局限与工程现实

论文结论部分坦诚：

1. **数据域**：训练以 SparkFun 类结构化设计为主，超复杂工业板仍缺数据与模型能力。
2. **高级约束**：差分对、阻抗控制、企业级 ERC 规则尚未建模。
3. **人工闭环**：量产前仍需工程师审图；Agent 描摹阶段也要人修连线。
4. **安全**：错误原理图可能导致硬件损坏——生成式 EDA 必须默认「建议稿」，非「签发稿」。

---

## 学习路径建议（零基础）

1. **先摸 KiCad**：理解 symbol、pin、net label、ERC、导出 netlist（无需会布局）。
2. **读 Code-L1 附录 Listing 1**（论文 §6.1）：对照一张简单 LDO + LED 图看 API 如何复现。
3. **克隆 SchGen 仓库**：跑通 `generate.py` + 执行 `generated.py`，在 KiCad 里打开结果。
4. **做表示实验**：同一 prompt 让通用 LLM 输出 Code-L2/L3 或 raw KiCad，对比可执行率。
5. **延伸阅读**：PCBSchemaGen（反馈迭代）、Schemato（netlist→schematic 逆向）对照理解正反方向。

---

## 自测题

1. 为什么论文认为「引脚名连线」比「坐标画线段」对 LLM 更友好？
2. Code-L1 里「中心符号 + 相对偏移」解决的是什么认知负担？
3. Valid Circuits 的两道关卡分别检查什么？
4. 若 netlist Jaccard 高但专家功能正确率低，可能说明什么问题？
5. Agentic sketch 阶段为什么仍需要人工校对？

<details>
<summary>参考答案（先自己想）</summary>

1. 引脚名携带电气语义（VIN、GND），模型做符号匹配即可；坐标线段要求精确几何与拓扑推理，错误率高。  
2. 减轻绝对坐标记忆与长数字序列生成负担，布局变成「相对功能邻居」的局部推理。  
3. (1) Python 无运行时错误；(2) KiCad ERC 无短路等严重电气规则违规。  
4. netlist 可能「连对线但器件选型/值/模块级功能」仍错；或评测集合与专家标准不一致。  
5. 多模态 LLM 难区分导线交叉与真正电气连接；自动描摹会有拓扑错误，需人对齐参考图。  

</details>

---

## 参考资料

- 论文：[arXiv:2605.30345](https://arxiv.org/abs/2605.30345) — *SchGen: PCB Schematic Generation with Semantic-Grounded Code Representations*（Luo, Ma, Zhang, Qiu, 2026）
- 代码：[microsoft/SchGen](https://github.com/microsoft/SchGen)
- 模型权重：Hugging Face `microsoft/SchGen`
- EDA 背景：[KiCad](https://www.kicad.org/) 文档 — schematic / netlist / ERC
