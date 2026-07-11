---
title: Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
来源: 'Li, Zang, Cao, Sun. "Skill-as-Pseudocode: Refactoring Skill Libraries to Pseudocode for LLM Agents", arXiv:2605.27955, 2026'
日期: 2026-06-01
分类: agents
难度: 中级
---

## 是什么

Skill-as-Pseudocode（**SaP**）是一套**把 markdown skill 库自动改写成带类型签名的伪代码合同**的管线，并用四步确定性检查决定哪些合同能入库。日常类比：以前 skill 像手写菜谱散文——每次厨师（LLM）都要自己猜食材清单和火候口令；SaP 把重复段落抽成「标准工序卡」——吃啥参数、吐啥结果、怎么调用环境，都写死，还要过质检才上墙。

旧路线（Graph-of-Skills 一类 markdown 库）把流程写成自由散文。agent 每次检索后都要重推输入格式和具体动作串，容易陷入「半对 → 环境没反馈 → 再检索同一段」的循环。

SaP 的改动是：把相似 procedural 段落聚成簇，让写者 LLM 起草 typed contract，再跑 **Coverage / Binding / Replacement / Risk** 四步规则验证；通过的合同以 `invoke(κ, args)` 嵌回父 skill。检索时只查父 skill，再替换成「动作模板 + 改写骨架 + 内联合同」三件套。ALFWorld 134 局上相对 GoS：输入 token 约降 22.8%，LLM 调用约降 14.5%。

## 为什么重要

不理解 SaP，下面这些事都没法解释：

- 为什么 2026 年 agent 论文一窝蜂「重写 skill 表示」——markdown 太松散是公认痛点
- 为什么「转换期用规则质检」比「运行时再让 LLM 猜格式」更省 token
- 为什么 ALFWorld 上 skill-based agent 分化：表示形式（散文 vs 伪代码合同）比检索算法更影响成败
- 为什么「伪代码」既不是真可执行代码也不是自然语言，恰好卡在 LLM 最擅长的中间层

## 核心要点

SaP 的关键拆成 **三步**：

1. **类型化合同 κ**：每个子 skill 有 trigger、input/output schema、前置/后置条件（「做之前世界得怎样 / 做完应怎样」）、副作用（「会改掉哪些东西」）。类比：工序卡抬头写清「吃啥、吐啥、别碰啥」。

2. **四步确定性验证（转换期）**：Coverage 查名字是否对得上原文；Binding 查参数能否在父文档里落地；Replacement 查能否安全换成 `invoke`；Risk 查有没有危险脚本。**任一步不过就不 promote**——质检在入库前，不是检索时临时筛。

3. **检索时替换包**：任务时只检索父 skill；命中后把占位符展开成动作模板（怎么调环境）+ 改写骨架（步骤落点）+ 内联合同（抽象保证）。伪代码是「快速通道」，未改写段落仍留在父文档里。

三件事咬合：合同让结构可读，验证让坏合同进不了库，替换包让 agent 一次读懂 what + how。

## 实践案例

### 案例 1：把「加热物体」抽成伪代码合同

父 skill 散文里反复出现「去电器旁 → heat obj with appliance」。SaP 抽出合同（示意）：

```python
# κ_heat — typed contract（非直接执行的真代码）
# trigger: heat object
# input_schema: obj: Object, appliance: Appliance
# pre: obj.at(agent) and appliance.available
# post: obj.is_hot
# side_effects: uses(appliance)
def heat(obj, appliance):
    go_to(appliance)
    heat_with(obj, appliance)  # concrete action template
```

**逐部分解释**：签名告诉 agent 要哪些参数；pre/post 是可读保证；模板给出环境要听的原话口令。

### 案例 2：检索后换成三件套，而不是再猜格式

任务「把热杯子放进柜子」。检索命中父 skill 后，模块替换内容：

1. **动作模板优先**：`go to {appliance}`；`heat {obj} with {appliance}`，并填上 `obj=mug, appliance=microwave`
2. **改写骨架**：locate → `invoke(κ_heat, bindings)` → place
3. **内联合同**：trigger / I/O / post「物体已加热」

agent 先读到可执行口令，少一次「读散文猜语法」的弯路；论文把 token/调用下降主要归因于此。

