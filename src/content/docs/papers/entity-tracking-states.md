---
title: Entity Tracking States — 语言模型不是一路记账，而是最后临时汇总
来源: 'Zilu Tang, Qiao Zhao, Gabriel Franco, Derry Wijaya, Aaron Mueller, Sebastian Schuster, Najoung Kim, "Do Language Models Track Entities Across State Changes?", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 中级
---

## 是什么

这篇论文研究一个很具体的问题：语言模型看到“物品被放进盒子、拿出盒子、搬到别的盒子”这种故事时，内部到底有没有像人一样持续更新状态。

日常类比：你在宿舍门口当值日生，记录“钥匙在抽屉里、后来被小王拿走、又被小李放回桌上”。真正会记账的人会每一步更新白板；这篇发现很多语言模型更像考前突击，等别人问“桌上有什么”时，才回头把相关句子临时凑起来。

论文的结论很直接：模型能做一部分实体追踪，但主要不是逐步维护完整世界状态，而是在最后一个查询位置聚合相关信息；其中 REMOVE 还用了一个脆弱的“全局压制标签”。

这里的“实体”就是物品，“状态”就是物品在哪个盒子里，“状态变化”就是 PUT、REMOVE、MOVE 这些操作。

## 为什么重要

不理解这篇，下面这些事会很难解释：

- 为什么模型答对“Box 1 contains ...”不一定代表它真的在脑内维护了七个盒子的完整清单。
- 为什么链式推理题、长对话记忆、程序变量更新，都不能只看最终准确率判断模型会不会“记状态”。
- 为什么一个看似合理的 REMOVE 机制，会在“同名物品出现在多个盒子”时突然崩掉。
- 为什么机制分析和行为测试要互相喂线索：内部机制能预测新的失败样例，失败样例又能验证机制假设。

## 核心要点

1. **最后临时汇总**：模型像查快递记录，不是每来一条消息就改库存表，而是被问到某个盒子时才翻相关记录。线性 probe 显示，全局状态很难从最后 token 解出，但被查询盒子的局部状态能解得很好。

   这点很反直觉：我们以为顺序任务就必须顺序计算，但 Transformer 可以把很多上下文片段并行搬到最后位置，再在那里合成答案。

2. **PUT 像绑定，REMOVE 像贴禁用标签**：PUT 新增物品时，模型会复用“把物品和盒子绑起来”的 look-back 类机制。REMOVE 更麻烦，它不是生成一个新答案，而是让某个物品不要被生成。

   所以 PUT 更像“找到并复制正确物品”，REMOVE 更像“压低某个物品的概率”。两者都叫状态变化，内部操作却不对称。

3. **全局 REMOVE 很脆**：模型真正起作用的 remove tag 更像贴在物品 token 上，而不是贴在“物品 + 盒子”这一对上。类比：系统把“苹果”整个加入黑名单，而不是只删除“Box 1 里的苹果”。

   这解释了为什么普通测试可能看不出问题：如果每种物品只出现一次，全局删除和局部删除给出的答案刚好相同。

## 实践案例

### 案例 1：把盒子故事翻成状态表

```python
boxes = {"Box 0": ["apple"], "Box 1": ["peach"]}
boxes["Box 1"].append("watch")      # PUT watch into Box 1
boxes["Box 0"].remove("apple")      # REMOVE apple from Box 0
print(boxes["Box 1"])
```

**逐部分解释**：

- `boxes` 是人工维护的世界状态，每个盒子有一份清单。
- `append` 对应 PUT，表示新增绑定。
- `remove` 对应 REMOVE，表示删除一个旧绑定。
- 人写程序会显式改表；论文发现模型往往没有这样一步步改表。

### 案例 2：全局删除为什么会错

```python
boxes = {"Box 0": ["pill"], "Box 3": ["pill", "jar"]}
removed = "pill"                    # 模型像把 pill 全局压低
answer = [x for x in boxes["Box 3"] if x != removed]
print(answer)
```

**逐部分解释**：

- 正确规则是“从 Box 0 删除 pill”，Box 3 的 pill 应该还在。
- 这段代码模拟错误机制：只要看到 `pill` 被 REMOVE，就从所有地方过滤掉。
- 论文用 shared-label objects 这类新测试证明，这种机制确实会导致退化行为。

### 案例 3：probe 和 intervention 的区别

```python
signal_found = True      # probe 能读出 remove tag
causal_effect = False    # 但擦掉它不一定改变输出
if signal_found and causal_effect:
    print("这个信号真的在驱动答案")
```

