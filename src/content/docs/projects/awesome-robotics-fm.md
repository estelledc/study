---
title: Awesome-Generalist-Robots-via-Foundation-Models — 机器人基础模型论文清单
来源: 'https://github.com/JeffreyYH/Awesome-Generalist-Robots-via-Foundation-Models'
日期: 2026-06-13
分类: 机器学习
子分类: 机器人与 VLA
provenance: pipeline-v3
---

## 是什么

这个仓库是一份**学术论文清单**，来自一篇综述文章 *"Toward General-Purpose Robots via Foundation Models: A Survey and Meta-Analysis"*（arXiv:2312.08782）。

日常类比：想象你想了解"全世界有哪些餐厅"，但不想一家家去试。这份清单就像一本**餐厅黄页**——把近几百篇相关论文按"做什么菜"（感知 / 规划 / 动作生成 / 训练数据生成 / 世界建模）和"用什么厨师"（模仿学习 / 强化学习）分好了类。你不需要全读，挑感兴趣的进去就行。

核心问题：能不能训练一个"万能模型"，让机器人像人一样——听到"把桌上那杯红色的水拿给我"，就知道怎么找杯子、怎么走过去、怎么伸手抓、怎么递过来？这份清单收录了所有尝试回答这个问题的研究。

## 为什么重要

不理解这个方向，下面这些事都没法解释：

- 为什么 Boston Dynamics 的机器人突然从"按程序跳舞"变成"能听懂人话干活"
- 为什么 Google 的 RT-1 / RT-2、OpenAI 的 Octo、Physical Intelligence 的 π0 接连发布——它们都在追同一个目标
- 为什么"大语言模型（LLM）"和"机器人"这两个原本不相干的领域，现在被论文大量地绑在一起讨论
- 为什么"基础模型（Foundation Model）"这个词从 AI 圈蔓延到了物理世界

## 核心概念

### 概念 1：什么是"基础模型"

基础模型 = **在超大量数据上学到的通用模型**，可以"零样本迁移"到各种下游任务。

- LLM（如 GPT）：读过互联网上几乎所有文字 → 能写诗、翻译、回答问题
- VLM（如 CLIP）：看过数十亿张图片 → 能理解"图片里有什么文字描述的东西"
- 基础模型搬到机器人身上 → 想让机器人在物理世界里也有这种"一通百通"的能力

### 概念 2：两大类研究路线

仓库把论文分成两大阵营：

| 路线 | 做法 | 代表论文 |
|------|------|----------|
| **用现成 FM 赋能机器人模块** | 把已有的 LLM / VLM 拿来，塞进机器人的某个环节（感知 / 规划 / 动作生成） | SayCan、CLIPort、LM-Nav |
| **从头训练机器人专用 FM** | 从零训练一个专门管机器人的基础模型（VLA = Vision-Language-Action） | RT-1、RT-2、Octo、π0 |

第一类像"给汽车装 GPS"——车还是原来的车，加个导航就聪明了。第二类像"造一辆天生会导航的车"——从设计图纸就开始考虑智能驾驶。

### 概念 3：VLA（Vision-Language-Action）模型

这是当前最热的方向。VLA = **视觉 + 语言 + 动作** 三个模态一起学：

- 眼睛看（视觉）→ 大脑理解（语言）→ 手脚动（动作）
- 输入：摄像头画面 + 人类指令（如"拿起苹果"）
- 输出：机械臂关节的角度 / 轮子的转速

## 代码示例

### 示例 1：用 CLIP 做开放词汇感知（第一类路线）

CLIP 是最早的视觉-语言基础模型之一。在机器人里，它被用来"看懂"从未见过的物体——只要你能用语言描述它。