### 案例 3：四步验证挡掉坏合同

skills_500 上约 5709 个段落聚成 149 簇；校准阈值下 **auto-promote 80** 个子合同。

- Binding 失败：簇太宽，参数名在父文档对不上 → 拒
- Replacement 失败：控制流缠在一起，没法干净换成 `invoke` → 拒
- Risk 失败：脚本含危险 sink（如乱删文件）→ 硬拒

过不了的簇不入库；父 skill 对应段落保持原文。不是「翻译失败返回 `unable_to_typify`」，而是 verifier 结构化拒绝。

## 踩过的坑

1. **过宽聚类会被 Binding 打回**：相似动词/物体硬捏一簇，参数对不上父文档，合同直接拒。
2. **控制流缠绕过不了 Replacement**：if/循环和步骤绞在一起，无法安全替换成 `invoke` 占位。
3. **Risk 必须扫脚本**：带可执行资源的 skill 要查不安全 sink，否则「能 promote」不等于「能安全给 agent」。
4. **子合同不要当顶层检索结果**：κ 应经父 skill 的 `invoke` 到达；单独检出子合同会缺上下文。

## 适用 vs 不适用场景

**适用**：

- 已有静态 markdown skill 库（如 GoS skills_500 量级），可解析出 procedural units
- 任务空间结构化（ALFWorld 类：清晰对象 + 动作模板）
- 想同时抬成功率并降 token / LLM 调用

**不适用**：

- 没有可复用 prose skill、全靠当场生成步骤
- 创意写作 / 纯对话——抽不出稳定 I/O schema
- 环境状态完全不可观测，合同的 pre/post 无从对照
- 把子合同当独立工具目录暴露（破坏 hierarchical 设计）

## 历史小故事（可跳过）

- **2023**：[[voyager]] 等轨迹生长库把成功经验存成可检索文档——相关但假设「先跑成功」
- **2024**：CodeAct / [[react]] 把「代码当动作」推主流，skill 往结构化靠
- **2025**：Anthropic SKILL.md、MCP 描述等仍以 markdown 散文为主部署面
- **2026**：SaP 提出 prose→typed pseudocode + 确定性质检；主对比基线是 Graph-of-Skills
- **同期**：[[mind-skill]] / [[effiskill]] / [[webxskill]] 从不同角度改 skill 表示

伪代码这条路是把「人和机器都能读」的中间层显式做出来。

## 学到什么

1. **表示形式比检索算法影响更大**：同一类库，散文 vs 伪代码合同可差出可测的胜局与成本
2. **可形式化的质检放在入库前**：Coverage/Binding/Replacement/Risk 用规则，不把坏合同丢给运行时 LLM
3. **检索交付 what + how**：模板（怎么调）和合同（保证什么）要一起给，缺一不可
4. **层次检索是设计约束**：父 skill 对外、子合同对内，避免无上下文的碎片能力

## 延伸阅读

- 论文原文：[arXiv 2605.27955](https://arxiv.org/abs/2605.27955)
- 参考实现：[InternLM/Skill-as-Pseudocode](https://github.com/InternLM/Skill-as-Pseudocode)
- ALFWorld benchmark：[alfworld.github.io](https://alfworld.github.io/)
- [[voyager]] —— 轨迹生长 skill 库（related work）
- [[mind-skill]] —— 同期多 agent 归纳 skill
- [[effiskill]] —— 同期代码效率场景的 skill 库

## 关联

- [[voyager]] —— 轨迹生长 skill 库；SaP 假设静态库而非先跑成功
- [[mind-skill]] —— 同期 skill 重表示；用多 agent 而非单写者+规则 verifier
- [[effiskill]] —— 同期 skill 重表示；聚焦代码效率任务
- [[webxskill]] —— Web agent 上用可执行代码表示 skill
- [[react]] —— agent 标准循环；SaP 改的是检索后塞进上下文的 skill 形态
- [[cot]] —— 伪代码合同可视为结构化、可质检的推理草稿
- [[skill-pro-nonparametric-ppo]] —— 同期不动权重学过程性 skill
- [[skill-sd-self-distillation]] —— 同期用 skill 做自蒸馏

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
