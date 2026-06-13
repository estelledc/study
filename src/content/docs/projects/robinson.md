---
title: Bioinformatics Tools
来源: https://github.com/samtools/samtools
日期: 2026-06-13
分类: 机器学习
子分类: bioinformatics-and-scientific
provenance: pipeline-v3
---

# Bioinformatics Tools — 零基础学习笔记

## 一、它到底在干什么？

想象你进了一个超级大的图书馆。

这本书不是纸做的，而是一段段由 A、T、C、G 四个字母组成的字符串——这就是 DNA 序列。每段序列可能只有几百个字母长，但你整个人类基因组有约 30 亿个字母。科学家们把这段"超级长书"切碎，用仪器读出一段段小片段，这就是 **测序（sequencing）**。

Bioinformatics Tools（生物信息学工具）的作用，就像图书馆的图书管理员：

1. **接收** 一堆零散的、带编号的片段（测序仪输出）
2. **整理** 片段的质量——哪些读得清楚，哪些一团糟
3. **对齐** 片段到"参考目录"上，搞清楚每个片段属于基因组的哪个位置
4. **分析** 找出差异——比如某个人的基因和标准版本差了一个字母

整个过程几乎全部用命令行完成。没有鼠标，没有图形界面，全是文字指令。

## 二、核心概念

### 2.1 测序数据格式

测序仪输出的原始数据叫 **FASTQ**。每一行就像一张小纸条：

```
@SEQ_ID
ATCGATCGATCG
+
IIIIIIIIIIII
```

四行分别代表：
- 第 1 行：以 `@` 开头，片段编号
- 第 2 行：实际的 DNA 序列（A、T、C、G）
- 第 3 行：以 `+` 开头，占位符
- 第 4 行：质量分数，每个字符对应第 2 行一个字母，告诉你这个字母读得准不准

质量分数用 ASCII 编码，`I` 表示质量很高（Phred 分数 40，错误率万分之一），`!` 表示质量很差。

### 2.2 SAM / BAM / CRAM 格式

FASTQ 是"原材料"。当你把片段对齐到参考基因组后，输出叫 **SAM**。

SAM 格式有点像一张电子表格，每一行一个片段，字段之间用 Tab 分隔。

但 SAM 是纯文本，文件巨大。于是有了 **BAM**——就是 SAM 的二进制压缩版本，体积通常缩小到原来的 1/3 到 1/5，而且可以用索引快速查找某个基因组区域。

> 类比：SAM 是 TXT 文件，BAM 是 ZIP 压缩后的 SAM。内容一模一样，只是更紧凑。

### 2.3 读段（Read）和对齐（Alignment）

- **Read**：测序仪读出来的一段 DNA 序列，就是 FASTQ 里的第 2 行
- **Alignment**：把 read 放到基因组的正确位置上
- **MAPQ**：Mapping Quality，对齐质量分数，告诉你这个位置放得有多可靠
- **CIGAR**：一个字符串，描述 read 是如何跟参考基因组匹配的。`M` 表示匹配，`I` 表示插入，`D` 表示缺失，`N` 表示跳过内含子

## 三、Samtools — 生物信息学的"瑞士军刀"

Samtools 是这个领域最核心的工具集，由英国 Wellcome Trust Sanger 研究所开发。它不是一个程序，而是一组命令，每个命令解决一个具体问题。

### 3.1 安装

```bash
brew install samtools
```

安装后验证：

```bash
samtools --version
# samtools 1.21
# Using htslib 1.21
```

### 3.2 示例一：FASTQ 转 BAM — 对齐测序数据

这是最常见的流程。假设你已经有一个 FASTQ 文件 `sample.fastq`，里面是测序仪读出来的原始数据。

第一步：把 FASTQ 对齐到参考基因组，生成 BAM：

```bash
# bwa mem 是比对工具，把 fastq 对齐到参考基因组 ref.fa
# 输出 SAM（文本格式），我们用 samtools view 转为 BAM（二进制压缩）
bwa mem ref.fa sample.fastq | samtools view -Sb - > sample.bam
```

这里用到了 Unix 管道 `|`：
- `bwa mem` 的输出直接传给 `samtools view`
- `-Sb` 表示"输入是 SAM，输出是 BAM"
- `-` 表示从标准输入读取
- `>` 把结果写入文件

第二步：给 BAM 排序，按基因组位置排好序：

```bash
samtools sort -o sample.sorted.bam sample.bam
```

第三步：建索引，这样以后找某个基因位置时不用从头扫一遍：

