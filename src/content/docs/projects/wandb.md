---
title: Weights & Biases — 几行 init 把指标系统代码自动入库
来源: https://github.com/wandb/wandb
日期: 2026-05-31
分类: 项目
难度: 入门
---

## 是什么

Weights & Biases（以下简称 **W&B**）是一套**给机器学习训练做"实验记录簿 + 仪表盘"**的工具。日常类比：你在做长期健身，每次训练拍视频、记体重、记心率，然后所有数据进一个云端 App，回头能拉出曲线对比、能分享给教练。W&B 就是把这件事做给"训模型"的人。

由 Lukas Biewald、Chris Van Pelt、Shawn Lewis 三人 2017 年创立，前身是数据标注公司 CrowdFlower 团队的下一个项目。2022 年估值过 10 亿美元，2025 年被 CoreWeave 以约 17 亿美元收购。OpenAI / Meta / Stability AI 等团队广泛使用，是**研究与工业界常见的实验跟踪工具之一**。

它解决的核心痛：**模型训练天生混乱**——一次跑 8 小时、一次改一个超参、一周跑 50 次，三天后没人记得"准确率 92.3 那次是 lr=3e-4 还是 5e-4"。

## 为什么重要

不用 W&B 的训练流程，常见情形：

- 用 print 打 loss，跑完终端关了——曲线图永远看不到
- 拿 TensorBoard 凑合，但只有指标，没有"这次 run 用的什么超参 / 什么 git 版本 / 什么 GPU"
- 改了超参忘了写在 README——三天后没法复现昨天那个最好的结果
- 团队里每个人本地各跑各的——开会时没法把两条 loss 曲线叠在一张图对比

W&B 用 **四件套**钉死这些痛：

1. **Experiments**：每次 `wandb.init` 自动收 git sha / 超参 / 系统指标 / 输出
2. **Sweeps**：写一份 yaml 描述超参空间，agent 并行跑、自动选下一个
3. **Artifacts**：给数据集 / 模型权重打版本，run 之间靠"血缘"串起来
4. **Reports**：在 Web 上写 markdown + 嵌入实时图表，链接发给同事就能看

## 核心要点

### 最小代码 — 4 行集成

```python
import wandb
wandb.init(project="mnist", config={"lr": 0.01})
for step in range(100):
    loss = train_step()  # 换成你自己的一步训练
    wandb.log({"loss": loss}, step=step)
wandb.finish()
```

`init` 开一本新实验簿并记下超参；`log` 每步把 loss 寄出；`finish` 合上本子。浏览器打开 `wandb.ai/<你>/mnist`，曲线和 GPU 显存利用率会自动出现——**不用自己搭监控**。

### Sweeps — 超参搜索不用自己写循环

```yaml
method: bayes
metric: {name: val_loss, goal: minimize}
parameters:
  lr: {min: 1e-5, max: 1e-2, distribution: log_uniform}
  batch_size: {values: [16, 32, 64]}
```

`wandb sweep config.yaml` 注册，`wandb agent <id>` 启动 worker。多机起多个 agent 就并行了。支持 grid / random / bayes 三种搜索策略。

### Artifacts — 数据和模型也要版本

```python
artifact = wandb.Artifact("dataset", type="dataset")
artifact.add_dir("./data")
wandb.log_artifact(artifact)
```

下游 run 用 `run.use_artifact("dataset:v3")` 拉同一份数据。Web UI 上能看到"模型 v7 是用数据 v3 + 代码 sha abc 训的"——这条**血缘链**是复现实验的命脉。

### Reports — 把图变文章

写一份 markdown，嵌入"这个 project 下 lr < 0.001 的 run 的 val_loss 曲线"，URL 发出去同事点开是实时的。这是 W&B 在 TensorBoard 上加的最大杀器——**协作**。

## 实践案例

### 案例 1：HuggingFace Trainer 接入

```python
from transformers import TrainingArguments, Trainer
args = TrainingArguments(output_dir="./out", report_to="wandb")
trainer = Trainer(model=model, args=args, train_dataset=ds)
trainer.train()
```

三步：① `report_to="wandb"` 告诉 Trainer 把指标寄给 W&B；② 照常 `Trainer(...)`；③ `train()` 时 loss / learning_rate / epoch 自动上云。跑完打开 project 页就能叠曲线。

### 案例 2：PyTorch Lightning 接入

```python
from pytorch_lightning import Trainer
from pytorch_lightning.loggers import WandbLogger
trainer = Trainer(logger=WandbLogger(project="my-project"))
trainer.fit(model, datamodule)
```

① 建 `WandbLogger` 指定 project；② 塞进 `Trainer(logger=...)`；③ `fit` 时 Lightning 把各阶段指标转交给 W&B。[[pytorch-lightning]] 内置此 logger，训练循环本身不用改。

