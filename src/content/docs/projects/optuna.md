---
title: Optuna — 把超参搜索写在 Python 函数体里
来源: https://github.com/optuna/optuna
日期: 2026-05-31
分类: 项目
难度: 中级
---

## 是什么

Optuna 是一个**超参优化（HPO）开源库**，由日本 Preferred Networks 在 2019 年开源。日常类比：训模型时你有很多旋钮（学习率 / 层数 / dropout），手动一个个试太累；Optuna 就是**替你转旋钮**的自动调参员，并且边调边记录、边淘汰差的组合。

它最显眼的卖点叫 **define-by-run**：搜索空间不是写在 YAML 配置里，而是直接**写在 Python 函数体里**。

```python
def objective(trial):
    lr = trial.suggest_float("lr", 1e-5, 1e-1, log=True)
    n_layers = trial.suggest_int("n_layers", 1, 5)
    return train_and_eval(lr, n_layers)

study = optuna.create_study(direction="minimize")
study.optimize(objective, n_trials=100)
```

跑 100 次 trial，每次 Optuna 用一组新参数调用 `objective`，最后给你最优组合。年下载量过亿，是 **HPO 工程实现的事实标准**。

## 为什么重要

不用 Optuna 之前，做 HPO 的常见痛点：

- **写一份 YAML 列出所有参数**——条件参数（"用 SGD 时才需要 momentum"）只能写注释提醒自己
- **手动维护一个网格 + for 循环**——多 4 个参数就指数爆炸
- **跑了一晚上发现前 50 个 trial 都跑满了 epoch**——其实第 5 个 epoch 就能看出该停了

Optuna 用三件事一并解决：define-by-run（动态空间）+ TPE（聪明采样）+ ASHA（早停剪枝）。这三块原本散在 Hyperopt / Spearmint / Hyperband 各自的论文里，Optuna 把它们打包进同一个 Python API。

## 核心要点

### 四大支柱

1. **define-by-run API**：`trial.suggest_int / suggest_float / suggest_categorical` 在函数体执行时**动态产生**搜索空间——分支、循环、依赖参数全用普通 Python 写。
2. **采样算法（Sampler）**：决定下一组参数怎么选。
   - **TPE**（默认）：Tree-structured Parzen Estimator，贝叶斯类，便宜好用
   - **CMA-ES**：演化策略，能捕捉变量间相关性
   - **Random / Grid**：兜底基线
3. **剪枝算法（Pruner）**：训练中途看一眼 intermediate value，不行就早停。
   - **MedianPruner**（默认）：低于历史中位数就剪
   - **SuccessiveHalvingPruner**（即 ASHA）：分层淘汰
   - **HyperbandPruner**：多个 ASHA 并行不同预算
4. **存储后端（Storage）**：内存 / SQLite / MySQL / PostgreSQL / Redis / Journal。**多机分布式只需共享 storage**——同一个 study 多台机器一起跑。

### TPE 怎么挑下一组参数

把已跑的 trial 按 loss 分**两堆**：好的（top 25%）和差的（剩下）。用 KDE 估两堆的分布 `l(x)` 和 `g(x)`。新参数选 `l(x)/g(x)` 比值最大的——意思是 "好分布很密、差分布很稀"。

类比招聘选简历：把过去录用过的和拒掉的两堆简历摆出来，看每条规则在两堆出现的频率比。新简历命中"录用堆密、拒掉堆稀"的特征就推荐面试。

## 实践案例

### 案例 1：ASHA 早停省钱

```python
def objective(trial):
    lr = trial.suggest_float("lr", 1e-5, 1e-1, log=True)
    model = build_model(trial)
    for epoch in range(100):
        loss = train_one_epoch(model)
        trial.report(loss, epoch)          # 上报中途值
        if trial.should_prune():           # 不行就剪
            raise optuna.TrialPruned()
    return loss
```

类比选秀海选：1000 人先唱 30 秒、留前 333；这 333 再唱 90 秒、留前 111。不行的早走，省评委时间。

### 案例 2：条件参数（define-by-run 的杀手锏）

```python
def objective(trial):
    optimizer = trial.suggest_categorical("opt", ["sgd", "adam"])
    if optimizer == "sgd":
        momentum = trial.suggest_float("momentum", 0.0, 0.99)
    else:
        beta1 = trial.suggest_float("beta1", 0.5, 0.999)
    ...
```

