---
title: TabPFN — 一秒解决小表格分类的 Transformer
来源: 'Hollmann, Müller, Eggensperger, Hutter, "TabPFN: A Transformer That Solves Small Tabular Classification Problems in a Second", ICLR 2023'
日期: 2026-06-01
子分类: 模型与训练
分类: 机器学习
难度: 中级
---

## 是什么

TabPFN 是一个**预训练好的 Transformer**，看一眼就能给出表格分类的答案，不需要再训练。

日常类比：经验老到的中医师傅。徒弟把"全班同学的病历 + 这位新病人的症状"一起递过去，师傅扫一眼立刻报"风寒还是风热"。他靠的不是为这个病人重新读 3 年书，而是过去看过的几百万个相似病例。

具体到表格：

- 你给它一张训练表（比如 800 行 × 30 列 + 标签）
- 再给一行没有标签的测试样本
- 它把两者拼成一段输入塞进 Transformer
- **一次前向**就输出测试样本属于每个类别的概率

整个过程**没有梯度下降、没有 fit()**。它的参数是出厂前在几百万个合成数据集上预训练好的。

## 为什么重要

表格数据是工业界最常见的数据形态（金融风控、医疗诊断、用户分群），但深度学习在这上面**追了 10 年没追上 GBDT**。XGBoost / LightGBM / CatBoost 一直是冠军。

TabPFN 是第一次让 Transformer 在**小样本表格**上全面超过经过充分调参的 GBDT，而且：

- 推理时间从"分钟级调参 + 秒级训练"压到**1 秒一次前向**
- 用户**零超参数调节**——不用 grid search、不用学习率
- 训练成本一次性付清（开发者在合成数据上预训练几天），用户白嫖

这是表格领域第一次出现 "foundation model 时刻"——和 GPT-3 把 in-context learning 带进 NLP 是同一种范式迁移。

## 核心要点

TabPFN 能这样工作，靠三件事拼起来：

1. **PFN 框架（Prior-Fitted Networks）**：用神经网络近似贝叶斯后验预测分布。简单说就是"教 Transformer 当一个贝叶斯推断器"。这是 Müller 等 2022 年先提出的方法，TabPFN 是它在表格上的第一个成功应用。

2. **合成 prior 数据**：从一个精心设计的先验中**采样无穷多个小型表格数据集**。先验是"贝叶斯神经网络 + 结构因果模型"的混合——它假设真实表格背后是某种因果关系。预训练时模型见的全是假数据，但因为先验设计得贴近真实，迁移到真实任务效果好。

3. **In-context learning**：训练集 + 测试样本作为一段序列输入 Transformer。Encoder 给训练样本和测试样本分别编码，注意力让测试样本"看到"训练样本，最后 head 输出类别概率。**整个推理就是一次前向**。

记住一个关键约束：**原版限制 ≤1000 训练样本、≤100 特征、≤10 类**。这是 2023 年版本，超出就要降级。

## 实践案例

### 案例 1：拿来就用

```python
from tabpfn import TabPFNClassifier
clf = TabPFNClassifier(device='cuda')
clf.fit(X_train, y_train)   # 这一步几乎不做事
y_pred = clf.predict(X_test)  # 1 秒出结果
```

`fit()` 名字保留是为了兼容 sklearn 接口，**实际上没有训练**——它只是把训练集存下来等推理时塞进 Transformer。

### 案例 2：和 XGBoost 比一比

OpenML-CC18 基准（30 个小型分类数据集）上：

- XGBoost（默认参数）：平均 ROC AUC ~0.86，推理 ~5 秒/数据集
- XGBoost（贝叶斯调参 1 小时）：~0.89
- AutoML 工具（H2O / AutoGluon）：~0.89，调参 4 小时
- TabPFN（零调参）：**~0.91，1 秒**

注意：数据集 ≤1000 行才有这个优势。一旦上万行，TabPFN 要子采样集成，优势就没那么明显。

### 案例 3：合成 prior 长什么样

预训练时，每个 batch 里的每个数据集都是这样生成的：

1. 随机采一个结构因果模型（哪些变量影响哪些）
2. 随机采一个贝叶斯神经网络当作"数据生成器"
3. 用前面这两个生成 X 和 y
4. 把这个数据集喂给 Transformer，训练它"用前 N 行预测第 N+1 行"

**Transformer 学的不是某个特定数据集**，而是"在这种先验下做贝叶斯推断的能力"。这就是 PFN 的精髓——把推断本身蒸馏到神经网络里。

## 踩过的坑

