---
title: Voyager — LLM 终身学习智能体
来源: 'Wang et al., "Voyager: An Open-Ended Embodied Agent with LLMs", 2023'
日期: 2026-05-29
子分类: 智能体与 LLM
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Voyager 是 NVIDIA + 加州理工 2023 年做的一个 agent，让 GPT-4 自己在 Minecraft 里探索世界、自己学新技能。

日常类比：像派一个聪明实习生进游戏。你不告诉他"砍 100 次树会得木头"，你告诉他"自己想想下一步该干什么，写段代码完成它，做成功了把这段代码记下来下次直接用"。

和过去的做法对比：

- 不像 [[react]]：用强化学习训出一个固定的"反射动作"网络
- Voyager：让 LLM 当大脑——自己提目标、自己写代码、把成功的代码存进"技能库"，下次用类似任务时调出来重用

整套系统**不更新任何模型参数**，纯靠 GPT-4 的 in-context 能力 + 外部存储完成"学习"。

## 为什么重要

Voyager 是 LLM agent "真正学习"这条线的开端，不理解它就讲不清后世这些事：

- 为什么 Claude Code / Cursor / Cline 都有"项目记忆 / 技能复用"——思路源自 Voyager 的 skill library
- 为什么 SWE-Agent / OpenHands 都把"错误信息回喂给模型重写"作为标准动作——Voyager 的 iterative prompting 早做完了
- 为什么 LLM agent 圈说"长期记忆 + 短期上下文要解耦"——Voyager 是第一个把记忆从 prompt 搬到向量数据库的
- 为什么 LLM 写代码这条路能干掉传统 RL：Voyager 拿独特物品的速度比同期 RL agent 快 100 倍以上

一句话：在它之前 agent 是"无记忆机器人"，在它之后 agent 是"会攒经验的实习生"。

## 核心要点

Voyager 的"会学习"靠 3 个组件咬合：

1. **自动课程（Automatic Curriculum）**：让 LLM 自己提下一个目标。喂给 GPT-4 当前世界状态（背包里有什么、生物群系是什么、已完成什么任务），让它输出"下一个任务：去砍 1 块木头"。类比：实习生看手头工具，自己想"现在该做啥才不掉链子"。

2. **技能库（Skill Library）**：成功完成的任务对应的 JavaScript 函数存成磁盘文件 + 写进向量数据库索引。下次新任务先用语义检索拿出 5 个最相关的旧技能，塞进 prompt 当 context。类比：实习生把成功的代码片段攒成自己的小工具箱，下次遇到类似活儿先翻箱子。

3. **迭代提示（Iterative Prompting）**：执行失败时，把 4 类信号一起回灌给 LLM——JS 异常、游戏聊天框信息、批评 agent 的评语、背包变化。让模型基于真实反馈改代码。类比：代码跑挂了不光看 stack trace，连"这个工具还差什么材料"都告诉实习生。

3 个组件缺一个，效果都掉一大截。

## 实践案例

### 案例 1：从冷启动到第一个技能入库

agent 启动时技能库是空的。

- 写死冷启动任务："去砍 1 块木头"
- LLM 调 Mineflayer 的 JS API 写一段 `chopWood()` 函数
- 在游戏里跑通了
- 把这段代码存进磁盘 + 描述"砍一棵树拿木头"嵌入向量库

这就是技能库的第一个 entry。后面所有的复用都从这里长出来。

### 案例 2：复用旧技能造新东西

后续任务："造一张床"。

- LLM 检索向量库 → top-5 命中 `chopWood` 等旧技能
- 把这些旧技能的代码塞进 prompt
- LLM 输出新代码：先调 `chopWood()` 拿够木头 → 再写 `craftBed()` 用木头合成床
- 跑通了 → 把 `craftBed()` 也入库

这就是"技能复利"：库越大、能完成的任务越复杂。

### 案例 3：失败时怎么改

任务："挖铁矿"。

- LLM 写了段挖矿代码 → Mineflayer 抛异常 "no pickaxe in inventory"
- Voyager 把这条异常 + 当前背包内容 + 评语 agent 的批评一起回灌进下一轮 prompt
- LLM 看到"哦没镐子"，改代码：先检索 `craftPickaxe` → 调它造镐 → 再挖
- 这次成功

错误信息**不是日志**，是输入。这是 Voyager 比同期 AutoGPT 鲁棒的关键。

## 踩过的坑

1. **冷启动任务必须硬编码**：原本想让 LLM 自己提第一个任务，但模型经常说"先建一个农场吧"——一上来就给个完不成的宏大目标。最后只能写死"砍 1 块木头"作为入口。
2. **背包满了不让 LLM 决策**：Minecraft 背包 36 格，满了之后让 LLM 想办法，它会绕一大圈说"那就先做新箱子吧"。直接硬编码"放箱子"省 token 又稳定。
3. **技能描述用自然语言、代码单独存**：直接 embedding JS 代码效果差，"砍木头"这种意图查询匹配不到。先让 LLM 给代码写一行注释 `// chops a tree to get wood`，再 embedding 注释。检索拿描述、复用拿代码——双表示是关键。
4. **失败要能回退环境状态**：agent 放了一堆没用的方块就把世界搞脏了。Voyager 写了 `givePlacedItemBack` 把放下的方块捡回来。任何修改外部状态的 agent 都得有这种回退机制。

