---
title: Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下
来源: 'John Sweller, "Cognitive Load During Problem Solving: Effects on Learning", Cognitive Science 1988'
日期: 2026-05-29
分类: 认知科学
难度: 初级
---

## 是什么

 Cognitive Load Theory（**CLT**，认知负荷理论）说的是一件事：**人脑同时能处理的信息块很少，材料一旦把工作记忆塞满，学习就会卡住**。日常类比：像一张小书桌，你要拼一百片拼图就得反复腾挪——挪着挪着，忘了刚才在拼哪块。

Sweller 1988 的关键转换是：**这不是学生懒，是教学设计把书桌占满了**。

 如果学习材料的格式让你不停在两屏之间切换、把一句话同时听 + 同时看字幕、要先记住一堆中间值才能看到整体——这些动作会把有限的工作记忆全占掉，**几乎不剩空间用于真正的学习（构造长期记忆里的 schema）**。结论：教学设计的任务不是"塞更多东西"，而是"清出位置"。

## 为什么重要

不理解 CLT，下面这些事都没法解释：

- 为什么"读 8 道完整解题示范"比"做 8 道相似练习"transfer 得分高 30-50%——多做题反而学得少
- 为什么同一份文档，新人觉得"啰嗦"和老手觉得"啰嗦"原因相反——新人嫌信息散，老手嫌支架多
- 为什么调试时关掉无关页签 / 静音通知后效率突然变高——不是你"集中了注意力"，是工作记忆被腾出来了
- 为什么 LLM 默认 step-by-step 解释让 senior 工程师烦躁——支架对专家是干扰

## 核心要点

CLT 把"认知负荷"拆成 **三类**，加起来不能超过工作记忆容量：

1. **内在负荷**（intrinsic）：任务本身有多难。类比：拼图本身有多少片。学递归比学加法内在负荷高，因为递归要同时持有调用栈 + 终止条件 + 当前帧。

2. **外在负荷**（extraneous）：教学设计带来的、与学习无关的负荷。类比：把拼图碎片散在两个房间。代码和说明分两屏、视频解说同时配冗余字幕——这些都是白白浪费的格子。

3. **有效负荷**（germane）：用来构造 schema 的有效投入。类比：你**主动**对比两片拼图找规律。这部分越多越好，但只有先把 extraneous 压下去，才有空间留给 germane。

核心不等式：`Intrinsic + Extraneous + Germane ≤ 工作记忆容量`。教学设计的唯一可控变量是减 extraneous、增 germane。

## 实践案例

### 案例 1：Worked Example 优于自由做题

Sweller 1988 Experiment 3（几何题，n=24）数据：

```
                    | 自由做题组   | 看示范 + 配对题组
训练时长            |  29 分钟      |  18 分钟
训练错误数          |   4.1         |   1.2
近 transfer 得分    |   4.2 / 8     |   6.7 / 8       (p<0.01)
```

**逐部分解释**：自由做题组花更多时间、犯更多错、迁移测试还更差。原因：他们的工作记忆全用在"找下一步"（means-ends 搜索），剩下的不够抽取题型 schema。看示范组直接跳过搜索，把工作记忆都用在"理解结构"上。

这个现象后来被 200+ 复现实验确认（Renkl 2014 综述），是 instructional design 里实证最强的命题之一。直接推论：onboarding 流程的前 3 天该是"完整示范 + 配对练习"，而不是"扔文档让自学"。

### 案例 2：Split-Attention 在文档里的常见反例

```
坏的设计（split）：
  左屏：figure 标着 R1, C1, ...
  右屏：文字 "R1 是 10 欧, C1 是 5 微法, ..."
  → 学习者必须在两屏之间反复切换、靠工作记忆"对齐"

好的设计（integrated）：
  figure 上每个元件直接标参数：
    [ R1 (10Ω) ]---[ C1 (5μF) ]---...
  → 信息在同一个视野里，不消耗工作记忆做对齐
```

React 官方文档 2023 改版砍掉 sidebar、把说明 inline 到代码注释，本质就是 split-attention 修正。

### 案例 3：Expertise Reversal — 同一份材料对新手 +30%、对专家 -20%

```python
# Python list comprehension：
[x*x for x in nums if x % 2 == 0]
```

附 5 步 step-by-step 注释（"第 1 步：定义函数 ... 第 5 步：返回列表"）。

- 对**新手**（无 list comp schema）：5 步注释 = 5 个新概念的支架，germane 高，学习 +30%
- 对**专家**（已有 list comp schema）：整段代码是 1 个 chunk，5 步注释变成 5 个**多余的**信息块，extraneous 飙升，学习 **-20%**

这就是为什么 LLM 默认啰嗦风格让 senior 烦躁：支架对新手是脚手架，对专家是绊脚石。

工程对策（CLT 直接给出）：
- system prompt 加"用户是专家，跳过基础"——显式抑制 redundancy
- 让用户选 verbosity（chat 软件已开始这么做）——动态适配 schema level
- 文档分层折叠：novice 段落展开，expert 段落默认收起

## 踩过的坑

1. **把"7±2"当圣旨**——Cowan 2001 实证更接近 4±1，且 chunk 大小因 schema 不同差几个数量级；CLT 真正可用的是"工作记忆有限"这个**形状**，不是具体数字
2. **以为做题越多越好**——做对题 ≠ 学到 schema，工作记忆全被搜索消耗时学习几乎为零
3. **想"零外在负荷"**——现实里完全消除噪声不可能，目标是降到不阻塞 schema 建构即可
4. **把 CLT 套到所有学习场景**——母语听说、面孔识别这类 primary skill 不需要 explicit 教学，CLT 只对编程、数学、写作这类 secondary skill 有效（Tricot-Sweller 2014）

