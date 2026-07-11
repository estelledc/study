---
title: Voyager — LLM 终身学习智能体
来源: 'Wang et al., "Voyager: An Open-Ended Embodied Agent with LLMs", 2023'
日期: 2026-05-29
分类: AI / Agent
难度: 中级
---

## 是什么

Voyager 是 NVIDIA + 加州理工 2023 年做的一个 agent，让 GPT-4 自己在 Minecraft 里探索世界、自己学新技能。

日常类比：像派一个聪明实习生进游戏。你不告诉他"砍 100 次树会得木头"，你告诉他"自己想想下一步该干什么，写段代码完成它，做成功了把这段代码记下来下次直接用"。

和过去的做法对比：

- 不像 [[react]]：ReAct 只在当前对话窗口里"想→做→看"，任务一长记忆就挤爆
- Voyager：让 LLM 当大脑——自己提目标、自己写代码、把成功的代码存进"技能库"，下次用类似任务时调出来重用

整套系统**不更新任何模型参数**，纯靠 GPT-4 的 in-context 能力（把说明塞进当前提示词）+ 外部存储完成"学习"。

## 为什么重要

Voyager 是 LLM agent "真正学习"这条线的早期代表，不理解它就讲不清后世这些事：

- 为什么 coding agent 常有"项目记忆 / 技能复用"——和 Voyager 的 skill library 同一类思路（可执行片段 + 检索）
- 为什么 SWE-Agent / OpenHands 都把"错误信息回喂给模型重写"当标准动作——Voyager 的 iterative prompting 早做完了
- 为什么圈内强调"长期记忆 + 短期上下文要解耦"——Voyager 把可执行技能从 prompt 窗口挪到向量库（按语义找相似技能的数据库）里
- 为什么 LLM 写代码能碾压同期 Minecraft 基线：相对 AutoGPT / ReAct / Reflexion 等 prior SOTA，独特物品约 **3.3×**，科技树里程碑最高约 **15.3×** 更快

一句话：在它之前很多 agent 是"无外置记忆的机器人"，在它之后"会攒可复用技能"成了主流脚手架。

## 核心要点

Voyager 的"会学习"靠 3 个组件咬合：

1. **自动课程（Automatic Curriculum）**：让 LLM 自己提下一个目标。喂给 GPT-4 当前世界状态（背包、生物群系、已完成任务），让它输出"下一个任务：去砍 1 块木头"。类比：实习生看手头工具，自己想"现在该做啥才不掉链子"。

2. **技能库（Skill Library）**：成功任务对应的 JavaScript 函数存成磁盘文件，并用自然语言描述做 embedding（把句子变成可比较的数字向量）写入向量库。新任务先语义检索 top-5 旧技能塞进 prompt。类比：实习生的小工具箱。

3. **迭代提示（Iterative Prompting）**：失败时回灌环境反馈、执行异常、自我校验评语等，让模型改代码。类比：代码挂了不光看 stack trace，还告诉实习生"还差什么材料"。

3 个组件缺一个，效果都掉一大截。

## 实践案例

### 案例 1：从冷启动到第一个技能入库

agent 启动时技能库是空的；冷启动任务写死为"砍 1 块木头"。LLM 通过 Mineflayer（用 JS 遥控 Minecraft 角色的库）写出函数：

```js
async function chopWood(bot) {
  // description: chops a tree to get wood
  const tree = bot.findBlock({ matching: 'log' });
  await bot.pathfinder.goto(tree);
  await bot.dig(tree);
}
```

**逐部分解释**：`findBlock` 找树干 → `goto` 走过去 → `dig` 挖下。跑通后代码存盘，描述嵌入向量库——技能库的第一个 entry。

### 案例 2：复用旧技能造新东西

后续任务"造一张床"。先按任务描述做语义检索（输入：任务句；输出：top-5 旧技能）：

```js
const skills = await skillLibrary.retrieve("craft a bed", { topK: 5 });
// → 命中 chopWood、craftPlanks 等可复用函数
async function craftBed(bot) {
  await chopWood(bot);         // 复用检索到的旧技能
  await craftItem(bot, 'bed'); // 再写本轮新步骤
}
```

**逐部分解释**：`retrieve` 用描述向量找相似技能 → 把命中函数塞进 prompt → LLM 组出 `craftBed`；成功后再入库。

### 案例 3：失败时怎么改

任务"挖铁矿"。输入：异常 `"no pickaxe in inventory"` + 当前背包；输出：改写后的函数：

