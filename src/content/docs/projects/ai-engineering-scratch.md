---
title: "从零构建 AI 系统 —— rohitg00/ai-engineering-from-scratch 学习笔记"
来源: https://github.com/rohitg00/ai-engineering-from-scratch
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 一、这个项目是什么

想象你要学做一道复杂的菜。大多数教程给你两个选择：要么只看别人直播（看视频、读博客），要么直接扔给你一套工业级厨房设备（PyTorch、TensorFlow），让你自己猜火候。

**ai-engineering-from-scratch** 选了第三条路：先让你用锅碗瓢盆把每道基础菜做一遍——从切菜（线性代数）到调味（反向传播）到摆盘（Agent 工程），然后才带你走进厨房。

这个项目的作者是 Rohit Gupta，他同时也是热门项目 Agent Memory 的创作者。整套课程：

- 503 节课，20 个阶段
- 约 320 小时学习量
- 覆盖 Python、TypeScript、Rust、Julia 四种语言
- 每节课都产出一个可复用的工件（prompt、skill、agent 或 MCP server）
- 完全免费，MIT 协议

核心教学理念是 **Build It / Use It**：你先用纯数学手写一遍算法，再用 PyTorch/sklearn 跑一遍同样的东西。这样你用框架的时候，心里清楚它到底在干什么。

## 二、20 个阶段概览

课程像一个金字塔，从数学地基一直盖到 AI 应用的屋顶：

| 阶段范围 | 主题 | 核心理念 |
|---|---|---|
| P0-P1 | 环境 + 数学基础 | 不懂线性代数和微积分，后面全是黑盒 |
| P2-P3 | 经典 ML + 深度学习 | 先手写感知机和反向传播，再碰 PyTorch |
| P4-P6 | 视觉 / NLP / 语音 | 每种模态都从像素、词元、波形开始 |
| P7 | Transformer 深潜 | 自注意力机制是一切现代 AI 的起点 |
| P8 | 生成式 AI | GAN、VAE、扩散模型，全部从零实现 |
| P9 | 强化学习 | RLHF 和 AlphaGo 的根基 |
| P10-P11 | LLM 从零 + 工程化 | 从 tokenizer 到预训练、微调、RAG |
| P12-P13 | 多模态 + 工具协议 | 视觉-语言融合、MCP、A2A 协议 |
| P14-P16 | Agent 工程 + 自主系统 + 多智能体 | 从 Agent Loop 到 Swarm |
| P17-P18 | 生产基础设施 + 安全对齐 | 部署、量化、可观测性、伦理 |
| P19 | 毕业项目 | 17 个端到端产品 + 9 个深度构建轨道 |

**学习路线建议**：不要按顺序硬啃。先用课程自带的 `/find-your-level` 做十道题定位起点，然后跳读。但记住：跳过底层，上面出了问题你就不知道哪里断了。

## 三、核心概念拆解

### 概念 1：MOTTO — PROBLEM — CONCEPT — BUILD IT — USE IT — SHIP IT

每节课遵循同样的六步循环：

1. **MOTTO**：一句话概括核心思想
2. **PROBLEM**：一个具体的痛点场景
3. **CONCEPT**：图表和直觉讲解
4. **BUILD IT**：不用框架，从零手写算法
5. **USE IT**：用 PyTorch/sklearn 重跑一遍
6. **SHIP IT**：产出可复用的 prompt / skill / agent / MCP server

这保证了你学完每一节课，不只是"看懂了"，而是手里多了一个真的能用的东西。

### 概念 2：Build It / Use It 双轨制

这是整个课程最独特的设计。以 Transformer 的自注意力机制为例，你不会直接调 `torch.nn.MultiheadAttention`。你先自己用 NumPy 手写 Q、K、V 的矩阵乘法，体会维度变化，然后再看 PyTorch 的封装。

好处是什么？当你后来遇到 attention mask 形状不对的 bug 时，你能一眼看出是哪段矩阵操作出了问题——因为你就是当初写那段矩阵操作的人。

### 概念 3：每节课产出一个"工件"

别的课程学完只有知识，这个课程学完有个作品集。每节课的 `outputs/` 目录下都有一个实际工具：

- **Prompt**：可以直接粘贴到 AI 助手里的专家级提示词
- **Skill**：可以丢进 Claude/Cursor/Codex 的 SKILL.md
- **Agent**：部署为自主工作的 Agent Loop
- **MCP Server**：接入任何 MCP 兼容客户端

课程提供一键安装脚本 `python3 scripts/install_skills.py`，全部 503 个工件可以直接装到你的日常工具链里。

## 四、代码示例

### 示例 1：手写 Agent Loop（Phase 14, Lesson 1）

这是整个课程中最精华的示例之一。约 120 行纯 Python，零依赖，展示了现代 AI Agent 的核心循环：

```python
# phases/14-agent-engineering/01-the-agent-loop/code/agent_loop.py

def run(query: str, tools: dict[str, callable], max_steps: int = 10) -> str:
    """Minimal ReAct-style agent loop.

    The agent receives a query and a dictionary of available tools.
    It loops: ask the LLM what to do -> execute tool calls if any ->
    return the final answer.
    """
    history = [{"role": "user", "content": query}]

    for step in range(max_steps):
        # 1. Ask the LLM
        response = llm_call(history)

        # 2. Does it want to use a tool?
        if response.tool_calls:
            for call in response.tool_calls:
                tool_fn = tools[call.name]
                result = tool_fn(**call.args)
                history.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": str(result),
                })
            continue

        # 3. No more tool calls — return the answer
        return response.content

    raise Exception("Agent exceeded max steps")
```

