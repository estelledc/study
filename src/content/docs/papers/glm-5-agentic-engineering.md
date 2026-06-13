---
title: GLM-5: From Vibe Coding to Agentic Engineering
来源: https://arxiv.org/abs/2602.15763
日期: 2026-06-13
分类: 机器学习
子分类: llm
provenance: pipeline-v3
---

## 是什么

GLM-5 是智谱 AI 和清华联合发布的新一代基础模型，核心命题是：**怎么让 AI 从"帮你写一段代码"进化到"自己独立做完一个完整项目"**。论文标题里的 "Vibe Coding" 指的是用 AI 写代码时那种"我说个感觉，你帮我实现"的随意用法；"Agentic Engineering" 则是让 AI 当独立工人——给你任务，它自己拆解、编码、调试、跑通全流程。

日常类比：Vibe Coding 像你去餐厅跟厨师说"来份好吃的"，厨师看你心情做；Agentic Engineering 像你在手机上点"帮我做顿晚饭"，AI 自己查菜谱、找食材、下锅、调味、端上桌——整个过程你不用管细节。

GLM-5 参数量 744B（每次激活 40B），用了 MoE 架构 + DSA（稀疏注意力），训练总 token 数 28.5 万亿。它在 8 个 agentic / reasoning / coding 基准上都超过 GLM-4.7 约 20%，在 LMArena Text 和 Code Arena 都是开源模型第一名。

## 为什么重要

不理解 GLM-5，下面这些事都没法解释：

- 为什么 2026 年初 LLM 赛道竞争焦点从"推理准确率"转向"长 horizon agent 能力"
- 为什么 SWE-bench 这种"真 GitHub issue 修复"基准突然成了新圣杯
- 为什么强化学习从"调对话风格"变成了"训 agent 自主决策"的核心手段
- 为什么"异步 RL"这个词在 LLM 论文里开始高频出现

## 核心要点

GLM-5 的贡献可以拆成**四条主线**：

### 1. DSA 稀疏注意力——让 128K 上下文不再烧钱

传统 Transformer 的注意力计算复杂度是 O(L^2)，128K 上下文意味着 128000^2 ≈ 1.6 次方的计算量。DSA 的核心思路是：**不是所有 token 都一样重要**。它用一个"闪电索引器"（lightning indexer）动态决定哪些 token 值得看，类似人读长文时自动跳过无关段落。

DSA 不是从头训练的——先在一个 dense（稠密）模型上 warm up 1000 步，再 joint train 20B tokens。实验证明 128K 上下文中约 90% 的 attention 条目是冗余的，DSA 把长序列的 attention 计算量降低了 1.5-2 倍。

### 2. 异步强化学习基础设施——训 agent 不再"等全部跑完"

之前训 RL，所有 rollout 必须同步完成才能更新模型——慢的那个卡住所有 GPU。GLM-5 的 "slime" 框架把**生成（rollout）和训练（update）解耦**，像工厂流水线：一个工位在不停干活，另一个工位不停处理上一批成品，两边不互相等。

### 3. 异步 Agent RL 算法——让 agent 从"做对给糖"变成"自己摸索长期策略"

RL for agent 的难点是：代码项目可能要跑几百步才"做完"，reward 极其稀疏。GLM-5 提出了异步 agent RL 算法，核心优化包括：

- **Token-in-Token-out vs Text-in-Text-out**：前者粒度更细，训练更稳
- **双边重要性采样**：处理 off-policy 数据时的数值稳定性
- **丢弃噪声样本**：过滤掉低质量的探索轨迹
- **DP-aware routing**：利用差分隐私机制加速

### 4. 全栈适配国产芯片

GLM-5 从第一天起就适配华为昇腾、摩尔线程、海光、寒武纪、昆仑芯、沐曦、燧原七种国产 GPU，做了混合精度 W4A8 量化 + 高性能 fusion kernels。

## 训练流水线：从预训练到 Agent 的三个 RL 阶段

