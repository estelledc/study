---
title: Nextflow 零基础学习笔记
来源: https://github.com/nextflow-io/nextflow
日期: 2026-06-13
分类: 机器学习
子分类: 生物信息
provenance: pipeline-v3
---

# Nextflow 零基础学习笔记

## 一、Nextflow 是什么？

想象你在一家餐厅当厨师长。你需要完成一系列步骤：洗菜、切菜、炒菜、摆盘。每一步都有输入和输出，而且某些步骤可以并行做（比如两个灶台同时炒菜），某些步骤必须按顺序来（必须先切菜才能炒菜）。

Nextflow 就是这样一个"厨房管理系统"——它是一个**工作流程编排语言**，用来把一堆计算任务（比如基因测序分析、数据清洗、机器学习训练）按照依赖关系串起来，自动管理数据流向、并行执行、错误重试，甚至跨机器、跨云平台运行。

它最初由生物信息学家开发，但现在广泛用于各种数据管道场景。

## 二、核心概念

Nextflow 的核心概念有四个，理解它们就理解了整个框架：

### 1. Process（进程）

Process 是最小的工作单位。每个 Process 包含三部分：

- **input**：输入（像函数的参数）
- **script**：要执行的命令（像函数体）
- **output**：输出（像函数的返回值）

一个 Process 执行一次就叫一个 **Task**。

### 2. Channel（通道）

Channel 是一个**异步的数据流管道**。你可以把它想象成传送带——数据从一端进入，经过各种处理，从另一端流出。

Channel 有三种常见操作：
- **创建**：`channel.of(1, 2, 3)` 或 `channel.fromPath('data/*.txt')`
- **操作**：`.map()`、`.filter()`、`.flatten()` 等
- **消费**：传给 Process 或 `.view()` 打印

### 3. Workflow（工作流）

Workflow 把多个 Process 串联起来，定义数据如何从一个 Process 流向下一个 Process。它是整个管道的"总调度"。

### 4. Params（参数）

参数让你可以在运行时灵活控制管道，而不必改代码。用 `params.xxx` 声明，命令行用 `--xxx` 传入。

## 三、第一个代码示例：基础 Process + Workflow

下面是一个完整的最小可运行示例。这个管道接收一个字符串，把它切成小块，然后转成大写：

```groovy
// 定义一个参数，运行时可以用 --str '新值' 覆盖
params.str = "Hello world!"

// ---- Process 1: 把字符串切成小块 ----
process split {
    input:
    val x                    // 接收一个字符串值
    output:
    path 'chunk_*'           // 输出所有 chunk_ 开头的文件
    script:
    """
    printf '${x}' | split -b 6 - chunk_
    """
}

// ---- Process 2: 把文件内容转成大写 ----
process convert_to_upper {
    tag "$y"                 // 给任务起个友好名字
    input:
    path y                   // 接收一个文件
    output:
    path 'upper_*'           // 输出转换后的文件
    script:
    """
    cat $y | tr '[a-z]' '[A-Z]' > upper_${y}
    """
}

// ---- Workflow: 把两个 Process 串起来 ----
workflow {
    main:
    // 从参数创建一个 Channel
    ch_str = channel.of(params.str)
    // 调用 split 进程，得到切割后的文件 Channel
    ch_chunks = split(ch_str)
    // flatten() 把文件列表展开，传给 convert_to_upper
    ch_upper = convert_to_upper(ch_chunks.flatten())
    publish:
    lower = ch_chunks.flatten()
    upper = ch_upper
}
```

运行方式：

```bash
nextflow run main.nf
```

执行流程是这样的：

1. `channel.of(params.str)` 创建一个 Channel，发出 "Hello world!"
2. `split` 进程收到这个字符串，执行 shell 命令，生成 `chunk_Hello` 和 `chunk_world!` 两个文件
3. `flatten()` 把这两个文件展开成独立的 Channel 元素
4. `convert_to_upper` 对每个文件执行 `tr` 命令，生成大写版本

## 四、第二个代码示例：多输入 + 数据处理管道

这是一个更贴近实际生物信息学场景的例子：读取多个样本的 FASTQ 文件，分别做质量控制，最后合并报告：

