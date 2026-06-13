---
title: AgentRefine — 用跑团式训练让 AI 学会从错误中自我纠正
来源: 'Fu, He, Wang et al., "AgentRefine: Enhancing Agent Generalization through Refinement Tuning", ICLR 2025'
日期: 2026-06-13
分类: 机器学习
子分类: 智能体
provenance: pipeline-v3
---

## 是什么

假设你和朋友玩一个全新的桌游——规则你不熟，地图是第一次见，道具名字也没听过。你上手第一步就走错了，游戏主持人（DM）告诉你"这个动作在这个房间里无效"。你停下来想一想，换个合法动作，继续推进。三小时后你通关了。

这就是 AgentRefine 想教 AI 学会的核心能力：**在陌生环境里犯错了能根据反馈自己纠正，而不是背死答案**。

技术定义：AgentRefine 是一种**通过"跑团式合成数据 + 选择性损失训练"来增强 LLM Agent 泛化能力的方法**。它用 GPT-4o 生成大量五花八门的虚拟环境（像 DM 设计新副本），让模型在里面犯错、收到反馈、自己纠正，然后只在"纠正后的正确动作"上做反向传播——让模型看过错误但只学会对的。

类比总结：传统 Agent 训练像背题库——刷完 1000 道题，遇到第 1001 道直接崩。AgentRefine 像培养解题思维——给你无限多道随机生成的新题，每道题做完告诉你"这步错了，再想想"，让你学会"怎么纠正"，而不是"记住答案"。

## 为什么重要

不理解 AgentRefine 的问题设定，下面这些现象会一直困惑你：

- 为什么你用 Agent-FLAN 训出来的 Agent 在训练环境里 80% 成功率，换个环境直接掉到 20%？不是数据不够，是模型在背"观察-动作"对应关系。
- 为什么 GPT-4o 当 Agent 泛化能力比 LLaMA-3-8B 好那么多？差距不是参数量，是 GPT-4o 在预训练中见过了"纠正自己"这种模式。
- 为什么推理时加一个"错了让我反思"（Reflexion）就能大幅提升成功率？因为推理时的反思机制在弥补训练时没学到的自我纠正能力。
- 为什么 2025 年起 Agent 方向的研究重心从"更好的规划"转向"更好的纠错"？因为规划可以用搜索和工具替代，但纠错必须模型自己会。

一句话：**泛化能力是 Agent 的硬通货，而自我纠正是泛化的底层机制**。AgentRefine 第一次用明确的训练范式证明了这一点。

## 核心要点

AgentRefine 的训练流水线分四步，每一步对应跑团游戏的一个环节：

**第一步：环境合成（DM 写剧本）**

GPT-4o 扮演 DM，根据随机采样的人物设定（职业、性格、兴趣）生成一个"副本"：
- 环境描述：有哪些房间、物品，用 JSON 表示层级关系
- 任务目标：明确可完成（如"找到钥匙开门离开"）
- 可用动作：每个动作有名字、参数、合法性正则（如 `goto <room_name>` 用 `goto\s+\w+` 校验）
- 干扰元素：故意塞一些误导性物品和房间，让模型更容易走错

需要至少 2 个"犯错-纠正"轮次才算合格轨迹，否则重新生成。最多尝试 4 次 LLM 调用。

**第二步：轨迹生成（DM + 玩家同时操作）**

同一个 LLM 同时扮演 DM 和玩家：
- DM 回合：思考当前状态 -> 提供观察（根据玩家动作反馈） -> 评估是否有错（参数错 / 逻辑错 / 位置错）
- 玩家回合：按 ReAct 格式，先写 thought（分析当前状态），再写 action（具体动作）

如果 DM 判定动作错误，玩家需要根据反馈**重新思考并给出修正后的新动作**。这就是"犯错-纠正"对。

**第三步：质量验证（审核剧本和轨迹）**

- JSON 格式校验：不能有花括号不配对
- 动作合法性校验：所有动作名必须通过预设正则
- 任务完成检查：轨迹最后必须完成任务
- 最少 2 对"错误-纠正"：不够就重新生成

**第四步：选择性损失训练（关键创新）**

这是整篇论文最重要的工程决策。训练时模型看到完整轨迹（含错误回合和 DM 反馈），但损失函数**只在正确动作的 token 上计算**：

```
Loss = -Σ log P(thought_i, action_i | context)  × mask_i
```

其中 `mask_i = 1` 仅当第 i 步的动作为正确（经验证后纠正成功的），否则 `mask_i = 0`。

