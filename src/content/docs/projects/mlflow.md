---
title: MLflow — 端到端 ML 生命周期
来源: https://github.com/mlflow/mlflow
日期: 2026-05-31
分类: 项目
难度: 中级
---

## 是什么

MLflow 是一套**管理机器学习全流程的工具箱**：从训练时记录每一次实验，到把模型打包，到放进版本仓库，再到部署上线。日常类比：像给"训练模型"配了一本实验室记录簿——试剂用量（参数）、反应温度（指标）、产物（模型）、谁准备量产（Registry）都写清楚。

由 Databricks 在 2018 年开源（Matei Zaharia 等），现在约 27k stars，Apache 2.0。Python 为主，也有 Java / R / REST API。

它解决的核心痛：**ML 实验天生混乱**——同一模型可能调参 200 次，三周后没人记得上线那版是哪次 run。

## 为什么重要

不用 MLflow 的团队，常见情形：

- 调参结果散落在 `model_v3_final_FINAL.pkl` 这类文件名里
- 线上模型变差想回滚，训练代码已改百行，复现不了
- sklearn / pytorch / xgboost 混用，部署要写三套适配
- 问"A/B 用的哪个 run"，只能翻聊天记录

MLflow 用 **四件套** 钉住这些问题：

1. **Tracking**：每次训练记一个 `run_id`，参数/指标/产物全在里头
2. **Models**：统一 flavor 格式，下游不用关心训练框架
3. **Model Registry**：中央仓库 + 生命周期/别名
4. **Projects**：克隆下来一行命令能复现的训练包

## 核心要点

1. **Tracking — 实验簿**。类比：每次实验自动贴一张标签。`log_param` / `log_metric` / `log_artifact` 绑到同一个 `run_id`，`mlflow ui` 里可并排对比哪次最好。

2. **Models + flavor — 统一封装**。类比：不管原料来自哪家厨房，出餐都装进同一种餐盒。`mlflow.sklearn` / `pytorch` 等把模型存成可被同一套 API 加载的结构（`MLmodel` + 权重 + 环境）。

3. **Registry + Projects — 版本与复现**。类比：中央样品柜 + 可复印的实验配方。Registry 回答"生产是哪一版"；Projects 用 `MLproject` + conda/docker 锁定环境和入口命令。

## 实践案例

### 案例 1：本地起步

```bash
pip install mlflow
mlflow ui   # http://localhost:5000
```

```python
import mlflow

with mlflow.start_run():
    mlflow.log_param("lr", 0.001)
    mlflow.log_metric("accuracy", 0.92)
    mlflow.log_artifact("model.pkl")
```

**逐部分解释**：

- `pip install` + `mlflow ui` 起本地 Tracking UI。
- `start_run` 打开一次实验记录；参数、指标、文件都挂在这个 run 下。
- 刷新浏览器即可对比多次 run——约 5 分钟走通主路径。

### 案例 2：团队共享 Tracking server

```bash
mlflow server \
  --backend-store-uri postgresql://user:pwd@host/mlflow \
  --default-artifact-root s3://my-bucket/mlflow
```

**逐部分解释**：

- Postgres 存元数据（参数、指标、run 索引）。
- S3 存大文件（权重、图）。
- 同事设 `MLFLOW_TRACKING_URI` 指向该 server，即可共享实验视图。
- 单机文件后端只适合个人 demo，多人会冲突。

### 案例 3：Registry + 部署

```python
import mlflow.pyfunc

model = mlflow.pyfunc.load_model("models:/fraud-detector@champion")
prediction = model.predict(input_df)
```

**逐部分解释**：

- `pyfunc` 用统一接口加载，不关心训练框架。
- `models:/name@alias` 引用 Registry 别名（新推荐）；也可见 `.../Production` 旧 stage 写法。
- 上线/回滚改 alias 即可，服务代码不用改模型路径。

## 踩过的坑

1. **默认本地存储不能扩**：单机文件后端只适合 demo；生产必须 PostgreSQL + 对象存储，否则多人写冲突。
2. **Stage → Alias**：2024 起官方推荐 `@champion` / `@challenger` 等 alias，替代 Staging/Production stage API；老代码里的 `transition_model_version_stage` 要改。
3. **大模型 artifact 慢**：经 Tracking HTTP 上传数 GB 很慢；宜直写 S3 再用 URI 注册。
4. **autolog 不万能**：`mlflow.autolog()` 常漏自定义训练环指标，重要值要手动 `log_metric`。
5. **K8s 集成弱**：MLflow 管记录与仓库，不管调度与 serving；工业部署常配 BentoML / KServe。

## 适用 vs 不适用场景

**适用**：

- 5–50 人团队做模型迭代，希望改动小、可自托管
- 多框架混用（sklearn + pytorch + xgboost），需要统一打包与 Registry
- 想避免锁死在纯 SaaS 实验平台（W&B / Neptune）

**不适用**：

- 极重视可视化报告体验 → Weights & Biases 往往更顺手
- 要 K8s 原生的数据/训练/serving 一体 → Kubeflow 更合适
- 个人随手实验、无需团队共享 → notebook 或个人版工具即可

## 历史小故事（可跳过）

- **2018 年**：Databricks 开源 MLflow，先打 Tracking + Projects，解决"实验不可复现"。
- **随后几年**：Model Registry 补上"哪个版本在生产"的缺口；flavor 抽象让多框架部署收敛。
- **2020s**：与云对象存储、KServe/BentoML 等 serving 组合成为常见自托管 MLOps 路径。
- **2024 前后**：Registry 从固定 stage 转向灵活 alias，贴合真实发布流（champion/challenger 等）。

## 学到什么

1. **抽象层是核心**：真正值钱的是 flavor + Registry + URI，让训练多样性与部署统一性解耦。
2. **元数据与大文件分离**：库表索引 + 对象存储内容，是几乎所有 ML 平台的基本架构。
3. **Stage → Alias**：有限枚举让位于自由命名，因为真实工作流远不止 Staging/Production 两档。
4. **记录 ≠ 调度**：MLflow 把"记清楚"做好；跑在哪、怎么 serving 通常要另接工具。

## 延伸阅读

- 官方文档：[mlflow.org/docs](https://mlflow.org/docs/latest/index.html)（新手友好）
- 对比：[[pytorch-lightning]] —— 训练循环抽象（focus 训练阶段）
- 对比：[[airflow]] —— DAG 调度（focus pipeline）
- 对比：[[wandb]] —— 实验跟踪的 SaaS 路线
- 对比：[[bentoml]] —— Registry 之后常见的模型 serving 打包

## 关联

- [[pytorch-lightning]] —— 管"怎么训练整洁"，MLflow 管训练之后
- [[accelerate]] —— 分布式训练，常在 Lightning/MLflow 之前
- [[airflow]] —— 可用 Airflow 调度 + MLflow 记录
- [[pytorch]] —— 原生 PyTorch flavor
- [[wandb]] —— 同类实验跟踪的对照
- [[bentoml]] —— 常接在 Registry 之后做 serving
- [[dvc]] —— 数据/模型版本的另一条开源路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/bentoml]] —— BentoML — 模型打包部署
- [[projects/clearml]] —— ClearML — 自托管 MLOps 套件
- [[dvc]] —— DVC — 数据版本管理
- [[feast]] —— Feast — 让训练和上线用同一份特征定义的开源 Feature Store
- [[kedro]] —— Kedro — 把数据科学 notebook 改造成可复用模块化 pipeline
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[projects/wandb]] —— Weights & Biases — 几行 init 把指标系统代码自动入库
