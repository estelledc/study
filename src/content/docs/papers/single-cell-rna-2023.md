---
title: "Single-Cell RNA Sequencing: Technologies and Data Analysis"
来源: https://arxiv.org/abs/2401.00028
日期: 2026-06-13
分类_原始: 生物信息学
分类: 机器学习
子分类: 生物信息
provenance: pipeline-v3
---

# Single-Cell RNA Sequencing: Technologies and Data Analysis

## 一、这是什么？

想象你有一个巨大的人体组织样本，里面混杂了成千上万个不同类型的细胞。
传统的 RNA 测序方法（bulk RNA-seq）就像把所有细胞打碎混合在一起，
测一个"平均基因表达量"。这就像把苹果、橙子、香蕉全部榨成一杯果汁，
你只能尝到混合味道，分不清每种水果各自的特征。

而 **单细胞 RNA 测序**（scRNA-seq）就是给每个细胞单独测序：
给每个细胞拍一张"基因表达快照"，知道每个细胞在表达哪些基因、表达多少。
这样你就能看到组织中到底有哪些不同的细胞类型、各自在做什么。

## 二、核心技术流程

一个完整的 scRNA-seq 实验可以分为 **湿实验**（wet lab）和 **干实验**（dry lab）两大阶段。

```
湿实验: 组织 → 单细胞悬液 → 建库 → 测序 → 原始数据（FASTQ）
干实验: FASTQ → 质控 → 比对 → 定量 → 标准化 → 降维 → 聚类 → 注释
```

## 三、主流技术平台

### 3.1 10x Genomics（最主流）

原理：每个细胞被包裹在一个微小的凝胶珠（Gel Bead）里，
每个凝胶珠携带约 100 万个带有唯一条形码（barcode）的引物。
细胞裂解后，每个 mRNA 分子会被加上所属细胞的 barcode 和唯一的分子标识（UMI）。

类比：就像在一个巨大的邮局里，每个包裹都有收件人地址（barcode）
和唯一的追踪编号（UMI），这样就能知道每个包裹来自哪个细胞、避免重复计数。

### 3.2 SMART-seq2

原理：通过全长 cDNA 扩增，覆盖几乎整个转录本。
分辨率更高，但通量低（一次只能测几十到几百个细胞）。

### 3.3 新兴技术

- **Space Transcriptomics**（空间转录组）：不仅测基因表达，还保留细胞在组织中的位置信息
- **Multi-omics**：同时测转录组 + 表观基因组 + 蛋白质组

## 四、干实验数据分析流程

### 4.1 核心概念：UMI 和 Barcode

在 scRNA-seq 数据中，每个读数（read）携带两层信息：
- **Cell Barcode**：告诉你是哪个细胞的
- **UMI**（Unique Molecular Identifier）：告诉你是原始 mRNA 分子的哪个拷贝，用于去重

### 4.2 数据分析步骤详解

1. **质控（Quality Control）**：去除低质量细胞和读数
2. **比对（Alignment）**：将读数比对到参考基因组
3. **定量（Counting）**：统计每个细胞中每个基因的读数，得到 UMI 计数矩阵
4. **标准化（Normalization）**：消除测序深度差异
5. **特征基因选择（Feature Selection）**：筛选高变异基因
6. **降维（Dimensionality Reduction）**：PCA、UMAP、t-SNE
7. **聚类（Clustering）**：将相似细胞分到同一簇
8. **细胞类型注释（Annotation）**：根据标记基因确定每个簇的细胞类型

## 五、代码示例

### 示例 1：使用 Python + Scanpy 分析单细胞数据

这是最常用的 Python 分析框架。

