---
title: AutoGluon — AWS AutoML 套件
来源: https://github.com/autogluon/autogluon
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

AutoGluon 是 AWS 2020 年开源的 AutoML 工具箱。一行 `fit()` 把表格、时序、多模态三类任务自动训出强模型，不用调参。

日常类比：像点外卖时选「随便来点」——不让你看菜单（不搜超参），后厨直接把招牌菜各做一份再拼盘端上来（多模型 ensemble），通常比自己挑还合口味。

最简代码：

```python
from autogluon.tabular import TabularPredictor

predictor = TabularPredictor(label='target').fit(train_data)
predictor.predict(test_data)
```

三行训练 + 预测，背后跑完了 7 种基模型 + k-fold bagging + 两层 stacking。

## 为什么重要

AutoML 圈一直主流是「搜超参」（HPO，hyperparameter optimization），代表是 Auto-Sklearn / FLAML / H2O。AutoGluon 反着来：放弃搜超参，改用 ensemble 把多个固定模型攒到一起。

实际效果：

- Kaggle KDDCup 2020 AutoML 赛拿过 top
- 标准 benchmark 上不调参就能打赢老练数据科学家手调一周的成绩
- 速度可预测，不像 HPO 那样「跑一天才知道有没有结果」

如果你做过 Kaggle 表格赛或公司里要快速给个 baseline，这套是当下最省心的选择。

## 核心要点

AutoGluon Tabular 的核心是 **多层 stacking + k-fold bagging**，三步：

1. **Layer 1（base models）**：跑 LightGBM、XGBoost、CatBoost、随机森林、KNN、FastAI 神经网络、Extra Trees 七种模型。每个模型做 k-fold 交叉验证，留下 OOF（out-of-fold）预测。

2. **Layer 2（stacker）**：把 Layer 1 的 OOF 预测当新特征，**拼回原始特征**，再训一遍同样这批模型。第二层模型能学到「哪个 base model 在哪类样本上更靠谱」。

3. **Weighted Ensemble**：最后用一个 ensemble selection 算法（Caruana 2004），从所有层的所有模型里贪心选权重，组合成最终预测器。

为什么不搜超参？作者论点：超参搜索的边际收益小于「把多个不同归纳偏置的模型混合」的收益。LightGBM 擅长的样本和 KNN 擅长的样本不同，混起来比把 LightGBM 调到极致更稳。

三个模块共用这套思路：

- **Tabular**：表格分类/回归
- **TimeSeries**：DeepAR、PatchTST、Chronos 等深度模型 + 统计模型（ETS、ARIMA）做概率预测 ensemble
- **MultiModal**：文本走 HuggingFace transformers、图像走 timm、数值走 MLP，自动识别列类型再融合

## 实践案例

### 案例 1：preset 控制速度精度

```python
TabularPredictor(label='y').fit(
    train_data,
    presets='best_quality',  # medium / good / high / best
    time_limit=3600,
)
```

四档 preset：

- `medium_quality`：快，秒级出 baseline，适合先看一眼
- `good_quality`：默认，分钟级
- `high_quality`：折中，多一层 stacking
- `best_quality`：最慢，开多 fold + 更深 ensemble，可能跑几小时

`time_limit` 是硬截断——到时间会停，不会卡死。

### 案例 2：看每个模型表现

```python
predictor.leaderboard(test_data)
```

打印一张表，列每个 base model 和 ensemble 的 score。常见现象：单模型最高分 < ensemble 最高分，差几个点。

### 案例 3：MultiModal 一行融合三种数据

```python
from autogluon.multimodal import MultiModalPredictor

predictor = MultiModalPredictor(label='label').fit(train_data)
```

`train_data` 里同时有图片路径列、文本列、数值列，AutoGluon 自动识别每列类型，分别走 timm / HuggingFace / MLP 后做 late fusion。

## 踩过的坑

1. **磁盘和内存吃紧**：best_quality preset 默认存所有 fold 的 OOF 预测和模型权重，10 万行数据 + 7 模型 + 5-fold + 2 层 stacking 能占几个 GB。要预留磁盘，模型目录在 `AutogluonModels/ag-XXX`。

