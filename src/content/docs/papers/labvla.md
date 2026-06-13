---
title: LabVLA —— 把视觉-语言-动作模型种进科学实验室
来源: https://arxiv.org/abs/2606.13578
日期: 2026-06-13
分类: 机器学习
子分类: 机器人
provenance: pipeline-v3
---

# LabVLA：把视觉-语言-动作模型种进科学实验室

## 零、一句话理解这篇论文

LabVLA 解决的核心问题是：**AI 会读文献、会做假设、会排实验步骤，但走到实验台前就"瘫痪"了。**
论文把 VLA（视觉-语言-动作模型）从家庭桌面场景拉到真实的科学实验室，让机器人能读懂实验方案并亲手执行。

---

## 一、先做一个日常类比

想象一个刚毕业的化学系学生：

- 他能读懂实验手册（语言理解 ✅）
- 他能看到烧杯、温度计、移液器（视觉感知 ✅）
- 但他从未亲手做过滴定实验（动作执行 ❌）

这个学生就像目前最先进的 AI 模型。VLA 模型就是给这个"实习生"配了一副机械手臂，让它把纸面上的步骤变成物理动作。

但实验室场景和家庭场景有三大差异：

1. **物品更精细**：烧杯里的液体是透明的，机器人很难"看清"液位
2. **步骤更严格**：实验室流程是固定的，不能像倒垃圾一样随便做
3. **容错率极低**：把 10ml 溶液当成 100ml 会导致整个实验报废

LabVLA 就是为了解决这三个痛点而生的。

---

## 二、核心概念拆解

### 2.1 什么是 VLA 模型？

VLA = Vision-Language-Action。它把三个能力融合在一个模型里：

| 能力 | 类比 | 模型中的角色 |
|------|------|-------------|
| 视觉（Vision） | 用眼睛看烧杯里的颜色 | 多模态编码器 |
| 语言（Language） | 读懂"取 5ml 盐酸"的指令 | 语言理解模块 |
| 动作（Action） | 控制机械臂拧开瓶盖 | 动作输出模块 |

传统机器人是"写代码 -> 按代码动作"。VLA 是"看场景 -> 理解指令 -> 自己决定动作"。

### 2.2 论文的两个核心贡献

**贡献一：RoboGenesis —— 实验数据的"工厂"**

现实中的实验室操作数据几乎没有。没有数据，VLA 模型就学不会。

RoboGenesis 是一个**基于仿真的数据生成引擎**。它的思路是：

```
原子技能（开瓶盖、倒液体、搅拌）
    → 组合成实验工作流（16步化学实验）
    → 加入随机化（摆位、光照、遮挡、视角）
    → 用模拟器运行 → 过滤掉失败的
    → 输出结构化的演示数据
```

它支持 16 种不同的机器人平台（13 种单臂 + 3 种双臂），包括 UR5e、Franka、Rizon 4、Festo 等。

**贡献二：LabVLA 训练配方 —— FAST + Flow Matching**

LabVLA 用了 Qwen3-VL-4B-Instruct 作为骨干模型，训练分两个阶段：

```
阶段 1（FAST 预训练）
    把连续的机器人动作"离散化"成 token
    让语言模型学会"预测动作 token"
    （此时还不连 DiT 动作专家）

阶段 2（Flow Matching 后训练）
    挂载 DiT（Diffusion Transformer）动作专家
    用 flow matching 学习"从噪声到动作"的映射
    用 Knowledge Insulation 防止语言知识被动作训练冲掉
```

**Knowledge Insulation** 是一个巧妙的设计：在阶段 2 训练时，用一个 stop-gradient 挡住 flow loss 对 VLM 前缀的影响，让语言理解部分保持"纯净"。

---

## 三、关键技术细节

### 3.1 FAST：动作 token 化

连续的动作（比如机械臂的 7 个关节速度）不能被大语言模型直接处理。FAST 的作用就是把连续值变成离散的 token，就像把连续的汉字变成可以拼写的字符。

```
连续动作 [0.3, -0.1, 0.5, ...]
    ↓ FAST VQ-VAE 量化
离散 token 序列 [127, 48, 203, ...]
    ↓ 变成语言模型的词汇
模型可以像"写文章"一样"写动作"
```

### 3.2 Flow Matching vs 传统 Diffusion Policy

