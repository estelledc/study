---
title: Tree of Thoughts — 让 LLM 像下棋一样多想几步再答
来源: 'Yao et al., "Tree of Thoughts: Deliberate Problem Solving with Large Language Models", NeurIPS 2023'
日期: 2026-06-01
子分类: 模型与训练
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Tree of Thoughts（**ToT**，思维树）是一种**让大语言模型不再"一条道写到黑"，而是每一步先想几个候选、自己给每个候选打分、再选最有希望的那一支继续往下走**的推理框架。日常类比：CoT 像考试时一笔一画地往下写，写错了发现已经太晚；ToT 像下棋——每步先看三个选点，掂量优劣，挑一个走，走不通可以悔棋换条路。

最直观的例子是论文里的 Game of 24（用 4 个数字 + 加减乘除凑出 24）：

```
输入：4 9 10 13
CoT 直接答：13 - 9 = 4, 4 + 10 = 14, 14 + 4 = 18    错
ToT：第一步生成 5 个算式候选 → 每个让模型自评 sure/maybe/impossible
     → 留下评分最高的几支 → 再扩第二步 → ...
最终找到：(10 - 4) * (13 - 9) = 24    对
```

Game of 24 上 CoT 正确率 **4%**，ToT 直接干到 **74%**——同一个 GPT-4，只是把"采样一次"换成"搜索一棵树"。

## 为什么重要

不理解 ToT，下面这些事都没法解释：

- 为什么 OpenAI o1 / DeepSeek R1 都说自己"先思考再回答"——内化的就是 ToT 这种 deliberate reasoning
- 为什么 CoT 上不去的题型（数独、24 点、密码学），换成搜索 + 自评就能突破
- 为什么 2024 后 LLM Agent 框架（LangGraph / LATS）几乎都内置"分支 + 回溯 + 评分"
- 为什么"算力换正确率"成了新规模律——ToT 是这条路的早期实证

## 核心要点

ToT 把推理过程拆成 **四件套**：

1. **Thought（思考片段）**：不是一个 token，而是一段"可独立评估的中间状态"。Game of 24 里一个 thought 是一步算式；写作里是一份大纲；填字游戏里是填一个词。

2. **Generator（生成器）**：给定当前状态，让 LM 产生 k 个候选 next thought。两种方式——*Sample*（独立采样 k 份）适合开放空间；*Propose*（一次性让模型列出 k 个）适合候选有限。

3. **Evaluator（评估器）**：让 LM **自己给自己打分**。两种方式——*Value*（独立给每个状态打 1-10 分或 sure/maybe/impossible）；*Vote*（把一组候选放一起让模型挑最好）。

4. **Search（搜索算法）**：决定怎么走这棵树。*BFS* 每层保留 top-b 个分支（Game of 24 用 b=5）；*DFS* 一支走到底，碰壁就回溯（填字游戏用 DFS）。

四件套加起来，就是把 [[cot]] 的"一条线"升级成"一棵带剪枝的树"。

## 实践案例

### 案例 1：Game of 24，看搜索带来什么

```
输入：4 9 10 13，目标 24
Step 1 候选（Generator 提议 5 个）：
  13 - 9 = 4        Evaluator: sure
  10 - 4 = 6        sure
  4 + 9 = 13        maybe
  9 / 10 = ...      impossible
  ...
留 top-2，继续扩第二步、第三步。
最终找到：(10 - 4) × (13 - 9) = 6 × 4 = 24
```

CoT 一次性写完三步，第二步选错就全错。ToT 每步留多个分支，相当于"棋谱搜索"。代价：**100 次 LM 调用 vs CoT 的 1 次**，GPT-4 上每题约 $0.74。

### 案例 2：5×5 填字游戏，DFS 回溯救场

填字游戏没法 BFS（分支爆炸），ToT 用 DFS：

- 每步填一个词 → Evaluator 评估"这个词放进去会不会和其他线索矛盾"
- 评估为"impossible"立刻回溯，换一个候选
- CoT 字级正确率 **16%**，ToT 干到 **60%**

回溯能力是 CoT 永远学不会的——CoT 写下去就回不来。

### 案例 3：创意写作，Vote 比 Value 更可靠

让 LM 写"以四个随机句子结尾的连贯短文"。开放任务没法用 sure/maybe 这种硬标签，ToT 改用 *Vote*：让模型把 5 个候选大纲放一起，选最连贯的那个。人类盲评 **ToT > CoT**（41% vs 21% 偏好率）。

### 案例 4：ToT 的最小骨架长什么样

不看官方仓库的 800 行 Python，用伪代码看它真正在做什么：

