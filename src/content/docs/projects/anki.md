---
title: Anki 零基础学习笔记
来源: https://github.com/ankitects/anki
日期: 2026-06-13
分类: 其他
子分类: education-tech
provenance: pipeline-v3
---

# Anki 零基础学习笔记

## 一、Anki 是什么——用"电子翻翻卡"来理解

想象一下你学外语时的纸质单词卡：正面写「bonjour」，背面写「你好」。
你看着正面想答案，翻到背面确认对不对，然后收起来。

Anki 就是**电子版的翻翻卡（flashcard）**，但它比纸卡片聪明很多：

- 纸卡片你只能靠感觉决定复习时机；Anki 会**自动计算**每张卡在什么时候该复习
- 你回答"记住了"还是"忘了"，Anki 就根据你的表现安排下次出现的时间
- 忘了的卡过一会儿就再来；记住了的卡可能三天、三天后七天、七天后一个月才出现

这个自动安排复习时间的算法叫**间隔重复（Spaced Repetition）**，是学习科学里被反复验证的最有效记忆方法之一。

## 二、核心概念

Anki 的核心概念可以类比为**一套管理知识的系统**：

| 概念 | 日常类比 | 说明 |
|------|---------|------|
| **卡片 (Card)** | 一张翻翻卡 | 一个问题 + 一个答案 |
| **牌组 (Deck)** | 一叠卡片 | 一组相关的卡 |
| **笔记 (Note)** | 一张信息卡 | 包含多个字段的信息 |
| **字段 (Field)** | 信息卡上的一个格子 | 如「法语词」「中文意」「页码」 |
| **笔记类型 (Note Type)** | 一种信息卡的模板 | 定义了有哪些字段、生成什么卡 |
| **卡片类型 (Card Type)** | 一种出题方式 | 定义了正面问什么、背面答什么 |
| **集合 (Collection)** | 你所有的卡 | 所有卡片的总集合 |

关键区别：一张**笔记**可以生成多张**卡片**。

举个例子，你记一条法语笔记：

```
字段: French = "bonjour"
字段: English = "hello"
字段: Page = 12
```

Anki 可以自动从这条笔记生成两张卡：

```
卡片1（认读）:  正面 "bonjour" → 背面 "hello, Page #12"
卡片2（默写）:  正面 "hello"  → 背面 "bonjour, Page #12"
```

两条卡共享同一条笔记，改一个字段，两张卡同时更新。

## 三、卡片的状态

每次你答完一张卡，Anki 会给你的表现打分，卡片随之进入不同状态：

- **New（新卡）**：从未学习过
- **Learning（学习中）**：刚学不久，需要密集复习来巩固
- **Review（复习中）**：已掌握，按间隔重复算法安排复习
  - Young（年轻的卡）：间隔 < 21 天
  - Mature（成熟的卡）：间隔 >= 21 天
- **Relearn（重新学习）**：复习时忘了，回到学习状态重新巩固

## 四、卡片模板——模板引擎

Anki 的卡片模板用了**双花括号语法** `{{字段名}}` 来引用字段内容，
类似前端模板引擎。

**正面模板（问题）：**

```html
{{French}}
```

**背面模板（答案）：**

```html
{{English}}<br>
Page #{{Page}}
```

渲染出来的实际卡片就是：

```
正面: bonjour

背面: hello
Page #12
```

`<br>` 是 HTML 换行标签，告诉 Anki 在"hello"后面换一行再显示页码。

## 五、代码示例

### 示例 1：创建一套法语词汇的笔记和卡片

假设你正在创建法语词卡，笔记类型有三个字段：`French`、`English`、`Page`。

你添加第一条笔记，填入：

```
French: bonjour
English: hello
Page: 12
```

在卡片设置中，你定义了两种卡片类型：

**卡片类型 1 —— 认读卡（看到法语想英文）：**

```
正面模板: {{French}}

背面模板: {{English}}<br>
          Page #{{Page}}
```

渲染结果：

```
正面: bonjour

背面: hello
Page #12
```

**卡片类型 2 —— 默写卡（看到英文想说法语）：**

```
正面模板: {{English}}

背面模板: {{French}}<br>
          Page #{{Page}}
```

渲染结果：

```
正面: hello

背面: bonjour
Page #12
```

同一条笔记自动生成了两张卡，一张测认读能力，一张测默写能力。

### 示例 2：Cloze（填空）笔记类型

Cloze 是 Anki 的另一笔记类型，适合记句子或段落。语法是用 `[...]` 包裹要隐藏的内容。

原始句子：

```
Humans landed on the moon in [1969].
```

渲染后生成的卡片是：

```
正面: Humans landed on the moon in [...].

背面: Humans landed on the moon in 1969.
```

你可以在一句话里藏多个空：

```
Paris is the capital of [France], and its population is about [12 million].
```

这会生成两张卡：

```
卡片1: Paris is the capital of [...]. → France
卡片2: Paris is the capital of France, and its population is about [...]. → 12 million
```

### 示例 3：用双列牌组组织笔记

Anki 用双冒号 `::` 表示牌组的层级关系：

```
Default                     ← 默认牌组
Chinese::Hanzi              ← Chinese 下的 Hanzi 子牌组
Chinese::Vocabulary         ← Chinese 下的 Vocabulary 子牌组
Chinese::Hanzi::Lesson1     ← Chinese::Hanzi 下的 Lesson1 子牌组
```

选择 "Chinese" 时，会复习所有 Chinese 牌组下的卡片；
选择 "Chinese::Hanzi" 时，只复习汉字卡片。

## 六、学习流程总结

一个完整的学习循环：

```
1. 添加笔记（填字段）
   ↓
2. Anki 自动根据模板生成卡片
   ↓
3. 卡片进入 "New" 状态
   ↓
4. 你学习新卡 → 进入 "Learning" 状态
   ↓
5. 你回答"记住了"或"忘了"
   ↓
6. Anki 根据你的表现安排下次复习时间
   ↓
7. 卡片进入 "Review" 状态，按间隔重复复习
   ↓
8. 忘了 → 回到 "Relearn" → 再回到 "Review"
```

## 七、为什么 Anki 好用

1. **算法自动安排复习**：不用自己计划什么时候复习哪张卡
2. **笔记 + 字段分离**：改一个字段，所有相关卡片同时更新
3. **多卡片类型**：一条笔记自动出多种考法（认读 / 默写）
4. **跨平台同步**：桌面端、手机端、网页端同步，用 AnkiWeb 互联
5. **生态丰富**：有大量共享牌组可以下载，也有丰富的插件系统

## 八、给初学者的建议

- 先下载共享牌组试用，熟悉后再自己创建
- 用自己的笔记（理解后再记）比死背共享牌组效果好得多
- 不要贪多，每天少量复习 + 适量添加新卡，长期坚持比突击有效
- 复杂学科（语言、医学等）应该以教材为主，Anki 做记忆辅助
- 记住一句话：**不理解的东西不要记**

> "Do not learn if you do not understand." —— SuperMemo