### 案例 3：打开别人的 run 链接复现

别人 README 里贴 `https://wandb.ai/<user>/<project>/runs/<id>`。点开后对照看：左侧 **Config**（lr、batch_size）、中间 **Charts**（val_loss）、**System**（GPU 型号）、**Overview** 里的 git sha。**一份 run 链接 = 超参 + 指标 + 环境 + 代码版本**——这是过去复现论文最缺的那块。

## 踩过的坑

1. **log 频率太高 → 训练变慢**：每个 step 打 几十个 metric，HTTP 请求堆积，反向传播被网络阻塞。规则：把高频 metric（每 step）和低频 metric（每 epoch）分开，必要时 `wandb.log({...}, commit=False)` 攒批。

2. **Artifact 直接传 200GB 数据集 → 账单爆炸**：W&B 默认上云，按存储计费。大数据集要用 **reference artifact**——只记录"S3 上某个路径 + checksum"，数据本身留在你自己的 bucket。

3. **Sweep agent 没 catch 异常 → 整个 agent 退出**：一个 run 训挂了，agent 进程跟着死，剩下的搜索停摆。要在训练函数最外层 `try / except` 包住，或者用 `wandb agent --count N` 限制每 agent 最多跑 N 次。

4. **改了 config 但没重新 init → dashboard 还是旧值**：`wandb.config.lr = 0.01` 在 init 之后赋值不会同步到 Web，要么放进 `wandb.init(config=...)`，要么用 `wandb.config.update({...})`。

5. **个人 vs 组织 entity 弄混**：run 默认进个人账号，团队看不到——要显式 `wandb.init(entity="my-team", ...)`。

## 适用 vs 不适用场景

**适用**：

- 多人合作、一周要对比 ≥10 次 run（HF / 研究团队常见）
- 超参搜索（Sweeps 替代手写 grid 脚本）
- 论文复现 / 分享实验 / 写技术 report
- 想看 GPU 利用率但不想搭 prometheus + grafana

**不适用**：

- 单机一次性脚本、总共 <5 次实验——TensorBoard 或 print 就够
- 推理服务在线监控——W&B 偏训练期，prod 用 grafana / datadog
- 数据不能出内网——可自托管 W&B server（客户端本就开源），或换 [[mlflow]]

## 历史小故事（可跳过）

- **2017 年**：CrowdFlower（数据标注）的 Lukas / Chris 团队卖掉公司后启动 W&B。最初版本只画 loss 折线，竞品是 Google 的 TensorBoard
- **2018 年**：SDK 1.0 发布，HuggingFace 早期就集成
- **2020 年**：Sweeps + Artifacts 上线，从"画图工具"升级成"实验平台"
- **2022 年**：估值过 10 亿美元，在研究团队中广泛采用
- **2025 年**：被云 GPU 厂 CoreWeave 以约 17 亿美元收购——背后是"训练平台 + 算力"绑定卖给大客户的逻辑

## 学到什么

1. **"低门槛默认值"是研究工具的护城河**：W&B 4 行代码集成 + 自动收系统指标 + 默认上云免运维，让"用一下试试"的成本几乎为零。这是它打赢 TensorBoard 和 [[mlflow]] 的关键——而不是某个特别牛的功能。

2. **元数据 vs 大文件分离**：超参 / 指标这种小数据进数据库（W&B Cloud），模型权重 / 数据集大文件靠 reference artifact 指 S3。这是几乎所有 ML 平台的基本架构模式（[[mlflow]] 也是 PostgreSQL + S3）。

3. **协作来自"链接即上下文"**：一条 wandb run URL 自带 git sha + 超参 + 指标 + 系统环境——发给同事不用解释。这是 ML 工具相比传统 CI 多出来的维度：**实验本身是一等公民**。

## 延伸阅读

- 官方文档：[docs.wandb.ai](https://docs.wandb.ai/)（quickstart 5 分钟跑通）
- 对比：[[mlflow]] —— 开源对家，更偏 model registry + 自托管
- 对比：[[pytorch-lightning]] —— 训练循环抽象，内置 `WandbLogger`
- 对比：[[keras]] —— 内置 `WandbCallback` 直接传给 `model.fit`

## 关联

- [[mlflow]] —— 主要竞品；MLflow 偏 registry + 自托管，W&B 偏可视化 + SaaS
- [[pytorch]] —— 最主流的被监控对象
- [[pytorch-lightning]] —— 内置 `WandbLogger`，零改动接入
- [[keras]] —— 内置 `WandbCallback`，传给 `fit` 即可

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/clearml]] —— ClearML — 自托管 MLOps 套件
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[projects/mlflow]] —— MLflow — 端到端 ML 生命周期
