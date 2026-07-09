---
title: Optuna — 超参搜索框架
来源: https://github.com/optuna/optuna
日期: 2026-07-09
分类: data-science-ai
难度: 中级
---

## 是什么

Optuna 是一个给机器学习项目自动找**超参数**的 Python 框架。日常类比：做菜时你知道要放盐、糖、火候，但不知道各放多少最好；Optuna 就像一个有记录本的试菜助手，一次次试配方，把结果记下来，再决定下一轮往哪里试。

这里的"超参数"不是模型自己学出来的参数，而是人要提前定的开关，比如学习率、树的深度、神经网络层数、dropout 比例。你可以手动试十几组，但模型一复杂，组合会爆炸。

Optuna 的核心做法是：你写一个 `objective(trial)`，里面告诉它"哪些值可以被试"；它反复运行这个函数，记录每次结果，最后给出目前最好的参数组合。

## 为什么重要

不理解 Optuna，下面这些事都很难解释：

- 为什么调参不是"多跑几次"这么简单，而是一个需要记录、恢复、并行、早停的工程流程
- 为什么深度学习里 `learning_rate` 经常要按指数尺度搜索，而不是从 0.001、0.002 这样线性试
- 为什么 `define-by-run` 让搜索空间能跟 Python 的 `if` / `for` 一起变化，适合真实模型结构
- 为什么 TPE / CMA-ES 这类采样器比纯随机搜索更像"边试边学"，能少浪费很多训练时间

## 核心要点

Optuna 可以拆成 **三件事 + 一个工程化外壳**。

1. **Trial：一次试菜**
   每个 trial 是 objective 的一次运行。类比：今天试"少盐、中火、烤 20 分钟"，尝完给它打分。

2. **Study：整本实验记录**
   Study 管一批 trial，知道哪一次最好，也能把历史保存到 SQLite、MySQL、PostgreSQL 等存储里。类比：不是一张便签，而是一本能续写的实验台账。

3. **Sampler / Pruner：决定怎么试、何时停**
   Sampler 负责下一轮试什么，默认常用 TPE；也能换 Random、CMA-ES、Gaussian Process、NSGA-II 等。Pruner 负责训练到一半发现明显不行时提前停掉，省下后面的计算。

**工程化外壳**：Optuna 不绑定某个 ML 框架。只要你的训练过程能返回一个分数，它就能包进去；scikit-learn、PyTorch、LightGBM、XGBoost 都可以。

## 实践案例

### 案例 1：在两个 scikit-learn 模型之间自动选择

```python
import optuna
from sklearn.datasets import load_iris
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score
from sklearn.svm import SVC

def objective(trial):
    X, y = load_iris(return_X_y=True)
    model_name = trial.suggest_categorical("model", ["svc", "forest"])
    if model_name == "svc":
        c = trial.suggest_float("svc_c", 1e-3, 1e3, log=True)
        model = SVC(C=c)
    else:
        depth = trial.suggest_int("max_depth", 2, 16)
        model = RandomForestClassifier(max_depth=depth, random_state=0)
    return cross_val_score(model, X, y, cv=3).mean()

study = optuna.create_study(direction="maximize")
study.optimize(objective, n_trials=50)
print(study.best_params)
```

逐部分解释：

- `suggest_categorical` 先决定走 SVC 还是随机森林，这就是分支搜索空间
- 如果选 SVC，才会出现 `svc_c`；如果选随机森林，才会出现 `max_depth`
- `direction="maximize"` 表示分数越高越好，最后 `best_params` 是当前最优配方

### 案例 2：训练到一半明显不行就剪枝

```python
import optuna
from sklearn.datasets import load_iris
from sklearn.linear_model import SGDClassifier
from sklearn.model_selection import train_test_split

def objective(trial):
    X, y = load_iris(return_X_y=True)
    X_train, X_val, y_train, y_val = train_test_split(X, y, random_state=0)
    alpha = trial.suggest_float("alpha", 1e-5, 1e-1, log=True)
    clf = SGDClassifier(alpha=alpha, random_state=0)
    classes = sorted(set(y))
    for step in range(30):
        clf.partial_fit(X_train, y_train, classes=classes)
        error = 1.0 - clf.score(X_val, y_val)
        trial.report(error, step)
        if trial.should_prune():
            raise optuna.TrialPruned()
    return 1.0 - clf.score(X_val, y_val)
```

逐部分解释：

- `report(error, step)` 像每训练一轮就交一次小测成绩
- `should_prune()` 根据其他 trial 的历史成绩判断"这次还有没有希望"
- 剪枝不是报错，而是有意义地放弃差路线，把时间让给下一组参数

### 案例 3：把实验保存下来，失败后继续跑

