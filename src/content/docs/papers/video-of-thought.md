---
title: Video-of-Thought: Step-by-Step Video Reasoning from Perception to Cognition
来源: https://arxiv.org/abs/2501.03230
日期: 2026-06-13
分类: 机器学习
子分类: 视频推理
provenance: pipeline-v3
---

# Video-of-Thought: 从感知到认知的逐步视频推理

## 一句话概括

让 AI 像人一样"想清楚"再回答复杂视频问题——不是凭直觉猜，而是先找目标、再追踪动作、最后结合常识推理出答案。

## 从日常类比开始

想象你在看一段监控录像：

- 别人问："那辆红色油罐车为什么爆炸了？"
- 如果你只"看"不"想"，你可能回答："有一辆车。"（这只是感知）
- 如果你会"想"，你会：
  1. 找到那辆红车（识别目标）
  2. 看着它一直开到撞上某样东西（追踪轨迹）
  3. 回想常识——油罐车撞东西会爆炸（动作分析 + 常识）
  4. 回答"因为它撞上了某物导致爆炸"（推理回答）
  5. 再检查一遍：刚才的推理有没有自相矛盾（验证）

**这就是 Video-of-Thought（VoT）做的事。** 以前的 AI 视频理解模型基本停在第 1 步——能认出"有辆车"，但不知道这辆车"做了什么"以及"为什么"。VoT 把人类看视频时的思考过程拆解成了 5 个明确的步骤。

## 核心问题

现有视频理解模型有两个瓶颈：

1. **感知不够细**：多数模型只能做"块级"（patch-level）分析，找不到像素级的精确定位。就像你只能看出屏幕上有个人，但看不清那个人的脸。
2. **认知不够深**：模型缺乏场景推理和常识判断能力，无法理解"为什么"和"会发生什么"。

## 方案：两层架构

### 第 1 层：MotionEpic —— 能"看得很细"的视频理解模型

MotionEpic 是一个视频多模态大模型（Video MLLM），核心创新是引入了 **STSG（时空场景图）**。

**什么是场景图？** 想象你在看一张照片，不是只看像素，而是用三元组描述它：

```
[人] --(拿着)--> [手机]
[车] --(停在)--> [路边]
[猫] --(坐在)--> [桌子上]
```

STSG 就是场景图在视频上的扩展——每一帧都有一个场景图，跨帧之间用"共指边"（coreference edges）把同一个物体在不同帧中的位置连起来，形成了一条"轨迹链"。

```
帧 1:  [红车] --(行驶)--> [道路]      帧 2:  [红车] --(行驶)--> [路口]      帧 3:  [红车] --(碰撞)--> [卡车]
   │                                     │                                     │
   └────────────── 共指边 ────────────────┘─────── 共指边 ───────────────────────┘
          (这条边把帧1、2、3中的"红车"连成一条轨迹)
```

MotionEpic 同时做两件事：
- **理解**视频（输入视频 → 输出场景图描述）
- **生成**场景图（输入视频 + 文字提示 → 输出对应的像素级定位）

训练时用了 5 种不同的学习目标，从粗粒度（判断视频和场景图是否匹配）到细粒度（给定一个框，找出这个物体在整个视频中的轨迹）。

### 第 2 层：VoT 推理框架 —— 能"想得很清楚"的推理流程

VoT 把复杂问题拆成 5 步，每步都有明确的输入输出：

