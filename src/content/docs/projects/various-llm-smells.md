---
title: Various LLM Smells — 零基础学习笔记
来源: https://shvbsle.in/various-llm-smells/
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Various LLM Smells — 零基础学习笔记

## 什么是"LLM Smell"？

想象你去一家餐厅，点了一道菜。味道不错，但你越吃越觉得——这道菜"似曾相识"。后来你发现，隔壁街的五家餐厅都在用同一种调料包。

"LLM Smell"就是这种感觉。

作者 Shiv 去年开始用 LLM（大语言模型）来润色自己的数学博客文章。一开始他觉得效果很好：词汇更丰富、句式更多样。但三个月后，他发现**完全相同的句子结构和表达方式**出现在了互联网上的各个角落。

这就是"AI 味"——一种因为大量使用同一批 AI 模型而产生的、可以被识别出的共同特征。就像所有学生都用同一个范文模板写作文，读起来越来越像同一个人写的。

## 一、AI 写作的常见气味

### 1. 过多的"金句"（Way Too Many Punchlines）

AI 特别喜欢在每个段落末尾塞一句"看起来很有哲理"的话。

**日常类比：** 就像一个朋友聊天时，每说三句话就要引用一句名言，而且引用的还都是同几句。

**AI 生成的例子：**

```
"Humans trust symmetry because it feels like intelligence made visible."
（人类信任对称，因为它看起来像是智能的可见形态。）

"The Tiger fit the story. Jin-yong fit the physics."
（老虎契合故事，金庸契合物理。）

"Symmetry becomes a trap."
（对称变成了一种陷阱。）
```

你看这些句子——短促、有力、看起来很有深度。但它们有一个共同特点：**密度太高了**。正常写作不会每段都来一句"金句"，但 AI 会。

### 2. 连续的短句（Consecutive Short Sentences）

AI 特别喜欢用两到三个短句接在一起，制造节奏感。

**日常类比：** 就像一个人说话时，每个想法只用一个词加一个句号来表达："他来了。他没说话。他走了。"重复多次。

**AI 生成的例子：**

```
"Yet the tilt is not an accident. It is the shape of the optimum."
（然而倾斜并非偶然。它是最优的形状。）

"Then AlphaEvolve arrived. It had no preference for symmetry.
No aesthetic prior. No instinct to preserve harmony."
（然后 AlphaEvolve 出现了。它没有对对称的偏好。
没有审美的先验。没有维护和谐的直觉。）
```

注意这种模式：短句、短句、短句。每个句子只传达一个信息，然后断掉。这在英语写作中被称为"staccato style"（断奏风格），AI 特别爱用，因为它觉得这样显得"有力"。

### 3. "X 是 Y 的 Z"句式（"X is the Y of Z"）

这是一个非常经典的 AI 句式模板。

**日常类比：** 就像一个人在介绍事物时，不管什么领域，都用"X 是 Y 领域的 Z"这个固定格式来说明关系。

**AI 生成的例子：**

```
"Cringe is the visible signature of moving along a gradient you chose."
（尴尬是你选择沿着某个梯度移动时可见的签名。）
```

这里的结构是：`[抽象概念] is the [比喻名词] of [具体场景]`。

为什么这个句式这么流行？因为在训练数据中，科普文章、技术文档、哲学随笔里大量使用这种句式来建立概念之间的联系。LLM 学到了这个模式，就到处套用。

### 4. "不只是 X，而是 Y"句式（"not just X, it's Y"）

**日常类比：** 就像推销员卖东西时说："这不只是一辆车，这是你的生活方式。"不管卖什么，最后都来一句升华。

**AI 生成的例子：**

```
"solutions that do not merely satisfy the constraint
but satisfy the aesthetic instincts"
（不仅满足约束，而且满足审美直觉的方案。）
```

这个句式在原文中用的是"not merely ... but ..."变体，本质相同。AI 喜欢用这种结构来强调某件事的深层意义。

## 二、AI 生成网站的常见气味

除了文字，Shiv 还注意到 AI 辅助设计的网站也有非常统一的"味道"。

### 1. JetBrains Mono 字体

几乎所有 AI 生成的技术网站都使用 JetBrains Mono 作为代码字体。