| 方法 | 采样步数 | 延迟 | 适合实时控制？ |
|------|---------|------|--------------|
| 传统 Diffusion Policy | ~100 步 | 高 | 不推荐 |
| LabVLA Flow Matching | N=10 步 | 低 | 适合 |

Flow Matching 的核心优势是**确定性向量场**——采样时只需要 10 步欧拉积分就能得到可用轨迹，而传统扩散策略需要上百步。这对实验室这种需要闭环实时控制的场景至关重要。

### 3.3 实验室能力分级

论文提出了一个有用的框架，把机器人实验室能力分成 4 级：

- **Level 1（学徒）**：单步操作 —— 拿杯子、按按钮、开门
- **Level 2（技术员）**：多步协议 —— 倒液体、加热、搅拌、转运
- **Level 3（专家）**：精密仪器操作 + 测量记录 + 安全约束
- **Level 4（科学家）**：根据观察调整方案

LabVLA 达到了 Level 2。

---

## 四、实验结果

### 4.1 LabUtopia Benchmark

在 6 项实验室操作任务上，LabVLA 在分布式（ID）和分布外（OOD）设置下都取得了最佳平均成功率：

| 方法 | 大小 | ID 平均成功率 | OOD 平均成功率 |
|------|------|-------------|--------------|
| π0 | 3B | 63.3 | 63.2 |
| π0.5 | 3B | 52.4 | 52.1 |
| **LabVLA** | **4B** | **71.1** | **70.0** |

### 4.2 真实机器人验证

在真实的 Franka 机械臂上做了验证，4 项任务（摇动液体、倒液体、磁力搅拌、塞子）在不同条件下（干净/杂乱、分布内/外）各跑 50 次：

```
条件                  LabVLA   DreamZero   π0.5
干净-分布内           86.5     87.0        85.0
杂乱-分布内           80.0     81.0        76.5
干净-分布外           80.0     78.0        77.0
杂乱-分布外           74.0     75.5        71.5

LabVLA 在"干净-分布外"和"杂乱-分布外"均排名第一
```

### 4.3 数据可迁移性

最有趣的是：即使换成其他 VLA 模型（X-VLA），在 LabEmbodied 数据上微调后也显著提升了：

```
ID 平均提升：+15.0%
OOD 平均提升：+19.3%
```

这说明 LabEmbodied 数据本身有价值，不只属于 LabVLA。

---

## 五、代码示例

### 示例 1：模拟 LabVLA 的推理流程

虽然无法直接运行，但这个伪代码展示了 VLA 从"看 + 读"到"动"的完整流程：

```python
# 输入：实验方案的文本指令 + 机器人看到的当前画面
instruction = "取 10ml 0.1M HCl 溶液，缓慢倒入 250ml 烧杯中"
observation = robot.camera.capture()  # 图像帧
robot_state = robot.get_state()       # 当前关节角度、位姿

# VLA 模型内部处理（简化版）
# 1. 视觉编码：把图像变成特征向量
vision_features = vl_encoder.encode(observation)

# 2. 语言编码：把指令变成特征向量
language_features = lm_encoder.encode(instruction)

# 3. 融合：视觉 + 语言 + 机器人状态 → 动作 token
action_tokens = model.predict(
    vision=vision_features,
    language=language_features,
    robot_state=robot_state
)

# 4. 将离散 token 解码为连续动作
actions = fast_decoder.decode(action_tokens)
# actions 形状: [chunk_len, 7] → 7个关节的未来 N 步控制量

# 5. 执行前 1 步
robot.apply_action(actions[0])
```

### 示例 2：FAST 动作 token 化的原理示意