```python
import scanpy as sc
import pandas as pd
import numpy as np

# ========== 第一步：加载数据 ==========
# AnnData 是 scanpy 的核心数据结构
# X 是 UMI 计数矩阵（细胞 x 基因）
# obs 存细胞元数据，var 存基因元数据
adata = sc.read_h5ad("count_matrix.h5ad")

# ========== 第二步：质控（Quality Control） ==========
# 计算每个细胞的基础指标
sc.pp.calculate_qc_metrics(
    adata,
    inplace=True,
    percentile=None
)

# 过滤标准：
# - n_genes_by_counts < 200  → 细胞可能破裂，只剩少量 mRNA
# - n_genes_by_counts > 2500 → 细胞可能双重（two cells merged）
# - mito_ratio > 20%         → 细胞正在凋亡，线粒体基因异常高
mask = (
    (adata.obs['n_genes_by_counts'] > 200) &
    (adata.obs['n_genes_by_counts'] < 2500) &
    (adata.obs['pct_counts_mt'] < 20)
)
adata = adata[mask].copy()
print(f"质控前: {adata.n_obs} 个细胞 → 质控后: {adata.n_obs} 个细胞")

# ========== 第三步：标准化与对数变换 ==========
# Normalize: 按每个细胞的总读数缩放，使所有细胞测序深度一致
# 默认缩放因子为 10,000，再作 log1p 变换
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

# ========== 第四步：筛选高变异基因（HVGs） ==========
# 不是所有基因都有分析价值。有些基因在几乎所有细胞中都表达（看家基因），
# 有些基因表达波动太大（噪声）。我们只保留中等表达但细胞间差异大的基因。
sc.pp.highly_variable_genes(
    adata,
    n_top_genes=2000,       # 选 Top 2000 变异基因
    subset=True,            # 只保留这些基因
    flavor='cell_ranger'    # 用 Cell Ranger 的标准算法
)

# ========== 第五步：降维 ==========
# PCA: 主成分分析，把几千维的基因表达数据压缩到几十维
sc.pp.pca(adata, n_comps=30)

# 看 PCA 结果：哪些主成分值得保留
sc.pl_pca_variance_ratio(adata, n_pcs=30)

# ========== 第六步：聚类 ==========
# 构建 KNN 图，再用 Leiden 算法聚类
sc.pp.neighbors(adata, n_pcs=30)
sc.tl.leiden(adata, resolution=0.5)

# 用 UMAP 可视化（UMAP 比 t-SNE 更快，能更好地保留全局结构）
sc.tl.umap(adata)
sc.pl_umap(adata, color='leiden', size=50)

# ========== 第七步：差异基因分析 ==========
# 找出每个聚类簇的标志性基因
sc.tl.rank_genes_groups(adata, 'leiden', method='wilcoxon')
sc.pl_rank_genes_groups(adata, n_genes=20, sharey=False)

# 保存结果
adata.write("processed_adata.h5ad")
```

### 示例 2：使用 R + Seurat 分析单细胞数据

Seurat 是 R 中最主流的单细胞分析包。

```r
library(Seurat)
library(SeuratDisk)

# ========== 第一步：加载数据 ==========
# 从 10x Genomics 的 raw_feature_bc_matrix 目录加载
seurat_obj <- Read10X(data.dir = "outs/filtered_feature_bc_matrix/")

# 创建 Seurat 对象
seurat <- CreateSeuratObject(
    counts = seurat_obj,
    min.cells = 3,          # 基因至少在 3 个细胞中表达
    min.features = 200      # 细胞至少表达 200 个基因
)

# ========== 第二步：质控标记 ==========
# 在线粒体基因比例高的细胞中，细胞可能受损
# 人类基因以 "MT-" 开头，小鼠以 "mt-" 开头
seurat[["percent.mt"]] <- PercentageFeatureSet(
    seurat, pattern = "^MT-"
)

# 用 VlnPlot 查看分布（像小提琴一样的形状图）
VlnPlot(seurat, features = c("nFeature_RNA", "nCount_RNA", "percent.mt"),
        ncol = 3)

# 用 FeatureScatter 看相关性
FeatureScatter(seurat, feature1 = "nCount_RNA", feature2 = "percent.mt")

# ========== 第三步：过滤低质量细胞 ==========
seurat <- subset(
    seurat,
    subset = nFeature_RNA > 200 &
             nFeature_RNA < 2500 &
             percent.mt < 20
)

# ========== 第四步：标准化 ==========
# SCTransform 是 Seurat v3+ 推荐的标准化方法，
# 基于负二项式回归模型，比传统的 log normalization 更准确
seurat <- SCTransform(seurat, verbose = FALSE)

# ========== 第五步：找高变异基因 ==========
# SCTransform 自动完成了这一步，选出 Top 3000 高变异基因
hvg <- SelectVariableFeatures(seurat)

# ========== 第六步：降维 ==========
seurat <- RunPCA(seurat, verbose = FALSE)

# 看碎石图，决定保留多少个主成分
ElbowPlot(seurat, ndims = 30)

# ========== 第七步：聚类 ==========
# 找邻居
seurat <- FindNeighbors(seurat, dims = 1:30)
# Leiden 聚类
seurat <- FindClusters(seurat, resolution = 0.5)

# ========== 第八步：可视化 ==========
# UMAP 降维可视化
seurat <- RunUMAP(seurat, dims = 1:30)
DimPlot(seurat, reduction = "umap", label = TRUE)

# 看几个经典标记基因的表达
FeaturePlot(seurat, features = c("CD3D", "MS4A1", "PPBP"))

# ========== 第九步：注释细胞类型 ==========
# 根据标记基因表达手动注释
Idents(seurat) <- RenameIdents(
    seurat,
    "0" = "T_cells",
    "1" = "B_cells",
    "2" = "NK_cells"
)
DimPlot(seurat, label = TRUE)

# ========== 第十步：保存 ==========
SaveRDS(seurat, file = "processed_seurat.rds")
```