```python
def solve(problem):
    frontier = [initial_state(problem)]
    for step in range(max_depth):
        candidates = []
        for state in frontier:
            # 1. 生成器：每个状态扩 k 个分支
            for thought in generate(state, k=5):
                candidates.append(state + thought)
        # 2. 评估器：让 LM 给每个候选打分
        scored = [(s, evaluate(s)) for s in candidates]
        # 3. 搜索：BFS 留 top-b
        frontier = top_k(scored, b=5)
    return best(frontier)
```

generate 和 evaluate 都是对 LLM 的额外调用——这就是 100x token 成本的来源。

## 踩过的坑

1. **搜索成本爆炸**：100x CoT 的 token 消耗。Game of 24 这种小问题还能接受，长上下文任务几乎跑不动。

2. **Evaluator 过度自信**：让 LM 给自己打分，常常虚高。论文里 Game of 24 evaluator 给"impossible"标签的精度还行，给"sure"的精度只有约 60%——很多被它判定"sure"的支线其实走不通。

3. **任务分步靠人写**：论文里每个 benchmark 的"一步是什么"都是手工定义的（24 点 = 3 步算术，填字 = 25 步填词）。换个任务你得重新设计分步规则，没法对任意自然语言问题自动展开。

4. **不是所有任务都受益**：有标准答案、答案空间窄、能局部判断对错的题（数学、逻辑、规划）收益最大；开放问答、闲聊、需要外部知识的任务，ToT 的"自评"几乎没意义。

## 适用 vs 不适用场景

**适用**：

- 答案唯一可验证：数学竞赛、24 点、SAT 题、代码 unit test
- 状态可局部评估：填字、数独、规划问题
- 算力充裕：研究环境、离线推理、最高质量优先

**不适用**：

- 开放问答、闲聊、写邮件——"自评"信号太弱
- 实时低延迟场景——100x 算力一般业务用不起
- 需要外部世界反馈的任务——交给 [[react]] 风格 agent 更合适
- 模型本身已经过 RL 训练（如 o1/R1）——内化的搜索可能已经超过外部 ToT

## 历史小故事（可跳过）

- **2022/01**：[[cot]] 论文（Wei 等）发表，"先想再答"在 GSM8K 上把 GPT-3 从 17% 提到 56%
- **2022/05**：Kojima 的 "Let us think step by step" 把 CoT 简化成一句咒语
- **2022/10**：ReAct（Yao，同一作者）把 CoT 接上工具调用
- **2023/05**：本论文 ToT 出现——把 CoT 的"线"升级成"树"
- **2023/08**：Graph of Thoughts 把树进一步扩成 DAG
- **2024/09**：OpenAI o1 发布，"先思考再答"被 RL 内化进模型，外部树搜索退场

ToT 是这条脉络的**关键中转站**：它第一次系统性地把"LLM + 搜索 + 自评"三件事拼成一个可验证的范式。

## 学到什么

1. **System 1 vs System 2**：CoT 是直觉式快思（一条线，一次过），ToT 是审慎式慢思（多分支，可回溯）。Kahneman 的双系统理论被搬进了 LLM 推理
2. **算力换正确率是新规模律**：扩展不只是参数和数据，"推理时计算"（test-time compute）也能扩——ToT 是早期证据，o1 把它系统化
3. **LM-as-Evaluator 是把双刃剑**：让模型自己打分省去了奖励模型，但自评偏差会层层放大。靠谱的做法是给 evaluator 留外部 verifier 出口
4. **任务分解仍是手艺活**：ToT 没解决"怎么自动把问题拆步骤"——这是后续 LATS、Reflexion、o1 真正在攻的点
5. **第一性原理推一下**：传统 LM 推理是 P(answer | question)，一次采样定生死；ToT 改成 max over paths 的 P(answer | question, search)，把搜索这个变量从隐式变显式。等到 RL 训练学会"在权重里搜索"，外部树就可以拿掉——这就是从 ToT 到 o1 的本质跃迁

## 延伸阅读

- 论文 PDF：[Tree of Thoughts](https://arxiv.org/abs/2305.10601)（NeurIPS 2023，14 页正文）
- 官方代码：[princeton-nlp/tree-of-thought-llm](https://github.com/princeton-nlp/tree-of-thought-llm)（约 800 行 Python，三个 benchmark 全在）
- 后续工作：Graph of Thoughts（树→图）、LATS（ToT + MCTS）、Reflexion（自评 + 自纠）
- [[cot]] —— ToT 的直接前身，不读 CoT 看 ToT 会跳得太快
- [[react]] —— 同一作者的 agent 框架，思路一脉相承

## 关联

- [[cot]] —— ToT 把 CoT 的"一条线"扩成"一棵树"
- [[react]] —— 同一作者，思考 + 行动 + 观察的 agent 范式
- [[transformer]] —— ToT 的底座，所有 thought 都跑在 transformer 上
- [[reinforcement-learning]] —— o1/R1 用 RL 把 ToT 内化进权重
