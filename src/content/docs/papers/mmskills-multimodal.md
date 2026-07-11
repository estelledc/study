---
title: MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
来源: 'Kangning Zhang et al., "MMSkills: Towards Multimodal Skills for General Visual Agents", arXiv:2605.13527, 2026'
日期: 2026-06-01
分类: agents
难度: 中级
---

## 是什么

MMSkills 是一套**给视觉 agent（看屏幕、点 GUI、玩游戏的那种）做"操作经验记忆"的方法**。日常类比：你刚学一个新游戏会做小抄——上面贴着"血条在哪""技能图标长什么样""按 A 跳跃 B 攻击"。下次遇到类似场景，你不用从零摸索，翻小抄就行。

agent 的小抄比人花哨一点：每张"技能卡片"上有两块东西：

- **state card**：一段文字，描述当前页面是什么、目标是什么、约束是什么
- **multi-view keyframes**：几张关键截图，记录"做这件事的过程长什么样"——比如"打开购物车"会有"主页 → 点击购物袋图标 → 弹出抽屉"三张图

文字 + 图一起存，下次撞到相似场景，agent 把卡片当上下文塞回模型，行动就稳了。

更直白点：以前的 skill 库像"只写菜谱不放图"，新人按文字试了 5 次都做不出蛋炒饭；MMSkills 是"菜谱 + 步骤照片"——论文在 GUI / 游戏基准上显示，有多模态 skill 时试错步数明显下降。

## 为什么重要

不理解 MMSkills 这种思路，下面这些事都没法解释：

- 为什么纯文字的 skill library（如 [[voyager]]）在 GUI 任务上表现急速衰减——光描述"点设置图标"agent 找不到那个齿轮
- 为什么很多视觉 agent 在 demo 视频里很顺、上线就抓瞎——因为没有跨会话累积的"做过这件事的视觉记忆"
- 为什么"做过的任务再做"应该越来越快、不该每次都重新摸索
- 为什么把 skill 抽成"通用的 step 序列"在游戏和 GUI 上比在文本任务上更香

## 核心要点

MMSkills 的设计可以拆成 **三件事**：

1. **state card 用文字压缩当前情境**：把屏幕上看到的、目标、可用动作写成一段结构化文字。类比：拍照前先写一句"傍晚海边 / 长曝光 / 三脚架"——不写出来，重点会被画面噪声淹没。

2. **multi-view keyframes 用图保存过程**：一个动作不是一张截图，而是动作前 / 动作中 / 动作后 3-5 张关键帧。类比：菜谱不只放成品照，还要放"切丁""下锅"几个中间步骤，新手才能照做。

3. **跨任务通用化**：state card 和 keyframes 都做了 query embedding，新任务来了先去 skill 库 top-k 检索最像的卡片，再让大模型基于这些卡片去推断当前该做什么。类比：考试时先翻同类题型，不是每题都从公式推。

三件事各自孤立都不新；新意在**强行把"文字情境""图过程""检索通道"绑成一张可序列化卡片**。

## 实践案例

### 案例 1：一次"建卡 → 检索 → 执行"流水线

任务：在购物 app 里把第二件商品加入购物车。逐步读：

1. **建卡**（上次成功轨迹抽出来）：写 state card（"商品列表页 / 目标=加购"）+ 存 3 张 keyframe（列表 → 点商品 → 加购成功）
2. **检索**：新会话开始，把当前屏幕描述做成 query embedding，去 skill 库 top-k 找最像的卡片
3. **塞上下文**：命中后，把 state card 文字 + 关键帧一起塞进模型提示
4. **执行**：模型按卡片动作链走，通常 3 步完成；没有卡片时常见路径是误点 banner → 退回 → 再摸索，要 8 步左右

加快的不是模型本身的视觉能力，而是**不再每次重新发现"加入购物车"这条动作链**。

### 案例 2：游戏 agent 的小抄长什么样

```text
state_card:
  game: "Stardew Valley"
  goal: "把农作物喂给鸡"
  observed: "主角在鸡舍, 背包里有小麦"
keyframes:
  - frame_0.png: "走近食槽"
  - frame_1.png: "面对食槽 + 按 X 提示出现"
  - frame_2.png: "饲料栏数字+1"
text_summary: "走近 → 面对 → 按 X 喂食"
```

逐部分：`state_card` 压缩"我在哪、要干嘛"；`keyframes` 保存过程长什么样；`text_summary` 给模型一句可执行摘要。这种卡片还能**导出给同游戏其他 agent**——玩家 wiki 攻略做的事，MMSkills 自动化了。

