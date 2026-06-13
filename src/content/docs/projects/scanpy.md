---
title: Scanpy 零基础入门笔记
来源: https://github.com/scverse/scanpy
日期: 2026-06-13
分类: 机器学习
子分类: 生物信息
provenance: pipeline-v3
---

# Scanpy 零基础入门笔记

## 一、Scanpy 是什么？

想象你手里有一张巨大的表格：每一行代表一个细胞，每一列代表一个基因，表格里填的是每个细胞里这个基因的表达量（可以理解为"这个基因在这个细胞里有多活跃"）。

单细胞测序技术（scRNA-seq）就是这样一张表——但它可能大到离谱。比如一个样本就有 100 万个细胞、3 万多个基因，表格总共有 300 亿个格子。

Scanpy 就是专门用来处理这种超大表格的 Python 工具库。它的名字来源于 "Single-cell Analysis in Python"。

核心特点：
- 能处理超过 1 亿个细胞的数据
- 包含数据预处理、可视化、聚类、轨迹推断、差异表达分析等全套流程
- 与 AnnData 数据结构深度集成

## 二、核心概念

### 1. AnnData 对象 —— Scanpy 的心脏

AnnData 是一个专门盛放单细胞数据的"智能盒子"。它不只是存数字，还附带了很多信息：

- `.X`：基因表达矩阵（细胞 x 基因的数字表格）
- `.obs`：细胞的属性（比如"这是 T 细胞"、"来自哪个病人"）
- `.var`：基因的属性（比如"这是线粒体基因"、"这是高度可变基因"）
- `.layers`：原始数据和预处理后的数据可以分别存放

类比：AnnData 就像一个快递盒，`.X` 是里面的商品，`.obs` 是收件人信息，`.var` 是商品标签，`.layers` 是盒子里的分隔层。

### 2. 标准分析流程

一个典型的 Scanpy 分析流程分几步：

1. **读取数据**：把原始测序数据导入 AnnData 对象
2. **质量控制**：过滤掉质量差的细胞（比如基因数太少的）
3. **标准化**：让不同细胞之间的数据可比
4. **挑选高变基因**：找出最能区分不同细胞的基因
5. **降维**：用 PCA 把几万个基因压缩成几十个主成分
6. **构建邻域图**：计算细胞之间的相似度
7. **聚类**：把相似的细胞分到同一组
8. **可视化**：用 UMAP 把高维数据画到二维图上
9. **注释细胞类型**：根据标记基因给每个簇命名

### 3. Scanpy 的命名空间

Scanpy 用前缀来区分不同功能：

- `sc.pp.*`：预处理（preprocessing），如过滤、标准化
- `sc.tl.*`：拓扑/留数（topology/leiden），如聚类、轨迹推断
- `sc.pl.*`：绘图（plotting），如 UMAP、热图

## 三、代码示例

### 示例 1：加载数据、质控、标准化

```python
import scanpy as sc

# 读取 10x Genomics 的 h5 文件
adata = sc.read_10x_h5("filtered_feature_bc_matrix.h5")

print(f"数据形状: {adata.n_obs} 个细胞 x {adata.n_vars} 个基因")

# 标记线粒体基因（线粒体基因比例过高说明细胞可能快死了）
adata.var["mt"] = adata.var_names.str.startswith("MT-")

# 计算质控指标：每个细胞的基因数、总计数、线粒体基因占比
sc.pp.calculate_qc_metrics(adata, qc_vars=["mt"], log1p=True)

# 过滤：去掉基因数少于 200 的细胞，去掉只在少于 3 个细胞中出现的基因
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)

print(f"过滤后: {adata.n_obs} 个细胞 x {adata.n_vars} 个基因")

# 保存原始计数，然后做标准化 + log 转换
adata.layers["counts"] = adata.X.copy()
sc.pp.normalize_total(adata)  # 按细胞总读数标准化
sc.pp.log1p(adata)            # log(1 + x) 转换，压低极端值
```

### 示例 2：完整分析流程——从降维到聚类到可视化

```python
import scanpy as sc

# 挑选 2000 个高度可变的基因（这些基因最能区分不同细胞类型）
sc.pp.highly_variable_genes(adata, n_top_genes=2000)

# PCA 降维：把 2000 个基因压缩到 50 个主成分
sc.pp.highly_variable_genes(adata, n_top_genes=2000, batch_key="batch")
sc.tl.pca(adata, n_comps=50)

# 基于 PCA 结果构建细胞邻域图
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)

# UMAP 降维到二维，方便画图
sc.tl.umap(adata)

# Leiden 聚类算法：把相似的细胞分到同一簇
sc.tl.leiden(adata, resolution=0.5)

# 画 UMAP 图，按聚类结果着色
sc.pl.umap(adata, color=["leiden"], title="Leiden Clusters")

# 画 UMAP 图，按某个基因的表达量着色（比如 marker 基因 CD3D）
sc.pl.umap(adata, color=["CD3D"], title="CD3D Expression")
```

## 四、常用可视化函数速查

| 函数 | 用途 |
|------|------|
| `sc.pl.umap()` | 二维 UMAP 散点图，可按任意属性着色 |
| `sc.pl.violin()` | 小提琴图，展示某个指标在不同组间的分布 |
| `sc.pl.dotplot()` | 点图，展示多个标记基因在多个簇中的表达 |
| `sc.pl_heatmap()` | 热图，展示一组基因在各细胞中的表达模式 |
| `sc.pl.rank_genes_groupsheatmap()` | 差异基因的分组热图 |
| `sc.pl.pca_variance_ratio()` | PCA 方差比率图，帮助选择主成分数量 |

## 五、Scanpy 在 scverse 生态中的位置

Scanpy 不是一个孤立的工具，它是 scverse 生态的核心组件之一：

- **anndata**：提供 AnnData 数据结构，Scanpy 和所有 scverse 工具共用
- **squidpy**：Scanpy 的空间转录图扩展，处理空间单细胞数据
- **muon**：多模态单细胞数据分析（同时分析 RNA + 染色质开放性等）
- **scvi-tools**：基于深度学习的单细胞数据分析

## 六、学习建议

1. 先从官方教程 [Preprocessing and clustering](https://scanpy.readthedocs.io/en/stable/tutorials/basics/clustering.html) 动手跑一遍
2. 理解 AnnData 的结构比记住每个函数更重要——数据结构搞清楚了，函数只是调用方式的问题
3. 遇到报错时，先用 `print(adata)` 看看当前对象长什么样，这能帮你定位问题
4. Scanpy 的文档非常完善，API 参考页面可以直接搜索需要的函数