## 适用 vs 不适用场景

**适用**：

- 长 horizon 任务、子任务有复用空间（写代码、数据分析流水线、网页自动化）
- 环境反馈结构化（异常栈、命令输出、API 响应可解析）
- LLM 能力足够强（GPT-4 / Claude Opus 级别）

**不适用**：

- 单步任务（没有"积累"空间，技能库就是负担）
- 反馈非结构化（图像、音频、人类自然语言意图）
- 小模型（Llama-7B 写不出可执行 JS / 提不出合理课程）
- 严格的环境状态约束（生产数据库、不可逆操作）——回退机制写不出来

## 历史小故事

- **2017**：OpenAI Universe 把 Minecraft 接进 RL benchmark，但样本效率极低（百万步才学一个新技能）
- **2022**：[[react]] / [[cot]] 出来——thought-action-observation 循环 + 链式思考，但记忆全活在 prompt 窗口里，长任务一发就触顶
- **2022 年底**：MineDojo 发布（Voyager 同实验室前作），提供 Minecraft 评测平台
- **2023 年 5 月**：Voyager 论文挂 arXiv。第一次把 curriculum + skill library + iterative prompting 三件套打通，证明 LLM agent 可以"持续学习"
- **2023-2024**：AutoGen / SWE-Agent / OpenHands 先后吸收 Voyager 思路（技能持久化 + 错误回喂）
- **2024-2026**：Cursor agent / Cline / Claude Code 等工业产品标配"项目级长期记忆"——本质是 Voyager 范式的工程化

Voyager 论文不是终点，它是一条路线的发车站。

## 学到什么

1. **agent 想"学习"，记忆和上下文必须解耦**：记忆存外部 store（向量库 + 文件），context 只放本轮决策需要的最小子集
2. **成功留代码、失败留信号**：成功的输出存进可复用的形式，失败的反馈直接回灌——两类轨迹都有用
3. **检索用语义、执行用代码**：embedding 描述（自然语言）便于匹配查询，存原始代码便于直接调用——一份知识两种表示
4. **多通道反馈优于单通道反思**：异常 + 日志 + 评语 + 状态差，组合起来比 self-reflection 字符串信息密度高得多
5. **curriculum 自生成是核心**：Voyager 让 GPT-4 自己提下一阶段目标——这把"任务设计" 这件原本人来做的事交给模型；只要模型水平够，自动出题人比固定 curriculum 跑得更远
6. **Minecraft 是 agent 的健身房**：开放沙盒 + 可编程 + 反馈即时 + 工具丰富，让 Voyager 能用十几小时挑战完几十个技能；类似的"沙盒环境是 agent 训练场" 思路后来被 SWE-Bench / WebArena 等继承
7. **代码作为技能载体**：用可执行 JS 函数存技能比存自然语言描述的"how-to" 强，因为代码本身就是可验证可调用的——这条选择决定了 Voyager 的 skill library 比纯文本知识库更扛重复使用
8. **iterative prompting 与 self-verification**：每次执行后 GPT-4 自己看异常 / 日志做下一轮修复——这种"agent 给自己看 traceback" 的反思循环是后续所有 coding agent 的事实标配
9. **Minecraft 钻石不是终点**：Voyager 用 160 个技能做完了 Minecraft 教程线，但报告里反复强调它的目标不是"通关游戏"，而是"证明 LLM 能在开放沙盒里持续学习"——把任务当尺子而非目的
10. **lifelong learning 是工程化的产物**：技能库可累积、子任务可调用、失败可重试——这些都是工程结构而不是模型本身的能力，"持续学习" 实际上是好脚手架在背后做的事

## 延伸阅读

- 论文原文：[arXiv 2305.16291](https://arxiv.org/abs/2305.16291)（NeurIPS 2023 D&B Track）
- 项目主页带 demo 视频：[voyager.minedojo.org](https://voyager.minedojo.org/)
- 开源代码：[MineDojo/Voyager](https://github.com/MineDojo/Voyager)（Python + JS，star 5k+）
- [[react]] —— Voyager 之前 LLM agent 的标准范式，无长期记忆
- [[cot]] —— 链式思考是 Voyager 让 LLM 自己提任务的能力基础

## 关联

- [[react]] —— LLM agent 的奠基循环；Voyager 在其上加了长期记忆
- [[cot]] —— 链式思考；Voyager 的 curriculum agent 本质是 CoT 应用
- [[transformer]] —— GPT-4 的底层架构；Voyager 完全靠它的 in-context 能力
- [[rag]] —— 检索增强生成；技能库就是 RAG 思想在 agent 上的早期实例

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agentless]] —— Agentless — 反 Agent 派的 SWE-bench 解法
- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[cot]] —— Chain-of-Thought Prompting
- [[effiskill]] —— EffiSkill — 把代码效率优化经验抽成两层 skill 库
- [[metagpt]] —— MetaGPT — 多智能体软件公司
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[openhands]] —— OpenHands — 开源 AI 软件工程师
- [[react]] —— React UI 组件库
- [[skcc-skill-compiler]] —— SkCC — 给 LLM agent 写一个真正的 skill 编译器
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[skill-pro-nonparametric-ppo]] —— Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
- [[skill-sd-self-distillation]] —— Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引
- [[world-model-robot-learning-2026]] —— 机器人世界模型综述 — 预测未来再动手
- [[zombie-agents-2602]] —— Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"

