---
title: YouTube 双塔召回 — 把 DSSM 搬进推荐并补上两件工业关键
来源: Yi et al., "Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations", RecSys 2019
日期: 2026-05-31
分类: 信息检索
难度: 中级
---

## 是什么

YouTube 双塔召回是一种**让推荐系统从十亿级视频库里几毫秒挑出几百个候选**的检索模型。日常类比：图书馆里有十亿本书，你不可能让馆员一本本翻；他需要先按"主题区"快速圈出几百本，再交给精排员细看。这一步"快速圈一片"就是召回，YouTube 双塔是工业界跑这一步最普遍的方案。

它的做法说穿了一句话：

- 用户历史塞进 user 塔，吐出一个向量 u
- 每个候选视频塞进 item 塔，吐出一个向量 v
- 打分就是 `<u, v>`，再做近邻搜索取 top-K

但真正让它成为"事实标准"的不是双塔本身（DSSM 2013 就有了），而是这篇补上的两件**工业关键**：**in-batch negative** 与 **采样频次纠偏**。

## 为什么重要

不理解这篇，下面这些事都讲不清楚：

- 为什么短视频、电商、音乐 App 的"猜你喜欢"几乎都长一个样——双塔召回 + ANN 检索
- 为什么训练时不显式准备负样本却能学得动——in-batch negative 的妙用
- 为什么热门视频不会"一直被打高分淹没冷门"——靠 logQ 纠偏把热度信号扣掉
- 为什么 RAG（检索增强生成）社区里的"in-batch + temperature"几乎是默认配方——直接学这篇

一句话：**把双塔从搜索搬到推荐，并让它在十亿级语料上训得动、跑得快、不偏热门**。

## 核心要点

四件事撑起整篇论文：

1. **双塔 + 离线建库**：user 塔与 item 塔参数**不共享**，因为离线要把所有 item 向量预先算好建索引；user 向量在线算一次。共享了就没法预计算，秒级召回直接崩。

2. **in-batch negative**：同一个 mini-batch 里的 B 个 (user, item+) 配对，每个 user 的正样本是自己那个 item，**其他 B-1 个 item 全部当负样本**。一次前向就拿到 B 倍负样本，吞吐量爆炸。

3. **采样频次纠偏**：热门 item 在每个 batch 里更容易出现，被当负样本的次数也更多，于是被一直压低分数。修法是把 logit 减去 `log p_j`，p_j 是 item j 在 batch 里出现的概率。这就是 **logQ 校正**。

4. **p_j 在线流式估计**：不预先统计全库频次，用一个哈希表记录每个 item 上次出现的"训练步数差" Delta，估计 `p_j ≈ 1/Delta`。新 item、热度变化都能跟得上。

外加两个细节：向量做 L2 归一，再除以**温度** tau（常 0.05 到 0.1）；loss 用 softmax cross-entropy。

## 实践案例

### 案例 1：in-batch negative 怎么省

假设 batch size = 1024。

- 朴素做法：每个 user 显式抽 100 个负 item → 一次 forward 算 1024 × 101 个 item 向量
- in-batch：每个 user 用 batch 里**其他 1023 个 item** 当负样本 → 一次 forward 只算 1024 个 item 向量

吞吐量提升约 100 倍，且负样本"免费送"。

### 案例 2：为什么需要 logQ 纠偏

不纠偏会出什么问题：

- 热门视频 V_hot 每个 batch 都出现 → 当别人负样本的概率 ≈ 1
- 模型学到："V_hot 总是负的，把它压低"
- 推荐时 V_hot 永远召回不出来——可这恰恰是大家最想看的

加上 logQ 后：

```
score(u, v) = <u, v> / tau - log(p_v)
```

V_hot 的 p_v 大 → 减一个大数 → 抵消"被反复当负样本"的副作用。等价于"在采样里偏过的，得在 logit 里补回来"。

### 案例 3：流式估计 p_j 的窍门

不用全局计数器，而是记录"上次见到 item j 是第几步"：

- t = 100 时见到 j → 记录 last[j] = 100
- t = 110 又见到 j → Delta = 10 → p_j 估计 ≈ 1/10
- 一周没见 j 再见到 → Delta 极大 → p_j 极小（即"基本没人看，别压它分"）

这种估计**自适应热度漂移**，新 item 和老 item 都能用同一套。

## 踩过的坑

1. **in-batch 里"假负样本"**：两个 user 凑巧看了同个 item（V），这个 V 同时是 user_A 的正样本和 user_B 的负样本。需要 mask 掉这种 false negative，否则梯度互相打架。

2. **温度 tau 调不好整体崩**：太大（如 1.0）梯度平滑，模型学不出区分；太小（如 0.01）梯度尖锐，热门样本主导。常用 0.05 到 0.1，得在线 A/B 调。

