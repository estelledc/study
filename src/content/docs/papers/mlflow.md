---
title: MLflow — 给机器学习实验装上「记账本和身份证」
来源: Zaharia et al., "Accelerating the Machine Learning Lifecycle with MLflow", Databricks 2018
日期: 2026-05-31
分类: MLOps / ML 平台
难度: 中级
---

## 是什么

MLflow 是一套**让你训机器学习模型时不会忘记自己干了什么**的开源工具。日常类比：实验室记录本 + 货架标签 + 配方卡——每次跑一个实验，自动帮你写下"用了什么参数、最后效果多少分、模型存哪了"。

你写训练脚本，本来是这样：

```python
model = train(lr=0.01, batch_size=32)
print(f"acc={accuracy}")
```

加 MLflow 之后变成：

```python
import mlflow
with mlflow.start_run():
    mlflow.log_param("lr", 0.01)
    mlflow.log_metric("acc", accuracy)
    mlflow.log_artifact("model.pkl")
```

跑完打开 `mlflow ui`，浏览器里看到一张表：所有跑过的实验、参数、指标、模型文件，按时间排好。这就是 MLflow 解决的最基本的事——**让 ML 实验从口头/纸条/Excel 进化成系统化记账**。

## 为什么重要

不理解 MLflow，下面这些事都没法解释：

- 为什么大厂招 MLOps 工程师，简历都写"熟悉 MLflow / W&B"——它定义了行业的术语（experiment / run / artifact）
- 为什么 Databricks 一家公司能让"实验记录"成为标配——开源 + 早进场 + 不强制改代码
- 为什么 Kubeflow / Flyte / Airflow 都跑去和 MLflow 集成而不是自己造——抢了"最小工件集"的标准位
- 为什么 ML 项目从 notebook 到生产常翻车——没有 tracking 时根本不知道线上模型对应哪份代码与哪次 run

## 核心要点

MLflow 把 ML 生命周期切成 **四件套**，每个都能单独用：

1. **Tracking（跟踪）**：记录每次跑的参数、指标、产物。最小单位是 **run**（一次跑），多个 run 归到 **experiment**（一个项目/课题）。

2. **Models（模型格式）**：把训好的模型打成统一格式（MLmodel YAML + 多 flavor）。`pyfunc` 是通用入口——任何模型只要伪装成 `predict(input)` 函数，下游部署都能用一套代码处理。

3. **Model Registry（模型注册表）**：给模型加版本号、加状态（Staging / Production / Archived），相当于模型的身份证 + 工号晋升。

4. **Projects（项目打包）**：把代码 + 环境 + 入口打成 `MLproject` YAML，别人 `mlflow run .` 一键在自己机器上复现。类似 Makefile + requirements.txt 的合体。

四件套是**正交**的——你可以只用 Tracking 不用 Registry，也可以只用 Models 不用 Projects。这种"积木式"是 MLflow 能铺开的关键。

## 实践案例

### 案例 1：最小 Tracking 例子

```python
import mlflow
from sklearn.ensemble import RandomForestClassifier

mlflow.set_experiment("iris-classification")
with mlflow.start_run():
    model = RandomForestClassifier(n_estimators=100, max_depth=5)
    model.fit(X_train, y_train)
    acc = model.score(X_test, y_test)

    mlflow.log_param("n_estimators", 100)
    mlflow.log_param("max_depth", 5)
    mlflow.log_metric("accuracy", acc)
    mlflow.sklearn.log_model(model, "model")
```

跑完 `mlflow ui`，浏览器打开 `http://localhost:5000`，看到一行：参数 `n_estimators=100`、指标 `accuracy=0.97`、产物里挂着 `model/`。**没改训练代码结构，只加了几行 log。**

### 案例 2：pyfunc — 抽象的胜利

不同框架的模型加载方式完全不一样：sklearn 是 `pickle.load`，PyTorch 是 `torch.load`，TensorFlow 是 `tf.saved_model.load`。MLflow 把它们全包装成一个接口：

```python
import mlflow.pyfunc
model = mlflow.pyfunc.load_model("models:/iris/Production")
predictions = model.predict(input_df)
```

下游部署服务只认 `model.predict(input)`，**不在乎里面装的是 PyTorch 还是 sklearn**。这一招让"训练框架"和"部署后端"彻底解耦，是 MLflow 设计上最聪明的地方。

### 案例 3：Registry 让团队协作不靠人肉

没有 Registry 时，工程师 A 训了模型扔到 S3 某个桶，告诉 B："你拿 `s3://bucket/model_v3_final_v2.pkl`"。B 拿错版本是常态。

加了 Registry：