类比理解：Agent Loop 就像一个餐厅里的小二。你（用户）把订单（query）递给小二，小二看菜板上有没有现成的菜（可用工具）。如果有，就去厨房做（调 tool），把做好的菜端回来，再判断还需要什么。如果不需要再做菜了，就把最终成品端给你。

课程在 `outputs/` 里还产出了配套的 skill 文件和 prompt 调试器，可以直接装到你的 AI 编辑器里用。

### 示例 2：从零手写 Softmax 分类器（Phase 2-P3 路线）

这个例子展示了 Build It / Use It 双轨制的威力：

```python
# === BUILD IT: 从零手写 Softmax 分类器 ===

import numpy as np

def softmax(scores):
    """Numerically stable softmax."""
    # 减去最大值防止 exp 溢出（这就是"从零手写"时才会踩的坑）
    shifted = scores - np.max(scores, axis=-1, keepdims=True)
    exp_scores = np.exp(shifted)
    return exp_scores / np.sum(exp_scores, axis=-1, keepdims=True)

def cross_entropy_loss(probs, target_idx):
    """Negative log-likelihood for a single sample."""
    return -np.log(probs[target_idx] + 1e-9)

def train(X, y, W, b, lr=0.1, epochs=100):
    """One-layer neural net: X @ W + b -> softmax -> cross-entropy."""
    for epoch in range(epochs):
        # Forward
        scores = X @ W + b
        probs = softmax(scores)
        loss = np.mean([cross_entropy_loss(p, yi)
                        for p, yi in zip(probs, y)])

        # Backward (manual gradient — 这就是为什么课程要求先手写)
        N = X.shape[0]
        d_probs = probs / N
        d_probs[np.arange(N), y] -= 1 / N
        dW = X.T @ d_probs
        db = np.sum(d_probs, axis=0)

        # Update
        W -= lr * dW
        b -= lr * db

        if epoch % 20 == 0:
            print(f"Epoch {epoch}: loss = {loss:.4f}")

# 用随机数据演示
X = np.random.randn(100, 20)
y = np.random.randint(0, 3, size=100)
W = np.random.randn(20, 3)
b = np.zeros(3)
train(X, y, W, b)
```

```python
# === USE IT: 同样的事情，用 PyTorch 跑一遍 ===

import torch
import torch.nn as nn

model = nn.Sequential(
    nn.Linear(20, 3),
    nn.LogSoftmax(dim=1)
)
criterion = nn.NLLLoss()
optimizer = torch.optim.SGD(model.parameters(), lr=0.1)

X_t = torch.randn(100, 20)
y_t = torch.randint(0, 3, (100,))

for epoch in range(100):
    optimizer.zero_grad()
    output = model(X_t)
    loss = criterion(output, y_t)
    loss.backward()
    optimizer.step()
    if epoch % 20 == 0:
        print(f"Epoch {epoch}: loss = {loss.item():.4f}")
```

类比理解：Build It 就像你亲手组装一辆自行车的每个零件，知道螺丝拧紧到什么程度。Use It 就像你直接买一辆成品车骑上去。等你后来遇到"车链子掉了"（梯度消失、loss 爆炸）的时候，亲手组装过的人知道怎么修，没组装过的只能找人帮。

## 五、适合什么样的人

**适合**：
- 想真正理解 AI 原理、不只是调 API 的开发者
- 有基本编程能力（任何语言都行，Python 有帮助）
- 喜欢"知其所以然"的学习方式
- 需要为 AI 工程面试做准备

**可能不适合**：
- 只想快速用 API 搭个 demo 的人（这课程不教你走捷径）
- 没有数学基础且愿意补的人（线代、微积分、概率论都会涉及）

## 六、我的学习建议

1. 先用 `/find-your-level` 定位起点，跳过你已经会的阶段
2. 每节课的 `outputs/` 目录一定要看——那是你实际能带走的东西
3. Build It 环节不要跳。跳过手写、直接看 PyTorch，等于白学一半
4. 学到 Phase 14（Agent 工程）时，把输出的 skill 装进你的 AI 编辑器，边学边用
5. 每个阶段结束前，跑一遍 `/check-understanding <phase>` 自测
6. 学完 Phase 11 后，试着用 RAG 给自己做一个项目知识库——这就是 Phase 19 毕业项目的缩小版

## 七、总结

这个课程最打动人的地方是它的诚实：它不假装 AI 很简单。它从线性代数的矩阵乘法开始，一步步带你走到多智能体蜂群。每个阶段都在前面的基础上堆叠，不会突然冒出一个你没见过的概念。

503 节课、320 小时，不是一蹴而就的事。但每节课都给你一个真实可用的工件，这意味着你学完哪怕只完成三分之一，也积累了一套真正能用的 AI 工具集。

比知识更重要的，是**你亲手写过每一行核心代码**——这种底气，是看视频和抄教程给不了的。
