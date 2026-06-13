---
title: Biopython 零基础学习笔记
来源: https://github.com/biopython/biopython
日期: 2026-06-13
分类_原始: 生物信息学
分类: 机器学习
子分类: 生物信息
provenance: pipeline-v3
---

# Biopython 零基础学习笔记

## 一、什么是 Biopython？

### 1.1 日常类比

想象你在一家图书馆工作，馆里有成千上万本书。每本书的封面都印有这本书的核心信息：书名、作者、出版社。现在，如果你要人工逐本翻阅、统计、摘录这些书的某个章节，工作量会非常巨大。

Biopython 就是为生物学家打造的"图书馆自动化系统"。只不过它处理的不是书，而是"生命之书"——DNA、RNA 和蛋白质的序列数据。

**一句话总结：** Biopython 是一个用 Python 编写的免费工具包，帮助生物学家分析 DNA、RNA、蛋白质等生物分子数据。

### 1.2 它不是什么

- 它不是数据库（不存储数据）
- 它不是 GUI 软件（没有图形界面）
- 它是一个**库（library）**：写好的一段代码，你可以"拿过来用"

### 1.3 安装

```bash
pip install biopython
```

验证安装：

```python
import Bio
print(Bio.__version__)
```

## 二、核心概念

Biopython 围绕三个核心对象工作，理解它们是入门的关键：

### 2.1 Seq — 序列

`Seq` 对象代表一条生物序列，比如一段 DNA 或一段蛋白质。你可以把它理解成一条"有生物意义的字符串"。

```
普通字符串: "AGCTTAGC"
Seq 对象:   Seq('AGCTTAGC')
```

区别在于，`Seq` 对象多了生物学方法：反向互补、转录、翻译等。

### 2.2 SeqRecord — 带注释的序列

`SeqRecord` 对象在 `Seq` 的基础上加了"元数据"，相当于书的封面信息：

| 属性 | 说明 |
|------|------|
| `id` | 唯一标识符 |
| `description` | 描述文字 |
| `seq` | 实际的序列（一个 Seq 对象） |
| `annotations` | 字典形式的注释信息 |

### 2.3 SeqIO — 序列的输入/输出

`SeqIO` 是 Biopython 的"文件管理器"，负责读取和写入各种格式的序列文件（如 FASTA、GenBank 等）。它把"怎么解析文件"的复杂细节都封装好了，你只需要告诉它：

1. **文件在哪**（文件名或文件句柄）
2. **什么格式**（"fasta"、"genbank" 等）

## 三、代码示例

### 3.1 示例一：序列操作（创建、互补、转录、翻译）

这个示例展示 `Seq` 对象最核心的生物学功能：从 DNA 到蛋白质的中心法则流程。

```python
from Bio.Seq import Seq

# 1. 创建一条 DNA 序列（使用编码链）
dna = Seq("ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG")

# 2. 查看基本信息
print("DNA 序列:", dna)
print("长度:", len(dna))
# DNA 序列: ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG
# 长度: 39

# 3. 计算 GC 含量（G 和 C 碱基所占比例）
gc_count = dna.count("G") + dna.count("C")
gc_content = 100 * gc_count / len(dna)
print(f"GC 含量: {gc_content:.2f}%")
# GC 含量: 58.97%

# 4. 获取互补链（A 配 T, C 配 G）
complement = dna.complement()
print("互补链:", complement)
# 互补链: TACCGGTAACATTACCCGGCGACTTTCCCACGGGCTATC

# 5. 获取反向互补链（生物学中最常用的链）
reverse_comp = dna.reverse_complement()
print("反向互补链:", reverse_comp)
# 反向互补链: CTATCGGGCACCCTTTCAGCGGCCCATTACAATGGCCAT

# 6. 转录：DNA → mRNA（T 替换为 U）
mrna = dna.transcribe()
print("mRNA:", mrna)
# mRNA: AUGGCCAUUGUAAUGGGCCGCUGAAAGGGUGCCCGAUAG

# 7. 翻译：mRNA → 蛋白质（三个碱基 = 一个氨基酸）
protein = mrna.translate()
print("蛋白质:", protein)
# 蛋白质: MAIVMGR*KGAR*

# 8. 只翻译到第一个停止密码子
protein_to_stop = dna.translate(to_stop=True)
print("翻译到第一个停止:", protein_to_stop)
# 翻译到第一个停止: MAIVMGR
```

**要点解释：**

- **互补**：DNA 双链中，A 永远配 T，C 永远配 G
- **转录**：把 DNA 的 T 替换成 U（尿嘧啶），变成 mRNA
- **翻译**：每 3 个碱基（一个"密码子"）对应 1 个氨基酸，`*` 表示停止密码子
- **反向互补**：因为 DNA 有方向性（5'→3' 和 3'→5'），反向互补是最常用的操作

