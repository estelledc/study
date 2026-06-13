---
title: Qwen-VLA — 跨任务、环境与具身的统一视觉-语言-动作建模
来源: 'Qwen Team, "Qwen-VLA: Unifying Vision-Language-Action Modeling across Tasks, Environments, and Robot Embodiments", arXiv:2605.30280, 2026; https://arxiv.org/abs/2605.30280; https://github.com/QwenLM/Qwen-VLA'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：一个「会看、会听、会动手」的通才教练

想象你请了一位私人教练，目标是教会不同学员完成各种身体任务：

- 学员 A 是**双臂桌面机器人**，要学「把红杯子放到盘子里」；
- 学员 B 是**移动底盘**，要学「沿走廊走到厨房再左转」；
- 学员 C 是**第一人称视角的人类演示者**，录像里只有手和物体，没有关节角读数。

传统做法像**每个学员配一个专属教练**：抓取的教练只懂 7 自由度机械臂，导航教练只懂离散转向，换机器人就要换模型、换输出头、换数据格式。结果是：在 LIBERO 上很强，到了真实 ALOHA 双臂平台或 R2R 导航就「不会了」。

**Qwen-VLA** 想走另一条路：**一位通才教练，同一套大脑（权重），靠「今天你是谁、任务是什么、控制约定怎样」的文字说明来切换模式**。教练先「看懂场景 + 听懂指令」，再输出**连续动作轨迹**——不是离散 token「向左」，而是「未来 0.5 秒内关节角/末端位姿/导航航点怎么变」。

论文核心主张：**操作（manipulation）、视觉-语言导航（VLN）、轨迹预测、人类 egocentric 演示，都可以放进同一个「动作-轨迹预测空间」里学**；再通过 **embodiment-aware prompt conditioning**（具身感知提示）告诉模型当前是 WidowX、ALOHA 还是导航 agent，而**不需要为每个平台单独做 output head**。

官方实现：Qwen3.5-4B 视觉-语言骨干 + 约 1.15B 参数的 **DiT flow-matching action decoder**。

---

## 是什么

**Qwen-VLA** 是阿里 Qwen 团队 2026 年发布的**统一具身基础模型（unified embodied foundation model）**，把 Qwen 多模态栈从「感知、理解、推理」延伸到「连续动作与轨迹生成」。

输入典型包括：

| 模态 | 例子 |
|------|------|
| 视觉 | 第三人称相机、腕部相机、导航 RGB |
| 语言 | 「把绿色球放进碗里」「沿走廊走到沙发旁」 |
| 具身条件 | 文本描述：机器人型号、控制频率、动作维度、坐标系约定 |

输出：**下一时刻或未来窗口内的连续 action / trajectory**（经 flow matching 解码）。

两个主要 checkpoint：

- **Qwen-VLA-Base**：大规模联合预训练后的基座；
- **Qwen-VLA-Instruct**：在 Base 上经 SFT + 仿真 RL（PPO）后的指令跟随/闭环策略版。

---

## 为什么重要

### 1. 从「技能专家」到「通才演员」

具身智能长期按任务切模型：一个 LIBERO 专用策略、一个 R2R 导航模型、一个 ALOHA 微调版。Qwen-VLA-Instruct **只训练一次、多平台联合评估**，在多项 benchmark 上**匹配或超过**各自单独微调的专家模型。

### 2. 统一表示降低碎片化

 manipulation 的 joint delta、navigation 的 waypoint、egocentric 的手部轨迹，被映射到**共享的动作-轨迹空间**。好处是：视觉 grounding、空间推理、语言对齐可以在任务间迁移。

### 3. 强 OOD 与零样本动态操作

论文报告：真实 ALOHA 上 OOD 平均成功率 **76.9%**（颜色/实例/位置/背景/指令变化）；DOMINO 动态抓取 benchmark 上**零样本**成功率 **26.6%**，说明模型学到的不只是固定桌面模板。

---

## 核心概念

### 1. Vision-Language-Action（VLA）

**VLA** = 多模态大模型 + **动作头**。与纯 VLM 的区别：VLM 输出文本；VLA 输出**可执行的控制信号**（连续向量序列）。

Qwen-VLA 的数据流（概念上）：

