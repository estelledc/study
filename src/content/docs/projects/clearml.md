---
title: ClearML — 自托管 MLOps 套件
来源: https://github.com/clearml/clearml
日期: 2026-05-31
分类: 项目
难度: 中级
---

## 是什么

ClearML 是一套**把"训练 + 远程执行 + 数据集版本"三件事打包**的 MLOps 工具。日常类比：像给"做实验"配了一个会自动写实验簿、会自动把实验送去远端机器跑、还会给原料贴版本号的智能助理——你只管写代码，它在后台把所有"上下文"都偷偷抓下来。

由以色列公司 Allegro AI 在 2019 年开源，最早叫 **Trains**，2020 年底改名 ClearML，扩展为完整 MLOps 平台。Apache 2.0 协议，~5.6k stars，主语言是 Python，但有 Web UI（React）和后端（Python / Elasticsearch / MongoDB）。

它的差异点：**MLflow 只管"记"，ClearML 还管"跑"**——你写 `task.execute_remotely(queue=gpu)` 一行，本地进程会被冻结、序列化、扔到远端 GPU agent 上重新跑起来。这一步是 MLflow / W&B 都不做的。

## 为什么重要

机器学习生产环境通常要拼三个工具：MLflow 记实验 + Airflow 做调度 + DVC 管数据。三套各有自己的概念、UI、配置文件——团队学习成本极高。

ClearML 的赌注是：**把这三件事用同一套 Task 抽象统一**。

- 实验跟踪 → Task 自动捕获（不用调 log 函数）
- 远程执行 → Task 序列化 + Agent 拉取
- 数据集版本 → Dataset 是特殊 Task
- 流水线 → PipelineController 把 Task 串成 DAG
- 调参 → HyperParameterOptimizer 包装 Optuna / Hyperband

**而且整个 server 端能私有部署**——这点对金融、医药、政府这些"数据绝不出网"的行业极其关键。W&B 是 SaaS-first，私有版本要单独签合同；ClearML 上来就是 docker-compose 起一套就能用。

## 核心要点

### Task — 一次实验

```python
from clearml import Task

task = Task.init(project_name="demo", task_name="train resnet")

# 之后正常写代码，下面这些会被自动抓
import argparse
args = parser.parse_args()      # 超参数自动入库
print("loss=0.3")               # stdout 自动入库
import tensorboard              # scalar 自动入库
plt.plot(...)                   # matplotlib 图自动入库
```

`Task.init()` 一行触发 **monkey-patch**，之后 print / argparse / tensorboard / matplotlib / git 状态全部自动捕获。**踩坑提醒**：必须在 import 这些框架**之前**调，否则 hook 不上。

### Agent — 远程执行

```bash
# 在远端 GPU 机器上
clearml-agent daemon --queue gpu --docker
```

Agent 是一个守护进程，监听某个 queue，看到任务就：拉代码（git clone + apply uncommitted diff）、重建环境（venv 或 docker）、跑 task、回传结果。

```python
# 在本地代码里
task.execute_remotely(queue_name="gpu")
# 这一行之后，本地进程退出，任务在远端 agent 重启
```

**这是 ClearML 的杀手锏**——本地 IDE 写代码，调试通过后加一行就送去 GPU 集群。MLflow 没有这个。

### Dataset — 版本化数据集

```python
from clearml import Dataset

ds = Dataset.create(dataset_name="imagenet-mini", parent_datasets=["v1"])
ds.add_files("data/")
ds.upload()
ds.finalize()
```

差量上传（类似 git）、可继承父集、可在任意 Task 里 `Dataset.get(...).get_local_copy()` 拉下来。CV / 音频 这种大数据场景是必备，避免每个项目各自存一份 100GB。

### Pipeline + HPO

- **PipelineController** 把多个 Task 用 DAG 串起来（数据准备 → 训练 → 评估）
- **HyperParameterOptimizer** 包装 Optuna / Hyperband，自动并行扫超参

## 实践案例

### 三行接入 PyTorch 训练

```python
from clearml import Task
task = Task.init(project_name="cv", task_name="resnet50")

import torch                # 之后所有 print / tb scalar 自动入库
# ... 正常训练代码 ...
```

跑完打开 web UI，能看到：超参表、loss 曲线、git commit、未提交 diff、pip freeze、GPU 利用率、控制台输出——**全是零侵入抓的**。

### 本地调试 + 远程跑

```python
task = Task.init(project_name="cv", task_name="resnet50")

if __name__ == "__main__":
    task.execute_remotely(queue_name="gpu-a100")  # 本地这里就退了
    train()                                        # 实际在远端跑
```

工作流：本地 IDE 单步 debug 5 个 epoch → 通过 → 加这一行 → 推到远端跑 100 个 epoch。