### 示例 3：快速检查计数矩阵的基本统计

```python
import scanpy as sc
import matplotlib.pyplot as plt

# 加载数据
adata = sc.read_h5ad("count_matrix.h5ad")

# 查看矩阵形状
print(f"矩阵形状: {adata.shape}")  # (细胞数, 基因数)

# 每个细胞的基因数统计
n_genes = adata.obs['n_genes_by_counts']
print(f"基因数 — 中位数: {n_genes.median():.0f}, "
      f"平均: {n_genes.mean():.0f}")

# 每个细胞的总 UMI 数
total_umis = adata.obs['total_counts']
print(f"总UMI — 中位数: {total_umis.median():.0f}")

# 线粒体基因比例（判断细胞质量的重要指标）
mito_genes = adata.var_names.str.startswith('MT-')
adata.obs['mito_ratio'] = (
    adata[:, mito_genes].X.sum(axis=1).A1 /
    adata.X.sum(axis=1).A1
) * 100

# 画分布图
plt.figure(figsize=(8, 4))
plt.hist(adata.obs['mito_ratio'], bins=100, edgecolor='black')
plt.xlabel('Mitochondrial Ratio (%)')
plt.ylabel('Number of Cells')
plt.title('Distribution of Mitochondrial Gene Expression')
plt.axvline(x=20, color='red', linestyle='--', label='QC cutoff (20%)')
plt.legend()
plt.tight_layout()
plt.savefig('mito_ratio_distribution.png', dpi=150)
```

## 六、关键概念总结

| 概念 | 说明 | 类比 |
|------|------|------|
| **UMI** | Unique Molecular Identifier，标记原始 mRNA 分子，用于 PCR 去重 | 每个包裹的追踪编号 |
| **Cell Barcode** | 唯一标识细胞来源的序列 | 包裹上的收件人地址 |
| **Dropout** | 某个基因在某个细胞中实际表达了但没被检测到 | 邮局漏掉了某封信 |
| **Normalization** | 消除不同细胞测序深度差异 | 按人口比例标准化各国数据 |
| **HVG** | Highly Variable Gene，细胞间差异大的基因 | 最能区分不同人群的爱好 |
| **Clustering** | 将表达谱相似的细胞归为一类 | 朋友圈自动分组 |
| **Dimension Reduction** | 把高维数据投影到低维空间 | 把三维世界拍成二维照片 |

## 七、当前挑战

- **Dropout 问题**：单细胞测序捕获效率低（约 10-20%），很多基因表达为 0 是假阴性
- **批次效应**：不同时间、不同实验条件的数据不能直接比较
- **计算资源**：百万级细胞的数据量对内存和算力要求极高
- **细胞注释主观性**：依赖研究者对标记基因的先验知识，缺乏自动化标准

## 八、延伸阅读建议

1. **Stuart & Butler, 2019** — Seurat v3 论文，理解 Seurat 工作流程
2. **Wolf et al., 2018** — Scanpy 论文，理解 Python 单细胞分析生态
3. **Regev et al., 2017** — Nature 综述，"A taxonomy of transcriptome cell types"
4. **10x Genomics 官方教程** — 最新的细胞分析流程（Cell Ranger + Loupe）
