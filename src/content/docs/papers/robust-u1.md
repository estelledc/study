---
title: Robust-U1 — 让多模态模型自己修复损坏的图片
来源: https://arxiv.org/abs/2606.08063
日期: 2026-06-13
分类: 机器学习
子分类: 多模态
provenance: pipeline-v3
---

# Robust-U1：让多模态模型自己修复损坏的图片

## 一、从一个日常场景说起

想象你在看一张照片：因为下雨，镜头上沾满了水珠，照片变得模糊不清。但即使画面模糊，你依然能看出照片里是一辆左转的汽车。这是怎么做到的？

你的大脑其实在做一件了不起的事：**一边"脑补"出原本清晰的画面，一边基于这个脑补的结果来回答问题**。

现有的多模态大模型（MLLM）就像是一个"近视眼"——一旦图片模糊、有噪点或被压缩，它就彻底看不清了。Robust-U1 这篇论文提出的核心想法很简单：**与其让模型在模糊图片上硬猜，不如让它学会自己把图片修复干净，再基于修复后的图片来理解内容。**

> 核心问题：MLLM 能不能"自救"？—— 能不能自己修复受损的视觉内容？

## 二、现有方法的问题

在看 Robust-U1 之前，先了解两种主流做法：

**做法一：黑盒特征对齐（Implicit Adaptation）**

这种方法在模型的"视觉编码器"内部做修改，用对抗训练让模型对模糊图片不那么敏感。

类比：就像给近视眼的人做激光手术——从内部改变眼睛结构，不告诉人到底哪里看不清。

问题：缺乏可解释性，不知道模型到底在抵抗什么。

**做法二：文本推理补偿（Text-based Reasoning）**

最近的方法（如 Robust-R1）让模型用文字描述"这张图有模糊、有暗光问题，所以我要谨慎判断"。

类比：近视眼的人虽然看不清，但他在心里写了一份"看不清分析报告"，尝试用文字推理来弥补视觉不足。

问题：文字描述无法恢复丢失的像素级细节。就像你说"我觉得那辆车应该是左转的"，但你没有看到车，只是在猜。

**Robust-U1 的做法：视觉自修复（Self-Recovering）**

让模型自己输出一张修复后的干净图片，然后同时参考模糊原图和修复后的图来回答问题。

类比：近视眼的人戴上眼镜后看清了，然后基于清晰画面做出判断。

## 三、核心概念拆解

### 3.1 统一多模态模型（Unified MLLM）

传统的模型要么是"看图说话"（理解），要么是"看图画画"（生成）。Robust-U1 选了一个**既能理解又能生成**的模型作为底座（BAGEL），这样它才可能"把模糊图修好再画出来"。

### 3.2 三阶段训练

Robust-U1 的训练分为三个阶段，像递进的课程：

```
阶段一（SFT）：学会修复    →  supervised fine-tuning
阶段二（RL）：修得更好    →  reinforcement learning with dual rewards
阶段三（推理）：用好修复结果 →  multimodal reasoning
```

### 3.3 双重奖励机制

这是论文最精巧的设计。RL 阶段用两个独立的"裁判"来评估修复质量：

**裁判 A：像素级结构奖（SSIM Reward）**

检查修复图和原图在**每个小方块**上的亮度、对比度、结构是否一致。

**裁判 B：语义一致性奖（CLIP Reward）**

用 CLIP 模型检查两张图的**整体意思**是否一样。

## 四、代码示例

### 示例 1：SSIM 像素级结构奖励

SSIM 把图片切成一个个小方块（patch），每个方块上比较三个指标：

```python
import torch
import torch.nn.functional as F


def ssim_local(patch_r, patch_o, C1=1e-4, C2=4e-4):
    """
    计算单个 patch 的 SSIM 值。
    patch_r: 修复图的小方块，形状 [B, C, H, W]
    patch_o: 原图对应的小方块，形状 [B, C, H, W]
    返回: SSIM 值，范围 [0, 1]，越高表示结构越接近

    SSIM = l(x,y) * c(x,y) * s(x,y)
    其中 l = 亮度比较, c = 对比度比较, s = 结构比较
    """
    # 1) 亮度比较：两个 patch 的平均亮度越接近，分数越高
    mu_r = patch_r.mean(dim=[2, 3], keepdim=True)
    mu_o = patch_o.mean(dim=[2, 3], keepdim=True)
    luminance = (2 * mu_r * mu_o + C1) / (mu_r ** 2 + mu_o ** 2 + C1)

    # 2) 对比度比较：两个 patch 的标准差越接近，分数越高
    var_r = patch_r.var(dim=[2, 3], keepdim=True)
    var_o = patch_o.var(dim=[2, 3], keepdim=True)
    cov_ro = ((patch_r - mu_r) * (patch_o - mu_o)).mean(dim=[2, 3], keepdim=True)
    contrast = (2 * torch.sqrt(var_r * var_o) + C2) / (var_r + var_o + C2)
    structure = (cov_ro + C3) / (torch.sqrt(var_r * var_o) + C3)

    return luminance * contrast * structure
```

这个公式看起来复杂，但本质上就是问三个问题：

| 维度 | 问什么 | 类比 |
|------|--------|------|
| 亮度 l | 两个方块一样亮吗？ | 两张照片曝光差不多？ |
| 对比度 c | 两个方块的明暗层次一样吗？ | 都是清晰的还是都糊了？ |
| 结构 s | 两个方块的纹理方向一致吗？ | 线条朝同一个方向走吗？ |

