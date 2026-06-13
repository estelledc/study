---
title: LoMo — 局部模态替换与更深的视觉-语言融合
来源: https://arxiv.org/abs/2605.30265
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：同一段话，换张「纸」就不认识了

想象你在参加一场**开卷考试**。题目写在试卷上，你也看得懂；监考老师把**同一道题**打印成一张小图片贴在你旁边——语义完全一样，只是**信息载体**从「文字」变成了「像素」。

理想的多模态 AI 应该像真正理解题意的人：**不管题目是打字还是截图，答案都一样**。但现实里的 Vision-Language Model（VLM）往往做不到：把文字问题渲染成图片后，准确率会**断崖式下跌**。论文把这种现象叫做 **Carrier Sensitivity（载体敏感性）**——模型不是在理解语义，而是在**依赖「信息装在哪种模态里」**。

更糟的是，这种脆弱性不是随机的。论文测量「纯文本 hidden state」与「渲染成图后的 hidden state」之间的余弦距离，发现：**距离越大，换载体后的性能掉得越狠**（最近一组平均掉 7.75%，最远一组掉 21.23%）。

根因被归结为**训练数据的结构性偏置**：

| 常见数据集 | 文本的典型角色 | 图像的典型角色 |
|-----------|---------------|---------------|
| Image Caption | 描述目标（答案侧） | 被描述的场景 |
| VQA | 提问、指令 | 视觉证据 |
| OCR / 文档 | 问题或标签 | 文档页面 |
| 网页交错数据 | 导航、说明 | 插图、截图 |

文本长期扮演「**语言查询**」，图像长期扮演「**视觉参考**」——模型学会了**按模态分工取信息**，却没有学会「**同一语义在不同载体上应对齐**」。

