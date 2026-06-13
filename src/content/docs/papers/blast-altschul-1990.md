---
title: BLAST — 序列比对的「搜索引擎」
来源: https://www.sciencedirect.com/science/article/abs/pii/S0022283605803602
日期: 2026-06-13
子分类: 生物信息
分类: 机器学习
provenance: pipeline-v3
---

## 先想成什么事

想象你在图书馆里找一本书，但**不知道完整书名**，只记得几句关键台词：

> 「To be or not to be」

如果图书馆有 30 亿本书，你不可能逐本翻开比对。聪明做法是：

1. **先搜关键词**——把每本书切成固定长度的「词块」，建索引；你的台词也切成同样长度的词块，去索引里找**完全匹配**的片段（seed）。
2. **再向两边扩展**——找到 seed 后，往前后多读几页，看上下文能不能连成一段像样的相似段落（extension）。
3. **最后打分排序**——不是「有点像就算」，而是问：**这么像的一段，在随机乱配里出现概率有多低？** 概率越低，越可能是真亲戚。

这就是 **BLAST（Basic Local Alignment Search Tool）** 干的事——只不过「书」是 DNA / 蛋白质序列，「台词」是你实验里测到的那条 read，「图书馆」是 GenBank、RefSeq 等数十亿字符的公共数据库。

