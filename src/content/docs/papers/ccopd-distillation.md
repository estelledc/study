---
title: CCOPD — 多轮语言模型的规范上下文在线策略蒸馏
来源: https://arxiv.org/abs/2605.30251
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：同一道题，分三次说完 vs 一次说完

想象你在帮朋友算婚礼餐饮预算。有两种沟通方式，**信息总量完全一样**：

**方式 A（FULL，一次说完）**  
「Jenny 婚礼 80 位客人，想要牛排的是想要鸡肉的 3 倍，牛排 $25、鸡肉 $18，总预算是多少？」

**方式 B（RAW-SHARDED，分多轮说完）**  
- 第 1 轮用户：「牛排 $25、鸡肉 $18，总预算是多少？」  
- 助手（信息还不全）：「大概需要知道人数和比例……我先假设各一半？」← **自己猜了一个数**  
- 第 2 轮用户：「80 位客人。」  
- 助手：「那按刚才的假设……」← **继续沿用错误假设**  
- 第 3 轮用户：「想要牛排的是想要鸡肉的 3 倍。」  
- 助手最终答案：可能和方式 A **不一样**——不是因为它没收到全部事实，而是**被中间自己说过的话「锚定」了**。

这就是论文标题 *Same Evidence, Different Answers* 的核心：**证据相同，答案却可能不同**。  
浙江大学等作者提出的 **CCOPD（Canonical-Context On-Policy Distillation）**，目标是把这种「多轮分片说」时的表现，拉齐到「一次说全」时的表现——而且**不需要更强的外部教师模型**，也**不需要推理时额外修修补补**。

---

## 这篇论文在解决什么问题

### 1. 规范上下文一致性（Canonical-Context Consistency）

用户很少在第一句话就把任务说完整；真实对话里，约束往往是**逐轮披露**的。一个可靠的多轮模型应满足：

> 当 RAW-SHARDED 对话里**所有用户侧证据**都已披露完毕时，最终答案分布应接近 **FULL**（一次性完整 prompt）条件下的分布。

形式化写作：

$$
\pi(y \mid h(q)) \approx \pi(y \mid c(q))
$$

其中 $c(q)$ 是规范 FULL prompt，$h(q)$ 是任务等价的 RAW-SHARDED 历史。

### 2. 自锚定漂移（Self-Anchored Drift）

RAW-SHARDED 历史不只是「更长的 prompt」，它还包含模型**在信息不全时**自己生成的中间回复 $a_1, a_2, \ldots$。这些回复可能带有：

- 未经验证的猜测  
- 临时答案  
- 过早的承诺  

等最后一轮用户把缺失事实补全后，上下文里**用户证据已经完整**，但模型仍可能被**自己 earlier 的 assistant 文本**带偏——论文称此为 **self-anchored drift**。

### 3. CCOPD 的思路（一句话）

用**同一个基座模型**扮演两个角色：

| 角色 | 输入 | 是否训练 |
|------|------|----------|
| **Teacher（教师）** | 干净的 FULL prompt | 冻结 |
| **Student（学生）** | 真实的 RAW-SHARDED 多轮历史（含污染性的中间回复） | 可训练（LoRA） |

学生在**自己 rollout 出的最终答案前缀**上生成；教师在同一答案前缀下、但 conditioning 于 FULL prompt，给出「规范」的下一 token 分布。训练最小化 **reverse KL**，把多轮路径的行为对齐到 FULL 路径——这是 **on-policy** 的：监督的是学生**实际走到的状态**，而非固定演示轨迹。

---

## 三种任务等价呈现模式

论文沿用 Laban 等（2025）的 **task-equivalent sharding** 设定：

| 模式 | 含义 | 典型用途 |
|------|------|----------|
| **FULL** | 完整题目一次给出 | 上界 / 教师条件 |
| **CONCAT** | 所有 user shard 拼成一条，无中间 assistant 回复 | 对照：有分片、无自污染 |
| **RAW-SHARDED** | 用户逐轮披露 shard，中间穿插**真实模型**生成的 assistant 回复 |  hardest：测 self-anchored drift |

GSM8K 风格训练里，shard 构造有个刻意设计：**第一个 shard 往往是「问题句/所求量」**，支持事实排在后面——迫使模型在信息不全时也要说话，从而制造真实的中间污染。

---

## 核心概念详解

### 1. 局部呈现差距 $\Psi_\pi(q, s)$

固定同一个答案前缀 $s$，比较两种呈现下下一 token 分布的差异：

$$
\Psi_\pi(q, s) = D_{\mathrm{KL}}\!\left(\pi(\cdot \mid h(q), s) \,\|\, \pi(\cdot \mid c(q), s)\right)
$$