GLM-5 的训练分三个阶段，像"基础教育 → 专业训练 → 社会实践"：

```
预训练 (27T tokens) → Mid-Training (扩展到 200K 上下文)
    ↓
推理 RL (Reasoning RL) — 学会"先思考再动手"
    ↓
Agent RL — 学会"用工具做复杂任务"
    ↓
General RL — 学会"全面综合，不偏科"
```

每个阶段之间用 **On-Policy Cross-Stage Distillation** 连接，防止"学了新的忘了旧的"（灾难性遗忘）。

## 实践案例

### 案例 1：Vibe Coding vs Agentic Engineering 的区别

Vibe Coding——让 AI 写一个页面：

```
用户: "帮我做一个待办事项页面，要好看的"
AI: [生成一个 HTML 文件]
```

Done。但如果用户说"改一下颜色"，AI 得从头再来，不知道上次改了哪里。

Agentic Engineering——让 AI 做同一个任务：

```
step_0: [clone 项目仓库]
step_1: [分析现有代码结构，识别样式文件位置]
step_2: [读取 color-scheme.css，了解当前配色系统]
step_3: [修改 CSS 变量 --primary-color 和 --bg-color]
step_4: [运行 build 命令检查编译错误]
step_5: [启动 dev server，验证页面显示正常]
step_6: [commit 变更，附提交信息 "chore: update color scheme"]
```

关键区别：agent 会**读代码 → 规划 → 执行 → 验证 → 提交**，整个流程闭环。RL 训练就是让模型学会这种"多步自主工作"的能力。

### 案例 2：异步 RL 的训练流程对比

同步 RL（以前做法）：

```
[GPU 集群]
├── rollout_0 → 等... → 等... → 等... → 全部完成 → update 模型
├── rollout_1 → 等... → 等... → 已完 → 等... → 全部完成 → update 模型
├── rollout_2 → 已完 → 已完 → 已完 → 已完 → 全部完成 → update 模型
└── rollout_N → 等... → 等... → 等... → 等... → 全部完成 → update 模型

问题：rollout_1 最长（比如跑代码要 30 秒），
      其他 99 个 GPU 都在 idle 等它。
```

异步 RL（slime 框架）：

```
[GPU 集群]
├── rollout_0 → 完成 → 送入训练队列 [随时可以更新]
├── rollout_1 → 还在跑... (30s)
├── rollout_2 → 完成 → 送入训练队列 [不等 rollout_1]
├── rollout_3 → 完成 → 送入训练队列 [不等 rollout_1]
└── trainer ← 只要队列里有数据就更新，不等全部完成

收益：GPU idle 率大幅下降。
```

### 案例 3：Agent RL 的学习轨迹——以"修一个前端 bug"为例

模型在 Agent RL 阶段学到的东西，可以类比成下面这个 trajectory：

```
观察 (observation): 用户在 GitHub 提了 issue "登录页面按钮点不了"
思考 (plan): 需要找到登录页面的代码 → 定位按钮组件 → 检查事件绑定
             → 修复 → 跑测试 → 提交 PR

执行 (actions):
  action_0: find_files("login", pattern="*.tsx")
    → 结果: src/pages/Login.tsx, src/components/LoginButton.tsx

  action_1: read_file("src/components/LoginButton.tsx")
    → 结果: onClick={handleLogin} 但 handleLogin 函数定义了却报错 undefined

  action_2: search_symbol("handleLogin", scope="Login.tsx")
    → 结果: 函数在文件第 45 行但不在作用域内

  action_3: edit_file("src/components/LoginButton.tsx",
       old="import { useForm } from 'react-hook-form'")
       new="import { useForm } from 'react-hook-form'\nimport { api } from '../api'"

  action_4: run_command("npm test -- --grep Login")
    → 结果: PASS (3 tests)

  action_5: run_command("git diff && git commit -m 'fix: add missing api import'"
```

RL 训练的目标是：让模型在类似的 observation 下，自己走出这条"正确的 action trajectory"。reward 信号来自测试是否通过、PR 是否被 merge 等最终结果。