2. **跑完不删旧模型**：每次 fit 会新建一个 `ag-时间戳` 目录，攒久了硬盘满。要么手动删，要么 `predictor.save_space()` 清掉中间产物。

3. **MultiModal 没 GPU 会卡**：默认假设有 GPU，没 GPU 会 fallback 到 CPU 但慢 10-100 倍。文本/图像任务务必先 `nvidia-smi` 确认环境。

4. **特征工程要自己做最后一层**：AutoGluon 处理基本类型转换（categorical encoding、缺失填充），但业务相关的特征（时间窗口聚合、外部数据 join）还是要自己做。

5. **小数据集（< 1000 行）容易过拟合**：k-fold 切完每折更小，stacking 层吃的是 OOF 噪声。小数据直接用单模型 + 交叉验证更稳。

## 适用 vs 不适用场景

**适用**：

- 表格分类/回归 baseline，要一两小时内出结果
- 不会调 LightGBM/XGBoost 的团队（数据分析、产品同学）
- Kaggle 等结构化数据竞赛的起手 baseline
- 概率时序预测（销量、库存、流量），DeepAR + Chronos 集成
- 简单多模态（商品描述 + 图片 + 价格预测点击率）

**不适用**：

- 极端追求推理延迟（ensemble 慢，单模型推理快）
- 需要可解释性（多模型 stacking 之后特征重要性意义模糊）
- 超大数据集（10M+ 行）：ensemble 训练时间和磁盘都吃不消，建议直接用 LightGBM
- 深度学习主战场（CV/NLP 大模型）：MultiModal 模块只是入门级 fusion，专业任务还是 PyTorch 手撸
- 研究型 AutoML（要复现 NAS、要对比 HPO 算法）：AutoGluon 不搜结构

## 与同类工具对比

| 工具 | 思路 | 强项 | 弱项 |
|------|------|------|------|
| AutoGluon | Ensemble 优先 | 结果稳、不踩 HPO 坑 | 训练慢、磁盘大 |
| Auto-Sklearn | 贝叶斯搜 + Meta-learning | 学界经典 | 速度慢、超参敏感 |
| FLAML | 高效 HPO（CFO/BlendSearch） | 快 | 模型种类少 |
| H2O AutoML | Stacking + GBM | 工业级稳定 | 闭源调优空间大 |

简单说：要快用 FLAML，要稳用 AutoGluon，要能解释用 H2O。

## 学到什么

1. **AutoML 不一定要搜超参**——把多个不同归纳偏置的模型混合，可能比把单个模型调到极致更划算
2. **Stacking 的精髓是 OOF 预测**——直接拿训练集预测会信息泄露，必须 k-fold 留出验证折
3. **preset 是工程化 AutoML 的核心 UX**——给用户一个旋钮（速度/精度），背后藏一堆复杂决策
4. **Ensemble selection > uniform averaging**——Caruana 2004 的贪心选权重比平均加权更优

## 延伸阅读

- 论文：[AutoGluon-Tabular](https://arxiv.org/abs/2003.06505)（Erickson 等, 2020）
- 官方文档：[auto.gluon.ai](https://auto.gluon.ai/stable/index.html)
- Caruana ensemble selection 论文：[Ensemble Selection from Libraries of Models](https://www.cs.cornell.edu/~caruana/ctp/ct.papers/caruana.icml04.icdm06long.pdf)
- 对比 benchmark：[AMLB 2022](https://arxiv.org/abs/2207.12560)（AutoML 基准）

## 关联

- [[xgboost]] —— Tabular 模块的核心 base model
- [[lightgbm]] —— Tabular 默认效果最好的单模型
- [[catboost]] —— 处理类别特征的另一个 base model
- [[huggingface-transformers]] —— MultiModal 模块的文本骨架
- [[timm]] —— MultiModal 模块的图像骨架
- [[autogen]] —— 同样是「自动化 AI 工作流」思路，但目标是 agent 不是表格