## 适用 vs 不适用场景

**适用**：
- 教新手编程 / 数学 / 写作（secondary knowledge）
- 设计 onboarding 流程：worked example 优先于"扔文档让自学"
- 文档 / 视频教学的格式诊断（split-attention / redundancy 检查）
- 自己 debug "学不会"——区分内在难、材料烂、还是投入不够
- 团队 1on1 / code review 的反馈拆解——抱怨"看不懂"先问是 split-attention 还是 schema 缺失

**不适用**：
- 母语听说、走路、面孔识别（primary knowledge，演化已配好）
- 长期记忆保持问题——CLT 只管"装进去"，不管"忘多快"，需配合 [[fsrs-spaced-repetition]]
- 个体差异极端的场景——高 vs 低工作记忆个体的 CLT 适用边界 1988 论文未讨论

## 历史小故事（可跳过）

- **1956 年**：心理学家 Miller 发现"魔力数字 7±2"——人短期记忆只能装 7 个 chunk。纯描述性。
- **1972 年**：Newell-Simon 出 Human Problem Solving，提出 means-ends 求解策略。CLT 后来指出它**抑制学习**。
- **1988 年**：Sweller 在 Cognitive Science 发表 4 个数学题实验，证明"看示范 > 自己做"。把 Miller 的描述性常数变成教学设计的硬约束。
- **2003 年**：Kalyuga 补全 expertise reversal——同一设计对新手有效、对专家反向有效。CLT 30 年最重要的修正。
- **2014 年**：Tricot-Sweller 收回"CLT 普适"宣称，限定到 secondary knowledge（数学、写代码、写作等需要显式教学的技能）。
- **2020s**：CLT 进入软件工程教学（freeCodeCamp 课程结构）、间隔重复工具（Anki）、LLM verbosity 设计——成为 instructional design 的事实标准框架。

## 学到什么

1. **学不会不是道德问题，是容量问题**——把"我没学懂"重新定义为"我超载了"，立刻有具体对策（减 extraneous、降 intrinsic、增 germane）
2. **教学设计的可控变量只有两个**：去掉无关负荷、引导有效投入。任务本身的难（intrinsic）只能通过拆任务降
3. **没有"通用最佳教学法"**——expertise reversal 说明同一设计对不同 schema 水平的人效果反向，必须分级
4. **CLT 是 1988 年的论文，30 年后还在影响每一份你看的文档、每一个你设计的 onboarding**——理论框架的生命力远超单个实验
5. **学到的最便宜的诊断法**：下次"学不会"先问自己三个问题——"任务本身是不是装不下"（intrinsic）/"材料格式是不是太散"（extraneous）/"我有没有在主动找规律"（germane）

## 延伸阅读

- 视频：[Veritasium — The 4 things it takes to be an expert](https://www.youtube.com/watch?v=5eW6Eagr9XA)（30 分钟讲 deliberate practice + schema 形成）
- 书：[Make It Stick (Brown, Roediger, McDaniel 2014)](https://www.makeitstick.net/)（CLT + retrieval practice + interleaving 的科普合集）
- 论文 PDF：[Sweller 1988 原文（29 页）](https://onlinelibrary.wiley.com/doi/10.1207/s15516709cog1202_4)
- 综述：[Sweller, van Merriënboer, Paas 2019, "Cognitive Architecture and Instructional Design: 20 Years Later"](https://link.springer.com/article/10.1007/s10648-019-09465-5)
- [[fsrs-spaced-repetition]] —— CLT 管"学进去"，间隔重复管"不忘记"，互补
- [[program-comprehension-fmri]] —— 用 fMRI 直接量代码理解的认知负荷

## 关联

- [[fsrs-spaced-repetition]] —— CLT 覆盖 acquisition，间隔重复覆盖 retention，两条线都需要
- [[programmer-interruption]] —— 中断打断的就是工作记忆里的当前 schema，恢复成本就是 CLT 的代价
- [[program-comprehension-fmri]] —— 神经层证据，把 CLT 的认知架构假设落到 BA44/45 等具体脑区
- [[debugging-dichotomy]] —— 调试时减 extraneous（关页签、隔离最小复现）= CLT 的直接应用
- [[hindley-milner]] —— 类型推导是"减 extraneous"的语言级例子：少手写注解 = 少占工作记忆
- [[no-silver-bullet]] —— Brooks 的 essential vs accidental complexity 与 CLT 的 intrinsic vs extraneous 是同一组洞见的不同框架
- [[great-swe]] —— "10 年成专家"的核心机制就是 schema chunking，专家把 100 个 element 看成 1 个 chunk

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ci-effects]] —— CI Effects — 持续集成不是免费午餐，价值看实现细节
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[fsrs-spaced-repetition]] —— FSRS — 让 Anki 知道每张卡什么时候快被你忘掉
- [[great-swe]] —— Great SWE — 资深工程师"伟大"的标准是 humble + always learning
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[no-silver-bullet]] —— No Silver Bullet — 软件难度的二分手术刀
- [[pair-programming]] —— Pair Programming — 两个人共用一台机器写代码
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[programmer-interruption]] —— Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码
- [[sillito-questions]] —— Sillito 44 问题 — 程序员改代码时到底在问什么

