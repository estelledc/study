---
title: Annoy — Spotify 的随机森林近似最近邻索引
来源: https://github.com/spotify/annoy
日期: 2026-06-01
分类: 信息检索 / 向量索引
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/spotify/annoy
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 75429e5dc930754698f1d37c44ea189a7521c7a3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.17.3
---

## 是什么

Annoy（**Approximate Nearest Neighbors Oh Yeah**）是 Spotify 的 C++ 近似最近邻库，Python 绑定从 `annoy.annoylib` 再导出成 `AnnoyIndex`。日常类比：先按不同切法把书架分成许多小格，查询时每棵树只摸几格，再对摸到的书精确比距离。

固定 `1.17.3`（tag `v1.17.3` → `75429e5d...`）把整片森林写成只读文件，`load()` 走 `mmap`，多个进程可以共享同一份索引。`setup.py` 声明 Apache-2.0，包名 `annoy`；npm 上的同名包指向另一个仓库，不是这份源码。

```python
from annoy import AnnoyIndex

t = AnnoyIndex(40, "angular")
t.add_item(0, [0.1] * 40)
t.build(10)
t.save("test.ann")
```

## 为什么重要

不理解这份只读森林合同，下面这些事会对不上：

- 为什么 `build()` 或 `load()` 之后不能再 `add_item`
- 为什么 item id 必须是非负整数，而且会按 `max(id)+1` 预分配
- 为什么 README 写“随机取两点做中垂面”，源码实际走的是 `two_means`
- 为什么 `angular` 的 Python 距离不是余弦本身，而是 `sqrt(2-2cos)`

## 核心要点

固定版本可以拆成四层：

1. **五种度量**：构造时选 `"angular"` / `"euclidean"` / `"manhattan"` / `"hamming"` / `"dot"`。`angular` 在 C++ 里存 `2-2cos`，Python `get_distance` 再开方；`hamming` 把 float 阈值打成 `uint64_t` 后按位计数，切分是轴对齐的；`dot` 用 Bachrach 等人的方法把内积空间折到更适合查询的余弦空间。

2. **叶子容量 `_K` 随维度算出来**：节点大小 `_s = offsetof(Node, v) + f * sizeof(T)`，`_K = (_s - offsetof(Node, children)) / sizeof(S)`。叶子不是写死的“大约 30 个点”，而是“向量槽位还能塞多少个 descendant id”。

3. **建树不是只抽两点**：`Angular` / `Euclidean` / `Manhattan` 的 `create_split` 调用 `two_means`——先随机挑两个种子，再做最多 200 步加权更新，超平面取两个中心之差。切得太偏（imbalance ≥ 0.95）会重试最多 3 次，仍失败就随机分边。`build(q)` 在 `q == -1` 时一直加树，直到节点数至少是 item 数的两倍。

4. **查询用优先队列合并多棵树**：`search_k == -1` 时默认 `n * n_trees`。队列吐出最多 `search_k` 个候选后，按 id 去重再精确算距离。`n_trees` 管索引体积，`search_k` 管这次走多深；README 写两者大致可独立调。

## 实践示例

### 案例 1：建树、落盘、mmap 再查

```python
from annoy import AnnoyIndex
import random

f = 40
t = AnnoyIndex(f, "angular")
for i in range(1000):
    t.add_item(i, [random.gauss(0, 1) for _ in range(f)])

t.build(10)          # 10 棵树；n_jobs 默认 -1，尽量用满核
t.save("test.ann")   # save 之后也不能再加点

u = AnnoyIndex(f, "angular")
u.load("test.ann")   # 默认 prefault=False，按页调入
print(u.get_nns_by_item(0, 5))
```

**逐部分解释**：`add_item` 只接受非负整数 id。`load(..., prefault=True)` 会用 `MAP_POPULATE` 预读整文件；默认是按需缺页。

### 案例 2：查询时放大 search_k

```python
t.get_nns_by_item(0, 100)                   # search_k 默认 10 * 100
t.get_nns_by_item(0, 100, search_k=10000)
t.get_nns_by_vector(query, 10, include_distances=True)
```

先改查询参数再决定要不要重建。`include_distances=True` 返回 `(ids, distances)` 二元组。

### 案例 3：磁盘上建大索引

