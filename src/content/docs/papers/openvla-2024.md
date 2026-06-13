---
title: OpenVLA: An Open-Source Vision-Language-Action Model
来源: https://arxiv.org/abs/2406.09246
日期: 2026-06-13
分类: 机器学习
子分类: 机器人与 VLA
provenance: pipeline-v3
---

# OpenVLA：开源视觉-语言-动作模型

## 一、从日常类比开始

想象一下：你教一个机器人做家务。传统做法是——你写一段代码，告诉它"先移动到坐标(1,2)，然后夹住杯子，再移动到(3,4)"。如果杯子位置稍微偏了一点，机器人就失败了。

OpenVLA 的思路完全不同。它不像一个"按指令执行"的工人，而像一个"看过很多视频后学会做家务"的人。你给它看一张厨房的照片，说"把鸡蛋放进锅里"，它就能根据画面里的东西，自己推断出该怎么动手。

这就是 OpenVLA 的核心：**它同时"看"（视觉）、"想"（语言理解）、"动"（生成动作），三者合为一体。**

## 二、核心概念

### 2.1 什么是 VLA？

VLA 全称 **Vision-Language-Action**，是一个能同时处理三种信息的模型：

| 模态 | 输入/输出 | 类比 |
|------|-----------|------|
| 视觉 (Vision) | 摄像头照片 | 眼睛 |
| 语言 (Language) | 文字指令如"把杯子放桌上" | 大脑理解 |
| 动作 (Action) | 机械臂的关节角度、速度 | 手脚 |

传统机器人系统里，这三者是分开的模块。OpenVLA 把它们**统一在一个大模型内部**。

### 2.2 OpenVLA 的三大组件

OpenVLA 参数量 70 亿（7B），由三部分组成：

1. **融合视觉编码器**：同时使用 DINOv2 和 SigLIP 两个预训练视觉模型的输出，把图片变成机器可读的特征向量。
2. **投影层（Projector）**：把视觉特征映射到语言模型能理解的"空间"。
3. **Llama 2 7B 语言模型**：接收视觉特征 + 文字指令，输出 tokenized 的动作序列。

```
[摄像头图像] --> [DINOv2 + SigLIP] --> [特征向量]
                                      ↓
[文字指令] ----------------------------------> [Llama 2 7B] --> [动作指令]
                                      ↑
                              [投影层把视觉特征转进来]
```

### 2.3 为什么"开源"很重要？

在 OpenVLA 之前，类似能力的模型（如 Google 的 RT-2）都是闭源的——只有 Google 能用。OpenVLA 的做法是：

- 模型权重开源（HuggingFace 可下载）
- 训练代码开源（PyTorch）
- 微调 notebook 开源
- 支持在消费级 GPU 上微调（用 LoRA 技术）

这意味着任何人——学生、小团队、初创公司——都能在自己的机器人上跑这套系统。

### 2.4 Open X-Embodiment 数据集

OpenVLA 在 **97 万条真实机器人演示数据**上预训练，这些数据来自 Open X-Embodiment 项目，涵盖了多种机器人形态（WidowX、Franka、Google Robot 等）、多种任务（抓取、放置、倾倒等）和多种场景。

## 三、代码示例

### 3.1 加载 OpenVLA 并推理

```python
import torch
from openvla import OpenVLAModel

# 从 HuggingFace 加载预训练模型
model = OpenVLAModel.from_pretrained("openvla/openvla-7b")

# 准备输入：一张图片和一条文字指令
image = load_image("kitchen_scene.jpg")  # 你的摄像头拍到的厨房画面
instruction = "把鸡蛋放进锅里"

# 推理：模型输出动作
actions = model.generate(
    image=image,
    prompt=instruction,
    max_new_tokens=100
)

# actions 是一个连续的向量，代表机械臂各关节的目标位置和速度
# 可以直接发送给机器人执行
robot.execute(actions)
```

这段代码的关键在于：**你不需要为每个新任务写代码**。只要模型在预训练时见过类似场景，它就能泛化。

### 3.2 用 LoRA 微调 OpenVLA 到新任务

```python
from peft import LoraConfig, get_peft_model

# 配置 LoRA：只微调 1.4% 的参数
lora_config = LoraConfig(
    r=16,                    # 低秩维度
    target_modules=["q_proj", "v_proj"],  # 只对 attention 的 Q/V 矩阵加 LoRA
    lora_alpha=32,
    lora_dropout=0.1,
)

# 给模型加上 LoRA 层
model = get_peft_model(model, lora_config)
print(model.print_trainable_parameters())
# 输出: trainable params: 9,830,400 || all params: 696,796,160 || trainable: 1.41%

# 准备微调数据：你的机器人收集的新演示
dataset = load_franka_dataset("pour_corn_into_pot")

# 训练：在单个消费级 GPU 上就能跑
trainer = Trainer(model=model, train_dataset=dataset)
trainer.train()

# 保存微调后的模型
model.save_pretrained("./openvla-pour-corn")
```

这里 LoRA 的作用就像给一个已经大学毕业的人做"短期培训班"——不需要重新上学（全量微调），只需要针对新技能做少量调整。

## 四、性能亮点

OpenVLA 在多项基准测试中表现突出：

- **泛化能力**：在 29 个任务上，比闭源的 RT-2-X（550 亿参数）高出 16.5% 绝对成功率，但参数只有它的七分之一。
- **语言理解**：能听懂从未见过的指令，比如"把红色辣椒拿起来"——即使训练数据里没有完全一样的描述。
- **多对象场景**：当场景中有很多干扰物体时，OpenVLA 仍能找到正确的目标。
- **容错恢复**：有时抓错了，它能意识到并重新尝试。

## 五、局限性

OpenVLA 也有不足：

- 对于涉及互联网常识的任务（如"把可乐放到泰勒·斯威夫特海报旁边"），不如 RT-2-X，因为 RT-2 用了更大规模的互联网数据预训练。
- 在单一任务的精确控制上，从头训练的 Diffusion Policy 可能更强。
- 推理速度受限于 7B 参数模型的计算量。

## 六、总结

OpenVLA 的意义不在于某个单项指标第一，而在于它证明了一件事：**一个大模型可以同时学会多种机器人的操作技能，并且开源给全世界使用。** 这就像开源了一个"机器人通用大脑"的雏形。

对于学习者来说，OpenVLA 是理解"大模型如何走出屏幕、进入物理世界"的最佳入口之一。
