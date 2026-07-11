---
title: SHAP — 用博弈论给每个特征发工资
来源: https://github.com/shap/shap
日期: 2026-05-31
分类: 项目
难度: 中级
---

## 是什么

SHAP（**SH**apley **A**dditive ex**P**lanations）是一个 Python 模型解释库，2017 年由 Scott Lundberg 和 Su-In Lee 提出（NeurIPS 2017 论文 *A Unified Approach to Interpreting Model Predictions*）。

日常类比：把一次模型预测看成**一场合作博弈**——

- 队员：每个特征（年龄、收入、负债比 …）
- 奖金：模型给出的预测值（比如『违约概率 0.73』）
- 任务：把奖金**公平地**分给每个队员，分到的钱就是该特征对这次预测的贡献

公平分奖金的方案在 1953 年已被 Lloyd Shapley（2012 诺贝尔经济学奖）解决，叫 **Shapley value**。SHAP 把这套博弈论数学搬到机器学习模型解释上。

```python
import shap, xgboost
model = xgboost.XGBClassifier().fit(X, y)
explainer = shap.TreeExplainer(model)
shap_values = explainer(X)
shap.plots.waterfall(shap_values[0])   # 单条样本的瀑布图
shap.plots.beeswarm(shap_values)       # 全局蜂群图
```

GitHub ~23k star，表格类 ML 解释的常用事实标准工具。

## 为什么重要

模型一旦上生产（信贷、医疗、风控），监管和业务方一定会问：『为什么模型预测它会违约？』

不用 SHAP 之前，常见做法各有缺陷：

- **看 feature_importances_**：只能告诉你『年龄整体重要』，不能解释**这一条**预测里年龄推高了多少
- **LIME（Ribeiro 2016）**：开了局部解释先河，但同一模型上不同运行可能不一致，缺统一数学保证
- **手工写规则**：模型一变就全推倒重来

SHAP 同时解决三件事：

1. **理论**：在满足局部可加 / 缺失 / 一致的**加性特征归因**方法中，Shapley 值是唯一解
2. **工程**：TreeSHAP 把指数级复杂度降到多项式，树模型上常能秒级算完
3. **可视化**：summary / force / waterfall / dependence 把抽象数值变成业务方看得懂的故事

## 核心要点

### 1. Shapley value 的直觉

把特征想成依次加入团队，每次看预测值变化多少（**边际贡献**）。对**所有可能加入顺序**取平均，就是该特征的 Shapley value。意思就一句：『所有顺序里它平均带来多少额外预测分』。

### 2. 三类 Explainer

- **TreeExplainer**：树模型专用（XGBoost / LightGBM / CatBoost / sklearn 树），TreeSHAP 约 **O(TLD²)**，快且对树精确
- **DeepExplainer / GradientExplainer**：深度网络，结合 DeepLIFT 思想用反向传播近似
- **KernelExplainer**：模型无关（任何黑箱），加权线性回归逼近 Shapley，**慢但通用**

### 3. 四公理（数学保证）

| 公理 | 意思 |
|------|------|
| 局部可加性 | 所有特征 SHAP 值之和 + 基准 = 当前预测 |
| 一致性 | 模型变了使某特征贡献变大，其 SHAP 值不会变小 |
| 缺失性 | 模型不用的特征，SHAP 值必为 0 |
| 对称性 | 两个特征作用相同 → SHAP 值相同 |

### 4. 四张关键图

- **summary（蜂群）**：全局重要性 + 每条样本方向
- **force**：单条拉力图，红推高、蓝拉低
- **waterfall**：从基准一步步加到最终预测
- **dependence**：特征值 × SHAP 值，看非线性与交互

## 实践案例

### 案例 1：信贷违约模型

```python
import shap, xgboost
xgb_model = xgboost.XGBClassifier().fit(X_train, y_train)
explainer = shap.TreeExplainer(xgb_model)
shap_values = explainer(X_test)
shap.plots.waterfall(shap_values[42])
```

逐部分解释：