```
原始视频 + 问题 "那辆红色油罐车为什么爆炸了？"
    │
    ▼
┌─────────────────────────────────────────┐
│ Step 1: 目标识别                          │
│   "视频中被提到的目标可能是什么？"         │
│   → 回答: 红色油罐车                       │
├─────────────────────────────────────────┤
│ Step 2: 对象追踪                          │
│   "给出红色油罐车的时空轨迹"                │
│   → 输出: 部分 STSG（包含该车的轨迹）        │
├─────────────────────────────────────────┤
│ Step 3: 动作分析                          │
│   "结合常识分析这个轨迹中的动作和含义"       │
│   → 回答: 红车快速驶向路口，与卡车发生碰撞    │
├─────────────────────────────────────────┤
│ Step 4: 回答评分与排序                    │
│   "对每个选项评分（1-10），给出理由"         │
│   → 选项 A "碰撞导致爆炸" 评 9 分           │
│   → 选项 B "刹车失灵" 评 3 分              │
│   → 选最高分                                │
├─────────────────────────────────────────┤
│ Step 5: 答案验证                          │
│   "从感知和常识两个角度检查答案是否自洽"     │
│   → 如果有矛盾，回到 Step 4 重新选           │
│   → 通过则输出最终答案                      │
└─────────────────────────────────────────┘
```

## 与 Chain-of-Thought 的关系

Chain-of-Thought（CoT）大家都知道——就是在回答前加一句"让我们逐步思考"，让模型先写出推理过程。CoT 在文本任务上效果很好，但在视频任务上效果有限，因为视频 CoT 太粗糙了。

VoT 不是简单地让模型"逐步思考"，而是**把思考过程结构化**：每一步都有明确的指令、明确的目标、明确的输出格式。而且，VoT 的步骤是从"低层感知"到"高层认知"递进的——就像人类思考的顺序。

## 代码示例

### 示例 1：VoT 五步推理流程（伪代码）

```python
class VideoOfThought:
    """Video-of-Thought 推理框架的主流程"""

    def __init__(self, motione pic_model):
        self.model = motione pic_model  # MotionEpic 模型

    def reason(self, video, question, options=None):
        # Step 1: 目标识别 — 从问题中找出视频中涉及的目标
        target = self.step1_identify_target(video, question)

        # Step 2: 对象追踪 — 用 STSG 定位目标的时空轨迹
        tracklet = self.step2_track_object(video, target)

        # Step 3: 动作分析 — 结合常识分析轨迹中的行为
        observation = self.step3_analyze_action(tracklet)

        # Step 4: 回答评分 — 对每个候选选项打分
        ranked_options = self.step4_rank_options(
            question, options, observation
        )
        best_answer = ranked_options[0]

        # Step 5: 答案验证 — 从感知和常识两个角度验证
        if not self.step5_verify(
            video, question, best_answer, tracklet, observation
        ):
            # 验证不通过，重新选答案
            best_answer = ranked_options[1]

        return best_answer

    def step1_identify_target(self, video, question):
        """让模型识别问题中涉及的目标"""
        prompt = f"""
        Given the question [{question}],
        what are the possible targets of the {video} mainly mentioned?
        """
        return self.model.generate(prompt)

    def step2_track_object(self, video, target):
        """让模型输出目标的 STSG 轨迹"""
        prompt = f"""
        Provide the tracklet of involved [{target}]
        by outputting the corresponding partial STSG.
        """
        return self.model.generate_stsg(video, prompt)

    def step3_analyze_action(self, tracklet):
        """结合常识分析动作"""
        prompt = f"""
        Combining all possible related commonsense,
        analyze the motion behavior based on the [{tracklet}]
        and the neighbor scenes within STSG.
        Describe the action observations and implications.
        """
        return self.model.generate(prompt)

    def step4_rank_options(self, question, options, observation):
        """对每个选项评分并排序"""
        scores = []
        for answer in options:
            prompt = f"""
            For question [{question}], given answer [{answer}],
            score the rationality (1-10) based on [{observation}]
            and commonsense, and output the rationale.
            """
            score = self.model.score(prompt)
            scores.append((answer, score))
        return sorted(scores, key=lambda x: x[1], reverse=True)

    def step5_verify(self, video, question, answer, tracklet, observation):
        """验证答案是否自洽"""
        prompt = f"""
        Given the STSG and question [{question}],
        verify answer [{answer}] by:
        1) checking if it aligns with pixel grounding (perception)
        2) checking if commonsense implications are consistent
           with [{observation}] (cognition)
        """
        result = self.model.generate(prompt)
        return "contradiction" not in result.lower()
```

