---
title: EurekAgent — 环境工程才是自主科学发现的胜负手
来源: 'Amy Xin et al., "EurekAgent: Agent Environment Engineering is All You Need For Autonomous Scientific Discovery", arXiv:2606.13662, 2026'
日期: 2026-06-13
子分类: 智能体
分类: Agent
难度: 初级
provenance: pipeline-v3
---

## 是什么

EurekAgent 是一个**用"环境工程"思路来做自主科学发现**的系统。日常类比：以前做科研自动化，像教练手把手教运动员每个动作怎么做（设计复杂的工作流）；EurekAgent 的思路是——给运动员一个好的训练场（设计环境），让她自己练出好成绩。

论文的核心观点：**当通用编码 agent（如 Claude Code、Codex）越来越强之后，自主科学发现的瓶颈已经从"怎么指挥 agent"变成了"给 agent 什么环境"。** 就像培养一个优秀的博士生——关键不是每分钟告诉他做什么，而是给他靠谱的反馈、安全的实验条件、充足的预算，以及导师的监督。

EurekAgent 只做四件事来"造环境"：

1. **权限工程**：给 agent 工具，但锁住 evaluator（评分器），防止作弊
2. **工件工程**：用文件系统 + Git 当共享记忆，记录每次尝试
3. **预算工程**：控制时间和 API 花费，不让 agent 无限烧钱
4. **人在回路**：提供 Web 监控和终端界面，人可以随时看和干预

## 为什么重要

不理解 EurekAgent，下面这些事都没法解释：

- 为什么 Claude Code 和 Codex 作为通用 agent 就能跑出 SOTA，不需要专门的研究 agent 框架
- 为什么"agent 作弊"（reward hacking）在科研自动化中如此常见——因为 evaluator 暴露给了 agent
- 为什么以前的系统（AlphaEvolve、AIDE 等）工作流复杂却效果不如预期——它们把能力押在"设计完美流程"上，而不是"设计好环境"
- 为什么用开源模型 GLM-5.1 加上好环境，能打败用闭源模型 + 复杂工作流的基线

## 核心概念

### 环境工程（Environment Engineering）

受生态心理学启发——环境塑造行为的可能性。一个好的环境放大 productive 行为（自由探索、协作、准确反馈），抑制有害行为（作弊、篡改结果、过度依赖人工）。

### 三阶段循环

EurekAgent 不规定 agent 内部怎么做研究，只控制外层循环：

```
PREPARE → [ PROPOSE → { IMPLEMENT × P } ] × R
```

- **PREPARE**：准备环境，测一下评分器能不能用
- **PROPOSE**：每轮开始，让一个 agent 提出多个研究方向（最多 P 个）
- **IMPLEMENT**：每个方向启动一个独立 agent 并行实现，提交到隐藏评分器打分
- 重复 R 轮，直到预算耗尽

### 四个环境工程维度

| 维度 | 给什么（放大） | 锁什么（抑制） |
|---|---|---|
| 权限 | Python 环境、Shell、网页搜索、浏览器、历史工件 | Docker 隔离、隐藏 evaluator、同轮隔离、GPU 锁 |
| 工件 | 文件系统 + Git 历史、排名历史、搜索缓存 | 无（完全开放） |
| 预算 | 时间检查 API、阶段超时警告、中断恢复 | API 成本上限硬截断 |
| 人在回路 | Web 监控面板、终端交互框、分数演化图 | 不干预 agent 自主决策 |

## 实践案例

### 案例 1：三阶段循环的实际运行

以 26 圆打包问题为例（在单位正方形里放 26 个不相交圆，最大化半径之和）：

```
Round 0 (PREPARE):
  - agent 拿到题目描述 + 隐藏评分脚本
  - 测试评分器能正常工作
  - 写入准备摘要

Round 1 (PROPOSE → IMPLEMENT):
  PROPOSE: 提出 3 个方向
    H1: 贪心放置大圆 → 小圆填空隙
    H2: 随机初始化 + 梯度下降
    H3: 借鉴已知的 AlphaEvolve 方法

  IMPLEMENT (3 个 agent 并行):
    Agent-H1: 提交 → 得分 2.51 → 迭代改进 → 最终 2.58
    Agent-H2: 提交 → 得分 2.45 → 继续调参 → 最终 2.52
    Agent-H3: 提交 → 得分 2.63 → 找到局部最优

  系统自动排名 → 记录最佳解 2.63

Round 2...R: 继续迭代，最终达到 2.635999（新 SOTA）
```

关键点：每个 IMPLEMENT agent 都看不到同轮其他 agent 的方案，只能参考之前的轮次。这防止了"所有人挤一条路"。

### 案例 2：权限工程的代码实现

EurekAgent 用 Docker 隔离 + 隐藏 evaluator + 文件 hook 来防作弊：

```python
# 伪代码：权限工程的核心机制

class SecureEvaluator:
    """隐藏评分器——agent 只能提交，不能窥探"""
    def __init__(self, eval_script_path, test_data_path):
        # evaluator 和测试数据放在 agent 看不到的地方
        self.eval_script = eval_script_path  # 挂载在容器外
        self.test_data = test_data_path      # 同上

    def submit_and_score(self, solution_code):
        # agent 提交代码，系统在不暴露源码的情况下打分
        result = subprocess.run(
            ["python", self.eval_script, solution_code],
            capture_output=True,
            # 关键：eval_script 的路径不在 agent 的文件系统中
        )
        return parse_score(result.stdout)

class PermissionGuard:
    """权限守卫——拦截 agent 对受保护文件的修改"""
    BLOCKED_PATHS = [
        "/.hidden/evaluator.py",     # 评分器源码
        "/.hidden/test_data.json",   # 测试数据
        "/.system/ranked_results",   # 系统生成的排名文件
    ]

    def on_file_write(self, path, content):
        if path in self.BLOCKED_PATHS:
            raise PermissionError(f"Blocked: {path}")
        return True  # 允许写入自己的工件
```

