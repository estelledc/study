---
title: 编程语言与类型系统
description: 从 Lambda Calculus、Hindley-Milner 到 Hoare Logic，理解计算、类型推断与程序正确性
---

这条精选路线把三个常被分开讲的能力连起来：程序怎样表示计算、类型怎样被推断、我们怎样描述程序是否满足预期。

<div class="study-meta-panel">
  <div><strong>适合</strong><span>用过类型语言，想理解原理</span></div>
  <div><strong>建议顺序</strong><span>计算模型 → 类型推断 → 正确性</span></div>
  <div><strong>读法</strong><span>手算最小例子</span></div>
  <div><strong>目标</strong><span>理解语言工具的保证边界</span></div>
</div>

## 先读这 3 篇

<div class="study-card-grid">
  <a class="study-note-card" href="/study/papers/lambda-calculus/">
    <div class="study-meta-row"><span>论文</span><span>Pillar</span><span>计算模型</span></div>
    <h3>Lambda Calculus</h3>
    <p>用变量、函数和应用三个核心元素理解“计算”可以怎样被表达。</p>
    <div class="study-why">先获得最小计算模型，后面的类型规则才有落点。</div>
  </a>

  <a class="study-note-card" href="/study/papers/hindley-milner/">
    <div class="study-meta-row"><span>论文</span><span>Pillar</span><span>类型推断</span></div>
    <h3>Hindley-Milner</h3>
    <p>理解编译器如何在少写类型标注时仍推导出通用类型。</p>
    <div class="study-why">把统一、泛化和实例化连成一条推断流程。</div>
  </a>

  <a class="study-note-card" href="/study/papers/hoare-logic/">
    <div class="study-meta-row"><span>论文</span><span>程序逻辑</span><span>正确性</span></div>
    <h3>Hoare Logic</h3>
    <p>用前置条件、程序和后置条件描述“这段程序做对了什么”。</p>
    <div class="study-why">类型能排除一部分错误，但程序正确性需要更明确的规格。</div>
  </a>
</div>

## 读完你应该能回答

1. Lambda Calculus 为什么只靠函数也能表达计算？
2. Hindley-Milner 的类型推断与运行时类型检查有什么差别？
3. 一个类型正确的程序为什么仍可能不满足业务要求？
4. Hoare triple 中前置条件和后置条件分别承担什么责任？

这页只提供学习主线。更多论文可进入 [论文精选队列](/study/papers-queue/)；需要按名称查找时再用 [论文全景索引](/study/papers-atlas/)。