- 同一模型、同一前缀，**只换上下文呈现方式**  
- 值越大 → 该前缀处模型对「分片历史 vs 完整 prompt」越敏感  
- CCOPD 把这个差距变成训练信号

### 2. On-Policy Canonical Relabeling

对每个保留的 pair $(c, h)$：

1. 学生从 RAW-SHARDED 历史 $h$ **采样**最终答案 rollout $\hat{y}_{1:T}$  
2. 对每个属于最终答案的 token 位置 $t$，计算  
   - 学生：$p_\theta(\cdot \mid h, \hat{y}_{<t})$  
   - 教师：$p_{\mathrm{teacher}}(\cdot \mid c, \hat{y}_{<t})$（同 backbone，冻结）  
3. 在 **final-answer mask** 上最小化 reverse KL：

$$
\mathcal{L}_{\mathrm{CCOPD}} = \sum_{t \in T_{\mathrm{ans}}(\hat{y})} D_{\mathrm{KL}}\!\left(p_\theta(\cdot \mid h, \hat{y}_{<t}) \,\|\, p_{\mathrm{teacher}}(\cdot \mid c, \hat{y}_{<t})\right)
$$

要点：

- Teacher 是 **presentation-privileged**（看得到 FULL），不是 **information-privileged**（没有额外知识）  
- 学生**永远看不到** FULL prompt；必须学会在「被污染的历史」里仍给出与 FULL 一致的行为  
- **Same-prefix**：两边 scoring 的是**同一条**学生自己生成的答案前缀

### 3. 诊断探针：SAAR 与中性占位符

**SAAR（Self-Anchor Attention Ratio）**：最终答案 token 对「已完成用户证据 span」vs「早期 assistant 承诺 span」的注意力比值。SAAR 低说明模型更盯着自己说过的话。

**Neutral-placeholder contrast**：把中间 assistant 回复换成中性等待语（如「好的，我继续等你补充信息」），看预测状态离 FULL 参考有多远。若替换后 KL 差距缩小 → 说明原 process reply 确实在制造 canonical deviation。

### 4. 与推理时修复、澄清 abstention 的区别

| 路线 | 做法 | CCOPD 差异 |
|------|------|------------|
| Reflexion / Self-Refine | 推理时再反思、重写 | CCOPD 在**训练**内化，不加控制环 |
| 澄清 / abstention | 信息不全时先问、先等 | 论文假设**最后一轮证据已齐**，问题在 self-contamination |
| 普通 off-policy 蒸馏 | 跟固定 teacher 轨迹 | CCOPD 跟学生**自己 on-policy** 走到的前缀 |

---

## 实验结果（论文摘要级）

- **训练**：仅 GSM8K / GSM8K-Aug 的 RAW-SHARDED 数学对话（约 6k–8k pair），Qwen3-8B + LoRA（约 0.53% 可训练参数）  
- **RAW-SHARDED**：相对 base 平均 **+32% 相对提升**（跨 6 个任务族）  
- **FULL / CONCAT**： largely preserved，没有明显牺牲一次性 prompt 能力  
- **零样本迁移**：数学训练信号改善 **Code、Function Call、Text-to-SQL、ToTTo、SummHay** 等 5 类非数学 RAW-SHARDED 任务  
- **反向实验**：HotpotQA 上训练 CCOPD，数学 RAW-SHARDED 也从 66% → 77%——说明信号不绑死「数学格式」  
- **强污染测试**：在完整上下文中插入错误 assistant 解或 user 侧「已验证错误答案」提示，CCOPD 模型显著更抗污染（如 assistant-side 33% → 89%）

---

## 代码示例 1：把一道数学题切成 RAW-SHARDED 静态 shard

下面模拟论文 Appendix F 的**确定性分片**逻辑（简化版）：先找问句 shard，其余事实按原文顺序排在后面。

```python
import re
from dataclasses import dataclass

@dataclass
class ShardedTask:
    full_prompt: str
    shards: list[str]  # 用户逐轮披露的顺序

def split_into_sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text.strip())
    parts = re.split(r"(?<=[.?!])\s+", text)
    if len(parts) >= 2:
        return [p.strip() for p in parts if p.strip()]
    # fallback: 按连接词切
    for conj in (" while ", " if ", " when ", " then ", " but ", " and "):
        if conj in text.lower():
            return [s.strip() for s in re.split(conj, text, flags=re.I) if s.strip()]
    return [text]

def build_static_shards(question: str) -> ShardedTask:
    units = split_into_sentences(question)
    # 含问号的最后一句作为 query shard（论文：先问「所求量」）
    query_idx = max(i for i, u in enumerate(units) if "?" in u) if any("?" in u for u in units) else len(units) - 1
    query = units[query_idx]
    facts = [u for i, u in enumerate(units) if i != query_idx]
    shards = [query] + facts
    return ShardedTask(full_prompt=question, shards=shards)

# GSM8K 风格例题（论文 Table 7）
q = (
    "Jenny is planning her catering budget for her wedding. "
    "She is going to have 80 guests. 3 times as many guests want steak as chicken. "
    "If each steak entree costs $25 and each chicken entree costs $18, "
    "how much is the total catering budget?"
)
task = build_static_shards(q)
print("FULL:\n", task.full_prompt, "\n")
print("RAW-SHARDED 用户轮次:")
for i, shard in enumerate(task.shards, 1):
    print(f"  Turn {i} user: {shard}")
# 真实 RAW-SHARDED 还会在每轮 user 后插入 assistant 的 process reply —— 污染来源
```

