---
title: SchGen PCB — 把一句需求变成可编辑电路原理图
来源: 'Qinpei Luo, Ruichun Ma, Xinyu Zhang, Lili Qiu, "SchGen: PCB Schematic Generation with Semantic-Grounded Code Representations", arXiv 2026'
日期: 2026-05-29
分类: machine-learning
难度: 中级
---

## 是什么

SchGen 是一个把自然语言需求生成 PCB 原理图的模型。日常类比：你对装修师傅说“这里要一个带开关的灯”，师傅不能只画一张漂亮效果图，还得把电线、开关、火线零线真的接对。

PCB 原理图也是这样。用户说“我想要一个 1.8V 稳压模块，带测试点和可关闭的 LED 指示灯”，模型需要输出能在 KiCad 里打开、编辑、检查的原理图，而不是一张看起来像电路的图片。

这篇论文的核心不是“换一个更大的模型”，而是把原理图改写成更适合 LLM 生成的代码表示：相对位置放元件，用引脚名字连线，再训练一个 20B 模型。

## 为什么重要

不理解 SchGen，下面这些事都没法解释：

- 为什么“让 AI 画电路图”比“让 AI 写一段 Verilog”难很多：原理图同时要求元件、位置、连线、可读布局。
- 为什么直接生成 KiCad 文件效果差：原始文件有大量工具版本、坐标、样式元数据，模型容易写出不可解析的格式。
- 为什么图片生成不够用：图片不能直接进入 ERC、网表、PCB layout 等后续工程流程。
- 为什么表示法设计会压过模型大小：SchGen 20B 微调后，在多项指标上超过更大的通用模型。

## 核心要点

1. **任务定义**：输入是用户的功能需求，输出是可编辑原理图。类比：不是写“菜谱描述”，而是给出厨师能照着做的步骤和配料清单。

2. **表示法设计**：SchGen 用一组 Python 编辑原语表示画图动作。类比：把“在纸上精确画线”改成“放一个插座、把火线接到 L 脚”。

3. **数据管线**：论文从开源硬件设计里收集参考图，经多模态模型草绘、人类修正、再转成代码。类比：先让助理临摹，再由老师批改，最后整理成练习册。

这三个点连在一起看，SchGen 的贡献不是单点技巧，而是把“需求、表示、数据、验证”串成闭环。

## 实践案例

### 案例 1：用相对坐标摆元件

> 下面是论文里的 schematic API 示意，不是标准 Python 库；要配合 SchGen/KiCad 自定义接口才能执行。

```python
center_x, center_y = 120, 105
add_schematic_symbol("Regulator_Linear", "AP2112K-1.8",
                     center_x, center_y, "U1", "AP2112K-1.8", 0, "None")
add_schematic_symbol("Device", "C",
                     center_x - 20, center_y - 5, "C1", "1uF", 0, "None")
```

**逐部分解释**：

- `center_x, center_y` 先定一个中心元件的位置，像先把主桌放好。
- 电容位置写成 `center_x - 20`，表示“在主元件左边一点”，比死记全局坐标更稳定。
- 这就是论文说的 relative placement，降低模型做空间推理的负担。

### 案例 2：用引脚名字连线

```python
connect_pins("U1", "VOUT", "#PWR_1V8", "+1V8")
connect_pins("U1", "VIN", "U1", "EN")
connect_pins("C1", "2", "#PWR_GND", "1")
```

**逐部分解释**：

- `VOUT`、`VIN`、`EN` 是有语义的引脚名，模型知道它们代表输出、输入、使能。
- 连接的是“哪个元件的哪个脚”，不是“从坐标 A 画到坐标 B”。
- 论文的 Code-L3 去掉引脚名后，连线错误明显增加，说明语义比几何坐标更关键。

### 案例 3：把用户需求变成训练样本

```json
{
  "request": "I want a 1.8V regulated supply from VIN...",
  "code": "add_schematic_symbol(...); connect_pins(...);",
  "check": "KiCad ERC passes and netlist matches reference"
}
```

**逐部分解释**：

- `request`：训练管线里的用户提示（简短版/详细版），对应“需求输入”。
- `code`：同一条样本的可执行编辑程序，跑完能生成 KiCad schematic。
- `check`：外部验收——KiCad ERC、网表对照、专家功能判断，不是纯文本相似度。