**逐部分解释**：

- probe 像体检报告：能告诉你某层表示里有没有某种信息。
- intervention 像拔线实验：擦掉这条信息，看输出会不会变。
- 论文发现 box ID 上能 probe 到 remove tag，但真正能因果改变输出的是 object token 上的 tag。

## 踩过的坑

1. **把答对等同于真追踪**：原因是原始数据里每种物品通常只出现一次，全局删除也能碰巧答对。
2. **把 probe 准确率当因果证据**：原因是 probe 只说明信息可读，不说明模型实际使用了这条信息。
3. **忽略空盒子和输出格式**：原因是有些模型不会自然生成“nothing”，会把任务能力和格式偏好混在一起。
4. **只测普通样例不测反例**：原因是普通 PUT/REMOVE/MOVE 不能区分“局部删除”和“全局删除”两种机制。

## 适用 vs 不适用场景

**适用**：

- 想理解语言模型是否真的维护世界状态，而不只是在最后复制相关词。
- 想学习 mechanistic interpretability 里 probe、path patching、activation intervention 怎么配合。
- 想设计更强的推理评测，尤其是能区分表面成功和内部错误机制的评测。

**不适用**：

- 需要证明所有模型都不会增量追踪；论文主要研究 Gemma、CodeLlama、Llama 等具体模型和盒子任务。
- 需要直接提升线上模型能力；文中的 nullspace intervention 更像机制验证，不是通用产品方案。
- 只关心自然语言问答排行榜；这篇更关心“为什么会答对或答错”。

## 历史小故事（可跳过）

- **2023 年**：Kim 和 Schuster 提出盒子数据集，让模型根据初始状态和操作序列回答最终盒子内容。
- **2024 年**：后续研究发现 code pretraining 会提升实体追踪能力，暗示写代码训练可能帮助模型处理变量式状态。
- **2024-2025 年**：实体绑定机制研究发现模型会用 order ID / look-back 方式把实体和属性连起来。
- **2026 年**：Tang 等人把问题推进到“状态真的会变化”的场景，发现模型更多是在查询时聚合，而不是持续更新世界表。

## 学到什么

- **实体追踪不是一个分数，而是一组机制**：同样答对，可能来自真状态表，也可能来自最后临时检索。
- **REMOVE 比 PUT 难解释**：PUT 是增加信号，REMOVE 是让某个答案不要出现，标准 patching 工具不太顺手。
- **机制能反推测试集**：发现全局 remove tag 后，就能设计 no-op remove、同名物品、多次移除再放回这些新失败样例。
- **局部正确不等于全局可靠**：模型可以在数据分布上表现不错，却在稍微改规则时暴露脆弱捷径。

读这篇最值得带走的学习方法是：先用行为实验找现象，再用 probe 提假设，最后用 intervention 判断哪个信号真的会改输出。

这比单纯看 benchmark 更慢，但能帮我们发现“模型为什么会错”，也能避免把偶然的高分误读成稳定能力。

## 延伸阅读

- 论文 PDF：[Do Language Models Track Entities Across State Changes?](https://arxiv.org/pdf/2605.30233v1.pdf)（本文主论文）
- 相关任务：[Entity Tracking in Language Models](https://arxiv.org/abs/2305.02363)（盒子数据集的直接前作）
- 相关结果：[Code Pretraining Improves Entity Tracking Abilities of Language Models](https://arxiv.org/abs/2405.21068)（代码预训练为什么可能帮状态追踪）
- 相关机制：[How do Language Models Bind Entities in Context?](https://arxiv.org/abs/2310.17191)（实体绑定里的 order ID 思路）
- [[activation-patching]] —— 用干预而不只用观察来定位模型行为来源
- [[cot]] —— 链式思考可能把长状态更新拆成更短、更容易维护的步骤

## 关联

- [[activation-patching]] —— 本文用 path patching 和 activation intervention 验证 PUT/REMOVE 的因果机制。
- [[causal-abstraction]] —— probe 读到的变量要经过干预，才更接近“模型真的用了这个变量”。
- [[attention]] —— PUT 的 look-back 机制依赖注意力头把查询位置连回上下文物品。
- [[codellama-2023]] —— 论文主分析大量使用 CodeLlama-13B，因为它在单步操作上可分析且成本较低。
- [[llama]] —— Llama-3.1-70B 用来验证更大模型在多步状态变化上是否也有类似趋势。
- [[cot]] —— 论文讨论 CoT 可能通过缩短上下文维护距离，缓解 remove tag 衰减。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
