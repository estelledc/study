---
title: Snakemake 零基础学习笔记
来源: https://github.com/snakemake/snakemake
日期: 2026-06-13
分类: 机器学习
子分类: 生物信息
provenance: pipeline-v3
---

# Snakemake 零基础学习笔记

## 一、什么是 Snakemake？

Snakemake 是一个用来**编排数据处理流程**的工具。它帮你自动决定：

1. 每一步该做什么
2. 每一步依赖上一步的结果
3. 哪些步骤可以并行跑
4. 哪些步骤的结果已经是最新的、不需要重做

## 二、一个日常类比

想象你在做一道复杂的菜，需要好几个步骤：

- 第一步：洗菜切菜
- 第二步：把切好的菜下锅炒
- 第三步：把炒好的菜装盘
- 第四步：拍照发朋友圈

这些步骤之间有**依赖关系**：你不能先把菜装盘再切菜，也不能没洗菜就直接炒。

Snakemake 就像你的**厨房助手**：

- 你告诉它："我要最终那盘菜"
- 它自己推算出需要先洗菜、再切菜、再炒菜
- 如果你上次已经炒过菜了，而且食材没变，它就跳过炒菜这步
- 如果你换了食材，它就知道需要重新炒菜

在 Snakemake 里，每道菜是一个 **rule（规则）**，每种食材和成品是一个 **file（文件）**。

## 三、核心概念

### 1. Snakefile

Snakefile 是 Snakemake 的"剧本"，所有规则写在这里。它用 Python 语法，但加了一些声明式的结构。

### 2. Rule（规则）

一个规则包含三个关键部分：

- **input**：输入文件（依赖）
- **output**：输出文件（产物）
- **shell** 或 **script**：要执行的命令

### 3. Wildcard（通配符）

通配符让你写一个"模板规则"，能匹配多种具体的输入输出。比如 `{sample}` 可以代表 A、B、C 等不同样本。

### 4. DAG（有向无环图）

Snakemake 把所有规则之间的关系画成一张图，自动计算执行顺序。图里有循环就不行（所以叫"无环"）。

### 5. 增量执行

如果输出文件已经存在，且对应的输入文件和规则都没变，Snakemake 就跳过这步。这让跑大流程非常快。

## 四、代码示例

### 示例 1：数据处理流水线

这是最经典的用法——把多个工具串成一条流水线：

```python
# Snakefile

# 定义要处理的样本列表
SAMPLES = ["sample_A", "sample_B", "sample_C"]

# 总目标：告诉 Snakemake 最终想要什么
rule all:
    input:
        "results/report.html"

# 规则 1：数据清洗
rule clean_data:
    input:
        "data/raw/{sample}.csv"
    output:
        "data/clean/{sample}.csv"
    shell:
        "python scripts/clean.py {input} {output}"

# 规则 2：统计分析
rule analyze:
    input:
        "data/clean/{sample}.csv"
    output:
        "results/{sample}_stats.txt"
    shell:
        "python scripts/analyze.py {input} > {output}"

# 规则 3：生成汇总报告
rule generate_report:
    input:
        expand("results/{sample}_stats.txt", sample=SAMPLES)
    output:
        "results/report.html"
    shell:
        "pandoc results/*.txt -o {output}"
```

**执行方式：**

```bash
# 只处理单个样本
snakemake results/sample_A_stats.txt --cores 2

# 处理所有样本
snakemake --cores 4

# 模拟执行（不真的跑，只看计划）
snakemake -np
```

Snakemake 会自动画出这样的依赖图：

```
clean_data(sample_A)  →  analyze(sample_A)
clean_data(sample_B)  →  analyze(sample_B)
clean_data(sample_C)  →  analyze(sample_C)
                                            ↓
                              generate_report
```

三条分析线可以并行跑，最后汇总报告等所有分析都完成后才跑。

### 示例 2：带参数化的基因分析流水线

这个示例展示了通配符和命名输入的用法：

```python
# Snakefile

rule bwa_map:
    input:
        genome="data/genome.fa",
        reads="data/samples/{sample}.fastq"
    output:
        "mapped_reads/{sample}.bam"
    shell:
        "bwa mem {input.genome} {input.reads} | "
        "samtools view -Sb - > {output}"

rule samtools_sort:
    input:
        "mapped_reads/{sample}.bam"
    output:
        "sorted_reads/{sample}.bam"
    shell:
        "samtools sort -T sorted_reads/{wildcards.sample} "
        "-O bam {input} > {output}"

rule samtools_index:
    input:
        "sorted_reads/{sample}.bam"
    output:
        "sorted_reads/{sample}.bam.bai"
    shell:
        "samtools index {input}"
```

**关键理解：**

- `{sample}` 是通配符，Snakemake 看到目标 `mapped_reads/sample_A.bam` 时，自动把 `{sample}` 替换为 `sample_A`
- `input.genome` 和 `input.reads` 是命名输入，在命令里用 `{input.genome}` 引用
- `{wildcards.sample}` 可以在 shell 命令里直接拿到通配符的值
- 所有 input/output 路径里**必须包含相同的通配符集合**

## 五、为什么用 Snakemake？

| 场景 | 不用 Snakemake | 用 Snakemake |
|------|--------------|------------|
| 手动跑 10 个脚本 | 靠记忆，容易漏步骤 | 写一次 Snakefile，自动编排 |
| 换了输入数据 | 手动重跑所有步骤 | 自动检测哪些需要重跑 |
| 多核并行 | 自己写并行脚本 | 一条 `--cores` 参数搞定 |
| 换到集群上跑 | 改写所有命令 | 改配置就行，流程不变 |
| 给同事分享 | 扔一堆脚本和文档 | 一个 Snakefile + 说明 |

## 六、常用命令速查

- `snakemake --cores 1` — 用 1 个核心运行
- `snakemake -np` — 模拟运行，不实际执行（dry run）
- `snakemake target_file` — 指定最终目标文件
- `snakemake --forcerun rule_name` — 强制重跑某个规则
- `snakemake --dag | dot -Tsvg > dag.svg` — 生成依赖图

## 七、学习建议

1. 先看懂示例 1 的"清洗→分析→报告"三步流水线，这是最通用的模式
2. 自己创建一个 Snakefile 试跑，观察 Snakemake 的日志输出
3. 第二次跑同样的流程，观察 Snakemake 跳过已完成的步骤
4. 再尝试示例 2 的通配符用法，理解 {sample} 的传递机制
