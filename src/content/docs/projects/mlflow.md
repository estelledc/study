---
title: MLflow — 端到端 ML 生命周期
来源: https://github.com/mlflow/mlflow
日期: 2026-05-31
子分类: ai-infra
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

MLflow 是一套**管理机器学习全流程的工具箱**：从训练时记录每一次实验，到把模型打包，到放进版本仓库，再到部署上线。日常类比：像给"训练模型"这件事配了一本完整的实验室记录簿——每瓶试剂用了多少（参数）、每次反应温度多少（指标）、最后的产物长啥样（模型）、谁打算量产（Registry）都写得清清楚楚。

由 Databricks 在 2018 年开源（背后是 Matei Zaharia，也是 Spark 作者），现在 ~19k stars，Apache 2.0 协议。Python 是主语言，但有 Java / R / REST API。

它解决的核心痛：**ML 实验天生混乱**——同一个模型可能跑 200 次调参，每次产出一个文件夹，三周后没人记得哪个是上线那版。

## 为什么重要

不用 MLflow 的团队，常见情形：

- 调参 50 次，结果存在 `model_v3_final_FINAL.pkl`、`model_better.pkl`、`model_use_this_one.pkl`
- 上线的模型表现下滑，想回滚——但训练它的代码已经被改了 100 行，复现不出来
- 团队里 A 用 sklearn、B 用 pytorch、C 用 xgboost——部署平台要写三套适配
- 老板问"这次 A/B 测试用的是哪个 run？"——翻 Slack 找了一小时

MLflow 用 **四件套** 把这些钉死：

1. **Tracking**：每次训练自动记一个 `run_id`，参数/指标/产物全在里头
2. **Models**：把模型存成统一格式（叫 flavor），下游不用关心你用什么框架训的
3. **Model Registry**：中央仓库 + 生命周期（草稿 → Staging → Production → Archived）
4. **Projects**：把训练代码打成"克隆下来一行命令能复现"的包（conda / docker 环境锁定）

## 核心要点

### Tracking — 实验簿

```python
import mlflow

mlflow.start_run()
mlflow.log_param("lr", 0.001)
mlflow.log_param("batch_size", 32)
# ... 训练 ...
mlflow.log_metric("accuracy", 0.92)
mlflow.log_artifact("model.pkl")
mlflow.end_run()
```

跑完后启动 UI（`mlflow ui`），浏览器里能看到所有 run 的对比表格——哪次准确率最高、用了什么参数，一目了然。

### Models — 统一封装

```python
mlflow.sklearn.log_model(model, "my-model")
# 或
mlflow.pytorch.log_model(model, "my-model")
```

不管你用什么框架，存进去都是同一种结构（`MLmodel` 文件 + 权重 + 环境描述）。下游要部署，从 Registry 拉一个，**用同一种 API 加载**，不用关心源框架。这叫 **flavor 抽象**，是 MLflow 最聪明的设计。

### Model Registry — 模型的 git tag

```python
mlflow.register_model("runs:/<run_id>/my-model", "fraud-detector")
# 然后在 UI 里手动把版本 3 设成 "Production"
```

Registry 帮你回答两个问题：**当前生产用的是哪一版？历史哪些版本上线过？**

### Projects — 复现性封装

`MLproject` 文件 + `conda.yaml` 锁定依赖：

```yaml
name: my-project
conda_env: conda.yaml
entry_points:
  main:
    parameters: {lr: {type: float, default: 0.001}}
    command: "python train.py --lr {lr}"
```

别人 `mlflow run https://github.com/you/repo -P lr=0.01` 一行就能跑——环境自动建好、参数自动传。

## 实践案例

### 案例 1：本地起步

```bash
pip install mlflow
mlflow ui  # 启动在 localhost:5000
```

代码里加几行 `log_param` / `log_metric`，刷新浏览器就能看到。**5 分钟体验**整个流程。

### 案例 2：团队共享 Tracking server

本地文件存储只够一个人玩。多人协作切后端：

```bash
mlflow server \
  --backend-store-uri postgresql://user:pwd@host/mlflow \
  --default-artifact-root s3://my-bucket/mlflow
```