```python
import torch
from transformers import CLIPProcessor, CLIPModel

# 加载预训练的 CLIP 模型（已经在 3 亿张图片+文字对上训练过）
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# 假设机器人摄像头拍到一张图片
image = image_processor(images=camera_capture, return_tensors="pt")

# 用自然语言描述你想找的物体
text = processor(text=["a red cup", "a blue spoon", "a white plate"], return_tensors="pt")

# CLIP 算出图片和文字的匹配程度
outputs = model(**image, **text)
logits_per_image = outputs.logits_per_image  # 形状: [1张图片, 3个文字描述]
probs = logits_per_image.softmax(dim=-1)

# 输出类似: tensor([[0.85, 0.10, 0.05]])
# 意思是：这张图有 85% 概率是"a red cup"
```

**逐部分解释**：

- `from_pretrained` 加载的是一个"见过 3 亿张图"的大脑——你不需要再训练
- `logits_per_image` 算的是"这张图和每句话有多匹配"
- 因为 CLIP 见过各种各样的红色杯子，所以即使机器人之前从没拍过"这种款式的红杯子"，也能认出来——这就是**开放词汇（open-vocabulary）**的力量

### 示例 2：RT-1 风格的 VLA 策略（第二类路线）

RT-1（Robotics Transformer-1）是 Google 的开创性工作。它把摄像头画面、机械臂状态、人类指令全部拼在一起，用一个 Transformer 直接输出机械臂的动作。

```python
import torch
import torch.nn as nn

class SimpleVLAModel(nn.Module):
    """简化版的 RT-1 架构——展示核心思想"""
    def __init__(self, img_dim=768, lang_dim=768, action_dim=7, hidden_dim=1024):
        super().__init__()
        # 视觉编码器：把摄像头图片压缩成向量
        self.visual_encoder = nn.Linear(img_dim, hidden_dim)
        # 语言编码器：把文字指令压缩成向量
        self.lang_encoder = nn.Linear(lang_dim, hidden_dim)
        # Transformer 层：让视觉和语言"对话"
        self.transformer = nn.TransformerEncoderLayer(d_model=hidden_dim, nhead=8)
        # 动作头：从融合后的向量预测机械臂动作（7 个关节角度）
        self.action_head = nn.Linear(hidden_dim, action_dim)

    def forward(self, image_feat, text_feat, prev_actions):
        # image_feat: [batch, img_dim]  -- 摄像头提取的特征
        # text_feat:  [batch, lang_dim]  -- 文字指令的嵌入向量
        # prev_actions: [batch, action_dim] -- 上一次的动作（用于时序连贯）

        # 1) 把视觉和语言分别映射到同一维度
        v = self.visual_encoder(image_feat)   # [batch, hidden]
        t = self.lang_encoder(text_feat)      # [batch, hidden]

        # 2) 拼在一起，加上上一帧动作
        x = torch.stack([v, t, prev_actions], dim=1)  # [batch, 3, hidden]

        # 3) Transformer 让三个信号互相注意
        x = self.transformer(x)  # [batch, 3, hidden]

        # 4) 取最后一个位置 → 预测动作
        action = self.action_head(x[:, -1, :])  # [batch, 7]
        return action

# 使用示例：
# batch_size = 32
# model = SimpleVLAModel()
# img_feats = torch.randn(batch_size, 768)       # 从 CLIP 等视觉编码器来
# txt_feats = torch.randn(batch_size, 768)        # 从 GPT 等语言编码器来
# prev_act = torch.randn(batch_size, 7)           # 上一帧的机械臂动作
# predicted_action = model(img_feats, txt_feats, prev_act)
# print(predicted_action.shape)  # torch.Size([32, 7]) -- 7 个关节的目标角度
```

**逐部分解释**：

- **视觉编码器**：把原始像素压缩成 768 维向量——可以用 CLIP、DINO 等预训练模型，不需要从头学
- **语言编码器**：把"拿起那个红色的杯子"变成向量——可以用任何预训练 LLM
- **Transformer 层**：核心设计——让"看到的"和"听到的"互相注意。比如文字说"红色的"，Transformer 就会更关注图像中红色区域
- **动作头**：输出 7 个数字，对应机械臂 7 个关节的目标角度——这是机器人真正"动起来"的部分

