---
title: PointNet — 直接吃点云的 3D 神经网络
来源: 'Charles R. Qi, Hao Su, Kaichun Mo, Leonidas J. Guibas, "PointNet: Deep Learning on Point Sets for 3D Classification and Segmentation", CVPR 2017'
日期: 2026-07-09
分类: 计算机视觉
难度: 中级
---

## 是什么

PointNet 是一套让神经网络**直接读取 3D 点云集合**的方法，不先把物体塞进 voxel 格子，也不先渲染成很多张 2D 图片。

日常类比：你想认出桌子，不一定要先把桌子装进一排排小抽屉；你也可以直接看桌面边角、腿、轮廓这些关键点。PointNet 做的事类似：直接看一堆无序的 3D 点，然后判断这是椅子、桌子，或给每个点贴上“椅背”“椅腿”这样的标签。

这里的难点是“点云没有天然顺序”。同一个物体的 1024 个点，换一种排列顺序，本质还是同一个物体；模型不能因为输入顺序变了就改答案。

PointNet 的核心答案很朴素：每个点先独立过同一套小网络，再用 `max pooling` 这种对顺序不敏感的函数，把所有点汇总成一个全局特征。

## 为什么重要

不理解 PointNet，下面这些事都没法解释：

- 为什么 3D 深度学习不一定非要先 voxel 化，而可以把点云当成集合来学
- 为什么“点的顺序不能影响结果”是点云模型的第一约束，不是工程小细节
- 为什么一个简单的 `shared MLP + max pooling` 能同时做分类、零件分割和室内场景语义分割
- 为什么模型丢掉一部分非关键点后还能工作，因为最大池化只依赖一批 critical points

## 核心要点

PointNet 可以拆成 **三件事**：

1. **每个点用同一把尺子量**：对每个点都跑同一个 MLP。类比：质检员用同一套标准检查每个零件，不因为零件排在第几个就换标准。

2. **用对称函数收口**：把所有点特征用 max pooling 汇成一个向量。类比：全班考试取每道题的最高分，学生顺序怎么排都不影响最高分。

3. **分类看整体，分割还要看局部**：分类只需要全局特征；分割要把全局特征再拼回每个点。类比：判断“这是椅子”看整体轮廓，判断“这个点是椅腿”还要知道它在整个椅子里的位置。

PointNet 还加了 T-net 对齐模块，让输入点或中间特征先转到更统一的姿态，再交给主网络处理。

## 实践案例

### 案例 1：为什么 max pooling 不怕点顺序

```python
points = [(0, 1), (2, 3), (1, 5)]

def h(p):
    x, y = p
    return [x + y, x - y]

features = [h(p) for p in points]
global_feature = [max(v[i] for v in features) for i in range(2)]
print(global_feature)  # [6, -1]
```

**逐部分解释**：

- `h(p)` 像 PointNet 里的共享 MLP，把每个点变成特征
- `max(...)` 对所有点取最大值，点的输入顺序变了，结果仍然一样
- `global_feature` 就是全局形状签名，后面可以接分类器

### 案例 2：分割为什么要把整体信息拼回每个点

```python
local = [[0.2, 0.8], [0.7, 0.1], [0.4, 0.5]]
global_feature = [max(col) for col in zip(*local)]

per_point = []
for feat in local:
    per_point.append(feat + global_feature)

print(per_point[0])  # [0.2, 0.8, 0.7, 0.8]
```

**逐部分解释**：

- `local` 是每个点自己的局部特征
- `global_feature` 是整件物体的摘要
- 拼接后，每个点既知道“我附近长什么样”，也知道“我属于哪种整体形状”

### 案例 3：critical points 为什么能解释鲁棒性

```python
points = [1, 2, 3, 10]
summary = max(points)

without_small = [2, 3, 10]
without_key = [1, 2, 3]

print(max(without_small) == summary)  # True
print(max(without_key) == summary)    # False
```

**逐部分解释**：

