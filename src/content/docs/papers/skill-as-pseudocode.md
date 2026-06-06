---
title: Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
来源: 'Skill-as-Pseudocode: Refactoring Skill Libraries to Pseudocode, arXiv:2605.27955, 2026'
日期: 2026-06-01
子分类: 智能体与 LLM
分类: Agent
难度: 中级
provenance: pipeline-v3
---

## 是什么

Skill-as-Pseudocode（**SaP**）是把 agent 的 skill 库**从自由 markdown 改写成有类型签名的伪代码**，并配一套四步确定性验证，让模型每次复用 skill 时都先用规则查一遍。日常类比：以前实习生攒经验是写日记——"上次那种活儿我大概怎么做"；SaP 把日记改成 SOP——参数、前置条件、副作用、返回都写明白，下次照着填就行。

旧路线（[[voyager]] 起步）是：成功完成一次任务，把"过程描述"当 markdown 文档存起来，下回检索拿到丢进 prompt 给 LLM 当 few-shot。问题是 markdown 没结构——LLM 每次都要重读一遍、理解一遍、对应到当前任务参数上一遍，token 浪费且容易跑偏。

SaP 的改动是：成功后让一个写者 LLM 把这段经验**翻译成 pseudo-Python**——有 `def name(args: types) -> ret`、有 `# pre:`、`# post:`、有清晰的步骤注释。复用时先**用规则**校验四步（参数类型 / 前置条件 / 历史步骤兼容 / 副作用安全），通过才进 prompt。论文报告 ALFWorld 上 token 用量降 22%、LLM 调用次数降 14%。

## 为什么重要

不理解 SaP，下面这些事都没法解释：

- 为什么 2026 年 agent 论文一窝蜂"重写 skill 表示"——markdown 太松散是公认痛点
- 为什么"用规则替掉一部分 LLM 决策"反而提升整体效果——把可形式化的部分形式化省 token
- 为什么 ALFWorld / WebArena 等 benchmark 上 skill-based agent 出现分化：表示形式比检索算法更影响性能
- 为什么"伪代码"既不是真代码也不是自然语言，恰好卡在 LLM 最擅长的中间层

## 核心要点

SaP 的关键拆成 **三步**：

1. **类型化签名**：每个 skill 必须有 `def task_name(arg1: Type1, arg2: Type2) -> ReturnType` 头部。类比：实习生交活前先写一行"这个工具吃啥吐啥"，下次同事接手直接看签名不用读全文。

2. **四步确定性验证**：复用 skill 时不直接丢给 LLM，先用规则查（a）参数类型匹配（b）前置条件谓词成立（c）调用历史不冲突（d）副作用未越界。**任一步失败直接跳过这条 skill**——省一次 LLM 调用。

3. **轻量翻译器**：写者 LLM 看完成功轨迹，按模板翻译成伪代码。模板严格，翻译错误率低。markdown 备份保留——伪代码是"快速通道"，markdown 是"理解通道"。

三件事咬合：签名让规则可查，规则让验证省调用，翻译让旧库可平滑迁移。

## 实践案例

### 案例 1：把"找钥匙开门"改写成伪代码

旧 markdown skill：

```
任务：找到房间里的钥匙打开门
步骤：先环视房间找钥匙位置，拿起钥匙，走到门前，把钥匙插进锁里转动。
```

SaP 翻译后：

```python
def unlock_door(room: Room, door: Door) -> DoorState:
    # pre: door.locked == True and any(o.is_key for o in room.objects)
    # post: door.locked == False
    key = find(room, lambda o: o.is_key)  # 步骤 1
    pick_up(key)                            # 步骤 2
    move_to(door)                           # 步骤 3
    use(key, door)                          # 步骤 4
```

类型 + 谓词 + 步骤都明确。下次"打开柜子门"时规则先查 `door.locked == True`，柜子没锁直接跳过这条 skill。

### 案例 2：四步验证省一次 LLM 调用

agent 接到任务"把书放进柜子"。检索拿到 5 条候选 skill，其中一条是上面的 `unlock_door`。

- 步骤 a：参数类型 — 当前任务的"柜子"是 `Cabinet` 不是 `Door`，类型不匹配。
- 直接跳过这条 skill，**省一次 LLM 评估**。

旧做法：5 条 skill 全塞 prompt，让 LLM 自己判断哪条相关——一次 forward pass 处理 5 条描述。SaP 用规则筛剩 2 条再给 LLM，prompt 短了一半。

实测在 ALFWorld 的 134 条任务上，规则平均能筛掉 2.3/5 条无关 skill，这部分省下的 LLM 调用就是论文报告的 14% 净节省。

### 案例 3：翻译失败也不阻塞主流程

写者 LLM 翻译"做饭"这种长程任务时，参数类型推不出来（什么算 `Ingredient`？）。

- 翻译器返回 `unable_to_typify`
- 系统**保留原 markdown** 进库
- 下次复用时这条走旧通道（直接进 prompt）
- 其他能翻译的 skill 走新通道

