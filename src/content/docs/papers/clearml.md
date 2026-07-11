---
title: ClearML — 实验跟踪 + 远程执行 + 数据管理三合一
来源: Allegro AI, ClearML (前身 Trains, 2019 开源), Apache 2.0
日期: 2026-05-31
分类: MLOps
难度: 中级
---

## 是什么

ClearML 是一套**把"记录实验、把训练任务丢去远端机器跑、给数据集加版本号"三件事合一的开源 MLOps 平台**。日常类比：实验记录本 + 远程外卖窗口 + 数据冰箱——你写一行代码，它自动帮你记今天用了什么参数、把这次训练送去隔壁带 GPU 的机器、再给数据集贴上"v3.2"的标签。

最小例子：

```python
from clearml import Task
task = Task.init(project_name='iris', task_name='baseline')

model = train(lr=0.01, batch_size=32)
print(f'acc={accuracy}')
```

跑完打开 ClearML web，看到一张表：参数、指标、git commit、uncommitted diff、pip freeze、stdout、tensorboard 曲线——**全部自动捕获，没让你额外写一行 log**。再加一行 `task.execute_remotely(queue_name='gpu')`，这段进程会被冻结序列化、扔到远端 GPU 机器上跑。

## 为什么重要

不理解 ClearML，下面这些事都没法解释：

- 为什么 MLflow 用户跑去看 ClearML——MLflow 不能远程执行，你 log 完还得自己上 K8s/SLURM；ClearML 一行 `enqueue` 就丢去远端机器跑
- 为什么数据集版本化是空白生态位——之前要 DVC + Git LFS 拼，ClearML 内建 `clearml-data`
- 为什么金融、医药、军工选 ClearML 而不是 W&B——可私有部署 + 开源(Apache 2.0)，不能上 SaaS 的场景能直接落地
- 为什么 ClearML 自动捕获维度比 MLflow 多——它抓 git commit + uncommitted diff + 完整 pip freeze，**复现接近 100%**

## 核心要点

ClearML 的世界由 **5 个对象**组成：

1. **Task（任务）**：一次实验/一次跑。自动捕获 git commit、未提交 diff、pip freeze、argparse、stdout、scalar 指标。MLflow 的 run 只记你显式 `log_*` 的，ClearML 默认全抓。

2. **Agent（远程 worker）**：常驻在远端机器上的进程，监听 queue，pull task，**重建当时的环境**(venv 或 docker)，再跑代码。把"上传训练任务"变成"下单外卖"。

3. **Queue（队列）**：任务排队的地方，绑定一组 agent 与 GPU 资源。"gpu-a100" / "cpu-only" 等。

4. **Dataset（数据集）**：版本化数据集，差量上传（类 git），可继承父集。`clearml-data create/add/upload` 命令行操作。

5. **Pipeline（流水线）**：用 Task 串成 DAG。`PipelineController + add_step`，每一步是独立 Task。

5 个对象**正交可组合**——你可以只用 Task 不用 Agent，也可以只用 Dataset 不接 Pipeline。

## 实践案例

### 案例 1：零侵入 Tracking

```python
from clearml import Task
task = Task.init(project_name='iris', task_name='rf-baseline')

from sklearn.ensemble import RandomForestClassifier
model = RandomForestClassifier(n_estimators=100, max_depth=5)
model.fit(X_train, y_train)
acc = model.score(X_test, y_test)
print(f'accuracy={acc}')
```

只加了 1 行 `Task.init()`。打开 web UI，已自动记下：

- 参数：`n_estimators=100, max_depth=5`（argparse 或 hardcoded 都抓）
- 指标：`accuracy=0.97`（从 stdout 解析）
- 环境：当时的 git commit + 未提交 diff + 完整 pip freeze
- 输出：完整 stdout/stderr

**比 MLflow 少 4 行代码，捕获却多 3 个维度。**

### 案例 2：远程执行 — ClearML 真正的杀手锏

```python
from clearml import Task
task = Task.init(project_name='iris', task_name='gpu-train')
task.execute_remotely(queue_name='gpu-a100', exit_process=True)

# 下面的代码不会在本地跑，而是冻结序列化送去远端 agent 执行
import torch
model = train_big_model()
```

`execute_remotely` 调用瞬间：

1. 把 git commit + uncommitted diff + pip 包列表打成"冻干包"
2. 推到 ClearML server，丢进 `gpu-a100` 队列
3. 本地进程退出（`exit_process=True`）
4. 远端 agent pull 到任务，rebuild 环境（venv/docker），从同一行代码继续跑

