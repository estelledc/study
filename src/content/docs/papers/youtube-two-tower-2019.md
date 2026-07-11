---
title: YouTube 双塔召回 — 把 DSSM 搬进推荐并补上两件工业关键
来源: Yi et al., "Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations", RecSys 2019
日期: 2026-05-31
分类: 信息检索
难度: 中级
---

## 是什么

YouTube 双塔召回是一种**让推荐系统从十亿级视频库里几毫秒挑出几百个候选**的检索模型。日常类比：图书馆有十亿本书，馆员不可能一本本翻；他先按"主题区"快速圈出几百本，再交给精排员细看。这一步"快速圈一片"就是召回。

做法说穿了三步：

- 用户历史塞进 user 塔，吐出一个向量 u
- 每个候选视频塞进 item 塔，吐出一个向量 v
- 打分就是内积 `<u, v>`，再用近邻搜索（ANN，近似最近邻——像在地图上找最近的店，不必量遍全城）取 top-K

真正让它成为工业事实标准的，不是双塔本身（DSSM 2013 就有了），而是两件**工业关键**：**in-batch negative** 与 **采样频次纠偏（logQ）**。

## 为什么重要

不理解这篇，下面这些事都讲不清楚：

- 为什么短视频、电商、音乐 App 的"猜你喜欢"几乎都长一个样——双塔召回 + ANN 检索
- 为什么训练时不显式准备负样本却能学得动——in-batch negative 的妙用
- 为什么热门视频不会"一直被打高分淹没冷门"——靠 logQ 纠偏把热度信号扣掉
- 为什么 RAG（检索增强生成）社区里的"in-batch + temperature"几乎是默认配方——直接学这篇

一句话：**把双塔从搜索搬到推荐，并让它在十亿级语料上训得动、跑得快、不偏热门**。

## 核心要点

1. **双塔 + 离线建库**：user / item 两侧特征空间不同，所以两塔参数**不共享**；item 塔与 user 解耦后，可离线把全部 item 向量算好建索引，在线只算一次 user 向量。类比：书的标签可以提前贴好，读者进门再量一次偏好。

2. **in-batch negative**：batch 里 B 个 (user, item+) 配对，每个 user 的正样本是自己那个 item，**其余约 B-1 个 item 当负样本**。一次前向就拿到近 B 个负样本，吞吐量大涨。类比：同桌考试互相当陪考，不必另请一教室人。

3. **采样频次纠偏（logQ）**：热门 item 更常进 batch、更常当负样本，会被持续压分。修法：logit 减去 `log p_j`（p_j 是 item j 出现概率）。类比：总被点名批评的明星，打分时先加回"被点名过多"的补偿。

4. **p_j 流式估计**：哈希表记每个 item 上次出现的步数差 Delta，估 `p_j ≈ 1/Delta`。向量常做 L2 归一（把长度压成 1，只比方向），再除以温度 tau（常 0.05–0.1，像把对比度拧紧）；loss 用 softmax（把一排分数收成概率再交叉熵）。

## 实践案例

### 案例 1：in-batch 一次算出整张打分表

```python
# U, V: [B, d]，已 L2 归一；对角是正样本
logits = (U @ V.T) / tau          # [B, B]
loss = cross_entropy(softmax(logits), labels=range(B))
```

**逐部分解释**：

- `U @ V.T`：第 i 行是 user_i 对 batch 内所有 item 的内积
- 对角 `logits[i,i]` 是正样本；其余约 B-1 格是免费负样本
- 相对"每 user 另抽 100 负例"，item 前向从约 `B×101` 降到 `B`，吞吐可高约两个数量级

### 案例 2：logQ 三步把热门抬回来

不纠偏时：热门 V_hot 几乎每 batch 都当别人的负样本 → 模型学会"总压低它" → 召回时反而出不来。

```python
logits = (U @ V.T) / tau - log(p)   # p[j] = item j 的采样概率
```

三步：

1. 先算内积 `/ tau`（温度越小，正负差距越尖锐）
2. 再减 `log(p_j)`：V_hot 的 p 大 → 减得更多 → 抵消"反复当负样本"的副作用
3. 看效果：采样里偏过的，在 logit 里补回来，热门不再被系统性压死

