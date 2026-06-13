---
title: "samtools / htslib 零基础学习笔记"
来源: https://github.com/samtools/samtools
日期: 2026-06-13
分类: 机器学习
子分类: 生物信息
provenance: pipeline-v3
---

# samtools / htslib 零基础学习笔记

## 一、它到底是干什么的？——一个日常类比

想象你在图书馆找书。

每天，基因测序仪会产出海量的"小纸条"——每条纸条上写着几十个字母（A、C、G、T），这些就是测序读段（reads）。图书馆管理员需要做几件事：

1. 把纸条装进**密封袋**（压缩文件），节省空间
2. 给每袋纸条**编上索引**（索引文件），这样要找"第 1000 号染色体附近"的内容时不用拆完所有袋子
3. 把纸条和图书馆的**总目录**（参考基因组）对比，看看每条纸条属于哪本书、哪一页
4. 最后统计：哪些位置被纸条覆盖得多（覆盖深度），哪些地方有"拼错的字"（基因变异）

**samtools** 就是这个图书馆的管理系统，而 **htslib** 是它的底层工具箱。

samtools 和 htslib 是同一个开源家族（GitHub: samtools）下的三个项目中的两个：

| 项目 | 一句话 |
|------|--------|
| **htslib** | C 语言库，专门读写各种高通量测序文件格式 |
| **samtools** | 命令行工具，处理 SAM/BAM/CRAM 格式的比对数据 |
| **bcftools** | 命令行工具，处理 VCF/BCF 格式的变异数据 |

samtools 和 bcftools 都依赖 htslib 来完成最底层的工作——读写文件、压缩解压缩、建立索引。

## 二、核心文件格式：SAM、BAM、CRAM

这三个格式存的是同一种东西：**测序读段比对到参考基因组后的结果**。

### SAM —— 纯文本，像 CSV

SAM (Sequence Alignment/Map) 就是一个文本文件，每一行代表一条读段的比对结果。前几行是表头（以 `@` 开头），之后每一行 11 个必填字段，用制表符分隔：

```
read_name  flag  ref_name  pos  mapq  cigar  rnext  pnext  tlen  seq  qual
```

打个比方，一行 SAM 记录就像快递单上的信息：

```
read001  99  chr1  1000  60  50M  chr1  1100  250  ATCG...  IIII...
```

意思就是：编号 `read001` 的读段，以 1000 号位置开始比对到 `chr1`，它的配对读段在 1100 号位置，两个读段之间相隔约 250 个碱基。

### BAM —— SAM 的二进制压缩版

SAM 文本文件很大，BAM 就是它的二进制压缩版本——内容一模一样，但文件更小、读写更快。可以理解为 SAM 是"TXT 文件"，BAM 是它的"ZIP 版"。

### CRAM —— 更极致的压缩

CRAM 是更新的格式，它不存完整序列，而是只存"与参考基因组不同的部分"。打个比方：

- SAM/BAM：每条快递单上完整写出"我从北京寄给上海"
- CRAM：快递单上只写"我从[参考城市A]寄给[参考城市B]"，因为大家都已知晓参考信息

所以 CRAM 文件通常比 BAM 小 60-80%，但读取时需要参考基因组。

### 索引文件

BAM 和 CRAM 文件旁边经常跟着 `.bai`、`.csi` 或 `.crai` 后缀的索引文件。就像书的目录，让你能快速跳到"第 1000-2000 号位置"而不必遍历整个文件。

## 三、核心概念速查

### 1. FLAG —— 一个数字说一堆话

每条读段都有一个 FLAG 字段（一个整数），用二进制位来表示各种属性。

| 标志名 | 十六进制值 | 含义 |
|--------|-----------|------|
| PAIRED | 0x1 | 这是成对测序中的一条 |
| PROPER_PAIR | 0x2 | 配对成功，两端都比对上了 |
| UNMAP | 0x4 | 这条读段没有比对到参考基因组 |
| REVERSE | 0x10 | 这条读段比对到反向链 |
| READ1 | 0x40 | 这是 paired 的第一条读段（R1） |
| READ2 | 0x80 | 这是 paired 的第二条读段（R2） |
| DUP | 0x400 | 这是 PCR 重复（需要剔除） |

一个 FLAG 值为 99 的读段：99 = 64 + 32 + 2 + 1，意味着：成对测序、第一条读段、配对成功、比对到正向链。

### 2. CIGAR —— 比对结果的"拼图说明"

CIGAR 字符串描述了一条读段的每个碱基是如何比对到参考基因组的。常用操作符：

| 操作符 | 含义 | 消耗参考 | 消耗读段 |
|--------|------|----------|----------|
| M | 匹配/不匹配 | 是 | 是 |
| I | 插入（读段多出来的） | 否 | 是 |
| D | 缺失（参考多出来的） | 是 | 否 |
| N | 大片段缺失（内含子） | 是 | 否 |
| S | 软剪切（序列保留但不比对） | 否 | 是 |
| H | 硬剪切（序列丢弃） | 否 | 否 |

`50M` 表示 50 个碱基一一比对（可能有少数错配）。`10M5I20M` 表示前 10 个匹配、插入 5 个碱基、再匹配 20 个。

### 3. MAPQ —— 比对的自信程度