**MLflow 没有这功能**——你得自己写 K8s YAML / SLURM 脚本 / Airflow DAG。这是 ClearML 拉开身位的关键。

### 案例 3：数据集版本化

```bash
clearml-data create --project iris --name iris-v1
clearml-data add --files ./data/
clearml-data upload --storage s3://bucket
clearml-data close   # 锁版本，拿到 dataset_id
```

之后训练里直接：

```python
from clearml import Dataset
data_path = Dataset.get(dataset_id='abc123').get_local_copy()
```

差量存储——v2 只比 v1 多了 100 张图，就只传那 100 张，不重传 v1 的全部。这正是过去要 DVC + Git LFS 拼出来的能力。

## 踩过的坑

1. **`Task.init()` 必须在 import 框架前**——否则 hook 不到 tensorboard/matplotlib，曲线丢失。养成"第一行写 Task.init"的肌肉记忆。

2. **agent venv 模式每次重建环境很慢**——pip install 跑几分钟。生产改用 docker mode + 镜像缓存，启动几秒。

3. **uncommitted diff 自动上传是双刃剑**——复现率拉满，但敏感代码（密钥、客户数据）会被推到 server。重要项目跑前先 `git add -A && git commit` 干净。

4. **queue 默认串行执行**——一个 agent 一次跑一个 task。多 GPU 并行要起多 agent 或上 k8s glue。

5. **自建 server 单机吃内存**——docker-compose 拉起 apiserver / webserver / elasticsearch / mongo 四件套，至少 8G RAM 才舒服。免费托管 `app.clear.ml` 有用量上限。

## 适用 vs 不适用场景

**适用**：

- 团队要"远程执行 + 跟踪 + 数据集"一体化（不想拼 MLflow + Airflow + DVC）
- 强合规需私有部署（金融、医药、政府）
- 数据集需要版本化（CV / audio 大数据）
- 需 HPO 自动调参（多 worker 并行）

**不适用**：

- 纯 LLM prompt 迭代 → LangSmith / Phoenix 更顺手
- 极简单人项目 → MLflow 或纯 git 更轻
- 强 K8s 原生编排 → Kubeflow Pipelines / Flyte 更深
- 成熟商业集成生态 → W&B 更成熟

## 历史小故事（可跳过）

- **2019**：Allegro AI（以色列）开源 **Trains 0.1**，定位 PyTorch/TF 实验跟踪，对标当时刚出的 MLflow
- **2020-Q4**：改名 **ClearML**，扩展为完整 MLOps（加 Agent、Pipeline）
- **2021**：**ClearML Data** 上线，补齐数据集版本化短板
- **2022-2023**：k8s glue / Pipeline / HPO 完善，进入很多企业的内部 ML 平台候选
- **2024+**：加 GenAI 评估、Prompt 管理、LLM Observability，跟着大潮走

它的差异化定位很清楚：**MLflow + Agent + Dataset 三合一 + 完整可私有部署**。在 W&B（SaaS 强但贵）、MLflow（轻但缺远程执行）之间的中间地带。

## 学到什么

1. **"自动捕获" 比 "手动 log" 更值钱**——MLflow 让你写 `log_param/log_metric`，ClearML 让你 `Task.init()` 后什么都不写。摩擦差一档，传播差一档。
2. **远程执行 + 跟踪一体化** 是 ClearML 抢到的生态位——分开两个工具拼接的方案永远比"原生一体"难用。
3. **可私有部署 + 开源** 是杀手锏——SaaS 不能进的市场（金融、医药、政府）就是 ClearML 的主场。
4. **复现度的极致** 是 git commit + uncommitted diff + pip freeze 三件套——少一个都不算真正能复现。

## 延伸阅读

- 官方文档：[ClearML Docs](https://clear.ml/docs/latest/)（30 分钟看完核心概念）
- 源码：[allegroai/clearml on GitHub](https://github.com/allegroai/clearml)（Apache 2.0）
- 自建 server：[clearml-server](https://github.com/allegroai/clearml-server)（docker-compose up 一键起）
- [[mlflow]] —— MLflow 是 ClearML 最直接的对照系（差异：远程执行 + 数据集）

## 关联

- [[mlflow]] —— 同生态位的"轻量版"，没有 Agent 没有 Dataset
- [[wandb]] —— SaaS-first 的实验跟踪，与 ClearML 在私有部署上互补
- [[dvc]] —— 单点解决数据集版本化，被 ClearML Data 内建覆盖
- [[pytorch]] —— ClearML 最常配的训练框架之一，自动 hook tensorboard 曲线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/scoop]] —— Scoop — Windows 上像 Homebrew 一样装命令行工具