直觉解释：让模型在上下文中看到"前一回合我犯了这个错，DM 告诉我为什么错"，所以它能学会"听到这种反馈应该怎么改"。但错误动作本身不参与梯度更新——我们不想让模型"学会犯错"，只想让它"学会在看过错误后走对"。

消融实验的数据证明了这一点：如果把错误回合也加入损失（让模型也学错的动作），SciWorld 成功率从 7.7% 掉到 3.3%（降 57%）。如果完全去掉包含错误的轨迹（只用纯正确的），成功率从 7.7% 掉到 5.5%（降 29%）。

## 实践案例

### 案例 1：理解选择性损失——训练时发生了什么

假设一个 Agent 轨迹长这样：

```
回合 1: DM 说"你在厨房，看到一把钥匙"  → Agent 说 goto bedroom  → DM 说"卧室门锁着，需要钥匙"
回合 2: DM 说"你还在厨房"              → Agent 说 take key, goto bedroom  → DM 说"你用钥匙开了门，进来了"
```

传统训练（Agent-FLAN）：只收集回合 2 这种纯正确的回合来训练，模型没见过"错了之后怎么办"。

AgentRefine 训练：回合 1 和回合 2 都在训练数据里，但**回合 1 的错误动作 `goto bedroom` 不贡献 loss**，只有回合 2 的正确序列 `take key, goto bedroom` 贡献 loss。

用代码表示训练数据的 mask 逻辑：

```python
# 一条轨迹的 token 序列，每个 segment 有对应的 mask
training_segments = [
    # 回合 1（错误——mask 全为 0）
    {"text": "你观察：你在厨房，桌上有一把钥匙，有一扇门通向卧室。", "mask": 0},
    {"text": "思考：我应该直接去卧室。",                              "mask": 0},
    {"text": "动作：goto bedroom",                                    "mask": 0},  # 这里错了！
    {"text": "反馈：卧室门锁着，你需要钥匙。",                        "mask": 0},
    # 回合 2（纠正后正确——mask 为 1）
    {"text": "你观察：你还在厨房，桌上钥匙还在。",                    "mask": 0},
    {"text": "思考：门锁了，我需要先拿钥匙再去卧室。",                "mask": 1},
    {"text": "动作：take key",                                        "mask": 1},  # 正确！
    {"text": "动作：goto bedroom",                                    "mask": 1},  # 正确！
]

# 计算 loss 时，把 mask==0 的 segment 对应的标签设为 -100（PyTorch 的 ignore_index）
def compute_refinement_loss(model, segments):
    all_input_ids = []
    all_labels = []
    for seg in segments:
        tokens = tokenize(seg["text"])
        all_input_ids.extend(tokens)
        if seg["mask"] == 1:
            all_labels.extend(tokens)        # 正常标签
        else:
            all_labels.extend([-100] * len(tokens))  # 忽略这些位置

    logits = model(torch.tensor([all_input_ids])).logits
    loss = torch.nn.functional.cross_entropy(
        logits[:, :-1, :].reshape(-1, logits.size(-1)),
        torch.tensor([all_labels[1:]]).reshape(-1),
        ignore_index=-100
    )
    return loss
```

**逐部分解释**：
- 错误动作 `goto bedroom` 对应的 token 标签设为 -100，PyTorch 会跳过这些位置的 loss 计算。
- DM 的反馈文本（"门锁着"）的 mask 也是 0——让模型看到反馈，但不预测 DM 的话。
- 纠正后的 `take key` 和 `goto bedroom` 的 mask 为 1——模型要学的是"看到了 DM 的锁门提示后，应该先拿钥匙再去卧室"。
- 核心效果：模型在上下文中看过错误，但只在正确行为上做反向传播。就像老师给你看一道做错的题和批改，但让你只练习正确答案。

### 案例 2：环境合成中的干扰设计

AgentRefine 用 GPT-4o 生成的环境不是随便写的，有严格的结构和干扰设计。以下是一个简化版的合成结构：

```python
# GPT-4o 合成的一个场景（简化 JSON 结构）
environment_script = {
    "persona": "一位刚入职 IT 部门的系统管理员，熟悉命令行操作",
    "locations": [
        {"name": "server_room", "items": ["admin_keycard", "backup_drive", "old_monitor"]},
        {"name": "office",      "items": ["employee_badge", "coffee_mug"]},
        {"name": "storage",     "items": ["spare_cable", "locked_cabinet"]}
    ],
    "interfering_items": ["old_monitor", "coffee_mug", "spare_cable"],
    "task": "用 admin_keycard 进入 server_room 并取出 backup_drive",
    "actions": [
        {"name": "goto",    "regex": r"goto\s+\w+",                  "params": ["location"]},
        {"name": "take",    "regex": r"take\s+\w+",                  "params": ["item"]},
        {"name": "use",     "regex": r"use\s+\w+\s+on\s+\w+",        "params": ["tool", "target"]},
        {"name": "examine", "regex": r"examine\s+\w+",               "params": ["item"]}
    ]
}
```