```python
import optuna

def objective(trial):
    x = trial.suggest_float("x", -10, 10)
    return (x - 2) ** 2

study = optuna.create_study(
    study_name="demo",
    storage="sqlite:///optuna-demo.db",
    load_if_exists=True,
)
study.optimize(objective, n_trials=100)
```

可以在本机重复运行同一个脚本：

```bash
python search.py
python search.py
```

逐部分解释：

- `storage` 把 study 写进数据库文件，不再只是内存里的临时结果
- `load_if_exists=True` 表示已有同名实验就接着跑，适合中断恢复
- 多机器并行时通常换成真正的 RDB 后端，让多个 worker 共享同一本实验台账

## 踩过的坑

1. **把搜索空间开得太大**：参数越多，需要的 trial 数大致会爆炸；不重要的旋钮别全丢进去。
2. **忘记固定随机种子**：Sampler 固定 seed 只能控制 Optuna 自己，模型训练里的随机性也要单独固定。
3. **把 objective 写得太慢**：每个 trial 都重新读大数据、重新做无关预处理，会把调参时间浪费在 IO 上。
4. **只看最好分数，不看稳定性**：一次最优可能是运气；要结合交叉验证、重复训练或保留集确认。

## 适用 vs 不适用场景

**适用**：

- 已经有可运行训练脚本，只缺一个系统化调参流程
- 搜索空间里有条件分支，例如不同模型对应不同参数
- 单次训练昂贵，需要剪枝、并行、续跑来节省时间
- 需要保留每次 trial 历史，方便复盘和画图分析

**不适用**：

- 模型还没跑通，指标定义也不清楚；这时先别调参
- 参数只有两三个离散组合，手动网格搜索更直接
- objective 的结果强随机且不可复现，Optuna 也学不到可靠规律
- 需要自动特征工程、自动清洗数据；Optuna 主要管超参搜索，不替你理解数据

## 历史小故事（可跳过）

- **2019 年**：Optuna 论文发表在 KDD，定位是下一代超参数优化框架。
- **早期痛点**：很多 HPO 工具要求先用配置文件写死搜索空间，动态模型结构表达不方便。
- **Optuna 的选择**：采用 imperative / define-by-run API，让搜索空间在 objective 运行时由 Python 代码自然生成。
- **后来扩展**：项目加入多目标优化、剪枝、RDB 存储、dashboard、OptunaHub 等能力，从算法库变成实验工程工具箱。

## 与同类对比

- **Grid Search**：像把所有格子都扫一遍，简单但组合爆炸；Optuna 会根据历史结果调整下一步。
- **Random Search**：比网格更灵活，但不主动学习；Optuna 默认 TPE 会把好区域和坏区域分开建模。
- **Ray Tune / Vizier 类系统**：更偏大规模调度平台；Optuna 更像轻量 Python 库，先把单个项目接起来。
- **手写脚本循环**：能跑，但很容易丢日志、丢中间结果、无法续跑；Optuna 把这些边角工程固定下来。

## 学到什么

1. **调参本质是搜索问题**：不是靠感觉乱试，而是在有限预算里尽量找到好组合。
2. **define-by-run 是 Optuna 的关键气质**：搜索空间可以随 Python 分支和循环动态变化。
3. **TPE / CMA-ES 是"下一次试什么"的策略**：它们不保证神奇最优，但比盲试更会利用历史。
4. **HPO 落地靠工程细节**：存储、剪枝、并行、可复现，比单个算法名字更决定项目能不能长期跑。

## 延伸阅读

- 官方 README：[Optuna GitHub](https://github.com/optuna/optuna)
- 官方教程：[Optuna Tutorial](https://optuna.readthedocs.io/en/stable/tutorial/index.html)
- 论文入口：[Optuna: A Next-generation Hyperparameter Optimization Framework](https://doi.org/10.1145/3292500.3330701)
- 可视化工具：[Optuna Dashboard](https://github.com/optuna/optuna-dashboard)
- [[scikit-learn]] —— 案例里最常见的传统机器学习训练接口
- [[pytorch]] —— 深度学习里最常被 Optuna 包进去调参的框架

## 关联

- [[scikit-learn]] —— Optuna 经常把 sklearn 模型包进 objective 做快速验证
- [[pytorch]] —— 神经网络层数、学习率、dropout 都适合用 define-by-run 表达
- [[lightgbm]] —— 官方集成里常见剪枝回调，适合表格数据调参
- [[xgboost]] —— 另一类常见树模型调参对象
- [[dspy]] —— 都把"试配置"变成可度量、可优化的工程循环
- [[keras]] —— 深度学习训练脚本也可以被 objective 包起来搜索

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