`momentum` **只在选 SGD 时存在**；选 adam 时这个参数根本不生成。Hyperopt 之类的 define-and-run 框架要写嵌套 dict 模拟，Optuna 直接 `if` 就行。

### 案例 3：HuggingFace Trainer 接入

```python
from transformers import Trainer
best = trainer.hyperparameter_search(
    direction="minimize",
    backend="optuna",
    n_trials=20,
)
```

一个 backend 参数搞定。PyTorch Lightning / Ray Tune / XGBoost / LightGBM 都有官方 callback。

## 踩过的坑

1. **TPE 默认变量独立**——参数强相关（如 lr 和 batch_size 一起调）时性能差。切 `TPESampler(multivariate=True)` 或换 `CmaEsSampler`。
2. **忘了 `trial.report` 剪枝就不工作**——`should_prune()` 依赖 report 的中间值，没报告就永远返回 False。
3. **n_trials 太少看不出 TPE 效果**——TPE 前 ~10 次是随机暖启动，至少跑 30 次再判断是否比 random 好。
4. **搜索空间太大 + 没剪枝 = 烧钱**——先 `RandomSampler` 跑 30 次看 baseline，再上 TPE + Pruner。
5. **分布式跑别用 SQLite**——单文件并发会锁死。多机一起跑务必 MySQL / PostgreSQL，或用 v3.0 的 Journal storage。

## 适用 vs 不适用场景

**适用**：

- ML 模型超参调优（学习率 / batch size / 层数 / dropout）
- 传统 ML（XGBoost / LightGBM / sklearn）—— 官方都有 callback
- 神经架构搜索的简单版本（条件参数 + 剪枝）
- 任何 Python 里能写出"目标函数 + 数值返回"的优化问题

**不适用**：

- 极大规模 NAS（DARTS / ENAS 这种基于梯度的更合适）
- 黑盒函数评估极便宜（< 1 秒）—— 直接 grid search 就够，不用上 TPE
- 强约束优化（Optuna 不是约束求解器）
- 需要严格可解释优化路径的科学场景——高斯过程贝叶斯优化更好讲故事

## 历史小故事（可跳过）

- **2018 末**：Preferred Networks 内部 Chainer 实验跑得到处都是，没系统调参工具
- **2019 上半年**：v0.x 开源，主打 define-by-run + Python 原生
- **2019.07**：KDD 论文出炉，定调三大支柱（API / Sampling / Pruning）
- **2020 v2.0**：加 multivariate TPE、新可视化
- **2023 v3.0**：重构 storage，加 Journal（无数据库也能分布式）
- **2024-**：HPO 工程实现的事实标准，HuggingFace Trainer / PyTorch Lightning / Ray Tune 都内置 Optuna 后端

## 学到什么

1. **API 设计可以照搬深度学习框架的演进路径**——Optuna 之于 HPO，相当于 PyTorch 之于 TensorFlow 1.x：把"先定义、后运行"换成"边定义边运行"。
2. **采样 + 剪枝是两件互补的事**——采样决定**下一组参数**怎么选，剪枝决定**当前 trial** 该不该继续。两个都做才省钱。
3. **工程框架的胜负手往往是默认配置**——Optuna 默认 TPE + MedianPruner + SQLite，新手装完就能跑出有意义的结果，是它打败 Hyperopt 的关键。
4. **define-by-run 的代价**：搜索空间不能离线分析（不跑就不知道空间长啥样），可视化 / 静态约束检查比 define-and-run 难做。Optuna 用 dashboard 工具弥补了一部分。

## 延伸阅读

- 官方首页：[optuna.org](https://optuna.org)（中 / 日 / 英文俱全）
- 50+ 集成示例：[optuna/optuna-examples](https://github.com/optuna/optuna-examples)
- KDD 2019 论文：[arXiv 1907.10902](https://arxiv.org/abs/1907.10902)（9 页，工程论文好读）
- [[bayesian-optimization]] —— TPE 的理论根基
- [[neural-architecture-search]] —— Optuna 能做的简单 NAS

## 关联

- [[bayesian-optimization]] —— TPE 是贝叶斯优化在树形空间的实例化
- [[neural-architecture-search]] —— Optuna 的条件参数 + 剪枝可以做轻量 NAS
- [[xgboost]] —— Optuna 官方 callback 可直接调 XGBoost 超参
- [[pytorch]] —— 与 PyTorch Lightning / HuggingFace Trainer 深度集成
- [[wandb]] —— W&B Sweeps 是同类工具，Optuna 偏库 / W&B 偏 SaaS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