Altschul、Gish、Miller、Myers、Lipman 在 1990 年 *Journal of Molecular Biology* 上发表的这篇论文，把上述直觉变成了**可证明统计性质**的启发式算法，比当时同等灵敏度的工具快一个数量级，成为 1990 年代被引用最多的论文之一。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 标题 | Basic local alignment search tool |
| 作者 | Stephen F. Altschul, Warren Gish, Webb Miller, Eugene W. Myers, David J. Lipman |
| 发表 | *Journal of Molecular Biology*, 215(3):403–410, 1990 |
| DOI | [10.1016/S0022-2836(05)80360-2](https://doi.org/10.1016/S0022-2836(05)80360-2) |
| PubMed | [2231712](https://pubmed.ncbi.nlm.nih.gov/2231712/) |
| 在线工具 | [NCBI BLAST](https://blast.ncbi.nlm.nih.gov/Blast.cgi) |

论文核心贡献可以概括为三句话：

1. **局部比对**：找的是两条序列里**最像的一段**（Maximal Segment Pair, MSP），而不是强迫整条序列从头到尾对齐——就像只关心「那几句台词像不像」，不要求两本书页数相同。
2. **启发式加速**：用短词（word）命中当种子，只扩展有希望的区域，把搜索空间从「每个字符对每个字符」砍到可承受规模。
3. **统计显著性**：Karlin–Altschul 理论给出高分片段在随机序列里出现的期望次数 **E-value**，让「像不像」变成「信不信得过」。

## 为什么重要

不理解 BLAST，下面这些事都没法解释：

- 为什么测完一条 DNA，第一反应是「拿去 NCBI BLAST 一下」——它是分子生物学界的**默认搜索引擎**
- 为什么论文里写 `E-value < 1e-50` 而不是「相似度 87%」——百分比不随数据库变大而调整，E-value 会
- 为什么 [[smith-waterman]] 精确但慢、BLAST 快但启发式——工程上几乎总是先用 BLAST 筛候选，再用慢方法精修
- 为什么宏基因组、注释基因、查同源蛋白、验证引物特异性，背后都是同一套「种子 + 扩展 + 统计」骨架

从 1990 到今，BLAST 家族演化出 blastn / blastp / blastx / tblastn / PSI-BLAST / megablast 等变体，但**论文里的 MSP 定义和 E-value 框架**仍是理解一切的起点。

## 核心概念

### 1. 序列与字母表

- **DNA**：字母表 `{A, C, G, T}`（有时含 `N` 表示未知）
- **蛋白质**：20 种标准氨基酸 + 终止符 `*`

序列就是字母串。两条序列「相关」意味着存在**局部**片段，在进化或功能上同源。

### 2. 打分矩阵（Scoring Matrix）

比对不是数「几个字母相同」，而是查表：

| 事件 | 典型处理 |
|------|----------|
| 匹配（如 Leu–Leu） | +4 ~ +6（BLOSUM62） |
| 错配 | 负数惩罚 |
| 开 gap | 额外惩罚 + 每延长一格再罚 |

常用矩阵：**BLOSUM62**（蛋白质）、**PAM** 系列、核酸的匹配/错配分（blastn 默认 +2/-3 等）。

### 3. Word（词）与种子（Seed）

BLAST 从查询序列抽出长度为 `w` 的连续子串列表（blastp 默认 `w=3`，blastn 默认 `w=11` 或 megablast 的 `w=28`）。

数据库里**完全匹配**（或超过阈值 `T` 的近似匹配）的 word 叫 **hit / seed**。只有 seed 才触发后续昂贵的扩展。

直觉：**word 越大 → 种子越少 → 越快但越容易漏远缘同源**。

### 4. High-Scoring Segment Pair（HSP）

从 seed 向左右**无 gap 延伸**，累加打分；分数开始下降超过阈值 `X` 就停。得到的**最高分局部无 gap 段**是一个 HSP。

多个 HSP 可属于同一条数据库序列；gapped BLAST 还会在高分 HSP 上再做带 gap 的精修（类似局部 Smith–Waterman）。

### 5. Two-hit 方法（1997 扩展，理解现代 BLAST 必备）

原始「one-hit」：任何一个 seed 都尝试扩展——**超过 90% 时间耗在这里**。

**Two-hit**：同一条对角线上，两个相距不超过距离 `A` 的 seed 都命中，才触发扩展。随机噪声里凑齐「两个近邻 seed」的概率低得多，扩展次数大约减半，速度显著提升。

### 6. E-value 与 Bit Score

Karlin–Altschul 公式（查询长 `m`，数据库有效长 `n`，原始分 `S`）：

```
E = K · m · n · e^(-λS)
```

- **E**：随机背景下，得分 ≥ S 的 HSP 期望出现次数
- **K, λ**：由打分矩阵决定的常数（BLOSUM62 约 λ≈0.267, K≈0.041）
- **E 越小越显著**；常用阈值 `E < 0.01` 或 `1e-5`
- **Bit score** `S' = (λS - ln K) / ln 2`：与数据库大小无关，便于跨搜索比较

当 `E < 0.01` 时，E-value 与 P-value（至少出现一次的概率）近似：`P ≈ 1 - e^(-E) ≈ E`。

### 7. BLAST 程序族（零基础先记这五个）

| 程序 | 查询 | 数据库 | 典型用途 |
|------|------|--------|----------|
| **blastn** | 核酸 | 核酸 | 基因定位、引物特异性 |
| **megablast** | 核酸 | 核酸 | 近同源、大片段，word 更大更快 |
| **blastp** | 蛋白 | 蛋白 | 找同源蛋白、功能注释 |
| **blastx** | 核酸（6 框翻译） | 蛋白 | 新基因可能编码什么蛋白 |
| **tblastn** | 蛋白 | 核酸（6 框翻译） | 蛋白在哪些基因组里出现 |

## 算法流程（一图胜千言）

```text
查询序列 Q
    │
    ▼
生成 word 列表（长度 w）
    │
    ▼
在数据库索引中找 word hit ──► 无 hit → 丢弃
    │
    ▼
Two-hit 过滤（可选）──► 未凑齐双 seed → 丢弃
    │
    ▼
无 gap 延伸 → 得到 HSP 原始分 S
    │
    ▼
S ≥ 阈值？──否──► 丢弃
    │
    ▼
（可选）Gapped 精修
    │
    ▼
计算 bit score、E-value → 排序输出
```

## 实践案例

### 案例 1：命令行 blastn——把一条基因扔进水母基因组

假设你有一条来自模式生物的基因序列 `gene.fa`，想查它在 *Hydra* 基因组里有没有同源拷贝：

```bash
# 需本地安装 NCBI BLAST+（brew install blast 或 conda install blast）
makeblastdb -in hydra_genome.fa -dbtype nucl -out hydra_db

blastn \
  -query gene.fa \
  -db hydra_db \
  -outfmt "6 qseqid sseqid pident length evalue bitscore" \
  -evalue 1e-5 \
  -word_size 11 \
  -max_target_seqs 10
```

`-outfmt 6` 输出制表符分隔字段，便于管道进 `awk` / R / Python。关注列：

- **pident**：相同碱基百分比（启发式延伸结果，不是全局定义）
- **evalue**：统计显著性——比 pident 更该用来决定「算不算同源」
- **bitscore**：与数据库大小无关的强弱分

若近缘物种、序列很长且几乎相同，可换 **megablast**（`-task megablast`，默认 `word_size=28`）换速度。

### 案例 2：Python 调 NCBI 远程 BLAST（不写本地数据库）

适合快速验证、序列不长、能接受排队：

```python
from Bio.Blast import NCBIWWW, NCBIXML
from io import StringIO

query = (
    "ATGAAAGAATTGAAAGAAGAAGGTGAAGAAGATGATGATGAA"
    "GAAGGTGAAGAAGAAGAAGAAGAAGAAGAAGAAGAAGAAGAA"
)

result_handle = NCBIWWW.qblast(
    program="blastn",
    database="nt",          # 核酸非冗余库，实际很大
    sequence=query,
    expect=0.001,
    word_size=11,
)

blast_record = NCBIXML.read(result_handle)

for alignment in blast_record.alignments[:5]:
    hsp = alignment.hsps[0]
    print(alignment.title[:60])
    print(f"  E-value={hsp.expect:.2e}  bit_score={hsp.bits:.1f}  identity={hsp.identities}/{hsp.align_length}")
```

`Bio.Blast` 来自 [Biopython](https://biopython.org/)。远程 BLAST 有频率限制；生产管线应下载数据库 + 本地 `blastn`。

### 案例 3：手算 E-value——理解「数据库越大，同样分数越不可信」

下面用 BLOSUM62 的典型 λ、K 做**数量级直觉**（非替代 BLAST 内置统计）：

```python
import math

def e_value(raw_score: float, m: int, n: int, K: float = 0.041, lam: float = 0.267) -> float:
    """期望随机命中次数。m=查询长，n=数据库有效搜索空间长度。"""
    return K * m * n * math.exp(-lam * raw_score)

def bit_score(raw_score: float, K: float = 0.041, lam: float = 0.267) -> float:
    return (lam * raw_score - math.log(K)) / math.log(2)

S = 85          # 假设某次 HSP 原始分
m, n = 400, 3e9 # 400 bp 查询，30 亿字母数据库

print(f"E = {e_value(S, m, n):.2e}")      # 很小 → 显著
print(f"bit = {bit_score(S):.1f}")

# 数据库扩大 1000 倍，同样 S，E 也扩大 1000 倍
print(f"E (n×1000) = {e_value(S, m, n * 1000):.2e}")
```

这就是为什么同一条比对，在小数据库里 `E=1e-10`，换全库 nt 可能变成 `E=0.1`——**不是序列变了，是「抽奖次数」变多了**。Bit score 不变，因为它吃掉了 `m、n` 的影响。

### 案例 4：word_size 与敏感度的权衡

```bash
# 远缘同源、短序列：较小 word，更慢更敏感
blastn -query short_read.fa -db nr_db -word_size 7 -evalue 1e-3

# 近缘、查基因是否在该物种基因组：大 word，快
blastn -query gene.fa -db target_genome -task megablast -word_size 28
```

经验法则：**word_size 必须小于查询长度的一半**，否则合法 hit 可能被漏掉。

## 踩过的坑

1. **只看 % identity 不看 E-value**——短序列上 95% identity 仍可能 E 很大（随机也能凑出来）；长序列上 70% identity 可以极显著。

2. **把 E-value 当概率**——E 是**期望次数**；P(至少一次) = 1 - e^(-E)。E=10 不代表「10% 概率」，而是「随机期望出现 10 次」。

3. **不同数据库结果不可直接比 E-value**——跨库请比 **bit score**；同一 bit score，库越大 E 越大。

4. **局部比对 ≠ 全序列同源**——一个蛋白结构域能撞出高分 HSP，整条基因未必同源；要读比对示意图，别只扫表格。

5. **低复杂度 / 重复序列**——poly-A、转座子 repeat 会产生大量假阳性；可用 `dust`（核酸）或 `seg`（蛋白）过滤，或调 `-soft_masking`。

6. **blastx / tblastn 的阅读框**——核酸翻译有 6 个阅读框，计算量比 blastp 大；查询太短则统计无力。

7. **远程 BLAST 与本地版本参数默认值可能不同**——复现论文结果时记录 `blastn -version` 和完整参数。

## 适用 vs 不适用

**适用**：

- 在公共库中找同源基因 / 蛋白（注释、进化分析）
- 验证测序 read 污染、引物非特异扩增
- 快速筛选候选，再交给 [[smith-waterman]]、HMMER、AlphaFold 等做精细分析
- 教学演示：序列相似性 + 假设检验直觉

**不适用**：

- 需要**全局**最优比对且序列很长——用 Needleman–Wunsch 全局比对或 minimap2 等
- 结构比对、RNA 二级结构——用专门工具（Foldseek、Infernal）
- 超远缘、低于 twilight zone（~20–30% aa identity）——PSI-BLAST、HHblits、Jackhmmer 迭代搜库
- 实时超长读长映射（PacBio/ONT）——minimap2、Winnowmap 等索引结构完全不同

## 与相关工作的关系

```text
动态规划精确比对          启发式数据库搜索
─────────────────────────────────────────────
Needleman–Wunsch (全局)     BLAST (局部, 1990)  ← 本篇
Smith–Waterman (局部)       FASTA (1988, 不同种子策略)
                            PSI-BLAST (1997, 迭代 profile)
                            DIAMOND (蛋白, 比 BLAST 更快数量级)
```

BLAST 不是「发明了序列比对」——Smith–Waterman (1981) 等早已给出最优局部比对动态规划。BLAST 的贡献是：**在几乎不牺牲实用灵敏度的前提下，把数据库搜索做成生物学家每天能点一下网页就用的速度**，并配上严格可解释的 E-value。

## 延伸阅读

- [NCBI BLAST 教程：相似性分数统计](https://www.ncbi.nlm.nih.gov/blast/tutorial/Altschul-1.html)
- [Nature Scitable：BLAST 入门](https://www.nature.com/scitable/topicpage/basic-local-alignment-search-tool-blast-29096/)
- Altschul S.F. et al. (1997) Gapped BLAST and PSI-BLAST — 引入 two-hit 与迭代搜索
- Karlin S., Altschul S.F. (1990) Methods for assessing the statistical significance of molecular sequence features — E-value 理论根基

## 一句话总结

**BLAST 把「在几十亿字母里找亲戚」变成：先用短词命中当地震预警，再延伸成高分片段，最后用 E-value 告诉你——这到底是进化上的亲戚，还是随机撞衫。**
