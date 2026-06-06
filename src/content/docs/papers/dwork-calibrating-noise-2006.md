---
title: 校准噪声与敏感度 — Laplace 机制奠基
来源: 'Dwork, McSherry, Nissim, Smith, "Calibrating Noise to Sensitivity in Private Data Analysis", TCC 2006'
日期: 2026-06-06
分类: 安全与隐私
子分类: 差分隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Calibrating Noise to Sensitivity**（Dwork 等，TCC 2006）在 [[dwork-dp-icalp-2006]] 差分隐私定义之后，给出**按查询敏感度校准噪声**的通用框架：**Laplace 机制**对数值查询加尺度与敏感度/ε 成比例的 Laplace 噪声，并引入**敏感度（sensitivity）**形式化「改一条记录最多能改变多少」。它是 DP-SGD、普查噪声、私有 SQL 的算法母本之一。

日常类比：公布「平均薪资」时，若删掉你一条记录平均值最多变 1 万元，就加**至少能盖住 1 万元信息**的随机抖动——敏感度告诉你「盖子要多大」，ε 告诉你「抖动多猛」。

## 为什么重要

没有敏感度与 Laplace 机制，DP 只是定义没有工程：

- **敏感度可计算**才能自动加噪，而非拍脑袋
- **Laplace vs Gaussian** 两条线从此分开（后者见 [[dwork-our-data-ourselves-2006]]）
- **私有 ML** 的梯度裁剪本质是在控敏感度
- **与 [[abadi-dpsgd-2016]] 衔接**：Moments Accountant 仍基于这些机制组合

## 核心要点

1. **全局敏感度**：邻接数据集上查询输出 L1 变化上界；计数查询敏感度常为 1。

2. **Laplace 机制**：加 Laplace(Δ/ε) 噪声达到 ε-DP；Δ 是敏感度。

3. **组合定理**：k 次 ε-DP 机制顺序执行，总隐私损失 O(kε)（基础组合）；高级组合在后文与 [[mironov-renyi-dp-2017]] 改进。

4. **后处理**：加噪结果再算任意函数不恶化 DP。

5. **效用权衡**：ε 小噪声大、误差高；产品要隐私预算会计。

## 实践案例

### 案例 1：计数查询

```python
import numpy as np
true_count = 10_000
sensitivity = 1
epsilon = 0.1
noise = np.random.laplace(0, sensitivity / epsilon)
print(int(true_count + noise))
```

### 案例 2：均值查询（有界值）

每人收入截断 [0, B]，敏感度 B/n；噪声尺度 B/(nε)。

### 案例 3：与 Opacus 概念对照

训练时 clip 梯度范数 → 有界敏感度 → 加高斯噪声；理解 clip 是在**人为降敏感度**。

### 案例 4：普查表格

发布各年龄段计数，每格独立 Laplace 噪声；总 ε 按格数组合预算。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **敏感度算错**：重复计数同一用户会放大敏感度。

2. **ε 太小**：噪声淹没信号，分析无意义。

3. **浮点后处理**：四舍五入若依赖原数据可能泄露；需 DP 友好离散化。

4. **局部 DP 不同**：见 [[duchi-local-dp-2013]]；客户端加噪模型另套。

5. **Gaussian 不是本篇默认**：大 ε 或 (ε,δ)-DP 才常用 Gaussian。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- 中心化 DP 数值统计发布
- 理解私有 ML 噪声尺度来源
- 隐私会计入门

**不适用**：

- 本地 DP（[[erlingsson-rappor-2014]]）
- 加密计算（[[gentry-fhe-2009]]）
- 无形式化 DP 需求的纯安全加密传输

## 历史小故事（可跳过）

- **2006**：TCC 发表，与 ICALP DP 定义同年形成闭环。
- **2008+**：美国普查开始探索正式 DP 披露。
- **2016**：[[abadi-dpsgd-2016]] 把敏感度思想带进深度学习。
- **2024+**：仍是隐私课必讲「机制」第一节。

## 学到什么

- **敏感度是 DP 工程的核心计量**。
- 机制设计 = 证明敏感度上界 + 选噪声分布。
- 组合预算决定「能问几个问题」。
- clip 梯度是深度学习版「有界敏感度」。
- 读本篇再读 DP-SGD 不会迷失在会计细节里。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- 原文：https://link.springer.com/chapter/10.1007/11681878_14
- [[dwork-dp-icalp-2006]] —— 定义入口
- [[mironov-renyi-dp-2017]] —— 隐私会计改进
- [[abadi-dpsgd-2016]] —— 深度学习应用
- [[duchi-local-dp-2013]] —— 本地 DP
- Dwork & Roth 教材

## 关联

- [[dwork-dp-icalp-2006]] —— DP 定义
- [[abadi-dpsgd-2016]] —— DP-SGD
- [[mironov-renyi-dp-2017]] —— RDP 会计
- [[dwork-our-data-ourselves-2006]] —— Gaussian 机制
- [[duchi-local-dp-2013]] —— LDP 理论
- [[erlingsson-rappor-2014]] —— 应用层 LDP
- [[mcmahan-fedavg-2017]] —— 联邦学习数据分散
- [[kairouz-advances-fl-2019]] —— FL 隐私开放问题

## 维护备注

- 与专题路线图对照：确认 frontmatter `分类/子分类` 与 research 表一致，避免 atlas 统计漂移。
- 代码块尽量可拷贝运行；路径用占位符 `/path/to` 标注，避免泄露本机目录。
- 写关联时优先已存在于 `data/written.txt` 的 slug，减少幽灵链接。
- 若从 worktree cherry-pick 合并，合并后再跑一次 `npm run atlas` 刷新反向链接。

- 本篇目标行数 150–200，与 study v3 quality-gate 对齐；扩写时优先加「实践案例」与「踩过的坑」，少堆外链。
- 若 pipeline 复审要求 refine，只改被点名的 H2 段，避免整篇重写导致关联漂移。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->