### 案例 3：用 Delta 流式估 p_j

```python
# t 为当前训练步；last[j] 上次见到 item j 的步
delta = t - last[j]      # 例：100 → 110，delta=10
p_j = 1.0 / delta        # ≈ 0.1；很久未见则 p_j 极小
last[j] = t
```

**逐部分解释**：不必预扫全库频次；新 item、热度漂移都能跟；一周没见再出现 → Delta 极大 → 别过度压它的分。

## 踩过的坑

1. **假负样本**：同 batch 两 user 点了同一 item 时，该 item 对一人是正、对另一人是负。落地：同 `item_id` 的 off-diagonal logit 置 `-inf` 再 softmax，否则梯度互打。
2. **温度 tau**：太大（如 1.0）学不出区分；太小（如 0.01）热门主导。常用 0.05–0.1，靠在线 A/B 调。
3. **冷启 item**：刚上传时 Delta 偏小、p_j 估高，logQ 过度补偿——工业上常给冷启单独通道。
4. **召回≠精排**：内积没有 user×item 交叉特征；精排仍需 Wide&Deep / DCN / DLRM。两塔显存也翻倍，常用 hash / 分桶压表。

## 适用 vs 不适用

**适用**：

- 候选库大（约 100 万–10 亿），在线 P99 要毫秒级（常见 < 20ms），可接受离线建库
- 用户与 item 都有可编码成向量的丰富特征

**不适用**：

- 候选库小（几千以内）——直接全量精排更准
- 强依赖复杂 user×item 交叉，或强冷启（新用户/新 item 占比高）

## 跟前辈与后辈的关系

- **DSSM 2013**：双塔源头，负样本与频次未工业化
- **Covington 2016**：YouTube 前代，softmax 扫全库，慢且吃显存
- **本篇 2019**：DSSM 进推荐 + in-batch + logQ → 工业事实标准
- **ANCE 2020**：把 random negative 换成 hard negative

## 历史小故事（可跳过）

- 2013：微软 DSSM 把双塔用在搜索点击数据
- 2016：YouTube Covington DNN，召回仍是全库 softmax
- 2018：内部发现热门被严重压制，开始做采样纠偏
- 2019：RecSys 公开方案；之后抖音、淘宝、Pinterest 等广泛跟进
- 2020 后：in-batch + temperature 被 RAG 社区原样借用

## 学到什么

1. **召回与精排是两件事**：召回要快且不漏，精排要准且排好序
2. **in-batch negative** 用一份前向换近 B 个负样本，几乎零额外开销
3. **采样偏差必须纠**：不纠则高频项被持续压制，分布失真
4. **工业三件套**：离线建库 + ANN + 在线单塔推理，是向量召回的标准骨架

## 延伸阅读

- 论文 PDF：[Yi et al. 2019](https://dl.acm.org/doi/10.1145/3298689.3346996)
- 视频：[Two-Tower Models in Industry](https://www.youtube.com/results?search_query=two+tower+recommendation)
- 复现：TensorFlow Recommenders 仓库有 in-batch + logQ 参考实现
- 衍生：user 塔换 Transformer、item 塔加多模态是常见改造
- [[dssm-2013]] —— 双塔思想源头
- [[ance-2020]] —— hard negative 后续

## 关联

- [[dssm-2013]] —— 双塔思想的源头，本篇把它工业化到推荐
- [[ance-2020]] —— 把 random negative 换成 hard negative 的后续
- [[word2vec]] —— negative sampling 的思想前辈
- [[faiss-2017]] —— item 向量库常用的 ANN 索引
- [[hnsw-2018]] —— 另一种主流 ANN 算法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bert4rec-2019]] —— BERT4Rec — 把 BERT 的 MLM 搬进序列推荐做双向建模
- [[dlrm-2019]] —— DLRM — Meta 把工业推荐模型拆成 4 个标准积木
- [[koren-mf-2009]] —— Koren-Bell-Volinsky 2009 — 把推荐系统的 MF 写成 8 页教科书
- [[sasrec-2018]] —— SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐
- [[slim-2011]] —— SLIM — 让数据自己学一张稀疏的"看了又看"权重表
- [[wide-deep-2016]] —— Wide & Deep — 让模型同时学会"记住"和"举一反三"
