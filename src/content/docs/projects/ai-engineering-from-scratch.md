---
title: AI Engineering from Scratch 学习笔记
来源: https://github.com/rohitg00/ai-engineering-from-scratch
日期: 2026-06-13
分类_原始: AI / 机器学习
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# AI Engineering from Scratch 学习笔记

## 一、这个课程是什么

想象一下，你想学做菜。大多数教程会直接给你一锅调味料包，告诉你"倒进去、煮五分钟、开吃"。你确实吃到了菜，但你永远不知道味道是怎么来的，换一种食材就懵了。

`rohitg00/ai-engineering-from-scratch` 这个项目的理念正好相反：它告诉你从种麦子开始，到磨面粉、揉面、发酵、烘烤，每一步都亲手做一遍。当你亲手从零实现过一个神经网络之后，再去看 PyTorch 的代码，你就不再是看魔术，而是在看一个你已经亲手组装过的机器。

这个项目由 Agent Memory 的作者 rohitg00 创建，目前已经获得 31.8k Star、5.2k Fork。整个课程包含 503 节课、20 个阶段，预计学习时长约 314 小时。使用 Python、TypeScript、Rust、Julia 四种语言。每节课都产出可以直接使用的 artifact：一个 prompt、一个 skill、一个 agent 或者一个 MCP server。

## 二、课程的整体结构

20 个阶段像盖房子一样一层层叠上去：

1. **Phase 0 — 环境搭建**（12 节课）：开发环境、Git、GPU、Docker、调试工具
2. **Phase 1 — 数学基础**（22 节课）：线性代数、微积分、概率论、优化理论
3. **Phase 2 — 机器学习基础**（18 节课）：线性回归、逻辑回归、决策树、SVM、聚类
4. **Phase 3 — 深度学习核心**（13 节课）：感知机、反向传播、激活函数、优化器、正则化
5. **Phase 4 — 计算机视觉**（28 节课）：CNN、目标检测、分割、GAN、扩散模型、ViT
6. **Phase 5 — NLP**（29 节课）：词嵌入、注意力、机器翻译、RAG
7. **Phase 6 — 语音与音频**（17 节课）：ASR、TTS、语音克隆、音乐生成
8. **Phase 7 — Transformer 深入**（16 节课）：自注意力、BERT、GPT、MoE、Flash Attention
9. **Phase 8 — 生成式 AI**（15 节课）：VAE、GAN、扩散模型、视频生成、3D 生成
10. **Phase 9 — 强化学习**（12 节课）：MDP、Q-Learning、DQN、PPO、RLHF
11. **Phase 10 — 从零构建 LLM**（27 节课）：分词器、预训练、指令微调、RLHF、量化
12. **Phase 11 — LLM 工程**（17 节课）：Prompt 工程、RAG、微调、Function Calling
13. **Phase 12 — 多模态 AI**（25 节课）：CLIP、LLaVA、视频语言模型、具身智能
14. **Phase 13 — 工具与协议**（23 节课）：MCP、A2A、OpenTelemetry
15. **Phase 14 — Agent 工程**（42 节课）：Agent 循环、记忆、规划、框架对比
16. **Phase 15 — 自主系统**（22 节课）：自改进、自我编码、浏览器 Agent
17. **Phase 16 — 多 Agent 与群体**（25 节课）：群体智能、辩论、协商、一致性
18. **Phase 17 — 基础设施与生产**（28 节课）：推理部署、GPU 扩展、可观测性
19. **Phase 18 — 伦理与对齐**（30 节课）：RLHF、Constitutional AI、红队测试
20. **Phase 19 — 毕业设计**（87 个项目）：完整的端到端项目

## 三、每节课的设计模式

这是这个课程最精妙的地方。每节课都遵循一个固定的六步流程：

```
MOTTO → PROBLEM → CONCEPT → BUILD IT → USE IT → SHIP IT
```

- **Motto**：一句话概括核心思想
- **Problem**：展示不知道这个概念会带来什么具体痛苦
- **Concept**：用图表和直觉解释，还没有代码
- **Build It**：从零开始手写实现，不使用任何框架
- **Use It**：用同样的东西，但通过 PyTorch / sklearn 等生产库来跑一遍
- **Ship It**：产出可以直接使用的 artifact

"Build It" 和 "Use It" 的拆分是这个课程的主线。你先亲手写一遍算法，然后再用生产库跑一遍。你会真正理解框架在做什么，因为那些代码是你自己写过的简化版本。

每节课的文件夹结构都是统一的：

```
phases/<NN>-<phase-name>/<NN>-<lesson-name>/
├── code/            # 可运行的实现（Python、TypeScript、Rust、Julia）
├── docs/
│   └── en.md        # 课程叙述
└── outputs/         # 这节课产出的 prompt、skill、agent 或 MCP server
```