```
[图像/视频帧] + [语言指令] + [具身描述 prompt]
        ↓
   Qwen3.5-4B VLM（理解场景与目标）
        ↓
   DiT Action Decoder（flow matching 生成轨迹）
        ↓
   连续 action chunk → 机器人控制器 / 导航栈
```

### 2. 统一动作-轨迹框架（Unified Action-and-Trajectory Framework）

不同任务的历史标签格式各异（7-DoF delta、SE(2) waypoint、人手 6D pose…）。Qwen-VLA 在训练前把它们**规范化到统一维度/时间窗**（具体 padding、mask、时间对齐见论文与代码），使**一个 decoder** 预测所有类型。

直觉：就像把所有运动都录成「同一套骨骼动画格式」，再让同一个生成模型去学。

### 3. Embodiment-Aware Prompt Conditioning

切换机器人**不改权重**，只在 prompt 前拼接描述，例如：

- 控制类型：joint position / end-effector delta / holonomic base；
- 动作维度、控制频率、相机视角说明；
- 平台名称：WidowX、ALOHA bimanual、导航 agent 等。

这让**一套参数服务多 embodiment**，避免「每平台一个 head」的工程负担。

### 4. DiT + Flow Matching 动作解码器

**DiT**（Diffusion Transformer）在这里作 **flow-matching policy head**：从噪声逐步「流」向目标动作轨迹，比直接回归高维向量更稳定，也便于建模多模态动作分布（同一指令多种可行抓取姿态）。

与离散 autoregressive action token 相比，flow matching 更适合**高维连续控制**。

### 5. 四阶段渐进训练（Progressive Training Recipe）

官方博客与论文强调「先语言→动作结构，再视觉落地，再任务微调，再闭环 RL」：

| 阶段 | 名称 | 要点 |
|------|------|------|
| I | **T2A**（Text-to-Action） | **冻结 VLM**，只训 action decoder；纯文本+具身 prompt → 动作轨迹，建立「语言解压到控制」的 prior |
| II | **CPT**（Continual Pretraining） | **解冻 VLM + decoder**，混合机器人轨迹、egocentric 人类数据、仿真合成、VLN、通用 VLM 数据 → **Qwen-VLA-Base** |
| III | **SFT** | 多任务监督微调（操作+导航+VQA+空间 grounding）；另有一条真实机器人遥操作分支 |
| IV | **RL** | 从 SFT  checkpoint 在 **SimplerEnv** 上用 **PPO** 优化任务成功；产出 **Qwen-VLA-Instruct**；论文称 RL 增益可迁移到未见环境与 embodiment |

### 6. 预训练数据版图（五类来源）

1. **机器人操作轨迹**：公开 >1 万小时 + 内部 >1000 小时真机 + >800 万条仿真轨迹；
2. **人类 egocentric**：Ego4D、EPIC-KITCHENS、EgoDex、EgoVerse、Xperience 等；
3. **合成仿真**：vision-conditioned 与 text-to-action 大规模模板轨迹；
4. **视觉-语言导航**：R2R/RxR 等长 horizon 指令跟随；
5. **通用 VLM 数据 + 细粒度动作描述**：约 4.8 万条、13 维标注，对齐自然语言与执行细节。

---

## 架构一图流

```text
                    ┌─────────────────────────────────────┐
                    │  Embodiment prompt（文本前缀）       │
                    │  e.g. "ALOHA dual-arm, 14-dim..."   │
                    └─────────────────┬───────────────────┘
                                      │
  Camera RGB ──► Qwen3.5-4B VLM ◄── Language instruction
       │              │
       │              │ hidden states / cross-attn cond
       ▼              ▼
              DiT Flow-Matching Decoder
                       │
                       ▼
              Action trajectory chunk
              (continuous, horizon H)
                       │
                       ▼
              Low-level controller / VLN executor
```

---

## 关键实验数字（便于建立直觉）

**Qwen-VLA-Instruct（统一通才，非 per-benchmark 单独微调）**：