2026 年 5 月，复旦大学 / 上海创新研究院 / 京东等团队发布 **LoMo: Local Modality Substitution for Deeper Vision-Language Fusion**（arXiv:[2605.30265](https://arxiv.org/abs/2605.30265)）。核心思路极其朴素：**不改模型结构，只在 SFT 数据里，把一段文字局部替换成它的渲染图**，逼模型在 `text → visual → text` 的交错序列里做真正的跨模态融合。

一句话：**LoMo 不是新架构，而是一份「数据侧处方」——用局部模态替换，把跨载体对齐写进标准 SFT 的监督信号里。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 全称 | **Lo**cal **Mo**dality Substitution |
| 类型 | 数据策展（data curation）范式，架构无关 |
| 机构 | 复旦大学、上海创新研究院、上海交大、中科大、京东等 |
| 代码 / 模型 | [Maplebb/LoMo](https://github.com/Maplebb/LoMo)（checkpoint 已释出，数据构造代码待发布） |
| 项目页 | [maplebb.github.io/LoMo](https://maplebb.github.io/LoMo/page/) |
| 验证骨干 | LLaVA-OneVision-1.5-8B、Qwen3.5-9B |
| 评测 | 13 个多模态 benchmark（推理、数学、事实性、指令遵循、文档 OCR、视觉感知） |

LoMo 的输入原本是**纯文本**的 `(问题 x, 答案 a)`；输出变成**图文交错**的 `(T(x), a)`，其中 `T(x) = (x_pre, I', x_suf)`，中间嵌入渲染图 `I'`，**监督目标 a 不变**。

---

## 为什么重要

### 1. 暴露了 VLM「假融合」的一面

很多 VLM 在标准 benchmark 上分数很高，但把问题文字截图喂进去就崩——说明融合停留在「**各读各的再拼接**」，而非「**语义级等价**」。这对 OCR、文档 QA、屏幕理解等「文字常以像素出现」的场景是致命伤。

### 2. 改数据比改结构更便宜

LoMo 声称：

- **零推理开销**（训练后推理流程不变）
- **无需额外标注**（复用原有 SFT 答案）
- **即插即用**（任何多模态 SFT pipeline 都能接）

在 LLaVA-OneVision-1.5-8B 上平均 **+2.68** 分，Qwen3.5-9B 上 **+2.82** 分（13 benchmark 均值）；在 **Rendered Evaluation**（整题渲染成图）下增益放大到 **+18.86 / +11.92**——说明它确实在修「载体敏感」这个根问题。

### 3. 给「模态鸿沟」提供了可操作的度量

论文用两个内部指标交叉验证：

- **MIR（Modality Integration Rate）**：各层 visual / text token 隐状态分布的 Fréchet 距离均值，**越低越好**
- **Pairwise Cross-Modal Distance**：同一语义下文本与渲染图的平均 hidden state 余弦距离 `d = 1 - cos(h̄_text, h̄_img)`，**越低越好**

LoMo 训练后 MIR 额外降低 0.122，配对距离从 0.57 降到 0.49；Standard SFT 反而把配对距离从 0.52 **推远**到 0.57——常规 SFT 在强化「文本问、图像答」的分工，LoMo 在拉近等价载体。

---

## 核心概念

### 1. Carrier Sensitivity（载体敏感性）

**定义**：语义内容不变，仅把承载方式从 token 换成 pixel（或反之），模型输出质量显著变化。

**诊断实验**：Rendered Evaluation——把整段文字问题渲染成一张图，与原 `(图像, 文字问题)` 对比。主流 VLM 在此协议下普遍大跌。

### 2. 三阶段流水线 T(x)

LoMo 把变换算子分解为三步：

```text
x  ──S()──► (x_pre, x_mid, x_suf)     # 结构感知选段
x_mid ──R()──► 渲染图 I               # 内容感知渲染
I ──A()──► I'                         # 感知扰动
T(x) = (x_pre, I', x_suf)             # text → visual → text
```

| 阶段 | 符号 | 做什么 |
|------|------|--------|
| Structure-Aware Span Localization | S | 公式感知分块，取**中间 1/3** 作为 x_mid；短文本整段替换 |
| Visual Rendering | R | 含公式 → LaTeX 渲染器；纯文本 → 普通文本渲染；失败自动 fallback |
| Perceptual Distortion | A | 随机施加旋转、模糊、阴影/污渍、波浪形变，模拟扫描/拍照退化 |

**为什么选中间段？** 消融显示 Middle（text-image-text）优于 Prefix/Suffix/Multi-Span：渲染块被**两侧文本夹住**，模型必须跨载体整合上下文才能答对——对齐从「可选优化」变成「**任务必要条件**」。

### 3. 隐式跨模态对齐监督

标准 SFT 优化 `-log p(a | x)`。LoMo 额外优化 `-log p(a | T(x))`。论文推导在期望意义下，多出来的项等价于拉近两个载体下预测分布的 **KL 散度**——**不用改 loss 公式，改数据形态就注入了 cross-carrier alignment 信号**。

### 4. 关键超参：Rewrite Ratio

在 LLaVA-OneVision-1.5-8B 上，把**纯文本样本**中一定比例改写为 LoMo 交错样本：

| Rewrite Ratio | 平均准确率 | Δ vs Standard SFT |
|---------------|-----------|-------------------|
| 0% | 40.88 | — |
| 25% | 42.90 | +2.02 |
| **50%** | **43.56** | **+2.68** |
| 75% | 43.24 | +2.36 |
| 100% | 42.68 | +1.80 |

50% 左右最优——太少对齐信号不够，太多则纯文本能力被稀释。

### 5. 与相关路线的区别

| 路线 | 代表 | 目标 |
|------|------|------|
| Text-as-Pixels 效率派 | DeepSeek-OCR、Glyph | 用像素**压缩**上下文、省 token |
| 解码/偏好对齐 | VCD、HA-DPO | 推理或 RL 阶段减幻觉 |
| **LoMo** | 本篇 | 在**同一条训练样本**里让 text-token 与 text-pixel **语义对齐** |

---

## 实验结果速览

### Standard Evaluation（常规：图 + 文字问题）

- LLaVA-OV1.5-8B：**40.88 → 43.56**（+2.68）
- Qwen3.5-9B：**54.43 → 57.25**（+2.82）
- 涨幅集中在：指令遵循（MM-IFEval）、视觉感知（CountBench、V*）、文档 OCR（DocVQA）

### Rendered Evaluation（问题也渲染成图）

- LLaVA：**15.24 → 34.10**（+18.86）
- Qwen3.5：**43.26 → 55.18**（+11.92）
- Qwen3.5 上 Standard→Rendered 的性能落差：Standard SFT **-11.17**，LoMo 仅 **-2.07**

### 组件消融（LLaVA-OV1.5-8B）

| 变体 | 平均 | 说明 |
|------|------|------|
| Standard SFT | 40.88 | 基线 |
| Full-Text Rendering | 42.07 | 整题渲染，无选段/扰动，增益有限 |
| LoMo w/o PD | 43.10 | 去掉感知扰动仍 +2.22 |
| **LoMo 完整** | **43.56** | 选段是主因，扰动再 +0.46 |

---

## 代码示例

### 示例 1：LoMo 数据变换的最小 Python 骨架

下面代码演示论文公式 (1)(2) 的逻辑：**选段 → 渲染 → 扰动 → 拼回交错序列**。渲染器用 Pillow 占位，生产环境应换 LaTeX / 专用文本渲染管线。

```python
from dataclasses import dataclass
from typing import Tuple
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

@dataclass
class LoMoSample:
    prefix: str
    image: Image.Image
    suffix: str
    answer: str

def structure_aware_span_localization(text: str) -> Tuple[str, str, str]:
    """S(·): 公式感知分块的简化版——按块取中间 1/3。"""
    blocks = text.split("\n\n") if "\n\n" in text else [text]
    if len(blocks) <= 2:
        return "", text, ""
    n = len(blocks)
    start = n // 3
    end = max(start + 1, 2 * n // 3)
    pre = "\n\n".join(blocks[:start])
    mid = "\n\n".join(blocks[start:end])
    suf = "\n\n".join(blocks[end:])
    return pre, mid, suf

def render_text_span(span: str, width: int = 640, height: int = 128) -> Image.Image:
    """R(·): 纯文本渲染；含 $...$ 或 \\frac 时应路由到 LaTeX 渲染器。"""
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()
    draw.text((10, 10), span[:500], fill="black", font=font)
    return img.crop(img.getbbox())  # 裁掉空白边距

def perceptual_distortion(img: Image.Image) -> Image.Image:
    """A(·): 随机施加一种语义保持的退化。"""
    op = random.choice(["none", "blur", "rotate"])
    if op == "blur":
        return img.filter(ImageFilter.GaussianBlur(radius=2))
    if op == "rotate":
        return img.rotate(random.choice([5, -5, 15, -15]), expand=True, fillcolor="white")
    return img

def lomo_transform(question: str, answer: str) -> LoMoSample:
    x_pre, x_mid, x_suf = structure_aware_span_localization(question)
    rendered = render_text_span(x_mid)
    distorted = perceptual_distortion(rendered)
    return LoMoSample(prefix=x_pre, image=distorted, suffix=x_suf, answer=answer)

# 用法
raw_q = "Given the chart, compute the area.\n\nFormula: A = π r² with r = 3.\n\nAnswer in cm²."
sample = lomo_transform(raw_q, answer="28.27")
# 训练时构造: [x_pre tokens] + [image tokens] + [x_suf tokens] → 监督仍为 answer
print(sample.prefix, sample.suffix, sample.answer)
```

### 示例 2：构造 VLM 训练消息 + 评测「载体敏感」

用 Hugging Face 多模态消息格式，把 LoMo 样本喂给 LLaVA / Qwen 类模型；同时演示 **Rendered Evaluation** 探针。

```python
def to_training_messages(sample: LoMoSample, scene_image_path: str) -> list:
    """交错样本：场景图 + 前缀文本 + 渲染块图 + 后缀文本。"""
    content = []
    if scene_image_path:
        content.append({"type": "image", "image": scene_image_path})
    if sample.prefix.strip():
        content.append({"type": "text", "text": sample.prefix.strip()})
    content.append({"type": "image", "image": sample.image})  # 局部替换的视觉载体
    if sample.suffix.strip():
        content.append({"type": "text", "text": sample.suffix.strip()})
    return [
        {"role": "user", "content": content},
        {"role": "assistant", "content": [{"type": "text", "text": sample.answer}]},
    ]

def rendered_eval_probe(full_question: str, scene_image_path: str) -> list:
    """Rendered Evaluation：整题渲染成一张图，测 carrier sensitivity。"""
    q_img = render_text_span(full_question, width=800, height=400)
    return [
        {"role": "user", "content": [
            {"type": "image", "image": scene_image_path},
            {"type": "image", "image": q_img},  # 文字问题变成像素
        ]},
    ]

def pairwise_cross_modal_distance(h_text, h_img) -> float:
    """论文 Eq.(7): 1 - cos(h̄_text, h̄_img)，用于分析对齐程度。"""
    import torch
    h_text = h_text / h_text.norm()
    h_img = h_img / h_img.norm()
    return float(1 - torch.dot(h_text, h_img))
```

训练时：**50% 左右的纯文本 SFT 样本**走 `lomo_transform`，其余保持原样；loss 仍是标准 next-token prediction，无需自定义对齐 loss。

---

## 实现要点与踩坑

1. **选段比整段渲染重要**：Full-Text Rendering 几乎只带来 +1.19，Middle 交错结构才是 +2.68 的主因。
2. **LaTeX 路由不能省**：数学题走 LaTeX 渲染，失败要有 fallback，否则吞吐和数据质量双崩。
3. **扰动模拟真实文档**：扫描倾斜、模糊、折痕——让模型对齐的是**语义**，不是「干净截图的字形」。
4. **Rewrite Ratio 有饱和点**：50% 左右最佳；100% 反而掉分，纯文本推理能力受损。
5. **增益不只是「多看了几张图」**：把 image:text 比例强行配平到 1:1，LoMo 仍 +2.45——关键在**交错跨载体**，不是样本计数。

---

## 局限与开放问题

- **数据构造代码尚未完全开源**（截至 2026-06，GitHub TODO 仍含 construction / training scripts）。
- **渲染风格域**：字体、排版、语言（中文 vs 英文）变化可能带来新偏置。
- **整题 Rendered Eval 仍非满分**：LoMo 大幅缓解但未消除载体敏感，说明对齐仍是长期课题。
- **与 RL / DPO 的叠加效果**：论文聚焦 SFT 数据侧，与偏好优化、推理时干预如何组合尚待探索。

---

## 与本文库其他条目怎么读

- 先读 [Qwen2-VL](/papers/qwen2-vl-2024)：理解现代 VLM 如何把图像 token 接进 LLM。
- 再读 [Flash Attention](/papers/flash-attention)：长文档 + 多图交错时，注意力算力是工程底座。
- LoMo 补的是**训练数据几何**：同样 ViT–LLM 骨架，换 SFT 样本形态就能改变模态融合深度。

---

## 自测题

1. **Carrier Sensitivity** 和普通的 domain shift 有何不同？
2. 为什么 LoMo 选「中间 1/3」而不是开头或结尾？
3. Standard SFT 为何会把 pairwise cross-modal distance **越训越大**？
4. 若只有 10% 纯文本 SFT 数据，Rewrite Ratio 50% 意味着什么？
5. LoMo 与 DeepSeek-OCR 类「text-as-pixels 压缩」目标有何本质区别？

<details>
<summary>参考答案（先自己想）</summary>

1. Carrier Sensitivity 强调**语义等价**下仅换载体；domain shift 通常连语义分布都变。
2. Middle 形成 text–image–text，模型必须融合两侧文本与中间视觉块才能恢复完整语义；Prefix/Suffix 允许「单模态猜答案」。
3. 常规数据里文本负责 query、图像负责 evidence，SFT 可完成任务而**不必**对齐等价文本与渲染图；LoMo 把对齐变成答题必要条件。
4. 约 5% 总样本被 LoMo 改写（10%×50%），其余 95% 保持原协议——实际比例需按「纯文本子集」而非全量算。
5. OCR/压缩路线用像素**替代** token 省长度；LoMo 在同一样本里让两种载体**共存并对齐**，服务融合而非压缩。

</details>

---

## 引用

```bibtex
@article{han2026lomo,
  title={LoMo: Local Modality Substitution for Deeper Vision-Language Fusion},
  author={Han, Feng and Zhang, Zhixiong and Liang, Zheming and Wang, Yibin and Wang, Jiaqi},
  journal={arXiv preprint arXiv:2605.30265},
  year={2026}
}
```

---

## 延伸阅读

- 论文 HTML：[arXiv:2605.30265v1](https://arxiv.org/html/2605.30265v1)
- 项目页：[maplebb.github.io/LoMo](https://maplebb.github.io/LoMo/page/)
- 代码 / Checkpoint：[github.com/Maplebb/LoMo](https://github.com/Maplebb/LoMo)
- MIR 指标原文：Huang et al., 2024（Modality Integration Rate）