**逐部分解释**：

- `persona`：场景生成前先随机采一个人物画像。系统管理员的副本会出现 server_room 和 admin_keycard；厨师的副本会出现 kitchen 和 recipe。多样性从根上保证。
- `interfering_items`：旧显示器、咖啡杯、备用线缆——这些都是**故意放的干扰物品**。Agent 可能拿起咖啡杯去刷 server_room 的门禁，然后 DM 判定"咖啡杯不是门禁卡"。这就是被设计出来的"犯错-纠正"机会。
- `actions` 的 `regex`：不是摆设。合成时每个动作都要能被这个正则匹配。如果 GPT-4o 生成了 `go to server_room`（多了空格），正则 `goto\s+\w+` 匹配失败，这条轨迹直接丢弃——防止训练数据里混入格式错误。
- 实际论文中，每个副本可能包含 5-8 个房间、10-20 件物品、5-10 种动作类型。越复杂的环境，模型越容易犯错，也就有越多的"纠正"学习机会。

### 案例 3：消融实验的完整数据

论文跑了三组关键消融，告诉你选择性损失的每个组件到底贡献了多少。用 LLaMA-3-8B 在三个环境上的结果（S = 成功率%，P = 进度%）：

| 变体 | Alfworld S/P | BabyAI S/P | SciWorld S/P |
|------|-------------|-----------|-------------|
| AgentRefine（完整） | 48.5 / 61.5 | 37.1 / 51.7 | 7.7 / 33.1 |
| 无选择性 loss（所有 token 都学） | 29.9 / 43.9 | 23.2 / 31.6 | 3.3 / 19.0 |
| 无错误轨迹（只学纯正确） | 49.3 / 65.2 | 30.4 / 43.1 | 5.5 / 21.3 |
| 无 DM 反馈上下文 | 40.3 / 58.8 | 34.8 / 45.6 | 4.4 / 22.7 |

**读到什么**：
- 去掉选择性 loss 是最伤的——模型学会了错误行为，泛化全面崩塌。SciWorld 从 7.7 掉到 3.3，降幅 57%。
- 去掉含错误轨迹后，Alfworld 成功率反而微涨（49.3 vs 48.5）——说明 Alfworld 环境比较简单，纯正确轨迹就够了。但 BabyAI 和 SciWorld 都降了，越复杂的环境越需要"见过错误"的训练。
- 去掉 DM 反馈是中等伤害——模型看不到"为什么错"，学不会"根据反馈调整"这个元技能。

## 踩过的坑

1. **错误回合也学 = 训练毒药**：整篇论文最重要的工程教训是训练数据里有错误示例是好的，但别在错误上反向传播。如果你直接对整个序列做 CE loss，模型会学会"先犯错再纠正"的模式，实际推理时容易卡在错误里出不来——SciWorld 从 7.7% 直掉 57%。

2. **GPT-4o 生成的轨迹质量不稳定**：论文用最多 4 次 LLM 调用才生成 1 条合格轨迹。GPT-4o 经常生成格式错误的 JSON、动作不符合正则、或任务描述有歧义导致 DM 和玩家理解不一致。复现时需要准备大量的 post-hoc 过滤逻辑。

3. **TRPG 合成多样性是双刃剑**：动作空间太自由（GPT-4o 随意编动作名），导致验证正则覆盖不全——有些合法动作被误判为非法。论文在附注里提了但没深入讨论，实际工程中建议限制动作名用固定词汇表而不是自由文本。

4. **"最少 2 对错误-纠正"的阈值是经验值**：论文没做这个超参的消融（到底是 1 对好还是 3 对好），直接设成了 2。实际使用时按你的下游任务难度调整——任务越难，需要的错误-纠正对数可能越多。

5. **和 Agent-FLAN 的对比不完全公平**：Agent-FLAN 用的是人工标注的固定环境集，AgentRefine 用 GPT-4o 合成。本质上是"合成数据更多样"和"选择性损失"两个因素共同起作用，论文没有完全解耦。

## 适用

**适用场景**：
- 你的 Agent 需要在多种不同环境里工作，没法为每个环境单独训练
- 环境可以提供明确的"对/错"反馈（如代码执行报错、API 返回状态码、游戏任务完成标志）
- 你有能力用强模型（GPT-4o 或 Claude）合成大量多样的训练环境
- 你希望 Agent 遇到前所未见的任务时，至少能"试试看、错了改"，而不是直接放弃