```html
<!-- 典型的 AI 生成网站会这样设置字体 -->
<style>
  body {
    font-family: 'Inter', sans-serif;
  }
  code, pre {
    font-family: 'JetBrains Mono', monospace;  /* 到处都是这个 */
  }
</style>
```

JetBrains Mono 是一款优秀的等宽字体，但问题不在于字体本身，而在于**所有 AI 生成的网站都选同一款**。这就像所有学生穿同一双鞋去面试——鞋子没问题，但缺乏个性。

### 2. 标准化的步骤展示

AI 生成的教程页面几乎总是用同样的方式展示步骤：

```html
<!-- AI 生成的典型步骤组件 -->
<div class="steps">
  <div class="step">
    <span class="step-number">1</span>
    <h3>安装依赖</h3>
    <p>运行 npm install 命令...</p>
  </div>
  <div class="step">
    <span class="step-number">2</span>
    <h3>配置项目</h3>
    <p>创建配置文件...</p>
  </div>
</div>
```

每个步骤都有编号、标题、描述，用 bullet points 列出要点。结构完美，但也千篇一律。

### 3. 标准化的卡片组件

```html
<!-- AI 生成的典型功能卡片 -->
<div class="feature-card">
  <div class="card-icon">⚡</div>
  <h3>快速</h3>
  <p>毫秒级响应，性能卓越。</p>
</div>
```

图标 + 简短标题 + 一行描述。这也是因为训练数据中大量存在类似的文档页面，LLM 学到了这个模式。

### 4. 闪烁的小圆点徽章

```css
/* AI 生成的典型"在线"状态指示器 */
.status-badge::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
  animation: pulse 2s infinite;  /* 闪烁动画 */
}
```

一个绿色小圆点，带呼吸动画。看起来"专业"，但到处都是。

## 三、为什么会出现 LLM Smell？

### 训练数据的"回声室效应"

想象一个教室：老师教了 100 个学生写作文，给了他们同一本范文集。一开始大家写得各有特色。但渐渐地，所有学生都开始模仿范文集中的句式、用词和结构。最后交上来的作文，虽然内容不同，但"味道"一模一样。

LLM 就是那个教室里的学生。它们从互联网上数十亿网页中学习，而这些网页中已经包含了大量风格相似的内容。当数百万人也用 LLM 生成内容时，这些内容又反过来进入训练数据，形成正反馈循环。

### 概率的本质

LLM 的核心工作原理是预测下一个最可能出现的词。在训练数据中，某些表达模式出现的频率极高（比如"not only ... but also"、"X is the Y of Z"），所以 LLM 在生成文本时会倾向于选择这些高概率的模式。

```
用户输入：请写一篇关于机器学习优势的文章
LLM 内部推理：
  - 下一个词可能是"首先"（因为训练数据中列举优势时常用）
  - 或者"Machine learning offers several advantages"（英文常见开头）
  - 或者"Not only does ML improve efficiency, but it also..."（高概率句式）
```

## 四、如何识别和应对？

### 识别技巧

1. **重复模式检测**：如果你发现一篇文章中频繁出现相同的句式结构，可能就是 AI 生成的
2. **金句密度**：正常写作不会每段都有一句"看起来很有哲理"的话
3. **情感一致性**：AI 生成的文字往往过于"平稳"，缺少真实的情感波动

### 应对建议

1. **人工润色**：用 AI 生成初稿后，手动调整句式结构，打破重复模式
2. **混合风格**：有意识地在文章中加入不同风格的表达
3. **保持个人声音**：最重要的是，让你的独特视角和经历成为文章的主导

## 五、小结

"LLM Smell"不是一个技术问题，而是一个**文化问题**。它提醒我们：

- 当太多人使用同一个工具时，产出物的多样性会下降
- 识别这些"味道"是保持内容个性化的第一步
- AI 是强大的辅助工具，但不应该取代个人的思考和表达

就像 Shiv 在文章结尾说的："我并不反对在创造性任务中使用 LLM/AI。这只是我注意到了一些现象。"

认识到这些气味，不是为了拒绝 AI，而是为了在使用 AI 的同时，依然保持内容的真实性和多样性。
