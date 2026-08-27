# Annoy + ANN-Benchmarks source review (writer FP)

> 用途：记录 `annoy` 与 `ann-benchmarks` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fp` 标记 2026-08-27 平行 writer FP，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：固定提交静态源码与测试/配置阅读
- not executed：未编译 Annoy 扩展，未跑 `nosetests`，未 `pip install` 任一仓库，未下载 HDF5，未启动 Docker，未调用 `run.py` / `plot.py`，未测 QPS / 召回 / mmap 缺页
- worktrees：本机 `research-worktrees/`（gitignored），blob-filtered 浅克隆，不进入 Git
- slugs：`annoy`、`ann-benchmarks`；npm 同名 `annoy` 指向 `jimkang/annoy-node`，不是本页 canonical

## Annoy

- canonical source：`https://github.com/spotify/annoy`
- tag：`v1.17.3`（lightweight tag）
- revision：`75429e5dc930754698f1d37c44ea189a7521c7a3`
- package：`setup.py` `name='annoy'` `version='1.17.3'`，Apache-2.0
- also observed：`main` tip `379f744667aba6b40ba3db8a07678df173a88f74`（2025-10-29，Python 3.13 wheel；未绑定）
- inspected：
  - `README.rst`
  - `setup.py`
  - `LICENSE`
  - `annoy/__init__.py`
  - `src/annoylib.h`
  - `src/annoymodule.cc`
  - `examples/simple_test.py`
  - `test/on_disk_build_test.py`
- observed：
  - Python 入口是 `from .annoylib import Annoy as AnnoyIndex`；度量字符串为 `angular` / `euclidean` / `manhattan` / `hamming` / `dot`；
  - `Angular::distance` 计算 `2-2cos`，`normalized_distance` 再 `sqrt`；Hamming 把 float 阈值打成 `uint64_t`，`create_split` 选 bit 而不是超平面；
  - `_K` 由 `_s = offsetof(Node, v) + f * sizeof(T)` 推出，不是常量 30；
  - `create_split` 对 angular/euclidean/manhattan 走 `two_means`（最多 200 步），不是 README 那句“只抽两点做中垂面”；
  - `build(q)` 在 `q == -1` 时加树直到 `_n_nodes >= 2 * _n_items`；`search_k == -1` 时为 `n * n_trees`；
  - `add_item` 对 loaded index 失败；`build` 不能对已 built / loaded 的索引再跑；`on_disk_build` 必须在加点之前。

## ANN-Benchmarks

- canonical source：`https://github.com/erikbern/ann-benchmarks`
- tag：无 release / tag
- revision：`2e081ad32c1eccab72dcb739ad886c310b90f715`（`main` tip，2026-07-10）
- license：MIT，版权行 2018 Erik Bernhardsson
- inspected：
  - `README.md`
  - `LICENSE`
  - `run.py`
  - `plot.py`
  - `ann_benchmarks/main.py`
  - `ann_benchmarks/runner.py`
  - `ann_benchmarks/datasets.py`
  - `ann_benchmarks/plotting/metrics.py`
  - `ann_benchmarks/algorithms/base/module.py`
  - `ann_benchmarks/algorithms/annoy/module.py`
  - `ann_benchmarks/algorithms/annoy/config.yml`
- observed：
  - README 首段宣布 no longer actively maintained，并指向 `vector-index-bench/vibe`；
  - `BaseANN` 约定 `fit` / `query`；`batch_query` 默认 `ThreadPool`；接入目录要 `module.py` + `Dockerfile` + `config.yml`；
  - `run.py` 默认数据集 `glove-100-angular`、`--count 10`、`--runs 5`、timeout 2h、`--parallelism 1`；
  - 非 `--batch` 时 Docker `cpuset_cpus` 钉单核；`--batch` 占用全部 CPU 且禁止 parallelism>1；
  - `plot.py` 默认 x=`k-nn`、y=`qps`；HDF5 预计算 top-100；`DATASETS` 含 Euclidean / Angular / Hamming / Jaccard / dot 以及 `dbpedia-openai-*`；
  - 同仓 Annoy 包装存在，但 `config.yml` 两组均为 `disabled: true`；
  - README 引用 April 2025 / `r6i.16xlarge` / `--parallelism 31` 的图，本文不把那些数字写进项目页。