| 领域 | Benchmark | 指标 | 结果 |
|------|-----------|------|------|
| 桌面操作 | LIBERO | 成功率 | **97.9%** |
| 仿真操作 | Simpler-WidowX | 成功率 | **73.7%** |
| 双任务难度 | RoboTwin-Easy / Hard | 成功率 | **86.1% / 87.2%** |
| 室内导航 | R2R Val-Unseen | OSR / SR | **69.0% / 57.5%** |
| 多语言导航 | RxR Val-Unseen | SR | **59.6%** |
| 真机 ALOHA | 多任务 OOD 平均 | 成功率 | **76.9%** |
| 动态抓取 | DOMINO（零样本） | SR | **26.6%** |

对比语境：许多 baseline 是**每个 benchmark 单独微调的专家**；Qwen-VLA 是**一次联合训练的多任务通才**。

---

## 代码示例 1：Embodiment-Aware Prompt 与统一推理接口

下面用**伪代码**说明「换机器人只改 prompt、不改模型」的用法（与 OpenVLA / RT-2 类接口类似，便于零基础理解；非官方 verbatim API）：

```python
from dataclasses import dataclass
from typing import Any

import numpy as np
import torch


@dataclass(frozen=True)
class EmbodimentSpec:
    """描述当前机器人与控制约定 —— 会写进文本 prompt。"""
    name: str
    action_dim: int
    control_hz: float
    action_space: str  # "joint_delta" | "ee_delta" | "waypoint_se2"
    cameras: tuple[str, ...]


EMBODIMENTS = {
    "widowx": EmbodimentSpec(
        name="WidowX 250 7-DoF manipulator",
        action_dim=7,
        control_hz=5.0,
        action_space="ee_delta",
        cameras=("third_person", "wrist"),
    ),
    "aloha": EmbodimentSpec(
        name="ALOHA bimanual dual-arm",
        action_dim=14,
        control_hz=50.0,
        action_space="joint_delta",
        cameras=("cam_high", "cam_left_wrist", "cam_right_wrist"),
    ),
    "vln_agent": EmbodimentSpec(
        name="Habitat VLN-CE mobile agent",
        action_dim=3,  # e.g. (forward, turn, stop) or continuous waypoint
        control_hz=2.0,
        action_space="waypoint_se2",
        cameras=("rgb_front",),
    ),
}


def build_embodiment_prompt(spec: EmbodimentSpec) -> str:
    """论文中的 embodiment-aware conditioning：纯文本前缀。"""
    cams = ", ".join(spec.cameras)
    return (
        f"[Embodiment] Platform: {spec.name}. "
        f"Action space: {spec.action_space}. "
        f"Action dimension: {spec.action_dim}. "
        f"Control frequency: {spec.control_hz} Hz. "
        f"Camera views: {cams}. "
        f"Predict the next action chunk in the unified trajectory format."
    )


class QwenVLAClient:
    """概念性客户端：同一 checkpoint，不同 embodiment 字符串。"""

    def __init__(self, checkpoint: str, device: str = "cuda"):
        self.device = device
        # 真实使用时从 HuggingFace / ModelScope 加载
        self.model = self._load(checkpoint)

    def _load(self, checkpoint: str) -> Any:
        raise NotImplementedError("load Qwen-VLA weights here")

    @torch.inference_mode()
    def predict_action_chunk(
        self,
        images: dict[str, np.ndarray],
        instruction: str,
        embodiment_key: str,
        horizon: int = 16,
    ) -> np.ndarray:
        spec = EMBODIMENTS[embodiment_key]
        prompt = build_embodiment_prompt(spec) + f"\n[Task] {instruction}"

        # VLM 编码视觉+语言；DiT decoder 做 flow-matching 采样
        cond = self.model.encode(images=images, text=prompt)
        traj = self.model.sample_actions(
            cond,
            action_dim=spec.action_dim,
            horizon=horizon,
            num_flow_steps=10,
        )
        return traj.cpu().numpy()  # shape: (horizon, action_dim)


# --- 同一模型，两种任务 ---
client = QwenVLAClient("Qwen/Qwen-VLA-Instruct")

pick_traj = client.predict_action_chunk(
    images={"third_person": img_desk, "wrist": img_wrist},
    instruction="Pick up the green ball and place it in the bowl.",
    embodiment_key="widowx",
)

nav_traj = client.predict_action_chunk(
    images={"rgb_front": img_hallway},
    instruction="Walk down the corridor and stop near the couch.",
    embodiment_key="vln_agent",
    horizon=8,
)
```

