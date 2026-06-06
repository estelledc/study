---
title: DVC — 数据版本管理
来源: https://github.com/iterative/dvc
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 入门
provenance: pipeline-v3
---

## 是什么

DVC（Data Version Control）是一个把 Git 的版本管理思路搬到「数据 / 模型 / pipeline」上的命令行工具。

日常类比：你有一个写论文的文件夹，文档可以丢进 Git，但里面那个 50GB 的实验数据 Git 接不住。DVC 的做法是——在 Git 里只放一张「领货单」（写明这份数据的 hash 和它存在哪个仓库），真数据放远端（S3、Google Drive、自建磁盘都行）。Git 还是那个 Git，体积没炸；但你 git checkout 到任何一个旧 commit，都能用 `dvc pull` 把那一刻对应的数据精确拉回来。

一句话：**Git 管代码 + 一张领货单，DVC 凭领货单把对应版本的数据拉回来**。

## 为什么重要

不用 DVC 的 ML 项目最常见的几种崩溃：

- 「上周那个 92% 的模型怎么复现？」—— 代码在，数据不知道是哪一版
- 「我 pull 了你的代码，跑出来的指标完全不对」—— 数据集对不上
- 「Git LFS 顶不住 100GB 训练集」—— LFS 只解决文件存储，不解决 pipeline

DVC 把这些问题统一成一个工作流：代码、数据、实验指标都进 Git diff，整个项目变成可版本化、可复现、可团队协作的资产。这就是它叫自己 **「Git for data」** 的原因。

## 核心要点

DVC 主要做四件事，一件比一件抽象：

1. **数据当文件管**：`dvc add data.csv` 生成一个 `data.csv.dvc` 占位文件（写明 hash + 大小），原文件被 `.gitignore`，hash 进 Git。git diff 能看出「数据变了」。
2. **远端存储**：`dvc remote add -d storage s3://...` 配好后，`dvc push` 把数据传到 S3，`dvc pull` 拉回来。命令模仿 git push/pull，心智模型一致。
3. **Pipeline 描述**：在 `dvc.yaml` 里写每个 stage 的 `cmd`（怎么跑）、`deps`（依赖什么）、`outs`（产出什么），DVC 自动构造成 DAG。
4. **只重跑变了的部分**：`dvc repro` 检查 hash，输入没变的 stage 直接跳过——和 make / bazel 一个思路，但是面向 ML 的数据流。

更进一步，`dvc exp run` 每次跑都自动记录 `params.yaml`（参数）和 `metrics.json`（指标），可以列出实验表、对比不同跑法的 diff。

工作目录的物理结构大致是：

- `.dvc/` 配置 + 本地 cache（hash 寻址，类似 `.git/objects`）
- `data/raw.csv.dvc` 占位文件（进 Git）
- `data/raw.csv` 真数据（被 .gitignore，由 cache 软链或硬链而来）
- 远端 S3 / GCS / OSS / 本地磁盘 = 共享版本的 cache

## 实践案例

### 案例 1：最小工作流（5 行命令）

```bash
git init && dvc init
dvc add data/raw.csv          # 生成 data/raw.csv.dvc 这个占位文件
git add data/raw.csv.dvc .gitignore
git commit -m "track raw data"
dvc remote add -d storage s3://my-bucket/dvcstore
dvc push                       # 数据上 S3
```

队友拿到这个仓库：

```bash
git clone <repo> && dvc pull   # Git 拿代码 + 占位符，DVC 凭占位符拉回数据
```

### 案例 2：pipeline 描述

`dvc.yaml`：

```yaml
stages:
  prepare:
    cmd: python src/prep.py data/raw.csv data/clean.csv
    deps: [src/prep.py, data/raw.csv]
    outs: [data/clean.csv]
  train:
    cmd: python src/train.py data/clean.csv model.pkl
    deps: [src/train.py, data/clean.csv]
    outs: [model.pkl]
    metrics: [metrics.json]
```

跑一遍：`dvc repro`。改了 `prep.py` → prepare 重跑、train 跟着重跑；只改了 `train.py` → prepare 跳过，只 train 重跑。

### 案例 3：实验追踪

```bash
dvc exp run --set-param train.lr=0.01
dvc exp run --set-param train.lr=0.001
dvc exp show                   # 列出两次实验的参数 + 指标对照表
```

