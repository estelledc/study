---
title: Smith–Waterman — 在两条长序列里找「最像的那一段」
来源: https://en.wikipedia.org/wiki/Smith%E2%80%93Waterman_algorithm
日期: 2026-06-13
子分类: 生物信息
分类: 机器学习
provenance: pipeline-v3
---

## 先想成什么事

想象你在两本很厚的日记里各找一段话，想证明它们**曾经抄过同一段灵感**——但两本书整体主题完全不同，只有中间几页偶然相似。

你不会从第一页硬对齐到最后一页（那会把无关章节也强行配对）。更合理的做法是：

1. **允许从任意位置开始、任意位置结束**——只关心「哪一段最像」。
2. **像不像就扣几分**——字母相同加分，不同扣分，中间缺字再罚 gap。
3. **一旦累计分数变负，就当这段比对作废，从 0 重新计**——前面的「噪音」不拖累后面的好片段。

这就是 **Smith–Waterman 局部序列比对**：在两条分子序列（DNA / RNA / 蛋白质）里，找出**得分最高的局部相似片段**，并保证在给定打分规则下是**最优解**。

Temple F. Smith 与 Michael S. Waterman 在 1981 年 *Journal of Molecular Biology* 上发表短文 *Identification of Common Molecular Subsequences*（约 3 页），给出了上述思想的动态规划形式。它与 1970 年的 Needleman–Wunsch **全局比对**同源，但把「负分截断为 0」这一刀，把问题从「整条对齐」变成了「局部挖金子」。