### 3.2 示例二：读取文件中的序列（SeqIO）

实际工作中，你大部分时间是在处理文件。`Bio.SeqIO` 就是为此设计的。

```python
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord

# ---------- 读取示例 ----------

# 假设有一个 FASTA 格式的文件 seqs.fasta，内容如下：
# >seq1 描述文字
# ATGGCCATT
# >seq2 另一条序列
# TTCGAA

# 方法 1：逐个遍历（适合大文件，节省内存）
print("=== 遍历读取 ===")
for record in SeqIO.parse("seqs.fasta", "fasta"):
    print(f"ID: {record.id}")
    print(f"描述: {record.description}")
    print(f"序列: {record.seq}")
    print(f"长度: {len(record.seq)}")
    print()

# 方法 2：一次性读入列表（适合小文件）
records = list(SeqIO.parse("seqs.fasta", "fasta"))
print(f"共读取 {len(records)} 条序列")

# ---------- 写入示例 ----------

# 创建两条 SeqRecord 对象
rec1 = SeqRecord(
    Seq("ATGGCCATT"),
    id="my_seq1",
    description="这是我的第一条序列"
)

rec2 = SeqRecord(
    Seq("TTCGAA"),
    id="my_seq2",
    description="这是我的第二条序列"
)

# 写入 FASTA 文件
count = SeqIO.write([rec1, rec2], "output.fasta", "fasta")
print(f"已写入 {count} 条序列到 output.fasta")
```

生成的 `output.fasta` 内容：

```
>my_seq1 这是我的第一条序列
ATGGCCATT
>my_seq2 这是我的第二条序列
TTCGAA
```

**要点解释：**

- `SeqIO.parse()` 返回一个**迭代器**：它像水龙头一样，需要你"拧开多少流多少"，不会一次性把文件全部装进内存。这对处理百万条记录的大文件非常关键。
- `SeqIO.read()`：如果确定文件只有**一条**记录，用这个更简洁。
- `SeqIO.write()`：把 `SeqRecord` 列表写入文件，返回写入的条数。
- 支持的文件格式非常多，常见的包括：`fasta`、`fastq`、`genbank` (或 `gb`)、`embl`、`uniprot-xml` 等。

### 3.3 示例三：计算多个序列的 GC 含量

这是生物分析中最常见的操作之一：

```python
from Bio.Seq import Seq
from Bio.SeqUtils import gc_fraction

sequences = [
    "ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG",
    "ATCGATCGATCG",
    "GGGGCCCCAAAA",
]

for i, seq_str in enumerate(sequences, 1):
    seq = Seq(seq_str)
    # 方法 1：手动计算
    gc_manual = 100 * (seq.count("G") + seq.count("C")) / len(seq)
    # 方法 2：使用 Biopython 内置函数（推荐，更可靠）
    gc_biopython = gc_fraction(seq) * 100
    print(f"序列 {i}: {gc_manual:.2f}% (手动) | {gc_biopython:.2f}% (内置)")
```

## 四、Biopython 的其他主要模块

`Seq` 和 `SeqIO` 只是冰山一角。Biopython 包含几十个子模块，常用的有：

| 模块 | 功能 | 类比 |
|------|------|------|
| `Bio.Blast` | BLAST 序列比对搜索 | 在数据库中找相似序列 |
| `Bio.Entrez` | 访问 NCBI 数据库 | 从网上直接下载数据 |
| `Bio.PDB` | 处理 3D 蛋白质结构 | 查看蛋白质的三维形状 |
| `Bio.Align` | 序列比对分析 | 多序列对齐，找共同模式 |
| `Bio.Phylo` | 系统发育分析 | 画进化树 |
| `Bio.motifs` | 序列基序分析 | 找 DNA 上的关键识别位点 |

## 五、学习建议

### 5.1 从哪里开始

1. 先掌握 `Seq` 对象（示例一），这是最基础的
2. 再学 `SeqIO`（示例二），这是日常最高频的操作
3. 遇到问题再按需查其他模块

### 5.2 官方资源

- 完整教程：https://biopython.org/docs/latest/Tutorial/
- API 文档：https://biopython.org/docs/latest/api/
- GitHub：https://github.com/biopython/biopython

### 5.3 小贴士

- `help()` 是好朋友：在 Python 中直接输入 `help(Seq)` 或 `help(SeqIO)` 可以查看内置文档
- `Seq` 对象像字符串：切片、索引、`len()` 等字符串操作都适用
- 文件太大用 `parse()` 不要用 `list()`：前者流式读取，后者全部进内存