### 案例 4：DSA 的"注意力选择"过程

假设给模型一份 128K token 的代码仓库上下文，它会这样分配注意力：

```
[代码仓库上下文 128K tokens]

token 0-500:   import 语句        → 关注度高（决定模块关系）
token 501-800: 类型定义            → 关注度中
token 801-1200: 工具函数           → 关注度低（DSA 会跳过大部分）
token 1201-1500: API 调用         → 关注度高（关键逻辑）
token 1501-end: 注释和空行         → 几乎不关注

传统 Dense Attention:  看 128K × 128K = 全部对比
DSA:                 只看约 10% 的关键 token × 128K

节省 ~90% 的 attention 计算量，同时不丢失关键信息。
```

## 踩过的坑

1. **RL reward 太稀疏导致不收敛**：一个 agent task 可能 50 步才有一个正 reward，前面 49 步的 credit assignment 几乎不可能。论文用 shaped reward + GRPO 缓解，但仍是开放问题。

2. **长 horizon 任务的探索爆炸**：50 步的决策空间是 |action|^50，指数级增长。论文用 early stopping 和 trajectory truncation 处理，但截断点选择很敏感。

3. **跨阶段蒸馏的权衡**：从 Reasoning RL 过渡到 Agent RL 时，模型可能"变聪明了但变懒了"——推理强了但工具调用少了。论文用 on-policy distillation 缓解但仍不完全。

4. **DSA 在极长上下文仍有损失**：虽然远好于其他稀疏注意力方案，但在 128K 的 RULER 评测上仍有 0.35 分下降。极端精确检索场景不适合 DSA。

## 适用 vs 不适用场景

**适用**：

- 端到端软件工程任务（修 bug、写 feature、跑 CI）
- 需要长 horizon 规划的多步任务（搜索、调研、写文档）
- 需要"自主工具调用 + 结果验证"的场景

**不适用**：

- 简单问答 / 翻译 / 短文本生成——用 vibe coding 就够了
- 实时性要求高的场景——agent 流程多、延迟高
- 没有明确 reward signal 的任务——RL 很难训

## 学到什么

1. **LLM 的能力边界正在从"单步生成"转向"多步自主执行"**——这是整个 AI 行业的范式转移
2. **稀疏注意力（DSA）证明长上下文不是不可解的难题**，关键在"动态分配注意力资源"
3. **异步 RL 是 agent training 的基础设施刚需**——同步 RL 在 agent 场景下算力浪费严重
4. **RL 训练 agent 的核心难点不是算法而是工程**——rollout 速度、fault tolerance、reward design 都是工程问题
5. **国产芯片适配不是附属品，而是第一优先级**——GLM-5 从第一天就适配国产 GPU，这对国内部署意义很大

## 历史小故事（可跳过）

- **2023**：ReAct 提出"思考 → 行动 → 观察"循环，agent 范式诞生
- **2024**：SWE-bench 发布，让 LLM 在真实 GitHub issue 上"修 bug"成为可能
- **2024-12**：DeepSeek-R1 用纯 RL 训推理能力，开启"RL for LLM"第二波
- **2025**：GLM-4.5 首次将 Agentic + Reasoning + Coding 统一到一个模型中
- **2026-02**：GLM-5 发布，DSA + 异步 RL 让 agent 能力大幅提升，成为开源模型新标杆

## 延伸阅读

- arXiv 2602.15763 — GLM-5 原论文
- [[agent-r1-2511]] — 同样关注 agent 的 RL 训练
- [[cot]] — CoT 推理的基础，是 Agent RL 的前置能力
- DeepSeek-V3.2 论文 — DSA 的提出者

## 关联

- [[agent-r1-2511]] —— Agent-R1 是另一个"用 RL 训 agent"的重要工作
- [[cot]] —— CoT 是 Agent RL 中"先思考"那一步的理论源头
- [[self-trained-verification]] —— agent 的 self-verification 是 RL reward 设计的一种方案