### 案例 3：和纯文字 skill 库比哪里赚

纯文字库写"点设置齿轮"：语义任务（填表）还行；找图标 / RPG 血条 / 换主题色后，文字丢视觉信息就抓瞎。MMSkills 多一条 keyframe 通道——**图标长什么样、点完画面怎么变**都在卡里，视觉问题也能像文本任务那样攒经验。

## 踩过的坑

1. **keyframes 选错就毒**：如果选成"网络抖动那一帧"或"加载中转圈那一帧"，下次匹配会把所有卡顿的网页都当成同一个场景
2. **state card 写得太长**：超过 200 token 就反而让大模型注意力散掉，不如不存
3. **跨设备分辨率差异**：1920×1080 录的 keyframe 在 1440×900 上完全失配——必须做 resolution-invariant 的 patch 匹配
4. **过度泛化**："加入购物车"在亚马逊和淘宝完全不同，硬合并卡片只会让两边都不会做

## 适用 vs 不适用场景

**适用**：

- GUI 自动化（[[claude-code]] 操作浏览器、桌面应用自动化）
- 视觉游戏 agent（开放世界、回合制、点击冒险）
- 需要跨会话累积"做过 X 任务"经验的长期任务
- 同一个任务被反复跑（成本敏感场景，省 token）

**不适用**：

- 纯文本任务（写代码、写邮件）——keyframe 拖累没收益
- 一次性任务（对手只来一次）——建库成本回收不了
- 视觉差异极大的跨域场景——keyframe 复用率太低反成噪声
- 模型本身视觉能力都不够时——卡片再好也没人看得懂

## 历史小故事（可跳过）

- **2023**：[[voyager]] 在 Minecraft 里证明 skill library 思路可行，但 skill 全是文本代码，不直接迁去 GUI
- **2024**：webxskill / SeeAct 这一批工作把视觉理解和 skill 概念结合，但 skill 还是单图 + 短描述
- **2025**：开始有工作把"action trace + multi-view"封装在一起，但泛化跨任务能力弱
- **2026**：MMSkills 把 state card 文字结构化 + multi-view keyframes 一起存进库，成为视觉 agent 的通用 skill 表示
- **未来 2-3 年**：可能进一步把"动作链"压成可执行小程序（接近 [[skill-as-pseudocode]] 的形态），keyframe 只留作回放校验

## 学到什么

- **skill 不是一行字**：要能 transfer，必须把"输入情境""动作序列""输出特征"一起存
- **多视角 > 单帧**：动作的本质是"过程"，单图丢失因果
- **检索粒度决定复用上限**：状态描述太抽象就过度合并，太具体就一次都不复用
- **视觉 agent 的瓶颈往往是"经验记忆"，不是模型本身**
- **构图 + 写作 + 索引** 是任何 skill 库都要做对的三件事，缺哪一个都跑不远
- **agent 的"会不会"和模型基线分开评估**——MMSkills 的提升量恰好量化了这一点
- 数据上看，**最值钱的不是新 skill，而是已有 skill 被精确召回**——索引比新增更影响下限

## 延伸阅读

- 论文：[MMSkills 2026 arXiv](https://arxiv.org/abs/2605.13527)
- 视频：[Visual Agent Survey 2026](https://www.youtube.com/results?search_query=visual+agent+skill+library)
- 工具：[GUI agent benchmarks 整理](https://github.com/topics/gui-agent)（看跨域评测怎么做）
- 配套读：[Voyager 2023](https://arxiv.org/abs/2305.16291)（开放世界 skill library 范式起点）
- [[voyager]] —— 文本 skill library 的鼻祖
- [[webxskill]] —— 把 web 操作做成 skill 库
- [[react]] —— 推理 + 行动循环的基线

## 关联

- [[voyager]] —— skill library 思路在 Minecraft 的早期落地
- [[webxskill]] —— web 视觉 agent 的 skill 表示
- [[skill-as-pseudocode]] —— 把 skill 写成可执行伪代码而非自然语言
- [[mind-skill]] —— skill 推理一类工作
- [[react]] —— 推理-行动闭环的基础范式
- [[reflexion]] —— 自我反思帮 agent 改进 skill 质量
- [[toolformer]] —— skill 的近邻：把工具调用学进模型本身
- [[agent-r1-2511]] —— 用 RL 训出 agent 行为的另一条路线
- [[skill-pro-nonparametric-ppo]] —— skill 库 + 策略学习的 RL 化尝试

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[zombie-agents-2602]] —— Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"