### 示例 2：语义一致性奖励

SSIM 只看像素结构，但可能修出来的图"看起来很像"但"意思不对"。这时候 CLIP 奖励上场：

```python
import torch
from tinyclip import TinyCLIP


class SemanticReward:
    """
    语义一致性奖励：用 CLIP 模型检查修复图和原图的
    语义 embedding 是否接近。

    奖励公式：R_sem = exp(-alpha * (1 - cosine_sim))
    - cosine_sim = 1 时，奖励 = 1（完美语义一致）
    - cosine_sim = 0 时，奖励 = exp(-alpha)（语义完全不一致）
    """

    def __init__(self, alpha=10.0):
        self.clip_model = TinyCLIP()  # 冻结的 CLIP
        self.alpha = alpha

    @torch.no_grad()
    def compute(self, image_recovered, image_clean):
        # 获取两张图的 CLIP embedding
        embed_r = self.clip_model.encode_image(image_recovered)  # [B, D]
        embed_o = self.clip_model.encode_image(image_clean)       # [B, D]

        # 计算余弦相似度
        similarity = F.cosine_similarity(embed_r, embed_o, dim=1)  # [B]

        # 转换为奖励值 [0, 1]
        reward = torch.exp(-self.alpha * (1 - similarity))
        return reward.mean()

    def __call__(self, recovered, clean):
        return self.compute(recovered, clean)
```

两个奖励的组合方式：

```
总奖励 = R_pix + R_sem
       = SSIM(修复图, 原图) + CLIP_cosine(修复图, 原图)
```

这样既保证了修出来的图"长得像"，也保证了"意思对"。

## 五、三阶段训练详解

### 阶段一：监督微调（SFT）— "先学会修图"

用 ImageNet-C 数据集（天然带噪声、模糊、压缩的图）训练模型。

输入：模糊图片 + 提示词 "Recover the clean version of this corrupted image."

输出：修复后的清晰图片

损失函数：Rectified Flow Loss

```
L_SFT = E[ ||噪声 - 模型预测的噪声||² ]
```

类比：给模型看大量"前后对照表"——左边是模糊图，右边是清晰图，让它学习从模糊到清晰的映射关系。

### 阶段二：强化学习（RL）— "修得更好"

在 SFT 的基础上，用双重奖励做 RL 训练（Flow-GRPO 算法）。

关键技巧：把确定性的 ODE 采样转成随机性的 SDE，这样每次采样都会得到**不同的修复结果**，然后用 Group Relative Policy Optimization 来比较这些结果、选出更好的。

```
每次采样 G 条轨迹 → {I_r1, I_r2, ..., I_rG}
对每条轨迹计算奖励 → {R1, R2, ..., RG}
做组内归一化得到优势 → {A1, A2, ..., AG}
更新策略让高优势轨迹概率更高
```

类比：给模型 10 次修图机会，让它自己比较哪次修得最好，然后向最好的那个学习。

### 阶段三：多模态推理 — "用好修复结果"

训练模型同时参考**两张图**来回答问题：

```
输入 = [模糊图片 Ic, 修复图片 Ir, 问题 Q]
输出 = 答案 A（带推理链）
```

关键设计：模型不是只看修复后的图，而是**同时参考原图和修复图**。原图中可能保留了一些修复图丢失的微妙信息，两者互补。

## 六、实验结果

**R-Bench 基准测试**（真实世界退化场景）：

| 方法 | MCQ | VQA | CAP | 总分 |
|------|-----|-----|-----|------|
| BAGEL（底座） | 0.718 | 0.650 | 0.469 | 0.577 |
| Robust-R1 | 0.653 | 0.491 | 0.407 | 0.502 |
| **Robust-U1** | **0.735** | **0.707** | **0.827** | **0.740** |

Robust-U1 在所有退化级别（低、中、高）下都显著优于其他方法，尤其是在"高质量"（CAP）任务上领先超过 40 个百分点。

**对抗退化基准测试**（在标准 VQA 数据集上施加退化）：

在 MMMB、MMStar、RealWorldQA 三个标准基准上，Robust-U1 都保持了最好的抗退化能力，即使退化程度从 25% 增加到 100%，性能下降幅度也最小。

## 七、关键洞察

1. **自修复 > 文本补偿**：修出来的图片直接为推理提供了像素级细节，比文字描述"这张图有点模糊"有效得多。

2. **双重奖励的必要性**：论文消融实验证明，只用 SSIM 奖励会导致语义偏差（修得像但意思不对），只用 CLIP 奖励会导致结构失真。两者结合才能修出高质量的图。

3. **参考原图很重要**：模型不是"修复完就忘"，而是同时参考模糊图和修复图，这让它能发现修复过程中可能丢失的细微信息。

## 八、局限性与未来方向

- **修复质量上限**：模型受限于训练数据，面对超出训练范围的退化类型时，修复效果会下降。
- **依赖配对数据**：需要"模糊图-清晰图"配对来训练 SFT 阶段，这在真实场景中较难获取。
- **未来方向**：扩展到视频序列、减少计算开销、加入针对特定退化类型先验知识。

## 九、一句话总结

Robust-U1 证明了：与其让多模态模型在模糊图片上"猜答案"，不如让它先学会把图片修好，再基于清晰的图片来理解——这就像先擦亮眼镜，再看书。
