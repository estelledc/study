---
title: Weights & Biases — 几行 init 把指标系统代码自动入库
来源: Lukas Biewald 等创办，wandb 官方文档 + Tracking ML Experiments 系列博客
日期: 2026-05-31
分类: 基础设施
难度: 入门
---

## 是什么

Weights & Biases（**wandb**，读作 W and B）是一套**给机器学习训练做"飞行记录仪"**的工具。日常类比：飞机黑盒——飞行中每秒记高度、速度、油量、姿态，落地后地面工程师可以回放每一秒。

你写训练脚本时只加 4 行：

```python
import wandb
wandb.init(project="mnist", config={"lr": 0.01})
# ... 训练循环 ...
wandb.log({"loss": loss}, step=step)
wandb.finish()
```

wandb 就会**自动把这些东西入库**：

- 每一步的 loss / accuracy（你 log 什么记什么）
- 系统指标：GPU 显存、利用率、CPU、磁盘、网络
- 代码：当前 git commit、diff、Python 依赖、命令行参数
- 配置：超参（lr / batch / model）

dashboard 端立刻看到实时折线图，团队成员浏览器一开就能跟你对账。

## 为什么重要

不用 wandb（或类似工具）你大概率会经历这些痛：

- 训练跑了 6 小时，loss 曲线只在终端滚——SSH 一断什么都没了
- 三个同事跑了三组实验，对比要互相截图发飞书
- 一个月前那次"跑得最好的那次"，超参是什么、用了哪个 commit、训练数据哪一版——全靠记忆
- 想复现学长的论文，他给了 GitHub 仓但**没给具体超参和随机种子**

wandb 把这些一次性解决，所以**研究界几乎默认就用它**——HuggingFace Transformers 的 `report_to="wandb"` 一行启用，PyTorch Lightning 直接 `WandbLogger()`。

## 核心要点

wandb 的能力可以拆成 **4 个原语**：

1. **Run（一次实验）**：`wandb.init()` 启动一个 run，自动分配 ID、记录环境、绑定 git。

2. **Log（指标打点）**：`wandb.log({...})` 往这个 run 里塞键值对，dashboard 按 step 画线。

3. **Sweep（超参搜索）**：写一个 yaml 描述搜索空间（grid / random / bayes），起多个 agent 进程并行扫，结果按重要性排序。

4. **Artifact（数据 / 模型版本）**：`wandb.Artifact` 给数据集和 checkpoint 打版本，**自动追血缘**——这个模型是哪个 run 训的、用了哪版数据，一键回溯。

四个原语合起来，覆盖"实验 → 调参 → 模型管理"全链。

## 实践案例

### 案例 1：4 行代码接到现有训练脚本

```python
import wandb
wandb.init(project="mnist", config={"lr": 0.01, "batch_size": 64})

for step in range(1000):
    loss = train_step()
    wandb.log({"loss": loss, "lr": current_lr}, step=step)

wandb.finish()
```

