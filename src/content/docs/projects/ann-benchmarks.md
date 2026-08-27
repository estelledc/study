---
title: ANN-Benchmarks — 近似最近邻算法的统一擂台
来源: https://github.com/erikbern/ann-benchmarks
日期: 2026-05-31
分类: 数据检索 / 基础设施
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/erikbern/ann-benchmarks
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2e081ad32c1eccab72dcb739ad886c310b90f715
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2e081ad32c1eccab72dcb739ad886c310b90f715
---

## 是什么

ANN-Benchmarks 是 Erik Bernhardsson 等人维护的一套 **ANN 算法对照脚手架**：同一份 HDF5 数据集、同一套 `BaseANN` 接口、默认一个算法一个 Docker 镜像。日常类比：它不卖跑鞋，只提供同一条跑道和同一套计时规则。

固定提交 `2e081ad3...`（2026-07-10）的第一句是：**仓库不再积极维护**，并建议把新工作投到 [VIBE](https://github.com/vector-index-bench/vibe)。仓库没有 release tag。许可是 MIT。

它做三件事：`install.py` 编镜像，`run.py` 跑定义，`plot.py` 默认画 `k-nn`（Recall）对 `qps`。

## 为什么重要

不理解这套脚手架的合同，向量检索对比会把“别人的图”读成“你的生产数字”：

- 默认查询宽度是 `-k/--count=10`，不是数据集里预计算的 top-100 邻居本身
- `--parallelism` 是并行容器数，不是算法内部线程数
- 带 `WHERE` 的过滤检索、十亿级磁盘索引、排序质量（nDCG）都不在原则清单里
- 固定提交已经把维护责任交出去，不能再把它写成“持续官方黄金标准”

## 核心要点

固定源码可以拆成四条合同：

1. **接入面是目录，不是两个函数**：每个实现放在 `ann_benchmarks/algorithms/{name}/`，至少要有 `module.py`、`Dockerfile`、`config.yml`。`BaseANN` 要求 `fit(X)` 和 `query(q, n)`；`batch_query` 默认用 `ThreadPool` 去调 `query`。可选 `set_query_arguments` 用来扫查询超参。

2. **默认单 CPU，批量模式例外**：非 `--batch` 时 Docker `cpuset_cpus` 钉在单个 CPU 编号上；`--batch` 把查询一次交给实现，并占用全部 CPU，此时 `--parallelism` 必须为 1。`run.py` 默认 `--runs 5`（取最好一次）、`--timeout` 两小时、`--parallelism 1`、默认数据集 `glove-100-angular`。

3. **数据比“欧氏 / 角度”更宽**：`DATASETS` 里有 Euclidean / Angular / Hamming / Jaccard / dot，以及若干 `random-*` 和 `dbpedia-openai-*k-angular`。HDF5 预计算的是 top-100 邻居；`write_output(..., count=100)`。图默认 x=`k-nn`、y=`qps`，README 示例才把轴改成 logit / log。

4. **结果图不是本文的证据**：README 写“These are all as of April 2025”，机器是 `r6i.16xlarge`、`--parallelism 31`、关闭超线程，并强调 **all benchmarks are single-CPU**。本文不转述那些曲线上的 QPS 或名次。

## 实践示例

### 案例 1：看清默认入口

```bash
python run.py --dataset sift-128-euclidean --algorithm hnswlib
python plot.py --dataset sift-128-euclidean
```

`run.py` 只是调用 `ann_benchmarks.main:main`。第一次会按数据集名去 `https://ann-benchmarks.com/{name}.hdf5` 拉文件；失败才回落到本地生成函数。`install.py` 负责先把镜像编出来。

### 案例 2：给新算法接入口

```python
# ann_benchmarks/algorithms/my_algo/module.py
from ..base.module import BaseANN

class MyAlgo(BaseANN):
    def fit(self, X):
        ...
    def query(self, v, n):
        return [...]
```

还要补 Dockerfile、`config.yml` 超参网格，以及 `.github/workflows/benchmarks.yml` 的 CI 项。同仓的 Annoy 包装调用 `AnnoyIndex.add_item` / `build` / `get_nns_by_vector`，但 `config.yml` 里 `disabled: true`。

### 案例 3：读图时先读坐标名

```bash
python plot.py --dataset glove-100-angular --x-axis k-nn --y-axis qps
python plot.py --x-scale logit --y-scale log
```

默认就是 `k-nn` × `qps`。另外还有 `epsilon` / `rel` / `p50` / `p95` 等指标；没有 nDCG，也没有带过滤条件的召回。

## 踩过的坑

1. **把 `--parallelism 31` 读成“算法用 31 线程”**：那是同时跑 31 个容器；每个容器默认仍钉单核。
2. **把预计算的 100 个邻居当成默认评测宽度**：跑和画的默认 `count` 都是 10。
3. **把仓库写成仍在集中维护**：固定提交把状态改成 unmaintained，并指向 VIBE。
4. **拿跨年截图直接拼接**：原则写明 Docker / BLAS / 镜像会漂；README 自己还留着 “TODO: update plots on ann-benchmarks.com”。
5. **以为 Annoy 包装默认会进下一轮全量跑**：固定 `annoy/config.yml` 的 float/bit 两组都是 `disabled: true`。

## 适用 vs 不适用场景

**适用**：

- 复现或阅读“同数据、默认同单核、Docker 隔离”的 ANN 对照流程
- 给新实现接 `BaseANN` 并提交超参网格
- 教学：把召回和 QPS 当成一对可切换的坐标，而不是一句口号

**不适用**：

- 评估带 filter 的混合查询、十亿级磁盘索引、多租户或更新删除成本
- 把 README 里 April 2025 的图当成你机器上的数字
- 需要一个仍在积极收 PR 的维护入口——固定提交指向 VIBE
- 把静态阅读写成“已经跑完 sift / glove”

## 固定版本边界

- 本文绑定 `erikbern/ann-benchmarks@2e081ad32c1eccab72dcb739ad886c310b90f715`。该提交没有 tag；`gh` 可见的默认分支 tip 即此 SHA。
- LICENSE 为 MIT，版权年 2018，作者行写 Erik Bernhardsson。
- 设计原则与可复现协议见 Aumüller / Bernhardsson / Faithfull 的 Information Systems 2019 文与后续 reproducibility protocol；本文未复跑实验。
- 十亿级对照被原则清单指向 [big-ann-benchmarks](https://github.com/harsha-simhadri/big-ann-benchmarks)。GPU 只提到 FAISS，且必须本地编译并加 `--local --batch`。
- 未安装依赖、未拉 HDF5、未启动 Docker，状态保持 `UNVERIFIED`。

## 学到什么

1. **公平对照首先钉住 CPU 与数据，而不是钉住库名**。
2. **接口目录 + Docker + `config.yml` 比“两个函数”更接近真实接入成本**。
3. **默认图画的是 count=10 的召回对 QPS，不是生产 SLA**。
4. **维护状态也是合同**：unmaintained 提交不能再被写成活着的官方擂台。

## 应用型自测

1. 固定提交还把 ANN-Benchmarks 写成活跃维护中吗？
2. `--parallelism 31` 会让单个算法用 31 个线程吗？
3. `plot.py` 默认横轴是不是“数据集里那 100 个真邻居的全量召回”？

检查点：

1. 不是。README 首段写 no longer actively maintained，并指向 VIBE。
2. 不会。那是并行容器数；非 batch 时每个容器 `cpuset_cpus` 钉单核。
3. 不是。默认 `--count 10`，横轴是 `k-nn`（该 count 下的 Recall）。

## 延伸阅读

- 固定源码：[erikbern/ann-benchmarks](https://github.com/erikbern/ann-benchmarks) —— 本文绑定提交 `2e081ad32c1eccab72dcb739ad886c310b90f715`
- 维护接替建议：[vector-index-bench/vibe](https://github.com/vector-index-bench/vibe)
- 设计论文：Aumüller, Bernhardsson, Faithfull, [ANN-Benchmarks](https://arxiv.org/abs/1807.05614)
- 十亿级对照：[harsha-simhadri/big-ann-benchmarks](https://github.com/harsha-simhadri/big-ann-benchmarks)
- [[annoy]] —— 同作者的只读森林索引
- [[faiss]] / [[hnswlib]] / [[pgvector]] —— 常见被包装的实现，不是本仓库的运行证据

## 关联

- [[annoy]] —— 只读 mmap 森林，本仓有包装但默认 disabled
- [[faiss]] —— 原则里提到的少数带 GPU 路径的库
- [[hnswlib]] —— HNSW 参考实现
- [[pgvector]] —— PostgreSQL 向量扩展
- [[milvus]] —— 独立向量数据库，不能把本仓曲线外推过去

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[salton-vsm-1975]] —— Salton VSM 1975 — 把文档变成向量再用余弦比相似度
- [[faiss]] —— FAISS — 向量检索的标准件库
- [[hnswlib]] —— hnswlib — HNSW 论文作者写的参考实现，业界向量库都基于它
- [[lancedb]] —— LanceDB — 嵌入式向量库（进程内 + 对象存储）
- [[lm-evaluation-harness]] —— lm-evaluation-harness — LLM 基准评测底座
- [[locust]] —— Locust — 用 Python 写压测脚本的分布式负载工具