- 最大池化只关心触发最大值的那些点
- 删除非关键点，摘要不变；删除关键点，摘要才会变
- 论文把这类决定全局特征的点叫 critical point set

## 踩过的坑

1. **把点云当数组序列理解**：原因是数组有顺序，但点云集合没有顺序，模型必须对排列不变。

2. **以为 PointNet 会显式建邻域**：原因是原版 PointNet 主要靠逐点 MLP 和全局池化，局部邻域结构不是它的强项。

3. **以为 max pooling 只是降维技巧**：原因是它承担了“对称函数”的角色，保证换顺序不换答案。

4. **只看分类准确率忽略分割设计**：原因是分类只要全局特征，分割还必须把全局语义反馈给每个点。

## 适用 vs 不适用场景

**适用**：

- 3D 物体分类：输入一组点，输出“椅子”“桌子”等类别
- 物体零件分割：给每个点标注“椅背”“椅腿”“桌面”等部件
- 室内场景语义分割：给房间点云里的点标注墙、地板、椅子、桌子
- 需要快速处理点云、且希望避免 voxel 立方级计算开销的场景

**不适用**：

- 需要精细建模局部邻域关系的任务，原版 PointNet 容易漏掉近邻结构
- 点密度极不均匀、采样噪声很重且训练时没见过类似噪声的场景
- 必须保留完整曲面拓扑关系的任务，点云集合本身不表达边和面
- 只处理规则 2D 图像的任务，普通 CNN 的局部卷积更自然

## 历史小故事（可跳过）

- **2015 年前后**：3D 深度学习常把形状变成 voxel 或多视角图片，再套 CNN。
- **2016 年**：PointNet 预印本提出“直接吃点云”，重点解决无序集合输入。
- **2017 年**：论文在 CVPR 发表，成为点云深度学习的经典起点。
- **之后几年**：PointNet++ 等后续工作补上局部邻域建模，让点云网络更适合细粒度场景。

## 学到什么

- 点云的第一性质是“集合”，不是“列表”；所以模型设计先要解决排列不变性。
- `shared MLP + max pooling` 看起来简单，却把“逐点观察”和“全局汇总”接了起来。
- T-net 的作用是把几何姿态先对齐，减少模型被旋转、平移这类变化干扰。
- critical point set 让 PointNet 的鲁棒性可解释：真正决定全局特征的是少量关键点。

## 延伸阅读

- 论文 PDF：[PointNet arXiv PDF](https://arxiv.org/pdf/1612.00593v2.pdf)（原文，重点看 Fig. 2 和实验表）
- DOI 页面：[CVPR 2017 版本](https://doi.org/10.1109/cvpr.2017.16)（paper-context 显示引用数约 9791）
- [[multi-view-convolutional-neural-networks-3d-shape-2015]] —— PointNet 对比的多视角 3D 识别路线
- [[spectral-networks-locally-connected-networks-graphs-2013]] —— 另一条把非规则结构交给神经网络的早期路线
- [[blensor-blender-sensor-simulation-toolbox-2011]] —— 论文用来模拟不完整 Kinect 扫描的工具来源

## 关联

- [[gcn-2017]] —— 图卷积也处理非规则结构，但它显式使用边关系
- [[gat-2018]] —— 注意力图网络用邻居权重建模，补的是 PointNet 缺的局部关系
- [[graphormer-2021]] —— 把图结构送进 Transformer，和点云集合建模同属非规则输入问题
- [[newcombe-2011-kinectfusion]] —— 代表 3D 扫描重建方向，PointNet 可消费这类扫描产生的点云
- [[park-2019-deepsdf]] —— 另一种 3D 表示，把形状存在连续隐式函数里
- [[3d-gaussian-splatting]] —— 现代 3D 表示路线，关注点从分类分割转向可渲染场景表达
- [[curless-levoy-1996-tsdf]] —— 传统 3D 融合表示，和直接点集学习形成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[autonomous-driving-waymo-2021]] —— Waymo Open Dataset — 自动驾驶感知的共同训练场