### 示例 3：用语言模型做任务规划（SayCan 思路）

SayCan 的核心想法：让 LLM 当"大脑"做高层规划，让传统控制器当"小脑"执行低层动作。

```python
# 伪代码——展示 SayCan 的"语言驱动决策"思想

import numpy as np

# 预定义机器人能做的原子动作（affordances）
atomic_actions = [
    "grasp_object",    # 抓取物体
    "lift_arm",         # 抬升机械臂
    "move_to_location", # 移动到某位置
    "place_object",     # 放置物体
    "open_drawer",      # 拉开抽屉
]

# LLM 的 prompt：告诉它当前任务和可用动作
prompt = """
任务：把桌上的苹果放进冰箱。
机器人可以做以下动作：
""" + "\n".join(f"- {a}" for a in atomic_actions) + """

请为每个动作标注它与任务的匹配度（0.0-1.0），格式：
action,confidence
"""

# 调用 LLM（实际项目中用 OpenAI API 等）
llm_response = call_llm(prompt)
# 假设 LLM 返回：
# grasp_object,0.9
# move_to_location,0.85
# lift_arm,0.7
# place_object,0.6
# open_drawer,0.1

# 解析 LLM 的输出
plan = parse_llm_output(llm_response)

# 关键步骤：CLIP 算出每个动作在当前场景中的"可行性分数"
# 比如虽然 LLM 说"抓物体"很重要，但如果摄像头没看到手够得到的物体，CLIP 会给低分
clip_scores = {}
for action in atomic_actions:
    scene_text = f"a robot arm {action}"
    clip_score = compute_clip_similarity(camera_image, scene_text)
    clip_scores[action] = clip_score

# 最终决策 = LLM 的意图 × CLIP 的可行性
final_scores = {}
for action in atomic_actions:
    llm_conf = plan.get(action, 0.0)
    final_scores[action] = llm_conf * clip_scores[action]

# 选最高分的动作执行
best_action = max(final_scores, key=final_scores.get)
execute(best_action)
```

**逐部分解释**：

- LLM 理解"把苹果放进冰箱"意味着什么——它知道要先"抓"再"移动"再"放"
- 但 LLM 不知道"现在手能不能够到苹果"——这需要 CLIP 看摄像头来判断
- 两者相乘：LLM 给方向，CLIP 给现实感——这就是 SayCan 的名字由来（Do As I Can, Not As I Say）

## 知识地图

这份仓库的论文分类可以画成这样：

```
面向通用机器人的基础模型
│
├── 用现成基础模型赋能机器人模块
│   ├── 感知（Perception）—— 让机器人"看得懂"
│   │   CLIPort, LM-Nav, VLMap, ConceptFusion, HomeRobot, AnyLoc...
│   ├── 任务规划（Task Planning）—— 让机器人"想得清"
│   │   SayCan, Code as Policies, VIMA, TidyBot, RoboTool, ReKep...
│   ├── 动作生成（Action Generation）—— 让机器人"动得准"
│   │   SayTap, VoxPoser, Eureka, Manipulate-Anything...
│   ├── 训练数据生成（Training Data Generation）—— 让机器人"学得更多"
│   │   CACTI, ROSIE, GenSim, RoboGen, UniSim...
│   └── 世界建模（World Modeling）—— 让机器人"想象后果"
│       Gen2Act, NWM, RIGVid, NovaFlow, PhysWorld...
│
└── 通用机器人基础模型（从头训练）
    ├── 模仿学习路线（Imitation Learning）—— 看人干活然后学
    │   GATO, RT-1, RT-2, RT-X, Octo, OpenVLA, π0, π0.5, GEN-0...
    └── 强化学习路线（Reinforcement Learning）—— 自己试错然后学
        Q-Transformer, HOVER, BFM-Zero
```

## 关键论文速览

### 第一类：用现成 FM