跑完打开 [wandb.ai/<你>/mnist](https://wandb.ai)，loss 曲线、GPU 显存、git commit 全在那。

### 案例 2：HuggingFace Transformers 一行启用

```python
from transformers import TrainingArguments
args = TrainingArguments(output_dir="./out", report_to="wandb", run_name="bert-finetune-v3")
```

`report_to="wandb"` 这一行，trainer 内部所有 `log_history` 自动同步到 wandb。**你完全不用改训练循环**。

### 案例 3：用 Sweep 替代手写超参搜索

写一个 `sweep.yaml`：

```yaml
method: bayes
metric:
  name: val_loss
  goal: minimize
parameters:
  lr:
    min: 0.0001
    max: 0.1
    distribution: log_uniform_values
  batch_size:
    values: [32, 64, 128]
```

然后 `wandb sweep sweep.yaml` + `wandb agent <id>`。开 4 个终端跑 4 个 agent，wandb 自己分配任务、贝叶斯调参、出 importance 排序。**比手写 grid 循环省一上午。**

## 踩过的坑

1. **log 频率太高 → 训练变慢**：每个 step 都 `wandb.log` 几十个 metric，网络阻塞拖慢训练。改成每 N step 才 log，或开 `wandb.init(settings=wandb.Settings(_disable_stats=True))` 关系统采样。

2. **Artifact 把 200GB 数据集上传 → 账单爆炸**：默认 Artifact 是上传到 wandb 服务器的。要存大数据集，用 **reference artifact**（`add_reference("s3://bucket/...")`）只记 URI 不传内容。

3. **Sweep agent 不抓异常 → 一个 run 挂了整个 agent 退**：训练脚本里 try/except 包住 `train()`，捕获后 `wandb.finish(exit_code=1)` 让 agent 跑下一组。

4. **config 改了但没重新 init**：在 notebook 里改了 lr 又跑，但 `wandb.init` 没重新调用，dashboard 上 config 还是旧值。**养成每次实验前 `wandb.finish()` + `wandb.init()` 的习惯。**

5. **entity 搞混**：个人账号 entity 是 username，组织是 team name。脚本里写错 entity，run 跑到了别人 project 下，找不到。

## 适用 vs 不适用场景

**适用**：

- 多人合作训练（HuggingFace / Stability AI / 大量学术实验室都是默认）
- 超参搜索（用 Sweeps 替代手写脚本）
- 论文复现（一份 wandb run 链接 = git sha + 超参 + 指标，发审稿人）
- 对比多次实验（拖几个 run 进同一个 plot 立刻对齐）

**不适用**：

- 纯本地一次性脚本 → tensorboard 或 print 就够
- 推理服务监控 → wandb 是训练时工具，生产环境用 grafana / datadog
- 数据严格隐私 → 默认上云，要么自建 server 要么换 mlflow
- 极小项目（toy demo） → 4 行 init 也是负担

## 历史小故事（可跳过）

- **2017 年**：Lukas Biewald（CrowdFlower 创始人）和团队发现训练 ML 模型时**没有像样的实验记录工具**，决定造一个，公司起名 Weights & Biases。
- **2018 年**：SDK 1.0 发布，最早只是画 loss 曲线。
- **2020 年**：推出 Sweeps（超参搜索）+ Artifacts（数据 / 模型版本），从"画线工具"扩成"实验管理平台"。
- **2022 年**：估值 10 亿+ 美元，研究界基本默认。
- **2025 年**：被云服务商 CoreWeave 以 17 亿美元收购，成为 GPU 云栈的一部分。

## 学到什么

1. **观测要在源头自动化**——靠人手记超参 / 截图发群，迟早出错；几行 init 把"飞行记录"做掉。
2. **API 简单是核心竞争力**——wandb 4 行就能用，tensorboard 要写 SummaryWriter，差距就在这里。
3. **元数据 > 数据**——记住 git sha + 超参 + 系统环境的价值，往往超过保存全部 checkpoint。
4. **集成生态比功能更值钱**——HuggingFace / Lightning / Keras 一行启用，让 wandb 成为"不用想就装"的标配。

## 延伸阅读

- 官方文档：[docs.wandb.ai](https://docs.wandb.ai/)（教程友好，零基础可跟）
- 视频：[Lukas Biewald — Tracking ML Experiments](https://www.youtube.com/watch?v=krWjJcW80_A)（创始人讲设计哲学）
- 对比文章：[wandb vs mlflow vs tensorboard](https://neptune.ai/blog/wandb-alternatives)（neptune 写的，有偏但对比维度全）
- [[mlflow]] —— 开源对家，更偏 model registry
- [[pytorch-lightning]] —— 内置 WandbLogger，最常见入口

## 关联

- [[mlflow]] —— Databricks 开源版，无团队协作 UI 但本地免费
- [[pytorch]] —— 训练框架，wandb 最主要的"被监控对象"
- [[pytorch-lightning]] —— 通过 WandbLogger 一行启用
- [[keras]] —— 通过 WandbCallback 一行启用
- [[opentelemetry]] —— 通用观测协议，偏 trace；wandb 偏 metrics + 元数据
- [[sentry]] —— 也是观测但定位生产错误，不是训练时实验

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/clearml]] —— ClearML — 实验跟踪 + 远程执行 + 数据管理三合一