混合库平稳过渡。论文报告 ALFWorld 上约 78% 的 skill 能成功翻译成伪代码，剩 22% 留 markdown。

混合库的代价是检索时要查两个表，但因为伪代码版加了规则前置筛选，整体调用次数仍下降。

## 踩过的坑

1. **签名写太死会丢复用空间**：第一版要求参数全是具体类（`KitchenKey` `BedroomKey`），结果"任意钥匙开任意门"这种通用 skill 无法表示，得允许泛型参数（`Key[T]`）。
2. **前置条件谓词不能太复杂**：写成 SAT-hard 的逻辑式规则验证就慢了，要限制成"原子谓词的合取"，复杂条件丢给 LLM 兜底。
3. **副作用追踪需要一份世界模型**：单纯静态分析判不了"这一步是否破坏后续 skill 的前置条件"，要维护一个可回滚的环境快照。
4. **旧 markdown 不能立即删**：伪代码翻译可能漏细节（如成功的小动作），保留 markdown 作"理解通道"，伪代码作"调用通道"，双轨并行。

## 适用 vs 不适用场景

**适用**：

- 任务空间结构化（ALFWorld / WebArena 这种有清晰对象 + 动作的环境）
- skill 库已经积累到 100+ 条、检索成本变成瓶颈
- 模型有稳定的代码理解能力（GPT-4 / Claude 4 级别）

**不适用**：

- 任务高度自由文本（创意写作、客服对话）——伪代码套不出来
- skill 库 < 30 条——规则验证省的 token 还不够搭基础设施
- 多模态 skill（含图像 / 音频）——签名表示不全
- 环境状态不可观测（pre / post 谓词无从查）

## 历史小故事（可跳过）

- **2023**：[[voyager]] 把 skill 当 JS 函数 + 自然语言描述存进向量库——双表示是奠基
- **2024**：CodeAct / [[react]] 类工作把"代码作为 action 表达"推到主流，skill 也开始往代码侧靠
- **2025 上半年**：MIND-Skill / EffiSkill 等多篇论文同时关注 skill 表示——markdown 太松散是共识
- **2026 年初**：SaP 提出"伪代码"折中——比代码软（不需可执行）、比 markdown 紧（可形式化）
- **同期**：[[mind-skill]] / [[effiskill]] / [[webxskill]] 各从不同维度挑战 skill 表示问题
- **未来一两年**：可期待"伪代码 + 形式验证 + 检索"三件套继续向类型系统更严的方向迭代

伪代码这条路是把"人和机器都能读"的中间层显式做出来。

## 学到什么

1. **表示形式比检索算法影响更大**：同一个向量索引，markdown 还是伪代码差异 20%+
2. **可形式化的部分必须形式化**：能用规则查的不要给 LLM——省 token 又稳定
3. **混合库是务实选项**：不是所有 skill 都能翻译，能的走快道、不能的留旧道，平稳迁移
4. **签名是 API 也是文档**：类型签名同时给规则查和给读者看，一份内容两种用途
5. **省 LLM 调用就是省钱**：14% 的调用减少在 100 万次 evaluation 规模下意义巨大，工程上比模型小升级更可观

## 延伸阅读

- 论文原文：[arXiv 2605.27955](https://arxiv.org/abs/2605.27955)
- ALFWorld benchmark：[alfworld.github.io](https://alfworld.github.io/)
- [[voyager]] —— skill library 的奠基论文，markdown 表示
- [[mind-skill]] —— 同期工作，多 agent 归纳 skill
- [[effiskill]] —— 同期工作，code 效率优化场景

## 关联

- [[voyager]] —— skill 库奠基；SaP 重写它的 markdown 表示
- [[mind-skill]] —— 同期 skill 重表示工作；用多 agent 而非单写者
- [[effiskill]] —— 同期 skill 重表示工作；聚焦代码效率任务
- [[webxskill]] —— Web agent 上的 skill 学习；用纯 code 表示
- [[react]] —— agent 标准循环；SaP 在 skill 检索后那一步加了规则关
- [[cot]] —— LLM 推理基础；伪代码本质是结构化 CoT
- [[skill-pro-nonparametric-ppo]] —— 同期 skill 学习路线；不动权重学过程性 skill
- [[skill-sd-self-distillation]] —— 同期工作；用 skill 做自蒸馏

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[cot]] —— Chain-of-Thought Prompting
- [[effiskill]] —— EffiSkill — 把代码效率优化经验抽成两层 skill 库
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[react]] —— React UI 组件库
- [[skcc-skill-compiler]] —— SkCC — 给 LLM agent 写一个真正的 skill 编译器
- [[skill-pro-nonparametric-ppo]] —— Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
- [[skill-sd-self-distillation]] —— Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏
- [[voyager]] —— Voyager — LLM 终身学习智能体
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引
- [[zombie-agents-2602]] —— Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"

