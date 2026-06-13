---
title: Qlib — 微软开源的 AI 量化投资平台
来源: https://github.com/microsoft/qlib
日期: 2026-06-13
分类_原始: 项目
分类: 其他
子分类: 量化金融
provenance: pipeline-v3
---

# Qlib — 微软开源的 AI 量化投资平台

## 从"做饭"说起：什么是量化投资

想象一下你想做饭——你需要：

1. **买菜**（获取数据：股票价格、财务指标……）
2. **试菜**（训练模型：让 AI 从历史数据里找规律）
3. **做菜**（生成交易策略：模型告诉你买什么、卖什么）
4. **品尝**（回测：用历史数据检验策略好不好用）
5. **上桌**（实盘：把策略放到真实市场里跑）

量化投资就是把这一整套流程自动化，用机器学习模型来替代"凭感觉选股"。

Qlib 就是微软开发的一个平台，帮你把上面每一步都工具化、自动化。

## 一句话概括

> Qlib 是一个面向 AI 的量化投资研究平台，覆盖从数据准备、模型训练、回测评估到上线部署的全流程。

## 核心概念

### 1. 因子（Alpha）

因子就是一组用来预测股价涨跌的特征数据。比如：

- 过去 5 天成交量突增
- 市盈率低于行业平均
- 股价偏离均线超过 2 个标准差

Qlib 内置了两套经典因子集：**Alpha158**（158 个因子）和 **Alpha360**（360 个因子），你不需要自己发明因子也能跑实验。

### 2. 工作流（Workflow）

Qlib 把所有步骤串成一个链：

```
数据 → 特征提取 → 模型训练 → 预测 → 回测 → 报告
```

你只需要一个 YAML 配置文件，就能自动跑通整条链。

### 3. 模型动物园（Model Zoo）

Qlib 预置了 20+ 种经典机器学习模型，从简单的 LightGBM 到复杂的 Transformer，开箱即用：

| 模型类型 | 例子 | 适用场景 |
|---------|------|---------|
| 树模型 | LightGBM, XGBoost, CatBoost | 表格型因子数据，速度快 |
| 深度学习 | LSTM, GRU, Transformer | 有时间序列特性的数据 |
| 图网络 | GATs | 股票之间有相关性时 |
| 强化学习 | PPO, OPDS | 订单执行、组合优化 |

### 4. 回测（Backtest）

回测就是用历史数据"模拟炒股"，看策略表现如何。Qlib 会自动生成：

- 累计收益率曲线
- 最大回撤
- 信息比率（衡量超额收益的稳定性）
- IC（信息系数，衡量预测与实际的相关性）

## 快速上手

### 安装

```bash
pip install pyqlib
```

### 下载数据（A 股）

```bash
python -m qlib.cli.data qlib_data --target_dir ~/.qlib/qlib_data/cn_data --region cn
```

### 一键跑通 LightGBM 模型

```bash
cd examples
qrun benchmarks/LightGBM/workflow_config_lightgbm_Alpha158.yaml
```

跑完你会看到类似这样的结果：

```
annualized_return: 0.178316    # 年化收益约 17.8%
information_ratio:  1.996555   # 信息比率接近 2.0（优秀）
max_drawdown:       -0.081806  # 最大回撤约 8.2%
```

这意味着：只用公开数据和 LightGBM 一个模型，年化收益就接近 18%，回撤不到 8%。

## 代码示例

### 示例 1：用 Python 代码定制工作流

不用 YAML 文件，直接用 Python 代码搭建整个流程：