```bash
samtools index sample.sorted.bam
```

现在你有了三个文件：

| 文件 | 作用 |
|------|------|
| sample.bam | 原始对齐结果 |
| sample.sorted.bam | 按位置排好序 |
| sample.sorted.bam.bai | 索引文件，加速查找 |

### 3.3 示例二：查看 BAM 内容和统计

查看 BAM 里的前 20 条记录：

```bash
samtools view sample.sorted.bam | head -20
```

输出类似这样（字段很多，我们只看关键几个）：

```
read_001   99   chr1   100   60   76M   =   200   276   AGCTTAGCTTAGCT...   IIIIIIIIIIIII...
read_002   147  chr1   200   60   76M   =   100   -276  TCGATCGATCGA...   IIIIIIIIIIIII...
```

关键字段含义：
- 第 2 列 `99 / 147`：标志位（flag），99 表示这条 read 是成对中"第一条"，147 表示"第二条"
- 第 3 列 `chr1`：对齐到第几号染色体
- 第 4 列 `100 / 200`：从第几个碱基开始对齐
- 第 5 列 `60`：Mapping Quality，60 表示错误概率是十亿分之一，极高置信度
- 第 7 列 `=`：paired 的另一个片段也在同一条染色体上
- 第 8 列 `200 / 100`：paired 的另一个片段在哪个位置
- 第 9 列 `276 / -276`：两个片段之间的距离（负号表示方向相反）

统计整个 BAM 文件的摘要信息：

```bash
samtools flagstat sample.sorted.bam
```

输出：

```
1000000 + 0 in total (QC-passed reads + QC-failed reads)
950000 + 0 primary
50000 + 0 secondary
900000 + 0 mapped (90.00% : N/A)
850000 + 0 paired in sequencing
425000 + 0 read1
425000 + 0 read2
765000 + 0 properly paired (90.00% : N/A)
```

这些数字告诉你：测了多少数据、多少成功对齐、质量如何。这是判断实验是否合格的第一步。

### 3.4 示例三：变异检测（Variant Calling）

这是生物信息学最常见的分析目标——找出你和"标准基因组"之间的差异。

```bash
# 第一步：用 samtools mpileup 生成深度覆盖文件
samtools mpileup -uf ref.fa sample.sorted.bam > sample.mpileup

# 第二步：用 bcftools（samtools 套件的一部分）找出变异
bcftools call -mv sample.mpileup -Oz -o sample.vcf.gz

# 第三步：索引 VCF 文件
bcftools index sample.vcf.gz
```

`bcftools call -m` 用的是 Bayes 模型，判断每个位置上"有变异"还是"没有变异"的概率。`-v` 只输出有变异的位点，`-Oz` 输出压缩的 VCF 格式。

VCF 文件长这样：

```
##fileformat=VCFv4.2
#CHROM  POS     ID  REF  ALT    QUAL  FILTER  INFO
chr1    12345   .   A    G      99    PASS    DP=50;AF=0.48
chr1    67890   .   C    T      85    PASS    DP=30;AF=0.35
```

每一行代表一个变异位点：
- `chr1`：在哪条染色体上
- `12345`：从第几个碱基开始
- `REF=A`：标准版本是 A
- `ALT=G`：你检测到的是 G
- `DP=50`：这个位置测到了 50 次（深度）
- `AF=0.48`：等位基因频率，48% 的 read 支持这个变异

## 四、常用命令速查

| 命令 | 作用 |
|------|------|
| `samtools view` | 查看/转换 SAM/BAM |
| `samtools sort` | 按位置排序 BAM |
| `samtools index` | 建立 BAM 索引 |
| `samtools flagstat` | 统计对齐情况 |
| `samtools depth` | 查看每个位置测序深度 |
| `samtools coverage` | 计算覆盖度 |
| `samtools faidx` | 快速抽取基因组某段序列 |
| `samtools merge` | 合并多个 BAM |
| `samtools markdup` | 标记 PCR 重复 |
| `bcftools call` | 变异检测 |
| `bcftools stats` | 变异统计 |

## 五、给初学者的建议

Samtools 输出很多，信息密度高。刚接触时不必逐列理解所有字段，先从三个数字开始：

1. **总读数（total reads）** — 测了多少
2. **映射率（mapped %）** — 多少读到了位置
3. **覆盖深度（depth）** — 每个位置平均测了几次

这三个数字对了，后续分析才有意义。

另外，善用 `--help`。每个命令后面加上 `--help`，Samtools 会输出完整的参数说明。这是比任何教程都准确的文档。
