---
title: "VLA 驾驶模型的视觉依赖诊断——用扰动实验回答一个问题：自动驾驶到底在多大程度上真的在"看"？"
来源: https://arxiv.org/abs/2605.31041
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# VLA 驾驶模型的视觉依赖诊断

> 论文：*Does Visual Information Play a Decisive Role in Vision-Language-Action Model Driving Behavior?*
> 作者：Jingtao He, Hongliang Lu, Xiaoyun Qiu, Yixuan Wang, Xinhu Zheng（港科大广州）
> 发表于 ITSC 2026

---

## 一、一个日常类比：蒙眼司机

想象你是一名出租车司机。

正常情况下，你看得到红绿灯、行人、前车，然后踩油门或刹车。这叫**端到端感知-决策**。

现在，我们给这位司机做几个实验：

1. **遮住眼睛**（移除图像输入），只靠他之前几秒的驾驶记忆和方向盘角度来继续开车——他会往哪边走？
2. **给他一副模糊眼镜**（降低图像分辨率），他能辨认红绿灯吗？
3. **把他熟悉的街道照片打乱顺序**（破坏空间结构），他还认得路吗？

这篇论文要做的事情就是：**系统地给 VLA 驾驶模型做这类"蒙眼实验"，看看它到底在多大程度上真的依赖视觉信息。**

---

## 二、核心问题：模型性能高 = 真的在看吗？

目前评测 VLA 模型（视觉-语言-动作模型）时，大家主要看两个指标：

- **轨迹误差**：模型预测的路径离真实路径有多远
- **碰撞率**：模拟驾驶中撞了多少次

但这里有一个陷阱：**即使模型在干净输入上表现很好，也不代表它真的"看懂"了画面。** 它可能只是记住了训练数据里的统计规律，比如"前方有车道线就直行"，而并没有真正理解场景中的语义内容。

这就好比一个学生考试考了高分，但我们不知道他是真的理解了题目，还是只是背下了答案。

这篇论文的核心问题是：

> **VLA 驾驶模型的行为，究竟在多大程度上由视觉输入驱动？**

---

## 三、方法：三级扰动框架

作者提出了一个**结构化多级视觉扰动框架**，把"破坏视觉信息"这件事分成三个由浅入深的层次：

### 3.1 通道级扰动（Channel-Level）——最低级

直接在像素层面破坏图像，不改变场景的整体布局：

- **高斯替换（Gaussian Replacement）**：把整张图替换成随机噪声图
- **图像移除（Image Removal）**：完全不给模型看图，只用文字和历史状态

这相当于"蒙住司机的眼睛"。

### 3.2 信息级扰动（Information-Level）——语义密度

保持图像的粗略空间结构，但减少其中的语义信息量：

- **下采样**：把图缩小再放大，丢失细节
- **随机 Token 剪枝**：随机丢弃图像编码后的一部分特征
- **FastV 剪枝**：按重要性评分，丢弃不重要的 Token

这相当于"让司机戴模糊眼镜"。

### 3.3 结构级扰动（Structure-Level）——空间组织

保留所有视觉信息，但打乱它们的空间排列关系：

- **全局打乱**：把所有图像 Token 随机打乱顺序
- **位置打乱**：只打乱位置编码，Token 本身不变
- **分块打乱**：把图像切成小块，每块内部不变，块之间随机交换

这相当于"给司机一张照片碎片拼图，但拼错了"。

---

## 四、核心概念详解

### 4.1 什么是 VLA 模型？

VLA = **Vision-Language-Action**（视觉-语言-动作）

它是一个端到端模型，输入是摄像头图像 + 文本指令 + 车辆状态，输出是直接的控制指令（如转向角度、加速度）。

与传统自动驾驶不同，传统方法把感知、预测、规划拆成三个独立模块；VLA 把它们合并成一个统一的多模态模型。

### 4.2 什么是 Open-Loop 和 Closed-Loop？

- **Open-Loop（开环）**：给定一段固定视频，模型预测未来轨迹，和真实轨迹对比。**模型的行为不会改变后续帧的画面。**
- **Closed-Loop（闭环）**：模型在模拟器中实时驾驶，它的每一个决策都会影响下一帧的画面。**更接近真实驾驶场景。**

关键发现：**同一个模型在两种设置下的视觉依赖程度完全不同。**

### 4.3 依赖度计算公式

论文定义了一个简单的相对性能变化公式：

```
D(T) = (M(扰动后的结果) - M(原始结果)) / |M(原始结果)|
```

其中 M 是评测指标（如 L2 误差或 NCAP 安全评分），D 越大说明模型越依赖被扰动的视觉信息。

---

## 五、代码示例

### 5.1 扰动框架伪代码