3. **冷启 item 估计偏低**：刚上传的 item Delta 一开始很小（常常出现），p_j 被估高，logQ 反而过度补偿。工业上常给冷启 item 单独通道。

4. **召回不能直接当精排**：dot product 没有 user × item 交叉特征，对"这个 user 此时此地的偏好微调"无能为力。这篇只解决召回，精排还得另起 DNN（如 Wide&Deep / DCN / DLRM）。

5. **两塔显存翻倍**：参数不共享意味着两套 embedding 表都要训，video id 表动辄上亿条，显存压力大。工业上常用 hash trick 或分桶压缩。

## 适用 vs 不适用

**适用**：

- 候选库大（百万到十亿），需要从中挑 top-K 的召回阶段
- 用户与 item 都有丰富特征可以编码成向量
- 在线响应延迟要求高（毫秒级），可以接受离线建库

**不适用**：

- 候选库小（几千以内）——直接跑全量精排更准
- 需要复杂 user × item 交叉特征——dot product 表达不够
- 强冷启场景（新用户、新 item 多）——双塔依赖历史特征

## 跟前辈与后辈的关系

- **DSSM 2013（搜索）**：双塔思想的源头，但负样本和频次都没工业化
- **Covington 2016 YouTube DNN**：YouTube 推荐前一代，用 softmax over all videos，慢且占显存
- **本篇 2019**：把 DSSM 搬进推荐 + in-batch + logQ 纠偏 → 工业事实标准
- **ANCE 2020**：把 in-batch random negative 换成 hard negative（最近邻里挑），更难但更准

## 历史小故事（可跳过）

- 2013 年微软 DSSM 把双塔思路用在搜索点击数据上
- 2016 年 YouTube 出了 Covington 的 DNN 推荐论文，但召回还是 softmax 全库
- 2018 年内部发现热门视频被严重压制，开始研究采样纠偏
- 2019 年 RecSys 论文公开方案，之后两年抖音、淘宝、Pinterest 全跟进
- 2020 年后 in-batch + temperature 这套配方被 RAG 社区原样借用

## 学到什么

1. **召回与精排是两种不同问题**：召回追求"快 + 不漏掉"，精排追求"准 + 排好序"。双塔只解前者
2. **in-batch negative 是吞吐量魔法**：一份前向算出 B 个负样本，几乎零开销
3. **采样偏差必须纠**：不纠的话频次高的样本会被持续压制，整个分布失真
4. **流式估计 + 哈希计数** 是处理动态语料频次的通用招式，不局限于推荐
5. **工业落地三件套**：离线建库 + ANN 检索 + 在线单塔推理 → 现在所有向量召回的标准架构

## 一句话回顾这篇为什么是事实标准

- 双塔结构本身不新（DSSM 2013 已有），新的是把它工业化到十亿级推荐场景
- in-batch negative 让"训得动"：吞吐量从 O(N) 压到 O(B)
- logQ 纠偏让"训得准"：不再被高频项淹没
- 流式 p_j 估计让"训得稳"：自适应热度变化，不需要预扫一遍全库
- 离线建库 + 在线单塔 让"跑得快"：毫秒级召回的工程范式

四件事缺一件，这套就立不住。后续所有"向量召回"的工业落地几乎都在重复这个模板。

## 延伸阅读

- 论文 PDF：[Yi et al. 2019](https://dl.acm.org/doi/10.1145/3298689.3346996)
- 视频解读：[Two-Tower Models in Industry](https://www.youtube.com/results?search_query=two+tower+recommendation)
- 复现项目：TensorFlow Recommenders 官方仓库里有 in-batch 加 logQ 的参考实现
- 衍生方向：把 user 塔换 Transformer、item 塔加多模态特征都是常见改造

## 关联

- [[dssm-2013]] —— 双塔思想的源头，本篇把它工业化到推荐
- [[ance-2020]] —— 把 random negative 换成 hard negative 的后续
- [[word2vec]] —— negative sampling 的思想前辈
- [[faiss-2017]] —— item 向量库常用的 ANN 索引
- [[hnsw-2018]] —— 另一种主流 ANN 算法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dlrm-2019]] —— DLRM — Meta 把工业推荐模型拆成 4 个标准积木
- [[faiss-2017]] —— FAISS 2017 — 用 GPU 在十亿向量里找最近邻
- [[hnsw-2018]] —— HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)
- [[koren-mf-2009]] —— Koren-Bell-Volinsky 2009 — 把推荐系统的 MF 写成 8 页教科书
- [[sasrec-2018]] —— SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐
- [[slim-2011]] —— SLIM — 让数据自己学一张稀疏的"看了又看"权重表
- [[wide-deep-2016]] —— Wide & Deep — 让模型同时学会"记住"和"举一反三"
- [[word2vec]] —— Word2Vec — 词向量奠基