```python
import qlib
from qlib.constant import REG_CN
from qlib.utils import init_instance_by_config
from qlib.workflow import R
from qlib.workflow.record_temp import SignalRecord, SignalMixReportRecord, PortAnaRecord

# 1. 初始化 Qlib
qlib.init(provider_uri("~/.qlib/qlib_data/cn_data"), region=REG_CN)

# 2. 定义数据处理流程
data_handler_kwargs = {
    "start_time": "2008-01-01",
    "end_time": "2020-01-01",
    "fit_start_time": "2008-01-01",
    "fit_end_time": "2014-12-31",
    "instruments": REG_CN,
}

# 3. 创建数据处理器（自动计算 Alpha158 因子）
data_handler = init_instance_by_config(
    "data_handler_train = DataHandlerProxy("
    "    label_ds=LabelDAWKLabel("
    "        dataset=dataset_config, "
    "        label=LabelPerceptron(percentile=0.98),"
    "    ), "
    "    dataset_config=dataset_config, "
    ")",
    DataHandlerProxy=qlib.contrib.data.handler.DataHandlerProxy,
    dataset_config=qlib.config.Config(
        dataset={
            "class": "DatasetH",
            "module_path": "qlib.contrib.data.dataset",
            "kwargs": {
                "handlers": {
                    "class": "Alpha158",
                    "module_path": "qlib.contrib.data.handler",
                },
            },
        }
    ),
    data_handler_kwargs=data_handler_kwargs,
)

# 4. 创建并训练 LightGBM 模型
model = init_instance_by_config(
    "model = LightGBMModel("
    "    loss='cross_entropy', "
    "    val_fraction=0.2, "
    "    lr=0.03, "
    "    num_leaves=31, "
    "    num_boost_round=1000, "
    "    early_stopping_rounds=100, "
    ")",
    LightGBMModel=qlib.contrib.model.gbdt.LightGBMModel,
)

# 5. 创建数据集并训练
dataset = init_instance_by_config(
    {"class": "DatasetH", "module_path": "qlib.contrib.data.dataset", "kwargs": {"handlers": [], "sort_by": "date"}},
)
dataset.prepare("train", col_set=["data"])
dataset.prepare("validate", col_set=["data"])

# 6. 训练模型并记录结果
with R.start(experiment_name="backtest"):
    R.log_params("model", "LightGBM")
    R.log_params("dataset", "Alpha158")

    model.fit(dataset)

    # 生成预测信号
    recorder = R.get_recorder()
    sr = SignalRecord(model, dataset, recorder)
    sr.generate()

    # 生成组合分析报告
    par = PortAnaRecord(model, dataset, recorder)
    par.generate()
```

### 示例 2：用 YAML 配置运行一个完整实验

比起写代码，Qlib 更推荐用 YAML 配置文件来描述整个实验：

```yaml
# workflow_config_lightgbm_Alpha158.yaml

qlib_client:
  provider_uri: "~/.qlib/qlib_data/cn_data"
  region: cn

market: &market csi300
benchmark: &benchmark SH000300

H_train: &H_train 240
H_forecast_start: &H_forecast_start 240
H_forecast_end: &H_forecast_end 1

D_train: &D_train 240
D_forecast: &D_forecast 1

train:
  start_time: &train_start 2008-01-01
  end_time:   &train_end 2014-12-31

validate:
  start_time: &validate_start 2015-01-01
  end_time:   &validate_end 2016-12-31

test:
  start_time: &test_start 2017-01-01
  end_time:   &test_end 2020-12-31

dataset:
  class: DatasetH
  module_path: qlib.contrib.data.dataset
  kwargs:
    handlers:
      - class: Alpha158
        module_path: qlib.contrib.data.handler
        kwargs:
          start_time: &start_time 2008-01-01
          end_time:   &end_time 2020-12-31

model:
  class: LightGBMModel
  module_path: qlib.contrib.model.gbdt
  kwargs:
    objective: binary
    metric: cross_entropy
    learning_rate: 0.03
    num_leaves: 63
    feature_fraction: 0.8
    bagging_fraction: 0.8
    bagging_freq: 5
    verbose: -1

strategy:
  class: TopkDropoutStrategy
  module_path: qlib.contrib.strategy.rule_strategy
  kwargs:
    signal: <pred>
    topk: 50
    n_drop: 5

backtest:
  start_time: *test_start
  end_time:   *test_end
  account: 100000000
  threshold_threshold: 0.02
  benchmark: *benchmark
  max_num_orders: 100
```

跑这个配置文件只需要一行命令：

```bash
qrun workflow_config_lightgbm_Alpha158.yaml
```

Qlib 会自动完成：数据加载 → 因子计算 → 模型训练 → 预测生成 → 组合构建 → 回测执行 → 报告输出。

## 为什么值得关注

1. **学术界认可**：已有 44k+ Star，多篇顶会论文（ICML, KDD, NeurIPS）基于 Qlib 发表
2. **全流程覆盖**：从数据到实盘，一个平台搞定，不用东拼西凑
3. **可插拔设计**：每个模块独立，你可以替换任意组件——换个模型、换个策略，只需改配置文件
4. **社区活跃**：社区贡献了 A 股、美股、巴西股市等多市场数据

## 后续学习方向

- [Qlib 官方文档](https://qlib.readthedocs.io/) — 最系统的入门资料
- [examples/tutorial](https://github.com/microsoft/qlib/tree/main/examples/tutorial) — 交互式 Jupyter Notebook，适合边看边练
- [RD-Agent](https://github.com/microsoft/RD-Agent) — Qlib 的 LLM 驱动自动化研发 Agent，能自动挖掘因子和优化模型

---

> 本篇笔记基于 https://github.com/microsoft/qlib 官方仓库编写，研究日期 2026-06-13。