```python
mlflow.register_model("runs:/<run_id>/model", "iris-classifier")
client.transition_model_version_stage(
    name="iris-classifier", version=3, stage="Production"
)
```

部署端永远拉 `models:/iris-classifier/Production`——**版本和身份解耦**。要回滚就把旧版本提到 Production，新版本降到 Archived。

## 踩过的坑

1. **默认 artifact 存本地**——你在自己机器上跑很爽，团队协作就傻眼："为什么我看不到你的 run？" 必须配 S3/GCS + Postgres，本地只是 demo 用。

2. **SQLite backend 在生产会卡**——多人并发写元数据时锁库。生产环境必须 Postgres / MySQL。

3. **`log_artifact` 不适合大文件**——上传 GB 级模型权重会很慢，artifact store 就是个"附件附庸"，不是数据湖。大权重该走专门的 model registry / 对象存储 + 在 tracking 里只记路径。

4. **Stage 没权限控制**——任何人都能 `transition_to_production`，没有审批流。生产团队通常自己加一层 CI/CD 网关。**2.9 之后官方推荐换成 alias（@champion / @challenger）+ tag**，更灵活。

5. **experiment_id 和 run_id 混用**——新人常把 `experiment_id` 当成 `run_id` 传给 API，调 `get_run` 返回 404。记住：experiment 是文件夹，run 是文件夹里的一次记录。

## 适用 vs 不适用场景

**适用**：

- 中小团队需要快速搭实验跟踪——一天就能跑起来
- 已用 Databricks / Spark 的环境——原生集成最好
- 需要把模型打统一格式给下游部署团队——pyfunc 是关键
- 需要给模型加版本 + 状态做审计——Registry 够用

**不适用**：

- 纯 LLM workflow + 重 prompt 迭代 → LangSmith / Phoenix 更顺手（虽然 MLflow 2.x 也加了 LLM 支持，生态还差一档）
- 强调 GPU 集群 + 流水线编排 → Kubeflow / Flyte 更合适，MLflow 不是调度器
- 极简单单人项目 → 一个 CSV + Git 就够了，别上重武器

## 历史小故事（可跳过）

- **2018-06**：Databricks 在 Spark+AI Summit 发布 MLflow 0.1，主打 Tracking。Matei Zaharia（也是 Apache Spark 的创建者）牵头。
- **2019**：加入 Models 和 Projects 模块，从"记录工具"变成"生命周期框架"。
- **2019-Q4**：Model Registry 正式上线，补齐协作短板。
- **2020**：捐给 Linux Foundation AI & Data，治理上去 Databricks 化。
- **2022**：MLflow 2.0 上线 Recipes（已废弃）和 LLM 支持。
- **2024+**：GenAI 评估、Prompt 管理、MLflow Tracing（仿 OpenTelemetry 给 LLM 调用链路埋点）。

它的传播路径很经典：**开源 + 大厂背书 + 早期定义术语 + 不侵入用户代码** = 行业标准。

## 学到什么

1. **不侵入是开源工具的护身符**——MLflow 只让你加 `import mlflow + 几行 log`，不要求改训练循环、不要求换框架，传播阻力极低。
2. **正交切分** Tracking / Models / Registry / Projects——每个都能独立用，组合起来覆盖整个生命周期。这是好系统设计的范式。
3. **pyfunc 抽象**告诉你：找到一个最小通用接口（`predict(x)`），下游所有差异都能消解。这和 Unix `read/write` 文件接口、HTTP `GET/POST` 是同一个思路。
4. **早进场 + 定义术语** 是占领标准的捷径——experiment / run / artifact 这些词现在所有 MLOps 工具都在用，等于 MLflow 写了行业字典。

## 延伸阅读

- 官方文档：[MLflow Docs](https://mlflow.org/docs/latest/index.html)（Tracking 入门 30 分钟看完）
- 源码：[mlflow/mlflow on GitHub](https://github.com/mlflow/mlflow)（Apache 2.0，Python 主体 + React 前端）
- Matei Zaharia 2018 演讲：[Accelerating the ML Lifecycle with MLflow](https://www.youtube.com/results?search_query=mlflow+matei+zaharia+2018)
- [[borg-omega-kube-2016]] —— 集群调度的标准化路径，与 MLflow 的"标准工件集"思路相通

## 关联

- [[borg-omega-kube-2016]] —— 同样靠"开源 + 标准化术语"占领基础设施层的范例
- [[pytorch]] —— MLflow 最常配的训练框架之一，pyfunc 让 PyTorch 模型能伪装成通用函数
- [[keras]] —— MLflow 的 keras flavor 直接接，体现"多 flavor"设计的复用价值

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