```groovy
// 声明参数
params.input_dir = './data/'
params.quality_threshold = 20

// ---- Process 1: 质控检查 ----
process fastqc {
    tag "${sample}"
    input:
    tuple val(sample), path(fastq_file)   // 接收样本名 + 文件
    output:
    path '*_fastqc.zip', emit: report     // 输出质控报告文件
    script:
    """
    echo "Running FastQC on sample: $sample"
    echo "Quality threshold: $params.quality_threshold"
    # 模拟 FastQC 输出
    mkdir ${sample}_fastqc
    echo "Sample $sample passed QC" > ${sample}_fastqc/summary.txt
    zip ${sample}_fastqc.zip ${sample}_fastqc/summary.txt
    """
}

// ---- Process 2: 过滤低质量reads ----
process trim_reads {
    tag "${sample}"
    input:
    tuple val(sample), path(fastq_file)
    output:
    path "trimmed_${sample}.fq"
    script:
    """
    echo "Trimming reads for sample: $sample"
    # 模拟修剪操作
    grep -v 'N' $fastq_file > trimmed_${sample}.fq
    """
}

// ---- Process 3: 合并报告 ----
process merge_reports {
    input:
    path reports, multiple: true
    output:
    path 'merged_report.txt'
    script:
    """
    echo "=== Merged QC Report ===" > merged_report.txt
    echo "Generated at: $(date)" >> merged_report.txt
    echo "" >> merged_report.txt
    for f in $reports; do
        echo "--- $f ---" >> merged_report.txt
        cat $f >> merged_report.txt
        echo "" >> merged_report.txt
    done
    """
}

// ---- Workflow ----
workflow {
    main:
    // 从目录读取所有 .fastq 文件，生成 Channel
    def fastq_files = channel.fromPath("${params.input_dir}*.fastq")

    // 为每个文件附加样本名（取文件名去掉扩展名）
    def samples_with_name = fastq_files.map { file ->
        def sampleName = file.name.replace('.fastq', '')
        tuple(sampleName, file)
    }

    // 并行启动两个 Process：质控 + 修剪
    def qc_reports = fastqc(samples_with_name)
    def trimmed_files = trim_reads(samples_with_name)

    // 收集所有质控报告，传给合并进程
    def all_reports = qc_reports.collect { it.report }
    merge_reports(all_reports)

    publish:
    qc = qc_reports
    trimmed = trimmed_files
}
```

这个例子里有几个重要的 Nextflow 特性：

- **`tuple` 输入**：把不同类型的数据打包在一起（样本名是字符串，文件是文件路径）
- **`channel.fromPath()`**：直接从文件系统通配符创建 Channel
- **`.map()` 算子**：转换 Channel 中的数据（给文件加上样本名）
- **并行执行**：`fastqc` 和 `trim_reads` 同时运行，互不阻塞
- **`collect()` 算子**：把所有报告文件收集成一个列表

## 五、关键特性速览

| 特性 | 说明 |
|------|------|
| 缓存与断点续跑 | 已完成的 Task 会被缓存，重新运行跳过已完成的 |
| 跨平台执行 | 同一套脚本可在本地、SLURM 集群、AWS、GCP 上运行 |
| Docker/Singularity | 每个 Process 可以指定容器镜像，保证环境一致 |
| 模块化 | 用 `include` 从其他文件导入 Process，方便复用 |
| 动态资源分配 | 根据输入文件大小自动调整内存和 CPU 需求 |
| 可视化追踪 | 自动生成执行流程图（`-with-trace -with-dag`） |

## 六、学习建议

1. 先跑通第一个示例，理解 Process → Channel → Workflow 的数据流向
2. 尝试修改 `params.str` 的值，观察输出变化
3. 用 `-resume` 参数重新运行，感受缓存机制
4. 阅读 Nextflow 官方教程 [training.nextflow.io](https://training.nextflow.io/) 中的 RNA-seq 实战课程

## 参考

- GitHub: https://github.com/nextflow-io/nextflow
- 官方文档: https://www.nextflow.io/docs/latest/
- 在线培训: https://training.nextflow.io/