- **CLIPort (2021)**：把 CLIP 的视觉理解和运输网络（Transporter Network）结合，让机器人能根据"把红色杯子放到盘子右边"这样的指令操作
- **SayCan (2022)**：LLM 做意图 + CLIP 做可行性，解决"语言说可以做但物理上做不了"的问题
- **Code as Policies (2022)**：让 LLM 直接生成 Python 代码作为机器人策略——代码就是控制策略
- **TidyBot (2023)**：个性化家务机器人，用 LLM 做个性化整理，记住主人的物品摆放习惯
- **RoboGen (2023)**：用生成式 AI 自动生成无限多的机器人仿真训练场景——解决"训练数据不够"的瓶颈

### 第二类：机器人专用 FM

- **RT-1 (2022)**：Google 的开创性工作。用 13 万个真实机器人轨迹训练 Transformer，第一次证明"一个大模型可以控制多种任务"
- **RT-2 (2023)**：把 Web 上的视觉-语言知识转移到机器人控制——模型见过互联网上的所有图片，所以看到没见过的物体也能推断用法
- **Octo (2023)**：开源版本。在 80 万条轨迹上训练，支持多种不同形态的机器人
- **OpenVLA (2024)**：开源 VLA 模型，基于 Llama 做语言底座，可商用
- **π0 (2024)**：Physical Intelligence 出品。用"流匹配（flow matching）"代替传统 Transformer，训练更快、泛化更强
- **π0.5 (2025)**：π0 的升级版，加入开放世界泛化能力——没见过的环境也能处理
- **GEN-0 (2025)**：Generalist AI 公司的报告。随着物理交互数据增多，模型能力持续扩展——验证了"缩放定律"在机器人领域同样成立

## 踩过的坑

1. **仿真到现实的鸿沟（Sim2Real）**：很多论文在 Mujoco / Isaac Gym 里表现完美，上真机器人就崩——仓库筛选条件明确要求"真实机器人 / 高保真仿真 / 真实数据集"，就是为了过滤掉纯仿真的工作

2. **LLM 太慢了**：GPT-4 推理一次要几秒，机器人控制需要毫秒级响应——所以 RT-1 / RT-2 用蒸馏后的专用小模型，而不是直接调 API

3. **动作接地（Action Grounding）**：LLM 知道"拿起杯子"，但不知道"关节角度应该变成多少"——这就是为什么 VLA 模型要把语言空间映射到动作空间

4. **数据稀缺**：真实机器人数据采集成本高、速度慢——催生了 RoboGen、GenSim 等"用 AI 生成训练数据"的方向

## 学到什么

1. **机器人正在从"专用"走向"通用"**——以前的机器人只会拧螺丝，未来的机器人能听懂人话、看懂环境、完成各种任务
2. **LLM 不只是聊天机器人**——它可以做规划、生成代码、生成训练数据、甚至生成仿真世界
3. **VLA 是当前的主流范式**——视觉 + 语言 + 动作一起学，是目前最有希望通向通用机器人的路径
4. **数据是最大瓶颈**——真实机器人数据太贵太少，所以"用 AI 生成数据"和"跨机器人共享数据"（如 RT-X）变得极其重要

## 延伸阅读

- 综述原文：[Toward General-Purpose Robots via Foundation Models: A Survey and Meta-Analysis](https://arxiv.org/abs/2312.08782)（arXiv:2312.08782）
- RT-1 论文：[Robotics Transformer for Real-World Control at Scale](https://arxiv.org/abs/2212.06817)
- RT-2 论文：[Vision-Language-Action Models Transfer Web Knowledge to Robotic Control](https://robotics-transformer2.github.io/)
- Octo 论文：[An Open-Source Generalist Robot Policy](https://octo-models.github.io/)
- π0 论文：[A Vision-Language-Action Flow Model for General Robot Control](https://arxiv.org/abs/2410.24164)
- [Awesome-LLM-Robotics](https://github.com/GT-RIPL/Awesome-LLM-Robotics) — 另一个相关论文清单，更偏重 LLM + 机器人