1. **误以为是在用户数据上训练**：TabPFN 预训练完参数就冻结了。用户数据只在**前向推理**时通过 in-context 进入模型。这点和 fine-tuning 完全不同。

2. **数据 >1000 行直接用**：超出会强制子采样到 1000 行多次集成，效果反而不如 XGBoost。规模够大的场景应该选 GBDT。

3. **特征数超 100 / 类别超 10 类**：原版直接报错或截断。要扩展只能等 v2 或自己重训 prior。

4. **忽视合成 prior 的关键作用**：很多人以为 TabPFN 神奇在 Transformer 架构。其实**架构是次要的，prior 才是灵魂**。换一个差的 prior，同样架构什么都学不会。

5. **解释性差**：不像决策树能直接给特征重要性。要分析得借助 SHAP 等事后工具。

## 适用 vs 不适用场景

**适用**：

- 行数 ≤1000、特征 ≤100、类别 ≤10 的分类任务
- 需要快速 baseline——交付前 30 秒拿一个强基线
- 算力充足但人力调参时间紧（比如 Kaggle 比赛冷启动）
- 教学演示——展示 in-context learning 在结构化数据上也能成

**不适用**：

- 大规模表格（>10000 行）—— GBDT 仍然是更好的选择
- 高维稀疏特征（>100 列）—— 超出限制
- 回归任务（原版只支持分类，v2 才加回归）
- 需要特征重要性 / 可解释性的金融、医疗合规场景
- 在线学习——每次推理都要把整个训练集塞进去，O(N²) 注意力开销

## 历史小故事（可跳过）

- **2017 年**：Transformer 论文发表，但十年间在表格领域屡屡失败。
- **2022 年初**：Müller、Hollmann 等在 Freiburg 提出 PFN 框架（"Transformers Can Do Bayesian Inference"），核心想法：神经网络能逼近贝叶斯后验预测分布。这是 TabPFN 的理论地基。
- **2022 年 7 月**：TabPFN 论文挂上 arXiv，立刻在 OpenML 排行榜上掀风暴。
- **2023 年**：ICLR 2023 Spotlight，作者团队拿到 Andreas Hutter 的 ERC 资助。
- **2025 年**：TabPFN v2 在 Nature 上发表，扩展到回归、缺失值、更大数据规模，正式宣告"表格 foundation model"成型。

## 学到什么

1. **Foundation model 范式可以跨模态迁移**——NLP 的 in-context learning 思想在表格上同样成立，只是 prior 要重新设计。

2. **预训练成本可以一次付清**——用户端零训练、零调参。这对中小企业有巨大吸引力（不用养机器学习团队就能拿到 GBDT 级效果）。

3. **合成数据 + 好先验 > 真实数据**——TabPFN 见到的全是假数据，却在真实任务上夺冠。这挑战了"真实数据才有用"的直觉。

4. **架构是次要的，目标函数和 prior 才是灵魂**——同样 Transformer，prior 设计差就什么都学不到。

5. **每个领域都会有自己的 GPT-3 时刻**——表格的是 TabPFN，蛋白质的是 AlphaFold，时间序列的是 TimeGPT / Chronos。范式迁移正在加速。

## 延伸阅读

- 视频教程：[Yannic Kilcher — TabPFN paper review](https://www.youtube.com/watch?v=KlECLY-vMb0)（45 分钟把论文逐段讲清）
- 官方代码：[automl/TabPFN GitHub](https://github.com/automl/TabPFN)（pip install tabpfn 直接能跑）
- 论文 PDF：[arXiv 2207.01848](https://arxiv.org/abs/2207.01848)
- Müller 2022 PFN 论文：[Transformers Can Do Bayesian Inference](https://arxiv.org/abs/2112.10510)（理解 TabPFN 必读前置）
- v2 Nature 论文：[Accurate predictions on small data with a tabular foundation model](https://www.nature.com/articles/s41586-024-08328-6)（2025）
- [[attention]] —— TabPFN 用的是标准 Transformer encoder，注意力是底座
- [[gpt-3]] —— in-context learning 的范式来源

## 关联

- [[attention]] —— TabPFN 的骨架就是标准 Transformer encoder
- [[gpt-3]] —— in-context learning 范式从 NLP 迁移到表格的桥梁
- [[bert]] —— 同样是 encoder-only 的双向 Transformer，TabPFN 借鉴了这个结构
- [[transformer-xl-2019]] —— 长上下文 Transformer，TabPFN 把训练集当 context 处理
- [[flash-attention]] —— TabPFN 推理瓶颈在 O(N²) 注意力，FlashAttention 是缓解方向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[chronos-2024]] —— Chronos — 把时间序列当语言来训练大模型
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去