**读法**：`shards[0]` 往往在信息不全时就问「总预算是多少？」；模型若此时瞎猜并写入上下文，后面即使用 FULL 等价证据补全，也可能 **self-anchor** 到错误中间态。

---

## 代码示例 2：CCOPD 的 reverse-KL 损失（PyTorch 伪代码）

这是对论文 §4.2 训练目标的**教学级**实现骨架：同一前缀、双条件、只 mask 最终答案 token。

```python
import torch
import torch.nn.functional as F

def reverse_kl(student_logits, teacher_logits, mask):
    """
    student_logits, teacher_logits: [batch, seq_len, vocab]
    mask: [batch, seq_len] bool，True 表示属于 final-answer 位置
    """
    # 只在 mask 位置算 KL( student || teacher )
    s_logp = F.log_softmax(student_logits, dim=-1)
    t_logp = F.log_softmax(teacher_logits, dim=-1)
    t_prob = t_logp.exp()

    kl_token = (t_prob * (t_logp - s_logp)).sum(dim=-1)  # [batch, seq_len]
    kl = (kl_token * mask.float()).sum() / mask.float().sum().clamp(min=1)
    return kl

def ccopd_step(student_model, teacher_model, full_ids, raw_history_ids, tokenizer):
    """
    full_ids: FULL prompt token ids（仅 teacher 可见）
    raw_history_ids: RAW-SHARDED 历史，止于 final user turn（仅 student 可见）
    """
    teacher_model.eval()
    for p in teacher_model.parameters():
        p.requires_grad = False

    # 1) 学生 on-policy rollout 最终答案
    with torch.no_grad():
        gen = student_model.generate(
            raw_history_ids,
            max_new_tokens=512,
            do_sample=True,
            temperature=1.0,
            top_p=0.95,
        )
    answer_start = raw_history_ids.shape[1]
    answer_ids = gen[:, answer_start:]
    prefix_ids = gen[:, :answer_start + answer_ids.shape[1]]

    # 2) 构造 final-answer mask（简化：生成段全部计入）
    seq_len = prefix_ids.shape[1]
    mask = torch.zeros_like(prefix_ids, dtype=torch.bool)
    mask[:, answer_start:] = True

    # 3) 双路 forward：同一 prefix，不同 conditioning
    # Teacher: condition on FULL + shared answer prefix
    teacher_in = torch.cat([full_ids, answer_ids], dim=1)
    teacher_logits = teacher_model(teacher_in).logits[:, full_ids.shape[1]-1:-1]

    # Student: condition on RAW history + shared answer prefix
    student_logits = student_model(prefix_ids).logits[:, answer_start-1:-1]

    loss = reverse_kl(student_logits, teacher_logits, mask[:, answer_start:])
    loss.backward()
    return loss.item()
```

**对应关系**：

- `teacher_model` = 冻结的同 backbone FULL 条件  
- `student_model` = 可训练 RAW-SHARDED 条件  
- `reverse KL` 把学生分布拉向教师——学生若被 self-anchor 带偏，在该前缀上的 logits 会与 FULL 教师不一致，梯度推动修正

---

## 代码示例 3：演示 self-anchored drift 的对话结构

```python
from dataclasses import dataclass

@dataclass
class Turn:
    role: str
    content: str

def raw_sharded_history() -> list[Turn]:
    """同一 FULL 题的信息，分多轮披露；assistant 中间回复可能污染最终答案。"""
    return [
        Turn("system", "You are a helpful math tutor."),
        Turn("user", "If steak is $25 and chicken is $18, what's the total catering budget?"),
        Turn("assistant", "I'll assume 50 steak and 30 chicken guests for now... budget ≈ $1790."),
        Turn("user", "There are 80 guests total."),
        Turn("assistant", "Keeping my earlier split, adjusting slightly..."),
        Turn("user", "Three times as many want steak as chicken."),
        # 下一 turn 才应给出最终答案；但上下文里已留下错误 numeric anchor
    ]

def full_prompt() -> str:
    return (
        "Jenny's wedding: 80 guests; steak guests = 3× chicken guests; "
        "steak $25, chicken $18. Total catering budget?"
    )

# CCOPD 训练目标：在 raw_sharded_history() 条件下生成的最终答案，
# 其 token 分布应接近在 full_prompt() 条件下、同一答案前缀上的分布。
```