## 四、核心概念：从手写到框架

课程的核心哲学是"先理解，再使用"。以**注意力机制**（Attention）为例。

大多数教程会直接告诉你 Transformer 的代码。但这门课的做法是：你先理解为什么要发明注意力机制（RNN 无法并行、长距离依赖丢失），然后从零手写一个自注意力层，计算 Q、K、V 的矩阵乘法，最后才看 PyTorch 的 `nn.MultiheadAttention` 是怎么优化你的手写版本的。

以 **Agent 循环**（Phase 14, Lesson 1）为例。这是一个 ~120 行的纯 Python 实现，零依赖：

```python
def run(query, tools):
    history = [user(query)]
    for step in range(MAX_STEPS):
        msg = llm(history)
        if msg.tool_calls:
            for call in msg.tool_calls:
                result = tools[call.name](**call.args)
                history.append(tool_result(call.id, result))
            continue
        return msg.content
    raise StepLimitExceeded
```

这段代码的核心逻辑很简单：把用户输入放进历史，让 LLM 决定做什么，如果有工具调用就执行工具并把结果追加到历史，如果没有就返回答案。超过最大步数就报错。这 120 行代码就是 Phase 14 所有 Agent 框架的基础。

## 五、核心概念：Build It / Use It 双轨学习

再来看一个更具体的代码示例——**线性回归从零实现**（Phase 2, Lesson 2）。

第一步，Build It：完全从零手写，只使用基本数学运算。

```python
import numpy as np

def fit(X, y, lr=0.01, epochs=1000):
    """从零实现线性回归：y = wX + b"""
    n_samples, n_features = X.shape
    w = np.zeros(n_features)
    b = 0

    for _ in range(epochs):
        # 前向传播：预测
        predictions = np.dot(X, w) + b

        # 计算梯度（MSE 损失的导数）
        dw = (2 / n_samples) * np.dot(X.T, (predictions - y))
        db = (2 / n_samples) * np.sum(predictions - y)

        # 更新参数
        w -= lr * dw
        b -= lr * db

    return w, b

# 使用示例
X = np.array([[1], [2], [3], [4], [5]], dtype=float)
y = np.array([2, 4, 6, 8, 10], dtype=float)
w, b = fit(X, y)
print(f"y = {w[0]:.2f}x + {b:.2f}")  # y = 2.00x + 0.00
```

第二步，Use It：用同样的数据，用 scikit-learn 跑一遍做对比。

```python
from sklearn.linear_model import LinearRegression

model = LinearRegression()
model.fit(X, y)
print(f"y = {model.coef_[0]:.2f}x + {model.intercept_:.2f}")  # y = 2.00x + 0.00
```

两个结果完全一样。但更重要的是，你现在知道 `LinearRegression` 内部在做的事情和你手写的完全一致——它就是在做梯度下降更新 w 和 b。区别只在于它做了更多工程优化：学习率调度、收敛检测、批量梯度下降版本等。

## 六、课程亮点

**每个 artifact 都是可安装的。** 不是课后作业，而是你安装到 AI 助手里真正会用的工具。用 `python3 scripts/install_skills.py` 一次安装全部 503 个产出。

**内置 Agent 技能。** 课程自带 Claude、Cursor、Codex 等工具的 Skills，提供 `/find-your-level` 十题水平测试和 `/check-understanding <阶段>` 阶段测验。

**四门语言的实现。** 每个算法都用 Python、TypeScript、Rust、Julia 实现，对比不同语言的写法差异。

**所有课程已完成。** 截至 2026 年 6 月，503 节课全部标记为 ✅。

## 七、学习建议

如果你是完全零基础，建议按顺序从 Phase 0 开始。如果你已经有编程基础但不懂 AI，可以从 Phase 1 数学基础开始。如果你已经熟悉传统 ML，可以直接跳到 Phase 3 深度学习核心或更高阶段。

最关键的提醒：不要跳过基础阶段然后到后面卡住。数学是地板，Agent 和生产是屋顶。跳过楼层然后问"为什么天花板掉下来了"是没有用的。

## 八、关键词对照

| 术语 | 常见误解 | 实际含义 |
|------|---------|---------|
| Build It | 写练习题 | 从零实现一个完整的算法，不用任何框架 |
| Ship It | 作业结束 | 产出一个可安装、可复用的 artifact |
| Artifact | 实验结果 | 你可以粘贴到日常工作中的 prompt / skill / agent |
| Find Your Level | 随便测测 | 十题测评，映射到你的起点阶段和预计学习时长 |
| Phase 19 | 额外加分 | 87 个端到端项目，每个 90 分钟到 35 小时不等 |