论文中的算法流程可以这样理解：

```python
# 输入：VLA 模型 f_θ，评测基准 B，评测函数 M，扰动族 T
# 扰动族分为三个层级：通道级(T_ch)、信息级(T_inf)、结构级(T_str)

# Step 1: 计算干净输入的基准性能
baseline_score = M( f_θ(clean_image, state_info) )

# Step 2: 遍历每个扰动层级
for level in [channel, information, structure]:
    for perturbation in T[level]:
        # 构造扰动后的视觉表示
        perturbed_image = perturbation(clean_image)

        # 用扰动后的输入重新评测
        perturbed_score = M( f_θ(perturbed_image, state_info) )

        # 计算相对性能变化（依赖度）
        dependency = (perturbed_score - baseline_score) / abs(baseline_score)

        print(f"扰动类型: {perturbation.name}")
        print(f"  依赖度: {dependency:.2%}")
```

### 5.2 具体扰动操作示例

```python
import torch
import torchvision.transforms as T

def gaussian_replacement(image, mean=0.0, std=1.0):
    """通道级扰动：用高斯噪声替换原始图像"""
    b, c, h, w = image.shape
    noise = torch.randn_like(image) * std + mean
    return noise

def image_downsample(image, ratio=0.5):
    """信息级扰动：下采样再上采样，丢失细节"""
    small_h, small_w = int(h * ratio), int(w * ratio)
    small = torch.nn.functional.interpolate(image, size=(small_h, small_w), mode='bilinear')
    restored = torch.nn.functional.interpolate(small, size=(h, w), mode='bilinear')
    return restored

def token_pruning(tokens, keep_ratio=0.5):
    """信息级扰动：随机丢弃部分视觉 Token"""
    b, seq_len, dim = tokens.shape
    num_keep = int(seq_len * keep_ratio)
    indices = torch.randperm(seq_len)[:num_keep]
    return tokens[:, indices, :]

def global_shuffle(tokens):
    """结构级扰动：全局打乱 Token 顺序"""
    b, seq_len, dim = tokens.shape
    shuffled_indices = torch.randperm(seq_len)
    return tokens[:, shuffled_indices, :]

def block_shuffle(tokens, block_size=4):
    """结构级扰动：分块打乱"""
    b, seq_len, dim = tokens.shape
    num_blocks = seq_len // (block_size * block_size)
    blocks = tokens.reshape(b, num_blocks, block_size * block_size, dim)
    block_indices = torch.randperm(num_blocks)
    return blocks[:, block_indices, :, :].reshape(b, seq_len, dim)
```

---

## 六、关键发现

### 发现 1：开环 vs 闭环，结果完全不同

| 扰动类型 | 开环轨迹误差变化 | 闭环安全评分变化 |
|---------|-----------------|-----------------|
| 高斯替换 | +3.9%（很小） | -5.4%（中等） |
| 图像移除 | +7.1%（很小） | -14.6%（较大） |
| 下采样 90% | +2.6%（很小） | -31.5%（很大！） |

**开环**（只看预测轨迹准不准）中，即使完全不看图，模型表现也只下降不到 10%。

但**闭环**（真实模拟驾驶）中，同样的扰动会导致安全评分大幅下降——**真实交互中，视觉的重要性远比开环测试揭示的高得多。**

### 发现 2：语义比细节更重要

下采样（破坏语义形成阶段）造成的损害，远大于剪枝编码后的 Token（破坏已经形成的语义特征）。这说明模型在**交互控制**中依赖的是**高层语义**，而非原始像素细节。

### 发现 3：空间结构很关键

位置打乱（打乱 Token 的位置编码）造成的损害比内容打乱更大，说明**空间索引对视觉-语言对齐至关重要**。Transformer 模型中的位置编码机制在自动驾驶中扮演了重要角色。

---

## 七、为什么这篇论文值得读？

1. **方法论价值**：提出的三级扰动框架不局限于 VLA 模型，可以推广到其他多模态系统的可解释性分析
2. **安全警示**：开环评测可能严重低估模型对视觉的依赖程度，自动驾驶的安全评估需要更多闭环测试
3. **设计指导**：告诉模型设计者——与其堆砌视觉细节，不如确保高层语义和空间结构的正确建模

---

## 八、一句话总结

> **VLA 驾驶模型在"纸上谈兵"（开环评测）时看起来不怎么需要视觉，但在"真刀真枪"（闭环驾驶）时，视觉信息尤其是语义内容和空间结构，对安全至关重要。**

---

## 延伸阅读

- Impromptu-VLA 原始论文：arXiv:2505.23757
- nuScenes 自动驾驶数据集：CVPR 2020
- FastV 高效视觉语言模型推理：ECCV 2024