```js
// round 1 失败 → 把 error / inventory / critique 塞进下一轮 prompt
async function mineIronOre(bot) {
  await craftPickaxe(bot);              // 先补齐缺失工具
  const ore = bot.findBlock({ matching: 'iron_ore' });
  await bot.dig(ore);
}
```

**逐部分解释**：异常不是日志，是下一轮输入 → 模型先补 `craftPickaxe` 再挖。这是它比同期 AutoGPT 更稳的关键。

## 踩过的坑

1. **冷启动任务必须硬编码**：让 LLM 自提第一个任务常会说"先建农场"——宏大到完不成；最后写死"砍 1 块木头"。
2. **背包满了不让 LLM 决策**：36 格满了它会绕去"做新箱子"；硬编码"放箱子"更省 token、更稳。
3. **技能描述用自然语言、代码单独存**：直接 embedding JS 匹配差；先写 `// chops a tree to get wood` 再嵌描述——检索拿描述、复用拿代码。
4. **失败要能回退环境状态**：乱放方块会搞脏世界；`givePlacedItemBack` 把放下的方块捡回——改外部状态的 agent 都需要回退。

## 适用 vs 不适用场景

**适用**：

- 长 horizon、子任务可复用 ≥2–3 次（写代码流水线、网页自动化）
- 环境反馈可解析（异常栈、命令输出、API 响应、背包差）
- LLM 够强（GPT-4 / Claude Opus 级写得出可执行代码）

**不适用**：

- 单步任务（技能库是负担）
- 反馈非结构化（纯图像/音频、含糊口语意图）
- 小模型（写不出可执行 JS / 提不出合理课程）
- 不可逆生产环境（无回退就别让 agent 乱改）

## 历史小故事（可跳过）

- **2017**：OpenAI Universe 把 Minecraft 接进 RL benchmark，样本效率极低
- **2022**：[[react]] / [[cot]] 出来，但记忆全活在 prompt 窗口里
- **2022 年底**：MineDojo 发布，提供 Minecraft 评测平台
- **2023 年 5 月**：Voyager 挂 arXiv（2305.16291），打通 curriculum + skill library + iterative prompting
- **2023-2026**：SWE-Agent / OpenHands / 各类 coding agent 吸收"技能持久化 + 错误回喂"脚手架

## 学到什么

1. **记忆和上下文必须解耦**：外置 store 存技能，context 只放本轮最小子集
2. **成功留代码、失败留信号**：可复用形式入库，失败反馈直接回灌
3. **检索用语义、执行用代码**：描述便于匹配，代码便于调用
4. **多通道反馈优于单通道反思**：异常 + 环境 + 自检，信息密度高于纯 self-reflection 字符串

## 延伸阅读

- 论文原文：[arXiv 2305.16291](https://arxiv.org/abs/2305.16291)
- 项目主页：[voyager.minedojo.org](https://voyager.minedojo.org/)
- 开源代码：[MineDojo/Voyager](https://github.com/MineDojo/Voyager)
- [[react]] —— Voyager 之前 LLM agent 的标准循环，无外置技能库
- [[cot]] —— 链式思考；curriculum agent 的能力基础
- [[rag]] —— 检索增强；技能库是 RAG 在 agent 上的早期实例

## 关联

- [[react]] —— LLM agent 奠基循环；Voyager 在其上加长期技能库
- [[cot]] —— 链式思考；curriculum agent 本质是 CoT 应用
- [[transformer]] —— GPT-4 底层架构；Voyager 靠 in-context 能力
- [[rag]] —— 检索增强生成；技能库的近亲
- [[openhands]] —— 开源软件工程师 agent；错误回喂与技能复用的工程化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agentless]] —— Agentless — 反 Agent 派的 SWE-bench 解法
- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[cot]] —— Chain-of-Thought Prompting
- [[effiskill]] —— EffiSkill — 把代码效率优化经验抽成两层 skill 库
- [[metagpt]] —— MetaGPT — 多智能体软件公司
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[nlp-agent-2024]] —— Cognitive Architectures for Language Agents (CoALA)
- [[openhands]] —— OpenHands — 开源 AI 软件工程师
- [[react]] —— React UI 组件库
- [[skcc-skill-compiler]] —— SkCC — 给 LLM agent 写一个真正的 skill 编译器
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[skill-pro-nonparametric-ppo]] —— Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
- [[skill-sd-self-distillation]] —— Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引
- [[zombie-agents-2602]] —— Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"