MAPQ (Mapping Quality) 是一个 0-60 的分数，越高表示这条读段越确定比对了正确的位置。60 = 极有信心，0 = 不知道比对在哪。

### 4. 参考基因组 (Reference)

参考基因组就是"标准答案"。所有读段都要跟它比对。最常用的版本是人类基因组 GRCh38。samtools 通过 `faidx` 命令为 FASTA 格式的参考基因组建立索引，实现随机访问。

## 四、常用命令与代码示例

### 示例 1：查看和转换文件格式

这是最常用的命令 `samtools view`。

**查看全部比对记录（输出为 SAM 文本）：**

```bash
samtools view aln.sorted.bam
```

**把 BAM 转为 SAM 文本，并带上表头：**

```bash
samtools view -h aln.sorted.bam > aln.sam
```

**只看 chr1 上 1000 到 5000 号位置的读段：**

```bash
samtools view aln.sorted.bam chr1:1000-5000
```

**把 BAM 转成更小的 CRAM 格式（需要参考基因组）：**

```bash
samtools view -C -T reference.fa -o aln.cram aln.sorted.bam
```

**把 CRAM 转回 BAM：**

```bash
samtools view -o aln.bam aln.cram
```

### 示例 2：排序、索引、统计

对 BAM 文件排序（按染色体位置排序）是几乎所有下游分析的前置步骤：

```bash
# 按染色体位置排序，用 8 个线程加速
samtools sort -@ 8 -o aln.sorted.bam aln.bam
```

建立索引文件（这样后面可以快速按区域查询）：

```bash
samtools index aln.sorted.bam
# 生成 aln.sorted.bam.bai 索引文件
```

查看排序好的 BAM 文件的索引统计信息：

```bash
samtools idxstats aln.sorted.bam
```

输出类似：

```
chr1    248956422    15234567    234
chr2    242193529    12345678    123
chr3    198295559    9876543     45
```

第一列是染色体名，第二列是染色体长度，第三列是该染色体上比对的读段数，第四列是没有比对上的读段数。

查看比对质量统计：

```bash
samtools flagstat aln.sorted.bam
```

输出类似：

```
30000000 + 0 in total (PAIRED:)
28500000 + 0 properly paired (95.0%:)
27000000 + 0 with itself and mate mapped
150000 + 0 singletons (0.5%:)
...
```

### 示例 3：生成深度覆盖表

`samtools depth` 可以逐碱基查看每个位置的覆盖深度：

```bash
# 输出每个位置的第几号碱基、参考碱基、覆盖深度
samtools depth aln.sorted.bam > coverage.txt
```

只看 chr1 前 1000 个碱基的覆盖深度：

```bash
samtools depth aln.sorted.bam chr1:1-1000 > chr1_start.txt
```

生成全基因组的覆盖统计摘要：

```bash
samtools coverage aln.sorted.bam > coverage_summary.txt
```

### 示例 4：提取 FASTQ 读段

如果你需要从比对结果中"倒推"回原始读段：

```bash
# 从已按名称排序的 BAM 中提取 FASTQ
samtools fastq -1 paired_R1.fastq -2 paired_R2.fastq -s single.fastq aln.sorted.bam
```

这会生成两个 paired-end 文件和一个只含未配对读段文件。

## 五、htslib 是什么？——底层引擎

如果你理解 samtools 像"图书馆管理系统"，htslib 就是系统背后的"数据库引擎"。

htslib 是一个 C 语言库，提供了：

- 读写 SAM/BAM/CRAM/VCF/BCF 等所有格式的 API
- BGZF 压缩/解压缩（BAM 用的格式）
- 建立和查询索引
- 从 HTTP/FTP 远程读取文件（甚至不需要本地下载）

samtools 的每个命令底层都在调用 htslib。如果你用 Python、R、Perl 或其他语言处理测序数据，你也可以直接链接 htslib——事实上 Python 的 `pysam` 库、R 的 `Rsamtools` 包都是 htslib 的封装。

htslib 只依赖 zlib 一个库，非常轻量。它已被约 900 个 GitHub 项目直接使用，从 Bioconda 下载量超过 100 万次。

## 六、典型工作流

一个典型的测序数据分析流水线中，samtools 出现在多个环节：

```
FASTQ (原始读段)
    |
    |  [比对工具，如 BWA]
    v
SAM/BAM (比对结果)
    |
    |  samtools sort
    v
sorted.bam
    |
    |  samtools index
    v
sorted.bam.bai (索引文件)
    |
    |  samtools mpileup (生成 pileup)
    v
    |  [bcftools call 检测变异]
    v
VCF (变异列表)
```

## 七、学习资源

- **官网**: https://www.htslib.org/
- **samtools GitHub**: https://github.com/samtools/samtools
- **htslib GitHub**: https://github.com/samtools/htslib
- **bcftools GitHub**: https://github.com/samtools/bcftools
- **文件格式规范**: http://samtools.github.io/hts-specs/
- **工作流文档**: https://www.htslib.org/workflow/

如需引用，可参考论文：

> Twelve years of SAMtools and BCFtools. GigaScience, 2021.
> DOI: https://doi.org/10.1093/gigascience/giab008

> HTSlib: C library for reading/writing high-throughput sequencing data. GigaScience, 2021.
> DOI: https://doi.org/10.1093/gigascience/giab007