Postgres 存元数据（参数、指标），S3 存大文件（模型权重、图）。所有同事 `MLFLOW_TRACKING_URI` 指向这台 server，就能互相看到对方的 run。

### 案例 3：Registry + 部署

```python
import mlflow.pyfunc
model = mlflow.pyfunc.load_model("models:/fraud-detector/Production")
prediction = model.predict(input_df)
```

部署服务里**只引用一个名字 + 阶段**（`fraud-detector/Production`），上线/回滚由 Registry 改 alias 完成，**代码不动**。

## 踩过的坑

1. **默认本地存储不能扩**：单机文件后端只适合 demo。生产必须切 PostgreSQL + S3，不然多人写会冲突。

2. **Stage → Alias 的迁移**：2024 起 MLflow 官方推荐用 alias（`@champion` / `@challenger`）替代 stage（Staging/Production）。老代码 `transition_model_version_stage` 要改成 `set_registered_model_alias`。

3. **大模型 artifact 慢**：`log_artifact` 走 HTTP 上传，几 GB 模型很慢。生产里要直接写 S3 后用 URI 注册。

4. **autolog 不万能**：`mlflow.autolog()` 自动捕获主流框架的训练指标，但自定义 loop 经常漏抓。重要指标手动 `log_metric` 兜底。

5. **K8s 集成弱**：MLflow 自己只管"记录 + 仓库"，不管"调度 + serving"。工业级部署常和 BentoML / Seldon / KServe 配套。

## 适用 vs 不适用场景

**适用**：
- 中小团队（5-50 人）做模型迭代——上手快、和现有 Python 训练代码改动小
- 想要"开源 + 自托管"，避免锁死在 SaaS（W&B / Neptune）
- 多框架混用（sklearn + pytorch + xgboost）需要统一打包

**不适用**：
- 数据可视化要求高、要写报告 → W&B 体验更好
- 全流程 K8s 原生（数据 pipeline + 训练 + serving 一体）→ Kubeflow
- 只是个人玩玩、不需要团队共享 → 直接用 wandb 个人版或 jupyter notebook 即可

## 学到什么

1. **抽象层是核心价值**：MLflow 真正赚钱的不是 UI，是 **flavor + Registry + URI** 这一层。让"训练框架的多样性"和"部署代码的统一性"解耦。
2. **元数据 vs 大文件分离存储**：Postgres 存索引、S3 存内容——这是几乎所有 ML 平台的基本架构模式。
3. **Stage → Alias 的演进**：从有限的 enum 升到自由命名的 alias，是因为团队真实工作流远不止"Staging / Production"两档。设计总要为现实让步。

## 延伸阅读

- 官方文档：[mlflow.org/docs](https://mlflow.org/docs/latest/index.html)（写得很清楚，新手友好）
- Databricks Engineering Blog 上 MLflow 演进史（搜 "mlflow 3.0"）
- 对比：[[pytorch-lightning]] —— 训练循环抽象（focus 训练阶段）
- 对比：[[airflow]] —— DAG 调度（focus pipeline 调度）

## 关联

- [[pytorch-lightning]] —— Lightning 管"怎么训练得整洁"，MLflow 管"训练之后的事"
- [[accelerate]] —— Accelerate 管"分布式训练"，是 Lightning/MLflow 之前那一段
- [[airflow]] —— ML pipeline 调度可以用 Airflow + MLflow 组合
- [[pytorch]] —— MLflow 原生支持 PyTorch flavor

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bentoml]] —— BentoML — 模型打包部署
- [[clearml]] —— ClearML — 自托管 MLOps 套件
- [[dvc]] —— DVC — 数据版本管理
- [[feast]] —— Feast — 让训练和上线用同一份特征定义的开源 Feature Store
- [[kedro]] —— Kedro — 把数据科学 notebook 改造成可复用模块化 pipeline
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[pytorch-lightning]] —— PyTorch Lightning — PyTorch 训练循环抽象
- [[wandb]] —— Weights & Biases — 几行 init 把指标系统代码自动入库