**读代码要点**：

- `EmbodimentSpec` → 文本前缀，告诉模型「动作向量有几维、什么语义」；
- `predict_action_chunk` 返回的是**一段轨迹**，通常只执行前几步再 replan（receding horizon）；
- `widowx` 与 `vln_agent` 共用 `self.model` 权重，差异仅在 prompt 与 `action_dim`。

---

## 代码示例 2：Flow-Matching 动作解码（训练与采样直觉）

Flow matching 学习向量场 \(v_\theta(x_t, t \mid \text{cond})\)，把噪声 \(x_0 \sim \mathcal{N}(0, I)\) 「推」向真实动作 \(x_1\)。下面是**教学用简化版**，帮助理解 DiT decoder 在干什么（非官方实现）：

```python
import torch
import torch.nn as nn


class ActionFlowMatchingHead(nn.Module):
    """极简 flow-matching 头：cond 来自 VLM hidden states。"""

    def __init__(self, action_dim: int, horizon: int, cond_dim: int, hidden: int = 512):
        super().__init__()
        self.action_dim = action_dim
        self.horizon = horizon
        flat = action_dim * horizon
        self.net = nn.Sequential(
            nn.Linear(flat + cond_dim + 1, hidden),  # +1 for time t
            nn.SiLU(),
            nn.Linear(hidden, hidden),
            nn.SiLU(),
            nn.Linear(hidden, flat),
        )

    def forward(self, x_t: torch.Tensor, t: torch.Tensor, cond: torch.Tensor) -> torch.Tensor:
        """
        x_t: (B, H, A) 当前噪声轨迹
        t:   (B, 1) 时间 in [0, 1]
        cond:(B, C) VLM 条件向量
        返回预测速度场 v，shape 与 x_t 相同
        """
        b = x_t.shape[0]
        x_flat = x_t.reshape(b, -1)
        inp = torch.cat([x_flat, cond, t], dim=-1)
        v_flat = self.net(inp)
        return v_flat.reshape_as(x_t)


def flow_matching_loss(
    head: ActionFlowMatchingHead,
    action_target: torch.Tensor,
    cond: torch.Tensor,
) -> torch.Tensor:
    """单步 CFM 损失：随机 t，线性插值路径，回归 v = x1 - x0。"""
    b = action_target.shape[0]
    x1 = action_target  #  ground-truth action chunk
    x0 = torch.randn_like(x1)
    t = torch.rand(b, 1, device=x1.device)
    # 广播 t 到 (B, H, A)
    t_expand = t.view(b, 1, 1)
    x_t = (1 - t_expand) * x0 + t_expand * x1
    v_target = x1 - x0
    v_pred = head(x_t, t, cond)
    return nn.functional.mse_loss(v_pred, v_target)


@torch.no_grad()
def sample_action_chunk(
    head: ActionFlowMatchingHead,
    cond: torch.Tensor,
    action_dim: int,
    horizon: int,
    steps: int = 10,
) -> torch.Tensor:
    """Euler 积分：从噪声积分到 t=1。"""
    b = cond.shape[0]
    x = torch.randn(b, horizon, action_dim, device=cond.device)
    dt = 1.0 / steps
    for i in range(steps):
        t = torch.full((b, 1), i / steps, device=cond.device)
        v = head(x, t, cond)
        x = x + dt * v
    return x


# --- 训练一步（Stage II CPT / Stage III SFT 中的 decoder 部分）---
head = ActionFlowMatchingHead(action_dim=7, horizon=16, cond_dim=2048)
batch_actions = torch.randn(8, 16, 7)   # 来自统一格式后的 demonstration
batch_cond = torch.randn(8, 2048)       # 来自 Qwen VLM

loss = flow_matching_loss(head, batch_actions, batch_cond)
loss.backward()

# --- 推理 ---
pred = sample_action_chunk(head, batch_cond[:1], action_dim=7, horizon=16)
```

**与 Qwen-VLA 的对应关系**：