每个实验对应一个临时 commit（Git 内的 ref，不污染主线），效果好的可以 `dvc exp apply <id>` 落到主分支，普通的 `dvc exp gc` 一键回收。

### 案例 4：和 CI 配套

`.github/workflows/ml.yml` 里调 CML：

```yaml
- run: dvc pull
- run: dvc repro
- run: cml comment create metrics.json   # PR 评论里贴出指标 + 图
```

这样每个 PR 都自动跑一遍训练，把指标 / 曲线贴回评论区，code review 时数据和代码一起被审。

## 踩过的坑

1. **Git 不熟会更晕**：DVC 是 Git 的扩展不是替代，要先理解 add / commit / branch / checkout 的心智模型。
2. **超大文件 push 慢**：几十 GB 单文件传 S3 要分块上传，看 `dvc remote modify` 配并发。
3. **Windows 下 symlink 不稳**：默认 cache 用 reflink/symlink，Windows 退化成 copy 会占双倍磁盘。`dvc config cache.type copy` 显式声明更可控。
4. **改了 dvc.yaml 忘 commit**：`.dvc` 文件没进 Git，下次 repro 会判定输入「变了」触发不必要的重跑。
5. **手动改 .dvc 里的 hash**：会让 dvc pull 找不到数据。这文件只能由 `dvc add / dvc commit` 生成，不能手编辑。

## 适用 vs 不适用场景

**适用**：

- ML 项目里数据集 / 模型权重要打版本（v1 / v2 / 加清洗后的 v3）
- 数据预处理 pipeline 要复现——队友 git pull 后跑 `dvc repro` 拿一致结果
- 中小团队，数据存私有 S3 / OSS，代码 + hash 走 Git，权限分层
- 想把 ML 跑进 CI（搭配同公司的 CML，PR 自动跑实验贴报告）

**不适用**：

- 完全数据湖规模（PB 级别）→ 用 LakeFS / Delta Lake
- 偏「实验追踪 + 模型注册」、不在乎数据 hash → 用 MLflow / Weights & Biases
- 重量级 ML 平台（要 K8s 原生 pipeline + 多租户）→ 用 Pachyderm / Kubeflow
- 纯文本仓库（无大文件）→ Git 就够

## 历史

2017 年 Dmitry Petrov 在 Microsoft 做 ML 项目时痛感「数据复现」无解，写了 DVC 雏形。2018 成立 Iterative.ai，开源 DVC，定位「Git for ML」。2020 之后陆续加入 `dvc exp`（实验追踪）、`dvc.yaml`（pipeline 描述）、CML（CI 集成），从单纯的「大文件版本工具」演进成完整的 ML 工程化栈。

到 2024 年前后，DVC 在 GitHub 上累积约 14k star，是 Iterative 公司开源矩阵的核心：DVC（数据 / pipeline）、CML（CI 集成）、MLEM（模型部署）、Studio（云端协作 UI）共同构成「GitOps for ML」的尝试。

## 学到什么

1. **占位符 + 远端**这套思路通用：不光数据，模型权重、Notebook 中间产物都能这么管。本质是把「内容」和「位置」解耦——Git 管位置（hash），存储看场景换。
2. **DAG + hash** 让「只重跑变了的部分」变得自然——和 make / bazel / nix 是一脉相承的工程美学。区别只是节点装的是数据集而不是 .o 文件。
3. **diff 友好**才能进 code review：参数 / 指标 / 数据 hash 都做成可 diff 的小文本，PR 才能审。这条对所有「想被纳入 Git 流程」的工具都成立。
4. **工具不替代 Git，要长在 Git 上**：DVC 的所有命令都和 Git 同形（add / push / pull / checkout），学习曲线大幅降低。同样思路在 Nix flake、Pulumi、Terraform 也能看到。

## 关联

- [[airflow]] —— 通用任务编排，DAG 思路同源但不管数据 hash
- [[mlflow]] —— 实验追踪侧重，和 DVC 经常搭配
- [[lakefs]] —— 数据湖层级的 Git 抽象，规模更大
- [[git-lfs]] —— 只解决大文件存储，DVC 的最小子集

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[mlflow]] —— MLflow — 端到端 ML 生命周期