### 案例 3：把数据集也当成版本
```python
from clearml import Dataset
ds = Dataset.create(dataset_name="cats-vs-dogs")
ds.add_files("data/")
ds.upload()
ds.finalize()
```

**逐部分解释**：
- `Dataset.create` 像开一个数据仓库分支，记录这批数据叫什么。
- `add_files` 只声明要收哪些文件，真正上传由 `upload` 执行。
- `finalize` 像给版本打 tag，后续训练任务可以固定拉这一版，避免“今天的数据和昨天不一样”。

## 生态对比

| 维度 | ClearML | MLflow | W&B |
|------|---------|--------|-----|
| Tracking | 自动捕获 | 手动 log | 自动捕获 |
| Models / Registry | 有 | 强 | 有 |
| 远程执行 | **Agent** | 无 | Launch（弱） |
| 数据集版本 | **Dataset** | 无 | Artifacts |
| Pipeline | 有 | 弱 | 无 |
| HPO | 包 Optuna | 无 | Sweeps |
| 私有部署 | **开箱即用** | 开箱即用 | 收费版 |
| 商业生态 | 较小 | 大 | **最大** |

定位：**ClearML = MLflow + Airflow + DVC 的合一开源解**，对自托管要求高的团队。

## 踩过的坑

1. **`Task.init()` 必须在 import 前**——否则 monkey-patch 来不及，tensorboard / matplotlib 抓不到
2. **uncommitted diff 自动上传**——敏感代码要小心，可以 `Task.set_offline_mode()` 关掉
3. **agent venv 模式重建环境慢**——生产环境用 docker mode + 镜像缓存
4. **queue 默认串行**——多 GPU 并行要起多个 agent，或上 k8s glue
5. **自建 server 吃内存**——docker-compose 四件套（apiserver / webserver / es / mongo），单机 8GB 起步，建议 16GB

## 适用 vs 不适用场景

**适用**：
- 团队想要"远程执行 + 跟踪"一体化（不想拼 MLflow + Airflow + DVC）
- 强合规需私有部署（金融 / 医药 / 政府）
- 数据集要版本化（CV / 音频 / 大数据）
- 需要自动 HPO 调参

**不适用**：
- 纯 LLM prompt 工程 → 用 LangSmith / Phoenix
- 极简单人项目 → MLflow 或纯 git 足够
- K8s 原生编排首选 → Kubeflow Pipelines / Flyte
- 想要最成熟的商业生态和社区 → W&B

## 历史小故事

- **2019**：Allegro AI 开源 Trains 0.1，定位"自托管 MLflow 替代"
- **2020 Q4**：改名 ClearML，扩展为完整 MLOps 平台
- **2021**：ClearML Data 上线，数据集版本化能力补齐
- **2022-2023**：k8s glue / Pipeline / HPO 完善
- **2024+**：跟进 GenAI / LLM Observability 浪潮

7 年时间从"开源 trainer"长成"开源 MLOps 全家桶"，路线很清晰。

## 学到什么

1. **统一抽象的力量**——Task 一个概念覆盖实验 / 数据 / 远程执行 / 流水线，比拼多个工具学习成本低
2. **monkey-patch 自动捕获**是 zero-friction 的关键——用户不用记 log API
3. **execute_remotely 是分水岭**——ML 工具从"记录器"升级到"执行器"
4. **私有部署是合规护城河**——技术不一定最强，但能解决 SaaS 解决不了的问题
5. **2019 的开源工具到 2026 还在迭代**——MLOps 这个赛道远没收敛

## 延伸阅读

- 官方文档：[clear.ml/docs](https://clear.ml/docs/)
- GitHub：[clearml/clearml](https://github.com/clearml/clearml)（主仓） / [clearml-agent](https://github.com/clearml/clearml-agent)（远程执行 worker）
- 自建 server 教程：[clear.ml/docs/latest/docs/deploying_clearml/](https://clear.ml/docs/latest/docs/deploying_clearml/)
- [[mlflow]] —— 同类对比，更轻但功能少
- [[wandb]] —— 同类对比，商业生态更强但偏 SaaS
- [[airflow]] —— 通用编排框架，ClearML 的 Pipeline 是其子集

## 关联

- [[mlflow]] —— ClearML 的最直接竞品，差异在远程执行和数据集
- [[wandb]] —— SaaS 路线的代表，ClearML 走自托管路线
- [[airflow]] —— 通用 DAG 调度，ClearML Pipeline 借鉴了思路
- [[pytorch]] —— ClearML 自动 hook 的主要训练框架之一
- [[pytorch-lightning]] —— Lightning 内置 ClearML logger

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