```python
t = AnnoyIndex(40, "euclidean")
t.on_disk_build("big.ann")   # 必须在 add_item 之前
# ... add_item ...
t.build(50)                  # 不必再 save
```

`on_disk_build` 把节点缓冲映射到指定文件，避免整片森林先装进 RAM。

## 踩过的坑

1. **把叶子写成固定 K≈30**：`_K` 跟维度和节点布局走，40 维 float 大约是 42，不是政策参数。
2. **把 README 的“两点中垂面”当成实现**：实现是 `two_means` 启发式；Hamming 更是随机选 bit。
3. **把 `angular` 距离读成余弦值**：Python 层看到的是 `sqrt(2-2cos)`。距离 1.4 并不等于“很不像”。
4. **以为 `save` 之后还能增量加向量**：`build`、`save`、`load` 都会把索引锁成只读；`add_item` 对 loaded index 直接报错。
5. **把 npm `annoy` 或后继 commit 当成 1.17.3**：npm 同名包是 `jimkang/annoy-node`。`main` 在 2025-10 还有 Python 3.13 wheel 提交，本文不绑定那些行为。

## 适用 vs 不适用场景

**适用**：

- 向量集可以离线重建，查询端只要 mmap 一份静态文件
- 多进程共享同一索引，不想每个 worker 各拷一份
- 需要在本机用 `on_disk_build` 处理装不进 RAM 的建树

**不适用**：

- 必须在线增删向量——固定源码没有可变图结构
- 把 README 的“<100 维更好、到 1000 维也还行”写成你的召回保证
- 需要把未运行的 QPS / 召回曲线写成选型结论
- 把 1.17.3 之后的 wheel / CI 改动外推到这个 tag

## 固定版本边界

- 本文绑定 `spotify/annoy@75429e5dc930754698f1d37c44ea189a7521c7a3`，lightweight tag `v1.17.3`，`setup.py` 版本 `1.17.3`。
- 分类器列到 CPython 3.9；README 仍写测试过 2.7 / 3.6 / 3.7。未安装扩展、未跑 `nosetests`。
- 上游 `main` 在此 tag 之后还有提交（含 2025-10 的 Python 3.13 支持 PR）；那些行为不在本文范围。
- 本文未测 mmap 缺页、多进程共享或任何 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **只读文件 + mmap 是一等设计，不是附赠优化**——创建与查询被刻意拆开。
2. **叶子大小是内存布局推出来的，不是调参旋钮**。
3. **文档直觉和实现启发式会分叉**——要以 `two_means` / Hamming bit split 为准。
4. **查询精度先动 `search_k`，再建更多树**——前者不用重建索引。

## 应用型自测

1. `t.build(10)` 之后还能 `t.add_item(1001, v)` 吗？
2. 叶子容量是不是固定约 30？
3. Python `get_distance` 在 `angular` 下返回的是余弦值吗？

检查点：

1. 不能。`_built` 后不能再加点；`load` 后也不行。
2. 不是。`_K` 由节点里向量槽位能塞多少 descendant id 决定。
3. 不是。C++ 存 `2-2cos`，Python 再 `sqrt`。

## 延伸阅读

- 固定源码：[spotify/annoy](https://github.com/spotify/annoy) —— 本文绑定提交 `75429e5dc930754698f1d37c44ea189a7521c7a3`
- 作者说明：[Nearest Neighbors and Vector Models, Part 2](https://erikbern.com/2015/10/01/nearest-neighbors-and-vector-models-part-2-how-to-search-in-high-dimensional-spaces.html)
- 同作者擂台：[[ann-benchmarks]] —— 固定提交已写明不再积极维护
- [[hnsw]] —— 图导航路线，不要把未绑定曲线写成“一定更快”
- [[faiss]] —— 多索引家族，部署合同不同

## 关联

- [[ann-benchmarks]] —— 统一 ANN 接口与 Docker 跑法
- [[hnsw]] —— 分层小世界图
- [[faiss]] —— IVF / PQ / HNSW 等可选内核
- [[bentley-1975-kdtree]] —— 轴对齐精确划分的对照
- [[ance-2020]] —— 用 ANN 做检索训练

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hnswlib]] —— hnswlib — HNSW 论文作者写的参考实现，业界向量库都基于它