- 真实系统用 **DiT** 替代上面的小 MLP，规模约 **1.15B**；
- **Stage I T2A** 可在**无图像**时用 `cond` 仅来自文本 embedding 预训 decoder；
- **Stage II** 起 `cond` 来自完整 VLM 多模态融合；
- **Stage IV RL** 在仿真里用 PPO 优化「执行 pred 轨迹后的任务成功」，而不是只最小化 MSE。

---

## 与其他 VLA / 机器人基础模型的对比（概念层）

| 维度 | 典型专家策略（π₀、GR00T 单任务版等） | Qwen-VLA |
|------|--------------------------------------|----------|
| 任务范围 | 常以 manipulation 为主 | manipulation + VLN + 轨迹预测 + egocentric |
| 多平台 | 常需 per-robot 微调或专用 head | 文本 embodiment prompt，共享权重 |
| 骨干 | 各自 VLM / 专用架构 | Qwen3.5-4B 统一多模态栈 |
| 动作生成 | diffusion / flow / MLP 各异 | DiT flow-matching decoder |
| 训练范式 | 多为 SFT 或单域 RL | T2A → CPT → SFT → RL 四阶段 |

Qwen-VLA 不是要证明「一个模型在所有单项上都是 SOTA」，而是证明：**统一建模在多项上可以同时接近专家，并在 OOD 与跨 embodiment 上更省工程、更可扩展**。

---

## 局限与开放问题（论文语境下的诚实边界）

1. **长 horizon 与失败恢复**：四阶段训练仍主要在仿真 RL；真实世界长任务、抓取失败后的重规划仍是开放问题。
2. **动态与接触丰富场景**：DOMINO 零样本 26.6% 有亮点，但距离可靠工业部署仍有差距。
3. **安全与 sim-to-real**：统一 prompt 切换 embodiment 时，若 prompt 写错控制约定，可能产生危险动作——工程上需要外层安全壳与标定。
4. **算力与延迟**：4B VLM + 1.15B DiT 对边缘机载计算机是负担；实际部署需 distillation 或 action chunk 异步执行。
5. **数据许可与复现**：部分内部真机数据未公开，复现绝对数字需关注官方后续权重与 eval 脚本发布情况。

---

## 零基础速记卡

| 术语 | 一句话 |
|------|--------|
| VLA | 看+听→直接输出机器人动作，而不只是文字 |
| Unified action-trajectory space | 不同任务的动作都变成同一种张量格式来学 |
| Embodiment prompt | 用文本告诉模型「你是哪种机器人、动作几维」 |
| DiT + flow matching | 用扩散式生成器产出平滑、多模态可行的连续轨迹 |
| T2A | 先不用图像，学会「语言→动作结构」 |
| Qwen-VLA-Instruct | Base + SFT + 仿真 RL 后的「能闭环做任务」版本 |

---

## 进一步阅读

- 论文：[arXiv:2605.30280](https://arxiv.org/abs/2605.30280)
- 代码与 benchmark 表：[GitHub QwenLM/Qwen-VLA](https://github.com/QwenLM/Qwen-VLA)
- 官方博客：[Qwen-VLA: From Understanding the World to Acting in It](https://qwen.ai/blog?id=qwenvla)
- 前置了解：Qwen3.5 多模态骨干、LIBERO / SimplerEnv / VLN-CE (R2R, RxR) benchmark 定义

---

## 小结

Qwen-VLA 回答的是一个很大但很自然的问题：**能不能像通才一样，用同一套视觉-语言-动作模型，同时做抓取、导航、跨机器人控制？**

论文给出的答案是：**可以**——通过统一动作-轨迹空间、具身感知文本条件、大规模异构数据联合预训练，以及从 T2A 到 RL 的渐进 recipe，把 Qwen 的「理解世界」延伸到「在世界中行动」。对初学者，最值得带走的是两个设计：**不要把 embodiment 写死在网络结构里（写进 prompt）**，以及**不要把操作和导航拆成两个永远不相见的小模型（拆成同一 decoder 的不同轨迹格式）**。

如果你已有 Qwen-VL 使用经验，迁移到 Qwen-VLA 的心智模型很简单：**多模态 chat 的最后一步，从生成 UTF-8 文本换成生成 float32 动作向量序列**——其余的数据混合、prompt 工程与 sim-to-real 护栏，才是具身智能真正难的地方。