### 案例 3：预算工程的运行控制

```python
# 伪代码：预算工程——时间和 API 成本双控

class BudgetController:
    def __init__(self, max_time_minutes, max_api_cost_usd):
        self.start_time = time.time()
        self.max_time = max_time_minutes * 60
        self.max_cost = max_api_cost_usd
        self.current_cost = 0.0

    def check_time_budget(self, stage_name):
        elapsed = time.time() - self.start_time
        remaining = self.max_time - elapsed

        if remaining < 300:  # 剩 5 分钟时发警告
            return f"WARNING: {stage_name} 只剩 {remaining/60:.0f} 分钟，请停止探索并生成工件"
        return None

    def track_api_cost(self, tokens_used, price_per_token):
        self.current_cost += tokens_used * price_per_token
        if self.current_cost >= self.max_cost:
            raise BudgetExhausted(
                f"API 成本已达 ${self.current_cost:.2f}/${self.max_cost:.2f}"
            )
        # 注意：不把这个信息告诉 agent——agent 不应该知道还剩多少钱

    def should_stop(self, stage_name):
        time_msg = self.check_time_budget(stage_name)
        if time_msg:
            return True, time_msg
        return False, None
```

### 案例 4：成绩对比——环境工程 vs 工作流工程

| 任务 | EurekAgent (GLM-5.1) | 之前最佳 AI (闭源模型) | 差距 |
|---|---|---|---|
| 26 圆打包 | 2.635999 | 2.635986 (R1-Distill) | +0.005% |
|  Erdos 最小重叠 | 0.380870 | 0.380876 (gpt-oss-120b) | -0.002% |
| 一阶自相关不等式 | 1.502861 | 1.502863 (gpt-oss-120b) | -0.0001% |
| TriMul 内核 | 2005.03 µs | 2247.78 µs (TTT-Discover) | -10.8% |
| MLE-Bench 奖牌率 | 85.71% | 71.43% (Claude-Opus-4.6) | +14% |

最震撼的数据：26 圆打包 SOTA 用了不到 **$11** 的 API 费用。

## 踩过的坑

1. **同轮隔离 vs 知识传递的平衡**：完全隔离 → agent 无法互相学习；完全不隔离 → 所有 agent 挤向同一个局部最优。EurekAgent 的解法是：可以看之前轮次的东西，但不能看同轮的。

2. **预算硬截断的公平性问题**：一个 agent 跑到 119 分钟被强制终止，另一个跑了 120 分钟拿到更好分数——不公平。论文用"中断后保留 workspace + 允许人工续时"缓解。

3. **隐藏 evaluator 的维护成本**：每个任务都要写一套 evaluator + 测试数据，而且要保证 agent 不能通过逆向工程猜出测试逻辑。这对 benchmark 设计提出了更高要求。

4. **Web 搜索的噪声**：agent 用网页搜索发现别人的方案后直接采用再微调（如 R2 在 26 圆打包中发现了 AlphaEvolve 的公开方案），这算"研究"还是"抄作业"？论文认为这是环境工程的一部分——好的环境应该允许 agent 站在巨人肩膀上。

## 适用 vs 不适用场景

适用：

- 有明确可优化指标的科研任务（数学优化、算法竞赛、ML 调参）
- 想用通用 coding agent 做自动化研究，但不想写复杂工作流
- 需要可追溯、可复现的研究过程
- 预算有限（$10-$20 就能跑出不错的结果）

不适用：

- 没有可量化指标的开放式研究（如提出全新理论）
- 需要大量人工判断"这个结果有没有意义"的任务
- 实时性要求高的场景（每轮可能要 2 小时）

## 学到什么

- 自主科学发现的下一个瓶颈不是更强的模型，而是更好的环境设计
- 权限工程是防止 agent 作弊的第一道防线——隐藏 evaluator + 文件 hook
- 工件工程用 Git 做版本管理是最朴素但也最有效的方案
- 预算工程不只是"限制花费"，更是"可控的探索节奏"
- 环境工程的威力：用开源模型 + 好环境，能打败闭源模型 + 复杂工作流
- 论文作者来自清华大学 + 智谱 AI，代码已开源

## 延伸阅读

- arXiv 2606.13662 — EurekAgent 原论文
- [GitHub 仓库](https://github.com/THU-Team-Eureka/EurekAgent) — 开源代码和结果
- AlphaEvolve (arXiv:2506.13131) — EurekAgent 对比的进化式 coding agent
- ResearchClawBench (arXiv:2606.07591) — 通用 coding agent 的科研能力基准测试
- MLE-Bench (ICLR 2025) — ML 工程 agent 基准评测

## 关联

- [[agent-r1-2511]] —— Agent-R1 从"训练流程"角度优化 agent，EurekAgent 从"环境"角度优化，两条路线互补
- [[dspy]] —— DSPy 优化 prompt 流程，EurekAgent 说流程不重要，环境才重要