| 维度 | 内容 |
|------|------|
| 标题 | Identification of Common Molecular Subsequences |
| 作者 | Temple F. Smith, Michael S. Waterman |
| 发表 | *Journal of Molecular Biology*, 147(1):195–197, 1981 |
| DOI | [10.1016/0022-2836(81)90087-5](https://doi.org/10.1016/0022-2836(81)90087-5) |
| 复杂度 | 时间、空间均为 \(O(mn)\)（\(m,n\) 为两序列长度；原文一般 gap 可达更高阶，线性 gap 为 \(O(mn)\)） |

## 为什么重要

不理解 Smith–Waterman，下面这些事都没法解释：

- 为什么 [[blast-altschul-1990]] 追求「快」——BLAST 用种子启发式近似局部比对，Smith–Waterman 是**精确**的参照标准
- 为什么生物信息学工具里常有 `water`（EMBOSS）、`swps3`、`parasail`——它们都在实现或加速同一套 DP 递推
- 为什么「局部」比「全局」更适合远缘同源——两条蛋白整体只有某个结构域保守，全局对齐会把非保守尾巴硬扭在一起
- 为什么 Karlin–Altschul 统计理论能给出 E-value——最优局部比对分数在随机序列下服从极值分布，为 BLAST 的显著性检验奠基

一句话：这是**局部序列比对**的算法定义论文；后来几乎所有「找相似片段」的工具，要么等价于它，要么在它的统计框架下做启发式加速。

## 核心概念

### 1. 局部 vs 全局

| | Smith–Waterman（局部） | Needleman–Wunsch（全局） |
|---|------------------------|---------------------------|
| 目标 | 最高分的一段子序列对齐 | 从头到尾整条对齐 |
| 矩阵第一行/列 | 全 0 | 通常带 gap 罚分 |
| 递推中的负分 | **置 0**（丢弃差片段） | 保留负数 |
| 回溯起点 | 矩阵中**全局最高分** | 右下角 |
| 回溯终点 | 遇到 **0** 停止 | 左上角 |

「置 0」的直觉：若当前前缀再怎么延伸也赚不回正分，就不如当作没对齐过，另起炉灶找下一段。

### 2. 打分三要素

1. **替换矩阵** \(s(a,b)\)：匹配加分、错配扣分（核酸可用简单 ±1；蛋白用 BLOSUM/PAM）。
2. **Gap 罚分** \(W_k\)：长度为 \(k\) 的 gap 扣多少分。原文允许任意 \(W_k\)；工程上常用**线性**（\(k \cdot W_1\)）或**仿射**（开 gap \(u\) + 延长 \(v\)）。
3. **零底线**：\(\max(\cdots, 0)\) 保证局部性。

### 3. 递推公式（线性 gap 简化版）

设序列为 \(A=a_1\ldots a_n\)、\(B=b_1\ldots b_m\)，矩阵 \(H_{i,j}\) 表示以 \(a_i\) 与 \(b_j\) 结尾的**最优局部比对得分**：

\[
H_{i,j} = \max \begin{cases}
H_{i-1,j-1} + s(a_i, b_j) & \text{（对角：匹配/错配）} \\
H_{i-1,j} - W_1 & \text{（上：在 } B \text{ 上开 gap）} \\
H_{i,j-1} - W_1 & \text{（左：在 } A \text{ 上开 gap）} \\
0 & \text{（放弃当前片段）}
\end{cases}
\]

原文更一般的形式允许「一次跳过 \(k\) 个字符」并扣 \(W_k\)，因此最早实现可达 \(O(m^2 n + n^2 m)\)；Gotoh (1982) 对仿射 gap 降到 \(O(mn)\)。

### 4. 回溯（Traceback）

1. 扫描整个 \(H\)，找到**最大值**及其坐标 \((i^\*, j^\*)\)。
2. 从 \((i^\*, j^\*)\) 沿「分数从哪一格来」往回走。
3. 走到 \(H_{i,j}=0\) 停止——得到一条最优局部对齐。
4. 需要次优解时，从除已用路径外的次高分格再回溯。

### 5. 与 BLAST 的分工

- **Smith–Waterman**：保证最优，\(O(mn)\)，适合「我已经有两条候选序列，要精修边界」。
- **BLAST**：数据库级搜索，用 word 种子 + 扩展，快但不保证全局最优。

典型流水线：BLAST 筛 hit → 用 Smith–Waterman（或 gapped extension）拉齐边界、出最终比对。

## 手算小例子

\(A=\) `GATTACA`，\(B=\) `GCATTAG`；匹配 +2，错配 −1，线性 gap 罚 −2。

直觉：中间 `ATT` / `ATT` 与 `CAT` / `CAT` 附近会形成高分岛；两端无关字符因「置 0」被隔离。

```
    -  G  C  A  T  T  A  G
-   0  0  0  0  0  0  0  0
G   0  2  0  0  0  0  0  0
A   0  0  0  2  0  0  2  0
T   0  0  0  0  4  2  0  0
T   0  0  0  0  2  6  4  2
A   0  0  0  2  0  4  8  6   ← 全局最高分 8
C   0  0  2  0  0  0  6  4
A   0  0  0  4  2  0  4  8
```

从 (6,7) 或附近峰值回溯，可得到类似：

```
GATTACA
G-ATTAG
```

（具体路径依赖 tie-breaking；要点是**只覆盖高相似岛**，而非整串。）

## 代码示例 1：纯 Python 教学实现

下面实现**线性 gap**、简单 DNA 打分（匹配 +2 / 错配 −1 / gap −2），并返回得分与对齐字符串：

```python
def smith_waterman(a: str, b: str, match=2, mismatch=-1, gap=-2):
    n, m = len(a), len(b)
    H = [[0] * (m + 1) for _ in range(n + 1)]
    # trace: 0=stop, 1=diag, 2=up, 3=left
    trace = [[0] * (m + 1) for _ in range(n + 1)]

    best_score, best_i, best_j = 0, 0, 0

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            diag = H[i - 1][j - 1] + (match if a[i - 1] == b[j - 1] else mismatch)
            up = H[i - 1][j] + gap
            left = H[i][j - 1] + gap
            cell = max(diag, up, left, 0)
            H[i][j] = cell

            if cell == diag:
                trace[i][j] = 1
            elif cell == up:
                trace[i][j] = 2
            elif cell == left:
                trace[i][j] = 3
            else:
                trace[i][j] = 0

            if cell > best_score:
                best_score, best_i, best_j = cell, i, j

    # traceback
    i, j = best_i, best_j
    aln_a, aln_b = [], []
    while i > 0 and j > 0 and H[i][j] > 0:
        t = trace[i][j]
        if t == 1:
            aln_a.append(a[i - 1])
            aln_b.append(b[j - 1])
            i -= 1
            j -= 1
        elif t == 2:
            aln_a.append(a[i - 1])
            aln_b.append("-")
            i -= 1
        elif t == 3:
            aln_a.append("-")
            aln_b.append(b[j - 1])
            j -= 1
        else:
            break

    return best_score, "".join(reversed(aln_a)), "".join(reversed(aln_b))


if __name__ == "__main__":
    score, x, y = smith_waterman("GATTACA", "GCATTAG")
    print(score)   # 8
    print(x)       # GATTACA 等（取决于 tie-break）
    print(y)
```

教学时注意三点：

- 外层循环顺序必须填满整个表，不能提前剪枝（要保证最优）。
- `max(..., 0)` 那一项是 Smith–Waterman 与 Needleman–Wunsch 的**分水岭**。
- 生产环境应换 **BLOSUM62 + 仿射 gap**，并用 Gotoh 三矩阵或 `parasail` 等优化库。

## 代码示例 2：NumPy 向量化填表 + 仅求最高分

若只需分数、不回溯，可用 NumPy 降低 Python 循环开销（仍 \(O(mn)\)，适合中等长度）：

```python
import numpy as np

def sw_score(a: str, b: str, match=2, mismatch=-1, gap=-2) -> int:
  n, m = len(a), len(b)
  H = np.zeros((n + 1, m + 1), dtype=np.int32)

  for i, ca in enumerate(a, start=1):
    for j, cb in enumerate(b, start=1):
      s = match if ca == cb else mismatch
      H[i, j] = max(
          H[i - 1, j - 1] + s,
          H[i - 1, j] + gap,
          H[i, j - 1] + gap,
          0,
      )
  return int(H.max())


# 与全局 NW 对比：远缘序列里 SW 只「点亮」保守域
a = "MKFLVNVALVFMVVYISYIYA" * 3 + "GATTACA" + "ZZZZ" * 3
b = "XXXX" * 5 + "GATTACA" + "MKFLVNVALVFMVVYISYIYA"
print("SW:", sw_score(a, b))   # 保守岛高分
print("NW would penalize unrelated flanks — SW ignores them via zeros")
```

把无关尾巴换成随机字符后，你会看到：**SW 分数主要由中间共享子串决定**，而全局算法会把两侧硬对齐、总分被拉低或扭曲。

## 代码示例 3：调用 Biopython（工程实践）

真实项目里优先用成熟实现（仿射 gap、蛋白矩阵、C 加速）：

```python
from Bio import pairwise2
from Bio.SubsMat import MatrixInfo

blosum = MatrixInfo.blosum62
seq1 = "KEVLAADALQNLGQEFGRK"
seq2 = "KELAADKLAQNLGKVFGRK"

alignments = pairwise2.align.localds(
    seq1, seq2, blosum, -10, -1
)
best = alignments[0]
print(f"score={best.score}")
print(pairwise2.format_alignment(*best))
```

`localds` = **local** alignment + **d**ayhoff-style matrix + **s**tandard affine gap（开 −10，延 −1 为常见默认）。Biopython 底层即经典 DP；长序列可换 `parasail` 或 NCBI `blast+` 的 `sw` 模块。

## 复杂度与工程优化

| 版本 | 时间 | 说明 |
|------|------|------|
| 原文一般 gap | \(O(m^2 n + n^2 m)\) | 枚举 gap 长度 |
| 线性 gap | \(O(mn)\) | 每格只看相邻三方向 |
| 仿射 gap (Gotoh) | \(O(mn)\) | 工业标准 |
| Myers–Miller | \(O(mn)\) 时间，\(O(n)\) 空间 | 长序列省内存 |

GPU / SIMD（如 SWPS3、cuSW）把填表并行化，用于 read 纠错、蛋白质数据库扫描的**精修阶段**。

## 常见误区

1. **把 SW 当数据库搜索引擎**——全库 pairwise 是 \(O(N^2 L^2)\)，不现实；先 BLAST/DIAMOND 再 SW。
2. **忽略打分矩阵与 gap 参数**——同一对序列，BLOSUM45 vs BLOSUM80 可能得出不同边界；发表结果必须写明参数。
3. **以为高分一定同源**——还需 Karlin–Altschul 的 E-value；高分也可能随机出现，数据库越大越要谨慎。
4. **与全局比对混用结论**——远缘蛋白家族分析几乎总是局部优先。

## 与相关工作的关系

```text
1970  Needleman–Wunsch     全局比对 DP
1976  Waterman 等          引入 gap 罚分体系
1981  Smith–Waterman       局部比对 + 负分归零  ← 本篇
1982  Gotoh                仿射 gap，O(mn)
1986  Altschul–Erickson    线性空间局部比对
1988  Myers–Miller         O(n) 空间
1990  BLAST                启发式 + 极值统计，工程规模化
```

## 自测题

1. 把递推里的 `0` 去掉，算法变成什么？回溯终点应改到哪里？
2. 为什么第一行、第一列初始化为 0？若改成 \(-\infty\) 会怎样？
3. 给定两条仅共享 50 bp 同源区的 10 kb 基因组片段，SW 与 NW 哪个更合适？为什么？
4. BLAST 的 gapped extension 与 Smith–Waterman 的关系是什么？

## 延伸阅读

- 全局比对对照：Needleman–Wunsch (1970)
- 数据库搜索与 E-value：[[blast-altschul-1990]]
- EMBOSS `water` 文档：[https://www.ebi.ac.uk/emboss/](https://www.ebi.ac.uk/emboss/)
- 原文 PDF：[Identification of Common Molecular Subsequences](http://www.gersteinlab.org/courses/452/09-spring/pdf/sw.pdf)