**不适用场景**：
- 环境反馈不明确（如开放式对话质量评估）——没有明确的错误信号，选择性 loss 不知道 mask 谁
- 动作空间高度受限（如只有 3 个固定按钮）——不需要泛化，背答案就够了
- 训练算力极为有限——8B 模型都要跑全量 SFT，合成数据的 API 成本先拦一道
- 推理时不允许试错（如自动驾驶、医疗决策）——AgentRefine 学的是"先错再改"，推理时需要多步交互

## 历史小故事

- **2022 年**：Yao 等人提出 ReAct（Reasoning + Acting），把 LLM Agent 的动作格式定型为 Thought -> Action -> Observation 循环。但当时没人系统思考"错了怎么办"。
- **2023 年**：Shinn 等人提出 Reflexion——推理时让 Agent 把失败经验用文字总结出来，下次尝试时带着这段总结。本质是推理时的自我纠正，不涉及训练。
- **2023 年末**：Agent-FLAN 首次大规模指令微调 Agent——把多个人工环境的数据混在一起训 LLaMA，在训练环境上效果好，但泛化很差。AgentRefine 的第一作者看了这个结果后开始思考"泛化差的根因是什么"。
- **2024 年**：AgentGym 建立了统一的 Agent 评测平台 AgentBoard，标准化了 Alfworld、SciWorld、BabyAI 等环境的评测接口。AgentRefine 的全部实验跑在这个框架上。
- **2025 年 1 月**：AgentRefine 提交 arXiv，核心洞见"选择性 loss + 跑团式合成"被 ICLR 2025 接收为 Poster。在 ICLR 的 Poster Session 上，这篇工作引发了"用选择性 loss 做 RL 替代方案"的讨论。
- **2025 年同一时段**：AgentRefine + Reflexion 结合使用，在 Alfworld 达到 90.3% 成功率，成为开源 Agent 在该环境上的最高纪录。

## 学到什么

- **泛化不等于更多数据，而是正确的数据结构**：AgentRefine 的训练数据总量不一定比 Agent-FLAN 多，但每一条都包含"错误-纠正"结构。这个结构本身就是泛化的教材。
- **选择性 loss 是工程金矿**：不只是 Agent 训练——任何"模型需要在上下文中看到某信息但不应预测它"的场景（RAG 的引用、代码补全的上下文、多轮对话的系统 prompt），选择性 mask 都适用。
- **TRPG 是合成交互数据的理想范式**：DM 生成世界 + 玩家在其中交互 + DM 给出反馈——这个三件套天然对应 Agent 训练的环境 + agent + reward。如果你需要合成任何"多轮交互 + 环境反馈"的训练数据，先想想能不能用类似 TRPG 的结构。
- **推理时技巧和训练时技巧互补**：AgentRefine 训练让模型"有纠错意识"，Reflexion 推理让模型"有纠错机制"——两者叠加（90.3% Alfworld）远超各自单独使用。训推一体是未来方向。
- **不要害怕在训练数据里放错误示例——正确使用它们**：传统 SFT 直觉是"数据越干净越好"，AgentRefine 说"干净的错题比纯真题更值钱，前提是别让它学错的答案"。

## 延伸阅读

- 论文 PDF：[arXiv 2501.01702](https://arxiv.org/abs/2501.01702) —— 14 页，包含完整消融数据和环境合成细节
- 代码仓库：[Fu-Dayuan/AgentRefine](https://github.com/Fu-Dayuan/AgentRefine) —— 包含 TRPG 合成脚本、选择性 loss 实现、评测脚本
- ICLR 2025 Poster：[iclr.cc/virtual/2025/poster/30355](https://iclr.cc/virtual/2025/poster/30355) —— 含 Q&A 讨论
- 前置工作 Reflexion：[Shinn et al. 2023](https://arxiv.org/abs/2303.11366) —— 推理时自我反思机制
- 前置工作 Agent-FLAN：[Chen et al. 2023](https://arxiv.org/abs/2310.12823) —— 首次大规模 Agent 指令微调
- 评测平台 AgentGym：[agentgym 代码仓库](https://github.com/THUDM/AgentGym) —— AgentRefine 全部实验在此框架上跑

## 关联

- [[attention]] —— AgentRefine 基于 LLaMA-3 训练，底层是 Transformer + 自注意力
- [[instruct-gpt]] —— 指令微调是 AgentRefine 的 SFT 基础范式
- [[reflexion]] —— 推理时反思，与 AgentRefine 训练互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[reflexion]] —— Reflexion — 让 LLM 自我反思