```python
import torch
import torch.nn as nn

# 假设连续动作空间是 7 维（7 轴机械臂）
ACTION_DIM = 7
LATENT_DIM = 32
NUM_CODEBOOK_ENTRIES = 1024

class FASTTokenizer(nn.Module):
    """
    FAST 的核心是把连续动作"量化"成离散 token。
    这用一个 VQ-VAE 实现：
    - Encoder: 连续动作 → 低维潜在表示
    - Codebook: 潜在空间被离散化成 1024 个"簇"
    - 每个动作被映射到最近的簇索引 → 这就是一个 token
    """
    def __init__(self):
        super().__init__()
        self.encoder = nn.Linear(ACTION_DIM, LATENT_DIM)
        self.codebook = nn.Embedding(NUM_CODEBOOK_ENTRIES, LATENT_DIM)

    def encode(self, actions: torch.Tensor) -> torch.Tensor:
        """
        输入: actions [batch, action_dim] → 例如 [6]
        输出: token_ids [batch] → 例如 [42, 1023, 7, ...]
        """
        latent = self.encoder(actions)  # [batch, 32]
        codebook = self.codebook.weight  # [1024, 32]

        # 找每个动作最近的 codebook entry
        dist = torch.cdist(latent, codebook)  # [batch, 1024]
        token_ids = torch.argmin(dist, dim=1)  # [batch]
        return token_ids  # 交给语言模型做"下一个 token 预测"

    def decode(self, token_ids: torch.Tensor) -> torch.Tensor:
        """逆过程：从 token 恢复连续动作"""
        latent = self.codebook(token_ids)  # [batch, 32]
        actions = self.encoder(latent)  # [batch, 7]
        return actions
```

### 示例 3：Knowledge Insulation 在训练中的实现

```python
def labvla_training_step(model, batch):
    """
    阶段 2 的训练：Flow Matching 后训练 + Knowledge Insulation

    关键设计：flow loss 只能更新 DiT 动作专家，
             不能反向传播到 VLM 前缀（防止语言知识被冲掉）
    """
    # 前向传播：VLM 前缀输出隐藏状态
    with torch.no_grad():  # 关键：冻结 VLM 前缀的梯度
        prefix_hidden = model.vlm_prefix(
            vision=batch.vision,
            language=batch.instruction,
            robot_state=batch.robot_state
        )

    # DiT 动作专家接收 VLM 的输出作为条件
    # 这里可以正常计算梯度
    action_pred = model.dit_expert(
        noisy_action=batch.noisy_actions,
        condition=prefix_hidden.detach()  # detach 确保不反向传到 VLM
    )

    # Flow matching loss: 预测速度场
    flow_loss = compute_flow_matching_loss(
        pred=action_pred,
        target=batch.action_velocity
    )

    # 同时保留 FAST token loss（让 VLM 继续学动作 token）
    fast_loss = model.compute_fast_loss(
        hidden=prefix_hidden,
        targets=batch.action_tokens
    )

    # 总损失 = FAST 部分更新 VLM + flow 部分只更新 DiT
    total_loss = fast_loss + flow_loss
    total_loss.backward()
    return total_loss
```

---

## 六、意义与局限

### 为什么重要？

1. **首次系统性地把 VLA 引入科学实验室**——不是某个具体操作的 demo，而是从数据生成到训练配方到评测基准的一整套方案
2. **数据瓶颈的解决思路**——用仿真数据工厂 + 领域随机化来弥补真实数据的不足
3. **训练配方的工程创新**——FAST + Flow Matching + Knowledge Insulation 的组合，对后续研究有借鉴价值

### 还有哪些挑战？

- **Level 3 还没到**：精密仪器（移液器、离心机、PCR 仪）的操作需要更高的精度
- **安全约束还没集成**：化学实验室涉及危险化学品，目前的模型没有内置安全机制
- **仿真到现实的 gap**：虽然 Real-World 验证表现不错，但距离全自动化实验室还有距离

---

## 七、延伸思考

这篇论文让我想到一个更根本的问题：**"理解"和"执行"是同一个东西吗？**

VLA 模型试图回答"是"——只要把视觉、语言、动作在同一个模型里训练，理解自然会导致执行能力。但也许真正的突破点不在模型架构，而在**数据质量和场景丰富度**。

LabVLA 最大的贡献可能不是模型本身，而是它证明了：**当数据质量和场景覆盖度够高时，现有的 VLM 骨干模型可以被很好地"接地"到物理世界中。**

---

## 参考

- 论文 arXiv: [2606.13578](https://arxiv.org/abs/2606.13578)
- 项目主页: [https://zjunlp.github.io/LabVLA/](https://zjunlp.github.io/LabVLA/)
- 模型权重: [Hugging Face](https://huggingface.co/zjunlp/LabVLA)
- 代码: [GitHub](https://github.com/zjunlp/LabVLA)
- 相关基线：[π0](https://www.physicalintelligence.company/) (Physical Intelligence), [OpenVLA](https://openvla.github.io/) (Stanford)