这类样本最适合监督微调，因为答案既能被模型学习，也能被外部工具执行。

## 踩过的坑

1. **把原理图当图片生成**：图片看起来像电路，但不能被 KiCad 编辑，也不能导出可靠网表。

2. **把 KiCad 原始文件当普通文本**：文件里混着大量版本和几何细节，模型会在格式上摔跤，导致工具打不开。

3. **只看元件不看引脚**：PCB 正确性由 pin-to-pin 连接决定，同一个芯片接错一个脚就可能整板失效。

4. **以为更大模型自动解决空间问题**：实验里大模型也受表示法影响，说明“怎么表达任务”本身就是能力来源。

## 适用 vs 不适用场景

**适用**：

- 从自然语言生成**单页、元件数常见 ≤30–50** 的稳压/接口类原理图草案。
- 需要可编辑、可检查、能导出网表的硬件设计流程。
- 教学或原型阶段，让初学者先得到一份结构化起点。
- 研究“表示法如何影响 LLM 生成质量”的机器学习问题。

**不适用**：

- 直接替代资深硬件工程师做量产级审图。
- **跨多页、数百元件**或强约束系统级原理图。
- 只靠 SPICE 仿真验证整板功能，因为很多 PCB 是系统级混合域设计。
- 需要完整考虑封装、布局、走线、EMI、热设计等后续 PCB 约束。

## 历史小故事（可跳过）

- **2023 年前后**：LLM 开始用于 Verilog、VHDL 等数字电路代码生成，任务有成熟文本表示。
- **2024-2025 年**：模拟电路和 CAD 生成研究增多，但多依赖图结构、拓扑或参数化 CAD 序列。
- **2026 年初**：PCBSchemaGen 探索约束引导的 PCB 原理图生成，但规模较小且绕开了一部分布局难题。
- **2026 年**：SchGen 把自然语言到可编辑 PCB schematic 定义成新任务，并强调表示法、数据、验证三件事一起做。

## 学到什么

1. **原理图生成的本质是语义匹配，不只是画线**：模型要知道 VCC、GND、TXD、EN 这些名字背后的功能。

2. **好表示法能把难题换一种形状**：相对坐标和 pin-name wiring 把绝对几何问题变成更像程序编辑的问题。

3. **数据质量来自人机协作**：多模态模型能快速临摹，人类工程师负责修正关键错误，最后再转成训练代码。

4. **评价要贴近工程后果**：有效电路率、空间重叠、网表准确率、专家功能判断，比单纯文本相似度更有意义。

5. **人类仍在安全链路里**：论文明确说复杂 PCB 还需要工程师审查，AI 更像起草助手。

## 延伸阅读

- 论文 PDF：[SchGen: PCB Schematic Generation with Semantic-Grounded Code Representations](https://arxiv.org/pdf/2605.30345v1.pdf)
- 相关论文：[PCBSchemaGen: Constraint-Guided Schematic Design via LLM for Printed Circuit Boards](https://arxiv.org/abs/2602.00510)
- 相关论文：[OmniSch: A Multimodal PCB Schematic Benchmark For Structured Diagram Visual Reasoning](https://arxiv.org/abs/2604.00270)
- 工具背景：[KiCad 官方网站](https://www.kicad.org/)
- [[codellama-2023]] —— 代码模型让“生成可执行表示”成为通用路线
- [[deepseek-coder-2024]] —— 代码 LLM 的能力边界会影响这类工具式生成任务
- [[gpt-oss-2025]] —— SchGen 选择 GPT-oss-20B 作为可微调基座

## 关联

- [[attention]] —— LLM 需要在长代码和元件关系里追踪依赖。
- [[cot]] —— 论文用蒸馏推理步骤扩充训练数据，帮助模型先想连接逻辑。
- [[lora]] —— SchGen 在 GPT-oss-20B 上用 LoRA 做监督微调。
- [[codellama-2023]] —— 同样强调把任务变成代码生成，方便执行和检查。
- [[deepseek-coder-2024]] —— 代码模型越强，越适合生成结构化工具调用。
- [[omni-sch]] —— 合理预测的后续笔记，可补 PCB schematic 视觉理解基准。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kicad]] —— KiCad — 电子电路 CAD