1. 先拟合树模型，再交给 `TreeExplainer`（树路径上可精确算 Shapley）。
2. `explainer(X_test)` 给每条样本、每个特征一个贡献分。
3. `waterfall` 读第 42 条：例如负债比 +0.31、信用史 +0.18、收入 +0.09、年龄 -0.05；加总 + 基准 ≈ 0.73，对上局部可加性。

### 案例 2：用 summary 查数据泄露

```python
shap.plots.beeswarm(shap_values)
# 若 user_id 的平均 |SHAP| 排第一 → 模型在记 ID，不是学规律
```

逐部分解释：

1. beeswarm 把『谁整体最重要』和『高/低特征值往哪推』画在一起。
2. 若本不该预测的 ID/时间戳冲到最前，多半是训练集泄露。
3. 这是表格竞赛里用 SHAP 做特征体检的标准手法。

### 案例 3：黑箱模型退到 KernelSHAP

```python
explainer = shap.KernelExplainer(model.predict, X_background[:100])
shap_values = explainer.shap_values(X_test[:10])
```

逐部分解释：

1. `model.predict` 可以是任意黑箱；`X_background` 是用来估计『缺席特征』的参照集。
2. 只解释前 10 条：KernelSHAP 样本一多就很慢。
3. **有树用 TreeExplainer**；没树、又只要少量局部解释，才用 Kernel。

## 踩过的坑

1. **特征相关会均摊贡献**：标准干预式 Shapley 常假设特征可独立开关；高相关特征会被拆开分锅。可用 `feature_perturbation="tree_path_dependent"`（按树路径，不强制独立）缓解，具体默认随 shap 版本而变。
2. **KernelSHAP 大样本跑不动**：1 万条 × 50 特征可能几十分钟。有树用树，没树再退 Kernel。
3. **SHAP 不是因果**：解释的是『模型在做什么』，不是世界真实因果。
4. **高基数类别易被低估**：如『城市』有 300 个值，单个水平样本少，summary 上常显得不重要。
5. **深度模型解释不稳**：DeepSHAP 随 background 变化；PyTorch 生态里 captum 往往更成熟。

## 适用 vs 不适用场景

**适用**：
- 表格 ML（XGBoost / LightGBM / CatBoost / sklearn）生产解释——首选 TreeSHAP
- Kaggle 特征检查、数据泄露排查
- 需要给非技术方写预测理由（信贷、保险、医疗）

**不适用**：
- 因果分析 → DoWhy / EconML
- 大规模 NLP / CV → captum / Integrated Gradients 更合适
- 实时低延迟（每条 < 1ms）→ 预计算表或 surrogate，不要在线跑 KernelSHAP

## 历史小故事（可跳过）

- **1953**：Lloyd Shapley 提出合作博弈里的公平分配值。
- **2016**：Ribeiro 等提出 LIME，局部解释开始流行，但缺统一公理保证。
- **2017**：Lundberg & Lee 在 NeurIPS 发表 SHAP，把多种归因法收进加性框架。
- **2018**：TreeSHAP 让树集成上的精确 Shapley 变得实用，库随之在业界铺开。

## 学到什么

1. **博弈论能直接变成 ML 工程工具**——1953 年的奖金分配，60 年后用来解释模型。
2. **统一框架的力量**：LIME / DeepLIFT / Shapley regression 都可看成加性归因特例。
3. **理论 + 工程缺一不可**：纯 Shapley 指数爆炸；TreeSHAP 压到多项式才工业可用。

## 延伸阅读

- 论文：[Lundberg & Lee 2017](https://arxiv.org/abs/1705.07874)
- TreeSHAP：[Lundberg 2018](https://arxiv.org/abs/1802.03888)
- 文档：[shap.readthedocs.io](https://shap.readthedocs.io)
- Christoph Molnar *Interpretable Machine Learning* 第 9 章 SHAP

## 关联

- [[scikit-learn]] —— sklearn 估计器是 SHAP 最常解释的对象
- [[optuna]] —— HPO 调出模型后，用 SHAP 检查它学到了什么
- [[pytorch]] —— DeepExplainer / GradientExplainer 的常见后端
- [[pandas]] —— 表格特征进模型前，常先在 DataFrame 里对齐列名再喂给 SHAP 图

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