### 示例 2：STSG 数据结构（Python 表示）

```python
from dataclasses import dataclass, field
from typing import List, Tuple


@dataclass
class BoundingBox:
    """2D 边界框：(x, y, width, height)"""
    x: float
    y: float
    w: float
    h: float


@dataclass
class Node:
    """场景图中的节点：一个物体检测框"""
    category: str       # 类别标签，如 "red_truck"
    embedding: List[float]  # CLIP 编码的特征向量
    bbox: BoundingBox         # 2D 边界框


@dataclass
class Edge:
    """场景图中的边：两个物体之间的关系"""
    subject: int        # 主语节点索引
    object_idx: int     # 宾语节点索引
    predicate: str      # 谓词/关系，如 "collides_with"


@dataclass
class SceneGraph:
    """单帧的场景图"""
    nodes: List[Node] = field(default_factory=list)
    edges: List[Edge] = field(default_factory=list)


@dataclass
class STSG:
    """
    时空场景图（Spatio-Temporal Scene Graph）：
    由多帧场景图 + 跨帧共指边组成
    """
    frames: List[SceneGraph] = field(default_factory=list)

    def add_temporal_edge(self, from_frame: int, to_frame: int,
                          from_node: int, to_node: int) -> None:
        """
        添加跨帧共指边：把同一物体在不同帧中的表示连起来
        这本质上就是"追踪"操作——把时间维度上的同一个物体
        连接成一条轨迹
        """
        for frame_sg in self.frames:
            if from_node < len(frame_sg.nodes):
                frame_sg.nodes.append(
                    Node(category="temporal_link",
                         embedding=[0.0] * 768,
                         bbox=BoundingBox(0, 0, 0, 0))
                )
```

这里的关键理解：
- `SceneGraph` = 一帧里的"谁和谁有什么关系"
- `STSG` = 多帧 `SceneGraph` + 跨帧边（把同一物体在不同帧中的位置连起来）
- 添加跨帧边 = 追踪物体 = 构建轨迹

## 实验结果

VoT 在 8 个复杂视频 QA 数据集上都刷新了最先进水平：

| 数据集 | 最先进基线 | MotionEpic + VoT | 提升幅度 |
|--------|-----------|------------------|---------|
| VLEP | 71.0% | **73.4%** | +2.4% |
| STAR (Int.) | 70.0% | **71.5%** | +1.5% |
| STAR (Pre.) | 70.4% | **72.6%** | +2.2% |
| NExT-QA | 75.5% | **76.0%** | +0.5% |
| Causal-VidQA (Acc@D) | 75.7% | **81.2%** | **+5.5%** |

特别值得注意的是：在零样本设置下（不针对目标数据集微调），VoT 的效果提升比微调时更大。这说明 VoT 的推理能力具有**跨域迁移潜力**。

## 关键发现

1. **CoT 对视频推理的提升有限**：简单加一句"让我们逐步思考"效果不大。VoT 的结构化推理才是关键。
2. **STSG 特征确实有用**：把场景图融入视频模型后，性能有稳定提升。
3. **MoTionEpic 隐式融合 STSG 优于 Video-LLaVA 显式融入 STSG**：说明模型自主学习场景图表示比外部强行注入更有效。
4. **验证步骤很重要**：去掉验证机制后，零样本性能下降了 3 个百分点。感知验证和常识验证都不可省略。

## 总结

Video-of-Thought 的核心贡献是两件事：

- **MotionEpic**：一个能理解并生成时空场景图的视频多模态模型，实现了像素级的时空定位。
- **VoT 框架**：一个五步推理框架，把复杂视频问题拆解为从感知到认知的递进链条，是目前首个成功将 CoT 引入视频推理的工作。

它告诉我们：要让 AI 理解视频，不仅要让它"看得更细"（fine-grained perception），还要让它"想得更深"（cognitive reasoning），而且要有结构化的思考流程。