---

## 训练配置速查（论文 Appendix J）

| 项目 | 配置 |
|------|------|
| 基座 | Qwen3-8B |
| 微调 | LoRA r=16, α=32, ~43.65M 参数 |
| 数据 | 6k RAW-SHARDED 数学对话 |
| 目标 | CCOPD KL-only |
| LR | 3e-5，AdamW，4 epochs |
| Rollout | temperature=1.0, top-p=0.95, max 4096 new tokens |
| 算力 | ~132 GPU·hours（RTX 4090） |

---

## 与相关工作的关系

- **Lost in Conversation / Laban 2025**：提出 task-equivalent sharding 评测框架；CCOPD 在其 RAW-SHARDED 设定上训练与评估  
- **On-Policy Distillation (OPD)**：一般让学生跟 teacher 的 on-policy 轨迹；CCOPD 的特殊性是 **同 backbone、不同呈现**，teacher 并非更强模型  
- **OPCD（On-Policy Context Distillation, arXiv:2602.12275）**：把上下文蒸馏进参数；CCOPD 专注 **多轮呈现不变性** 而非压缩 system prompt  
- **Locally Coherent, Globally Incoherent（2605.30335）**：都涉及「局部看起来合理、全局却有问题」；CCOPD 是**单模型多轮**层面的 self-anchor，LCGI 是**多组件 Agent** 层面的概率不一致

---

## 局限与论文自述边界

1. **Shard 构造是确定性的 GSM8K 风格**，不覆盖所有自然多轮对话形态  
2. **English only**，任务族以 instruction-following / reasoning 为主  
3. **不能宣称**对所有 full-context 污染格式都免疫——强 user-side hint 仍比 assistant-side 更难  
4. 提升 task correctness ≠ 通用安全 / 事实性保证；部署仍需原有 guardrails  
5. 测试时 lightweight reset/defer prompt 对 CCOPD 模型反而略降分——说明能力已**内化**，额外 meta 指令冗余

---

## 给工程师的 takeaway

1. **多轮 ≠ 长 prompt**：assistant 历史是**一阶公民**，会改变最终答案分布  
2. **评测要分 FULL / RAW-SHARDED**：只在 FULL 上刷分，无法代表真实聊天产品  
3. **CCOPD 是训练处方**：同模型自蒸馏 + FULL 作 canonical view + on-policy reverse KL  
4. **数学-only 训练可迁移**：对齐「等证据不同呈现」这一**元能力**，不绑具体领域  
5. 若你在做 agent / 多轮 copilot：优先检查是否存在 **self-anchored drift**（中间 tool 输出、草稿、错误假设是否污染最终决策）

---

## 延伸阅读

- 论文 HTML：[arXiv:2605.30251](https://arxiv.org/html/2605.30251v1)  
- 相关工作：Laban et al. (2025) sharded instruction evaluation  
- 同期：**OPCD**（上下文内化蒸馏）、**LCGI**（多组件全局不一致）

---

## 自测题

1. FULL 与 RAW-SHARDED 在**用户证据**上等价时，为什么答案仍可能不同？  
2. CCOPD 的 teacher 比 student「强」吗？强在哪里、不强在哪里？  
3. 为什么是 **reverse KL** 且只在 **final-answer mask** 上算？  
4. CONCAT 模式在 ablation 里通常起什么对照作用？  
5. 若只有推理预算、不能训练，论文 Appendix H 哪种 test-time mode 对 base 模型更有帮助？

<details>
<summary>参考答案（先自己想）</summary>

1. 中间 assistant 回复在信息不全时引入 unsupported assumptions，最终轮仍 conditioning 于这些 self-generated text → self-anchored drift。  
2. 不强在能力：同一 Qwen3-8B backbone；强在**呈现**——teacher 看 FULL，student 看 RAW-SHARDED。无外部更强模型。  
3. Reverse KL 模式覆盖：让学生分布贴近 FULL 教师；mask 限制在最终答案，避免蒸馏过程回复的格式差异干扰。  
4. CONCAT 有分片、无 assistant 污染，用来分离「分片本身」vs「self-anchor」的贡献。  
5. **Reset-then-answer**（每轮先重述 Current goal）对 base 帮助更大；defer-until-complete 收益很小。

</details>
